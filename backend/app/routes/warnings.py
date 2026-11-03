from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.warning import OwnerWarning
from app.models.user import User
from app.models.pet import Pet
from app.models.report import Report, StatusHistory, Rescue
from app.models.notification import Notification
from app.schemas.warning import WarningCreate, WarningResponse
from app.utils.auth import get_current_user, verify_subdivision_scope
from app.utils.audit import log_activity
from app.utils.case_groups import require_case_pet
from app.utils.warning_rules import check_tier_for_incident, require_can_issue, visible_warnings, suggest_tier, followup_incidents
from app.utils.notification_dispatcher import dispatch_notification
from app.services import email_templates

router = APIRouter(
    prefix="/warnings",
    tags=["warnings"]
)

def enrich_warning_dict(warning: OwnerWarning, db: Session) -> dict:
    owner = db.query(User).filter(User.user_id == warning.user_id).first()
    issuer = db.query(User).filter(User.user_id == warning.issued_by).first()
    pet = db.query(Pet).filter(Pet.pet_id == warning.pet_id).first() if warning.pet_id else None
    report = db.query(Report).filter(Report.report_id == warning.report_id).first() if warning.report_id else None

    issuer_role_name = "Community Official"
    if issuer:
        if issuer.role_id == 2:
            issuer_role_name = "Subdivision Leader"
        elif issuer.role_id == 3:
            issuer_role_name = "Barangay Staff"
        elif issuer.role_id == 4:
            issuer_role_name = "Administrator"

    report_photo = None
    if report and hasattr(report, "media") and report.media and len(report.media) > 0:
        report_photo = report.media[0].file_url

    return {
        "warning_id": warning.warning_id,
        "user_id": warning.user_id,
        "pet_id": warning.pet_id,
        "report_id": warning.report_id,
        "issued_by": warning.issued_by,
        "warning_level": warning.warning_level,
        "violation_type": warning.violation_type,
        "warning_type": warning.violation_type,
        "description": warning.description,
        "warning_reason": warning.description,
        "fine_amount": float(warning.fine_amount) if warning.fine_amount is not None else 0.0,
        "status": warning.status,
        "acknowledged_at": warning.acknowledged_at,
        "created_at": warning.created_at,
        "issued_at": warning.created_at,
        "owner_name": owner.name if owner else "Unknown Owner",
        "owner_phone": owner.phone if owner else None,
        "pet_name": pet.display_name if pet else (getattr(report, 'pet_name', None) if report else None),
        "pet_id_display": f"PET-{str(pet.pet_id).zfill(5)}" if pet else (f"PET-{str(warning.pet_id).zfill(5)}" if warning.pet_id else None),
        "report_ref_display": f"#REPORT-{report.created_at.year}-{str(report.report_id).zfill(5)}" if (report and report.created_at) else (f"#REPORT-{str(warning.report_id).zfill(5)}" if warning.report_id else None),
        "issuer_name": issuer.name if issuer else "Community Official",
        "issuer_role": issuer_role_name,
        "report_landmark": report.landmark if report else None,
        "report_animal_type": report.animal_type if report else None,
        "report_photo": report_photo
    }


@router.post("/", response_model=WarningResponse)
def issue_warning(
    warning_in: WarningCreate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Leader only (Phase 6): the server refuses everyone else, whatever the screen shows
    if current_user.role_id != 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Subdivision Leader can issue official warnings."
        )

    # Validate target resident
    owner = db.query(User).filter(User.user_id == warning_in.user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Target pet owner not found")

    rep = None
    if warning_in.report_id:
        rep = db.query(Report).filter(Report.report_id == warning_in.report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Associated incident report not found")

        # A subdivision warning can't be issued once the case is escalated to the Barangay
        rescue_record = db.query(Rescue).filter(Rescue.report_id == warning_in.report_id).first()
        is_escalated = (
            rep.endorsement_letter is not None or
            rescue_record is not None or
            rep.current_status_id in [4, 5, 6, 13]
        )
        if is_escalated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot issue subdivision warning for an animal case that has already been escalated to Barangay."
            )

        # Link pet_id if not already set on report
        if rep.pet_id and not warning_in.pet_id:
            from app.utils.case_groups import pet_link_trusted
            if not pet_link_trusted(rep):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This report's pet identity was inherited from a merged case and hasn't been re-checked. "
                           "Re-check the identity on the report (or choose the pet explicitly) before issuing a warning.",
                )
            warning_in.pet_id = rep.pet_id

    pet = db.query(Pet).filter(Pet.pet_id == warning_in.pet_id).first() if warning_in.pet_id else None
    if warning_in.pet_id and pet is None:
        raise HTTPException(status_code=404, detail="Registered pet not found")
    if rep is not None and rep.pet_id and pet is not None and rep.pet_id != pet.pet_id:
        raise HTTPException(status_code=409, detail="This report is linked to a different registered pet.")
    # Leader of this subdivision, handling the report, warning the registered pet's actual owner
    require_can_issue(db, current_user, owner, rep, pet)
    # One warning per incident, pet, violation and tier (a logged repeat incident is its own report)
    check_tier_for_incident(db, rep.report_id, warning_in.violation_type, warning_in.pet_id, warning_in.warning_level)
    if pet is not None and not rep.pet_id:
        require_case_pet(db, rep, pet.pet_id)
        rep.pet_id = pet.pet_id

    new_warning = OwnerWarning(
        user_id=warning_in.user_id,
        pet_id=warning_in.pet_id,
        report_id=warning_in.report_id,
        issued_by=current_user.user_id,
        warning_level=warning_in.warning_level,
        violation_type=warning_in.violation_type,
        description=warning_in.description,
        fine_amount=warning_in.fine_amount or 0.0,
        status="Pending"
    )
    db.add(new_warning)
    db.flush()

    # Add Pet History / Report Activity event to StatusHistory
    issuer_role_title = "Subdivision Leader" if current_user.role_id == 2 else ("Barangay Staff" if current_user.role_id == 3 else "Administrator")
    if warning_in.report_id and rep:
        pet_info = f" for pet '{pet.display_name}'" if pet else ""
        hist_remarks = f"⚠️ WARNING ISSUED: Official {warning_in.warning_level}{pet_info} issued for '{warning_in.violation_type}' by {current_user.name} ({issuer_role_title}). Reason: {warning_in.description}"
        warning_history = StatusHistory(
            report_id=warning_in.report_id,
            report_status_id=rep.current_status_id or 2,
            updated_by=current_user.user_id,
            remarks=hist_remarks,
        )
        db.add(warning_history)

        # Automatic Under Observation integration upon First Warning
        from app.models.owner_followup import OwnerFollowUp
        from datetime import timedelta

        existing_followup = db.query(OwnerFollowUp).filter(
            OwnerFollowUp.report_id == rep.report_id
        ).first()

        prior_warnings_count = db.query(OwnerWarning).filter(
            OwnerWarning.report_id == rep.report_id,
            OwnerWarning.warning_id != new_warning.warning_id
        ).count()
        is_first_warning = (warning_in.warning_level in ("1st Warning", "Notice")) or (prior_warnings_count == 0)

        # The warning's time is on the database clock (local); follow-up due dates are kept in UTC like _now() (F18)
        from app.utils.holding_stay import db_now
        from app.utils.owner_followups import db_local_to_utc
        warning_ts = new_warning.created_at or db_now(db)
        warning_ts_utc = db_local_to_utc(db, warning_ts)

        # One open observation per pet (Phase 3): a warning on a logged repeat stays under the observation already open
        pet_for_obs = rep.pet_id or warning_in.pet_id
        open_for_pet = db.query(OwnerFollowUp).filter(
            OwnerFollowUp.pet_id == pet_for_obs, OwnerFollowUp.status == "observing"
        ).first() if pet_for_obs else None

        if not existing_followup and is_first_warning and open_for_pet is None:
            followup_due = warning_ts_utc + timedelta(days=3)
            followup_due_local = warning_ts + timedelta(days=3)  # for the message, on the clock the owner reads
            auto_followup = OwnerFollowUp(
                report_id=rep.report_id,
                pet_id=rep.pet_id or warning_in.pet_id,
                subdivision_id=rep.subdivision_id or current_user.subdivision_id,
                leader_id=current_user.user_id,
                owner_id=warning_in.user_id,
                owner_name=getattr(owner, 'name', None) or "Identified Owner",
                owner_phone=getattr(owner, 'phone', None),
                owner_address=getattr(owner, 'address', None) or getattr(rep, 'landmark', None),
                status="observing",
                duration_days=3,
                due_at=followup_due,
                notes=f"Automatic 3-day community observation initiated upon issuance of First Warning ({warning_in.violation_type}): {warning_in.description}",
                created_at=warning_ts
            )
            db.add(auto_followup)

            rep.current_status_id = 7
            from app.utils.owner_followups import record_observation_event
            record_observation_event(db, auto_followup, "started", current_user.user_id)

            dispatch_notification(
                db=db,
                user_id=warning_in.user_id,
                related_id=rep.report_id,
                title="🐾 3-Day Observation Period Started",
                message=(
                    f"Because a First Warning was issued for Report #{rep.report_id}, your animal is now under a 3-day observation "
                    f"until {followup_due_local.strftime('%b %d, %Y %I:%M %p')}. Please address the reported violation and submit "
                    "observation updates with photo evidence from your account (Observation Updates)."
                ),
                notification_type="followup_started",
            )
        elif existing_followup and is_first_warning and existing_followup.status != "observing":
            existing_followup.status = "observing"
            existing_followup.created_at = warning_ts
            existing_followup.due_at = warning_ts_utc + timedelta(days=existing_followup.duration_days or 3)
            rep.current_status_id = 7
            from app.utils.owner_followups import record_observation_event
            record_observation_event(db, existing_followup, "started", current_user.user_id)
        elif existing_followup and warning_in.warning_level == "2nd Warning":
            existing_followup.notes = (existing_followup.notes or "") + f" | Second Warning issued ({warning_in.violation_type}): {warning_in.description}"
            obs_history = StatusHistory(
                report_id=rep.report_id,
                report_status_id=7,
                updated_by=current_user.user_id,
                remarks=f"⚠️ Second Warning Issued by {current_user.name}: {warning_in.violation_type} - {warning_in.description}. Eligible for Barangay Endorsement.",
            )
            db.add(obs_history)

    # Send in-app notification & official citation email to pet owner
    pet_info = f" for pet '{pet.display_name}'" if pet else ""
    notif_msg = f"Official Notice: You have received a {warning_in.warning_level}{pet_info} regarding '{warning_in.violation_type}'. Please review and acknowledge."
    
    subj, txt_b, html_b = email_templates.render_owner_warning_email(
        user_name=owner.name,
        pet_name=pet.display_name if pet else None,
        warning_level=warning_in.warning_level,
        violation_type=warning_in.violation_type,
        description=warning_in.description,
    )
    dispatch_notification(
        db=db,
        user_id=warning_in.user_id,
        related_id=warning_in.report_id,
        title=f"⚠️ {warning_in.warning_level} Citation Issued",
        message=notif_msg,
        notification_type="Warning",
        email_data={
            "recipient_email": owner.email,
            "subject": subj,
            "text_body": txt_b,
            "html_body": html_b,
            "category": "warning",
            "template_key": "owner_warning_issued",
            "idempotency_key": f"warning_{new_warning.warning_id}",
            "related_entity_type": "warning",
            "related_entity_id": new_warning.warning_id,
        }
    )

    # Log audit entry
    log_activity(
        db=db,
        action="ISSUE_WARNING",
        target_table="owner_warnings",
        target_id=new_warning.warning_id,
        description=f"Issued {warning_in.warning_level} to {owner.name} ({warning_in.violation_type})",
        user_id=current_user.user_id,
        log_type="enforcement",
        request=req
    )
    db.commit()
    db.refresh(new_warning)

    return enrich_warning_dict(new_warning, db)


@router.get("/my-warnings", response_model=List[WarningResponse])
def get_my_warnings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.user_id == current_user.user_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in warnings]


@router.get("/suggestion")
def get_tier_suggestion(
    violation_type: str,
    report_id: Optional[int] = None,
    pet_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The suggested tier for a new warning, from this pet's (or owner's) existing warning history."""
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=403, detail="Access denied")
    if report_id:
        rep = db.query(Report).filter(Report.report_id == report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")
        verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
        pet_id = pet_id or rep.pet_id
    from datetime import date, timedelta as _td
    from app.utils.warning_rules import COMPLIANCE_DAYS, INSTRUCTIONS
    return {**suggest_tier(db, violation_type, pet_id, owner_id, report_id),
            "instructions": INSTRUCTIONS.get(violation_type, INSTRUCTIONS["Other"]),
            "comply_by": (date.today() + _td(days=COMPLIANCE_DAYS)).isoformat()}


@router.get("/followup/{followup_id}/incidents")
def get_followup_incidents(
    followup_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The observed incident and each logged repeat, with their warnings and a prefill for the warning form."""
    from app.models.owner_followup import OwnerFollowUp
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=403, detail="Access denied")
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    verify_subdivision_scope(current_user, followup.subdivision_id, db=db)
    return {"followup_id": followup_id, "incidents": followup_incidents(db, followup)}


@router.get("/user/{user_id}", response_model=List[WarningResponse])
def get_user_warnings(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents: only their own. Staff: only warnings in their area.
    if current_user.role_id == 1 and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.user_id == user_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/pet/{pet_id}", response_model=List[WarningResponse])
def get_pet_warnings(
    pet_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents see only notices issued to them; staff only those in their area
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.pet_id == pet_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/report/{report_id}", response_model=List[WarningResponse])
def get_report_warnings(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents see only notices issued to them; staff only those in their area
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == report_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/{warning_id}", response_model=WarningResponse)
def get_warning_by_id(
    warning_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")

    if not visible_warnings(db, current_user, [warning]):
        raise HTTPException(status_code=403, detail="Access denied")

    return enrich_warning_dict(warning, db)


@router.get("/", response_model=List[WarningResponse])
def get_all_warnings(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(status_code=403, detail="Access denied")

    query = db.query(OwnerWarning)
    if status_filter:
        query = query.filter(OwnerWarning.status == status_filter)

    warnings = query.order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


class AcknowledgeRequest(BaseModel):
    # The owner ticked "I have read and understood this notice"
    confirmed: bool = False


@router.patch("/{warning_id}/acknowledge", response_model=WarningResponse)
def acknowledge_warning(
    warning_id: int,
    req: Request,
    payload: Optional[AcknowledgeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Only the warned owner acknowledges, and only after ticking the acknowledgement checkbox."""
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")

    if warning.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only acknowledge warnings issued to your account")
    if not (payload and payload.confirmed):
        raise HTTPException(status_code=400, detail="Tick the acknowledgement checkbox to confirm you have read this notice.")
    if warning.status == "Acknowledged":
        return enrich_warning_dict(warning, db)

    warning.status = "Acknowledged"
    warning.acknowledged_at = datetime.now(timezone.utc)
    log_activity(
        db=db,
        action="ACKNOWLEDGE_WARNING",
        target_table="owner_warnings",
        target_id=warning.warning_id,
        description=f"Resident {current_user.name} acknowledged warning #{warning_id}",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    db.refresh(warning)
    return enrich_warning_dict(warning, db)
