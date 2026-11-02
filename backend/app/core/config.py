from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    database_url: str = "postgresql+psycopg://talentscreen_app:TalentScreenLocal2026@127.0.0.1:5432/talentscreen"
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    frontend_origin: str = "http://localhost:3000"
    ai_provider: str = "disabled"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_timeout_seconds: float = Field(default=45, gt=0, le=300)
    ai_retry_count: int = Field(default=2, ge=0, le=5)
    ai_prompt_version: str = "v2-grounded"
    ai_max_resume_chars: int = Field(default=30000, ge=1000, le=100000)
    ai_privacy_mode: str = "redacted_remote"
    ai_store_extracted_text: bool = False
    cv_retention_days: int = Field(default=30, ge=1, le=3650)

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
