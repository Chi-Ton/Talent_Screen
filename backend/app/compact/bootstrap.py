"""Initialize the one-HR catalog; legacy screening history stays in the backup."""

import json
import os
from decimal import Decimal

from sqlalchemy import text

from app.compact.db import activate_schema
from app.core.security import hash_password
from app.db.session import SessionLocal


PILLARS = {
    "P1_TECH_SKILLS": "skills", "technicalSkills": "skills",
    "P2_EXPERIENCE": "experience", "experience": "experience",
    "P3_PROJECTS": "projects", "projects": "projects",
    "P4_SYSTEMS_CLOUD": "systems", "systemsCloud": "systems",
    "P5_EDUCATION_CERTS": "education", "educationCertifications": "education",
}


def _threshold(value: object, default: int) -> int:
    if isinstance(value, list) and value:
        return int(value[0])
    return int(value) if isinstance(value, (int, float)) else default


def bootstrap() -> dict:
    email = os.getenv("HR_EMAIL", "huuphuc2812005@gmail.com")
    with SessionLocal() as db:
        activate_schema(db)
        user = db.execute(text("SELECT id FROM users WHERE singleton=true FOR UPDATE")).first()
        if user:
            return {"operator": "existing", "rolesImported": 0}

        legacy_exists = db.scalar(text("SELECT to_regclass('public.users') IS NOT NULL"))
        legacy_user = None
        if legacy_exists:
            legacy_user = db.execute(text("""SELECT id,email,full_name,password_hash,created_at
              FROM public.users WHERE lower(email)=lower(:email) AND status='active'"""), {"email": email}).mappings().first()
        if legacy_exists and legacy_user is None and db.scalar(text("SELECT count(*) FROM public.users")):
            raise RuntimeError("Selected HR operator is absent from the legacy database")

        if legacy_user:
            user_id = db.execute(text("""INSERT INTO users(id,email,full_name,password_hash,created_at)
              VALUES (:id,:email,:name,:hash,:created) RETURNING id"""),
              {"id": legacy_user["id"], "email": legacy_user["email"],
               "name": legacy_user["full_name"], "hash": legacy_user["password_hash"],
               "created": legacy_user["created_at"]}).scalar_one()
        else:
            password = os.getenv("HR_PASSWORD")
            if not password:
                raise RuntimeError("Set HR_EMAIL and HR_PASSWORD to initialize a fresh database")
            user_id = db.execute(text("""INSERT INTO users(email,full_name,password_hash)
              VALUES (:email,:name,:hash) RETURNING id"""),
              {"email": email, "name": os.getenv("HR_NAME", "HR Operator"),
               "hash": hash_password(password)}).scalar_one()

        imported = 0
        if legacy_user:
            jobs = db.execute(text("""SELECT j.* FROM public.job_openings j
              WHERE j.created_by_id=:user ORDER BY j.created_at,j.id"""), {"user": user_id}).mappings().all()
            for job in jobs:
                rubric = db.execute(text("""SELECT * FROM public.scoring_rubrics
                  WHERE job_id=:job ORDER BY version DESC LIMIT 1"""), {"job": job["id"]}).mappings().first()
                if rubric is None:
                    continue
                rows = db.execute(text("""SELECT pillar_code,pillar_name,criterion_code,
                  criterion_name,weight FROM public.rubric_criteria WHERE rubric_id=:rubric
                  ORDER BY sort_order,id"""), {"rubric": rubric["id"]}).mappings().all()
                if not rows or sum(Decimal(row["weight"]) for row in rows) != Decimal(100):
                    raise RuntimeError("Legacy rubric weights are invalid")
                criteria = []
                for row in rows:
                    pillar = PILLARS.get(row["pillar_code"])
                    if pillar is None:
                        raise RuntimeError("Legacy rubric pillar has no compact mapping")
                    criteria.append({"code": row["criterion_code"], "name": row["criterion_name"],
                                     "pillar": pillar, "weight": float(row["weight"])})
                skills = db.execute(text("""SELECT s.name,js.requirement_level
                  FROM public.job_skills js JOIN public.skills s ON s.id=js.skill_id
                  WHERE js.job_id=:job ORDER BY js.id"""), {"job": job["id"]}).mappings().all()
                rules = db.execute(text("""SELECT rule_type,is_enabled,label FROM public.disqualifier_rules
                  WHERE rubric_id=:rubric ORDER BY id"""), {"rubric": rubric["id"]}).mappings().all()
                old_thresholds = rubric["thresholds"] or {}
                config = {"schemaVersion": "rubric-v2",
                          "targetRole": {"title": job["title"], "description": job["description"] or "",
                                         "minimum_experience_years": float(job["min_experience_years"]) if job["min_experience_years"] is not None else None},
                          "jobSkills": [{"name": skill["name"], "requirement_level": skill["requirement_level"]} for skill in skills],
                          "criteria": criteria,
                          "thresholds": {"review_needed": _threshold(old_thresholds.get("review_needed"), 50),
                                         "recommend": _threshold(old_thresholds.get("recommend"), 70),
                                         "strong_recommend": _threshold(old_thresholds.get("strong_recommend"), 85)},
                          "disqualifiers": [{"type": rule["rule_type"], "enabled": rule["is_enabled"], "label": rule["label"]} for rule in rules]}
                status = "active" if job["status"] == "active" else "archived" if job["status"] == "closed" else "draft"
                db.execute(text("""INSERT INTO job_openings(id,title,description,status,created_by_id,created_at)
                  VALUES (:id,:title,:description,:status,:user,:created)"""),
                  {"id": job["id"], "title": job["title"], "description": job["description"] or "",
                   "status": status, "user": user_id, "created": job["created_at"]})
                db.execute(text("""INSERT INTO scoring_rubrics(id,job_id,version,config,created_at)
                  VALUES (:id,:job,:version,CAST(:config AS jsonb),:created)"""),
                  {"id": rubric["id"], "job": job["id"], "version": rubric["version"],
                   "config": json.dumps(config), "created": rubric["created_at"]})
                imported += 1
        db.commit()
    return {"operator": "initialized", "rolesImported": imported}


if __name__ == "__main__":
    print(json.dumps(bootstrap()))
