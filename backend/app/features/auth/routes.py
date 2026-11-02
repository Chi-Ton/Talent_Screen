from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import create_access_token, verify_password
from app.db.models import Role, User, UserRole
from app.db.models.common import UserStatus
from app.db.session import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", status_code=401)
    if user.status != UserStatus.ACTIVE:
        raise AppError("ACCOUNT_UNAVAILABLE", "This account is not active.", status_code=403)
    roles = list(db.scalars(select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)))
    user.last_login_at = datetime.now(timezone.utc)
    user.last_active_at = user.last_login_at
    db.commit()
    return {
        "accessToken": create_access_token(str(user.id), {"org": str(user.organization_id), "roles": roles}),
        "tokenType": "bearer",
        "user": {
            "id": user.public_id,
            "name": user.full_name,
            "email": user.email,
            "role": roles[0] if roles else "hr_reviewer",
            "roles": roles,
        },
    }
