from collections.abc import Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import Permission, RolePermission, User, UserRole
from app.db.models.common import UserStatus
from app.db.session import get_db

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="bearerAuth", description="JWT access token returned by /auth/login.")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AppError("AUTH_REQUIRED", "Authentication is required.", status_code=401)
    settings = get_settings()
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
    except jwt.InvalidTokenError as exc:
        raise AppError("INVALID_TOKEN", "The access token is invalid or expired.", status_code=401) from exc
    user = db.get(User, user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise AppError("INVALID_TOKEN", "The access token is invalid or expired.", status_code=401)
    return user


def require_permissions(*required_codes: str) -> Callable:
    def permission_dependency(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        granted = set(db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .where(UserRole.user_id == user.id)
        ))
        missing = set(required_codes) - granted
        if missing:
            raise AppError("FORBIDDEN", "You do not have permission for this action.", status_code=403, details={"requiredPermissions": sorted(missing)})
        return user

    return permission_dependency
