from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import PipelineStage, Recommendation, ReviewPriority, ReviewStatus, TimestampMixin, UUIDPrimaryKeyMixin, enum_type


class ApplicationStageHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "application_stage_history"
    __table_args__ = (Index("ix_stage_history_application_created", "application_id", "created_at"),)

    application_id: Mapped[UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    from_stage: Mapped[PipelineStage | None] = mapped_column(enum_type(PipelineStage, "pipeline_stage_from"))
    to_stage: Mapped[PipelineStage] = mapped_column(enum_type(PipelineStage, "pipeline_stage_to"), nullable=False)
    changed_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ReviewQueueItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "review_queue_items"
    __table_args__ = (Index("ix_review_queue_status_priority", "status", "priority", "created_at"),)

    application_id: Mapped[UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    screening_result_id: Mapped[UUID | None] = mapped_column(ForeignKey("screening_results.id", ondelete="SET NULL"))
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[ReviewPriority] = mapped_column(enum_type(ReviewPriority, "review_priority"), nullable=False, default=ReviewPriority.MEDIUM, server_default=ReviewPriority.MEDIUM.value)
    status: Mapped[ReviewStatus] = mapped_column(enum_type(ReviewStatus, "review_status"), nullable=False, default=ReviewStatus.PENDING, server_default=ReviewStatus.PENDING.value)
    assigned_to_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReviewDecision(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "review_decisions"

    review_item_id: Mapped[UUID] = mapped_column(ForeignKey("review_queue_items.id", ondelete="CASCADE"), nullable=False)
    reviewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    decision: Mapped[str] = mapped_column(String(60), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    override_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    override_recommendation: Mapped[Recommendation | None] = mapped_column(enum_type(Recommendation, "review_override_recommendation"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
