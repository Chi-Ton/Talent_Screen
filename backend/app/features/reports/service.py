from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Application, BatchFile, Candidate, JobOpening, Report, ScreeningBatch, ScreeningResult, User
from app.db.models.common import Recommendation, ReportStatus


def report_candidate_rows(db: Session, report: Report) -> list[tuple[Application, Candidate, ScreeningResult | None]]:
    query = (
        select(Application, Candidate, ScreeningResult)
        .join(Candidate, Candidate.id == Application.candidate_id)
        .outerjoin(ScreeningResult, ScreeningResult.application_id == Application.id)
        .where(Application.organization_id == report.organization_id)
        .order_by(Application.current_score.desc().nullslast(), ScreeningResult.updated_at.desc().nullslast())
    )
    if report.batch_id:
        query = query.join(BatchFile, BatchFile.id == ScreeningResult.batch_file_id).where(BatchFile.batch_id == report.batch_id)
    elif report.job_id:
        query = query.where(Application.job_id == report.job_id)

    unique_rows: dict[object, tuple[Application, Candidate, ScreeningResult | None]] = {}
    for application, candidate, result in db.execute(query).all():
        unique_rows.setdefault(application.id, (application, candidate, result))
    return list(unique_rows.values())


def build_report_summary(db: Session, report: Report) -> dict:
    rows = report_candidate_rows(db, report)
    batch = db.get(ScreeningBatch, report.batch_id) if report.batch_id else None
    scores = [float(application.current_score) for application, _, _ in rows if application.current_score is not None]
    recommendation_counts = Counter(
        application.recommendation.value if application.recommendation else "pending"
        for application, _, _ in rows
    )
    score_distribution = [0] * 10
    for score in scores:
        score_distribution[min(9, max(0, int(score // 10)))] += 1

    matched = Counter()
    missing = Counter()
    for _, _, result in rows:
        if result is None:
            continue
        matched.update(_clean_skill_names(result.matched_skills))
        missing.update(_clean_skill_names(result.missing_skills))

    candidate_count = len(rows)
    processed_files = batch.processed_files if batch else candidate_count
    failed_files = batch.failed_files if batch else 0
    average_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    strong_matches = recommendation_counts[Recommendation.STRONG_RECOMMEND.value]
    job = db.get(JobOpening, report.job_id) if report.job_id else None
    executive_summary = (
        f"{candidate_count} candidate(s) were evaluated for {job.title if job else 'this report'}. "
        f"{len(scores)} candidate(s) have a completed score, with an average of {average_score:.1f}/100. "
        f"{strong_matches} candidate(s) are currently classified as strong recommendations."
    )
    return {
        "candidateCount": candidate_count,
        "processedFiles": processed_files,
        "failedFiles": failed_files,
        "scoredCandidates": len(scores),
        "averageScore": average_score,
        "strongMatches": strong_matches,
        "recommendationCounts": {
            "strongRecommend": recommendation_counts[Recommendation.STRONG_RECOMMEND.value],
            "recommend": recommendation_counts[Recommendation.RECOMMEND.value],
            "reviewNeeded": recommendation_counts[Recommendation.REVIEW_NEEDED.value],
            "reject": recommendation_counts[Recommendation.REJECT.value],
            "pending": recommendation_counts["pending"],
        },
        "scoreDistribution": score_distribution,
        "topMatchedSkills": _skill_summary(matched, candidate_count),
        "topMissingSkills": _skill_summary(missing, candidate_count),
        "executiveSummary": executive_summary,
    }


def refresh_report(db: Session, report: Report) -> Report:
    report.status = ReportStatus.COMPLETED
    report.summary = build_report_summary(db, report)
    report.completed_at = datetime.now(timezone.utc)
    return report


def create_or_refresh_batch_report(db: Session, *, batch: ScreeningBatch, job: JobOpening, actor: User | None) -> Report:
    report = db.scalar(select(Report).where(Report.organization_id == batch.organization_id, Report.batch_id == batch.id))
    if report is None:
        report = Report(
            organization_id=batch.organization_id,
            public_id=_next_report_id(db, batch.organization_id),
            title=f"{job.title} - {batch.name}",
            report_type="screening_summary",
            job_id=job.id,
            batch_id=batch.id,
            status=ReportStatus.GENERATING,
            parameters={"jobId": job.public_id, "batchId": batch.public_id},
            generated_by_id=actor.id if actor else None,
        )
        db.add(report)
        db.flush()
    else:
        report.title = f"{job.title} - {batch.name}"
        report.job_id = job.id
        report.parameters = {"jobId": job.public_id, "batchId": batch.public_id}
        report.generated_by_id = actor.id if actor else report.generated_by_id
    return refresh_report(db, report)


def backfill_batch_reports(db: Session, *, organization_id, actor: User | None) -> list[Report]:
    batches = db.scalars(
        select(ScreeningBatch)
        .where(ScreeningBatch.organization_id == organization_id, ScreeningBatch.processed_files > 0)
        .order_by(ScreeningBatch.created_at)
    ).all()
    reports = []
    for batch in batches:
        job = db.get(JobOpening, batch.job_id)
        if job:
            reports.append(create_or_refresh_batch_report(db, batch=batch, job=job, actor=actor))
    return reports


def _next_report_id(db: Session, organization_id) -> str:
    number = (db.scalar(select(func.count()).select_from(Report).where(Report.organization_id == organization_id)) or 0) + 1
    public_id = f"RPT-{number:03d}"
    while db.scalar(select(Report.id).where(Report.organization_id == organization_id, Report.public_id == public_id)):
        number += 1
        public_id = f"RPT-{number:03d}"
    return public_id


def _clean_skill_names(values: list | None) -> list[str]:
    return [str(value).strip() for value in (values or []) if str(value).strip()]


def _skill_summary(counter: Counter, candidate_count: int) -> list[dict]:
    return [
        {
            "label": label,
            "count": count,
            "percentage": round(count * 100 / candidate_count) if candidate_count else 0,
        }
        for label, count in counter.most_common(5)
    ]
