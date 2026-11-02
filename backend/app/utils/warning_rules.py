"""
Owner warning rules (Phase 6, docs/01-system/OWNER_WARNING_RULES.md).

- Only the Subdivision Leader issues warnings, for a report in their own subdivision, to the registered pet's actual
  owner (an account). Owners without an account get a logged verbal warning instead (follow-up contact entry).
- One warning per incident, pet, violation and tier, never going back to a lower tier. A logged repeat incident is a
  separate incident, so it can receive its own warning.
- The suggested tier comes from the pet's (or owner's) existing warning history for that violation.
- Residents read only their own notices; staff read warnings for reports / owners in their area.
"""
from datetime import timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.owner_followup import FollowUpRepeatedIncident, OwnerFollowUp
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.utils.auth import verify_subdivision_scope

TIERS = ["Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation"]
RANK = {t: i for i, t in enumerate(TIERS)}
# Default instructions per violation, prefilled in the warning form (the leader can edit them)
INSTRUCTIONS = {
    "Free-Roaming Unleashed": "Keep your pet inside your property or on a leash when outside. Do not let it roam unattended.",
    "Nuisance / Aggressive Behavior": "Keep your pet secured and supervised. Prevent it from approaching or threatening residents.",
    "Overdue Vaccination": "Have your pet vaccinated and show the updated vaccination card to your Subdivision Leader.",
    "Repeated Impoundment Retrieval": "Keep your pet secured so it is not impounded again.",
    "Other": "Please address the reported concern about your pet.",
}
COMPLIANCE_DAYS = 3


def _same_pet(q, pet_id: Optional[int]):
    return q.filter(or_(OwnerWarning.pet_id == pet_id, OwnerWarning.pet_id.is_(None))) if pet_id else q


def incident_warnings(db: Session, report_id: int, violation_type: str, pet_id: Optional[int]) -> List[OwnerWarning]:
    q = db.query(OwnerWarning).filter(OwnerWarning.report_id == report_id, OwnerWarning.violation_type == violation_type)
    return _same_pet(q, pet_id).order_by(OwnerWarning.created_at).all()


def check_tier_for_incident(db: Session, report_id: int, violation_type: str, pet_id: Optional[int], tier: str) -> None:
    """One warning per incident, pet, violation and tier; a later warning on the same incident must be a higher tier."""
    existing = incident_warnings(db, report_id, violation_type, pet_id)
    if any(w.warning_level == tier for w in existing):
        raise HTTPException(status_code=400, detail=f"{tier} already exists for this pet and report.")
    highest = max((RANK.get(w.warning_level, 0) for w in existing), default=-1)
    if RANK[tier] < highest:
        raise HTTPException(status_code=400, detail=(
            f"A {TIERS[highest]} was already issued for this incident and violation. "
            f"A warning can't go back to a lower tier."))


def suggest_tier(db: Session, violation_type: str, pet_id: Optional[int], owner_id: Optional[int],
                 report_id: Optional[int] = None) -> Dict[str, Any]:
    """The next tier from existing history for this pet (or owner) and violation, and why."""
    q = db.query(OwnerWarning).filter(OwnerWarning.violation_type == violation_type)
    if pet_id:
        q = q.filter(OwnerWarning.pet_id == pet_id)
    elif owner_id:
        q = q.filter(OwnerWarning.user_id == owner_id)
    else:
        return {"suggested_tier": "1st Warning", "reason": "No warning history for this violation.", "history_count": 0}
    history = q.order_by(OwnerWarning.created_at).all()
    on_incident = [w for w in history if report_id and w.report_id == report_id]
    top = max((RANK.get(w.warning_level, 0) for w in history), default=-1)
    if report_id and on_incident:
        inc_top = max(RANK.get(w.warning_level, 0) for w in on_incident)
        nxt = min(inc_top + 1, len(TIERS) - 1)
        reason = f"This incident already has a {TIERS[inc_top]}."
    elif top < 0:
        nxt, reason = RANK["1st Warning"], "No earlier warning for this violation."
    else:
        nxt = min(max(top + 1, RANK["1st Warning"]), len(TIERS) - 1)
        reason = f"Earlier {TIERS[top]} for this violation ({len(history)} warning{'s' if len(history) != 1 else ''} on record)."
    return {"suggested_tier": TIERS[nxt], "reason": reason, "history_count": len(history)}


def require_can_issue(db: Session, actor: User, owner: User, report: Optional[Report], pet: Optional[Pet]) -> None:
    """Leader only, own subdivision, the registered pet's actual owner (a resident account)."""
    if actor.role_id != 2:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader can issue official warnings.")
    if report is None:
        raise HTTPException(status_code=400, detail="A warning must be issued for a report (the incident).")
    if not actor.subdivision_id or report.subdivision_id != actor.subdivision_id:
        raise HTTPException(status_code=403, detail="You can only issue warnings for reports in your own subdivision.")
    if report.assigned_leader_id and report.assigned_leader_id != actor.user_id:
        raise HTTPException(status_code=403, detail="Only the leader handling this report can issue its warnings.")
    if owner.role_id != 1:
        raise HTTPException(status_code=400, detail="Warnings are issued to the pet owner's resident account.")
    if pet is not None:
        if not pet.owner_id:
            raise HTTPException(status_code=400, detail=(
                f"{pet.pet_name} has no registered owner account. Log a verbal warning on the observation instead."))
        if pet.owner_id != owner.user_id:
            raise HTTPException(status_code=400, detail=f"The warning must go to {pet.pet_name}'s registered owner.")


def staff_can_read(db: Session, user: User, w: OwnerWarning) -> bool:
    """Staff read warnings for reports in their area (or, without a report, owners in their area). Admin: all."""
    if user.role_id == 4:
        return True
    if user.role_id not in (2, 3):
        return False
    if w.report_id:
        rep = db.get(Report, w.report_id)
        if rep is not None:
            return verify_subdivision_scope(user, rep.subdivision_id, db=db, raise_exception=False)
    owner = db.get(User, w.user_id)
    return bool(owner and verify_subdivision_scope(user, owner.subdivision_id, db=db, raise_exception=False))


def visible_warnings(db: Session, user: User, rows: List[OwnerWarning]) -> List[OwnerWarning]:
    if user.role_id == 1:
        return [w for w in rows if w.user_id == user.user_id]
    return [w for w in rows if staff_can_read(db, user, w)]


def followup_incidents(db: Session, followup: OwnerFollowUp) -> List[Dict[str, Any]]:
    """
    The observed incident and each logged repeat, each with its warnings and a prefill for the warning form
    (incident date, compliance date, default instructions and the suggested tier). Remarks stay editable.
    """
    entries = [(followup.report_id, "observed", None)]
    for inc in (db.query(FollowUpRepeatedIncident).filter(FollowUpRepeatedIncident.followup_id == followup.followup_id)
                .order_by(FollowUpRepeatedIncident.created_at).all()):
        entries.append((inc.report_id, "repeat", inc))
    out = []
    for report_id, kind, inc in entries:
        rep = db.get(Report, report_id)
        if rep is None:
            continue
        when = (inc.incident_date if inc and inc.incident_date else None) or rep.created_at
        warns = (db.query(OwnerWarning).filter(OwnerWarning.report_id == report_id)
                 .order_by(OwnerWarning.created_at).all())
        violation = warns[-1].violation_type if warns else "Free-Roaming Unleashed"
        out.append({
            "report_id": report_id,
            "kind": kind,
            "incident_id": inc.incident_id if inc else None,
            "incident_date": when.isoformat() if when else None,
            "landmark": rep.landmark,
            "notes": inc.notes if inc else None,
            "warnings": [{"warning_id": w.warning_id, "warning_level": w.warning_level, "violation_type": w.violation_type,
                          "status": w.status, "created_at": w.created_at.isoformat() if w.created_at else None}
                         for w in warns],
            "prefill": {
                "violation_type": violation,
                "incident_date": when.isoformat() if when else None,
                "comply_by": (when + timedelta(days=COMPLIANCE_DAYS)).date().isoformat() if when else None,
                "instructions": INSTRUCTIONS.get(violation, INSTRUCTIONS["Other"]),
                **suggest_tier(db, violation, followup.pet_id, followup.owner_id, report_id),
            },
        })
    return out
