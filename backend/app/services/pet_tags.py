"""
Pet QR tags, owner side (Phase 1 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md).

- A tag is only for a registered pet that has an owner and is not archived, deceased, inactive or merged away.
- A pet has at most one active tag. Creating a tag while one is active replaces it: the old row becomes `replaced`
  and its token stops working at once. The pet row is locked while this happens, so two clicks cannot leave two
  active tags.
- The token is random (secrets.token_urlsafe(16), 22 characters) and never contains the pet id.
- The QR link is PUBLIC_TAG_BASE_URL (or else FRONTEND_URL) + "/t/<token>". Quick tunnels change address every run,
  so after changing the address in .env the owner simply re-prints the card: the token stays the same.
"""
import io
import os
import secrets
from datetime import datetime
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pet import Pet
from app.models.pet_tag import PetTag
from app.models.user import User

LOCAL_FALLBACK = "http://localhost:5173"
NOT_TAGGABLE_STATUSES = {"Archived", "Deceased", "Inactive"}


def public_base_url() -> Tuple[str, bool]:
    """(base url without trailing slash, whether it came from configuration rather than the localhost fallback)."""
    for name in ("PUBLIC_TAG_BASE_URL", "FRONTEND_URL"):
        value = (os.getenv(name) or "").strip().rstrip("/")
        if value:
            return value, True
    return LOCAL_FALLBACK, False


def tag_link(token: str) -> str:
    return f"{public_base_url()[0]}/t/{token}"


def new_token(db: Session) -> str:
    for _ in range(5):
        token = secrets.token_urlsafe(16)
        if not db.query(PetTag.tag_id).filter(PetTag.token == token).first():
            return token
    raise HTTPException(status_code=500, detail="Could not create a unique tag code. Please try again.")


def active_tag(db: Session, pet_id: int) -> Optional[PetTag]:
    return (
        db.query(PetTag)
        .filter(PetTag.pet_id == pet_id, PetTag.status == "active")
        .order_by(PetTag.tag_id.desc())
        .first()
    )


def is_owner(user: User, pet: Pet) -> bool:
    return user.role_id == 1 and pet.owner_id is not None and pet.owner_id == user.user_id


def require_taggable(pet: Pet) -> None:
    if pet.owner_id is None:
        raise HTTPException(status_code=409, detail="Only a registered pet with an owner can have a QR tag.")
    if pet.merged_into_pet_id or (pet.status or "") in NOT_TAGGABLE_STATUSES:
        raise HTTPException(status_code=409, detail="This pet record is not active, so it cannot have a QR tag.")


def ensure_active_tag(db: Session, pet: Pet, actor_id: Optional[int] = None) -> Optional[PetTag]:
    """
    Ensure the pet has its one permanent, unique QR tag.
    If a tag record already exists for this pet, always reuse it (reactivating if needed) instead of creating another.
    Does not commit.
    """
    if pet.owner_id is None or pet.merged_into_pet_id or (pet.status or "") in NOT_TAGGABLE_STATUSES:
        return None
    db.query(Pet).filter(Pet.pet_id == pet.pet_id).with_for_update().first()
    existing = db.query(PetTag).filter(PetTag.pet_id == pet.pet_id).order_by(PetTag.tag_id.asc()).first()
    if existing:
        if existing.status != "active":
            existing.status = "active"
            existing.disabled_at = None
            existing.disabled_by = None
            db.flush()
        return existing
    tag = PetTag(
        pet_id=pet.pet_id,
        token=new_token(db),
        status="active",
        created_by=actor_id or pet.owner_id,
    )
    db.add(tag)
    db.flush()
    return tag


def create_or_replace(db: Session, pet: Pet, actor: User) -> Tuple[PetTag, Optional[PetTag]]:
    """
    Idempotently return the pet's single permanent QR tag (or create it once if missing).
    Never replaces or invalidates an existing pet QR tag. Does not commit.
    """
    require_taggable(pet)
    tag = ensure_active_tag(db, pet, actor.user_id)
    if not tag:
        raise HTTPException(status_code=409, detail="This pet record cannot have a QR tag.")
    return tag, None


def disable(db: Session, pet: Pet, actor: User) -> Optional[PetTag]:
    """Pet QR tags are permanent and cannot be deactivated."""
    raise HTTPException(status_code=405, detail="Pet QR tags are permanent and cannot be turned off or replaced.")


def qr_png(data: str) -> bytes:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M

    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=12, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


# ---- Phase 2: the public scan page and "tell the owner" ------------------------------------------------------------
# What a stranger may see is an explicit allow-list (public_card): never the owner's name, address, phone or email, the
# home location, or the pet's medical notes. An unknown, replaced or disabled token, and a pet that is no longer active,
# all answer the same "no longer active", so a scan never reveals whether a pet exists.
import re  # noqa: E402
from datetime import timedelta  # noqa: E402

from app.models.pet_tag import PetTagScan  # noqa: E402
from app.models.user import Subdivision  # noqa: E402

NOT_ACTIVE = "This tag is no longer active."
FOUND_PER_TOKEN_PER_HOUR = 10       # across every visitor; each visitor is also limited to 3 per hour (routes/pet_tags.py)
SCAN_COOLDOWN_MINUTES = max(1, int(os.getenv("PET_TAG_SCAN_COOLDOWN_MINUTES", "60")))  # authoritative 1-hour cooldown per QR tag
COOLDOWN_MESSAGE = "QR Code Already Scanned. Please try again after the 1-hour cooldown period."
NOTE_MAX = 500
LABEL_MAX = 255
_PHONE_FIELD = re.compile(r"^(?:\+?63|0)9\d{9}$")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def enabled() -> bool:
    """ENABLE_PET_TAGS=false (or 0/no/off) switches the public pages off; they are on otherwise."""
    return (os.getenv("ENABLE_PET_TAGS") or "true").strip().lower() not in ("false", "0", "no", "off")


def tag_by_token(db: Session, token: str) -> Tuple[PetTag, Pet]:
    """The active tag and its pet, or 404 NOT_ACTIVE (unknown, replaced, disabled, or the pet is no longer active)."""
    if not enabled() or not token or len(token) > 32:
        raise HTTPException(status_code=404, detail=NOT_ACTIVE)
    tag = db.query(PetTag).filter(PetTag.token == token).first()
    if not tag or tag.status != "active":
        raise HTTPException(status_code=404, detail=NOT_ACTIVE)
    pet = db.query(Pet).filter(Pet.pet_id == tag.pet_id).first()
    if not pet or pet.owner_id is None or pet.merged_into_pet_id or (pet.status or "") in NOT_TAGGABLE_STATUSES:
        raise HTTPException(status_code=404, detail=NOT_ACTIVE)
    return tag, pet


def _subdivision_name(db: Session, pet: Pet) -> Optional[str]:
    owner = db.query(User).filter(User.user_id == pet.owner_id).first() if pet.owner_id else None
    if not owner or not owner.subdivision_id:
        return None
    sub = db.query(Subdivision).filter(Subdivision.subdivision_id == owner.subdivision_id).first()
    return sub.subdivision_name if sub else None


def viewer_kind(pet: Pet, viewer: Optional[User]) -> str:
    if viewer is None:
        return "guest"
    if pet.owner_id == viewer.user_id:
        return "owner"
    return "resident" if viewer.role_id == 1 else "guest"


def open_alert(db: Session, pet: Pet, statuses: Tuple[str, ...] = ("active",)):
    """The pet's newest lost-pet alert in one of these statuses, or None (Phase 3)."""
    from app.models.lost_pet_alert import LostPetAlert
    return (db.query(LostPetAlert)
            .filter(LostPetAlert.pet_id == pet.pet_id, LostPetAlert.alert_type == "lost_pet", LostPetAlert.status.in_(statuses))
            .order_by(LostPetAlert.alert_id.desc()).first())


def public_card(db: Session, pet: Pet, viewer: Optional[User]) -> dict:
    """
    The allow-list of what anyone who scans the tag sees. `alert_id` (Phase 3) is given only to a signed-in resident of
    the alert's subdivision (not the owner), while the pet's lost-pet alert is active: the same people who may already
    see that alert in Community and send "I saw this pet" or "I have it safely". Everyone else gets null.
    """
    kind = viewer_kind(pet, viewer)
    alert_id = None
    if kind == "resident" and viewer is not None:
        alert = open_alert(db, pet)
        if alert and viewer.subdivision_id and viewer.subdivision_id == alert.subdivision_id:
            alert_id = alert.alert_id
    return {
        "pet_name": pet.pet_name,
        "species": pet.pet_type,
        "breed": pet.breed or None,
        "photo_url": pet.photo_url or None,
        "subdivision_name": _subdivision_name(db, pet),
        "is_lost": (pet.status or "") == "Lost",
        "viewer": kind,
        "alert_id": alert_id,
    }


def cooldown_remaining_seconds(tag: Optional[PetTag], now: Optional[datetime] = None) -> int:
    """QR tag scans have no cooldown lockout."""
    return 0


def record_view(db: Session, tag: PetTag, pet: Pet, viewer: Optional[User], now: Optional[datetime] = None) -> Optional[PetTagScan]:
    """
    Record a QR code scan view (`kind="view"`) for non-owner scans without blocking repeated scans.
    Deduplicates view log rows per tag within 10 minutes while always keeping the scan page accessible.
    Does not commit.
    """
    if viewer_kind(pet, viewer) == "owner":
        return None
    current = now or datetime.utcnow()
    tag.last_scanned_at = current
    cutoff = current - timedelta(minutes=10)
    recent = (
        db.query(PetTagScan)
        .filter(PetTagScan.tag_id == tag.tag_id, PetTagScan.kind == "view", PetTagScan.created_at >= cutoff)
        .first()
    )
    if recent is not None:
        return recent
    scan = PetTagScan(
        tag_id=tag.tag_id,
        pet_id=pet.pet_id,
        kind="view",
        status="seen_by_owner",
        scanner_user_id=viewer.user_id if viewer else None,
        created_at=current,
    )
    db.add(scan)
    db.flush()
    return scan


def _clean(text: Optional[str], limit: int, one_line: bool) -> Optional[str]:
    if text is None:
        return None
    value = _CONTROL.sub(" ", str(text))
    value = " ".join(value.split()) if one_line else value.strip()
    if len(value) > limit:
        raise HTTPException(status_code=422, detail=f"Please keep it under {limit} characters.")
    return value or None


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    digits = re.sub(r"[\s\-()]", "", phone or "")
    if not digits:
        return None
    if not _PHONE_FIELD.match(digits):
        raise HTTPException(status_code=422, detail="Enter a Philippine mobile number, for example 09171234567.")
    return digits


def record_found(db: Session, tag: PetTag, pet: Pet, viewer: Optional[User], *, location_label: Optional[str],
                 latitude: Optional[float], longitude: Optional[float], note: Optional[str], finder_phone: Optional[str],
                 share_contact: bool, photo_url: Optional[str]) -> PetTagScan:
    """A "tell the owner" message. Validates, stores and notifies the owner (in the app and by push). Does not commit."""
    from app.utils.notification_dispatcher import dispatch_notification
    from app.utils.push_categories import contains_contact

    if viewer is not None and viewer.user_id == pet.owner_id:
        raise HTTPException(status_code=409, detail="This is your own pet's tag.")
    since = datetime.utcnow() - timedelta(hours=1)
    recent = db.query(PetTagScan).filter(PetTagScan.tag_id == tag.tag_id, PetTagScan.kind == "found_report",
                                         PetTagScan.created_at >= since).count()
    if recent >= FOUND_PER_TOKEN_PER_HOUR:
        raise HTTPException(status_code=429, detail="Many messages were sent about this pet in the last hour. Please try again later.")

    label = _clean(location_label, LABEL_MAX, one_line=True)
    text = _clean(note, NOTE_MAX, one_line=False)
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=422, detail="Send both latitude and longitude, or neither.")
    if latitude is not None and longitude is not None and not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="That location is not valid.")
    if not label and latitude is None:
        raise HTTPException(status_code=422, detail="Say where you found the pet, or share your location.")
    for part in (label, text):
        if part and contains_contact(part):
            raise HTTPException(status_code=422, detail="Please put a phone number only in the phone box (and tick “Share my number”), not in the text.")
    phone = normalize_phone(finder_phone) if share_contact else None
    if share_contact and not phone:
        raise HTTPException(status_code=422, detail="Enter your phone number, or untick “Share my number with the owner”.")
    if photo_url:
        if viewer is None:
            raise HTTPException(status_code=422, detail="Sign in to attach a photo.")
        from app.utils.uploads import validate_cloudinary_url
        validate_cloudinary_url(photo_url, allowed={"Image"})

    # Phase 3: while the pet has an open lost-pet alert (requested or active), the message is filed under it, so the Leader
    # sees it on that case. It is NOT turned into a sighting: sightings are shown to neighbours, a stranger's message is not.
    alert = open_alert(db, pet, ("requested", "active"))
    scan = PetTagScan(
        tag_id=tag.tag_id, pet_id=pet.pet_id, kind="found_report", scanner_user_id=viewer.user_id if viewer else None,
        latitude=latitude, longitude=longitude, location_label=label, note=text,
        finder_phone=phone, share_contact=bool(phone), photo_url=photo_url or None, status="new", created_at=datetime.utcnow(),
        alert_id=alert.alert_id if alert else None,
    )
    db.add(scan)
    db.flush()
    where = f" near {label}" if label else ""
    who = "A neighbour" if viewer is not None and viewer.role_id == 1 else "Someone"
    dispatch_notification(
        db, pet.owner_id, title=f"Someone found {pet.pet_name}",
        message=(f"{who} scanned {pet.pet_name}'s QR tag{where} and left you a message."
                 + (" They shared a phone number: open this notice to see it." if phone else " Open this notice to see it.")),
        notification_type="pet_tag_found", related_id=pet.pet_id,
    )
    return scan


def scan_card(scan: PetTagScan, show_phone: bool) -> dict:
    return {
        "scan_id": scan.scan_id,
        "status": scan.status,
        "created_at": scan.created_at,
        "location_label": scan.location_label,
        "latitude": float(scan.latitude) if scan.latitude is not None else None,
        "longitude": float(scan.longitude) if scan.longitude is not None else None,
        "note": scan.note,
        "photo_url": scan.photo_url,
        "from_signed_in_resident": scan.scanner_user_id is not None,
        "finder_phone": scan.finder_phone if show_phone else None,
        "phone_shared": bool(scan.finder_phone),
        "alert_id": scan.alert_id,
    }


def scan_history(db: Session, pet: Pet, viewer_is_owner: bool) -> dict:
    """The found reports (newest first) and a view summary. When the owner reads it, new reports become `seen_by_owner`. Does not commit."""
    reports = (db.query(PetTagScan).filter(PetTagScan.pet_id == pet.pet_id, PetTagScan.kind == "found_report")
               .order_by(PetTagScan.created_at.desc(), PetTagScan.scan_id.desc()).limit(100).all())
    cards = [scan_card(s, show_phone=viewer_is_owner) for s in reports]
    if viewer_is_owner:
        for s in reports:
            if s.status == "new":
                s.status = "seen_by_owner"
    views = db.query(PetTagScan).filter(PetTagScan.pet_id == pet.pet_id, PetTagScan.kind == "view")
    last = views.order_by(PetTagScan.created_at.desc()).first()
    return {"found_reports": cards, "views": {"count": views.count(), "last_at": last.created_at if last else None}}


def resolve_scans(db: Session, pet: Pet, scan_id: Optional[int] = None) -> int:
    """Mark one (or every open) found report resolved and clear the finder's phone number. Does not commit."""
    q = db.query(PetTagScan).filter(PetTagScan.pet_id == pet.pet_id, PetTagScan.kind == "found_report")
    q = q.filter(PetTagScan.scan_id == scan_id) if scan_id is not None else q.filter(PetTagScan.status != "resolved")
    rows = q.all()
    if scan_id is not None and not rows:
        raise HTTPException(status_code=404, detail="Message not found.")
    for s in rows:
        s.status = "resolved"
        s.finder_phone = None
    return len(rows)


# ---- Phase 3: the Leader's view ---------------------------------------------------------------------------------------

def leader_tagged_pet_ids(db: Session, leader: User) -> list:
    """Pets with an active tag whose owner lives in the Leader's subdivision (every subdivision for the system admin)."""
    q = db.query(PetTag.pet_id).join(Pet, Pet.pet_id == PetTag.pet_id).join(User, User.user_id == Pet.owner_id) \
        .filter(PetTag.status == "active")
    if leader.role_id != 4:
        q = q.filter(User.subdivision_id == leader.subdivision_id)
    return sorted({row[0] for row in q.all()})


def alert_scans(db: Session, alert_id: int) -> list:
    """The "tell the owner" messages filed under one lost-pet alert, newest first, without any phone number."""
    rows = (db.query(PetTagScan).filter(PetTagScan.alert_id == alert_id, PetTagScan.kind == "found_report")
            .order_by(PetTagScan.created_at.desc(), PetTagScan.scan_id.desc()).limit(100).all())
    return [scan_card(s, show_phone=False) for s in rows]


# ---- Phase 4: retention -----------------------------------------------------------------------------------------------
VIEW_RETENTION_DAYS = 90


def cleanup_scans(db: Session, now: Optional[datetime] = None) -> dict:
    """
    Page views older than VIEW_RETENTION_DAYS are deleted. "Tell the owner" messages are kept with the pet, but a phone
    number left on a resolved message is cleared (resolving already clears it; this is the safety net). Commits.
    """
    now = now or datetime.utcnow()
    cutoff = now - timedelta(days=VIEW_RETENTION_DAYS)
    views = (db.query(PetTagScan).filter(PetTagScan.kind == "view", PetTagScan.created_at < cutoff)
             .delete(synchronize_session=False))
    phones = (db.query(PetTagScan).filter(PetTagScan.kind == "found_report", PetTagScan.status == "resolved",
                                          PetTagScan.finder_phone.isnot(None))
              .update({PetTagScan.finder_phone: None}, synchronize_session=False))
    db.commit()
    return {"views_deleted": views, "phones_cleared": phones}


def run_cleanup() -> dict:
    """The scheduled job (tasks/unassigned_checker.py runs it at start-up and then once a day)."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        return cleanup_scans(db)
    finally:
        db.close()
