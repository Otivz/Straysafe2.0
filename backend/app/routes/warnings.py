from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.warning import OwnerWarning
from app.models.user import User
from app.models.pet import Pet
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

    return {
        "warning_id": warning.warning_id,
        "user_id": warning.user_id,
        "pet_id": warning.pet_id,
        "report_id": warning.report_id,
        "issued_by": warning.issued_by,
        "warning_level": warning.warning_level,
        "violation_type": warning.violation_type,
        "description": warning.description,
        "fine_amount": float(warning.fine_amount or 0.0),
        "status": warning.status,
        "acknowledged_at": warning.acknowledged_at,
        "created_at": warning.created_at,
        "owner_name": owner.name if owner else "Unknown Owner",
        "pet_name": pet.pet_name if pet else None,
        "issuer_name": issuer.name if issuer else "Community Official"
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
    db.commit()
    db.refresh(new_warning)

    # Send in-app notification to pet owner
    pet = db.query(Pet).filter(Pet.pet_id == warning_in.pet_id).first() if warning_in.pet_id else None
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
    warning.acknowledged_at = datetime.utcnow()
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
