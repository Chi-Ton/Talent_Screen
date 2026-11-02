"""Evaluate synthetic, labelled CV evidence without changing candidate records."""
import copy
import json
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from app.core.config import get_settings
from app.features.screening.processor import _ground_ai_output
from app.services.ai.prompts import SYSTEM_PROMPT, build_screening_document_prompt
from app.services.ai.router_client import AIClientError, RouterClient


CASES = [
    {"id": "education_not_employment", "text": "Education: BE Electronics 2010 to 2017, Example Institute, Jabalpur.\nSkills: Java, Javascript.\nExprience - 6 months\nRole: Jr. Java Developer", "skills": ["Java", "Javascript"], "years": 0.5},
    {"id": "unknown_experience", "text": "Experience: Junior Developer at Example Software.\nSkills: Python, SQL.\nEducation: Computer Science 2014 to 2018.", "skills": ["Python", "SQL"], "years": None},
    {"id": "final_section", "text": "Backend Developer\nExperience: 4 years\nSkills: Java\nProjects: Built REST API for inventory.\nEducation: Computer Science\nAdditional technical skills: PostgreSQL, Docker", "skills": ["Java", "PostgreSQL", "Docker"], "years": 4},
    {"id": "job_is_not_resume", "text": "Junior Developer\nExperience: 6 months\nSkills: Javascript, HTML, CSS.", "skills": ["Javascript", "HTML", "CSS"], "years": 0.5},
]


def checks(output, case):
    candidate = output.get("candidate") or {}
    skills = {s.get("name", "").lower() for s in output.get("skills", []) if isinstance(s, dict)}
    return {
        "expectedSkillsPresent": all(s.lower() in skills for s in case["skills"]),
        "noUnexpectedSkills": skills <= {s.lower() for s in case["skills"]},
        "experienceExact": candidate.get("total_experience_years") == case["years"],
        "noInventedLocation": candidate.get("location") in (None, ""),
    }


def main():
    settings = get_settings()
    client = RouterClient(settings=settings)
    report = {"requestedModel": settings.ai_model, "scope": "Synthetic labelled text fixtures; no training or real CV upload", "cases": []}
    for case in CASES:
        document = {"schemaVersion": "screening-context-v1", "targetRole": {"title": "Backend Developer"}, "jobSkills": [{"name": "Java"}, {"name": "Kubernetes"}], "rubricCriteria": [], "resumeEvidence": {"redactedText": case["text"]}}
        started = perf_counter()
        try:
            raw = client.complete_json(system_prompt=SYSTEM_PROMPT, user_prompt=build_screening_document_prompt(document), trace_id=str(uuid4()))
            grounded = _ground_ai_output(copy.deepcopy(raw), resume_text=case["text"], job_skills=document["jobSkills"], criteria=[])
            row = {"id": case["id"], "rawChecks": checks(raw, case), "groundedChecks": checks(grounded, case)}
        except AIClientError as exc:
            row = {"id": case["id"], "errorCode": exc.code}
        row["seconds"] = round(perf_counter() - started, 2)
        report["cases"].append(row)
        print(json.dumps(row), flush=True)
        if "errorCode" in row:
            break
    report["passed"] = len(report["cases"]) == len(CASES) and all(all(row.get("rawChecks", {"error": False}).values()) and all(row.get("groundedChecks", {"error": False}).values()) for row in report["cases"])
    destination = Path(__file__).resolve().parents[2] / "docs" / "testing" / "ai-dataset-evaluation.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"passed={report['passed']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
