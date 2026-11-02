"""Minimal read-only audit trail for the single HR operator."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import current_hr, get_compact_db


router = APIRouter()


@router.get("/admin/audit-logs")
def list_audit_logs(limit: int = Query(100, ge=1, le=500),
                    db: Session = Depends(get_compact_db),
                    hr: dict = Depends(current_hr)) -> list[dict]:
    rows = db.execute(text("""SELECT id,action,resource_type,resource_id,trace_id,
      metadata,created_at FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT :limit"""),
      {"limit": limit}).mappings().all()
    return [{"id": str(row["id"]), "action": row["action"],
             "resourceType": row["resource_type"],
             "resourceId": str(row["resource_id"]) if row["resource_id"] else None,
             "traceId": row["trace_id"], "metadata": row["metadata"],
             "createdAt": row["created_at"].isoformat()} for row in rows]
