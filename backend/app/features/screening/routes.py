import hashlib
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.core.errors import AppError
from app.db.models import Application, BatchFile, Candidate, JobOpening, Resume, ScreeningBatch, ScreeningResult, User
from app.db.models.common import BatchFileStatus, BatchStatus, ParserStatus
from app.db.session import get_db
from app.features.admin.service import append_audit_log
from app.features.auth.dependencies import get_current_user, require_permissions
from app.features.screening.processor import process_batch_background

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/x-pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/x-plain",
    "application/octet-stream",
}
MAX_FILE_SIZE = 10 * 1024 * 1024
UPLOAD_ROOT = PROJECT_ROOT / "uploads"


def serialize_batch(batch: ScreeningBatch, job_public_id: str, owner_name: str | None = None, job_title: str | None = None) -> dict:
    return {
        "id": batch.public_id,
        "jobId": job_public_id,
        "jobTitle": job_title,
        "name": batch.name,
        "status": batch.status.value,
        "ownerName": owner_name,
        "totalFiles": batch.total_files,
        "processedFiles": batch.processed_files,
        "failedFiles": batch.failed_files,
        "duplicateFiles": batch.duplicate_files,
        "createdAt": batch.created_at.isoformat(),
        "startedAt": batch.started_at.isoformat() if batch.started_at else None,
        "completedAt": batch.completed_at.isoformat() if batch.completed_at else None,
    }


@router.get("/batches")
def list_batches(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.execute(select(ScreeningBatch, JobOpening.public_id, User.full_name, JobOpening.title).join(JobOpening, JobOpening.id == ScreeningBatch.job_id).join(User, User.id == ScreeningBatch.created_by_id).where(ScreeningBatch.organization_id == user.organization_id).order_by(ScreeningBatch.created_at.desc())).all()
    return [serialize_batch(batch, job_id, owner_name, job_title) for batch, job_id, owner_name, job_title in rows]


@router.get("/batches/{batchId}")
def get_batch(batchId: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    row = db.execute(select(ScreeningBatch, JobOpening.public_id, User.full_name, JobOpening.title).join(JobOpening, JobOpening.id == ScreeningBatch.job_id).join(User, User.id == ScreeningBatch.created_by_id).where(ScreeningBatch.organization_id == user.organization_id, ScreeningBatch.public_id == batchId)).one_or_none()
    if row is None:
        raise AppError("BATCH_NOT_FOUND", "Screening batch was not found.", status_code=404)
    batch, job_public_id, owner_name, job_title = row
    payload = serialize_batch(batch, job_public_id, owner_name, job_title)
    file_rows = db.execute(
        select(BatchFile, Resume, ScreeningResult, Application, Candidate)
        .outerjoin(Resume, Resume.id == BatchFile.resume_id)
        .outerjoin(ScreeningResult, ScreeningResult.batch_file_id == BatchFile.id)
        .outerjoin(Application, Application.id == ScreeningResult.application_id)
        .outerjoin(Candidate, Candidate.id == Application.candidate_id)
        .where(BatchFile.batch_id == batch.id)
        .order_by(BatchFile.created_at.asc())
    ).all()
    payload["files"] = [{
        "id": str(batch_file.id),
        "name": batch_file.original_filename,
        "status": batch_file.status.value,
        "errorCode": batch_file.error_code,
        "errorMessage": batch_file.error_message,
        "attemptCount": batch_file.attempt_count,
        "parserStatus": resume.parser_status.value if resume else None,
        "parserConfidence": float(resume.parser_confidence) if resume and resume.parser_confidence is not None else None,
        "progress": 100 if batch_file.status.value == "completed" else 80 if batch_file.status.value == "scoring" else 50 if batch_file.status.value in {"parsing", "parsed"} else 0,
        "candidateId": candidate.public_id if candidate else None,
        "candidateName": candidate.full_name if candidate else None,
        "applicationId": str(application.id) if application else None,
        "score": float(result.total_score) if result else None,
        "recommendation": result.recommendation.value if result else None,
        "createdAt": batch_file.created_at.isoformat(),
        "processingStartedAt": batch_file.processing_started_at.isoformat() if batch_file.processing_started_at else None,
        "processingCompletedAt": batch_file.processing_completed_at.isoformat() if batch_file.processing_completed_at else None,
    } for batch_file, resume, result, application, candidate in file_rows]
    return payload


@router.post("/batches/{batchId}/retry-failures")
def retry_batch_failures(batchId: str, background_tasks: BackgroundTasks, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("screening.manage"))) -> dict:
    row = db.execute(select(ScreeningBatch, JobOpening.public_id, User.full_name, JobOpening.title).join(JobOpening, JobOpening.id == ScreeningBatch.job_id).join(User, User.id == ScreeningBatch.created_by_id).where(ScreeningBatch.organization_id == user.organization_id, ScreeningBatch.public_id == batchId)).one_or_none()
    if row is None:
        raise AppError("BATCH_NOT_FOUND", "Screening batch was not found.", status_code=404)
    batch, job_public_id, owner_name, job_title = row
    failed_files = db.scalars(select(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.FAILED)).all()
    for batch_file in failed_files:
        batch_file.status = BatchFileStatus.QUEUED
        batch_file.error_code = None
        batch_file.error_message = None
    batch.failed_files = 0
    batch.status = BatchStatus.PROCESSING if failed_files else batch.status
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="batch.retry_failures", resource_type="ScreeningBatch", resource_id=batch.public_id, trace_id=request.state.trace_id, metadata={"retryCount": len(failed_files)})
    db.commit()
    db.refresh(batch)
    if failed_files:
        background_tasks.add_task(process_batch_background, batch.public_id, user.organization_id, user.id, request.state.trace_id)
    return {**serialize_batch(batch, job_public_id, owner_name, job_title), "retriedFiles": len(failed_files)}


@router.post("/batches/{batchId}/process", status_code=202)
def start_batch_processing(batchId: str, background_tasks: BackgroundTasks, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permissions("screening.manage"))) -> dict:
    row = db.execute(select(ScreeningBatch, JobOpening.public_id, User.full_name, JobOpening.title).join(JobOpening, JobOpening.id == ScreeningBatch.job_id).join(User, User.id == ScreeningBatch.created_by_id).where(ScreeningBatch.organization_id == user.organization_id, ScreeningBatch.public_id == batchId)).one_or_none()
    if row is None:
        raise AppError("BATCH_NOT_FOUND", "Screening batch was not found.", status_code=404)
    batch, job_public_id, owner_name, job_title = row
    if batch.status == BatchStatus.CANCELLED:
        raise AppError("BATCH_CANCELLED", "A cancelled batch cannot be processed.", status_code=409)
    queued_files = db.scalar(select(func.count()).select_from(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.QUEUED)) or 0
    if queued_files == 0:
        raise AppError("BATCH_ALREADY_PROCESSED", "This batch has no queued CV files to process.", status_code=409)
    batch.status = BatchStatus.PROCESSING
    db.commit()
    background_tasks.add_task(process_batch_background, batch.public_id, user.organization_id, user.id, request.state.trace_id)
    db.refresh(batch)
    return serialize_batch(batch, job_public_id, owner_name, job_title)


@router.post("/jobs/{jobId}/batches", status_code=202)
async def upload_batch(jobId: str, request: Request, files: list[UploadFile] = File(...), batchName: str | None = Form(default=None), db: Session = Depends(get_db), user: User = Depends(require_permissions("screening.manage"))) -> dict:
    if not files:
        raise AppError("EMPTY_UPLOAD", "Select at least one CV file to create a batch.", status_code=422)
    if len(files) > 500:
        raise AppError(
            code="UPLOAD_LIMIT_EXCEEDED",
            message="A batch can contain at most 500 CV files.",
            status_code=413,
            details={"maxFiles": 500},
        )

    invalid = [file.filename for file in files if file.filename and "." + file.filename.rsplit(".", 1)[-1].lower() not in ALLOWED_EXTENSIONS]
    if invalid:
        raise AppError(
            code="UNSUPPORTED_CV_FORMAT",
            message="Only PDF, DOCX, and TXT CV files are supported.",
            status_code=415,
            details={"files": invalid},
        )
    job = db.scalar(select(JobOpening).where(JobOpening.organization_id == user.organization_id, JobOpening.public_id == jobId))
    if job is None:
        raise AppError("JOB_NOT_FOUND", "Job opening was not found.", status_code=404)
    next_number = (db.scalar(select(func.count()).select_from(ScreeningBatch).where(ScreeningBatch.organization_id == user.organization_id)) or 0) + 1
    batch = ScreeningBatch(organization_id=user.organization_id, job_id=job.id, public_id=f"BAT-{next_number:03d}", name=(batchName or f"{job.title} Batch {next_number}").strip(), status=BatchStatus.QUEUED, total_files=len(files), processed_files=0, failed_files=0, duplicate_files=0, created_by_id=user.id)
    db.add(batch)
    db.flush()
    batch_folder = UPLOAD_ROOT / batch.public_id
    batch_folder.mkdir(parents=True, exist_ok=True)
    seen_hashes: set[str] = set()
    for upload in files:
        content = await upload.read()
        if len(content) > MAX_FILE_SIZE:
            raise AppError("FILE_TOO_LARGE", f"{upload.filename} exceeds the 10 MB limit.", status_code=413, details={"file": upload.filename, "maxBytes": MAX_FILE_SIZE})
        if upload.content_type and upload.content_type not in ALLOWED_MIME_TYPES:
            raise AppError("UNSUPPORTED_CV_FORMAT", "Only PDF, DOCX, and TXT CV files are supported.", status_code=415, details={"file": upload.filename, "mimeType": upload.content_type})
        digest = hashlib.sha256(content).hexdigest()
        if digest in seen_hashes:
            batch.duplicate_files += 1
            continue
        seen_hashes.add(digest)
        safe_name = Path(upload.filename or f"resume-{digest[:8]}.bin").name
        storage_path = batch_folder / f"{digest[:12]}-{safe_name}"
        storage_path.write_bytes(content)
        existing_resume = db.scalar(select(Resume).where(Resume.organization_id == user.organization_id, Resume.sha256 == digest).order_by(Resume.created_at.desc()))
        resume = existing_resume or Resume(organization_id=user.organization_id, original_filename=safe_name, storage_path=str(storage_path.relative_to(PROJECT_ROOT)), mime_type=upload.content_type or "application/octet-stream", file_size_bytes=len(content), sha256=digest, parser_status=ParserStatus.QUEUED, is_primary=False, uploaded_by_id=user.id)
        if existing_resume is None:
            db.add(resume)
            db.flush()
        # The same CV may legitimately be screened for a different role. Reuse the
        # local resume record, but always create a queued evaluation for this batch.
        db.add(BatchFile(batch_id=batch.id, resume_id=resume.id, original_filename=safe_name, storage_path=str(storage_path.relative_to(PROJECT_ROOT)), mime_type=upload.content_type or "application/octet-stream", file_size_bytes=len(content), sha256=digest, status=BatchFileStatus.QUEUED, attempt_count=0))
    append_audit_log(db, organization_id=user.organization_id, actor=user, action="batch.upload", resource_type="ScreeningBatch", resource_id=batch.public_id, trace_id=request.state.trace_id, metadata={"jobId": jobId, "fileCount": len(files)})
    db.commit()
    db.refresh(batch)
    return serialize_batch(batch, job.public_id, job_title=job.title)
