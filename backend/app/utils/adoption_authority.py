"""
Adoption authority: one place that decides who may see or act on an adoption application.

Roles inside a barangay
  - Case authority : the barangay's Head Officer (role 3 + is_head_officer) or an Admin (role 4).
  - Case owner     : the case authority responsible for the whole process (adoptions.case_owner_id).
                     Set by an explicit claim, or automatically on the first decision / assignment.
  - Assignee       : a staff member assigned a task (Interview, Home_Visit, Monitoring, ...).

Rules (all enforced on the backend; the frontend only mirrors them)
  - View   : Admin; the barangay's Head Officer; other barangay staff only when assigned to the case.
  - Decide : the case owner or Admin (an unowned case is auto-claimed by the deciding Head Officer).
  - Task   : the task's assignee once the task is accepted. The owner/Admin may act on an assigned task
             only with an override reason (audited). Unassigned tasks: case authority only.
  - Staff can never act on their own application; an unresolvable barangay fails closed.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.report import (
    ADOPTION_OPEN_ASSIGNMENT_STATUSES,
    Adoption,
    AdoptionAssignment,
    AdoptionOwnershipHistory,
    HoldingAnimal,
    Report,
)
from app.models.user import User

VISIBLE_ASSIGNMENT_STATUSES = ("Assigned", "Accepted", "In_Progress", "Completed")
CLOSED_APPLICATION_STATUSES = ("Rejected", "Cancelled")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def adoption_barangay_id(app: Optional[Adoption], db: Session) -> Optional[int]:
    """Barangay that owns an application: animal -> report -> subdivision -> barangay."""
    animal: Optional[HoldingAnimal] = app.animal if app else None
    if animal is None:
        return None
    report = db.query(Report).filter(Report.report_id == animal.report_id).first()
    return report.subdivision.barangay_id if report and report.subdivision else None


def is_case_authority(user: User) -> bool:
    return user.role_id == 4 or (user.role_id == 3 and bool(getattr(user, "is_head_officer", False)))


def in_adoption_barangay(user: User, app: Adoption, db: Session) -> bool:
    """Admin always; barangay staff only for their own (resolvable) barangay."""
    if user.role_id == 4:
        return True
    if user.role_id != 3 or user.barangay_id is None:
        return False
    barangay_id = adoption_barangay_id(app, db)
    return barangay_id is not None and barangay_id == user.barangay_id


def is_case_closed(app: Adoption) -> bool:
    return app.status in CLOSED_APPLICATION_STATUSES or app.current_stage == "Successful_Adoption"


def has_assignment(user: User, app: Adoption, db: Session, statuses=VISIBLE_ASSIGNMENT_STATUSES) -> bool:
    return db.query(AdoptionAssignment.assignment_id).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.assigned_to == user.user_id,
        AdoptionAssignment.status.in_(statuses),
    ).first() is not None


def can_view_adoption(user: User, app: Adoption, db: Session) -> bool:
    """Staff-side read access (applicant access is checked separately by the caller)."""
    if not in_adoption_barangay(user, app, db):
        return False
    return is_case_authority(user) or has_assignment(user, app, db)


def open_assignment(app: Adoption, task_type: str, db: Session, monitoring_log_id: Optional[int] = None,
                    lock: bool = False) -> Optional[AdoptionAssignment]:
    """The active assignment for a task. Monitoring: a milestone-specific one wins over the period-wide one."""
    q = db.query(AdoptionAssignment).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.task_type == task_type,
        AdoptionAssignment.status.in_(ADOPTION_OPEN_ASSIGNMENT_STATUSES),
    )
    if lock:
        q = q.with_for_update()
    rows = q.order_by(AdoptionAssignment.assigned_at.desc(), AdoptionAssignment.assignment_id.desc()).all()
    if task_type == "Monitoring" and monitoring_log_id is not None:
        specific = [a for a in rows if a.monitoring_log_id == monitoring_log_id]
        if specific:
            return specific[0]
        rows = [a for a in rows if a.monitoring_log_id is None]
    elif task_type == "Monitoring":
        rows = [a for a in rows if a.monitoring_log_id is None] or rows
    return rows[0] if rows else None


def latest_completed_assignment(app: Adoption, task_type: str, db: Session) -> Optional[AdoptionAssignment]:
    return db.query(AdoptionAssignment).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.task_type == task_type,
        AdoptionAssignment.status == "Completed",
    ).order_by(AdoptionAssignment.completed_at.desc(), AdoptionAssignment.assignment_id.desc()).first()


def record_ownership(db: Session, app: Adoption, to_user: Optional[User], action: str, performed_by: User,
                     reason: Optional[str] = None) -> None:
    db.add(AdoptionOwnershipHistory(
        adoption_id=app.adoption_id,
        from_user_id=app.case_owner_id,
        to_user_id=to_user.user_id if to_user else None,
        action=action,
        reason=reason,
        performed_by=performed_by.user_id,
    ))
    app.case_owner_id = to_user.user_id if to_user else None
    app.case_owner_assigned_at = _now() if to_user else None
    app.case_owner_assigned_by = performed_by.user_id if to_user else None


def ensure_owner(app: Adoption, user: User, db: Session, auto_action: str = "Auto_Claimed_On_Approval") -> None:
    """
    The caller must be the case owner (or Admin). A Head Officer acting on an unowned case becomes its owner.
    Admin never auto-claims (oversight does not take responsibility silently).
    """
    if user.role_id == 4:
        return
    if not is_case_authority(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Only the Barangay Head Officer or a System Administrator can make this adoption decision.",
        )
    if app.case_owner_id is None:
        record_ownership(db, app, user, auto_action, user)
        return
    if app.case_owner_id != user.user_id:
        owner = db.query(User).filter(User.user_id == app.case_owner_id).first()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This case is handled by {owner.name if owner else 'another officer'}. Ask them or an Administrator to transfer it.",
        )


def require_base_access(app: Adoption, user: User, db: Session) -> None:
    if not in_adoption_barangay(user, app, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: This adoption application belongs to another barangay or your role cannot manage adoptions.",
        )
    if user.role_id != 4 and app.applicant_id == user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Staff cannot process their own adoption application.",
        )


def require_task_actor(app: Adoption, user: User, db: Session, task_type: str,
                       override_reason: Optional[str] = None,
                       monitoring_log_id: Optional[int] = None) -> Optional[AdoptionAssignment]:
    """
    Authorize a task action and return the assignment it belongs to (None when the case authority acts on an
    unassigned task). Raises 403/409 with a message the UI can show as-is.
    """
    require_base_access(app, user, db)
    task_label = task_type.replace("_", " ").lower()
    asg = open_assignment(app, task_type, db, monitoring_log_id=monitoring_log_id)
    if asg is not None:
        if asg.assigned_to == user.user_id:
            if asg.status == "Assigned":
                raise HTTPException(status_code=409, detail=f"Accept this {task_label} task first (Adoption Tasks page).")
            return asg
        is_owner_or_admin = user.role_id == 4 or (is_case_authority(user) and app.case_owner_id in (None, user.user_id))
        if is_owner_or_admin and override_reason and override_reason.strip():
            return asg
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(f"This {task_label} is assigned to {asg.assigned_to_name or 'another staff member'}. "
                    + ("Provide an override reason to record it yourself." if is_owner_or_admin else "Only the assignee can record it.")),
        )
    # Not (or no longer) assigned
    if is_case_authority(user):
        if user.role_id != 4 and app.case_owner_id not in (None, user.user_id):
            ensure_owner(app, user, db)  # raises with the owner's name
        return None
    done = latest_completed_assignment(app, task_type, db)
    if done is not None and done.assigned_to == user.user_id:
        return done  # the assignee may correct the record they completed
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"This {task_label} is not assigned to you. Ask the Head Officer to assign it.",
    )


def validate_assignee(target: Optional[User], app: Adoption, db: Session) -> User:
    """Assignment targets: active Barangay Staff of the application's barangay who did not apply for it."""
    if target is None:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    barangay_id = adoption_barangay_id(app, db)
    if target.role_id != 3 or barangay_id is None or target.barangay_id != barangay_id:
        raise HTTPException(status_code=400, detail="Tasks can only be assigned to Barangay Staff of this application's barangay.")
    if (target.status or "Active") != "Active":
        raise HTTPException(status_code=400, detail=f"{target.name} is not an active staff member.")
    if target.user_id == app.applicant_id:
        raise HTTPException(status_code=400, detail="The applicant cannot be assigned to their own application.")
    return target
