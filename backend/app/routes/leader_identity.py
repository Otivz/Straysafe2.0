"""Leader identity verification endpoints (rules: app/utils/leader_identity.py)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.leader_identity import LeaderIdentityVerification
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_history import PetHistory
from app.models.report import Report, StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import User
from app.utils.audit import log_activity
from app.utils.auth import get_current_staff_or_admin, verify_subdivision_scope
from app.utils.leader_identity import METHODS, MIN_REASON, eligibility

router = APIRouter(prefix="/leader-identity", tags=["leader-identity"])

TRIGGER_LABELS = {"OWNER_REJECTED": "the owner rejected the match",
                  "NO_RESPONSE_24H": "the owner did not answer within 24 hours"}


@router.get("/reports/{report_id}")
def report_verification_options(report_id: int, db: Session = Depends(get_db),
                                current_user: User = Depends(get_current_staff_or_admin)):
    """Staff-confirmed pet matches on this report, whether the signed-in leader may verify each, and past verifications."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    matches = (db.query(ReportMatch).filter(ReportMatch.source_report_id == report_id, ReportMatch.matched_pet_id.isnot(None),
                                            ReportMatch.status == "CONFIRMED_MATCH").order_by(ReportMatch.match_id).all())
    out = []
    for m in matches:
        pet = db.get(Pet, m.matched_pet_id)
        trigger, reason = eligibility(db, m, current_user)
        done = db.query(LeaderIdentityVerification).filter(LeaderIdentityVerification.match_id == m.match_id).first()
        out.append({
            "match_id": m.match_id, "pet_id": m.matched_pet_id, "pet_name": pet.pet_name if pet else None,
            "owner_confirmation_status": m.owner_confirmation_status,
            "staff_confirmed_at": m.verified_at.isoformat() if m.verified_at else None,
            "eligible": trigger is not None, "trigger": trigger, "blocked_reason": reason,
            "verification": None if done is None else {
                "method": done.method, "reason": done.reason, "trigger": done.trigger,
                "leader_name": done.leader.name if done.leader else None,
                "created_at": done.created_at.isoformat() if done.created_at else None,
            },
        })
    return {"report_id": report_id, "methods": list(METHODS), "matches": out}


class LeaderVerifyRequest(BaseModel):
    method: str
    reason: str = Field(..., max_length=2000)


@router.post("/matches/{match_id}")
def verify_identity(match_id: int, payload: LeaderVerifyRequest, req: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_staff_or_admin)):
    """The handling leader verifies the identity. Links the report to the pet; the owner is told and may dispute it."""
    if payload.method not in METHODS:
        raise HTTPException(status_code=400, detail=f"Choose how you verified it: {', '.join(METHODS)}.")
    reason = payload.reason.strip()
    if len(reason) < MIN_REASON:
        raise HTTPException(status_code=400, detail=f"Describe what you checked (at least {MIN_REASON} characters).")
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).with_for_update().first()
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    report = db.query(Report).filter(Report.report_id == match.source_report_id).with_for_update().first()
    if report is not None:
        verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    trigger, why_not = eligibility(db, match, current_user)
    if trigger is None:
        raise HTTPException(status_code=409 if current_user.role_id == 2 else 403, detail=why_not)
    pet = db.get(Pet, match.matched_pet_id)

    db.add(LeaderIdentityVerification(match_id=match.match_id, report_id=report.report_id, pet_id=pet.pet_id,
                                      leader_id=current_user.user_id, method=payload.method, reason=reason, trigger=trigger))
    report.pet_id = pet.pet_id
    report.is_possible_owned = True
    when = TRIGGER_LABELS[trigger]
    db.add(StatusHistory(report_id=report.report_id, updated_by=current_user.user_id,
                         remarks=(f"Identity verified by the handling leader {current_user.name} ({payload.method}) because {when}. "
                                  f"{reason}")))
    db.add(PetHistory(
        pet_id=pet.pet_id, event_type="LEADER_IDENTITY_VERIFIED",
        title=f"Identity Verified by Leader — Report #{report.report_id}",
        description=(f"{current_user.name} verified Report #{report.report_id} as {pet.display_name} ({payload.method}) "
                     f"because {when}. Not owner confirmation; the owner may dispute it."),
        recovery_method="Leader Identity Verification", actor_id=current_user.user_id, actor_name=current_user.name,
        actor_role="Subdivision Leader", previous_status=pet.status, new_status=pet.status,
        location_name=report.landmark, latitude=report.latitude, longitude=report.longitude,
    ))
    db.add(Notification(
        user_id=pet.owner_id, type="leader_identity_verified", related_id=report.report_id,
        title=f"Leader Verified: Report #{report.report_id} is {pet.display_name}",
        message=(f"Your Subdivision Leader verified that the animal in Report #{report.report_id} is {pet.display_name} "
                 f"({payload.method}). If this is wrong, open the report and file a formal dispute."),
    ))
    db.flush()
    from app.utils.case_groups import refresh_pet_behavior
    from app.utils.owner_followups import alert_repeat_reports_for_pet
    refresh_pet_behavior(db, pet)
    alert_repeat_reports_for_pet(db, pet.pet_id)
    log_activity(db=db, action="LEADER_VERIFY_IDENTITY", target_table="report_matches", target_id=match.match_id,
                 description=(f"{current_user.name} verified Report #{report.report_id} as pet #{pet.pet_id} "
                              f"({payload.method}; {trigger}). {reason}"),
                 user_id=current_user.user_id, log_type="security",
                 old_values={"report_pet_id": None, "owner_confirmation_status": match.owner_confirmation_status},
                 new_values={"report_pet_id": pet.pet_id, "method": payload.method, "trigger": trigger},
                 request=req, commit=False)
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"The verification was not saved: database error ({type(e).__name__}).")
    return {"message": f"Identity verified: Report #{report.report_id} is linked to {pet.display_name}. The owner was notified.",
            "report_id": report.report_id, "pet_id": pet.pet_id, "trigger": trigger,
            "verified_at": datetime.now().isoformat()}
