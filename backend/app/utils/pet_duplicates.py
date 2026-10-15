"""
One record per pet when an owner without an account signs up (PET_RECORD_DUPLICATE_PREVENTION_PLAN.md). No AI:
every match is an exact comparison, and a person confirms it.

- existing_pets_for_resident(): pets a leader registered for this resident before they had an account (no account
  owner, the saved owner number equals the resident's account number, same pet type). Offered at registration.
- possible_duplicate_pairs(): pairs of active records of the same pet type with the same owner phone (one record
  with an account owner, one without), or the same owner name and the same pet name. Shown to staff, who merge them
  or mark them as different pets.
"""
import re
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.pet import Pet
from app.models.user import User
from app.utils.phone import normalize_ph_phone

DISMISS_ACTION = "DISMISS_PET_DUPLICATE"
_SPACES = re.compile(r"\s+")
_NO_NAME = {"", "no name", "unknown", "unnamed", "none", "n/a"}


def norm_phone(v: Optional[str]) -> Optional[str]:
    try:
        return normalize_ph_phone(v, required=False, mobile_only=False)
    except ValueError:
        return None


def norm_text(v: Optional[str]) -> str:
    return _SPACES.sub(" ", (v or "").strip().lower())


def is_active(pet: Pet) -> bool:
    return not pet.merged_into_pet_id and (pet.status or "") not in ("Archived", "Deceased")


def _owners(db: Session, pets: Iterable[Pet]) -> Dict[int, User]:
    ids = {p.owner_id for p in pets if p.owner_id}
    return {u.user_id: u for u in db.query(User).filter(User.user_id.in_(ids)).all()} if ids else {}


def owner_phone(pet: Pet, owners: Dict[int, User]) -> Optional[str]:
    if pet.owner_id:
        u = owners.get(pet.owner_id)
        return norm_phone(u.phone) if u else None
    return norm_phone(pet.emergency_contact_phone)


def owner_name(pet: Pet, owners: Dict[int, User]) -> str:
    if pet.owner_id:
        u = owners.get(pet.owner_id)
        return norm_text(u.name) if u else ""
    return norm_text(pet.emergency_contact_name)


def summary(pet: Pet, owners: Dict[int, User]) -> dict:
    """What staff see of a record in a pair (no more than Pet Records already shows them)."""
    u = owners.get(pet.owner_id) if pet.owner_id else None
    return {
        "pet_id": pet.pet_id, "pet_name": pet.pet_name, "pet_type": pet.pet_type, "breed": pet.breed,
        "primary_color": pet.primary_color, "photo_url": pet.photo_url, "status": pet.status,
        "created_at": pet.created_at.isoformat() if getattr(pet, "created_at", None) else None,
        "has_account_owner": bool(pet.owner_id),
        "owner_name": (u.name if u else None) if pet.owner_id else pet.emergency_contact_name,
        "owner_phone": (u.phone if u else None) if pet.owner_id else pet.emergency_contact_phone,
    }


def existing_pets_for_resident(db: Session, resident: User, pet_type: Optional[str]) -> List[Pet]:
    """Records held for this resident by staff before they had an account (exact number + pet type)."""
    phone = norm_phone(resident.phone)
    if not phone or not pet_type:
        return []
    rows = db.query(Pet).filter(Pet.owner_id.is_(None), Pet.emergency_contact_phone.isnot(None)).all()
    return [p for p in rows if is_active(p) and norm_text(p.pet_type) == norm_text(pet_type)
            and norm_phone(p.emergency_contact_phone) == phone]


def _pair_key(a: int, b: int) -> Tuple[int, int]:
    return (a, b) if a < b else (b, a)


def dismissed_pairs(db: Session) -> set:
    out = set()
    for log in db.query(AuditLog).filter(AuditLog.action == DISMISS_ACTION).all():
        other = (log.new_values or {}).get("other_pet_id")
        if log.target_id and other:
            out.add(_pair_key(int(log.target_id), int(other)))
    return out


def record_not_same_pet(db: Session, pet_a: int, pet_b: int, actor: User, reason: str, req=None) -> None:
    """Remember that these two records are different pets, so the pair is not flagged again. No commit."""
    from app.utils.audit import log_activity
    a, b = _pair_key(pet_a, pet_b)
    log_activity(db=db, action=DISMISS_ACTION, target_table="pets", target_id=a,
                 description=f"Pet #{a} and Pet #{b} marked as different pets by {actor.name}: {reason}",
                 user_id=actor.user_id, log_type="operation", new_values={"other_pet_id": b, "reason": reason},
                 request=req, commit=False)


def possible_duplicate_pairs(db: Session) -> List[dict]:
    pets = [p for p in db.query(Pet).all() if is_active(p)]
    owners = _owners(db, pets)
    skip = dismissed_pairs(db)
    by_phone: Dict[Tuple[str, str], List[Pet]] = {}
    by_names: Dict[Tuple[str, str, str], List[Pet]] = {}
    for p in pets:
        kind = norm_text(p.pet_type)
        ph = owner_phone(p, owners)
        if ph:
            by_phone.setdefault((kind, ph), []).append(p)
        on, pn = owner_name(p, owners), norm_text(p.pet_name)
        if on and pn not in _NO_NAME:
            by_names.setdefault((kind, on, pn), []).append(p)

    pairs: Dict[Tuple[int, int], dict] = {}

    def add(a: Pet, b: Pet, why: str):
        key = _pair_key(a.pet_id, b.pet_id)
        if key in skip:
            return
        row = pairs.setdefault(key, {"pets": (a, b), "reasons": []})
        if why not in row["reasons"]:
            row["reasons"].append(why)

    for group in by_phone.values():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if bool(a.owner_id) != bool(b.owner_id):   # one record with an account owner, one without
                    add(a, b, "Same owner phone number")
    for group in by_names.values():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a.owner_id and b.owner_id and a.owner_id == b.owner_id:
                    continue  # the same account's two pets with one name: the registration check already handles it
                add(a, b, "Same owner name and pet name")

    out = []
    for (x, y), row in sorted(pairs.items()):
        a, b = row["pets"]
        # keep the record with an account owner; otherwise the older one
        keep = a if (a.owner_id and not b.owner_id) else b if (b.owner_id and not a.owner_id) else (a if a.pet_id < b.pet_id else b)
        waiting = pending_request_for_pair(db, a.pet_id, b.pet_id)
        out.append({"pets": [summary(a, owners), summary(b, owners)], "reasons": row["reasons"], "suggested_keep_pet_id": keep.pet_id,
                    "owner_asked": bool(waiting), "merge_request_id": waiting.log_id if waiting else None})
    return out


# --- Merging into a pet on a resident's account: the owner agrees first ------------------------------------------
# Leaders can't change a resident's pet on their own, so a flagged pair whose kept record has an account owner is
# merged only after that owner accepts. The request and the answer are audit-log entries (no extra table).
MERGE_REQUEST_ACTION = "PET_MERGE_REQUEST"
MERGE_RESPONSE_ACTION = "PET_MERGE_RESPONSE"


def merge_requests(db: Session, pending_only: bool = True) -> List[AuditLog]:
    reqs = db.query(AuditLog).filter(AuditLog.action == MERGE_REQUEST_ACTION).order_by(AuditLog.log_id).all()
    if not pending_only:
        return reqs
    answered = {int((r.new_values or {}).get("request_id") or 0)
                for r in db.query(AuditLog).filter(AuditLog.action == MERGE_RESPONSE_ACTION).all()}
    return [r for r in reqs if r.log_id not in answered]


def pending_request_for_pair(db: Session, a: int, b: int) -> Optional[AuditLog]:
    key = _pair_key(a, b)
    for r in merge_requests(db):
        v = r.new_values or {}
        if _pair_key(int(v.get("dup_pet_id") or 0), int(v.get("keep_pet_id") or 0)) == key:
            return r
    return None


# --- Finding the record to merge with (Pet Records "Merge duplicate record") ------------------------------------
def merge_candidates(db: Session, pet: Pet, q: Optional[str] = None, limit: int = 30) -> List[dict]:
    """
    Other active records of the same kind of animal, most alike first. "Alike" is a count of exact facts both share
    (owner phone, owner name, pet name, breed, main colour), never a guess. `q` narrows by pet name, owner name, breed
    or Pet ID. Callers filter by what the staff member may see.
    """
    pets = [p for p in db.query(Pet).filter(Pet.pet_id != pet.pet_id).all()
            if is_active(p) and norm_text(p.pet_type) == norm_text(pet.pet_type)]
    owners = _owners(db, pets + [pet])
    me_phone, me_owner = owner_phone(pet, owners), owner_name(pet, owners)
    me_name, me_breed, me_color = norm_text(pet.pet_name), norm_text(pet.breed), norm_text(pet.primary_color)
    needle = norm_text(q)
    out = []
    for p in pets:
        card = summary(p, owners)
        if needle and not (needle in norm_text(p.pet_name) or needle in norm_text(card["owner_name"]) or needle in norm_text(p.breed)
                           or needle.lstrip("#") == str(p.pet_id)):
            continue
        facts = []
        if me_phone and owner_phone(p, owners) == me_phone:
            facts.append("Same owner phone")
        if me_owner and owner_name(p, owners) == me_owner:
            facts.append("Same owner name")
        if me_name and me_name not in _NO_NAME and norm_text(p.pet_name) == me_name:
            facts.append("Same pet name")
        if me_breed and norm_text(p.breed) == me_breed:
            facts.append("Same breed")
        if me_color and norm_text(p.primary_color) == me_color:
            facts.append("Same main colour")
        if not needle and not facts:
            continue  # without a search, only records that share at least one fact
        # one record can't take another owner's pet: different account owners can't be merged
        blocked = "These records have different owners." if (pet.owner_id and p.owner_id and pet.owner_id != p.owner_id) else None
        out.append({**card, "same_facts": facts, "blocked_reason": blocked,
                    "_score": (len(facts), "Same owner phone" in facts, -p.pet_id)})
    out.sort(key=lambda r: r["_score"], reverse=True)
    for r in out:
        r.pop("_score", None)
    return out[:limit]


# Asking the owner again: one request per pair; after it, a reminder at most every REMIND_GAP_MINUTES. Times are the
# server's own clock, stored with the request / reminder (the database clock may be in another time zone).
REMIND_ACTION = "PET_MERGE_REMINDER"
REMIND_GAP_MINUTES = 5


def _stamp(log) -> Optional["datetime"]:
    from datetime import datetime
    v = (log.new_values or {}).get("at") or (log.new_values or {}).get("asked_at")
    try:
        return datetime.fromisoformat(v) if v else None
    except ValueError:
        return None


def ask_status(db: Session, request_log) -> dict:
    """When the owner was asked, last reminded, and when the next reminder is allowed."""
    from datetime import datetime, timedelta
    reminders = [r for r in db.query(AuditLog).filter(AuditLog.action == REMIND_ACTION).all()
                 if int((r.new_values or {}).get("request_id") or 0) == request_log.log_id]
    asked_at = _stamp(request_log) or getattr(request_log, "created_at", None)   # older requests: the log's own time
    last =max([t for t in [asked_at] + [_stamp(r) for r in reminders] if t] or [None]) if (asked_at or reminders) else None
    next_at = (last + timedelta(minutes=REMIND_GAP_MINUTES)) if last else None
    now = datetime.now()
    return {
        "request_id": request_log.log_id,
        "asked_at": asked_at.isoformat() if asked_at else None,
        "last_contact_at": last.isoformat() if last else None,
        "reminders_sent": len(reminders),
        "can_remind": next_at is None or now >= next_at,
        "seconds_until_remind": max(0, int((next_at - now).total_seconds())) if next_at else 0,
    }
