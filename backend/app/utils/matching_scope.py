"""
Manual Matching data scope (docs/01-system/MANUAL_REPORT_MATCHING.md, "Data scope").

Barangay Staff (role 3) match only Barangay-managed records:
  Reports   - cases the Barangay manages (handled / rescued / endorsed / escalated / holding intake, judged on the case
              and its merged reports), plus Lost Pet reports the owner published (publicly visible). Internal,
              unendorsed subdivision reports stay with the Subdivision.
  Pets      - pets of owners who live in the barangay outside a subdivision, pets registered by the barangay's staff,
              and pets tied to a Barangay-managed case (the case's linked pet or a claim on it). The private
              subdivision pet registry is never searched.
Subdivision Leaders (role 2): reports in their subdivision (unchanged); pets whose owner lives in their subdivision, and
              ownerless (community) pets registered by someone from their subdivision.
Admins (role 4): everything.

Every filter here is SQL, applied in the query; the same rules answer the per-record checks (403 outside the scope).
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, exists, false, or_, select, true
from sqlalchemy.orm import Session

from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.report import EndorsementLetter, HoldingAnimal, Report, Rescue, StatusHistory
from app.models.user import Subdivision, User
from app.utils.case_review import BARANGAY_HANDLED_STATUSES

LOST_PET_CATEGORY_ID = 6
ESCALATED_HISTORY_STATUSES = (4, 13)
HIDDEN_STATUS_IDS = (3, 14, 18)  # rejected, false alarm, merged duplicate (same as report_visibility)

PET_OUT_OF_SCOPE = ("This registered pet is outside your matching scope. Private subdivision pet registries are protected "
                    "and only reach the Barangay once the animal is formally endorsed or admitted to the Barangay facility.")
REPORT_OUT_OF_SCOPE = ("This report is an internal subdivision record. It reaches the Barangay once it is endorsed, "
                       "escalated or published as a Lost Pet report.")


def _barangay_subdivisions(barangay_id: Optional[int]):
    return select(Subdivision.subdivision_id).where(Subdivision.barangay_id == barangay_id)


def _managed_root_ids():
    """Reports the Barangay manages or managed: handled status, a rescue, an endorsement, an escalation, a holding intake."""
    return select(Report.report_id).where(or_(
        Report.current_status_id.in_(BARANGAY_HANDLED_STATUSES),
        exists().where(Rescue.report_id == Report.report_id),
        exists().where(EndorsementLetter.report_id == Report.report_id),
        exists().where(and_(StatusHistory.report_id == Report.report_id,
                            StatusHistory.report_status_id.in_(ESCALATED_HISTORY_STATUSES))),
        exists().where(HoldingAnimal.report_id == Report.report_id),
    ))


def barangay_managed_condition():
    """A report that is, or is merged with, a Barangay-managed case."""
    managed = _managed_root_ids()
    return or_(Report.report_id.in_(managed), Report.duplicate_of_report_id.in_(managed))


def public_lost_pet_condition():
    """A Lost Pet report the owner published (same rule as report_visibility.is_publicly_visible)."""
    return and_(
        Report.category_id == LOST_PET_CATEGORY_ID,
        Report.visibility == "Public",
        or_(Report.visibility_decided_by.isnot(None), Report.verification_status == "verified_true"),
        or_(Report.current_status_id.is_(None), Report.current_status_id.notin_(HIDDEN_STATUS_IDS)),
    )


def report_pool_condition(user: User):
    """SQL condition for the reports this user may search and compare."""
    if user.role_id == 4:
        return true()
    if user.role_id == 2:
        return Report.subdivision_id == user.subdivision_id if user.subdivision_id else false()
    if user.role_id == 3:
        area = Report.subdivision_id.in_(_barangay_subdivisions(user.barangay_id)) if user.barangay_id is not None else true()
        return and_(area, or_(barangay_managed_condition(), public_lost_pet_condition()))
    return false()


def report_in_pool(db: Session, user: User, report: Report) -> bool:
    if user.role_id == 4:
        return True
    return db.query(Report.report_id).filter(Report.report_id == report.report_id, report_pool_condition(user)).first() is not None


def require_report_in_pool(db: Session, user: User, report: Report) -> None:
    if not report_in_pool(db, user, report):
        raise HTTPException(status_code=403, detail=REPORT_OUT_OF_SCOPE)


def _managed_case_pet_ids(barangay_id: Optional[int]):
    """Pets tied to a Barangay-managed case in this barangay: the case's linked pet, or a claim on the case."""
    managed = barangay_managed_condition()
    area = Report.subdivision_id.in_(_barangay_subdivisions(barangay_id)) if barangay_id is not None else true()
    linked = select(Report.pet_id).where(Report.pet_id.isnot(None), managed, area)
    claimed = (select(PetClaim.pet_id).join(Report, Report.report_id == PetClaim.report_id)
               .where(PetClaim.pet_id.isnot(None), managed, area))
    return linked.union(claimed)


def pet_pool_condition(user: User):
    """SQL condition for the registered pets this user may search, inspect and match."""
    if user.role_id == 4:
        return true()
    if user.role_id == 2:
        if not user.subdivision_id:
            return false()
        subdivision_users = select(User.user_id).where(User.subdivision_id == user.subdivision_id)
        return or_(Pet.owner_id.in_(subdivision_users),
                   and_(Pet.owner_id.is_(None), Pet.registered_by_user_id.in_(subdivision_users)))
    if user.role_id == 3:
        if user.barangay_id is None:
            return false()
        barangay_residents = select(User.user_id).where(User.barangay_id == user.barangay_id, User.subdivision_id.is_(None))
        barangay_staff = select(User.user_id).where(User.barangay_id == user.barangay_id, User.role_id == 3)
        return or_(
            Pet.owner_id.in_(barangay_residents),
            Pet.registered_by_user_id.in_(barangay_staff),
            Pet.pet_id.in_(_managed_case_pet_ids(user.barangay_id)),
        )
    return false()


def pet_in_scope(db: Session, user: User, pet: Pet) -> bool:
    if user.role_id == 4:
        return True
    return db.query(Pet.pet_id).filter(Pet.pet_id == pet.pet_id, pet_pool_condition(user)).first() is not None


def require_pet_in_scope(db: Session, user: User, pet: Pet) -> None:
    if not pet_in_scope(db, user, pet):
        raise HTTPException(status_code=403, detail=PET_OUT_OF_SCOPE)
