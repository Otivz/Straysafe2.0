"""
Work recorded on a case: external referrals, follow-ups, contact logs and links between related reports.

Each of these is a case DETAIL. Recording one moves a case forward when that makes sense (a referral: In progress; a
follow-up or a contact: Under review), and never closes it. None of them needs a registered animal.

  referral    to any outside organisation; a case can have several; each has its own status; the organisation's
              outcome is recorded as what it reported and never closes the case. An urgent safety referral does
              not wait for an assessment.
  follow-up   a thing to do or check, with a due date inside the subdivision's configured bounds
  contact     who was contacted, how, and what came of it. A denial of ownership is recorded as a dispute, not as a lie.
  link        two reports about the same thing, linked without hiding or merging either; reversible, with history
"""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.barangay_referral import BarangayReferral, BarangayReferralUpdate
from app.models.case_records import CaseContactLog, CaseFollowUp, CaseLink
from app.models.report import Report
from app.models.user import Barangay, Subdivision, User
from app.schemas.case import ContactIn, FollowUpIn, LinkIn, ReferralIn, ReferralUpdateIn
from app.services import case_lifecycle as L
from app.utils import case_policy, case_state
from app.utils import case_vocab as V
from app.utils.auth import verify_subdivision_scope


def _now() -> datetime:
    return datetime.now()


def _naive(value: datetime) -> datetime:
    return value.replace(tzinfo=None) if value.tzinfo else value


# ------------------------------------------------------------------------------------------------------ referrals
def _open_referral_filter():
    return (BarangayReferral.referral_status.is_(None) | BarangayReferral.referral_status.in_(list(V.OPEN_REFERRAL_STATUSES))) \
        & BarangayReferral.final_outcome.is_(None)


def _organisation(db: Session, report: Report, data: ReferralIn) -> Tuple[str, Optional[int]]:
    name = (data.org_name or "").strip()
    barangay_id = None
    if data.org_type == "barangay":
        subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
        if subdivision and subdivision.barangay_id:
            barangay_id = subdivision.barangay_id
            if not name:
                barangay = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first()
                if barangay:
                    name = f"Barangay {barangay.barangay_name}"
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name the organisation the case is referred to.")
    return name, barangay_id


def create_referral(db: Session, report: Report, actor: User, data: ReferralIn) -> BarangayReferral:
    """Refer the case to an outside organisation. No assessment and no registered animal is needed."""
    L.require_open(report, "refer it")
    now = _now()
    name, barangay_id = _organisation(db, report, data)
    duplicate = db.query(BarangayReferral).filter(
        BarangayReferral.report_id == report.report_id, func.lower(BarangayReferral.org_name) == name.lower(),
        _open_referral_filter()).first()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail=f"An open referral to {name} already exists for this case. Update it instead.")
    referred_at = _naive(data.referred_at) if data.referred_at else now
    if referred_at > now + timedelta(days=1):
        raise HTTPException(status_code=422, detail="The referral date cannot be in the future.")
    referral = BarangayReferral(
        report_id=report.report_id, barangay_id=barangay_id, referred_by=actor.user_id, referred_at=referred_at,
        reason=data.reason.strip(), reference_no=(data.reference_no or "").strip() or None,
        contact_method=V.UI_CONTACT_TO_STORED[data.contact_method], org_type=data.org_type, org_name=name,
        contact_person=(data.contact_person or "").strip() or None, contact_detail=(data.contact_detail or "").strip() or None,
        is_urgent=data.is_urgent, referral_status="sent", status_updated_at=now, status_updated_by=actor.user_id)
    db.add(referral)
    db.flush()
    if data.notes and data.notes.strip():
        db.add(BarangayReferralUpdate(referral_id=referral.referral_id, update_type="other", source="straysafe_user",
                                      update_date=referred_at.date(), note=data.notes.strip(), status_after="sent",
                                      recorded_by=actor.user_id))
    L.advance_case(db, report, actor, V.IN_PROGRESS, "referral sent")
    L.history(db, report, actor, f"Referred to {name}.")
    L.audit(db, actor, "CASE_REFERRAL_CREATED", report,
            f"{actor.name} referred report #{report.report_id} to {name}.", table="barangay_referrals",
            target_id=referral.referral_id,
            new={"org_type": data.org_type, "org_name": name, "urgent": data.is_urgent, "contact_method": referral.contact_method,
                 "reference_no": referral.reference_no})
    return referral


def update_referral(db: Session, report: Report, actor: User, referral: BarangayReferral, data: ReferralUpdateIn) -> BarangayReferral:
    """
    Record what the organisation reported (or that it has not), and its status. The case's status does not change:
    an organisation finishing its part is not the case being finished. What is left for the subdivision becomes a
    follow-up when a date is given.
    """
    if referral.report_id != report.report_id:
        raise HTTPException(status_code=404, detail="Referral not found on this case.")
    now = _now()
    when = _naive(data.update_date) if data.update_date else now
    if when > now + timedelta(days=1):
        raise HTTPException(status_code=422, detail="The update date cannot be in the future.")
    previous = referral.referral_status or "sent"
    referral.referral_status, referral.status_updated_at, referral.status_updated_by = data.status, now, actor.user_id
    if data.external_outcome is not None:
        referral.external_outcome = data.external_outcome.strip() or None
    if data.remaining_follow_up is not None:
        referral.remaining_follow_up = data.remaining_follow_up.strip() or None
    source = "straysafe_user" if data.status in ("sent", "no_response") else ("barangay_reported" if referral.org_type == "barangay" else "org_reported")
    db.add(BarangayReferralUpdate(
        referral_id=referral.referral_id, update_type="acknowledged" if data.status == "acknowledged" else "other",
        source=source, update_date=when.date(), note=data.note.strip(), evidence_url=data.evidence_url,
        status_after=data.status, recorded_by=actor.user_id))
    scheduled = None
    if data.follow_up_at is not None:
        settings = case_policy.load_settings(db, report.subdivision_id)
        due = case_policy.resolve_followup_due(settings, data.follow_up_at, now)
        referral.follow_up_at = due
        title = (referral.remaining_follow_up or f"Check with {referral.org_name}")[:90]
        scheduled = CaseFollowUp(report_id=report.report_id, subdivision_id=report.subdivision_id, kind="referral_check",
                                 title=title, due_at=due, status="pending", referral_id=referral.referral_id, created_by=actor.user_id)
        db.add(scheduled)
    L.history(db, report, actor, f"Update from {referral.org_name}: {data.status.replace('_', ' ')}.")
    L.audit(db, actor, "CASE_REFERRAL_UPDATED", report, f"{actor.name} recorded an update from {referral.org_name} on report #{report.report_id}.",
            table="barangay_referrals", target_id=referral.referral_id,
            old={"referral_status": previous}, new={"referral_status": data.status, "case_status_unchanged": case_state.case_status_of(report),
                                                     "follow_up_scheduled": scheduled is not None})
    return referral


def referral_for_case(db: Session, report: Report, referral_id: int) -> BarangayReferral:
    referral = db.query(BarangayReferral).filter(BarangayReferral.referral_id == referral_id,
                                                 BarangayReferral.report_id == report.report_id).first()
    if referral is None:
        raise HTTPException(status_code=404, detail="Referral not found on this case.")
    return referral


# ----------------------------------------------------------------------------------------------------- follow-ups
def create_followup(db: Session, report: Report, actor: User, data: FollowUpIn) -> CaseFollowUp:
    if data.kind != "post_closure":
        L.require_open(report, "add a follow-up")
    now = _now()
    if data.done_now:
        row = CaseFollowUp(report_id=report.report_id, subdivision_id=report.subdivision_id, kind=data.kind, title=data.title.strip(),
                           notes=(data.notes or "").strip() or None, due_at=None, status="done", created_by=actor.user_id,
                           completed_at=now, completed_by=actor.user_id, completion_note=(data.notes or "").strip() or None)
    else:
        settings = case_policy.load_settings(db, report.subdivision_id)
        row = CaseFollowUp(report_id=report.report_id, subdivision_id=report.subdivision_id, kind=data.kind, title=data.title.strip(),
                           notes=(data.notes or "").strip() or None, status="pending", created_by=actor.user_id,
                           due_at=case_policy.resolve_followup_due(settings, data.due_at, now))
    db.add(row)
    db.flush()
    if not case_state.is_closed(report):
        L.advance_case(db, report, actor, V.UNDER_REVIEW, "follow-up recorded")
    L.audit(db, actor, "CASE_FOLLOWUP_RECORDED" if data.done_now else "CASE_FOLLOWUP_SCHEDULED", report,
            f"{actor.name} {'recorded' if data.done_now else 'scheduled'} a follow-up on report #{report.report_id}: {row.title}.",
            table="case_followups", target_id=row.followup_id, new={"kind": row.kind, "due_at": row.due_at.isoformat() if row.due_at else None})
    return row


def followup_for_case(db: Session, report: Report, followup_id: int) -> CaseFollowUp:
    row = db.query(CaseFollowUp).filter(CaseFollowUp.followup_id == followup_id, CaseFollowUp.report_id == report.report_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Follow-up not found on this case.")
    return row


def complete_followup(db: Session, report: Report, actor: User, row: CaseFollowUp, note: Optional[str]) -> CaseFollowUp:
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"This follow-up is already {row.status}.")
    row.status, row.completed_at, row.completed_by = "done", _now(), actor.user_id
    row.completion_note = (note or "").strip() or None
    L.audit(db, actor, "CASE_FOLLOWUP_COMPLETED", report, f"{actor.name} completed a follow-up on report #{report.report_id}: {row.title}.",
            table="case_followups", target_id=row.followup_id)
    return row


def cancel_followup(db: Session, report: Report, actor: User, row: CaseFollowUp, reason: Optional[str]) -> CaseFollowUp:
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"This follow-up is already {row.status}.")
    row.status, row.cancel_reason = "cancelled", (reason or "").strip() or "Cancelled by the case officer."
    L.audit(db, actor, "CASE_FOLLOWUP_CANCELLED", report, f"{actor.name} cancelled a follow-up on report #{report.report_id}: {row.title}.",
            table="case_followups", target_id=row.followup_id)
    return row


# ---------------------------------------------------------------------------------------------------- contact logs
def record_contact(db: Session, report: Report, actor: User, data: ContactIn) -> CaseContactLog:
    L.require_open(report, "record a contact")
    now = _now()
    contact_at = _naive(data.contact_at) if data.contact_at else now
    if contact_at > now + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="The contact time cannot be in the future.")
    row = CaseContactLog(report_id=report.report_id, subdivision_id=report.subdivision_id, method=data.method,
                         with_whom=data.with_whom.strip(), summary=data.summary.strip(), outcome=data.outcome,
                         contact_at=contact_at, logged_by=actor.user_id)
    db.add(row)
    db.flush()
    disputed = False
    if data.outcome == "denied_ownership" and case_state.ownership_of(report) not in ("confirmed", "disputed"):
        # A denial is recorded as a dispute of ownership. It does not close the case and is not read as dishonesty.
        report.ownership_status = "disputed"
        report.ownership_note = report.ownership_note or "The person approached denies ownership. Statement recorded."
        disputed = True
    if data.next_step_at is not None:
        create_followup(db, report, actor, FollowUpIn(
            kind="follow_up", title=f"Follow up with {data.with_whom.strip().split(' (')[0]}"[:200], due_at=data.next_step_at))
    L.advance_case(db, report, actor, V.UNDER_REVIEW, "contact recorded")
    L.audit(db, actor, "CASE_CONTACT_RECORDED", report, f"{actor.name} recorded a contact with {row.with_whom} on report #{report.report_id}.",
            table="case_contact_logs", target_id=row.log_id,
            new={"method": row.method, "outcome": row.outcome, "ownership_marked_disputed": disputed})
    return row


# ------------------------------------------------------------------------------------------------------- links
def active_links(db: Session, report_id: int) -> List[CaseLink]:
    return (db.query(CaseLink).filter(((CaseLink.report_id == report_id) | (CaseLink.related_report_id == report_id)),
                                      CaseLink.unlinked_at.is_(None)).order_by(CaseLink.link_id).all())


def link_reports(db: Session, report: Report, actor: User, data: LinkIn) -> List[CaseLink]:
    """
    Link the report to others about the same thing. Nothing is hidden and nothing is merged: both reports stay whole,
    and each stays in its own status. Both must be in the actor's scope and the same subdivision.
    """
    out: List[CaseLink] = []
    for other_id in dict.fromkeys(data.report_ids):
        if other_id == report.report_id:
            raise HTTPException(status_code=422, detail="A report cannot be linked to itself.")
        other = db.query(Report).filter(Report.report_id == other_id).first()
        if other is None:
            raise HTTPException(status_code=404, detail=f"Report #{other_id} not found.")
        verify_subdivision_scope(actor, other.subdivision_id, db=db)
        if other.subdivision_id != report.subdivision_id:
            raise HTTPException(status_code=422, detail="Reports from different subdivisions cannot be linked.")
        low, high = sorted((report.report_id, other_id))
        existing = db.query(CaseLink).filter(CaseLink.report_id == low, CaseLink.related_report_id == high,
                                             CaseLink.unlinked_at.is_(None)).first()
        if existing is not None:
            out.append(existing)
            continue
        link = CaseLink(report_id=low, related_report_id=high, link_type=data.link_type, note=(data.note or "").strip() or None,
                        linked_by=actor.user_id)
        db.add(link)
        db.flush()
        L.audit(db, actor, "CASE_LINKED", report, f"{actor.name} linked report #{report.report_id} to #{other_id} ({data.link_type}).",
                table="case_links", target_id=link.link_id, new={"report_id": low, "related_report_id": high, "link_type": data.link_type})
        out.append(link)
    return out


def unlink_reports(db: Session, report: Report, actor: User, link_id: int, reason: str) -> CaseLink:
    """Undo a link. The row is kept, with who ended it and why; both reports are exactly as they were."""
    link = db.query(CaseLink).filter(CaseLink.link_id == link_id).first()
    if link is None or report.report_id not in (link.report_id, link.related_report_id):
        raise HTTPException(status_code=404, detail="Link not found on this case.")
    if link.unlinked_at is not None:
        raise HTTPException(status_code=409, detail="This link was already removed.")
    link.unlinked_at, link.unlinked_by, link.unlink_reason = _now(), actor.user_id, reason.strip()
    L.audit(db, actor, "CASE_UNLINKED", report, f"{actor.name} removed the link between report #{link.report_id} and #{link.related_report_id}.",
            table="case_links", target_id=link.link_id, old={"link_type": link.link_type}, new={"reason": link.unlink_reason})
    return link


def related_report_ids(db: Session, report_id: int) -> List[int]:
    return [(l.related_report_id if l.report_id == report_id else l.report_id) for l in active_links(db, report_id)]
