# Navicat + PostgreSQL Setup

PostgreSQL is the database server. Navicat is the desktop client used to inspect and manage that server. The project runs PostgreSQL 16 in Docker and exposes it to Navicat on the local machine.

Navicat connects in exactly the same way to a native or containerized PostgreSQL server. It does not replace SQLAlchemy models or Alembic migrations. Keep Docker PostgreSQL during development because this workstation currently has no native PostgreSQL Windows service; Next.js and FastAPI still run directly on Windows. Full application containerization remains a deployment step for later.

## 1. Start PostgreSQL

Open Docker Desktop, then run from the project root:

```powershell
docker compose up -d postgres
docker compose ps
```

The `talentscreen-postgres` row must show `healthy`.

## 2. Create The Navicat Connection

In Navicat:

1. Select `Connection` > `PostgreSQL`.
2. Enter connection name `TalentScreen Local`.
3. Enter host `127.0.0.1`.
4. Enter port `5432`.
5. Enter initial database `talentscreen`.
6. Enter username `talentscreen_app`.
7. Enter the value of `POSTGRES_PASSWORD` from the project root `.env` file.
8. Leave SSL disabled for this local Docker connection.
9. Select `Test Connection`, then `OK`.

After connecting, open `talentscreen` > `Schemas` > `public` > `Tables`.

## 3. Apply Schema Migrations

Run from the backend folder whenever migrations change:

```powershell
cd C:\xampp\htdocs\CAPSTONE1\Thay_DUC\TalentScreen_AI\backend
.\.venv311\Scripts\python.exe -m alembic upgrade head
.\.venv311\Scripts\python.exe -m alembic check
```

`alembic check` should report `No new upgrade operations detected.` Refresh the `Tables` node in Navicat after migration.

## 4. Load Development Data

```powershell
.\.venv311\Scripts\python.exe -m app.db.seed
```

The command is idempotent. Running it again does not duplicate the demo organization.

Development login:

```text
Email: huuphuc2812005@gmail.com
Password: 123456
```

These credentials are local development data only.

## 5. Verify In Navicat

Create a new query in the `talentscreen` database and run:

```sql
SELECT current_database(), current_user, version();

SELECT version_num
FROM alembic_version;

SELECT public_id, title, status
FROM job_openings
ORDER BY public_id;

SELECT public_id, full_name, current_title
FROM candidates
ORDER BY public_id;
```

Expected initial data includes 4 jobs, 69 normalized skills, 2 candidates, 2 applications, one screening batch, and one report.

## 6. Run The API

```powershell
cd C:\xampp\htdocs\CAPSTONE1\Thay_DUC\TalentScreen_AI\backend
.\.venv311\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Useful URLs:

- API health: `http://127.0.0.1:8000/api/v1/health`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

Use `/api/v1/auth/login` in Swagger first. Copy `accessToken`, select `Authorize`, and enter only the token value.

## Troubleshooting

`Connection refused`: start Docker Desktop, run `docker compose up -d postgres`, and confirm the container is healthy.

`Port 5432 is already in use`: change `POSTGRES_PORT` in `.env`, update the port portion of `DATABASE_URL`, recreate only the PostgreSQL container, and use that same port in Navicat.

`Password authentication failed`: verify the values in `.env`. PostgreSQL credentials are initialized when the Docker volume is first created, so changing `.env` later does not rewrite an existing database user's password.

Do not edit production tables manually in Navicat. Schema changes belong in SQLAlchemy models and Alembic migrations so the code, database, tests, and Swagger contract stay synchronized.
