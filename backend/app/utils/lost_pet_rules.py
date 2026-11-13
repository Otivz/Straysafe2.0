"""
Registration-first Lost Pet reports (approved 2026-11-11).

A Lost Pet report is only for a resident's OWN missing pet, and the pet must be registered under that resident's account.
Registration is not ownership verification: nothing here asks a Leader to approve or verify anything before a report is
filed. The four things stay separate: registering a pet, verifying ownership, filing the lost report, and approving the
public notice.

Every route that can create, convert, reopen, archive or merge around a lost report calls this module, so the rule cannot
be skipped by choosing another route:
  * which pet is valid for a lost report (the resident's own account, an active record);
  * at most ONE active lost report per pet, also when two requests arrive together (the pet row is locked) and when a
    closed one is reopened;
  * the snapshot of the pet as it was when the report was filed. It is built here, from the pet record, and never from
    what the browser sent, so the Leader can compare "as reported" with the registry as it is now.

"Active" is decided by case_state.is_closed (the one definition of a closed case); the pet's own status ("Lost") is not
used for it, because that flag is not reset by every way a lost case can end.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pet import Pet
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.utils import case_state
from app.utils import case_vocab as V

REGISTER_FIRST = "Register your pet first to report it missing."
INACTIVE_PET_STATUSES = ("Deceased", "Archived", "Inactive")
SNAPSHOT_VERSION = 1
MAX_FUTURE = timedelta(minutes=5)          # clock skew allowed on a typed last-seen time

# What a resident cannot set on a report they file: the report-side verification flags are decided by the Leader.
RESIDENT_IGNORED_REPORT_FIELDS = ("verified_actual_bite", "verified_chasing", "verified_attempted_bite", "verified_injury",
                                  "verified_aggressive", "behavior_finding")


# ------------------------------------------------------------------------------------------------------- what is a lost report
def category_names(db: Session) -> Dict[int, str]:
    return {c.category_id: c.category_name for c in db.query(ReportCategory).all()}


def is_lost_category(names: Dict[int, str], category_id: Optional[int]) -> bool:
    return V.category_family(names.get(category_id)) == V.LOST_PET


def is_lost_report(report: Report, names: Dict[int, str]) -> bool:
    """A Lost Pet report: the Lost Pet category, or an older one that carries the lost-pet marker in its description."""
    return is_lost_category(names, report.category_id) or V.LOST_PET_MARKER in (report.description or "")


def pet_is_active_record(pet: Optional[Pet]) -> bool:
    return pet is not None and (pet.status or "Active") not in INACTIVE_PET_STATUSES and pet.merged_into_pet_id is None


def refuse_marker(text: Optional[str]) -> None:
    """The older lost-pet marker makes a report count as a lost-pet report. A resident cannot write it into a description."""
    if text and V.LOST_PET_MARKER.lower() in text.lower():
        raise HTTPException(status_code=400, detail="That text is reserved by the system. Please word the description differently.")


# ------------------------------------------------------------------------------------------------ one active report per pet
def lock_pet(db: Session, pet_id: int) -> Optional[Pet]:
    """
    A locking read of the pet row. On MySQL a second request for the same pet waits here until the first one has committed
    (the first request's report is then visible to the check below); SQLite ignores FOR UPDATE.
    """
    return db.query(Pet).filter(Pet.pet_id == pet_id).with_for_update().first()


def active_lost_reports(db: Session, pet_id: int, exclude_report_id: Optional[int] = None, lock: bool = False) -> List[Report]:
    """
    The pet's lost reports that are still open. `lock` makes the read a locking read: under MySQL's default isolation level
    a plain read would still show the data as it was when the transaction began, and miss a report committed since.
    """
    q = db.query(Report).filter(Report.pet_id == pet_id)
    if exclude_report_id is not None:
        q = q.filter(Report.report_id != exclude_report_id)
    if lock:
        q = q.with_for_update()
    names = category_names(db)
    return [r for r in q.all() if is_lost_report(r, names) and not case_state.is_closed(r) and r.duplicate_of_report_id is None]


def refuse_if_active_report(db: Session, pet: Pet, *, exclude_report_id: Optional[int] = None, lock: bool = True,
                            message: Optional[str] = None) -> None:
    """409 with the existing report's number, so the screen can link to it."""
    existing = active_lost_reports(db, pet.pet_id, exclude_report_id, lock)
    if existing:
        first = min(existing, key=lambda r: r.report_id)
        raise HTTPException(status_code=409, detail={
            "code": "LOST_REPORT_EXISTS", "report_id": first.report_id,
            "message": message or f"{pet.display_name} already has an active lost-pet report. Open it instead of starting another."})


def require_own_pet_for_lost_report(db: Session, user: User, pet_id: Optional[int]) -> Pet:
    """The pet a new Lost Pet report is about: the signed-in resident's own, active, registered pet. Locks the pet row."""
    if user.role_id != 1:
        raise HTTPException(status_code=403, detail="A Lost Pet report is filed by the resident whose pet is missing.")
    if not pet_id:
        raise HTTPException(status_code=422, detail=REGISTER_FIRST)
    pet = lock_pet(db, pet_id)
    if pet is None or pet.owner_id != user.user_id:
        raise HTTPException(status_code=404, detail="That pet is not one of your registered pets.")
    if not pet_is_active_record(pet):
        raise HTTPException(status_code=409, detail="This pet's record is no longer active, so it can't be reported missing. Register your pet again, or ask your subdivision office.")
    return pet


def refuse_category_change(db: Session, report: Report, new_category_id: Optional[int]) -> None:
    """A report cannot become a Lost Pet report, or stop being one, by being re-categorised (that would skip the rules above)."""
    names = category_names(db)
    if is_lost_report(report, names) != is_lost_category(names, new_category_id):
        raise HTTPException(status_code=409, detail="A Lost Pet report can't be changed into another kind of report, and no other report can be changed into one. File a new report instead.")


def require_alert_eligible(db: Session, report: Report, requester: User, by_leader: bool) -> None:
    """
    Who may ask for a lost-pet notice: the report must be a Lost Pet report (the category, not a text marker). A resident asks
    for it with their own registered pet. A Leader may prepare one for an older report or a split case that has no pet link.
    """
    names = category_names(db)
    if not is_lost_category(names, report.category_id):
        raise HTTPException(status_code=409, detail="Neighborhood alerts are for Lost Pet Reports only.")
    if report.pet_id is None:
        if by_leader:
            return
        raise HTTPException(status_code=409, detail=REGISTER_FIRST)
    pet = db.get(Pet, report.pet_id)
    if pet is None:
        raise HTTPException(status_code=409, detail="The pet linked to this report is no longer in the registry.")
    if not by_leader:
        if pet.owner_id != requester.user_id:
            raise HTTPException(status_code=403, detail="Only the pet's registered owner can ask for this notice.")
        if not pet_is_active_record(pet):
            raise HTTPException(status_code=409, detail="This pet's record is no longer active, so a notice can't be requested for it.")


def refuse_reopen_if_other_active(db: Session, report: Report) -> None:
    """Reopening a closed lost report must not leave the pet with two active ones."""
    if report.pet_id is None or not is_lost_report(report, category_names(db)):
        return
    pet = lock_pet(db, report.pet_id)
    if pet is None:
        return
    refuse_if_active_report(db, pet, exclude_report_id=report.report_id, lock=True, message=(
        f"{pet.display_name} already has another active lost-pet report. Close or merge it before reopening this one."))


def refuse_archive_while_missing(db: Session, pet: Pet, what: str = "removed") -> None:
    """A pet with an active lost report is not removed, archived, merged away or deleted until that report is closed."""
    locked = lock_pet(db, pet.pet_id) or pet
    refuse_if_active_report(db, locked, lock=True, message=(
        f"{locked.display_name} has an active lost-pet report, so the record can't be {what} yet. "
        "Close the report first (for example when the pet is home)."))


# ------------------------------------------------------------------------------------------------------------ the snapshot
def _clean(value: Any) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def pet_facts(pet: Pet) -> Dict[str, Any]:
    """The facts of a pet record that identify it, as plain JSON. The snapshot freezes this; the Leader screen compares it."""
    user_color = _clean(pet.color_markings)
    fallback_colors = [c for c in (_clean(pet.primary_color), _clean(pet.secondary_color), _clean(pet.tertiary_color)) if c]
    color_str = user_color or (", ".join(dict.fromkeys(fallback_colors)) if fallback_colors else None)
    age = _clean(pet.estimated_age) or (f"Born {pet.birth_date.isoformat()}" if pet.birth_date else None)
    owner = pet.owner
    return {
        "pet_id": pet.pet_id, "reference_code": pet.reference_code, "name": pet.pet_name,
        "species": pet.pet_type, "breed": _clean(pet.breed), "sex": pet.gender or "Unknown",
        "color": color_str, "markings": _clean(pet.distinctive_markings), "age": age,
        "photos": [u for u in (pet.photo_url, pet.photo_front_url, pet.photo_left_url, pet.photo_right_url) if u],
        "registered_at": pet.created_at.isoformat() if pet.created_at else None,
        "registered_by_user_id": pet.registered_by_user_id, "registered_by_name": pet.registered_by_name,
        "declared_by_owner": bool(pet.owner_id and pet.registered_by_user_id == pet.owner_id),
        "owner_id": pet.owner_id, "owner_name": owner.name if owner is not None else None,
    }


def report_columns_from_pet(pet: Pet) -> Dict[str, Any]:
    """What the report itself says about the animal: taken from the pet record, whatever the browser sent."""
    facts = pet_facts(pet)
    return {"pet_id": pet.pet_id, "animal_type": pet.pet_type if pet.pet_type in ("Dog", "Cat") else "Unknown",
            "animal_breed": facts["breed"], "animal_color": (facts["color"] or "")[:255] or None, "estimated_size": None,
            "animal_count": 1, "is_possible_owned": False, "custody_status": "Sighting"}


def clean_last_seen(value: Optional[datetime]) -> Optional[datetime]:
    """The time the resident says they last saw the pet (their local time). Not in the future."""
    if value is None:
        return None
    naive = value.replace(tzinfo=None)
    local_now = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)
    if naive > local_now + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The last-seen time can't be in the future.")
    return naive


def build_snapshot(db: Session, pet: Pet, report: Report, last_seen_at: Optional[datetime]) -> Dict[str, Any]:
    """The pet as it was when the report was filed, and the last-seen details. Stored once, never rewritten."""
    from app.utils.db_clock import db_now
    return {
        "version": SNAPSHOT_VERSION, "taken_at": db_now(db).isoformat(),
        "pet": pet_facts(pet),
        "last_seen": {"at": last_seen_at.isoformat() if last_seen_at else None, "location": _clean(report.landmark),
                      "latitude": float(report.latitude) if report.latitude is not None else None,
                      "longitude": float(report.longitude) if report.longitude is not None else None},
    }


COMPARED_FACTS = (("name", "name"), ("species", "kind of animal"), ("breed", "breed"), ("sex", "sex"), ("color", "colour"),
                  ("markings", "markings"), ("age", "age"), ("photos", "photos"))


def changed_since(snapshot_pet: Optional[Dict[str, Any]], current: Dict[str, Any]) -> List[str]:
    """Which identifying facts of the registry record differ from what was frozen at filing (in a resident's words)."""
    if not snapshot_pet:
        return []
    return [label for key, label in COMPARED_FACTS if (snapshot_pet.get(key) or None) != (current.get(key) or None)]
