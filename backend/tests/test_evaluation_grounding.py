import pytest

from app.features.screening.processor import _ground_ai_output
from app.features.screening.processor import ProcessingFailure, _validate_resume_length


def test_long_resume_fails_instead_of_silent_truncation():
    _validate_resume_length("a" * 1000, 1000)
    with pytest.raises(ProcessingFailure) as error:
        _validate_resume_length("a" * 1001, 1000)
    assert error.value.code == "RESUME_TEXT_TOO_LONG"


@pytest.mark.parametrize("text", [
    "Experience: Junior Developer. Education: 2010 to 2017.",
    "Experience: projects at university. No employment dates supplied.",
    "Skills: Java. Education: Bachelor of Engineering.",
])
def test_unsupported_experience_is_unknown(text):
    result = _ground_ai_output(
        {"candidate": {"total_experience_years": 7}},
        resume_text=text, job_skills=[], criteria=[],
    )
    assert result["candidate"]["total_experience_years"] is None
