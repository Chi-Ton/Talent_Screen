# Compact-v2 cutover record

Completed 2026-09-23 on the local development and separate Docker release databases. This record contains aggregate counts only.

## Data decision

The selected single-HR account and target-role catalog were imported into `compact_v2`: five roles in development, four in release. Legacy screening history was **not** mapped to new result IDs. Preflight found one orphan result and 16 results without the original AI input snapshot, so silently importing their scores would violate the exact-source and evidence-grounding requirements. Development history and 43 local upload files remain in the verified pre-cutover archive. Release had zero CVs/results at cutover.

## Verified backups

- Development database: `backups/talentscreen-precutover-2026-09-23.dump`.
- Development files: `backups/uploads-precutover-2026-09-23/` (43 files).
- Release database: `backups/talentscreen-release-precutover-2026-09-23.dump`.
- Release files: `backups/uploads-release-precutover-2026-09-23/` (no database-linked CVs).
- Both database dumps were restored into separate disposable databases and their target-role counts checked before retiring old tables. Do not delete these backups or development/release volumes.

## Cutover result

1. `c624f0e2159a` staged the nine-table schema and `e812d7c490ab` pinned trigger search paths.
2. `python -m app.compact.bootstrap` imported the selected HR and rubric catalog.
3. `f50b72c6d913` retired exactly the reviewed 37 public application tables, with `TALENTSCREEN_RETIRE_LEGACY=1` required for a populated legacy database.
4. `/api/v1` now uses only the compact router. `docs/api/swagger.json` was regenerated from it.
5. Development and release each report nine compact tables, two views and only `alembic_version` in `public`; both API health checks pass.
6. Fresh-install rehearsal in a disposable database leaves the same nine-table runtime.

## Repeatable checks

From `backend/` run `python -m scripts.verify_live_compact`, `python -m scripts.verify_compact_schema`, `python -m scripts.verify_compact_api`, and `python -m pytest -q`. The isolated API verifier uses synthetic CVs and a mocked provider; it sends no candidate data to 9Router.

The old ORM metadata is retired, so `alembic check` autogeneration is intentionally not the compact schema validator. Hand-review SQL migrations and run the checks above. Restore from the database dump **and corresponding file archive** if a rollback of historical data is required; the final retirement migration has no automatic downgrade.
