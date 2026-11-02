"""
Pet claiming fees (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md).

- Dogs: the impounding fine of RA 9482 (Anti-Rabies Act of 2007), PHP 500 to PHP 1,000. Fixed here, not editable.
- Cats: a separate Cat Claiming Charge that authorized Barangay staff enter by hand for each assessment (amount,
  charge description, reason / basis), or record that no charge applies. Never the dog fine, never a default,
  configured or computed amount.
- Impounding and boarding fees: only when separately authorized by a configured schedule.
"""
import math
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.claim_assessment import ClaimFeeSchedule
from app.models.pet_claim import PetClaim
from app.models.report import HoldingAnimal, Report

DOG_FINE = "DOG_IMPOUNDING_FINE"
CAT_FINE = "CAT_CLAIMING_FINE"
IMPOUNDING_FEE = "IMPOUNDING_FEE"
BOARDING_FEE = "BOARDING_FEE_PER_DAY"
CONFIGURABLE = (CAT_FINE, IMPOUNDING_FEE, BOARDING_FEE)

DOG_FINE_MIN = Decimal("500.00")
DOG_FINE_MAX = Decimal("1000.00")
DOG_FINE_BASIS = ("Republic Act No. 9482 (Anti-Rabies Act of 2007), Section 11(6): an impounded dog is released to its "
                  "owner upon payment of a fine of not less than PHP 500 and not more than PHP 1,000.")
NO_FINE_LABEL = "No Authorized Fine Configured"
CATEGORY_LABELS = {DOG_FINE: "Dog Impounding Fine", CAT_FINE: "Cat Claiming Charge"}
NO_CHARGE_LABEL = "No charge applicable"
FEE_LABELS = {CAT_FINE: "Cat Claiming Fine", IMPOUNDING_FEE: "Impounding Fee", BOARDING_FEE: "Boarding Fee (per day)"}


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def detect_species(db: Session, claim: PetClaim, holding: Optional[HoldingAnimal]) -> Optional[str]:
    """Dog or Cat from the registered pet, then the holding record, then the report. None if it can't be told."""
    for value in (claim.pet.pet_type if claim.pet else None,
                  holding.animal_type if holding else None,
                  claim.report.animal_type if claim.report else None):
        if value in ("Dog", "Cat"):
            return value
    return None


def case_holding(db: Session, report: Optional[Report]) -> Optional[HoldingAnimal]:
    """The case's holding record (the animal at the Barangay facility), the most recent first."""
    if report is None:
        return None
    from app.utils.case_groups import case_members, case_root
    ids = [m.report_id for m in case_members(db, case_root(db, report))]
    return (db.query(HoldingAnimal).filter(HoldingAnimal.report_id.in_(ids))
            .order_by(HoldingAnimal.holding_id.desc()).first()) if ids else None


def active_schedule(db: Session, fee_type: str, species: Optional[str], barangay_id: Optional[int]) -> Optional[ClaimFeeSchedule]:
    """The active schedule for this charge: the barangay's own first, then a system-wide one."""
    q = db.query(ClaimFeeSchedule).filter(ClaimFeeSchedule.fee_type == fee_type, ClaimFeeSchedule.is_active.is_(True))
    if fee_type != CAT_FINE:
        q = q.filter((ClaimFeeSchedule.species.is_(None)) | (ClaimFeeSchedule.species == species))
    rows = q.order_by(ClaimFeeSchedule.schedule_id.desc()).all()
    for row in rows:
        if barangay_id is not None and row.barangay_id == barangay_id:
            return row
    return next((r for r in rows if r.barangay_id is None), None)


def boarding_days(holding: Optional[HoldingAnimal], now: Optional[datetime] = None) -> int:
    """Whole days the animal has been at the facility (a started day counts), 0 if it was never held."""
    if holding is None or holding.intake_date is None:
        return 0
    from app.utils.holding_stay import facility_stay_start
    start = (facility_stay_start(holding) or holding.intake_date).replace(tzinfo=None)
    end = (holding.discharge_date or now or datetime.now()).replace(tzinfo=None)
    return max(0, math.ceil((end - start).total_seconds() / 86400))


def _schedule_view(row: Optional[ClaimFeeSchedule]) -> Dict[str, Any]:
    if row is None:
        return {"configured": False, "min": None, "max": None, "legal_basis": None, "schedule_id": None}
    return {"configured": True, "min": float(row.min_amount), "max": float(row.max_amount),
            "legal_basis": row.legal_basis, "schedule_id": row.schedule_id}


def quote(db: Session, claim: PetClaim, barangay_id: Optional[int]) -> Dict[str, Any]:
    """What can be charged for this claim, before the staff member chooses the amounts."""
    holding = case_holding(db, claim.report)
    species = detect_species(db, claim, holding)
    if species == "Dog":
        fine = {"category": DOG_FINE, "label": CATEGORY_LABELS[DOG_FINE], "configured": True,
                "min": float(DOG_FINE_MIN), "max": float(DOG_FINE_MAX), "legal_basis": DOG_FINE_BASIS}
    elif species == "Cat":
        # Entered by staff for each assessment: no default, no range, no configured amount
        fine = {"category": CAT_FINE, "label": CATEGORY_LABELS[CAT_FINE], "entry": "manual", "configured": False,
                "min": None, "max": None, "legal_basis": None}
    else:
        fine = None
    return {
        "claim_id": claim.claim_id,
        "species": species,
        "holding_id": holding.holding_id if holding else None,
        "fine": fine,
        "impounding_fee": _schedule_view(active_schedule(db, IMPOUNDING_FEE, species, barangay_id)) if species else None,
        "boarding_fee": {**_schedule_view(active_schedule(db, BOARDING_FEE, species, barangay_id)),
                         "days": boarding_days(holding)} if species else None,
    }


def in_range(value: Decimal, lo: Any, hi: Any) -> bool:
    return money(lo) <= value <= money(hi)


def require_case_charges_settled(db: Session, report: Optional[Report]) -> None:
    """
    Refuse an owner handover while any claim on the case (merged reports included) has claiming charges that are
    neither paid nor waived. Every owner-return path calls this, not only the claim status endpoint.
    """
    if report is None:
        return
    from fastapi import HTTPException
    from app.models.claim_assessment import ClaimAssessment
    from app.utils.case_groups import case_members, case_root
    ids = [m.report_id for m in case_members(db, case_root(db, report))] or [report.report_id]
    owed = (db.query(ClaimAssessment).filter(ClaimAssessment.report_id.in_(ids), ClaimAssessment.status == "Assessed",
                                             ClaimAssessment.total_due > 0)
            .order_by(ClaimAssessment.assessment_id.desc()).first())
    if owed is not None:
        raise HTTPException(status_code=409, detail=(
            f"The claiming charges (PHP {money(owed.total_due):,.2f}) aren't settled yet. Record the payment and official "
            "receipt, or an authorized waiver, before the handover."))
