from collections.abc import Generator
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import SessionLocal


bearer = HTTPBearer(auto_error=False)
SCHEMA = "compact_v2"


def activate_schema(db: Session) -> None:
    if not SCHEMA.isidentifier():
        raise ValueError("Invalid compact schema")
    db.execute(text(f'SET LOCAL search_path TO "{SCHEMA}", pg_catalog'))


def get_compact_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        activate_schema(db)
        yield db


def current_hr(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_compact_db),
) -> dict:
    if credentials is None:
        raise AppError("UNAUTHORIZED", "Sign in to continue.", status_code=401)
    settings = get_settings()
    try:
        claims = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = UUID(str(claims["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise AppError("UNAUTHORIZED", "The session is invalid or expired.", status_code=401) from exc
    row = db.execute(text("SELECT id, email, full_name, token_version FROM users WHERE id=:id AND disabled_at IS NULL"), {"id": user_id}).mappings().first()
    if row is None or claims.get("tv") != row["token_version"]:
        raise AppError("UNAUTHORIZED", "The session is invalid or expired.", status_code=401)
    return dict(row)
