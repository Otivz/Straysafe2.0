"""
Two reads and one write the approved Admin screens need that no earlier endpoint gave them. No schema change.

Internal case notes
    A note is staff-only. It is kept in the existing audit log (action CASE_NOTE, log_type case_note, target = the report),
    so no table or column is added, and it is never written to the case timeline (status_history), which residents can read.
    The Admin timeline shows notes by merging this list with the timeline it already has.

The work queue
    What is still open across the subdivision's open cases, in four short lists (follow-ups, ownership claims, referrals,
    warnings), so the dashboard can show what needs attention without opening every case. Each row carries the report id so
    the screen can attach it to the case summary it already loaded.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.barangay_referral import BarangayReferral
from app.models.case_records import CaseFollowUp, OwnershipClaim
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.services.case_summaries import scope_of, status_expr
from app.utils import case_vocab as V

NOTE_ACTION = "CASE_NOTE"
NOTE_LOG_TYPE = "case_note"
MAX_NOTE_CHARS = 2000
QUEUE_LIMIT = 500           # per list: a subdivision's open work is small; this only stops a runaway query


def _name_of(db: Session, user_ids) -> Dict[int, str]:
    ids = {i for i in user_ids if i}
    return {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(ids)).all()} if ids else {}


# ------------------------------------------------------------------------------------------------------------- notes
def note_view(log: AuditLog, author: Optional[str]) -> Dict[str, Any]:
    return {"note_id": log.log_id, "report_id": log.target_id, "text": log.description or "", "by": log.user_id,
            "by_name": author, "at": log.created_at}


def list_notes(db: Session, report_id: int) -> List[Dict[str, Any]]:
    rows = (db.query(AuditLog).filter(AuditLog.action == NOTE_ACTION, AuditLog.target_table == "reports", AuditLog.target_id == report_id)
            .order_by(AuditLog.log_id.desc()).all())
    names = _name_of(db, [r.user_id for r in rows])
    return [note_view(r, names.get(r.user_id)) for r in rows]


def add_note(db: Session, report: Report, actor: User, text: str, ip: Optional[str] = None, user_agent: Optional[str] = None) -> Dict[str, Any]:
    clean = (text or "").strip()
    if not clean:
        raise HTTPException(status_code=422, detail="A note cannot be empty.")
    if len(clean) > MAX_NOTE_CHARS:
        raise HTTPException(status_code=422, detail=f"A note can be up to {MAX_NOTE_CHARS} characters.")
    log = AuditLog(user_id=actor.user_id, action=NOTE_ACTION, target_table="reports", target_id=report.report_id,
                   description=clean, log_type=NOTE_LOG_TYPE, ip_address=ip, user_agent=user_agent)
    db.add(log)
    db.flush()
    db.refresh(log)
    return note_view(log, actor.name)


# --------------------------------------------------------------------------------------------------------- work queue
def _open_report_ids(db: Session, subdivision_id: Optional[int]) -> List[int]:
    """Cases that are not closed, read the way case_state.case_status_of reads them (an old row may have no case_status yet)."""
    query = db.query(Report.report_id).filter(status_expr() != V.CLOSED, Report.duplicate_of_report_id.is_(None))
    if subdivision_id is not None:
        query = query.filter(Report.subdivision_id == subdivision_id)
    return [rid for (rid,) in query.all()]


def work_queue(db: Session, user: User, subdivision_id: Optional[int] = None) -> Dict[str, Any]:
    """The open follow-ups, claims, referrals and warnings of the open cases a staff member may see."""
    scope = scope_of(user, subdivision_id, "work queue")
    ids = _open_report_ids(db, scope)
    out: Dict[str, Any] = {"subdivision_id": scope, "generated_at": datetime.now(), "followups": [], "claims": [], "referrals": [], "warnings": []}
    if not ids:
        return out

    followups = (db.query(CaseFollowUp).filter(CaseFollowUp.report_id.in_(ids), CaseFollowUp.status == "pending")
                 .order_by(CaseFollowUp.due_at.is_(None), CaseFollowUp.due_at, CaseFollowUp.followup_id).limit(QUEUE_LIMIT).all())
    claims = (db.query(OwnershipClaim).filter(OwnershipClaim.report_id.in_(ids), OwnershipClaim.status.in_(list(V.ACTIVE_CLAIM_STATUSES)))
              .order_by(OwnershipClaim.claim_id).limit(QUEUE_LIMIT).all())
    referrals = (db.query(BarangayReferral).filter(
        BarangayReferral.report_id.in_(ids), BarangayReferral.final_outcome.is_(None),
        or_(BarangayReferral.referral_status.is_(None), BarangayReferral.referral_status.in_(list(V.OPEN_REFERRAL_STATUSES))))
        .order_by(BarangayReferral.referral_id).limit(QUEUE_LIMIT).all())
    warnings = (db.query(OwnerWarning).filter(OwnerWarning.report_id.in_(ids), OwnerWarning.follow_up_at.isnot(None))
                .order_by(OwnerWarning.follow_up_at).limit(QUEUE_LIMIT).all())

    names = _name_of(db, [f.created_by for f in followups] + [c.claimant_user_id for c in claims] + [w.user_id for w in warnings])
    out["followups"] = [{"followup_id": f.followup_id, "report_id": f.report_id, "kind": f.kind, "title": f.title, "notes": f.notes,
                         "due_at": f.due_at, "status": f.status, "created_at": f.created_at, "created_by": f.created_by,
                         "created_by_name": names.get(f.created_by), "referral_id": f.referral_id} for f in followups]
    out["claims"] = [{"claim_id": c.claim_id, "report_id": c.report_id, "status": c.status, "submitted_at": c.submitted_at,
                      "claimant_user_id": c.claimant_user_id, "claimant_name": names.get(c.claimant_user_id), "claimed_pet_id": c.claimed_pet_id,
                      "statement": c.statement, "evidence": c.evidence or []} for c in claims]
    out["referrals"] = [{"referral_id": r.referral_id, "report_id": r.report_id, "org_type": r.org_type, "org_name": r.org_name,
                         "status": r.referral_status or "sent", "is_urgent": bool(r.is_urgent), "reason": r.reason, "referred_at": r.referred_at,
                         "follow_up_at": r.follow_up_at, "contact_person": r.contact_person, "contact_detail": r.contact_detail,
                         "updated_at": r.status_updated_at or r.referred_at}
                        for r in referrals]
    out["warnings"] = [{"warning_id": w.warning_id, "report_id": w.report_id, "owner_user_id": w.user_id, "owner_name": names.get(w.user_id),
                        "policy_id": w.policy_id, "policy_title": w.policy_title, "policy_reference": w.policy_reference,
                        "observation_days": w.observation_days, "follow_up_at": w.follow_up_at, "status": w.status,
                        "created_at": w.created_at, "description": w.description} for w in warnings]
    return out
