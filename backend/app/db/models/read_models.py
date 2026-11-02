from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import JSON_TYPE, TimestampMixin, UUIDPrimaryKeyMixin


class ScreeningDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Denormalized, PII-redacted document consumed by the AI adapter."""

    __tablename__ = "screening_documents"
    __table_args__ = (
        UniqueConstraint("organization_id", "document_key"),
        UniqueConstraint("job_id", "resume_id"),
        Index("ix_screening_documents_job_updated", "job_id", "updated_at"),
        Index("ix_screening_documents_payload_gin", "payload", postgresql_using="gin"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False)
    resume_id: Mapped[UUID] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False)
    batch_file_id: Mapped[UUID | None] = mapped_column(ForeignKey("batch_files.id", ondelete="SET NULL"))
    document_key: Mapped[str] = mapped_column(String(96), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1", server_default="v1")
    privacy_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="redacted_remote", server_default="redacted_remote")
    payload: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
