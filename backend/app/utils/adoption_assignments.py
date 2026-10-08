"""
Adoption task assignments: create / reassign / accept / decline / cancel / complete.
All state changes run under a row lock on the application so only one active assignment exists per task.
Authorization is decided by app.utils.adoption_authority; this module assumes the caller was authorized.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.report import Adoption, AdoptionAssignment, AdoptionMonitoringLog
from app.models.user import User
from app.utils.adoption_authority import is_case_closed, open_assignment, validate_assignee

TASK_LABELS = {
    "Verification": "Document Verification",
    "Interview": "Adoption Interview",
    "Home_Visit": "Home Visit",
    "Handover": "Pet Handover",
    "Monitoring": "Post-Adoption Monitoring",
    "Other": "Adoption Task",
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pet(app: Adoption) -> str:
    return (app.animal.animal_name if app.animal and app.animal.animal_name else None) or f"Rescue #{app.holding_id}"


def notify(db: Session, user_id: Optional[int], kind: str, adoption_id: int, title: str, message: str) -> None:
    if not user_id:
        return
    db.add(Notification(user_id=user_id, title=title[:255], message=message[:1000],
                        notification_type=kind, related_id=adoption_id, is_read=False))


def lock_adoption(app: Adoption, db: Session) -> None:
    """Serialize assignment changes for one application (no-op on SQLite)."""
    db.query(Adoption.adoption_id).filter(Adoption.adoption_id == app.adoption_id).with_for_update().first()


def assign_task(db: Session, app: Adoption, task_type: str, target: Optional[User], actor: User,
                scheduled_at: Optional[datetime] = None, due_at: Optional[datetime] = None,
                monitoring_log_id: Optional[int] = None, remarks: Optional[str] = None) -> AdoptionAssignment:
    """
    Assign (or reassign) a task. The previous open assignment for the same task is marked Reassigned.
    Re-assigning the same person keeps the existing assignment (only the schedule is refreshed).
    """
    if task_type not in TASK_LABELS:
        raise HTTPException(status_code=400, detail="Unknown task type.")
    if is_case_closed(app):
        raise HTTPException(status_code=409, detail="This application is closed; tasks can no longer be assigned.")
    target = validate_assignee(target, app, db)
    already_done = db.query(AdoptionAssignment.assignment_id).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.task_type == task_type,
        AdoptionAssignment.monitoring_log_id == monitoring_log_id,
        AdoptionAssignment.status == "Completed",
    ).first()
    if already_done is not None:
        raise HTTPException(status_code=409, detail=f"The {TASK_LABELS[task_type].lower()} is already completed and cannot be assigned again.")
    if monitoring_log_id is not None:
        log = db.query(AdoptionMonitoringLog).filter(AdoptionMonitoringLog.log_id == monitoring_log_id).first()
        if not log or log.adoption_id != app.adoption_id or task_type != "Monitoring":
            raise HTTPException(status_code=400, detail="That monitoring milestone does not belong to this application.")

    lock_adoption(app, db)
    current = open_assignment(app, task_type, db, monitoring_log_id=monitoring_log_id, lock=True)
    if current is not None and current.monitoring_log_id != monitoring_log_id:
        current = None  # a period-wide Monitoring assignment is not replaced by a milestone-specific one
    if current is not None and current.assigned_to == target.user_id:
        if scheduled_at is not None:
            current.scheduled_at = scheduled_at
        if due_at is not None:
            current.due_at = due_at
        if remarks:
            current.remarks = remarks
        return current

    label = TASK_LABELS[task_type]
    if current is not None:
        current.status = "Reassigned"
        current.cancelled_at = _now()
        notify(db, current.assigned_to, "adoption_task_reassigned", app.adoption_id,
               f"Task reassigned: {label}",
               f"Your {label.lower()} task for {app.full_name}'s application ({_pet(app)}) was reassigned to {target.name}.")

    self_assigned = target.user_id == actor.user_id  # an officer taking the task themselves needs no acceptance
    asg = AdoptionAssignment(
        adoption_id=app.adoption_id, task_type=task_type, monitoring_log_id=monitoring_log_id,
        assigned_to=target.user_id, assigned_to_name=target.name, assigned_by=actor.user_id,
        status="Accepted" if self_assigned else "Assigned", accepted_at=_now() if self_assigned else None,
        scheduled_at=scheduled_at, due_at=due_at, remarks=remarks,
    )
    db.add(asg)
    db.flush()
    if self_assigned:
        return asg
    when = f" Scheduled: {scheduled_at.strftime('%b %d, %Y %I:%M %p')}." if scheduled_at else ""
    notify(db, target.user_id, "adoption_task_assigned", app.adoption_id,
           f"New adoption task: {label} 📋",
           f"{actor.name} assigned you the {label.lower()} for {app.full_name}'s application ({_pet(app)}).{when} "
           f"Open Adoption Tasks to accept it.")
    return asg


def accept_task(db: Session, asg: AdoptionAssignment, user: User) -> AdoptionAssignment:
    if asg.status != "Assigned":
        raise HTTPException(status_code=409, detail=f"This task is already {asg.status.replace('_', ' ').lower()}.")
    asg.status = "Accepted"
    asg.accepted_at = _now()
    app = asg.adoption
    notify(db, asg.assigned_by, "adoption_task_accepted", asg.adoption_id,
           f"Task accepted: {TASK_LABELS[asg.task_type]}",
           f"{user.name} accepted the {TASK_LABELS[asg.task_type].lower()} for {app.full_name}'s application ({_pet(app)}).")
    return asg


def decline_task(db: Session, asg: AdoptionAssignment, user: User, reason: str) -> AdoptionAssignment:
    if asg.status != "Assigned":
        raise HTTPException(status_code=409, detail="Only a task that has not been accepted yet can be declined.")
    asg.status = "Declined"
    asg.declined_at = _now()
    asg.decline_reason = reason.strip()
    app = asg.adoption
    owner_id = app.case_owner_id or asg.assigned_by
    notify(db, owner_id, "adoption_task_declined", asg.adoption_id,
           f"Task declined: {TASK_LABELS[asg.task_type]} ⚠️",
           f"{user.name} declined the {TASK_LABELS[asg.task_type].lower()} for {app.full_name}'s application "
           f"({_pet(app)}). Reason: {asg.decline_reason}. Please reassign it.")
    return asg


def cancel_task(db: Session, asg: AdoptionAssignment, actor: User, reason: Optional[str] = None) -> AdoptionAssignment:
    if asg.status not in ("Assigned", "Accepted", "In_Progress"):
        raise HTTPException(status_code=409, detail="Only an open task can be cancelled.")
    asg.status = "Cancelled"
    asg.cancelled_at = _now()
    if reason:
        asg.remarks = ((asg.remarks or "") + f"\nCancelled: {reason}").strip()
    notify(db, asg.assigned_to, "adoption_task_cancelled", asg.adoption_id,
           f"Task cancelled: {TASK_LABELS[asg.task_type]}",
           f"{actor.name} cancelled your {TASK_LABELS[asg.task_type].lower()} task for {asg.adoption.full_name}'s application.")
    return asg


def complete_task(db: Session, asg: Optional[AdoptionAssignment], actor: User) -> None:
    """Called by the stage endpoints after the assessment/action was recorded."""
    if asg is None or asg.status in ("Completed", "Cancelled", "Reassigned", "Declined"):
        return
    asg.status = "Completed"
    asg.completed_at = _now()
    app = asg.adoption
    owner_id = app.case_owner_id or asg.assigned_by
    if owner_id and owner_id != actor.user_id:
        notify(db, owner_id, "adoption_task_completed", asg.adoption_id,
               f"Task completed: {TASK_LABELS[asg.task_type]} ✅",
               f"{actor.name} completed the {TASK_LABELS[asg.task_type].lower()} for {app.full_name}'s application ({_pet(app)}).")


def mark_in_progress(asg: Optional[AdoptionAssignment]) -> None:
    if asg is not None and asg.status == "Accepted":
        asg.status = "In_Progress"


def close_open_tasks(db: Session, app: Adoption, outcome: str) -> None:
    """
    Reject/Cancel -> open tasks Cancelled and an already-issued certificate is Revoked;
    Completed case -> remaining open tasks Completed.
    """
    cert = app.certificate
    if outcome != "Completed" and cert is not None and cert.certificate_status != "Revoked":
        cert.certificate_status = "Revoked"
        cert.revoked_at = _now()
        cert.revoked_reason = f"Application {outcome.lower()}"
    rows = db.query(AdoptionAssignment).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.status.in_(("Assigned", "Accepted", "In_Progress")),
    ).all()
    for asg in rows:
        if outcome == "Completed":
            asg.status, asg.completed_at = "Completed", _now()
        else:
            asg.status, asg.cancelled_at = "Cancelled", _now()
            notify(db, asg.assigned_to, "adoption_task_cancelled", app.adoption_id,
                   f"Task closed: {TASK_LABELS[asg.task_type]}",
                   f"{app.full_name}'s application was {outcome.lower()}; your {TASK_LABELS[asg.task_type].lower()} task is closed.")
