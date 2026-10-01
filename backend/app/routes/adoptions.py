import hashlib
import io
import base64
import os
import logging
import qrcode
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import List, Optional, Dict, Any

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
    AdoptionVerification,
    AdoptionInterview,
    AdoptionHomeVisit,
    AdoptionCertificate,
    AdoptionMonitoringLog,
    AdoptionTimelineLog,
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
from app.utils.id_security import (
    validate_and_sanitize_id_image,
    secure_process_government_id,
    upload_secure_adoption_id,
    generate_ephemeral_id_url,
    encrypt_id_number,
    decrypt_id_number,
    mask_government_id_number,
    purge_expired_adoption_ids,
)
from app.schemas.adoption import (
    AdoptionApplyRequest,
    AdoptionCancelRequest,
    AdoptionReviewRequest,
    AdoptionHandoverConfirmRequest,
    PromoteToAdoptionRequest,
    LateClaimInfoResponse,
    CatalogAnimalResponse,
    JourneyPin,
    AnimalJourneyResponse,
    UserJourneyPetSummary,
    AdoptionResponse,
    SecureIdViewResponse,
    IdPurgeResponse,
    AdoptionVerificationRequest,
    AdoptionVerificationResponse,
    AdoptionInterviewScheduleRequest,
    AdoptionInterviewEvaluateRequest,
    AdoptionInterviewResponse,
    AdoptionHomeVisitScheduleRequest,
    AdoptionHomeVisitEvaluateRequest,
    AdoptionHomeVisitResponse,
    AdoptionReviewSubmitRequest,
    AdoptionDecisionRequest,
    AdoptionAgreementSignRequest,
    AdoptionCertificateResponse,
    AdoptionHandoverCompleteRequest,
    AdoptionMonitoringSubmitRequest,
    AdoptionMonitoringReviewRequest,
    AdoptionMonitoringLogResponse,
    AdoptionTimelineLogResponse,
    AdoptionDossierResponse,
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

    # Protect SPI: mask ID number and omit raw direct storage photo URL from general responses
    masked_id = mask_government_id_number(app.id_number, app.id_type)

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
        id_number=masked_id,
        id_photo_url=None,  # Do not leak raw storage URL in list/general responses
        has_id_uploaded=bool(app.id_photo_url),
        is_handed_over=app.is_handed_over,
        handover_date=app.handover_date,
        staff_handed_over=app.staff_handed_over,
        staff_handover_date=app.staff_handover_date,
        staff_handover_by=app.staff_handover_by,
        staff_handover_name=staff_name,
        created_pet_id=app.created_pet_id,
        cancellation_reason=getattr(app, 'cancellation_reason', None),
        cancelled_at=getattr(app, 'cancelled_at', None),
        current_stage=getattr(app, 'current_stage', 'Application') or 'Application',
        application_stage_status=getattr(app, 'application_stage_status', 'Submitted') or 'Submitted',
        agreement_signed_at=getattr(app, 'agreement_signed_at', None),
        agreement_signature_url=getattr(app, 'agreement_signature_url', None),
        certificate_id=getattr(app, 'certificate_id', None),
        handover_location=getattr(app, 'handover_location', None),
        handover_photo_url=getattr(app, 'handover_photo_url', None),
        post_monitoring_status=getattr(app, 'post_monitoring_status', 'Not_Started') or 'Not_Started',
    )


def _log_adoption_timeline(
    adoption_id: int,
    stage: str,
    action: str,
    performed_by: Optional[int],
    notes: Optional[str],
    db: Session,
):
    try:
        entry = AdoptionTimelineLog(
            adoption_id=adoption_id,
            stage=stage,
            action=action,
            performed_by=performed_by,
            notes=notes,
        )
        db.add(entry)
    except Exception as e:
        logger.warning(f"Could not log adoption timeline: {e}")


def _build_verification_response(ver: Optional[AdoptionVerification]) -> Optional[AdoptionVerificationResponse]:
    if not ver:
        return None
    return AdoptionVerificationResponse(
        verification_id=ver.verification_id,
        adoption_id=ver.adoption_id,
        verified_by=ver.verified_by,
        verifier_name=ver.verifier.name if ver.verifier else None,
        id_match_status=ver.id_match_status,
        residency_status=ver.residency_status,
        blacklist_checked=ver.blacklist_checked,
        is_blacklisted=ver.is_blacklisted,
        verification_notes=ver.verification_notes,
        verified_at=ver.verified_at,
    )


def _build_interview_response(iv: Optional[AdoptionInterview]) -> Optional[AdoptionInterviewResponse]:
    if not iv:
        return None
    return AdoptionInterviewResponse(
        interview_id=iv.interview_id,
        adoption_id=iv.adoption_id,
        interviewer_id=iv.interviewer_id,
        interviewer_name=iv.interviewer.name if iv.interviewer else None,
        scheduled_at=iv.scheduled_at,
        interview_mode=iv.interview_mode,
        meeting_link=iv.meeting_link,
        score_care_knowledge=iv.score_care_knowledge,
        score_financial_readiness=iv.score_financial_readiness,
        score_environment_suitability=iv.score_environment_suitability,
        total_score=float(iv.total_score) if iv.total_score is not None else None,
        recommendation=iv.recommendation,
        interview_notes=iv.interview_notes,
        conducted_at=iv.conducted_at,
    )


def _build_home_visit_response(hv: Optional[AdoptionHomeVisit]) -> Optional[AdoptionHomeVisitResponse]:
    if not hv:
        return None
    return AdoptionHomeVisitResponse(
        visit_id=hv.visit_id,
        adoption_id=hv.adoption_id,
        inspector_id=hv.inspector_id,
        inspector_name=hv.inspector.name if hv.inspector else None,
        visit_type=hv.visit_type,
        scheduled_date=hv.scheduled_date,
        is_fencing_secure=hv.is_fencing_secure,
        is_shelter_adequate=hv.is_shelter_adequate,
        hazard_free=hv.hazard_free,
        checklist_notes=hv.checklist_notes,
        gps_latitude=float(hv.gps_latitude) if hv.gps_latitude is not None else None,
        gps_longitude=float(hv.gps_longitude) if hv.gps_longitude is not None else None,
        visit_photos=hv.visit_photos if isinstance(hv.visit_photos, list) else [],
        inspection_result=hv.inspection_result,
        conducted_at=hv.conducted_at,
    )


def _build_certificate_response(cert: Optional[AdoptionCertificate], app: Adoption) -> Optional[AdoptionCertificateResponse]:
    if not cert:
        return None
    animal = app.animal
    return AdoptionCertificateResponse(
        certificate_id=cert.certificate_id,
        adoption_id=cert.adoption_id,
        certificate_number=cert.certificate_number,
        verification_hash=cert.verification_hash,
        pdf_url=cert.pdf_url,
        qr_code_url=cert.qr_code_url,
        issued_by=cert.issued_by,
        issuer_name=cert.issuer.name if cert.issuer else "Barangay Animal Services",
        issued_at=cert.issued_at,
        animal_name=animal.animal_name if animal else "Adopted Animal",
        adopter_name=app.full_name,
        animal_breed=animal.breed if animal else "Mixed Breed",
        animal_type=animal.animal_type if animal else "Pet",
    )


def _build_monitoring_response(log: AdoptionMonitoringLog) -> AdoptionMonitoringLogResponse:
    return AdoptionMonitoringLogResponse(
        log_id=log.log_id,
        adoption_id=log.adoption_id,
        milestone_name=log.milestone_name,
        due_date=str(log.due_date),
        submitted_at=log.submitted_at,
        status=log.status,
        health_status=log.health_status,
        photos=log.photos if isinstance(log.photos, list) else [],
        vet_record_url=log.vet_record_url,
        adopter_notes=log.adopter_notes,
        reviewed_by=log.reviewed_by,
        reviewer_name=log.reviewer.name if log.reviewer else None,
        review_notes=log.review_notes,
        reviewed_at=log.reviewed_at,
    )


def _build_timeline_response(tl: AdoptionTimelineLog) -> AdoptionTimelineLogResponse:
    return AdoptionTimelineLogResponse(
        timeline_id=tl.timeline_id,
        adoption_id=tl.adoption_id,
        stage=tl.stage,
        action=tl.action,
        performed_by=tl.performed_by,
        actor_name=tl.actor.name if tl.actor else None,
        notes=tl.notes,
        created_at=tl.created_at,
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

    # 6. Advance to Stage 9 (Post-Adoption Monitoring) and initialize 30-day milestones
    app.current_stage = "Monitoring"
    app.application_stage_status = "Handover_Completed"
    app.post_monitoring_status = "Active"

    existing_milestones = db.query(AdoptionMonitoringLog).filter(AdoptionMonitoringLog.adoption_id == app.adoption_id).all()
    if not existing_milestones:
        m7 = AdoptionMonitoringLog(
            adoption_id=app.adoption_id,
            milestone_name="Day_7",
            due_date=now.date() + timedelta(days=7),
            status="Pending",
        )
        m14 = AdoptionMonitoringLog(
            adoption_id=app.adoption_id,
            milestone_name="Day_14",
            due_date=now.date() + timedelta(days=14),
            status="Pending",
        )
        m30 = AdoptionMonitoringLog(
            adoption_id=app.adoption_id,
            milestone_name="Day_30",
            due_date=now.date() + timedelta(days=30),
            status="Pending",
        )
        db.add_all([m7, m14, m30])

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Handover",
        action="Physical Handover Completed",
        performed_by=app.staff_handover_by or current_user.user_id,
        notes=f"Animal successfully handed over to {app.full_name}. 1-Month Post-Adoption Welfare Monitoring initialized.",
        db=db,
    )

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


def _build_animal_journey_response(
    animal: HoldingAnimal,
    db: Session,
    current_user: Optional[User] = None,
    user_pets: Optional[List[UserJourneyPetSummary]] = None,
    user_adoption: Optional[Adoption] = None,
) -> AnimalJourneyResponse:
    """Helper to build unified journey map pins and response for an animal."""
    rep = animal.report
    photos = [m.file_url for m in rep.media if m.media_type == "Image" and m.file_url] if rep and rep.media else []

    pins: List[JourneyPin] = []

    # 1. Red Pin: Original Sighting / Rescue Origin
    if rep and rep.latitude is not None and rep.longitude is not None:
        date_str = rep.created_at.strftime("%b %d, %Y") if rep.created_at else None
        pins.append(
            JourneyPin(
                id="sighting",
                label="Original Sighting & Rescue",
                description=f"Spotted near {rep.landmark or 'community area'}",
                latitude=float(rep.latitude),
                longitude=float(rep.longitude),
                date=date_str,
                pin_color="red",
            )
        )

    # 2. Orange / Blue Pins: Intake, Medical & Holding Facility Movements
    if animal.timeline:
        for idx, event in enumerate(animal.timeline):
            if event.event_type in ["intake", "transfer", "relocation", "status_change", "medical"]:
                lat, lng = None, None
                if rep and rep.facility and rep.facility.latitude and rep.facility.longitude:
                    lat, lng = float(rep.facility.latitude), float(rep.facility.longitude)
                event_date = event.logged_at.strftime("%b %d, %Y") if event.logged_at else None
                pin_color = "orange" if event.event_type == "intake" else "blue"
                pins.append(
                    JourneyPin(
                        id=f"event_{event.log_id}_{idx}",
                        label=event.title or "Barangay Facility Protective Custody",
                        description=event.notes or "Animal in protective holding and care",
                        latitude=lat,
                        longitude=lng,
                        date=event_date,
                        pin_color=pin_color,
                    )
                )

    # 3. Check Adoption Record & Application Status
    approved_adoption = (
        db.query(Adoption)
        .filter(Adoption.holding_id == animal.holding_id, Adoption.status == "Approved")
        .order_by(Adoption.reviewed_at.desc())
        .first()
    )

    # If current user has their own application for this pet, use it
    if not user_adoption and current_user:
        user_adoption = (
            db.query(Adoption)
            .filter(Adoption.holding_id == animal.holding_id, Adoption.applicant_id == current_user.user_id)
            .order_by(Adoption.created_at.desc())
            .first()
        )

    is_user_applicant = bool(user_adoption and current_user and user_adoption.applicant_id == current_user.user_id)
    is_staff_or_admin = bool(current_user and current_user.role_id in [2, 3, 4])
    is_adopted = animal.facility_status == 7 or (approved_adoption is not None and (approved_adoption.is_handed_over or approved_adoption.staff_handed_over))

    adopter_name_public: Optional[str] = None
    adopter_date: Optional[str] = None
    adopter_area: Optional[str] = None
    adopter_name_full: Optional[str] = None
    adopter_contact: Optional[str] = None
    adopter_address: Optional[str] = None
    application_status: Optional[str] = None

    active_target_adoption = user_adoption if is_user_applicant else approved_adoption

    if active_target_adoption:
        application_status = active_target_adoption.status
        adopter_name_public = _mask_name(active_target_adoption.full_name)
        if active_target_adoption.reviewed_at:
            adopter_date = active_target_adoption.reviewed_at.strftime("%b %d, %Y")
        elif active_target_adoption.created_at:
            adopter_date = active_target_adoption.created_at.strftime("%b %d, %Y")

        if active_target_adoption.address:
            addr_parts = active_target_adoption.address.split(",")
            adopter_area = addr_parts[-1].strip() if addr_parts else "Metro Area"

        # If user is the applicant, show their own info without masking
        if is_user_applicant:
            adopter_name_public = active_target_adoption.full_name
            adopter_name_full = active_target_adoption.full_name
            adopter_contact = active_target_adoption.contact_no
            adopter_address = active_target_adoption.address
        elif is_staff_or_admin:
            adopter_name_full = active_target_adoption.full_name
            adopter_contact = active_target_adoption.contact_no
            adopter_address = active_target_adoption.address

        # Pin for user application or approved adoption outcome
        if active_target_adoption.status == "Approved" or is_adopted:
            pins.append(
                JourneyPin(
                    id="adoption_outcome",
                    label="Adopted into Loving Home" if is_adopted else "Adoption Application Approved",
                    description=f"{'Adopted by ' + adopter_name_public if is_adopted else 'Approved for ' + adopter_name_public} on {adopter_date or 'Recent'}",
                    latitude=None,
                    longitude=None,
                    date=adopter_date,
                    pin_color="green",
                )
            )
        elif is_user_applicant and active_target_adoption.status == "Pending":
            pins.append(
                JourneyPin(
                    id="adoption_pending",
                    label="Adoption Application Under Review",
                    description=f"Your adoption application is currently being evaluated by Barangay Animal Services.",
                    latitude=None,
                    longitude=None,
                    date=adopter_date,
                    pin_color="orange",
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
        application_status=application_status,
        pins=pins,
        user_pets=user_pets or [],
    )


# ── GET /adoptions/my-journey ────────────────────────────────────────────────
@router.get("/my-journey", response_model=AnimalJourneyResponse)
def get_my_animal_journey(
    holding_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authenticated user Journey Trail endpoint.
    Retrieves the journey data scoped strictly to the currently logged-in user.
    """
    # 1. Fetch user's adoption applications
    user_apps = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
        )
        .filter(Adoption.applicant_id == current_user.user_id)
        .order_by(Adoption.created_at.desc())
        .all()
    )

    # Build pet summary list for switching between user's pets
    user_pets: List[UserJourneyPetSummary] = []
    seen_holdings = set()
    for app in user_apps:
        if app.holding_id and app.holding_id not in seen_holdings:
            seen_holdings.add(app.holding_id)
            anim = app.animal
            photo = None
            if anim and anim.report and anim.report.media:
                imgs = [m.file_url for m in anim.report.media if m.media_type == "Image" and m.file_url]
                photo = imgs[0] if imgs else None

            user_pets.append(
                UserJourneyPetSummary(
                    holding_id=app.holding_id,
                    animal_name=anim.animal_name if anim else f"Rescue #{app.holding_id}",
                    animal_type=anim.animal_type if anim else "Rescue Pet",
                    breed=anim.breed if anim else None,
                    photo=photo,
                    application_status=app.status,
                    is_adopted=(app.status == "Approved" and (app.is_handed_over or app.staff_handed_over)) or (anim.facility_status == 7 if anim else False),
                    adoption_id=app.adoption_id,
                )
            )

    # If user has no adoption applications:
    if not user_apps:
        # Check if staff or admin
        if current_user.role_id in [2, 3, 4] and holding_id:
            # Staff can inspect specific animal
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
            return _build_animal_journey_response(animal, db, current_user, user_pets=[])

        raise HTTPException(
            status_code=404,
            detail="No journey records found. You do not have any adoption applications or rescue journey records yet."
        )

    # Determine which application to display
    target_app: Optional[Adoption] = None
    if holding_id:
        target_app = next((a for a in user_apps if a.holding_id == holding_id), None)
        if not target_app and current_user.role_id not in [2, 3, 4]:
            raise HTTPException(
                status_code=404,
                detail="No journey records found for this animal in your account."
            )
    else:
        # Pick primary: prefer Approved > Pending > others
        approved_app = next((a for a in user_apps if a.status == "Approved"), None)
        pending_app = next((a for a in user_apps if a.status == "Pending"), None)
        target_app = approved_app or pending_app or user_apps[0]

    target_holding_id = target_app.holding_id if target_app else holding_id
    if not target_holding_id:
        raise HTTPException(status_code=404, detail="No journey records found.")

    animal = (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
        )
        .filter(HoldingAnimal.holding_id == target_holding_id)
        .first()
    )
    if not animal:
        raise HTTPException(status_code=404, detail="Animal record not found.")

    return _build_animal_journey_response(
        animal=animal,
        db=db,
        current_user=current_user,
        user_pets=user_pets,
        user_adoption=target_app,
    )


# ── GET /adoptions/journey/{holding_id} ──────────────────────────────────────
@router.get("/journey/{holding_id}", response_model=AnimalJourneyResponse)
def get_animal_journey(
    holding_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Animal Journey Map endpoint — public views masked adopter info, staff and applicant view authenticated data."""
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

    user_pets: List[UserJourneyPetSummary] = []
    user_adoption: Optional[Adoption] = None

    if current_user:
        user_apps = (
            db.query(Adoption)
            .options(
                joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            )
            .filter(Adoption.applicant_id == current_user.user_id)
            .order_by(Adoption.created_at.desc())
            .all()
        )
        user_adoption = next((a for a in user_apps if a.holding_id == holding_id), None)
        seen = set()
        for app in user_apps:
            if app.holding_id and app.holding_id not in seen:
                seen.add(app.holding_id)
                anim = app.animal
                photo = None
                if anim and anim.report and anim.report.media:
                    imgs = [m.file_url for m in anim.report.media if m.media_type == "Image" and m.file_url]
                    photo = imgs[0] if imgs else None
                user_pets.append(
                    UserJourneyPetSummary(
                        holding_id=app.holding_id,
                        animal_name=anim.animal_name if anim else f"Rescue #{app.holding_id}",
                        animal_type=anim.animal_type if anim else "Rescue Pet",
                        breed=anim.breed if anim else None,
                        photo=photo,
                        application_status=app.status,
                        is_adopted=(app.status == "Approved" and (app.is_handed_over or app.staff_handed_over)) or (anim.facility_status == 7 if anim else False),
                        adoption_id=app.adoption_id,
                    )
                )

    return _build_animal_journey_response(
        animal=animal,
        db=db,
        current_user=current_user,
        user_pets=user_pets,
        user_adoption=user_adoption,
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

    # Business rule: Deceased (4), Claimed (3), Transferred (5), Adopted (7), or Impounded (8) cannot be promoted
    if animal.facility_status in [3, 4, 5, 7, 8] or (animal.report and animal.report.custody_status == "Impounded") or (animal.report and animal.report.current_status_id == 8):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot promote an animal that is Impounded, resolved, deceased, or claimed (status={animal.facility_status}). Impounded animals cannot be adopted.",
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
    current_user: User = Depends(get_current_user),
):
    """
    Upload, sanitize, EXIF-strip, and forensically watermark Government ID document image
    strictly for adoption identity verification under RA 10173.
    """
    content = await file.read()
    file_bytes, unique_filename = validate_and_sanitize_id_image(
        content,
        file.filename or "",
        file.content_type
    )

    # Strip EXIF/GPS metadata and burn permanent forensic watermark
    watermarked_bytes = secure_process_government_id(
        file_bytes=file_bytes,
        applicant_name=current_user.name or "Citizen",
        applicant_id=current_user.user_id
    )

    # Upload with authenticated / restricted access
    upload_res = upload_secure_adoption_id(watermarked_bytes, unique_filename)
    if not upload_res or not upload_res.get("secure_url"):
        raise HTTPException(status_code=500, detail="Failed to securely upload ID document. Please try again.")

    return {
        "url": upload_res["secure_url"],
        "public_id": upload_res.get("public_id")
    }


# ── POST /adoptions/apply ────────────────────────────────────────────────────
@router.post("/apply", status_code=status.HTTP_201_CREATED)
def apply_for_adoption(
    req: AdoptionApplyRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Citizen submits an adoption application for an animal listed in status 6."""
    logger.info(f"[ADOPTION APPLY] Request: holding_id={req.holding_id}, user={current_user.user_id}, full_name={req.full_name}")
    animal = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == req.holding_id).first()
    if not animal:
        logger.warning(f"[ADOPTION APPLY] Animal not found for holding_id={req.holding_id}")
        raise HTTPException(status_code=404, detail="Animal not found")

    logger.info(f"[ADOPTION APPLY] Animal facility_status={animal.facility_status}, custody_status={animal.report.custody_status if animal.report else 'N/A'}")
    if animal.facility_status != 6 or (animal.report and animal.report.custody_status == "Impounded") or animal.facility_status == 8:
        logger.warning(f"[ADOPTION APPLY] Animal not available: facility_status={animal.facility_status}")
        raise HTTPException(status_code=400, detail="This animal is currently Impounded or not available for public adoption. Impounded animals cannot be adopted.")

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

    # Encrypt sensitive Government ID number with Fernet AES-256
    encrypted_id = encrypt_id_number(req.id_number)

    new_app = Adoption(
        holding_id=req.holding_id,
        applicant_id=current_user.user_id,
        status="Pending",
        current_stage="Application",
        application_stage_status="Submitted",
        full_name=req.full_name,
        address=req.address,
        contact_no=req.contact_no,
        has_other_pets=final_has_other_pets,
        living_space=req.living_space,
        reason=req.reason,
        id_type=req.id_type,
        id_number=encrypted_id,
        id_photo_url=req.id_photo_url,
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)

    _log_adoption_timeline(
        adoption_id=new_app.adoption_id,
        stage="Application",
        action="Application Submitted",
        performed_by=current_user.user_id,
        notes="Citizen submitted initial adoption application.",
        db=db,
    )
    db.commit()

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
    current_user: User = Depends(get_current_user),
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

    if decision == "Rejected" and (not req.review_notes or not req.review_notes.strip()):
        raise HTTPException(status_code=400, detail="A reason is required when rejecting an adoption application.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.status = decision
    app.reviewed_by = current_user.user_id
    app.reviewer_role = "Barangay Head Officer" if current_user.role_id == 3 else "Admin"
    app.review_notes = req.review_notes.strip() if req.review_notes else None
    app.reviewed_at = now

    animal = app.animal

    if decision == "Approved":
        app.current_stage = "Certificate"
        app.application_stage_status = "Approved_Pending_Agreement"

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
            other.application_stage_status = "Rejected"
            other.reviewed_by = current_user.user_id
            other.reviewer_role = app.reviewer_role
            other.reviewed_at = now
            other.review_notes = "Another applicant was approved for this pet."
            _log_adoption_timeline(
                adoption_id=other.adoption_id,
                stage="Approval",
                action="Application Closed (Other Applicant Approved)",
                performed_by=current_user.user_id,
                notes="Another applicant was approved for this pet.",
                db=db,
            )
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
            notes=f"Adoption application #{app.adoption_id} approved by {current_user.name}. Animal awaiting agreement signing and physical handover.",
            logged_by=current_user.user_id,
        )
        db.add(timeline_entry)

        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Approval",
            action="Application Officially Approved",
            performed_by=current_user.user_id,
            notes=f"Approved by {current_user.name}. Adopter invited to sign digital agreement and receive certificate.",
            db=db,
        )

        # 3. Notify winning adopter
        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Adoption Application Approved! 🎉",
                message=f"Congratulations! Your adoption application for {animal.animal_name or 'your new pet'} has been Approved. Please sign your Digital Adoption Agreement to receive your official certificate.",
                notification_type="adoption_approved",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

    else:
        # Rejected with mandatory reason
        app.application_stage_status = "Rejected"
        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Approval",
            action="Application Rejected",
            performed_by=current_user.user_id,
            notes=f"Rejected by {current_user.name}. Reason: {app.review_notes}",
            db=db,
        )

        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Adoption Application Update",
                message=f"Your adoption application for {animal.animal_name or 'pet'} was not approved. Reason: {app.review_notes}",
                notification_type="adoption_rejected",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

        # Timeline entry for rejection
        if animal:
            try:
                timeline_entry = HoldingTimeline(
                    holding_id=animal.holding_id,
                    event_type="observation",
                    title=f"Adoption Application Rejected — {app.full_name}",
                    notes=f"Adoption application #{app.adoption_id} rejected by {current_user.name}. Reason: {app.review_notes}",
                    logged_by=current_user.user_id,
                )
                db.add(timeline_entry)
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
    current_user: User = Depends(get_current_user),
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


# ── POST /adoptions/{adoption_id}/cancel ─────────────────────────────────────
@router.post("/{adoption_id}/cancel")
def cancel_adoption_application(
    adoption_id: int,
    body: AdoptionCancelRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Applicant cancels their pending or approved adoption application."""
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found")

    # Only applicant or system admin can cancel
    if app.applicant_id != current_user.user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel adoption applications submitted from your own account."
        )

    if app.status == "Cancelled":
        raise HTTPException(status_code=400, detail="This application has already been cancelled.")

    if app.status == "Approved" and app.is_handed_over and app.staff_handed_over:
        raise HTTPException(status_code=400, detail="Cannot cancel an application that has already completed physical handover and adoption.")

    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A cancellation reason is required.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.status = "Cancelled"
    app.cancellation_reason = reason
    app.cancelled_at = now

    # Log milestone timeline if animal exists
    if app.holding_id:
        timeline_entry = HoldingTimeline(
            holding_id=app.holding_id,
            event_type="status_change",
            title=f"Adoption Cancelled — {app.full_name}",
            notes=f"Adoption application #{app.adoption_id} was cancelled by applicant. Reason: {reason}",
            logged_by=current_user.user_id,
        )
        db.add(timeline_entry)

    # Notify Barangay Head Officer / Staff
    try:
        head_officers = db.query(User).filter(User.role_id == 3, User.is_head_officer == True).all()
        for ho in head_officers:
            notif = Notification(
                user_id=ho.user_id,
                title="Adoption Application Cancelled",
                message=f"Applicant {app.full_name} cancelled adoption application #{app.adoption_id}. Reason: {reason}",
                notification_type="adoption_cancelled",
                related_id=app.adoption_id,
            )
            db.add(notif)
    except Exception:
        pass

    log_activity(
        db=db,
        action="CANCEL_ADOPTION_APPLICATION",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"Applicant {current_user.name} cancelled adoption application #{app.adoption_id}. Reason: {reason}",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {
        "message": "Adoption application cancelled successfully.",
        "adoption_id": app.adoption_id,
        "status": "Cancelled",
        "cancellation_reason": reason,
    }


# ── GET /adoptions/{adoption_id}/secure-id-view ──────────────────────────────
@router.get("/{adoption_id}/secure-id-view", response_model=SecureIdViewResponse)
def get_secure_id_view(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Protected ephemeral Government ID viewing endpoint.
    Verifies strict RBAC:
    - Applicant themselves
    - Barangay Staff (Role 3) in applicant's jurisdiction
    - Admin (Role 4)
    Records an immutable audit log and returns a short-lived signed URL (5-minute expiration).
    """
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    is_applicant = (current_user.user_id == app.applicant_id)
    is_admin = (current_user.role_id == 4)
    is_staff = (current_user.role_id == 3 and _can_manage_adoption(current_user, app.animal, db))

    if not (is_applicant or is_admin or is_staff):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You do not have authorization to view this applicant's Government ID."
        )

    if not app.id_photo_url:
        raise HTTPException(status_code=404, detail="No Government ID document was submitted for this application.")

    signed_url = generate_ephemeral_id_url(app.id_photo_url, ttl_seconds=300)
    masked_id = mask_government_id_number(app.id_number, app.id_type)

    # Log viewing audit trail
    log_activity(
        db=db,
        action="VIEW_GOVERNMENT_ID",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"User '{current_user.name}' (Role {current_user.role_id}, User #{current_user.user_id}) viewed Government ID ({app.id_type}) for applicant '{app.full_name}' (App #{app.adoption_id}).",
        log_type="security",
        user_id=current_user.user_id,
        request=http_req,
    )

    return SecureIdViewResponse(
        temporary_url=signed_url,
        expires_in_seconds=300,
        masked_id=masked_id,
        id_type=app.id_type,
        applicant_name=app.full_name,
    )


# ── POST /adoptions/purge-expired-ids ────────────────────────────────────────
@router.post("/purge-expired-ids", response_model=IdPurgeResponse)
def run_adoption_id_purge(
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Execute RA 10173 compliance purge for expired Government IDs:
    - Purges rejected/cancelled application IDs older than 30 days.
    - Purges finalized application IDs older than 90 days.
    Restricted to Barangay Head Officers and Admins.
    """
    if current_user.role_id == 2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subdivision Leaders cannot execute ID retention purges.")
    
    if current_user.role_id == 3 and not getattr(current_user, 'is_head_officer', False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Barangay Head Officers or Admins can trigger ID retention purges.")

    purge_result = purge_expired_adoption_ids(db)

    log_activity(
        db=db,
        action="EXECUTE_ID_RETENTION_PURGE",
        target_table="adoptions",
        description=f"User '{current_user.name}' executed Government ID retention purge. Purged: {purge_result['total_purged']} records.",
        log_type="security",
        user_id=current_user.user_id,
        request=http_req,
    )

    return IdPurgeResponse(**purge_result)


# ==============================================================================
# 9-STAGE ADOPTION LIFECYCLE PIPELINE & STAGE TRANSITIONS
# ==============================================================================

# ── GET /adoptions/pipeline ──────────────────────────────────────────────────
@router.get("/pipeline", response_model=List[AdoptionResponse])
def get_adoption_pipeline(
    stage: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Staff/Admin view for 9-Stage Adoption Pipeline with filtering."""
    if current_user.role_id == 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subdivision Leaders do not manage the full adoption pipeline.",
        )

    query = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
            joinedload(Adoption.reviewer),
            joinedload(Adoption.handover_staff),
            joinedload(Adoption.verification),
            joinedload(Adoption.interview),
            joinedload(Adoption.home_visit),
            joinedload(Adoption.certificate),
            joinedload(Adoption.monitoring_logs),
        )
    )

    if current_user.role_id == 3:
        query = (
            query.join(HoldingAnimal, Adoption.holding_id == HoldingAnimal.holding_id)
            .join(Report, HoldingAnimal.report_id == Report.report_id)
            .join(Subdivision, Report.subdivision_id == Subdivision.subdivision_id)
            .filter(Subdivision.barangay_id == current_user.barangay_id)
        )

    if stage:
        query = query.filter(Adoption.current_stage == stage)

    if status_filter:
        query = query.filter(Adoption.status == status_filter)

    apps = query.order_by(Adoption.created_at.desc()).all()
    return [_build_adoption_response(app) for app in apps]


# ── POST /adoptions/{adoption_id}/verify (Stage 2) ───────────────────────────
@router.post("/{adoption_id}/verify", response_model=AdoptionVerificationResponse)
def verify_adoption_application(
    adoption_id: int,
    req: AdoptionVerificationRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 2: Verification of Government ID, residency, and blacklist status."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not _can_manage_adoption(current_user, app.animal, db):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    ver = db.query(AdoptionVerification).filter(AdoptionVerification.adoption_id == adoption_id).first()
    if not ver:
        ver = AdoptionVerification(adoption_id=adoption_id)
        db.add(ver)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    ver.verified_by = current_user.user_id
    ver.id_match_status = req.id_match_status
    ver.residency_status = req.residency_status
    ver.blacklist_checked = req.blacklist_checked
    ver.is_blacklisted = req.is_blacklisted
    ver.verification_notes = req.verification_notes
    ver.verified_at = now

    decision = req.decision.strip()
    if decision == "Pass":
        app.current_stage = "Interview"
        app.application_stage_status = "Verification_Passed"
        action = "Identity & Background Verified"
        notes = "Citizen identity and residency confirmed. Advancing to Stage 3 (Interview)."
    elif decision == "Fail":
        app.status = "Rejected"
        app.application_stage_status = "Verification_Failed"
        app.review_notes = req.rejection_reason or req.verification_notes or "Verification failed."
        action = "Verification Failed"
        notes = app.review_notes
    else:
        app.application_stage_status = "Pending_Documents"
        action = "Additional Documents Requested"
        notes = req.verification_notes or "Additional proof of identity or residency requested."

    _log_adoption_timeline(app.adoption_id, "Verification", action, current_user.user_id, notes, db)

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title=f"Adoption Verification: {action}",
            message=f"Update on your application #{app.adoption_id}: {notes}",
            notification_type="adoption_update",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    log_activity(
        db=db,
        action="VERIFY_ADOPTION_APPLICATION",
        target_table="adoption_verifications",
        target_id=app.adoption_id,
        description=f"{current_user.name} evaluated Stage 2 Verification for Adoption #{app.adoption_id} ({decision}).",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(ver)
    return _build_verification_response(ver)


# ── POST /adoptions/{adoption_id}/interview/schedule (Stage 3 Schedule) ──────
@router.post("/{adoption_id}/interview/schedule", response_model=AdoptionInterviewResponse)
def schedule_adoption_interview(
    adoption_id: int,
    req: AdoptionInterviewScheduleRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 3: Schedule Interview (In-Person or Video Call)."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not _can_manage_adoption(current_user, app.animal, db):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    iv = db.query(AdoptionInterview).filter(AdoptionInterview.adoption_id == adoption_id).first()
    if not iv:
        iv = AdoptionInterview(adoption_id=adoption_id)
        db.add(iv)

    iv.interviewer_id = current_user.user_id
    iv.scheduled_at = req.scheduled_at
    iv.interview_mode = req.interview_mode
    iv.meeting_link = req.meeting_link
    iv.interview_notes = req.notes

    app.current_stage = "Interview"
    app.application_stage_status = "Interview_Scheduled"

    _log_adoption_timeline(
        app.adoption_id,
        "Interview",
        "Interview Scheduled",
        current_user.user_id,
        f"Mode: {req.interview_mode} scheduled for {req.scheduled_at.strftime('%Y-%m-%d %H:%M')}",
        db,
    )

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Interview Scheduled 📅",
            message=f"Your adoption interview has been scheduled for {req.scheduled_at.strftime('%B %d, %Y at %I:%M %p')} ({req.interview_mode}).",
            notification_type="adoption_interview_scheduled",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(iv)
    return _build_interview_response(iv)


# ── POST /adoptions/{adoption_id}/interview/evaluate (Stage 3 Evaluate) ──────
@router.post("/{adoption_id}/interview/evaluate", response_model=AdoptionInterviewResponse)
def evaluate_adoption_interview(
    adoption_id: int,
    req: AdoptionInterviewEvaluateRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 3: Submit 1-5 Rubric Scoring and Recommendation for Interview."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not _can_manage_adoption(current_user, app.animal, db):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    iv = db.query(AdoptionInterview).filter(AdoptionInterview.adoption_id == adoption_id).first()
    if not iv:
        iv = AdoptionInterview(adoption_id=adoption_id)
        db.add(iv)

    total = req.score_care_knowledge + req.score_financial_readiness + req.score_environment_suitability
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    iv.interviewer_id = current_user.user_id
    iv.score_care_knowledge = req.score_care_knowledge
    iv.score_financial_readiness = req.score_financial_readiness
    iv.score_environment_suitability = req.score_environment_suitability
    iv.total_score = Decimal(total)
    iv.recommendation = req.recommendation
    iv.interview_notes = req.interview_notes
    iv.conducted_at = now

    rec = req.recommendation.strip()
    if rec == "Recommended":
        app.current_stage = "Home_Visit"
        app.application_stage_status = "Interview_Passed"
        action = "Interview Passed"
        notes = f"Rubric Score: {total}/15. Recommendation: Recommended. Advancing to Stage 4 Home Visit."
    elif rec == "Not_Recommended":
        app.status = "Rejected"
        app.application_stage_status = "Interview_Failed"
        app.review_notes = req.interview_notes or "Interview criteria not satisfied."
        action = "Interview Failed"
        notes = app.review_notes
    else:
        app.application_stage_status = "Interview_Conditional"
        action = "Interview Conditional"
        notes = req.interview_notes or "Follow-up discussion required."

    _log_adoption_timeline(app.adoption_id, "Interview", action, current_user.user_id, notes, db)

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title=f"Adoption Interview Result: {action}",
            message=f"Update for application #{app.adoption_id}: {notes}",
            notification_type="adoption_update",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(iv)
    return _build_interview_response(iv)


# ── POST /adoptions/{adoption_id}/home-visit/schedule (Stage 4 Schedule) ─────
@router.post("/{adoption_id}/home-visit/schedule", response_model=AdoptionHomeVisitResponse)
def schedule_adoption_home_visit(
    adoption_id: int,
    req: AdoptionHomeVisitScheduleRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 4: Schedule Home Visit (Authorized Staff or Subdivision Leader)."""
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(status_code=403, detail="Permission Denied.")

    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    hv = db.query(AdoptionHomeVisit).filter(AdoptionHomeVisit.adoption_id == adoption_id).first()
    if not hv:
        hv = AdoptionHomeVisit(adoption_id=adoption_id)
        db.add(hv)

    hv.inspector_id = current_user.user_id
    hv.scheduled_date = req.scheduled_date
    hv.visit_type = req.visit_type
    hv.checklist_notes = req.notes

    app.current_stage = "Home_Visit"
    app.application_stage_status = "Home_Visit_Scheduled"

    _log_adoption_timeline(
        app.adoption_id,
        "Home_Visit",
        "Home Visit Scheduled",
        current_user.user_id,
        f"Mode: {req.visit_type} on {req.scheduled_date.strftime('%Y-%m-%d')}",
        db,
    )

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Home Visit Scheduled 🏡",
            message=f"A home environment inspection has been scheduled for {req.scheduled_date.strftime('%B %d, %Y')}.",
            notification_type="adoption_home_visit_scheduled",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(hv)
    return _build_home_visit_response(hv)


# ── POST /adoptions/{adoption_id}/home-visit/evaluate (Stage 4 Evaluate) ─────
@router.post("/{adoption_id}/home-visit/evaluate", response_model=AdoptionHomeVisitResponse)
def evaluate_adoption_home_visit(
    adoption_id: int,
    req: AdoptionHomeVisitEvaluateRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 4: Evaluate Home Visit with checklist, GPS, and photos."""
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(status_code=403, detail="Permission Denied.")

    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    hv = db.query(AdoptionHomeVisit).filter(AdoptionHomeVisit.adoption_id == adoption_id).first()
    if not hv:
        hv = AdoptionHomeVisit(adoption_id=adoption_id)
        db.add(hv)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    hv.inspector_id = current_user.user_id
    hv.is_fencing_secure = req.is_fencing_secure
    hv.is_shelter_adequate = req.is_shelter_adequate
    hv.hazard_free = req.hazard_free
    hv.checklist_notes = req.checklist_notes
    hv.gps_latitude = Decimal(str(req.gps_latitude)) if req.gps_latitude is not None else None
    hv.gps_longitude = Decimal(str(req.gps_longitude)) if req.gps_longitude is not None else None
    hv.visit_photos = req.visit_photos
    hv.inspection_result = req.inspection_result
    hv.conducted_at = now

    res = req.inspection_result.strip()
    if res == "Passed":
        app.current_stage = "Review"
        app.application_stage_status = "Home_Visit_Passed"
        action = "Home Visit Passed"
        notes = "Living space, fence security, and shelter adequacy confirmed. Advancing to Stage 5 Review."
    elif res == "Failed":
        app.status = "Rejected"
        app.application_stage_status = "Home_Visit_Failed"
        app.review_notes = req.checklist_notes or "Home environment inspection failed."
        action = "Home Visit Failed"
        notes = app.review_notes
    else:
        app.application_stage_status = "Home_Visit_Needs_Fix"
        action = "Home Visit Adjustments Required"
        notes = req.checklist_notes or "Applicant needs to address environmental/fencing safety items."

    _log_adoption_timeline(app.adoption_id, "Home_Visit", action, current_user.user_id, notes, db)

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title=f"Adoption Home Visit Result: {action}",
            message=f"Update for application #{app.adoption_id}: {notes}",
            notification_type="adoption_update",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(hv)
    return _build_home_visit_response(hv)


# ── POST /adoptions/{adoption_id}/review/submit (Stage 5 Review) ────────────
@router.post("/{adoption_id}/review/submit")
def submit_adoption_review(
    adoption_id: int,
    req: AdoptionReviewSubmitRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 5: Submit consolidated dossier review notes for final approval."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not _can_manage_adoption(current_user, app.animal, db):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    app.current_stage = "Approval"
    app.application_stage_status = "Pending_Final_Approval"
    app.review_notes = req.review_notes

    _log_adoption_timeline(
        app.adoption_id,
        "Review",
        f"Consolidated Review Submitted ({req.recommendation})",
        current_user.user_id,
        req.review_notes,
        db,
    )

    db.commit()
    return {"message": "Review notes recorded. Forwarded for Stage 6 Final Approval.", "current_stage": app.current_stage}


# ── POST /adoptions/{adoption_id}/approve (Stage 6 Approval Alias) ───────────
@router.post("/{adoption_id}/approve")
def approve_or_reject_adoption(
    adoption_id: int,
    req: AdoptionDecisionRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 6: Head Officer or Admin official decision on adoption."""
    from app.schemas.adoption import AdoptionReviewRequest
    return review_adoption_application(
        adoption_id=adoption_id,
        req=AdoptionReviewRequest(decision=req.decision, review_notes=req.review_notes),
        http_req=http_req,
        db=db,
        current_user=current_user,
    )


# ── POST /adoptions/{adoption_id}/agreement/sign (Stage 7 Digital Signature) ─
@router.post("/{adoption_id}/agreement/sign", response_model=AdoptionCertificateResponse)
def sign_adoption_agreement(
    adoption_id: int,
    req: AdoptionAgreementSignRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 7: Adopter signs Digital Agreement; generates Certificate with SHA-256 hash & QR code."""
    app = (
        db.query(Adoption)
        .options(joinedload(Adoption.animal))
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if app.applicant_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the applicant can sign the adoption agreement.")

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only officially approved applications can be signed.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.agreement_signed_at = now
    app.agreement_signature_url = req.signature_data_url
    app.current_stage = "Handover"
    app.application_stage_status = "Agreement_Signed"

    # Generate or update AdoptionCertificate
    cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == adoption_id).first()
    cert_number = cert.certificate_number if cert else f"CERT-ADOPT-{adoption_id}-{now.strftime('%Y%m%d%H%M')}"
    animal = app.animal
    animal_name = animal.animal_name if animal else "Animal"
    applicant_name = app.full_name

    raw_hash_data = f"{cert_number}:{adoption_id}:{animal_name}:{applicant_name}:{now.isoformat()}"
    verification_hash = hashlib.sha256(raw_hash_data.encode("utf-8")).hexdigest()

    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr_data = f"STRAYSAFE-CERT|{cert_number}|{adoption_id}|{verification_hash[:16]}"
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    if not cert:
        cert = AdoptionCertificate(
            adoption_id=adoption_id,
            certificate_number=cert_number,
            verification_hash=verification_hash,
            pdf_url=f"/adoptions/{adoption_id}/certificate",
            qr_code_url=qr_b64,
            issued_by=app.reviewed_by or current_user.user_id,
            issued_at=now,
        )
        db.add(cert)
        db.flush()
    else:
        cert.verification_hash = verification_hash
        cert.qr_code_url = qr_b64
        cert.issued_at = now

    app.certificate_id = cert.certificate_id

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Certificate",
        action="Digital Agreement Signed & Certificate Issued",
        performed_by=current_user.user_id,
        notes=f"Adoption agreement signed by {applicant_name}. Official Certificate #{cert_number} generated.",
        db=db,
    )

    # Notify Head Officer / Staff
    try:
        head_officers = db.query(User).filter(User.role_id == 3, User.is_head_officer == True).all()
        for ho in head_officers:
            notif = Notification(
                user_id=ho.user_id,
                title="Adoption Agreement Signed",
                message=f"Adopter {app.full_name} has signed their adoption agreement. Pet {animal_name} is ready for physical handover.",
                notification_type="adoption_agreement_signed",
                related_id=app.adoption_id,
            )
            db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(cert)
    return _build_certificate_response(cert, app)


# ── GET /adoptions/{adoption_id}/certificate (Stage 7 Certificate View) ───────
@router.get("/{adoption_id}/certificate", response_model=AdoptionCertificateResponse)
def get_adoption_certificate(
    adoption_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve official adoption certificate with SHA-256 integrity hash and QR code."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not (app.applicant_id == current_user.user_id or current_user.role_id in [3, 4]):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == adoption_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Adoption certificate not yet generated. Agreement must be signed first.")

    return _build_certificate_response(cert, app)


# ── POST /adoptions/{adoption_id}/handover/complete (Stage 8 Handover) ───────
@router.post("/{adoption_id}/handover/complete")
def complete_adoption_handover(
    adoption_id: int,
    req: AdoptionHandoverCompleteRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 8: Physical handover with location, photo proof, and immediate transition to Monitoring."""
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
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only Approved applications can complete pet handover.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.handover_location = req.handover_location or "Barangay Holding Facility"
    app.handover_photo_url = req.handover_photo_url
    app.staff_handed_over = True
    app.staff_handover_date = now
    app.staff_handover_by = current_user.user_id
    app.is_handed_over = True
    app.handover_date = now

    completed = _finalize_adoption_if_ready(app, db, current_user, notes=req.notes)

    log_activity(
        db=db,
        action="COMPLETE_ADOPTION_HANDOVER",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"Staff {current_user.name} completed physical handover for Adoption #{app.adoption_id} with photographic evidence.",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {
        "message": "Physical handover successfully documented! 1-Month Welfare Monitoring initiated.",
        "is_completed": completed,
        "current_stage": app.current_stage,
    }


# ── GET /adoptions/{adoption_id}/monitoring (Stage 9 Logs) ───────────────────
@router.get("/{adoption_id}/monitoring", response_model=List[AdoptionMonitoringLogResponse])
def get_adoption_monitoring_logs(
    adoption_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve 30-Day Welfare Monitoring milestone logs (Day 7, Day 14, Day 30)."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not (app.applicant_id == current_user.user_id or current_user.role_id in [3, 4]):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    logs = (
        db.query(AdoptionMonitoringLog)
        .options(joinedload(AdoptionMonitoringLog.reviewer))
        .filter(AdoptionMonitoringLog.adoption_id == adoption_id)
        .order_by(AdoptionMonitoringLog.due_date)
        .all()
    )
    return [_build_monitoring_response(l) for l in logs]


# ── POST /adoptions/{adoption_id}/monitoring/{milestone_name}/submit ─────────
@router.post("/{adoption_id}/monitoring/{milestone_name}/submit", response_model=AdoptionMonitoringLogResponse)
def submit_adoption_monitoring_checkin(
    adoption_id: int,
    milestone_name: str,
    req: AdoptionMonitoringSubmitRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 9: Citizen submits pet welfare photo & health status check-in."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if app.applicant_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only submit monitoring check-ins for your own adopted pet.")

    log = (
        db.query(AdoptionMonitoringLog)
        .filter(
            AdoptionMonitoringLog.adoption_id == adoption_id,
            AdoptionMonitoringLog.milestone_name == milestone_name,
        )
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail=f"Monitoring milestone '{milestone_name}' not found for this adoption.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    log.health_status = req.health_status
    log.photos = req.photos
    log.vet_record_url = req.vet_record_url
    log.adopter_notes = req.adopter_notes
    log.submitted_at = now
    log.status = "Submitted"

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Monitoring",
        action=f"Welfare Check-in Submitted ({milestone_name.replace('_', ' ')})",
        performed_by=current_user.user_id,
        notes=f"Health: {req.health_status}. Photos provided: {len(req.photos)}. Notes: {req.adopter_notes or 'None'}",
        db=db,
    )

    try:
        head_officers = db.query(User).filter(User.role_id == 3, User.is_head_officer == True).all()
        for ho in head_officers:
            notif = Notification(
                user_id=ho.user_id,
                title=f"Welfare Check-in: {milestone_name.replace('_', ' ')}",
                message=f"Adopter {app.full_name} submitted their {milestone_name.replace('_', ' ')} welfare update for review.",
                notification_type="adoption_monitoring_submitted",
                related_id=app.adoption_id,
            )
            db.add(notif)
    except Exception:
        pass

    db.commit()
    db.refresh(log)
    return _build_monitoring_response(log)


# ── POST /adoptions/monitoring/{log_id}/review ───────────────────────────────
@router.post("/monitoring/{log_id}/review", response_model=AdoptionMonitoringLogResponse)
def review_adoption_monitoring_log(
    log_id: int,
    req: AdoptionMonitoringReviewRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Stage 9: Staff reviews and approves check-in, flags delinquency, or closes case."""
    log = (
        db.query(AdoptionMonitoringLog)
        .options(joinedload(AdoptionMonitoringLog.adoption))
        .filter(AdoptionMonitoringLog.log_id == log_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Monitoring log not found.")

    app = log.adoption
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    log.status = req.status
    log.review_notes = req.review_notes
    log.reviewed_by = current_user.user_id
    log.reviewed_at = now

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Monitoring",
        action=f"Welfare Check-in Reviewed ({log.milestone_name}): {req.status}",
        performed_by=current_user.user_id,
        notes=req.review_notes,
        db=db,
    )

    # Check if Day 30 is approved
    if log.milestone_name == "Day_30" and req.status == "Approved":
        app.post_monitoring_status = "Completed"
        app.application_stage_status = "Case_Closed"

        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Monitoring",
            action="1-Month Post-Adoption Welfare Monitoring Completed",
            performed_by=current_user.user_id,
            notes="All 3 milestones passed successfully. Case closed with distinction.",
            db=db,
        )

        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Welfare Monitoring Completed! 🏆🐾",
                message="Congratulations! Your 1-month post-adoption welfare monitoring period is completed. Your adoption case is officially closed with full honors.",
                notification_type="adoption_monitoring_completed",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass
    elif req.status in ["Delinquent", "Escalated"]:
        app.post_monitoring_status = req.status

    db.commit()
    db.refresh(log)
    return _build_monitoring_response(log)


# ── GET /adoptions/monitoring/dashboard ──────────────────────────────────────
@router.get("/monitoring/dashboard")
def get_monitoring_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Staff dashboard: summary of active post-adoption monitoring cases and upcoming due milestones."""
    query = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal),
            joinedload(Adoption.applicant),
            joinedload(Adoption.monitoring_logs),
        )
        .filter(Adoption.current_stage == "Monitoring")
    )

    if current_user.role_id == 3:
        query = (
            query.join(HoldingAnimal, Adoption.holding_id == HoldingAnimal.holding_id)
            .join(Report, HoldingAnimal.report_id == Report.report_id)
            .join(Subdivision, Report.subdivision_id == Subdivision.subdivision_id)
            .filter(Subdivision.barangay_id == current_user.barangay_id)
        )

    apps = query.order_by(Adoption.handover_date.desc()).all()

    today = date.today()
    cases = []
    total_active = 0
    total_delinquent = 0
    total_completed = 0

    for a in apps:
        if a.post_monitoring_status == "Completed":
            total_completed += 1
        elif a.post_monitoring_status in ["Delinquent", "Escalated"]:
            total_delinquent += 1
        else:
            total_active += 1

        logs_summary = []
        for l in a.monitoring_logs:
            is_overdue = (l.status == "Pending" and l.due_date < today)
            logs_summary.append({
                "log_id": l.log_id,
                "milestone_name": l.milestone_name,
                "due_date": str(l.due_date),
                "status": "Overdue" if is_overdue else l.status,
                "submitted_at": l.submitted_at.isoformat() if l.submitted_at else None,
                "health_status": l.health_status,
                "photo_count": len(l.photos) if isinstance(l.photos, list) else 0,
            })

        cases.append({
            "adoption_id": a.adoption_id,
            "adopter_name": a.full_name,
            "adopter_contact": a.contact_no,
            "animal_name": a.animal.animal_name if a.animal else "Pet",
            "animal_type": a.animal.animal_type if a.animal else None,
            "handover_date": a.handover_date.isoformat() if a.handover_date else None,
            "post_monitoring_status": a.post_monitoring_status,
            "milestones": logs_summary,
        })

    return {
        "stats": {
            "total_monitoring_cases": len(apps),
            "active": total_active,
            "delinquent": total_delinquent,
            "completed": total_completed,
        },
        "cases": cases,
    }


# ── GET /adoptions/{adoption_id}/dossier ─────────────────────────────────────
@router.get("/{adoption_id}/dossier", response_model=AdoptionDossierResponse)
def get_adoption_dossier(
    adoption_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unified 9-Stage Adoption Dossier aggregating all evaluations, certificates, and audits."""
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(Adoption.reviewer),
            joinedload(Adoption.handover_staff),
            joinedload(Adoption.verification).joinedload(AdoptionVerification.verifier),
            joinedload(Adoption.interview).joinedload(AdoptionInterview.interviewer),
            joinedload(Adoption.home_visit).joinedload(AdoptionHomeVisit.inspector),
            joinedload(Adoption.certificate).joinedload(AdoptionCertificate.issuer),
            joinedload(Adoption.monitoring_logs).joinedload(AdoptionMonitoringLog.reviewer),
            joinedload(Adoption.timeline_logs).joinedload(AdoptionTimelineLog.actor),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not (app.applicant_id == current_user.user_id or current_user.role_id in [3, 4]):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    return AdoptionDossierResponse(
        adoption=_build_adoption_response(app),
        verification=_build_verification_response(app.verification),
        interview=_build_interview_response(app.interview),
        home_visit=_build_home_visit_response(app.home_visit),
        certificate=_build_certificate_response(app.certificate, app),
        monitoring_logs=[_build_monitoring_response(l) for l in app.monitoring_logs],
        timeline_logs=[_build_timeline_response(t) for t in app.timeline_logs],
    )


