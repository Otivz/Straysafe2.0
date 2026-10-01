from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from math import ceil
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.utils.auth import get_optional_user

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

class PaginatedAuditLogResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    limit: int
    total_pages: int

    class Config:
        from_attributes = True


@router.get("/", response_model=PaginatedAuditLogResponse)
def get_audit_logs(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    log_type: Optional[str] = Query(None, description="Filter by log_type (security, operation, system)"),
    search: Optional[str] = Query(None, description="Search term across user, action, description, table"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    if not current_user or current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin role required"
        )

    query = db.query(AuditLog, User.name).outerjoin(User, AuditLog.user_id == User.user_id)

    # 1. Filter by log_type
    if log_type and log_type.lower() != "all":
        query = query.filter(AuditLog.log_type == log_type.lower())

    # 2. Search filtering
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.action.ilike(term),
                AuditLog.description.ilike(term),
                AuditLog.target_table.ilike(term),
                User.name.ilike(term)
            )
        )

    # 3. Total count for pagination
    total = query.with_entities(func.count(AuditLog.log_id)).scalar() or 0
    total_pages = ceil(total / limit) if total > 0 else 1

    # 4. Paginated records
    offset = (page - 1) * limit
    logs = (
        query
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for log, user_name in logs:
        actor = user_name if user_name else (
            "Unknown" if log.user_id is None else f"User #{log.user_id}"
        )

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

    return {
        "items": result,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }
