"""Stage the compact nine-table schema without changing legacy writes.

Revision ID: c624f0e2159a
Revises: b87c4d1219fa
"""

from pathlib import Path

from alembic import op
import sqlalchemy as sa


revision = "c624f0e2159a"
down_revision = "b87c4d1219fa"
branch_labels = None
depends_on = None

SCHEMA = "compact_v2"
DDL = Path(__file__).resolve().parents[3] / "docs/database/compact-v2/schema.sql"
TABLES = (
    "users", "job_openings", "scoring_rubrics", "screening_batches",
    "resumes", "batch_files", "screening_documents", "screening_results", "audit_logs",
)


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(f"CREATE SCHEMA {SCHEMA}")
    bind.exec_driver_sql(f"SET LOCAL search_path TO {SCHEMA}, pg_catalog")
    bind.exec_driver_sql(DDL.read_text(encoding="utf-8"))
    bind.exec_driver_sql("SET LOCAL search_path TO public, pg_catalog")


def downgrade() -> None:
    bind = op.get_bind()
    for table in TABLES:
        if bind.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {SCHEMA}.{table} LIMIT 1)")).scalar():
            raise RuntimeError("Compact schema contains data; export/reconcile it before downgrade")
    bind.exec_driver_sql(f"DROP SCHEMA {SCHEMA} CASCADE")
