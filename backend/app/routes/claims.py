from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import os
import uuid

from app.database import get_db
from app.models.pet_claim import PetClaim
from app.models.pet import Pet
from app.models.report import Report, StatusHistory
from app.models.notification import Notification
from app.schemas.pet_claim import PetClaimCreate, PetClaimResponse, PetClaimStatusUpdate
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.audit import log_activity

router = APIRouter(prefix="/claims", tags=["claims"])

@router.get("/", response_model=List[PetClaimResponse])
def get_claims(
    owner_id: Optional[int] = None,
    subdivision_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media)
    ).join(Pet, PetClaim.pet_id == Pet.pet_id).filter(
        Pet.status != "Deceased"
    )

    if owner_id is not None:
        query = query.filter(Pet.owner_id == owner_id)
        
    if subdivision_id is not None:
        # Avoid ambiguous join by specifying join condition or matching Report table
        query = query.join(Report, PetClaim.report_id == Report.report_id).filter(Report.subdivision_id == subdivision_id)

    return query.order_by(PetClaim.created_at.desc()).all()

@router.get("/{claim_id}", response_model=PetClaimResponse)
def get_claim(claim_id: int, db: Session = Depends(get_db)):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim or (claim.pet and claim.pet.status == "Deceased"):
        raise HTTPException(status_code=404, detail="Claim not found or pet is deceased.")
    return claim

@router.post("/", response_model=PetClaimResponse)
def create_or_update_claim(claim_in: PetClaimCreate, db: Session = Depends(get_db)):
    # Verify report and pet exist
    report = db.query(Report).filter(Report.report_id == claim_in.report_id).first()
    pet = db.query(Pet).filter(Pet.pet_id == claim_in.pet_id).first()
    
    if not report or not pet:
        raise HTTPException(status_code=404, detail="Report or Pet not found")

    if pet.status and pet.status.lower() == "deceased":
        raise HTTPException(
            status_code=400,
            detail="This pet is marked as deceased and cannot be claimed or matched."
        )

    # Check if a claim record already exists (e.g. from automatic matching)
    db_claim = db.query(PetClaim).filter(
        PetClaim.report_id == claim_in.report_id,
        PetClaim.pet_id == claim_in.pet_id
    ).first()

    if db_claim:
        # Update the existing match claim to a submitted state
        db_claim.status = "Pending Review"
        db_claim.remarks = claim_in.remarks
        db_claim.distinctive_markings = claim_in.distinctive_markings
        db.commit()
        db.refresh(db_claim)
        return db_claim

    # Otherwise, create a new claim
    new_claim = PetClaim(
        report_id=claim_in.report_id,
        pet_id=claim_in.pet_id,
        remarks=claim_in.remarks,
        distinctive_markings=claim_in.distinctive_markings,
        status="Pending Review"
    )
    db.add(new_claim)
    db.commit()
    db.refresh(new_claim)
    return new_claim

@router.post("/{claim_id}/evidence", response_model=PetClaimResponse)
async def upload_claim_evidence(
    claim_id: int,
    file: UploadFile = File(...),
    document_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    claim = db.query(PetClaim).filter(PetClaim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    try:
        content = await file.read()
        file_extension = os.path.splitext(file.filename or "")[1]
        unique_filename = f"claim_{claim_id}_{uuid.uuid4()}{file_extension}"
        
        file_url = upload_to_cloudinary(content, folder="claims", filename=unique_filename)
        if not file_url:
            raise Exception("Upload to Cloudinary failed")

        if document_type == "vaccine_card":
            claim.vaccine_card_url = file_url
        elif document_type == "vet_record":
            claim.vet_record_url = file_url
        elif document_type == "registration_record":
            claim.registration_record_url = file_url
        elif document_type == "additional_photo":
            claim.additional_photos_url = file_url
        else:
            claim.evidence_url = file_url

        claim.status = "Pending Review"
        db.commit()
        db.refresh(claim)
        
        # Notify leaders or confirm upload
        return claim
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Evidence upload failed: {str(e)}")

@router.patch("/{claim_id}/status", response_model=PetClaimResponse)
def update_claim_status(
    claim_id: int,
    status_update: PetClaimStatusUpdate,
    db: Session = Depends(get_db)
):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet),
        joinedload(PetClaim.report)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    claim.status = status_update.status
    if status_update.remarks:
        claim.remarks = status_update.remarks

    # If claim is Approved, update corresponding Report and Pet statuses
    if status_update.status == "Approved":
        # 1. Update report status to 'Claimed by Owner' (ID 9)
        if claim.report:
            claim.report.current_status_id = 9
            # Add to report status history
            history_entry = StatusHistory(
                report_id=claim.report_id,
                report_status_id=9,
                remarks=f"Claim approved. Owner identified: {claim.pet.pet_name} owned by user #{claim.pet.owner_id}."
            )
            db.add(history_entry)

        # 2. Update pet status back to 'Active' since it's claimed
        if claim.pet:
            claim.pet.status = "Active"

    # Create a notification for the pet owner
    if claim.pet and claim.pet.owner_id:
        notif_msg = f"Your claim for pet '{claim.pet.pet_name}' on report #{claim.report_id} has been {status_update.status.lower()}."
        if status_update.remarks:
            notif_msg += f" Remarks: {status_update.remarks}"

        new_notif = Notification(
            user_id=claim.pet.owner_id,
            title=f"Pet Claim {status_update.status}",
            message=notif_msg,
            type="status_update",
            related_id=claim.report_id
        )
        db.add(new_notif)

    db.commit()
    db.refresh(claim)
    return claim
