from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import BatchFile, JobOpening, Resume, ScreeningDocument


DOCUMENT_SCHEMA_VERSION = "screening-context-v1"


def upsert_screening_document(
    db: Session,
    *,
    organization_id: UUID,
    job: JobOpening,
    resume: Resume,
    batch_file: BatchFile,
    job_data: dict,
    job_skills: list[dict],
    criteria: list[dict],
    redacted_resume_text: str,
    redaction_counts: dict[str, int],
    privacy_mode: str,
) -> ScreeningDocument:
    document = db.scalar(
        select(ScreeningDocument).where(
            ScreeningDocument.job_id == job.id,
            ScreeningDocument.resume_id == resume.id,
        )
    )
    document_key = f"{job.public_id}:{resume.sha256}"
    payload = {
        "schemaVersion": DOCUMENT_SCHEMA_VERSION,
        "documentKey": document_key,
        "source": {
            "sha256": resume.sha256,
            "mimeType": resume.mime_type,
        },
        "targetRole": job_data,
        "jobSkills": job_skills,
        "rubricCriteria": criteria,
        "resumeEvidence": {
            "redactedText": redacted_resume_text,
        },
        "privacy": {
            "mode": privacy_mode,
            "directContactPiiSent": False,
            "redactionsApplied": sum(redaction_counts.values()),
        },
    }
    if document is None:
        document = ScreeningDocument(
            organization_id=organization_id,
            job_id=job.id,
            resume_id=resume.id,
            batch_file_id=batch_file.id,
            document_key=document_key,
            source_filename=resume.original_filename,
            source_sha256=resume.sha256,
            schema_version=DOCUMENT_SCHEMA_VERSION,
            privacy_mode=privacy_mode,
            payload=payload,
        )
        db.add(document)
    else:
        document.batch_file_id = batch_file.id
        document.source_filename = resume.original_filename
        document.source_sha256 = resume.sha256
        document.schema_version = DOCUMENT_SCHEMA_VERSION
        document.privacy_mode = privacy_mode
        document.payload = payload
    db.flush()
    return document
