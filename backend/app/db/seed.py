import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from app.core.config import PROJECT_ROOT
from app.core.security import hash_password
from app.db.models import (
    Application,
    AuditLog,
    BatchFile,
    Candidate,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    DisqualifierRule,
    JobOpening,
    JobSkill,
    Organization,
    Permission,
    Report,
    Resume,
    ReviewQueueItem,
    Role,
    RolePermission,
    RubricCriterion,
    ScoringRubric,
    ScreeningBatch,
    ScreeningResult,
    Skill,
    SkillAlias,
    SkillCategory,
    Team,
    User,
    UserPreference,
    UserRole,
)
from app.db.models.common import (
    AuditOutcome,
    BatchFileStatus,
    BatchStatus,
    JobStatus,
    ParserStatus,
    PipelineStage,
    Recommendation,
    ReportStatus,
    RequirementLevel,
    ReviewPriority,
    ReviewStatus,
    RubricStatus,
    UserStatus,
)
from app.db.session import SessionLocal

SEED_PASSWORD = os.environ.get("HR_PASSWORD", "123456")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_skill(value: str) -> str:
    return " ".join(value.strip().lower().split())


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def seed_database() -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        existing = db.scalar(select(Organization).where(Organization.slug == "talentscreen-demo"))
        if existing:
            print("Seed data already exists for talentscreen-demo.")
            return

        organization = Organization(name="TalentScreen AI Demo", slug="talentscreen-demo", timezone="Asia/Bangkok")
        db.add(organization)
        db.flush()

        teams = {
            "GLOBAL_RECRUITING": Team(organization_id=organization.id, code="GLOBAL_RECRUITING", name="Global Recruiting"),
            "ENGINEERING_HIRING": Team(organization_id=organization.id, code="ENGINEERING_HIRING", name="Engineering Hiring"),
        }
        db.add_all(teams.values())
        db.flush()

        permission_descriptions = {
            "jobs.manage": "Create, publish, update, and close job openings.",
            "candidates.read": "View candidate profiles and match analysis.",
            "candidates.pii.reveal": "Reveal protected candidate contact details.",
            "screening.manage": "Upload CV batches and manage screening runs.",
            "reviews.manage": "Resolve manual review queue items.",
            "reports.read": "View and export screening reports.",
            "users.manage": "Manage users, invitations, roles, and permissions.",
            "settings.manage": "Manage screening, AI, taxonomy, and account settings.",
            "audit.read": "View and export immutable audit records.",
        }
        permissions = {code: Permission(code=code, description=description) for code, description in permission_descriptions.items()}
        db.add_all(permissions.values())
        db.flush()

        roles = {
            "admin": Role(organization_id=organization.id, code="admin", name="Administrator", description="Full system administration.", is_system=True),
            "hr_manager": Role(organization_id=organization.id, code="hr_manager", name="HR Manager", description="Owns jobs, screening, reviews, and reports.", is_system=True),
            "hr_reviewer": Role(organization_id=organization.id, code="hr_reviewer", name="HR Reviewer", description="Reviews candidates and manages shortlists.", is_system=True),
            "auditor": Role(organization_id=organization.id, code="auditor", name="Auditor", description="Read-only access to reports and audit records.", is_system=True),
        }
        db.add_all(roles.values())
        db.flush()

        role_permissions = {
            "admin": list(permissions),
            "hr_manager": ["jobs.manage", "candidates.read", "candidates.pii.reveal", "screening.manage", "reviews.manage", "reports.read", "audit.read"],
            "hr_reviewer": ["candidates.read", "reviews.manage", "reports.read"],
            "auditor": ["reports.read", "audit.read"],
        }
        db.add_all(RolePermission(role_id=roles[role_code].id, permission_id=permissions[permission_code].id) for role_code, codes in role_permissions.items() for permission_code in codes)

        admin = User(
            organization_id=organization.id,
            team_id=teams["GLOBAL_RECRUITING"].id,
            public_id="USR-ADMIN-001",
            email=os.environ.get("HR_EMAIL", "huuphuc2812005@gmail.com"),
            full_name="Huu Phuc",
            job_title="Senior HR Manager",
            password_hash=hash_password(SEED_PASSWORD),
            status=UserStatus.ACTIVE,
            is_mfa_enabled=True,
            last_login_at=now,
            last_active_at=now,
        )
        db.add(admin)
        db.flush()
        db.add(UserRole(user_id=admin.id, role_id=roles["admin"].id))
        db.add(UserPreference(user_id=admin.id, timezone="Asia/Bangkok", language="en-US", email_notifications={"batch_completed": True, "review_queue": True, "weekly_digest": False}, browser_notifications={"desktop_alerts": True}))

        rubric_source = load_json(PROJECT_ROOT / "dataset" / "hr_standards" / "standard_it_screening_rubric.json")
        categories: dict[str, SkillCategory] = {}
        skills_by_name: dict[str, Skill] = {}
        for order, (code, names) in enumerate(rubric_source["it_skill_semantic_taxonomy"].items(), start=1):
            category = SkillCategory(code=code.upper(), name=code.replace("_", " "), sort_order=order)
            db.add(category)
            db.flush()
            categories[code] = category
            for skill_name in names:
                normalized = normalize_skill(skill_name)
                if normalized in skills_by_name:
                    db.add(SkillAlias(skill_id=skills_by_name[normalized].id, alias=skill_name, normalized_alias=normalized))
                    continue
                skill = Skill(category_id=category.id, name=skill_name, normalized_name=normalized)
                db.add(skill)
                db.flush()
                skills_by_name[normalized] = skill

        general_category = SkillCategory(code="GENERAL", name="General IT", sort_order=99)
        db.add(general_category)
        db.flush()

        def get_or_create_skill(name: str) -> Skill:
            normalized = normalize_skill(name)
            skill = skills_by_name.get(normalized)
            if skill:
                return skill
            skill = Skill(category_id=general_category.id, name=name, normalized_name=normalized)
            db.add(skill)
            db.flush()
            skills_by_name[normalized] = skill
            return skill

        jobs: dict[str, JobOpening] = {}
        job_files = sorted((PROJECT_ROOT / "dataset" / "sample_job_descriptions").glob("*.json"))
        thresholds = {"strong_recommend": [85, 100], "recommend": [70, 84], "review_needed": [50, 69], "reject": [0, 49]}
        for job_file in job_files:
            source = load_json(job_file)
            job = JobOpening(
                organization_id=organization.id,
                team_id=teams["ENGINEERING_HIRING"].id,
                public_id=source["job_id"],
                title=source["title"],
                department=source["department"],
                employment_type="Full-time",
                location="Ho Chi Minh City",
                work_mode="Hybrid",
                description=source["description"],
                min_experience_years=Decimal(str(source["experience_required_years"])),
                minimum_education=source["education"],
                status=JobStatus.ACTIVE,
                published_at=now,
                created_by_id=admin.id,
                updated_by_id=admin.id,
            )
            db.add(job)
            db.flush()
            jobs[source["job_id"]] = job

            for name in source["must_have_skills"]:
                db.add(JobSkill(job_id=job.id, skill_id=get_or_create_skill(name).id, requirement_level=RequirementLevel.MUST_HAVE, weight=Decimal("1")))
            for name in source["nice_to_have_skills"]:
                skill = get_or_create_skill(name)
                if not db.scalar(select(JobSkill).where(JobSkill.job_id == job.id, JobSkill.skill_id == skill.id)):
                    db.add(JobSkill(job_id=job.id, skill_id=skill.id, requirement_level=RequirementLevel.NICE_TO_HAVE, weight=Decimal("0.5")))

            rubric = ScoringRubric(job_id=job.id, name=f"{source['title']} Standard Rubric", version=1, status=RubricStatus.ACTIVE, total_weight=100, thresholds=thresholds, is_standard=True, created_by_id=admin.id)
            db.add(rubric)
            db.flush()
            sort_order = 1
            for pillar in rubric_source["evaluation_pillars"]:
                for criterion_index, criterion in enumerate(pillar["sub_criteria"], start=1):
                    db.add(RubricCriterion(rubric_id=rubric.id, pillar_code=pillar["pillar_id"], pillar_name=pillar["name"], criterion_code=f"{pillar['pillar_id']}_{criterion_index}", criterion_name=criterion["name"], description=criterion["rule"], weight=Decimal(str(criterion["weight"])), sort_order=sort_order))
                    sort_order += 1
            for rule_type, label in (("missing_must_have", "Missing must-have skills"), ("insufficient_experience", "Insufficient relevant experience"), ("missing_certification", "Missing mandatory certification")):
                db.add(DisqualifierRule(rubric_id=rubric.id, rule_type=rule_type, label=label, is_enabled=rule_type != "missing_certification", configuration={}))

        if os.environ.get("SEED_DEMO_CANDIDATES", "true").lower() == "false":
            db.commit()
            print("HR account, taxonomy and target roles initialized.")
            return

        java_job = jobs["JD-002"]
        react_job = jobs["JD-001"]
        candidate_specs = [
            ("CAND-JAVA-001", "Candidate CAND-JAVA-001", None, "Jr. Java Developer", Decimal("0.5"), java_job, None, None, PipelineStage.HR_REVIEW),
            ("CAND-FRON-001", "Candidate CAND-FRON-001", None, "Web Designer", Decimal("2.3"), react_job, None, None, PipelineStage.HR_REVIEW),
        ]
        applications: list[Application] = []
        for public_id, name, email, title, years, job, score, recommendation, stage in candidate_specs:
            candidate = Candidate(organization_id=organization.id, public_id=public_id, full_name=name, email=email, location=None, current_title=title, total_experience_years=years, summary=f"Dataset candidate profile grounded in the source resume for {title}.", source="dataset", pii_masked=True)
            db.add(candidate)
            db.flush()
            category_folder = "Java_Developer" if public_id.startswith("CAND-JAVA") else "Frontend_Web_Developer"
            resume_path = PROJECT_ROOT / "dataset" / "it_resumes_txt" / category_folder / f"{public_id}.txt"
            resume = Resume(organization_id=organization.id, candidate_id=candidate.id, original_filename=f"{public_id}.txt", storage_path=str(resume_path.relative_to(PROJECT_ROOT)), mime_type="text/plain", file_size_bytes=resume_path.stat().st_size, sha256=file_sha256(resume_path), raw_text=None, parsed_profile={"candidate": {"full_name": name, "current_title": title, "total_experience_years": float(years), "location": None}}, parser_status=ParserStatus.COMPLETED, parser_confidence=Decimal("100.0"), parser_version="dataset-source-v2", is_primary=True, uploaded_by_id=admin.id)
            db.add(resume)
            db.flush()
            application = Application(organization_id=organization.id, job_id=job.id, candidate_id=candidate.id, resume_id=resume.id, source="dataset", status="active", pipeline_stage=stage, current_score=score, recommendation=recommendation, rank=1, applied_at=now)
            db.add(application)
            db.flush()
            applications.append(application)
            named_skills = ["Java", "JavaScript"] if public_id.startswith("CAND-JAVA") else ["Angular", "HTML5", "CSS3", "SASS", "Bootstrap", "jQuery", "JavaScript", "Photoshop"]
            for skill_name in named_skills:
                db.add(CandidateSkill(candidate_id=candidate.id, skill_id=get_or_create_skill(skill_name).id, source_resume_id=resume.id, years_experience=None, confidence=Decimal("100.0"), evidence={"source": "resume_text"}))
            if public_id.startswith("CAND-JAVA"):
                db.add(CandidateExperience(candidate_id=candidate.id, company_name="Wab It Softwere Pvt. Ltd.", role_title="Jr. Java Developer", description="Jr. Java Developer", achievements=[]))
                db.add(CandidateEducation(candidate_id=candidate.id, institution="Takshshila institute of technology", degree="BE", field_of_study="Electronics & Communication", start_year=2010, end_year=2017))

        batch = ScreeningBatch(organization_id=organization.id, job_id=java_job.id, public_id="BAT-001", name="Java Backend September Intake", status=BatchStatus.COMPLETED, total_files=1, processed_files=1, failed_files=0, duplicate_files=0, created_by_id=admin.id, started_at=now - timedelta(minutes=18), completed_at=now - timedelta(minutes=16))
        db.add(batch)
        db.flush()
        java_resume = db.scalar(select(Resume).join(Candidate).where(Candidate.public_id == "CAND-JAVA-001"))
        batch_file = BatchFile(batch_id=batch.id, resume_id=java_resume.id, original_filename=java_resume.original_filename, storage_path=java_resume.storage_path, mime_type=java_resume.mime_type, file_size_bytes=java_resume.file_size_bytes, sha256=java_resume.sha256, status=BatchFileStatus.COMPLETED, attempt_count=1, processing_started_at=now - timedelta(minutes=17), processing_completed_at=now - timedelta(minutes=16))
        db.add(batch_file)
        db.flush()

        for application in applications:
            rubric = db.scalar(select(ScoringRubric).where(ScoringRubric.job_id == application.job_id, ScoringRubric.status == RubricStatus.ACTIVE))
            result = ScreeningResult(application_id=application.id, rubric_id=rubric.id, batch_file_id=batch_file.id if application.job_id == java_job.id else None, total_score=Decimal("0"), recommendation=Recommendation.REVIEW_NEEDED, confidence=Decimal("100.0"), is_disqualified=False, matched_skills=["Java", "JavaScript"] if application.job_id == java_job.id else ["JavaScript", "HTML5", "CSS3", "Angular", "Bootstrap"], missing_skills=["Spring Boot", "JPA / Hibernate", "Microservices", "PostgreSQL"] if application.job_id == java_job.id else ["React", "TypeScript", "Next.js"], model_name="pending-live-rescore", prompt_version="v2-grounded", trace_id=f"seed-{application.id}")
            db.add(result)
            db.flush()
            if application.job_id == react_job.id:
                db.add(ReviewQueueItem(application_id=application.id, screening_result_id=result.id, reason_code="LOW_CONFIDENCE_EVIDENCE", reason="Low confidence in project evidence extraction", priority=ReviewPriority.HIGH, status=ReviewStatus.PENDING, assigned_to_id=admin.id, due_at=now + timedelta(days=1)))

        db.add(Report(organization_id=organization.id, public_id="RPT-001", title="Java Backend Engineer Screening Summary", report_type="screening_summary", job_id=java_job.id, batch_id=batch.id, status=ReportStatus.COMPLETED, parameters={"jobId": "JD-002", "batchId": "BAT-001"}, summary={"candidateCount": 1, "averageScore": 0, "strongMatches": 0}, generated_by_id=admin.id, completed_at=now))
        db.add(AuditLog(organization_id=organization.id, actor_user_id=admin.id, actor_identity=admin.email, actor_role="Administrator", action="database.seed", resource_type="System", resource_id="initial-seed", outcome=AuditOutcome.SUCCESS, ip_address="127.0.0.1", user_agent="TalentScreen seed command", trace_id="seed-initial-001", correlation_id="seed-2026", changes={"created": ["organization", "roles", "skills", "jobs", "candidates", "batch"]}, metadata_json={"source": "dataset"}, integrity_hash=hashlib.sha256(b"seed-initial-001").hexdigest(), created_at=now, retention_until=now + timedelta(days=365 * 7)))

        db.commit()
        print("Seed completed.")


if __name__ == "__main__":
    seed_database()
