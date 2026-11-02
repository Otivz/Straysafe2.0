"""
Pet claiming fee assessments (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md). Rules: app/utils/claim_fees.py.

Workflow: owner files a claim -> Barangay staff verify ownership (claim Approved) -> staff create the dog or cat
assessment -> owner settles -> staff record the payment and official receipt (or a reasoned waiver) -> staff complete
the handover (claims route; refused while charges are unsettled). Payment never completes the handover by itself.
"""
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.claim_assessment import ClaimAssessment, ClaimAssessmentChange, ClaimFeeSchedule
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.user import User
from app.utils import claim_fees as fees
from app.utils.audit import log_activity
from app.utils.auth import get_current_user

router = APIRouter(prefix="/claim-assessments", tags=["claim-assessments"])

ACTIVE = ("Assessed", "Paid", "Waived")
MIN_REASON = 10


# ── Access ─────────────────────────────────────────────────────────────────

def _is_assessor(user: User) -> bool:
    """Barangay staff and Admins assess and collect. Subdivision Leaders only monitor; residents only view their own."""
    return user.role_id in (3, 4)


def _is_schedule_authority(user: User) -> bool:
    return user.role_id == 4 or (user.role_id == 3 and bool(getattr(user, "is_head_officer", False)))


def _load_claim(db: Session, claim_id: int, user: User) -> PetClaim:
    from app.routes.claims import claim_visible_to
    from app.utils.case_groups import live_claim
    claim = (db.query(PetClaim).options(joinedload(PetClaim.pet).joinedload(Pet.owner), joinedload(PetClaim.report))
             .filter(PetClaim.claim_id == claim_id).first())
    if claim is None or not claim_visible_to(db, user, claim):
        raise HTTPException(status_code=404, detail="Claim not found")
    return live_claim(db, claim)


def _require_assessor(user: User) -> None:
    if not _is_assessor(user):
        raise HTTPException(status_code=403, detail="Only authorized Barangay staff can create or change claiming assessments.")


def _barangay_of(db: Session, claim: PetClaim, user: User) -> Optional[int]:
    if user.barangay_id:
        return user.barangay_id
    from app.models.user import Subdivision
    sub = db.get(Subdivision, claim.report.subdivision_id) if claim.report else None
    return sub.barangay_id if sub else None


def _active_assessment(db: Session, claim_id: int) -> Optional[ClaimAssessment]:
    return (db.query(ClaimAssessment).filter(ClaimAssessment.claim_id == claim_id, ClaimAssessment.status.in_(ACTIVE))
            .order_by(ClaimAssessment.assessment_id.desc()).first())


def unsettled_assessment(db: Session, claim_id: int) -> Optional[ClaimAssessment]:
    """An assessment with charges that are neither paid nor waived (it blocks the handover)."""
    a = _active_assessment(db, claim_id)
    return a if (a is not None and a.status == "Assessed" and fees.money(a.total_due) > 0) else None


# ── Views ──────────────────────────────────────────────────────────────────

def _m(v) -> Optional[float]:
    return float(v) if v is not None else None


def _view(db: Session, a: ClaimAssessment, claim: PetClaim) -> Dict[str, Any]:
    changes = (db.query(ClaimAssessmentChange).options(joinedload(ClaimAssessmentChange.user))
               .filter(ClaimAssessmentChange.assessment_id == a.assessment_id)
               .order_by(ClaimAssessmentChange.change_id).all())
    pet = claim.pet
    owner = pet.owner if pet else None
    return {
        "assessment_id": a.assessment_id,
        "claim_id": a.claim_id,
        "claim_reference": f"CLM-{a.claim_id:05d}",
        "animal_id": f"P-{pet.pet_id:05d}" if pet else (f"H-{a.holding_id:05d}" if a.holding_id else None),
        "animal_name": pet.pet_name if pet else None,
        "species": a.species,
        "owner_name": owner.name if owner else None,
        "fine_category": a.fine_category,
        "fine_label": fees.CATEGORY_LABELS.get(a.fine_category, a.fine_category),
        "fine_amount": _m(a.fine_amount),
        "fine_configured": a.fine_amount is not None,
        "fine_note": (None if a.fine_amount is not None
                      else fees.NO_CHARGE_LABEL if a.no_charge_applicable else fees.NO_FINE_LABEL),
        "charge_entry": "manual" if a.species == "Cat" else "legal_range",
        "charge_description": a.charge_description,
        "no_charge_applicable": bool(a.no_charge_applicable),
        "fine_legal_basis": a.fine_legal_basis,
        "impounding_fee": _m(a.impounding_fee),
        "impounding_fee_basis": a.impounding_fee_basis,
        "boarding_days": a.boarding_days,
        "boarding_fee": _m(a.boarding_fee),
        "boarding_fee_basis": a.boarding_fee_basis,
        "total_due": _m(a.total_due),
        "status": a.status,
        "notes": a.notes,
        "assessed_by_name": a.assessor.name if a.assessor else None,
        "assessed_at": a.assessed_at.isoformat() if a.assessed_at else None,
        "amount_paid": _m(a.amount_paid),
        "receipt_number": a.receipt_number,
        "payment_recorded_by_name": a.payment_recorder.name if a.payment_recorder else None,
        "paid_at": a.paid_at.isoformat() if a.paid_at else None,
        "waiver_reason": a.waiver_reason,
        "waived_by_name": a.waiver.name if a.waiver else None,
        "waived_at": a.waived_at.isoformat() if a.waived_at else None,
        "changes": [{
            "action": c.action, "field": c.field, "previous_value": c.previous_value, "new_value": c.new_value,
            "reason": c.reason, "changed_by_name": c.user.name if c.user else None,
            "changed_at": c.changed_at.isoformat() if c.changed_at else None,
        } for c in changes],
    }


def _schedule_out(s: ClaimFeeSchedule) -> Dict[str, Any]:
    return {"schedule_id": s.schedule_id, "fee_type": s.fee_type, "label": fees.FEE_LABELS.get(s.fee_type, s.fee_type),
            "species": s.species, "min_amount": float(s.min_amount), "max_amount": float(s.max_amount),
            "legal_basis": s.legal_basis, "barangay_id": s.barangay_id, "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None}


# ── Fee schedules ───────────────────────────────────────────────────────────

@router.get("/schedules")
def list_schedules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The dog fine (RA 9482, fixed) and the charges configured for the user's barangay."""
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=403, detail="Access denied")
    q = db.query(ClaimFeeSchedule).filter(ClaimFeeSchedule.is_active.is_(True))
    if current_user.role_id != 4:
        q = q.filter((ClaimFeeSchedule.barangay_id.is_(None)) | (ClaimFeeSchedule.barangay_id == current_user.barangay_id))
    return {
        "dog_fine": {"category": fees.DOG_FINE, "label": fees.CATEGORY_LABELS[fees.DOG_FINE], "min": float(fees.DOG_FINE_MIN),
                     "max": float(fees.DOG_FINE_MAX), "legal_basis": fees.DOG_FINE_BASIS, "editable": False},
        "schedules": [_schedule_out(s) for s in q.order_by(ClaimFeeSchedule.fee_type, ClaimFeeSchedule.schedule_id.desc()).all()],
        "can_configure": _is_schedule_authority(current_user),
    }


class ScheduleIn(BaseModel):
    fee_type: str = Field(..., pattern="^(CAT_CLAIMING_FINE|IMPOUNDING_FEE|BOARDING_FEE_PER_DAY)$")
    species: Optional[str] = Field(None, pattern="^(Dog|Cat)$")
    min_amount: Decimal = Field(..., ge=0)
    max_amount: Decimal = Field(..., ge=0)
    legal_basis: str = Field(..., min_length=5, max_length=2000)
    barangay_id: Optional[int] = None  # Admin only; staff configure their own barangay


@router.post("/schedules")
def create_schedule(payload: ScheduleIn, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Configure an authorized charge with its legal basis. Replaces the active one of the same kind."""
    if not _is_schedule_authority(current_user):
        raise HTTPException(status_code=403, detail="Only the Barangay Head Officer or an Admin can configure claiming fees.")
    if payload.fee_type == fees.CAT_FINE:
        raise HTTPException(status_code=400, detail=(
            "Cat claiming charges are entered by Barangay staff on each assessment (amount, description and basis); "
            "there is no configured cat fine."))
    if payload.min_amount > payload.max_amount:
        raise HTTPException(status_code=400, detail="The minimum can't be higher than the maximum.")
    species = "Cat" if payload.fee_type == fees.CAT_FINE else payload.species
    barangay_id = payload.barangay_id if current_user.role_id == 4 else current_user.barangay_id
    old = (db.query(ClaimFeeSchedule).filter(ClaimFeeSchedule.fee_type == payload.fee_type, ClaimFeeSchedule.is_active.is_(True),
                                             ClaimFeeSchedule.barangay_id == barangay_id if barangay_id is not None else ClaimFeeSchedule.barangay_id.is_(None),
                                             ClaimFeeSchedule.species == species if species else ClaimFeeSchedule.species.is_(None)).all())
    for o in old:
        o.is_active = False
        o.deactivated_by = current_user.user_id
        o.deactivated_at = datetime.now()
    row = ClaimFeeSchedule(fee_type=payload.fee_type, species=species, min_amount=fees.money(payload.min_amount),
                           max_amount=fees.money(payload.max_amount), legal_basis=payload.legal_basis.strip(),
                           barangay_id=barangay_id, created_by=current_user.user_id)
    db.add(row)
    db.flush()
    log_activity(db=db, action="CONFIGURE_CLAIM_FEE", target_table="claim_fee_schedules", target_id=row.schedule_id,
                 description=(f"{current_user.name} configured {fees.FEE_LABELS[payload.fee_type]} "
                              f"PHP {row.min_amount}–{row.max_amount} ({row.legal_basis})."),
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"replaced": [o.schedule_id for o in old]},
                 new_values={"min": str(row.min_amount), "max": str(row.max_amount), "legal_basis": row.legal_basis},
                 request=req, commit=False)
    db.commit()
    return _schedule_out(row)


class ReasonIn(BaseModel):
    reason: str = Field(..., min_length=MIN_REASON, max_length=2000)


@router.post("/schedules/{schedule_id}/deactivate")
def deactivate_schedule(schedule_id: int, payload: ReasonIn, req: Request, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    if not _is_schedule_authority(current_user):
        raise HTTPException(status_code=403, detail="Only the Barangay Head Officer or an Admin can configure claiming fees.")
    row = db.get(ClaimFeeSchedule, schedule_id)
    if row is None or (current_user.role_id != 4 and row.barangay_id != current_user.barangay_id):
        raise HTTPException(status_code=404, detail="Fee schedule not found")
    row.is_active = False
    row.deactivated_by = current_user.user_id
    row.deactivated_at = datetime.now()
    log_activity(db=db, action="DEACTIVATE_CLAIM_FEE", target_table="claim_fee_schedules", target_id=row.schedule_id,
                 description=f"{current_user.name} switched off {fees.FEE_LABELS.get(row.fee_type, row.fee_type)}: {payload.reason.strip()}",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    db.commit()
    return _schedule_out(row)


# ── Assessments ─────────────────────────────────────────────────────────────

@router.get("/claims/{claim_id}/quote")
def quote_claim(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The species and what may be charged for it, before the amounts are chosen."""
    _require_assessor(current_user)
    claim = _load_claim(db, claim_id, current_user)
    return fees.quote(db, claim, _barangay_of(db, claim, current_user))


@router.get("/claims/{claim_id}")
def get_claim_assessment(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The claim's current assessment (or null). Residents see their own; Subdivision Leaders monitor; staff manage."""
    claim = _load_claim(db, claim_id, current_user)
    a = _active_assessment(db, claim.claim_id)
    return {"claim_id": claim.claim_id, "can_manage": _is_assessor(current_user),
            "assessment": _view(db, a, claim) if a else None}


MAX_AMOUNT = Decimal("1000000")
MIN_CHARGE_DESCRIPTION, MIN_CHARGE_BASIS = 3, 5


class AssessmentIn(BaseModel):
    # Pesos with at most 2 decimals; letters, negatives, NaN and infinity are refused by validation (422)
    fine_amount: Optional[Decimal] = Field(None, ge=0, le=MAX_AMOUNT, decimal_places=2)
    # Cats only: the claiming charge entered by hand (what it is for and its reason / basis), or "no charge applies"
    charge_description: Optional[str] = Field(None, max_length=200)
    charge_basis: Optional[str] = Field(None, max_length=2000)
    no_charge: Optional[bool] = None
    impounding_fee: Optional[Decimal] = Field(None, ge=0)
    boarding_rate: Optional[Decimal] = Field(None, ge=0)
    boarding_days: Optional[int] = Field(None, ge=0, le=365)
    notes: Optional[str] = Field(None, max_length=2000)


def _priced(db: Session, claim: PetClaim, user: User, body: AssessmentIn, current: Optional[ClaimAssessment] = None) -> Dict[str, Any]:
    """Validate the amounts (dogs: RA 9482 range; cats: as entered by staff; fees: configured schedules); itemize them."""
    q = fees.quote(db, claim, _barangay_of(db, claim, user))
    species = q["species"]
    if species is None:
        raise HTTPException(status_code=409, detail="Record whether the animal is a dog or a cat before assessing the claim.")
    if current is not None and current.species != species:
        raise HTTPException(status_code=409, detail="The animal's species changed since this assessment; cancel it and assess again.")
    fine_q = q["fine"]
    fine = body.fine_amount if body.fine_amount is not None else (current.fine_amount if current else None)
    description, basis, no_charge = None, fine_q.get("legal_basis"), False
    cat_fields_sent = body.charge_description is not None or body.charge_basis is not None or body.no_charge is not None
    if species == "Cat":
        # Cats: the charge staff entered by hand (or "no charge applicable"); never the dog fine or a default
        description, basis, no_charge, fine = _cat_charge(body, current)
    else:
        # Dogs: the RA 9482 range, unchanged; the cat-only fields don't apply
        if cat_fields_sent:
            raise HTTPException(status_code=400, detail=(
                "Charge description, basis and 'no charge applicable' are for cat claiming charges only. "
                "The dog fine follows RA 9482."))
        if fine is None:
            raise HTTPException(status_code=400, detail=f"Choose the {fine_q['label']} amount (PHP {fine_q['min']:,.0f} to {fine_q['max']:,.0f}).")
        fine = fees.money(fine)
        if not fees.in_range(fine, fine_q["min"], fine_q["max"]):
            raise HTTPException(status_code=400, detail=(
                f"The {fine_q['label']} must be between PHP {fine_q['min']:,.2f} and PHP {fine_q['max']:,.2f}."))

    imp_q = q["impounding_fee"]
    imp = body.impounding_fee if body.impounding_fee is not None else (current.impounding_fee if current else None)
    if imp_q["configured"]:
        imp = fees.money(imp if imp is not None else imp_q["min"])
        if not fees.in_range(imp, imp_q["min"], imp_q["max"]):
            raise HTTPException(status_code=400, detail=f"The impounding fee must be between PHP {imp_q['min']:,.2f} and PHP {imp_q['max']:,.2f}.")
    else:
        if body.impounding_fee not in (None, 0):
            raise HTTPException(status_code=400, detail="No impounding fee is authorized: it can't be charged.")
        imp = fees.money(0)

    b_q = q["boarding_fee"]
    days = body.boarding_days if body.boarding_days is not None else (current.boarding_days if current else b_q["days"])
    if b_q["configured"]:
        rate = body.boarding_rate
        if rate is None:
            rate = (fees.money(current.boarding_fee) / current.boarding_days) if (current and current.boarding_days) else b_q["min"]
        rate = fees.money(rate)
        if not fees.in_range(rate, b_q["min"], b_q["max"]):
            raise HTTPException(status_code=400, detail=f"The boarding fee per day must be between PHP {b_q['min']:,.2f} and PHP {b_q['max']:,.2f}.")
        boarding = fees.money(rate * days)
    else:
        if body.boarding_rate not in (None, 0):
            raise HTTPException(status_code=400, detail="No boarding fee is authorized: it can't be charged.")
        boarding, days = fees.money(0), 0
    return {
        "species": species, "holding_id": q["holding_id"], "fine_category": fine_q["category"], "fine_amount": fine,
        "fine_legal_basis": basis, "charge_description": description, "no_charge_applicable": no_charge,
        "impounding_fee": imp, "impounding_fee_basis": imp_q.get("legal_basis"),
        "boarding_days": days, "boarding_fee": boarding, "boarding_fee_basis": b_q.get("legal_basis"),
        "total_due": fees.money((fine or 0) + imp + boarding),
    }


def _cat_charge(body: AssessmentIn, current: Optional[ClaimAssessment]) -> tuple:
    """
    The cat claiming charge, exactly as staff entered it: (description, reason / basis, no charge?, amount).
    Nothing is defaulted or computed. Adjustments keep the values that weren't sent.
    """
    pick = lambda new, old: new if new is not None else old  # noqa: E731
    no_charge = bool(pick(body.no_charge, current.no_charge_applicable if current else False))
    description = (pick(body.charge_description, current.charge_description if current else None) or "").strip()
    basis = (pick(body.charge_basis, current.fine_legal_basis if current else None) or "").strip()
    if body.no_charge is True and body.fine_amount is None:
        amount = None
    else:
        amount = pick(body.fine_amount, current.fine_amount if current else None)
    if len(basis) < MIN_CHARGE_BASIS:
        raise HTTPException(status_code=400, detail=(
            "Enter the reason / basis for the cat claiming charge" + (" (why no charge applies)." if no_charge else ".")))
    if no_charge:
        if amount not in (None, 0):
            raise HTTPException(status_code=400, detail="Clear the amount to record that no charge applies.")
        return fees.NO_CHARGE_LABEL, basis, True, None
    if amount is None:
        raise HTTPException(status_code=400, detail=(
            "Enter the cat claiming charge amount in pesos, or record that no charge applies."))
    if len(description) < MIN_CHARGE_DESCRIPTION:
        raise HTTPException(status_code=400, detail="Enter the charge description (what the cat claiming charge is for).")
    return description, basis, False, fees.money(amount)


TEXT_FIELDS = ("charge_description", "fine_legal_basis")


def _differs(field: str, old: Any, new: Any) -> bool:
    if field == "boarding_days":
        return (old or 0) != (new or 0)
    if field in TEXT_FIELDS:
        return (old or "").strip() != (new or "").strip()
    if field == "no_charge_applicable":
        return bool(old) != bool(new)
    norm = lambda v: None if v is None else fees.money(v)  # noqa: E731
    return norm(old) != norm(new)


def _change(db: Session, a: ClaimAssessment, user: User, action: str, field: Optional[str] = None,
            prev: Any = None, new: Any = None, reason: Optional[str] = None) -> None:
    db.add(ClaimAssessmentChange(assessment_id=a.assessment_id, action=action, field=field,
                                 previous_value=None if prev is None else str(prev), new_value=None if new is None else str(new),
                                 reason=reason, changed_by=user.user_id))


def _notify_owner(claim: PetClaim, db: Session, title: str, message: str) -> None:
    if claim.pet and claim.pet.owner_id:
        db.add(Notification(user_id=claim.pet.owner_id, type="claim", related_id=claim.report_id, title=title, message=message))


def _commit(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Not saved: database error ({type(e).__name__}).")


@router.post("/claims/{claim_id}")
def create_assessment(claim_id: int, payload: AssessmentIn, req: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Create the itemized assessment once ownership is verified (claim Approved)."""
    _require_assessor(current_user)
    claim = _load_claim(db, claim_id, current_user)
    if claim.status != "Approved":
        raise HTTPException(status_code=409, detail="Verify ownership first: the claim must be Approved before it is assessed.")
    if _active_assessment(db, claim.claim_id):
        raise HTTPException(status_code=409, detail="This claim already has an assessment. Adjust it (with a reason) instead.")
    p = _priced(db, claim, current_user, payload)
    a = ClaimAssessment(claim_id=claim.claim_id, report_id=claim.report_id, pet_id=claim.pet_id, holding_id=p["holding_id"],
                        species=p["species"], fine_category=p["fine_category"], fine_amount=p["fine_amount"],
                        fine_legal_basis=p["fine_legal_basis"], charge_description=p["charge_description"],
                        no_charge_applicable=p["no_charge_applicable"], impounding_fee=p["impounding_fee"],
                        impounding_fee_basis=p["impounding_fee_basis"], boarding_days=p["boarding_days"],
                        boarding_fee=p["boarding_fee"], boarding_fee_basis=p["boarding_fee_basis"], total_due=p["total_due"],
                        status="Assessed", notes=(payload.notes or "").strip() or None, assessed_by=current_user.user_id)
    db.add(a)
    db.flush()
    _change(db, a, current_user, "created", "total_due", None, a.total_due)
    fine_text = (f"PHP {a.fine_amount:,.2f}" if a.fine_amount is not None
                 else fees.NO_CHARGE_LABEL if a.no_charge_applicable else fees.NO_FINE_LABEL)
    if a.species == "Cat":
        fine_text += f" ({a.charge_description}; basis: {a.fine_legal_basis})"
    log_activity(db=db, action="CREATE_CLAIM_ASSESSMENT", target_table="claim_assessments", target_id=a.assessment_id,
                 description=(f"{current_user.name} assessed claim #{claim.claim_id} ({a.species}): "
                              f"{fees.CATEGORY_LABELS[a.fine_category]} {fine_text}, impounding PHP {a.impounding_fee}, "
                              f"boarding PHP {a.boarding_fee} ({a.boarding_days} days), total PHP {a.total_due}."),
                 user_id=current_user.user_id, log_type="operation",
                 new_values={"total_due": str(a.total_due), "fine_amount": str(a.fine_amount), "species": a.species,
                             "charge_description": a.charge_description, "basis": a.fine_legal_basis,
                             "no_charge_applicable": a.no_charge_applicable},
                 request=req, commit=False)
    _notify_owner(claim, db, "Claiming Charges Assessed",
                  f"The Barangay assessed your claim #{claim.claim_id}: total due PHP {a.total_due:,.2f}. "
                  f"Settle it at the Barangay office; the animal is handed over after payment is recorded.")
    _commit(db)
    return _view(db, a, claim)


class AdjustIn(AssessmentIn):
    reason: str = Field(..., min_length=MIN_REASON, max_length=2000)


def _load_assessment(db: Session, assessment_id: int, user: User) -> tuple:
    a = db.get(ClaimAssessment, assessment_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    claim = _load_claim(db, a.claim_id, user)
    return a, claim


@router.patch("/{assessment_id}")
def adjust_assessment(assessment_id: int, payload: AdjustIn, req: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Change the amounts of an unpaid assessment. A reason is required; every changed value is recorded."""
    _require_assessor(current_user)
    a, claim = _load_assessment(db, assessment_id, current_user)
    if a.status != "Assessed":
        raise HTTPException(status_code=409, detail=f"Only an unpaid assessment can be adjusted (this one is {a.status}).")
    p = _priced(db, claim, current_user, payload, current=a)
    reason = payload.reason.strip()
    changed = {}
    for field in ("fine_amount", "charge_description", "fine_legal_basis", "no_charge_applicable",
                  "impounding_fee", "boarding_days", "boarding_fee", "total_due"):
        old, new = getattr(a, field), p[field]
        if _differs(field, old, new):
            _change(db, a, current_user, "adjusted", field, old, new, reason)
            changed[field] = {"previous": str(old), "new": str(new)}
            setattr(a, field, new)
    if not changed:
        raise HTTPException(status_code=400, detail="Nothing changed.")
    log_activity(db=db, action="ADJUST_CLAIM_ASSESSMENT", target_table="claim_assessments", target_id=a.assessment_id,
                 description=f"{current_user.name} adjusted assessment #{a.assessment_id} (claim #{a.claim_id}): {reason}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={k: v["previous"] for k, v in changed.items()}, new_values={k: v["new"] for k, v in changed.items()},
                 request=req, commit=False)
    _notify_owner(claim, db, "Claiming Charges Updated", f"Your claim #{claim.claim_id} charges were updated: total due PHP {a.total_due:,.2f}.")
    _commit(db)
    return _view(db, a, claim)


@router.post("/{assessment_id}/waive")
def waive_assessment(assessment_id: int, payload: ReasonIn, req: Request, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Waive the unpaid charges, with the authorized reason (e.g. a waiver approved under the ordinance)."""
    _require_assessor(current_user)
    a, claim = _load_assessment(db, assessment_id, current_user)
    if a.status != "Assessed":
        raise HTTPException(status_code=409, detail=f"Only an unpaid assessment can be waived (this one is {a.status}).")
    reason = payload.reason.strip()
    _change(db, a, current_user, "waived", "status", a.status, "Waived", reason)
    a.status, a.waiver_reason, a.waived_by, a.waived_at = "Waived", reason, current_user.user_id, datetime.now()
    log_activity(db=db, action="WAIVE_CLAIM_ASSESSMENT", target_table="claim_assessments", target_id=a.assessment_id,
                 description=f"{current_user.name} waived PHP {a.total_due} on claim #{a.claim_id}: {reason}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"status": "Assessed", "total_due": str(a.total_due)}, new_values={"status": "Waived"},
                 request=req, commit=False)
    _notify_owner(claim, db, "Claiming Charges Waived", f"The charges on your claim #{claim.claim_id} were waived.")
    _commit(db)
    return _view(db, a, claim)


class PaymentIn(BaseModel):
    receipt_number: str = Field(..., min_length=3, max_length=60)
    amount_paid: Decimal = Field(..., ge=0)


@router.post("/{assessment_id}/payment")
def record_payment(assessment_id: int, payload: PaymentIn, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Record the payment and official receipt. It does not complete the handover."""
    _require_assessor(current_user)
    a, claim = _load_assessment(db, assessment_id, current_user)
    if a.status != "Assessed":
        raise HTTPException(status_code=409, detail=f"This assessment is already {a.status}.")
    paid = fees.money(payload.amount_paid)
    if paid != fees.money(a.total_due):
        raise HTTPException(status_code=400, detail=(
            f"The amount paid must equal the total due (PHP {a.total_due:,.2f}). Adjust the assessment first if the charges changed."))
    receipt = payload.receipt_number.strip()
    _change(db, a, current_user, "payment_recorded", "status", a.status, "Paid", f"OR/reference {receipt}")
    a.status, a.amount_paid, a.receipt_number = "Paid", paid, receipt
    a.payment_recorded_by, a.paid_at = current_user.user_id, datetime.now()
    log_activity(db=db, action="RECORD_CLAIM_PAYMENT", target_table="claim_assessments", target_id=a.assessment_id,
                 description=f"{current_user.name} recorded PHP {paid} for claim #{a.claim_id} (OR/reference {receipt}).",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"status": "Assessed"}, new_values={"status": "Paid", "receipt_number": receipt, "amount_paid": str(paid)},
                 request=req, commit=False)
    _notify_owner(claim, db, "Claiming Payment Recorded",
                  f"Your payment of PHP {paid:,.2f} for claim #{claim.claim_id} was recorded (OR/reference {receipt}). "
                  f"The Barangay will complete the handover of your pet.")
    _commit(db)
    return _view(db, a, claim)


@router.post("/{assessment_id}/cancel")
def cancel_assessment(assessment_id: int, payload: ReasonIn, req: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Cancel an unpaid assessment (e.g. made in error). Kept on record; a new one may then be created."""
    _require_assessor(current_user)
    a, claim = _load_assessment(db, assessment_id, current_user)
    if a.status != "Assessed":
        raise HTTPException(status_code=409, detail=f"Only an unpaid assessment can be cancelled (this one is {a.status}).")
    reason = payload.reason.strip()
    _change(db, a, current_user, "cancelled", "status", a.status, "Cancelled", reason)
    a.status = "Cancelled"
    log_activity(db=db, action="CANCEL_CLAIM_ASSESSMENT", target_table="claim_assessments", target_id=a.assessment_id,
                 description=f"{current_user.name} cancelled assessment #{a.assessment_id} (claim #{a.claim_id}): {reason}",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return {"assessment_id": a.assessment_id, "status": a.status}
