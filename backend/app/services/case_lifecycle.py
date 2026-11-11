"""
The case lifecycle: the ONLY place a case moves between REPORTED, UNDER REVIEW, IN PROGRESS and CLOSED by decision.

    REPORT -> ASSESS -> COORDINATE -> MONITOR -> DOCUMENT OUTCOME -> CLOSE

Rules enforced here, on the server, whatever any screen shows:
  - who may act: the Subdivision Leader of the report's subdivision (the assigned officer when one is assigned) or the
    Administrator; never a resident, never Barangay staff (retired)
  - moves by hand: reported -> under_review | in_progress, under_review <-> in_progress. A closed case is reopened, not moved.
  - recording work moves a case forward (never backward, never out of Closed)
  - closing needs a disposition and a written reason; some dispositions need proof on the case
  - a closed case does not mean the concern was resolved: the disposition says which (resolved / unresolved / invalid)
  - closing's side effects are done once, here and in the central closure hook (utils/case_closure.py), and audited
  - reopening is for authorized staff, needs a reason, goes back to under_review, and is counted
  - NO registered animal is needed to assess, refer, follow up, link or close

What is written where: the legacy status ladder (reports.current_status_id) is kept in step by the status sync hook and
by `_apply_status` below; the status history gets a neutral line (residents can read it, so never a reason or a note);
the audit log gets the detail (staff only).
"""
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.case_records import CaseFollowUp, CaseLink
from app.models.barangay_referral import BarangayReferral
from app.models.notification import Notification
from app.models.owner_followup import OwnerFollowUp
from app.models.report import Report, StatusHistory
from app.models.user import User
from app.models.warning import OwnerWarning
from app.schemas.case import AssessmentIn, CloseIn
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils import identity_decision, lost_pet_rules
from app.utils.auth import verify_subdivision_scope
from app.utils.case_status_sync import legacy_status_for

STAFF_ROLES = (2, 4)


def _now() -> datetime:
    return datetime.now()


# ------------------------------------------------------------------------------------------------------- access
def case_for_staff(db: Session, report_id: int, user: User, write: bool = False) -> Report:
    """The report, if this staff member may see it (and, for a write, act on it). Raises 404 / 403 / 409 otherwise."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if user.role_id not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader or the Administrator can work on a case.")
    verify_subdivision_scope(user, report.subdivision_id, db=db)
    if write:
        if V.is_lost_pet_report(report):
            from app.services import lost_pet_lifecycle as LP
            report = LP.lock_case(db, report.report_id)
        require_case_handler(report, user)
        require_not_merged(report)
    return report


def require_case_handler(report: Report, user: User) -> None:
    """A case assigned to another officer is theirs to update. An unassigned case can be worked by any leader of the subdivision."""
    if user.role_id == 2 and report.assigned_leader_id and report.assigned_leader_id != user.user_id:
        raise HTTPException(status_code=403, detail="This case is being handled by another officer. Only the assigned case officer can update it.")


def require_not_merged(report: Report) -> None:
    if report.current_status_id == V.MERGED_LEGACY_ID or report.duplicate_of_report_id:
        raise HTTPException(status_code=409, detail="This report was merged into another case. Work on the primary case instead.")


def require_open(report: Report, what: str = "do that") -> None:
    if case_state.is_closed(report):
        raise HTTPException(status_code=409, detail=f"The case is closed. Reopen it to {what}.")


# ------------------------------------------------------------------------------------------ audit and history
def audit(db: Session, actor: Optional[User], action: str, report: Report, description: str,
          old: Optional[Dict[str, Any]] = None, new: Optional[Dict[str, Any]] = None, table: str = "reports",
          target_id: Optional[int] = None, ip: Optional[str] = None, user_agent: Optional[str] = None) -> None:
    db.add(AuditLog(user_id=actor.user_id if actor else None, action=action, target_table=table,
                    target_id=target_id if target_id is not None else report.report_id, description=description,
                    log_type="operation", old_values=old, new_values=new, ip_address=ip, user_agent=user_agent))


def history(db: Session, report: Report, actor: Optional[User], remarks: str) -> None:
    """A neutral line on the report's timeline. Residents can read it: never put a reason, a note or a name here."""
    db.add(StatusHistory(report_id=report.report_id, report_status_id=report.current_status_id,
                         updated_by=actor.user_id if actor else None, latitude=report.latitude,
                         longitude=report.longitude, landmark=report.landmark, remarks=remarks))


def _apply_status(report: Report, target: str) -> None:
    """Set both generations of status at once (the history line below records the legacy one)."""
    report.case_status = target
    report.current_status_id = legacy_status_for(report)


def _notify_reporter(db: Session, report: Report, actor: Optional[User], title: str, message: str) -> None:
    if report.user_id and (actor is None or report.user_id != actor.user_id):
        db.add(Notification(user_id=report.user_id, title=title, message=message, type="status_update", related_id=report.report_id))


# ----------------------------------------------------------------------------------------------- open items
def open_items(db: Session, report: Report) -> Dict[str, int]:
    rid = report.report_id
    return {
        "followups": db.query(CaseFollowUp).filter(CaseFollowUp.report_id == rid, CaseFollowUp.status == "pending").count(),
        "referrals": db.query(BarangayReferral).filter(
            BarangayReferral.report_id == rid,
            (BarangayReferral.referral_status.is_(None)) | (BarangayReferral.referral_status.in_(list(V.OPEN_REFERRAL_STATUSES)))
        ).filter(BarangayReferral.final_outcome.is_(None)).count(),
        "claims": _active_claims(db, rid),
        "observations": db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == rid, OwnerFollowUp.status == "observing").count(),
    }


def _active_claims(db: Session, report_id: int) -> int:
    from app.models.case_records import OwnershipClaim
    return db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report_id,
                                           OwnershipClaim.status.in_(list(V.ACTIVE_CLAIM_STATUSES))).count()


# --------------------------------------------------------------------------------------------------- moving
def move_case(db: Session, report: Report, actor: User, target: str, note: Optional[str] = None) -> None:
    current = case_state.case_status_of(report)
    if current == V.CLOSED:
        raise HTTPException(status_code=409, detail="A closed case is reopened, not moved.")
    if target not in V.MANUAL_MOVES[current]:
        raise HTTPException(status_code=409, detail=(
            f"A case that is {V.STATUS_LABELS[current]} cannot be moved to {V.STATUS_LABELS[target]}."))
    _apply_status(report, target)
    history(db, report, actor, f"Case status changed to {V.STATUS_LABELS[target]}.")
    audit(db, actor, "CASE_STATUS_CHANGED", report,
          f"{actor.name} moved report #{report.report_id} from {V.STATUS_LABELS[current]} to {V.STATUS_LABELS[target]}.",
          old={"case_status": current}, new={"case_status": target, "note": (note or "").strip() or None})


def advance_case(db: Session, report: Report, actor: Optional[User], minimum: str, why: str) -> bool:
    """Recording work moves the case forward to at least `minimum`: never backward, never out of Closed."""
    before = case_state.case_status_of(report)
    if not case_state.advance_status(report, minimum):
        return False
    report.current_status_id = legacy_status_for(report)
    history(db, report, actor, f"Case moved to {V.STATUS_LABELS[minimum]}.")
    audit(db, actor, "CASE_STATUS_ADVANCED", report, f"Report #{report.report_id} moved to {V.STATUS_LABELS[minimum]}: {why}.",
          old={"case_status": before}, new={"case_status": minimum, "because": why})
    return True


# ------------------------------------------------------------------------------------------------- assessment
def _validate_ownership(db: Session, data) -> None:
    unknown = [e for e in data.evidence if e not in V.OWNERSHIP_EVIDENCE]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown ownership evidence: {', '.join(unknown)}.")
    if data.owner_user_id is not None:
        owner = db.query(User).filter(User.user_id == data.owner_user_id).first()
        if owner is None or owner.role_id != 1:
            raise HTTPException(status_code=422, detail="The owner must be a resident account.")
    if data.status == "confirmed":
        if data.owner_user_id is None:
            raise HTTPException(status_code=422, detail="Confirming ownership needs the owner (a resident account).")
        if not any(not V.OWNERSHIP_EVIDENCE[e] for e in data.evidence):
            raise HTTPException(status_code=422, detail=(
                "Pet registration is declared by the owner, so it cannot be the only basis. "
                "Record at least one other piece of evidence."))


def save_assessment(db: Session, report: Report, actor: User, data: AssessmentIn) -> Dict[str, Any]:
    """Record what was assessed. Only the parts sent are changed. Moves a Reported case to Under review."""
    require_open(report, "assess it")
    now = _now()
    old = {"incident": case_state.incident_of(report), "evidence_sufficiency": case_state.sufficiency_of(report),
           "urgency": case_state.urgency_of(report), "identity": case_state.identity_of(report),
           "ownership": case_state.ownership_of(report), "is_sensitive": bool(report.is_sensitive)}
    if data.ownership is not None:
        _validate_ownership(db, data.ownership)

    if data.incident is not None:
        report.incident_verification = data.incident
        # Legacy screens read verification_status: keep it matching (a verified incident is "verified_true")
        report.verification_status = V.legacy_verification_for(data.incident)
        if data.incident == "verified":
            report.verified_by_user_id, report.verified_at = actor.user_id, now
            report.verification_notes = (data.incident_basis or "").strip() or report.verification_notes
    if data.incident_basis is not None:
        report.incident_basis = data.incident_basis.strip() or None
    if data.evidence_sufficiency is not None:
        report.evidence_sufficiency = data.evidence_sufficiency
    if data.evidence_reviewed is not None:
        report.evidence_reviewed = list(data.evidence_reviewed)
    if data.urgency is not None:
        report.urgency_level = data.urgency
        if data.urgency == "immediate":
            report.priority_level = "High"      # legacy sorts and badges read the stored level
    if data.urgency_note is not None:
        report.urgency_note = data.urgency_note.strip() or None
    if data.notes is not None:
        report.assessment_notes = data.notes.strip() or None
    if data.identity is not None:
        report.identity_status = data.identity.status
        report.identity_note = (data.identity.note or "").strip() or None
        # A Leader's own decision is recorded apart from the status the pet link alone gives (utils/identity_decision.py)
        audit(db, actor, identity_decision.ACTION, report,
              f"{actor.name} recorded the animal's identity on report #{report.report_id}: {data.identity.status}.",
              old={"identity": old["identity"]}, new={"identity": data.identity.status, "linked_pet_id": report.pet_id})
    if data.ownership is not None:
        o = data.ownership
        report.ownership_status = o.status
        report.ownership_owner_id = o.owner_user_id if o.status != "unknown" else None
        report.ownership_evidence = list(o.evidence)
        report.ownership_note = (o.note or "").strip() or None
        report.ownership_decided_by, report.ownership_decided_at = actor.user_id, now
    if data.is_sensitive is not None and bool(report.is_sensitive) != data.is_sensitive:
        report.is_sensitive = data.is_sensitive
        if data.is_sensitive:
            # A private complaint about a neighbour is never public: if it was made public, it goes private now
            from app.utils import report_visibility
            if (report.visibility or "") == report_visibility.PUBLIC:
                report_visibility.set_visibility(db, report, report_visibility.PRIVATE, actor,
                                                 "Marked as a sensitive complaint.", notify=False)
    report.assessed_at, report.assessed_by = now, actor.user_id

    advance_case(db, report, actor, V.UNDER_REVIEW, "assessment started")
    new = {"incident": case_state.incident_of(report), "evidence_sufficiency": case_state.sufficiency_of(report),
           "urgency": case_state.urgency_of(report), "identity": case_state.identity_of(report),
           "ownership": case_state.ownership_of(report), "is_sensitive": bool(report.is_sensitive)}
    audit(db, actor, "CASE_ASSESSMENT_SAVED", report, f"{actor.name} recorded the assessment of report #{report.report_id}.", old=old, new=new)
    return new


# ---------------------------------------------------------------------------------------------------- priority
def set_priority(db: Session, report: Report, actor: User, priority: str, reason: Optional[str]) -> None:
    require_open(report, "change its priority")
    before = case_state.priority_of(report)
    if before == priority:
        return
    report.priority_level = V.level_for_priority(priority)
    if priority == "urgent":
        report.urgency_level = "immediate"
    elif report.urgency_level == "immediate":
        report.urgency_level = "possible"       # the immediate risk is lifted; a risk may still be plausible
    audit(db, actor, "CASE_PRIORITY_CHANGED", report,
          f"{actor.name} changed the priority of report #{report.report_id} from {before} to {priority}.",
          old={"priority": before}, new={"priority": priority, "reason": (reason or "").strip() or None})


# ------------------------------------------------------------------------------------------------ closing
def disposition_availability(db: Session, report: Report, disposition: str) -> Tuple[bool, Optional[str]]:
    """Whether the case can be closed with this disposition, and if not, why (same rules as the Admin screen)."""
    from app.utils.warning_rules import report_family
    rid = report.report_id
    family = report_family(report)
    if disposition == "withdrawn_by_reporter":
        return False, "Set when the person who filed the report withdraws it."
    if disposition == "pet_recovered":
        # Recovery is the owner's confirmation, recorded by the one recovery operation: a Leader cannot close a case as recovered by choosing it
        if family == V.LOST_PET:
            return False, "Record the owner's confirmation that the pet is home. That is what closes a missing-pet case as recovered."
        return False, "Only for lost-pet cases."
    if disposition == "owner_compliance":
        complied = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == rid, OwnerFollowUp.status == "complied").count()
        resolved = db.query(OwnerWarning).filter(OwnerWarning.report_id == rid, OwnerWarning.status == "Resolved").count()
        return (True, None) if (complied or resolved) else (False, "Needs a warning with a compliant observation on record.")
    if disposition == "handed_off":
        # A referral that was only written down (status to_contact) is not proof that anyone was contacted
        has = db.query(BarangayReferral).filter(BarangayReferral.report_id == rid,
                                                (BarangayReferral.referral_status.is_(None)) | (BarangayReferral.referral_status != "to_contact")).count()
        return (True, None) if has else (False, "Needs an external referral on record, with the contact recorded.")
    if disposition == "duplicate_report":
        has = db.query(CaseLink).filter(((CaseLink.report_id == rid) | (CaseLink.related_report_id == rid)),
                                        CaseLink.unlinked_at.is_(None)).count()
        return (True, None) if has else (False, "Link the related report first.")
    return True, None


def close_case(db: Session, report: Report, actor: User, data: CloseIn, ip: Optional[str] = None,
               user_agent: Optional[str] = None) -> Dict[str, Any]:
    """
    Close the case with a documented outcome. The side effects, all in this one transaction:
      - pending case follow-ups end with the case (unless asked to keep them); owner observations, the rescue request
        and the neighbourhood alert close through the central closure hook (utils/case_closure.py)
      - an optional post-closure check is scheduled
      - referrals, warnings and ownership claims are NOT changed: they are the case's own history
      - the neutral status line, the audit entry (with the open items left behind) and the reporter's notice are written
    """
    if case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="This case is already closed.")
    reason = data.reason.strip()
    if len(reason) < 5:
        raise HTTPException(status_code=422, detail="Write the reason the case is closed (at least 5 characters).")
    ok, why = disposition_availability(db, report, data.disposition)
    if not ok:
        raise HTTPException(status_code=409, detail=f"This outcome is not available: {why}")
    now = _now()
    left = open_items(db, report)
    group, _legacy, label = V.DISPOSITIONS[data.disposition]
    previous = case_state.case_status_of(report)

    report.closure_disposition, report.closure_reason = data.disposition, reason
    report.closed_at, report.closed_by = now, actor.user_id
    _apply_status(report, V.CLOSED)

    ended = 0
    if data.end_open_items:
        for f in db.query(CaseFollowUp).filter(CaseFollowUp.report_id == report.report_id, CaseFollowUp.status == "pending").all():
            f.status, f.cancel_reason = "cancelled", "Case closed."
            ended += 1
    scheduled = None
    if data.post_closure_check_at is not None:
        due = data.post_closure_check_at.replace(tzinfo=None) if data.post_closure_check_at.tzinfo else data.post_closure_check_at
        if due <= now:
            raise HTTPException(status_code=422, detail="The post-closure check must be in the future.")
        scheduled = CaseFollowUp(report_id=report.report_id, subdivision_id=report.subdivision_id, kind="post_closure",
                                 title="Post-closure check: confirm the concern has not returned", due_at=due,
                                 status="pending", created_by=actor.user_id)
        db.add(scheduled)

    history(db, report, actor, f"Case closed: {label}.")
    audit(db, actor, "CASE_CLOSED", report, f"{actor.name} closed report #{report.report_id}: {label}.",
          old={"case_status": previous},
          new={"case_status": V.CLOSED, "disposition": data.disposition, "outcome": group, "reason": reason,
               "open_items_left_behind": left if not data.end_open_items else {**left, "followups": 0},
               "followups_ended": ended, "post_closure_check_at": scheduled.due_at.isoformat() if scheduled else None},
          ip=ip, user_agent=user_agent)
    _notify_reporter(db, report, actor, f"Report #{report.report_id} closed",
                     f"Your report #{report.report_id} was closed by your Subdivision Admin. Outcome: {label}.")
    return {"disposition": data.disposition, "outcome": group, "label": label, "followups_ended": ended,
            "open_items": left, "post_closure_check_at": scheduled.due_at if scheduled else None}


def reopen_case(db: Session, report: Report, actor: User, reason: str, ip: Optional[str] = None,
                user_agent: Optional[str] = None) -> None:
    """Authorized staff reopen a closed case. It goes back to Under review; the old closure is kept in the audit log."""
    if not case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="Only a closed case can be reopened.")
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(status_code=422, detail="Write the reason for reopening (at least 5 characters).")
    lost_pet_rules.refuse_reopen_if_other_active(db, report)      # one active lost report per pet
    closure = case_state.closure_of(report) or {}
    old = {"case_status": V.CLOSED, "disposition": closure.get("disposition"), "closure_reason": report.closure_reason,
           "closed_at": report.closed_at.isoformat() if report.closed_at else None, "closed_by": report.closed_by}
    now = _now()
    report.closure_disposition = report.closure_reason = report.closed_at = report.closed_by = None
    report.reopened_count = (report.reopened_count or 0) + 1
    report.last_reopened_at, report.last_reopened_by, report.last_reopen_reason = now, actor.user_id, reason
    _apply_status(report, V.UNDER_REVIEW)
    history(db, report, actor, "Case reopened.")
    audit(db, actor, "CASE_REOPENED", report, f"{actor.name} reopened report #{report.report_id}.",
          old=old, new={"case_status": V.UNDER_REVIEW, "reason": reason, "reopened_count": report.reopened_count},
          ip=ip, user_agent=user_agent)
    from app.services import lost_pet_lifecycle as LP
    LP.reactivate_on_reopen(db, report, actor)           # a missing pet's case that reopens is missing again: its notice is published again
    _notify_reporter(db, report, actor, f"Report #{report.report_id} reopened",
                     f"Your report #{report.report_id} was reopened by your Subdivision Admin for further review.")

def withdraw_case(db: Session, report: Report, actor: User, ip: Optional[str] = None, user_agent: Optional[str] = None) -> None:
    """
    The person who filed the report withdraws it. It is closed as "Withdrawn by the reporter": the real reason is kept, and it is
    never read as resolved or as a Leader's decision that the report was invalid. The central closure hook ends the notice (as
    withdrawn), finishes any conversation and puts a missing pet back to Active.
    """
    if V.is_lost_pet_report(report):
        from app.services import lost_pet_lifecycle as LP
        report = LP.lock_case(db, report.report_id)
    if case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="This report is already closed.")
    if report.user_id != actor.user_id:
        raise HTTPException(status_code=403, detail="Only the person who filed a report can withdraw it.")
    previous = case_state.case_status_of(report)
    now = _now()
    report.closure_disposition, report.closure_reason = "withdrawn_by_reporter", "Withdrawn by the reporter."
    report.closed_at, report.closed_by = now, actor.user_id
    _apply_status(report, V.CLOSED)
    for f in db.query(CaseFollowUp).filter(CaseFollowUp.report_id == report.report_id, CaseFollowUp.status == "pending").all():
        f.status, f.cancel_reason = "cancelled", "The report was withdrawn."
    history(db, report, actor, "Report withdrawn by the reporter.")
    audit(db, actor, "CASE_WITHDRAWN", report, f"{actor.name} withdrew report #{report.report_id}.",
          old={"case_status": previous}, new={"case_status": V.CLOSED, "disposition": "withdrawn_by_reporter"}, ip=ip, user_agent=user_agent)
    if report.subdivision_id:
        for (leader_id,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == report.subdivision_id, User.status == "Active").all():
            db.add(Notification(user_id=leader_id, title=f"Report #{report.report_id} withdrawn",
                                message=f"The person who filed report #{report.report_id} withdrew it. The case is closed.",
                                type="status_update", related_id=report.report_id))
