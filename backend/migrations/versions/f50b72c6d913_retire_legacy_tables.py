"""Retire the 37 legacy application tables after compact-v2 cutover.

Revision ID: f50b72c6d913
Revises: e812d7c490ab
"""

import os

from alembic import op
from sqlalchemy import text


revision = "f50b72c6d913"
down_revision = "e812d7c490ab"
branch_labels = None
depends_on = None

LEGACY_TABLES = frozenset({
    "organizations", "ai_provider_settings", "candidates", "roles", "skill_categories",
    "skills", "teams", "candidate_certifications", "candidate_educations",
    "candidate_experiences", "candidate_projects", "permissions", "role_permissions",
    "skill_aliases", "users", "audit_logs", "job_openings", "notifications",
    "resumes", "user_preferences", "user_roles", "user_sessions", "applications",
    "candidate_skills", "job_skills", "scoring_rubrics", "screening_batches",
    "application_stage_history", "batch_files", "disqualifier_rules", "reports",
    "rubric_criteria", "screening_results", "review_queue_items", "score_breakdowns",
    "review_decisions", "screening_documents",
})


def upgrade() -> None:
    bind = op.get_bind()
    actual = set(bind.execute(text("""SELECT tablename FROM pg_tables
      WHERE schemaname='public' AND tablename <> 'alembic_version'""")).scalars())
    if actual != LEGACY_TABLES:
        raise RuntimeError("Legacy table inventory differs from the reviewed 37-table design")
    legacy_records = bind.scalar(text("SELECT count(*) FROM public.users")) + bind.scalar(text("SELECT count(*) FROM public.screening_results"))
    count = bind.scalar(text("SELECT count(*) FROM compact_v2.users"))
    if count != 1:
        raise RuntimeError("The compact HR operator must be initialized first")
    if legacy_records and bind.scalar(text("SELECT count(*) FROM compact_v2.scoring_rubrics")) < 1:
        raise RuntimeError("Import the target-role catalog before retiring legacy data")
    if legacy_records and os.getenv("TALENTSCREEN_RETIRE_LEGACY") != "1":
        raise RuntimeError("Set TALENTSCREEN_RETIRE_LEGACY=1 after verifying the database and upload backups")
    quoted = ", ".join(f'public."{table}"' for table in sorted(LEGACY_TABLES))
    bind.exec_driver_sql(f"DROP TABLE {quoted} CASCADE")


def downgrade() -> None:
    raise RuntimeError("Restore the verified pre-cutover backup to recover legacy tables")
