from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from app.core.errors import AppError
from sqlalchemy.orm import Session

from app.db.models import JobOpening, Report, ScreeningBatch, User
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user
from app.features.reports.service import build_report_summary, refresh_report, report_candidate_rows

router = APIRouter()


@router.get("")
def list_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(
        select(Report, JobOpening.public_id, JobOpening.title, ScreeningBatch.public_id, ScreeningBatch.name)
        .outerjoin(JobOpening, JobOpening.id == Report.job_id)
        .outerjoin(ScreeningBatch, ScreeningBatch.id == Report.batch_id)
        .where(Report.organization_id == user.organization_id)
        .order_by(Report.created_at.desc())
    ).all()
    return [
        {
            "id": report.public_id,
            "title": report.title,
            "type": report.report_type,
            "status": report.status.value,
            "jobId": job_id,
            "jobTitle": job_title,
            "batchId": batch_id,
            "batchName": batch_name,
            "summary": (summary := build_report_summary(db, report)),
            "candidateCount": summary["candidateCount"],
            "createdAt": report.created_at.isoformat(),
            "completedAt": report.completed_at.isoformat() if report.completed_at else None,
        }
        for report, job_id, job_title, batch_id, batch_name in rows
    ]


@router.get("/{reportId}")
def get_report(reportId: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    row = db.execute(
        select(Report, JobOpening, ScreeningBatch)
        .outerjoin(JobOpening, JobOpening.id == Report.job_id)
        .outerjoin(ScreeningBatch, ScreeningBatch.id == Report.batch_id)
        .where(Report.organization_id == user.organization_id, Report.public_id == reportId)
    ).one_or_none()
    if row is None:
        raise AppError("REPORT_NOT_FOUND", "Screening report was not found.", status_code=404)
    report, job, batch = row
    candidates = [
        {
            "id": candidate.public_id,
            "name": candidate.full_name,
            "score": float(application.current_score) if application.current_score is not None else 0,
            "recommendation": application.recommendation.value if application.recommendation else None,
            "matchedSkills": result.matched_skills if result else [],
            "missingSkills": result.missing_skills if result else [],
        }
        for application, candidate, result in report_candidate_rows(db, report)
    ]
    return {
        "id": report.public_id,
        "title": report.title,
        "type": report.report_type,
        "status": report.status.value,
        "jobId": job.public_id if job else None,
        "jobTitle": job.title if job else None,
        "batchId": batch.public_id if batch else None,
        "batchName": batch.name if batch else None,
        "summary": build_report_summary(db, report),
        "parameters": report.parameters,
        "createdAt": report.created_at.isoformat(),
        "completedAt": report.completed_at.isoformat() if report.completed_at else None,
        "candidates": candidates,
    }


@router.post("/{reportId}/regenerate")
def regenerate_report(reportId: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    report = db.scalar(select(Report).where(Report.organization_id == user.organization_id, Report.public_id == reportId))
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Screening report was not found.", status_code=404)
    refresh_report(db, report)
    append_audit_log(
        db,
        organization_id=user.organization_id,
        actor=user,
        action="report.regenerate",
        resource_type="Report",
        resource_id=report.public_id,
        trace_id=request.state.trace_id,
        metadata={"candidateCount": report.summary.get("candidateCount", 0)},
    )
    db.commit()
    return get_report(reportId, db, user)
