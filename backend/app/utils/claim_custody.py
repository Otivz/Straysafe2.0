"""
Claim eligibility (Phase 7, docs/01-system/CLAIM_ELIGIBILITY_RULES.md).

A pet claim exists so the owner can get back an animal that someone is holding. Whether the animal is held is decided
once, here, across every report of the merged case:

- held: an open holding record (not discharged; not claimed, deceased, transferred out or adopted); a held custody
  value (Secured in Facility, In Barangay Facility, Impounded, Secured by Resident) or status Picked Up / Impounded;
  for an approved claim, the report status just before the approval (approval itself sets Claimed by Owner).
- never held: an adopted or handed-over-for-adoption animal, an animal already returned to its owner, a closed case.
  Facility custody or an Impounded status left on a case whose holding records are all discharged is stale and does
  not count.

New claims, evidence and claim-flow decisions need a held animal. An approved claim may still be completed (handover /
pet received), but never for an adopted animal.
"""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pet_claim import PetClaim
from app.models.report import Adoption, HoldingAnimal, Report, ReportReturn

# Report statuses
PICKED_UP, IMPOUNDED, CLAIMED_BY_OWNER = 6, 8, 9
CLOSED_STATUS_IDS = {3, 10, 11, 12, 14, 17, 18}
HELD_STATUS_IDS = {PICKED_UP, IMPOUNDED}
# Report custody values
FACILITY_CUSTODY = {"Secured in Facility", "In Barangay Facility", "Impounded"}
RESIDENT_CUSTODY = {"Secured by Resident"}
RETURNED_CUSTODY = {"Claimed by Owner", "Reunited with Owner"}
# holding_animals.facility_status that end the holding: 3 Claimed, 4 Deceased, 5 Transferred out, 7 Adopted
CLOSED_HOLDING = {3, 4, 5, 7}
ADOPTED_HOLDING = 7
# Claim states that continue an approval (completion is still allowed when the animal is no longer "held")
CONTINUATION = {"Approved"}
FINISHED = {"Handover Complete", "Pet Received", "Merged", "Not Needed", "Rejected"}


def _members(db: Session, report: Report) -> List[Report]:
    from app.utils.case_groups import case_members, case_root
    return case_members(db, case_root(db, report))


def case_custody(db: Session, report: Report, claim: Optional[PetClaim] = None) -> Dict[str, Any]:
    """{held, holder, adopted, returned, reason} for the case this report belongs to."""
    members = _members(db, report)
    ids = [m.report_id for m in members]
    holdings = db.query(HoldingAnimal).filter(HoldingAnimal.report_id.in_(ids)).all() if ids else []
    holding_ids = [h.holding_id for h in holdings]

    adopted = any(h.facility_status == ADOPTED_HOLDING for h in holdings) or any(
        (m.custody_status or "") == "Adopted" for m in members)
    if not adopted and holding_ids:
        adopted = db.query(Adoption.adoption_id).filter(
            Adoption.holding_id.in_(holding_ids), Adoption.status == "Approved", Adoption.is_handed_over.is_(True)
        ).first() is not None
    if adopted:
        return {"held": False, "holder": None, "adopted": True, "returned": False,
                "reason": "This animal was adopted. A pet claim can't be filed or completed for it."}

    returned = (db.query(ReportReturn.return_id).filter(ReportReturn.report_id.in_(ids)).first() is not None) or any(
        (m.custody_status or "") in RETURNED_CUSTODY for m in members)
    if returned:
        return {"held": False, "holder": None, "adopted": False, "returned": True,
                "reason": "This animal was already returned to its owner."}

    open_holding = [h for h in holdings if h.discharge_date is None and h.facility_status not in CLOSED_HOLDING]
    if open_holding:
        return {"held": True, "holder": "holding place", "adopted": False, "returned": False,
                "reason": "The animal is at a holding place."}
    all_discharged = bool(holdings)  # holding records exist and none is open: facility data on the case is stale

    approved_before = claim.status_before_approval if (claim is not None and claim.status == "Approved") else None
    for m in members:
        status = m.current_status_id or 0
        if status == CLAIMED_BY_OWNER and approved_before is not None and m.report_id == claim.report_id:
            status = approved_before  # approval set Claimed by Owner; until handover the animal is where it was
        custody = m.custody_status or ""
        if custody in RESIDENT_CUSTODY and status not in CLOSED_STATUS_IDS:
            return {"held": True, "holder": "resident", "adopted": False, "returned": False,
                    "reason": "A resident is keeping the animal safe."}
        if not all_discharged and status not in CLOSED_STATUS_IDS and (custody in FACILITY_CUSTODY or status in HELD_STATUS_IDS):
            holder = "rescue team" if status == PICKED_UP and custody not in FACILITY_CUSTODY else "holding place"
            return {"held": True, "holder": holder, "adopted": False, "returned": False,
                    "reason": f"The animal is with the {holder}."}

    reason = ("The animal was released from the holding place; nobody is holding it now."
              if all_discharged else "Nobody has picked up or is holding this animal, so there is nothing to claim yet.")
    return {"held": False, "holder": None, "adopted": False, "returned": False, "reason": reason}


def require_held(db: Session, report: Report, action: str, claim: Optional[PetClaim] = None) -> Dict[str, Any]:
    """Refuse a new claim, evidence or a claim-flow decision when nobody holds the animal (409)."""
    c = case_custody(db, report, claim)
    if not c["held"]:
        raise HTTPException(status_code=409, detail=f"{action} isn't possible: {c['reason']}")
    return c


def require_completion_allowed(db: Session, report: Report, claim: PetClaim, action: str = "Completing this claim") -> None:
    """Handover / pet received: an approved claim may finish; otherwise the animal must be held. Never after adoption."""
    c = case_custody(db, report, claim)
    if c["adopted"]:
        raise HTTPException(status_code=409, detail=c["reason"])
    if claim.status in CONTINUATION:
        return
    if not c["held"]:
        raise HTTPException(status_code=409, detail=f"{action} isn't possible: {c['reason']}")


def claim_not_needed(db: Session, claim: PetClaim) -> bool:
    """An open claim whose animal nobody holds (staff may close it as Not Needed)."""
    if claim.status in FINISHED or claim.report is None:
        return False
    return not case_custody(db, claim.report, claim)["held"]


def attach_custody(db: Session, claim: PetClaim) -> None:
    """Transient response fields: is the animal held, the explanation, and whether the claim is not needed."""
    if claim.report is None:
        claim.custody = None
        return
    c = case_custody(db, claim.report, claim)
    claim.custody = {
        "held": c["held"], "holder": c["holder"], "reason": c["reason"], "adopted": c["adopted"], "returned": c["returned"],
        "not_needed": claim.status not in FINISHED and not c["held"],
    }


LOST_PET_CATEGORY_ID = 6
LOST_PET_MARKER = "[LOST PET REPORT]"


def is_lost_pet_report(report: Optional[Report]) -> bool:
    """An actual lost-pet report (category Lost Pet, or filed through the lost-pet form). A report merely linked to a
    registered pet, e.g. a roaming owned-pet complaint, is not one."""
    if report is None:
        return False
    return report.category_id == LOST_PET_CATEGORY_ID or LOST_PET_MARKER in (report.description or "")
