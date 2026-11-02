"""add private screening document read model

Revision ID: b87c4d1219fa
Revises: 7398d27285c3
Create Date: 2026-09-13 12:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b87c4d1219fa"
down_revision: str | Sequence[str] | None = "7398d27285c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "screening_documents",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("resume_id", sa.Uuid(), nullable=False),
        sa.Column("batch_file_id", sa.Uuid(), nullable=True),
        sa.Column("document_key", sa.String(length=96), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=32), server_default="v1", nullable=False),
        sa.Column("privacy_mode", sa.String(length=40), server_default="redacted_remote", nullable=False),
        sa.Column("payload", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), server_default="{}", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["batch_file_id"], ["batch_files.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["job_id"], ["job_openings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "resume_id"),
        sa.UniqueConstraint("organization_id", "document_key"),
    )
    op.create_index("ix_screening_documents_job_updated", "screening_documents", ["job_id", "updated_at"])
    op.create_index("ix_screening_documents_payload_gin", "screening_documents", ["payload"], postgresql_using="gin")

    op.add_column("screening_results", sa.Column("screening_document_id", sa.Uuid(), nullable=True))
    op.add_column("screening_results", sa.Column("provider_name", sa.String(length=80), server_default="legacy", nullable=False))
    op.add_column("screening_results", sa.Column("privacy_mode", sa.String(length=40), server_default="legacy_unknown", nullable=False))
    op.create_foreign_key(
        "fk_screening_results_screening_document_id_screening_documents",
        "screening_results",
        "screening_documents",
        ["screening_document_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_screening_results_screening_document_id_screening_documents", "screening_results", type_="foreignkey")
    op.drop_column("screening_results", "privacy_mode")
    op.drop_column("screening_results", "provider_name")
    op.drop_column("screening_results", "screening_document_id")
    op.drop_index("ix_screening_documents_payload_gin", table_name="screening_documents")
    op.drop_index("ix_screening_documents_job_updated", table_name="screening_documents")
    op.drop_table("screening_documents")
