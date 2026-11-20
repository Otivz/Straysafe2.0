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
            barangay = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first()
            if barangay and not name:
                name = f"Barangay {barangay.barangay_name}"
        if not name:
            name = "Barangay Hall — Peace & Order"
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name the organisation the case is referred to.")
    return name, barangay_id


def _serialize_docs(docs) -> Optional[str]:
    if not docs:
        return None
    import json
    items = [d.model_dump() if hasattr(d, "model_dump") else dict(d) for d in docs]
    return json.dumps(items) if items else None


def create_referral(db: Session, report: Report, actor: User, data: ReferralIn) -> BarangayReferral:
    """Refer the case to an outside organisation. No assessment and no registered animal is needed."""
    L.require_open(report, "refer it")
    now = _now()
    name, barangay_id = _organisation(db, report, data)
    referred_at = _naive(data.referred_at) if data.referred_at else now
    if referred_at > now + timedelta(days=1):
        raise HTTPException(status_code=422, detail="The referral date cannot be in the future.")
    # Prevent accidental double-click duplicate submissions within 60 seconds for the exact same org and reason
    recent_dup = db.query(BarangayReferral).filter(
        BarangayReferral.report_id == report.report_id,
        func.lower(BarangayReferral.org_name) == name.lower(),
        func.lower(BarangayReferral.reason) == data.reason.strip().lower(),
        BarangayReferral.status_updated_at >= now - timedelta(seconds=60),
    ).first()
    if recent_dup is not None:
        raise HTTPException(status_code=409, detail=f"This referral to {name} was just submitted.")

    priority_level = (data.priority_level or ("urgent" if data.is_urgent else "normal")).lower()
    is_urgent = bool(data.is_urgent or priority_level == "urgent")
    if data.initial_status:
        initial_status = data.initial_status
    else:
        initial_status = "sent" if data.contacted else "pending"
    contacted = initial_status not in ("to_contact", "pending")
    additional_notes = (data.additional_notes or data.notes or "").strip() or None
    docs_json = _serialize_docs(data.supporting_documents)

    referral = BarangayReferral(
        report_id=report.report_id, barangay_id=barangay_id, referred_by=actor.user_id, referred_at=referred_at,
        reason=data.reason.strip(), reference_no=(data.reference_no or "").strip() or None,
        contact_method=V.UI_CONTACT_TO_STORED.get(data.contact_method, "other"), org_type=data.org_type, org_name=name,
        contact_person=(data.contact_person or "").strip() or None, contact_detail=(data.contact_detail or "").strip() or None,
        is_urgent=is_urgent, priority_level=priority_level, supporting_documents=docs_json, additional_notes=additional_notes,
        referral_status=initial_status, status_updated_at=now, status_updated_by=actor.user_id)
    db.add(referral)
    db.flush()
    if not referral.reference_no:
        referral.reference_no = f"REF-{referred_at.year}-{referral.referral_id:04d}"
    init_note = additional_notes or f"Referral created ({priority_level.capitalize()} priority) for {name}."
    db.add(BarangayReferralUpdate(
        referral_id=referral.referral_id, update_type="created", source="straysafe_user",
        update_date=referred_at.date(), note=init_note, status_after=referral.referral_status,
        additional_notes=additional_notes, supporting_documents=docs_json,
        evidence_url=data.supporting_documents[0].url if data.supporting_documents else None,
        recorded_by=actor.user_id))
    L.advance_case(db, report, actor, V.IN_PROGRESS, "referral sent" if contacted else "referral created")
    L.history(db, report, actor, f"Referred to {name} ({referral.reference_no})." if contacted else f"Referral {referral.reference_no} for {name} created ({initial_status}).")
    L.audit(db, actor, "CASE_REFERRAL_CREATED" if contacted else "CASE_ASSISTANCE_REQUESTED", report,
            f"{actor.name} created referral {referral.reference_no} on report #{report.report_id} to {name}.", table="barangay_referrals",
            target_id=referral.referral_id,
            new={"org_type": data.org_type, "org_name": name, "priority_level": priority_level, "urgent": is_urgent,
                 "contact_method": referral.contact_method, "reference_no": referral.reference_no, "status": initial_status})
    return referral


def update_referral(db: Session, report: Report, actor: User, referral: BarangayReferral, data: ReferralUpdateIn) -> BarangayReferral:
    """
    Record what the organisation reported (or that it has not), its status, or final outcome. The case's status does not change:
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
    if previous in ("resolved", "completed", "declined", "cancelled") and data.update_type == "agency_response":
        raise HTTPException(status_code=422, detail=f"This referral is already {previous} and cannot record new agency responses.")
    if data.status == "to_contact":
        raise HTTPException(status_code=422, detail="Record the contact when it happens instead.")
    if data.status in ("declined", "cancelled") and len((data.note or "").strip()) < 3:
        raise HTTPException(status_code=422, detail=f"Please provide a reason when marking a referral as {data.status}.")
    if data.status in ("resolved", "completed"):
        outcome_text = (data.external_outcome or "").strip() or (data.note or "").strip() or (referral.external_outcome or "").strip()
        if len(outcome_text) < 3:
            raise HTTPException(status_code=422, detail="Document the referral outcome before marking the referral as Resolved.")

    referral.referral_status, referral.status_updated_at, referral.status_updated_by = data.status, now, actor.user_id
    if data.contact_method:
        referral.contact_method = V.UI_CONTACT_TO_STORED.get(data.contact_method, "other")
    if data.contact_person is not None:
        referral.contact_person = data.contact_person.strip() or referral.contact_person
    if data.contact_detail is not None:
        referral.contact_detail = data.contact_detail.strip() or referral.contact_detail
    if data.external_outcome is not None:
        referral.external_outcome = data.external_outcome.strip() or None
    elif data.status in ("resolved", "completed") and not referral.external_outcome:
        referral.external_outcome = data.note.strip()
    if data.assistance_provided is not None:
        referral.assistance_provided = data.assistance_provided.strip() or referral.assistance_provided
    if data.actions_completed is not None:
        referral.actions_completed = data.actions_completed.strip() or referral.actions_completed
    if data.remaining_follow_up is not None:
        referral.remaining_follow_up = data.remaining_follow_up.strip() or None
    if data.additional_notes is not None and data.update_type == "outcome":
        referral.outcome_note = data.additional_notes.strip() or data.note.strip()

    if data.status in ("resolved", "completed") or data.update_type == "outcome":
        comp_dt = _naive(data.completion_date) if data.completion_date else when
        referral.outcome_date = comp_dt.date()
        referral.outcome_note = (data.additional_notes or data.note or "").strip() or referral.outcome_note
        referral.outcome_recorded_by = actor.user_id
        referral.outcome_recorded_at = now

    docs_json = _serialize_docs(data.supporting_documents)
    evidence_url = data.evidence_url or (data.supporting_documents[0].url if data.supporting_documents else None)
    source = "straysafe_user" if data.status in ("pending", "sent", "no_response", "cancelled") else (
        "barangay_reported" if referral.org_type == "barangay" else "org_reported"
    )
    u_type = data.update_type or ("outcome" if data.status in ("resolved", "completed") else ("acknowledged" if data.status == "acknowledged" else "status_change"))
    db.add(BarangayReferralUpdate(
        referral_id=referral.referral_id, update_type=u_type,
        source=source, update_date=when.date(), note=data.note.strip(), evidence_url=evidence_url,
        status_after=data.status, responder_name=(data.responder_name or "").strip() or None,
        assistance_provided=(data.assistance_provided or "").strip() or None,
        progress_notes=(data.progress_notes or "").strip() or None,
        follow_up_instructions=(data.follow_up_instructions or "").strip() or None,
        additional_notes=(data.additional_notes or "").strip() or None,
        supporting_documents=docs_json, recorded_by=actor.user_id))
    scheduled = None
    if data.follow_up_at is not None:
        settings = case_policy.load_settings(db, report.subdivision_id)
        due = case_policy.resolve_followup_due(settings, data.follow_up_at, now)
        referral.follow_up_at = due
        title = (referral.remaining_follow_up or f"Check with {referral.org_name}")[:90]
        scheduled = CaseFollowUp(report_id=report.report_id, subdivision_id=report.subdivision_id, kind="referral_check",
                                 title=title, due_at=due, status="pending", referral_id=referral.referral_id, created_by=actor.user_id)
        db.add(scheduled)
    if previous in ("to_contact", "pending") and data.status == "sent":
        L.history(db, report, actor, f"{referral.org_name} contacted ({referral.reference_no or f'#{referral.referral_id}'}): sent.")
    elif u_type == "outcome":
        L.history(db, report, actor, f"Outcome recorded for referral to {referral.org_name}: {data.status.replace('_', ' ')}.")
    elif u_type == "agency_response":
        L.history(db, report, actor, f"Agency response recorded from {referral.org_name} ({data.status.replace('_', ' ')}).")
    else:
        L.history(db, report, actor, f"Update from {referral.org_name}: {data.status.replace('_', ' ')}.")
    L.audit(db, actor, "CASE_REFERRAL_UPDATED", report, f"{actor.name} recorded an update ({u_type}) for {referral.org_name} on report #{report.report_id}.",
            table="barangay_referrals", target_id=referral.referral_id,
            old={"referral_status": previous}, new={"referral_status": data.status, "update_type": u_type,
                                                    "case_status_unchanged": case_state.case_status_of(report),
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


def link_reports(db: Session, report: Report, actor: User, data: LinkIn, *, synchronize_lost_found: bool = True) -> List[CaseLink]:
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
        if synchronize_lost_found and data.link_type == "same_animal":
            from app.services import lost_found_matching as LFM
            if {LFM.family_of(report), LFM.family_of(other)} == {V.LOST_PET, V.FOUND_ANIMAL}:
                low, high = sorted((report.report_id, other_id))
                existing = db.query(CaseLink).filter(CaseLink.report_id == low, CaseLink.related_report_id == high,
                                                     CaseLink.unlinked_at.is_(None)).first()
                match = db.query(LFM.LostFoundMatch).filter(
                    LFM.LostFoundMatch.lost_report_id == (report.report_id if LFM.family_of(report) == V.LOST_PET else other_id),
                    LFM.LostFoundMatch.found_report_id == (other_id if LFM.family_of(report) == V.LOST_PET else report.report_id)).first()
                if existing is not None and match is not None and match.status == LFM.CONFIRMED:
                    LFM.open_thread(db, match, actor)
                    out.append(existing)
                    continue
                match = LFM.link_by_leader(db, actor, report.report_id, other_id)
                link = db.get(CaseLink, match.link_id)
                if link is not None:
                    out.append(link)
                continue
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


def unlink_reports(db: Session, report: Report, actor: User, link_id: int, reason: str, *, synchronize_lost_found: bool = True) -> CaseLink:
    """Undo a link. The row is kept, with who ended it and why; both reports are exactly as they were."""
    link = db.query(CaseLink).filter(CaseLink.link_id == link_id).first()
    if link is None or report.report_id not in (link.report_id, link.related_report_id):
        raise HTTPException(status_code=404, detail="Link not found on this case.")
    if link.unlinked_at is not None:
        raise HTTPException(status_code=409, detail="This link was already removed.")
    if synchronize_lost_found:
        from app.services import lost_found_matching as LFM
        match = db.query(LFM.LostFoundMatch).filter(LFM.LostFoundMatch.link_id == link.link_id,
                                                   LFM.LostFoundMatch.status == LFM.CONFIRMED).first()
        if match is not None:
            LFM.unlink(db, match, actor)
            return link
    link.unlinked_at, link.unlinked_by, link.unlink_reason = _now(), actor.user_id, reason.strip()
    L.audit(db, actor, "CASE_UNLINKED", report, f"{actor.name} removed the link between report #{link.report_id} and #{link.related_report_id}.",
            table="case_links", target_id=link.link_id, old={"link_type": link.link_type}, new={"reason": link.unlink_reason})
    return link


def related_report_ids(db: Session, report_id: int) -> List[int]:
    return [(l.related_report_id if l.report_id == report_id else l.report_id) for l in active_links(db, report_id)]
