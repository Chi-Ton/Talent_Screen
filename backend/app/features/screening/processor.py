import logging
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT, get_settings
from app.db.models import (
    Application, BatchFile, Candidate, CandidateCertification, CandidateEducation,
    CandidateExperience, CandidateProject, CandidateSkill, DisqualifierRule, JobOpening, JobSkill,
    Resume, ReviewQueueItem, RubricCriterion, ScoreBreakdown, ScoringRubric,
    ScreeningBatch, ScreeningDocument, ScreeningResult, Skill, SkillCategory, User,
)
from app.db.models.common import (
    BatchFileStatus, BatchStatus, ParserStatus, Recommendation, ReviewPriority,
    ReviewStatus, RubricStatus,
)
from app.db.session import SessionLocal
from app.features.admin.service import append_audit_log
from app.features.screening.document_read_model import upsert_screening_document
from app.features.screening.privacy import redact_resume_for_remote_ai
from app.features.screening.scoring import compute_deterministic_score
from app.services.ai.prompts import SYSTEM_PROMPT, build_screening_document_prompt
from app.services.ai.router_client import AIClientError, RouterClient

logger = logging.getLogger("talentscreen.screening")


class ProcessingFailure(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _value(data: dict, *keys: str, default=None):
    for key in keys:
        if key in data:
            return data[key]
    return default


def _decimal(value, default: Decimal | None = None) -> Decimal | None:
    try:
        return Decimal(str(value)) if value is not None else default
    except (ArithmeticError, TypeError, ValueError):
        return default


def _bounded_decimal(value, default: Decimal = Decimal("0")) -> Decimal:
    number = _decimal(value, default) or default
    return max(Decimal("0"), min(Decimal("100"), number))


def _date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _normalise(value: str) -> str:
    return " ".join(value.lower().strip().split())


def _recommendation(value, score: Decimal) -> Recommendation:
    normalized = _normalise(str(value or "")).replace("-", "_").replace(" ", "_")
    try:
        return Recommendation(normalized)
    except ValueError:
        if score >= 85:
            return Recommendation.STRONG_RECOMMEND
        if score >= 70:
            return Recommendation.RECOMMEND
        if score >= 50:
            return Recommendation.REVIEW_NEEDED
        return Recommendation.REJECT


def _extract_text(path: Path, extension: str) -> str:
    if extension == ".txt":
        return path.read_text(encoding="utf-8", errors="replace").strip()
    if extension == ".pdf":
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages).strip()
    if extension == ".docx":
        from docx import Document
        return "\n".join(paragraph.text for paragraph in Document(str(path)).paragraphs).strip()
    raise ProcessingFailure("UNSUPPORTED_CV_FORMAT", "Legacy .doc files are stored but cannot be text-extracted by this worker. Convert the file to PDF or DOCX and retry.")


def _validate_resume_length(resume_text: str, limit: int) -> None:
    if len(resume_text) > limit:
        raise ProcessingFailure(
            "RESUME_TEXT_TOO_LONG",
            "The CV exceeds the configured text limit. Increase AI_MAX_RESUME_CHARS within supported limits and retry; no partial evaluation was performed.",
        )


def _job_context(db: Session, job: JobOpening, rubric: ScoringRubric) -> tuple[dict, list[dict], list[dict]]:
    job_skills = db.execute(select(JobSkill, Skill).join(Skill, Skill.id == JobSkill.skill_id).where(JobSkill.job_id == job.id)).all()
    criteria = db.scalars(select(RubricCriterion).where(RubricCriterion.rubric_id == rubric.id).order_by(RubricCriterion.sort_order)).all()
    return (
        {"id": job.public_id, "title": job.title, "department": job.department, "description": job.description, "minimum_experience_years": float(job.min_experience_years) if job.min_experience_years is not None else None, "minimum_education": job.minimum_education},
        [{"name": skill.name, "requirement_level": job_skill.requirement_level.value, "minimum_years": float(job_skill.minimum_years) if job_skill.minimum_years is not None else None, "weight": float(job_skill.weight)} for job_skill, skill in job_skills],
        [{"code": criterion.criterion_code, "name": criterion.criterion_name, "pillar": criterion.pillar_name, "weight": float(criterion.weight), "description": criterion.description} for criterion in criteria],
    )


def _get_rubric(db: Session, job_id: UUID) -> ScoringRubric:
    rubric = db.scalar(select(ScoringRubric).where(ScoringRubric.job_id == job_id, ScoringRubric.status != RubricStatus.ARCHIVED).order_by(ScoringRubric.version.desc()))
    if rubric is None:
        raise ProcessingFailure("RUBRIC_NOT_FOUND", "The job does not have an active scoring rubric.")
    return rubric


def _candidate_number(db: Session, organization_id: UUID) -> str:
    count = db.scalar(select(func.count()).select_from(Candidate).where(Candidate.organization_id == organization_id)) or 0
    public_id = f"CAN-{count + 1:04d}"
    while db.scalar(select(Candidate.id).where(Candidate.organization_id == organization_id, Candidate.public_id == public_id)):
        count += 1
        public_id = f"CAN-{count + 1:04d}"
    return public_id


def _upsert_candidate(db: Session, *, organization_id: UUID, resume: Resume, candidate_data: dict, replace_existing: bool = False) -> tuple[Candidate, bool]:
    email = _value(candidate_data, "email")
    candidate = db.get(Candidate, resume.candidate_id) if resume.candidate_id else None
    if candidate is None and email:
        candidate = db.scalar(select(Candidate).where(Candidate.organization_id == organization_id, func.lower(Candidate.email) == str(email).lower()))
    is_new = candidate is None
    if candidate is None:
        candidate = Candidate(organization_id=organization_id, public_id=_candidate_number(db, organization_id), full_name=str(_value(candidate_data, "full_name", "fullName", default=Path(resume.original_filename).stem))[:180], source="batch_upload", pii_masked=True)
        db.add(candidate)
        db.flush()
    candidate.full_name = str(_value(candidate_data, "full_name", "fullName", default=candidate.full_name) or candidate.full_name)[:180]
    candidate.email = str(email)[:254] if email else None if replace_existing else candidate.email
    for field, keys, limit in (("phone", ("phone",), 50), ("location", ("location",), 160), ("current_title", ("current_title", "currentTitle"), 180), ("linkedin_url", ("linkedin_url", "linkedinUrl"), 500), ("github_url", ("github_url", "githubUrl"), 500)):
        value = _value(candidate_data, *keys)
        if value:
            setattr(candidate, field, str(value)[:limit])
        elif replace_existing:
            setattr(candidate, field, None)
    candidate.total_experience_years = _decimal(
        _value(candidate_data, "total_experience_years", "totalExperienceYears"),
        None if replace_existing else candidate.total_experience_years,
    )
    if _value(candidate_data, "summary"):
        candidate.summary = str(_value(candidate_data, "summary"))[:4000]
    elif replace_existing:
        candidate.summary = None
    resume.candidate_id = candidate.id
    return candidate, is_new


def _clear_candidate_profile(db: Session, candidate_id: UUID) -> None:
    for model in (CandidateSkill, CandidateExperience, CandidateProject, CandidateEducation, CandidateCertification):
        db.execute(delete(model).where(model.candidate_id == candidate_id))


def _remove_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "d")
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _grounding_text(value: object) -> str:
    normalized = unicodedata.normalize("NFC", str(value or "").lower())
    return " ".join(re.sub(r"[^\w+#.]+", " ", normalized, flags=re.UNICODE).split())


def _has_text_evidence(resume_text: str, value: object) -> bool:
    needle = _grounding_text(value)
    if len(needle) < 2:
        return False
    haystack = _grounding_text(resume_text)
    # 1. Exact match with unicode letters and symbols
    if re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack, flags=re.UNICODE) is not None:
        return True
    # 2. Match without accents for robust bilingual/unaccented variations
    needle_no_accent = _remove_accents(needle)
    haystack_no_accent = _remove_accents(haystack)
    return re.search(rf"(?<!\w){re.escape(needle_no_accent)}(?!\w)", haystack_no_accent, flags=re.UNICODE) is not None


def _explicit_experience_years(resume_text: str) -> float | None:
    raw_lower = resume_text.lower()
    unaccented = _remove_accents(raw_lower)
    patterns = (
        # English patterns
        (r"(?:experience|exprience|experiance)\s*(?:-|:|of)?\s*(\d+(?:\.\d+)?)\s*(?:months?|mos?)", 1 / 12),
        (r"(?:experience|exprience|experiance)\s*(?:-|:|of)?\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)", 1),
        (r"(\d+(?:\.\d+)?)\s*(?:months?|mos?)\s*(?:of\s*)?(?:experience|exprience|experiance)", 1 / 12),
        (r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exprience|experiance)", 1),
        # Vietnamese patterns (unaccented: kinh nghiem, nam, thang)
        (r"(?:kinh\s*nghiem)\s*(?:lam\s*viec)?\s*(?:-|:)?\s*(\d+(?:\.\d+)?)\s*(?:thang)", 1 / 12),
        (r"(?:kinh\s*nghiem)\s*(?:lam\s*viec)?\s*(?:-|:)?\s*(\d+(?:\.\d+)?)\s*(?:nam)", 1),
        (r"(\d+(?:\.\d+)?)\s*(?:thang)\s*(?:kinh\s*nghiem)", 1 / 12),
        (r"(\d+(?:\.\d+)?)\s*(?:nam)\s*(?:kinh\s*nghiem)", 1),
    )
    durations = [
        float(match.group(1)) * multiplier
        for pattern, multiplier in patterns
        for match in re.finditer(pattern, unaccented, flags=re.IGNORECASE)
    ]
    return round(max(durations), 1) if durations else None


def _has_current_location_evidence(resume_text: str, location: object) -> bool:
    location_text = _grounding_text(location)
    if not location_text:
        return False
    normalized = _grounding_text(resume_text)
    cues = (
        "current location", "location", "address", "based in", "residing in", "residence",
        "noi o hien tai", "hien tai o", "sinh song tai", "dia chi", "khu vuc", "thuong tru", "tam tru",
    )
    # Check with original normalized string
    if any(re.search(rf"{re.escape(cue)}\s*(?:-|:)?\s*.{{0,80}}{re.escape(location_text)}", normalized) for cue in cues):
        return True
    # Check unaccented strings
    norm_no_acc = _remove_accents(normalized)
    loc_no_acc = _remove_accents(location_text)
    return any(re.search(rf"{re.escape(cue)}\s*(?:-|:)?\s*.{{0,80}}{re.escape(loc_no_acc)}", norm_no_acc) for cue in cues)


def _ground_ai_output(parsed: dict, *, resume_text: str, job_skills: list[dict], criteria: list[dict], known_skills: list[str] | None = None) -> dict:
    candidate = parsed.get("candidate") if isinstance(parsed.get("candidate"), dict) else {}
    for key in ("full_name", "current_title"):
        if candidate.get(key) and not _has_text_evidence(resume_text, candidate[key]):
            candidate[key] = None
    if candidate.get("location") and not _has_current_location_evidence(resume_text, candidate["location"]):
        candidate["location"] = None
    explicit_experience = _explicit_experience_years(resume_text)
    if explicit_experience is not None:
        candidate["total_experience_years"] = explicit_experience
    elif candidate.get("total_experience_years") is not None:
        candidate["total_experience_years"] = None
    parsed["candidate"] = candidate

    parsed["skills"] = [
        item for item in parsed.get("skills", [])
        if isinstance(item, dict) and item.get("name") and _has_text_evidence(resume_text, item["name"])
    ]
    detected_skill_names = {_grounding_text(item["name"]) for item in parsed["skills"]}
    for name in known_skills or []:
        normalized_name = _grounding_text(name)
        if normalized_name not in detected_skill_names and _has_text_evidence(resume_text, name):
            parsed["skills"].append({"name": name, "years_experience": None, "proficiency": None, "confidence": 100, "evidence": name})
            detected_skill_names.add(normalized_name)
    parsed["experiences"] = [
        item for item in parsed.get("experiences", [])
        if isinstance(item, dict)
        and _has_text_evidence(resume_text, _value(item, "company_name", "companyName"))
        and _has_text_evidence(resume_text, _value(item, "role_title", "roleTitle"))
    ]
    parsed["projects"] = [item for item in parsed.get("projects", []) if isinstance(item, dict) and _has_text_evidence(resume_text, item.get("name"))]
    parsed["education"] = [item for item in parsed.get("education", []) if isinstance(item, dict) and _has_text_evidence(resume_text, item.get("institution"))]
    parsed["certifications"] = [item for item in parsed.get("certifications", []) if isinstance(item, dict) and _has_text_evidence(resume_text, item.get("name"))]

    score = parsed.get("score") if isinstance(parsed.get("score"), dict) else {}
    grounded_skills = {_grounding_text(item["name"]): item["name"] for item in parsed["skills"]}
    configured_skills = {_grounding_text(item.get("name")): item.get("name") for item in job_skills if item.get("name")}
    score["matched_skills"] = [
        configured_skills[key] for key in configured_skills if key in grounded_skills
    ]
    score["missing_skills"] = [
        configured_skills[key] for key in configured_skills if key not in grounded_skills
    ]
    known_criteria = {item["code"] for item in criteria}
    grounded_criteria = []
    for item in _value(score, "criteria", default=[]):
        if not isinstance(item, dict) or _value(item, "criterion_code", "criterionCode") not in known_criteria:
            continue
        evidence = [
            str(value) for value in _value(item, "evidence", default=[])
            if _has_text_evidence(resume_text, value)
        ]
        item["evidence"] = evidence
        if not evidence:
            item["earned_score"] = 0
            item["explanation"] = "No directly grounded resume evidence was found for this criterion."
        grounded_criteria.append(item)
    score["criteria"] = grounded_criteria
    parsed["score"] = score
    return parsed


def _persist_profile(db: Session, *, candidate: Candidate, resume: Resume, parsed: dict) -> None:
    for item in parsed.get("skills", []):
        if not isinstance(item, dict) or not str(_value(item, "name", default="")).strip():
            continue
        name = str(_value(item, "name")).strip()[:120]
        normalized = _normalise(name)
        skill = db.scalar(select(Skill).where(Skill.normalized_name == normalized))
        if skill is None:
            category = db.scalar(select(SkillCategory).where(SkillCategory.code == "GENERAL"))
            if category is None:
                category = SkillCategory(code="GENERAL", name="General IT", sort_order=99)
                db.add(category)
                db.flush()
            skill = Skill(category_id=category.id, name=name, normalized_name=normalized)
            db.add(skill)
            db.flush()
        if db.scalar(select(CandidateSkill).where(CandidateSkill.candidate_id == candidate.id, CandidateSkill.skill_id == skill.id)) is None:
            db.add(CandidateSkill(candidate_id=candidate.id, skill_id=skill.id, source_resume_id=resume.id, years_experience=_decimal(_value(item, "years_experience", "yearsExperience")), proficiency=_value(item, "proficiency"), confidence=_bounded_decimal(_value(item, "confidence", default=70)), evidence={"text": _value(item, "evidence", default="")}))
    for item in parsed.get("experiences", []):
        if isinstance(item, dict) and _value(item, "company_name", "companyName") and _value(item, "role_title", "roleTitle"):
            db.add(CandidateExperience(candidate_id=candidate.id, company_name=str(_value(item, "company_name", "companyName"))[:180], role_title=str(_value(item, "role_title", "roleTitle"))[:180], location=_value(item, "location"), start_date=_date(_value(item, "start_date", "startDate")), end_date=_date(_value(item, "end_date", "endDate")), is_current=bool(_value(item, "is_current", "isCurrent", default=False)), description=_value(item, "description"), achievements=_value(item, "achievements", default=[])))
    for item in parsed.get("projects", []):
        if isinstance(item, dict) and _value(item, "name"):
            db.add(CandidateProject(candidate_id=candidate.id, name=str(_value(item, "name"))[:200], role=_value(item, "role"), description=_value(item, "description"), technologies=_value(item, "technologies", default=[]), achievements=_value(item, "achievements", default=[]), project_url=_value(item, "project_url", "projectUrl")))
    for item in parsed.get("education", []):
        if isinstance(item, dict) and _value(item, "institution"):
            db.add(CandidateEducation(candidate_id=candidate.id, institution=str(_value(item, "institution"))[:200], degree=_value(item, "degree"), field_of_study=_value(item, "field_of_study", "fieldOfStudy"), start_year=_value(item, "start_year", "startYear"), end_year=_value(item, "end_year", "endYear")))
    for item in parsed.get("certifications", []):
        if isinstance(item, dict) and _value(item, "name"):
            db.add(CandidateCertification(candidate_id=candidate.id, name=str(_value(item, "name"))[:200], issuer=_value(item, "issuer"), issued_date=_date(_value(item, "issued_date", "issuedDate")), expires_date=_date(_value(item, "expires_date", "expiresDate")), credential_id=_value(item, "credential_id", "credentialId")))


def _persist_score(
    db: Session,
    *,
    candidate: Candidate,
    job: JobOpening,
    resume: Resume,
    batch_file: BatchFile,
    rubric: ScoringRubric,
    screening_document: ScreeningDocument,
    job_data: dict,
    job_skills: list[dict],
    criteria_data: list[dict],
    parsed: dict,
    trace_id: str,
    model_name: str,
) -> None:
    rules = db.scalars(select(DisqualifierRule).where(DisqualifierRule.rubric_id == rubric.id)).all()
    deterministic = compute_deterministic_score(
        parsed=parsed,
        job=job_data,
        job_skills=job_skills,
        criteria=criteria_data,
        thresholds=rubric.thresholds,
        disqualifier_rules=[{"type": rule.rule_type, "enabled": rule.is_enabled, "configuration": rule.configuration} for rule in rules],
    )
    score = parsed.get("score") if isinstance(parsed.get("score"), dict) else {}
    score["total"] = float(deterministic.total)
    score["confidence"] = float(deterministic.confidence)
    score["recommendation"] = deterministic.recommendation.value
    score["matched_skills"] = deterministic.matched_skills
    score["missing_skills"] = deterministic.missing_skills
    score["is_disqualified"] = deterministic.is_disqualified
    score["disqualifier_reasons"] = deterministic.disqualifier_reasons
    score["criteria"] = [{**item, "earned_score": float(item["earned_score"]), "max_score": float(item["max_score"]), "confidence": float(item["confidence"])} for item in deterministic.breakdowns]
    parsed["score"] = score
    resume.parsed_profile = {**parsed, "score": {**score}}
    resume.parser_confidence = deterministic.confidence
    application = db.scalar(select(Application).where(Application.job_id == job.id, Application.candidate_id == candidate.id))
    if application is None:
        application = Application(organization_id=job.organization_id, job_id=job.id, candidate_id=candidate.id, resume_id=resume.id, source="batch_upload", applied_at=datetime.now(timezone.utc))
        db.add(application)
        db.flush()
    else:
        application.resume_id = resume.id
    result = db.scalar(select(ScreeningResult).where(ScreeningResult.application_id == application.id, ScreeningResult.rubric_id == rubric.id))
    settings = get_settings()
    if result is None:
        result = ScreeningResult(application_id=application.id, rubric_id=rubric.id, batch_file_id=batch_file.id, screening_document_id=screening_document.id, total_score=deterministic.total, recommendation=deterministic.recommendation, confidence=deterministic.confidence, is_disqualified=deterministic.is_disqualified, disqualifier_reasons=deterministic.disqualifier_reasons, matched_skills=deterministic.matched_skills, missing_skills=deterministic.missing_skills, provider_name=settings.ai_provider[:80], model_name=model_name[:100], prompt_version=settings.ai_prompt_version, privacy_mode=settings.ai_privacy_mode[:40], trace_id=trace_id)
        db.add(result)
        db.flush()
    else:
        result.batch_file_id = batch_file.id
        result.screening_document_id = screening_document.id
        result.total_score = deterministic.total
        result.recommendation = deterministic.recommendation
        result.confidence = deterministic.confidence
        result.is_disqualified = deterministic.is_disqualified
        result.disqualifier_reasons = deterministic.disqualifier_reasons
        result.matched_skills = deterministic.matched_skills
        result.missing_skills = deterministic.missing_skills
        result.provider_name = settings.ai_provider[:80]
        result.model_name = model_name[:100]
        result.prompt_version = settings.ai_prompt_version
        result.privacy_mode = settings.ai_privacy_mode[:40]
        result.trace_id = trace_id
        db.execute(delete(ScoreBreakdown).where(ScoreBreakdown.screening_result_id == result.id))
    application.current_score = deterministic.total
    application.recommendation = deterministic.recommendation
    criteria_by_code = {criterion.criterion_code: criterion for criterion in db.scalars(select(RubricCriterion).where(RubricCriterion.rubric_id == rubric.id)).all()}
    for item in deterministic.breakdowns:
        criterion = criteria_by_code.get(item["criterion_code"])
        if criterion is None:
            continue
        db.add(ScoreBreakdown(screening_result_id=result.id, criterion_id=criterion.id, earned_score=item["earned_score"], max_score=item["max_score"], confidence=item["confidence"], explanation=item["explanation"][:2000], evidence=item["evidence"]))
    if deterministic.recommendation in {Recommendation.REVIEW_NEEDED, Recommendation.REJECT} or deterministic.is_disqualified or deterministic.confidence < 70:
        existing_review = db.scalar(select(ReviewQueueItem).where(ReviewQueueItem.application_id == application.id, ReviewQueueItem.status.in_([ReviewStatus.PENDING, ReviewStatus.IN_REVIEW])))
        if existing_review is None:
            reason_code = "DISQUALIFIED" if deterministic.is_disqualified else "LOW_CONFIDENCE" if deterministic.confidence < 70 else "LOW_SCORE" if deterministic.recommendation == Recommendation.REJECT else "REVIEW_RECOMMENDED"
            reason = "; ".join(deterministic.disqualifier_reasons) or ("Deterministic score is below the review threshold." if deterministic.recommendation == Recommendation.REJECT else "Evidence requires HR review.")
            db.add(ReviewQueueItem(application_id=application.id, screening_result_id=result.id, reason_code=reason_code, reason=reason, priority=ReviewPriority.HIGH if deterministic.is_disqualified else ReviewPriority.MEDIUM, status=ReviewStatus.PENDING))


def _rank_job_applications(db: Session, job_id: UUID) -> None:
    applications = db.scalars(select(Application).where(Application.job_id == job_id).order_by(Application.current_score.desc().nullslast(), Application.applied_at.asc())).all()
    for rank, application in enumerate(applications, start=1):
        application.rank = rank


def process_batch(db: Session, *, batch_public_id: str, organization_id: UUID, actor_user_id: UUID, trace_id: str) -> None:
    batch = db.scalar(select(ScreeningBatch).where(ScreeningBatch.organization_id == organization_id, ScreeningBatch.public_id == batch_public_id))
    if batch is None:
        return
    job = db.get(JobOpening, batch.job_id)
    actor = db.get(User, actor_user_id)
    if job is None:
        batch.status = BatchStatus.FAILED
        db.commit()
        return
    batch.status = BatchStatus.PROCESSING
    batch.started_at = batch.started_at or datetime.now(timezone.utc)
    db.commit()
    settings = get_settings()
    client = RouterClient(settings)
    if not client.is_configured:
        _mark_batch_error(db, batch, "AI_NOT_CONFIGURED", "The AI provider is not configured on the backend.")
        return
    try:
        rubric = _get_rubric(db, job.id)
        job_data, job_skills, criteria = _job_context(db, job, rubric)
    except ProcessingFailure as exc:
        _mark_batch_error(db, batch, exc.code, exc.message)
        return
    files = db.scalars(select(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.QUEUED).order_by(BatchFile.created_at.asc())).all()
    for batch_file in files:
        resume = db.get(Resume, batch_file.resume_id) if batch_file.resume_id else None
        try:
            if resume is None:
                raise ProcessingFailure("RESUME_NOT_FOUND", "The uploaded resume record was not found.")
            batch_file.status = BatchFileStatus.PARSING
            batch_file.attempt_count += 1
            batch_file.processing_started_at = datetime.now(timezone.utc)
            resume.parser_status = ParserStatus.PROCESSING
            db.commit()
            resume_text = _extract_text(PROJECT_ROOT / batch_file.storage_path, Path(batch_file.original_filename).suffix.lower())
            if len(resume_text.strip()) < 20:
                raise ProcessingFailure("TEXT_EXTRACTION_FAILED", "No usable text could be extracted from this CV.")
            _validate_resume_length(resume_text, settings.ai_max_resume_chars)
            redacted_resume = redact_resume_for_remote_ai(resume_text, batch_file.original_filename)
            batch_file.status = BatchFileStatus.PARSED
            screening_document = upsert_screening_document(
                db,
                organization_id=organization_id,
                job=job,
                resume=resume,
                batch_file=batch_file,
                job_data=job_data,
                job_skills=job_skills,
                criteria=criteria,
                redacted_resume_text=redacted_resume.text,
                redaction_counts=redacted_resume.redaction_counts,
                privacy_mode=settings.ai_privacy_mode,
            )
            db.commit()
            db.refresh(screening_document)
            parsed = client.complete_json(system_prompt=SYSTEM_PROMPT, user_prompt=build_screening_document_prompt(screening_document.payload), trace_id=trace_id)
            known_skills = list(db.scalars(select(Skill.name).order_by(Skill.name)))
            parsed = _ground_ai_output(parsed, resume_text=redacted_resume.text, job_skills=job_skills, criteria=criteria, known_skills=known_skills)
            parsed_candidate = parsed.get("candidate") if isinstance(parsed.get("candidate"), dict) else {}
            candidate_data = {**parsed_candidate, **redacted_resume.identity.as_candidate_data()}
            parsed["candidate"] = candidate_data
            candidate, _ = _upsert_candidate(db, organization_id=organization_id, resume=resume, candidate_data=candidate_data, replace_existing=True)
            resume.raw_text = resume_text if settings.ai_store_extracted_text else None
            resume.parsed_profile = parsed
            resume.parser_status = ParserStatus.COMPLETED
            resume.parser_confidence = _bounded_decimal(_value(parsed.get("score", {}), "confidence", default=70))
            resume.parser_version = f"{settings.ai_provider}:{settings.ai_model}:{settings.ai_prompt_version}"
            _clear_candidate_profile(db, candidate.id)
            _persist_profile(db, candidate=candidate, resume=resume, parsed=parsed)
            batch_file.status = BatchFileStatus.SCORING
            db.commit()
            _persist_score(db, candidate=candidate, job=job, resume=resume, batch_file=batch_file, rubric=rubric, screening_document=screening_document, job_data=job_data, job_skills=job_skills, criteria_data=criteria, parsed=parsed, trace_id=trace_id, model_name=settings.ai_model)
            batch_file.status = BatchFileStatus.COMPLETED
            batch_file.processing_completed_at = datetime.now(timezone.utc)
            db.commit()
        except AIClientError as exc:
            _mark_file_error(db, batch_file.id, resume.id if resume else None, exc.code, exc.message)
        except ProcessingFailure as exc:
            _mark_file_error(db, batch_file.id, resume.id if resume else None, exc.code, exc.message)
        except Exception as exc:
            logger.exception("batch_file_processing_failed trace_id=%s batch_id=%s file_id=%s error_type=%s", trace_id, batch_public_id, batch_file.id, type(exc).__name__)
            _mark_file_error(db, batch_file.id, resume.id if resume else None, "PROCESSING_FAILED", "The CV could not be processed. Retry the file or inspect the audit log.")
    _rank_job_applications(db, job.id)
    db.refresh(batch)
    completed = db.scalar(select(func.count()).select_from(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.COMPLETED)) or 0
    failed = db.scalar(select(func.count()).select_from(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.FAILED)) or 0
    batch.processed_files = completed
    batch.failed_files = failed
    batch.status = BatchStatus.COMPLETED if failed == 0 else BatchStatus.PARTIALLY_COMPLETED if completed > 0 else BatchStatus.FAILED
    batch.completed_at = datetime.now(timezone.utc)
    report = None
    if completed > 0:
        from app.features.reports.service import create_or_refresh_batch_report
        report = create_or_refresh_batch_report(db, batch=batch, job=job, actor=actor)
    append_audit_log(db, organization_id=organization_id, actor=actor, action="batch.process", resource_type="ScreeningBatch", resource_id=batch.public_id, trace_id=trace_id, metadata={"processedFiles": completed, "failedFiles": failed, "reportId": report.public_id if report else None})
    db.commit()


def rescore_candidate(db: Session, *, candidate_public_id: str, organization_id: UUID, actor_user_id: UUID, trace_id: str, job_public_id: str | None = None) -> Candidate:
    query = select(Candidate, Application, JobOpening, Resume, ScreeningResult, BatchFile).join(Application, Application.candidate_id == Candidate.id).join(JobOpening, JobOpening.id == Application.job_id).join(Resume, Resume.id == Application.resume_id).outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id).outerjoin(BatchFile, BatchFile.id == ScreeningResult.batch_file_id).where(Candidate.organization_id == organization_id, Candidate.public_id == candidate_public_id)
    if job_public_id:
        query = query.where(JobOpening.public_id == job_public_id)
    row = db.execute(
        query.order_by(Application.updated_at.desc(), ScreeningResult.updated_at.desc().nullslast())
    ).first()
    if row is None:
        raise ProcessingFailure("CANDIDATE_NOT_FOUND", "Candidate was not found.")
    candidate, application, job, resume, _, batch_file = row
    if batch_file is None:
        raise ProcessingFailure("RESCORE_SOURCE_NOT_FOUND", "This candidate does not have a screening batch file that can be rescored.")

    settings = get_settings()
    client = RouterClient(settings)
    if not client.is_configured:
        raise ProcessingFailure("AI_NOT_CONFIGURED", "The AI provider is not configured on the backend.")
    rubric = _get_rubric(db, job.id)
    job_data, job_skills, criteria = _job_context(db, job, rubric)
    resume_text = _extract_text(PROJECT_ROOT / batch_file.storage_path, Path(batch_file.original_filename).suffix.lower())
    if len(resume_text.strip()) < 20:
        raise ProcessingFailure("TEXT_EXTRACTION_FAILED", "No usable text could be extracted from this CV.")
    _validate_resume_length(resume_text, settings.ai_max_resume_chars)
    redacted_resume = redact_resume_for_remote_ai(resume_text, resume.original_filename)
    screening_document = upsert_screening_document(
        db,
        organization_id=organization_id,
        job=job,
        resume=resume,
        batch_file=batch_file,
        job_data=job_data,
        job_skills=job_skills,
        criteria=criteria,
        redacted_resume_text=redacted_resume.text,
        redaction_counts=redacted_resume.redaction_counts,
        privacy_mode=settings.ai_privacy_mode,
    )
    db.commit()
    db.refresh(screening_document)
    parsed = client.complete_json(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=build_screening_document_prompt(screening_document.payload),
        trace_id=trace_id,
    )
    known_skills = list(db.scalars(select(Skill.name).order_by(Skill.name)))
    parsed = _ground_ai_output(parsed, resume_text=redacted_resume.text, job_skills=job_skills, criteria=criteria, known_skills=known_skills)
    parsed_candidate = parsed.get("candidate") if isinstance(parsed.get("candidate"), dict) else {}
    candidate_data = {**parsed_candidate, **redacted_resume.identity.as_candidate_data()}
    parsed["candidate"] = candidate_data
    candidate, _ = _upsert_candidate(
        db,
        organization_id=organization_id,
        resume=resume,
        candidate_data=candidate_data,
        replace_existing=True,
    )
    resume.raw_text = resume_text if settings.ai_store_extracted_text else None
    resume.parsed_profile = parsed
    resume.parser_status = ParserStatus.COMPLETED
    resume.parser_confidence = _bounded_decimal(_value(parsed.get("score", {}), "confidence", default=70))
    resume.parser_version = f"{settings.ai_provider}:{settings.ai_model}:{settings.ai_prompt_version}"
    _clear_candidate_profile(db, candidate.id)
    _persist_profile(db, candidate=candidate, resume=resume, parsed=parsed)
    _persist_score(
        db,
        candidate=candidate,
        job=job,
        resume=resume,
        batch_file=batch_file,
        rubric=rubric,
        screening_document=screening_document,
        job_data=job_data,
        job_skills=job_skills,
        criteria_data=criteria,
        parsed=parsed,
        trace_id=trace_id,
        model_name=settings.ai_model,
    )
    _rank_job_applications(db, job.id)
    batch = db.get(ScreeningBatch, batch_file.batch_id)
    actor = db.get(User, actor_user_id)
    if batch:
        from app.features.reports.service import create_or_refresh_batch_report
        create_or_refresh_batch_report(db, batch=batch, job=job, actor=actor)
    append_audit_log(
        db,
        organization_id=organization_id,
        actor=actor,
        action="candidate.rescore",
        resource_type="Candidate",
        resource_id=candidate.public_id,
        trace_id=trace_id,
        metadata={"jobId": job.public_id, "model": settings.ai_model},
    )
    db.commit()
    db.refresh(candidate)
    return candidate


def _mark_file_error(db: Session, file_id: UUID, resume_id: UUID | None, code: str, message: str) -> None:
    db.rollback()
    batch_file = db.get(BatchFile, file_id)
    if batch_file is None:
        return
    batch_file.status = BatchFileStatus.FAILED
    batch_file.error_code = code
    batch_file.error_message = message
    batch_file.processing_completed_at = datetime.now(timezone.utc)
    if resume_id:
        resume = db.get(Resume, resume_id)
        if resume:
            resume.parser_status = ParserStatus.FAILED
    db.commit()


def _mark_batch_error(db: Session, batch: ScreeningBatch, code: str, message: str) -> None:
    batch.status = BatchStatus.FAILED
    batch.failed_files = batch.total_files - batch.duplicate_files
    for batch_file in db.scalars(select(BatchFile).where(BatchFile.batch_id == batch.id, BatchFile.status == BatchFileStatus.QUEUED)).all():
        batch_file.status = BatchFileStatus.FAILED
        batch_file.error_code = code
        batch_file.error_message = message
    batch.completed_at = datetime.now(timezone.utc)
    db.commit()


def process_batch_background(batch_public_id: str, organization_id: UUID, actor_user_id: UUID, trace_id: str) -> None:
    db = SessionLocal()
    try:
        process_batch(db, batch_public_id=batch_public_id, organization_id=organization_id, actor_user_id=actor_user_id, trace_id=trace_id)
    except Exception:
        db.rollback()
        logger.exception("batch_worker_failed trace_id=%s batch_id=%s", trace_id, batch_public_id)
    finally:
        db.close()
