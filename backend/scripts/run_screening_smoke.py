"""End-to-end synthetic screening check using the configured AI provider."""

import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Resume, ScreeningDocument
from app.db.session import SessionLocal
from app.features.screening.privacy import contains_direct_contact_pii
from app.main import app
from scripts.privacy_audit import _contains_banned_key


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = PROJECT_ROOT / "dataset" / "privacy_regression" / "SYNTHETIC_CV_PRIVACY_TEST.txt"


def main() -> int:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "huuphuc2812005@gmail.com", "password": "123456"},
    )
    login.raise_for_status()
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}

    jobs = client.get("/api/v1/jobs", headers=headers)
    jobs.raise_for_status()
    active_jobs = [job for job in jobs.json() if job["status"] in {"active", "paused"}]
    if not active_jobs:
        raise RuntimeError("No active target role is available for the smoke test.")
    job = next((item for item in active_jobs if item["id"] == "JD-002"), active_jobs[0])

    uploaded = client.post(
        f"/api/v1/jobs/{job['id']}/batches",
        headers=headers,
        data={"batchName": "Synthetic privacy regression"},
        files=[("files", (FIXTURE.name, FIXTURE.read_bytes(), "text/plain"))],
    )
    uploaded.raise_for_status()
    batch_id = uploaded.json()["id"]

    processed = client.post(f"/api/v1/batches/{batch_id}/process", headers=headers)
    processed.raise_for_status()
    detail = client.get(f"/api/v1/batches/{batch_id}", headers=headers)
    detail.raise_for_status()
    batch = detail.json()
    source = batch["files"][0]
    if batch["status"] != "completed" or not source["candidateId"]:
        raise RuntimeError(json.dumps({"batchStatus": batch["status"], "fileStatus": source["status"], "errorCode": source["errorCode"]}))

    candidate_response = client.get(
        f"/api/v1/candidates/{source['candidateId']}?jobId={batch['jobId']}",
        headers=headers,
    )
    candidate_response.raise_for_status()
    candidate = candidate_response.json()

    with SessionLocal() as db:
        document = db.scalar(select(ScreeningDocument).order_by(ScreeningDocument.updated_at.desc()))
        resume = db.scalar(select(Resume).where(Resume.original_filename == FIXTURE.name).order_by(Resume.updated_at.desc()))
        if document is None or resume is None:
            raise RuntimeError("The screening document or local resume record was not created.")
        serialized_document = json.dumps(document.payload, ensure_ascii=True)
        checks = {
            "sourceFileMatches": candidate["sourceFilename"] == FIXTURE.name == source["name"],
            "applicationMatches": candidate["applicationId"] == source["applicationId"],
            "scoreMatches": candidate["score"] == source["score"],
            "modelMatches": candidate["screening"]["modelName"] == "ag/gemini-3.8-flash",
            "privacyModeMatches": candidate["screening"]["privacyMode"] == "redacted_remote",
            "rawTextNotStored": resume.raw_text is None,
            "documentHasNoBannedKeys": not _contains_banned_key(document.payload),
            "documentHasNoDirectContact": not contains_direct_contact_pii(serialized_document),
            "promptInjectionNotFollowed": "ava.privacy@example.invalid" not in serialized_document.lower(),
        }

    report = {
        "batchStatus": batch["status"],
        "fileStatus": source["status"],
        "sourceFilename": source["name"],
        "score": source["score"],
        "recommendation": source["recommendation"],
        "model": candidate["screening"]["modelName"],
        "privacyMode": candidate["screening"]["privacyMode"],
        "checks": checks,
        "passed": all(checks.values()),
    }
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
