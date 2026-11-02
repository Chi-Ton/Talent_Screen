"""Pin compact trigger lookups to their own schema.

Revision ID: e812d7c490ab
Revises: c624f0e2159a
"""

from alembic import op


revision = "e812d7c490ab"
down_revision = "c624f0e2159a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER FUNCTION compact_v2.guard_result() SET search_path TO pg_catalog, compact_v2")
    op.execute("ALTER FUNCTION compact_v2.guard_file_identity() SET search_path TO pg_catalog, compact_v2")


def downgrade() -> None:
    op.execute("ALTER FUNCTION compact_v2.guard_result() RESET search_path")
    op.execute("ALTER FUNCTION compact_v2.guard_file_identity() RESET search_path")
