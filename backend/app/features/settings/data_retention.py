from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.db.models import BatchFile, ScreeningBatch


UPLOAD_ROOT = (PROJECT_ROOT / "uploads").resolve()


@dataclass(frozen=True)
class RetentionStatus:
    retention_days: int
    cutoff_at: str
    available_local_files: int
    eligible_files: int
    eligible_bytes: int
    already_missing_files: int

    def to_payload(self) -> dict:
        return {
            "retentionDays": self.retention_days,
            "cutoffAt": self.cutoff_at,
            "availableLocalFiles": self.available_local_files,
            "eligibleFiles": self.eligible_files,
            "eligibleBytes": self.eligible_bytes,
            "alreadyMissingFiles": self.already_missing_files,
            "executionMode": "manual_confirmation",
        }


def _resolve_protected_upload(storage_path: str) -> Path | None:
    candidate = (PROJECT_ROOT / storage_path).resolve()
    if not candidate.is_relative_to(UPLOAD_ROOT):
        return None
    return candidate


def _organization_files(db: Session, organization_id: UUID) -> list[BatchFile]:
    return list(
        db.scalars(
            select(BatchFile)
            .join(ScreeningBatch, ScreeningBatch.id == BatchFile.batch_id)
            .where(ScreeningBatch.organization_id == organization_id)
            .order_by(BatchFile.created_at.asc())
        )
    )


def inspect_retention(db: Session, *, organization_id: UUID, retention_days: int) -> RetentionStatus:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    available = 0
    eligible = 0
    eligible_bytes = 0
    missing = 0
    seen_paths: set[Path] = set()

    for batch_file in _organization_files(db, organization_id):
        file_path = _resolve_protected_upload(batch_file.storage_path)
        if file_path is None or file_path in seen_paths:
            continue
        seen_paths.add(file_path)
        if not file_path.is_file():
            missing += 1
            continue
        available += 1
        if batch_file.created_at <= cutoff:
            eligible += 1
            eligible_bytes += batch_file.file_size_bytes

    return RetentionStatus(
        retention_days=retention_days,
        cutoff_at=cutoff.isoformat(),
        available_local_files=available,
        eligible_files=eligible,
        eligible_bytes=eligible_bytes,
        already_missing_files=missing,
    )


def purge_expired_uploads(db: Session, *, organization_id: UUID, retention_days: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    deleted_files = 0
    deleted_bytes = 0
    seen_paths: set[Path] = set()

    for batch_file in _organization_files(db, organization_id):
        if batch_file.created_at > cutoff:
            continue
        file_path = _resolve_protected_upload(batch_file.storage_path)
        if file_path is None or file_path in seen_paths or not file_path.is_file():
            continue
        seen_paths.add(file_path)
        file_size = file_path.stat().st_size
        file_path.unlink()
        deleted_files += 1
        deleted_bytes += file_size

    return {
        "deletedFiles": deleted_files,
        "deletedBytes": deleted_bytes,
        "retentionDays": retention_days,
        "cutoffAt": cutoff.isoformat(),
    }
