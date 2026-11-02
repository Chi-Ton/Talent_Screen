import hashlib
import io
import json
from pathlib import Path
from uuid import UUID, uuid4
import zipfile

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import activate_schema, current_hr, get_compact_db
from app.compact.worker import process_batch
from app.core.config import PROJECT_ROOT
from app.core.errors import AppError


router = APIRouter()
UPLOAD_ROOT = PROJECT_ROOT / "uploads" / "compact"
MAX_BYTES = 10 * 1024 * 1024
MIMES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


def _batch(db: Session, batch_id: UUID) -> dict:
    row = db.execute(text("""SELECT b.*, j.title AS job_title, u.full_name AS owner_name,
      s.total_files,s.successful,s.failed,s.pending FROM screening_batches b
      JOIN job_openings j ON j.id=b.job_id JOIN users u ON u.id=b.created_by_id
      JOIN batch_summary s ON s.batch_id=b.id WHERE b.id=:id"""), {"id": batch_id}).mappings().first()
    if not row:
        raise AppError("BATCH_NOT_FOUND", "Screening batch was not found.", status_code=404)
    if row["pending"]:
        running = db.scalar(text("SELECT count(*) FROM screening_results r JOIN batch_files f ON f.id=r.batch_file_id WHERE f.batch_id=:id AND r.status='running'"), {"id": batch_id})
        status = "processing" if running else "queued"
    elif row["failed"]:
        status = "partially_completed" if row["successful"] else "failed"
    else:
        status = "completed"
    return {"id": str(row["id"]), "jobId": str(row["job_id"]), "jobTitle": row["job_title"],
            "name": row["name"], "status": status, "ownerName": row["owner_name"],
            "totalFiles": row["total_files"], "processedFiles": row["successful"],
            "failedFiles": row["failed"], "duplicateFiles": 0,
            "createdAt": row["created_at"].isoformat(), "startedAt": None, "completedAt": None}


@router.get("/batches")
def list_batches(db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> list[dict]:
    ids = db.scalars(text("SELECT id FROM screening_batches ORDER BY created_at DESC")).all()
    return [_batch(db, batch_id) for batch_id in ids]


@router.get("/batches/{batchId}")
def get_batch(batchId: UUID, db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    data = _batch(db, batchId)
    rows = db.execute(text("""SELECT f.*, v.file_status, v.latest_attempt_status, v.result_id,
       v.total_score, v.recommendation, r.display_name, r.storage_status,
       a.attempt_no, a.created_at AS attempt_created, a.started_at, a.finished_at, a.error_code
       FROM batch_files f JOIN resumes r ON r.id=f.resume_id
       JOIN current_file_results v ON v.file_id=f.id
       LEFT JOIN screening_results a ON a.id=v.latest_attempt_id
       WHERE f.batch_id=:id ORDER BY f.created_at,f.id"""), {"id": batchId}).mappings().all()
    data["files"] = [{"id": str(row["id"]), "name": row["source_filename"],
                      "status": "completed" if row["file_status"] == "succeeded" else row["file_status"],
                      "errorCode": row["error_code"], "errorMessage": None,
                      "attemptCount": row["attempt_no"] or 0,
                      "parserStatus": "completed" if row["result_id"] else None,
                      "parserConfidence": None,
                      "progress": 100 if row["result_id"] else 50 if row["latest_attempt_status"] == "running" else 0,
                      "candidateId": str(row["result_id"]) if row["result_id"] else None,
                      "candidateName": row["display_name"],
                      "applicationId": str(row["result_id"]) if row["result_id"] else None,
                      "score": float(row["total_score"]) if row["total_score"] is not None else None,
                      "recommendation": row["recommendation"],
                      "createdAt": row["created_at"].isoformat(),
                      "processingStartedAt": row["started_at"].isoformat() if row["started_at"] else None,
                      "processingCompletedAt": row["finished_at"].isoformat() if row["finished_at"] else None}
                     for row in rows]
    return data


def _validate_content(ext: str, content: bytes) -> None:
    if not content or len(content) > MAX_BYTES:
        raise AppError("FILE_TOO_LARGE", "The CV must be between 1 byte and 10 MB.", status_code=413)
    if ext == ".pdf" and not content.startswith(b"%PDF-"):
        raise AppError("UNSUPPORTED_CV_FORMAT", "The PDF content is invalid.", status_code=415)
    if ext == ".docx":
        if not zipfile.is_zipfile(io.BytesIO(content)):
            raise AppError("UNSUPPORTED_CV_FORMAT", "The DOCX content is invalid.", status_code=415)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if "word/document.xml" not in archive.namelist() or sum(item.file_size for item in archive.infolist()) > 50 * 1024 * 1024:
                raise AppError("UNSUPPORTED_CV_FORMAT", "The DOCX content is invalid or too large when expanded.", status_code=415)
    if ext == ".txt":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError("UNSUPPORTED_CV_FORMAT", "Text CVs must be UTF-8.", status_code=415) from exc


@router.post("/jobs/{jobId}/batches", status_code=202)
async def upload_batch(jobId: UUID, request: Request, files: list[UploadFile] = File(...),
                       batchName: str | None = Form(default=None), db: Session = Depends(get_compact_db),
                       hr: dict = Depends(current_hr)) -> dict:
    if not files or len(files) > 100:
        raise AppError("UPLOAD_LIMIT_EXCEEDED", "Select 1 to 100 CV files.", status_code=422)
    row = db.execute(text("SELECT j.id,j.title,r.id AS rubric_id FROM job_openings j JOIN LATERAL (SELECT id FROM scoring_rubrics WHERE job_id=j.id ORDER BY version DESC LIMIT 1) r ON true WHERE j.id=:id AND j.status='active'"), {"id": jobId}).mappings().first()
    if not row:
        raise AppError("JOB_NOT_FOUND", "Select an active target role.", status_code=404)
    accepted: list[tuple[str, bytes, str, str]] = []
    seen: set[str] = set()
    total_bytes = 0
    for upload in files:
        name = Path(upload.filename or "").name
        ext = Path(name).suffix.lower()
        if not name or ext not in MIMES:
            raise AppError("UNSUPPORTED_CV_FORMAT", "Only PDF, DOCX and TXT CVs are supported.", status_code=415)
        content = await upload.read(MAX_BYTES + 1)
        total_bytes += len(content)
        if total_bytes > 50 * 1024 * 1024:
            raise AppError("UPLOAD_LIMIT_EXCEEDED", "A batch must not exceed 50 MB.", status_code=413)
        _validate_content(ext, content)
        digest = hashlib.sha256(content).hexdigest()
        if digest not in seen:
            seen.add(digest)
            accepted.append((name, content, digest, ext))
    batch_id = db.execute(text("INSERT INTO screening_batches(job_id,rubric_id,name,idempotency_key,created_by_id) VALUES (:j,:r,:name,:k,:u) RETURNING id"),
                          {"j": jobId, "r": row["rubric_id"], "name": (batchName or f"{row['title']} CVs")[:180], "k": uuid4(), "u": hr["id"]}).scalar_one()
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    for name, content, digest, ext in accepted:
        existing = db.execute(text("SELECT id,storage_status FROM resumes WHERE sha256=:sha"), {"sha": digest}).first()
        if existing:
            if existing[1] != "available":
                raise AppError("CV_PURGED", "This CV has been purged under the retention policy.", status_code=409)
            resume_id = existing[0]
        else:
            relative = Path("uploads") / "compact" / f"{digest}{ext}"
            destination = PROJECT_ROOT / relative
            if not destination.exists():
                destination.write_bytes(content)
            resume_id = db.execute(text("INSERT INTO resumes(sha256,storage_path,mime_type,file_size_bytes) VALUES (:sha,:path,:mime,:size) RETURNING id"),
                                   {"sha": digest, "path": str(relative), "mime": MIMES[ext], "size": len(content)}).scalar_one()
        db.execute(text("INSERT INTO batch_files(batch_id,resume_id,source_filename) VALUES (:b,:r,:name)"),
                   {"b": batch_id, "r": resume_id, "name": name[:255]})
    db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id,metadata) VALUES (:u,'batch.upload','batch',:b,:trace,CAST(:m AS jsonb))"),
               {"u": hr["id"], "b": batch_id, "trace": request.state.trace_id,
                "m": json.dumps({"accepted": len(accepted), "duplicates": len(files) - len(accepted)})})
    db.commit()
    activate_schema(db)
    return _batch(db, batch_id)


@router.post("/batches/{batchId}/process", status_code=202)
def start_processing(batchId: UUID, request: Request, background_tasks: BackgroundTasks,
                     db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    data = _batch(db, batchId)
    pending = db.scalar(text("""SELECT count(*) FROM current_file_results v
      LEFT JOIN screening_results a ON a.id=v.latest_attempt_id
      WHERE v.batch_id=:id AND v.result_id IS NULL
      AND (v.latest_attempt_status IN ('queued','failed') OR
           (v.latest_attempt_status='running' AND a.lease_expires_at < now()))"""), {"id": batchId})
    if pending:
        background_tasks.add_task(process_batch, batchId, hr["id"], request.state.trace_id)
    return data


@router.post("/batches/{batchId}/retry-failures")
def retry_failures(batchId: UUID, request: Request, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    data = _batch(db, batchId)
    count = db.scalar(text("SELECT count(*) FROM current_file_results WHERE batch_id=:id AND latest_attempt_status='failed' AND result_id IS NULL"), {"id": batchId})
    if count:
        background_tasks.add_task(process_batch, batchId, hr["id"], request.state.trace_id)
    return {**data, "retriedFiles": count}
