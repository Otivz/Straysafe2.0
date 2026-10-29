"""
A pet claim is only for an animal someone holds (Phase 6 of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md).

The claim flow (claim, approve, handover, Pet Received) hands an animal back to its owner. A registered pet that was
only seen roaming, or is already home, has nobody holding it: the owner answers "It's home" or "Still missing"
instead, and an open claim on it is closed as not needed. The subdivision has no holding place, so in practice the
holder is the Barangay after an escalation and rescue.
"""
from sqlalchemy.orm import Session

# Report statuses while someone has (or is about to have) the animal: rescue in progress, picked up, held, impounded
HELD_REPORT_STATUS_IDS = (5, 6, 7, 8)
HELD_CUSTODY = ("In Barangay Facility", "Secured in Facility", "Impounded",
                "In Subdivision Holding (Awaiting Barangay Pickup)")
# Claim statuses already past the owner's filing: the claim flow goes on whatever the custody is now
CLAIM_DECIDED = ("Approved", "Handover Complete", "Pet Received", "Merged")
CLAIM_OPEN = ("Potential Owner Match", "Possible Match Found", "Pending Review", "Evidence Requested")
# Closable as not needed when nobody holds the animal: open, or approved but never handed over (approved by mistake)
CLAIM_CLOSABLE = CLAIM_OPEN + ("Approved",)
# Staff decisions that move a claim towards a handover: refused when nobody holds the animal (unless already approved)
CLAIM_FLOW_STEPS = ("Approved", "Evidence Requested", "Handover Complete", "Pending Review")
NOT_NEEDED_REASON = "Not needed: the pet is home"
# Report history markers for the owner's answer when nobody holds the animal
OWNER_SAYS_HOME = "Owner answer: the pet is home."
OWNER_SAYS_MISSING = "Owner answer: the pet is still missing."
NOT_HELD_MESSAGE = ("Nobody is holding this pet, so no claim is needed. "
                    "Tell the Subdivision Leader whether it is home or still missing.")


def animal_held(db: Session, report) -> bool:
    """Whether anyone holds the animal of this report's merged case (a holding record, a facility, or its status)."""
    from app.models.report import HoldingAnimal
    from app.utils.case_groups import case_members, case_root

    if report is None:
        return False
    from app.models.report import StatusHistory

    members = case_members(db, case_root(db, report))
    for m in members:
        if m.facility_id or m.current_status_id in HELD_REPORT_STATUS_IDS or (m.custody_status or "") in HELD_CUSTODY:
            return True
        # Claimed by Owner (9) is set when a claim is approved, before the handover: the animal is still held if it was
        # held just before the approval (e.g. Picked Up)
        if m.current_status_id == 9:
            earlier = db.query(StatusHistory.report_status_id).filter(
                StatusHistory.report_id == m.report_id, StatusHistory.report_status_id.isnot(None),
                StatusHistory.report_status_id != 9).order_by(StatusHistory.history_id.desc()).first()
            if earlier is not None and earlier.report_status_id in HELD_REPORT_STATUS_IDS:
                return True
    return db.query(HoldingAnimal.holding_id).filter(
        HoldingAnimal.report_id.in_([m.report_id for m in members]),
        HoldingAnimal.discharge_date.is_(None)).first() is not None


def is_closed_not_needed(claim) -> bool:
    return claim.status == "Rejected" and (claim.remarks or "") == NOT_NEEDED_REASON


def owner_custody_answer(db: Session, report):
    """The owner's latest answer for an animal nobody holds: 'home', 'missing', or None."""
    from app.models.report import StatusHistory
    from app.utils.case_groups import case_members, case_root

    ids = [m.report_id for m in case_members(db, case_root(db, report))]
    rows = db.query(StatusHistory.remarks).filter(
        StatusHistory.report_id.in_(ids),
        StatusHistory.remarks.in_([OWNER_SAYS_HOME, OWNER_SAYS_MISSING]),
    ).order_by(StatusHistory.history_id.desc()).first()
    if rows is None:
        return None
    return "home" if rows.remarks == OWNER_SAYS_HOME else "missing"
