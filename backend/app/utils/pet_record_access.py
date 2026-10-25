"""Profile/photo editing follows official custody, not who registered the pet."""
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import joinedload, selectinload

from app.models.pet import Pet
from app.models.report import Adoption, HoldingAnimal, Report
from app.models.user import Subdivision
from app.utils.case_groups import pet_link_trusted


def record_edit_permissions(db, pets, user):
    pets = list(pets)
    if user.role_id == 4:
        return {p.pet_id: None for p in pets}
    if user.role_id == 1:
        return {p.pet_id: None if p.owner_id == user.user_id else 'Only the registered owner can edit this pet.' for p in pets}
    denied = 'Staff can only edit dogs or cats currently in official care within their jurisdiction.'
    result = {p.pet_id: denied for p in pets}
    if user.role_id not in (2, 3) or not pets:
        return result
    pet_ids = {p.pet_id for p in pets if (p.pet_type or '').lower() in ('dog', 'cat')}
    if not pet_ids:
        return result
    reports = db.query(Report).options(selectinload(Report.disputes)).filter(Report.pet_id.in_(pet_ids)).all()
    report_pets = defaultdict(set)
    for report in reports:
        if pet_link_trusted(report):
            report_pets[report.report_id].add(report.pet_id)
            if report.duplicate_of_report_id:
                report_pets[report.duplicate_of_report_id].add(report.pet_id)
    holdings = (db.query(HoldingAnimal)
                .outerjoin(Adoption, Adoption.holding_id == HoldingAnimal.holding_id)
                .filter(or_(HoldingAnimal.report_id.in_(report_pets), Adoption.created_pet_id.in_(pet_ids)))
                .options(joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
                         joinedload(HoldingAnimal.report).joinedload(Report.facility),
                         joinedload(HoldingAnimal.report).selectinload(Report.disputes),
                         selectinload(HoldingAnimal.adoptions))
                .distinct().all())
    user_barangay = user.barangay_id
    if not user_barangay and user.subdivision_id:
        subdivision = db.get(Subdivision, user.subdivision_id)
        user_barangay = subdivision.barangay_id if subdivision else None
    allowed = set()
    for holding in holdings:
        report = holding.report
        if not report:
            continue
        linked = report_pets[holding.report_id] | {a.created_pet_id for a in holding.adoptions if a.created_pet_id in pet_ids}
        if report.pet_id:
            if not pet_link_trusted(report):
                continue
            linked &= {report.pet_id}
        elif len(linked) > 1:
            continue  # Conflicting legacy identities need review, not edit access.
        facility = report.facility
        barangay = facility.barangay_id if facility else (report.subdivision.barangay_id if report.subdivision else None)
        subdivision_id = facility.subdivision_id if facility and facility.subdivision_id else report.subdivision_id
        # Missing jurisdiction is never permission to edit. A barangay facility
        # may also be managed by the leader responsible for the source report.
        if not user_barangay or barangay != user_barangay:
            continue
        if user.role_id == 2 and (not user.subdivision_id or subdivision_id != user.subdivision_id):
            continue
        # Physical release ends staff editing even if the adopter has not yet
        # clicked receipt confirmation. Approval/scheduling alone does not.
        released = any(a.staff_handed_over or a.is_handed_over for a in holding.adoptions)
        if released:
            for pid in linked:
                result[pid] = 'This animal has been handed over to the adopter. Only its owner or an administrator can edit the record.'
            continue
        if holding.discharge_date is not None or holding.facility_status not in (1, 2, 6):
            continue
        if (report.custody_status or '').lower() in ('claimed by owner', 'adopted', 'deceased', 'transferred to shelter'):
            continue
        for pid in linked:
            allowed.add(pid)
    # A fresh admission can legitimately follow an earlier discharge/adoption.
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
