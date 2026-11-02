from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import JSON_TYPE, ParserStatus, PipelineStage, Recommendation, TimestampMixin, UUIDPrimaryKeyMixin, enum_type


class Candidate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("organization_id", "public_id"),
        Index("ix_candidates_org_name", "organization_id", "full_name"),
        Index("ix_candidates_org_email", "organization_id", "email"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    public_id: Mapped[str] = mapped_column(String(40), nullable=False)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(160))
    current_title: Mapped[str | None] = mapped_column(String(180))
    total_experience_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    github_url: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(60), nullable=False, default="upload", server_default="upload")
    pii_masked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class Resume(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "resumes"
    __table_args__ = (
        Index("ix_resumes_candidate_primary", "candidate_id", "is_primary"),
        Index("ix_resumes_org_sha256", "organization_id", "sha256"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[UUID | None] = mapped_column(ForeignKey("candidates.id", ondelete="SET NULL"))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(700), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text)
    parsed_profile: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")
    parser_status: Mapped[ParserStatus] = mapped_column(enum_type(ParserStatus, "parser_status"), nullable=False, default=ParserStatus.QUEUED, server_default=ParserStatus.QUEUED.value)
    parser_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    parser_version: Mapped[str | None] = mapped_column(String(80))
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    uploaded_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class CandidateSkill(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "candidate_skills"
    __table_args__ = (UniqueConstraint("candidate_id", "skill_id"),)

    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    skill_id: Mapped[UUID] = mapped_column(ForeignKey("skills.id", ondelete="RESTRICT"), nullable=False)
    source_resume_id: Mapped[UUID | None] = mapped_column(ForeignKey("resumes.id", ondelete="SET NULL"))
    years_experience: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    proficiency: Mapped[str | None] = mapped_column(String(40))
    last_used_year: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    evidence: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False, default=dict, server_default="{}")


class CandidateExperience(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "candidate_experiences"
    __table_args__ = (Index("ix_candidate_experiences_candidate_dates", "candidate_id", "start_date", "end_date"),)

    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    company_name: Mapped[str] = mapped_column(String(180), nullable=False)
    role_title: Mapped[str] = mapped_column(String(180), nullable=False)
    location: Mapped[str | None] = mapped_column(String(160))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    description: Mapped[str | None] = mapped_column(Text)
    achievements: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")


class CandidateProject(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "candidate_projects"

    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    technologies: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
    achievements: Mapped[list] = mapped_column(JSON_TYPE, nullable=False, default=list, server_default="[]")
    project_url: Mapped[str | None] = mapped_column(String(500))


class CandidateEducation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "candidate_educations"

    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    institution: Mapped[str] = mapped_column(String(200), nullable=False)
    degree: Mapped[str | None] = mapped_column(String(180))
    field_of_study: Mapped[str | None] = mapped_column(String(180))
    start_year: Mapped[int | None] = mapped_column(Integer)
    end_year: Mapped[int | None] = mapped_column(Integer)


class CandidateCertification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "candidate_certifications"

    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(180))
    issued_date: Mapped[date | None] = mapped_column(Date)
    expires_date: Mapped[date | None] = mapped_column(Date)
    credential_id: Mapped[str | None] = mapped_column(String(160))


class Application(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("job_id", "candidate_id"),
        Index("ix_applications_job_rank", "job_id", "rank"),
        Index("ix_applications_job_stage", "job_id", "pipeline_stage"),
    )

    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    resume_id: Mapped[UUID] = mapped_column(ForeignKey("resumes.id", ondelete="RESTRICT"), nullable=False)
    source: Mapped[str] = mapped_column(String(60), nullable=False, default="batch_upload", server_default="batch_upload")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="active", server_default="active")
    pipeline_stage: Mapped[PipelineStage] = mapped_column(enum_type(PipelineStage, "pipeline_stage"), nullable=False, default=PipelineStage.NEW, server_default=PipelineStage.NEW.value)
    current_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    recommendation: Mapped[Recommendation | None] = mapped_column(enum_type(Recommendation, "recommendation"))
    rank: Mapped[int | None] = mapped_column(Integer)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
