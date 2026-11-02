from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import AuditOutcome, JSON_TYPE, ReportStatus, TimestampMixin, UUIDPrimaryKeyMixin, enum_type


class Report(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("organization_id", "public_id"),
        Index("ix_reports_org_status_created", "organization_id", "status", "created_at"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    public_id: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[str] = mapped_column(String(80), nullable=False)
    job_id: Mapped[UUID | None] = mapped_column(ForeignKey("job_openings.id", ondelete="SET NULL"))
    batch_id: Mapped[UUID | None] = mapped_column(ForeignKey("screening_batches.id", ondelete="SET NULL"))
    status: Mapped[ReportStatus] = mapped_column(enum_type(ReportStatus, "report_status"), nullable=False, default=ReportStatus.QUEUED, server_default=ReportStatus.QUEUED.value)
    parameters: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    summary: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    storage_path: Mapped[str | None] = mapped_column(String(700))
    generated_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AIProviderSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_provider_settings"
    __table_args__ = (UniqueConstraint("organization_id", "provider"),)

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    secret_reference: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2, server_default="2")
    parameters: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")


class Notification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read_created", "user_id", "read_at", "created_at"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(String(500))
    payload: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_org_created", "organization_id", "created_at"),
        Index("ix_audit_logs_actor_created", "actor_user_id", "created_at"),
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
        Index("ix_audit_logs_trace_id", "trace_id"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_identity: Mapped[str] = mapped_column(String(254), nullable=False)
    actor_role: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(80))
    outcome: Mapped[AuditOutcome] = mapped_column(enum_type(AuditOutcome, "audit_outcome"), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    trace_id: Mapped[str] = mapped_column(String(80), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(80))
    changes: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON_TYPE, nullable=False, default=dict, server_default="{}")
    integrity_hash: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    retention_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
