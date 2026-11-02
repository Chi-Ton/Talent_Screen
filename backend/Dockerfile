FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/alembic.ini ./
COPY docs/database/compact-v2/schema.sql /app/docs/database/compact-v2/schema.sql
COPY dataset/hr_standards /app/dataset/hr_standards
COPY dataset/sample_job_descriptions /app/dataset/sample_job_descriptions
RUN useradd --uid 10001 --create-home appuser && mkdir -p /app/uploads && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "python -m alembic upgrade e812d7c490ab && python -m app.compact.bootstrap && python -m alembic upgrade head && exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
