"""Keep staff-verified ownership claims and registered pet records consistent."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pet_claim import PetClaim
from app.models.pet_history import PetHistory
from app.models.report import StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import User
from app.utils.case_groups import require_case_pet, resync_case_pet_identity, refresh_pet_behavior


def sync_approved_claim_identity(db: Session, claim: PetClaim, reviewer: User) -> None:
    """A staff-approved claim is an ownership decision, without another AI approval.

    Reuse an existing suggestion when present, preserving its AI evidence/score and
    owner notes. Manual claims link directly without inventing an AI suggestion.
    This helper never commits or delivers notifications; it shares the decision's
    transaction and is safe to repeat when repairing an older approved claim.
    """
    if reviewer.role_id not in (2, 3, 4) or claim.status not in (
        'Approved', 'Handover Complete', 'Pet Received',
    ):
        raise HTTPException(status_code=409, detail='A staff-approved ownership claim is required to link this pet.')
    report, pet = claim.report, claim.pet
    if report is None or pet is None:
        raise HTTPException(status_code=409, detail='The claim must have an existing report and registered pet.')
    require_case_pet(db, report, pet.pet_id)
    matches = db.query(ReportMatch).filter(
        ReportMatch.source_report_id == report.report_id,
        ReportMatch.matched_pet_id == pet.pet_id,
    ).order_by(ReportMatch.match_id).all()
    if any(m.status == 'NOT_A_MATCH' or m.owner_confirmation_status == 'OWNER_REJECTED' for m in matches):
        raise HTTPException(status_code=409, detail=(
            'This pet match was rejected. Resolve the conflicting match decision before approving the claim.'
        ))
    role = {2: 'Subdivision Leader', 3: 'Barangay Staff', 4: 'Admin'}[reviewer.role_id]
    note = f'Ownership verified through approved Pet Claim #{claim.claim_id} by {reviewer.name}.'
    match = next((m for m in matches if m.status == 'CONFIRMED_MATCH'), None)
    match = match or (matches[0] if matches else None)
    if match:
        if match.status != 'CONFIRMED_MATCH':
            match.status = 'CONFIRMED_MATCH'
            match.reviewed_by = reviewer.user_id
            match.reviewer_role = role
            match.verified_at = datetime.now()
            match.verification_notes = '\n'.join(filter(None, [match.verification_notes, note]))
        # The resident's ownership claim plus staff verification supplies both
        # confirmations. Pending suggestions for other pets remain distinct.
        match.owner_confirmation_status = 'OWNER_CONFIRMED'
        match.covered_by_match_id = None

    was_linked = report.pet_id == pet.pet_id
    report.pet_id = pet.pet_id
    report.is_possible_owned = bool(pet.owner_id)
    # The claim verifies this report itself, rather than an inherited identity.
    report.pet_inherited_from_match_id = None
    event_title = f'Ownership Claim Approved — Report #{report.report_id} (Claim #{claim.claim_id})'
    existing = db.query(PetHistory.history_id).filter(
        PetHistory.pet_id == pet.pet_id, PetHistory.event_type == 'CLAIM_APPROVED',
        PetHistory.title == event_title,
    ).first()
    if not existing:
        db.add(PetHistory(
            pet_id=pet.pet_id, event_type='CLAIM_APPROVED', title=event_title,
            description=f'{note} Report #{report.report_id} is linked to {pet.display_name}\'s registered record.',
            recovery_method='Approved Pet Claim', actor_id=reviewer.user_id,
            actor_name=reviewer.name, actor_role=role,
            previous_status=pet.status, new_status=pet.status,
            location_name=report.initial_landmark or report.landmark,
            latitude=report.initial_latitude if report.initial_latitude is not None else report.latitude,
            longitude=report.initial_longitude if report.initial_longitude is not None else report.longitude,
        ))
    if not was_linked:
        db.add(StatusHistory(report_id=report.report_id, updated_by=reviewer.user_id, remarks=note))
    db.flush()
    resync_case_pet_identity(db, report, reviewer)
    refresh_pet_behavior(db, pet)
