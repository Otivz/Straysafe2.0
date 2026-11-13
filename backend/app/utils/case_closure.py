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


def _close_case_message_threads(session: Session, report_id: int, report) -> None:
    """Close any open Subdivision Leader-to-resident or resident-to-resident conversations when a report closes."""
    try:
        from app.services import case_messaging
        actor_id = getattr(report, "closed_by", None) if report is not None else None
        reason = getattr(report, "closure_reason", None) if report is not None else None
        case_messaging.close_for_report(session, report_id, actor_id, reason or "The report is closed, so this conversation has ended.")
    except Exception:  # noqa: BLE001
        pass


def close_linked_reports(session: Session, report_id: int, closing_report, visited=None) -> int:
    """
    When any report in a linked pair or cluster closes, automatically close all active linked reports as well.
    Closes their message threads, pending follow-ups, and alerts, and records status history and notifications.
    """
    if visited is None:
        visited = set()
    visited.add(report_id)

    try:
        from app.models.case_records import CaseFollowUp, CaseLink
        from app.models.lost_found_match import LostFoundMatch
        from app.models.report import Report, StatusHistory
        from app.models.audit_log import AuditLog
        from app.models.notification import Notification
        from app.utils import case_state
        from app.utils import case_vocab as V
    except ImportError:
        return 0

    closed_count = 0
    with session.no_autoflush:
        links = session.query(CaseLink).filter(
            ((CaseLink.report_id == report_id) | (CaseLink.related_report_id == report_id)),
            CaseLink.unlinked_at.is_(None)
        ).all()

        linked_report_ids = set()
        for link in links:
            other_id = link.related_report_id if link.report_id == report_id else link.report_id
            if other_id and other_id not in visited:
                linked_report_ids.add(other_id)

        matches = session.query(LostFoundMatch).filter(
            ((LostFoundMatch.lost_report_id == report_id) | (LostFoundMatch.found_report_id == report_id)),
            LostFoundMatch.status == "confirmed"
        ).all()

        for match in matches:
            other_id = match.found_report_id if match.lost_report_id == report_id else match.lost_report_id
            if other_id and other_id not in visited:
                linked_report_ids.add(other_id)

        for other_id in linked_report_ids:
            visited.add(other_id)
            linked_rep = session.get(Report, other_id)
            if linked_rep is None or case_state.is_closed(linked_rep):
                continue

            old_status = case_state.case_status_of(linked_rep)
            now = getattr(closing_report, "closed_at", None) or _now()
            actor_id = getattr(closing_report, "closed_by", None)

            disp = getattr(closing_report, "closure_disposition", None) or "resolved_intervention"
            if disp == "pet_recovered" and not V.is_lost_pet_report(linked_rep):
                disp = "resolved_intervention"
            elif disp not in V.DISPOSITIONS:
                disp = "resolved_intervention"

            target_legacy_id = V.DISPOSITIONS[disp][1]
            parent_reason = getattr(closing_report, "closure_reason", None)
            reason = f"Linked report #{report_id} was closed: {parent_reason or 'Case closed.'}"

            linked_rep.case_status = V.CLOSED
            linked_rep.closure_disposition = disp
            linked_rep.closure_reason = reason
            linked_rep.closed_at = now
            linked_rep.closed_by = actor_id
            linked_rep.current_status_id = target_legacy_id

            # End side records for the linked report
            close_lost_pet_alerts(session, linked_rep.report_id, target_legacy_id, linked_rep)
            _restore_pet_after_lost_report(session, linked_rep)
            _close_case_message_threads(session, linked_rep.report_id, linked_rep)
            close_open_followups(session, linked_rep.report_id, target_legacy_id)

            for f in session.query(CaseFollowUp).filter(
                CaseFollowUp.report_id == linked_rep.report_id,
                CaseFollowUp.status == "pending"
            ).all():
                f.status = "cancelled"
                f.cancel_reason = f"Linked report #{report_id} was closed."

            session.add(StatusHistory(
                report_id=linked_rep.report_id,
                report_status_id=target_legacy_id,
                updated_by=actor_id,
                latitude=linked_rep.latitude,
                longitude=linked_rep.longitude,
                landmark=linked_rep.landmark,
                remarks=f"Case closed automatically (linked report #{report_id} was closed)."
            ))

            session.add(AuditLog(
                user_id=actor_id,
                action="CASE_CLOSED_LINKED",
                target_table="reports",
                target_id=linked_rep.report_id,
                description=f"Report #{linked_rep.report_id} closed automatically because linked report #{report_id} was closed.",
                log_type="operation",
                old_values={"case_status": old_status},
                new_values={"case_status": V.CLOSED, "disposition": disp, "linked_closing_report_id": report_id}
            ))

            if linked_rep.user_id and linked_rep.user_id != actor_id:
                session.add(Notification(
                    user_id=linked_rep.user_id,
                    title=f"Report #{linked_rep.report_id} closed",
                    message=f"Your report #{linked_rep.report_id} was closed because linked report #{report_id} was closed.",
                    type="status_update",
                    related_id=linked_rep.report_id
                ))

            closed_count += 1
            closed_count += close_linked_reports(session, linked_rep.report_id, linked_rep, visited=visited)

    return closed_count


@event.listens_for(Session, "before_flush")
def _sync_side_records_with_closed_reports(session: Session, flush_context, instances):
    from app.models.report import Report

    for obj in list(session.dirty):
        if not isinstance(obj, Report):
            continue
        hist = inspect(obj).attrs.current_status_id.history
        case_hist = inspect(obj).attrs.case_status.history
        if not hist.has_changes() and not case_hist.has_changes():
            continue
        new_status = obj.current_status_id
        if (new_status in CLOSED_REPORT_STATUS_IDS or new_status == 13 or obj.case_status == "closed") and obj.report_id is not None:
            if new_status in CLOSED_REPORT_STATUS_IDS or obj.case_status == "closed":
                close_lost_pet_alerts(session, obj.report_id, new_status, obj)
                _restore_pet_after_lost_report(session, obj)
                _close_case_message_threads(session, obj.report_id, obj)
                from app.services import case_alerts
                case_alerts.stop_for_report(session, obj.report_id, "the case was resolved")
                close_linked_reports(session, obj.report_id, obj)
            close_open_followups(session, obj.report_id, new_status)
