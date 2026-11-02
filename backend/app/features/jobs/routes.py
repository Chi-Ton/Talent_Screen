from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Application, JobOpening, JobSkill, RubricCriterion, ScoringRubric, Skill, SkillCategory, User
from app.db.models.common import JobStatus, Recommendation, RequirementLevel, RubricStatus
from app.db.session import get_db
from app.features.auth.dependencies import get_current_user, require_permissions
from app.features.admin.service import append_audit_log

router = APIRouter()


class ScoringWeights(BaseModel):
    technicalSkills: int = 40
    experience: int = 25
    projects: int = 15
    systemsCloud: int = 10
    educationCertifications: int = 10


class CreateJobRequest(BaseModel):
    jobCode: str | None = Field(default=None, min_length=3, max_length=32)
    title: str = Field(min_length=3)
    department: str = Field(min_length=2)
    description: str = Field(min_length=20)
    mustHaveSkills: list[str] = Field(default_factory=list)
    niceToHaveSkills: list[str] = Field(default_factory=list)
    minimumExperienceYears: float | None = Field(default=None, ge=0, le=50)
    employmentType: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=160)
    workMode: str | None = Field(default=None, max_length=30)
    scoringWeights: ScoringWeights = Field(default_factory=ScoringWeights)

    @field_validator("mustHaveSkills")
    @classmethod
    def unique_skills(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(skill.strip() for skill in value if skill.strip()))

    @field_validator("niceToHaveSkills")
    @classmethod
    def unique_nice_to_have_skills(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(skill.strip() for skill in value if skill.strip()))


def serialize_job(job: JobOpening, candidate_count: int = 0, strong_matches: int = 0, average_score: float | None = None, owner_name: str | None = None) -> dict:
    return {
        "id": job.public_id,
        "title": job.title,
        "department": job.department,
        "status": job.status.value,
        "ownerName": owner_name,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "candidateCount": candidate_count,
        "strongMatches": strong_matches,
        "averageScore": round(average_score or 0, 1),
        "description": job.description,
        "employmentType": job.employment_type,
        "location": job.location,
        "workMode": job.work_mode,
        "minimumEducation": job.minimum_education,
        "minimumExperienceYears": float(job.min_experience_years) if job.min_experience_years is not None else None,
        "publishedAt": job.published_at.isoformat() if job.published_at else None,
    }


@router.get("")
def list_jobs(status: JobStatus | None = None, search: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    query = (
        select(
            JobOpening,
            User.full_name,
            func.count(Application.id),
            func.count(case((Application.recommendation == Recommendation.STRONG_RECOMMEND, 1))),
            func.avg(Application.current_score),
        )
        .outerjoin(Application, Application.job_id == JobOpening.id)
        .join(User, User.id == JobOpening.created_by_id)
        .where(JobOpening.organization_id == user.organization_id)
        .group_by(JobOpening.id, User.full_name)
        .order_by(JobOpening.created_at.desc())
    )
    if status:
        query = query.where(JobOpening.status == status)
    if search:
        query = query.where(or_(JobOpening.title.ilike(f"%{search}%"), JobOpening.public_id.ilike(f"%{search}%")))
    return [serialize_job(job, count, strong, float(average) if average is not None else None, owner_name) for job, owner_name, count, strong, average in db.execute(query).all()]


@router.post("", status_code=201)
def create_job(payload: CreateJobRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("jobs.manage"))) -> dict:
    total_weight = sum(payload.scoringWeights.model_dump().values())
    if total_weight != 100:
        raise AppError(
            code="INVALID_SCORING_WEIGHTS",
            message="Scoring weights must total 100%.",
            details={"total": total_weight},
        )

    next_number = (db.scalar(select(func.count()).select_from(JobOpening).where(JobOpening.organization_id == user.organization_id)) or 0) + 1
    public_id = (payload.jobCode or f"JD-{next_number:03d}").upper()
    if db.scalar(select(JobOpening.id).where(JobOpening.organization_id == user.organization_id, JobOpening.public_id == public_id)):
        raise AppError("DUPLICATE_JOB_CODE", "A job opening with this code already exists.", status_code=409, details={"jobCode": public_id})
    job = JobOpening(
        organization_id=user.organization_id,
        public_id=public_id,
        title=payload.title,
        department=payload.department,
        description=payload.description,
        employment_type=payload.employmentType,
        location=payload.location,
        work_mode=payload.workMode,
        min_experience_years=payload.minimumExperienceYears,
        status=JobStatus.DRAFT,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(job)
    db.flush()
    rubric = ScoringRubric(job_id=job.id, name=f"{job.title} Rubric", version=1, status=RubricStatus.DRAFT, total_weight=100, thresholds={"strong_recommend": [85, 100], "recommend": [70, 84], "review_needed": [50, 69], "reject": [0, 49]}, created_by_id=user.id)
    db.add(rubric)
    db.flush()
    pillar_names = {"technicalSkills": "Technical Skills", "experience": "Experience", "projects": "Projects", "systemsCloud": "Systems & Cloud", "educationCertifications": "Education & Certifications"}
    for order, (field, weight) in enumerate(payload.scoringWeights.model_dump().items(), start=1):
        db.add(RubricCriterion(rubric_id=rubric.id, pillar_code=field, pillar_name=pillar_names[field], criterion_code=f"{field}_default", criterion_name=pillar_names[field], weight=Decimal(weight), sort_order=order))
    general_category = db.scalar(select(SkillCategory).where(SkillCategory.code == "GENERAL"))
    must_have_normalized: set[str] = set()
    for skill_name in payload.mustHaveSkills:
        normalized = " ".join(skill_name.lower().split())
        if normalized in must_have_normalized:
            continue
        must_have_normalized.add(normalized)
        skill = db.scalar(select(Skill).where(Skill.normalized_name == normalized))
        if skill is None:
            skill = Skill(category_id=general_category.id, name=skill_name, normalized_name=normalized)
            db.add(skill)
            db.flush()
        db.add(JobSkill(job_id=job.id, skill_id=skill.id, requirement_level=RequirementLevel.MUST_HAVE, weight=Decimal("1")))
    nice_to_have_normalized: set[str] = set()
    for skill_name in payload.niceToHaveSkills:
        normalized = " ".join(skill_name.lower().split())
        if normalized in must_have_normalized or normalized in nice_to_have_normalized:
            continue
        nice_to_have_normalized.add(normalized)
        skill = db.scalar(select(Skill).where(Skill.normalized_name == normalized))
        if skill is None:
            skill = Skill(category_id=general_category.id, name=skill_name, normalized_name=normalized)
            db.add(skill)
            db.flush()
        db.add(JobSkill(job_id=job.id, skill_id=skill.id, requirement_level=RequirementLevel.NICE_TO_HAVE, weight=Decimal("0.5")))
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="job.create_draft", resource_type="JobOpening", resource_id=job.public_id, trace_id=request.state.trace_id, changes={"created": payload.model_dump()})
    db.commit()
    db.refresh(job)
    return serialize_job(job, owner_name=user.full_name)


@router.post("/{jobId}/publish")
def publish_job(jobId: str, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("jobs.manage"))) -> dict:
    job = db.scalar(select(JobOpening).where(JobOpening.organization_id == user.organization_id, JobOpening.public_id == jobId))
    if job is None:
        raise AppError("JOB_NOT_FOUND", "Job opening was not found.", status_code=404)
    if job.status == JobStatus.CLOSED:
        raise AppError("JOB_CLOSED", "A closed job cannot be published again.", status_code=409)
    job.status = JobStatus.ACTIVE
    job.published_at = job.published_at or datetime.now(timezone.utc)
    job.updated_by_id = user.id
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="job.publish", resource_type="JobOpening", resource_id=job.public_id, trace_id=request.state.trace_id)
    db.commit()
    db.refresh(job)
    owner_name = db.scalar(select(User.full_name).where(User.id == job.created_by_id))
    return serialize_job(job, owner_name=owner_name)


@router.get("/{jobId}")
def get_job(jobId: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    job = db.scalar(select(JobOpening).where(JobOpening.organization_id == user.organization_id, JobOpening.public_id == jobId))
    if job:
        metrics = db.execute(select(func.count(Application.id), func.count(case((Application.recommendation == Recommendation.STRONG_RECOMMEND, 1))), func.avg(Application.current_score)).where(Application.job_id == job.id)).one()
        owner_name = db.scalar(select(User.full_name).where(User.id == job.created_by_id))
        return serialize_job(job, metrics[0], metrics[1], float(metrics[2]) if metrics[2] is not None else None, owner_name)
    raise AppError(code="JOB_NOT_FOUND", message="Job opening was not found.", status_code=404)
