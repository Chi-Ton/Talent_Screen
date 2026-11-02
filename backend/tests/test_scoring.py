from app.features.screening.scoring import compute_deterministic_score


def test_backend_recomputes_score_instead_of_trusting_model_total() -> None:
    parsed = {
        "candidate": {"total_experience_years": 1},
        "skills": [{"name": "Java", "evidence": "Java"}],
        "experiences": [],
        "projects": [],
        "education": [],
        "certifications": [],
        "score": {"total": 100, "recommendation": "strong_recommend", "criteria": []},
    }
    score = compute_deterministic_score(
        parsed=parsed,
        job={"minimum_experience_years": 3},
        job_skills=[
            {"name": "Java", "requirement_level": "must_have"},
            {"name": "Spring Boot", "requirement_level": "must_have"},
        ],
        criteria=[
            {"code": "P1_1", "name": "Must-Have Primary Technologies", "pillar": "P1_TECH_SKILLS", "weight": 40},
            {"code": "P2_1", "name": "Years of Relevant Experience", "pillar": "P2_EXPERIENCE", "weight": 60},
        ],
        thresholds={"strong_recommend": [85, 100], "recommend": [70, 84], "review_needed": [50, 69], "reject": [0, 49]},
        disqualifier_rules=[{"type": "missing_must_have", "enabled": True}, {"type": "insufficient_experience", "enabled": True}],
    )

    assert score.total == 40
    assert score.recommendation.value == "reject"
    assert score.is_disqualified is True
    assert score.matched_skills == ["Java"]
    assert score.missing_skills == ["Spring Boot"]
    assert len(score.disqualifier_reasons) == 2


def test_backend_score_is_stable_across_different_model_claims() -> None:
    base = {
        "candidate": {"total_experience_years": 4},
        "skills": [{"name": "Java", "evidence": "Java"}, {"name": "Spring Boot", "evidence": "Spring Boot"}],
        "experiences": [{"company_name": "Example", "role_title": "Developer"}],
        "projects": [],
        "education": [],
        "certifications": [],
    }
    inputs = [
        {**base, "score": {"total": 5, "recommendation": "reject", "criteria": []}},
        {**base, "score": {"total": 99, "recommendation": "strong_recommend", "criteria": []}},
    ]
    results = [
        compute_deterministic_score(
            parsed=item,
            job={"minimum_experience_years": 3},
            job_skills=[{"name": "Java", "requirement_level": "must_have"}, {"name": "Spring Boot", "requirement_level": "must_have"}],
            criteria=[{"code": "P1_1", "name": "Must-Have Primary Technologies", "pillar": "P1_TECH_SKILLS", "weight": 50}, {"code": "P2_1", "name": "Years of Relevant Experience", "pillar": "P2_EXPERIENCE", "weight": 50}],
            thresholds={"strong_recommend": [85, 100], "recommend": [70, 84], "review_needed": [50, 69], "reject": [0, 49]},
            disqualifier_rules=[],
        )
        for item in inputs
    ]

    assert results[0].total == results[1].total == 100
    assert results[0].recommendation == results[1].recommendation

