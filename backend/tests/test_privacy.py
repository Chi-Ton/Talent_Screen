import json

from app.features.screening.document_read_model import DOCUMENT_SCHEMA_VERSION
from app.features.screening.privacy import contains_direct_contact_pii, redact_resume_for_remote_ai


RESUME_WITH_PII = """Nguyen Van An
Java Backend Engineer
Email: an.nguyen@example.com
Phone: +84 912 345 678
LinkedIn: https://linkedin.com/in/nguyenvanan
Address: 123 Nguyen Trai, Ho Chi Minh City
Skills: Java, Spring Boot, PostgreSQL
Experience: 4 years
"""


def test_remote_resume_payload_removes_direct_identity_and_contact_pii() -> None:
    result = redact_resume_for_remote_ai(RESUME_WITH_PII, "Nguyen-Van-An-CV.pdf")

    assert result.identity.display_name == "Nguyen Van An"
    assert result.identity.email == "an.nguyen@example.com"
    assert result.identity.phone is not None
    assert "Nguyen Van An" not in result.text
    assert "an.nguyen@example.com" not in result.text
    assert "912 345 678" not in result.text
    assert "linkedin.com" not in result.text
    assert "123 Nguyen Trai" not in result.text
    assert not contains_direct_contact_pii(result.text)
    assert "Java" in result.text


def test_screening_document_contract_is_serializable_without_identity_values() -> None:
    result = redact_resume_for_remote_ai(RESUME_WITH_PII, "Nguyen-Van-An-CV.pdf")
    payload = {
        "schemaVersion": DOCUMENT_SCHEMA_VERSION,
        "source": {"sha256": "a" * 64},
        "resumeEvidence": {"redactedText": result.text},
    }

    serialized = json.dumps(payload)
    assert "an.nguyen@example.com" not in serialized
    assert "Nguyen Van An" not in serialized

