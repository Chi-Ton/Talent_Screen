from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import current_hr, get_compact_db
from app.core.errors import AppError


router = APIRouter()


class SelectBody(BaseModel):
    applicationIds: list[UUID] = []
    candidateIds: list[UUID] = []


def _set_decision(db: Session, result_id: UUID, decision: str, trace: str, actor: UUID) -> None:
    row = db.execute(text("SELECT batch_file_id,status FROM screening_results WHERE id=:id"), {"id": result_id}).mappings().first()
    if not row or row["status"] != "succeeded":
        raise AppError("CANDIDATE_NOT_FOUND", "Screening result was not found.", status_code=404)
    db.execute(text("""UPDATE batch_files SET hr_decision=:d,reviewed_result_id=:r,reviewed_at=now()
      WHERE id=:f"""), {"d": decision, "r": result_id, "f": row["batch_file_id"]})
    db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id) VALUES (:u,:action,'result',:r,:trace)"),
               {"u": actor, "action": f"cv.{decision}", "r": result_id, "trace": trace})


@router.post("/shortlists")
def shortlist(body: SelectBody, request: Request, db: Session = Depends(get_compact_db),
              hr: dict = Depends(current_hr)) -> dict:
    ids = list(dict.fromkeys(body.applicationIds + body.candidateIds))
    for result_id in ids:
        _set_decision(db, result_id, "shortlisted", request.state.trace_id, hr["id"])
    db.commit()
    return {"shortlistedCount": len(ids), "applicationIds": [str(value) for value in ids]}


@router.delete("/shortlists/applications/{applicationId}")
def remove_shortlist(applicationId: UUID, request: Request,
                     db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    _set_decision(db, applicationId, "reviewed", request.state.trace_id, hr["id"])
    db.commit()
    return {"applicationId": str(applicationId), "stage": "reviewed"}


class StageBody(BaseModel):
    stage: str


@router.patch("/shortlists/applications/{applicationId}")
def update_decision(applicationId: UUID, body: StageBody, request: Request,
                    db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    decision = {"new": "pending", "hr_review": "reviewed", "shortlisted": "shortlisted",
                "rejected": "rejected"}.get(body.stage)
    if not decision:
        raise AppError("VALIDATION_ERROR", "Unknown decision.", status_code=422)
    _set_decision(db, applicationId, decision, request.state.trace_id, hr["id"])
    db.commit()
    return {"applicationId": str(applicationId), "stage": body.stage}
