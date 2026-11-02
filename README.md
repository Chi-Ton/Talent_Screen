# TalentScreen AI

This directory is the runnable project root. Commands in this document should be
run from `C:\\xampp\\htdocs\\CAPSTONE1\\Thay_DUC\\TalentScreen_AI` unless a
different directory is shown explicitly.

A private CV evaluation and comparison tool for one HR administrator. The primary flow is `/screen` -> processing -> `/results` -> `/compare`. Gemini extracts evidence from a PII-redacted document; backend code owns the final score and recommendation.

Current implementation and verification status: [Project Status](docs/project-standards/PROJECT_STATUS.md). Read it before using the 9-table or Module View diagrams as an as-built architecture reference.

The running database design is [Compact v2: nine application tables](docs/database/compact-v2/README.md). The previous 37-table data is archived; see the [cutover record](docs/database/compact-v2/CUTOVER_READINESS.md).

## Structure

```text
frontend/   Next.js user interface
backend/    FastAPI API and screening services
docs/api/   Swagger/OpenAPI contract
dataset/    Prepared IT resume dataset and sample job descriptions
scripts/    Dataset, schema, release, and smoke-test utilities
uploads/    Local CV storage; never commit real candidate files
```

## Architecture

- Modular monolith: Next.js + FastAPI + PostgreSQL 16.
- Relational PostgreSQL tables are the source of truth.
- A denormalized PostgreSQL JSONB `screening_document` is the single read model sent to the AI adapter.
- Default routed model: `ag/gemini-3.8-flash`.
- Current privacy mode: `redacted_remote`. Direct PII is removed locally, but this is not proof of provider zero-data-retention.
- Original CV files stay in approved local folders. An authenticated HR user can download a source CV for evidence review; every download is job-scoped, access-controlled, and written to the audit log.

Start with the [Architecture document index](docs/architecture/README.md), then read the [course theory knowledge base](docs/architecture/00-course-theory/ARCHITECTURE_KNOWLEDGE_BASE.md), [Architecture Drivers](docs/architecture/01-drivers-add/ARCHITECTURE_DRIVERS.md), [Attribute-Driven Design](docs/architecture/01-drivers-add/ATTRIBUTE_DRIVEN_DESIGN.md), [C4 Model](docs/architecture/02-views/C4_MODEL.md), [Database Architecture](docs/architecture/03-data-security/DATABASE_ARCHITECTURE.md), and [Security and Privacy](docs/architecture/03-data-security/SECURITY_AND_PRIVACY.md).

For a fresh agent session, read [Agent Reload Context](docs/project-standards/AGENT_RELOAD_CONTEXT.md), [Technology And Language Standard](docs/project-standards/TECHNOLOGY_LANGUAGE_STANDARD.md), and [Project Context Guardrail](docs/project-standards/PROJECT_CONTEXT_GUARDRAIL.md). Project-specific skills are installed in `C:\\xampp\\htdocs\\CAPSTONE1\\.agents\\skills\\talentscreen-ai-*`.

## First Run

PostgreSQL (current recommended local setup):

```powershell
docker compose up -d postgres
cd backend
.\.venv311\Scripts\python.exe -m pip install -r requirements.txt
.\.venv311\Scripts\python.exe -m alembic upgrade e812d7c490ab
.\.venv311\Scripts\python.exe -m app.compact.bootstrap
.\.venv311\Scripts\python.exe -m alembic upgrade head
.\.venv311\Scripts\python.exe -m scripts.verify_live_compact
```

For a fresh database, set `HR_EMAIL` and `HR_PASSWORD` in the private backend
environment before running bootstrap. For a populated legacy database, first
verify database and upload backups; only then set `TALENTSCREEN_RETIRE_LEGACY=1`
for the final `alembic upgrade head`. Do not use `app.db.seed` after cutover.

Docker is used only to run PostgreSQL on this workstation. The frontend and backend run directly on Windows. A native PostgreSQL 16 installation can be substituted by using the same `.env` connection values; do not run both servers on port 5432.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
py -3.11 -m venv .venv311
.venv311\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The command above intentionally omits `--reload`, which can fail on some Windows setups because the reloader creates extra processes and named pipes. Stop the existing backend with `Ctrl+C` before starting another process on port `8000`.

Open `http://127.0.0.1:8000/docs` for Swagger UI and `http://localhost:3000/screen` for the HR workflow.

API contract:

```text
docs/api/swagger.json
```

Regenerate it after API changes:

```powershell
cd backend
.\.venv311\Scripts\python.exe -m scripts.export_openapi
```

Navicat setup is documented in `docs/database/NAVICAT_POSTGRESQL_SETUP.md`. Database architecture and the core ERD are documented in `docs/architecture/03-data-security/DATABASE_ARCHITECTURE.md`.
