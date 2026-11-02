# Local Docker deployment

Requires Docker Engine/Desktop with Linux containers and Compose v2. Initial build
requires internet. Run commands from the project root. Frontend and backend run
inside containers; installing Node or PostgreSQL on the destination host is unnecessary.

## Initialize

Copy `.env.release.example` to `.env.release`, replace all three password/secret
placeholders with independent random values. Use URL-safe letters and digits for
the database password. Alternatively, run `python scripts/init_release.py`.
Keep `.env.release` private. The HR account is created only on first initialization;
changing HR_PASSWORD later does not change an existing account password.
Fresh installation creates `compact_v2`, bootstraps the one HR account, then
retires 37 empty legacy tables. It ends with nine application tables and two
views. Do not run the old `app.db.seed`.

```powershell
docker compose --env-file .env.release -f compose.release.yml up -d --build --wait
docker compose --env-file .env.release -f compose.release.yml ps
```

Open http://localhost:3100/login. Credentials are HR_EMAIL and HR_PASSWORD in
`.env.release`. Change WEB_PORT when 3100 is occupied. Browser API calls use the
same origin, so no backend URL needs rebuilding when the web port changes.
Only the web port is published, bound to loopback for the single local HR.
Swagger is available at http://localhost:3100/docs and the runtime contract at
http://localhost:3100/openapi.json.

For an existing 37-table installation with data, first back up both PostgreSQL
and uploads and rehearse the restore. The migration stops unless
`TALENTSCREEN_RETIRE_LEGACY=1` is set for that one cutover run; see
`docs/database/compact-v2/CUTOVER_READINESS.md`. Never set the flag merely to
get a failed container to start. Historical CV/results are archived, not
silently assigned new result IDs.

## AI

AI starts disabled. Set AI_PROVIDER=9router, AI_API_KEY and AI_MODEL in `.env.release`.
For a router on the host, use http://host.docker.internal:20128/v1 (adjust its port).
The router must accept connections from the Docker network; host-loopback-only
listeners may not be reachable. Re-run `up -d --wait` after environment changes.
An OAuth/proxy connection is not proof of zero retention. Strict local privacy
blocks remote providers. No real resumes or development secrets are baked into images.

## Persistence and recovery

Named volumes keep database and uploaded CV files across container replacement.
The existing development PostgreSQL volume is separate. Do not use `down -v`
unless intentionally deleting release data.

```powershell
docker compose --env-file .env.release -f compose.release.yml restart
docker compose --env-file .env.release -f compose.release.yml logs --tail 100 backend
docker compose --env-file .env.release -f compose.release.yml down
```

For a consistent backup, stop backend before exporting PostgreSQL and archiving
the uploads volume together. Preserve `.env.release` securely. A database-only
backup cannot restore original CV files. Validate restoration on a separate project
before relying on backups.

## Scope of validation

Docker portability does not guarantee AI availability or extraction accuracy.
The isolated API evaluation covers synthetic CVs with a mocked provider;
real-world dataset and scanned PDF/OCR acceptance testing remain outstanding.
The current parser does not provide an OCR engine for image-only PDF files.
Windows Docker Desktop is the local validation environment; other hosts and CPU
architectures require their own build and acceptance run.
