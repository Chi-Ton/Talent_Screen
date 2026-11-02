"""Read-only aggregate checks before migrating legacy CV data.

Prints counts and blocker codes only. Never prints candidate or operator data.
"""

import argparse
import hashlib
import json
from pathlib import Path

from sqlalchemy import text

from app.core.config import PROJECT_ROOT
from app.db.session import engine


COUNT_QUERIES = {
    "organizations": "SELECT count(*) FROM organizations",
    "users": "SELECT count(*) FROM users",
    "jobs": "SELECT count(*) FROM job_openings",
    "rubrics": "SELECT count(*) FROM scoring_rubrics",
    "batches": "SELECT count(*) FROM screening_batches",
    "batch_files": "SELECT count(*) FROM batch_files",
    "resumes": "SELECT count(*) FROM resumes",
    "documents": "SELECT count(*) FROM screening_documents",
    "results": "SELECT count(*) FROM screening_results",
    "applications": "SELECT count(*) FROM applications",
    "review_decisions": "SELECT count(*) FROM review_decisions",
    "batch_files_without_resume": "SELECT count(*) FROM batch_files WHERE resume_id IS NULL",
    "results_without_file": "SELECT count(*) FROM screening_results WHERE batch_file_id IS NULL",
    "results_without_document": "SELECT count(*) FROM screening_results WHERE screening_document_id IS NULL",
    "results_without_model": "SELECT count(*) FROM screening_results WHERE model_name IS NULL OR prompt_version IS NULL",
    "documents_without_file": "SELECT count(*) FROM screening_documents WHERE batch_file_id IS NULL",
    "applications_without_result": "SELECT count(*) FROM applications a WHERE NOT EXISTS (SELECT 1 FROM screening_results s WHERE s.application_id = a.id)",
    "batches_without_rubric": "SELECT count(*) FROM screening_batches b WHERE NOT EXISTS (SELECT 1 FROM scoring_rubrics r WHERE r.job_id = b.job_id)",
    "batches_with_multiple_result_rubrics": "SELECT count(*) FROM (SELECT f.batch_id FROM screening_results s JOIN batch_files f ON f.id = s.batch_file_id GROUP BY f.batch_id HAVING count(DISTINCT s.rubric_id) > 1) x",
    "files_with_multiple_results": "SELECT count(*) FROM (SELECT batch_file_id FROM screening_results WHERE batch_file_id IS NOT NULL GROUP BY batch_file_id HAVING count(*) > 1) x",
    "duplicate_resume_hashes": "SELECT count(*) FROM (SELECT sha256 FROM resumes GROUP BY sha256 HAVING count(*) > 1) x",
    "results_with_nonterminal_files": "SELECT count(*) FROM screening_results s JOIN batch_files f ON f.id = s.batch_file_id WHERE f.status NOT IN ('completed', 'failed')",
    "unsupported_resume_mime": "SELECT count(*) FROM resumes WHERE mime_type NOT IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')",
    "oversize_or_empty_resume": "SELECT count(*) FROM resumes WHERE file_size_bytes < 1 OR file_size_bytes > 10485760",
    "rubrics_with_invalid_weight_sum": "SELECT count(*) FROM (SELECT r.id, COALESCE(sum(c.weight),0) AS total FROM scoring_rubrics r LEFT JOIN rubric_criteria c ON c.rubric_id = r.id GROUP BY r.id HAVING COALESCE(sum(c.weight),0) <> 100) x",
}

HARD_BLOCKERS = {
    "users": lambda n: n != 1,
    "organizations": lambda n: n != 1,
    "batch_files_without_resume": lambda n: n > 0,
    "results_without_file": lambda n: n > 0,
    "batches_without_rubric": lambda n: n > 0,
    "rubrics_with_invalid_weight_sum": lambda n: n > 0,
}


def preflight(operator_email: str | None = None) -> dict:
    with engine.connect() as connection:
        connection.execute(text("SET TRANSACTION READ ONLY"))
        counts = {name: connection.scalar(text(query)) for name, query in COUNT_QUERIES.items()}
        source_rows = connection.execute(text("SELECT storage_path, sha256 FROM resumes")).all()
        operator = None
        if operator_email:
            operator = {
                "matches": connection.scalar(text("SELECT count(*) FROM users WHERE lower(email) = lower(:email)"), {"email": operator_email}),
                "jobsOwnedByOthers": connection.scalar(text("SELECT count(*) FROM job_openings j JOIN users u ON u.id = j.created_by_id WHERE lower(u.email) <> lower(:email)"), {"email": operator_email}),
                "batchesOwnedByOthers": connection.scalar(text("SELECT count(*) FROM screening_batches b JOIN users u ON u.id = b.created_by_id WHERE lower(u.email) <> lower(:email)"), {"email": operator_email}),
            }
        connection.rollback()
    uploads_root = (PROJECT_ROOT / "uploads").resolve()
    source_checks = {"missing": 0, "checksumMismatch": 0, "outsideUploadRoot": 0}
    for source_path, digest in source_rows:
        path = Path(source_path)
        resolved = (path if path.is_absolute() else PROJECT_ROOT / path).resolve()
        if not resolved.is_relative_to(uploads_root):
            source_checks["outsideUploadRoot"] += 1
        if not resolved.is_file():
            source_checks["missing"] += 1
            continue
        hasher = hashlib.sha256()
        with resolved.open("rb") as source_file:
            for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                hasher.update(chunk)
        if hasher.hexdigest() != digest:
            source_checks["checksumMismatch"] += 1
    blockers = [name for name, predicate in HARD_BLOCKERS.items() if predicate(counts[name])]
    if operator and operator["matches"] == 1 and operator["jobsOwnedByOthers"] == 0 and operator["batchesOwnedByOthers"] == 0:
        if "users" in blockers:
            blockers.remove("users")
    elif operator:
        blockers.append("operator_selection_conflict")
    blockers.extend(name for name in ("missing", "checksumMismatch") if source_checks[name])
    review = [name for name in (
        "results_without_document", "results_without_model", "documents_without_file",
        "applications_without_result", "batches_with_multiple_result_rubrics",
        "files_with_multiple_results", "duplicate_resume_hashes", "results_with_nonterminal_files",
        "unsupported_resume_mime", "oversize_or_empty_resume",
    ) if counts[name] > 0]
    if source_checks["outsideUploadRoot"]:
        review.append("source_outside_upload_root")
    return {
        "counts": counts,
        "sourceChecks": source_checks,
        "operatorSelection": operator,
        "hardBlockers": blockers,
        "requiresMappingOrReview": review,
        "automaticCutoverReady": not blockers and not review,
        "changedData": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--operator-email", help="Existing HR account to retain; never printed")
    args = parser.parse_args()
    print(json.dumps(preflight(args.operator_email), indent=2))
