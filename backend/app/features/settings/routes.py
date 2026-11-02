from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import DisqualifierRule, Organization, Role, RubricCriterion, ScoringRubric, Skill, SkillCategory, Team, User, UserPreference, UserRole
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user, require_permissions
from app.features.settings.data_retention import inspect_retention, purge_expired_uploads
from app.services.ai.router_client import AIClientError, RouterClient

router = APIRouter()


@router.get("/ai-provider/status")
def get_ai_provider_status(user: User = Depends(get_current_user)) -> dict:
    settings = get_settings()
    client = RouterClient(settings)
    return {
        "provider": settings.ai_provider,
        "model": settings.ai_model or None,
        "configured": client.is_configured,
        "apiKeyConfigured": bool(settings.ai_api_key),
        "baseUrl": settings.ai_base_url or None,
        "timeoutSeconds": settings.ai_timeout_seconds,
        "retryCount": settings.ai_retry_count,
        "privacyMode": settings.ai_privacy_mode,
        "piiRedactionEnabled": True,
        "extractedTextStored": settings.ai_store_extracted_text,
        "remoteProcessing": settings.ai_provider.lower() != "local",
        "zeroRetentionVerified": False,
        "retentionNotice": "9Router and its upstream provider are outside this application's storage boundary; use an approved Gemini ZDR project or a local model for a zero-retention guarantee.",
    }


@router.post("/ai-provider/test")
def test_ai_provider(request: Request, user: User = Depends(get_current_user)) -> dict:
    settings = get_settings()
    try:
        RouterClient(settings).complete_json(system_prompt="Return JSON only.", user_prompt='Return exactly {"ok": true}.', trace_id=request.state.trace_id)
    except AIClientError as exc:
        raise AppError(exc.code, exc.message, status_code=429 if exc.code == "AI_RATE_LIMITED" else 503) from exc
    return {"status": "healthy", "provider": settings.ai_provider, "model": settings.ai_model, "privacyMode": settings.ai_privacy_mode}


class RetentionPurgeRequest(BaseModel):
    confirm: bool = False


@router.get("/data-retention")
def get_data_retention_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    settings = get_settings()
    return inspect_retention(
        db,
        organization_id=user.organization_id,
        retention_days=settings.cv_retention_days,
    ).to_payload()


@router.post("/data-retention/purge-expired")
def purge_expired_cv_files(
    payload: RetentionPurgeRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("settings.manage")),
) -> dict:
    if not payload.confirm:
        raise AppError(
            "RETENTION_CONFIRMATION_REQUIRED",
            "Explicit confirmation is required before expired local CV files are deleted.",
            status_code=400,
        )
    settings = get_settings()
    result = purge_expired_uploads(
        db,
        organization_id=user.organization_id,
        retention_days=settings.cv_retention_days,
    )
    append_audit_log(
        db,
        organization_id=user.organization_id,
        actor=user,
        action="resume.retention_purge",
        resource_type="LocalCVStorage",
        resource_id="expired-files",
        trace_id=request.state.trace_id,
        metadata=result,
    )
    db.commit()
    return result


class AccountUpdateRequest(BaseModel):
    fullName: str | None = Field(default=None, min_length=2, max_length=160)
    jobTitle: str | None = Field(default=None, max_length=160)
    timezone: str | None = Field(default=None, max_length=64)
    language: str | None = Field(default=None, max_length=16)
    emailNotifications: dict | None = None
    browserNotifications: dict | None = None


class TaxonomySkillRequest(BaseModel):
    categoryCode: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)


def account_payload(user: User, preference: UserPreference | None) -> dict:
    return {"id": user.public_id, "name": user.full_name, "email": user.email, "jobTitle": user.job_title, "avatarUrl": user.avatar_url, "status": user.status.value, "mfaEnabled": user.is_mfa_enabled, "timezone": preference.timezone if preference else "Asia/Bangkok", "language": preference.language if preference else "en-US", "emailNotifications": preference.email_notifications if preference else {}, "browserNotifications": preference.browser_notifications if preference else {}}


@router.get("/account")
def get_account(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return account_payload(user, db.get(UserPreference, user.id))


@router.patch("/account")
def update_account(payload: AccountUpdateRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("settings.manage"))) -> dict:
    if payload.fullName is not None:
        user.full_name = payload.fullName
    if payload.jobTitle is not None:
        user.job_title = payload.jobTitle
    preference = db.get(UserPreference, user.id)
    if preference is None:
        preference = UserPreference(user_id=user.id)
        db.add(preference)
    if payload.timezone is not None:
        preference.timezone = payload.timezone
    if payload.language is not None:
        preference.language = payload.language
    if payload.emailNotifications is not None:
        preference.email_notifications = payload.emailNotifications
    if payload.browserNotifications is not None:
        preference.browser_notifications = payload.browserNotifications
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="settings.account.update", resource_type="User", resource_id=user.public_id, trace_id=request.state.trace_id, changes=payload.model_dump(exclude_none=True))
    db.commit()
    db.refresh(user)
    return account_payload(user, preference)


@router.get("/ai-taxonomy")
def get_ai_taxonomy(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(select(SkillCategory, Skill).join(Skill, Skill.category_id == SkillCategory.id).where(Skill.is_active.is_(True)).order_by(SkillCategory.sort_order, Skill.name)).all()
    return [{"categoryCode": category.code, "categoryName": category.name, "skillId": str(skill.id), "name": skill.name, "description": skill.description} for category, skill in rows]


@router.post("/ai-taxonomy/skills")
def create_taxonomy_skill(payload: TaxonomySkillRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("settings.manage"))) -> dict:
    category = db.scalar(select(SkillCategory).where(SkillCategory.code == payload.categoryCode.upper()))
    if category is None:
        raise AppError("TAXONOMY_CATEGORY_NOT_FOUND", "Skill taxonomy category was not found.", status_code=404)
    normalized = " ".join(payload.name.lower().split())
    if db.scalar(select(Skill).where(Skill.normalized_name == normalized)):
        raise AppError("DUPLICATE_SKILL", "This skill already exists in the taxonomy.", status_code=409)
    skill = Skill(category_id=category.id, name=payload.name.strip(), normalized_name=normalized, description=payload.description)
    db.add(skill)
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="taxonomy.skill.create", resource_type="Skill", resource_id=payload.name, trace_id=request.state.trace_id)
    db.commit()
    db.refresh(skill)
    return {"categoryCode": category.code, "categoryName": category.name, "skillId": str(skill.id), "name": skill.name, "description": skill.description}


@router.get("/rubric")
def get_rubric(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    rubric = db.scalar(select(ScoringRubric).where(ScoringRubric.is_standard.is_(True), ScoringRubric.status == "active").order_by(ScoringRubric.version.desc()))
    if rubric is None:
        raise AppError("RUBRIC_NOT_FOUND", "The standard screening rubric was not found.", status_code=404)
    criteria = db.scalars(select(RubricCriterion).where(RubricCriterion.rubric_id == rubric.id).order_by(RubricCriterion.sort_order)).all()
    rules = db.scalars(select(DisqualifierRule).where(DisqualifierRule.rubric_id == rubric.id)).all()
    return {"id": str(rubric.id), "name": rubric.name, "version": rubric.version, "totalWeight": rubric.total_weight, "thresholds": rubric.thresholds, "criteria": [{"pillarCode": item.pillar_code, "pillarName": item.pillar_name, "criterionCode": item.criterion_code, "criterionName": item.criterion_name, "description": item.description, "weight": float(item.weight)} for item in criteria], "disqualifiers": [{"type": item.rule_type, "label": item.label, "enabled": item.is_enabled} for item in rules]}
