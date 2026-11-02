from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import current_hr, get_compact_db
from app.compact.worker import process_file
from app.core.config import PROJECT_ROOT
from app.core.errors import AppError
from app.features.screening.processor import _extract_text


router = APIRouter()


def _row(db: Session, result_id: UUID):
    row = db.execute(text("""SELECT s.*, f.id AS file_id,f.source_filename,f.hr_decision,
      b.id AS batch_id,b.rubric_id,j.id AS job_id,j.title AS role_title,r.display_name,r.email,r.storage_path,
      r.mime_type,c.config AS rubric_config,d.privacy_mode FROM screening_results s JOIN batch_files f ON f.id=s.batch_file_id
      JOIN screening_batches b ON b.id=f.batch_id JOIN job_openings j ON j.id=b.job_id
      JOIN resumes r ON r.id=f.resume_id JOIN scoring_rubrics c ON c.id=b.rubric_id
      LEFT JOIN screening_documents d ON d.id=s.document_id
      WHERE s.id=:id AND s.status='succeeded'"""),
      {"id": result_id}).mappings().first()
    if not row:
        raise AppError("CANDIDATE_NOT_FOUND", "CV result was not found.", status_code=404)
    return row


def _payload(row, detail=False) -> dict:
    profile = row["grounded_profile"] or {}
    candidate = profile.get("candidate") or {}
    found = profile.get("score") or {}
    breakdown = row["score_breakdown"] or []
    name = row["display_name"] or row["source_filename"]
    rubric_criteria = {item["code"]: item for item in row["rubric_config"]["criteria"]}
    data = {
        "id": str(row["id"]), "name": name, "displayName": name,
        "sourceFilename": row["source_filename"], "email": row["email"],
        "currentTitle": candidate.get("current_title"), "location": candidate.get("location"),
        "experienceYears": candidate.get("total_experience_years"),
        "targetRole": row["role_title"], "jobId": str(row["job_id"]),
        "applicationId": str(row["id"]), "batchId": str(row["batch_id"]),
        "rubricId": str(row["rubric_id"]), "scoringVersion": row["scoring_version"],
        "outcome": row["outcome"],
        "pipelineStage": row["hr_decision"] or "new", "rank": None,
        "score": float(row["total_score"]) if row["total_score"] is not None else None,
        "recommendation": row["recommendation"],
        "matchedSkills": found.get("matched_skills") or [],
        "missingSkills": found.get("missing_skills") or [],
        "summary": None,
        "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
    }
    if detail:
        local_text = None
        if row["storage_path"]:
            source = (PROJECT_ROOT / row["storage_path"]).resolve()
            if source.is_relative_to((PROJECT_ROOT / "uploads").resolve()) and source.is_file():
                try:
                    local_text = _extract_text(source, source.suffix.lower())
                except (OSError, ValueError):
                    pass
        grouped = {}
        pillar_names = {"skills": "Technical Skills", "experience": "Experience",
                        "projects": "Projects & Impact", "systems": "Systems & Cloud",
                        "education": "Education & Certifications"}
        for item in breakdown:
            criterion = rubric_criteria.get(item["code"], {})
            pillar = criterion.get("pillar", "skills")
            group = grouped.setdefault(pillar, {"pillarCode": pillar, "pillarName": pillar_names.get(pillar, pillar),
                                                "earnedScore": 0, "maxScore": 0, "percentage": 0, "criteria": []})
            group["earnedScore"] += item["earned"]
            group["maxScore"] += item["max"]
            group["criteria"].append({"criterionCode": item["code"],
                                       "criterionName": criterion.get("name", item["code"]),
                                       "earnedScore": item["earned"], "maxScore": item["max"],
                                       "confidence": None, "explanation": "Backend deterministic score",
                                       "evidence": item.get("evidence") or []})
        for group in grouped.values():
            group["percentage"] = round(group["earnedScore"] / group["maxScore"] * 100, 1) if group["maxScore"] else 0
        data.update({
            "skills": [item.get("name") for item in profile.get("skills", []) if isinstance(item, dict) and item.get("name")],
            "experiences": [{"company": item.get("company_name"), "title": item.get("role_title"),
                             "location": item.get("location"), "startDate": item.get("start_date"),
                             "endDate": item.get("end_date"), "isCurrent": item.get("is_current", False),
                             "description": item.get("description"), "achievements": item.get("achievements") or []}
                            for item in profile.get("experiences", []) if isinstance(item, dict)],
            "projects": [{"name": item.get("name") or "Project", "role": item.get("role"),
                          "description": item.get("description"), "technologies": item.get("technologies") or [],
                          "achievements": item.get("achievements") or [], "url": item.get("url")}
                         for item in profile.get("projects", []) if isinstance(item, dict)],
            "education": [{"institution": item.get("institution") or "Not stated", "degree": item.get("degree"),
                           "fieldOfStudy": item.get("field_of_study"), "startYear": item.get("start_year"),
                           "endYear": item.get("end_year")}
                          for item in profile.get("education", []) if isinstance(item, dict)],
            "certifications": [{"name": item.get("name") or "Certification", "issuer": item.get("issuer"),
                               "issuedDate": item.get("issued_date"), "expiresDate": item.get("expires_date"),
                               "credentialId": item.get("credential_id")}
                              for item in profile.get("certifications", []) if isinstance(item, dict)],
            "resume": {"filename": row["source_filename"], "parserStatus": "completed",
                       "parserConfidence": float(row["confidence"]) if row["confidence"] is not None else None,
                       "parsedProfile": profile, "rawText": local_text},
            "scoreBreakdown": list(grouped.values()),
            "screening": {"modelName": row["model_name"], "providerName": row["provider_name"],
                          "promptVersion": row["prompt_version"], "privacyMode": row["privacy_mode"],
                          "traceId": row["trace_id"], "isDisqualified": row["is_disqualified"],
                          "disqualifierReasons": row["review_reasons"] or []},
        })
    return data


@router.get("/candidates")
def list_candidates(jobId: UUID | None = None, batchId: UUID | None = None,
                    db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> list[dict]:
    rows = db.execute(text("""SELECT v.result_id FROM current_file_results v
      WHERE v.result_id IS NOT NULL
        AND (CAST(:job AS uuid) IS NULL OR v.job_id=CAST(:job AS uuid))
        AND (CAST(:batch AS uuid) IS NULL OR v.batch_id=CAST(:batch AS uuid))
      ORDER BY v.total_score DESC NULLS LAST,v.result_id"""), {"job": jobId, "batch": batchId}).scalars().all()
    result = [_payload(_row(db, result_id)) for result_id in rows]
    for rank, item in enumerate(result, 1):
        item["rank"] = rank
    return result


class CompareBody(BaseModel):
    resultIds: list[UUID] = Field(min_length=2, max_length=3)


@router.post("/candidates/compare")
def compare_results(body: CompareBody, db: Session = Depends(get_compact_db),
                    hr: dict = Depends(current_hr)) -> list[dict]:
    if len(set(body.resultIds)) != len(body.resultIds):
        raise AppError("INVALID_COMPARISON", "Choose distinct CV results.", status_code=422)
    rows = [_row(db, result_id) for result_id in body.resultIds]
    if len({(row["job_id"], row["rubric_id"], row["scoring_version"]) for row in rows}) != 1:
        raise AppError("INCOMPATIBLE_RESULTS", "Compare results from the same role, rubric and scoring version.", status_code=422)
    return [_payload(row, detail=True) for row in rows]


@router.get("/candidates/{candidateId}")
def get_candidate(candidateId: UUID, jobId: UUID | None = None,
                  db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    row = _row(db, candidateId)
    if jobId and row["job_id"] != jobId:
        raise AppError("CANDIDATE_NOT_FOUND", "CV result does not belong to this role.", status_code=404)
    return _payload(row, detail=True)


@router.get("/candidates/{candidateId}/resume")
def download_cv(candidateId: UUID, request: Request, db: Session = Depends(get_compact_db),
                hr: dict = Depends(current_hr)) -> FileResponse:
    row = _row(db, candidateId)
    if not row["storage_path"]:
        raise AppError("CV_NOT_FOUND", "The original CV is unavailable.", status_code=404)
    source = (PROJECT_ROOT / row["storage_path"]).resolve()
    if not source.is_relative_to((PROJECT_ROOT / "uploads").resolve()) or not source.is_file():
        raise AppError("CV_NOT_FOUND", "The original CV is unavailable.", status_code=404)
    db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id) VALUES (:u,'cv.download','result',:r,:trace)"),
               {"u": hr["id"], "r": candidateId, "trace": request.state.trace_id})
    db.commit()
    return FileResponse(source, filename=Path(row["source_filename"]).name, media_type=row["mime_type"])


@router.post("/candidates/{candidateId}/rescore")
def rescore(candidateId: UUID, request: Request, background_tasks: BackgroundTasks,
            db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    row = _row(db, candidateId)
    background_tasks.add_task(process_file, row["file_id"], hr["id"], request.state.trace_id, True)
    return {"candidateId": str(candidateId), "status": "queued"}
