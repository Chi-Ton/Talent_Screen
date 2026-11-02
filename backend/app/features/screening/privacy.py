import re
from dataclasses import dataclass
from pathlib import Path


EMAIL_PATTERN = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
URL_PATTERN = re.compile(r"(?i)\b(?:https?://|www\.)\S+|\b(?:linkedin\.com|github\.com)/\S+")
PHONE_PATTERN = re.compile(r"(?<![A-Za-z0-9])(?:\+?\(?\d[\d().\s-]{6,}\d\)?)(?![A-Za-z0-9])")
EXPLICIT_NAME_PATTERN = re.compile(
    r"(?im)^\s*(?:full\s*name|candidate\s*name|name|ho\s*va\s*ten|ho\s*ten)\s*[:\-]\s*([^\r\n]{2,80})$"
)
SENSITIVE_LINE_PATTERN = re.compile(
    r"(?im)^\s*(?:address|home\s*address|date\s*of\s*birth|dob|gender|marital\s*status|national\s*id|citizen\s*id|passport|salary|dia\s*chi|ngay\s*sinh|gioi\s*tinh|cccd|cmnd)\s*[:\-].*$"
)

NAME_HEADING_WORDS = {
    "resume",
    "curriculum vitae",
    "candidate profile",
    "profile",
    "java developer",
    "software engineer",
    "frontend developer",
    "backend developer",
    "data analyst",
    "work experience",
    "professional summary",
}


@dataclass(frozen=True)
class CandidateIdentity:
    display_name: str
    email: str | None
    phone: str | None
    linkedin_url: str | None
    github_url: str | None

    def as_candidate_data(self) -> dict:
        return {
            "full_name": self.display_name,
            "email": self.email,
            "phone": self.phone,
            "linkedin_url": self.linkedin_url,
            "github_url": self.github_url,
        }


@dataclass(frozen=True)
class RedactedResume:
    text: str
    identity: CandidateIdentity
    redaction_counts: dict[str, int]


def _clean_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().strip("|,;:- ")
    return cleaned or None


def _find_name(resume_text: str, source_filename: str) -> str:
    explicit = EXPLICIT_NAME_PATTERN.search(resume_text)
    if explicit:
        candidate = _clean_value(explicit.group(1))
        if candidate:
            return candidate[:180]

    for raw_line in resume_text.splitlines()[:12]:
        line = _clean_value(raw_line)
        if not line or len(line) > 80 or any(token in line for token in ("@", "http://", "https://", "www.")):
            continue
        normalized = " ".join(line.lower().split())
        if normalized in NAME_HEADING_WORDS or any(word in normalized for word in ("developer", "engineer", "analyst", "manager", "intern")):
            continue
        words = re.findall(r"[^\W\d_]+", line, flags=re.UNICODE)
        if 2 <= len(words) <= 6 and not re.search(r"\d", line):
            return line[:180]

    return Path(source_filename).stem[:180]


def extract_candidate_identity(resume_text: str, source_filename: str) -> CandidateIdentity:
    email_match = EMAIL_PATTERN.search(resume_text)
    phone_match = PHONE_PATTERN.search(resume_text)
    urls = URL_PATTERN.findall(resume_text)
    linkedin = next((value for value in urls if "linkedin.com" in value.lower()), None)
    github = next((value for value in urls if "github.com" in value.lower()), None)
    return CandidateIdentity(
        display_name=_find_name(resume_text, source_filename),
        email=_clean_value(email_match.group(0) if email_match else None),
        phone=_clean_value(phone_match.group(0) if phone_match else None),
        linkedin_url=_clean_value(linkedin),
        github_url=_clean_value(github),
    )


def redact_resume_for_remote_ai(resume_text: str, source_filename: str) -> RedactedResume:
    identity = extract_candidate_identity(resume_text, source_filename)
    counts = {"name": 0, "email": 0, "phone": 0, "url": 0, "sensitiveLine": 0}
    redacted = resume_text

    redacted, counts["email"] = EMAIL_PATTERN.subn("[EMAIL_REDACTED]", redacted)
    redacted, counts["phone"] = PHONE_PATTERN.subn("[PHONE_REDACTED]", redacted)
    redacted, counts["url"] = URL_PATTERN.subn("[URL_REDACTED]", redacted)
    redacted, counts["sensitiveLine"] = SENSITIVE_LINE_PATTERN.subn("[SENSITIVE_PERSONAL_FIELD_REDACTED]", redacted)

    name = identity.display_name
    if name and name.lower() != Path(source_filename).stem.lower():
        redacted, counts["name"] = re.subn(re.escape(name), "[CANDIDATE_NAME_REDACTED]", redacted, flags=re.IGNORECASE)

    return RedactedResume(text=redacted.strip(), identity=identity, redaction_counts=counts)


def contains_direct_contact_pii(value: str) -> bool:
    return bool(EMAIL_PATTERN.search(value) or PHONE_PATTERN.search(value) or URL_PATTERN.search(value))
