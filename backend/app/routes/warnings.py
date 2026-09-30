from fastapi import APIRouter, Depends, HTTPException, status, Request
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
from app.schemas.warning import WarningCreate, WarningResponse, WarningAcknowledge
from app.utils.auth import get_current_user
from app.utils.audit import log_activity

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
        "pet_name": pet.pet_name if pet else (report.pet_name if report else None),
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
    # Only Leaders (2), Staff (3), and Admin (4) can issue citations
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Subdivision Leaders and Barangay Staff can issue official warnings."
        )

    # Validate target resident
    owner = db.query(User).filter(User.user_id == warning_in.user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Target pet owner not found")

    # If associated with a report, retrieve report and validate
    rep = None
    if warning_in.report_id:
        rep = db.query(Report).filter(Report.report_id == warning_in.report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Associated incident report not found")

        # Subdivision leader cannot issue warning on escalated report
        if current_user.role_id == 2:
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

        # 2. BACKEND DUPLICATE PROTECTION: Check if warning already exists for this pet and report
        dup_query = db.query(OwnerWarning).filter(
            OwnerWarning.report_id == warning_in.report_id
        )
        if warning_in.pet_id:
            dup_query = dup_query.filter(
                or_(
                    OwnerWarning.pet_id == warning_in.pet_id,
                    OwnerWarning.pet_id.is_(None)
                )
            )
        if warning_in.violation_type:
            dup_query = dup_query.filter(
                OwnerWarning.violation_type == warning_in.violation_type
            )

        existing = dup_query.first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Warning already exists for this pet and report."
            )

        # Link pet_id if not already set on report
        if rep.pet_id and not warning_in.pet_id:
            warning_in.pet_id = rep.pet_id
        elif not rep.pet_id and warning_in.pet_id:
            rep.pet_id = warning_in.pet_id

    pet = db.query(Pet).filter(Pet.pet_id == warning_in.pet_id).first() if warning_in.pet_id else None

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
        pet_info = f" for pet '{pet.pet_name}'" if pet else ""
        hist_remarks = f"⚠️ WARNING ISSUED: Official {warning_in.warning_level}{pet_info} issued for '{warning_in.violation_type}' by {current_user.name} ({issuer_role_title}). Reason: {warning_in.description}"
        warning_history = StatusHistory(
            report_id=warning_in.report_id,
            report_status_id=rep.current_status_id or 2,
            user_id=current_user.user_id,
            remarks=hist_remarks,
            created_at=datetime.now(timezone.utc)
        )
        db.add(warning_history)

    # Send in-app notification to pet owner
    pet_info = f" for pet '{pet.pet_name}'" if pet else ""
    notif_msg = f"Official Notice: You have received a {warning_in.warning_level}{pet_info} regarding '{warning_in.violation_type}'. Please review and acknowledge."
    
    notif = Notification(
        user_id=warning_in.user_id,
        related_id=warning_in.report_id,
        title=f"⚠️ {warning_in.warning_level} Citation Issued",
        message=notif_msg,
        type="Warning",
        is_read=False
    )
    db.add(notif)

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


@router.get("/user/{user_id}", response_model=List[WarningResponse])
def get_user_warnings(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Citizen can only view their own; Staff/Leader can view any
    if current_user.role_id == 1 and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.user_id == user_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in warnings]


@router.get("/pet/{pet_id}", response_model=List[WarningResponse])
def get_pet_warnings(
    pet_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.pet_id == pet_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in warnings]


@router.get("/report/{report_id}", response_model=List[WarningResponse])
def get_report_warnings(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == report_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in warnings]


@router.get("/{warning_id}", response_model=WarningResponse)
def get_warning_by_id(
    warning_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")
    
    # Permission check: citizen can only view their own
    if current_user.role_id == 1 and warning.user_id != current_user.user_id:
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
    return [enrich_warning_dict(w, db) for w in warnings]


@router.patch("/{warning_id}/acknowledge", response_model=WarningResponse)
def acknowledge_warning(
    warning_id: int,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")

    if warning.user_id != current_user.user_id and current_user.role_id not in [2, 3, 4]:
        raise HTTPException(status_code=403, detail="You can only acknowledge warnings issued to your account")

    warning.status = "Acknowledged"
    warning.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(warning)

    # Log audit entry
    log_activity(
        db=db,
        action="ACKNOWLEDGE_WARNING",
        target_table="owner_warnings",
        target_id=warning.warning_id,
        description=f"Resident {current_user.name} acknowledged warning #{warning_id}",
        user_id=current_user.user_id,
        log_type="operation",
        request=req
    )
    db.commit()

    return enrich_warning_dict(warning, db)
