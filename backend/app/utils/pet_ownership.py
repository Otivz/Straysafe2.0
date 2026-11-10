"""Resident confirmation of staff-proposed pet ownership (protects against assigning the wrong account)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_history import PetHistory
from app.models.pet_owner_confirmation import PetOwnerConfirmation
from app.models.user import User


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def pending_confirmation(db: Session, pet_id: int) -> Optional[PetOwnerConfirmation]:
    return db.query(PetOwnerConfirmation).filter(
        PetOwnerConfirmation.pet_id == pet_id, PetOwnerConfirmation.status == "Pending"
    ).first()


def propose_owner(db: Session, pet: Pet, owner: User, actor: User, source: str = "assign",
                  report_id: Optional[int] = None) -> PetOwnerConfirmation:
    """
    Ask `owner` to confirm they own `pet`. Replaces any earlier pending proposal for the pet.
    The pet's owner_id is NOT changed here. Caller commits.
    """
    for old in db.query(PetOwnerConfirmation).filter(
        PetOwnerConfirmation.pet_id == pet.pet_id, PetOwnerConfirmation.status == "Pending"
    ).all():
        old.status = "Cancelled"
        old.responded_at = _now()
    conf = PetOwnerConfirmation(
        pet_id=pet.pet_id,
        proposed_owner_id=owner.user_id,
        proposed_by=actor.user_id,
        previous_owner_id=pet.owner_id,
        source=source,
        report_id=report_id,
        status="Pending",
    )
    db.add(conf)
    db.flush()
    db.add(Notification(
        user_id=owner.user_id,
        title="🐾 Please confirm pet ownership",
        message=(f"{actor.name} recorded you as the owner of '{pet.pet_name}'. "
                 "Open My Pets to accept, or reject it if this is not your pet."),
        type="pet_owner_confirmation",
        related_id=pet.pet_id,
    ))
    db.add(PetHistory(
        pet_id=pet.pet_id,
        event_type="OWNER_CONFIRMATION_REQUESTED",
        title="Owner Confirmation Requested",
        description=f"{actor.name} proposed {owner.name} as the owner. Waiting for {owner.name} to accept.",
        actor_id=actor.user_id,
        actor_name=actor.name,
        actor_role="Staff",
    ))
    return conf


def respond(db: Session, conf: PetOwnerConfirmation, resident: User, accept: bool, reason: Optional[str] = None) -> None:
    """Resident accepts (ownership is applied) or rejects (pet stays as it was). Caller commits."""
    pet = db.query(Pet).filter(Pet.pet_id == conf.pet_id).first()
    conf.responded_at = _now()
    if accept:
        conf.status = "Accepted"
        if pet:
            pet.owner_id = resident.user_id
            if pet.status in ("Lost", "Found", "Rescued"):
                pet.status = "Active"
        title, desc = "Ownership Confirmed", f"{resident.name} confirmed they are the owner."
        staff_msg = f"{resident.name} accepted ownership of '{pet.pet_name if pet else 'the pet'}'."
    else:
        conf.status = "Rejected"
        conf.reject_reason = (reason or "").strip() or None
        title = "Ownership Rejected"
        desc = f"{resident.name} said this is not their pet." + (f" Reason: {conf.reject_reason}" if conf.reject_reason else "")
        staff_msg = (f"{resident.name} rejected ownership of '{pet.pet_name if pet else 'the pet'}' — the wrong owner may have been "
                     f"selected. Please verify and assign the correct owner." + (f" Reason: {conf.reject_reason}" if conf.reject_reason else ""))
    if pet:
        db.add(PetHistory(
            pet_id=pet.pet_id,
            event_type="OWNER_CONFIRMATION_" + ("ACCEPTED" if accept else "REJECTED"),
            title=title,
            description=desc,
            actor_id=resident.user_id,
            actor_name=resident.name,
            actor_role="Owner",
        ))
    if conf.proposed_by:
        db.add(Notification(
            user_id=conf.proposed_by,
            title="✅ Ownership confirmed" if accept else "⚠️ Ownership rejected",
            message=staff_msg,
            type="pet_owner_confirmation_result",
            related_id=conf.pet_id,
        ))


def serialize(conf: PetOwnerConfirmation) -> dict:
    pet = conf.pet
    return {
        "confirmation_id": conf.confirmation_id,
        "pet_id": conf.pet_id,
        "pet_name": pet.display_name if pet else None,
        "pet_type": pet.pet_type if pet else None,
        "breed": pet.breed if pet else None,
        "photo_url": pet.photo_url if pet else None,
        "proposed_owner_id": conf.proposed_owner_id,
        "proposed_owner_name": conf.proposed_owner.name if conf.proposed_owner else None,
        "proposed_by_name": conf.proposer.name if conf.proposer else None,
        "source": conf.source,
        "report_id": conf.report_id,
        "status": conf.status,
        "reject_reason": conf.reject_reason,
        "created_at": conf.created_at.isoformat() if conf.created_at else None,
        "responded_at": conf.responded_at.isoformat() if conf.responded_at else None,
    }


def became_owner_after(db: Session, pet_id: Optional[int], user_id: int, since) -> bool:
    """
    Did user_id become this pet's owner after `since` (for example, after a report was filed)?

    Ownership can change later: staff assign an owner who accepts, an ownership claim is approved, or the pet is
    returned to someone. That later owner must not inherit what happened before the animal was theirs: the reporter's
    private conversation, an old look-alike chat, or the old case's actions. An owner who has owned the pet since it
    was registered (before the report) is not affected, and neither is a report filed after they became the owner.
    The start of ownership is the last accepted ownership confirmation for that account (a transfer to them), else the
    pet record's creation. A resident who registered the pet themselves, with no transfer to them, is its original owner.
    """
    if not pet_id:
        return False
    owner_since = db.query(func.max(PetOwnerConfirmation.responded_at)).filter(
        PetOwnerConfirmation.pet_id == pet_id,
        PetOwnerConfirmation.proposed_owner_id == user_id,
        PetOwnerConfirmation.status == "Accepted",
    ).scalar()
    if owner_since is None:
        created_at, registered_by = db.query(Pet.created_at, Pet.registered_by_user_id).filter(Pet.pet_id == pet_id).first() or (None, None)
        if registered_by == user_id:
            return False  # they registered it themselves: the original owner, not a later one
        owner_since = created_at
    if since is None or owner_since is None:
        return True  # can't tell when: don't open the older case
    return owner_since > since
