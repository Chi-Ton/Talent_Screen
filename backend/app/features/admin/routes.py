from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Role, Team, User, UserRole
from app.db.models.common import AuditOutcome
from app.db.session import get_db
from app.features.auth.dependencies import require_permissions

router = APIRouter()


@router.get("/audit-logs")
def list_audit_logs(
    search: str | None = None,
    action: str | None = None,
    outcome: AuditOutcome | None = None,
    date_from: datetime | None = Query(default=None, alias="dateFrom"),
    date_to: datetime | None = Query(default=None, alias="dateTo"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions("audit.read")),
) -> list[dict]:
    query = select(AuditLog).where(AuditLog.organization_id == user.organization_id)
    if search:
        query = query.where(or_(AuditLog.actor_identity.ilike(f"%{search}%"), AuditLog.resource_id.ilike(f"%{search}%"), AuditLog.trace_id.ilike(f"%{search}%")))
    if action:
        query = query.where(AuditLog.action == action)
    if outcome:
        query = query.where(AuditLog.outcome == outcome)
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)
    entries = db.scalars(query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)).all()
    return [{"id": str(entry.id), "actor": entry.actor_identity, "actorRole": entry.actor_role, "action": entry.action, "resourceType": entry.resource_type, "resourceId": entry.resource_id, "outcome": entry.outcome.value, "ipAddress": entry.ip_address, "traceId": entry.trace_id, "correlationId": entry.correlation_id, "changes": entry.changes, "integrityHash": entry.integrity_hash, "createdAt": entry.created_at.isoformat(), "retentionUntil": entry.retention_until.isoformat()} for entry in entries]


@router.get("/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(require_permissions("users.manage"))) -> list[dict]:
    users = db.scalars(select(User).where(User.organization_id == user.organization_id).order_by(User.created_at.asc())).all()
    payload = []
    for account in users:
        role_names = db.scalars(select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == account.id)).all()
        team = db.get(Team, account.team_id) if account.team_id else None
        payload.append({"id": account.public_id, "name": account.full_name, "email": account.email, "jobTitle": account.job_title, "status": account.status.value, "roles": role_names, "team": team.name if team else None, "lastActiveAt": account.last_active_at.isoformat() if account.last_active_at else None, "mfaEnabled": account.is_mfa_enabled})
    return payload
