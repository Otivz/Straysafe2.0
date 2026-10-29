"""
Keep rescue requests in step with their report.

A report can be closed from many places (report status update, holding facility outcome, adoption handover, pet
claims, QR recovery, rescue update). Whichever path closes it, its open rescue request(s) must close too, otherwise
the case keeps showing as an active rescue. This is done once, centrally, with a SQLAlchemy before_flush hook.
The same hook ends an open owner follow-up when its report closes or is escalated (utils/owner_followups.py), and
a report newly linked to a pet under observation on another report notifies the handling leader (repeated report).
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
        # An owner follow-up observing this report ends when the report closes or goes to the Barangay
        if obj.report_id is not None and (new_status in CLOSED_REPORT_STATUS_IDS or new_status == 4):
            _owner_followups.end_open_followups(session, obj.report_id, new_status)


@event.listens_for(Session, "after_flush")
def _collect_new_pet_links(session: Session, flush_context):
    """Reports whose pet link was just set (any path); the ids exist now, the history is still the pre-flush one."""
    from app.models.report import Report

    for obj in list(session.new) + list(session.dirty):
        if isinstance(obj, Report) and obj.pet_id and inspect(obj).attrs.pet_id.history.added:
            session.info.setdefault("_new_pet_links", set()).add(obj.report_id)


@event.listens_for(Session, "after_flush_postexec")
def _notify_repeated_reports(session: Session, flush_context):
    from app.models.report import Report

    ids = session.info.pop("_new_pet_links", None)
    if not ids:
        return
    with session.no_autoflush:
        for rid in ids:
            report = session.get(Report, rid)
            if report is not None:
                _owner_followups.notify_repeated_report(session, report)


# Imported here at module level, never inside the hook: loading it registers other before_flush listeners
# (holding_stay), and adding a listener while SQLAlchemy runs the list fails ("deque mutated during iteration").
from app.utils import owner_followups as _owner_followups  # noqa: E402
