"""Read-only cutover check for the compact PostgreSQL runtime."""

import json

from sqlalchemy import text

from app.db.session import SessionLocal


TABLES = {
    "users", "job_openings", "scoring_rubrics", "screening_batches",
    "resumes", "batch_files", "screening_documents", "screening_results", "audit_logs",
}
VIEWS = {"batch_summary", "current_file_results"}
HEAD = "f50b72c6d913"


def verify() -> dict:
    with SessionLocal() as db:
        rows = db.execute(text("""SELECT schemaname,tablename FROM pg_tables
            WHERE schemaname IN ('public','compact_v2')""")).all()
        compact_tables = {name for schema, name in rows if schema == "compact_v2"}
        public_tables = {name for schema, name in rows if schema == "public"}
        views = set(db.execute(text("""SELECT viewname FROM pg_views
            WHERE schemaname='compact_v2'""")).scalars())
        revision = db.scalar(text("SELECT version_num FROM public.alembic_version"))
        users = db.scalar(text("SELECT count(*) FROM compact_v2.users"))
        roles = db.scalar(text("SELECT count(*) FROM compact_v2.job_openings"))
        files = db.scalar(text("SELECT count(*) FROM compact_v2.batch_files"))
        results = db.scalar(text("SELECT count(*) FROM compact_v2.screening_results"))
    assert compact_tables == TABLES, {"actualTables": sorted(compact_tables)}
    assert public_tables == {"alembic_version"}, {"publicTables": sorted(public_tables)}
    assert views == VIEWS, {"views": sorted(views)}
    assert revision == HEAD, {"revision": revision}
    assert users == 1, {"operators": users}
    return {"schema": "compact-v2", "physicalTables": len(compact_tables),
            "views": len(views), "operators": users, "roles": roles,
            "uploadedFiles": files, "screeningAttempts": results, "revision": revision}


if __name__ == "__main__":
    print(json.dumps(verify()))
