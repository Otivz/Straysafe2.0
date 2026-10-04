"""
Keep rescue requests in step with their report.

A report can be closed from many places (report status update, holding facility outcome, adoption handover, pet
claims, QR recovery, rescue update). Whichever path closes it, its open rescue request(s) must close too, otherwise
the case keeps showing as an active rescue. This is done once, centrally, with a SQLAlchemy before_flush hook.
"""
from datetime import datetime, timezone

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

# Report statuses that end a case
CLOSED_REPORT_STATUS_IDS = {3, 9, 10, 11, 12, 14, 17, 18}
# Rescue statuses: 1 Pending, 2 Approved, 3 Rejected, 4 Started, 5 Dispatched, 6 Resolved
RESCUE_CLOSED_STATUS_IDS = {3, 6}
OPEN_ASSIGNMENT_STATUSES = ("Assigned", "In Transit", "On Site")


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def close_open_rescues(session: Session, report_id: int, report_status_id: int) -> int:
    """Close the report's open rescues (Rejected report -> Rejected rescue, any other end -> Resolved)."""
    from app.models.report import Rescue, RescueAssignment

    target = 3 if report_status_id == 3 else 6
    closed = 0
    with session.no_autoflush:
        rescues = session.query(Rescue).filter(Rescue.report_id == report_id).all()
        for r in rescues:
            if r.status_id in RESCUE_CLOSED_STATUS_IDS:
                continue
            r.status_id = target
            r.completed_at = r.completed_at or _now()
            for a in session.query(RescueAssignment).filter(
                RescueAssignment.rescue_id == r.rescue_id,
                RescueAssignment.assignment_status.in_(OPEN_ASSIGNMENT_STATUSES),
            ).all():
                a.assignment_status = "Completed" if target == 6 else "Cancelled"
            closed += 1
    return closed


@event.listens_for(Session, "before_flush")
def _sync_rescues_with_closed_reports(session: Session, flush_context, instances):
    from app.models.report import Report

    for obj in list(session.dirty):
        if not isinstance(obj, Report):
            continue
        hist = inspect(obj).attrs.current_status_id.history
        if not hist.has_changes():
            continue
        new_status = obj.current_status_id
        if new_status in CLOSED_REPORT_STATUS_IDS and obj.report_id is not None:
            close_open_rescues(session, obj.report_id, new_status)
