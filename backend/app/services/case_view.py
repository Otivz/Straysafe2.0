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
from app.models.lost_pet_alert import LostPetAlert
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.services import case_claims, case_compliance, case_lifecycle as L, case_work
from app.utils import case_policy, case_state, identity_decision, lost_pet_rules
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


def _pet_in_scope(viewer: User, pet: Pet, report: Report) -> bool:
    """
    May this staff member read this pet record and its owner? The Administrator: yes. A Subdivision Leader: the owner lives in
    the Leader's subdivision, or (a record with no owner account) whoever registered it belongs to it or it is linked to a report
    of it. A pet from another subdivision that a report happens to name is never shown.
    """
    if viewer.role_id == 4:
        return True
    subdivision = viewer.subdivision_id
    if not subdivision:
        return False
    if pet.owner is not None:
        return pet.owner.subdivision_id == subdivision
    registrant = pet.registered_by
    return (registrant is not None and registrant.subdivision_id == subdivision) or report.subdivision_id == subdivision


def pet_block(db: Session, report: Report, viewer: User) -> Optional[Dict[str, Any]]:
    """
    The registered pet a report names, for the Leader: the registry record as it is now, the same record as it was when the report
    was filed (the snapshot), the registered owner and how to reach them, and the last-seen details. None when no pet is linked
    (an older report, or a split case). STAFF ONLY, scoped to the viewer's subdivision.

    Declared registration and verified ownership are different things: a registration is what the owner declared (`registration`),
    ownership is verified only by the Leader's own decision on the case (`ownership`, which needs evidence other than the registry).
    `linked_by_reporter` is true until a Leader decides the animal's identity: a report naming a pet is the resident's say-so.
    """
    if report.pet_id is None:
        return None
    pet = db.get(Pet, report.pet_id)
    snapshot = report.pet_snapshot if isinstance(report.pet_snapshot, dict) else None
    if pet is None:
        return {"pet_id": report.pet_id, "available": False, "reason": "removed",
                "as_reported": (snapshot or {}).get("pet"), "last_seen": {"as_filed": (snapshot or {}).get("last_seen"), "notice": None}}
    if not _pet_in_scope(viewer, pet, report):
        return {"pet_id": report.pet_id, "available": False, "reason": "restricted", "as_reported": None,
                "last_seen": {"as_filed": None, "notice": None}}
    current = lost_pet_rules.pet_facts(pet)
    owner = pet.owner
    then = snapshot.get("pet") if snapshot else None
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).first()
    contact = {"emergency_contact_name": pet.emergency_contact_name, "emergency_contact_phone": pet.emergency_contact_phone}
    return {
        "pet_id": pet.pet_id, "available": True,
        "linked_by_reporter": not identity_decision.is_decided(db, report),
        "reporter_is_owner": bool(owner is not None and owner.user_id == report.user_id),
        "registry": {**current, "status": pet.status, "updated_at": pet.updated_at},
        "registration": {"declared_by_owner": current["declared_by_owner"], "registered_at": current["registered_at"],
                         "registered_by_name": current["registered_by_name"], "verified": bool(pet.is_verified)},
        "owner": ({"user_id": owner.user_id, "name": owner.name, "phone": owner.phone, "email": owner.email,
                   "address": owner.address, "status": owner.status, **contact} if owner is not None
                  else (contact if any(contact.values()) else None)),
        "as_reported": then, "snapshot_taken_at": snapshot.get("taken_at") if snapshot else None,
        "changed_since_report": lost_pet_rules.changed_since(then, current),
        "last_seen": {"as_filed": snapshot.get("last_seen") if snapshot else None,
                      "notice": ({"at": alert.last_seen_at, "location": alert.last_seen_location,
                                  "latitude": float(alert.last_seen_lat) if alert.last_seen_lat is not None else None,
                                  "longitude": float(alert.last_seen_lng) if alert.last_seen_lng is not None else None,
                                  "status": alert.status} if alert is not None else None)},
    }


def lost_pet_block(db: Session, report: Report, viewer: User) -> Optional[Dict[str, Any]]:
    """
    The Lost Pet picture for the Leader's case screen, from the records (services/lost_pet_lifecycle.py): the notice with every
    sighting and possible-recovery lead (with who reviewed it and when), the conversations (who the owner and the neighbor are, how to
    reach them, whether the Leader was asked to help), and the recovery record. `alert` is None for a missing-pet report that has no
    notice (an older one). None for every other kind of case. Staff only: the finder's and the owner's contact details are here.
    """
    if not V.is_lost_pet_report(report):
        return None
    from app.services import lost_pet_lifecycle as LP
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).first()
    if alert is None:
        return {"alert": None}
    return {"alert": LP.alert_view(db, alert, viewer, with_sightings=True)}


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
        "identity": {"status": case_state.identity_of(report), "note": report.identity_note, "pet_id": report.pet_id,
                     "decided": identity_decision.is_decided(db, report)},
        "pet": pet_block(db, report, viewer),
        "lost_pet": lost_pet_block(db, report, viewer),
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
