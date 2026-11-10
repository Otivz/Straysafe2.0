"""
Case workflow endpoints for the Subdivision Admin (the Subdivision Leader of the report's subdivision, or the
Administrator). Residents and Barangay staff get nothing from here.

    GET  /cases/categories                      the six categories and which are on (any signed-in user)
    GET  /cases/summaries                       one short row per case, paged: what the list, dashboard and map load first
    GET  /cases/work-queue                      the open follow-ups, claims, referrals and warnings across the open cases
    GET/PUT /cases/settings/{subdivision_id}    categories, policies, follow-up periods, publication policy
    GET  /cases/{id}                            the whole case: status, assessment, referrals, follow-ups, contacts, links, claims
    GET/POST /cases/{id}/notes                  internal staff notes (kept out of the resident-visible timeline)
    POST /cases/{id}/status                     move by hand (reported / under review / in progress)
    PUT  /cases/{id}/assessment                 incident, evidence, urgency, animal identity, ownership
    PUT  /cases/{id}/priority
    POST /cases/{id}/close                      a documented disposition; the outcome is never assumed to be a resolution
    POST /cases/{id}/reopen
    POST /cases/{id}/warnings/{warning_id}/observations   a compliance observation (concluding it never closes the case)
    ...referrals, follow-ups, contacts, links, claim review, warning eligibility

Every rule is applied here on the server (see services/case_lifecycle.py): the screens only show what the server allows.
No endpoint needs a registered animal.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.case_records import CaseContactLog, CaseFollowUp, OwnershipClaim
from app.models.barangay_referral import BarangayReferral
from app.models.report import ReportCategory
from app.models.user import Barangay, Subdivision, User
from app.schemas.case import (AssessmentIn, CaseSettings, CloseIn, ComplianceIn, ContactIn, ClaimReviewIn, FollowUpCancel, FollowUpDone,
                              FollowUpIn, LinkIn, NoteIn, PriorityChange, ReferralIn, ReferralUpdateIn, ReopenIn, StatusMove,
                              UnlinkIn)
from app.services import case_claims, case_compliance, case_lifecycle as L, case_notes, case_summaries, case_view, case_work
from app.utils import case_policy, case_vocab as V
from app.utils.auth import get_current_user, verify_subdivision_scope

router = APIRouter(prefix="/cases", tags=["cases"])


def _meta(request: Request) -> Dict[str, Any]:
    return {"ip": request.client.host if request.client else None, "user_agent": request.headers.get("user-agent")}


def _detail(db: Session, report_id: int, user: User) -> Dict[str, Any]:
    report = L.case_for_staff(db, report_id, user)
    db.refresh(report)
    return case_view.case_detail(db, report, user)


# ----------------------------------------------------------------------------------------- categories, settings
@router.get("/categories")
def list_categories(subdivision_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The six categories and whether the subdivision accepts each. Residents see their own subdivision's."""
    target = user.subdivision_id if user.role_id in (1, 2) else subdivision_id
    if user.role_id in (1, 2) and subdivision_id is not None and subdivision_id != user.subdivision_id:
        raise HTTPException(status_code=403, detail="That is another subdivision's setting.")
    settings = case_policy.load_settings(db, target)
    sub = db.query(Subdivision).filter(Subdivision.subdivision_id == target).first() if target else None
    barangay = db.query(Barangay).filter(Barangay.barangay_id == sub.barangay_id).first() if sub else None
    # The stored id of each kind of concern (a report is filed with it): the row named exactly as the kind, else the first older row read as it
    ids: Dict[str, int] = {}
    stored = db.query(ReportCategory).order_by(ReportCategory.category_id).all()
    for row in stored:
        family = V.category_family(row.category_name)
        if family not in ids or row.category_name == V.CATEGORY_FAMILIES[family]:
            ids[family] = row.category_id
    return {"subdivision_id": target,
            # who the signed-in person's subdivision is and how to reach its office (the resident Contact page reads this)
            "subdivision": {"name": sub.subdivision_name if sub else None, "city": barangay.city if barangay else None,
                            "office": settings.office.model_dump()},
            # whether the subdivision publishes a lost-pet / found-animal notice at once or an officer reviews it first, so the
            # resident's screens can say which will happen to the notice they are about to ask for
            "publication": settings.publication.model_dump(),
            "categories": [
                {"id": k, "category_id": ids.get(k), "label": label, "description": V.CATEGORY_DESCRIPTIONS[k],
                 "enabled": case_policy.category_enabled(settings, k)}
                for k, label in V.CATEGORY_FAMILIES.items()],
            # every stored category and the kind of concern it is read as. A report keeps the category it was filed under, so older
            # reports are Injured, Aggressive, Rabies Risk, Roaming Animal or Rescue Needed; the resident's list names each correctly
            "stored_categories": [{"category_id": row.category_id, "family": V.category_family(row.category_name)} for row in stored]}


@router.get("/summaries")
def list_case_summaries(limit: Optional[int] = None, offset: int = 0, status: Optional[str] = None,
                        subdivision_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One short row per case (newest first), paged: what the Admin list, dashboard and map load first. The whole case is
    GET /cases/{id}. status = open | reported | under_review | in_progress | closed. Declared before /{report_id}."""
    return case_summaries.case_summaries(db, user, limit, offset, status, subdivision_id)


@router.get("/work-queue")
def get_work_queue(subdivision_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """What is still open across the subdivision's open cases (follow-ups, claims, referrals, warnings), so the dashboard
    does not have to open every case. Declared before /{report_id}, which would otherwise try to read it as an id."""
    return case_notes.work_queue(db, user, subdivision_id)


def _settings_scope(db: Session, subdivision_id: int, user: User) -> None:
    if user.role_id not in L.STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader or the Administrator can read or change these settings.")
    if db.query(Subdivision).filter(Subdivision.subdivision_id == subdivision_id).first() is None:
        raise HTTPException(status_code=404, detail="Subdivision not found.")
    verify_subdivision_scope(user, subdivision_id, db=db)


@router.get("/settings/{subdivision_id}")
def get_settings(subdivision_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _settings_scope(db, subdivision_id, user)
    return case_policy.load_settings(db, subdivision_id).model_dump(mode="json")


@router.put("/settings/{subdivision_id}")
def put_settings(subdivision_id: int, body: CaseSettings, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    _settings_scope(db, subdivision_id, user)
    before = case_policy.load_settings(db, subdivision_id).model_dump(mode="json")
    saved = case_policy.save_settings(db, subdivision_id, body, user.user_id)
    after = saved.model_dump(mode="json")
    meta = _meta(request)
    db.add(AuditLog(user_id=user.user_id, action="CASE_SETTINGS_CHANGED", target_table="system_settings", target_id=subdivision_id,
                    description=f"{user.name} changed the case settings of subdivision {subdivision_id}.", log_type="operation",
                    old_values=before, new_values=after, ip_address=meta["ip"], user_agent=meta["user_agent"]))
    db.commit()
    return after


# ------------------------------------------------------------------------------------------------------- the case
@router.get("/{report_id}")
def get_case(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    return case_view.case_detail(db, report, user)


@router.get("/{report_id}/notes")
def list_case_notes(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Internal notes on the case, newest first. Staff only: they are not part of the timeline residents can read."""
    L.case_for_staff(db, report_id, user)
    return {"notes": case_notes.list_notes(db, report_id)}


@router.post("/{report_id}/notes", status_code=201)
def add_case_note(report_id: int, body: NoteIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    meta = _meta(request)
    note = case_notes.add_note(db, report, user, body.text, meta["ip"], meta["user_agent"])
    db.commit()
    return note


@router.post("/{report_id}/status")
def change_status(report_id: int, body: StatusMove, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    L.move_case(db, report, user, body.to, body.note)
    db.commit()
    return _detail(db, report_id, user)


@router.put("/{report_id}/assessment")
def put_assessment(report_id: int, body: AssessmentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    L.save_assessment(db, report, user, body)
    db.commit()
    return _detail(db, report_id, user)


@router.put("/{report_id}/priority")
def put_priority(report_id: int, body: PriorityChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    L.set_priority(db, report, user, body.priority, body.reason)
    db.commit()
    return _detail(db, report_id, user)


@router.get("/{report_id}/closure-options")
def closure_options(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Every disposition, and whether it can be used on this case now (with the reason when it cannot)."""
    report = L.case_for_staff(db, report_id, user)
    out = []
    for key, (group, _legacy, label) in V.DISPOSITIONS.items():
        ok, why = L.disposition_availability(db, report, key)
        out.append({"disposition": key, "label": label, "outcome": group, "available": ok, "reason": why})
    return {"options": out, "open_items": L.open_items(db, report)}


@router.post("/{report_id}/close")
def close(report_id: int, body: CloseIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    result = L.close_case(db, report, user, body, **_meta(request))
    db.commit()
    return {"result": result, "case": _detail(db, report_id, user)}


@router.post("/{report_id}/reopen")
def reopen(report_id: int, body: ReopenIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    L.reopen_case(db, report, user, body.reason, **_meta(request))
    db.commit()
    return _detail(db, report_id, user)


# ----------------------------------------------------------------------------------------------------- referrals
@router.get("/{report_id}/referrals")
def list_referrals(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    rows = db.query(BarangayReferral).filter(BarangayReferral.report_id == report.report_id).order_by(BarangayReferral.referral_id.desc()).all()
    names = case_view._names(db, [r.referred_by for r in rows] + [u.recorded_by for r in rows for u in r.updates])
    return [case_view.referral_view(r, names) for r in rows]


@router.post("/{report_id}/referrals", status_code=201)
def create_referral(report_id: int, body: ReferralIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    referral = case_work.create_referral(db, report, user, body)
    db.commit()
    db.refresh(referral)
    return case_view.referral_view(referral, case_view._names(db, [referral.referred_by] + [u.recorded_by for u in referral.updates]))


@router.post("/{report_id}/referrals/{referral_id}/updates")
def update_referral(report_id: int, referral_id: int, body: ReferralUpdateIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    referral = case_work.update_referral(db, report, user, case_work.referral_for_case(db, report, referral_id), body)
    db.commit()
    db.refresh(referral)
    return case_view.referral_view(referral, case_view._names(db, [referral.referred_by] + [u.recorded_by for u in referral.updates]))


# ---------------------------------------------------------------------------------------------------- follow-ups
@router.get("/{report_id}/followups")
def list_followups(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    rows = db.query(CaseFollowUp).filter(CaseFollowUp.report_id == report.report_id).order_by(CaseFollowUp.followup_id.desc()).all()
    names = case_view._names(db, [f.created_by for f in rows])
    return [case_view.followup_view(f, names) for f in rows]


@router.post("/{report_id}/followups", status_code=201)
def create_followup(report_id: int, body: FollowUpIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    row = case_work.create_followup(db, report, user, body)
    db.commit()
    db.refresh(row)
    return case_view.followup_view(row, case_view._names(db, [row.created_by]))


@router.post("/{report_id}/followups/{followup_id}/complete")
def complete_followup(report_id: int, followup_id: int, body: FollowUpDone, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    row = case_work.complete_followup(db, report, user, case_work.followup_for_case(db, report, followup_id), body.note)
    db.commit()
    db.refresh(row)
    return case_view.followup_view(row, case_view._names(db, [row.created_by]))


@router.post("/{report_id}/followups/{followup_id}/cancel")
def cancel_followup(report_id: int, followup_id: int, body: FollowUpCancel, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    row = case_work.cancel_followup(db, report, user, case_work.followup_for_case(db, report, followup_id), body.reason)
    db.commit()
    db.refresh(row)
    return case_view.followup_view(row, case_view._names(db, [row.created_by]))


# ------------------------------------------------------------------------------------------------------ contacts
@router.get("/{report_id}/contacts")
def list_contacts(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    rows = db.query(CaseContactLog).filter(CaseContactLog.report_id == report.report_id).order_by(CaseContactLog.contact_at.desc()).all()
    names = case_view._names(db, [c.logged_by for c in rows])
    return [case_view.contact_view(c, names) for c in rows]


@router.post("/{report_id}/contacts", status_code=201)
def create_contact(report_id: int, body: ContactIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    row = case_work.record_contact(db, report, user, body)
    db.commit()
    db.refresh(row)
    return case_view.contact_view(row, case_view._names(db, [row.logged_by]))


# --------------------------------------------------------------------------------------------------------- links
@router.get("/{report_id}/links")
def list_links(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    return [{"link_id": l.link_id, "report_id": l.related_report_id if l.report_id == report.report_id else l.report_id,
             "link_type": l.link_type, "note": l.note, "linked_at": l.linked_at} for l in case_work.active_links(db, report.report_id)]


@router.post("/{report_id}/links", status_code=201)
def create_links(report_id: int, body: LinkIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    links = case_work.link_reports(db, report, user, body)
    db.commit()
    return [{"link_id": l.link_id, "report_id": l.related_report_id if l.report_id == report.report_id else l.report_id,
             "link_type": l.link_type, "note": l.note, "linked_at": l.linked_at} for l in links]


@router.post("/{report_id}/links/{link_id}/unlink")
def remove_link(report_id: int, link_id: int, body: UnlinkIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user, write=True)
    link = case_work.unlink_reports(db, report, user, link_id, body.reason)
    db.commit()
    return {"link_id": link.link_id, "unlinked_at": link.unlinked_at, "reason": link.unlink_reason}


# ---------------------------------------------------------------------------------------- warnings and claims
@router.get("/{report_id}/warning-eligibility")
def warning_eligibility(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """What a warning on this case needs, and the first thing missing. The warning endpoint enforces the same rules."""
    report = L.case_for_staff(db, report_id, user)
    return case_view.warning_eligibility(db, report)


@router.post("/{report_id}/warnings/{warning_id}/observations", status_code=201)
def record_compliance(report_id: int, warning_id: int, body: ComplianceIn, request: Request, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """A compliance observation on a warning. Concluding it ends the observation; it never closes the case."""
    report = L.case_for_staff(db, report_id, user, write=True)
    meta = _meta(request)
    out = case_compliance.record_observation(db, report, warning_id, user, body.result, body.notes, body.observed_at, body.conclude,
                                             meta["ip"], meta["user_agent"])
    db.commit()
    return out


@router.get("/{report_id}/claims")
def list_claims(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = L.case_for_staff(db, report_id, user)
    return [case_claims.claim_view(db, c, True) for c in case_claims.claims_of(db, report, user)]


@router.post("/{report_id}/claims/{claim_id}/review")
def review_claim(report_id: int, claim_id: int, body: ClaimReviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Review an ownership claim. Accepting it never confirms ownership: that is recorded with evidence in the assessment."""
    report = L.case_for_staff(db, report_id, user, write=True)
    claim = db.query(OwnershipClaim).filter(OwnershipClaim.claim_id == claim_id, OwnershipClaim.report_id == report.report_id).first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found on this case.")
    case_claims.review_claim(db, report, user, claim, body)
    db.commit()
    db.refresh(claim)
    return case_claims.claim_view(db, claim, True)
