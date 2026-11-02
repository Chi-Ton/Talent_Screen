from fastapi import APIRouter, Depends, Request
from uuid import UUID

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Application, Candidate, JobOpening, ScreeningResult, User
from app.db.models.common import PipelineStage
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user, require_permissions

router = APIRouter()


class ShortlistRequest(BaseModel):
    applicationIds: list[UUID] = Field(default_factory=list, max_length=100)
    candidateIds: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def require_target(self) -> "ShortlistRequest":
        if not self.applicationIds and not self.candidateIds:
            raise ValueError("At least one applicationId is required.")
        return self


class PipelineStageRequest(BaseModel):
    stage: PipelineStage


@router.get("")
def list_shortlists(jobId: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    query = select(Application, Candidate, JobOpening, ScreeningResult).join(Candidate, Candidate.id == Application.candidate_id).join(JobOpening, JobOpening.id == Application.job_id).outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id).where(Application.organization_id == user.organization_id, Application.pipeline_stage != PipelineStage.NEW).order_by(Application.updated_at.desc())
    if jobId:
        query = query.where(JobOpening.public_id == jobId)
    rows = db.execute(query).all()
    return [{"applicationId": str(application.id), "candidateId": candidate.public_id, "candidateName": candidate.full_name, "jobId": job.public_id, "jobTitle": job.title, "score": float(application.current_score or 0), "recommendation": application.recommendation.value if application.recommendation else None, "stage": application.pipeline_stage.value, "matchedSkills": result.matched_skills if result else [], "updatedAt": application.updated_at.isoformat()} for application, candidate, job, result in rows]


@router.post("")
def add_to_shortlist(payload: ShortlistRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    query = select(Application).where(Application.organization_id == user.organization_id)
    if payload.applicationIds:
        query = query.where(Application.id.in_(payload.applicationIds))
    else:
        # Backward-compatible path for legacy screens. Core screens always send
        # application IDs so a decision cannot leak into another job context.
        query = query.join(Candidate, Candidate.id == Application.candidate_id).where(Candidate.public_id.in_(payload.candidateIds))
    applications = db.scalars(query).all()
    if not applications:
        raise AppError("APPLICATION_NOT_FOUND", "No matching candidate applications were found.", status_code=404)
    for application in applications:
        application.pipeline_stage = PipelineStage.SHORTLISTED
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="shortlist.add", resource_type="Application", resource_id=None, trace_id=request.state.trace_id, metadata={"candidateCount": len(applications)})
    db.commit()
    return {
        "shortlistedCount": len(applications),
        "applicationIds": [str(application.id) for application in applications],
        "candidateIds": payload.candidateIds,
    }


def get_application(db: Session, application_id: UUID, organization_id: UUID) -> Application:
    application = db.scalar(
        select(Application).where(
            Application.id == application_id,
            Application.organization_id == organization_id,
        )
    )
    if application is None:
        raise AppError("APPLICATION_NOT_FOUND", "Candidate application was not found.", status_code=404)
    return application


@router.delete("/applications/{applicationId}")
def remove_application_from_shortlist(applicationId: UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    application = get_application(db, applicationId, user.organization_id)
    if application.pipeline_stage != PipelineStage.SHORTLISTED:
        raise AppError("SHORTLIST_ITEM_NOT_FOUND", "This application is not in the shortlist.", status_code=404)
    application.pipeline_stage = PipelineStage.HR_REVIEW
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="shortlist.remove", resource_type="Application", resource_id=str(application.id), trace_id=request.state.trace_id)
    db.commit()
    return {"applicationId": str(application.id), "stage": application.pipeline_stage.value}


@router.patch("/applications/{applicationId}")
def move_application_pipeline_stage(applicationId: UUID, payload: PipelineStageRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    application = get_application(db, applicationId, user.organization_id)
    application.pipeline_stage = payload.stage
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="application.decision", resource_type="Application", resource_id=str(application.id), trace_id=request.state.trace_id, changes={"pipelineStage": payload.stage.value})
    db.commit()
    return {"applicationId": str(application.id), "stage": application.pipeline_stage.value}


@router.delete("/{candidateId}")
def remove_from_shortlist(candidateId: str, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    application = db.scalar(select(Application).join(Candidate, Candidate.id == Application.candidate_id).where(Application.organization_id == user.organization_id, Candidate.public_id == candidateId, Application.pipeline_stage == PipelineStage.SHORTLISTED))
    if application is None:
        raise AppError("SHORTLIST_ITEM_NOT_FOUND", "Candidate is not in the shortlist.", status_code=404)
    application.pipeline_stage = PipelineStage.HR_REVIEW
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="shortlist.remove", resource_type="Application", resource_id=str(application.id), trace_id=request.state.trace_id)
    db.commit()
    return {"candidateId": candidateId, "stage": application.pipeline_stage.value}


@router.patch("/{candidateId}")
def move_pipeline_stage(candidateId: str, payload: PipelineStageRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    application = db.scalar(select(Application).join(Candidate, Candidate.id == Application.candidate_id).where(Application.organization_id == user.organization_id, Candidate.public_id == candidateId))
    if application is None:
        raise AppError("CANDIDATE_NOT_FOUND", "Candidate was not found.", status_code=404)
    application.pipeline_stage = payload.stage
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="shortlist.stage.update", resource_type="Application", resource_id=str(application.id), trace_id=request.state.trace_id, changes={"pipelineStage": payload.stage.value})
    db.commit()
    return {"candidateId": candidateId, "stage": application.pipeline_stage.value}
