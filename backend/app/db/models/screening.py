from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import BatchFileStatus, BatchStatus, JSON_TYPE, Recommendation, TimestampMixin, UUIDPrimaryKeyMixin, enum_type


class ScreeningBatch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "screening_batches"
    __table_args__ = (
        UniqueConstraint("organization_id", "public_id"),
        Index("ix_screening_batches_job_status_created", "job_id", "status", "created_at"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False)
    public_id: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[BatchStatus] = mapped_column(enum_type(BatchStatus, "batch_status"), nullable=False, default=BatchStatus.QUEUED, server_default=BatchStatus.QUEUED.value)
    total_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    processed_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    failed_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    duplicate_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BatchFile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "batch_files"
    __table_args__ = (
        UniqueConstraint("batch_id", "sha256"),
        Index("ix_batch_files_batch_status", "batch_id", "status"),
    )

    batch_id: Mapped[UUID] = mapped_column(ForeignKey("screening_batches.id", ondelete="CASCADE"), nullable=False)
    resume_id: Mapped[UUID | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(700), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[BatchFileStatus] = mapped_column(enum_type(BatchFileStatus, "batch_file_status"), nullable=False, default=BatchFileStatus.QUEUED, server_default=BatchFileStatus.QUEUED.value)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ScreeningResult(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "screening_results"
    __table_args__ = (
        UniqueConstraint("application_id", "rubric_id"),
        Index("ix_screening_results_score", "total_score"),
        Index("ix_screening_results_recommendation", "recommendation"),
        CheckConstraint("total_score >= 0 AND total_score <= 100", name="total_score_range"),
        CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 100)", name="confidence_range"),
    )

    application_id: Mapped[UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    rubric_id: Mapped[UUID] = mapped_column(ForeignKey("scoring_rubrics.id", ondelete="RESTRICT"), nullable=False)
    batch_file_id: Mapped[UUID | None] = mapped_column(ForeignKey("batch_files.id", ondelete="SET NULL"))
    total_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    recommendation: Mapped[Recommendation] = mapped_column(enum_type(Recommendation, "screening_recommendation"), nullable=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    is_disqualified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    disqualifier_reasons: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
    matched_skills: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
    missing_skills: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
    screening_document_id: Mapped[UUID | None] = mapped_column(ForeignKey("screening_documents.id", ondelete="SET NULL"))
    provider_name: Mapped[str] = mapped_column(String(80), nullable=False, default="legacy", server_default="legacy")
    model_name: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(50))
    privacy_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="legacy_unknown", server_default="legacy_unknown")
    trace_id: Mapped[str] = mapped_column(String(80), nullable=False)


class ScoreBreakdown(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "score_breakdowns"
    __table_args__ = (
        UniqueConstraint("screening_result_id", "criterion_id"),
        CheckConstraint("earned_score >= 0", name="earned_score_nonnegative"),
        CheckConstraint("max_score > 0", name="max_score_positive"),
    )

    screening_result_id: Mapped[UUID] = mapped_column(ForeignKey("screening_results.id", ondelete="CASCADE"), nullable=False)
    criterion_id: Mapped[UUID] = mapped_column(ForeignKey("rubric_criteria.id", ondelete="RESTRICT"), nullable=False)
    earned_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    max_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    explanation: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
