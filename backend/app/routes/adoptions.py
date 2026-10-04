import hashlib
import io
import base64
import os
import logging
import qrcode  # type: ignore
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload, object_session

from app.database import get_db
from app.utils.adoption_authority import (
    VISIBLE_ASSIGNMENT_STATUSES,
    can_view_adoption,
    ensure_owner,
    has_assignment,
    is_case_authority as _authority,
    open_assignment,
    require_base_access,
    require_task_actor,
)
from app.utils.adoption_assignments import (
    assign_task,
    close_open_tasks,
    complete_task,
    mark_in_progress,
    notify as _notify,
)
from app.models.report import AdoptionAssignment
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
    AdoptionCertificateSendRequest,
    AdoptionHandoverScheduleRequest,
    AdoptionHandoverCompleteRequest,
    AdoptionMonitoringSubmitRequest,
    AdoptionMonitoringReviewRequest,
    AdoptionStaffMonitoringRecordRequest,
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


def _can_manage_adoption(current_user: User, animal: Optional[HoldingAnimal], db: Session) -> bool:
    """
    Barangay-scoped adoption access (task level).
      - Admin (role 4): always.
      - Barangay Staff (role 3): only when the animal's barangay is resolvable AND equals the
        staff member's barangay. Fails CLOSED when the barangay cannot be determined.
      - Subdivision Leaders (role 2), residents and everyone else: denied.
    """
    if current_user.role_id == 4:
        return True
    if current_user.role_id == 3:
        if animal is None or current_user.barangay_id is None:
            return False
        report = db.query(Report).filter(Report.report_id == animal.report_id).first()
        if not report or not report.subdivision:
            return False
        return report.subdivision.barangay_id == current_user.barangay_id
    return False


def _is_case_authority(current_user: User) -> bool:
    """Adoption decision authority: Barangay Head Officer or Admin (role-level check only)."""
    return current_user.role_id == 4 or (current_user.role_id == 3 and bool(getattr(current_user, "is_head_officer", False)))


def _require_adoption_access(app: Adoption, current_user: User, db: Session, decision: bool = False) -> None:
    """
    Backend authorization for staff actions on an adoption application (see app/utils/adoption_authority.py).
      decision=True : case decisions — the case owner or Admin. A Head Officer deciding an unowned case
                      becomes its owner (Auto_Claimed_On_Approval).
      decision=False: general case actions — the barangay's Head Officer/Admin, or staff assigned to the case.
    Task actions (verification, interview, home visit, handover, monitoring) use require_task_actor instead,
    so only the task's assignee can record them. Staff can never act on their own application.
    """
    require_base_access(app, current_user, db)
    if decision:
        ensure_owner(app, current_user, db)
    elif not (_authority(current_user) or has_assignment(current_user, app, db)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You are not assigned to this adoption case.",
        )


def _schedule_assignee(app: Adoption, user: User, db: Session, task_type: str, target_id: Optional[int],
                       scheduled_at, override_reason: Optional[str]) -> Optional[AdoptionAssignment]:
    """
    Scheduling an interview / home visit.
      - target_id given by the owner/Admin: (re)assign the task to that staff member (validated server-side).
      - the accepted assignee: may reschedule their own task (target unchanged).
      - otherwise the case authority schedules an unassigned task themselves.
    """
    require_base_access(app, user, db)
    current = open_assignment(app, task_type, db)
    is_own_task = current is not None and current.assigned_to == user.user_id
    if target_id is not None and not (is_own_task and target_id == user.user_id and not _authority(user)):
        ensure_owner(app, user, db, auto_action="Claimed")
        target = db.query(User).filter(User.user_id == target_id).first()
        return assign_task(db, app, task_type, target, user, scheduled_at=scheduled_at)
    asg = require_task_actor(app, user, db, task_type, override_reason=override_reason)
    if asg is not None:
        asg.scheduled_at = scheduled_at
    return asg


def _owner_or_head_ids(app: Adoption, db: Session) -> List[int]:
    """Who decides on a recommendation: the case owner, else the barangay's Head Officers."""
    if app.case_owner_id:
        return [app.case_owner_id]
    return [u.user_id for u in _barangay_staff(app.animal, db)]


def _reviewer_role_label(current_user: User) -> str:
    if current_user.role_id == 4:
        return "Admin"
    if getattr(current_user, "is_head_officer", False):
        return "Barangay Head Officer"
    return "Barangay Staff"


def _reserved_holding_ids(db: Session, holding_ids: Optional[List[int]] = None) -> set:
    """Animals already promised to an adopter: an Approved application exists that is not yet closed."""
    q = db.query(Adoption.holding_id).filter(Adoption.status == "Approved")
    if holding_ids is not None:
        if not holding_ids:
            return set()
        q = q.filter(Adoption.holding_id.in_(holding_ids))
    return {row[0] for row in q.distinct().all()}


def _handover_finalized(app: Adoption) -> bool:
    """Two-way handover done: staff released the animal AND the adopter confirmed receipt."""
    return bool(app.staff_handed_over and app.is_handed_over)


def _animal_barangay_id(animal: Optional[HoldingAnimal], db: Session) -> Optional[int]:
    """Barangay that owns an adoption: animal -> report -> subdivision -> barangay."""
    if animal is None:
        return None
    report = db.query(Report).filter(Report.report_id == animal.report_id).first()
    return report.subdivision.barangay_id if report and report.subdivision else None


def _barangay_staff(animal: Optional[HoldingAnimal], db: Session, heads_only: bool = True) -> List[User]:
    """Active Barangay staff (default: Head Officers) of the application's barangay. Empty if unresolvable."""
    barangay_id = _animal_barangay_id(animal, db)
    if barangay_id is None:
        return []
    q = db.query(User).filter(User.role_id == 3, User.barangay_id == barangay_id, User.status != "Inactive")
    if heads_only:
        q = q.filter(User.is_head_officer == True)
    return q.all()


def _animal_photo_urls(rep: Optional[Report], db: Optional[Session]) -> List[str]:
    """
    Photos of an animal for adoption screens: the photos on its Pet Record come first (the record is the
    official, curated profile), then the original report photos.
    """
    urls: List[str] = []
    if rep is not None and rep.pet_id and db is not None:
        pet = db.query(Pet).filter(Pet.pet_id == rep.pet_id).first()
        if pet is not None:
            urls += [u for u in (pet.photo_url, pet.photo_front_url, pet.photo_left_url, pet.photo_right_url) if u]
    if rep is not None and rep.media:
        urls += [m.file_url for m in rep.media if m.media_type == "Image" and m.file_url]
    return list(dict.fromkeys(urls))  # de-duplicate, keep order


def _build_adoption_response(app: Adoption) -> AdoptionResponse:
    animal = app.animal
    photo = None
    if animal and animal.report:
        photos_for_card = _animal_photo_urls(animal.report, object_session(app))
        photo = photos_for_card[0] if photos_for_card else None

    staff_name = None
    if app.handover_staff:
        staff_name = app.handover_staff.name

    # Protect SPI: mask ID number and omit raw direct storage photo URL from general responses
    masked_id = mask_government_id_number(app.id_number, app.id_type)

    # Sub-records summary
    iv = getattr(app, 'interview', None)
    hv = getattr(app, 'home_visit', None)
    cert = getattr(app, 'certificate', None)
    m_logs = getattr(app, 'monitoring_logs', [])

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
        case_owner_id=app.case_owner_id,
        case_owner_name=app.case_owner.name if app.case_owner else None,
        created_pet_id=app.created_pet_id,
        cancellation_reason=getattr(app, 'cancellation_reason', None),
        cancelled_at=getattr(app, 'cancelled_at', None),
        current_stage=getattr(app, 'current_stage', 'Application') or 'Application',
        application_stage_status=getattr(app, 'application_stage_status', 'Submitted') or 'Submitted',
        agreement_signed_at=getattr(app, 'agreement_signed_at', None),
        agreement_signature_url=getattr(app, 'agreement_signature_url', None),
        certificate_id=getattr(app, 'certificate_id', None),
        is_certificate_sent=getattr(app, 'is_certificate_sent', False) or False,
        certificate_sent_at=getattr(app, 'certificate_sent_at', None),
        handover_location=getattr(app, 'handover_location', None),
        handover_scheduled_date=getattr(app, 'handover_scheduled_date', None),
        handover_scheduled_time=getattr(app, 'handover_scheduled_time', None),
        handover_assigned_staff=getattr(app, 'handover_assigned_staff', None),
        handover_notes=getattr(app, 'handover_notes', None),
        handover_status=getattr(app, 'handover_status', 'Pending') or 'Pending',
        resident_handover_confirmed=getattr(app, 'resident_handover_confirmed', False) or False,
        resident_handover_confirmed_at=getattr(app, 'resident_handover_confirmed_at', None),
        handover_photo_url=getattr(app, 'handover_photo_url', None),
        post_monitoring_status=getattr(app, 'post_monitoring_status', 'Not_Started') or 'Not_Started',
        adoption_completed_at=getattr(app, 'adoption_completed_at', None),
        # Contextual workflow fields
        interview_scheduled_at=iv.scheduled_at if iv else None,
        interview_mode=iv.interview_mode if iv else None,
        interview_location=(iv.meeting_link or ("Barangay Animal Facility" if (iv.interview_mode or "").lower() in ["in-person", "physical"] else "Virtual Session")) if iv else None,
        interview_result=iv.recommendation if iv else None,
        interviewer_name=iv.interviewer.name if (iv and iv.interviewer) else None,
        interview_notes=iv.interview_notes if iv else None,
        home_visit_scheduled_date=hv.scheduled_date if hv else None,
        home_visit_result=hv.inspection_result if hv else None,
        home_visit_notes=hv.checklist_notes if hv else None,
        home_visit_inspector_name=hv.inspector.name if (hv and hv.inspector) else None,
        interviewer_id=iv.interviewer_id if iv else None,
        interview_evaluated_by_name=iv.evaluator.name if (iv and iv.evaluator) else None,
        questions_discussed=iv.questions_discussed if iv else None,
        applicant_responses=iv.applicant_responses if iv else None,
        additional_observations=iv.additional_observations if iv else None,
        home_visit_inspector_id=hv.inspector_id if hv else None,
        home_visit_evaluated_by_name=hv.evaluator.name if (hv and hv.evaluator) else None,
        home_visit_reschedule_count=(hv.reschedule_count or 0) if hv else 0,
        residence_condition=hv.residence_condition if hv else None,
        existing_pets=hv.existing_pets if hv else None,
        recommendations=hv.recommendations if hv else None,
        home_visit_photos=hv.visit_photos if (hv and isinstance(hv.visit_photos, list)) else [],
        certificate_number=cert.certificate_number if cert else None,
        approval_date=app.reviewed_at if app.status == "Approved" else None,
        approved_by_name=app.reviewer.name if (app.reviewer and app.status == "Approved") else None,
        monitoring_records_count=len(m_logs) if m_logs else 0,
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
        interview_mode=iv.interview_mode or "In-Person",
        meeting_link=iv.meeting_link,
        score_care_knowledge=iv.score_care_knowledge,
        score_financial_readiness=iv.score_financial_readiness,
        score_environment_suitability=iv.score_environment_suitability,
        total_score=float(iv.total_score) if iv.total_score is not None else None,
        recommendation=iv.recommendation or "Pending",
        interview_notes=iv.interview_notes,
        conducted_at=iv.conducted_at,
        interview_result=iv.interview_result,
        questions_discussed=iv.questions_discussed,
        applicant_responses=iv.applicant_responses,
        additional_observations=iv.additional_observations,
        assignment_id=iv.assignment_id,
        evaluated_by=iv.evaluated_by,
        evaluated_by_name=iv.evaluator.name if iv.evaluator else None,
    )


def _build_home_visit_response(hv: Optional[AdoptionHomeVisit]) -> Optional[AdoptionHomeVisitResponse]:
    if not hv:
        return None
    return AdoptionHomeVisitResponse(
        visit_id=hv.visit_id,
        adoption_id=hv.adoption_id,
        inspector_id=hv.inspector_id,
        inspector_name=hv.inspector.name if hv.inspector else None,
        visit_type=hv.visit_type or "Physical",
        scheduled_date=hv.scheduled_date,
        is_fencing_secure=hv.is_fencing_secure,
        is_shelter_adequate=hv.is_shelter_adequate,
        hazard_free=hv.hazard_free,
        checklist_notes=hv.checklist_notes,
        overall_suitability=getattr(hv, 'overall_suitability', None) or ("Suitable" if hv.inspection_result in ["Suitable", "Passed"] else hv.inspection_result),
        recommendations=getattr(hv, 'recommendations', None),
        gps_latitude=float(hv.gps_latitude) if hv.gps_latitude is not None else None,
        gps_longitude=float(hv.gps_longitude) if hv.gps_longitude is not None else None,
        visit_photos=hv.visit_photos if isinstance(hv.visit_photos, list) else [],
        inspection_result=hv.inspection_result or "Pending",
        conducted_at=hv.conducted_at,
        assignment_id=hv.assignment_id,
        evaluated_by=hv.evaluated_by,
        evaluated_by_name=hv.evaluator.name if hv.evaluator else None,
        reschedule_count=hv.reschedule_count or 0,
        last_rescheduled_at=hv.last_rescheduled_at,
        reschedule_reason=hv.reschedule_reason,
        residence_condition=hv.residence_condition,
        available_living_space=hv.available_living_space,
        environment_safety=hv.environment_safety,
        cleanliness_sanitation=hv.cleanliness_sanitation,
        presence_of_hazards=hv.presence_of_hazards,
        existing_pets=hv.existing_pets,
        additional_observations=hv.additional_observations,
    )



def certificate_verify_url(cert: AdoptionCertificate) -> str:
    """Public verification link encoded in the certificate QR code."""
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/verify/certificate/{cert.certificate_number}?h={cert.verification_hash[:16]}"


def _qr_data_uri(data: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def _certificate_signatory(app: Adoption, db: Session) -> Optional[User]:
    """The Punong Barangay / Head Officer of the application's barangay (case owner preferred)."""
    barangay_id = _animal_barangay_id(app.animal, db)
    if barangay_id is None:
        return None
    if app.case_owner_id:
        owner = db.query(User).options(joinedload(User.position)).filter(User.user_id == app.case_owner_id).first()
        if owner and owner.role_id == 3 and owner.is_head_officer and owner.barangay_id == barangay_id:
            return owner
    return (
        db.query(User).options(joinedload(User.position))
        .filter(User.role_id == 3, User.barangay_id == barangay_id, (User.is_head_officer == True) | (User.position_id == 6))
        .order_by(User.is_head_officer.desc())
        .first()
    )


def _certificate_animal_facts(app: Adoption, db: Session) -> Dict[str, Any]:
    """
    What the certificate says about the animal. The Pet Record linked to the case is the curated source (staff edit it
    in Pet Records); the holding-facility intake data is the fallback.
    """
    animal = app.animal
    rep = animal.report if animal else None
    pet = db.query(Pet).filter(Pet.pet_id == rep.pet_id).first() if rep is not None and rep.pet_id else None

    def clean(v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return None if v.lower() in ("", "no name", "unknown") else v

    photos = _animal_photo_urls(rep, db)
    return {
        "animal_name": clean(pet.pet_name if pet else None) or clean(animal.animal_name if animal else None),
        "animal_type": clean(pet.pet_type if pet else None) or (animal.animal_type if animal else None),
        "animal_breed": clean(pet.breed if pet else None) or clean(animal.breed if animal else None),
        "animal_sex": clean(pet.gender if pet else None) or clean(animal.sex if animal else None),
        "animal_photo": photos[0] if photos else None,
    }


def _certificate_details_outdated(cert: AdoptionCertificate, app: Adoption, db: Session) -> bool:
    if not cert.snapshot or cert.certificate_status == "Revoked" or _handover_finalized(app):
        return False
    facts = _certificate_animal_facts(app, db)
    return any((cert.snapshot.get(k) or None) != (v or None) for k, v in facts.items())


def _freeze_certificate(cert: AdoptionCertificate, app: Adoption, db: Session) -> None:
    """
    Snapshot everything a certificate states at issue time, so it never changes later
    (e.g. when the Head Officer changes). Also points the QR code at the public verify page.
    """
    animal = app.animal
    barangay_id = _animal_barangay_id(animal, db)
    brgy = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first() if barangay_id is not None else None
    city_parts = [p.strip() for p in (brgy.city or "").split(",") if p.strip()] if brgy else []
    signatory = _certificate_signatory(app, db)
    facts = _certificate_animal_facts(app, db)
    cert.signatory_id = signatory.user_id if signatory else None
    cert.signatory_name = signatory.name if signatory else None
    cert.signatory_position = (
        (signatory.position.position_name if signatory and signatory.position else None)
        or ("Punong Barangay / Barangay Captain" if signatory else None)
    )
    cert.snapshot = {
        "adopter_name": app.full_name,
        "adopter_address": app.address,
        "adopter_phone": app.contact_no,
        **facts,
        "barangay_name": brgy.barangay_name if brgy else None,
        "municipality_city": city_parts[0] if city_parts else None,
        "province": city_parts[1] if len(city_parts) > 1 else None,
        "date_applied": app.created_at.isoformat() if app.created_at else None,
        "date_approved": app.reviewed_at.isoformat() if app.reviewed_at else None,
    }
    cert.qr_code_url = _qr_data_uri(certificate_verify_url(cert))


def _build_certificate_response(cert: Optional[AdoptionCertificate], app: Adoption, db: Optional[Session] = None) -> Optional[AdoptionCertificateResponse]:
    if not cert:
        return None
    if cert.snapshot is None and db is not None:
        try:
            _freeze_certificate(cert, app, db)
            db.commit()
        except Exception as freeze_err:  # never block viewing the certificate
            db.rollback()
            print(f"Notice: could not freeze certificate {cert.certificate_id}: {freeze_err}")
    snap = cert.snapshot or {}

    def _dt(key):
        v = snap.get(key)
        try:
            return datetime.fromisoformat(v) if v else None
        except ValueError:
            return None

    year_val = cert.issued_at.year if cert.issued_at else (app.created_at.year if app.created_at else datetime.now().year)
    number = cert.certificate_number
    if not number or number.startswith("CERT-ADOPT-"):
        number = f"SS-ADOPT-{year_val}-{app.adoption_id:05d}"
    revoked = cert.certificate_status == "Revoked"

    return AdoptionCertificateResponse(
        certificate_id=cert.certificate_id,
        adoption_id=cert.adoption_id,
        certificate_number=number,
        verification_hash=cert.verification_hash,
        pdf_url=cert.pdf_url,
        qr_code_url=cert.qr_code_url,
        issued_by=cert.issued_by,
        issuer_name=cert.issuer.name if cert.issuer else None,
        issued_at=cert.issued_at,
        # Facts come from the issue-time snapshot; nothing is invented when a value was never recorded.
        adopter_name=snap.get("adopter_name") or app.full_name,
        adopter_address=snap.get("adopter_address") or app.address,
        adopter_phone=snap.get("adopter_phone") or app.contact_no,
        animal_name=snap.get("animal_name"),
        animal_type=snap.get("animal_type"),
        animal_breed=snap.get("animal_breed"),
        animal_sex=snap.get("animal_sex") or "Not recorded",
        animal_age=snap.get("animal_age") or "Not recorded",
        animal_id=str(app.holding_id),
        animal_photo=snap.get("animal_photo"),
        holding_id=app.holding_id,
        application_number=f"SS-APP-{app.adoption_id:04d}",
        date_applied=_dt("date_applied") or app.created_at,
        date_approved=_dt("date_approved") or app.reviewed_at,
        adoption_status="REVOKED" if revoked else ("APPROVED" if _handover_finalized(app) else "PENDING HANDOVER"),
        barangay_name=snap.get("barangay_name"),
        municipality_city=snap.get("municipality_city"),
        province=snap.get("province"),
        captain_name=cert.signatory_name,
        captain_position=cert.signatory_position,
        captain_signature_url=None,
        certificate_status=cert.certificate_status or "Valid",
        is_final=_handover_finalized(app) and not revoked,
        revoked_reason=cert.revoked_reason,
        verify_url=certificate_verify_url(cert),
        details_outdated=_certificate_details_outdated(cert, app, db) if db is not None else False,
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
        entry_type=log.entry_type,
        assignment_id=log.assignment_id,
        assessed_by=log.assessed_by,
        assessed_by_name=log.assessor.name if log.assessor else None,
        assessed_at=log.assessed_at,
        assessment_result=log.assessment_result,
        animal_condition=log.animal_condition,
        living_condition=log.living_condition,
        food_and_water=log.food_and_water,
        shelter_condition=log.shelter_condition,
        vaccination_status=log.vaccination_status,
        assessment_notes=log.assessment_notes,
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



def _ensure_adopted_pet_record(app: Adoption, db: Session) -> Optional[Pet]:
    """
    Create the adopter's registered Pet record from the rescued animal (once).
    Called when the adoption is approved so it shows in the adopter's Pet Records right away.
    """
    animal = app.animal
    if app.created_pet_id:
        return db.query(Pet).filter(Pet.pet_id == app.created_pet_id).first()
    if not animal or not app.applicant_id:
        return None
    primary_photo = None
    if animal.report and animal.report.media:
        primary_photo = next((m.file_url for m in animal.report.media if m.media_type == "Image"), None)
    pet = Pet(
        owner_id=app.applicant_id,
        pet_name=animal.animal_name or "Adopted Pet",
        pet_type="Cat" if (animal.animal_type or "").lower() == "cat" else "Dog",
        breed=animal.breed or "Mixed Breed",
        color_markings=animal.color,
        gender="Unknown",
        photo_url=primary_photo,
        health_condition=animal.medical_notes or "Adopted via Barangay Animal Services",
        is_vaccinated=True,
        temperament="Friendly",
    )
    db.add(pet)
    db.flush()
    app.created_pet_id = pet.pet_id
    return pet


def _release_animal_from_facility(app: Adoption, db: Session, user_id: Optional[int], final: bool) -> None:
    """
    Keep the animal's whereabouts consistent once the adopter has taken it: it is no longer in a holding
    facility (kennel freed, facility link removed, report location restored, status Adopted/Released).
    Idempotent. final=False means the adopter has not yet confirmed receipt.
    """
    animal = app.animal
    if animal is None:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    was_in_facility = bool(animal.kennel_slot) or animal.facility_status != 7 or bool(animal.report and animal.report.facility_id)
    animal.kennel_slot = None
    animal.facility_status = 7
    if animal.discharge_date is None:
        animal.discharge_date = now
    rep = animal.report
    if rep is not None:
        rep.facility_id = None
        if rep.initial_latitude is not None and rep.initial_longitude is not None:
            rep.latitude, rep.longitude = rep.initial_latitude, rep.initial_longitude
            if rep.initial_landmark:
                rep.landmark = rep.initial_landmark
        rep.custody_status = "Adopted" if final else "Handed to Adopter (awaiting confirmation)"
    if was_in_facility and not final:
        db.add(HoldingTimeline(
            holding_id=animal.holding_id,
            event_type="outcome",
            title=f"Released from holding facility to adopter {app.full_name}",
            notes="Staff handed the animal over. Awaiting the adopter's confirmation of receipt.",
            logged_by=user_id,
        ))


def _retire_pending_pet_record(app: Adoption, db: Session) -> None:
    """An approved adoption that falls through before handover must not leave a pet in the adopter's records."""
    if app.created_pet_id and not _handover_finalized(app):
        pet = db.query(Pet).filter(Pet.pet_id == app.created_pet_id).first()
        if pet is not None:
            pet.status = "Archived"
        app.created_pet_id = None


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

    # 1. Transition animal to facility_status=7 (Adopted/Released) and free its holding-facility slot
    if animal:
        _release_animal_from_facility(app, db, app.staff_handover_by or current_user.user_id, final=True)
        animal.discharge_date = now

    # 2. Registered Pet record (normally created when the adoption was approved; created here if missing)
    _ensure_adopted_pet_record(app, db)

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
        head_officers = _barangay_staff(app.animal, db)
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
def get_adoption_catalog(include_reserved: bool = False, db: Session = Depends(get_db)):
    """
    Public adoption catalog — animals in facility_status=6 (For Adoption).
    Animals with an Approved application are reserved for that adopter and hidden, so nobody else can apply;
    they reappear automatically if that approval is cancelled or rejected. Staff views pass include_reserved=true.
    """
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
    reserved = _reserved_holding_ids(db, [a.holding_id for a in animals])

    results: List[CatalogAnimalResponse] = []
    for a in animals:
        if a.holding_id in reserved and not include_reserved:
            continue
        rep = a.report
        subd = rep.subdivision if rep else None
        brgy = subd.barangay if subd else None

        # Photos
        photos: List[str] = _animal_photo_urls(rep, db)

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
                is_reserved=a.holding_id in reserved,
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
    # Public detail only for animals that can still be adopted (not reserved, adopted, or out of the catalog).
    if animal.facility_status != 6 or _reserved_holding_ids(db, [animal.holding_id]):
        raise HTTPException(status_code=404, detail="This pet is no longer available for adoption.")

    rep = animal.report
    subd = rep.subdivision if rep else None
    brgy = subd.barangay if subd else None

    photos: List[str] = _animal_photo_urls(rep, db)

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
    photos = _animal_photo_urls(rep, object_session(animal))

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

    # Also record it in the report's rescue timeline so the case history shows the animal is up for adoption
    if animal.report is not None:
        db.add(StatusHistory(
            report_id=animal.report.report_id,
            report_status_id=animal.report.current_status_id,
            updated_by=current_user.user_id,
            facility_id=animal.report.facility_id,
            remarks=f"Animal promoted to adoption catalog by {current_user.name}. It is now available for adoption applications.",
        ))

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


ADOPTION_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ADOPTION_PHOTO_MAX_BYTES = 10 * 1024 * 1024
ADOPTION_PHOTO_MAX_FILES = 10


async def _upload_adoption_photos(files: List[UploadFile], folder: str, prefix: str) -> List[str]:
    """
    Validate and upload adoption photos. Problems are reported as clear 4xx/502 errors (never a bare 500,
    which browsers show as a misleading CORS failure).
    """
    from app.utils.uploads import verify_file_signature

    named = [f for f in files if f.filename]
    if len(named) > ADOPTION_PHOTO_MAX_FILES:
        raise HTTPException(status_code=400, detail=f"You can upload at most {ADOPTION_PHOTO_MAX_FILES} photos at a time.")
    urls: List[str] = []
    for file in named:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ADOPTION_PHOTO_EXTS:
            raise HTTPException(status_code=400, detail=f'"{file.filename}" is not a supported photo. Use JPG, PNG or WebP.')
        content = await file.read()
        if len(content) > ADOPTION_PHOTO_MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f'"{file.filename}" is {len(content) / 1024 / 1024:.1f} MB. Photos must be 10 MB or smaller.',
            )
        if not verify_file_signature(content, ext, file.content_type):
            raise HTTPException(status_code=400, detail=f'"{file.filename}" is not a valid image file.')
        unique_name = f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{os.urandom(4).hex()}"
        try:
            url = upload_to_cloudinary(content, folder=folder, filename=unique_name)
        except Exception as exc:  # Cloudinary rejected / unreachable
            logger.error(f"Adoption photo upload failed ({folder}): {exc}")
            raise HTTPException(status_code=502, detail="The photo could not be stored right now. Please try again in a moment.")
        if url:
            urls.append(url)
    return urls


# ── POST /adoptions/upload-home-visit-photos ─────────────────────────────────
@router.post("/upload-home-visit-photos")
async def upload_home_visit_photos(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload multiple photos taken during home environment visit.
    Supports JPG, JPEG, PNG, WebP from phone camera / gallery or desktop.
    """
    if current_user.role_id not in [3, 4]:
        raise HTTPException(status_code=403, detail="Permission Denied.")

    uploaded_urls = await _upload_adoption_photos(files, "adoptions/home_visits", "home_visit")

    if not uploaded_urls:
        raise HTTPException(status_code=400, detail="Failed to upload any home visit photos.")

    return {"urls": uploaded_urls}


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
        head_officer = next(iter(_barangay_staff(animal, db)), None)
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
            joinedload(Adoption.interview).joinedload(AdoptionInterview.interviewer),
            joinedload(Adoption.home_visit).joinedload(AdoptionHomeVisit.inspector),
            joinedload(Adoption.certificate),
            joinedload(Adoption.monitoring_logs),
        )
    )

    if current_user.role_id == 3:
        # Filter applications belonging to user's barangay
        query = query.join(HoldingAnimal, Adoption.holding_id == HoldingAnimal.holding_id).join(Report, HoldingAnimal.report_id == Report.report_id).join(Subdivision, Report.subdivision_id == Subdivision.subdivision_id).filter(Subdivision.barangay_id == current_user.barangay_id)

    if current_user.role_id == 3 and not current_user.is_head_officer:
        query = query.filter(Adoption.adoption_id.in_(
            db.query(AdoptionAssignment.adoption_id).filter(
                AdoptionAssignment.assigned_to == current_user.user_id,
                AdoptionAssignment.status.in_(VISIBLE_ASSIGNMENT_STATUSES),
            )
        ))

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

    _require_adoption_access(app, current_user, db, decision=True)

    decision = req.decision.strip().capitalize()
    if decision not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be 'Approved' or 'Rejected'")

    if decision == "Rejected" and (not req.review_notes or not req.review_notes.strip()):
        raise HTTPException(status_code=400, detail="A reason is required when rejecting an adoption application.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.status = decision
    app.reviewed_by = current_user.user_id
    app.reviewer_role = _reviewer_role_label(current_user)
    app.review_notes = req.review_notes.strip() if req.review_notes else None
    app.reviewed_at = now

    animal = app.animal

    if decision == "Approved":
        app.current_stage = "Approval"
        app.application_stage_status = "Review_Approved"

        # The approved pet appears in the adopter's Pet Records right away
        new_pet = _ensure_adopted_pet_record(app, db)
        if new_pet is not None:
            db.add(Notification(
                user_id=app.applicant_id,
                title="Your adopted pet is now in your Pet Records 🐾",
                message=f"{new_pet.pet_name} was added to your pet records. The Barangay will arrange the handover.",
                notification_type="adoption_update",
                related_id=app.adoption_id,
            ))

        # Generate / prepare official certificate record
        cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == app.adoption_id).first()
        if not cert:
            year_val = now.year
            cert_number = f"SS-ADOPT-{year_val}-{app.adoption_id:05d}"
            animal_name = animal.animal_name if animal else "Animal"
            raw_hash_data = f"{cert_number}:{app.adoption_id}:{animal_name}:{app.full_name}:{now.isoformat()}"
            verification_hash = hashlib.sha256(raw_hash_data.encode("utf-8")).hexdigest()

            qr = qrcode.QRCode(version=1, box_size=8, border=2)
            qr.add_data(f"STRAYSAFE-CERT|{cert_number}|{app.adoption_id}|{verification_hash[:16]}")
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            qr_img.save(buf, format="PNG")
            qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

            cert = AdoptionCertificate(
                adoption_id=app.adoption_id,
                certificate_number=cert_number,
                verification_hash=verification_hash,
                pdf_url=f"/adoptions/{app.adoption_id}/certificate",
                qr_code_url=qr_b64,
                issued_by=current_user.user_id,
                issued_at=now,
            )
            db.add(cert)
            db.flush()
            app.certificate_id = cert.certificate_id

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
            close_open_tasks(db, other, "Rejected")
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
            notes=f"Adoption application #{app.adoption_id} approved by {current_user.name}. Awaiting certificate issuing and physical handover.",
            logged_by=current_user.user_id,
        )
        db.add(timeline_entry)

        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Approval",
            action="Application Officially Approved",
            performed_by=current_user.user_id,
            notes=f"Approved by {current_user.name}. Proceeding to Stage 7 Certificate.",
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
        close_open_tasks(db, app, "Rejected")
        _retire_pending_pet_record(app, db)
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
    asg = require_task_actor(app, current_user, db, "Handover")
    complete_task(db, asg, current_user)

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only Approved applications can be confirmed for pet handover.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.staff_handed_over = True
    app.staff_handover_date = now
    app.staff_handover_by = current_user.user_id
    _release_animal_from_facility(app, db, current_user.user_id, final=bool(app.is_handed_over))

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
    if not completed:
        app.current_stage = "Handover"
        app.application_stage_status = "Awaiting_Adopter_Confirmation"
        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Handover",
            action="Staff Confirmed Handover",
            performed_by=current_user.user_id,
            notes=f"Staff {current_user.name} confirmed physical pet handover at facility. Awaiting adopter receipt confirmation.",
            db=db,
        )

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
        "current_stage": app.current_stage,
        "application_stage_status": app.application_stage_status,
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
        head_officers = _barangay_staff(app.animal, db)
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
    if not completed:
        app.current_stage = "Handover"
        app.application_stage_status = "Awaiting_Staff_Confirmation"
        _log_adoption_timeline(
            adoption_id=app.adoption_id,
            stage="Handover",
            action="Adopter Confirmed Receipt",
            performed_by=current_user.user_id,
            notes=f"Adopter {current_user.name} confirmed safe receipt of pet. Awaiting Barangay staff physical handover confirmation.",
            db=db,
        )

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
        "current_stage": app.current_stage,
        "application_stage_status": app.application_stage_status,
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
    close_open_tasks(db, app, "Cancelled")
    _retire_pending_pet_record(app, db)
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
        head_officers = _barangay_staff(app.animal, db)
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
    is_staff = (current_user.role_id == 3 and can_view_adoption(current_user, app, db))

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

    if current_user.role_id == 3 and not current_user.is_head_officer:
        query = query.filter(Adoption.adoption_id.in_(
            db.query(AdoptionAssignment.adoption_id).filter(
                AdoptionAssignment.assigned_to == current_user.user_id,
                AdoptionAssignment.status.in_(VISIBLE_ASSIGNMENT_STATUSES),
            )
        ))

    if stage:
        query = query.filter(Adoption.current_stage == stage)

    if status_filter:
        query = query.filter(Adoption.status == status_filter)

    apps = query.order_by(Adoption.created_at.desc()).all()
    return [_build_adoption_response(app) for app in apps]


# ── POST /adoptions/{adoption_id}/application/approve (Stage 1 Approve & Proceed) ──
@router.post("/{adoption_id}/application/approve")
def approve_initial_adoption_application(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Stage 1: Approve adoption application and proceed to Stage 3 (Interview).
    Sets status="Approved", current_stage="Interview", application_stage_status="Approved_Ready_For_Interview".
    Logs audit records for Application Approval and Verification stages.
    """
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    _require_adoption_access(app, current_user, db, decision=True)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    prev_status = app.status or "Submitted"
    prev_stage = app.current_stage or "Application"

    app.status = "Approved"
    app.current_stage = "Interview"
    app.application_stage_status = "Approved_Ready_For_Interview"
    app.reviewed_by = current_user.user_id
    app.reviewer_role = _reviewer_role_label(current_user)
    app.reviewed_at = now

    # Also mark verification record as verified
    ver = db.query(AdoptionVerification).filter(AdoptionVerification.adoption_id == adoption_id).first()
    if not ver:
        ver = AdoptionVerification(adoption_id=adoption_id)
        db.add(ver)
    ver.verified_by = current_user.user_id
    ver.id_match_status = "Matched"
    ver.residency_status = "Resident_Confirmed"
    ver.blacklist_checked = True
    ver.is_blacklisted = False
    ver.verified_at = now

    # Audit Trail Entry 1: Application Approved
    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Application",
        action="Application Approved",
        performed_by=current_user.user_id,
        notes=f"Application approved by {current_user.name}. Previous Status: {prev_status} -> New Status: Approved. Application lifecycle advanced from {prev_stage} to Interview.",
        db=db,
    )

    # Audit Trail Entry 2: Verification Passed
    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Verification",
        action="Identity & Background Verified",
        performed_by=current_user.user_id,
        notes=f"Verified by {current_user.name}. Ready for Interview scheduling.",
        db=db,
    )

    animal = app.animal
    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Application Approved! 🎉",
            message=f"Your adoption application for {animal.animal_name if animal else 'pet'} has been approved! Barangay personnel will schedule your interview shortly.",
            notification_type="adoption_approved",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    log_activity(
        db=db,
        action="APPROVE_ADOPTION_APPLICATION",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"{current_user.name} approved Adoption #{app.adoption_id} and advanced lifecycle to Interview.",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {"status": "success", "message": "Adoption application approved and advanced to Interview stage.", "data": _build_adoption_response(app)}


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

    asg = require_task_actor(app, current_user, db, "Verification", override_reason=req.override_reason)

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
    if decision in ("Pass", "Fail"):
        complete_task(db, asg, current_user)
    if req.override_reason and asg is not None and asg.assigned_to != current_user.user_id:
        _log_adoption_timeline(app.adoption_id, "Verification", "Recorded by case owner (override)", current_user.user_id, req.override_reason.strip(), db)
    if decision == "Pass":
        app.current_stage = "Interview"
        app.application_stage_status = "Verification_Passed"
        action = "Identity & Background Verified"
        notes = "Citizen identity and residency confirmed. Advancing to Stage 3 (Interview)."
    elif decision == "Fail" and _authority(current_user):
        app.status = "Rejected"
        app.application_stage_status = "Verification_Failed"
        app.review_notes = req.rejection_reason or req.verification_notes or "Verification failed."
        action = "Verification Failed"
        notes = app.review_notes
        close_open_tasks(db, app, "Rejected")
    elif decision == "Fail":
        # An assignee's failed verification is a recommendation; the case owner decides on rejection.
        app.application_stage_status = "Verification_Failed_Pending_Decision"
        action = "Verification Failed (owner decision needed)"
        notes = req.rejection_reason or req.verification_notes or "Verification failed."
        for uid in _owner_or_head_ids(app, db):
            _notify(db, uid, "adoption_decision_needed", app.adoption_id, "Adoption decision needed ⚠️",
                    f"{current_user.name} recorded a FAILED verification for {app.full_name}. Review and decide whether to reject.")
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
    """Stage 3: Schedule Interview (In-Person, Video Call, Phone)."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    asg = _schedule_assignee(app, current_user, db, "Interview", req.interviewer_id, req.scheduled_at, req.override_reason)

    iv = db.query(AdoptionInterview).filter(AdoptionInterview.adoption_id == adoption_id).first()
    if not iv:
        iv = AdoptionInterview(adoption_id=adoption_id)
        db.add(iv)

    # The interviewer is the assignee (never the person who clicked); unassigned -> the scheduling officer.
    iv.interviewer_id = asg.assigned_to if asg is not None else (iv.interviewer_id or current_user.user_id)
    if asg is not None:
        iv.assignment_id = asg.assignment_id
        if asg.assigned_to != current_user.user_id and asg.status != "Assigned":
            _notify(db, asg.assigned_to, "adoption_task_updated", app.adoption_id, "Interview schedule updated 📅",
                    f"{current_user.name} set the interview with {app.full_name} for {req.scheduled_at.strftime('%B %d, %Y at %I:%M %p')}.")
    iv.scheduled_at = req.scheduled_at
    iv.interview_mode = req.interview_mode
    iv.meeting_link = req.meeting_link or req.location
    iv.interview_notes = req.notes

    app.current_stage = "Interview"
    app.application_stage_status = "Interview_Scheduled"

    _log_adoption_timeline(
        app.adoption_id,
        "Interview",
        "Interview Scheduled",
        current_user.user_id,
        f"Mode: {req.interview_mode} scheduled for {req.scheduled_at.strftime('%Y-%m-%d %H:%M')}. Location/Link: {req.meeting_link or req.location or 'Barangay Office'}",
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
    """Stage 3: Record Interview Results, Rubric, Questions & Observations."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    asg = require_task_actor(app, current_user, db, "Interview", override_reason=req.override_reason)

    iv = db.query(AdoptionInterview).filter(AdoptionInterview.adoption_id == adoption_id).first()
    if not iv:
        iv = AdoptionInterview(adoption_id=adoption_id)
        db.add(iv)

    total = (req.score_care_knowledge or 5) + (req.score_financial_readiness or 5) + (req.score_environment_suitability or 5)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if asg is not None:
        iv.interviewer_id, iv.assignment_id = asg.assigned_to, asg.assignment_id
    elif not iv.interviewer_id:
        iv.interviewer_id = current_user.user_id
    iv.evaluated_by = current_user.user_id
    iv.score_care_knowledge = req.score_care_knowledge
    iv.score_financial_readiness = req.score_financial_readiness
    iv.score_environment_suitability = req.score_environment_suitability
    iv.total_score = Decimal(total)
    
    result_val = (req.interview_result or req.recommendation or "Successful").strip()
    iv.recommendation = result_val
    iv.interview_result = result_val
    iv.questions_discussed = (req.questions_discussed or "").strip() or None
    iv.applicant_responses = (req.applicant_responses or "").strip() or None
    iv.additional_observations = (req.additional_observations or "").strip() or None
    
    # Compile notes with questions & observations if provided
    compiled_notes = []
    if req.interview_notes:
        compiled_notes.append(req.interview_notes.strip())
    if req.questions_discussed:
        compiled_notes.append(f"Questions Discussed: {req.questions_discussed.strip()}")
    if req.applicant_responses:
        compiled_notes.append(f"Applicant Responses: {req.applicant_responses.strip()}")
    if req.additional_observations:
        compiled_notes.append(f"Observations: {req.additional_observations.strip()}")
        
    iv.interview_notes = "\n\n".join(compiled_notes) if compiled_notes else req.interview_notes
    iv.conducted_at = req.conducted_at or now

    if result_val in ["Successful", "Recommended", "Pass"]:
        app.current_stage = "Home_Visit"
        app.application_stage_status = "Interview_Successful"
        action = "Interview Completed: Successful"
        notes = f"Interview successfully completed with score {total}/15. Proceeding to Stage 4 Home Visit."
    elif result_val in ["Unsuccessful", "Not_Recommended", "Fail"] and _authority(current_user):
        app.status = "Rejected"
        app.application_stage_status = "Interview_Unsuccessful"
        app.review_notes = iv.interview_notes or "Interview criteria not satisfied."
        action = "Interview Result: Unsuccessful"
        notes = app.review_notes
        close_open_tasks(db, app, "Rejected")
    elif result_val in ["Unsuccessful", "Not_Recommended", "Fail"]:
        # The interviewer recommends; rejecting the application is the case owner's decision.
        app.current_stage = "Interview"
        app.application_stage_status = "Interview_Unsuccessful_Pending_Decision"
        action = "Interview Result: Unsuccessful (owner decision needed)"
        notes = iv.interview_notes or "Interview criteria not satisfied."
        for uid in _owner_or_head_ids(app, db):
            _notify(db, uid, "adoption_decision_needed", app.adoption_id, "Adoption decision needed ⚠️",
                    f"{current_user.name} rated {app.full_name}'s interview UNSUCCESSFUL. Review the assessment and decide.")
    else:
        # Needs Follow-up / Conditional
        app.current_stage = "Interview"
        app.application_stage_status = "Interview_Needs_Followup"
        action = "Interview: Follow-up Required"
        notes = iv.interview_notes or "Follow-up interview session or document verification required."

    _log_adoption_timeline(app.adoption_id, "Interview", action, current_user.user_id, notes, db)
    if req.override_reason and asg is not None and asg.assigned_to != current_user.user_id:
        _log_adoption_timeline(app.adoption_id, "Interview", "Recorded by case owner (override)", current_user.user_id, req.override_reason.strip(), db)
    if result_val not in ["Needs Follow-up", "Needs_Follow_up", "Follow-up"] and app.application_stage_status != "Interview_Needs_Followup":
        complete_task(db, asg, current_user)
    else:
        mark_in_progress(asg)

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title=f"Adoption Interview: {action}",
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
    """Stage 4: Schedule Home Visit (Only after successful Interview)."""
    app = db.query(Adoption).options(joinedload(Adoption.interview)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    asg = _schedule_assignee(app, current_user, db, "Home_Visit", req.inspector_id, req.scheduled_date, req.override_reason)

    # Strict Stage Gating: Interview must be Successful
    if app.current_stage not in ["Home_Visit", "Review", "Approval", "Certificate", "Handover", "Monitoring"]:
        if not app.interview or app.interview.recommendation not in ["Successful", "Recommended", "Pass"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot schedule Home Visit: The Interview stage must be successfully completed first."
            )

    hv = db.query(AdoptionHomeVisit).filter(AdoptionHomeVisit.adoption_id == adoption_id).first()
    if not hv:
        hv = AdoptionHomeVisit(adoption_id=adoption_id)
        db.add(hv)

    hv.inspector_id = asg.assigned_to if asg is not None else (hv.inspector_id or current_user.user_id)
    if asg is not None:
        hv.assignment_id = asg.assignment_id
        if asg.assigned_to != current_user.user_id and asg.status != "Assigned":
            _notify(db, asg.assigned_to, "adoption_task_updated", app.adoption_id, "Home visit schedule updated 🏡",
                    f"{current_user.name} set the home visit for {app.full_name} on {req.scheduled_date.strftime('%B %d, %Y at %I:%M %p')}.")
    if hv.scheduled_date is not None and hv.scheduled_date != req.scheduled_date:
        hv.reschedule_count = (hv.reschedule_count or 0) + 1
        hv.last_rescheduled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        hv.reschedule_reason = (req.reschedule_reason or "").strip() or None
    hv.scheduled_date = req.scheduled_date
    hv.visit_type = req.visit_type
    
    schedule_details = []
    if req.notes:
        schedule_details.append(req.notes.strip())
    if asg is not None and asg.assigned_to_name:
        schedule_details.append(f"Assigned Personnel: {asg.assigned_to_name}")
    if req.adopter_address:
        schedule_details.append(f"Inspection Address: {req.adopter_address.strip()}")
    if req.contact_no:
        schedule_details.append(f"Contact: {req.contact_no.strip()}")
        
    hv.checklist_notes = "\n".join(schedule_details) if schedule_details else req.notes

    app.current_stage = "Home_Visit"
    app.application_stage_status = "Home_Visit_Scheduled"

    _log_adoption_timeline(
        app.adoption_id,
        "Home_Visit",
        "Home Visit Scheduled",
        current_user.user_id,
        f"Mode: {req.visit_type} on {req.scheduled_date.strftime('%Y-%m-%d %H:%M')}. Address: {req.adopter_address or app.address}",
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
    """Stage 4: Record comprehensive Home Visit Assessment."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    asg = require_task_actor(app, current_user, db, "Home_Visit", override_reason=req.override_reason)

    hv = db.query(AdoptionHomeVisit).filter(AdoptionHomeVisit.adoption_id == adoption_id).first()
    if not hv:
        hv = AdoptionHomeVisit(adoption_id=adoption_id)
        db.add(hv)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if asg is not None:
        hv.inspector_id, hv.assignment_id = asg.assigned_to, asg.assignment_id
    elif not hv.inspector_id:
        hv.inspector_id = current_user.user_id
    hv.evaluated_by = current_user.user_id
    hv.residence_condition = req.residence_condition
    hv.available_living_space = req.available_living_space
    hv.environment_safety = req.environment_safety
    hv.cleanliness_sanitation = req.cleanliness_sanitation
    hv.presence_of_hazards = req.presence_of_hazards
    hv.existing_pets = req.existing_pets
    hv.overall_suitability = req.overall_suitability or req.inspection_result
    hv.recommendations = req.recommendations
    hv.additional_observations = req.additional_observations
    hv.is_fencing_secure = req.is_fencing_secure
    hv.is_shelter_adequate = req.is_shelter_adequate
    hv.hazard_free = req.hazard_free
    
    # Compile comprehensive assessment notes
    assessment_blocks = []
    if req.checklist_notes:
        assessment_blocks.append(req.checklist_notes.strip())
    if req.residence_condition:
        assessment_blocks.append(f"Residence Condition: {req.residence_condition}")
    if req.available_living_space:
        assessment_blocks.append(f"Living Space for Animal: {req.available_living_space}")
    if req.environment_safety:
        assessment_blocks.append(f"Environment Safety: {req.environment_safety}")
    if req.cleanliness_sanitation:
        assessment_blocks.append(f"Cleanliness & Sanitation: {req.cleanliness_sanitation}")
    if req.presence_of_hazards:
        assessment_blocks.append(f"Hazards: {req.presence_of_hazards}")
    if req.existing_pets:
        assessment_blocks.append(f"Existing Pets: {req.existing_pets}")
    if req.recommendations:
        assessment_blocks.append(f"Recommendations: {req.recommendations}")
    if req.additional_observations:
        assessment_blocks.append(f"Additional Observations: {req.additional_observations}")
        
    hv.checklist_notes = "\n\n".join(assessment_blocks) if assessment_blocks else req.checklist_notes
    hv.gps_latitude = Decimal(str(req.gps_latitude)) if req.gps_latitude is not None else None
    hv.gps_longitude = Decimal(str(req.gps_longitude)) if req.gps_longitude is not None else None
    hv.visit_photos = req.visit_photos
    
    res = (req.inspection_result or "Suitable").strip()
    hv.inspection_result = res
    hv.conducted_at = now

    if res in ["Suitable", "Suitable with Conditions", "Passed"]:
        app.current_stage = "Review"
        app.application_stage_status = "Home_Visit_Suitable"
        action = f"Home Visit Completed: {res}"
        notes = f"Home environment assessed as {res}. Proceeding to Stage 5 Review."
    elif res in ["Not Suitable", "Failed"] and _authority(current_user):
        app.status = "Rejected"
        app.application_stage_status = "Home_Visit_Not_Suitable"
        app.review_notes = hv.checklist_notes or "Home environment inspection failed."
        action = "Home Visit Result: Not Suitable"
        notes = app.review_notes
        close_open_tasks(db, app, "Rejected")
    elif res in ["Not Suitable", "Failed"]:
        # The inspector recommends; rejecting the application is the case owner's decision.
        app.current_stage = "Home_Visit"
        app.application_stage_status = "Home_Visit_Not_Suitable_Pending_Decision"
        action = "Home Visit Result: Not Suitable (owner decision needed)"
        notes = hv.checklist_notes or "Home environment inspection failed."
        for uid in _owner_or_head_ids(app, db):
            _notify(db, uid, "adoption_decision_needed", app.adoption_id, "Adoption decision needed ⚠️",
                    f"{current_user.name} assessed {app.full_name}'s home as NOT SUITABLE. Review the assessment and decide.")
    else:
        # Requires Follow-up
        app.current_stage = "Home_Visit"
        app.application_stage_status = "Home_Visit_Requires_Followup"
        action = "Home Visit: Follow-up Required"
        notes = hv.checklist_notes or "Applicant needs to address environmental/fencing safety items."

    _log_adoption_timeline(app.adoption_id, "Home_Visit", action, current_user.user_id, notes, db)
    if req.override_reason and asg is not None and asg.assigned_to != current_user.user_id:
        _log_adoption_timeline(app.adoption_id, "Home_Visit", "Recorded by case owner (override)", current_user.user_id, req.override_reason.strip(), db)
    if app.application_stage_status == "Home_Visit_Requires_Followup":
        mark_in_progress(asg)
    else:
        complete_task(db, asg, current_user)

    try:
        notif = Notification(
            user_id=app.applicant_id,
            title=f"Adoption Home Visit: {action}",
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
    """Stage 5: Review complete adoption dossier and submit decision."""
    app = db.query(Adoption).options(
        joinedload(Adoption.animal),
        joinedload(Adoption.interview),
        joinedload(Adoption.home_visit),
    ).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    _require_adoption_access(app, current_user, db, decision=True)

    # Strict Stage Gating: Home Visit must be completed
    if app.current_stage not in ["Review", "Approval", "Certificate", "Handover", "Monitoring"]:
        raise HTTPException(status_code=400, detail="Cannot submit Review: Home Visit stage must be completed first.")

    decision_choice = (req.decision or req.recommendation or "Approve").strip()
    app.review_notes = req.review_notes

    if decision_choice in ["Approve", "Approved", "Recommend_Approval"]:
        app.current_stage = "Approval"
        app.application_stage_status = "Review_Approved"
        action = "Review Completed: Recommended for Approval"
        notes = req.review_notes
    elif decision_choice in ["Return for Follow-up", "Needs_Follow_up", "Needs_Correction"]:
        app.application_stage_status = "Review_Returned_For_Followup"
        action = "Review: Returned for Follow-up"
        notes = req.review_notes
    else:
        # Reject
        app.status = "Rejected"
        app.application_stage_status = "Review_Rejected"
        close_open_tasks(db, app, "Rejected")
        _retire_pending_pet_record(app, db)
        action = "Review: Adoption Rejected"
        notes = req.review_notes

    _log_adoption_timeline(
        app.adoption_id,
        "Review",
        action,
        current_user.user_id,
        notes,
        db,
    )

    db.commit()
    return {
        "message": f"Dossier review recorded: {action}.",
        "current_stage": app.current_stage,
        "status": app.status,
    }


# ── POST /adoptions/{adoption_id}/approve (Stage 6 Official Approval) ───────
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
    year_val = now.year
    cert_number = cert.certificate_number if cert else f"SS-ADOPT-{year_val}-{adoption_id:05d}"
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
        pass  # an issued certificate is immutable (number, hash, QR and issue date stay as issued)

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
        head_officers = _barangay_staff(app.animal, db)
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
    return _build_certificate_response(cert, app, db=db)


# ── GET /adoptions/{adoption_id}/certificate (Stage 7 Certificate View) ───────
@router.get("/{adoption_id}/certificate", response_model=AdoptionCertificateResponse)
def get_adoption_certificate(
    adoption_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve official adoption certificate with SHA-256 integrity hash and QR code."""
    app = (
        db.query(Adoption)
        .options(joinedload(Adoption.animal), joinedload(Adoption.applicant))
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if not (app.applicant_id == current_user.user_id or can_view_adoption(current_user, app, db)):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == adoption_id).first()
    if not cert:
        is_approved = (
            app.status == "Approved"
            or app.current_stage in ["Approval", "Certificate", "Payment", "Handover", "Monitoring", "Completed"]
            or app.application_stage_status in ["Review_Approved", "Approved", "Agreement_Signed", "Handover_Pending", "Handed_Over"]
        )
        if is_approved:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            year_val = now.year
            cert_number = f"SS-ADOPT-{year_val}-{adoption_id:05d}"
            animal_name = app.animal.animal_name if app.animal else "Animal"
            raw_hash_data = f"{cert_number}:{adoption_id}:{animal_name}:{app.full_name}:{now.isoformat()}"
            verification_hash = hashlib.sha256(raw_hash_data.encode("utf-8")).hexdigest()

            qr = qrcode.QRCode(version=1, box_size=8, border=2)
            qr.add_data(f"STRAYSAFE-CERT|{cert_number}|{adoption_id}|{verification_hash[:16]}")
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            qr_img.save(buf, format="PNG")
            qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

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
            db.commit()
            db.refresh(cert)
        else:
            raise HTTPException(status_code=400, detail="Adoption certificate is only available for approved adoptions.")

    return _build_certificate_response(cert, app, db=db)


# ── POST /adoptions/{adoption_id}/certificate/proceed (Stage 6 -> Stage 7) ───────
@router.post("/{adoption_id}/certificate/proceed")
def proceed_to_certificate_stage(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Move adoption from Stage 6 (Approval) to Stage 7 (Certificate)."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    _require_adoption_access(app, current_user, db, decision=True)

    app.current_stage = "Certificate"
    app.application_stage_status = "Certificate_Ready"

    # Ensure certificate record exists
    cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == adoption_id).first()
    if not cert:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cert_number = f"SS-ADOPT-{now.year}-{adoption_id:05d}"
        animal_name = app.animal.animal_name if app.animal else "Animal"
        raw_hash_data = f"{cert_number}:{adoption_id}:{animal_name}:{app.full_name}:{now.isoformat()}"
        verification_hash = hashlib.sha256(raw_hash_data.encode("utf-8")).hexdigest()

        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(f"STRAYSAFE-CERT|{cert_number}|{adoption_id}|{verification_hash[:16]}")
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        qr_img.save(buf, format="PNG")
        qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

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
        app.certificate_id = cert.certificate_id

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Certificate",
        action="Proceeded to Stage 7 Certificate",
        performed_by=current_user.user_id,
        notes="Adoption moved to Stage 7 Certificate. Ready to review and send digital certificate.",
        db=db,
    )
    db.commit()
    return {
        "message": "Proceeded to Certificate stage.",
        "current_stage": app.current_stage,
        "certificate_number": cert.certificate_number if cert else None,
        "is_certificate_sent": getattr(app, "is_certificate_sent", False) or False,
    }


# ── POST /adoptions/{adoption_id}/certificate/send (Send to Resident) ───────
@router.post("/{adoption_id}/certificate/send")
def send_digital_certificate_to_resident(
    adoption_id: int,
    req: AdoptionCertificateSendRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Send generated digital certificate and approval notification to resident."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    _require_adoption_access(app, current_user, db, decision=True)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.is_certificate_sent = True
    app.certificate_sent_at = now
    app.application_stage_status = "Certificate_Sent"

    animal_name = app.animal.animal_name if app.animal else "Rescue Pet"

    # Send in-app notification to resident
    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Approved & Certificate Issued",
            message=f"Your adoption application for {animal_name} has been officially approved. Your digital Adoption Certificate is now available.",
            notification_type="adoption_certificate_issued",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Certificate",
        action="Digital Certificate Sent to Resident",
        performed_by=current_user.user_id,
        notes=f"Digital certificate officially sent to adopter {app.full_name} on {now.strftime('%B %d, %Y %I:%M %p')}.",
        db=db,
    )

    db.commit()
    return {
        "message": f"Digital certificate sent to {app.full_name}.",
        "is_certificate_sent": True,
        "certificate_sent_at": now.isoformat(),
    }


# ── POST /adoptions/{adoption_id}/handover/proceed (Stage 7 -> Stage 8) ───────
@router.post("/{adoption_id}/handover/proceed")
def proceed_to_handover_stage(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Move adoption from Stage 7 (Certificate) to Stage 8 (Handover)."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    asg = require_task_actor(app, current_user, db, "Handover")
    mark_in_progress(asg)

    if not app.is_certificate_sent:
        raise HTTPException(status_code=400, detail="Please send the digital certificate to the resident before proceeding to Handover.")

    app.current_stage = "Handover"
    app.application_stage_status = "Handover_Pending"
    if not app.handover_status or app.handover_status == "Pending":
        app.handover_status = "Pending"

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Handover",
        action="Proceeded to Stage 8 Handover",
        performed_by=current_user.user_id,
        notes="Adoption moved to Stage 8 Handover. Ready for handover scheduling.",
        db=db,
    )
    db.commit()
    return {"message": "Proceeded to Handover stage.", "current_stage": app.current_stage}


# ── POST /adoptions/{adoption_id}/handover/schedule (Schedule Handover) ───────
@router.post("/{adoption_id}/handover/schedule")
def schedule_adoption_handover(
    adoption_id: int,
    req: AdoptionHandoverScheduleRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Schedule physical handover date, time, location, and assigned staff."""
    app = db.query(Adoption).options(joinedload(Adoption.animal)).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    asg = require_task_actor(app, current_user, db, "Handover")
    mark_in_progress(asg)

    app.current_stage = "Handover"
    app.handover_scheduled_date = req.handover_date
    app.handover_scheduled_time = req.handover_time or "10:00 AM"
    app.handover_location = req.handover_location or "Barangay Holding Facility"
    app.handover_assigned_staff = req.assigned_staff or current_user.name
    app.handover_notes = req.notes
    app.handover_status = "Scheduled"
    app.application_stage_status = "Handover_Scheduled"

    animal_name = app.animal.animal_name if app.animal else "Rescue Pet"
    date_formatted = req.handover_date.strftime("%B %d, %Y")

    # Send in-app notification to resident
    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Handover Scheduled",
            message=f"Your pet adoption handover for {animal_name} has been scheduled for {date_formatted} at {app.handover_scheduled_time} at {app.handover_location}.",
            notification_type="adoption_handover_scheduled",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception:
        pass

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Handover",
        action="Handover Scheduled",
        performed_by=current_user.user_id,
        notes=f"Physical handover scheduled for {date_formatted} at {app.handover_scheduled_time} ({app.handover_location}). Assigned staff: {app.handover_assigned_staff}.",
        db=db,
    )

    db.commit()
    return {"message": "Handover scheduled successfully.", "handover_status": "Scheduled"}


# ── POST /adoptions/{adoption_id}/handover/resident-confirm (Resident Ack) ───
@router.post("/{adoption_id}/handover/resident-confirm")
def resident_confirm_handover_schedule(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_resident),
):
    """Resident confirms / acknowledges the scheduled adoption handover."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    if app.applicant_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Permission Denied.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    app.resident_handover_confirmed = True
    app.resident_handover_confirmed_at = now

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Handover",
        action="Resident Confirmed Handover Schedule",
        performed_by=current_user.user_id,
        notes=f"Adopter {current_user.name} confirmed the handover schedule on {now.strftime('%B %d, %Y %I:%M %p')}.",
        db=db,
    )
    db.commit()
    return {"message": "Handover schedule confirmed.", "resident_handover_confirmed": True}


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
    asg = require_task_actor(app, current_user, db, "Handover")
    complete_task(db, asg, current_user)

    if app.status != "Approved":
        raise HTTPException(status_code=400, detail="Only Approved applications can complete pet handover.")

    now = req.handover_date or datetime.now(timezone.utc).replace(tzinfo=None)
    app.handover_location = req.handover_location or "Barangay Holding Facility"
    app.handover_photo_url = req.handover_photo_url
    app.staff_handed_over = True
    app.staff_handover_date = now
    app.staff_handover_by = current_user.user_id
    app.is_handed_over = True
    app.handover_date = now
    _release_animal_from_facility(app, db, current_user.user_id, final=True)

    handover_notes = req.notes or ""
    if req.animal_condition:
        handover_notes = f"[Condition: {req.animal_condition}] {handover_notes}".strip()
    if req.receiving_adopter:
        handover_notes = f"[Receiver: {req.receiving_adopter}] {handover_notes}".strip()

    completed = _finalize_adoption_if_ready(app, db, current_user, notes=handover_notes)

    log_activity(
        db=db,
        action="COMPLETE_ADOPTION_HANDOVER",
        target_table="adoptions",
        target_id=app.adoption_id,
        description=f"Staff {current_user.name} completed physical handover for Adoption #{app.adoption_id} with custody confirmation.",
        log_type="operation",
        user_id=current_user.user_id,
        request=http_req,
    )

    db.commit()
    db.refresh(app)
    return {
        "message": "Physical handover successfully documented! Post-Adoption Welfare Monitoring initiated.",
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

    if not (app.applicant_id == current_user.user_id or can_view_adoption(current_user, app, db)):
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
        head_officers = _barangay_staff(app.animal, db)
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
    _require_adoption_access(app, current_user, db, decision=True)
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


# ── POST /adoptions/{adoption_id}/monitoring/proceed (Stage 8 -> Stage 9) ───────
@router.post("/{adoption_id}/monitoring/proceed")
def proceed_to_monitoring_stage(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Move adoption application directly from Stage 8 (Handover) to Stage 9 (Monitoring)."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    _require_adoption_access(app, current_user, db, decision=True)
    if not _handover_finalized(app):
        raise HTTPException(
            status_code=409,
            detail="Handover is not complete yet. Monitoring starts only after staff released the pet and the adopter confirmed receipt.",
        )

    app.current_stage = "Monitoring"
    if not app.post_monitoring_status or app.post_monitoring_status == "Pending":
        app.post_monitoring_status = "Active"
    app.application_stage_status = "Monitoring_Active"

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Monitoring",
        action="Proceeded to Stage 9 Post-Adoption Welfare Monitoring",
        performed_by=current_user.user_id,
        notes="Adoption moved directly to Stage 9 Welfare Monitoring. Post-adoption monitoring active.",
        db=db,
    )
    db.commit()
    return {
        "message": "Proceeded to Stage 9: Post-Adoption Welfare Monitoring.",
        "current_stage": app.current_stage,
        "post_monitoring_status": app.post_monitoring_status,
    }


# ── POST /adoptions/{adoption_id}/certificate/refresh ───────────────────────
@router.post("/{adoption_id}/certificate/refresh", response_model=AdoptionCertificateResponse)
def refresh_certificate_details(
    adoption_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Bring the certificate's animal details (name, type, breed, sex, photo) up to date with the Pet Record.
    The number, security code, signatory and issue date never change. Locked once the handover is final.
    """
    app = (
        db.query(Adoption)
        .options(joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.media), joinedload(Adoption.applicant))
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    _require_adoption_access(app, current_user, db, decision=True)
    cert = db.query(AdoptionCertificate).filter(AdoptionCertificate.adoption_id == adoption_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="This application has no certificate yet.")
    if cert.certificate_status == "Revoked":
        raise HTTPException(status_code=409, detail="This certificate was revoked and cannot be updated.")
    if _handover_finalized(app):
        raise HTTPException(status_code=409, detail="The pet has already been handed over, so the certificate is final and can no longer be updated.")
    if not cert.snapshot:
        _freeze_certificate(cert, app, db)
    else:
        changed = _certificate_animal_facts(app, db)
        cert.snapshot = {**cert.snapshot, **changed}  # new dict so the JSON column change is detected
    _log_adoption_timeline(app.adoption_id, "Certificate", "Certificate details updated from the Pet Record", current_user.user_id,
                           "Animal details on the certificate were refreshed from the current Pet Record.", db)
    db.commit()
    db.refresh(cert)
    return _build_certificate_response(cert, app, db=db)


# ── POST /adoptions/upload-monitoring-photos ────────────────────────────────
@router.post("/upload-monitoring-photos")
async def upload_monitoring_photos(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload photos for post-adoption welfare monitoring records from camera / gallery / desktop.
    """
    if current_user.role_id not in [1, 2, 3, 4]:
        raise HTTPException(status_code=403, detail="Permission Denied.")

    uploaded_urls = await _upload_adoption_photos(files, "adoptions/monitoring", "monitoring")

    if not uploaded_urls:
        raise HTTPException(status_code=400, detail="Failed to upload monitoring photo.")

    return {"urls": uploaded_urls}


# ── POST /adoptions/{adoption_id}/monitoring/record ─────────────────────────
@router.post("/{adoption_id}/monitoring/record", response_model=AdoptionMonitoringLogResponse)
def record_adoption_staff_monitoring_visit(
    adoption_id: int,
    req: AdoptionStaffMonitoringRecordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage 9: Staff or Resident records post-adoption welfare monitoring inspection / check-in."""
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")

    is_resident = (current_user.role_id == 1)
    if is_resident and app.applicant_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only submit monitoring updates for your own adopted pet.")
    asg = None
    if not is_resident:
        asg = require_task_actor(app, current_user, db, "Monitoring", override_reason=req.override_reason)
        mark_in_progress(asg)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    visit_date = req.monitoring_date.replace(tzinfo=None) if req.monitoring_date else now
    
    if is_resident:
        personnel = f"{current_user.name} (Adopter)"
    else:
        personnel = getattr(current_user, "name", None) or "Barangay Staff"  # the authenticated recorder, never client text

    # Count existing logs to assign milestone name
    existing_count = db.query(AdoptionMonitoringLog).filter(AdoptionMonitoringLog.adoption_id == adoption_id).count()
    visit_num = existing_count + 1
    milestone_name = f"Adopter Check-in #{visit_num}" if is_resident else f"Monitoring Visit #{visit_num}"

    remarks_text = req.remarks or req.observations or req.comments or ""

    # Structured metadata encoded as JSON for full fidelity
    import json
    metadata = {
        "visit_number": visit_num,
        "is_adopter_submission": is_resident,
        "monitoring_type": req.monitoring_type or ("Adopter Welfare Check-in" if is_resident else "Initial Follow-up"),
        "animal_condition": req.animal_condition or "Healthy",
        "health_status": req.health_status or "Healthy",
        "living_condition": req.living_condition or "Good",
        "food_and_water": req.food_and_water or "Adequate",
        "shelter_condition": req.shelter_condition or "Safe",
        "vaccination_status": req.vaccination_status or "Up to Date",
        "behavior": req.behavior or "Normal",
        "personnel": personnel,
        "remarks": remarks_text,
        "next_followup_date": req.next_followup_date or req.follow_up_action or "",
    }
    encoded_json = json.dumps(metadata)

    summary_notes = (
        f"__JSON_META__{encoded_json}__END_META__"
        f"Recorded By: {personnel}. Type: {req.monitoring_type or ('Adopter Welfare Check-in' if is_resident else 'Initial Follow-up')}. "
        f"Condition: {req.animal_condition or 'Healthy'}. Health: {req.health_status or 'Healthy'}. "
        f"Living Env: {req.living_condition or 'Good'}. Shelter: {req.shelter_condition or 'Safe'}. "
        f"Food & Water: {req.food_and_water or 'Adequate'}. Vaccination: {req.vaccination_status or 'Up to Date'}. "
        f"Behavior: {req.behavior or 'Normal'}. Remarks: {remarks_text or 'None'}. "
        f"Next Follow-up: {req.next_followup_date or 'N/A'}"
    )

    new_log = AdoptionMonitoringLog(
        adoption_id=adoption_id,
        milestone_name=milestone_name,
        due_date=visit_date.date(),
        submitted_at=visit_date,
        status="Submitted" if is_resident else "Approved",
        health_status=req.health_status or req.animal_condition or "Healthy",
        photos=req.photos or [],
        adopter_notes=remarks_text or None,
        reviewed_by=None if is_resident else current_user.user_id,
        review_notes=summary_notes,
        reviewed_at=None if is_resident else now,
        entry_type="Adopter_Checkin" if is_resident else "Staff_Visit",
    )
    if not is_resident:
        # Structured staff assessment (the assigned monitor's record)
        new_log.assignment_id = asg.assignment_id if asg is not None else None
        new_log.assessed_by = current_user.user_id
        new_log.assessed_at = now
        new_log.assessment_result = req.assessment_result or "Satisfactory"
        new_log.animal_condition = req.animal_condition
        new_log.living_condition = req.living_condition
        new_log.food_and_water = req.food_and_water
        new_log.shelter_condition = req.shelter_condition
        new_log.vaccination_status = req.vaccination_status
        new_log.assessment_notes = remarks_text or None
        new_log.assessment_photos = req.photos or []
    db.add(new_log)

    app.current_stage = "Monitoring"
    app.post_monitoring_status = "Active"
    app.application_stage_status = "Monitoring_Active"

    action_label = f"Adopter Welfare Record Submitted ({milestone_name})" if is_resident else f"Staff Monitoring Record Added ({milestone_name})"
    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Monitoring",
        action=action_label,
        performed_by=current_user.user_id,
        notes=f"Type: {req.monitoring_type or ('Adopter Check-in' if is_resident else 'Staff Visit')} | Condition: {req.animal_condition or 'Healthy'} | Health: {req.health_status or 'Healthy'}",
        db=db,
    )

    # If submitted by resident, notify barangay staff
    if is_resident:
        try:
            # Head Officers + the assigned monitor (not every staff member of the barangay)
            head_officers = list(_barangay_staff(app.animal, db))
            monitor = open_assignment(app, "Monitoring", db)
            if monitor is not None and monitor.assignee is not None and all(h.user_id != monitor.assigned_to for h in head_officers):
                head_officers.append(monitor.assignee)
            for ho in head_officers:
                notif = Notification(
                    user_id=ho.user_id,
                    title="Adopter Welfare Update Submitted",
                    message=f"Adopter {app.full_name} submitted a new welfare monitoring update for their adopted pet.",
                    notification_type="adoption_monitoring_submitted",
                    related_id=app.adoption_id,
                )
                db.add(notif)
        except Exception:
            pass
    else:
        # Resident notification
        try:
            notif = Notification(
                user_id=app.applicant_id,
                title="Post-Adoption Welfare Monitoring Update",
                message="Your adopted pet's post-adoption monitoring record has been updated by Barangay Staff.",
                notification_type="adoption_monitoring_updated",
                related_id=app.adoption_id,
            )
            db.add(notif)
        except Exception:
            pass

    db.commit()
    db.refresh(new_log)
    return _build_monitoring_response(new_log)


# ── GET /adoptions/monitoring/dashboard ──────────────────────────────────────
@router.get("/monitoring/dashboard")
def get_monitoring_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Staff dashboard: summary of active post-adoption monitoring cases and upcoming due milestones."""
    if current_user.role_id not in (3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Barangay Staff and Administrators manage adoption monitoring.")
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

    if current_user.role_id == 3 and not current_user.is_head_officer:
        query = query.filter(Adoption.adoption_id.in_(
            db.query(AdoptionAssignment.adoption_id).filter(
                AdoptionAssignment.assigned_to == current_user.user_id,
                AdoptionAssignment.status.in_(VISIBLE_ASSIGNMENT_STATUSES),
            )
        ))

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
            joinedload(Adoption.applicant),
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

    if not (app.applicant_id == current_user.user_id or can_view_adoption(current_user, app, db)):
        raise HTTPException(status_code=403, detail="Permission Denied.")

    # Retrieve all timeline audit logs
    timeline_logs = (
        db.query(AdoptionTimelineLog)
        .options(joinedload(AdoptionTimelineLog.actor))
        .filter(AdoptionTimelineLog.adoption_id == adoption_id)
        .order_by(AdoptionTimelineLog.created_at.asc())
        .all()
    )
    if not timeline_logs and app.timeline_logs:
        timeline_logs = app.timeline_logs

    timeline_responses = [_build_timeline_response(t) for t in timeline_logs]
    if not timeline_responses:
        # Synthesize initial submission log if none exist
        timeline_responses.append(
            AdoptionTimelineLogResponse(
                timeline_id=1,
                adoption_id=app.adoption_id,
                stage=app.current_stage or "Application",
                action="Application Logged",
                performed_by=app.applicant_id,
                actor_name=app.full_name or "Applicant",
                notes=f"Adoption application registered for {getattr(app.animal, 'animal_name', None) or 'Rescue Pet'}.",
                created_at=app.created_at or datetime.now(),
            )
        )

    return AdoptionDossierResponse(
        adoption=_build_adoption_response(app),
        verification=_build_verification_response(app.verification),
        interview=_build_interview_response(app.interview),
        home_visit=_build_home_visit_response(app.home_visit),
        certificate=_build_certificate_response(app.certificate, app, db=db),
        monitoring_logs=[_build_monitoring_response(l) for l in getattr(app, 'monitoring_logs', [])],
        timeline_logs=timeline_responses,
    )


# ── POST /adoptions/{adoption_id}/successful/proceed (Stage 9 -> Stage 10 Final) ─
@router.post("/{adoption_id}/successful/proceed")
@router.post("/{adoption_id}/mark-successful")
def mark_adoption_successful_final(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Stage 10: Officially mark adoption as Successful, complete monitoring, and close case permanently.
    This is the END of the StraySafe adoption lifecycle.
    """
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal),
            joinedload(Adoption.applicant),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    _require_adoption_access(app, current_user, db, decision=True)
    if not _handover_finalized(app):
        raise HTTPException(
            status_code=409,
            detail="Cannot mark this adoption successful: the handover was never confirmed by both staff and the adopter, so ownership has not transferred.",
        )

    monitoring_assigned = db.query(AdoptionAssignment.assignment_id).filter(
        AdoptionAssignment.adoption_id == app.adoption_id,
        AdoptionAssignment.task_type == "Monitoring",
        AdoptionAssignment.status.in_(("Assigned", "Accepted", "In_Progress", "Completed")),
    ).first()
    if monitoring_assigned and not db.query(AdoptionMonitoringLog.log_id).filter(
        AdoptionMonitoringLog.adoption_id == app.adoption_id,
        AdoptionMonitoringLog.entry_type == "Staff_Visit",
        AdoptionMonitoringLog.assessed_by.isnot(None),
    ).first():
        raise HTTPException(status_code=409, detail="The assigned monitoring staff has not submitted a welfare assessment yet.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    close_open_tasks(db, app, "Completed")
    app.current_stage = "Successful_Adoption"
    app.application_stage_status = "Case_Closed"
    app.post_monitoring_status = "Completed"
    app.status = "Approved"
    app.adoption_completed_at = now

    _log_adoption_timeline(
        adoption_id=app.adoption_id,
        stage="Successful_Adoption",
        action="Stage 10: Adoption Officially Completed & Case Closed",
        performed_by=current_user.user_id,
        notes="All required adoption, handover, and post-adoption welfare monitoring procedures successfully completed. Case closed.",
        db=db,
    )

    pet_name = app.animal.animal_name if app.animal else "your adopted pet"

    # Send congratulatory notification to the resident
    try:
        notif = Notification(
            user_id=app.applicant_id,
            title="Adoption Successfully Completed! 🏆🐾",
            message=f"Congratulations! Your adoption of {pet_name} has successfully completed the StraySafe adoption process.",
            notification_type="adoption_completed",
            related_id=app.adoption_id,
        )
        db.add(notif)
    except Exception as e:
        logger.warning(f"Could not dispatch resident completion notification: {e}")

    db.commit()
    db.refresh(app)

    return {
        "message": "Adoption officially marked as successful and case closed.",
        "current_stage": app.current_stage,
        "current_stage_name": "Successful Adoption",
        "adoption_status": "SUCCESSFUL",
        "case_status": "CLOSED",
        "monitoring_status": "COMPLETED",
        "adoption_completed_at": app.adoption_completed_at.isoformat() if app.adoption_completed_at else now.isoformat(),
        "adoption": _build_adoption_response(app),
    }



