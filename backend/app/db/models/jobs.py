from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import JSON_TYPE, JobStatus, RequirementLevel, RubricStatus, TimestampMixin, UUIDPrimaryKeyMixin, enum_type


class JobOpening(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "job_openings"
    __table_args__ = (
        UniqueConstraint("organization_id", "public_id"),
        Index("ix_job_openings_org_status_created", "organization_id", "status", "created_at"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[UUID | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    public_id: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    employment_type: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(160))
    work_mode: Mapped[str | None] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    min_experience_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    max_experience_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    minimum_education: Mapped[str | None] = mapped_column(String(180))
    status: Mapped[JobStatus] = mapped_column(enum_type(JobStatus, "job_status"), nullable=False, default=JobStatus.DRAFT, server_default=JobStatus.DRAFT.value)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class JobSkill(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "job_skills"
    __table_args__ = (
        UniqueConstraint("job_id", "skill_id"),
        CheckConstraint("weight >= 0 AND weight <= 100", name="weight_range"),
    )

    job_id: Mapped[UUID] = mapped_column(ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False)
    skill_id: Mapped[UUID] = mapped_column(ForeignKey("skills.id", ondelete="RESTRICT"), nullable=False)
    requirement_level: Mapped[RequirementLevel] = mapped_column(enum_type(RequirementLevel, "requirement_level"), nullable=False)
    minimum_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text)


class ScoringRubric(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "scoring_rubrics"
    __table_args__ = (
        UniqueConstraint("job_id", "version"),
        CheckConstraint("total_weight = 100", name="total_weight_100"),
    )

    job_id: Mapped[UUID] = mapped_column(ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    status: Mapped[RubricStatus] = mapped_column(enum_type(RubricStatus, "rubric_status"), nullable=False, default=RubricStatus.DRAFT, server_default=RubricStatus.DRAFT.value)
    total_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=100, server_default="100")
    thresholds: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    is_standard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)


class RubricCriterion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "rubric_criteria"
    __table_args__ = (
        UniqueConstraint("rubric_id", "criterion_code"),
        CheckConstraint("weight > 0 AND weight <= 100", name="weight_range"),
    )

    rubric_id: Mapped[UUID] = mapped_column(ForeignKey("scoring_rubrics.id", ondelete="CASCADE"), nullable=False)
    pillar_code: Mapped[str] = mapped_column(String(40), nullable=False)
    pillar_name: Mapped[str] = mapped_column(String(160), nullable=False)
    criterion_code: Mapped[str] = mapped_column(String(60), nullable=False)
    criterion_name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class DisqualifierRule(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "disqualifier_rules"
    __table_args__ = (UniqueConstraint("rubric_id", "rule_type"),)

    rubric_id: Mapped[UUID] = mapped_column(ForeignKey("scoring_rubrics.id", ondelete="CASCADE"), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    configuration: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
