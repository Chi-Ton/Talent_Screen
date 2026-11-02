"""Unit tests for Vietnamese CV text extraction, PII protection, grounding, and experience parsing."""

from app.features.screening.processor import (
    _explicit_experience_years,
    _has_current_location_evidence,
    _has_text_evidence,
    _remove_accents,
)
from app.features.screening.privacy import redact_resume_for_remote_ai


def test_vietnamese_text_evidence_matching() -> None:
    sample_cv = """
    Họ và tên: Nguyễn Văn An
    Vị trí: Lập trình viên Java Backend (Java Developer)
    Kinh nghiệm: 3 năm kinh nghiệm làm việc với Spring Boot, PostgreSQL, Docker, AWS.
    Học vấn: Đại học Bách Khoa Đà Nẵng, chuyên ngành Công nghệ Thông tin.
    Nơi ở hiện tại: Thành phố Đà Nẵng
    Dự án: Hệ thống Quản lý Bán hàng E-Commerce sử dụng Microservices, Kafka và Redis.
    """
    # 1. Technical skills (English in Vietnamese context)
    assert _has_text_evidence(sample_cv, "Java") is True
    assert _has_text_evidence(sample_cv, "Spring Boot") is True
    assert _has_text_evidence(sample_cv, "PostgreSQL") is True
    assert _has_text_evidence(sample_cv, "Docker") is True
    assert _has_text_evidence(sample_cv, "AWS") is True
    assert _has_text_evidence(sample_cv, "Kafka") is True
    assert _has_text_evidence(sample_cv, "Golang") is False

    # 2. Accented Vietnamese entities
    assert _has_text_evidence(sample_cv, "Nguyễn Văn An") is True
    assert _has_text_evidence(sample_cv, "Đại học Bách Khoa Đà Nẵng") is True
    assert _has_text_evidence(sample_cv, "Hệ thống Quản lý Bán hàng") is True

    # 3. Unaccented queries against accented CV text
    assert _has_text_evidence(sample_cv, "Nguyen Van An") is True
    assert _has_text_evidence(sample_cv, "Dai hoc Bach Khoa Da Nang") is True


def test_vietnamese_experience_duration_parsing() -> None:
    test_cases = [
        ("Kinh nghiệm: 3 năm", 3.0),
        ("Kinh nghiệm làm việc: 4.5 năm", 4.5),
        ("Kinh nghiệm: 6 tháng", 0.5),
        ("18 tháng kinh nghiệm phát triển hệ thống", 1.5),
        ("Kinh nghiệm: 2 nam lam viec", 2.0),
        ("3 years of experience in Java", 3.0),
        ("Experience: 5.5 yrs", 5.5),
    ]
    for text, expected in test_cases:
        assert _explicit_experience_years(text) == expected


def test_vietnamese_current_location_cues() -> None:
    sample_cv = """
    Họ và tên: Trần Thị Mai
    Nơi ở hiện tại: Thành phố Đà Nẵng
    Địa chỉ: Quận Hải Châu, Đà Nẵng
    """
    assert _has_current_location_evidence(sample_cv, "Đà Nẵng") is True
    assert _has_current_location_evidence(sample_cv, "Da Nang") is True
    assert _has_current_location_evidence(sample_cv, "Hải Châu") is True
    assert _has_current_location_evidence(sample_cv, "Hà Nội") is False


def test_vietnamese_pii_redaction() -> None:
    raw_cv = """
    Họ và tên: Lê Văn Bình
    Email: levanbinh.dev@gmail.com
    Số điện thoại: 0905123456
    Địa chỉ: 123 Nguyễn Tri Phương, Đà Nẵng
    Ngày sinh: 15/08/1998
    Kinh nghiệm: 4 năm Java Backend với Spring Boot
    """
    redacted = redact_resume_for_remote_ai(raw_cv, "Le_Van_Binh_CV.pdf")
    
    # Direct identifiers must be purged
    assert "levanbinh.dev@gmail.com" not in redacted.text
    assert "0905123456" not in redacted.text
    assert "[EMAIL_REDACTED]" in redacted.text
    assert "[PHONE_REDACTED]" in redacted.text
    
    # Technical context must be preserved
    assert "Java Backend" in redacted.text
    assert "Spring Boot" in redacted.text
