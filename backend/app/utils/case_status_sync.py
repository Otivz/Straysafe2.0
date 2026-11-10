"""
Keep a report's two generations of state in step, once, centrally (a SQLAlchemy before_flush hook).

Many code paths still change reports.current_status_id (the legacy ladder), verification_status or the pet link, and
the Subdivision Admin workflow changes reports.case_status. Whichever one a path changes, the others follow:

  legacy status changed        -> case_status is read from it                     (every legacy path keeps working)
  case_status changed alone    -> the matching legacy status is written           (so the closure hook and legacy screens agree)
  both changed and they differ -> the legacy status wins
  verification_status changed  -> the new incident decision is cleared, so the legacy value reads through
  pet link changed             -> identity_status follows it (a link nobody has re-checked is only a possible match)
  a case ends                  -> closed_at is stamped when nothing set it
  a case reopens by a legacy path -> the closure is cleared, reopened_count goes up and the old closure is audited

It registers BEFORE utils/case_closure's hook (app/models/__init__.py imports it first), so a legacy status derived here
is seen by the closure hook and closes the rescue, the alert and the observation exactly as before.
The lifecycle service (app/services/case_lifecycle.py) sets both columns itself, so none of this changes what it wrote.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from app.utils import case_vocab as V
from app.utils.case_state import identity_from_links


def legacy_status_for(report) -> int:
    """The legacy status to write for report.case_status. A legacy status that already reads as it is kept."""
    target = report.case_status
    current = report.current_status_id
    if current is not None and V.case_status_from_legacy(current) == target:
        return current
    if target == V.CLOSED:
        disposition = report.closure_disposition if report.closure_disposition in V.DISPOSITIONS else "unresolved_other"
        return V.DISPOSITIONS[disposition][1]
    return V.LEGACY_FOR_OPEN_STATUS.get(target, 1)


def _changed(state, attr: str) -> bool:
    return state.attrs[attr].history.has_changes()


def _previous_case_status(session: Session, state, report) -> Optional[str]:
    """What the case was before this flush. An expired instance has no history to read, so the stored row answers."""
    history = state.attrs.case_status.history
    if history.deleted and history.deleted[0] in V.CASE_STATUSES:
        return history.deleted[0]
    legacy = state.attrs.current_status_id.history
    if legacy.deleted and legacy.deleted[0] is not None:
        return V.case_status_from_legacy(legacy.deleted[0])
    if report.report_id is None:
        return None
    from app.models.report import Report
    row = session.execute(select(Report.case_status, Report.current_status_id)
                          .where(Report.report_id == report.report_id)).first()
    if row is None:
        return None
    return row[0] if row[0] in V.CASE_STATUSES else V.case_status_from_legacy(row[1])


def _init_new(report) -> None:
    if report.case_status is None:
        report.case_status = V.case_status_from_legacy(report.current_status_id)
    elif report.current_status_id is None:
        report.current_status_id = legacy_status_for(report)
    if report.identity_status is None:
        report.identity_status = identity_from_links(report)
    if report.case_status == V.CLOSED and report.closed_at is None:
        report.closed_at = datetime.now()


def _sync_existing(session: Session, report, now: datetime) -> None:
    state = inspect(report)
    status_changed = _changed(state, "current_status_id")
    case_changed = _changed(state, "case_status")
    previous = _previous_case_status(session, state, report) if (status_changed or case_changed) else None

    if status_changed and not case_changed:
        report.case_status = V.case_status_from_legacy(report.current_status_id)
    elif case_changed and not status_changed and report.case_status in V.CASE_STATUSES:
        legacy = legacy_status_for(report)
        if legacy != report.current_status_id:
            report.current_status_id = legacy
    elif status_changed and case_changed and V.case_status_from_legacy(report.current_status_id) != report.case_status:
        report.case_status = V.case_status_from_legacy(report.current_status_id)

    if _changed(state, "verification_status") and not _changed(state, "incident_verification") \
            and report.incident_verification is not None:
        report.incident_verification = None

    if (_changed(state, "pet_id") or _changed(state, "pet_inherited_from_match_id")
            or _changed(state, "identity_rechecked_at")) and not _changed(state, "identity_status"):
        report.identity_status = identity_from_links(report)

    if previous is None:
        return
    now_status = report.case_status
    if now_status == V.CLOSED and previous != V.CLOSED and report.closed_at is None:
        report.closed_at = now
    elif previous == V.CLOSED and now_status != V.CLOSED:
        _clear_closure(session, report, state, now)


def _clear_closure(session: Session, report, state, now: datetime) -> None:
    """A case left Closed. The lifecycle service has already recorded and cleared it; a legacy path has not."""
    by_service = _changed(state, "reopened_count")
    if not by_service:
        from app.models.audit_log import AuditLog
        old = {"closure_disposition": report.closure_disposition, "closure_reason": report.closure_reason,
               "closed_at": report.closed_at.isoformat() if report.closed_at else None, "closed_by": report.closed_by,
               "legacy_status_id": (state.attrs.current_status_id.history.deleted or [None])[0]}
        report.reopened_count = (report.reopened_count or 0) + 1
        report.last_reopened_at = now
        session.add(AuditLog(
            action="CASE_REOPENED_LEGACY", target_table="reports", target_id=report.report_id, log_type="operation",
            description=f"Report #{report.report_id} left Closed through a legacy status change.",
            old_values=old, new_values={"case_status": report.case_status, "legacy_status_id": report.current_status_id}))
    report.closure_disposition = None
    report.closure_reason = None
    report.closed_at = None
    report.closed_by = None


@event.listens_for(Session, "before_flush")
def _keep_case_state_in_step(session: Session, flush_context, instances) -> None:
    from app.models.report import Report

    now = datetime.now()
    for obj in list(session.new):
        if isinstance(obj, Report):
            _init_new(obj)
    for obj in list(session.dirty):
        if isinstance(obj, Report):
            _sync_existing(session, obj, now)
