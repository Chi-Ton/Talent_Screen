from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Application, BatchFile, Candidate, JobOpening, ReviewDecision, ReviewQueueItem, ScreeningBatch, ScreeningResult, User
from app.db.models.common import PipelineStage, ReviewStatus
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user, require_permissions

router = APIRouter()


class ReviewDecisionRequest(BaseModel):
    decision: str = Field(min_length=2, max_length=60)
    note: str | None = Field(default=None, max_length=4000)
    pipelineStage: PipelineStage | None = None


class AssignReviewRequest(BaseModel):
    itemIds: list[str] = Field(min_length=1, max_length=100)


@router.get("")
def list_review_queue(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(
        select(ReviewQueueItem, Candidate, Application, JobOpening, ScreeningBatch.public_id)
        .join(Application, Application.id == ReviewQueueItem.application_id)
        .join(Candidate, Candidate.id == Application.candidate_id)
        .join(JobOpening, JobOpening.id == Application.job_id)
        .outerjoin(ScreeningResult, ScreeningResult.id == ReviewQueueItem.screening_result_id)
        .outerjoin(BatchFile, BatchFile.id == ScreeningResult.batch_file_id)
        .outerjoin(ScreeningBatch, ScreeningBatch.id == BatchFile.batch_id)
        .where(Application.organization_id == user.organization_id)
        .order_by(ReviewQueueItem.created_at.desc())
    ).all()
    return [{"id": str(item.id), "candidateId": candidate.public_id, "candidateName": candidate.full_name, "jobId": job.public_id, "jobTitle": job.title, "batchId": batch_id, "reason": item.reason, "reasonCode": item.reason_code, "priority": item.priority.value, "status": item.status.value, "score": float(application.current_score or 0), "assignedTo": db.get(User, item.assigned_to_id).full_name if item.assigned_to_id and db.get(User, item.assigned_to_id) else None, "dueAt": item.due_at.isoformat() if item.due_at else None, "createdAt": item.created_at.isoformat()} for item, candidate, application, job, batch_id in rows]


@router.post("/assign")
def assign_review_items(payload: AssignReviewRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    updated = 0
    for item in db.scalars(select(ReviewQueueItem).where(ReviewQueueItem.id.in_(payload.itemIds))).all():
        item.assigned_to_id = user.id
        item.status = ReviewStatus.IN_REVIEW
        updated += 1
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="review.assign", resource_type="ReviewQueue", resource_id=None, trace_id=request.state.trace_id, metadata={"itemCount": updated})
    db.commit()
    return {"assignedCount": updated, "assignedTo": user.full_name}


@router.post("/{itemId}/decision")
def decide_review_item(itemId: str, payload: ReviewDecisionRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("reviews.manage"))) -> dict:
    item = db.get(ReviewQueueItem, itemId)
    if item is None:
        raise AppError("REVIEW_ITEM_NOT_FOUND", "Review queue item was not found.", status_code=404)
    application = db.get(Application, item.application_id)
    if application is None or application.organization_id != user.organization_id:
        raise AppError("REVIEW_ITEM_NOT_FOUND", "Review queue item was not found.", status_code=404)
    decision = ReviewDecision(review_item_id=item.id, reviewer_id=user.id, decision=payload.decision, note=payload.note, created_at=datetime.now(timezone.utc))
    db.add(decision)
    item.status = ReviewStatus.RESOLVED
    item.resolved_at = datetime.now(timezone.utc)
    if payload.pipelineStage:
        application.pipeline_stage = payload.pipelineStage
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="review.decision", resource_type="ReviewQueueItem", resource_id=itemId, trace_id=request.state.trace_id, changes={"decision": payload.decision, "pipelineStage": payload.pipelineStage.value if payload.pipelineStage else None})
    db.commit()
    return {"id": itemId, "status": item.status.value, "decision": payload.decision, "pipelineStage": application.pipeline_stage.value}
