"""
Is this pet record's animal in the adoption process? (pet -> its report(s) -> holding animal -> adoption)

  adopted       an approved adoption whose two-way handover is done: the adopter owns the animal
  in_progress   an application is approved; the handover is pending
  applications  in the adoption catalog with pending applications (nobody approved yet)

While an adoption is approved or done, ownership is decided by the adoption: staff can't assign an owner through Pet
Records (that would give the same animal to two people).
"""
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from app.models.report import Adoption, HoldingAnimal, Report

BLOCKING_STATES = ("adopted", "in_progress")


def owned_through_later_adoption(db: Session, pet_id: Optional[int], user_id: int, since) -> bool:
    """
    Does user_id own this pet only because they adopted it after `since` (e.g. when a report was filed)?
    Finishing an adoption merges the animal's community record into the adopter's new pet, so the old stray report
    and its look-alike suggestions point to the adopter's pet. That ownership must not open what happened before
    the animal was theirs: the reporter's private conversation, match chats, or actions on the old case. A report
    filed after the adoption (the adopted pet goes missing later) is the adopter's own business and is not affected.
    """
    from app.models.pet import Pet
    if not pet_id:
        return False
    if not db.query(Adoption.adoption_id).filter(Adoption.created_pet_id == pet_id, Adoption.applicant_id == user_id).first():
        return False
    owner_since = db.query(Pet.created_at).filter(Pet.pet_id == pet_id).scalar()
    if since is None or owner_since is None:
        return True  # can't tell when: don't open the older case
    return since < owner_since


def adoption_info_for_pets(db: Session, pet_ids: Iterable[int]) -> Dict[int, dict]:
    pet_ids = {p for p in pet_ids if p}
    if not pet_ids:
        return {}
    rows = db.query(Report.report_id, Report.duplicate_of_report_id, Report.pet_id).filter(Report.pet_id.in_(pet_ids)).all()
    report_pet: Dict[int, int] = {}
    for rid, parent, pid in rows:
        report_pet[rid] = pid
        if parent:
            report_pet.setdefault(parent, pid)  # the animal may be held under the main case
    if not report_pet:
        return {}
    holdings = db.query(HoldingAnimal.holding_id, HoldingAnimal.report_id).filter(HoldingAnimal.report_id.in_(report_pet)).all()
    holding_pet = {hid: report_pet[rid] for hid, rid in holdings}
    if not holding_pet:
        return {}
    apps = db.query(Adoption).filter(Adoption.holding_id.in_(holding_pet), Adoption.status.in_(("Approved", "Pending"))).all()
    out: Dict[int, dict] = {}
    rank = {"adopted": 3, "in_progress": 2, "applications": 1}
    for a in apps:
        pid = holding_pet[a.holding_id]
        if a.status == "Approved":
            state = "adopted" if (a.is_handed_over and a.staff_handed_over) else "in_progress"
            info = {"state": state, "adoption_id": a.adoption_id, "adopter_name": a.full_name, "stage": a.current_stage,
                    "pending_applications": 0}
        else:
            prev = out.get(pid)
            if prev and prev["state"] != "applications":
                continue
            count = (prev["pending_applications"] if prev else 0) + 1
            info = {"state": "applications", "adoption_id": None, "adopter_name": None, "stage": None,
                    "pending_applications": count}
        prev = out.get(pid)
        if prev is None or rank[info["state"]] >= rank[prev["state"]]:
            if prev and info["state"] == "applications":
                info["pending_applications"] = max(info["pending_applications"], prev.get("pending_applications", 0))
            out[pid] = info
    return out


def attach_adoption_info(db: Session, pets) -> None:
    """Set pet.adoption_info (read by PetResponse) on each loaded pet."""
    pets = [p for p in (pets if isinstance(pets, (list, tuple)) else [pets]) if p is not None]
    info = adoption_info_for_pets(db, [p.pet_id for p in pets])
    for p in pets:
        p.adoption_info = info.get(p.pet_id)


def ownership_blocked_by_adoption(db: Session, pet_id: int) -> Optional[str]:
    """The reason an owner can't be assigned right now, or None."""
    info = adoption_info_for_pets(db, [pet_id]).get(pet_id)
    if not info or info["state"] not in BLOCKING_STATES:
        return None
    if info["state"] == "adopted":
        return (f"This animal was adopted by {info['adopter_name']} (Adoption #{info['adoption_id']}). "
                f"The adopter is its owner now, so another owner can't be assigned here.")
    return (f"This animal is in the adoption process: {info['adopter_name']}'s application (Adoption "
            f"#{info['adoption_id']}) is approved and the handover is pending, so an owner can't be assigned here. "
            f"If someone else really owns it, cancel or reject that adoption first.")
