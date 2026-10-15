"""Residents accept or reject pet ownership that staff recorded for them, and claim a pet their subdivision
registered for them before they had an account (the leader approves)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.pet import Pet
from app.models.pet_owner_confirmation import PetOwnerConfirmation
from app.models.user import User
from app.utils.auth import get_current_staff_or_admin, get_current_user
from app.utils.pet_ownership import respond, serialize

router = APIRouter(prefix="/pet-ownership", tags=["pet-ownership"])

# A resident says a pet their subdivision registered for them (before they had an account) is theirs
CLAIM_SOURCE = "resident_claim"


class RejectBody(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


def _load(db: Session, confirmation_id: int) -> PetOwnerConfirmation:
    conf = (
        db.query(PetOwnerConfirmation)
        .options(joinedload(PetOwnerConfirmation.pet), joinedload(PetOwnerConfirmation.proposed_owner),
                 joinedload(PetOwnerConfirmation.proposer))
        .filter(PetOwnerConfirmation.confirmation_id == confirmation_id)
        .first()
    )
    if not conf:
        raise HTTPException(status_code=404, detail="Confirmation request not found")
    return conf


@router.get("/mine")
def my_pending_confirmations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(PetOwnerConfirmation)
        .options(joinedload(PetOwnerConfirmation.pet), joinedload(PetOwnerConfirmation.proposer))
        .filter(PetOwnerConfirmation.proposed_owner_id == current_user.user_id, PetOwnerConfirmation.status == "Pending",
                PetOwnerConfirmation.source != CLAIM_SOURCE)
        .order_by(PetOwnerConfirmation.created_at.desc())
        .all()
    )
    return [serialize(c) for c in rows]


def _respond(confirmation_id: int, accept: bool, reason: Optional[str], current_user: User, db: Session):
    conf = _load(db, confirmation_id)
    if conf.source == CLAIM_SOURCE:
        raise HTTPException(status_code=403, detail="This is your own request: your subdivision leader approves it.")
    if conf.proposed_owner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the person named as owner can answer this request.")
    if conf.status != "Pending":
        raise HTTPException(status_code=400, detail=f"This request was already {conf.status.lower()}.")
    respond(db, conf, current_user, accept, reason)
    db.commit()
    db.refresh(conf)
    return serialize(conf)


@router.post("/{confirmation_id}/accept")
def accept(confirmation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _respond(confirmation_id, True, None, current_user, db)


@router.post("/{confirmation_id}/reject")
def reject(confirmation_id: int, body: RejectBody, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _respond(confirmation_id, False, body.reason, current_user, db)


@router.get("/by-pet/{pet_id}")
def latest_for_pet(pet_id: int, current_user: User = Depends(get_current_staff_or_admin), db: Session = Depends(get_db)):
    """Latest confirmation request for a pet (staff view: pending / rejected badge)."""
    if not db.query(Pet.pet_id).filter(Pet.pet_id == pet_id).first():
        raise HTTPException(status_code=404, detail="Pet not found")
    conf = (
        db.query(PetOwnerConfirmation)
        .options(joinedload(PetOwnerConfirmation.pet), joinedload(PetOwnerConfirmation.proposed_owner),
                 joinedload(PetOwnerConfirmation.proposer))
        .filter(PetOwnerConfirmation.pet_id == pet_id, PetOwnerConfirmation.status != "Cancelled")
        .order_by(PetOwnerConfirmation.confirmation_id.desc())
        .first()
    )
    return serialize(conf) if conf else None


@router.post("/{confirmation_id}/cancel")
def cancel(confirmation_id: int, current_user: User = Depends(get_current_staff_or_admin), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    conf = _load(db, confirmation_id)
    if conf.status != "Pending":
        raise HTTPException(status_code=400, detail=f"This request was already {conf.status.lower()}.")
    conf.status = "Cancelled"
    conf.responded_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True}


# --- A resident claims a pet their subdivision registered for them (PET_RECORD_DUPLICATE_PREVENTION_PLAN.md) ------
class ClaimBody(BaseModel):
    pet_id: int


class DeclineBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


def _leaders_for_pet(db: Session, pet: Pet) -> set:
    """Who approves: the staff member who registered it, and the leaders of their subdivision."""
    ids = set()
    reg = db.get(User, pet.registered_by_user_id) if pet.registered_by_user_id else None
    if reg and reg.role_id in (2, 3, 4):
        ids.add(reg.user_id)
        if reg.subdivision_id:
            ids.update(uid for (uid,) in db.query(User.user_id).filter(User.subdivision_id == reg.subdivision_id, User.role_id == 2).all())
    return ids


@router.post("/claim")
def claim_pet(body: ClaimBody, req: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The resident says this record is their pet. Only for a record held for them (their number, no account owner)."""
    from app.models.notification import Notification
    from app.models.pet_history import PetHistory
    from app.utils import pet_duplicates
    from app.utils.audit import log_activity
    if current_user.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents claim pets this way.")
    pet = db.get(Pet, body.pet_id)
    held = {p.pet_id for p in pet_duplicates.existing_pets_for_resident(db, current_user, pet.pet_type if pet else None)}
    if pet is None or pet.pet_id not in held:
        raise HTTPException(status_code=404, detail="This pet is not one your subdivision registered for you.")
    pending = db.query(PetOwnerConfirmation).filter(PetOwnerConfirmation.pet_id == pet.pet_id, PetOwnerConfirmation.status == "Pending").first()
    if pending:
        if pending.source == CLAIM_SOURCE and pending.proposed_owner_id == current_user.user_id:
            return serialize(_load(db, pending.confirmation_id))
        raise HTTPException(status_code=409, detail="This pet already has an ownership request waiting. Ask your subdivision office.")
    conf = PetOwnerConfirmation(pet_id=pet.pet_id, proposed_owner_id=current_user.user_id, proposed_by=current_user.user_id,
                                previous_owner_id=None, source=CLAIM_SOURCE, status="Pending")
    db.add(conf)
    db.flush()
    for uid in _leaders_for_pet(db, pet):
        db.add(Notification(
            user_id=uid, type="pet_owner_confirmation", related_id=pet.pet_id,
            title=f"🐾 {current_user.name} says {pet.display_name} is theirs",
            message=(f"{current_user.name} (resident account) says '{pet.display_name}', registered for an owner without an "
                     f"account, is their pet. Their account number matches the one on the record. Approve or decline in Pet Records."),
        ))
    db.add(PetHistory(pet_id=pet.pet_id, event_type="OWNER_CLAIM_REQUESTED", title="Ownership Claim Requested",
                      description=f"{current_user.name} said this is their pet. Waiting for the subdivision to approve.",
                      actor_id=current_user.user_id, actor_name=current_user.name, actor_role="Resident"))
    log_activity(db=db, action="PET_OWNERSHIP_CLAIM", target_table="pets", target_id=pet.pet_id,
                 description=f"{current_user.name} claimed pet #{pet.pet_id} ({pet.display_name}) held for them",
                 user_id=current_user.user_id, log_type="operation", new_values={"confirmation_id": conf.confirmation_id},
                 request=req, commit=False)
    db.commit()
    return serialize(_load(db, conf.confirmation_id))


@router.get("/my-claims")
def my_claims(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The resident's own pet claims that are still waiting (shown on My Pets)."""
    rows = (db.query(PetOwnerConfirmation).options(joinedload(PetOwnerConfirmation.pet))
            .filter(PetOwnerConfirmation.proposed_owner_id == current_user.user_id, PetOwnerConfirmation.source == CLAIM_SOURCE,
                    PetOwnerConfirmation.status == "Pending")
            .order_by(PetOwnerConfirmation.created_at.desc()).all())
    return [serialize(c) for c in rows]


def _claim_for_staff(db: Session, confirmation_id: int, actor: User) -> PetOwnerConfirmation:
    from app.routes.pets import check_pet_access
    conf = _load(db, confirmation_id)
    if conf.source != CLAIM_SOURCE:
        raise HTTPException(status_code=404, detail="Claim not found")
    check_pet_access(actor, conf.pet, db, for_write=False)
    return conf


@router.get("/claims")
def pending_claims(current_user: User = Depends(get_current_staff_or_admin), db: Session = Depends(get_db)):
    """Residents' pet claims waiting for approval, in the staff member's area."""
    from app.routes.pets import check_pet_access
    from app.utils import pet_duplicates
    rows = (db.query(PetOwnerConfirmation)
            .options(joinedload(PetOwnerConfirmation.pet), joinedload(PetOwnerConfirmation.proposed_owner))
            .filter(PetOwnerConfirmation.source == CLAIM_SOURCE, PetOwnerConfirmation.status == "Pending")
            .order_by(PetOwnerConfirmation.created_at).all())
    out = []
    for c in rows:
        try:
            check_pet_access(current_user, c.pet, db, for_write=False)
        except HTTPException:
            continue
        item = serialize(c)
        resident = c.proposed_owner
        item.update({
            "resident_phone": resident.phone if resident else None,
            "record_owner_name": c.pet.emergency_contact_name if c.pet else None,
            "record_owner_phone": c.pet.emergency_contact_phone if c.pet else None,
            "numbers_match": bool(resident and c.pet and pet_duplicates.norm_phone(resident.phone)
                                  and pet_duplicates.norm_phone(resident.phone) == pet_duplicates.norm_phone(c.pet.emergency_contact_phone)),
        })
        out.append(item)
    return out


def _decide_claim(confirmation_id: int, approve: bool, reason: Optional[str], req: Request, actor: User, db: Session):
    from datetime import datetime, timezone
    from app.models.notification import Notification
    from app.models.pet_history import PetHistory
    from app.utils.audit import log_activity
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="The Subdivision Leader (or an Admin) decides pet ownership claims.")
    conf = _claim_for_staff(db, confirmation_id, actor)
    if conf.status != "Pending":
        raise HTTPException(status_code=400, detail=f"This claim was already {conf.status.lower()}.")
    pet, resident = conf.pet, conf.proposed_owner
    if approve and pet.owner_id:
        raise HTTPException(status_code=409, detail="This pet already has an account owner.")
    conf.status = "Accepted" if approve else "Rejected"
    conf.reject_reason = None if approve else reason
    conf.responded_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if approve:
        pet.owner_id = resident.user_id   # the saved owner details stay as the emergency contact
    title = "Ownership Claim Approved" if approve else "Ownership Claim Declined"
    desc = (f"{actor.name} approved {resident.name}'s claim: the pet is now on their account." if approve
            else f"{actor.name} declined {resident.name}'s claim. Reason: {reason}")
    db.add(PetHistory(pet_id=pet.pet_id, event_type="OWNER_CLAIM_" + ("APPROVED" if approve else "DECLINED"), title=title,
                      description=desc, actor_id=actor.user_id, actor_name=actor.name, actor_role="Staff"))
    db.add(Notification(
        user_id=resident.user_id, type="pet_owner_confirmation", related_id=pet.pet_id,
        title=f"🐾 {pet.display_name} " + ("is now in your pets" if approve else ": claim declined"),
        message=(f"Your subdivision confirmed '{pet.display_name}' is yours. It is now under My Pets, with its records."
                 if approve else f"Your subdivision declined your claim for '{pet.display_name}'. Reason: {reason}. "
                                 f"You can register your pet as a new record."),
    ))
    log_activity(db=db, action="PET_OWNERSHIP_CLAIM_" + ("APPROVED" if approve else "DECLINED"), target_table="pets",
                 target_id=pet.pet_id, description=desc, user_id=actor.user_id, log_type="operation",
                 new_values={"confirmation_id": conf.confirmation_id, "owner_id": pet.owner_id, "reason": reason},
                 request=req, commit=False)
    db.commit()
    return serialize(_load(db, conf.confirmation_id))


@router.post("/claims/{confirmation_id}/approve")
def approve_claim(confirmation_id: int, req: Request, current_user: User = Depends(get_current_staff_or_admin),
                  db: Session = Depends(get_db)):
    return _decide_claim(confirmation_id, True, None, req, current_user, db)


@router.post("/claims/{confirmation_id}/decline")
def decline_claim(confirmation_id: int, body: DeclineBody, req: Request, current_user: User = Depends(get_current_staff_or_admin),
                  db: Session = Depends(get_db)):
    return _decide_claim(confirmation_id, False, body.reason.strip(), req, current_user, db)
