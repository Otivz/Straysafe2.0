"""
Rules shared by the owner follow-up routes, the report-closure hook and the background watcher
(docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md: a complaint about a registered pet with a known owner).
Models are imported inside the functions: this module is loaded by utils/case_closure.py while app.models loads.
"""
import logging
from datetime import timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.utils.holding_stay import db_now

logger = logging.getLogger("stray_safe.owner_followups")

SETTING_KEY = "owner_followup_days"
DEFAULT_DAYS = 3
MIN_DAYS, MAX_DAYS = 1, 14
ESCALATED_STATUS_ID = 4
# A report already with the Barangay: escalated, rescue dispatched, picked up, approved
ESCALATED_PHASE_STATUS_IDS = (4, 5, 6, 13)
# A follow-up only starts on an open case whose animal is not held anywhere (7 and 8 are facility statuses)
NOT_ELIGIBLE_STATUS_IDS = (3, 7, 8, 9, 10, 11, 12, 14, 17, 18)
REMINDER_BEFORE = timedelta(days=1)


def followup_days(db: Session) -> int:
    """The observation length set by the administrator (default 3 days, 1 to 14)."""
    from app.models.system_setting import SystemSetting

    row = db.query(SystemSetting).filter(SystemSetting.setting_key == SETTING_KEY).first()
    try:
        days = int(row.setting_value) if row and row.setting_value else DEFAULT_DAYS
    except (TypeError, ValueError):
        days = DEFAULT_DAYS
    return max(MIN_DAYS, min(MAX_DAYS, days))


def is_escalated(report, db: Session) -> bool:
    """Same test as the status route uses for leaders: an endorsement, a rescue request or an escalated-phase status."""
    from app.models.report import Rescue

    if report.endorsement_letter is not None or report.current_status_id in ESCALATED_PHASE_STATUS_IDS:
        return True
    return db.query(Rescue.rescue_id).filter(Rescue.report_id == report.report_id).first() is not None


def owner_snapshot(report, db: Session) -> Optional[Tuple[Optional[int], Optional[str], Optional[str]]]:
    """
    (owner_user_id, name, phone) of the report's registered pet, or None when the report has no pet with an owner.
    The same sources as the report page: the owner account, else the owner without an account on the pet record.
    """
    from app.models.pet import Pet
    from app.models.user import User

    pet = db.get(Pet, report.pet_id) if report.pet_id else None
    if pet is None:
        return None
    if pet.owner_id:
        owner = db.get(User, pet.owner_id)
        if owner is not None:
            return owner.user_id, owner.name, owner.phone
    name = (pet.emergency_contact_name or "").strip()
    if name:
        return None, name, (pet.emergency_contact_phone or None)
    return None


def start_refusal(report, user, db: Session) -> Optional[str]:
    """Why this leader cannot start a follow-up on this report, or None when they can (plan section 4.2)."""
    from app.models.owner_followup import OwnerFollowUp
    from app.utils.report_split import is_split_group

    if user.role_id != 2 or report.subdivision_id != user.subdivision_id:
        return "Only the Subdivision Leader of the report's subdivision can start an owner follow-up."
    if report.assigned_leader_id != user.user_id:
        return "Claim this report first: only the leader handling it can start an owner follow-up."
    if report.current_status_id in NOT_ELIGIBLE_STATUS_IDS or report.duplicate_of_report_id:
        return "This report is closed, merged or its animal is held in a facility, so it cannot be observed."
    if report.facility_id:
        return "The animal is held in a facility, so it cannot be observed."
    if is_escalated(report, db):
        return "This report is already with the Barangay."
    if is_split_group(db, report):
        return "This is a group report: start a follow-up on an animal's own record."
    if owner_snapshot(report, db) is None:
        return "An owner follow-up needs a registered pet with an owner linked to this report."
    if db.query(OwnerFollowUp.followup_id).filter(
            OwnerFollowUp.report_id == report.report_id, OwnerFollowUp.status == "Observing").first():
        return "This report already has an owner follow-up under observation."
    return None


def end_open_followups(session: Session, report_id: int, new_status_id: int) -> int:
    """
    The report was closed, merged or escalated while a follow-up was observing it (any path, see case_closure):
    the follow-up ends too. The follow-up's own close endpoint sets its outcome after the status change.
    """
    from app.models.owner_followup import OwnerFollowUp

    with session.no_autoflush:
        rows = session.query(OwnerFollowUp).filter(
            OwnerFollowUp.report_id == report_id, OwnerFollowUp.status == "Observing").all()
        if not rows:
            return 0
        now = db_now(session)
        for f in rows:
            f.closed_at = now
            if new_status_id == ESCALATED_STATUS_ID:
                f.status = "Escalated"
                f.closing_outcome = "Escalated to the Barangay"
                f.closing_reason = f"Report #{report_id} was escalated to the Barangay."
            else:
                f.status = "Report Closed"
                f.closing_outcome = f"Report status {new_status_id}"
                f.closing_reason = f"Report #{report_id} was closed (status {new_status_id}) while it was under observation."
    return len(rows)


def _leader_ids(f) -> list:
    report = f.report
    ids = {report.assigned_leader_id} if report is not None and report.assigned_leader_id else set()
    if not ids and f.opened_by:
        ids = {f.opened_by}
    return sorted(ids)


def check_and_notify_due_followups(session: Optional[Session] = None) -> int:
    """
    Background watcher: one reminder to the owner (with an account, not yet acknowledged) a day before the due time,
    and one notice to the leader when the period ends. Nothing is closed or escalated here: the leader decides.
    """
    from app.database import SessionLocal
    from app.models.owner_followup import OwnerFollowUp
    from app.utils.notification_dispatcher import dispatch_notification

    db = session or SessionLocal()
    sent = 0
    try:
        now = db_now(db)
        for f in db.query(OwnerFollowUp).filter(OwnerFollowUp.status == "Observing").all():
            if (f.owner_user_id and not f.acknowledged_at and not f.reminder_sent_at
                    and f.due_at - REMINDER_BEFORE <= now < f.due_at):
                dispatch_notification(
                    db, f.owner_user_id,
                    title=f"Reminder: complaint about your pet (Report #{f.report_id})",
                    message=(f"The subdivision is still checking the complaint about your pet in Report #{f.report_id} "
                             f"until {f.due_at:%b %d, %Y %I:%M %p}. Please keep it safely confined, and open the report "
                             f"to acknowledge it or send an update."),
                    notification_type="owner_followup", related_id=f.report_id)
                f.reminder_sent_at = now
                sent += 1
            if not f.due_notified_at and now >= f.due_at:
                for uid in _leader_ids(f):
                    dispatch_notification(
                        db, uid,
                        title=f"Observation due: Report #{f.report_id}",
                        message=(f"The observation period for Report #{f.report_id} has ended. Record that the owner "
                                 f"complied, close the case, or escalate it to the Barangay."),
                        notification_type="owner_followup", related_id=f.report_id)
                    sent += 1
                f.due_notified_at = now
        db.commit()
    except Exception as e:  # the watcher must keep running
        db.rollback()
        logger.error(f"Owner follow-up check failed: {e}")
    finally:
        if session is None:
            db.close()
    return sent
