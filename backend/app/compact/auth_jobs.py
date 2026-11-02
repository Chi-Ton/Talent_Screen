import json
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.compact.db import activate_schema, current_hr, get_compact_db
from app.core.errors import AppError
from app.core.security import create_access_token, verify_password


router = APIRouter()


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class Weights(BaseModel):
    technicalSkills: int = Field(default=40, ge=0, le=100)
    experience: int = Field(default=25, ge=0, le=100)
    projects: int = Field(default=15, ge=0, le=100)
    systemsCloud: int = Field(default=10, ge=0, le=100)
    educationCertifications: int = Field(default=10, ge=0, le=100)


class JobBody(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=20)
    department: str | None = None
    mustHaveSkills: list[str] = Field(default_factory=list)
    niceToHaveSkills: list[str] = Field(default_factory=list)
    minimumExperienceYears: float | None = Field(default=None, ge=0, le=50)
    scoringWeights: Weights = Field(default_factory=Weights)


def job_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]), "title": row["title"], "description": row["description"],
        "department": "Recruitment", "status": row["status"], "ownerName": row.get("full_name"),
        "createdAt": row["created_at"].isoformat(), "candidateCount": int(row.get("candidate_count") or 0),
        "strongMatches": int(row.get("strong_matches") or 0), "averageScore": float(row.get("average_score") or 0),
        "minimumExperienceYears": (row.get("config") or {}).get("targetRole", {}).get("minimum_experience_years"),
    }


@router.post("/auth/login")
def login(body: LoginBody, db: Session = Depends(get_compact_db)) -> dict:
    row = db.execute(text("SELECT id,email,full_name,password_hash,token_version,disabled_at FROM users WHERE lower(email)=lower(:email)"), {"email": str(body.email)}).mappings().first()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", status_code=401)
    if row["disabled_at"]:
        raise AppError("ACCOUNT_UNAVAILABLE", "This account is disabled.", status_code=403)
    token = create_access_token(str(row["id"]), {"tv": row["token_version"]})
    return {"accessToken": token, "tokenType": "bearer", "user": {"id": str(row["id"]), "name": row["full_name"], "email": row["email"], "role": "admin", "roles": ["admin"]}}


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> list[dict]:
    rows = db.execute(text("""SELECT j.*, u.full_name, r.config,
        (SELECT count(*) FROM current_file_results f WHERE f.job_id=j.id AND f.result_id IS NOT NULL) candidate_count,
        (SELECT count(*) FROM current_file_results f WHERE f.job_id=j.id AND f.recommendation='strong_recommend') strong_matches,
        (SELECT avg(total_score) FROM current_file_results f WHERE f.job_id=j.id) average_score
      FROM job_openings j JOIN users u ON u.id=j.created_by_id
      LEFT JOIN LATERAL (SELECT config FROM scoring_rubrics WHERE job_id=j.id ORDER BY version DESC LIMIT 1) r ON true
      ORDER BY j.created_at DESC""")).mappings().all()
    return [job_payload(dict(row)) for row in rows]


@router.get("/jobs/{jobId}")
def get_job(jobId: UUID, db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    row = db.execute(text("""SELECT j.*, u.full_name, r.config FROM job_openings j JOIN users u ON u.id=j.created_by_id
      LEFT JOIN LATERAL (SELECT config FROM scoring_rubrics WHERE job_id=j.id ORDER BY version DESC LIMIT 1) r ON true WHERE j.id=:id"""), {"id": jobId}).mappings().first()
    if not row:
        raise AppError("JOB_NOT_FOUND", "Target role was not found.", status_code=404)
    return job_payload(dict(row))


@router.post("/jobs", status_code=201)
def create_job(body: JobBody, request: Request, db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    weights = body.scoringWeights
    weight_map = [("skills", weights.technicalSkills), ("experience", weights.experience),
                  ("projects", weights.projects), ("systems", weights.systemsCloud),
                  ("education", weights.educationCertifications)]
    if sum(weight for _, weight in weight_map) != 100:
        raise AppError("INVALID_RUBRIC", "Scoring weights must total 100%.", status_code=422)
    job_skills = [{"name": name.strip(), "requirement_level": level} for level, names in
                  (("must_have", body.mustHaveSkills), ("nice_to_have", body.niceToHaveSkills))
                  for name in names if name.strip()]
    config = {
        "schemaVersion": "rubric-v2",
        "targetRole": {"title": body.title.strip(), "description": body.description.strip(), "minimum_experience_years": body.minimumExperienceYears},
        "jobSkills": job_skills,
        "criteria": [{"code": pillar, "name": pillar.title(), "pillar": pillar, "weight": weight} for pillar, weight in weight_map],
        "thresholds": {"review_needed": 50, "recommend": 70, "strong_recommend": 85},
        "disqualifiers": [],
    }
    job_id = db.execute(text("INSERT INTO job_openings(title,description,created_by_id) VALUES (:t,:d,:u) RETURNING id"),
                        {"t": body.title.strip(), "d": body.description.strip(), "u": hr["id"]}).scalar_one()
    db.execute(text("INSERT INTO scoring_rubrics(job_id,version,config) VALUES (:j,1,CAST(:c AS jsonb))"), {"j": job_id, "c": json.dumps(config)})
    db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id) VALUES (:u,'job.create','job',:j,:trace)"), {"u": hr["id"], "j": job_id, "trace": request.state.trace_id})
    db.commit()
    activate_schema(db)
    return get_job(job_id, db, hr)


@router.post("/jobs/{jobId}/publish")
def publish_job(jobId: UUID, request: Request, db: Session = Depends(get_compact_db), hr: dict = Depends(current_hr)) -> dict:
    changed = db.execute(text("UPDATE job_openings SET status='active' WHERE id=:id RETURNING id"), {"id": jobId}).first()
    if not changed:
        raise AppError("JOB_NOT_FOUND", "Target role was not found.", status_code=404)
    db.execute(text("INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,trace_id) VALUES (:u,'job.publish','job',:j,:trace)"), {"u": hr["id"], "j": jobId, "trace": request.state.trace_id})
    db.commit()
    activate_schema(db)
    return get_job(jobId, db, hr)
