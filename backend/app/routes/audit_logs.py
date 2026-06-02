from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(
    prefix="/audit-logs",
    tags=["audit-logs"]
)

class AuditLogResponse(BaseModel):
    id: int
    user: str
    action: str
    table: str
    description: str
    timestamp: str
    ip: str
    type: str
    oldValues: Optional[dict] = None
    newValues: Optional[dict] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[AuditLogResponse])
def get_audit_logs(db: Session = Depends(get_db)):
    logs = (
        db.query(AuditLog, User.name)
        .outerjoin(User, AuditLog.user_id == User.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(500)
        .all()
    )

    result = []
    for log, user_name in logs:
        actor = user_name if user_name else (
            "Unknown" if log.user_id is None else f"User #{log.user_id}"
        )

        # Format timestamp consistently
        ts = log.created_at
        if isinstance(ts, datetime):
            timestamp_str = ts.strftime("%Y-%m-%d %H:%M:%S")
        else:
            timestamp_str = str(ts) if ts else ""

        result.append(AuditLogResponse(
            id=log.log_id,
            user=actor,
            action=log.action or "",
            table=log.target_table or "",
            description=log.description or "",
            timestamp=timestamp_str,
            ip=log.ip_address or "",
            type=log.log_type or "operation",
            oldValues=log.old_values if isinstance(log.old_values, dict) else None,
            newValues=log.new_values if isinstance(log.new_values, dict) else None,
        ))
    return result
