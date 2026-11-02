"""Read-only privacy audit. Prints counts only; never prints candidate content."""

import json
from collections.abc import Mapping, Sequence

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.models import Resume, ScreeningDocument, ScreeningResult
from app.db.session import SessionLocal
from app.features.screening.privacy import contains_direct_contact_pii


BANNED_REMOTE_KEYS = {
    "address",
    "candidate_name",
    "date_of_birth",
    "email",
    "filename",
    "full_name",
    "github_url",
    "linkedin_url",
    "national_id",
    "passport",
    "phone",
}


def _contains_banned_key(value: object) -> bool:
    if isinstance(value, Mapping):
        return any(str(key).lower() in BANNED_REMOTE_KEYS or _contains_banned_key(item) for key, item in value.items())
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(_contains_banned_key(item) for item in value)
    return False


def main() -> int:
    settings = get_settings()
    with SessionLocal() as db:
        raw_text_rows = db.scalar(select(func.count()).select_from(Resume).where(Resume.raw_text.is_not(None))) or 0
        documents = list(db.scalars(select(ScreeningDocument)))
        result_count = db.scalar(select(func.count()).select_from(ScreeningResult)) or 0
        provenance_count = db.scalar(
            select(func.count()).select_from(ScreeningResult).where(
                ScreeningResult.provider_name.is_not(None),
                ScreeningResult.model_name.is_not(None),
                ScreeningResult.prompt_version.is_not(None),
                ScreeningResult.trace_id.is_not(None),
            )
        ) or 0

    banned_key_documents = sum(_contains_banned_key(document.payload) for document in documents)
    contact_pattern_documents = sum(
        contains_direct_contact_pii(json.dumps(document.payload, ensure_ascii=True)) for document in documents
    )
    violations = []
    if not settings.ai_store_extracted_text and raw_text_rows:
        violations.append("historical_raw_text_present")
    if banned_key_documents:
        violations.append("banned_remote_keys_present")
    if contact_pattern_documents:
        violations.append("direct_contact_pattern_present")

    report = {
        "privacyMode": settings.ai_privacy_mode,
        "model": settings.ai_model,
        "rawTextStorageEnabled": settings.ai_store_extracted_text,
        "historicalRawTextRows": raw_text_rows,
        "screeningDocuments": len(documents),
        "documentsWithBannedKeys": banned_key_documents,
        "documentsWithDirectContactPatterns": contact_pattern_documents,
        "screeningResults": result_count,
        "resultsWithCoreProvenance": provenance_count,
        "passed": not violations,
        "violations": violations,
    }
    print(json.dumps(report, indent=2))
    return 0 if not violations else 1


if __name__ == "__main__":
    raise SystemExit(main())
