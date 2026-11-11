"""
Keep a case's side records in step with its report.

A report can be closed from many places (report status update, case lifecycle, owner return, merge). Whichever path
closes it, its open owner follow-up and lost-pet alert must end too, otherwise the case keeps showing as active. This
is done once, centrally, with a SQLAlchemy before_flush hook.
"""
from datetime import datetime, timezone

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

# Report statuses that end a case
CLOSED_REPORT_STATUS_IDS = {3, 9, 10, 11, 12, 14, 17, 18}


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def close_open_followups(session: Session, report_id: int, report_status_id: int) -> int:
    """End the report's active owner follow-up observation on case closure, merge or escalation."""
    try:
        from app.models.owner_followup import OwnerFollowUp
    except ImportError:
        return 0

    outcome = "escalated" if report_status_id == 13 else "closed"
    closed = 0
    with session.no_autoflush:
        followups = session.query(OwnerFollowUp).filter(
            OwnerFollowUp.report_id == report_id,
            OwnerFollowUp.status == "observing"
        ).all()
        from app.models.report import StatusHistory
        for f in followups:
            # The SQL filter sees the stored row: an observation already concluded in this same transaction (e.g.
            # resolved as complied, which is what resolves the report) keeps its own outcome and single end entry.
            if f.status != "observing":
                continue
            f.status = outcome
            f.closed_at = f.closed_at or _now()
            f.close_reason = f"Case ended due to report status transition to {report_status_id}."
            # Phase 8: the end of the observation shows on the timeline (no owner details)
            session.add(StatusHistory(
                report_id=f.report_id, report_status_id=report_status_id,
                remarks=("Observation ended: endorsed to the Barangay." if outcome == "escalated"
                         else "Observation ended: closed with the case."),
            ))
            closed += 1
    return closed


def close_lost_pet_alerts(session: Session, report_id: int, report_status_id: int, report=None) -> int:
    """
    Closing a Lost Pet Report closes its Neighborhood Alert (docs/01-system/LOST_PET_LIFECYCLE.md): no more sightings are
    accepted, an unfinished conversation between the owner and a neighbor is finished, and the pet is no longer 'Lost' in the
    registry. Sightings and history are kept. Escalation to the Barangay (13) is not a closure: the alert stays as it is.

    How the notice ends says what actually happened. A missing pet's notice is 'recovered' ONLY by the one recovery operation
    (services/lost_pet_lifecycle.confirm_recovery), which closes the notice itself before this runs. A case closed for any other
    reason ends its notice as withdrawn, merged, not found or closed, with that reason. (A found-animal notice keeps the older
    reading: claimed / released / resolved closes it as reunited.)
    """
    try:
        from app.models.lost_pet_alert import LostPetAlert
        from app.models.report import Report
        from app.services import lost_pet_lifecycle as LP
    except ImportError:
        return 0
    closed = 0
    with session.no_autoflush:
        rep = report if report is not None else session.get(Report, report_id)
        for a in session.query(LostPetAlert).filter(LostPetAlert.report_id == report_id,
                                                    LostPetAlert.status.in_(("requested", "active"))).all():
            if a.status not in ("requested", "active"):
                continue
            if a.alert_type == "found_animal":
                reunited = report_status_id in (9, 10, 11)
                outcome = "reunited" if reunited else "report_closed"
                reason = "Resolved - Pet Reunited." if reunited else f"The Lost Pet Report was closed (status {report_status_id})."
            else:
                outcome, reason = LP.closure_outcome_for(rep) if rep is not None else ("report_closed", f"The case was closed (status {report_status_id}).")
            a.status = "closed"
            a.close_outcome = a.close_outcome or outcome
            a.close_reason = a.close_reason or reason
            a.closed_at = a.closed_at or _now()
            LP.resolve_open_coordinations(session, a.alert_id, None, f"The notice ended: {reason}")
            closed += 1
    return closed


def _restore_pet_after_lost_report(session: Session, report) -> None:
    """The case ended: the pet is no longer "Lost" in the registry (unless another active lost report names it)."""
    try:
        from app.services import lost_pet_lifecycle as LP
        with session.no_autoflush:
            if LP.is_lost_pet_case(report):
                LP.restore_pet_after_closure(session, report)
    except Exception:  # noqa: BLE001  (a registry nicety must never break closing a case)
        pass


@event.listens_for(Session, "before_flush")
def _sync_side_records_with_closed_reports(session: Session, flush_context, instances):
    from app.models.report import Report

    for obj in list(session.dirty):
        if not isinstance(obj, Report):
            continue
        hist = inspect(obj).attrs.current_status_id.history
        if not hist.has_changes():
            continue
        new_status = obj.current_status_id
        if (new_status in CLOSED_REPORT_STATUS_IDS or new_status == 13) and obj.report_id is not None:
            if new_status in CLOSED_REPORT_STATUS_IDS:
                close_lost_pet_alerts(session, obj.report_id, new_status, obj)
                _restore_pet_after_lost_report(session, obj)
            close_open_followups(session, obj.report_id, new_status)
