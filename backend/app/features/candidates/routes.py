from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.core.errors import AppError
from app.db.models import Application, Candidate, CandidateCertification, CandidateEducation, CandidateExperience, CandidateProject, CandidateSkill, JobOpening, Resume, ScreeningBatch, BatchFile, RubricCriterion, ScoreBreakdown, ScreeningResult, Skill, User
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user, require_permissions
from app.features.screening.processor import ProcessingFailure, rescore_candidate
from app.services.ai.router_client import AIClientError

router = APIRouter()


def serialize_score_breakdown(db: Session, result: ScreeningResult | None) -> list[dict]:
    if result is None:
        return []
    rows = db.execute(
        select(ScoreBreakdown, RubricCriterion)
        .join(RubricCriterion, RubricCriterion.id == ScoreBreakdown.criterion_id)
        .where(ScoreBreakdown.screening_result_id == result.id)
        .order_by(RubricCriterion.sort_order)
    ).all()
    pillars: dict[str, dict] = {}
    for breakdown, criterion in rows:
        pillar = pillars.setdefault(
            criterion.pillar_code,
            {
                "pillarCode": criterion.pillar_code,
                "pillarName": criterion.pillar_name,
                "earnedScore": 0.0,
                "maxScore": 0.0,
                "criteria": [],
            },
        )
        earned = float(breakdown.earned_score)
        maximum = float(breakdown.max_score)
        pillar["earnedScore"] += earned
        pillar["maxScore"] += maximum
        pillar["criteria"].append(
            {
                "criterionCode": criterion.criterion_code,
                "criterionName": criterion.criterion_name,
                "earnedScore": earned,
                "maxScore": maximum,
                "confidence": float(breakdown.confidence) if breakdown.confidence is not None else None,
                "explanation": breakdown.explanation,
                "evidence": breakdown.evidence,
            }
        )
    for pillar in pillars.values():
        maximum = pillar["maxScore"]
        pillar["percentage"] = round(pillar["earnedScore"] * 100 / maximum, 1) if maximum else 0
        pillar["earnedScore"] = round(pillar["earnedScore"], 2)
        pillar["maxScore"] = round(maximum, 2)
    return list(pillars.values())

def serialize_candidate(candidate: Candidate, application: Application, job: JobOpening, result: ScreeningResult | None, skills: list[str] | None = None, batch_id: str | None = None, source_filename: str | None = None) -> dict:
    return {
        "id": candidate.public_id,
        "name": candidate.full_name,
        "displayName": candidate.full_name,
        "sourceFilename": source_filename,
        "email": candidate.email,
        "currentTitle": candidate.current_title,
        "location": candidate.location,
        "experienceYears": float(candidate.total_experience_years) if candidate.total_experience_years is not None else None,
        "targetRole": job.title,
        "jobId": job.public_id,
        "applicationId": str(application.id),
        "batchId": batch_id,
        "pipelineStage": application.pipeline_stage.value,
        "rank": application.rank,
        "score": float(application.current_score or 0),
        "recommendation": application.recommendation.value if application.recommendation else None,
        "matchedSkills": result.matched_skills if result else (skills or []),
        "missingSkills": result.missing_skills if result else [],
        "summary": candidate.summary,
        "confidence": float(result.confidence) if result and result.confidence is not None else None,
    }


@router.get("")
def list_candidates(jobId: str | None = None, batchId: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    query = select(Candidate, Application, JobOpening, ScreeningResult, ScreeningBatch.public_id, Resume.original_filename).join(Application, Application.candidate_id == Candidate.id).join(JobOpening, JobOpening.id == Application.job_id).join(Resume, Resume.id == Application.resume_id).outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id).outerjoin(BatchFile, BatchFile.id == ScreeningResult.batch_file_id).outerjoin(ScreeningBatch, ScreeningBatch.id == BatchFile.batch_id).where(Candidate.organization_id == user.organization_id).order_by(Application.current_score.desc().nullslast(), ScreeningResult.updated_at.desc().nullslast())
    if jobId:
        query = query.where(JobOpening.public_id == jobId)
    if batchId:
        query = query.where(ScreeningBatch.public_id == batchId)
    payload: list[dict] = []
    seen_applications = set()
    for candidate, application, job, result, batch_id, source_filename in db.execute(query).all():
        if application.id in seen_applications:
            continue
        seen_applications.add(application.id)
        payload.append(serialize_candidate(candidate, application, job, result, batch_id=batch_id, source_filename=source_filename))
    return payload


@router.get("/{candidateId}")
def get_candidate(candidateId: str, jobId: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    query = select(Candidate, Application, JobOpening, ScreeningResult, ScreeningBatch.public_id, Resume).join(Application, Application.candidate_id == Candidate.id).join(JobOpening, JobOpening.id == Application.job_id).join(Resume, Resume.id == Application.resume_id).outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id).outerjoin(BatchFile, BatchFile.id == ScreeningResult.batch_file_id).outerjoin(ScreeningBatch, ScreeningBatch.id == BatchFile.batch_id).where(Candidate.organization_id == user.organization_id, Candidate.public_id == candidateId)
    if jobId:
        query = query.where(JobOpening.public_id == jobId)
    row = db.execute(query.order_by(Application.updated_at.desc(), ScreeningResult.updated_at.desc().nullslast())).first()
    if row:
        candidate, application, job, result, batch_id, resume = row
        skills = list(db.scalars(select(Skill.name).join(CandidateSkill, CandidateSkill.skill_id == Skill.id).where(CandidateSkill.candidate_id == candidate.id).order_by(Skill.name)))
        payload = serialize_candidate(candidate, application, job, result, skills, batch_id, resume.original_filename)
        payload["skills"] = skills
        payload["resume"] = {
            "filename": resume.original_filename if resume else None,
            "parserStatus": resume.parser_status.value if resume else None,
            "parserConfidence": float(resume.parser_confidence) if resume and resume.parser_confidence is not None else None,
            "parsedProfile": resume.parsed_profile if resume else {},
            "rawText": resume.raw_text if resume else None,
        }
        payload["experiences"] = [{"company": item.company_name, "title": item.role_title, "location": item.location, "startDate": item.start_date.isoformat() if item.start_date else None, "endDate": item.end_date.isoformat() if item.end_date else None, "isCurrent": item.is_current, "description": item.description, "achievements": item.achievements} for item in db.scalars(select(CandidateExperience).where(CandidateExperience.candidate_id == candidate.id).order_by(CandidateExperience.start_date.desc().nullslast())).all()]
        payload["projects"] = [{"name": item.name, "role": item.role, "description": item.description, "technologies": item.technologies, "achievements": item.achievements, "url": item.project_url} for item in db.scalars(select(CandidateProject).where(CandidateProject.candidate_id == candidate.id)).all()]
        payload["education"] = [{"institution": item.institution, "degree": item.degree, "fieldOfStudy": item.field_of_study, "startYear": item.start_year, "endYear": item.end_year} for item in db.scalars(select(CandidateEducation).where(CandidateEducation.candidate_id == candidate.id)).all()]
        payload["certifications"] = [{"name": item.name, "issuer": item.issuer, "issuedDate": item.issued_date.isoformat() if item.issued_date else None, "expiresDate": item.expires_date.isoformat() if item.expires_date else None, "credentialId": item.credential_id} for item in db.scalars(select(CandidateCertification).where(CandidateCertification.candidate_id == candidate.id)).all()]
        payload["scoreBreakdown"] = serialize_score_breakdown(db, result)
        payload["screening"] = {
            "providerName": result.provider_name if result else None,
            "modelName": result.model_name if result else None,
            "promptVersion": result.prompt_version if result else None,
            "privacyMode": result.privacy_mode if result else None,
            "traceId": result.trace_id if result else None,
            "isDisqualified": result.is_disqualified if result else False,
            "disqualifierReasons": result.disqualifier_reasons if result else [],
        }
        return payload
    raise AppError(code="CANDIDATE_NOT_FOUND", message="Candidate was not found.", status_code=404)


@router.get(
    "/{candidateId}/resume",
    response_class=FileResponse,
    responses={
        200: {
            "description": "Original locally stored CV file.",
            "content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
def download_candidate_resume(candidateId: str, request: Request, jobId: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> FileResponse:
    query = (
        select(Candidate, Application, JobOpening, Resume, BatchFile)
        .join(Application, Application.candidate_id == Candidate.id)
        .join(JobOpening, JobOpening.id == Application.job_id)
        .join(Resume, Resume.id == Application.resume_id)
        .outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id)
        .outerjoin(BatchFile, BatchFile.id == ScreeningResult.batch_file_id)
        .where(Candidate.organization_id == user.organization_id, Candidate.public_id == candidateId)
    )
    if jobId:
        query = query.where(JobOpening.public_id == jobId)
    row = db.execute(query.order_by(Application.updated_at.desc(), ScreeningResult.updated_at.desc().nullslast())).first()
    if row is None:
        raise AppError("CANDIDATE_NOT_FOUND", "Candidate was not found for this target role.", status_code=404)

    candidate, application, job, resume, batch_file = row
    stored_path = batch_file.storage_path if batch_file else resume.storage_path
    try:
        file_path = (PROJECT_ROOT / stored_path).resolve(strict=True)
    except (OSError, RuntimeError):
        raise AppError("RESUME_FILE_NOT_FOUND", "The original CV file is no longer available locally.", status_code=404) from None
    allowed_roots = (
        (PROJECT_ROOT / "uploads").resolve(),
        (PROJECT_ROOT / "dataset" / "it_resumes_txt").resolve(),
    )
    if not file_path.is_file() or not any(file_path.is_relative_to(root) for root in allowed_roots):
        raise AppError("RESUME_FILE_NOT_FOUND", "The original CV file is no longer available locally.", status_code=404)

    append_audit_log(
        db,
        organization_id=user.organization_id,
        actor=user,
        action="resume.download",
        resource_type="Application",
        resource_id=str(application.id),
        trace_id=request.state.trace_id,
        metadata={"candidateId": candidate.public_id, "jobId": job.public_id},
    )
    db.commit()
    download_name = Path(batch_file.original_filename if batch_file else resume.original_filename).name
    return FileResponse(
        path=file_path,
        media_type=resume.mime_type or "application/octet-stream",
        filename=download_name,
        headers={"Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/{candidateId}/rescore", status_code=202)
def rescore_candidate_route(candidateId: str, request: Request, jobId: str | None = None, db: Session = Depends(get_db), user: User = Depends(require_permissions("screening.manage"))) -> dict:
    try:
        candidate = rescore_candidate(
            db,
            candidate_public_id=candidateId,
            organization_id=user.organization_id,
            actor_user_id=user.id,
            trace_id=request.state.trace_id,
            job_public_id=jobId,
        )
    except AIClientError as exc:
        db.rollback()
        raise AppError(exc.code, exc.message, status_code=429 if "RATE" in exc.code else 502) from exc
    except ProcessingFailure as exc:
        db.rollback()
        status_code = 404 if exc.code == "CANDIDATE_NOT_FOUND" else 409 if exc.code == "RESCORE_SOURCE_NOT_FOUND" else 422
        raise AppError(exc.code, exc.message, status_code=status_code) from exc
    return {"candidateId": candidate.public_id, "status": "rescored"}
