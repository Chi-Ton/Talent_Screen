from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.features.settings import data_retention


def test_purge_only_deletes_expired_files_inside_upload_root(tmp_path, monkeypatch) -> None:
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    old_file = upload_root / "old.pdf"
    current_file = upload_root / "current.pdf"
    outside_file = tmp_path.parent / f"outside-{uuid4()}.pdf"
    old_file.write_bytes(b"expired")
    current_file.write_bytes(b"current")
    outside_file.write_bytes(b"outside")

    now = datetime.now(timezone.utc)
    rows = [
        SimpleNamespace(created_at=now - timedelta(days=31), storage_path="uploads/old.pdf", file_size_bytes=7),
        SimpleNamespace(created_at=now - timedelta(days=2), storage_path="uploads/current.pdf", file_size_bytes=7),
        SimpleNamespace(created_at=now - timedelta(days=31), storage_path=str(outside_file), file_size_bytes=7),
    ]
    monkeypatch.setattr(data_retention, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(data_retention, "UPLOAD_ROOT", upload_root.resolve())
    monkeypatch.setattr(data_retention, "_organization_files", lambda db, organization_id: rows)

    try:
        preview = data_retention.inspect_retention(object(), organization_id=uuid4(), retention_days=30)
        assert preview.available_local_files == 2
        assert preview.eligible_files == 1
        assert preview.eligible_bytes == 7

        result = data_retention.purge_expired_uploads(object(), organization_id=uuid4(), retention_days=30)
        assert result["deletedFiles"] == 1
        assert result["deletedBytes"] == 7
        assert not old_file.exists()
        assert current_file.exists()
        assert outside_file.exists()
    finally:
        outside_file.unlink(missing_ok=True)
