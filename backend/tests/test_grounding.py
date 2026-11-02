from app.features.screening.processor import _explicit_experience_years, _ground_ai_output


RESUME_TEXT = """Candidate CAND-JAVA-001
August 2010 to May 2017 BE Electronics & Communication Jabalpur, Madhya Pradesh
Takshshila institute of technology
Java, Javascript,- Exprience - 6 months
company - Wab It Softwere Pvt. Ltd.
description - Jr. Java Developer
"""


def test_explicit_months_are_not_inflated_to_years() -> None:
    assert _explicit_experience_years(RESUME_TEXT) == 0.5


def test_grounding_removes_hallucinated_location_skills_and_evidence() -> None:
    parsed = {
        "candidate": {
            "full_name": "Candidate CAND-JAVA-001",
            "location": "Ho Chi Minh City",
            "current_title": "Jr. Java Developer",
            "total_experience_years": 5.5,
        },
        "skills": [{"name": "Java"}, {"name": "Spring Boot"}],
        "experiences": [],
        "projects": [],
        "education": [],
        "certifications": [],
        "score": {
            "matched_skills": ["Java", "Spring Boot"],
            "missing_skills": [],
            "criteria": [
                {"criterion_code": "P1_1", "earned_score": 25, "evidence": ["Java"]},
                {"criterion_code": "P1_2", "earned_score": 10, "evidence": ["Built Spring Boot microservices"]},
            ],
        },
    }
    grounded = _ground_ai_output(
        parsed,
        resume_text=RESUME_TEXT,
        job_skills=[{"name": "Java"}, {"name": "Spring Boot"}],
        criteria=[{"code": "P1_1"}, {"code": "P1_2"}],
    )

    assert grounded["candidate"]["location"] is None
    assert grounded["candidate"]["total_experience_years"] == 0.5
    assert [skill["name"] for skill in grounded["skills"]] == ["Java"]
    assert grounded["score"]["matched_skills"] == ["Java"]
    assert grounded["score"]["missing_skills"] == ["Spring Boot"]
    assert grounded["score"]["criteria"][1]["earned_score"] == 0
    assert grounded["score"]["criteria"][1]["evidence"] == []


def test_grounding_is_independent_of_provider_model_output() -> None:
    outputs = [
        {
            "candidate": {"location": "Ho Chi Minh City", "total_experience_years": 8},
            "skills": [{"name": "Java"}, {"name": "Kubernetes"}],
            "score": {"matched_skills": ["Kubernetes"], "missing_skills": []},
        },
        {
            "candidate": {"location": "Singapore", "total_experience_years": 3},
            "skills": [{"name": "Java"}, {"name": "Spring Boot"}],
            "score": {"matched_skills": ["Spring Boot"], "missing_skills": []},
        },
    ]

    grounded = [
        _ground_ai_output(
            output,
            resume_text=RESUME_TEXT,
            job_skills=[{"name": "Java"}, {"name": "Spring Boot"}],
            criteria=[],
        )
        for output in outputs
    ]

    for result in grounded:
        assert result["candidate"]["location"] is None
        assert result["candidate"]["total_experience_years"] == 0.5
        assert [skill["name"] for skill in result["skills"]] == ["Java"]
        assert result["score"]["matched_skills"] == ["Java"]
        assert result["score"]["missing_skills"] == ["Spring Boot"]
