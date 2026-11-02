# Mapping 37 application tables to compact-v2

Status 2026-09-23: application cutover completed at revision `f50b72c6d913`. Exactly 9 application tables remain in `compact_v2` plus Alembic's technical table. One HR and target-role/rubric catalog were imported. Historical CVs, results and other legacy records were archived in verified backup rather than assigned guessed result IDs; the mapping rules below describe requirements for any later selective restoration, not work already completed.

Read-only preflight on 2026-09-22 found 2 users (the selected HR owns all 5 jobs but another user owns 1 of 27 batches), 44 batch files, 28 checksum-valid CV sources, and 21 legacy results. Of those results, 1 has no batch-file FK and 16 have no AI input document. One resume is `application/msword`, which compact-v2 intentionally does not accept for new processing; 2 source paths are outside the managed uploads root. None has been removed or assigned a fabricated score. Re-run `python -m scripts.preflight_compact_v2 --operator-email <existing HR email>` from `backend/` before mapping.

## Complete source inventory

| Existing table | Target / disposition |
|---|---|
| `ai_provider_settings` | Backend config; record effective provider/model on each result; never export secrets into JSON |
| `application_stage_history` | Safe transition events in `audit_logs`; private notes in protected migration archive |
| `applications` | `batch_files` + `screening_results`; explicit old application ID -> new file/result ID manifest |
| `audit_logs` | `audit_logs`; preserve event IDs/times where possible; retain old immutable log in protected archive for any fields not kept |
| `batch_files` | `batch_files`; preserve upload-to-source link and original upload filename |
| `candidate_certifications` | Versioned `screening_results.grounded_profile.certifications`, only when source provenance is established |
| `candidate_educations` | `screening_results.grounded_profile.education`, same provenance rule |
| `candidate_experiences` | `screening_results.grounded_profile.experiences`, same provenance rule |
| `candidate_projects` | `screening_results.grounded_profile.projects`, same provenance rule |
| `candidate_skills` | `screening_results.grounded_profile.skills`, same provenance rule |
| `candidates` | Source-specific local identity in `resumes`; no global person merge; ambiguous identities require HR review |
| `disqualifier_rules` | `scoring_rubrics.config.disqualifiers` |
| `job_openings` | `job_openings`; scoring-relevant fields also snapshot into each rubric config |
| `job_skills` | `scoring_rubrics.config.jobSkills` |
| `notifications` | Derived in-app state; archive historical notifications if needed; no notification table in core |
| `organizations` | Remove single-tenant partition after checking source scope; more than one scope requires explicit migration resolution |
| `permissions` | Remove; one local operator policy |
| `reports` | Derived export from results; archive historical exported documents and parameters locally |
| `resumes` | `resumes`; exact checksum manifest for any blob deduplication; no name/email matching |
| `review_decisions` | Latest decision on `batch_files` linked to the exact reviewed result; historical safe events in audit, private notes archived |
| `review_queue_items` | `screening_results.outcome/review_reasons` plus HR decision; preserve review-required state |
| `role_permissions` | Remove under single-operator policy |
| `roles` | Remove under single-operator policy |
| `rubric_criteria` | `scoring_rubrics.config.criteria` with stable criterion codes |
| `score_breakdowns` | `screening_results.score_breakdown`, checked against pinned rubric |
| `scoring_rubrics` | `scoring_rubrics` immutable config snapshots |
| `screening_batches` | `screening_batches`; split legacy mixed-rubric batches with manifest if necessary |
| `screening_documents` | `screening_documents` immutable per-file snapshots; do not claim a historically overwritten payload is the original request |
| `screening_results` | `screening_results` append-only terminal attempts; preserve role/rubric/source/version provenance |
| `skill_aliases` | Versioned taxonomy within rubric config; approved baseline taxonomy remains a versioned seed asset |
| `skill_categories` | Same versioned taxonomy snapshot; no independent mutable classification joins |
| `skills` | Same versioned taxonomy snapshot; preserve canonical names and alias resolution |
| `teams` | Remove; archive old metadata only if required |
| `user_preferences` | `users.preferences` |
| `user_roles` | Remove; explicit one-user selection during migration |
| `user_sessions` | Revoke old sessions/tokens at cutover; JWT validation must check `users.token_version` |
| `users` | Exactly one active operator; preserve selected operator hash; historical actors represented by non-PII legacy ID in archive/audit |

## Data migration rules

1. Freeze ingestion and backup both DB and uploads before cutover. Restore into a disposable DB first. Do not truncate current tables or remove Docker volumes.
2. Materialize an encrypted/local mapping manifest for old UUIDs to new source/file/result/rubric UUIDs. The manifest is a migration artifact, not a tenth operational table. Do not use filename suffix or row order.
3. Validate every uploaded file checksum against disk. Missing/corrupt sources remain explicit exceptions; do not create invented successful evaluations.
4. Pin a rubric per new batch. If an old batch contains multiple rubric versions, split it and preserve the source batch ID in the migration manifest. For an old application without a batch, create a clearly labelled imported batch with verified role/rubric.
5. Use source-specific `resumes.parsed_profile` and evidence when verified. The current global candidate child tables can have been overwritten by another CV; do not blindly attach them to every historical result. Ambiguous historical facts require review or a fresh evaluation of the real local source.
6. Missing original AI payload/provider/prompt is `legacy_unknown` in the protected archive, not fabricated metadata in v2. Keep unverifiable historical scores readable in that archive; do not mark them as newly grounded `scored` results. Create queued/review items for re-evaluation where needed.
7. Preserve HR review against the exact result version. Do not attach an old decision to a newer rescore silently.
8. Reconcile accepted files, failures, successful assessments, hashes, job/rubric associations, exports and review decisions. Every source record must be mapped, explicitly archived or listed as an exception. No silent data loss.
9. Rebuild API contract and frontend links before enabling writes. Do not retain aliases that map a legacy candidate ID to the first result found. Legacy links with multiple results need an explicit chooser or a clear migration error.
10. Stop all v1 workers before switch. Verify login, upload, restart/retry, ranking, profile, original file download, compare and HR decision on the migrated disposable database. Only then repeat controlled cutover on the active database.

## Rollback gate

Rollback requires the pre-cutover database/upload snapshot and the previous application build. During the short acceptance window, keep ingestion paused; otherwise a rollback can lose newly accepted v2 uploads. After writes resume, use a separate reconciliation/export procedure for new work rather than blindly restoring an old backup.

The DDL verifier is not a historical data migration test. The current supported runtime is compact-v2; use the protected pre-cutover backup only for deliberate, evidence-verified historical restoration.
