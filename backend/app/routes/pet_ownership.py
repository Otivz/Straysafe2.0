"""Residents accept or reject pet ownership that staff recorded for them."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.pet import Pet
from app.models.pet_owner_confirmation import PetOwnerConfirmation
from app.models.user import User
from app.utils.auth import get_current_staff_or_admin, get_current_user
from app.utils.pet_ownership import respond, serialize

router = APIRouter(prefix="/pet-ownership", tags=["pet-ownership"])


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
        .filter(PetOwnerConfirmation.proposed_owner_id == current_user.user_id, PetOwnerConfirmation.status == "Pending")
        .order_by(PetOwnerConfirmation.created_at.desc())
        .all()
    )
    return [serialize(c) for c in rows]


def _respond(confirmation_id: int, accept: bool, reason: Optional[str], current_user: User, db: Session):
    conf = _load(db, confirmation_id)
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
