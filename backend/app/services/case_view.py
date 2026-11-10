"""
The case as staff see it: one record that gathers everything the Subdivision Admin screen needs.

STAFF ONLY. It carries the reporter's identity, the owner, internal notes and referral details; it is built for
`GET /cases/{id}` (Leader of the subdivision, or the Administrator) and nowhere else. Residents never get this shape:
what a resident may see of a report is decided by utils/report_visibility.redact_response (an allow-list).
"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.barangay_referral import BarangayReferral
from app.models.case_records import CaseContactLog, CaseFollowUp
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.services import case_claims, case_compliance, case_lifecycle as L, case_work
from app.utils import case_policy, case_state
from app.utils import case_vocab as V
from app.utils.warning_rules import report_family, warning_blocker


def _names(db: Session, ids) -> Dict[int, str]:
    ids = {i for i in ids if i}
    return {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(ids)).all()} if ids else {}


def referral_view(r: BarangayReferral, names: Dict[int, str]) -> Dict[str, Any]:
    return {
        "referral_id": r.referral_id, "report_id": r.report_id, "org_type": r.org_type or ("barangay" if r.barangay_id else "other"),
        "org_name": r.org_name, "status": r.referral_status or ("completed" if r.final_outcome else "sent"),
        "is_open": (r.referral_status or ("completed" if r.final_outcome else "sent")) in V.OPEN_REFERRAL_STATUSES and not r.final_outcome,
        "is_urgent": bool(r.is_urgent), "reason": r.reason, "reference_no": r.reference_no, "contact_method": r.contact_method,
        "contact_person": r.contact_person, "contact_detail": r.contact_detail, "referred_at": r.referred_at,
        "referred_by": r.referred_by, "referred_by_name": names.get(r.referred_by),
        "external_outcome": r.external_outcome, "remaining_follow_up": r.remaining_follow_up, "follow_up_at": r.follow_up_at,
        "reported_outcome": r.final_outcome, "reported_outcome_date": r.outcome_date, "reported_outcome_note": r.outcome_note,
        "updates": [{"update_id": u.update_id, "update_type": u.update_type, "source": u.source, "update_date": u.update_date,
                     "note": u.note, "evidence_url": u.evidence_url, "status_after": u.status_after,
                     "recorded_by": u.recorded_by, "recorded_by_name": names.get(u.recorded_by), "recorded_at": u.recorded_at}
                    for u in r.updates],
    }


def followup_view(f: CaseFollowUp, names: Dict[int, str]) -> Dict[str, Any]:
    return {"followup_id": f.followup_id, "kind": f.kind, "title": f.title, "notes": f.notes, "due_at": f.due_at, "status": f.status,
            "referral_id": f.referral_id, "created_by": f.created_by, "created_by_name": names.get(f.created_by), "created_at": f.created_at,
            "completed_at": f.completed_at, "completion_note": f.completion_note, "cancel_reason": f.cancel_reason}


def contact_view(c: CaseContactLog, names: Dict[int, str]) -> Dict[str, Any]:
    return {"log_id": c.log_id, "method": c.method, "with_whom": c.with_whom, "summary": c.summary, "outcome": c.outcome,
            "contact_at": c.contact_at, "logged_by": c.logged_by, "logged_by_name": names.get(c.logged_by)}


def warning_view(w: OwnerWarning, observations: Optional[List[Dict[str, Any]]] = None, names: Optional[Dict[int, str]] = None) -> Dict[str, Any]:
    observations = observations or []
    ended = next((o for o in observations if o["concluded"]), None)
    return {"warning_id": w.warning_id, "warning_level": w.warning_level, "violation_type": w.violation_type, "status": w.status,
            "owner_user_id": w.user_id, "owner_name": (names or {}).get(w.user_id), "description": w.description,
            "issued_by": w.issued_by, "issued_by_name": (names or {}).get(w.issued_by),
            "policy_id": w.policy_id, "policy_title": w.policy_title, "policy_reference": w.policy_reference,
            "observation_days": w.observation_days, "follow_up_at": w.follow_up_at, "fine_amount": float(w.fine_amount or 0),
            "created_at": w.created_at, "observations": observations,
            "concluded": ended["concluded"] if ended else None, "concluded_at": ended["recorded_at"] if ended else None}


def warning_eligibility(db: Session, report: Report) -> Dict[str, Any]:
    """Whether a warning could be issued for this case now (owner not yet chosen), and the first thing missing."""
    blocker = warning_blocker(report, None)
    if blocker and "confirmed for this case" not in blocker[1]:
        return {"ok": False, "reason": blocker[1]}
    if not case_policy.applicable_policies(case_policy.load_settings(db, report.subdivision_id), report_family(report)):
        return {"ok": False, "reason": "No confirmed policy applies to this concern."}
    return {"ok": True, "reason": None}


def case_detail(db: Session, report: Report, viewer: User) -> Dict[str, Any]:
    rid = report.report_id
    status = case_state.case_status_of(report)
    category = report.category
    family = report_family(report)
    referrals = db.query(BarangayReferral).filter(BarangayReferral.report_id == rid).order_by(BarangayReferral.referral_id.desc()).all()
    followups = db.query(CaseFollowUp).filter(CaseFollowUp.report_id == rid).order_by(CaseFollowUp.followup_id.desc()).all()
    contacts = db.query(CaseContactLog).filter(CaseContactLog.report_id == rid).order_by(CaseContactLog.contact_at.desc()).all()
    warnings = db.query(OwnerWarning).filter(OwnerWarning.report_id == rid).order_by(OwnerWarning.warning_id.desc()).all()
    claims = case_claims.claims_of(db, report, viewer)
    links = case_work.active_links(db, rid)
    names = _names(db, [report.user_id, report.assigned_leader_id, report.assessed_by, report.ownership_owner_id, report.closed_by,
                        *[r.referred_by for r in referrals], *[u.recorded_by for r in referrals for u in r.updates],
                        *[f.created_by for f in followups], *[c.logged_by for c in contacts],
                        *[w.user_id for w in warnings], *[w.issued_by for w in warnings]])
    observations = case_compliance.observations_of(db, [w.warning_id for w in warnings])
    return {
        "report_id": rid,
        "case_status": status, "status_label": V.STATUS_LABELS[status], "legacy_status_id": report.current_status_id,
        "priority": case_state.priority_of(report), "is_sensitive": bool(report.is_sensitive),
        "category": {"category_id": report.category_id, "name": category.category_name if category else None, "family": family,
                     "label": V.CATEGORY_FAMILIES[family]},
        "animal": {"type": report.animal_type, "breed": report.animal_breed, "color": report.animal_color, "size": report.estimated_size,
                   "count": report.animal_count, "description": report.description, "condition": report.condition},
        "location": {"landmark": report.landmark, "latitude": float(report.latitude) if report.latitude is not None else None,
                     "longitude": float(report.longitude) if report.longitude is not None else None},
        "reported_at": report.created_at, "subdivision_id": report.subdivision_id,
        "reporter": {"user_id": report.user_id, "name": names.get(report.user_id)},
        "assigned_leader_id": report.assigned_leader_id, "assigned_leader_name": names.get(report.assigned_leader_id),
        "assessment": {
            "incident": case_state.incident_of(report), "incident_basis": report.incident_basis,
            "evidence_sufficiency": case_state.sufficiency_of(report), "evidence_reviewed": report.evidence_reviewed or [],
            "urgency": case_state.urgency_of(report), "urgency_note": report.urgency_note, "notes": report.assessment_notes,
            "saved_at": report.assessed_at, "saved_by": report.assessed_by, "saved_by_name": names.get(report.assessed_by)},
        "identity": {"status": case_state.identity_of(report), "note": report.identity_note, "pet_id": report.pet_id},
        "ownership": {"status": case_state.ownership_of(report), "owner_user_id": report.ownership_owner_id,
                      "owner_name": names.get(report.ownership_owner_id), "evidence": report.ownership_evidence or [],
                      "note": report.ownership_note, "decided_at": report.ownership_decided_at},
        "closure": case_state.closure_of(report), "reopened_count": report.reopened_count or 0,
        "last_reopen_reason": report.last_reopen_reason,
        "referrals": [referral_view(r, names) for r in referrals],
        "followups": [followup_view(f, names) for f in followups],
        "contacts": [contact_view(c, names) for c in contacts],
        "warnings": [warning_view(w, observations.get(w.warning_id), names) for w in warnings],
        "claims": [case_claims.claim_view(db, c, True) for c in claims],
        "links": [{"link_id": l.link_id, "report_id": l.related_report_id if l.report_id == rid else l.report_id,
                   "link_type": l.link_type, "note": l.note, "linked_at": l.linked_at} for l in links],
        "open_items": L.open_items(db, report),
        "allowed_moves": sorted(V.MANUAL_MOVES[status]),
        "can_reopen": status == V.CLOSED and not report.duplicate_of_report_id and report.current_status_id != V.MERGED_LEGACY_ID,
        "warning_eligibility": warning_eligibility(db, report),
    }
