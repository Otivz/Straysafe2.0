"""
Who reviews a report, and when an animal record is required.

- Subdivision Leaders own the review work (duplicates, potential matches, animal records).
- Barangay Staff only monitor, except for a case the Barangay is already handling (escalated / rescue under way)
  or a subdivision that has no active leader to do it.
- A report can't be escalated to the Barangay or resolved until the animal has a record.
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.report import HoldingAnimal, Report, Rescue
from app.models.user import User

# Statuses where the case is in the Barangay's hands
BARANGAY_HANDLED_STATUSES = {4, 5, 6, 7, 8, 13}
# Outcomes that need the animal on record (Claimed by Owner, Released, Incident Resolved)
RESOLVED_WITH_ANIMAL_STATUSES = {9, 10, 11}
ESCALATED_STATUS = 4


def barangay_handles_report(report: Report, db: Session) -> bool:
    if report.current_status_id in BARANGAY_HANDLED_STATUSES:
        return True
    return db.query(Rescue.rescue_id).filter(Rescue.report_id == report.report_id).first() is not None


def subdivision_has_active_leader(subdivision_id: Optional[int], db: Session) -> bool:
    if not subdivision_id:
        return False
    return db.query(User.user_id).filter(
        User.role_id == 2,
        User.subdivision_id == subdivision_id,
        User.status == "Active",
    ).first() is not None


def review_permission(user: User, report: Report, db: Session) -> tuple[bool, str]:
    """Whether `user` may merge duplicates, decide potential matches or add/link an animal record for `report`."""
    if user.role_id in (2, 4):
        return True, ""
    if user.role_id == 3:
        if barangay_handles_report(report, db):
            return True, ""
        if not subdivision_has_active_leader(report.subdivision_id, db):
            return True, ""
        return False, (
            "The Subdivision Leader handles duplicates, potential matches and animal records for this report. "
            "The Barangay can act once the case is escalated to it."
        )
    return False, "Only staff can review reports."


def is_cross_subdivision(reports) -> bool:
    """Reports from more than one subdivision (e.g. a duplicate pair across a subdivision border)."""
    return len({r.subdivision_id for r in reports if r is not None and r.subdivision_id}) > 1


CROSS_SUBDIVISION_NOTE = ("These reports are in different subdivisions, so the Barangay reviews this pair. "
                          "Barangay staff can decide or merge it.")


def require_cross_subdivision_reviewer(user: User, reports) -> None:
    """A duplicate pair across subdivisions is decided by the Barangay (or an Admin), not by one subdivision's leader."""
    if is_cross_subdivision(reports) and user.role_id not in (3, 4):
        raise HTTPException(status_code=403, detail=CROSS_SUBDIVISION_NOTE)


def require_review_permission(user: User, report: Report, db: Session) -> None:
    allowed, reason = review_permission(user, report, db)
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)


def report_has_animal_record(report: Report, db: Session) -> bool:
    if report.pet_id is not None:
        return True
    return db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == report.report_id).first() is not None


def require_animal_record(report: Report, db: Session, action: str) -> None:
    """Block escalating/resolving a report whose animal isn't in Pet Records or Holding records yet."""
    if report_has_animal_record(report, db):
        return
    animal = (report.animal_type or getattr(report, "ai_animal_type", "") or "").strip().capitalize()
    noun = animal if animal in ("Dog", "Cat") else "animal"
    raise HTTPException(
        status_code=400,
        detail=f"Add an animal record first: this {noun} is not yet in the Pet Records, so the report can't be {action}. "
               "Open the report and use \"Add Animal Record\" (or link an existing record), then try again.",
    )
