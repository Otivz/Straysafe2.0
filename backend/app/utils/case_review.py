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
# Endings with no animal to record (Rejected, closed rescue, Deceased, False Alarm, Cannot Be Found, folded back by undo)
NO_ANIMAL_ENDINGS = {3, 6, 12, 14, 17, 18}
ESCALATED_STATUS = 4


def barangay_handles_report(report: Report, db: Session) -> bool:
    if report.current_status_id in BARANGAY_HANDLED_STATUSES:
        return True
    return db.query(Rescue.rescue_id).filter(Rescue.report_id == report.report_id).first() is not None


def escalated_to_barangay(report: Report, db: Session) -> bool:
    """
    The case reached the Barangay at some point: it is being handled there now, or it was escalated / endorsed / given a
    rescue before (so a resolved case the Barangay handled stays in the Barangay's records). Judged on the case's root.
    """
    from app.models.report import EndorsementLetter, StatusHistory
    root = report
    seen = set()
    while root is not None and root.duplicate_of_report_id and root.report_id not in seen:
        seen.add(root.report_id)
        nxt = db.get(Report, root.duplicate_of_report_id)
        if nxt is None:
            break
        root = nxt
    if barangay_handles_report(root, db):
        return True
    if db.query(EndorsementLetter.report_id).filter(EndorsementLetter.report_id == root.report_id).first() is not None:
        return True
    return db.query(StatusHistory.history_id).filter(
        StatusHistory.report_id == root.report_id, StatusHistory.report_status_id.in_((4, 13))).first() is not None


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


def _own_animal_record(report: Report, db: Session) -> bool:
    if report.pet_id is not None:
        return True
    return db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == report.report_id).first() is not None


def _group_animals_missing_record(report: Report, db: Session) -> Optional[list]:
    """For a group report (multi-animal split): its animal records still without a record. None for any other report."""
    from app.utils.report_split import active_children
    kids = active_children(db, report)
    if not kids:
        return None
    return [k for k in kids if k.current_status_id not in NO_ANIMAL_ENDINGS and not _own_animal_record(k, db)]


def report_has_animal_record(report: Report, db: Session) -> bool:
    if _own_animal_record(report, db):
        return True
    missing = _group_animals_missing_record(report, db)
    return missing is not None and not missing


def require_animal_record(report: Report, db: Session, action: str) -> None:
    """Block escalating/resolving a report whose animal isn't in Pet Records or Holding records yet."""
    if report_has_animal_record(report, db):
        return
    missing = _group_animals_missing_record(report, db)
    if missing:
        ids = ", ".join(f"#{k.report_id}" for k in missing)
        raise HTTPException(
            status_code=400,
            detail=f"Add an animal record for each animal first: {len(missing)} animal record"
                   f"{'s' if len(missing) != 1 else ''} of this group ({ids}) "
                   f"{'are' if len(missing) != 1 else 'is'} not yet in Pet Records or Holding, so the report can't be {action}. "
                   "Open each animal's record and use \"Add Record for this Animal\".",
        )
    animal = (report.animal_type or getattr(report, "ai_animal_type", "") or "").strip().capitalize()
    noun = animal if animal in ("Dog", "Cat") else "animal"
    raise HTTPException(
        status_code=400,
        detail=f"Add an animal record first: this {noun} is not yet in the Pet Records, so the report can't be {action}. "
               "Open the report and use \"Add Animal Record\" (or link an existing record), then try again.",
    )
