"""
Pet QR tags (docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md).

Owner side (Phase 1, `router`):
  POST /pets/{pet_id}/tag                       owner             create, or replace the active tag (the old token stops working)
  GET  /pets/{pet_id}/tag                       owner, Leader     the current tag and its link
  GET  /pets/{pet_id}/tag/qr.png                owner             the QR image of the current tag
  POST /pets/{pet_id}/tag/disable               owner, Leader     turn the tag off without a new one
  GET  /pets/{pet_id}/tag/scans                 owner, Leader     "tell the owner" messages and a view summary (Phase 2)
  POST /pets/{pet_id}/tag/scans/resolve         owner             "Pet is back home": every open message resolved (Phase 2)
  POST /pets/{pet_id}/tag/scans/{id}/resolve    owner             one message resolved; a shared phone number is cleared

Public (Phase 2, `public_router`; no sign-in needed, an optional sign-in is used when present):
  GET  /t/{token}                               anyone            the safe pet card (allow-list only)          30/minute per visitor
  POST /t/{token}/found                         anyone            "tell the owner": stored, owner notified      3/hour per visitor
                                                                                                                 + 10/hour per tag
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.pet import Pet
from app.models.user import User
from app.routes.pets import check_pet_access
from app.schemas.pet_tag import PetTagResponse
from app.services import pet_tags as T
from app.utils.audit import log_activity
from app.utils.auth import get_current_user, get_optional_user

router = APIRouter(prefix="/pets", tags=["Pet QR tags"])
public_router = APIRouter(prefix="/t", tags=["Pet QR tags (public)"])


def _load_pet(db: Session, pet_id: int) -> Pet:
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet


def _require_owner(user: User, pet: Pet) -> None:
    if not T.is_owner(user, pet):
        raise HTTPException(status_code=403, detail="Only the pet's owner can create or print its QR tag.")


def _can_view(user: User, pet: Pet, db: Session) -> bool:
    """The owner, or the Leader (or system admin) whose scope covers the pet. Raises 403 otherwise."""
    if T.is_owner(user, pet):
        return True
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Access denied: you cannot see this pet's QR tag.")
    check_pet_access(user, pet, db, for_write=False)
    return True


def _response(db: Session, pet: Pet, user: User) -> PetTagResponse:
    tag = T.active_tag(db, pet.pet_id)
    _, configured = T.public_base_url()
    return PetTagResponse(
        pet_id=pet.pet_id,
        has_tag=tag is not None,
        tag_id=tag.tag_id if tag else None,
        token=tag.token if tag else None,
        link=T.tag_link(tag.token) if tag else None,
        created_at=tag.created_at if tag else None,
        last_scanned_at=tag.last_scanned_at if tag else None,
        cooldown_minutes=T.SCAN_COOLDOWN_MINUTES,
        cooldown_remaining_seconds=T.cooldown_remaining_seconds(tag),
        link_is_public=configured,
        can_manage=T.is_owner(user, pet),
        can_disable=False,
    )


@router.get("/{pet_id}/tag", response_model=PetTagResponse)
def get_tag(pet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    _can_view(current_user, pet, db)
    return _response(db, pet, current_user)


@router.post("/{pet_id}/tag", response_model=PetTagResponse)
def create_tag(pet_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    _require_owner(current_user, pet)
    tag, previous = T.create_or_replace(db, pet, current_user)
    log_activity(
        db, "PET_TAG_REPLACED" if previous else "PET_TAG_CREATED", target_table="pets", target_id=pet.pet_id,
        description=(f"Replaced the QR tag of {pet.pet_name} (old tag {previous.tag_id} stopped working)" if previous
                     else f"Created a QR tag for {pet.pet_name}"),
        user_id=current_user.user_id, new_values={"tag_id": tag.tag_id}, request=request, commit=False,
    )
    db.commit()
    return _response(db, pet, current_user)


@router.post("/{pet_id}/tag/disable", response_model=PetTagResponse)
def disable_tag(pet_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    if not T.is_owner(current_user, pet):
        if current_user.role_id not in (2, 4):
            raise HTTPException(status_code=403, detail="Only the pet's owner or the subdivision Leader can turn off its QR tag.")
        check_pet_access(current_user, pet, db, for_write=False)
    tag = T.disable(db, pet, current_user)
    if tag:
        log_activity(
            db, "PET_TAG_DISABLED", target_table="pets", target_id=pet.pet_id,
            description=f"Turned off the QR tag of {pet.pet_name}", user_id=current_user.user_id,
            new_values={"tag_id": tag.tag_id}, request=request, commit=False,
        )
    db.commit()
    return _response(db, pet, current_user)


@router.get("/{pet_id}/tag/qr.png")
def tag_qr(pet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    _require_owner(current_user, pet)
    tag = T.active_tag(db, pet.pet_id)
    if not tag:
        raise HTTPException(status_code=404, detail="This pet has no active QR tag.")
    return Response(content=T.qr_png(T.tag_link(tag.token)), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


# ---- Phase 2: scan history (owner, Leader) --------------------------------------------------------------------------

@router.get("/{pet_id}/tag/scans")
def tag_scans(pet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The owner sees everything, including a phone number the finder chose to share; the Leader sees the messages without it."""
    pet = _load_pet(db, pet_id)
    _can_view(current_user, pet, db)
    owner = T.is_owner(current_user, pet)
    history = T.scan_history(db, pet, viewer_is_owner=owner)
    db.commit()
    return history


@router.post("/{pet_id}/tag/scans/resolve")
def resolve_all_scans(pet_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    _require_owner(current_user, pet)
    count = T.resolve_scans(db, pet)
    if count:
        log_activity(db, "PET_TAG_SCANS_RESOLVED", target_table="pets", target_id=pet.pet_id,
                     description=f"{pet.pet_name} is back home: {count} QR tag message(s) resolved",
                     user_id=current_user.user_id, request=request, commit=False)
    db.commit()
    return {"resolved": count}


@router.post("/{pet_id}/tag/scans/{scan_id}/resolve")
def resolve_one_scan(pet_id: int, scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pet = _load_pet(db, pet_id)
    _require_owner(current_user, pet)
    count = T.resolve_scans(db, pet, scan_id)
    db.commit()
    return {"resolved": count}


# ---- Phase 2: the public scan page ----------------------------------------------------------------------------------

class FoundReport(BaseModel):
    location_label: Optional[str] = Field(default=None, max_length=300)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    note: Optional[str] = Field(default=None, max_length=600)
    finder_phone: Optional[str] = Field(default=None, max_length=30)
    share_contact: bool = False
    photo_url: Optional[str] = Field(default=None, max_length=500)


@public_router.get("/{token}")
@limiter.limit("30/minute")
def public_tag(token: str, request: Request, db: Session = Depends(get_db), viewer: Optional[User] = Depends(get_optional_user)):
    tag, pet = T.tag_by_token(db, token)
    T.record_view(db, tag, pet, viewer)
    db.commit()
    return T.public_card(db, pet, viewer)


@public_router.post("/{token}/found")
@limiter.limit("3/hour")
def public_found(token: str, body: FoundReport, request: Request, db: Session = Depends(get_db),
                 viewer: Optional[User] = Depends(get_optional_user)):
    tag, pet = T.tag_by_token(db, token)
    T.record_found(db, tag, pet, viewer, location_label=body.location_label, latitude=body.latitude, longitude=body.longitude,
                   note=body.note, finder_phone=body.finder_phone, share_contact=body.share_contact, photo_url=body.photo_url)
    db.commit()
    return {"ok": True, "message": "The owner has been told. Thank you."}


# ---- Phase 3: the Leader's view (`leader_router`; its own prefix, because /pets/{pet_id} would catch /pets/<word>) --------
#   GET /pet-tags/active                    Leader, admin   ids of the pets in the Leader's subdivision that have an active tag
#   GET /pet-tags/alerts/{alert_id}/scans   Leader, admin   "tell the owner" messages filed under a lost-pet alert (no phone numbers)
leader_router = APIRouter(prefix="/pet-tags", tags=["Pet QR tags (Leader)"])


def _require_leader(user: User) -> None:
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only the subdivision Leader can see this.")


@leader_router.get("/active")
def tagged_pets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_leader(current_user)
    return {"pet_ids": T.leader_tagged_pet_ids(db, current_user)}


@leader_router.get("/alerts/{alert_id}/scans")
def alert_tag_scans(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.lost_pet_alert import LostPetAlert
    from app.services.lost_pet_lifecycle import is_leader_of

    _require_leader(current_user)
    alert = db.query(LostPetAlert).filter(LostPetAlert.alert_id == alert_id).first()
    if not alert or not is_leader_of(current_user, alert.subdivision_id):
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")
    return {"alert_id": alert_id, "found_reports": T.alert_scans(db, alert_id)}
