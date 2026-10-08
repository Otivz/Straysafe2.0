import os
import io
import secrets
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.database import get_db
from app.models.pet import Pet
from app.models.pet_qr import PetQRCode, PetQRScan
from app.models.pet_history import PetHistory
from app.models.report import Report, StatusHistory
from app.models.notification import Notification
from app.models.user import User
from app.schemas.pet_qr import (
    PetQRCodeResponse,
    PublicPetScanResponse,
    QRScanSubmit,
    PetQRScanResponse,
    PetRecoveryConfirmRequest,
    PetRecoveryRejectRequest,
)
from app.schemas.pet_history import PetHistoryResponse
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.auth import get_current_user

router = APIRouter(tags=["pet-qr"])

# Frontend base URL for the QR scans redirection page
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def generate_qr_for_pet_internal(pet_id: int, db: Session) -> PetQRCode:
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    # Generate a unique random secure token
    qr_token = secrets.token_urlsafe(16)

    # Generate the QR image pointing to the frontend scan page
    frontend_url = os.getenv("FRONTEND_URL", FRONTEND_URL)
    qr_uri = f"{frontend_url}/pet/scan/{qr_token}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr)
    img_byte_arr.seek(0)

    # Upload generated image to Cloudinary
    cloudinary_url = upload_to_cloudinary(
        img_byte_arr.read(),
        folder="pet_qr_codes",
        filename=f"qr_{pet_id}_{qr_token}.png",
    )

    # Retrieve or create active QR code database row
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        db_qr = PetQRCode(
            pet_id=pet_id,
            qr_token=qr_token,
            qr_image_url=cloudinary_url,
            is_active=True,
        )
        db.add(db_qr)
    else:
        db_qr.qr_token = qr_token
        db_qr.qr_image_url = cloudinary_url
        db_qr.is_active = True

    db.commit()
    db.refresh(db_qr)
    return db_qr


@router.post("/pets/{pet_id}/generate-qr", response_model=PetQRCodeResponse)
def generate_pet_qr(
    pet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate or recreate a unique secure QR code for a pet (Owner or Staff/Admin only)."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can generate QR codes.",
        )
    return generate_qr_for_pet_internal(pet_id, db)


@router.get("/pets/{pet_id}/qr", response_model=PetQRCodeResponse)
def get_pet_qr(
    pet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the active QR code details for a pet (Owner or Staff/Admin only)."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can view pet QR code.",
        )
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        return generate_qr_for_pet_internal(pet_id, db)
    return db_qr


@router.put("/pets/{pet_id}/toggle-qr", response_model=PetQRCodeResponse)
def toggle_pet_qr(
    pet_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivate or activate a pet's QR code (Owner or Staff/Admin only)."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can toggle QR code status.",
        )
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code not found for this pet")

    db_qr.is_active = is_active
    db.commit()
    db.refresh(db_qr)
    return db_qr


@router.get("/pet-qr/scan/{token}", response_model=PublicPetScanResponse)
@router.get("/pet/scan/{token}", response_model=PublicPetScanResponse)
def get_public_scan_info(token: str, db: Session = Depends(get_db)):
    """Retrieve public pet information via the secure QR token (no sensitive owner details)."""
    db_qr = db.query(PetQRCode).filter(PetQRCode.qr_token == token).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code tag not found")

    if not db_qr.is_active:
        raise HTTPException(status_code=400, detail="This QR Code tag is currently inactive")

    pet = (
        db.query(Pet)
        .options(joinedload(Pet.owner).joinedload(User.subdivision))
        .filter(Pet.pet_id == db_qr.pet_id)
        .first()
    )
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")

    owner = pet.owner
    owner_name = pet.emergency_contact_name or (owner.name if owner else pet.registered_by_name)
    owner_phone = pet.emergency_contact_phone or (owner.phone if owner else None)
    owner_email = owner.email if owner else None
    owner_profile_picture = owner.profile_picture if owner else None

    owner_address = pet.registered_address
    if not owner_address and owner:
        owner_address = (
            owner.address
            or (owner.subdivision.subdivision_name if owner.subdivision else None)
            or "Subdivision Resident"
        )

    return PublicPetScanResponse(
        pet_id=int(pet.pet_id),  # type: ignore
        pet_name=pet.display_name,
        pet_type=pet.pet_type,
        breed=pet.breed if pet.breed else None,
        color_markings=pet.color_markings if pet.color_markings else None,
        gender=pet.gender if pet.gender else "Unknown",
        estimated_age=pet.estimated_age if pet.estimated_age else None,
        size_category=pet.size_category if pet.size_category else "Medium",
        temperament=pet.temperament if pet.temperament else "Friendly",
        photo_url=pet.photo_url if pet.photo_url else None,
        health_condition=pet.health_condition if pet.health_condition else None,
        is_vaccinated=bool(pet.is_vaccinated),
        is_neutered=bool(pet.is_neutered),
        emergency_contact_name=pet.emergency_contact_name,
        emergency_contact_phone=pet.emergency_contact_phone,
        owner_name=owner_name,
        owner_phone=owner_phone,
        owner_email=owner_email,
        owner_address=owner_address or "Registered Community Pet",
        owner_profile_picture=owner_profile_picture,
        registered_address=pet.registered_address,
        notes=pet.notes if pet.notes else None,
        is_active=bool(db_qr.is_active),  # type: ignore
        qr_token=db_qr.qr_token,
        status=pet.status or "Active",
    )


@router.post("/pet/scan/{token}/submit")
def submit_pet_scan(token: str, scan_data: QRScanSubmit, db: Session = Depends(get_db)):
    """
    Log a scan event as a PENDING recovery request, update scan stats,
    record an immutable PetHistory entry, and notify the pet owner for confirmation.
    CRITICAL RULE: Does NOT immediately mark the pet as recovered.
    """
    db_qr = db.query(PetQRCode).filter(PetQRCode.qr_token == token).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code tag not found")

    if not db_qr.is_active:
        raise HTTPException(status_code=400, detail="This QR Code tag is currently inactive")

    pet = db.query(Pet).filter(Pet.pet_id == db_qr.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")

    # Validate scanned_by user exists if provided to prevent FK constraint failure
    valid_scanned_by = None
    if scan_data.scanned_by:
        user_exists = db.query(User).filter(User.user_id == scan_data.scanned_by).first()
        if user_exists:
            valid_scanned_by = scan_data.scanned_by

    # Validate location_type enum value
    valid_loc_types = ["Found Location", "Barangay Hall", "Temporary Shelter"]
    loc_type = scan_data.location_type if scan_data.location_type in valid_loc_types else "Found Location"

    current_pet_status = pet.status or "Active"

    # 1. Create Scan / Recovery Request entry (PENDING)
    db_scan = PetQRScan(
        qr_id=db_qr.qr_id,
        pet_id=db_qr.pet_id,
        scanned_by=valid_scanned_by,
        finder_name=scan_data.finder_name,
        finder_contact=scan_data.finder_contact,
        scan_lat=scan_data.scan_lat,
        scan_lng=scan_data.scan_lng,
        street_address=scan_data.street_address,
        barangay=scan_data.barangay,
        city=scan_data.city,
        landmark=scan_data.landmark,
        location_type=loc_type,
        notes=scan_data.notes,
        status="PENDING",
        pet_status_at_scan=current_pet_status,
    )
    db.add(db_scan)
    db.flush()  # Flush to generate db_scan.scan_id

    # 2. Update QR stats safely
    db_qr.scan_count = (db_qr.scan_count or 0) + 1
    db_qr.last_scanned_at = func.now()

    location_desc = (
        scan_data.landmark
        or (f"{scan_data.street_address}, {scan_data.barangay}" if scan_data.street_address and scan_data.barangay else None)
        or scan_data.barangay
        or scan_data.city
        or "Incident Location"
    )

    # 3. Create immutable PetHistory entry
    finder_str = scan_data.finder_name if scan_data.finder_name else "Someone"
    pet_history = PetHistory(
        pet_id=pet.pet_id,
        event_type="QR_TAG_SCANNED",
        title="QR Tag Scanned",
        description=f"{finder_str} found and scanned {pet.pet_name}'s QR collar tag near {location_desc}. Recovery request created (Pending Owner Confirmation).",
        recovery_method="QR Tag Scan",
        scan_id=db_scan.scan_id,
        actor_id=valid_scanned_by,
        actor_name=scan_data.finder_name or "Finder / Scanner",
        actor_role="Finder",
        previous_status=current_pet_status,
        new_status=current_pet_status,
        location_name=location_desc,
        latitude=scan_data.scan_lat,
        longitude=scan_data.scan_lng,
    )
    db.add(pet_history)

    # 4. Notify Owner immediately for confirmation
    if pet.owner_id:
        notif_msg = f"Someone scanned {pet.pet_name}'s QR tag near {location_desc}. Please confirm if your pet was retrieved."
        try:
            owner_notification = Notification(
                user_id=pet.owner_id,
                title="🐾 Pet Found: Scan Alert",
                message=notif_msg,
                type="qr_recovery_request",
                related_id=pet.pet_id,
            )
            db.add(owner_notification)
        except Exception as notif_err:
            print(f"Notice: Failed to create notification for pet owner: {notif_err}")

    db.commit()
    db.refresh(db_scan)
    return {
        "message": "Scan logged successfully. Owner has been alerted for confirmation.",
        "scan_id": db_scan.scan_id,
        "status": db_scan.status,
    }


@router.get("/pet-qr/recovery-requests/{scan_id}", response_model=PetQRScanResponse)
def get_recovery_request(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details of a specific QR scan / recovery request."""
    db_scan = db.query(PetQRScan).filter(PetQRScan.scan_id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Recovery request not found")

    pet = db.query(Pet).filter(Pet.pet_id == db_scan.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found")

    # Authorization check
    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can view this recovery request.",
        )

    scanned_by_name = None
    if db_scan.scanned_by:
        u = db.query(User).filter(User.user_id == db_scan.scanned_by).first()
        if u:
            scanned_by_name = u.name

    confirmed_by_name = None
    if db_scan.confirmed_by:
        cu = db.query(User).filter(User.user_id == db_scan.confirmed_by).first()
        if cu:
            confirmed_by_name = cu.name

    return PetQRScanResponse(
        scan_id=int(db_scan.scan_id),
        qr_id=int(db_scan.qr_id),
        pet_id=int(db_scan.pet_id),
        pet_name=pet.display_name,
        pet_photo=pet.photo_url,
        scanned_by=int(db_scan.scanned_by) if db_scan.scanned_by else None,
        scanned_by_name=scanned_by_name,
        finder_name=db_scan.finder_name,
        finder_contact=db_scan.finder_contact,
        scan_lat=db_scan.scan_lat,
        scan_lng=db_scan.scan_lng,
        street_address=db_scan.street_address,
        barangay=db_scan.barangay,
        city=db_scan.city,
        landmark=db_scan.landmark,
        location_type=db_scan.location_type or "Found Location",
        notes=db_scan.notes,
        status=db_scan.status or "PENDING",
        confirmed_at=db_scan.confirmed_at,
        confirmed_by=int(db_scan.confirmed_by) if db_scan.confirmed_by else None,
        confirmed_by_name=confirmed_by_name,
        rejection_reason=db_scan.rejection_reason,
        pet_status_at_scan=db_scan.pet_status_at_scan,
        scanned_at=db_scan.scanned_at,
    )


@router.get("/pets/{pet_id}/pending-recovery", response_model=Optional[PetQRScanResponse])
def get_pending_pet_recovery(
    pet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the latest pending QR recovery request for a pet if one exists."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can view recovery requests.",
        )

    db_scan = (
        db.query(PetQRScan)
        .filter(PetQRScan.pet_id == pet_id, PetQRScan.status == "PENDING")
        .order_by(PetQRScan.scanned_at.desc())
        .first()
    )
    if not db_scan:
        return None

    scanned_by_name = None
    if db_scan.scanned_by:
        u = db.query(User).filter(User.user_id == db_scan.scanned_by).first()
        if u:
            scanned_by_name = u.name

    return PetQRScanResponse(
        scan_id=int(db_scan.scan_id),
        qr_id=int(db_scan.qr_id),
        pet_id=int(db_scan.pet_id),
        pet_name=pet.display_name,
        pet_photo=pet.photo_url,
        scanned_by=int(db_scan.scanned_by) if db_scan.scanned_by else None,
        scanned_by_name=scanned_by_name,
        finder_name=db_scan.finder_name,
        finder_contact=db_scan.finder_contact,
        scan_lat=db_scan.scan_lat,
        scan_lng=db_scan.scan_lng,
        street_address=db_scan.street_address,
        barangay=db_scan.barangay,
        city=db_scan.city,
        landmark=db_scan.landmark,
        location_type=db_scan.location_type or "Found Location",
        notes=db_scan.notes,
        status=db_scan.status or "PENDING",
        confirmed_at=db_scan.confirmed_at,
        confirmed_by=int(db_scan.confirmed_by) if db_scan.confirmed_by else None,
        confirmed_by_name=None,
        rejection_reason=db_scan.rejection_reason,
        pet_status_at_scan=db_scan.pet_status_at_scan,
        scanned_at=db_scan.scanned_at,
    )


@router.get("/pet-qr/pending-recoveries/my-pets", response_model=List[PetQRScanResponse])
def get_my_pets_pending_recoveries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all pending recovery requests for pets owned by the current user."""
    user_pets = db.query(Pet).filter(Pet.owner_id == current_user.user_id).all()
    if not user_pets:
        return []

    pet_map = {p.pet_id: p for p in user_pets}
    user_pet_ids = list(pet_map.keys())

    pending_scans = (
        db.query(PetQRScan)
        .filter(PetQRScan.pet_id.in_(user_pet_ids), PetQRScan.status == "PENDING")
        .order_by(PetQRScan.scanned_at.desc())
        .all()
    )

    results = []
    for db_scan in pending_scans:
        pet = pet_map.get(db_scan.pet_id)
        scanned_by_name = None
        if db_scan.scanned_by:
            u = db.query(User).filter(User.user_id == db_scan.scanned_by).first()
            if u:
                scanned_by_name = u.name

        results.append(
            PetQRScanResponse(
                scan_id=int(db_scan.scan_id),
                qr_id=int(db_scan.qr_id),
                pet_id=int(db_scan.pet_id),
                pet_name=pet.display_name if pet else "Pet",
                pet_photo=pet.photo_url if pet else None,
                scanned_by=int(db_scan.scanned_by) if db_scan.scanned_by else None,
                scanned_by_name=scanned_by_name,
                finder_name=db_scan.finder_name,
                finder_contact=db_scan.finder_contact,
                scan_lat=db_scan.scan_lat,
                scan_lng=db_scan.scan_lng,
                street_address=db_scan.street_address,
                barangay=db_scan.barangay,
                city=db_scan.city,
                landmark=db_scan.landmark,
                location_type=db_scan.location_type or "Found Location",
                notes=db_scan.notes,
                status=db_scan.status or "PENDING",
                confirmed_at=db_scan.confirmed_at,
                confirmed_by=int(db_scan.confirmed_by) if db_scan.confirmed_by else None,
                confirmed_by_name=None,
                rejection_reason=db_scan.rejection_reason,
                pet_status_at_scan=db_scan.pet_status_at_scan,
                scanned_at=db_scan.scanned_at,
            )
        )
    return results


@router.post("/pet-qr/recovery-requests/{scan_id}/confirm")
def confirm_pet_recovery(
    scan_id: int,
    body: Optional[PetRecoveryConfirmRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Owner confirms pet has been safely retrieved.
    Updates scan status to CONFIRMED, marks pet as Active/Recovered,
    resolves any open lost reports, and creates an immutable PetHistory record.
    """
    db_scan = db.query(PetQRScan).filter(PetQRScan.scan_id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Recovery request not found")

    pet = db.query(Pet).filter(Pet.pet_id == db_scan.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")

    # Authorization: ONLY registered owner or staff/admin
    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the registered pet owner can confirm pet recovery.",
        )

    if db_scan.status == "CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This pet recovery request has already been confirmed.",
        )

    prev_status = pet.status or "Lost"

    try:
        # 1. Update Recovery Request Status
        db_scan.status = "CONFIRMED"
        db_scan.confirmed_at = func.now()
        db_scan.confirmed_by = current_user.user_id
        if body and body.notes:
            db_scan.notes = (db_scan.notes or "") + f" [Owner Confirmation Note: {body.notes}]"

        # 2. Update Pet Status to Active / Recovered
        pet.status = "Active"

        # 3. Auto-resolve any active Lost Reports for this pet
        active_lost_reports = (
            db.query(Report)
            .filter(
                Report.pet_id == pet.pet_id,
                Report.current_status_id.notin_([9, 10, 11, 12, 14, 15, 17, 18]),  # Terminal / Resolved statuses
            )
            .all()
        )
        for rep in active_lost_reports:
            rep.current_status_id = 11  # 11: Incident Resolved
            db.add(
                StatusHistory(
                    report_id=rep.report_id,
                    report_status_id=11,
                    updated_by=current_user.user_id,
                    remarks=f"Auto-resolved: Pet {pet.pet_name} confirmed recovered via QR tag scan by owner.",
                )
            )

        location_desc = (
            db_scan.landmark
            or (f"{db_scan.street_address}, {db_scan.barangay}" if db_scan.street_address and db_scan.barangay else None)
            or db_scan.barangay
            or db_scan.city
            or "Incident Location"
        )

        # 4. Record permanent immutable Pet History event
        finder_mention = f" found by {db_scan.finder_name}" if db_scan.finder_name else " found by someone"
        history_desc = f"Owner {current_user.name} confirmed that {pet.pet_name} was{finder_mention} and safely retrieved."
        if body and body.notes:
            history_desc += f" Note: {body.notes}"

        pet_history = PetHistory(
            pet_id=pet.pet_id,
            event_type="OWNER_CONFIRMED_RECOVERY",
            title="Owner Confirmed Recovery",
            description=history_desc,
            recovery_method="QR Tag Scan",
            scan_id=db_scan.scan_id,
            actor_id=current_user.user_id,
            actor_name=current_user.name,
            actor_role="Owner" if pet.owner_id == current_user.user_id else "Staff/Admin",
            previous_status=prev_status,
            new_status="Recovered",
            location_name=location_desc,
            latitude=db_scan.scan_lat,
            longitude=db_scan.scan_lng,
        )
        db.add(pet_history)

        # 5. Send confirmation notification to owner
        if pet.owner_id:
            db.add(
                Notification(
                    user_id=pet.owner_id,
                    title="✓ Pet Recovery Confirmed",
                    message=f"{pet.pet_name} has been marked as recovered and the event has been added to the pet's history.",
                    type="alert",
                    related_id=pet.pet_id,
                )
            )

        # 6. Notify finder if finder was a logged-in user
        if db_scan.scanned_by and db_scan.scanned_by != current_user.user_id:
            try:
                db.add(
                    Notification(
                        user_id=db_scan.scanned_by,
                        title="✓ Pet Successfully Recovered",
                        message=f"Great news! The owner confirmed that {pet.pet_name} was retrieved after your scan.",
                        type="alert",
                        related_id=pet.pet_id,
                    )
                )
            except Exception:
                pass

        db.commit()
        db.refresh(db_scan)
        return {
            "message": f"{pet.pet_name} recovery confirmed successfully!",
            "scan_id": db_scan.scan_id,
            "status": "CONFIRMED",
            "pet_status": pet.status,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to confirm pet recovery: {str(e)}",
        )


@router.post("/pet-qr/recovery-requests/{scan_id}/reject")
def reject_pet_recovery(
    scan_id: int,
    body: Optional[PetRecoveryRejectRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Owner rejects the recovery request (e.g. not their pet, or false scan).
    Marks the scan request as REJECTED without changing the pet's status.
    """
    db_scan = db.query(PetQRScan).filter(PetQRScan.scan_id == scan_id).first()
    if not db_scan:
        raise HTTPException(status_code=404, detail="Recovery request not found")

    pet = db.query(Pet).filter(Pet.pet_id == db_scan.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")

    # Authorization
    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the registered pet owner can reject this recovery request.",
        )

    reason = body.rejection_reason if body and body.rejection_reason else "Not confirmed by owner"

    try:
        db_scan.status = "REJECTED"
        db_scan.rejection_reason = reason

        # Record PetHistory event for audit
        location_desc = (
            db_scan.landmark
            or (f"{db_scan.street_address}, {db_scan.barangay}" if db_scan.street_address and db_scan.barangay else None)
            or db_scan.barangay
            or "Scan Location"
        )
        pet_history = PetHistory(
            pet_id=pet.pet_id,
            event_type="RECOVERY_REJECTED",
            title="Scan Rejected by Owner",
            description=f"Owner indicated this scan does not correspond to pet retrieval. Reason: {reason}.",
            recovery_method="QR Tag Scan",
            scan_id=db_scan.scan_id,
            actor_id=current_user.user_id,
            actor_name=current_user.name,
            actor_role="Owner" if pet.owner_id == current_user.user_id else "Staff/Admin",
            previous_status=pet.status or "Active",
            new_status=pet.status or "Active",
            location_name=location_desc,
            latitude=db_scan.scan_lat,
            longitude=db_scan.scan_lng,
        )
        db.add(pet_history)

        db.commit()
        db.refresh(db_scan)
        return {
            "message": "Recovery request rejected.",
            "scan_id": db_scan.scan_id,
            "status": "REJECTED",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reject recovery request: {str(e)}",
        )


@router.get("/pets/{pet_id}/history", response_model=List[PetHistoryResponse])
def get_pet_history_timeline(
    pet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the permanent immutable audit history and event timeline for a pet."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can view pet history.",
        )

    history = (
        db.query(PetHistory)
        .filter(PetHistory.pet_id == pet_id)
        .order_by(PetHistory.created_at.desc())
        .all()
    )
    return history


@router.get("/pets/{pet_id}/scan-history", response_model=List[PetQRScanResponse])
def get_pet_scan_history(
    pet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the complete scan log history for a given pet (Owner or Staff/Admin only)."""
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if current_user.role_id not in [2, 3, 4] and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only the pet owner or staff/admin can view scan history.",
        )

    scans = (
        db.query(PetQRScan)
        .filter(PetQRScan.pet_id == pet_id)
        .order_by(PetQRScan.scanned_at.desc())
        .all()
    )

    response_list: List[PetQRScanResponse] = []
    for s in scans:
        scanned_by_name: Optional[str] = None
        if s.scanned_by:
            user = db.query(User).filter(User.user_id == s.scanned_by).first()
            if user:
                scanned_by_name = user.name

        confirmed_by_name: Optional[str] = None
        if s.confirmed_by:
            cu = db.query(User).filter(User.user_id == s.confirmed_by).first()
            if cu:
                confirmed_by_name = cu.name

        response_list.append(
            PetQRScanResponse(
                scan_id=int(s.scan_id),
                qr_id=int(s.qr_id),
                pet_id=int(s.pet_id),
                pet_name=pet.display_name,
                pet_photo=pet.photo_url,
                scanned_by=int(s.scanned_by) if s.scanned_by else None,
                scanned_by_name=scanned_by_name,
                finder_name=s.finder_name if s.finder_name else None,
                finder_contact=s.finder_contact if s.finder_contact else None,
                scan_lat=s.scan_lat,
                scan_lng=s.scan_lng,
                street_address=s.street_address if s.street_address else None,
                barangay=s.barangay if s.barangay else None,
                city=s.city if s.city else None,
                landmark=s.landmark if s.landmark else None,
                location_type=s.location_type if s.location_type else "Found Location",
                notes=s.notes if s.notes else None,
                status=s.status if s.status else "PENDING",
                confirmed_at=s.confirmed_at,
                confirmed_by=int(s.confirmed_by) if s.confirmed_by else None,
                confirmed_by_name=confirmed_by_name,
                rejection_reason=s.rejection_reason,
                pet_status_at_scan=s.pet_status_at_scan,
                scanned_at=s.scanned_at,
            )
        )

    return response_list
