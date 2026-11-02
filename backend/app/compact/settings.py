"""Single-operator provider and local retention settings."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import current_hr, get_compact_db
from app.core.config import PROJECT_ROOT, get_settings
from app.core.errors import AppError
from app.services.ai.router_client import AIClientError, RouterClient


router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_compact_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected", "schema": "compact-v2"}


@router.get("/settings/ai-provider/status")
def provider_status(hr: dict = Depends(current_hr)) -> dict:
    settings = get_settings()
    return {
        "provider": settings.ai_provider, "model": settings.ai_model or None,
        "configured": RouterClient(settings).is_configured,
        "apiKeyConfigured": bool(settings.ai_api_key),
        "baseUrl": settings.ai_base_url or None,
        "timeoutSeconds": settings.ai_timeout_seconds, "retryCount": settings.ai_retry_count,
        "privacyMode": settings.ai_privacy_mode, "piiRedactionEnabled": True,
        "extractedTextStored": False, "remoteProcessing": settings.ai_provider.lower() != "local",
        "zeroRetentionVerified": False,
        "retentionNotice": "Redaction and store=false do not prove that the upstream provider retains no data. Strict local mode blocks remote processing.",
    }


@router.post("/settings/ai-provider/test")
def test_provider(request: Request, hr: dict = Depends(current_hr)) -> dict:
    settings = get_settings()
    try:
        result = RouterClient(settings).complete_json(
            system_prompt="Return JSON only.", user_prompt='Return exactly {"ok": true}.',
            trace_id=request.state.trace_id)
        if result.get("ok") is not True:
            raise AIClientError("AI_INVALID_RESPONSE", "The provider did not return the expected test response.")
    except AIClientError as exc:
        raise AppError(exc.code, exc.message, status_code=429 if exc.code == "AI_RATE_LIMITED" else 503) from exc
    return {"status": "healthy", "provider": settings.ai_provider, "model": settings.ai_model,
            "privacyMode": settings.ai_privacy_mode}


def _cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=get_settings().cv_retention_days)


@router.get("/settings/data-retention")
def retention_status(db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    cutoff = _cutoff()
    stats = db.execute(text("""SELECT count(*) AS available,
      count(*) FILTER (WHERE created_at < :cutoff) AS eligible,
      coalesce(sum(file_size_bytes) FILTER (WHERE created_at < :cutoff),0) AS bytes
      FROM resumes WHERE storage_status='available'"""), {"cutoff": cutoff}).mappings().one()
    return {"retentionDays": get_settings().cv_retention_days, "cutoffAt": cutoff.isoformat(),
            "availableLocalFiles": stats["available"], "eligibleFiles": stats["eligible"],
            "eligibleBytes": stats["bytes"], "alreadyMissingFiles": 0,
            "executionMode": "manual_confirmation"}


class PurgeBody(BaseModel):
    confirm: bool = False


@router.post("/settings/data-retention/purge-expired")
def purge_expired(body: PurgeBody, request: Request, db: Session = Depends(get_compact_db),
                  hr: dict = Depends(current_hr)) -> dict:
    if not body.confirm:
        raise AppError("RETENTION_CONFIRMATION_REQUIRED", "Confirm local file deletion.", status_code=400)
    cutoff = _cutoff()
    rows = db.execute(text("""SELECT id,storage_path,file_size_bytes FROM resumes
      WHERE storage_status='available' AND created_at < :cutoff FOR UPDATE"""),
      {"cutoff": cutoff}).mappings().all()
    removed = 0
    deleted_bytes = 0
    root = (PROJECT_ROOT / "uploads").resolve()
    for row in rows:
        path = (PROJECT_ROOT / row["storage_path"]).resolve()
        if not path.is_relative_to(root):
            raise AppError("CV_STORAGE_INVALID", "A CV path is outside local storage.", status_code=409)
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise AppError("CV_DELETE_FAILED", "An expired CV could not be removed.", status_code=503) from exc
        db.execute(text("UPDATE resumes SET storage_status='purged',storage_path=NULL WHERE id=:id"), {"id": row["id"]})
        removed += 1
        deleted_bytes += row["file_size_bytes"]
    if removed:
        db.execute(text("""INSERT INTO audit_logs(actor_user_id,action,resource_type,trace_id,metadata)
          VALUES (:actor,'cv.retention_purge','local_storage',:trace,
          jsonb_build_object('deletedFiles',:count,'deletedBytes',:bytes))"""),
          {"actor": hr["id"], "trace": request.state.trace_id,
           "count": removed, "bytes": deleted_bytes})
    db.commit()
    return {"deletedFiles": removed, "deletedBytes": deleted_bytes,
            "retentionDays": get_settings().cv_retention_days, "cutoffAt": cutoff.isoformat()}
