from sqlalchemy.orm import Session
from fastapi import Request
from app.models.audit_log import AuditLog
from typing import Optional, Any

def log_activity(
    db: Session,
    action: str,
    target_table: Optional[str] = None,
    target_id: Optional[int] = None,
    description: Optional[str] = None,
    user_id: Optional[int] = None,
    log_type: str = "operation",
    old_values: Optional[Any] = None,
    new_values: Optional[Any] = None,
    request: Optional[Request] = None
):
    ip_address = None
    user_agent = None
    if request:
        # Extract actor ID from header X-User-Id if not explicitly provided
        if user_id is None:
            actor_id_str = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
            if actor_id_str:
                try:
                    user_id = int(actor_id_str)
                except ValueError:
                    pass
        
        # Capture IP & User Agent
        if request.client:
            ip_address = request.client.host
        user_agent = request.headers.get("user-agent")

    db_log = AuditLog(
        user_id=user_id,
        action=action,
        target_table=target_table,
        target_id=target_id,
        description=description,
        ip_address=ip_address,
        user_agent=user_agent,
        log_type=log_type,
        old_values=old_values,
        new_values=new_values
    )
    
    try:
        db.add(db_log)
        db.commit()
        db.refresh(db_log)
    except Exception as e:
        db.rollback()
        # Fallback print or logging in case of DB write failures
        print(f"Error creating audit log: {e}")
        
    return db_log
