"""Shared logic for the 'Returned to Owner / Reunited' outcome (report status flow and holding facility flow)."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import ColumnElement, or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_history import PetHistory
from app.utils.pet_ownership import propose_owner
from app.models.report import HoldingAnimal, HoldingTimeline, Report, ReportMedia, ReportReturn
from app.models.user import Subdivision, User


class OwnerReturnInfo(BaseModel):
    """Who the animal was handed back to. has_account=True -> owner_user_id; False -> manual details only."""
    has_account: bool
    return_method: Optional[str] = Field(default="in_person", max_length=50)  # "in_person" or "self_retrieved"
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = Field(default=None, max_length=150)
    owner_phone: Optional[str] = Field(default=None, max_length=30)
    owner_email: Optional[str] = Field(default=None, max_length=120)
    owner_address: Optional[str] = Field(default=None, max_length=255)
    relationship_to_animal: Optional[str] = Field(default=None, max_length=60)
    id_presented: Optional[str] = Field(default=None, max_length=120)
    id_type: Optional[str] = Field(default=None, max_length=60)
    id_last4: Optional[str] = Field(default=None, max_length=4)
    handover_media_id: Optional[int] = None          # photo uploaded to the report's media first
    handover_photo_url: Optional[str] = None
    ownership_proof_media_ids: Optional[list[int]] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    bypass_handover_photo: Optional[bool] = False
    returned_at: Optional[datetime] = None


def _clean(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


def owner_in_scope(actor: User, owner: User, db: Session) -> bool:
    """A selectable owner account is an active resident the actor is allowed to deal with."""
    if owner.role_id != 1 or (owner.status or "Active") != "Active":
        return False
    if actor.role_id == 4:
        return True
    if actor.role_id == 2:
        return bool(actor.subdivision_id) and owner.subdivision_id == actor.subdivision_id
    if actor.role_id == 3:
        if not actor.barangay_id:
            return True
        if owner.barangay_id == actor.barangay_id:
            return True
        if owner.subdivision_id:
            sub = db.query(Subdivision).filter(Subdivision.subdivision_id == owner.subdivision_id).first()
            return bool(sub and sub.barangay_id == actor.barangay_id)
        return False
    return False


def search_owner_accounts(q: str, actor: User, db: Session, limit: int = 10):
    q = (q or "").strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"
    query = db.query(User).filter(
        User.role_id == 1,
        or_(User.status == "Active", User.status.is_(None)),
        or_(User.name.like(like), User.email.like(like), User.phone.like(like)),
    )
    if actor.role_id == 2:
        if not actor.subdivision_id:
            return []
        query = query.filter(User.subdivision_id == actor.subdivision_id)
    elif actor.role_id == 3 and actor.barangay_id:
        sub_ids = [s.subdivision_id for s in db.query(Subdivision.subdivision_id).filter(Subdivision.barangay_id == actor.barangay_id).all()]
        cond = [User.barangay_id == actor.barangay_id]
        if sub_ids:
            cond.append(User.subdivision_id.in_(sub_ids))
        query = query.filter(or_(*cond))
    return query.order_by(User.name.asc()).limit(limit).all()


def owner_already_on_record(report: Report, owner_user_id: Optional[int], db: Session) -> bool:
    """The linked account already owns the report's registered pet -> ownership is proven by the record."""
    if not owner_user_id or not report.pet_id:
        return False
    # An identity only inherited from a merged case isn't proof of ownership until staff re-check it
    from app.utils.case_groups import pet_link_trusted
    if not pet_link_trusted(report):
        return False
    pet = db.query(Pet).filter(Pet.pet_id == report.pet_id).first()
    return bool(pet and pet.owner_id == owner_user_id)


def _report_media_url(db: Session, report_id: int, media_id: int) -> str:
    m = db.query(ReportMedia).filter(ReportMedia.media_id == media_id, ReportMedia.report_id == report_id).first()
    if not m:
        raise HTTPException(status_code=400, detail="The uploaded proof photo does not belong to this report.")
    return m.file_url


def _apply_proof(info: OwnerReturnInfo, snap: dict, report: Report, db: Session) -> None:
    is_self_retrieved = getattr(info, 'return_method', None) == "self_retrieved"
    snap["return_method"] = "self_retrieved" if is_self_retrieved else "in_person"

    # Find existing claim if any for proof fallback
    from app.models.pet_claim import PetClaim
    claim = None
    if report.report_id:
        claim = db.query(PetClaim).filter(PetClaim.report_id == report.report_id, PetClaim.status != "Rejected").order_by(PetClaim.updated_at.desc(), PetClaim.claim_id.desc()).first()
    if not claim and report.pet_id:
        claim = db.query(PetClaim).filter(PetClaim.pet_id == report.pet_id, PetClaim.status != "Rejected").order_by(PetClaim.updated_at.desc(), PetClaim.claim_id.desc()).first()

    if info.handover_media_id:
        snap["handover_photo_url"] = _report_media_url(db, report.report_id, info.handover_media_id)
    elif getattr(info, 'handover_photo_url', None):
        snap["handover_photo_url"] = info.handover_photo_url
    else:
        existing_photo = None
        if claim:
            existing_photo = (
                getattr(claim, 'handover_photo_url', None)
                or getattr(claim, 'additional_photos_url', None)
                or getattr(claim, 'evidence_url', None)
                or getattr(claim, 'vaccine_card_url', None)
            )
        if not existing_photo and is_self_retrieved:
            if report.pet_id:
                pet = db.query(Pet).filter(Pet.pet_id == report.pet_id).first()
                if pet and pet.photo_url:
                    existing_photo = pet.photo_url
            if not existing_photo and report.media:
                existing_photo = report.media[0].file_url

        if existing_photo:
            snap["handover_photo_url"] = existing_photo
        elif getattr(info, 'bypass_handover_photo', False):
            snap["handover_photo_url"] = None
        else:
            if not is_self_retrieved:
                raise HTTPException(status_code=400, detail="A handover photo (owner with the animal) is required for in-person handover.")
            else:
                raise HTTPException(status_code=400, detail="A reunion proof photo (showing animal safe with owner or at home) is required.")

    manual_proof_urls = [_report_media_url(db, report.report_id, mid) for mid in (info.ownership_proof_media_ids or [])[:5]] or None
    if manual_proof_urls:
        snap["ownership_proof_urls"] = manual_proof_urls
    else:
        if claim:
            claim_urls = [getattr(claim, f) for f in ("vaccine_card_url", "vet_record_url", "registration_record_url", "additional_photos_url", "evidence_url") if getattr(claim, f)]
            snap["ownership_proof_urls"] = claim_urls[:5] if claim_urls else None
        else:
            snap["ownership_proof_urls"] = None
    snap["ownership_verified_by_record"] = owner_already_on_record(report, snap["owner_user_id"], db)

    id_type = _clean(info.id_type)
    last4 = _clean(info.id_last4)

    # For self-retrieved, waive in-person ID check if the resident has a verified StraySafe account or is verified on record
    waive_id = snap["ownership_verified_by_record"] or (is_self_retrieved and snap.get("has_account") and snap.get("owner_user_id"))

    if not waive_id:
        if not id_type:
            raise HTTPException(status_code=400, detail="Select the type of ID the owner presented.")
        if not last4 or not last4.isdigit() or len(last4) != 4:
            raise HTTPException(status_code=400, detail="Enter the last 4 digits of the owner's ID number.")
    elif last4 and (not last4.isdigit() or len(last4) != 4):
        raise HTTPException(status_code=400, detail="The ID's last 4 digits must be exactly 4 numbers.")

    snap["id_type"] = id_type
    snap["id_last4"] = last4
    if id_type and not snap.get("id_presented"):
        snap["id_presented"] = f"{id_type}{f' (ending {last4})' if last4 else ''}"
    elif is_self_retrieved and not snap.get("id_presented"):
        snap["id_presented"] = "Self-Retrieved / Verified via StraySafe Account"


def validate_owner_return(info: Optional[OwnerReturnInfo], actor: User, db: Session, report: Optional[Report] = None) -> dict:
    """Return the owner snapshot to store, or raise 400. Never creates a user account."""
    if info is None:
        raise HTTPException(
            status_code=400,
            detail="Owner details are required: choose an existing StraySafe account or enter the owner's information.",
        )
    snap = {
        "has_account": info.has_account,
        "owner_user_id": None,
        "relationship_to_animal": _clean(info.relationship_to_animal) or "Owner",
        "id_presented": _clean(info.id_presented),
        "notes": _clean(info.notes),
    }
    if info.has_account:
        if not info.owner_user_id:
            raise HTTPException(status_code=400, detail="Search and select the owner's StraySafe account.")
        owner = db.query(User).filter(User.user_id == info.owner_user_id).first()
        if not owner or not owner_in_scope(actor, owner, db):
            raise HTTPException(status_code=400, detail="The selected owner account was not found or is outside your area.")
        snap.update(
            owner_user_id=owner.user_id,
            owner_name=owner.name,
            owner_phone=owner.phone,
            owner_email=owner.email,
            owner_address=owner.address,
        )
    else:
        name = _clean(info.owner_name)
        phone = _clean(info.owner_phone)
        if not name or len(name) < 2:
            raise HTTPException(status_code=400, detail="Enter the owner's full name.")
        if not phone and not _clean(info.owner_address):
            raise HTTPException(status_code=400, detail="Enter at least the owner's contact number or address.")
        snap.update(
            owner_name=name,
            owner_phone=phone,
            owner_email=_clean(info.owner_email),
            owner_address=_clean(info.owner_address),
        )
    if report is not None:
        _apply_proof(info, snap, report, db)
    return snap


def record_owner_return(db: Session, report: Report, snap: dict, actor: User,
                        pet_id: Optional[int] = None, holding_id: Optional[int] = None) -> ReportReturn:
    """Insert (or replace) the report's return record. Caller commits."""
    rec = db.query(ReportReturn).filter(ReportReturn.report_id == report.report_id).first()
    if rec is None:
        rec = ReportReturn(report_id=report.report_id)
        db.add(rec)
    rec.holding_id = holding_id or rec.holding_id
    rec.pet_id = pet_id or report.pet_id or rec.pet_id
    rec.has_account = snap["has_account"]
    rec.owner_user_id = snap["owner_user_id"]
    rec.owner_name = snap["owner_name"]
    rec.owner_phone = snap.get("owner_phone")
    rec.owner_email = snap.get("owner_email")
    rec.owner_address = snap.get("owner_address")
    rec.relationship_to_animal = snap["relationship_to_animal"]
    rec.id_presented = snap.get("id_presented")
    rec.id_type = snap.get("id_type")
    rec.id_last4 = snap.get("id_last4")
    rec.ownership_verified_by_record = bool(snap.get("ownership_verified_by_record"))
    rec.handover_photo_url = snap.get("handover_photo_url")
    rec.ownership_proof_urls = snap.get("ownership_proof_urls")
    rec.notes = snap.get("notes")
    rec.returned_by = actor.user_id
    _discharge_holding_animal(db, report, snap, actor)
    _update_pet_record(db, rec.pet_id, snap, actor, report.report_id)
    _sync_pet_claims_on_return(db, report, snap, actor, rec)
    if snap["owner_user_id"] and snap["owner_user_id"] != actor.user_id:
        db.add(Notification(
            user_id=snap["owner_user_id"],
            title="🐾 Animal Returned to You",
            message=f"Report #{report.report_id} was closed: the animal was returned to you ({snap['owner_name']}).",
            type="status_update",
            related_id=report.report_id,
        ))
    return rec


# Holding statuses that already mean the animal left the facility (Claimed, Deceased, Transferred, Adopted, Impounded)
_HOLDING_CLOSED = {3, 4, 5, 7, 8}


def _discharge_holding_animal(db: Session, report: Report, snap: dict, actor: User) -> None:
    """An animal handed back to its owner is no longer in the holding facility."""
    for animal in db.query(HoldingAnimal).filter(HoldingAnimal.report_id == report.report_id).all():
        if animal.facility_status in _HOLDING_CLOSED:
            continue
        animal.facility_status = 3
        animal.discharge_date = datetime.now(timezone.utc).replace(tzinfo=None)
        animal.kennel_slot = None
        db.add(HoldingTimeline(
            holding_id=animal.holding_id,
            event_type="outcome",
            title="Case Resolved — Claimed by Owner",
            notes=owner_return_summary(snap),
            logged_by=actor.user_id,
        ))


def _update_pet_record(db: Session, pet_id: Optional[int], snap: dict, actor: User, report_id: Optional[int] = None) -> None:
    """
    Reflect the return on the pet record:
      - owner with an account + pet has no owner yet -> the account is asked to confirm; it becomes the owner on accept
      - owner already registered (same account)       -> nothing to reassign
      - pet registered to a DIFFERENT account         -> never overwritten here (that is an ownership transfer)
      - owner without an account                      -> stays unowned in the system; the owner's details are kept
                                                         as the pet's contact so the record is not anonymous
    """
    if not pet_id:
        return
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        return
    prev_status = pet.status
    if pet.status in ("Lost", "Found", "Rescued", "Missing"):
        pet.status = "Active"
    if snap["owner_user_id"]:
        if pet.owner_id is None:
            owner = db.query(User).filter(User.user_id == snap["owner_user_id"]).first()
            if owner:
                propose_owner(db, pet, owner, actor, source="returned_to_owner", report_id=report_id)
            title, desc = "Returned to Owner", f"Pet returned to {snap['owner_name']}. Waiting for them to confirm ownership." 
        elif pet.owner_id == snap["owner_user_id"]:
            title, desc = "Returned to Owner", f"Pet returned to its registered owner {snap['owner_name']}."
        else:
            title, desc = "Returned to Owner", (
                f"Pet handed to {snap['owner_name']} (StraySafe account), who is not the registered owner. "
                "Ownership was not changed; transfer it from Pet Records if needed."
            )
    else:
        if not pet.emergency_contact_name:
            pet.emergency_contact_name = snap["owner_name"][:100]
        if not pet.emergency_contact_phone and snap.get("owner_phone"):
            pet.emergency_contact_phone = snap["owner_phone"][:20]
        if not pet.registered_address and snap.get("owner_address"):
            pet.registered_address = snap["owner_address"][:255]
        title, desc = "Returned to Owner (no StraySafe account)", (
            f"Pet returned to {snap['owner_name']}"
            f"{' (' + snap['owner_phone'] + ')' if snap.get('owner_phone') else ''}, who has no StraySafe account."
        )
    db.add(PetHistory(
        pet_id=pet.pet_id,
        event_type="RETURNED_TO_OWNER",
        title=title,
        description=desc,
        recovery_method="Manual",
        actor_id=actor.user_id,
        actor_name=actor.name,
        actor_role="Staff",
        previous_status=prev_status,
        new_status=pet.status,
    ))


def _sync_pet_claims_on_return(db: Session, report: Report, snap: dict, actor: User, rec: ReportReturn) -> None:
    """When an animal is returned to owner, synchronize matching approved/pending PetClaims."""
    from app.utils.case_groups import case_root, case_members
    from app.models.pet_claim import PetClaim
    from app.models.chat import ChatThread
    from app.models.report_match import ReportMatch

    root = case_root(db, report)
    members = case_members(db, root)
    case_rep_ids = [m.report_id for m in members]

    conds: list[ColumnElement[bool]] = [PetClaim.report_id.in_(case_rep_ids)]
    if rec.pet_id:
        conds.append(PetClaim.pet_id == rec.pet_id)

    claims = db.query(PetClaim).filter(
        or_(*conds),
        PetClaim.status != "Merged"
    ).all()

    owner_user_id = snap.get("owner_user_id")
    now_str = datetime.now(timezone.utc).strftime("%b %d, %Y")

    for claim in claims:
        claim_owner_id = claim.pet.owner_id if claim.pet else None
        # Only synchronize if the return recipient is verified as the claim's owner
        if owner_user_id and claim_owner_id == owner_user_id:
            if claim.status != "Handover Complete":
                claim.status = "Handover Complete"
                sync_note = f"Physical handover completed via Report #{report.report_id} by {actor.name} on {now_str}."
                claim.remarks = f"{claim.remarks} | {sync_note}" if claim.remarks else sync_note

    # Update custody status on all case member reports
    for m in members:
        m.custody_status = "Claimed by Owner"

    # Close inquiry and match chat threads across this case
    try:
        matches = db.query(ReportMatch).filter(ReportMatch.source_report_id.in_(case_rep_ids)).all()
        match_ids = [m.match_id for m in matches]
        if match_ids:
            db.query(ChatThread).filter(
                ChatThread.thread_type == "Direct",
                ChatThread.related_id.in_(match_ids)
            ).update({"is_closed": True}, synchronize_session=False)
        db.query(ChatThread).filter(
            ChatThread.thread_type == "Report",
            ChatThread.related_id.in_(case_rep_ids)
        ).update({"is_closed": True}, synchronize_session=False)
    except Exception as err:
        print(f"Notice: Failed to close chat threads on return sync: {err}")


def owner_return_summary(snap: dict) -> str:
    tag = "StraySafe account" if snap["has_account"] else "no StraySafe account"
    return f"Returned to owner: {snap['owner_name']} ({tag})"


def serialize_return(rec: ReportReturn, db: Optional[Session] = None) -> dict:
    data = {
        "return_id": rec.return_id,
        "report_id": rec.report_id,
        "pet_id": rec.pet_id,
        "has_account": rec.has_account,
        "owner_user_id": rec.owner_user_id,
        "owner_name": rec.owner_name,
        "owner_phone": rec.owner_phone,
        "owner_email": rec.owner_email,
        "owner_address": rec.owner_address,
        "relationship_to_animal": rec.relationship_to_animal,
        "id_presented": rec.id_presented,
        "id_type": rec.id_type,
        "id_last4": rec.id_last4,
        "ownership_verified_by_record": rec.ownership_verified_by_record,
        "handover_photo_url": rec.handover_photo_url,
        "ownership_proof_urls": rec.ownership_proof_urls or [],
        "notes": rec.notes,
        "returned_by": rec.returned_by,
        "returned_by_name": rec.returner.name if rec.returner else None,
        "returned_at": rec.returned_at.isoformat() if rec.returned_at else None,
        "is_already_reunited": True,
        "claim_id": None,
        "claim_status": None,
        "pet_name": None,
        "pet_breed": None,
        "pet_photo_url": None,
    }
    if db is not None:
        if rec.pet_id:
            pet = db.query(Pet).filter(Pet.pet_id == rec.pet_id).first()
            if pet:
                data["pet_name"] = pet.pet_name or pet.display_name
                data["pet_breed"] = pet.breed
                data["pet_photo_url"] = pet.photo_url
        from app.models.pet_claim import PetClaim
        claim = None
        if rec.pet_id:
            claim = db.query(PetClaim).filter(
                PetClaim.pet_id == rec.pet_id,
                PetClaim.status.in_(["Handover Complete", "Pet Received", "Approved"])
            ).order_by(PetClaim.claim_id.desc()).first()
        if not claim and rec.report_id:
            claim = db.query(PetClaim).filter(
                PetClaim.report_id == rec.report_id
            ).order_by(PetClaim.claim_id.desc()).first()
        if claim:
            data["claim_id"] = claim.claim_id
            data["claim_status"] = claim.status
    return data

