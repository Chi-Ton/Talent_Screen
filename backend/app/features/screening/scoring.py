import re
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from app.db.models.common import Recommendation


SYSTEM_SKILLS = {
    "aws", "amazon web services", "azure", "gcp", "docker", "kubernetes", "k8s",
    "ci/cd", "jenkins", "terraform", "linux", "git", "gitlab ci", "prometheus",
}
DATABASE_SKILLS = {
    "postgresql", "postgres", "mysql", "oracle", "mongodb", "redis", "elasticsearch",
    "sql server", "sql", "database indexing",
}


@dataclass(frozen=True)
class DeterministicScore:
    total: Decimal
    confidence: Decimal
    recommendation: Recommendation
    matched_skills: list[str]
    missing_skills: list[str]
    is_disqualified: bool
    disqualifier_reasons: list[str]
    breakdowns: list[dict]


def _normalise(value: object) -> str:
    return " ".join(str(value or "").lower().strip().split())


def _decimal(value: object, default: Decimal = Decimal("0")) -> Decimal:
    try:
        return Decimal(str(value))
    except (ArithmeticError, TypeError, ValueError):
        return default


def _ratio(numerator: float, denominator: float) -> Decimal:
    if denominator <= 0:
        return Decimal("0")
    return min(Decimal("1"), max(Decimal("0"), Decimal(str(numerator / denominator))))


def _criterion_evidence(ai_criteria: dict[str, dict], code: str) -> list[str]:
    values = ai_criteria.get(code, {}).get("evidence", [])
    return [str(value) for value in values if str(value).strip()]


def _recommendation_for(total: Decimal, thresholds: dict, disqualified: bool) -> Recommendation:
    if disqualified:
        return Recommendation.REJECT
    ordered = (
        (Recommendation.STRONG_RECOMMEND, thresholds.get("strong_recommend", [85, 100])),
        (Recommendation.RECOMMEND, thresholds.get("recommend", [70, 84])),
        (Recommendation.REVIEW_NEEDED, thresholds.get("review_needed", [50, 69])),
    )
    for recommendation, score_range in ordered:
        try:
            if total >= Decimal(str(score_range[0])):
                return recommendation
        except (IndexError, TypeError, ValueError):
            continue
    return Recommendation.REJECT


def compute_deterministic_score(
    *,
    parsed: dict,
    job: dict,
    job_skills: list[dict],
    criteria: list[dict],
    thresholds: dict,
    disqualifier_rules: list[dict],
) -> DeterministicScore:
    parsed_skills = {
        _normalise(item.get("name")): item
        for item in parsed.get("skills", [])
        if isinstance(item, dict) and item.get("name")
    }
    configured = [item for item in job_skills if item.get("name")]
    matched = [str(item["name"]) for item in configured if _normalise(item["name"]) in parsed_skills]
    missing = [str(item["name"]) for item in configured if _normalise(item["name"]) not in parsed_skills]
    must_have = [item for item in configured if item.get("requirement_level") == "must_have"]
    nice_to_have = [item for item in configured if item.get("requirement_level") != "must_have"]
    matched_normalized = {_normalise(value) for value in matched}

    candidate = parsed.get("candidate") if isinstance(parsed.get("candidate"), dict) else {}
    experience_years = _decimal(candidate.get("total_experience_years"), Decimal("-1"))
    minimum_years = _decimal(job.get("minimum_experience_years"), Decimal("0"))
    projects = [item for item in parsed.get("projects", []) if isinstance(item, dict)]
    experiences = [item for item in parsed.get("experiences", []) if isinstance(item, dict)]
    education = [item for item in parsed.get("education", []) if isinstance(item, dict)]
    certifications = [item for item in parsed.get("certifications", []) if isinstance(item, dict)]
    ai_score = parsed.get("score") if isinstance(parsed.get("score"), dict) else {}
    ai_criteria = {
        str(item.get("criterion_code") or item.get("criterionCode")): item
        for item in ai_score.get("criteria", [])
        if isinstance(item, dict) and (item.get("criterion_code") or item.get("criterionCode"))
    }

    must_ratio = _ratio(sum(_normalise(item["name"]) in matched_normalized for item in must_have), len(must_have))
    nice_ratio = _ratio(sum(_normalise(item["name"]) in matched_normalized for item in nice_to_have), len(nice_to_have))
    all_skill_ratio = _ratio(len(matched), len(configured))
    depth_items = [item for item in parsed_skills.values() if item.get("years_experience") is not None or item.get("proficiency")]
    depth_ratio = _ratio(len(depth_items), max(1, len(parsed_skills))) if parsed_skills else Decimal("0")
    experience_ratio = Decimal("0") if experience_years < 0 else (Decimal("1") if minimum_years <= 0 else min(Decimal("1"), experience_years / minimum_years))
    progression_ratio = _ratio(len(experiences), 2)
    project_ratio = _ratio(len(projects), 1)
    achievement_text = " ".join(
        str(value)
        for project in projects
        for value in [project.get("description"), *(project.get("achievements") or [])]
        if value
    )
    achievement_ratio = Decimal("1") if re.search(r"\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|users?|requests?|transactions?)\b", achievement_text, re.IGNORECASE) else Decimal("0")
    skill_names = set(parsed_skills)
    database_ratio = Decimal("1") if skill_names & DATABASE_SKILLS else Decimal("0")
    systems_ratio = Decimal("1") if skill_names & SYSTEM_SKILLS else Decimal("0")
    education_ratio = Decimal("1") if education else Decimal("0")
    certification_ratio = Decimal("1") if certifications else Decimal("0")

    breakdowns: list[dict] = []
    total = Decimal("0")
    supported_weight = Decimal("0")
    for criterion in criteria:
        code = str(criterion["code"])
        pillar = _normalise(criterion.get("pillar"))
        name = _normalise(criterion.get("name"))
        weight = max(Decimal("0"), _decimal(criterion.get("weight")))
        evidence = _criterion_evidence(ai_criteria, code)

        if "p1" in pillar or "technical" in pillar or "skills" in pillar:
            ratio = must_ratio if "must" in name else nice_ratio if "nice" in name else depth_ratio if "depth" in name or "recency" in name else all_skill_ratio
        elif "p2" in pillar or "experience" in pillar:
            ratio = experience_ratio if "year" in name or "experience" in name else progression_ratio
        elif "p3" in pillar or "project" in pillar:
            ratio = achievement_ratio if "quant" in name or "achievement" in name else project_ratio
        elif "p4" in pillar or "systems" in pillar or "cloud" in pillar or "database" in pillar or "devops" in pillar:
            ratio = database_ratio if "database" in name or "sql" in name else systems_ratio
        elif "p5" in pillar or "education" in pillar or "cert" in pillar:
            ratio = certification_ratio if "cert" in name else education_ratio if "degree" in name or "formal" in name else Decimal("1") if evidence else Decimal("0")
        else:
            ratio = Decimal("1") if evidence else Decimal("0")

        earned = (weight * ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total += earned
        if evidence or ratio > 0:
            supported_weight += weight
        breakdowns.append(
            {
                "criterion_code": code,
                "earned_score": earned,
                "max_score": weight,
                "confidence": Decimal("100") if evidence else Decimal("75") if ratio > 0 else Decimal("60"),
                "explanation": f"Backend deterministic rule applied to {criterion.get('name') or code}.",
                "evidence": evidence,
            }
        )

    total = min(Decimal("100"), max(Decimal("0"), total)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    enabled_rules = {item.get("type") for item in disqualifier_rules if item.get("enabled")}
    missing_must_have = [str(item["name"]) for item in must_have if _normalise(item["name"]) not in matched_normalized]
    disqualifier_reasons: list[str] = []
    if "missing_must_have" in enabled_rules and missing_must_have:
        disqualifier_reasons.append("Missing must-have skills: " + ", ".join(missing_must_have))
    if "insufficient_experience" in enabled_rules and minimum_years > 0 and (experience_years < 0 or experience_years < minimum_years):
        stated = "not stated" if experience_years < 0 else f"{experience_years} years"
        disqualifier_reasons.append(f"Experience requirement not met: {stated}; requires {minimum_years} years.")
    if "missing_certification" in enabled_rules and not certifications:
        disqualifier_reasons.append("Mandatory certification evidence is missing.")
    is_disqualified = bool(disqualifier_reasons)
    confidence = (Decimal("60") + supported_weight * Decimal("0.4")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return DeterministicScore(
        total=total,
        confidence=min(Decimal("100"), confidence),
        recommendation=_recommendation_for(total, thresholds, is_disqualified),
        matched_skills=matched,
        missing_skills=missing,
        is_disqualified=is_disqualified,
        disqualifier_reasons=disqualifier_reasons,
        breakdowns=breakdowns,
    )
