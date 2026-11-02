"""Repair legacy demo rows that contained invented candidate facts.

This command is idempotent and intentionally does not call an AI provider. It
copies only facts present in the bundled source resumes, then marks scoring as
pending until a live evidence-grounded rescore is requested.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, select

from app.db.models import (
    Application,
    BatchFile,
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateProject,
    CandidateSkill,
    Organization,
    Report,
    Resume,
    ReviewQueueItem,
    ScreeningBatch,
    ScreeningResult,
    Skill,
    SkillCategory,
    User,
)
from app.db.models.common import BatchFileStatus, BatchStatus, ParserStatus, Recommendation
from app.db.session import SessionLocal
from app.features.reports.service import backfill_batch_reports


def repair_grounded_demo() -> None:
    with SessionLocal() as db:
        organization = db.scalar(select(Organization).where(Organization.slug == "talentscreen-demo"))
        if organization is None:
            print("TalentScreen demo organization does not exist; nothing to repair.")
            return
        actor = db.scalar(select(User).where(User.organization_id == organization.id).order_by(User.created_at))
        general = db.scalar(select(SkillCategory).where(SkillCategory.code == "GENERAL"))
        if general is None:
            general = SkillCategory(code="GENERAL", name="General IT", sort_order=99)
            db.add(general)
            db.flush()

        specs = {
            "CAND-JAVA-001": {
                "name": "Candidate CAND-JAVA-001",
                "title": "Jr. Java Developer",
                "years": Decimal("0.5"),
                "skills": ["Java", "JavaScript"],
                "matched": ["Java", "JavaScript"],
                "missing": ["Spring Boot", "JPA / Hibernate", "Microservices", "PostgreSQL"],
                "experience": {"company": "Wab It Softwere Pvt. Ltd.", "title": "Jr. Java Developer", "description": "Jr. Java Developer"},
                "education": {"institution": "Takshshila institute of technology", "degree": "BE", "field": "Electronics & Communication", "start": 2010, "end": 2017},
            },
            "CAND-FRON-001": {
                "name": "Candidate CAND-FRON-001",
                "title": "Web Designer",
                "years": Decimal("2.3"),
                "skills": ["Angular", "HTML5", "CSS3", "SASS", "Bootstrap", "jQuery", "JavaScript", "Photoshop"],
                "matched": ["JavaScript", "HTML5", "CSS3", "Angular", "Bootstrap"],
                "missing": ["React", "TypeScript", "Next.js"],
            },
        }

        for public_id, spec in specs.items():
            candidate = db.scalar(select(Candidate).where(Candidate.organization_id == organization.id, Candidate.public_id == public_id))
            if candidate is None:
                continue
            candidate.full_name = spec["name"]
            candidate.email = None
            candidate.phone = None
            candidate.location = None
            candidate.current_title = spec["title"]
            candidate.total_experience_years = spec["years"]
            candidate.summary = f"Source-grounded dataset profile for {spec['title']}. Live AI scoring is pending."

            resume = db.scalar(select(Resume).where(Resume.candidate_id == candidate.id, Resume.is_primary.is_(True)).order_by(Resume.created_at.desc()))
            if resume:
                resume.parsed_profile = {
                    "candidate": {
                        "full_name": spec["name"],
                        "current_title": spec["title"],
                        "total_experience_years": float(spec["years"]),
                        "location": None,
                    },
                    "skills": [{"name": name, "confidence": 100, "evidence": name} for name in spec["skills"]],
                    "experiences": [],
                    "projects": [],
                    "education": [],
                    "certifications": [],
                }
                resume.parser_status = ParserStatus.COMPLETED
                resume.parser_confidence = Decimal("100")
                resume.parser_version = "dataset-source-v2"

            for model in (CandidateSkill, CandidateExperience, CandidateProject, CandidateEducation, CandidateCertification):
                db.execute(delete(model).where(model.candidate_id == candidate.id))
            db.flush()
            for name in spec["skills"]:
                normalized = " ".join(name.lower().split())
                skill = db.scalar(select(Skill).where(Skill.normalized_name == normalized))
                if skill is None:
                    skill = Skill(category_id=general.id, name=name, normalized_name=normalized)
                    db.add(skill)
                    db.flush()
                db.add(CandidateSkill(candidate_id=candidate.id, skill_id=skill.id, source_resume_id=resume.id if resume else None, confidence=Decimal("100"), evidence={"source": "resume_text"}))
            if spec.get("experience"):
                item = spec["experience"]
                db.add(CandidateExperience(candidate_id=candidate.id, company_name=item["company"], role_title=item["title"], description=item["description"], achievements=[]))
            if spec.get("education"):
                item = spec["education"]
                db.add(CandidateEducation(candidate_id=candidate.id, institution=item["institution"], degree=item["degree"], field_of_study=item["field"], start_year=item["start"], end_year=item["end"]))

            application = db.scalar(select(Application).where(Application.candidate_id == candidate.id).order_by(Application.updated_at.desc()))
            if application:
                application.current_score = None
                application.recommendation = None
                result = db.scalar(select(ScreeningResult).where(ScreeningResult.application_id == application.id).order_by(ScreeningResult.updated_at.desc()))
                if result:
                    result.total_score = Decimal("0")
                    result.recommendation = Recommendation.REVIEW_NEEDED
                    result.confidence = Decimal("100")
                    result.matched_skills = spec["matched"]
                    result.missing_skills = spec["missing"]
                    result.model_name = "pending-live-rescore"
                    result.prompt_version = "v2-grounded"
                    result.trace_id = f"repair-{public_id.lower()}"
                    db.execute(delete(ReviewQueueItem).where(ReviewQueueItem.screening_result_id == result.id))

        batch = db.scalar(select(ScreeningBatch).where(ScreeningBatch.organization_id == organization.id, ScreeningBatch.public_id == "BAT-001"))
        if batch:
            batch.status = BatchStatus.COMPLETED
            batch.total_files = 1
            batch.processed_files = 1
            batch.failed_files = 0
            batch.duplicate_files = 0
            batch.completed_at = batch.completed_at or datetime.now(timezone.utc)
            for batch_file in db.scalars(select(BatchFile).where(BatchFile.batch_id == batch.id)).all():
                batch_file.status = BatchFileStatus.COMPLETED
                batch_file.error_code = None
                batch_file.error_message = None

        report = db.scalar(select(Report).where(Report.organization_id == organization.id, Report.public_id == "RPT-001"))
        if report and batch:
            report.batch_id = batch.id
            report.parameters = {"jobId": "JD-002", "batchId": "BAT-001"}

        backfill_batch_reports(db, organization_id=organization.id, actor=actor)
        db.commit()
        print("Grounded demo repair completed; legacy invented facts were removed.")


if __name__ == "__main__":
    repair_grounded_demo()
