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
from app.models.notification import Notification
from app.models.user import User
from app.schemas.pet_qr import PetQRCodeResponse, PublicPetScanResponse, QRScanSubmit, PetQRScanResponse
from app.utils.cloudinary_config import upload_to_cloudinary

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
    qr_uri = f"{FRONTEND_URL}/pet/scan/{qr_token}"
    
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
        filename=f"qr_{pet_id}_{qr_token}.png"
    )
    
    # Retrieve or create active QR code database row
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        db_qr = PetQRCode(
            pet_id=pet_id,
            qr_token=qr_token,
            qr_image_url=cloudinary_url,
            is_active=True
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
def generate_pet_qr(pet_id: int, db: Session = Depends(get_db)):
    """Generate or recreate a unique secure QR code for a pet."""
    return generate_qr_for_pet_internal(pet_id, db)

@router.get("/pets/{pet_id}/qr", response_model=PetQRCodeResponse)
def get_pet_qr(pet_id: int, db: Session = Depends(get_db)):
    """Get the active QR code for a pet, or generate it if it doesn't exist yet."""
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        return generate_qr_for_pet_internal(pet_id, db)
    return db_qr

@router.put("/pets/{pet_id}/toggle-qr", response_model=PetQRCodeResponse)
def toggle_pet_qr(pet_id: int, is_active: bool, db: Session = Depends(get_db)):
    """Deactivate or activate a pet's QR code."""
    db_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code not found for this pet")
    
    db_qr.is_active = is_active
    db.commit()
    db.refresh(db_qr)
    return db_qr

@router.get("/pet/scan/{token}", response_model=PublicPetScanResponse)
def get_public_scan_info(token: str, db: Session = Depends(get_db)):
    """Retrieve public pet information via the secure QR token (no sensitive owner details)."""
    db_qr = db.query(PetQRCode).filter(PetQRCode.qr_token == token).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code tag not found")
        
    if not db_qr.is_active:
        raise HTTPException(status_code=400, detail="This QR Code tag is currently inactive")
        
    pet = db.query(Pet).filter(Pet.pet_id == db_qr.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")
        
    return PublicPetScanResponse(
        pet_id=int(pet.pet_id),  # type: ignore
        pet_name=pet.pet_name,
        pet_type=pet.pet_type,
        breed=pet.breed if pet.breed else None,
        color_markings=pet.color_markings if pet.color_markings else None,
        temperament=pet.temperament if pet.temperament else None,
        photo_url=pet.photo_url if pet.photo_url else None,
        emergency_contact_name=pet.emergency_contact_name if pet.emergency_contact_name else None,
        emergency_contact_phone=pet.emergency_contact_phone if pet.emergency_contact_phone else None,
        notes=pet.notes if pet.notes else None, # serves as owner instructions
        is_active=bool(db_qr.is_active),  # type: ignore
        qr_token=db_qr.qr_token
    )

@router.post("/pet/scan/{token}/submit")
def submit_pet_scan(token: str, scan_data: QRScanSubmit, db: Session = Depends(get_db)):
    """Log a scan event, update scan count/timestamp, and notify the pet owner immediately."""
    db_qr = db.query(PetQRCode).filter(PetQRCode.qr_token == token).first()
    if not db_qr:
        raise HTTPException(status_code=404, detail="QR Code tag not found")
        
    if not db_qr.is_active:
        raise HTTPException(status_code=400, detail="This QR Code tag is currently inactive")
        
    pet = db.query(Pet).filter(Pet.pet_id == db_qr.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Associated pet record not found")
        
    # Create Scan History entry
    db_scan = PetQRScan(
        qr_id=db_qr.qr_id,
        pet_id=db_qr.pet_id,
        scanned_by=scan_data.scanned_by,
        finder_name=scan_data.finder_name,
        finder_contact=scan_data.finder_contact,
        scan_lat=scan_data.scan_lat,
        scan_lng=scan_data.scan_lng,
        street_address=scan_data.street_address,
        barangay=scan_data.barangay,
        city=scan_data.city,
        landmark=scan_data.landmark,
        location_type=scan_data.location_type,
        notes=scan_data.notes
    )
    db.add(db_scan)
    
    # Update QR stats
    db_qr.scan_count += 1
    db_qr.last_scanned_at = func.now()
    
    # Notify Owner immediately
    location_desc = scan_data.landmark or scan_data.barangay or scan_data.street_address or "a location"
    notif_msg = f"Your pet {pet.pet_name} was scanned near {location_desc}."
    
    owner_notification = Notification(
        user_id=pet.owner_id,
        title="Pet Tag Scanned",
        message=notif_msg,
        type="alert",
        related_id=pet.pet_id
    )
    db.add(owner_notification)
    
    db.commit()
    db.refresh(db_scan)
    return {"message": "Scan logged successfully", "scan_id": db_scan.scan_id}

@router.get("/pets/{pet_id}/scan-history", response_model=List[PetQRScanResponse])
def get_pet_scan_history(pet_id: int, db: Session = Depends(get_db)):
    """Retrieve the complete scan log history for a given pet."""
    # Ensure pet exists
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
        
    scans = db.query(PetQRScan).filter(PetQRScan.pet_id == pet_id).order_by(PetQRScan.scanned_at.desc()).all()
    
    # Map scanned_by name for frontend readability
    response_list: List[PetQRScanResponse] = []
    for s in scans:
        scanned_by_name: Optional[str] = None
        if s.scanned_by:
            user = db.query(User).filter(User.user_id == s.scanned_by).first()
            if user:
                scanned_by_name = user.name
                
        response_list.append(
            PetQRScanResponse(
                scan_id=int(s.scan_id),  # type: ignore
                qr_id=int(s.qr_id),  # type: ignore
                pet_id=int(s.pet_id),  # type: ignore
                scanned_by=int(s.scanned_by) if s.scanned_by else None,  # type: ignore
                scanned_by_name=scanned_by_name,
                finder_name=s.finder_name if s.finder_name else None,
                finder_contact=s.finder_contact if s.finder_contact else None,
                scan_lat=s.scan_lat,  # type: ignore
                scan_lng=s.scan_lng,  # type: ignore
                street_address=s.street_address if s.street_address else None,
                barangay=s.barangay if s.barangay else None,
                city=s.city if s.city else None,
                landmark=s.landmark if s.landmark else None,
                location_type=s.location_type if s.location_type else "Found Location",
                notes=s.notes if s.notes else None,
                scanned_at=s.scanned_at  # type: ignore
            )
        )
        
    return response_list
