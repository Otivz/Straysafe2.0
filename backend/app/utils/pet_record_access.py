"""Profile/photo editing: a resident's pet is the owner's (or an Admin's) to edit; staff edit only an ownerless community
record that is linked to an open case in their area. Case management and evidence live on the report, not here."""
from fastapi import HTTPException
from sqlalchemy.orm import joinedload, selectinload

from app.models.pet import Pet
from app.models.report import Report
from app.models.user import Subdivision
from app.utils.case_groups import CASE_CLOSED_STATUS_IDS, pet_link_trusted


def record_edit_permissions(db, pets, user):
    pets = list(pets)
    if user.role_id == 4:
        return {p.pet_id: None for p in pets}
    if user.role_id == 1:
        return {p.pet_id: None if p.owner_id == user.user_id else 'Only the registered owner can edit this pet.' for p in pets}
    denied = 'Staff can only edit community dogs or cats (no owner account) linked to an open case within their jurisdiction.'
    owned = 'This pet belongs to a resident account. Only its owner or an administrator can edit its profile.'
    result = {p.pet_id: (owned if p.owner_id else denied) for p in pets}
    if user.role_id not in (2, 3) or not pets:
        return result
    # An open case in the staff member's area is not authority over a resident's pet profile: only ownerless records
    pet_ids = {p.pet_id for p in pets if not p.owner_id and (p.pet_type or '').lower() in ('dog', 'cat')}
    if not pet_ids:
        return result
    reports = (db.query(Report)
               .options(selectinload(Report.disputes), joinedload(Report.subdivision), joinedload(Report.facility))
               .filter(Report.pet_id.in_(pet_ids)).all())
    user_barangay = user.barangay_id
    if not user_barangay and user.subdivision_id:
        subdivision = db.get(Subdivision, user.subdivision_id)
        user_barangay = subdivision.barangay_id if subdivision else None
    allowed = set()
    for report in reports:
        # Only an open case the staff member handles keeps the record editable; a trusted pet link is required.
        if report.current_status_id in CASE_CLOSED_STATUS_IDS or not pet_link_trusted(report):
            continue
        if (report.custody_status or '').lower() in ('claimed by owner', 'adopted', 'deceased', 'transferred to shelter'):
            continue
        facility = report.facility
        barangay = facility.barangay_id if facility else (report.subdivision.barangay_id if report.subdivision else None)
        subdivision_id = facility.subdivision_id if facility and facility.subdivision_id else report.subdivision_id
        # Missing jurisdiction is never permission to edit.
        if not user_barangay or barangay != user_barangay:
            continue
        if user.role_id == 2 and (not user.subdivision_id or subdivision_id != user.subdivision_id):
            continue
        allowed.add(report.pet_id)
    for pid in allowed:
        result[pid] = None
    return result


def require_pet_record_edit(db, pet: Pet, user):
    reason = record_edit_permissions(db, [pet], user)[pet.pet_id]
    if reason:
        raise HTTPException(status_code=403, detail=reason)


def attach_record_edit_permissions(db, pets, user):
    pets = pets if isinstance(pets, (list, tuple)) else [pets]
    reasons = record_edit_permissions(db, pets, user)
    for pet in pets:
        pet.can_edit_record = reasons[pet.pet_id] is None
        pet.record_edit_restriction = reasons[pet.pet_id]
