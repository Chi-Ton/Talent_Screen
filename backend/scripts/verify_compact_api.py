"""Isolated PostgreSQL/API regression. Only synthetic CVs; no remote requests."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.compact import candidates, db as compact_db, screening, worker
from app.core.security import hash_password
from app.db.session import engine
from app.main import app
from app.services.ai.router_client import AIClientError


def verify():
    schema = "compact_api_verify_" + uuid4().hex
    ddl = Path(__file__).resolve().parents[2] / "docs/database/compact-v2/schema.sql"
    checks = []
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", pg_catalog')
        connection.exec_driver_sql(ddl.read_text(encoding="utf-8"))
        connection.execute(text("INSERT INTO users(email,password_hash,full_name) VALUES ('tester@example.com',:p,'Synthetic HR')"), {"p": hash_password("test-only-password")})
    try:
        with TemporaryDirectory(prefix="talentscreen-test-") as folder, patch.object(compact_db, "SCHEMA", schema), patch.object(screening, "PROJECT_ROOT", Path(folder)), patch.object(screening, "UPLOAD_ROOT", Path(folder) / "uploads/compact"), patch.object(worker, "PROJECT_ROOT", Path(folder)), patch.object(candidates, "PROJECT_ROOT", Path(folder)), TestClient(app) as client:
            base = "/api/v1"

            def call(method, path, expected=200, **kwargs):
                response = client.request(method, base + path, **kwargs)
                assert response.status_code == expected, (method, path, response.status_code, response.text)
                return response.json()

            call("GET", "/jobs", 401)
            login = call("POST", "/auth/login", json={"email": "tester@example.com", "password": "test-only-password"})
            client.headers["Authorization"] = "Bearer " + login["accessToken"]
            checks.append("authentication")
            job = call("POST", "/jobs", 201, json={"title": "Java Developer", "description": "Develop Java services with PostgreSQL databases.", "mustHaveSkills": ["Java"], "minimumExperienceYears": 2})
            call("POST", f"/jobs/{job['id']}/publish")
            checks.append("create_and_publish_role")
            call("POST", f"/jobs/{job['id']}/batches", 415, files=[("files", ("bad.pdf", b"not a pdf", "application/pdf"))])
            checks.append("reject_invalid_pdf")
            cv = b"Synthetic Applicant\nEmail: test@example.invalid\nJava Developer\nSkills: Java\nExperience: 2 years\n"
            batch = call("POST", f"/jobs/{job['id']}/batches", 202, files=[("files", ("synthetic-one.txt", cv, "text/plain")), ("files", ("synthetic-two.txt", cv + b"SQL", "text/plain"))])
            checks.append("upload_two_distinct_sources")
            prompts = []

            def fake_ai(self, **kwargs):
                prompts.append(kwargs["user_prompt"])
                return {"candidate": {"total_experience_years": 2}, "skills": [{"name": "Java", "evidence": "Skills: Java"}], "experiences": [], "projects": [], "education": [], "certifications": [], "score": {"criteria": []}}

            with patch.object(worker.RouterClient, "complete_json", fake_ai):
                call("POST", f"/batches/{batch['id']}/process", 202)
            detail = call("GET", f"/batches/{batch['id']}")
            assert detail["processedFiles"] == 2, detail
            ranked = call("GET", "/candidates")
            assert len(ranked) == 2
            for file in detail["files"]:
                candidate = call("GET", f"/candidates/{file['candidateId']}")
                assert candidate["sourceFilename"] == file["name"]
                assert candidate["score"] == file["score"]
                assert candidate["matchedSkills"] == ["Java"]
                assert "Skills: Java" in candidate["resume"]["rawText"]
            assert all("test@example.invalid" not in prompt and "synthetic-one.txt" not in prompt for prompt in prompts)
            checks.extend(["process_two_cvs", "exact_file_result_score_links", "deterministic_matched_skills", "remote_prompt_redaction"])
            with patch.object(worker.RouterClient, "complete_json", side_effect=AIClientError("AI_RATE_LIMITED", "Synthetic limit")):
                call("POST", f"/candidates/{ranked[0]['id']}/rescore")
            current = call("GET", "/candidates")
            assert {r["id"] for r in current} == {r["id"] for r in ranked}
            checks.append("failed_retry_preserves_success")
            call("GET", "/candidates?jobId=" + str(uuid4()))
            checks.append("optional_uuid_filters")
            call("POST", "/candidates/compare", json={"resultIds": [r["id"] for r in ranked]})
            call("POST", "/candidates/compare", 422, json={"resultIds": [ranked[0]["id"], ranked[0]["id"]]})
            checks.append("comparison_distinct_results")
            uncertain = call("POST", f"/jobs/{job['id']}/batches", 202, files=[("files", ("uncertain.txt", b"This synthetic document has insufficient professional evidence.", "text/plain"))])
            with patch.object(worker.RouterClient, "complete_json", return_value={"candidate": {}, "skills": [], "experiences": [], "projects": [], "education": [], "certifications": []}):
                call("POST", f"/batches/{uncertain['id']}/process", 202)
            uncertain_results = call("GET", "/candidates?batchId=" + uncertain["id"])
            assert len(uncertain_results) == 1, uncertain_results
            assert uncertain_results[0]["score"] is None
            assert uncertain_results[0]["outcome"] == "review_required"
            checks.append("unscored_results_remain_visible_for_review")
            other = call("POST", "/jobs", 201, json={"title": "Other Java Role", "description": "Another role with a distinct scoring rubric.", "mustHaveSkills": ["Java"]})
            call("POST", f"/jobs/{other['id']}/publish")
            other_batch = call("POST", f"/jobs/{other['id']}/batches", 202, files=[("files", ("same-source.txt", cv, "text/plain"))])
            with patch.object(worker.RouterClient, "complete_json", fake_ai):
                call("POST", f"/batches/{other_batch['id']}/process", 202)
            other_results = call("GET", "/candidates?batchId=" + other_batch["id"])
            call("POST", "/candidates/compare", 422, json={"resultIds": [ranked[0]["id"], other_results[0]["id"]]})
            checks.append("reject_cross_rubric_comparison")
            call("GET", "/health")
            status = call("GET", "/settings/ai-provider/status")
            assert status["zeroRetentionVerified"] is False
            retention = call("GET", "/settings/data-retention")
            assert retention["availableLocalFiles"] >= 3
            call("POST", "/settings/data-retention/purge-expired", 400, json={"confirm": False})
            with patch.object(worker.RouterClient, "complete_json", return_value={"ok": False}):
                call("POST", "/settings/ai-provider/test", 503)
            checks.append("provider_status_and_test_validation")
            expired = call("POST", f"/jobs/{job['id']}/batches", 202, files=[("files", ("expired-worker.txt", cv + b"\nRestart recovery", "text/plain"))])
            expired_file = call("GET", f"/batches/{expired['id']}")["files"][0]["id"]
            with engine.begin() as connection:
                connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", pg_catalog')
                connection.execute(text("""INSERT INTO screening_results(batch_file_id,attempt_no,idempotency_key,status,trace_id,lease_token,lease_expires_at,started_at)
                  VALUES (:f,1,:key,'running','synthetic-expired',:lease,now()-interval '1 minute',now()-interval '10 minutes')"""), {"f": expired_file, "key": uuid4(), "lease": uuid4()})
            with patch.object(worker.RouterClient, "complete_json", fake_ai):
                call("POST", f"/batches/{expired['id']}/process", 202)
            recovered = call("GET", f"/batches/{expired['id']}")
            assert recovered["processedFiles"] == 1 and recovered["files"][0]["attemptCount"] == 2
            checks.append("expired_worker_recovered_without_duplicate_success")
            damaged = call("POST", f"/jobs/{job['id']}/batches", 202, files=[("files", ("damaged.txt", cv + b"\nChecksum guard", "text/plain"))])
            with engine.connect() as connection:
                connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", pg_catalog')
                source = connection.scalar(text("SELECT r.storage_path FROM resumes r JOIN batch_files f ON f.resume_id=r.id WHERE f.batch_id=:id"), {"id": damaged["id"]})
            (Path(folder) / source).write_bytes(b"tampered synthetic file")
            with patch.object(worker.RouterClient, "complete_json") as mock_ai:
                call("POST", f"/batches/{damaged['id']}/process", 202)
                mock_ai.assert_not_called()
            failed = call("GET", f"/batches/{damaged['id']}")
            assert failed["status"] == "failed" and failed["failedFiles"] == 1
            checks.append("checksum_failure_blocks_ai_and_marks_batch_failed")
        return {"passed": len(checks), "checks": checks, "remoteRequests": 0}
    finally:
        # Only this invocation's randomly named synthetic schema is removed.
        assert schema.startswith("compact_api_verify_") and schema.isidentifier()
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2))
