"""Exercise compact-v2 DDL in a temporary transactional PostgreSQL schema.

No CV data is read and no live tables are modified. The complete schema and
synthetic fixtures are rolled back, including when a verification fails.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.session import engine


ROOT = Path(__file__).resolve().parents[2]
DDL = ROOT / "docs/database/compact-v2/schema.sql"


def verify() -> dict:
    schema = "compact_verify_" + uuid4().hex
    checks = []
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", pg_catalog')
            conn.exec_driver_sql(DDL.read_text(encoding="utf-8"))

            def sql(statement, **params):
                return conn.execute(text(statement), params)

            def reject(statement, **params):
                try:
                    with conn.begin_nested():
                        sql(statement, **params)
                except DBAPIError as exc:
                    assert exc.orig.sqlstate in {"23502", "23503", "23505", "23514"}, exc.orig.sqlstate
                else:
                    raise AssertionError("Invalid write was accepted")

            def case(name, run):
                savepoint = conn.begin_nested()
                try:
                    run()
                    checks.append({"name": name, "status": "passed"})
                finally:
                    savepoint.rollback()

            user = sql("INSERT INTO users(email,password_hash,full_name) VALUES ('operator@example.invalid','synthetic-hash','Test Operator') RETURNING id").scalar_one()
            job = sql("INSERT INTO job_openings(title,created_by_id) VALUES ('IT role',:u) RETURNING id", u=user).scalar_one()
            job2 = sql("INSERT INTO job_openings(title,created_by_id) VALUES ('Other role',:u) RETURNING id", u=user).scalar_one()
            config = {
                "schemaVersion": "rubric-v2", "targetRole": {"title": "IT role"},
                "jobSkills": [{"name": "Java", "requirement": "must_have"}],
                "criteria": [{"code": p, "pillar": p, "weight": w} for p, w in
                             zip(["skills", "experience", "projects", "systems", "education"], [40, 25, 15, 10, 10])],
                "thresholds": {"review_needed": 50, "recommend": 70, "strong_recommend": 85},
                "disqualifiers": [],
            }
            rubric = sql("INSERT INTO scoring_rubrics(job_id,version,config) VALUES (:j,1,CAST(:c AS jsonb)) RETURNING id", j=job, c=json.dumps(config)).scalar_one()
            batch = sql("INSERT INTO screening_batches(job_id,rubric_id,name,idempotency_key,created_by_id) VALUES (:j,:r,'Synthetic verification',:k,:u) RETURNING id", j=job, r=rubric, k=uuid4(), u=user).scalar_one()
            files = []
            for letter in ("a", "b"):
                resume = sql("INSERT INTO resumes(sha256,storage_path,mime_type,file_size_bytes) VALUES (:h,:p,'text/plain',100) RETURNING id", h=letter * 64, p=f"synthetic/{letter}.txt").scalar_one()
                files.append(sql("INSERT INTO batch_files(batch_id,resume_id,source_filename) VALUES (:b,:r,:n) RETURNING id", b=batch, r=resume, n=f"synthetic-{letter}.txt").scalar_one())

            def payload(mode="redacted_remote"):
                return {"schemaVersion": "screening-v2", "resumeEvidence": {"redactedText": "Java work experience"},
                        "targetRole": config["targetRole"], "jobSkills": config["jobSkills"], "rubricCriteria": config["criteria"],
                        "privacy": {"mode": mode, "directContactPiiSent": False}}

            def document(file_id, mode="redacted_remote", data=None, digest="c"):
                return sql("INSERT INTO screening_documents(batch_file_id,privacy_mode,payload,payload_sha256) VALUES (:f,:m,CAST(:p AS jsonb),:h) RETURNING id",
                           f=file_id, m=mode, p=json.dumps(data if data is not None else payload(mode)), h=digest * 64).scalar_one()

            doc = document(files[0])
            other_doc = document(files[1])
            breakdown = [{"code": p["code"], "earned": p["weight"] * .8, "max": p["weight"], "evidence": ["synthetic evidence"]} for p in config["criteria"]]
            success_sql = """INSERT INTO screening_results
                (batch_file_id,document_id,attempt_no,idempotency_key,status,outcome,total_score,recommendation,
                 score_breakdown,provider_name,model_name,prompt_version,scoring_version,trace_id,finished_at)
                VALUES (:f,:d,:a,:k,'succeeded',:o,:score,:rec,CAST(:breakdown AS jsonb),:provider,'test-model','test-prompt','scorer-v2','synthetic-trace',now()) RETURNING id"""

            def success_params(**overrides):
                return dict({"f": files[0], "d": doc, "a": 1, "k": uuid4(), "o": "scored", "score": 80,
                             "rec": "recommend", "breakdown": json.dumps(breakdown), "provider": "9router"}, **overrides)

            def nine_tables():
                assert sql("SELECT count(*) FROM information_schema.tables WHERE table_schema=:s AND table_type='BASE TABLE'", s=schema).scalar_one() == 9
            case("exactly_nine_physical_tables", nine_tables)
            case("single_operator_enforced", lambda: reject("INSERT INTO users(email,password_hash,full_name) VALUES ('other@example.invalid','x','Other')"))
            case("rubric_total_must_be_100", lambda: reject("INSERT INTO scoring_rubrics(job_id,version,config) VALUES (:j,2,CAST(:c AS jsonb))", j=job, c=json.dumps(dict(config, criteria=[{"code": "skills", "pillar": "skills", "weight": 90}]))))
            case("rubric_codes_unique", lambda: reject("INSERT INTO scoring_rubrics(job_id,version,config) VALUES (:j,2,CAST(:c AS jsonb))", j=job, c=json.dumps(dict(config, criteria=[{"code": "same", "pillar": "skills", "weight": 50}] * 2))))
            case("rubric_immutable", lambda: reject("UPDATE scoring_rubrics SET version=2 WHERE id=:r", r=rubric))
            case("rubric_must_belong_to_job", lambda: reject("INSERT INTO screening_batches(job_id,rubric_id,name,idempotency_key,created_by_id) VALUES (:j,:r,'invalid',:k,:u)", j=job2, r=rubric, k=uuid4(), u=user))
            case("batch_pins_configuration", lambda: reject("UPDATE screening_batches SET job_id=:j WHERE id=:b", j=job2, b=batch))
            case("same_source_once_per_batch", lambda: reject("INSERT INTO batch_files(batch_id,resume_id,source_filename) SELECT batch_id,resume_id,'duplicate.txt' FROM batch_files WHERE id=:f", f=files[0]))
            case("source_digest_immutable", lambda: reject("UPDATE resumes SET sha256=:h", h="d" * 64))
            case("file_cannot_be_reassigned", lambda: reject("UPDATE batch_files SET source_filename='different.txt' WHERE id=:f", f=files[0]))
            case("document_immutable", lambda: reject("UPDATE screening_documents SET privacy_mode='strict_local' WHERE id=:d", d=doc))
            case("document_top_level_identity_blocked", lambda: reject("INSERT INTO screening_documents(batch_file_id,privacy_mode,payload,payload_sha256) VALUES (:f,'redacted_remote',CAST(:p AS jsonb),:h)", f=files[0], p=json.dumps(dict(payload(), sourceFilename="private.txt")), h="e" * 64))
            case("document_required_privacy_flag", lambda: reject("INSERT INTO screening_documents(batch_file_id,privacy_mode,payload,payload_sha256) VALUES (:f,'redacted_remote',CAST(:p AS jsonb),:h)", f=files[0], p=json.dumps(dict(payload(), privacy={"mode": "redacted_remote"})), h="e" * 64))
            case("wrong_cv_document_blocked", lambda: reject(success_sql, **success_params(d=other_doc)))
            case("score_sum_enforced", lambda: reject(success_sql, **success_params(score=79)))
            case("recommendation_threshold_enforced", lambda: reject(success_sql, **success_params(rec="strong_recommend")))
            case("all_criteria_required", lambda: reject(success_sql, **success_params(breakdown=json.dumps(breakdown[:2]))))

            def strict_local():
                local_doc = document(files[0], mode="strict_local", digest="f")
                reject(success_sql, **success_params(d=local_doc))
            case("strict_local_remote_result_blocked", strict_local)

            def wrong_snapshot():
                data = payload()
                data["targetRole"] = {"title": "Wrong role"}
                bad_doc = document(files[0], data=data, digest="f")
                reject(success_sql, **success_params(d=bad_doc))
            case("document_must_match_pinned_rubric", wrong_snapshot)

            def one_active():
                sql("INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,trace_id) VALUES (:f,1,:k,'test')", f=files[0], k=uuid4())
                reject("INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,trace_id) VALUES (:f,2,:k,'test')", f=files[0], k=uuid4())
            case("only_one_active_attempt", one_active)
            case("running_requires_lease", lambda: reject("INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,trace_id,status) VALUES (:f,1,:k,'test','running')", f=files[0], k=uuid4()))
            case("failed_cannot_have_score", lambda: reject("INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,trace_id,status,error_code,finished_at,total_score,recommendation) VALUES (:f,1,:k,'test','failed','TEST',now(),0,'reject')", f=files[0], k=uuid4()))

            def finished_immutable():
                result = sql(success_sql, **success_params()).scalar_one()
                reject("UPDATE screening_results SET trace_id='changed' WHERE id=:r", r=result)
            case("finished_result_immutable", finished_immutable)

            def retry_preserves_success():
                result = sql(success_sql, **success_params()).scalar_one()
                sql("INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,trace_id,status,error_code,finished_at) VALUES (:f,2,:k,'test','failed','TIMEOUT',now())", f=files[0], k=uuid4())
                row = sql("SELECT result_id,total_score,latest_attempt_status FROM current_file_results WHERE file_id=:f", f=files[0]).one()
                assert row.result_id == result and row.total_score == 80 and row.latest_attempt_status == "failed"
                summary = sql("SELECT total_files,successful,pending FROM batch_summary WHERE batch_id=:b", b=batch).one()
                assert tuple(summary) == (2, 1, 1)
            case("retry_preserves_result_and_exact_counters", retry_preserves_success)

            def review_same_file():
                result = sql(success_sql, **success_params()).scalar_one()
                reject("UPDATE batch_files SET reviewed_result_id=:r,hr_decision='reviewed',reviewed_at=now() WHERE id=:f", r=result, f=files[1])
            case("hr_review_cannot_target_other_cv", review_same_file)

            def stale_review():
                result = sql(success_sql, **success_params()).scalar_one()
                sql("UPDATE batch_files SET reviewed_result_id=:r,hr_decision='reviewed',reviewed_at=now() WHERE id=:f", r=result, f=files[0])
                sql(success_sql, **success_params(a=2))
                assert sql("SELECT review_is_stale FROM current_file_results WHERE file_id=:f", f=files[0]).scalar_one()
            case("new_score_invalidates_old_hr_review", stale_review)

            def out_of_scope():
                sql(success_sql, **success_params(o="out_of_scope", score=None, rec=None, breakdown="[]"))
                row = sql("SELECT outcome,total_score FROM current_file_results WHERE file_id=:f", f=files[0]).one()
                assert row.outcome == "out_of_scope" and row.total_score is None
                reject(success_sql, **success_params(a=2, o="out_of_scope"))
            case("out_of_scope_is_not_zero_score", out_of_scope)
            case("referenced_source_delete_restricted", lambda: reject("DELETE FROM resumes"))

            def append_only():
                sql("INSERT INTO audit_logs(action,resource_type,trace_id) VALUES ('test','system','synthetic')")
                reject("DELETE FROM audit_logs")
                reject("UPDATE audit_logs SET action='changed'")
            case("audit_append_only", append_only)

            def trigger_search_path():
                conn.exec_driver_sql("SET LOCAL search_path TO public, pg_catalog")
                qualified = success_sql.replace("INSERT INTO screening_results", f'INSERT INTO "{schema}".screening_results')
                try:
                    result = sql(qualified, **success_params()).scalar_one()
                    assert result is not None
                finally:
                    conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", pg_catalog')
            case("trigger_resolves_compact_tables_with_public_search_path", trigger_search_path)
        finally:
            transaction.rollback()
        assert conn.execute(text("SELECT count(*) FROM pg_namespace WHERE nspname=:s"), {"s": schema}).scalar_one() == 0
    return {"verifiedAt": datetime.now(timezone.utc).isoformat(), "schema": "compact-v2", "physicalTables": 9,
            "checksPassed": len(checks), "checks": checks, "isolatedSchemaRolledBack": True,
            "liveApplicationMigrated": False, "realCvDataUsed": False, "remoteAiCalled": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = verify()
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
