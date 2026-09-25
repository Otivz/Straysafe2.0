import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.report import (
    HoldingAnimal,
    HoldingTimeline,
    Report,
    ReportMedia,
    Adoption,
    StatusHistory,
)
from app.models.pet import Pet
from app.models.landmark import Landmark
from app.models.user import User, Barangay, Subdivision
from app.models.notification import Notification
from app.utils.auth import (
    get_current_user,
    get_current_resident,
    get_current_staff_or_admin,
    get_optional_user,
)
from app.utils.audit import log_activity
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.uploads import read_and_validate_upload
from app.schemas.adoption import (
    AdoptionApplyRequest,
    AdoptionReviewRequest,
    AdoptionHandoverConfirmRequest,
    PromoteToAdoptionRequest,
    LateClaimInfoResponse,
    CatalogAnimalResponse,
    JourneyPin,
    AnimalJourneyResponse,
    AdoptionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/adoptions", tags=["adoptions"])


def _mask_name(full_name: str) -> str:
    """Return 'First L.' representation for public display."""
    if not full_name:
        return "Anonymous"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def _can_manage_adoption(current_user: User, animal: HoldingAnimal, db: Session) -> bool:
    """
    Barangay Staff / Head Officer (role_id=3)
    or System Admin (role_id=4) has adoption promotion and management authority.
    Subdivision Leaders (role_id=2) and regular residents are strictly denied.
    """
    if current_user.role_id == 4:
        return True
    if current_user.role_id == 3:
        report = db.query(Report).filter(Report.report_id == animal.report_id).first()
        if not report:
            return False
        # If animal originated from a subdivision, ensure it matches current user's barangay
        if report.subdivision and report.subdivision.barangay_id != current_user.barangay_id:
            return False
        return True
    return False


def _build_adoption_response(app: Adoption) -> AdoptionResponse:
    animal = app.animal
    photo = None
    if animal and animal.report and animal.report.media:
        img = next((m.file_url for m in animal.report.media if m.media_type == "Image"), None)
        photo = img

    staff_name = None
    if app.handover_staff:
        staff_name = app.handover_staff.name

    return AdoptionResponse(
        adoption_id=app.adoption_id,
        holding_id=app.holding_id,
        applicant_id=app.applicant_id,
        status=app.status,
        full_name=app.full_name,
        address=app.address,
        contact_no=app.contact_no,
        has_other_pets=app.has_other_pets,
        living_space=app.living_space,
        reason=app.reason,
        reviewed_by=app.reviewed_by,
        reviewer_role=app.reviewer_role,
        reviewer_name=app.reviewer.name if app.reviewer else None,
        review_notes=app.review_notes,
        reviewed_at=app.reviewed_at,
        created_at=app.created_at,
        updated_at=app.updated_at,
        animal_name=animal.animal_name if animal else None,
        animal_type=animal.animal_type if animal else None,
        animal_breed=animal.breed if animal else None,
        animal_photo=photo,
        id_type=app.id_type,
        id_number=app.id_number,
        id_photo_url=app.id_photo_url,
        is_handed_over=app.is_handed_over,
        handover_date=app.handover_date,
        staff_handed_over=app.staff_handed_over,
        staff_handover_date=app.staff_handover_date,
        staff_handover_by=app.staff_handover_by,
        staff_handover_name=staff_name,
        created_pet_id=app.created_pet_id,
    )


def _finalize_adoption_if_ready(
    app: Adoption,
    db: Session,
    current_user: User,
    notes: Optional[str] = None
) -> bool:
    """
    Check if both staff_handed_over AND is_handed_over (adopter confirmed) are True.
    If so, officially mark animal as Adopted (status 7), create registered Pet record for adopter,
    log timeline event, and notify both parties.
    """
    if not (app.staff_handed_over and app.is_handed_over):
        return False

    animal = app.animal
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 1. Transition animal to facility_status=7 (Adopted/Released)
    if animal:
        animal.facility_status = 7
        animal.discharge_date = now

    # 2. Automatically create registered Pet record if not yet created
    if not app.created_pet_id and animal:
        primary_photo = None
        if animal.report and animal.report.media:
            primary_photo = next((m.file_url for m in animal.report.media if m.media_type == "Image"), None)

        pet_type_val = "Dog"
        if animal.animal_type and animal.animal_type.lower() == "cat":
            pet_type_val = "Cat"

        new_pet = Pet(
            owner_id=app.applicant_id,
            pet_name=animal.animal_name or "Adopted Pet",
            pet_type=pet_type_val,
            breed=animal.breed or "Mixed Breed",
            color_markings=animal.color,
            gender="Unknown",
            photo_url=primary_photo,
            health_condition=animal.medical_notes or "Adopted via Barangay Animal Services",
            is_vaccinated=True,
            temperament="Friendly",
        )
        db.add(new_pet)
        db.flush()
        app.created_pet_id = new_pet.pet_id

    # 3. Update report custody status and add StatusHistory entry
    if animal and animal.report:
        animal.report.current_status_id = 11  # Incident Resolved
        animal.report.custody_status = "Adopted"
        impound_hist = StatusHistory(
            report_id=animal.report.report_id,
            report_status_id=11,
            updated_by=app.staff_handover_by or current_user.user_id,
            remarks=f"Pet officially claimed by adopter {app.full_name} and handed over by staff. Case resolved.",
        )
        db.add(impound_hist)

    # 4. Add HoldingTimeline outcome entry
    staff_name = app.handover_staff.name if app.handover_staff else (current_user.name if current_user.role_id in [3, 4] else "Authorized Staff")
    timeline_entry = HoldingTimeline(
        holding_id=animal.holding_id if animal else app.holding_id,
        event_type="outcome",
        title=f"Official Adoption Completed — {app.full_name}",
        notes=f"Two-way handover confirmed. Animal officially handed over by {staff_name} and received by adopter {app.full_name}. Pet registered to adopter's account (Pet #{app.created_pet_id}). {notes or ''}",
        logged_by=app.staff_handover_by or current_user.user_id,
    )
    db.add(timeline_entry)

    # 5. Send notifications
    try:
        # To Adopter
        notif_adopter = Notification(
            user_id=app.applicant_id,
            title="Adoption Officially Completed! 🐾",
            message=f"Congratulations! The adoption procedure for {animal.animal_name if animal else 'your pet'} is officially complete. The pet has been registered to your account.",
            notification_type="adoption_completed",
            related_id=app.adoption_id,
        )
        db.add(notif_adopter)

        # To Staff / Head Officer
        head_officers = db.query(User).filter(User.role_id == 3, User.is_head_officer == True).all()
        for ho in head_officers:
            notif_staff = Notification(
                user_id=ho.user_id,
                title="Adoption Claiming Completed",
                message=f"Adoption #{app.adoption_id} for {animal.animal_name if animal else 'pet'} has been completed. Pet officially claimed by {app.full_name}.",
                notification_type="adoption_completed",
                related_id=app.adoption_id,
            )
            db.add(notif_staff)
    except Exception as e:
        logger.warning(f"Could not send completion notifications: {e}")

    return True


# ── GET /adoptions/catalog ───────────────────────────────────────────────────
@router.get("/catalog", response_model=List[CatalogAnimalResponse])
def get_adoption_catalog(db: Session = Depends(get_db)):
    """Public adoption catalog — returns all animals currently in facility_status=6 (For Adoption)."""
    animals = (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.report).joinedload(Report.subdivision).joinedload(Subdivision.barangay),
            joinedload(HoldingAnimal.intake_staff),
        )
        .filter(HoldingAnimal.facility_status == 6)
        .order_by(HoldingAnimal.promoted_at.desc(), HoldingAnimal.holding_id.desc())
        .all()
    )

    results: List[CatalogAnimalResponse] = []
    for a in animals:
        rep = a.report
        subd = rep.subdivision if rep else None
        brgy = subd.barangay if subd else None

        # Photos
        photos: List[str] = []
        if rep and rep.media:
            photos = [m.file_url for m in rep.media if m.media_type == "Image" and m.file_url]

        fac_name = rep.facility.name if (rep and rep.facility) else (brgy.barangay_name if brgy else "Barangay Animal Care Facility")
        fac_contact = brgy.contact_no if brgy else None
        managing = f"Barangay {brgy.barangay_name} Animal Services" if brgy else "Barangay Animal Care"

        results.append(
            CatalogAnimalResponse(
                holding_id=a.holding_id,
                report_id=a.report_id,
                animal_name=a.animal_name,
                animal_type=a.animal_type,
                breed=a.breed,
                color=a.color,
                estimated_size=a.estimated_size,
                facility_status=a.facility_status,
                adoption_catalog_notes=a.adoption_catalog_notes,
                intake_date=a.intake_date,
                promoted_at=a.promoted_at,
                photos=photos,
                intake_staff_name=a.intake_staff.name if a.intake_staff else None,
                intake_staff_contact=a.intake_staff.phone if a.intake_staff else None,
                facility_name=fac_name,
                facility_contact=fac_contact,
                managing_unit=managing,
                sighting_lat=float(rep.latitude) if (rep and rep.latitude is not None) else None,
                sighting_lng=float(rep.longitude) if (rep and rep.longitude is not None) else None,
                sighting_landmark=rep.landmark if rep else None,
            )
        )
    return results


# ── GET /adoptions/catalog/{holding_id} ──────────────────────────────────────
@router.get("/catalog/{holding_id}", response_model=CatalogAnimalResponse)
def get_adoption_catalog_detail(holding_id: int, db: Session = Depends(get_db)):
    """Public detail for a single adoptable animal."""
    animal = (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.report).joinedload(Report.subdivision).joinedload(Subdivision.barangay),
            joinedload(HoldingAnimal.intake_staff),
        )
        .filter(HoldingAnimal.holding_id == holding_id)
        .first()
    )
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    rep = animal.report
    subd = rep.subdivision if rep else None
    brgy = subd.barangay if subd else None

    photos: List[str] = []
    if rep and rep.media:
        photos = [m.file_url for m in rep.media if m.media_type == "Image" and m.file_url]

    fac_name = rep.facility.name if (rep and rep.facility) else (brgy.barangay_name if brgy else "Barangay Animal Care Facility")
    fac_contact = brgy.contact_no if brgy else None
    managing = f"Barangay {brgy.barangay_name} Animal Services" if brgy else "Barangay Animal Care"

    return CatalogAnimalResponse(
        holding_id=animal.holding_id,
        report_id=animal.report_id,
        animal_name=animal.animal_name,
        animal_type=animal.animal_type,
        breed=animal.breed,
        color=animal.color,
        estimated_size=animal.estimated_size,
        facility_status=animal.facility_status,
        adoption_catalog_notes=animal.adoption_catalog_notes,
        intake_date=animal.intake_date,
        promoted_at=animal.promoted_at,
        photos=photos,
        intake_staff_name=animal.intake_staff.name if animal.intake_staff else None,
        intake_staff_contact=animal.intake_staff.phone if animal.intake_staff else None,
        facility_name=fac_name,
        facility_contact=fac_contact,
        managing_unit=managing,
        sighting_lat=float(rep.latitude) if (rep and rep.latitude is not None) else None,
        sighting_lng=float(rep.longitude) if (rep and rep.longitude is not None) else None,
        sighting_landmark=rep.landmark if rep else None,
    )


# ── GET /adoptions/journey/{holding_id} ──────────────────────────────────────
@router.get("/journey/{holding_id}", response_model=AnimalJourneyResponse)
def get_animal_journey(
    holding_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Animal Journey Map endpoint — public views masked adopter info, staff views full."""
    animal = (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
        )
        .filter(HoldingAnimal.holding_id == holding_id)
        .first()
    )
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    rep = animal.report
    photos = [m.file_url for m in rep.media if m.media_type == "Image" and m.file_url] if rep and rep.media else []

    pins: List[JourneyPin] = []

    # 1. Red Pin: Original Sighting
    if rep and rep.latitude is not None and rep.longitude is not None:
        date_str = rep.created_at.strftime("%b %d, %Y") if rep.created_at else None
        pins.append(
            JourneyPin(
                id="sighting",
                label="Original Sighting",
                description=f"Spotted near {rep.landmark or 'community area'}",
                latitude=float(rep.latitude),
                longitude=float(rep.longitude),
                date=date_str,
                pin_color="red",
            )
        )

    # 2. Orange / Blue Pins: Intake & Transfers
    if animal.timeline:
        for idx, event in enumerate(animal.timeline):
            if event.event_type in ["intake", "transfer", "relocation"]:
                # Lookup facility coords if landmark or notes contain match
                lat, lng = None, None
                if rep and rep.facility and rep.facility.latitude and rep.facility.longitude:
                    lat, lng = float(rep.facility.latitude), float(rep.facility.longitude)
                event_date = event.logged_at.strftime("%b %d, %Y") if event.logged_at else None
                pin_color = "orange" if event.event_type == "intake" else "blue"
                pins.append(
                    JourneyPin(
                        id=f"event_{event.log_id}_{idx}",
                        label=event.title or "Holding Facility Movement",
                        description=event.notes or "Animal in protective holding",
                        latitude=lat,
                        longitude=lng,
                        date=event_date,
                        pin_color=pin_color,
                    )
                )

    # 3. Check Adoption Record
    approved_adoption = (
        db.query(Adoption)
        .filter(Adoption.holding_id == holding_id, Adoption.status == "Approved")
        .order_by(Adoption.reviewed_at.desc())
        .first()
    )

    is_adopted = animal.facility_status == 7 or approved_adoption is not None
    adopter_name_public: Optional[str] = None
    adopter_date: Optional[str] = None
    adopter_area: Optional[str] = None
    adopter_name_full: Optional[str] = None
    adopter_contact: Optional[str] = None
    adopter_address: Optional[str] = None

    if approved_adoption:
        adopter_name_public = _mask_name(approved_adoption.full_name)
        if approved_adoption.reviewed_at:
            adopter_date = approved_adoption.reviewed_at.strftime("%b %d, %Y")
        if approved_adoption.address:
            addr_parts = approved_adoption.address.split(",")
            adopter_area = addr_parts[-1].strip() if addr_parts else "Metro Area"

        # Staff full access
        is_staff_or_admin = current_user and current_user.role_id in [2, 3, 4]
        if is_staff_or_admin:
            adopter_name_full = approved_adoption.full_name
            adopter_contact = approved_adoption.contact_no
            adopter_address = approved_adoption.address

        # Final Green Pin (Outcome)
        pins.append(
            JourneyPin(
                id="adoption_outcome",
                label="Adopted into Loving Home",
                description=f"Adopted by {adopter_name_public} on {adopter_date or 'Recent'}",
                latitude=None,  # No exact GPS home coordinates for privacy
                longitude=None,
                date=adopter_date,
                pin_color="green",
            )
        )

    return AnimalJourneyResponse(
        holding_id=animal.holding_id,
        animal_name=animal.animal_name,
        animal_type=animal.animal_type,
        breed=animal.breed,
        color=animal.color,
        photos=photos,
        is_adopted=is_adopted,
        adopter_name_public=adopter_name_public,
        adopter_date=adopter_date,
        adopter_area=adopter_area,
        adopter_name_full=adopter_name_full,
        adopter_contact=adopter_contact,
        adopter_address=adopter_address,
        pins=pins,
    )


# ── POST /adoptions/promote/{holding_id} ─────────────────────────────────────
@router.post("/promote/{holding_id}")
def promote_to_adoption(
    holding_id: int,
    req: PromoteToAdoptionRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Promote an animal to the public Adoption Catalog (facility_status=6).
    Restricted strictly to Barangay Head Officer or Admin.
    """
    animal = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == holding_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found in holding facility")

    # Permission check
    if not _can_manage_adoption(current_user, animal, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Adoption promotion is managed exclusively by the Barangay Head Officer.",
        )

    # Business rule: Deceased (4), Claimed (3), or Transferred (5) cannot be promoted
    if animal.facility_status in [3, 4, 5]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot promote an animal that is already resolved, deceased, or claimed (status={animal.facility_status}).",
        )

    now = datetime.now(timezone.utc)
    stay_limit = float(req.min_stay_days) if req.min_stay_days is not None and req.min_stay_days >= 0 else 0.0
    if animal.intake_date:
        # Normalize intake_date if naive
        intake_dt = animal.intake_date
        if intake_dt.tzinfo is None:
            intake_dt = intake_dt.replace(tzinfo=timezone.utc)
        days_held = (now - intake_dt).total_seconds() / 86400
        is_privileged = current_user.role_id == 4 or getattr(current_user, "is_head_officer", False)
        if days_held < stay_limit and not is_privileged:
            raise HTTPException(
                status_code=400,
                detail=f"Holding stay limit has not elapsed yet ({round(days_held, 1)} of {int(stay_limit)} days held). Regular staff can promote once the stay limit is reached, or a Head Officer can authorize early promotion.",
            )

    catalog_notes = req.adoption_catalog_notes or req.notes
    animal.facility_status = 6  # For Adoption
    animal.adoption_catalog_notes = catalog_notes
    animal.promoted_at = now
    animal.promoted_by = current_user.user_id

    # Add timeline entry
    timeline_entry = HoldingTimeline(
        holding_id=animal.holding_id,
        event_type="status_change",
        title="Promoted to Adoption Catalog",
        notes=catalog_notes or f"Animal promoted to public adoption catalog after {int(stay_limit)}-day stay limit reached.",
        logged_by=current_user.user_id,
    )
    db.add(timeline_entry)

    log_activity(
        db=db,
        action="PROMOTE_TO_ADOPTION",
        target_table="holding_animals",
        target_id=animal.holding_id,
        description=f"Barangay Officer {current_user.name} promoted animal '{animal.animal_name}' (#{animal.holding_id}) to Adoption Catalog.",
        log_type="operation",
        new_values={"facility_status": 6, "promoted_by": current_user.name},
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(animal)
    return {"message": "Animal successfully listed in the public Adoption Catalog.", "holding_id": animal.holding_id}


# ── POST /adoptions/upload-id ────────────────────────────────────────────────
@router.post("/upload-id")
async def upload_adoption_id(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_resident),
):
    """Upload Government ID document image for adoption application."""
    file_content, unique_filename, media_type, resource_type = await read_and_validate_upload(
        file,
        allowed={'Image'}
    )

    url = upload_to_cloudinary(file_content, folder="adoption_ids", filename=unique_filename)
    if not url:
        raise HTTPException(status_code=500, detail="Failed to upload ID document. Please try again.")

    return {"url": url}


# ── POST /adoptions/apply ────────────────────────────────────────────────────
@router.post("/apply", status_code=status.HTTP_201_CREATED)
def apply_for_adoption(
    req: AdoptionApplyRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_resident),
):
    """Citizen submits an adoption application for an animal listed in status 6."""
    animal = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == req.holding_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    if animal.facility_status != 6:
        raise HTTPException(status_code=400, detail="This animal is currently not available for public adoption.")

    # Check if another applicant is already approved and waiting for claiming
    approved_for_other = (
        db.query(Adoption)
        .filter(
            Adoption.holding_id == req.holding_id,
            Adoption.status == "Approved",
        )
        .first()
    )
    if approved_for_other:
        raise HTTPException(
            status_code=400,
            detail="This pet has already been approved for adoption by another applicant and is reserved for claiming.",
        )

    # Prevent duplicate pending application
    existing = (
        db.query(Adoption)
        .filter(
            Adoption.holding_id == req.holding_id,
            Adoption.applicant_id == current_user.user_id,
            Adoption.status == "Pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending adoption application for this pet. Please wait for Barangay review.",
        )

    if len(req.reason.strip()) < 20:
        raise HTTPException(status_code=400, detail="Please provide a more detailed reason for adoption (at least 20 characters).")

    # Automatically set has_other_pets = True if resident has registered pets on file
    user_pets_count = (
        db.query(Pet)
        .filter(
            Pet.owner_id == current_user.user_id,
            Pet.status.notin_(["Archived", "Inactive"]),
        )
        .count()
    )
    final_has_other_pets = req.has_other_pets or (user_pets_count > 0)

    new_app = Adoption(
        holding_id=req.holding_id,
        applicant_id=current_user.user_id,
        status="Pending",
        full_name=req.full_name,
        address=req.address,
        contact_no=req.contact_no,
        has_other_pets=final_has_other_pets,
        living_space=req.living_space,
        reason=req.reason,
        id_type=req.id_type,
        id_number=req.id_number,
        id_photo_url=req.id_photo_url,
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)

    # Notify Barangay Head Officer
    try:
        head_officer = (
            db.query(User)
            .filter(User.role_id == 3, User.is_head_officer == True)
            .first()
        )
        if head_officer:
            notif = Notification(
                user_id=head_officer.user_id,
                title="New Adoption Application",
                message=f"Resident {req.full_name} submitted an adoption application for {animal.animal_name or 'a rescue animal'}.",
                notification_type="adoption_submission",
                related_id=new_app.adoption_id,
            )
            db.add(notif)
            db.commit()
    except Exception as e:
        logger.warning(f"Could not send adoption notification: {e}")

    log_activity(
        db=db,
        action="SUBMIT_ADOPTION_APPLICATION",
        target_table="adoptions",
        target_id=new_app.adoption_id,
        description=f"Resident {current_user.name} submitted adoption application #{new_app.adoption_id} for pet '{animal.animal_name}'.",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    return {"message": "Application submitted successfully! Barangay Animal Services will review your application.", "adoption_id": new_app.adoption_id}


# ── GET /adoptions/my-applications ───────────────────────────────────────────
@router.get("/my-applications", response_model=List[AdoptionResponse])
def get_my_adoption_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_resident),
):
    """Resident views all adoption applications they have submitted."""
    apps = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.reviewer),
            joinedload(Adoption.handover_staff),
        )
        .filter(Adoption.applicant_id == current_user.user_id)
        .order_by(Adoption.created_at.desc())
        .all()
    )
    return [_build_adoption_response(app) for app in apps]


# ── GET /adoptions/applications ──────────────────────────────────────────────
@router.get("/applications", response_model=List[AdoptionResponse])
def get_barangay_adoption_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Barangay Staff / Head Officer & Admin view adoption applications."""
    if current_user.role_id == 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subdivision Leaders do not manage adoptions. This feature is handled exclusively by the Barangay.",
        )

    query = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
            joinedload(Adoption.reviewer),
            joinedload(Adoption.handover_staff),
        )
    )

    if current_user.role_id == 3:
        # Filter applications belonging to user's barangay
        query = query.join(HoldingAnimal, Adoption.holding_id == HoldingAnimal.holding_id).join(Report, HoldingAnimal.report_id == Report.report_id).join(Subdivision, Report.subdivision_id == Subdivision.subdivision_id).filter(Subdivision.barangay_id == current_user.barangay_id)

    apps = query.order_by(Adoption.created_at.desc()).all()
    return [_build_adoption_response(app) for app in apps]


# ── GET /adoptions/my-adopted-pets ───────────────────────────────────────────
@router.get("/my-adopted-pets", response_model=List[AdoptionResponse])
def get_my_adopted_pets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_resident),
):
    """Get all officially completed adoptions for the logged-in resident."""
    apps = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.reviewer),
            joinedload(Adoption.handover_staff),
        )
        .filter(
            Adoption.applicant_id == current_user.user_id,
            Adoption.status == "Approved",
            Adoption.is_handed_over == True,
            Adoption.staff_handed_over == True,
        )
        .order_by(Adoption.handover_date.desc())
        .all()
    )
    return [_build_adoption_response(app) for app in apps]


# ── PUT /adoptions/review/{adoption_id} ──────────────────────────────────────
@router.put("/review/{adoption_id}")
def review_adoption_application(
    adoption_id: int,
    req: AdoptionReviewRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Approve or Reject an adoption application.
    Gated strictly to Barangay Head Officer or Admin.
    """
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found")

    if not _can_manage_adoption(current_user, app.animal, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Only the Barangay Head Officer or System Admin can approve/reject adoption applications.",
        )

    decision = req.decision.strip().capitalize()
    if decision not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be 'Approved' or 'Rejected'")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.status = decision
    app.reviewed_by = current_user.user_id
    app.reviewer_role = "Barangay Head Officer" if current_user.role_id == 3 else "Admin"
    app.review_notes = req.review_notes
    app.reviewed_at = now

    animal = app.animal

    if decision == "Approved":
        # Note: Animal remains reserved for this adopter awaiting physical claiming & two-way confirmation.
        # It is NOT marked facility_status=7 until handover confirmation is completed.

        # 1. Automatically reject other pending applications for the same animal
        other_pending = (
            db.query(Adoption)
            .filter(
                Adoption.holding_id == app.holding_id,
                Adoption.adoption_id != app.adoption_id,
                Adoption.status == "Pending",
            )
            .all()
        )
        for other in other_pending:
            other.status = "Rejected"
            other.reviewed_by = current_user.user_id
            other.reviewer_role = app.reviewer_role
            other.reviewed_at = now
            other.review_notes = "Another applicant was approved for this pet."
            # Notify rejected applicant
            try:
                notif = Notification(
                    user_id=other.applicant_id,
                    title="Adoption Application Update",
                    message=f"Your application for {animal.animal_name or 'pet'} was not selected because another applicant was approved.",
                    notification_type="adoption_rejected",
                    related_id=other.adoption_id,
                )
                db.add(notif)
            except Exception:
                pass

        # 2. Add timeline entry
        timeline_entry = HoldingTimeline(
            holding_id=animal.holding_id if animal else app.holding_id,
            event_type="status_change",
            title=f"Adoption Application Approved — {app.full_name}",
            notes=f"Adoption application #{app.adoption_id} approved by {current_user.name}. Animal awaiting physical pickup and two-way handover confirmation.",
            logged_by=current_user.user_id,
        )
        db.add(timeline_entry)

        # 3. Notify winning adopter
        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Adoption Application Approved! 🎉",
                message=f"Congratulations! Your adoption application for {animal.animal_name or 'your new pet'} has been Approved. Please proceed to the Barangay Animal Facility for pet pickup and confirmation.",
                notification_type="adoption_approved",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

    else:
        # Rejected
        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Adoption Application Update",
                message=f"Your adoption application for {animal.animal_name or 'pet'} was reviewed. Status: Rejected. {req.review_notes or ''}",
                notification_type="adoption_rejected",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

    log_activity(
        db=db,
        action="REVIEW_ADOPTION_APPLICATION",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"{current_user.name} ({app.reviewer_role}) set adoption application #{app.adoption_id} to '{decision}'.",
        log_type="operation",
        new_values={"status": decision, "notes": req.review_notes},
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {"message": f"Application successfully marked as {decision}.", "status": decision}


# ── POST /adoptions/{adoption_id}/staff-confirm-handover ──────────────────────
@router.post("/{adoption_id}/staff-confirm-handover")
def staff_confirm_handover(
    adoption_id: int,
    body: AdoptionHandoverConfirmRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Barangay Staff / Admin confirms that the adopter has arrived and claimed the pet."""
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.handover_staff),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found")

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only Approved applications can be confirmed for pet handover.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.staff_handed_over = True
    app.staff_handover_date = now
    app.staff_handover_by = current_user.user_id

    # Notify adopter to confirm receipt if not yet confirmed
    if not app.is_handed_over:
        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Pet Handover Confirmed by Staff",
                message=f"Staff member {current_user.name} has confirmed the handover of {app.animal.animal_name if app.animal else 'your pet'}. Please click 'Confirm Pet Received' in your applications page to finalize the adoption.",
                notification_type="adoption_handover_pending",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

    completed = _finalize_adoption_if_ready(app, db, current_user, notes=body.notes)

    log_activity(
        db=db,
        action="STAFF_CONFIRM_ADOPTION_HANDOVER",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"Staff {current_user.name} confirmed pet handover for Adoption #{app.adoption_id} to {app.full_name}.",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {
        "message": "Pet handover confirmed by staff." + (" Adoption officially completed!" if completed else " Awaiting adopter confirmation."),
        "staff_handed_over": True,
        "is_completed": completed,
    }


# ── POST /adoptions/{adoption_id}/adopter-confirm-received ───────────────────
@router.post("/{adoption_id}/adopter-confirm-received")
def adopter_confirm_received(
    adoption_id: int,
    body: AdoptionHandoverConfirmRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_resident),
):
    """Adopter confirms that they have received and claimed the pet."""
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.handover_staff),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found")

    if app.applicant_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only confirm adoptions submitted from your own account.")

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only Approved applications can be confirmed.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.is_handed_over = True
    app.handover_date = now

    # Notify staff
    try:
        head_officers = db.query(User).filter(User.role_id == 3, User.is_head_officer == True).all()
        for ho in head_officers:
            notif = Notification(
                user_id=ho.user_id,
                title="Adopter Confirmed Pet Receipt",
                message=f"Adopter {app.full_name} has confirmed the safe receipt and adoption of {app.animal.animal_name if app.animal else 'pet'} (App #{app.adoption_id}).",
                notification_type="adopter_receipt_confirmed",
                related_id=app.adoption_id,
            )
            db.add(notif)
    except Exception:
        pass

    completed = _finalize_adoption_if_ready(app, db, current_user, notes=body.notes)

    log_activity(
        db=db,
        action="ADOPTER_CONFIRM_PET_RECEIVED",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"Adopter {current_user.name} confirmed safe receipt and adoption of pet (App #{app.adoption_id}).",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {
        "message": "Pet receipt confirmed!" + (" Adoption officially completed! The pet is now registered to your account." if completed else " Awaiting staff handover confirmation."),
        "is_handed_over": True,
        "is_completed": completed,
    }


# ── GET /adoptions/late-claim-info/{holding_id} ──────────────────────────────
@router.get("/late-claim-info/{holding_id}", response_model=LateClaimInfoResponse)
def get_late_claim_info(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Returns only adopter's name and contact number for staff in late claim scenarios.
    Never exposes home address or other application details.
    """
    if current_user.role_id == 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subdivision Leaders do not have access to late adoption claim records.",
        )

    adoption = (
        db.query(Adoption)
        .filter(Adoption.holding_id == holding_id, Adoption.status == "Approved")
        .order_by(Adoption.reviewed_at.desc())
        .first()
    )
    if not adoption:
        raise HTTPException(status_code=404, detail="No approved adoption record found for this animal")

    return LateClaimInfoResponse(
        adopter_name=adoption.full_name,
        adopter_contact_no=adoption.contact_no,
    )
