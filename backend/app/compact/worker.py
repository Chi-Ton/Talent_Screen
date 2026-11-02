"""One-file-at-a-time processing for the single HR workstation."""

import hashlib
import json
import logging
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import text

from app.compact.db import activate_schema
from app.core.config import PROJECT_ROOT, get_settings
from app.db.session import SessionLocal
from app.features.screening.privacy import redact_resume_for_remote_ai
from app.features.screening.processor import _extract_text, _ground_ai_output
from app.features.screening.scoring import compute_deterministic_score
from app.services.ai.prompts import SYSTEM_PROMPT, build_screening_document_prompt
from app.services.ai.router_client import AIClientError, RouterClient


logger = logging.getLogger("talentscreen.compact.worker")


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def process_batch(batch_id: UUID, actor_id: UUID, trace_id: str) -> None:
    with SessionLocal() as db:
        activate_schema(db)
        file_ids = db.scalars(text("SELECT id FROM batch_files WHERE batch_id=:b ORDER BY created_at,id"), {"b": batch_id}).all()
    for file_id in file_ids:
        process_file(file_id, actor_id, trace_id)


def process_file(file_id: UUID, actor_id: UUID, trace_id: str, force: bool = False) -> None:
    settings = get_settings()
    client = RouterClient(settings)
    with SessionLocal() as db:
        activate_schema(db)
        row = db.execute(text("""SELECT f.id,f.source_filename,r.storage_path,r.sha256,
          b.rubric_id,c.config FROM batch_files f JOIN resumes r ON r.id=f.resume_id
          JOIN screening_batches b ON b.id=f.batch_id JOIN scoring_rubrics c ON c.id=b.rubric_id
          WHERE f.id=:id FOR UPDATE OF f"""), {"id": file_id}).mappings().first()
        if row is None:
            return
        db.execute(text("""UPDATE screening_results SET status='failed',
          error_code='WORKER_LEASE_EXPIRED',finished_at=now()
          WHERE batch_file_id=:id AND status='running' AND lease_expires_at < now()"""), {"id": file_id})
        prior = db.execute(text("SELECT status,attempt_no FROM screening_results WHERE batch_file_id=:id ORDER BY attempt_no DESC LIMIT 1"), {"id": file_id}).mappings().first()
        if prior and (prior["status"] in ("queued", "running") or (prior["status"] == "succeeded" and not force)):
            return
        attempt = (prior["attempt_no"] if prior else 0) + 1
        lease_token = uuid4()
        result_id = db.execute(text("""INSERT INTO screening_results
          (batch_file_id,attempt_no,idempotency_key,status,trace_id,lease_token,lease_expires_at,started_at)
          VALUES (:f,:n,:k,'running',:trace,:lease,now()+:seconds * interval '1 second',now()) RETURNING id"""),
          {"f": file_id, "n": attempt, "k": uuid4(), "trace": trace_id, "lease": lease_token,
           "seconds": max(300, int(settings.ai_timeout_seconds * (settings.ai_retry_count + 1) + 120))}).scalar_one()
        db.commit()

    try:
        if not row["storage_path"]:
            raise ValueError("Source CV has been purged")
        path = (PROJECT_ROOT / row["storage_path"]).resolve()
        if not path.is_relative_to((PROJECT_ROOT / "uploads").resolve()):
            raise ValueError("Source path is outside managed storage")
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            raise ValueError("Source CV checksum mismatch")
        resume_text = _extract_text(path, path.suffix.lower())
        if len(resume_text.strip()) < 20 or len(resume_text) > settings.ai_max_resume_chars:
            raise ValueError("CV text is empty or exceeds the configured limit")
        redacted = redact_resume_for_remote_ai(resume_text, row["source_filename"])
        config = row["config"]
        payload = {
            "schemaVersion": "screening-v2",
            "targetRole": config["targetRole"],
            "jobSkills": config["jobSkills"],
            "rubricCriteria": config["criteria"],
            "resumeEvidence": {"redactedText": redacted.text},
            "privacy": {"mode": settings.ai_privacy_mode, "directContactPiiSent": False},
        }
        serialized = _json(payload)
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        with SessionLocal() as db:
            activate_schema(db)
            document_id = db.execute(text("""INSERT INTO screening_documents
              (batch_file_id,privacy_mode,payload,payload_sha256)
              VALUES (:f,:mode,CAST(:payload AS jsonb),:sha)
              ON CONFLICT (batch_file_id,payload_sha256,schema_version) DO NOTHING
              RETURNING id"""),
              {"f": file_id, "mode": settings.ai_privacy_mode, "payload": serialized, "sha": digest}).scalar_one_or_none()
            if document_id is None:
                document_id = db.scalar(text("SELECT id FROM screening_documents WHERE batch_file_id=:f AND payload_sha256=:sha AND schema_version='screening-v2'"), {"f": file_id, "sha": digest})
            payload = db.scalar(text("SELECT payload FROM screening_documents WHERE id=:id"), {"id": document_id})
            db.commit()
        parsed = client.complete_json(system_prompt=SYSTEM_PROMPT,
                                      user_prompt=build_screening_document_prompt(payload), trace_id=trace_id)
        if not isinstance(parsed, dict):
            raise ValueError("AI response must be an object")
        for field in ("skills", "experiences", "projects", "education", "certifications"):
            if not isinstance(parsed.get(field, []), list):
                raise ValueError("AI response has an invalid collection")
        criteria = [{"code": item["code"], "name": item.get("name", item["code"]),
                     "pillar": item["pillar"], "weight": item["weight"]} for item in config["criteria"]]
        job_skills = [{"name": item["name"], "requirement_level": item.get("requirement_level", "nice_to_have")}
                      for item in config["jobSkills"]]
        parsed = _ground_ai_output(parsed, resume_text=redacted.text, job_skills=job_skills,
                                   criteria=criteria, known_skills=[item["name"] for item in job_skills])
        parsed["candidate"] = {**(parsed.get("candidate") or {}), **redacted.identity.as_candidate_data()}
        score = compute_deterministic_score(
            parsed=parsed, job=config["targetRole"], job_skills=job_skills,
            criteria=criteria,
            thresholds={"review_needed": [config["thresholds"]["review_needed"], 69],
                        "recommend": [config["thresholds"]["recommend"], 84],
                        "strong_recommend": [config["thresholds"]["strong_recommend"], 100]},
            disqualifier_rules=config["disqualifiers"],
        )
        parsed["score"] = {"matched_skills": score.matched_skills, "missing_skills": score.missing_skills}
        needs_review = not parsed.get("skills") and not parsed.get("experiences") and not parsed.get("projects")
        breakdown = [{"code": item["criterion_code"], "earned": float(item["earned_score"]),
                      "max": float(item["max_score"]), "evidence": item["evidence"]}
                     for item in score.breakdowns] if not needs_review else []
        with SessionLocal() as db:
            activate_schema(db)
            owned = db.scalar(text("SELECT id FROM screening_results WHERE id=:id AND status='running' AND lease_token=:lease AND lease_expires_at > now() FOR UPDATE"), {"id": result_id, "lease": lease_token})
            if owned is None:
                return
            db.execute(text("""UPDATE resumes SET display_name=:name,email=:email,phone=:phone
              WHERE id=(SELECT resume_id FROM batch_files WHERE id=:f)"""),
              {"f": file_id, "name": redacted.identity.display_name,
               "email": redacted.identity.email, "phone": redacted.identity.phone})
            db.execute(text("""UPDATE screening_results SET status='succeeded',outcome=:outcome,
              document_id=:doc,grounded_profile=CAST(:profile AS jsonb),
              score_breakdown=CAST(:breakdown AS jsonb),total_score=:total,confidence=:confidence,
              recommendation=:rec,is_disqualified=:disqualified,review_reasons=CAST(:reasons AS jsonb),
              provider_name=:provider,model_name=:model,prompt_version=:prompt,
              scoring_version='deterministic-v2',finished_at=now()
              WHERE id=:id AND status='running' AND lease_token=:lease"""),
              {"id": result_id, "lease": lease_token, "outcome": "review_required" if needs_review else "scored",
               "doc": document_id, "profile": _json(parsed), "breakdown": _json(breakdown),
               "total": None if needs_review else score.total,
               "confidence": score.confidence, "rec": None if needs_review else score.recommendation.value,
               "disqualified": score.is_disqualified, "reasons": _json(score.disqualifier_reasons),
               "provider": settings.ai_provider, "model": settings.ai_model, "prompt": settings.ai_prompt_version})
            db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id) VALUES (:u,'cv.screened','result',:r,:trace)"),
                       {"u": actor_id, "r": result_id, "trace": trace_id})
            db.commit()
    except (AIClientError, ValueError, OSError) as exc:
        error_code = exc.code if isinstance(exc, AIClientError) else "CV_PROCESSING_FAILED"
        _fail_result(result_id, lease_token, error_code, trace_id)
    except Exception as exc:
        logger.error("compact_processing_failed trace_id=%s file_id=%s error_type=%s", trace_id, file_id, type(exc).__name__)
        _fail_result(result_id, lease_token, "PROCESSING_FAILED", trace_id)


def _fail_result(result_id: UUID, lease_token: UUID, code: str, trace_id: str) -> None:
    with SessionLocal() as db:
        activate_schema(db)
        db.execute(text("""UPDATE screening_results SET status='failed',error_code=:code,finished_at=now()
          WHERE id=:id AND status='running' AND lease_token=:lease"""),
          {"id": result_id, "lease": lease_token, "code": code})
        db.commit()
    logger.warning("compact_screening_failed trace_id=%s result_id=%s code=%s", trace_id, result_id, code)
