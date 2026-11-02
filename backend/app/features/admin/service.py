import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import AuditLog, User
from app.db.models.common import AuditOutcome


def append_audit_log(
    db: Session,
    *,
    organization_id: UUID,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: str | None,
    trace_id: str,
    outcome: AuditOutcome = AuditOutcome.SUCCESS,
    changes: dict | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    now = datetime.now(timezone.utc)
    integrity_source = json.dumps({"action": action, "resource": resource_id, "traceId": trace_id, "createdAt": now.isoformat()}, sort_keys=True)
    entry = AuditLog(
        organization_id=organization_id,
        actor_user_id=actor.id if actor else None,
        actor_identity=actor.email if actor else "system",
        actor_role=None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        outcome=outcome,
        ip_address=ip_address,
        user_agent=user_agent,
        trace_id=trace_id,
        correlation_id=trace_id,
        changes=changes or {},
        metadata_json=metadata or {},
        integrity_hash=hashlib.sha256(integrity_source.encode("utf-8")).hexdigest(),
        created_at=now,
        retention_until=now + timedelta(days=365 * 7),
    )
    db.add(entry)
    return entry
