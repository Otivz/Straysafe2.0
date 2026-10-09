# pyrefly: ignore [missing-import]
import io
import json
import math
import os
import tempfile
import urllib.request
import uuid
from datetime import datetime, timedelta
from pydantic import BaseModel
from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from PIL import Image

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import and_, desc, or_, func
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.database import SessionLocal, get_db
from app.models.chat import ChatThread
from app.models.coverage import CoverageSetting
from app.models.landmark import Landmark
from app.utils.landmark_cache import get_landmarks_map
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.pet_qr import PetQRCode
from app.models.report import (
    Adoption,
    Comment,
    EndorsementLetter,
    HoldingAnimal,
    HoldingTimeline,
    Report,
    ReportCategory,
    ReportMedia,
    ReportReturn,
    ReportStatus,
    Rescue,
    RescueAssignment,
    StatusHistory,
)
from app.models.report_dispute import ReportDispute
from app.models.report_match import ReportMatch
from app.models.user import Barangay, Subdivision, User
from app.models.warning import OwnerWarning
from app.schemas.coverage import CoverageAreaResponse, CoverageAreaUpdate
from app.schemas.report import (
    CommentCreate,
    CommentResponse,
    ReportClaimRequest,
    ReportCreate,
    ReportDisputeCreate,
    ReportDisputeResponse,
    ReportDisputeReviewRequest,
    ReportFalseAlarmRequest,
    ReportMediaResponse,
    ReportMergeRequest,
    ReportMergeGroupRequest,
    ReportResponse,
    ReportSelfReunitedRequest,
    ReportStatusUpdate,
    ReportTakeoverRequest,
    ReportTransferActionRequest,
    ReportTransferRejectRequest,
    ReportTransferRequest,
    ReportUnmergeRequest,
    ReportUpdate,
    ReportVerifyRequest,
    StatusHistoryResponse,
)
from app.utils.ai_suggestions import call_gemini_with_fallback, is_gemini_enabled_in_db
from app.utils.audit import log_activity
from app.utils import ai_jobs, ai_pipeline
from app.utils.case_groups import (
    case_members, case_pet_claims, case_root, group_pet_conflict, pet_name, release_inherited_pet, require_case_pet, require_direct_pet_link,
    resync_case_pet_identity, refresh_pet_behavior, pet_link_trusted, case_confirmed_match,
)
from app.utils.owner_returns import validate_owner_return, record_owner_return, owner_return_summary, _report_media_url
from app.utils.case_review import (
    ESCALATED_STATUS,
    RESOLVED_WITH_ANIMAL_STATUSES,
    require_animal_record,
    require_review_permission,
    review_permission,
)
from app.utils.auth import get_current_staff_or_admin, get_current_user, verify_subdivision_scope
from app.limiter import limiter
from app.utils.photo_checks import STATUS_NOT_CHECKED, classify_ai_confidence

# AI photo / video scans: largest file the scanners will accept (matches the upload limit)
AI_SCAN_MAX_BYTES = 10 * 1024 * 1024
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.color_detection import extract_dominant_colors
from app.utils.model_loader import get_yolo_model
from app.utils.uploads import read_and_validate_upload, validate_cloudinary_url

# Statuses representing closed, resolved, terminal, impounded, or consolidated cases
RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]

router = APIRouter(
    prefix="/reports",
    tags=["reports"]
)


def populate_handler_info(rep_data: ReportResponse, rep: Report):
    """Populates current handler officer and pending transfer details on ReportResponse."""
    if rep.assigned_leader:
        rep_data.assigned_leader_id = rep.assigned_leader_id
        rep_data.assigned_leader_name = rep.assigned_leader.name
        rep_data.assigned_leader_photo = rep.assigned_leader.profile_picture
    elif rep.assigned_leader_id:
        rep_data.assigned_leader_id = rep.assigned_leader_id
        rep_data.assigned_leader_name = f"Officer #{rep.assigned_leader_id}"
        rep_data.assigned_leader_photo = None
    else:
        rep_data.assigned_leader_id = None
        rep_data.assigned_leader_name = None
        rep_data.assigned_leader_photo = None
    rep_data.claimed_at = rep.claimed_at

    # Pending Transfer
    rep_data.pending_transfer_to_id = rep.pending_transfer_to_id
    rep_data.pending_transfer_from_id = rep.pending_transfer_from_id
    rep_data.pending_transfer_notes = rep.pending_transfer_notes
    rep_data.pending_transfer_created_at = rep.pending_transfer_created_at

    if rep.pending_transfer_to:
        rep_data.pending_transfer_to_name = rep.pending_transfer_to.name
        rep_data.pending_transfer_to_photo = rep.pending_transfer_to.profile_picture
    elif rep.pending_transfer_to_id:
        rep_data.pending_transfer_to_name = f"Officer #{rep.pending_transfer_to_id}"
        rep_data.pending_transfer_to_photo = None
    else:
        rep_data.pending_transfer_to_name = None
        rep_data.pending_transfer_to_photo = None

    if rep.pending_transfer_from:
        rep_data.pending_transfer_from_name = rep.pending_transfer_from.name
    elif rep.pending_transfer_from_id:
        rep_data.pending_transfer_from_name = f"Officer #{rep.pending_transfer_from_id}"
    else:
        rep_data.pending_transfer_from_name = None

    # Takeover Eligibility based on Inactivity
    compute_takeover_eligibility(rep, rep_data)

    # Duplicate & Merge Tracking Details
    populate_merge_info(rep_data, rep)


REPORTS_DEFAULT_PAGE_SIZE = int(os.getenv("REPORTS_DEFAULT_PAGE_SIZE", "500"))
REPORTS_MAX_PAGE_SIZE = int(os.getenv("REPORTS_MAX_PAGE_SIZE", "1000"))

_OWNER_CONTACT_FIELDS = ("owner_phone", "owner_email", "owner_address", "pet_qr_token", "pet_qr_code_hash", "pet_qr_code_url")


def redact_owner_contact(rep_data: ReportResponse, viewer: Optional[User]) -> ReportResponse:
    """
    A registered pet owner's phone, email, home address and QR token are only sent to staff (who coordinate the
    handover) and to that owner. Other residents still see the report and the owner's name.
    """
    if viewer is not None and viewer.role_id in (2, 3, 4):
        return rep_data
    # Residents see only the disputes they filed themselves (reasons and documents are private)
    if rep_data.disputes:
        rep_data.disputes = [d for d in rep_data.disputes if viewer is not None and d.resident_user_id == viewer.user_id]
        for d in rep_data.disputes:
            d.match_history = None  # the staff decision trail is for reviewers
    if viewer is not None and rep_data.owner_id and rep_data.owner_id == viewer.user_id:
        return rep_data
    for field in _OWNER_CONTACT_FIELDS:
        setattr(rep_data, field, None)
    return rep_data


def populate_merge_info(rep_data: ReportResponse, rep: Report, db: Optional[Session] = None):
    """Populates duplicate merge tracking details and child reports on ReportResponse."""
    rep_data.duplicate_of_report_id = rep.duplicate_of_report_id
    rep_data.merged_at = rep.merged_at
    rep_data.merged_by = rep.merged_by
    if getattr(rep, "merged_by_user", None):
        rep_data.merged_by_name = rep.merged_by_user.name
    elif rep.merged_by:
        rep_data.merged_by_name = f"Officer #{rep.merged_by}"
    else:
        rep_data.merged_by_name = None
    rep_data.merge_notes = rep.merge_notes

    # Populate merged secondary reports if this is a primary report
    merged_items = []
    children = []
    if hasattr(rep, "merged_reports") and rep.merged_reports:
        children = rep.merged_reports
    elif db and getattr(rep, "report_id", None):
        children = db.query(Report).options(
            joinedload(Report.reporter),
            joinedload(Report.media)
        ).filter(Report.duplicate_of_report_id == rep.report_id).all()

    for child in children:
        child_media = []
        if hasattr(child, "media") and child.media:
            for m in child.media:
                url = (m.file_url or "").lower()
                is_doc = m.media_type == "Document" or url.endswith((".pdf", ".doc", ".docx", ".txt")) or "/raw/" in url
                # Sighting evidence: only resident-uploaded photos/videos (exclude staff activity photos, holding logs, and documents)
                if not getattr(m, "is_evidence", False) and not is_doc and not getattr(m, "history_id", None) and not getattr(m, "holding_log_id", None):
                    child_media.append({
                        "media_id": m.media_id,
                        "file_url": m.file_url,
                        "media_type": m.media_type,
                        "is_evidence": False
                    })
        merged_items.append({
            "report_id": child.report_id,
            "created_at": child.created_at.isoformat() if child.created_at else None,
            "reporter_name": child.reporter.name if child.reporter else f"Resident #{child.user_id}",
            "reporter_photo": child.reporter.profile_picture if child.reporter else None,
            "animal_type": str(child.animal_type),
            "landmark": child.landmark,
            "description": child.description,
            "merged_at": child.merged_at.isoformat() if child.merged_at else None,
            "merge_notes": child.merge_notes,
            "media": child_media
        })
    rep_data.merged_reports = merged_items


def compute_takeover_eligibility(rep: Report, rep_data: ReportResponse):
    """
    Determines if a claimed report is eligible for takeover due to inactivity.
    - Urgent / High priority: 2 hours of inactivity
    - Standard / Medium / Low priority: 24 hours of inactivity
    """
    from datetime import datetime, timedelta
    now = datetime.now()

    if not rep.assigned_leader_id or rep.current_status_id in [11, 12, 14, 3]:
        rep_data.is_takeover_eligible = True
        rep_data.takeover_cooldown_remaining_seconds = 0
        rep_data.takeover_locked_until = None
        rep_data.last_activity_at = rep.claimed_at or rep.created_at
        return

    # Determine priority
    priority = (getattr(rep, 'priority_level', None) or getattr(rep_data, 'ai_suggested_priority', None) or "").lower()
    is_urgent = any(kw in priority for kw in ["emergency", "high", "urgent", "bite", "severe"])
    
    # 2 hours for urgent/high priority, 24 hours for standard
    hours_threshold = 2 if is_urgent else 24
    rep_data.takeover_inactivity_hours_threshold = hours_threshold

    latest_activity: datetime = rep.claimed_at or rep.created_at or now
    if rep.history:
        for hist in rep.history:
            if hist.created_at and hist.created_at > latest_activity:
                latest_activity = hist.created_at

    rep_data.last_activity_at = latest_activity

    locked_until = latest_activity + timedelta(hours=hours_threshold)
    rep_data.takeover_locked_until = locked_until

    if now >= locked_until:
        rep_data.is_takeover_eligible = True
        rep_data.takeover_cooldown_remaining_seconds = 0
    else:
        rep_data.is_takeover_eligible = False
        remaining = int((locked_until - now).total_seconds())
        rep_data.takeover_cooldown_remaining_seconds = max(0, remaining)


def get_hist_updater_name(hist, rep) -> str:
    if hist.updater and hist.updater.name:
        return hist.updater.name
    if hasattr(rep, 'assigned_leader') and rep.assigned_leader and rep.assigned_leader.name:
        return rep.assigned_leader.name
    if hasattr(rep, 'reporter') and rep.reporter and rep.reporter.name:
        return rep.reporter.name
    return "Subdivision Officer / Responders"


def populate_pet_and_owner_info(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    pets_map: Optional[Dict[int, Pet]] = None,
    qrs_map: Optional[Dict[int, PetQRCode]] = None,
    users_map: Optional[Dict[int, User]] = None
):
    """Populate linked pet details, QR code, and owner contact information for lost pet reports."""
    try:
        target_pet_id = rep.pet_id or rep_data.pet_id
        if target_pet_id:
            if pets_map is not None:
                linked_pet = pets_map.get(target_pet_id)
            else:
                linked_pet = db.query(Pet).filter(Pet.pet_id == target_pet_id).first()

            if linked_pet:
                rep_data.pet_name = getattr(linked_pet, "display_name", None) or getattr(linked_pet, "name", None)
                if qrs_map is not None:
                    qr = qrs_map.get(linked_pet.pet_id)
                else:
                    qr = db.query(PetQRCode).filter(PetQRCode.pet_id == linked_pet.pet_id).first()

                if not qr and qrs_map is None:
                    try:
                        from app.routes.pet_qr import generate_qr_for_pet_internal
                        qr = generate_qr_for_pet_internal(linked_pet.pet_id, db)
                    except Exception as qr_err:
                        print(f"Could not auto-generate QR for pet #{linked_pet.pet_id}: {qr_err}")

                if qr:
                    rep_data.pet_qr_code_url = qr.qr_image_url
                    rep_data.pet_qr_token = qr.qr_token
                    rep_data.pet_qr_code_hash = qr.qr_token[:10].upper() if qr.qr_token else None
                
                if linked_pet.owner_id:
                    if users_map is not None:
                        pet_owner = users_map.get(linked_pet.owner_id)
                    else:
                        pet_owner = db.query(User).filter(User.user_id == linked_pet.owner_id).first()

                    if pet_owner:
                        rep_data.owner_id = pet_owner.user_id
                        rep_data.owner_name = pet_owner.name
                        rep_data.owner_phone = pet_owner.phone
                        rep_data.owner_email = pet_owner.email
                        rep_data.owner_address = pet_owner.address
                        rep_data.is_owner_report = (rep.user_id == pet_owner.user_id)
                else:
                    # Explicitly unowned / community pet
                    rep_data.owner_id = None
                    rep_data.owner_name = None
                    rep_data.owner_phone = None
                    rep_data.owner_email = None
                    rep_data.owner_address = None
                    rep_data.is_owner_report = False
    except Exception as err:
        print(f"Failed to populate pet/owner info for report {rep.report_id}: {err}")


def dispute_match_history(db: Session, match_id: Optional[int]) -> Optional[dict]:
    """What happened to the disputed look-alike match: AI score, staff decision, owner answer, and the audit trail."""
    from app.models.audit_log import AuditLog
    from app.models.report_match import ReportMatch
    if not match_id:
        return None
    m = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if m is None:
        return None
    reviewer = db.query(User).filter(User.user_id == m.reviewed_by).first() if m.reviewed_by else None
    events = (db.query(AuditLog).filter(AuditLog.target_table == "report_matches", AuditLog.target_id == match_id)
              .order_by(AuditLog.created_at, AuditLog.log_id).all())
    return {
        "match_id": m.match_id,
        "source_report_id": m.source_report_id,
        "matched_pet_id": m.matched_pet_id,
        "similarity_score": m.similarity_score,
        "status": m.status,
        "reviewer_name": reviewer.name if reviewer else None,
        "reviewer_role": m.reviewer_role,
        "verified_at": m.verified_at.isoformat() if m.verified_at else None,
        "verification_notes": m.verification_notes,
        "owner_confirmation_status": m.owner_confirmation_status,
        "owner_notes": m.owner_notes,
        "owner_dispute_count": m.owner_dispute_count or 0,
        "events": [{"action": e.action, "description": e.description,
                    "at": e.created_at.isoformat() if e.created_at else None} for e in events],
    }


def dispute_response(db: Session, d: ReportDispute) -> ReportDisputeResponse:
    return ReportDisputeResponse(
        dispute_id=d.dispute_id,
        report_id=d.report_id,
        resident_user_id=d.resident_user_id,
        pet_id=d.pet_id,
        dispute_reason=d.dispute_reason,
        vaccination_card_url=d.vaccination_card_url,
        supporting_photo_url=d.supporting_photo_url,
        status=d.status,
        reviewer_id=d.reviewer_id,
        reviewer_notes=d.reviewer_notes,
        created_at=d.created_at,
        resolved_at=d.resolved_at,
        resident_name=d.resident.name if d.resident else None,
        pet_name=d.pet.display_name if d.pet else None,
        reviewer_name=d.reviewer.name if d.reviewer else None,
        dispute_type=d.dispute_type or "false_report",
        merged_into_report_id=d.merged_into_report_id,
        contested_pet_id=d.contested_pet_id,
        match_id=d.match_id,
        match_history=dispute_match_history(db, d.match_id),
    )


def populate_verification_and_disputes(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    users_map: Optional[Dict[int, User]] = None,
    disputes_map: Optional[Dict[int, List[ReportDispute]]] = None
):
    """Populates on-site verification status, false alarm findings, and pet owner disputes."""
    try:
        rep_data.verification_status = getattr(rep, "verification_status", None) or "unverified"
        rep_data.false_alarm_reason = getattr(rep, "false_alarm_reason", None)
        rep_data.verification_notes = getattr(rep, "verification_notes", None)
        rep_data.verified_by_user_id = getattr(rep, "verified_by_user_id", None)
        rep_data.verified_at = getattr(rep, "verified_at", None)
        rep_data.verified_actual_bite = getattr(rep, "verified_actual_bite", False)
        rep_data.verified_chasing = getattr(rep, "verified_chasing", False)
        rep_data.verified_attempted_bite = getattr(rep, "verified_attempted_bite", False)
        rep_data.verified_injury = getattr(rep, "verified_injury", False)
        rep_data.verified_aggressive = getattr(rep, "verified_aggressive", False)
        rep_data.behavior_finding = getattr(rep, "behavior_finding", None)

        if hasattr(rep, "verified_by_user") and rep.verified_by_user:
            rep_data.verified_by_name = rep.verified_by_user.name
        elif rep.verified_by_user_id:
            if users_map is not None:
                v_user = users_map.get(rep.verified_by_user_id)
            else:
                v_user = db.query(User).filter(User.user_id == rep.verified_by_user_id).first()
            rep_data.verified_by_name = v_user.name if v_user else f"Officer #{rep.verified_by_user_id}"

        # Load disputes
        disputes_list = []
        if disputes_map is not None:
            disputes_records = disputes_map.get(rep.report_id, [])
        else:
            disputes_records = db.query(ReportDispute).options(
                joinedload(ReportDispute.resident),
                joinedload(ReportDispute.reviewer),
                joinedload(ReportDispute.pet)
            ).filter(ReportDispute.report_id == rep.report_id).order_by(ReportDispute.created_at.desc()).all()

        for d in disputes_records:
            d_resp = dispute_response(db, d)
            disputes_list.append(d_resp)
        rep_data.disputes = disputes_list
    except Exception as err:
        print(f"Failed to populate verification/disputes for report {rep.report_id}: {err}")


def populate_location_and_facility_info(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    holding_map: Optional[Dict[int, HoldingAnimal]] = None,
    landmarks_map: Optional[Dict[int, Landmark]] = None,
    holding_facs_by_subd: Optional[Dict[int, Landmark]] = None,
    default_holding_fac: Optional[Landmark] = None
):
    """Populates location history and holding facility details on ReportResponse."""
    try:
        if landmarks_map is None:
            try:
                landmarks_map = get_landmarks_map(db)
            except Exception:
                landmarks_map = {}
        if holding_facs_by_subd is None and landmarks_map:
            holding_facs_by_subd = {l.subdivision_id: l for l in landmarks_map.values() if l.is_holding_facility and l.subdivision_id}
        if default_holding_fac is None and landmarks_map:
            default_holding_fac = next((l for l in landmarks_map.values() if l.is_holding_facility), None)

        rep_data.initial_latitude = float(rep.initial_latitude) if rep.initial_latitude is not None else float(rep.latitude)
        rep_data.initial_longitude = float(rep.initial_longitude) if rep.initial_longitude is not None else float(rep.longitude)
        rep_data.initial_landmark = rep.initial_landmark or rep.landmark
        rep_data.facility_id = rep.facility_id
        rep_data.custody_status = rep.custody_status or "Sighting"

        if holding_map is not None:
            holding_rec = holding_map.get(rep.report_id)
        else:
            holding_rec = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == rep.report_id).first()

        RESOLVED_HOLDING_STATUSES = (3, 4, 5, 7, 8)  # 3=Claimed, 4=Deceased, 5=Transferred, 7=Adopted, 8=Impounded
        is_holding_resolved = holding_rec is not None and (
            holding_rec.facility_status in RESOLVED_HOLDING_STATUSES or
            holding_rec.discharge_date is not None
        )
        is_report_resolved = rep.current_status_id in (9, 10, 11, 12, 14, 17, 18)

        is_in_custody = (rep.current_status_id in (7, 8)) and not is_report_resolved and not is_holding_resolved
        if holding_rec and not is_holding_resolved and not is_report_resolved and rep.current_status_id not in (1, 2, 3, 4, 5, 6, 13, 14, 17, 18):
            is_in_custody = True

        if is_in_custody:
            if not rep_data.custody_status or rep_data.custody_status == "Sighting":
                rep_data.custody_status = "Secured in Facility"
        elif is_report_resolved or is_holding_resolved or not is_in_custody:
            # If resolved / discharged, ensure coordinates and landmark reflect original incident sighting
            rep_data.facility_id = None
            rep_data.facility = None
            if rep_data.initial_latitude is not None and rep_data.initial_longitude is not None:
                rep_data.latitude = rep_data.initial_latitude
                rep_data.longitude = rep_data.initial_longitude
            
            facility_keywords = ["holding pen", "holding facility", "barangay holding", "subdivision holding"]
            is_lmk_fac = not rep_data.landmark or any(k in (rep_data.landmark or "").lower() for k in facility_keywords)
            is_init_fac = not rep_data.initial_landmark or any(k in (rep_data.initial_landmark or "").lower() for k in facility_keywords)
            if is_lmk_fac or is_init_fac:
                clean_name = (rep.subdivision.subdivision_name if hasattr(rep, 'subdivision') and rep.subdivision else None) or "Incident Sighting Location"
                if is_init_fac or not rep_data.initial_landmark:
                    rep_data.initial_landmark = clean_name
                if is_lmk_fac or is_report_resolved or is_holding_resolved:
                    rep_data.landmark = rep_data.initial_landmark or clean_name
            elif is_report_resolved or is_holding_resolved:
                if rep_data.initial_landmark:
                    rep_data.landmark = rep_data.initial_landmark

        fac = None
        if rep.facility_id and is_in_custody:
            if landmarks_map is not None:
                fac = landmarks_map.get(rep.facility_id)
            else:
                fac = db.query(Landmark).filter(Landmark.landmark_id == rep.facility_id).first()
        elif is_in_custody:
            # Fallback to subdivision/barangay holding facility landmark
            if rep.subdivision_id:
                if holding_facs_by_subd is not None:
                    fac = holding_facs_by_subd.get(rep.subdivision_id)
                else:
                    fac = db.query(Landmark).filter(
                        Landmark.subdivision_id == rep.subdivision_id,
                        Landmark.is_holding_facility == True
                    ).first()
            if not fac:
                if default_holding_fac is not None:
                    fac = default_holding_fac
                else:
                    fac = db.query(Landmark).filter(Landmark.is_holding_facility == True).first()

        if fac and is_in_custody:
            rep_data.facility_id = fac.landmark_id
            rep_data.facility = {
                "landmark_id": fac.landmark_id,
                "name": fac.name,
                "category": fac.category,
                "description": fac.description,
                "latitude": float(fac.latitude),
                "longitude": float(fac.longitude),
                "is_holding_facility": fac.is_holding_facility,
                "facility_type": fac.facility_type,
                "capacity": fac.capacity,
                "contact_person": fac.contact_person,
                "contact_number": fac.contact_number,
                "status": fac.status
            }
            if rep.latitude == rep.initial_latitude or rep.latitude == rep_data.initial_latitude:
                rep_data.latitude = float(fac.latitude)
                rep_data.longitude = float(fac.longitude)
                if not rep.landmark or rep.landmark == rep.initial_landmark:
                    rep_data.landmark = fac.name

        if rep.history:
            for i, hist in enumerate(rep.history):
                if rep_data.history and i < len(rep_data.history):
                    rep_data.history[i].latitude = float(hist.latitude) if hist.latitude is not None else None
                    rep_data.history[i].longitude = float(hist.longitude) if hist.longitude is not None else None
                    rep_data.history[i].landmark = hist.landmark
                    rep_data.history[i].facility_id = hist.facility_id
                    if hist.facility_id:
                        if landmarks_map is not None:
                            h_fac = landmarks_map.get(hist.facility_id)
                        else:
                            h_fac = db.query(Landmark).filter(Landmark.landmark_id == hist.facility_id).first()
                        rep_data.history[i].facility_name = h_fac.name if h_fac else None
    except Exception as err:
        print(f"Failed to populate location/facility info for report {rep.report_id}: {err}")


def populate_duplicate_and_merge_info(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    users_map: Optional[Dict[int, User]] = None,
    parents_map: Optional[Dict[int, Report]] = None,
    ai_dup_matches_map: Optional[Dict[int, List[ReportMatch]]] = None,
    dup_matches_pair_map: Optional[Dict[tuple, ReportMatch]] = None,
    confirmed_pet_matches_map: Optional[Dict[int, ReportMatch]] = None,
    evaluated_matches_map: Optional[Dict[int, ReportMatch]] = None,
    pets_map: Optional[Dict[int, Pet]] = None
):
    """Populates duplicate flags, merge details, and child merged reports."""
    try:
        rep_data.duplicate_of_report_id = rep.duplicate_of_report_id
        rep_data.merged_at = rep.merged_at
        rep_data.merged_by = rep.merged_by
        rep_data.merge_notes = rep.merge_notes

        if rep.merged_by:
            if users_map is not None:
                m_user = users_map.get(rep.merged_by)
            else:
                m_user = db.query(User).filter(User.user_id == rep.merged_by).first()
            rep_data.merged_by_name = m_user.name if m_user else f"Officer #{rep.merged_by}"

        # If primary report with merged children, populate merged_reports summaries
        merged_children = getattr(rep, "merged_reports", None) or []
        if merged_children:
            merged_list = []
            for m_rep in [rep] + list(merged_children):
                sec_user = m_rep.reporter.name if m_rep.reporter else f"Resident #{m_rep.user_id}"
                sec_media = [{
                    "file_url": med.file_url if (med.file_url and "res.cloudinary.com/test" not in med.file_url and not med.file_url.endswith("original_reporter_dog.jpg")) else "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80",
                    "media_type": med.media_type,
                    "is_evidence": False
                } for med in (m_rep.media or []) if not getattr(med, "is_evidence", False) and getattr(med, "media_type", "") != "Document" and not (med.file_url or "").lower().endswith((".pdf", ".doc", ".docx", ".txt")) and "/raw/" not in (med.file_url or "").lower() and not getattr(med, "history_id", None) and not getattr(med, "holding_log_id", None)]
                merged_list.append({
                    "report_id": m_rep.report_id,
                    "reporter_name": sec_user,
                    "created_at": m_rep.created_at,
                    "landmark": m_rep.landmark,
                    "description": m_rep.description,
                    "animal_color": m_rep.animal_color,
                    "estimated_size": m_rep.estimated_size,
                    "merged_at": m_rep.merged_at,
                    "merge_notes": m_rep.merge_notes,
                    "media": sec_media
                })
            rep_data.merged_reports = merged_list
        elif rep.duplicate_of_report_id:
            if parents_map is not None:
                parent_rep = parents_map.get(rep.duplicate_of_report_id)
            else:
                parent_rep = db.query(Report).options(
                    joinedload(Report.assigned_leader),
                    joinedload(Report.facility),
                    selectinload(Report.merged_reports).joinedload(Report.reporter),
                    selectinload(Report.merged_reports).selectinload(Report.media)
                ).filter(Report.report_id == rep.duplicate_of_report_id).first()

            if parent_rep:
                if parent_rep.merged_reports:
                    merged_list = []
                    # The main case comes first, so a duplicate's page lists the whole group, not just its siblings.
                    for m_rep in [parent_rep] + list(parent_rep.merged_reports):
                        sec_user = m_rep.reporter.name if m_rep.reporter else f"Resident #{m_rep.user_id}"
                        sec_media = [{
                            "file_url": med.file_url if (med.file_url and "res.cloudinary.com/test" not in med.file_url and not med.file_url.endswith("original_reporter_dog.jpg")) else "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80",
                            "media_type": med.media_type,
                            "is_evidence": False
                        } for med in (m_rep.media or []) if not getattr(med, "is_evidence", False) and getattr(med, "media_type", "") != "Document" and not (med.file_url or "").lower().endswith((".pdf", ".doc", ".docx", ".txt")) and "/raw/" not in (med.file_url or "").lower() and not getattr(med, "history_id", None) and not getattr(med, "holding_log_id", None)]
                        merged_list.append({
                            "report_id": m_rep.report_id,
                            "reporter_name": sec_user,
                            "created_at": m_rep.created_at,
                            "landmark": m_rep.landmark,
                            "description": m_rep.description,
                            "animal_color": m_rep.animal_color,
                            "estimated_size": m_rep.estimated_size,
                            "merged_at": m_rep.merged_at,
                            "merge_notes": m_rep.merge_notes,
                            "media": sec_media
                        })
                    rep_data.merged_reports = merged_list
                if not rep_data.assigned_leader_id and parent_rep.assigned_leader_id:
                    rep_data.assigned_leader_id = parent_rep.assigned_leader_id
                    rep_data.assigned_leader_name = parent_rep.assigned_leader.name if parent_rep.assigned_leader else None
                    rep_data.assigned_leader_photo = parent_rep.assigned_leader.profile_picture if parent_rep.assigned_leader else None
                if not rep_data.facility_id and parent_rep.facility_id:
                    rep_data.facility_id = parent_rep.facility_id

        # Check for active AI duplicate suggestions for this report
        # When a report has been resolved, it will no longer appear or flag under Suspected Duplicate Sightings
        if rep.current_status_id not in RESOLVED_STATUS_IDS and not rep.duplicate_of_report_id:
            if ai_dup_matches_map is not None:
                dup_matches = ai_dup_matches_map.get(rep.report_id, [])
            else:
                SrcRep = aliased(Report, name="dup_src_rep")
                CandRep = aliased(Report, name="dup_cand_rep")
                dup_matches = db.query(ReportMatch).join(
                    SrcRep, ReportMatch.source_report_id == SrcRep.report_id
                ).join(
                    CandRep, ReportMatch.matched_report_id == CandRep.report_id
                ).filter(
                    ReportMatch.matched_report_id.isnot(None),
                    ReportMatch.matched_pet_id.is_(None),
                    ReportMatch.status == "AI_SUGGESTED",
                    or_(
                        ReportMatch.source_report_id == rep.report_id,
                        ReportMatch.matched_report_id == rep.report_id
                    ),
                    SrcRep.current_status_id.notin_(RESOLVED_STATUS_IDS),
                    SrcRep.duplicate_of_report_id.is_(None),
                    CandRep.current_status_id.notin_(RESOLVED_STATUS_IDS),
                    CandRep.duplicate_of_report_id.is_(None)
                ).all()
            rep_data.duplicate_match_count = len(dup_matches)
            rep_data.has_duplicate_flag = len(dup_matches) > 0
        else:
            rep_data.duplicate_match_count = 0
            rep_data.has_duplicate_flag = False

        populate_review_decision_info(
            rep_data, rep, db,
            users_map=users_map,
            parents_map=parents_map,
            dup_matches_pair_map=dup_matches_pair_map,
            confirmed_pet_matches_map=confirmed_pet_matches_map,
            evaluated_matches_map=evaluated_matches_map,
            pets_map=pets_map
        )
    except Exception as err:
        print(f"Failed to populate duplicate/merge info for report {rep.report_id}: {err}")


def populate_review_decision_info(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    users_map: Optional[Dict[int, User]] = None,
    parents_map: Optional[Dict[int, Report]] = None,
    dup_matches_pair_map: Optional[Dict[tuple, ReportMatch]] = None,
    confirmed_pet_matches_map: Optional[Dict[int, ReportMatch]] = None,
    evaluated_matches_map: Optional[Dict[int, ReportMatch]] = None,
    pets_map: Optional[Dict[int, Pet]] = None
):
    """
    Populates persistent review decision metadata for pet matching and duplicate review.
    Guarantees that decisions made by Subdivision Leaders persist when forwarded to Barangay.
    Distinguishes:
    1. Unreviewed
    2. Confirmed Duplicate
    3. Confirmed Match
    4. Not a Match
    5. Unable to Verify
    """
    try:
        review_status = "Unreviewed"
        review_type = None
        reviewed_by_name = None
        reviewed_by_role = None
        reviewed_at = None
        review_notes = None
        matched_pet_record = None
        matched_report_record = None

        # 1. Check if report is marked as a Duplicate
        if rep.duplicate_of_report_id or rep.current_status_id == 18:
            review_status = "Confirmed Duplicate"
            review_type = "duplicate"
            reviewed_at = rep.merged_at
            review_notes = rep.merge_notes
            if rep.merged_by:
                if users_map is not None:
                    m_user = users_map.get(rep.merged_by)
                else:
                    m_user = db.query(User).filter(User.user_id == rep.merged_by).first()
                if m_user:
                    reviewed_by_name = m_user.name
                    reviewed_by_role = "Subdivision Leader" if m_user.role_id == 2 else ("Barangay Staff" if m_user.role_id == 3 else "Admin")

            if rep.duplicate_of_report_id:
                if parents_map is not None:
                    parent_rep = parents_map.get(rep.duplicate_of_report_id)
                else:
                    parent_rep = db.query(Report).filter(Report.report_id == rep.duplicate_of_report_id).first()
                if parent_rep:
                    matched_report_record = {
                        "report_id": parent_rep.report_id,
                        "animal_type": parent_rep.animal_type,
                        "animal_breed": parent_rep.animal_breed,
                        "landmark": parent_rep.landmark,
                        "status_id": parent_rep.current_status_id
                    }

            # If reviewer name not found from merged_by, check ReportMatch
            dup_match = None
            if dup_matches_pair_map is not None:
                dup_match = dup_matches_pair_map.get((rep.report_id, rep.duplicate_of_report_id)) or dup_matches_pair_map.get((rep.duplicate_of_report_id, rep.report_id))
            else:
                dup_match = db.query(ReportMatch).options(joinedload(ReportMatch.reviewer)).filter(
                    ReportMatch.matched_report_id.isnot(None),
                    or_(
                        and_(ReportMatch.source_report_id == rep.report_id, ReportMatch.matched_report_id == rep.duplicate_of_report_id),
                        and_(ReportMatch.source_report_id == rep.duplicate_of_report_id, ReportMatch.matched_report_id == rep.report_id)
                    )
                ).first()
            if dup_match:
                if dup_match.reviewer and not reviewed_by_name:
                    reviewed_by_name = dup_match.reviewer.name
                reviewed_by_role = dup_match.reviewer_role or reviewed_by_role
                reviewed_at = dup_match.verified_at or reviewed_at
                review_notes = dup_match.verification_notes or review_notes

        # 2. Check if primary report with merged duplicate children
        elif (getattr(rep, "merged_reports", None) and len(rep.merged_reports) > 0) or (getattr(rep_data, "merged_reports", None) and len(rep_data.merged_reports) > 0):
            merged_list = getattr(rep, "merged_reports", None) or getattr(rep_data, "merged_reports", None) or []
            first_m = merged_list[0] if merged_list else None
            if first_m:
                review_status = "Confirmed Duplicate"
                review_type = "duplicate"
                if isinstance(first_m, dict):
                    reviewed_at = first_m.get("merged_at")
                    review_notes = first_m.get("merge_notes")
                    matched_report_record = {
                        "report_id": first_m.get("report_id"),
                        "animal_type": first_m.get("animal_type"),
                        "animal_breed": first_m.get("animal_breed"),
                        "landmark": first_m.get("landmark"),
                        "status_id": first_m.get("status_id") or first_m.get("current_status_id"),
                    }
                else:
                    reviewed_at = getattr(first_m, "merged_at", None)
                    review_notes = getattr(first_m, "merge_notes", None)
                    m_by = getattr(first_m, "merged_by", None)
                    if m_by:
                        if users_map is not None:
                            m_user = users_map.get(m_by)
                        else:
                            m_user = db.query(User).filter(User.user_id == m_by).first()
                        if m_user:
                            reviewed_by_name = m_user.name
                            reviewed_by_role = "Subdivision Leader" if m_user.role_id == 2 else "Barangay Staff"
                    matched_report_record = {
                        "report_id": getattr(first_m, "report_id", None),
                        "animal_type": getattr(first_m, "animal_type", None),
                        "animal_breed": getattr(first_m, "animal_breed", None),
                        "landmark": getattr(first_m, "landmark", None),
                        "status_id": getattr(first_m, "current_status_id", None)
                    }

        # 3. Check for confirmed Pet Match (Report.pet_id is set or ReportMatch is CONFIRMED_MATCH)
        if review_status == "Unreviewed" or rep.pet_id:
            pet_match = None
            if confirmed_pet_matches_map is not None:
                pet_match = confirmed_pet_matches_map.get(rep.report_id)
            else:
                pet_match = db.query(ReportMatch).options(
                    joinedload(ReportMatch.matched_pet).joinedload(Pet.owner),
                    joinedload(ReportMatch.reviewer)
                ).filter(
                    ReportMatch.source_report_id == rep.report_id,
                    ReportMatch.matched_pet_id.isnot(None),
                    ReportMatch.status == "CONFIRMED_MATCH"
                ).order_by(desc(ReportMatch.verified_at)).first()

            if pet_match:
                review_status = "Confirmed Match"
                review_type = "pet_match"
                if pet_match.reviewer:
                    reviewed_by_name = pet_match.reviewer.name
                reviewed_by_role = pet_match.reviewer_role or ("Subdivision Leader" if (pet_match.reviewer and pet_match.reviewer.role_id == 2) else "Barangay Staff")
                reviewed_at = pet_match.verified_at
                review_notes = pet_match.verification_notes
                if pet_match.matched_pet:
                    p = pet_match.matched_pet
                    matched_pet_record = {
                        "pet_id": p.pet_id,
                        "pet_name": p.display_name,
                        "breed": p.breed,
                        "color": getattr(p, "color_markings", None) or getattr(p, "primary_color", None),
                        "owner_name": p.owner.name if p.owner else "Registered Resident",
                        "photo_url": p.photo_url
                    }
            elif rep.pet_id and review_status == "Unreviewed":
                if pets_map is not None:
                    linked_p = pets_map.get(rep.pet_id)
                else:
                    linked_p = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == rep.pet_id).first()
                if linked_p:
                    review_status = "Confirmed Match"
                    review_type = "pet_match"
                    matched_pet_record = {
                        "pet_id": linked_p.pet_id,
                        "pet_name": linked_p.display_name,
                        "breed": linked_p.breed,
                        "color": getattr(linked_p, "color_markings", None) or getattr(linked_p, "primary_color", None),
                        "owner_name": linked_p.owner.name if linked_p.owner else "Registered Resident",
                        "photo_url": linked_p.photo_url
                    }

        # 4. Check for other reviewed decisions: NOT_A_MATCH or UNABLE_TO_VERIFY if still Unreviewed
        if review_status == "Unreviewed":
            evaluated_match = None
            if evaluated_matches_map is not None:
                evaluated_match = evaluated_matches_map.get(rep.report_id)
            else:
                evaluated_match = db.query(ReportMatch).options(
                    joinedload(ReportMatch.reviewer),
                    joinedload(ReportMatch.matched_pet),
                    joinedload(ReportMatch.matched_report)
                ).filter(
                    or_(
                        ReportMatch.source_report_id == rep.report_id,
                        ReportMatch.matched_report_id == rep.report_id
                    ),
                    ReportMatch.status.in_(["NOT_A_MATCH", "UNABLE_TO_VERIFY"])
                ).order_by(desc(ReportMatch.verified_at)).first()

            if evaluated_match:
                if evaluated_match.status == "NOT_A_MATCH":
                    review_status = "Not a Match"
                elif evaluated_match.status == "UNABLE_TO_VERIFY":
                    review_status = "Unable to Verify"

                review_type = "pet_match" if evaluated_match.matched_pet_id else "duplicate"
                if evaluated_match.reviewer:
                    reviewed_by_name = evaluated_match.reviewer.name
                reviewed_by_role = evaluated_match.reviewer_role or ("Subdivision Leader" if (evaluated_match.reviewer and evaluated_match.reviewer.role_id == 2) else "Barangay Staff")
                reviewed_at = evaluated_match.verified_at
                review_notes = evaluated_match.verification_notes

        rep_data.review_status = review_status
        rep_data.review_type = review_type
        rep_data.reviewed_by_name = reviewed_by_name
        rep_data.reviewed_by_role = reviewed_by_role
        rep_data.reviewed_at = reviewed_at
        rep_data.review_notes = review_notes
        rep_data.matched_pet_record = matched_pet_record
        rep_data.matched_report_record = matched_report_record
    except Exception as r_err:
        print(f"Failed to populate review decision info for report {rep.report_id}: {r_err}")


def populate_warning_info(
    rep_data: ReportResponse,
    rep: Report,
    db: Session,
    warnings_map: Optional[Dict[int, list]] = None,
    users_map: Optional[Dict[int, User]] = None,
    pets_map: Optional[Dict[int, Pet]] = None
):
    """
    Populates issued warning tracking and detailed warning citations for the report.
    Guarantees that warning status persists across views and links two-way to pet & report.
    """
    try:
        if warnings_map is not None:
            w_list = warnings_map.get(rep.report_id, [])
        else:
            w_list = db.query(OwnerWarning).filter(
                OwnerWarning.report_id == rep.report_id
            ).order_by(desc(OwnerWarning.created_at)).all()

        if w_list:
            rep_data.has_issued_warning = True
            formatted_warnings = []
            for w in w_list:
                issuer_name = "Community Official"
                issuer_role = "Subdivision Leader"
                if users_map is not None and w.issued_by in users_map:
                    u = users_map[w.issued_by]
                    issuer_name = u.name
                    issuer_role = "Subdivision Leader" if u.role_id == 2 else ("Barangay Staff" if u.role_id == 3 else "Administrator")
                elif w.issuer:
                    issuer_name = w.issuer.name
                    issuer_role = "Subdivision Leader" if w.issuer.role_id == 2 else ("Barangay Staff" if w.issuer.role_id == 3 else "Administrator")
                else:
                    u = db.query(User).filter(User.user_id == w.issued_by).first()
                    if u:
                        issuer_name = u.name
                        issuer_role = "Subdivision Leader" if u.role_id == 2 else ("Barangay Staff" if u.role_id == 3 else "Administrator")

                pet_name = None
                if w.pet_id:
                    if pets_map is not None and w.pet_id in pets_map:
                        pet_name = pets_map[w.pet_id].display_name
                    elif w.pet:
                        pet_name = w.pet.display_name
                    else:
                        p = db.query(Pet).filter(Pet.pet_id == w.pet_id).first()
                        if p:
                            pet_name = p.display_name

                owner_name = None
                owner_phone = None
                if users_map is not None and w.user_id in users_map:
                    ow = users_map[w.user_id]
                    owner_name = ow.name
                    owner_phone = ow.phone
                elif w.owner:
                    owner_name = w.owner.name
                    owner_phone = w.owner.phone
                else:
                    ow = db.query(User).filter(User.user_id == w.user_id).first()
                    if ow:
                        owner_name = ow.name
                        owner_phone = ow.phone

                formatted_warnings.append({
                    "warning_id": w.warning_id,
                    "user_id": w.user_id,
                    "pet_id": w.pet_id or rep.pet_id,
                    "report_id": w.report_id or rep.report_id,
                    "issued_by": w.issued_by,
                    "warning_level": w.warning_level,
                    "violation_type": w.violation_type,
                    "warning_type": w.violation_type,
                    "description": w.description,
                    "warning_reason": w.description,
                    "fine_amount": float(w.fine_amount) if w.fine_amount is not None else 0.0,
                    "status": w.status,
                    "acknowledged_at": w.acknowledged_at,
                    "created_at": w.created_at,
                    "issued_at": w.created_at,
                    "owner_name": owner_name or getattr(rep_data, "owner_name", None) or "Registered Pet Owner",
                    "owner_phone": owner_phone or getattr(rep_data, "owner_phone", None),
                    "pet_name": pet_name or getattr(rep_data, "pet_name", None),
                    "pet_id_display": f"PET-{str(w.pet_id or rep.pet_id).zfill(5)}" if (w.pet_id or rep.pet_id) else None,
                    "report_ref_display": f"#REPORT-{rep.created_at.year}-{str(rep.report_id).zfill(5)}" if rep.created_at else f"#REPORT-{str(rep.report_id).zfill(5)}",
                    "issuer_name": issuer_name,
                    "issuer_role": issuer_role,
                    "report_landmark": rep.landmark,
                    "report_animal_type": rep.animal_type
                })

            rep_data.issued_warnings = formatted_warnings
            rep_data.latest_warning = formatted_warnings[0] if formatted_warnings else None
        else:
            rep_data.has_issued_warning = False
            rep_data.issued_warnings = []
            rep_data.latest_warning = None
    except Exception as w_err:
        print(f"Failed to populate warning info for report {rep.report_id}: {w_err}")
        rep_data.has_issued_warning = False
        rep_data.issued_warnings = []
        rep_data.latest_warning = None


@router.get("/admin-badge-counts")
def get_admin_badge_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Lightweight badge count aggregation for Admin and Staff sidebars.
    Avoids downloading full reports and adoptions tables every few seconds.
    """
    active_reports = db.query(func.count(Report.report_id)).filter(
        ~Report.current_status_id.in_([3, 9, 10, 11, 12, 14, 17, 18]),
        Report.duplicate_of_report_id.is_(None)
    ).scalar() or 0

    pending_adoptions = db.query(func.count(Adoption.adoption_id)).filter(
        Adoption.status == "Pending"
    ).scalar() or 0

    return {
        "active_reports": active_reports,
        "pending_adoptions": pending_adoptions
    }


@router.get("/", response_model=List[ReportResponse])
def get_reports(
    response: Response,
    subdivision_id: Optional[int] = None,
    barangay_id: Optional[int] = None,
    escalated_only: Optional[bool] = None,
    limit: Optional[int] = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Report)
    if subdivision_id is not None:
        query = query.filter(Report.subdivision_id == subdivision_id)

    if barangay_id is not None:
        query = query.filter(Report.subdivision.has(Subdivision.barangay_id == barangay_id))

    if escalated_only:
        query = query.filter(
            or_(
                Report.current_status_id.in_([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18]),
                Report.endorsement_letter.has(),
                Report.rescues.any(),
                Report.history.any(StatusHistory.report_status_id.in_([4, 5, 6, 7, 8, 13]))
            )
        )

    # Page size: callers that don't ask get the newest REPORTS_DEFAULT_PAGE_SIZE; nobody gets more than the max.
    page_size = min(limit if limit and limit > 0 else REPORTS_DEFAULT_PAGE_SIZE, REPORTS_MAX_PAGE_SIZE)
    offset = max(0, offset or 0)

    # Set total count header if response object provided
    if response is not None:
        try:
            total_count = query.count()
            response.headers["X-Total-Count"] = str(total_count)
            response.headers["X-Page-Size"] = str(page_size)
            response.headers["X-Has-More"] = "true" if offset + page_size < total_count else "false"
            response.headers["Access-Control-Expose-Headers"] = "X-Total-Count, X-Page-Size, X-Has-More"
        except Exception as cnt_err:
            print(f"Error computing total reports count: {cnt_err}")

    query_exec = query.options(
        joinedload(Report.reporter),
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
        # Batch-loaded so serializing N reports doesn't run 2 extra queries per report (merged children, disputes)
        selectinload(Report.merged_reports).joinedload(Report.reporter),
        selectinload(Report.merged_reports).selectinload(Report.media),
        selectinload(Report.disputes).joinedload(ReportDispute.resident),
        selectinload(Report.disputes).joinedload(ReportDispute.reviewer),
        selectinload(Report.disputes).joinedload(ReportDispute.pet),
    ).order_by(Report.report_id.desc())

    query_exec = query_exec.offset(offset).limit(page_size)

    reports = query_exec.all()
    
    if not reports:
        return []

    results = []

    report_ids = [rep.report_id for rep in reports]

    # 1. Batch landmarks from cache (avoids db query on every report fetch)
    try:
        landmarks_map = get_landmarks_map(db)
        holding_facs_by_subd = {l.subdivision_id: l for l in landmarks_map.values() if l.is_holding_facility and l.subdivision_id}
        default_holding_fac = next((l for l in landmarks_map.values() if l.is_holding_facility), None)
    except Exception as e:
        print(f"Error batch fetching landmarks from cache: {e}")
        landmarks_map = {}
        holding_facs_by_subd = {}
        default_holding_fac = None

    # 2. Batch holding animals
    try:
        all_holding = db.query(HoldingAnimal).filter(HoldingAnimal.report_id.in_(report_ids)).all()
        holding_map = {h.report_id: h for h in all_holding}
    except Exception as e:
        print(f"Error batch fetching holding animals: {e}")
        holding_map = {}

    # 3. Batch disputes
    try:
        all_disputes = db.query(ReportDispute).options(
            joinedload(ReportDispute.resident),
            joinedload(ReportDispute.reviewer),
            joinedload(ReportDispute.pet)
        ).filter(ReportDispute.report_id.in_(report_ids)).order_by(ReportDispute.created_at.desc()).all()
        disputes_map = defaultdict(list)
        for d in all_disputes:
            disputes_map[d.report_id].append(d)
    except Exception as e:
        print(f"Error batch fetching disputes: {e}")
        disputes_map = defaultdict(list)

    # 4. Batch pets & pet QRs
    pet_ids = {rep.pet_id for rep in reports if rep.pet_id}
    pets_map = {}
    qrs_map = {}
    if pet_ids:
        try:
            all_pets = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id.in_(pet_ids)).all()
            pets_map = {p.pet_id: p for p in all_pets}
            all_qrs = db.query(PetQRCode).filter(PetQRCode.pet_id.in_(pet_ids)).all()
            qrs_map = {q.pet_id: q for q in all_qrs}
        except Exception as e:
            print(f"Error batch fetching pets/qrs: {e}")

    # 5. Batch users (merged_by, verified_by, pet owners, etc.)
    user_ids = {rep.user_id for rep in reports if rep.user_id}
    user_ids.update({rep.merged_by for rep in reports if rep.merged_by})
    user_ids.update({rep.verified_by_user_id for rep in reports if rep.verified_by_user_id})
    user_ids.update({rep.assigned_leader_id for rep in reports if rep.assigned_leader_id})
    for p in pets_map.values():
        if p.owner_id:
            user_ids.add(p.owner_id)
    users_map = {}
    if user_ids:
        try:
            all_users = db.query(User).filter(User.user_id.in_(user_ids)).all()
            users_map = {u.user_id: u for u in all_users}
        except Exception as e:
            print(f"Error batch fetching users: {e}")

    # 6. Batch parent reports (duplicate_of_report_id)
    parent_report_ids = {rep.duplicate_of_report_id for rep in reports if rep.duplicate_of_report_id}
    parents_map = {}
    if parent_report_ids:
        try:
            all_parents = db.query(Report).options(
                joinedload(Report.assigned_leader),
                joinedload(Report.facility),
                selectinload(Report.merged_reports).joinedload(Report.reporter),
                selectinload(Report.merged_reports).selectinload(Report.media)
            ).filter(Report.report_id.in_(parent_report_ids)).all()
            parents_map = {p.report_id: p for p in all_parents}
        except Exception as e:
            print(f"Error batch fetching parent reports: {e}")

    # 7. Batch report matches
    ai_dup_matches_map = defaultdict(list)
    dup_matches_pair_map = {}
    confirmed_pet_matches_map = {}
    evaluated_matches_map = {}
    try:
        all_matches = db.query(ReportMatch).options(
            joinedload(ReportMatch.reviewer),
            joinedload(ReportMatch.matched_pet).joinedload(Pet.owner),
            joinedload(ReportMatch.matched_report)
        ).filter(
            or_(
                ReportMatch.source_report_id.in_(report_ids),
                ReportMatch.matched_report_id.in_(report_ids)
            )
        ).order_by(desc(ReportMatch.verified_at)).all()

        reports_status_map = {r.report_id: r.current_status_id for r in reports}
        reports_dup_map = {r.report_id: r.duplicate_of_report_id for r in reports}

        for m in all_matches:
            # Pair map for duplicate reviews
            if m.matched_report_id:
                dup_matches_pair_map[(m.source_report_id, m.matched_report_id)] = m
                dup_matches_pair_map[(m.matched_report_id, m.source_report_id)] = m

            # Confirmed pet match for source report
            if m.matched_pet_id and m.status == "CONFIRMED_MATCH" and m.source_report_id not in confirmed_pet_matches_map:
                confirmed_pet_matches_map[m.source_report_id] = m

            # Evaluated matches (NOT_A_MATCH or UNABLE_TO_VERIFY)
            if m.status in ("NOT_A_MATCH", "UNABLE_TO_VERIFY"):
                if m.source_report_id not in evaluated_matches_map:
                    evaluated_matches_map[m.source_report_id] = m
                if m.matched_report_id and m.matched_report_id not in evaluated_matches_map:
                    evaluated_matches_map[m.matched_report_id] = m

            # AI suggested duplicates
            if m.status == "AI_SUGGESTED" and m.matched_report_id is not None and m.matched_pet_id is None:
                src_status = reports_status_map.get(m.source_report_id, 1)
                src_dup = reports_dup_map.get(m.source_report_id, None)
                cand_status = reports_status_map.get(m.matched_report_id, 1)
                cand_dup = reports_dup_map.get(m.matched_report_id, None)
                if src_status not in RESOLVED_STATUS_IDS and not src_dup and cand_status not in RESOLVED_STATUS_IDS and not cand_dup:
                    ai_dup_matches_map[m.source_report_id].append(m)
                    ai_dup_matches_map[m.matched_report_id].append(m)
    except Exception as e:
        print(f"Error batch fetching report matches: {e}")

    warnings_map = defaultdict(list)
    try:
        if report_ids:
            all_warnings = db.query(OwnerWarning).filter(
                OwnerWarning.report_id.in_(report_ids)
            ).order_by(desc(OwnerWarning.created_at)).all()
            for w in all_warnings:
                warnings_map[w.report_id].append(w)
    except Exception as e:
        print(f"Error batch fetching warnings: {e}")

    for rep in reports:
        try:
            rep_data = ReportResponse.model_validate(rep)
            # Map current_status_id → status_id for frontend compatibility
            rep_data.status_id = rep.current_status_id  # type: ignore[assignment]
            rep_data.reporter_name = rep.reporter.name if rep.reporter else "Unknown User"
            rep_data.reporter_photo = rep.reporter.profile_picture if rep.reporter else None
            
            # Map AI suggestions explicitly
            rep_data.ai_animal_type = rep.ai_animal_type  # type: ignore
            rep_data.ai_dominant_color = rep.ai_dominant_color  # type: ignore
            rep_data.ai_estimated_size = rep.ai_estimated_size  # type: ignore
            rep_data.ai_possible_breed = rep.ai_possible_breed  # type: ignore
            rep_data.ai_suggested_risk_level = rep.ai_suggested_risk_level  # type: ignore
            rep_data.ai_suggested_priority = rep.ai_suggested_priority  # type: ignore
            rep_data.ai_photo_likelihood = float(rep.ai_photo_likelihood) if rep.ai_photo_likelihood is not None else None
            rep_data.ai_photo_status = rep.ai_photo_status
            rep_data.ai_photo_recommendation = rep.ai_photo_recommendation
            rep_data.ai_photo_details = rep.ai_photo_details
            
            # Populate history updater names
            if rep.history:
                for i, hist in enumerate(rep.history):  # type: ignore[arg-type]
                    if rep_data.history and i < len(rep_data.history):
                        rep_data.history[i].updater_name = get_hist_updater_name(hist, rep)
                        rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

            if rep.comments:
                for i, comment in enumerate(rep.comments):  # type: ignore[arg-type]
                    if rep_data.comments and i < len(rep_data.comments):
                        rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                        rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None

            # Populate pet & owner contact info for lost pet reports
            populate_pet_and_owner_info(rep_data, rep, db, pets_map=pets_map, qrs_map=qrs_map, users_map=users_map)

            # Populate handler details
            populate_handler_info(rep_data, rep)

            # Populate verification & dispute data
            populate_verification_and_disputes(rep_data, rep, db, users_map=users_map, disputes_map=disputes_map)

            # Populate location history & facility info
            populate_location_and_facility_info(
                rep_data, rep, db,
                holding_map=holding_map,
                landmarks_map=landmarks_map,
                holding_facs_by_subd=holding_facs_by_subd,
                default_holding_fac=default_holding_fac
            )

            # Populate duplicate & merge info
            populate_duplicate_and_merge_info(
                rep_data, rep, db,
                users_map=users_map,
                parents_map=parents_map,
                ai_dup_matches_map=ai_dup_matches_map,
                dup_matches_pair_map=dup_matches_pair_map,
                confirmed_pet_matches_map=confirmed_pet_matches_map,
                evaluated_matches_map=evaluated_matches_map,
                pets_map=pets_map
            )

            # Populate warning tracking info
            populate_warning_info(
                rep_data, rep, db,
                warnings_map=warnings_map,
                users_map=users_map,
                pets_map=pets_map
            )

            results.append(rep_data)
        except Exception as e:
            print(f"Error validating or backfilling report {rep.report_id}: {e}")
            continue

    return [redact_owner_contact(r, current_user) for r in results]


# Define the Selera Homes boundary polygon for geofencing
# North, East, South, West corners approximated from coordinates
SELERA_POLYGON = [
    (14.801496, 121.005174),
    (14.799577, 121.003911),
    (14.800634, 121.002228),
    (14.802461, 121.003280)
]
SELERA_CENTER_LAT = sum(p[0] for p in SELERA_POLYGON) / len(SELERA_POLYGON)
SELERA_CENTER_LNG = sum(p[1] for p in SELERA_POLYGON) / len(SELERA_POLYGON)

def calculate_distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate Great Circle distance between two coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def get_coverage_setting(db: Session) -> CoverageSetting:
    """Fetch active coverage setting or create default centered on Selera Homes."""
    setting = db.query(CoverageSetting).filter(CoverageSetting.is_active == True).order_by(CoverageSetting.id.asc()).first()
    if not setting:
        setting = CoverageSetting(
            subdivision_id=1,
            center_label="Selera Homes",
            center_latitude=Decimal(str(round(SELERA_CENTER_LAT, 8))),
            center_longitude=Decimal(str(round(SELERA_CENTER_LNG, 8))),
            radius_meters=1000,
            boundary_polygon=[{"lat": p[0], "lng": p[1]} for p in SELERA_POLYGON],
            is_active=True
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting

def is_inside_reporting_coverage(lat: float | None, lng: float | None, db: Session) -> tuple[bool, float, int]:
    """Check if point is within the configured radius from the fixed Selera Homes center."""
    if lat is None or lng is None:
        return False, 0.0, 1000
    try:
        setting = get_coverage_setting(db)
        center_lat = float(setting.center_latitude)
        center_lng = float(setting.center_longitude)
        allowed_radius = setting.radius_meters
        dist = calculate_distance_meters(float(lat), float(lng), center_lat, center_lng)
        return (dist <= allowed_radius), dist, allowed_radius
    except Exception as e:
        print(f"Coverage check error: {e}")
        dist = calculate_distance_meters(float(lat), float(lng), SELERA_CENTER_LAT, SELERA_CENTER_LNG)
        return (dist <= 1000.0), dist, 1000

def is_inside_selera_homes(lat: float | None, lng: float | None, db: Session | None = None) -> bool:
    """Check if point is within the Selera Homes reporting coverage area."""
    if lat is None or lng is None:
        return True
    if db is not None:
        is_inside, _, _ = is_inside_reporting_coverage(lat, lng, db)
        return is_inside
    dist = calculate_distance_meters(float(lat), float(lng), SELERA_CENTER_LAT, SELERA_CENTER_LNG)
    return dist <= 1000.0


@router.get("/coverage-area", response_model=CoverageAreaResponse)
def get_reporting_coverage_area(db: Session = Depends(get_db)):
    """Retrieve current reporting coverage radius and fixed Selera Homes center."""
    setting = get_coverage_setting(db)
    boundary = setting.boundary_polygon or [{"lat": p[0], "lng": p[1]} for p in SELERA_POLYGON]
    return CoverageAreaResponse(
        id=setting.id,
        subdivision_id=setting.subdivision_id or 1,
        center_label=setting.center_label or "Selera Homes",
        center_latitude=float(setting.center_latitude),
        center_longitude=float(setting.center_longitude),
        radius_meters=setting.radius_meters,
        boundary_polygon=boundary,
        is_active=setting.is_active,
        updated_at=setting.updated_at
    )


@router.put("/coverage-area", response_model=CoverageAreaResponse)
def update_reporting_coverage_area(
    update_in: CoverageAreaUpdate,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Admin setting to configure reporting coverage radius around the fixed Selera Homes center."""
    if current_user.role_id != 4 and not getattr(current_user, "is_head_officer", False):
        raise HTTPException(
            status_code=403, 
            detail="Only System Administrators or Barangay Head Officers can configure the reporting coverage radius."
        )

    setting = get_coverage_setting(db)
    old_radius = setting.radius_meters
    setting.radius_meters = update_in.radius_meters
    setting.updated_by = current_user.user_id
    db.commit()
    db.refresh(setting)

    try:
        log_activity(
            db=db,
            user_id=current_user.user_id,
            action="UPDATE_COVERAGE_RADIUS",
            target_table="coverage_settings",
            target_id=setting.id,
            description=f"Updated reporting coverage radius from {old_radius}m to {setting.radius_meters}m centered on {setting.center_label}",
            request=req
        )
    except Exception as e:
        print(f"Error logging coverage radius audit: {e}")

    boundary = setting.boundary_polygon or [{"lat": p[0], "lng": p[1]} for p in SELERA_POLYGON]
    return CoverageAreaResponse(
        id=setting.id,
        subdivision_id=setting.subdivision_id or 1,
        center_label=setting.center_label or "Selera Homes",
        center_latitude=float(setting.center_latitude),
        center_longitude=float(setting.center_longitude),
        radius_meters=setting.radius_meters,
        boundary_polygon=boundary,
        is_active=setting.is_active,
        updated_at=setting.updated_at
    )


def classify_category_from_description(description: str) -> int:
    """Classify report category based on description keywords.
    Uses a priority precedence order based on urgency and risk:
    1. Possible Rabies Risk (Category 3)
    2. Aggressive Stray (Category 2)
    3. Injured Animal (Category 1)
    4. Roaming Pack (Category 4)
    5. Animal Rescue Needed (Category 5) - fallback
    """
    text = (description or "").lower()
    
    # 1. Possible Rabies Risk (highest threat priority)
    rabies_keywords = ["rabies", "rabid", "foaming", "frothing", "drooling", "furious"]
    if any(kw in text for kw in rabies_keywords):
        return 3
        
    # 2. Aggressive Stray (active hazard)
    aggressive_keywords = [
        "aggressive", "bite", "biting", "attack", "attacking", "growl", "growling", 
        "snarl", "snarling", "snap", "snapping", "hostile"
    ]
    if any(kw in text for kw in aggressive_keywords):
        return 2
        
    # 3. Injured Animal (physical trauma/distress)
    injured_keywords = [
        "injured", "bleeding", "wound", "hurt", "broken", "hit by car", "blood", "accident"
    ]
    if any(kw in text for kw in injured_keywords):
        return 1
        
    # 4. Roaming Pack (grouping & roaming behaviors)
    roaming_keywords = ["roaming", "pack", "group", "multiple", "horde"]
    if any(kw in text for kw in roaming_keywords):
        return 4
        
    # 5. Fallback/Animal Rescue Needed
    return 5




@router.post("/analyze-media")
@limiter.limit("20/minute")
def analyze_report_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Analyze uploaded stray animal image or video and return AI predictions or indicate if no animal was detected."""
    # Plain `def`: FastAPI runs it in a worker thread, so YOLO and Gemini don't freeze every other request.
    is_video = False
    media_label = "image"
    media_noun = "photo"
    try:
        content = file.file.read()
        if len(content) > AI_SCAN_MAX_BYTES:
            raise HTTPException(status_code=413, detail="File is too large to analyze (max 10 MB).")
        from app.utils.video_processing import is_video_content, extract_sample_frames, analyze_video_frames

        filename = file.filename or ""
        content_type = file.content_type or ""
        is_video = is_video_content(filename, content_type, content)
        media_label = "video" if is_video else "image"
        media_noun = "video footage" if is_video else "photo"

        yolo_count = 0
        detected_yolo_labels = []
        detected_yolo_boxes = []

        if is_video:
            frames = extract_sample_frames(content, max_samples=8)
            if not frames:
                return {
                    "animal_detected": False,
                    "animal_type": "Unknown",
                    "primary_color": "Unknown",
                    "secondary_color": "None",
                    "tertiary_color": "None",
                    "coat_pattern": "Unknown",
                    "estimated_size": "Unknown",
                    "possible_breed": "Unknown",
                    "collar_detected": False,
                    "qr_tag_detected": False,
                    "message": "Unable to extract video frames. Please ensure the video format is valid (MP4, WebM, MOV, etc.)."
                }
            yolo_model = get_yolo_model()
            best_frame, detected_yolo_labels, detected_yolo_boxes, yolo_count = analyze_video_frames(frames, yolo_model)
            img = best_frame if best_frame is not None else frames[0]
        else:
            try:
                img = Image.open(io.BytesIO(content)).convert("RGB")
            except Exception:
                # If PIL cannot identify the image, attempt fallback to video frame extraction
                frames = extract_sample_frames(content, max_samples=8)
                if frames:
                    is_video = True
                    media_label = "video"
                    media_noun = "video footage"
                    yolo_model = get_yolo_model()
                    best_frame, detected_yolo_labels, detected_yolo_boxes, yolo_count = analyze_video_frames(frames, yolo_model)
                    img = best_frame if best_frame is not None else frames[0]
                else:
                    raise

            if not is_video:
                # Run YOLOv8 detection on static image
                try:
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                        tmp.write(content)
                        tmp_path = tmp.name
                    try:
                        yolo_model = get_yolo_model()
                        results = yolo_model(tmp_path)
                        detected_yolo_confs = []
                        for r in results:
                            for c, box, conf in zip(r.boxes.cls, r.boxes.xyxy, r.boxes.conf):
                                label = r.names[int(c)]
                                if label.lower() in ['dog', 'cat']:
                                    yolo_count += 1
                                    detected_yolo_labels.append(label.capitalize())
                                    detected_yolo_boxes.append([float(v) for v in box])
                                    detected_yolo_confs.append(float(conf))
                        ai_pipeline.remember_yolo(content, detected_yolo_labels, detected_yolo_boxes, detected_yolo_confs)
                    finally:
                        if os.path.exists(tmp_path):
                            os.unlink(tmp_path)
                except Exception as yerr:
                    print("YOLO check in analyze-media error:", yerr)

        # Crop image to primary animal subject bounding box to eliminate background distraction (cobblestones, street, buildings)
        cropped_img = img
        if detected_yolo_boxes:
            box = max(detected_yolo_boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
            x1, y1, x2, y2 = box
            w, h = img.size
            pad_w = (x2 - x1) * 0.05
            pad_h = (y2 - y1) * 0.05
            cx1 = max(0, int(x1 - pad_w))
            cy1 = max(0, int(y1 - pad_h))
            cx2 = min(w, int(x2 + pad_w))
            cy2 = min(h, int(y2 + pad_h))
            if cx2 > cx1 and cy2 > cy1:
                cropped_img = img.crop((cx1, cy1, cx2, cy2))

        # Run AI vision analysis and forensics using full uncropped image
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key and is_gemini_enabled_in_db():
            try:
                prompt = f"""
                You are a senior digital image forensics expert and animal safety inspector for StraySafe, a community animal welfare and stray rescue platform.
                Inspect the attached {"representative frame from the uploaded video" if is_video else "image"} of the animal subject and perform two critical analyses:

                ================================================================================
                PART 1: FORENSIC AI-IMAGE & SYNTHETIC MEDIA DETECTION
                ================================================================================
                Perform a forensic examination to classify whether this media is:
                (A) A GENUINE, REAL-WORLD CAMERA PHOTOGRAPH taken by a physical smartphone or digital camera lens in the physical world.
                (B) AN AI-GENERATED, SYNTHETIC, OR DIGITALLY RENDERED IMAGE (e.g. Midjourney, DALL-E, Stable Diffusion, Flux, Leonardo, Adobe Firefly, deepfake, or 3D CGI render).

                Carefully inspect for the following forensic indicators:
                1. FUR & SKIN MICRO-TEXTURE:
                   - Real photo: Natural hair follicle disorder, individual flyaway hairs, realistic grit/dirt, organic clumps, natural sensor ISO noise across hair strands.
                   - AI-generated: Airbrushed/plastic texture, hyper-smooth silky sheen, painterly brushstroke-like fur flow, blurry or melted fur patches lacking individual hair follicle definitions.
                2. EYES, PUPILS & REFLECTIONS:
                   - Real photo: Anatomically correct circular/slit pupils, realistic corneal moisture, natural reflection of ambient physical environment.
                   - AI-generated: Surreal glassy/glossy doll-like eyes, mismatched eye glints, deformed pupil shapes, unnatural circular catchlights disconnected from environment lighting.
                3. ANATOMICAL PRECISION & EXTREMITIES:
                   - Real photo: Anatomically correct paws, distinct pads, natural claws rooted properly in toes, authentic ear cartilage and whiskers emerging from visible pores.
                   - AI-generated: Deformed/merged paws, extra or missing claws/toes, whiskers that float disconnected or blend into cheek fur, ears melting into background.
                4. OPTICAL PHYSICS, LIGHTING & BACKGROUND:
                   - Real photo: Natural optical lens depth of field (progressive focal blur), consistent single or ambient light source with authentic shadows, real ground/pavement contact.
                   - AI-generated: Surreal rim lighting where no light source exists, impossible background geometry/perspective, subject floating or artificially pasted over background with Gaussian/digital blur halos.

                CLASSIFICATION & CONFIDENCE RULES:
                - If you observe clear or subtle signatures of AI image generation, prompt diffusion, or synthetic rendering:
                  * "is_ai_generated": true
                  * "ai_generation_confidence": float between 0.60 and 1.0
                  * "verification_status": "ai_generated"
                  * "verification_message": "Photo verification failed — this image appears to be AI-generated. Please upload an actual photo of the animal."
                - If the image displays authentic optical camera sensor characteristics, natural grain, and realistic physical traits:
                  * "is_ai_generated": false
                  * "ai_generation_confidence": float between 0.0 and 0.35
                  * "verification_status": "authentic"
                  * "verification_message": "Photo verified — appears to be a real animal photograph."
                - If the image is heavily degraded, screenshot of low quality, or inconclusive:
                  * "is_ai_generated": false
                  * "ai_generation_confidence": float between 0.36 and 0.59
                  * "verification_status": "uncertain"
                  * "verification_message": "Photo verification notice — image authenticity is uncertain. Please ensure the photo is clear and taken with a camera."

                ================================================================================
                PART 2: ANIMAL ATTRIBUTES & STRICT DOG/CAT VERIFICATION
                ================================================================================
                Focus strictly on the primary animal subject:
                - CRITICAL RULE: StraySafe ONLY accepts and processes reports for DOGS (canines) and CATS (felines).
                - animal_detected: true ONLY if a real Dog or Cat is clearly visible and identifiable.
                  Set animal_detected: false if the subject is:
                  * Any other animal (bird, monkey, reptile, snake, rodent, horse, cow, goat, fish, insect, poultry, etc.)
                  * A human (person, face, hands, selfie)
                  * An inanimate object (car, road, garbage, building, paper, screenshot, food, plant, blank, furniture)
                
                - ANATOMICAL CLASSIFICATION (DOG vs CAT):
                  * "Dog" (Canine): Distinct elongated snout/muzzle, visible canine stop, upright/floppy canine ear cartilage, canine legs and paws. Note that Philippine local dogs ("Aspin" / Asong Pinoy) often have erect pointy ears, slender bodies, and white-with-patches coats. NEVER mistake an Aspin dog with pointed ears for a cat.
                  * "Cat" (Feline): Short rounded facial profile, flat muzzle, fine feline whiskers, and feline body curvature. Philippine local cats are "Puspin".
                
                - animal_type: "Dog" | "Cat" | "Unknown" (MUST be "Unknown" if not a dog or cat).
                - detected_subject_description: Brief description of what is actually shown (e.g. "White and gray patched Aspin dog", "Puspin cat", "Parrot bird", "Human selfie").
                - primary_color: Dominant fur color ("White", "Brown", "Black", "Gray", "Orange", "Tan", "Cream", "Golden", or "Unknown").
                - secondary_color: Secondary fur color (e.g. "Gray", "Brown", "Black", "White", or "None").
                - tertiary_color: Third fur color or "None".
                - coat_pattern: "Bicolor", "Patched", "Solid", "Tricolor", "Spotted", "Striped", "Brindle", "Merle", "Tabby", "Calico", "Tortoiseshell", or "Unknown".
                - estimated_size: "Small" (cats, small breeds, puppies), "Medium" (standard Aspin dogs, spaniels), "Large" (retrievers, huskies, shepherds).
                - possible_breed: Likely breed name (e.g. "Aspin" for Philippine local dogs, "Puspin" for Philippine domestic cats, "Shih Tzu", "Golden Retriever", "Siamese", etc.).
                - collar_detected: true ONLY if collar/harness is visible, otherwise false.
                - qr_tag_detected: true ONLY if QR/ID tag is attached, otherwise false.

                Respond ONLY with a valid JSON object matching this schema:
                {{
                    "is_ai_generated": boolean,
                    "ai_generation_confidence": number,
                    "verification_status": "authentic" | "ai_generated" | "uncertain",
                    "verification_message": string,
                    "authenticity_details": string,
                    "animal_detected": boolean,
                    "animal_type": "Dog" | "Cat" | "Unknown",
                    "detected_subject_description": string,
                    "primary_color": string,
                    "secondary_color": string,
                    "tertiary_color": string,
                    "coat_pattern": string,
                    "estimated_size": string,
                    "possible_breed": string,
                    "collar_detected": boolean,
                    "qr_tag_detected": boolean,
                    "message": string
                }}
                """

                # Pass the full original image for complete forensic fidelity
                res = call_gemini_with_fallback(
                    [prompt, img],
                    generation_config={"response_mime_type": "application/json"}
                )

                if not res or not getattr(res, "text", None):
                    raise ValueError("Gemini API returned an empty or invalid response.")

                text_resp = res.text.strip()
                if text_resp.startswith("```"):
                    lines = text_resp.split("\n")
                    if lines[0].startswith("```json"):
                        text_resp = "\n".join(lines[1:-1])
                    elif lines[0].startswith("```"):
                        text_resp = "\n".join(lines[1:-1])

                data = json.loads(text_resp)
                raw_animal_type = str(data.get("animal_type", "Unknown")).strip()
                detected_desc = str(data.get("detected_subject_description", "")).strip()

                # Strictly normalize animal type to Dog or Cat only
                if raw_animal_type.lower() in ["dog", "canine", "puppy", "aspin"]:
                    animal_type = "Dog"
                elif raw_animal_type.lower() in ["cat", "feline", "kitten", "puspin"]:
                    animal_type = "Cat"
                else:
                    animal_type = "Unknown"

                gemini_detected = bool(data.get("animal_detected", False)) and (animal_type in ["Dog", "Cat"])

                # Extract AI verification fields
                raw_is_ai = data.get("is_ai_generated")
                # Only Gemini's own number is shown: no invented placeholder when it gives none
                raw_conf = data.get("ai_generation_confidence")
                try:
                    ai_conf = max(0.0, min(1.0, float(raw_conf))) if raw_conf is not None else None
                except (TypeError, ValueError):
                    ai_conf = None
                ai_likelihood_pct = round(ai_conf * 100, 1) if ai_conf is not None else None
                if ai_conf is None:
                    v_status_shared = "ai_generated" if raw_is_ai else STATUS_NOT_CHECKED
                else:
                    v_status_shared, _ = classify_ai_confidence(ai_conf)
                is_ai_gen = v_status_shared == "ai_generated"

                # Compute verification status and recommendations (thresholds shared with every photo check)
                if is_ai_gen:
                    v_status = "ai_generated"
                    v_photo_status = "Potentially AI-generated"
                    v_rec = "Please verify the authenticity of the uploaded photo."
                    v_msg = "This image may be AI-generated. Please make sure the uploaded photo is an actual photo of the reported animal."
                elif v_status_shared == "authentic":
                    v_status = "authentic"
                    v_photo_status = "Likely Authentic"
                    v_rec = "Photo appears authentic."
                    v_msg = "Photo verified — appears to be a real animal photograph."
                elif v_status_shared == STATUS_NOT_CHECKED:
                    v_status = STATUS_NOT_CHECKED
                    v_photo_status = "Authenticity not scored"
                    v_rec = "The AI did not return an authenticity score for this photo. Staff should check the photo."
                    v_msg = "Animal detected. The AI did not score this photo's authenticity."
                else:
                    v_status = "uncertain"
                    v_photo_status = "Uncertain"
                    v_rec = "Please verify the authenticity of the uploaded photo."
                    v_msg = "Image authenticity is uncertain. Please ensure the photo is clear and taken with a camera."

                auth_details = str(data.get("authenticity_details", "Visual authenticity analysis completed."))
                if not is_video and ai_conf is not None:
                    _, check_label = classify_ai_confidence(ai_conf)
                    ai_pipeline.remember_photo_check(content, {
                        "verification_status": v_status_shared if gemini_detected else "ineligible_subject",
                        "label": check_label if gemini_detected else "No dog or cat detected",
                        "ai_photo_likelihood": ai_likelihood_pct,
                        "animal_type": animal_type if gemini_detected else None,
                        "details": auth_details[:500],
                    })

                # Combine YOLO & Gemini validation for animal presence (STRICT DOG OR CAT ONLY)
                yolo_has_dog_or_cat = any(lbl in ["Dog", "Cat"] for lbl in detected_yolo_labels)
                is_detected = gemini_detected or yolo_has_dog_or_cat
                if not is_detected or animal_type not in ["Dog", "Cat"]:
                    if yolo_has_dog_or_cat:
                        is_detected = True
                        animal_type = "Dog" if "Dog" in detected_yolo_labels else "Cat"
                    else:
                        is_detected = False
                        animal_type = "Unknown"

                if not is_detected:
                    reject_msg = f"StraySafe strictly accepts reports for dogs and cats only. No canine or feline was detected in the uploaded {media_label}."
                    if detected_desc and detected_desc.lower() not in ["dog", "cat", "unknown", ""]:
                        reject_msg = f"Detected subject appears to be '{detected_desc}'. StraySafe strictly accepts reports for dogs and cats only."

                    return {
                        "animal_detected": False,
                        "animal_type": "Unknown",
                        "primary_color": "Unknown",
                        "secondary_color": "None",
                        "tertiary_color": "None",
                        "coat_pattern": "Unknown",
                        "estimated_size": "Unknown",
                        "possible_breed": "Unknown",
                        "collar_detected": False,
                        "qr_tag_detected": False,
                        "is_ai_generated": is_ai_gen,
                        "ai_generation_confidence": ai_conf,
                        "ai_photo_likelihood": ai_likelihood_pct,
                        "ai_photo_status": v_photo_status,
                        "ai_photo_recommendation": v_rec,
                        "verification_status": "ineligible_subject" if (detected_desc and detected_desc.lower() not in ["dog", "cat", "unknown", ""]) else v_status,
                        "verification_message": reject_msg,
                        "authenticity_details": auth_details,
                        "message": reject_msg
                    }

                p_col = str(data.get("primary_color", "White")).strip()
                s_col = str(data.get("secondary_color", "None")).strip()
                t_col = str(data.get("tertiary_color", "None")).strip()
                pattern = str(data.get("coat_pattern", "Patched" if s_col not in ["None", ""] else "Solid")).strip()
                size_est = str(data.get("estimated_size", "Medium" if animal_type == "Dog" else "Small")).strip()
                breed_est = str(data.get("possible_breed", "Aspin" if animal_type == "Dog" else "Puspin")).strip()

                return {
                    "animal_detected": True,
                    "animal_type": animal_type,
                    "primary_color": p_col,
                    "secondary_color": s_col,
                    "tertiary_color": t_col,
                    "coat_pattern": pattern,
                    "estimated_size": size_est,
                    "possible_breed": breed_est,
                    "collar_detected": bool(data.get("collar_detected", False)),
                    "qr_tag_detected": bool(data.get("qr_tag_detected", False)),
                    "is_ai_generated": is_ai_gen,
                    "ai_generation_confidence": ai_conf,
                    "ai_photo_likelihood": ai_likelihood_pct,
                    "ai_photo_status": v_photo_status,
                    "ai_photo_recommendation": v_rec,
                    "verification_status": v_status,
                    "verification_message": v_msg,
                    "authenticity_details": auth_details,
                    "message": v_msg if v_status == "ai_generated" else "Animal detected and analyzed successfully."
                }
            except Exception as gem_err:
                print("Gemini Vision analysis error:", gem_err)
                # Fall through with local optical sensor fallback

        # Safe fallback if Gemini API is unavailable or rate-limited
        detected_type = detected_yolo_labels[0] if detected_yolo_labels else "Unknown"
        is_detected = yolo_count > 0

        p_color = "White"
        s_color = "None"
        t_color = "None"
        coat_pattern_val = "Solid"

        if is_detected:
            try:
                cropped_bytes_io = io.BytesIO()
                cropped_img.save(cropped_bytes_io, format='JPEG')
                extracted_color_str = extract_dominant_colors(cropped_bytes_io.getvalue())
                extracted_colors = [c.strip() for c in extracted_color_str.split(',') if c.strip() and c.strip() != "Unknown"]
                p_color = extracted_colors[0] if extracted_colors else "White"
                s_color = extracted_colors[1] if len(extracted_colors) > 1 else "None"
                t_color = extracted_colors[2] if len(extracted_colors) > 2 else "None"
                if s_color not in ["None", ""]:
                    coat_pattern_val = "Bicolor" if t_color in ["None", ""] else "Tricolor"
            except Exception as col_err:
                print("Color extraction fallback error:", col_err)

        return {
            "animal_detected": is_detected,
            "animal_type": detected_type if detected_type in ["Dog", "Cat"] else "Dog",
            "primary_color": p_color,
            "secondary_color": s_color,
            "tertiary_color": t_color,
            "coat_pattern": coat_pattern_val,
            "estimated_size": "Small" if detected_type == "Cat" else "Medium",
            "possible_breed": "Puspin" if detected_type == "Cat" else "Aspin",
            "collar_detected": False,
            "qr_tag_detected": False,
            "is_ai_generated": False,
            "ai_generation_confidence": None,
            "ai_photo_likelihood": None,
            "ai_photo_status": "Authenticity not checked (AI offline)",
            "ai_photo_recommendation": "Authenticity could not be checked because the AI service is offline. Staff should check the photo.",
            "verification_status": STATUS_NOT_CHECKED,
            "verification_message": "Animal detected with the local vision model. Authenticity was not checked (AI offline).",
            "authenticity_details": "Only the local model ran (animal box + coat colors); no AI-generated check was possible.",
            "message": "Animal detected and analyzed successfully with local vision engine." if is_detected else f"No animal detected in the uploaded {media_label}."
        }
    except HTTPException:
        raise
    except Exception as e:
        print("Media analysis critical error:", e)
        return {
            "animal_detected": False,
            "animal_type": "Unknown",
            "primary_color": "Unknown",
            "secondary_color": "None",
            "tertiary_color": "None",
            "coat_pattern": "Unknown",
            "estimated_size": "Unknown",
            "possible_breed": "Unknown",
            "collar_detected": False,
            "qr_tag_detected": False,
            "is_ai_generated": False,
            "ai_generation_confidence": None,
            "ai_photo_likelihood": None,
            "ai_photo_status": "Unable to analyze image",
            "ai_photo_recommendation": "Unable to analyze image. Please ensure a clear photo of the animal is uploaded.",
            "verification_status": "unable_to_analyze",
            "verification_message": "Unable to analyze image. Please ensure the photo is clear and taken with a camera.",
            "authenticity_details": "Analysis pipeline encountered an error.",
            "message": f"Unable to process {media_label}. Please ensure a valid image file."
        }


@router.post("/validate-images")
@limiter.limit("20/minute")
def validate_report_images(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if Image is None:
        raise HTTPException(status_code=500, detail="PIL / Pillow image library is missing on server.")

    valid_images = []
    pil_images = []
    api_key = os.getenv("GEMINI_API_KEY")

    # Validate each uploaded image
    for file in files:
        filename = file.filename or ""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
            # Skip non-image files if any are sent
            continue

        try:
            # Read file content
            content = file.file.read()
            file.file.seek(0)
            if len(content) > AI_SCAN_MAX_BYTES:
                return {
                    "valid": False,
                    "error_type": "file_too_large",
                    "message": f"{filename or 'A file'} is larger than 10 MB. Please upload a smaller photo or video."
                }
            
            # Load as PIL Image to verify it's valid
            try:
                img = Image.open(io.BytesIO(content))
                img.verify()
                # Re-open because verify() closes/invalidates the image object
                img = Image.open(io.BytesIO(content)).convert("RGB")
            except Exception:
                return {
                    "valid": False,
                    "error_type": "invalid_image",
                    "message": f"Uploaded file {filename} is not a valid image."
                }

            # Save to temporary file for YOLOv8
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            animal_count = 0
            try:
                model = get_yolo_model()
                results = model(tmp_path)
                
                for r in results:
                    for c in r.boxes.cls:
                        label = r.names[int(c)]
                        if label.lower() in ['dog', 'cat']:
                            animal_count += 1
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            # Run authenticity & animal count verification with Gemini Vision
            if api_key and is_gemini_enabled_in_db(db):
                try:
                    check_prompt = """
                    You are a senior digital forensics expert and animal safety inspector for StraySafe.
                    Inspect this uploaded image and analyze two essential criteria:
                    1. Animal Detection (STRICT DOG OR CAT ONLY): Is there a DOG or CAT visible in this photo? How many?
                       - If the image contains a human, bird, rodent, horse, cow, monkey, reptile, inanimate object, or non-canine/feline subject, set "animal_detected": false and "count": 0.
                    2. Authenticity & AI-Generation Detection: Analyze whether this image is an authentic photograph taken by a physical camera/phone, or if it is an AI-generated, synthetic, deepfake, or digitally rendered illustration (e.g. Midjourney, DALL-E, Stable Diffusion, Flux, Leonardo, 3D CGI).
                    Check for synthetic fur smoothing, plastic sheen, impossible anatomy (distorted paws, mismatched eyes, floating whiskers), and diffusion artifacts.

                    Respond ONLY with a valid JSON object:
                    {
                        "animal_detected": true/false,
                        "animal_type": "Dog" | "Cat" | "Unknown",
                        "count": number,
                        "is_ai_generated": true/false,
                        "ai_generation_confidence": 0.0 to 1.0,
                        "verification_status": "authentic" | "ai_generated" | "uncertain",
                        "verification_message": string,
                        "authenticity_details": string
                    }
                    """
                    g_res = call_gemini_with_fallback(
                        [check_prompt, img],
                        generation_config={"response_mime_type": "application/json"}
                    )
                    if g_res and getattr(g_res, "text", None):
                        g_text = g_res.text.strip()
                        if g_text.startswith("```"):
                            lines = g_text.split("\n")
                            g_text = "\n".join(lines[1:-1] if lines[0].startswith("```") else lines)
                        g_data = json.loads(g_text)

                        # Check AI generated status
                        raw_is_ai = g_data.get("is_ai_generated")
                        raw_conf = g_data.get("ai_generation_confidence")
                        try:
                            ai_conf = max(0.0, min(1.0, float(raw_conf))) if raw_conf is not None else None
                        except (TypeError, ValueError):
                            ai_conf = None
                        # No number from Gemini -> rely on its yes/no answer only (no invented 5% / 95%)
                        v_status = ("ai_generated" if raw_is_ai else STATUS_NOT_CHECKED) if ai_conf is None else classify_ai_confidence(ai_conf)[0]

                        if v_status == "ai_generated":
                            return {
                                "valid": False,
                                "error_type": "ai_generated_image",
                                "message": "Photo verification failed — this image appears to be AI-generated. Please upload an actual photo of the animal.",
                                "details": g_data.get("authenticity_details", "Detected synthetic artifacts, unnatural fur smoothing, or AI generation signatures.")
                            }

                        detected_type = str(g_data.get("animal_type", "Unknown")).strip().capitalize()
                        if g_data.get("animal_detected") and detected_type in ["Dog", "Cat"]:
                            animal_count = max(animal_count, int(g_data.get("count", 1)))
                        elif detected_type not in ["Dog", "Cat"]:
                            # Specifically detected a non-dog/cat subject
                            return {
                                "valid": False,
                                "error_type": "invalid_species",
                                "message": "StraySafe strictly accepts reports for dogs and cats only. Uploaded media does not contain a dog or cat."
                            }
                except Exception as gem_check_err:
                    print(f"Gemini validation error for {filename}:", gem_check_err)
                    # If AI check failed, we don't allow unverified images if animal_count is 0
                    pass

            if animal_count == 0:
                return {
                    "valid": False,
                    "error_type": "no_animal",
                    "message": "No dog or cat was detected in the uploaded image. StraySafe strictly accepts reports for dogs and cats only."
                }
            elif animal_count > 1:
                return {
                    "valid": False,
                    "error_type": "multiple_animals",
                    "message": "Multiple animals were detected in one or more uploaded images. Please upload images containing only one animal per report."
                }

            # Keep valid image content and PIL image for similarity analysis
            valid_images.append(content)
            pil_images.append(img)

        except Exception as e:
            print(f"Error analyzing image {filename}: {e}")
            return {
                "valid": False,
                "error_type": "error",
                "message": f"Error analyzing image {filename}: {str(e)}"
            }

    # If multiple images, run visual similarity analysis
    if len(pil_images) > 1:
        if api_key and is_gemini_enabled_in_db(db):
            try:
                prompt = """
                You are the StraySafe Copilot, an AI assistant for a subdivision's stray animal reporting and safety system.
                You are given multiple images of stray animals uploaded for a single report.
                Your task is to analyze these images and determine if they depict the same individual animal.

                Analyze visual characteristics of the animal in each image, including:
                - Fur color and color patterns (e.g., solid, spotted, striped, patches)
                - Body shape, size, and proportions
                - Facial features (e.g., muzzle length, snout color, eyes)
                - Ear shape and position (e.g., floppy, erect, cropped)
                - Tail shape and length (e.g., bushy, long, docked)
                - Distinctive markings or scars

                Rules:
                1. The purpose is solely to check that a single report focuses on a single animal. Do not attempt to determine ownership.
                2. Respond ONLY with a valid JSON block containing two fields:
                   - "status": Must be one of the following strings:
                     * "same": if you are confident that all images depict the same individual animal.
                     * "different": if you detect that the images show different individual animals (e.g., a dog and a cat, or two dogs with different color/breed/markings).
                     * "inconclusive": if you cannot confidently determine whether they are the same or different (e.g., poor lighting, blurry images, or only one image doesn't show the animal clearly).
                   - "reason": A short, conversational, and warm explanation (1-2 sentences) of your reasoning. Do not mention technical terms or 'JSON'.

                Respond ONLY with a valid JSON block.
                """

                content_to_send = [prompt]
                for img in pil_images:
                    content_to_send.append(img)

                response = call_gemini_with_fallback(
                    content_to_send,
                    generation_config={"response_mime_type": "application/json"}
                )

                if not response or not getattr(response, "text", None):
                    raise ValueError("Gemini API returned an empty or invalid response.")

                text_resp = response.text.strip()
                if text_resp.startswith("```"):
                    lines = text_resp.split("\n")
                    if lines[0].startswith("```json"):
                        text_resp = "\n".join(lines[1:-1])
                    elif lines[0].startswith("```"):
                        text_resp = "\n".join(lines[1:-1])

                data = json.loads(text_resp)
                status = data.get("status", "inconclusive")

                if status == "same":
                    return {"valid": True, "status": "same"}
                elif status == "different":
                    return {
                        "valid": False,
                        "error_type": "different_animals",
                        "message": "The uploaded images appear to show different animals. Please create a separate report for each animal."
                    }
                else:
                    return {
                        "valid": False,
                        "error_type": "inconclusive",
                        "message": "The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting."
                    }

            except Exception as gemini_err:
                print(f"Gemini similarity error: {gemini_err}")
                return {
                    "valid": False,
                    "error_type": "inconclusive",
                    "message": "The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting."
                }
        else:
            # Rule-based fallback when Gemini is disabled: allow valid images through
            return {"valid": True, "status": "same"}

    return {"valid": True, "status": "success"}


@router.post("/", response_model=ReportResponse)
@limiter.limit("20/minute")
def create_report(
    report_in: ReportCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = request
    try:
        # Configurable Coverage Radius Validation (Centered on Selera Homes)
        is_inside, dist, allowed_radius = is_inside_reporting_coverage(report_in.latitude, report_in.longitude, db)
        if not is_inside:
            raise HTTPException(
                status_code=400, 
                detail="This report location is outside the current STRAY-SAFE reporting coverage area."
            )

        report_data = report_in.model_dump()

        # Hard validation: StraySafe strictly accepts reports for Dogs and Cats only
        raw_animal_type = str(report_data.get("animal_type") or "").strip().capitalize()
        if raw_animal_type and raw_animal_type not in ["Dog", "Cat", "Unknown"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid animal species '{raw_animal_type}'. StraySafe strictly accepts reports for dogs and cats only."
            )

        # Hard validation: Prevent deceased pets from being reported as Lost or linked to lost reports
        if report_data.get("pet_id"):
            pet_to_check = db.query(Pet).filter(Pet.pet_id == report_data["pet_id"]).first()
            if not pet_to_check:
                raise HTTPException(status_code=404, detail="Selected pet not found.")
            if pet_to_check.status and pet_to_check.status.lower() == "deceased":
                raise HTTPException(
                    status_code=400,
                    detail="This pet is marked as deceased and cannot be reported as lost."
                )
            # Mark the pet status as 'Lost' if creating a lost pet report
            if report_data.get("category_id") == 6:
                pet_to_check.status = "Lost"

        # Map frontend "status_id" → DB "current_status_id"
        raw_status_id = report_data.pop("status_id", 1) or 1
        status_obj = db.query(ReportStatus).filter(ReportStatus.status_id == raw_status_id).first()
        report_data["current_status_id"] = status_obj.status_id if status_obj else 1

        # The report always belongs to the logged-in user (never a user_id sent by the browser)
        user_obj = current_user
        report_data["user_id"] = current_user.user_id

        # Validate subdivision_id exists in DB, fallback to user's subdivision or default (1)
        raw_subd_id = report_data.get("subdivision_id")
        subd_obj = db.query(Subdivision).filter(Subdivision.subdivision_id == raw_subd_id).first() if raw_subd_id else None
        if not subd_obj:
            report_data["subdivision_id"] = user_obj.subdivision_id if (user_obj and user_obj.subdivision_id) else 1

        # Drop any frontend-only fields not in the DB
        for field in ["behavior_tags", "is_archived", "status_remarks"]:
            report_data.pop(field, None)

        # Auto-classify category if not provided or invalid
        raw_cat_id = report_data.get("category_id")
        cat_obj = db.query(ReportCategory).filter(ReportCategory.category_id == raw_cat_id).first() if raw_cat_id else None
        if not cat_obj:
            report_data["category_id"] = classify_category_from_description(report_data.get("description", "")) or 1
        else:
            report_data["category_id"] = cat_obj.category_id

        # Preserve initial found location
        report_data["initial_latitude"] = report_data.get("latitude")
        report_data["initial_longitude"] = report_data.get("longitude")
        report_data["initial_landmark"] = report_data.get("landmark")

        db_report = Report(**report_data)
        db.add(db_report)
        db.flush()  # Get report_id before committing

        # Generate initial AI suggestions based on report details
        from app.utils.ai_suggestions import generate_ai_suggestions
        category_name = ""
        if db_report.category_id:
            category_obj = db.query(ReportCategory).filter(ReportCategory.category_id == db_report.category_id).first()
            if category_obj:
                category_name = category_obj.category_name
        
        suggestions = generate_ai_suggestions(
            description=db_report.description,  # type: ignore
            category_name=category_name  # type: ignore
        )
        db_report.ai_animal_type = suggestions["ai_animal_type"]  # type: ignore
        db_report.ai_dominant_color = suggestions["ai_dominant_color"]  # type: ignore
        db_report.ai_coat_pattern = suggestions.get("ai_coat_pattern") or "Solid"  # type: ignore
        db_report.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
        db_report.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
        db_report.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
        db_report.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
        db_report.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore
        db_report.ai_behavior_chasing = suggestions.get("ai_behavior_chasing", False)  # type: ignore
        db_report.ai_behavior_actual_bite = suggestions.get("ai_behavior_actual_bite", False)  # type: ignore
        db_report.ai_behavior_attempted_bite = suggestions.get("ai_behavior_attempted_bite", False)  # type: ignore
        db_report.ai_behavior_injury = suggestions.get("ai_behavior_injury", False)  # type: ignore
        db_report.ai_behavior_aggressive = suggestions.get("ai_behavior_aggressive", False)  # type: ignore
        db_report.ai_behavior_explanation = suggestions.get("ai_behavior_explanation")  # type: ignore
        db_report.ai_description_confidence = suggestions.get("ai_field_confidence")  # type: ignore

        # Create initial history entry for status 1 (Reported)
        initial_history = StatusHistory(
            report_id=db_report.report_id,
            report_status_id=db_report.current_status_id,
            updated_by=db_report.user_id,
            latitude=db_report.latitude,
            longitude=db_report.longitude,
            landmark=db_report.landmark,
            facility_id=db_report.facility_id,
            remarks="Initial report submitted by resident."
        )
        db.add(initial_history)
        
        # If pet_id is linked and the pet has a photo, automatically create ReportMedia so the lost pet's photo is visible in all report feeds
        if db_report.pet_id:
            linked_pet = db.query(Pet).filter(Pet.pet_id == db_report.pet_id).first()
            if linked_pet and linked_pet.photo_url:
                p_type = 'Unknown'
                if linked_pet.pet_type:
                    if linked_pet.pet_type.lower() == 'dog':
                        p_type = 'Dog'
                    elif linked_pet.pet_type.lower() == 'cat':
                        p_type = 'Cat'

                pet_media = ReportMedia(
                    report_id=db_report.report_id,
                    file_url=linked_pet.photo_url,
                    media_type='Image',
                    animal_type=p_type,
                    dominant_color=linked_pet.primary_color or 'Brown',
                    is_evidence=False
                )
                db.add(pet_media)

        db.commit()
        db.refresh(db_report)
        # Look-alike / duplicate scan can call Gemini several times: never block the submit on it
        ai_jobs.enqueue_follow_up(db_report.report_id)

        rep_data = ReportResponse.model_validate(db_report)
        rep_data.status_id = db_report.current_status_id  # type: ignore[assignment]
        rep_data.reporter_name = db_report.reporter.name if db_report.reporter else "Unknown User"
        rep_data.reporter_photo = db_report.reporter.profile_picture if db_report.reporter else None
        
        # Map AI suggestions explicitly
        rep_data.ai_animal_type = db_report.ai_animal_type  # type: ignore
        rep_data.ai_dominant_color = db_report.ai_dominant_color  # type: ignore
        rep_data.ai_estimated_size = db_report.ai_estimated_size  # type: ignore
        rep_data.ai_possible_breed = db_report.ai_possible_breed  # type: ignore
        rep_data.ai_suggested_risk_level = db_report.ai_suggested_risk_level  # type: ignore
        rep_data.ai_suggested_priority = db_report.ai_suggested_priority  # type: ignore
        rep_data.ai_suggested_priority_reason = db_report.ai_suggested_priority_reason  # type: ignore

        # Notify subdivision leader(s) about the new report
        if db_report.subdivision_id:
            try:
                leaders = db.query(User).filter(
                    User.subdivision_id == db_report.subdivision_id,
                    User.role_id == 2
                ).all()
                for leader in leaders:
                    if leader.user_id != db_report.user_id:
                        subd_notif = Notification(
                            user_id=leader.user_id,
                            title=f"New Stray Report #{db_report.report_id}",
                            message=f"A new {db_report.animal_type or 'stray'} report was submitted in your subdivision at {db_report.landmark or 'designated location'}.",
                            type="alert",
                            related_id=db_report.report_id
                        )
                        db.add(subd_notif)
            except Exception as notif_err:
                print(f"Notice: Failed to create leader notification: {notif_err}")

        log_activity(
            db=db,
            action="CREATE_REPORT",
            target_table="reports",
            target_id=db_report.report_id,
            description=f"New report submitted (report_id={db_report.report_id}): {db_report.animal_type}, priority={db_report.priority_level}",
            user_id=db_report.user_id,
            log_type="operation",
            new_values={"animal_type": str(db_report.animal_type), "priority_level": str(db_report.priority_level), "subdivision_id": db_report.subdivision_id},
            request=req
        )

        # Populate pet & owner contact info for lost pet reports
        populate_pet_and_owner_info(rep_data, db_report, db)
        populate_handler_info(rep_data, db_report)
        populate_verification_and_disputes(rep_data, db_report, db)
        populate_duplicate_and_merge_info(rep_data, db_report, db)
        populate_warning_info(rep_data, db_report, db)

        return rep_data
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


SIDEBAR_STATUS_IDS = {1, 4, 5, 13}



@router.get("/sidebar-ids")
def get_sidebar_report_ids(
    status_ids: str = "1",
    subdivision_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Report ids in the given statuses, for the sidebar badges. The browser removes the ones the officer already opened.
    One small query instead of downloading every report with its history and photos.
    """
    try:
        wanted = {int(x) for x in status_ids.split(",") if x.strip()}
    except ValueError:
        raise HTTPException(status_code=400, detail="status_ids must be comma-separated numbers.")
    wanted &= SIDEBAR_STATUS_IDS
    if not wanted:
        return {"report_ids": []}
    q = db.query(Report.report_id).filter(Report.current_status_id.in_(wanted))
    if current_user.role_id == 2:
        q = q.filter(Report.subdivision_id == current_user.subdivision_id)
    elif subdivision_id is not None:
        q = q.filter(Report.subdivision_id == subdivision_id)
    return {"report_ids": [rid for (rid,) in q.all()]}


class IdentityRecheckRequest(BaseModel):
    note: str


class SeparateIncidentRequest(BaseModel):
    reason: str


class IdentityDisputeRequest(BaseModel):
    reason: str


class IdentityDisputeDecision(BaseModel):
    decision: str  # "uphold" | "reverse"
    reason: str


def _media_urls(rep_obj) -> List[str]:
    return [m.file_url for m in (rep_obj.media or []) if m.file_url and (m.media_type in ("Image", "Video") or not m.media_type)]


def identity_dispute_info(db: Session, report: Report) -> Optional[dict]:
    """The report's latest 'this isn't my pet' dispute, with the evidence for the staff decision."""
    d = (db.query(ReportDispute).filter(ReportDispute.report_id == report.report_id, ReportDispute.dispute_type == "wrong_identity")
         .order_by(ReportDispute.dispute_id.desc()).first())
    if d is None:
        return None
    conf = db.get(ReportMatch, report.pet_inherited_from_match_id) if report.pet_inherited_from_match_id else None
    merged_rep = db.get(Report, d.merged_into_report_id) if d.merged_into_report_id else None
    if conf is None and merged_rep:
        conf = case_confirmed_match(db, case_members(db, merged_rep))
    original = db.get(Report, conf.source_report_id) if conf else merged_rep
    pet = db.get(Pet, d.contested_pet_id) if d.contested_pet_id else None
    merged_by = db.get(User, report.merged_by) if report.merged_by else None
    reviewer = db.get(User, d.reviewer_id) if d.reviewer_id else None
    confirmer = db.get(User, conf.reviewed_by) if conf and conf.reviewed_by else None
    return {
        "dispute_id": d.dispute_id,
        "status": d.status,
        "reason": d.dispute_reason,
        "filed_by_name": d.resident.name if d.resident else None,
        "filed_at": d.created_at,
        "case_report_id": d.merged_into_report_id,
        "pet_id": d.contested_pet_id,
        "pet_name": pet.display_name if pet else None,
        "pet_photos": [u for u in ([pet.photo_url, pet.photo_front_url, pet.photo_left_url, pet.photo_right_url] if pet else []) if u],
        "this_report_photos": _media_urls(report),
        "original_report_id": original.report_id if original else None,
        "original_report_photos": _media_urls(original) if original else [],
        "original_confirmation": None if conf is None else {
            "match_id": conf.match_id,
            "confirmed_by": confirmer.name if confirmer else None,
            "confirmed_at": conf.verified_at,
            "owner_confirmed": conf.owner_confirmation_status == "OWNER_CONFIRMED",
        },
        "merge": {"merged_at": report.merged_at, "merged_by_name": merged_by.name if merged_by else None, "notes": report.merge_notes},
        "decision_notes": d.reviewer_notes,
        "decided_by_name": reviewer.name if reviewer else None,
        "decided_at": d.resolved_at,
    }


@router.post("/{report_id}/identity-dispute")
def flag_incorrect_sighting(
    report_id: int,
    payload: IdentityDisputeRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The pet owner says a sighting merged into their pet's confirmed case is NOT their pet.
    The report stays merged (an owner never unmerges by themselves) and its inherited identity is suspended until
    the case handler decides. The original confirmation is untouched.
    """
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.duplicate_of_report_id or not report.pet_inherited_from_match_id or not report.pet_id:
        raise HTTPException(status_code=400, detail="Only a sighting added to your pet's case through a merge can be flagged here.")
    pet = db.get(Pet, report.pet_id)
    if not pet or pet.owner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the owner of the pet in this case can flag the sighting.")
    reason = (payload.reason or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Please explain why this isn't your pet (at least 10 characters).")
    existing = db.query(ReportDispute).filter(
        ReportDispute.report_id == report_id, ReportDispute.dispute_type == "wrong_identity", ReportDispute.status == "Pending").first()
    if existing:
        return {"message": "This sighting is already under review.", "dispute_id": existing.dispute_id, "already_open": True}

    root = case_root(db, report)
    d = ReportDispute(report_id=report_id, resident_user_id=current_user.user_id, pet_id=pet.pet_id, dispute_reason=reason,
                      status="Pending", dispute_type="wrong_identity", merged_into_report_id=root.report_id,
                      contested_pet_id=pet.pet_id)
    db.add(d)
    db.flush()
    db.add(StatusHistory(report_id=report_id, updated_by=current_user.user_id,
                         remarks=f"Identity Disputed – Under Review: the owner of {pet.display_name} says this sighting isn't "
                                 f"their pet. Reason: {reason}"))
    db.flush()
    db.refresh(report)
    refresh_pet_behavior(db, pet)  # a re-checked bite on this report stops counting while it's disputed
    handler_ids = {root.assigned_leader_id} if root.assigned_leader_id else {
        uid for (uid,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == report.subdivision_id).all()}
    for uid in handler_ids - {None, current_user.user_id}:
        db.add(Notification(user_id=uid, title=f"⚖️ Identity Disputed: Report #{report_id}", type="status_update", related_id=report_id,
                            message=f"{current_user.name} says the sighting in Report #{report_id} (merged into Case #{root.report_id}) "
                                    f"isn't {pet.display_name}. Review the dispute and uphold or reverse the merge. Reason: {reason[:300]}"))
    log_activity(db=db, action="DISPUTE_WRONG_IDENTITY_FILED", target_table="report_disputes", target_id=d.dispute_id,
                 description=f"Owner {current_user.name} disputed Report #{report_id} as {pet.display_name} (Case #{root.report_id}). {reason}",
                 user_id=current_user.user_id, log_type="operation", new_values={"status": "Pending", "reason": reason},
                 request=req, commit=False)
    db.commit()
    return {"message": "Thank you. Staff will review this sighting.", "dispute_id": d.dispute_id, "already_open": False}


@router.post("/{report_id}/identity-dispute/{dispute_id}/decide")
def decide_identity_dispute(
    report_id: int,
    dispute_id: int,
    payload: IdentityDisputeDecision,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Staff decision on an incorrect-sighting dispute: uphold the merge, or reverse it (unmerge). Reason required."""
    d = db.query(ReportDispute).filter(ReportDispute.dispute_id == dispute_id, ReportDispute.report_id == report_id,
                                       ReportDispute.dispute_type == "wrong_identity").first()
    if not d:
        raise HTTPException(status_code=404, detail="Dispute not found")
    report = db.query(Report).filter(Report.report_id == report_id).first()
    root = case_root(db, report)
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)
    require_leader_claim(root, current_user)
    if d.status != "Pending":
        raise HTTPException(status_code=409, detail=f"This dispute was already decided ({d.status}).")
    decision = (payload.decision or "").strip().lower()
    reason = (payload.reason or "").strip()
    if decision not in ("uphold", "reverse"):
        raise HTTPException(status_code=400, detail="Decision must be 'uphold' or 'reverse'.")
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Explain the decision and the evidence (at least 10 characters).")

    pet = db.get(Pet, d.contested_pet_id) if d.contested_pet_id else None
    pet_label = pet.display_name if pet else "the pet"
    d.reviewer_id, d.reviewer_notes, d.resolved_at = current_user.user_id, reason, datetime.now()

    if decision == "uphold":
        d.status = "Upheld"
        db.add(StatusHistory(report_id=report_id, updated_by=current_user.user_id,
                             remarks=f"Reviewed – Merge Upheld by {current_user.name}: Report #{report_id} is {pet_label}. "
                                     f"The owner's disagreement is kept on record. {reason}"))
        db.flush()
        if pet:
            db.refresh(report)
            refresh_pet_behavior(db, pet)
        db.add(Notification(user_id=d.resident_user_id, title=f"Sighting Review: Report #{report_id}", type="status_update",
                            related_id=report_id,
                            message=f"After review, Report #{report_id} remains in {pet_label}'s case. Staff explanation: "
                                    f"{reason[:400]}. No further action is required."))
        log_activity(db=db, action="DISPUTE_WRONG_IDENTITY_UPHELD", target_table="report_disputes", target_id=d.dispute_id,
                     description=f"{current_user.name} upheld the merge of Report #{report_id} into Case #{root.report_id}. {reason}",
                     user_id=current_user.user_id, log_type="operation",
                     old_values={"status": "Pending"}, new_values={"status": "Upheld", "reason": reason}, request=req, commit=False)
        db.commit()
        return {"message": "Merge upheld.", "status": "Upheld"}

    # reverse: the existing Unmerge does the correction (inherited identity removed, suggestions reopened, history kept)
    d.status = "Reversed"
    db.add(Notification(user_id=d.resident_user_id, title=f"Incorrect Sighting Removed: Report #{report_id}", type="status_update",
                        related_id=report_id,
                        message=f"Report #{report_id} has been removed from {pet_label}'s case following verification. "
                                f"{pet_label}'s original confirmed identity remains unchanged. No further action is required."))
    log_activity(db=db, action="DISPUTE_WRONG_IDENTITY_UNMERGED", target_table="report_disputes", target_id=d.dispute_id,
                 description=f"{current_user.name} reversed the merge of Report #{report_id} out of Case #{root.report_id}. {reason}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"status": "Pending", "case": root.report_id}, new_values={"status": "Reversed", "reason": reason},
                 request=req, commit=False)
    db.flush()
    unmerge_duplicate_report(report_id, ReportUnmergeRequest(reason=f"Owner dispute upheld: different animal. {reason}"),
                             req, db, current_user)
    return {"message": f"Report #{report_id} was removed from the case.", "status": "Reversed"}


@router.post("/{report_id}/recheck-identity")
def recheck_inherited_identity(
    report_id: int,
    payload: IdentityRecheckRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Staff confirm that THIS report really is the pet its case is confirmed as. Until then an inherited identity
    doesn't count toward the pet's bite/chase history, owner warnings or ownership proof at handover.
    """
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)
    require_leader_claim(case_root(db, report), current_user)
    note = (payload.note or "").strip()
    if len(note) < 10:
        raise HTTPException(status_code=400, detail="Describe what you checked (at least 10 characters).")
    if not report.pet_id or not report.pet_inherited_from_match_id:
        raise HTTPException(status_code=400, detail="Only an identity inherited from a merged case needs a re-check.")
    if db.query(ReportDispute.dispute_id).filter(ReportDispute.report_id == report_id, ReportDispute.dispute_type == "wrong_identity",
                                                 ReportDispute.status == "Pending").first():
        raise HTTPException(status_code=409, detail="The owner disputes this sighting. Decide the dispute instead of re-checking.")
    if report.identity_rechecked_at:
        return {"message": "Already re-checked.", "report_id": report_id}

    report.identity_rechecked_by = current_user.user_id
    report.identity_rechecked_at = datetime.now()
    report.identity_recheck_note = note
    pet = db.get(Pet, report.pet_id)
    label = pet.display_name if pet else "the registered pet"
    db.add(StatusHistory(report_id=report.report_id, updated_by=current_user.user_id,
                         remarks=f"Identity re-checked by {current_user.name}: this report is {label}. {note}"))
    db.flush()
    if pet:
        refresh_pet_behavior(db, pet)
    log_activity(db=db, action="RECHECK_INHERITED_IDENTITY", target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} re-checked Report #{report.report_id} as {label} (inherited from Match "
                             f"#{report.pet_inherited_from_match_id}). {note}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"identity_rechecked": False}, new_values={"identity_rechecked": True, "note": note},
                 request=req, commit=False)
    db.commit()
    return {"message": f"Identity re-checked: Report #{report.report_id} is {label}.", "report_id": report_id}


@router.post("/{report_id}/separate-incident")
def mark_separate_incident(
    report_id: int,
    payload: SeparateIncidentRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Staff override: the pet is confirmed in another active case, but this report is a genuinely separate incident.
    The report then follows the normal look-alike flow as its own case (staff confirm, then the owner is asked).
    A reason is required and the override is logged. Nothing is confirmed by it.
    """
    from app.models.report_match import ReportMatch
    from app.utils.case_groups import PENDING_MATCH_STATUSES, active_case_for_pet

    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)
    require_leader_claim(case_root(db, report), current_user)
    if report.duplicate_of_report_id:
        raise HTTPException(status_code=400, detail=f"This report is part of Case #{report.duplicate_of_report_id}. Unmerge it first.")
    reason = (payload.reason or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Explain why this is a separate incident (at least 10 characters).")
    if report.separate_incident_reason:
        raise HTTPException(status_code=409, detail="This report is already marked as a separate incident.")

    pending = db.query(ReportMatch).filter(ReportMatch.source_report_id == report_id, ReportMatch.matched_pet_id.isnot(None),
                                           ReportMatch.status.in_(PENDING_MATCH_STATUSES)).all()
    locked = [(m, active_case_for_pet(db, m.matched_pet_id, exclude_report=report)) for m in pending]
    locked = [(m, a) for m, a in locked if a is not None]
    if not locked:
        raise HTTPException(status_code=400, detail="No pet on this report is confirmed in another active case; nothing to override.")

    now = datetime.now()
    report.separate_incident_reason = reason
    report.separate_incident_by = current_user.user_id
    report.separate_incident_at = now
    cases = sorted({a["root"].report_id for _, a in locked})
    case_txt = ", ".join(f"#{c}" for c in cases)
    db.add(StatusHistory(report_id=report.report_id, updated_by=current_user.user_id,
                         remarks=f"Marked as a separate incident (not part of Case {case_txt}) by {current_user.name}. {reason}"))
    # The "same animal as Case #N" duplicate suggestion is answered by this decision
    for c in cases:
        pair = db.query(ReportMatch).filter(
            ReportMatch.status.in_(PENDING_MATCH_STATUSES),
            or_(and_(ReportMatch.source_report_id == report_id, ReportMatch.matched_report_id == c),
                and_(ReportMatch.source_report_id == c, ReportMatch.matched_report_id == report_id))).first()
        if pair is not None:
            pair.status = "NOT_A_MATCH"
            pair.reviewed_by = current_user.user_id
            pair.verified_at = now
            pair.verification_notes = f"Separate incident, not part of Case #{c}: {reason}"
    # Normal flow from here: the owner gets the usual look-alike notice (once) for each suggestion
    for m, _ in locked:
        pet = db.get(Pet, m.matched_pet_id)
        if pet and pet.owner_id and pet.owner_id != report.user_id:
            title = f"🔍 Look-Alike Pet Sighting Detected (Report #{report.report_id})"
            if not db.query(Notification.notification_id).filter(
                    Notification.user_id == pet.owner_id, Notification.related_id == report.report_id,
                    Notification.title == title).first():
                db.add(Notification(
                    user_id=pet.owner_id, title=title, type="potential_match", related_id=report.report_id,
                    message=(f"AI identified a {m.similarity_score}% look-alike match for your registered pet '{pet.display_name}' "
                             f"in Report #{report.report_id}. Please review the sighting and confirm whether it is your pet. "
                             f"It will only be added to your pet's record after both you and a reviewing official confirm it."),
                ))
    log_activity(db=db, action="OVERRIDE_SEPARATE_INCIDENT", target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} marked Report #{report.report_id} as a separate incident, not part of "
                             f"Case {case_txt}. {reason}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"separate_incident": False}, new_values={"separate_incident": True, "cases": cases, "reason": reason},
                 request=req, commit=False)
    db.commit()
    return {"message": f"Report #{report.report_id} is now its own case. Review its look-alike suggestion as usual.",
            "report_id": report_id, "cases": cases}


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).options(
        joinedload(Report.reporter),
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        joinedload(Report.facility),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if report.endorsement_letter:
        let = report.endorsement_letter
        if let.leader:
            let.leader_name = let.leader.name
            if let.leader.position:
                let.leader_position = let.leader.position.position_name

    try:
        # Missing AI suggestions are filled in by a background job: opening a report never waits for Gemini
        if report.ai_suggested_risk_level is None:
            ai_jobs.enqueue_backfill(report.report_id, ai_pipeline.media_hint(report))

        rep_data = ReportResponse.model_validate(report)
        rep_data.status_id = report.current_status_id  # type: ignore[assignment]
        rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
        rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

        # Real jurisdiction for document letterheads (barangays.city is stored as "City, Province")
        subd = report.subdivision
        brgy = db.query(Barangay).filter(Barangay.barangay_id == subd.barangay_id).first() if subd else None
        city_parts = [p.strip() for p in (brgy.city or "").split(",") if p.strip()] if brgy else []
        rep_data.subdivision_name = subd.subdivision_name if subd else None
        rep_data.barangay_name = brgy.barangay_name if brgy else None
        rep_data.municipality_city = city_parts[0] if city_parts else None
        rep_data.province = city_parts[1] if len(city_parts) > 1 else None

        rep_data.ai_animal_type = report.ai_animal_type  # type: ignore
        rep_data.ai_dominant_color = report.ai_dominant_color  # type: ignore
        rep_data.ai_estimated_size = report.ai_estimated_size  # type: ignore
        rep_data.ai_possible_breed = report.ai_possible_breed  # type: ignore
        rep_data.ai_suggested_risk_level = report.ai_suggested_risk_level  # type: ignore
        rep_data.ai_suggested_priority = report.ai_suggested_priority  # type: ignore
        rep_data.ai_photo_likelihood = float(report.ai_photo_likelihood) if report.ai_photo_likelihood is not None else None
        rep_data.ai_photo_status = report.ai_photo_status
        rep_data.ai_photo_recommendation = report.ai_photo_recommendation
        rep_data.ai_photo_details = report.ai_photo_details

        case_claims = case_pet_claims(db, case_members(db, case_root(db, report)))
        if report.pet_id:
            rep_data.case_pet_id, rep_data.case_pet_report_id = report.pet_id, report.report_id
        elif case_claims:
            rep_data.case_pet_id, rep_data.case_pet_report_id = next(iter(case_claims.items()))
        rep_data.pet_link_trusted = pet_link_trusted(report) if report.pet_id else None
        rep_data.identity_dispute = identity_dispute_info(db, report)
        if report.pet_inherited_from_match_id:
            src_match = db.get(ReportMatch, report.pet_inherited_from_match_id)
            rep_data.pet_inherited_from_report_id = src_match.source_report_id if src_match else None
            if report.identity_rechecked_by:
                checker = db.get(User, report.identity_rechecked_by)
                rep_data.identity_rechecked_by_name = checker.name if checker else None
        if rep_data.case_pet_id:
            case_pet = db.get(Pet, rep_data.case_pet_id)
            if case_pet:
                rep_data.case_pet_name = case_pet.display_name
                rep_data.case_pet_photo = case_pet.photo_url or case_pet.photo_front_url
                rep_data.case_pet_description = case_pet.description_line

        if report.history:
            for i, hist in enumerate(report.history):  # type: ignore[arg-type]
                if rep_data.history and i < len(rep_data.history):
                    rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                    rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

        # Synchronize and unify history for merged cases so primary and duplicate reports share the same rescue timeline
        unified_history = list(rep_data.history or [])
        seen_hist_keys = set((h.created_at, h.remarks) for h in unified_history)

        def add_hist_entry(h_obj, r_ctx):
            key = (h_obj.created_at, h_obj.remarks)
            if key not in seen_hist_keys:
                seen_hist_keys.add(key)
                media_list = []
                if hasattr(h_obj, 'media') and h_obj.media:
                    for m in h_obj.media:
                        media_list.append(ReportMediaResponse.model_validate(m))
                unified_history.append(StatusHistoryResponse(
                    history_id=h_obj.history_id,
                    report_status_id=h_obj.report_status_id,
                    rescue_status_id=getattr(h_obj, 'rescue_status_id', None),
                    latitude=h_obj.latitude,
                    longitude=h_obj.longitude,
                    landmark=h_obj.landmark,
                    facility_id=h_obj.facility_id,
                    facility_name=getattr(h_obj, 'facility_name', None),
                    remarks=h_obj.remarks,
                    created_at=h_obj.created_at,
                    updater_name=get_hist_updater_name(h_obj, r_ctx),
                    updater_photo=h_obj.updater.profile_picture if getattr(h_obj, 'updater', None) else None,
                    media=media_list
                ))

        # Case A: If this report is a duplicate of a parent report, merge parent's history
        if report.duplicate_of_report_id:
            parent_rep = db.query(Report).options(
                joinedload(Report.assigned_leader),
                joinedload(Report.reporter),
                selectinload(Report.history).joinedload(StatusHistory.updater),
                selectinload(Report.history).selectinload(StatusHistory.media)
            ).filter(Report.report_id == report.duplicate_of_report_id).first()
            if parent_rep and parent_rep.history:
                for p_h in parent_rep.history:
                    add_hist_entry(p_h, parent_rep)

        # Case B: If this report is a primary report with merged children, merge child reports' histories
        children_reps = []
        if getattr(report, 'merged_reports', None):
            children_reps = report.merged_reports
        elif not report.duplicate_of_report_id:
            children_reps = db.query(Report).options(
                joinedload(Report.reporter),
                selectinload(Report.history).joinedload(StatusHistory.updater),
                selectinload(Report.history).selectinload(StatusHistory.media)
            ).filter(Report.duplicate_of_report_id == report.report_id).all()

        for c_rep in children_reps:
            if hasattr(c_rep, 'history') and c_rep.history:
                for c_h in c_rep.history:
                    add_hist_entry(c_h, c_rep)

        unified_history.sort(key=lambda h: h.created_at or datetime.min)
        rep_data.history = unified_history

        if report.comments:
            for i, comment in enumerate(report.comments):  # type: ignore[arg-type]
                if rep_data.comments and i < len(rep_data.comments):
                    rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                    rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None

        # Populate pet & owner contact info for lost pet reports
        populate_pet_and_owner_info(rep_data, report, db)
        populate_handler_info(rep_data, report)
        populate_verification_and_disputes(rep_data, report, db)
        populate_location_and_facility_info(rep_data, report, db)
        populate_duplicate_and_merge_info(rep_data, report, db)
        populate_warning_info(rep_data, report, db)

        return redact_owner_contact(rep_data, current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error fetching report: {str(e)}")


@router.delete("/{report_id}")
def delete_report(
    report_id: int, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    if current_user.role_id not in [3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only Barangay Staff or System Administrators can delete reports."
        )
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    report_snapshot = {"report_id": report.report_id, "animal_type": str(report.animal_type), "status_id": report.current_status_id}
    
    try:
        # 1. Clean up report matches (both source and matched targets)
        db.query(ReportMatch).filter(
            (ReportMatch.source_report_id == report_id) | (ReportMatch.matched_report_id == report_id)
        ).delete(synchronize_session=False)

        # 2. Clean up pet claims
        db.query(PetClaim).filter(PetClaim.report_id == report_id).delete(synchronize_session=False)

        # 3. Clean up holding animals admitted from this report
        db.query(HoldingAnimal).filter(HoldingAnimal.report_id == report_id).delete(synchronize_session=False)

        # 4. Nullify warnings referencing this report
        db.query(OwnerWarning).filter(OwnerWarning.report_id == report_id).update({"report_id": None}, synchronize_session=False)

        # 5. Clean up chat threads for this report
        chat_threads = db.query(ChatThread).filter((ChatThread.thread_type == "Report") & (ChatThread.related_id == report_id)).all()
        for ct in chat_threads:
            db.delete(ct)

        db.delete(report)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete report: {str(e)}")

    log_activity(
        db=db,
        action="DELETE_REPORT",
        target_table="reports",
        target_id=report_id,
        description=f"Deleted report #{report_id}",
        log_type="operation",
        old_values=report_snapshot,
        request=req
    )
    return {"message": "Report deleted successfully"}

@router.patch("/{report_id}/cancel")
def cancel_report_by_citizen(
    report_id: int, 
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this report")
    
    # Status 14 is False Alarm / Dismissed, we can use it as cancelled.
    old_status = report.current_status_id
    report.current_status_id = 14
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to cancel report: {str(e)}")

    log_activity(
        db=db,
        action="CANCEL_REPORT",
        target_table="reports",
        target_id=report_id,
        description=f"Reporter cancelled report #{report_id}",
        log_type="operation",
        old_values={"status_id": old_status},
        new_values={"status_id": 14},
        request=req
    )
    return {"message": "Report cancelled successfully"}

@router.post("/{report_id}/confirm-reunited")
def confirm_reunited_by_citizen(
    report_id: int,
    payload: ReportSelfReunitedRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Allows a citizen (reporter or verified pet owner) to confirm that the animal
    reported is safe and back in their custody (self-retrieved / direct recovery).
    Automatically closes the case as 'Claimed by Owner' (Status 9) and stores reunion proof.
    """
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    is_reporter = (report.user_id == current_user.user_id)
    is_owner = False
    if report.pet_id:
        pet = db.query(Pet).filter(Pet.pet_id == report.pet_id).first()
        if pet and pet.owner_id == current_user.user_id:
            is_owner = True
    is_staff = current_user.role_id in (2, 3, 4)

    if not (is_reporter or is_owner or is_staff):
        raise HTTPException(status_code=403, detail="Not authorized to confirm reunion for this report.")

    if report.current_status_id in (3, 8, 9, 10, 11, 12, 14, 17, 18):
        raise HTTPException(status_code=400, detail="This report is already resolved or closed.")

    if report.facility_id is not None:
        raise HTTPException(
            status_code=400,
            detail="This animal is currently admitted to a holding facility. Please coordinate with facility officers to complete physical handover."
        )

    old_status = report.current_status_id
    reunion_note = (payload.notes or "").strip()
    photo_url = None
    if payload.reunion_media_id:
        photo_url = _report_media_url(db, report_id, payload.reunion_media_id)

    snap = {
        "has_account": True,
        "owner_user_id": current_user.user_id,
        "owner_name": current_user.name,
        "owner_phone": current_user.phone,
        "owner_email": current_user.email,
        "owner_address": current_user.address,
        "relationship_to_animal": "Owner",
        "return_method": "self_retrieved",
        "id_presented": "Self-Retrieved / Verified StraySafe Resident Account",
        "id_type": None,
        "id_last4": None,
        "ownership_verified_by_record": is_owner or is_reporter,
        "handover_photo_url": photo_url,
        "ownership_proof_urls": None,
        "notes": f"Self-reported reunion by resident {current_user.name}: {reunion_note}" if reunion_note else f"Self-reported reunion by resident {current_user.name}.",
    }

    record_owner_return(db, report, snap, actor=current_user)
    report.current_status_id = 9
    report.custody_status = "Reunited with Owner"

    hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=9,
        remarks=f"Resident {current_user.name} confirmed animal safely recovered: {reunion_note or 'Animal is safe at home.'}",
        user_id=current_user.user_id,
    )
    db.add(hist)

    # Clean up unreviewed AI look-alike / duplicate suggestions for this report
    db.query(ReportMatch).filter(
        ReportMatch.matched_report_id.isnot(None),
        ReportMatch.matched_pet_id.is_(None),
        ReportMatch.status == "AI_SUGGESTED",
        or_(
            ReportMatch.source_report_id == report_id,
            ReportMatch.matched_report_id == report_id
        )
    ).delete(synchronize_session=False)

    # Notify leaders of the subdivision
    if report.subdivision_id:
        leaders = db.query(User).filter(
            User.subdivision_id == report.subdivision_id,
            User.role_id == 2
        ).all()
        for leader in leaders:
            if leader.user_id != current_user.user_id:
                db.add(Notification(
                    user_id=leader.user_id,
                    title="🐾 Animal Recovered by Resident",
                    message=f"Resident {current_user.name} reported that the animal for Report #{report.report_id} has been safely recovered and is home.",
                    type="status_update",
                    related_id=report.report_id
                ))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to confirm pet recovery: {str(e)}")

    log_activity(
        db=db,
        action="CONFIRM_REUNITED",
        target_table="reports",
        target_id=report_id,
        description=f"Resident confirmed animal reunited for report #{report_id}",
        log_type="operation",
        old_values={"status_id": old_status},
        new_values={"status_id": 9},
        request=req
    )
    return {"message": "Pet recovery confirmed successfully. Report has been updated to Claimed by Owner."}

def require_leader_claim(report: Report, user: User) -> None:
    """
    Subdivision Leaders may only work on a report they have CLAIMED (assigned_leader_id == them).
    An unclaimed report, or one handled by another officer, is read-only until claimed / taken over.
    """
    if user.role_id != 2:
        return
    if report.assigned_leader_id is None:
        raise HTTPException(status_code=403, detail="Claim this report first. An unclaimed case cannot be updated.")
    if report.assigned_leader_id != user.user_id:
        raise HTTPException(status_code=403, detail="This report is being handled by another officer. Only the assigned case officer can update it.")


def require_barangay_approval(report: Report, user: User, new_status_id: Optional[int] = None) -> None:
    """
    Barangay Staff may not operate on an escalated report until it is approved (status 13).
    While it is 'Escalated to Barangay' (4) the only permitted decisions are Approve (13) or Reject (3).
    """
    if user.role_id != 3 or report.current_status_id != 4:
        return
    if new_status_id in (13, 3):
        return
    raise HTTPException(status_code=403, detail="Approve this rescue request first. An escalated case cannot be operated on until it is approved.")


# Fields a reporter may correct on their own report while it is still awaiting verification.
RESIDENT_EDITABLE_REPORT_FIELDS = {
    "category_id", "animal_type", "animal_breed", "animal_color", "estimated_size", "description",
    "latitude", "longitude", "animal_count", "landmark", "visibility", "priority_level",
    "is_possible_owned", "custody_status",
}


@router.patch("/{report_id}", response_model=ReportResponse)
def update_report(
    report_id: int, 
    report_update: ReportUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Staff/Admin: update a report within their scope.
    Resident: edit ONLY their own report, ONLY while it is still 'Reported' (status 1, unverified),
    and only descriptive fields (never status, owner, subdivision or pet link).
    """
    db_report = db.query(Report).options(joinedload(Report.assigned_leader)).filter(Report.report_id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")

    update_data = report_update.model_dump(exclude_unset=True)

    if current_user.role_id == 1:
        if db_report.user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="You can only edit your own reports.")
        if db_report.current_status_id != 1:
            raise HTTPException(status_code=409, detail="This report is already being handled and can no longer be edited.")
        update_data = {k: v for k, v in update_data.items() if k in RESIDENT_EDITABLE_REPORT_FIELDS}
    elif current_user.role_id in (2, 3, 4):
        verify_subdivision_scope(current_user, db_report.subdivision_id, db=db)
    else:
        raise HTTPException(status_code=403, detail="Not authorized to edit this report.")

    # Map frontend "status_id" → DB "current_status_id" if present
    if "status_id" in update_data:
        update_data["current_status_id"] = update_data.pop("status_id")

    for key, value in update_data.items():
        if hasattr(db_report, key):
            setattr(db_report, key, value)

    db.commit()
    db.refresh(db_report)

    rep_data = ReportResponse.model_validate(db_report)
    rep_data.status_id = db_report.current_status_id  # type: ignore[assignment]
    rep_data.reporter_name = db_report.reporter.name if db_report.reporter else "Unknown User"

    # Populate pet & owner contact info for lost pet reports
    populate_pet_and_owner_info(rep_data, db_report, db)
    populate_handler_info(rep_data, db_report)

    return rep_data


def process_report_media_ai(report_id: int, media_id: int, file_url: str, file_content: Optional[bytes] = None,
                            cached: Optional[dict] = None):
    """
    Background worker that executes YOLOv8 detection, color extraction,
    Gemini suggestions, and triggers looks-matching without blocking the HTTP response.
    """
    db = SessionLocal()
    hint = None
    try:
        report = db.query(Report).filter(Report.report_id == report_id).first()
        db_media = db.query(ReportMedia).filter(ReportMedia.media_id == media_id).first()
        if not report or not db_media:
            return

        if not file_content:
            try:
                import urllib.request
                req = urllib.request.Request(file_url, headers={'User-Agent': 'Straysafe/2.0'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    file_content = resp.read()
            except Exception as dl_err:
                print(f"Failed to fetch media for AI processing: {dl_err}")
                return

        if not file_content:
            return

        ext = os.path.splitext(file_url.split('?')[0])[1].lower() or ".jpg"
        from app.utils.video_processing import is_video_content, extract_sample_frames, analyze_video_frames
        is_video = is_video_content(file_url, file_bytes=file_content)

        detected = set()
        bboxes = []
        confs = []  # YOLO box confidences of the dog/cat detections used for this file
        img_is_placeholder = False
        model = get_yolo_model()

        if is_video:
            frames = extract_sample_frames(file_content, max_samples=8)
            if frames:
                best_frame, detected_labels, detected_boxes, _ = analyze_video_frames(frames, model, conf_out=confs)
                img = best_frame if best_frame is not None else frames[0]
                for l in detected_labels:
                    detected.add(l.capitalize())
                for b, l in zip(detected_boxes, detected_labels):
                    bboxes.append((b, l.capitalize()))
            else:
                img = Image.new('RGB', (300, 300), color='gray')
                img_is_placeholder = True
        else:
            try:
                img = Image.open(io.BytesIO(file_content)).convert("RGB")
            except Exception:
                frames = extract_sample_frames(file_content, max_samples=8)
                if frames:
                    is_video = True
                    best_frame, detected_labels, detected_boxes, _ = analyze_video_frames(frames, model, conf_out=confs)
                    img = best_frame if best_frame is not None else frames[0]
                    for l in detected_labels:
                        detected.add(l.capitalize())
                    for b, l in zip(detected_boxes, detected_labels):
                        bboxes.append((b, l.capitalize()))
                else:
                    return

            # The form's analysis of this exact file (passed in by the AI job), or this process's own cache
            if cached is None:
                cached = ai_pipeline.cached_analysis(file_content)
            cached = cached if not is_video else {}
            if not is_video and "yolo" in cached:
                for label, box in zip(*cached["yolo"]):
                    detected.add(label)
                    bboxes.append((box, label))
                confs.extend(cached.get("yolo_conf") or [])
            elif not is_video:
                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_img:
                    tmp_img.write(file_content)
                    tmp_img_path = tmp_img.name
                try:
                    results = model(tmp_img_path)
                    for r in results:
                        for c, box, conf in zip(r.boxes.cls, r.boxes.xyxy, r.boxes.conf):
                            label = r.names[int(c)]
                            bbox = box.tolist()  # [x1, y1, x2, y2]
                            if label.lower() in ['dog', 'cat']:
                                detected.add(label.capitalize())
                                bboxes.append((bbox, label.capitalize()))
                                confs.append(float(conf))
                finally:
                    if os.path.exists(tmp_img_path):
                        os.unlink(tmp_img_path)

        img_width, img_height = img.size
        image_area = img_width * img_height

        img_buffer = io.BytesIO()
        img.save(img_buffer, format='JPEG')
        active_image_bytes = img_buffer.getvalue()

        user_selected = (report.animal_type or "").capitalize()
        if user_selected in ['Dog', 'Cat']:
            animal_type = user_selected
        elif 'Cat' in detected:
            animal_type = 'Cat'
        elif 'Dog' in detected:
            animal_type = 'Dog'
        else:
            animal_type = 'Unknown'

        dominant_color = 'Unknown'
        visual_size = 'Unknown'

        if animal_type != 'Unknown':
            target_bbox = next((b for b, t in bboxes if t == animal_type), None)
            if target_bbox:
                dominant_color = extract_dominant_colors(active_image_bytes, target_bbox)
                x1, y1, x2, y2 = target_bbox
                bbox_width = x2 - x1
                bbox_height = y2 - y1
                ratio = (bbox_width * bbox_height) / max(1, image_area)
                if animal_type == 'Cat':
                    visual_size = 'Small'
                else:
                    if ratio < 0.20:
                        visual_size = 'Small'
                    elif ratio <= 0.55:
                        visual_size = 'Medium'
                    else:
                        visual_size = 'Large'
            else:
                dominant_color = extract_dominant_colors(active_image_bytes)
                visual_size = 'Medium'

            if animal_type == 'Dog' and dominant_color and dominant_color != 'Unknown':
                mapped = []
                for c in dominant_color.split(','):
                    c_clean = c.strip()
                    if c_clean.lower() in ['orange', 'ginger']:
                        mapped.append('Brown')
                    else:
                        mapped.append(c_clean)
                seen = set()
                dominant_color = ", ".join([x for x in mapped if not (x in seen or seen.add(x))])

        db_media.animal_type = animal_type
        db_media.dominant_color = dominant_color
        # YOLO's confidence in the animal it found (None = nothing found / not measured, never 0 or 100%)
        best_conf = round(max(confs), 3) if confs and not img_is_placeholder else None
        db_media.ai_detection_confidence = best_conf
        if best_conf is not None and (report.ai_detection_confidence is None or best_conf > float(report.ai_detection_confidence)):
            report.ai_detection_confidence = best_conf

        # Server-side photo authenticity check: the browser's verdict is never trusted
        if not img_is_placeholder:
            try:
                from app.utils.photo_checks import check_animal_photo, classify_ai_confidence
                reuse = (cached or {}).get("photo_check") if not is_video else None
                chk = reuse or check_animal_photo(img)
                if chk is not None:
                    db_media.ai_photo_likelihood = chk["ai_photo_likelihood"]
                    db_media.ai_photo_status = chk["label"]
                    # The report shows its most suspicious photo
                    if report.ai_photo_likelihood is None or float(report.ai_photo_likelihood) <= chk["ai_photo_likelihood"] or chk["verification_status"] == "ineligible_subject":
                        report.ai_photo_likelihood = chk["ai_photo_likelihood"]
                        report.ai_photo_status = chk["label"]
                        report.ai_photo_details = chk["details"] or None
                else:
                    _, not_checked = classify_ai_confidence(None)
                    db_media.ai_photo_likelihood = None
                    db_media.ai_photo_status = not_checked
                    if report.ai_photo_status is None:
                        report.ai_photo_status = not_checked
            except Exception as chk_err:
                print(f"Server photo check failed for media #{media_id}: {chk_err}")

        # Gemini suggestions and the matching scan run once for the whole report, after its last photo
        hint = {"animal_type": animal_type, "dominant_color": dominant_color, "visual_size": visual_size}
        db.commit()

    except Exception as bg_err:
        db.rollback()
        print(f"Error in process_report_media_ai: {bg_err}")
    finally:
        db.close()
        try:
            ai_jobs.enqueue_follow_up(report_id, hint)
        except Exception as q_err:
            print(f"Could not queue the AI follow-up for report #{report_id}: {q_err}")


@router.post("/{report_id}/media", response_model=ReportMediaResponse)
async def upload_report_media(
    report_id: int,
    file: Optional[UploadFile] = File(None),
    file_url: Optional[str] = Form(None),
    media_type: Optional[str] = Form(None),
    history_id: Optional[int] = Form(None),
    status_id: Optional[int] = Form(None),
    is_evidence: Optional[bool] = Form(False),
    ai_photo_likelihood: Optional[float] = Form(None),
    ai_photo_status: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    # Only the reporter (own report) or staff/admin within their scope may attach media.
    if current_user.role_id == 1:
        if report.user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="You can only add photos to your own reports.")
    elif current_user.role_id in (2, 3, 4):
        verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    else:
        raise HTTPException(status_code=403, detail="Not authorized.")

    if not file and not file_url:
        raise HTTPException(status_code=400, detail="Either file or file_url must be provided.")

    resolved_url = None
    resolved_media_type = 'Image'
    file_bytes = None

    try:
        if file_url:
            detected_type, _ = validate_cloudinary_url(file_url)
            resolved_media_type = media_type or detected_type
            resolved_url = file_url
        elif file:
            file_bytes, unique_filename, resolved_media_type, _ = await read_and_validate_upload(file)
            resolved_url = await run_in_threadpool(upload_to_cloudinary, file_bytes, filename=unique_filename)
            if not resolved_url:
                raise HTTPException(status_code=500, detail="Cloudinary returned an empty URL")

        if not resolved_url:
            raise HTTPException(status_code=400, detail="Could not resolve media URL.")

        final_likelihood = ai_photo_likelihood if ai_photo_likelihood is not None else report.ai_photo_likelihood
        final_status = ai_photo_status if ai_photo_status is not None else report.ai_photo_status

        db_media = ReportMedia(
            report_id=report_id,
            history_id=history_id,
            status_id=status_id,
            is_evidence=is_evidence,
            file_url=resolved_url,
            media_type=resolved_media_type,
            animal_type='Unknown',
            dominant_color='Unknown',
            ai_photo_likelihood=final_likelihood,
            ai_photo_status=final_status
        )
        # A staff photo sent with a status update belongs to that update's timeline entry: attach it explicitly
        # (photos are uploaded right after the status is saved, so the entry is the newest one with that status).
        if is_evidence and history_id is None and status_id is not None and resolved_media_type in ('Image', 'Video'):
            owning_entry = db.query(StatusHistory).filter(
                StatusHistory.report_id == report_id,
                StatusHistory.report_status_id == status_id,
            ).order_by(StatusHistory.history_id.desc()).first()
            if owning_entry is not None:
                db_media.history_id = owning_entry.history_id

        db.add(db_media)
        db.commit()
        db.refresh(db_media)

        # Offload AI inference and looks matching to background tasks
        if resolved_media_type in ['Image', 'Video'] and not is_evidence:
            # Queued for the AI worker; the form's analysis of this exact file goes along so it isn't repeated
            cached = ai_pipeline.cached_analysis(file_bytes) if file_bytes else {}
            await run_in_threadpool(ai_jobs.enqueue_media, db, report_id, db_media.media_id, resolved_url, file_bytes, cached)

        return db_media
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error in upload_report_media: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Media upload failed: {str(e)}")


@router.put("/{report_id}/status", response_model=ReportResponse)
@router.patch("/{report_id}/status", response_model=ReportResponse)
def update_report_status(
    report_id: int, 
    status_update: ReportStatusUpdate, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.facility),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(current_user, report.subdivision_id, db=db)

    require_barangay_approval(report, current_user, status_update.status_id)
    if current_user.role_id == 2:
        require_leader_claim(report, current_user)

    # Rejecting always needs a stated reason (any role)
    if status_update.status_id == 3 and len((status_update.remarks or status_update.status_remarks or "").strip()) < 5:
        raise HTTPException(status_code=400, detail="A reason (at least 5 characters) is required to reject a report.")

    # Determine acting updater: current authenticated user (admin may override if specified)
    updater = current_user
    if current_user.role_id == 4 and status_update.user_id:
        target_u = db.query(User).filter(User.user_id == status_update.user_id).first()
        if target_u:
            updater = target_u
    else:
        status_update.user_id = current_user.user_id

    # Check permission for Barangay Staff: only assigned personnel or Head Officer can update status
    if updater and updater.role_id == 3:
        is_head = getattr(updater, 'is_head_officer', False)
        if not is_head:
            rescues = db.query(Rescue).filter(Rescue.report_id == report_id).all()
            is_assigned = False
            for r in rescues:
                if r.staff_id == updater.user_id or r.leader_id == updater.user_id:
                    is_assigned = True
                    break
                asgn = db.query(RescueAssignment).filter(
                    RescueAssignment.rescue_id == r.rescue_id,
                    (RescueAssignment.user_id == updater.user_id) | (RescueAssignment.staff_id == updater.user_id),
                    RescueAssignment.assignment_status == "Assigned"
                ).first()
                if asgn:
                    is_assigned = True
                    break
            if not is_assigned:
                raise HTTPException(
                    status_code=403,
                    detail="Only personnel assigned to this report have the ability to update its status."
                )
    elif updater and updater.role_id == 2:
            rescue_record = db.query(Rescue).filter(Rescue.report_id == report_id).first()
            is_already_escalated = (
                report.endorsement_letter is not None or
                rescue_record is not None or
                report.current_status_id in [4, 5, 6, 13]
            )
            if status_update.status_id == 3:
                # Rejecting is only for reports not yet escalated and not claimed by another leader
                if report.current_status_id not in [1, 2, 15, 16]:
                    raise HTTPException(
                        status_code=400,
                        detail="Only reports that have not been escalated or closed can be rejected."
                    )
                if report.assigned_leader_id and report.assigned_leader_id != updater.user_id:
                    raise HTTPException(
                        status_code=403,
                        detail="This report is being handled by another officer and can only be rejected by them."
                    )
            if is_already_escalated and status_update.status_id != 4:
                raise HTTPException(
                    status_code=403,
                    detail="This animal case has been escalated to the Barangay and can no longer be updated by Subdivision Leaders. You can only track its progress."
                )

    # Returned to Owner / Reunited: the owner is either a StraySafe account or entered manually (never auto-created)
    owner_return_snap = None
    if status_update.status_id == 9:
        if status_update.owner_return is None:
            existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == report.report_id).first()
            if not existing_ret and report.duplicate_of_report_id:
                existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == report.duplicate_of_report_id).first()
            if not existing_ret:
                owner_return_snap = validate_owner_return(status_update.owner_return, current_user, db, report)
        else:
            owner_return_snap = validate_owner_return(status_update.owner_return, current_user, db, report)

    # If a pet_id was associated during resolution, attach it to report
    if getattr(status_update, 'pet_id', None):
        require_case_pet(db, report, status_update.pet_id)
        if status_update.pet_id != report.pet_id:
            status_pet = db.get(Pet, status_update.pet_id)
            if not status_pet:
                raise HTTPException(status_code=404, detail="Pet not found")
            require_direct_pet_link(db, report, status_pet, current_user)
        report.pet_id = status_update.pet_id

    # Mandatory Rule: a report can't be escalated or resolved until the animal is in Pet Records or Holding records.
    # (Rejected, False Alarm, Cannot Be Found, Deceased and Duplicate stay allowed: there may be no animal to record.)
    if status_update.status_id == ESCALATED_STATUS and report.current_status_id != ESCALATED_STATUS:
        require_animal_record(report, db, "escalated to the Barangay")
    if status_update.status_id in RESOLVED_WITH_ANIMAL_STATUSES:
        require_animal_record(report, db, "resolved")


    prev_status_id = report.current_status_id

    # Preserve initial location if not already recorded
    if report.initial_latitude is None:
        report.initial_latitude = report.latitude
        report.initial_longitude = report.longitude
        report.initial_landmark = report.landmark

    # Handle facility relocation or location update
    relocation_note = None
    target_facility_id = status_update.facility_id
    if not target_facility_id and status_update.status_id in (7, 8):
        # Auto-detect subdivision or barangay holding facility only for status 7/8
        default_fac = None
        if report.subdivision_id:
            default_fac = db.query(Landmark).filter(
                Landmark.subdivision_id == report.subdivision_id,
                Landmark.is_holding_facility == True
            ).first()
        if not default_fac:
            default_fac = db.query(Landmark).filter(Landmark.is_holding_facility == True).first()
        if default_fac:
            target_facility_id = default_fac.landmark_id

    if target_facility_id and status_update.status_id in (7, 8):
        fac = db.query(Landmark).filter(Landmark.landmark_id == target_facility_id).first()
        if fac:
            report.facility_id = fac.landmark_id
            report.latitude = fac.latitude
            report.longitude = fac.longitude
            report.landmark = fac.name
            report.custody_status = status_update.custody_status or "Secured in Facility"
            caretaker_str = f" • Caretaker: {fac.contact_person} ({fac.contact_number})" if fac.contact_person else ""
            prev_str = report.initial_landmark or "Original found location"
            relocation_note = f"Animal secured in holding facility ({fac.name}){caretaker_str} (Relocated from: {prev_str})"
    elif status_update.status_id == 6:
        # Picked up: animal is with responders in transit, NOT yet admitted into holding facility
        report.custody_status = status_update.custody_status or "Animal Picked Up"
        report.facility_id = None
        relocation_note = None
    elif status_update.status_id in (9, 10, 11, 12, 14, 17, 18):
        # Case resolved / animal adopted, impounded, claimed, or dismissed: restore original incident coordinates
        if report.initial_latitude is not None and report.initial_longitude is not None:
            report.latitude = report.initial_latitude
            report.longitude = report.initial_longitude
            if report.initial_landmark:
                report.landmark = report.initial_landmark
        report.facility_id = None
        relocation_note = None
    elif status_update.latitude is not None and status_update.longitude is not None:
        report.latitude = Decimal(str(status_update.latitude))
        report.longitude = Decimal(str(status_update.longitude))
        if status_update.landmark:
            report.landmark = status_update.landmark

    if status_update.custody_status:
        report.custody_status = status_update.custody_status

    # Update current_status_id (DB column name)
    # If this report was already confirmed as a duplicate (status 18 or duplicate_of_report_id is set),
    # preserving the Duplicate status (18) is required so it does not reset on escalation or status update to 4.
    if (report.current_status_id == 18 or report.duplicate_of_report_id) and status_update.status_id == 4:
        # Keep status 18 while recording the escalation in history / endorsement
        pass
    else:
        report.current_status_id = status_update.status_id

    # When a report transitions to a resolved status, clean up any unreviewed AI duplicate suggestions involving it
    if status_update.status_id in RESOLVED_STATUS_IDS:
        db.query(ReportMatch).filter(
            ReportMatch.matched_report_id.isnot(None),
            ReportMatch.matched_pet_id.is_(None),
            ReportMatch.status == "AI_SUGGESTED",
            or_(
                ReportMatch.source_report_id == report_id,
                ReportMatch.matched_report_id == report_id
            )
        ).delete(synchronize_session=False)
        # Also drop unreviewed pet look-alike suggestions the owner never responded to
        db.query(ReportMatch).filter(
            ReportMatch.source_report_id == report_id,
            ReportMatch.matched_pet_id.isnot(None),
            ReportMatch.status == "AI_SUGGESTED",
            ReportMatch.owner_confirmation_status == "PENDING"
        ).delete(synchronize_session=False)

    # Update animal condition if provided
    new_animal_condition = status_update.animal_condition or status_update.condition_notes
    if new_animal_condition:
        report.condition = new_animal_condition

    # Handle direct rescue staff assignment if assigned_staff_id is provided
    target_staff_name = None
    if getattr(status_update, 'assigned_staff_id', None):
        target_staff_id = status_update.assigned_staff_id
        staff_user = db.query(User).filter(User.user_id == target_staff_id).first()
        target_staff_name = staff_user.name if staff_user else f"Staff #{target_staff_id}"

        rescue = db.query(Rescue).filter(Rescue.report_id == report_id).first()
        if not rescue:
            rescue = Rescue(
                report_id=report_id,
                leader_id=current_user.user_id,
                staff_id=target_staff_id,
                status_id=1,
                title=f"Direct Dispatch: {report.animal_type or 'Animal'} at {report.landmark or 'Location'}",
                notes=status_update.remarks or f"Rescue team directly dispatched by Administrator {current_user.name}"
            )
            db.add(rescue)
            db.flush()
        else:
            rescue.staff_id = target_staff_id
            db.flush()

        # Update assignment
        db.query(RescueAssignment).filter(
            RescueAssignment.rescue_id == rescue.rescue_id,
            RescueAssignment.assignment_status == "Assigned"
        ).update({"assignment_status": "Cancelled"}, synchronize_session=False)

        assignment = RescueAssignment(
            rescue_id=rescue.rescue_id,
            user_id=target_staff_id,
            staff_id=target_staff_id,
            assigned_by=current_user.user_id,
            assignment_status="Assigned",
            remarks=f"Directly assigned by Administrator {current_user.name}"
        )
        db.add(assignment)

        # Notify assigned personnel
        notif = Notification(
            user_id=target_staff_id,
            title="🚨 Direct Rescue Assignment",
            message=f"Administrator {current_user.name} has directly dispatched you to incident report #{report_id} at {report.landmark or 'the reported location'}.",
            type="rescue_assignment",
            related_id=report_id
        )
        db.add(notif)

    # Use either remarks or status_remarks
    final_remarks = status_update.remarks or status_update.status_remarks
    friendly_defaults = {
        1: "Reported.",
        2: "Incident report has been officially verified by the Subdivision Leader.",
        3: "Report rejected based on verification criteria.",
        4: "Report forwarded to Barangay Operations for official review and approval.",
        5: "Rescue team has been dispatched to the location.",
        6: "Picked up by the barangay and in a safe place.",
        7: "Under observation.",
        8: "Securely impounded.",
        9: "Claimed by owner.",
        10: "Safely released.",
        11: "Incident has been resolved.",
        12: "Resolved (animal deceased).",
        13: "Approved by Barangay. Rescue operation is being planned.",
        14: "False Alarm / Dismissed.",
        15: "Disputed.",
        16: "Under Investigation.",
        17: "Animal cannot be found at the reported location."
    }

    if current_user.role_id == 4:
        admin_prefix = f"Status updated by Administrator {current_user.name}"
        if target_staff_name and status_update.status_id == 5:
            if final_remarks and final_remarks.strip():
                final_remarks = f"{admin_prefix}: Team Dispatched ({target_staff_name}) — {final_remarks.strip()}"
            else:
                final_remarks = f"{admin_prefix}: Team Dispatched ({target_staff_name})"
        elif final_remarks and final_remarks.strip():
            if admin_prefix not in final_remarks:
                final_remarks = f"{admin_prefix}: {final_remarks.strip()}"
        else:
            friendly_action_map = {
                5: "Team Dispatched",
                13: "Approved by Barangay",
                14: "False Alarm / Dismissed",
                16: "Under Investigation"
            }
            act_label = friendly_action_map.get(status_update.status_id, friendly_defaults.get(status_update.status_id, "Status updated."))
            final_remarks = f"{admin_prefix}: {act_label}"

        log_activity(
            db=db,
            action="ADMIN_STATUS_OVERRIDE",
            target_table="reports",
            target_id=report_id,
            description=f"Administrator {current_user.name} directly set status to {status_update.status_id} on report #{report_id}",
            log_type="operation",
            old_values={"status_id": prev_status_id},
            new_values={"status_id": status_update.status_id, "remarks": final_remarks},
            request=req
        )
    elif not final_remarks:
        final_remarks = friendly_defaults.get(status_update.status_id, "Status updated.")

    if relocation_note and relocation_note not in final_remarks:
        final_remarks = f"{final_remarks} | {relocation_note}"

    # Avoid adding duplicate StatusHistory entries if status and remarks haven't changed
    last_history = db.query(StatusHistory).filter(
        StatusHistory.report_id == report_id
    ).order_by(StatusHistory.history_id.desc()).first()

    is_duplicate = (
        last_history is not None
        and last_history.report_status_id == status_update.status_id
        and prev_status_id == status_update.status_id
        and (not final_remarks or final_remarks == last_history.remarks)
    )

    if owner_return_snap:
        summary = owner_return_summary(owner_return_snap)
        if summary not in (final_remarks or ""):
            final_remarks = f"{final_remarks} | {summary}" if final_remarks else summary
        record_owner_return(db, report, owner_return_snap, current_user,
                            holding_id=(db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == report_id).scalar()))

    if not is_duplicate:
        # Create status history entry using DB column names
        db_history = StatusHistory(
            report_id=report_id,
            report_status_id=status_update.status_id,
            updated_by=status_update.user_id,  # Link the update to the user
            latitude=report.latitude,
            longitude=report.longitude,
            landmark=report.landmark,
            facility_id=report.facility_id,
            remarks=final_remarks
        )
        db.add(db_history)
    
    # Create Notification for Resident
    if report.user_id:
        status_names = {
            1: "Reported",
            2: "Verified",
            3: "Rejected",
            4: "Escalated to Barangay",
            5: "Rescue In Progress",
            6: "Picked Up",
            7: "Under Observation",
            8: "Impounded",
            9: "Claimed by Owner",
            10: "Released",
            11: "Resolved",
            12: "Deceased",
            13: "Approved",
            14: "False Alarm / Dismissed",
            15: "Disputed",
            16: "Under Investigation",
            17: "Animal Cannot Be Found"
        }
        status_name = status_names.get(status_update.status_id, "Updated")
        notif_msg = f"Your report #{report_id} status has been updated to '{status_name}'."
        if final_remarks:
            notif_msg += f" Remarks: {final_remarks}"

        new_notif = Notification(
            user_id=report.user_id,
            title=f"Report Update: {status_name}",
            message=notif_msg,
            type="status_update",
            related_id=report_id
        )
        db.add(new_notif)

    # Notify Barangay staff and admins if status is escalated to Barangay (Status 4)
    if status_update.status_id == 4:
        try:
            barangay_officials = db.query(User).filter(User.role_id.in_([3, 4])).all()
            for official in barangay_officials:
                b_notif = Notification(
                    user_id=official.user_id,
                    title=f"New Escalated Report #{report_id}",
                    message=f"Report #{report_id} has been escalated to Barangay.",
                    type="alert",
                    related_id=report_id
                )
                db.add(b_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify barangay of escalation: {notif_err}")

    # Auto-intake into Holding Facility or Log Relocation when Under Observation (7), Impounded (8), or moved to facility
    # NOTE: Status 6 (Animal Picked Up) is in-transit only; intake happens only when moved to facility (Status 7/8 or explicit facility_id)
    if status_update.status_id == 6:
        already_in = db.query(HoldingAnimal).filter(
            HoldingAnimal.report_id == report.report_id
        ).first()
        if already_in:
            loc_str = report.landmark or "Subdivision Holding Facility"
            db.add(HoldingTimeline(
                holding_id=already_in.holding_id,
                event_type='transfer',
                title='Animal Picked Up by Barangay Responders',
                notes=final_remarks or f'Animal picked up from {loc_str} by Barangay response team. In transit to Barangay shelter.',
                logged_by=status_update.user_id,
            ))
            already_in.kennel_slot = None
    elif status_update.status_id == 5:
        already_in = db.query(HoldingAnimal).filter(
            HoldingAnimal.report_id == report.report_id
        ).first()
        if already_in:
            loc_str = report.landmark or "Subdivision Holding Facility"
            db.add(HoldingTimeline(
                holding_id=already_in.holding_id,
                event_type='observation',
                title='Barangay Response Team Dispatched',
                notes=final_remarks or f'Barangay response team dispatched to pick up animal from {loc_str}.',
                logged_by=status_update.user_id,
            ))
    elif status_update.status_id == 13:
        already_in = db.query(HoldingAnimal).filter(
            HoldingAnimal.report_id == report.report_id
        ).first()
        if already_in:
            db.add(HoldingTimeline(
                holding_id=already_in.holding_id,
                event_type='observation',
                title='Rescue Request Approved by Barangay',
                notes=final_remarks or 'Barangay Operations approved the rescue request for pickup.',
                logged_by=status_update.user_id,
            ))
    elif (status_update.status_id in (7, 8) or status_update.facility_id) and status_update.status_id != 6:
        already_in = db.query(HoldingAnimal).filter(
            HoldingAnimal.report_id == report.report_id
        ).first()
        if not already_in:
            raw_t = (report.animal_type or '').strip().lower()
            a_type = 'Dog' if ('dog' in raw_t or 'canine' in raw_t or 'puppy' in raw_t) else ('Cat' if ('cat' in raw_t or 'feline' in raw_t or 'kitten' in raw_t) else 'Unknown')
            
            cond_text = f"{report.condition or ''} {status_update.animal_condition or ''} {status_update.condition_notes or ''} {report.description or ''}".lower()
            is_deceased = 'deceased' in cond_text or 'dead' in cond_text
            is_injured = any(k in cond_text for k in ['injured', 'bleeding', 'limping', 'weak', 'sick', 'treatment', 'wound', 'trapped', 'fracture', 'broken', 'infection', 'rabid'])

            if is_deceased:
                init_fac_status = 4  # Deceased
            elif is_injured:
                init_fac_status = 1  # Need Treatment
            else:
                init_fac_status = 2  # Healthy

            new_holding = HoldingAnimal(
                report_id       = report.report_id,
                rescue_id       = report.rescues[0].rescue_id if report.rescues else None,
                animal_type     = a_type,
                breed           = getattr(report, 'animal_breed', None) or getattr(report, 'ai_possible_breed', None) or getattr(report, 'breed', None),
                color           = getattr(report, 'animal_color', None) or getattr(report, 'ai_dominant_color', None),
                estimated_size  = getattr(report, 'estimated_size', None) or getattr(report, 'ai_estimated_size', None),
                facility_status = init_fac_status,
                intake_staff_id = status_update.user_id,
            )
            db.add(new_holding)
            db.flush()

            loc_name = None
            if report.facility_id:
                fac = db.query(Landmark).filter(Landmark.landmark_id == report.facility_id).first()
                if fac:
                    loc_name = fac.name
            if not loc_name and report.landmark:
                loc_name = report.landmark
            if not loc_name:
                loc_name = "Holding Facility"

            db.add(HoldingTimeline(
                holding_id = new_holding.holding_id,
                event_type = 'intake',
                title      = f'Animal Admitted to Holding Facility ({loc_name})',
                notes      = f'Admitted into custody at {loc_name}. Report #{report.report_id}.',
                logged_by  = status_update.user_id,
            ))
        else:
            if getattr(report, 'animal_breed', None) and (not already_in.breed or already_in.breed in ('Aspin', 'Puspin', 'Unknown')):
                already_in.breed = report.animal_breed
            if not already_in.color and (getattr(report, 'animal_color', None) or getattr(report, 'ai_dominant_color', None)):
                already_in.color = getattr(report, 'animal_color', None) or getattr(report, 'ai_dominant_color', None)
            if not already_in.estimated_size and (getattr(report, 'estimated_size', None) or getattr(report, 'ai_estimated_size', None)):
                already_in.estimated_size = getattr(report, 'estimated_size', None) or getattr(report, 'ai_estimated_size', None)

            if relocation_note:
                loc_name = report.landmark or "New Facility"
                db.add(HoldingTimeline(
                    holding_id = already_in.holding_id,
                    event_type = 'transfer',
                    title      = f'Animal Relocated / Transferred ({loc_name})',
                    notes      = relocation_note,
                    logged_by  = status_update.user_id,
                ))
        
    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id  # type: ignore[assignment]
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    
    if report.endorsement_letter:
        let = report.endorsement_letter
        if let.leader:
            rep_data.endorsement_letter.leader_name = let.leader.name  # type: ignore[union-attr]
            if let.leader.position:
                rep_data.endorsement_letter.leader_position = let.leader.position.position_name  # type: ignore[union-attr]
    
    # Populate updater names for history entries in the response
    if report.history:
        for i, hist in enumerate(report.history):  # type: ignore[arg-type]
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_duplicate_and_merge_info(rep_data, report, db)
    populate_warning_info(rep_data, report, db)

    status_names = {
        1: "Reported", 2: "Verified", 3: "Rejected", 4: "Escalated to Barangay",
        5: "Rescue In Progress", 6: "Picked Up", 7: "Under Observation", 8: "Impounded",
        9: "Claimed by Owner", 10: "Released", 11: "Resolved", 12: "Deceased", 13: "Approved"
    }
    new_status_name = status_names.get(status_update.status_id, str(status_update.status_id))
    log_activity(
        db=db,
        action="UPDATE_STATUS",
        target_table="reports",
        target_id=report_id,
        description=f"Report #{report_id} status updated to '{new_status_name}'",
        user_id=status_update.user_id,
        log_type="operation",
        new_values={"status_id": status_update.status_id, "status_name": new_status_name},
        request=req
    )
    return rep_data


@router.post("/{report_id}/comments", response_model=CommentResponse)
def add_comment(report_id: int, comment_in: CommentCreate, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db_comment = Comment(
        report_id=report_id,
        user_id=comment_in.user_id,
        parent_comment_id=comment_in.parent_comment_id,
        comment=comment_in.comment
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    # Create notification for report owner if commenter is different
    if report.user_id != comment_in.user_id:
        commenter_name = db_comment.user.name if db_comment.user else "Someone"
        comment_text = comment_in.comment
        new_notif = Notification(
            user_id=report.user_id,
            title="New Comment on Your Report",
            message=f"{commenter_name} commented on your report #{report.report_id}: \"{comment_text[:50]}{'...' if len(comment_text) > 50 else ''}\"",
            type="comment",
            related_id=report.report_id
        )
        db.add(new_notif)

    # Also notify subdivision leader(s) if commenter is not the subdivision leader
    if report.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for leader in leaders:
                if leader.user_id != comment_in.user_id and leader.user_id != report.user_id:
                    commenter_name = db_comment.user.name if db_comment.user else "Someone"
                    comment_text = comment_in.comment
                    subd_notif = Notification(
                        user_id=leader.user_id,
                        title=f"New Message on Report #{report.report_id}",
                        message=f"{commenter_name} commented: \"{comment_text[:60]}{'...' if len(comment_text) > 60 else ''}\"",
                        type="message",
                        related_id=report.report_id
                    )
                    db.add(subd_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create leader comment notification: {notif_err}")

    db.commit()

    comment_data = CommentResponse.model_validate(db_comment)
    comment_data.user_name = db_comment.user.name if db_comment.user else "Unknown User"
    comment_data.user_photo = db_comment.user.profile_picture if db_comment.user else None
    return comment_data


@router.delete("/media/{media_id}")
def delete_report_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Reporter: own report while still 'Reported' (editing). Staff/Admin: within their scope."""
    media = db.query(ReportMedia).filter(ReportMedia.media_id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    report = db.query(Report).filter(Report.report_id == media.report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Media not found")
    if current_user.role_id == 1:
        if report.user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="You can only remove photos from your own reports.")
        if report.current_status_id != 1:
            raise HTTPException(status_code=409, detail="This report is already being handled; its photos can no longer be removed.")
    elif current_user.role_id in (2, 3, 4):
        verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    else:
        raise HTTPException(status_code=403, detail="Not authorized.")
    db.delete(media)
    db.commit()
    return {"message": "Media deleted successfully"}


@router.get("/{report_id}/review-permission")
def get_review_permission(report_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_staff_or_admin)):
    """Tells the screens whether this user may merge duplicates, decide matches and add/link the animal record."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    allowed, reason = review_permission(current_user, report, db)
    from app.utils.case_review import report_has_animal_record
    return {"can_review": allowed, "reason": reason or None, "has_animal_record": report_has_animal_record(report, db)}


@router.post("/{report_id}/link-pet")
def link_pet_to_report(report_id: int, pet_id: int, req: Request, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_staff_or_admin)):
    """Links a newly registered or identified pet record to an existing incident report (staff within scope only)."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_leader_claim(report, current_user)
    require_barangay_approval(report, current_user)
    require_review_permission(current_user, report, db)

    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if report.pet_id == pet_id:
        return {
            "status": "success",
            "message": f"Report #{report_id} is already linked to '{pet.display_name}'.",
            "report_id": report_id,
            "pet_id": pet_id
        }

    require_case_pet(db, report, pet_id)
    require_direct_pet_link(db, report, pet, current_user)
    report.pet_id = pet_id
    db.flush()

    # Sync pet behavioral traits with verified reports
    # Only reports with a trusted pet link count (an inherited identity needs a staff re-check)
    refresh_pet_behavior(db, pet)

    db.commit()
    db.refresh(report)
    db.refresh(pet)

    log_activity(
        db=db,
        action="LINK_PET_REPORT",
        target_table="reports",
        target_id=report_id,
        description=f"Linked Report #{report_id} to Registered Pet #{pet_id} ('{pet.pet_name}')",
        log_type="operation",
        new_values={"pet_id": pet_id, "pet_name": pet.pet_name},
        request=req
    )

    return {
        "message": f"Report #{report_id} successfully linked to '{pet.display_name}'",
        "report_id": report_id,
        "pet_id": pet_id
    }


@router.post("/{report_id}/claim", response_model=ReportResponse)
def claim_report(
    report_id: int, 
    claim_in: ReportClaimRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Claim ownership of an unassigned report by a subdivision officer with atomic concurrency check."""
    # 1. Fetch claiming officer
    user = current_user
    if current_user.role_id == 4 and claim_in.user_id:
        target_u = db.query(User).filter(User.user_id == claim_in.user_id).first()
        if target_u:
            user = target_u
    else:
        claim_in.user_id = current_user.user_id

    if user.role_id not in [2, 4]:
        raise HTTPException(status_code=403, detail="Only Subdivision Leaders / Officers are authorized to claim reports.")

    # 2. Fetch report with locking
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # 3. Check subdivision scope
    verify_subdivision_scope(user, report.subdivision_id, db=db)

    # Block claiming merged duplicate reports
    if report.current_status_id == 18 or report.duplicate_of_report_id:
        raise HTTPException(
            status_code=400,
            detail=f"Report #{report.report_id} is merged into Case #{report.duplicate_of_report_id}. Claims and operations are linked to the primary case."
        )

    # 4. Atomic Concurrency Check
    if report.assigned_leader_id is not None:
        if report.assigned_leader_id == user.user_id:
            rep_data = ReportResponse.model_validate(report)
            rep_data.status_id = report.current_status_id
            rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
            rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
            populate_handler_info(rep_data, report)
            populate_pet_and_owner_info(rep_data, report, db)
            return rep_data

        current_handler_name = report.assigned_leader.name if report.assigned_leader else f"Officer #{report.assigned_leader_id}"
        raise HTTPException(
            status_code=409,
            detail=f"This report has already been claimed by {current_handler_name}."
        )

    # 5. Assign handler
    from datetime import datetime
    now = datetime.now()
    report.assigned_leader_id = user.user_id
    report.claimed_at = now

    prev_status = report.current_status_id
    # Transition 'Reported' (1) to 'Verified' / Under Review (2)
    if report.current_status_id == 1:
        report.current_status_id = 2

    # 6. Record in StatusHistory
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} claimed the report and is now handling the case."
    )
    db.add(status_hist)

    # 7. Record in AuditLog
    log_activity(
        db=db,
        action="CLAIM_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} claimed report #{report.report_id}",
        user_id=user.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": None, "status_id": prev_status},
        new_values={"assigned_leader_id": user.user_id, "status_id": report.current_status_id},
        request=req
    )

    # 8. Notify other subdivision officers
    if report.subdivision_id:
        try:
            colleagues = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2,
                User.user_id != user.user_id
            ).all()
            for col in colleagues:
                notif = Notification(
                    user_id=col.user_id,
                    title=f"Report #{report.report_id} Claimed",
                    message=f"Officer {user.name} has claimed Report #{report.report_id} and is now handling it.",
                    type="report_claimed",
                    related_id=report.report_id
                )
                db.add(notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create claim notification: {notif_err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/take-over", response_model=ReportResponse)
def takeover_report(
    report_id: int, 
    takeover_in: ReportTakeoverRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Take over handling of a report from another officer with reason tracking."""
    # 1. Fetch new handler
    new_officer = current_user
    if current_user.role_id == 4 and takeover_in.user_id:
        target_u = db.query(User).filter(User.user_id == takeover_in.user_id).first()
        if target_u:
            new_officer = target_u
    else:
        takeover_in.user_id = current_user.user_id

    if new_officer.role_id not in [2, 4]:
        raise HTTPException(status_code=403, detail="Only Subdivision Leaders / Officers are authorized to take over reports.")

    # 2. Fetch report with locking
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(new_officer, report.subdivision_id, db=db)

    prev_handler_id = report.assigned_leader_id
    prev_handler_name = report.assigned_leader.name if report.assigned_leader else (f"Officer #{prev_handler_id}" if prev_handler_id else "Unassigned")

    if prev_handler_id == new_officer.user_id:
        rep_data = ReportResponse.model_validate(report)
        rep_data.status_id = report.current_status_id
        rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
        rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
        populate_handler_info(rep_data, report)
        populate_pet_and_owner_info(rep_data, report, db)
        return rep_data

    # Check inactivity / response window for non-admins
    from datetime import datetime, timedelta
    now = datetime.now()

    if new_officer.role_id != 4 and prev_handler_id:
        priority = (report.priority_level or "").lower()
        is_urgent = any(kw in priority for kw in ["emergency", "high", "urgent", "bite", "severe"])
        hours_threshold = 2 if is_urgent else 24

        latest_activity = report.claimed_at or report.created_at or now
        if report.history:
            for hist in report.history:
                if hist.created_at and hist.created_at > latest_activity:
                    latest_activity = hist.created_at

        locked_until = latest_activity + timedelta(hours=hours_threshold)
        if now < locked_until:
            rem_seconds = int((locked_until - now).total_seconds())
            hrs = rem_seconds // 3600
            mins = (rem_seconds % 3600) // 60
            time_str = f"{hrs}h {mins}m" if hrs > 0 else f"{mins}m"
            raise HTTPException(
                status_code=400,
                detail=f"Takeover is currently locked. The assigned handler is within the active response window ({time_str} remaining). Takeover will unlock if no progress is made after {hours_threshold} hours of inactivity."
            )

    # 3. Update handler
    report.assigned_leader_id = new_officer.user_id
    report.claimed_at = now

    # 4. Record takeover in StatusHistory
    reason_text = takeover_in.reason.strip() if takeover_in.reason else "Workload reassignment"
    notes_text = f" (Notes: {takeover_in.notes.strip()})" if takeover_in.notes and takeover_in.notes.strip() else ""
    history_remarks = f"Officer {new_officer.name} took over the report from {prev_handler_name}. Reason: {reason_text}{notes_text}"

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=new_officer.user_id,
        remarks=history_remarks
    )
    db.add(status_hist)

    # 5. Record in AuditLog
    log_activity(
        db=db,
        action="TAKEOVER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {new_officer.name} took over report #{report.report_id} from {prev_handler_name}. Reason: {reason_text}",
        user_id=new_officer.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": prev_handler_id, "handler_name": prev_handler_name},
        new_values={"assigned_leader_id": new_officer.user_id, "handler_name": new_officer.name, "reason": reason_text, "notes": takeover_in.notes},
        request=req
    )

    # 6. Notify previous handler
    if prev_handler_id and prev_handler_id != new_officer.user_id:
        try:
            prev_notif = Notification(
                user_id=prev_handler_id,
                title=f"Report #{report.report_id} Handover",
                message=f"Officer {new_officer.name} has taken over Report #{report.report_id}. Reason: {reason_text}.",
                type="report_takeover",
                related_id=report.report_id
            )
            db.add(prev_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify previous handler: {notif_err}")

    # 7. Notify other subdivision colleagues
    if report.subdivision_id:
        try:
            colleagues = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2,
                User.user_id.notin_([new_officer.user_id, prev_handler_id] if prev_handler_id else [new_officer.user_id])
            ).all()
            for col in colleagues:
                col_notif = Notification(
                    user_id=col.user_id,
                    title=f"Report #{report.report_id} Handover",
                    message=f"Officer {new_officer.name} took over Report #{report.report_id} from {prev_handler_name}.",
                    type="report_takeover",
                    related_id=report.report_id
                )
                db.add(col_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify colleagues: {notif_err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/unclaim", response_model=ReportResponse)
def unclaim_report(
    report_id: int, 
    unclaim_in: ReportClaimRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Release a claimed report back to the unassigned queue."""
    user = current_user
    if current_user.role_id == 4 and unclaim_in.user_id:
        target_u = db.query(User).filter(User.user_id == unclaim_in.user_id).first()
        if target_u:
            user = target_u
    else:
        unclaim_in.user_id = current_user.user_id

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(user, report.subdivision_id, db=db)

    if report.assigned_leader_id != user.user_id and user.role_id != 4:
        raise HTTPException(status_code=403, detail="You can only unclaim reports assigned to yourself.")

    report.assigned_leader_id = None
    report.claimed_at = None

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} released this report back to the unassigned queue."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="UNCLAIM_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} released report #{report.report_id} back to unassigned queue",
        user_id=user.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": user.user_id},
        new_values={"assigned_leader_id": None},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# REPORT TRANSFER WORKFLOW ENDPOINTS (Between Subdivision Officers)
# ==============================================================================

@router.post("/{report_id}/transfer/request", response_model=ReportResponse)
def request_transfer_report(
    report_id: int, 
    transfer_in: ReportTransferRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Initiate a transfer request from the current handler to another subdivision leader."""
    sender = current_user
    if current_user.role_id == 4 and transfer_in.user_id:
        target_u = db.query(User).filter(User.user_id == transfer_in.user_id).first()
        if target_u:
            sender = target_u
    else:
        transfer_in.user_id = current_user.user_id

    target = db.query(User).filter(User.user_id == transfer_in.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target officer not found")

    if target.role_id not in [2, 4]:
        raise HTTPException(status_code=400, detail="Transfers can only be proposed to Subdivision Leaders / Officers.")

    if sender.user_id == target.user_id:
        raise HTTPException(status_code=400, detail="You cannot transfer a report to yourself.")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    rescue_record = db.query(Rescue).filter(Rescue.report_id == report_id).first()
    is_already_escalated = (
        report.endorsement_letter is not None or
        rescue_record is not None or
        report.current_status_id in [4, 5, 6, 13]
    )
    if is_already_escalated and sender.role_id == 2:
        raise HTTPException(
            status_code=403,
            detail="Cannot transfer an escalated report. It is already under Barangay management."
        )

    if report.assigned_leader_id != sender.user_id and sender.role_id != 4:
        raise HTTPException(status_code=403, detail="Only the currently assigned handler can transfer this report.")

    verify_subdivision_scope(sender, report.subdivision_id, db=db)
    verify_subdivision_scope(target, report.subdivision_id, db=db)

    from datetime import datetime
    now = datetime.now()
    notes_clean = transfer_in.notes.strip() if transfer_in.notes else None

    report.pending_transfer_to_id = target.user_id
    report.pending_transfer_from_id = sender.user_id
    report.pending_transfer_notes = notes_clean
    report.pending_transfer_created_at = now

    notes_str = f" Reason/Notes: '{notes_clean}'" if notes_clean else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=sender.user_id,
        remarks=f"Officer {sender.name} initiated a case transfer request to Officer {target.name}.{notes_str}"
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="REQUEST_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {sender.name} requested to transfer report #{report.report_id} to Officer {target.name}",
        user_id=sender.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": sender.user_id},
        new_values={"pending_transfer_to_id": target.user_id, "notes": notes_clean},
        request=req
    )

    # Notify target officer
    try:
        notif = Notification(
            user_id=target.user_id,
            title=f"🔄 Transfer Request: Report #{report.report_id}",
            message=f"Officer {sender.name} requested to transfer Report #{report.report_id} to you.{f' Notes: {notes_clean}' if notes_clean else ''}",
            type="report_transfer_request",
            related_id=report.report_id
        )
        db.add(notif)
    except Exception as err:
        print(f"Notice: Failed to create transfer notification: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/accept", response_model=ReportResponse)
def accept_transfer_report(
    report_id: int, 
    action_in: ReportTransferActionRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Accept an incoming transfer request and assume primary handling of the report."""
    recipient = current_user
    if current_user.role_id == 4 and action_in.user_id:
        target_u = db.query(User).filter(User.user_id == action_in.user_id).first()
        if target_u:
            recipient = target_u
    else:
        action_in.user_id = current_user.user_id

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(recipient, report.subdivision_id, db=db)

    if report.pending_transfer_to_id != recipient.user_id and recipient.role_id != 4:
        raise HTTPException(status_code=403, detail="You are not the designated recipient of this transfer request.")

    prev_sender_id = report.pending_transfer_from_id
    prev_sender = report.pending_transfer_from
    sender_name = prev_sender.name if prev_sender else (f"Officer #{prev_sender_id}" if prev_sender_id else "Previous Handler")

    from datetime import datetime
    now = datetime.now()

    # Reassign handler
    report.assigned_leader_id = recipient.user_id
    report.claimed_at = now

    # Clear pending transfer fields
    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    # Record in StatusHistory with explicit wording required by user
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=recipient.user_id,
        remarks=f"{sender_name} transferred report to {recipient.name}. This report is now being handled by {recipient.name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="ACCEPT_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {recipient.name} accepted transfer of report #{report.report_id} from {sender_name}",
        user_id=recipient.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": prev_sender_id},
        new_values={"assigned_leader_id": recipient.user_id},
        request=req
    )

    # Notify original sender
    if prev_sender_id and prev_sender_id != recipient.user_id:
        try:
            notif = Notification(
                user_id=prev_sender_id,
                title=f"✅ Transfer Accepted: Report #{report.report_id}",
                message=f"Officer {recipient.name} ACCEPTED your transfer request for Report #{report.report_id}. The report is now assigned to {recipient.name}.",
                type="report_transfer_accepted",
                related_id=report.report_id
            )
            db.add(notif)
        except Exception as err:
            print(f"Notice: Failed to notify sender of acceptance: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/reject", response_model=ReportResponse)
def reject_transfer_report(
    report_id: int, 
    reject_in: ReportTransferRejectRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Decline an incoming transfer request with reason, keeping the original handler responsible."""
    recipient = current_user
    if current_user.role_id == 4 and reject_in.user_id:
        target_u = db.query(User).filter(User.user_id == reject_in.user_id).first()
        if target_u:
            recipient = target_u
    else:
        reject_in.user_id = current_user.user_id

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(recipient, report.subdivision_id, db=db)

    if report.pending_transfer_to_id != recipient.user_id and recipient.role_id != 4:
        raise HTTPException(status_code=403, detail="You are not the designated recipient of this transfer request.")

    prev_sender_id = report.pending_transfer_from_id
    prev_sender = report.pending_transfer_from
    sender_name = prev_sender.name if prev_sender else (f"Officer #{prev_sender_id}" if prev_sender_id else "Current Handler")

    rejection_reason = reject_in.reason.strip() if reject_in.reason else None

    # Clear pending transfer fields, keep original handler
    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    reason_str = f" Reason: '{rejection_reason}'." if rejection_reason else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=recipient.user_id,
        remarks=f"Officer {recipient.name} declined the case transfer request from {sender_name}.{reason_str} Report remains handled by {sender_name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="REJECT_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {recipient.name} declined transfer of report #{report.report_id} from {sender_name}. Reason: {rejection_reason}",
        user_id=recipient.user_id,
        log_type="operation",
        old_values={"pending_transfer_to_id": recipient.user_id},
        new_values={"pending_transfer_to_id": None, "rejection_reason": rejection_reason},
        request=req
    )

    # Notify sender that transfer was rejected and they remain responsible
    if prev_sender_id:
        try:
            reason_msg = f" Reason: '{rejection_reason}'." if rejection_reason else ""
            notif = Notification(
                user_id=prev_sender_id,
                title=f"❌ Transfer Declined: Report #{report.report_id}",
                message=f"Officer {recipient.name} DECLINED your transfer request for Report #{report.report_id}.{reason_msg} You remain responsible for this report.",
                type="report_transfer_rejected",
                related_id=report.report_id
            )
            db.add(notif)
        except Exception as err:
            print(f"Notice: Failed to notify sender of rejection: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/cancel", response_model=ReportResponse)
def cancel_transfer_report(
    report_id: int, 
    action_in: ReportTransferActionRequest, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Withdraw/cancel a pending transfer request before it is accepted."""
    user = current_user
    if current_user.role_id == 4 and action_in.user_id:
        target_u = db.query(User).filter(User.user_id == action_in.user_id).first()
        if target_u:
            user = target_u
    else:
        action_in.user_id = current_user.user_id

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    verify_subdivision_scope(user, report.subdivision_id, db=db)

    if report.pending_transfer_from_id != user.user_id and user.role_id != 4:
        raise HTTPException(status_code=403, detail="You can only cancel transfer requests you initiated.")

    target_id = report.pending_transfer_to_id
    target_name = report.pending_transfer_to.name if report.pending_transfer_to else (f"Officer #{target_id}" if target_id else "colleague")

    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} withdrew the pending case transfer request to {target_name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="CANCEL_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} cancelled transfer request for report #{report.report_id}",
        user_id=user.user_id,
        log_type="operation",
        old_values={"pending_transfer_to_id": target_id},
        new_values={"pending_transfer_to_id": None},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# FALSE REPORT DISMISSAL & ON-SITE VERIFICATION ENDPOINTS
# ==============================================================================

@router.post("/{report_id}/verify-incident", response_model=ReportResponse)
def verify_incident_report(report_id: int, verify_in: ReportVerifyRequest, req: Request, db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_staff_or_admin)):
    """Mark an incident report as officially verified on-site after field inspection (by the signed-in officer)."""
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # The officer is the signed-in account; a user_id in the request is ignored
    user = current_user

    verify_subdivision_scope(user, report.subdivision_id, db=db)
    require_leader_claim(report, user)
    require_barangay_approval(report, user)

    if user.role_id == 2:
        rescue_record = db.query(Rescue).filter(Rescue.report_id == report_id).first()
        is_escalated = (
            report.endorsement_letter is not None or
            rescue_record is not None or
            report.current_status_id in [4, 5, 6, 13]
        )
        if is_escalated:
            raise HTTPException(
                status_code=403,
                detail="This report has been escalated to the Barangay and cannot be modified by Subdivision Leaders."
            )

    from datetime import datetime
    now = datetime.now()

    report.current_status_id = 2  # Verified
    report.verification_status = 'verified_true'
    report.verification_notes = verify_in.notes or "Physical on-site inspection confirmed the reported incident."
    report.verified_by_user_id = user.user_id
    report.verified_at = now
    report.verified_actual_bite = bool(verify_in.verified_actual_bite)
    report.verified_chasing = bool(verify_in.verified_chasing)
    report.verified_attempted_bite = bool(verify_in.verified_attempted_bite)
    report.verified_injury = bool(verify_in.verified_injury)
    if verify_in.verified_injury:
        report.condition = "Injured"
    report.verified_aggressive = bool(verify_in.verified_aggressive)
    report.behavior_finding = verify_in.behavior_finding or (
        "Substantiated" if (verify_in.verified_actual_bite or verify_in.verified_aggressive) else "Unsubstantiated / Friendly"
    )

    finding_str = f" [Finding: {report.behavior_finding}]" if report.behavior_finding else ""
    notes_txt = f" Notes: {verify_in.notes}" if verify_in.notes else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=2,
        updated_by=user.user_id,
        remarks=f"Official on-site investigation confirmed by Officer {user.name}.{finding_str}{notes_txt}"
    )
    db.add(status_hist)

    # Sync Pet Behavioral Profile if this report is linked to a registered pet
    if report.pet_id:
        db.flush()
        pet = db.query(Pet).filter(Pet.pet_id == report.pet_id).first()
        if pet:
            # Only reports with a trusted pet link count (an inherited identity needs a staff re-check)
            refresh_pet_behavior(db, pet)

    # Notify reporter
    if report.user_id and report.user_id != user.user_id:
        notif = Notification(
            user_id=report.user_id,
            title=f"Report #{report.report_id} Verified",
            message=f"Your report #{report.report_id} was verified on-site by Subdivision Officer {user.name} ({report.behavior_finding}).",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif)

    log_activity(
        db=db,
        action="VERIFY_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} verified report #{report.report_id} on-site ({report.behavior_finding})",
        user_id=user.user_id,
        log_type="operation",
        old_values={"verification_status": "unverified", "status_id": report.current_status_id},
        new_values={
            "verification_status": "verified_true",
            "status_id": 2,
            "behavior_finding": report.behavior_finding,
            "verified_actual_bite": report.verified_actual_bite,
            "verified_chasing": report.verified_chasing,
            "verified_aggressive": report.verified_aggressive,
            "notes": verify_in.notes
        },
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/mark-false-alarm", response_model=ReportResponse)
def mark_report_false_alarm(report_id: int, false_in: ReportFalseAlarmRequest, req: Request, db: Session = Depends(get_db)):
    """Dismiss a report as a false alarm / invalid claim with documented investigation findings."""
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    user = db.query(User).filter(User.user_id == false_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    verify_subdivision_scope(user, report.subdivision_id, db=db)
    require_leader_claim(report, user)
    require_barangay_approval(report, user)

    if user.role_id == 2:
        rescue_record = db.query(Rescue).filter(Rescue.report_id == report_id).first()
        is_escalated = (
            report.endorsement_letter is not None or
            rescue_record is not None or
            report.current_status_id in [4, 5, 6, 13]
        )
        if is_escalated:
            raise HTTPException(
                status_code=403,
                detail="This report has been escalated to the Barangay and cannot be dismissed by Subdivision Leaders."
            )

    from datetime import datetime
    now = datetime.now()

    report.current_status_id = 14  # False Alarm / Dismissed
    report.verification_status = 'false_alarm'
    report.false_alarm_reason = false_in.reason
    report.verification_notes = false_in.notes or f"Investigation concluded report is invalid: {false_in.reason}"
    report.verified_by_user_id = user.user_id
    report.verified_at = now

    notes_snippet = f" | Notes: {false_in.notes}" if false_in.notes else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=14,
        updated_by=user.user_id,
        remarks=f"Report dismissed as False Alarm / Invalid. Reason: {false_in.reason}{notes_snippet}"
    )
    db.add(status_hist)

    # Notify reporter about the dismissal
    if report.user_id and report.user_id != user.user_id:
        notif = Notification(
            user_id=report.user_id,
            title=f"Report #{report.report_id} Dismissed",
            message=f"Your report #{report.report_id} was reviewed and dismissed by Subdivision Officer {user.name} ({false_in.reason}).",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif)

    log_activity(
        db=db,
        action="DISMISS_FALSE_ALARM",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} dismissed report #{report.report_id} as false alarm ({false_in.reason})",
        user_id=user.user_id,
        log_type="operation",
        old_values={"verification_status": "unverified", "status_id": report.current_status_id},
        new_values={"verification_status": "false_alarm", "status_id": 14, "reason": false_in.reason, "notes": false_in.notes},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# DUPLICATE REPORT MERGE & UNMERGE WORKFLOW
# ==============================================================================

MERGE_CLOSED_STATUSES = [3, 9, 10, 11, 12, 14, 18]
MAX_REPORTS_PER_MERGE = 25


def _breeds_compatible(a: Optional[str], b: Optional[str]) -> bool:
    a = (a or '').strip().lower()
    b = (b or '').strip().lower()
    if not a or not b or a in ('unknown', 'n/a') or b in ('unknown', 'n/a'):
        return True
    return a == b or a in b or b in a


def _check_mergeable(db: Session, actor: User, report: Report, primary_report: Report) -> None:
    """All the checks for moving `report` into `primary_report`. Raises a clear 4xx error on the first problem."""
    rid = report.report_id
    if rid == primary_report.report_id:
        raise HTTPException(status_code=400, detail="Cannot merge a report into itself.")
    if report.current_status_id == 18 or report.duplicate_of_report_id:
        raise HTTPException(status_code=400, detail=f"Report #{rid} is already merged into Report #{report.duplicate_of_report_id}.")
    if report.current_status_id in MERGE_CLOSED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Report #{rid} is already closed and can't be merged.")
    verify_subdivision_scope(actor, report.subdivision_id, db=db)
    require_barangay_approval(report, actor)
    # A leader may fold in unclaimed duplicates, but never a case another officer is handling.
    if actor.role_id == 2 and report.assigned_leader_id and report.assigned_leader_id != actor.user_id:
        raise HTTPException(status_code=403, detail=f"Report #{rid} is being handled by another officer, so you can't merge it.")
    if report.animal_type and primary_report.animal_type and report.animal_type.lower() != primary_report.animal_type.lower():
        raise HTTPException(status_code=400, detail=f"Report #{rid} is a {report.animal_type} but the main case #{primary_report.report_id} is a {primary_report.animal_type}.")
    if not _breeds_compatible(report.animal_breed, primary_report.animal_breed):
        raise HTTPException(status_code=400, detail=f"Report #{rid} is a {report.animal_breed} but the main case #{primary_report.report_id} is a {primary_report.animal_breed}. Both must be the same breed.")


def _check_merge_primary(db: Session, actor: User, primary_report: Report, cross_subdivision: bool = False) -> None:
    if primary_report.current_status_id in MERGE_CLOSED_STATUSES or primary_report.duplicate_of_report_id:
        raise HTTPException(status_code=400, detail="Cannot merge into a report that is already closed, resolved, claimed by owner, dismissed, or merged.")
    verify_subdivision_scope(actor, primary_report.subdivision_id, db=db)
    if not cross_subdivision:
        require_review_permission(actor, primary_report, db)
    if actor.role_id == 2 and primary_report.assigned_leader_id and primary_report.assigned_leader_id != actor.user_id:
        raise HTTPException(status_code=403, detail=f"The main case #{primary_report.report_id} is being handled by another officer.")


def _merge_one(db: Session, actor: User, report: Report, primary_report: Report, notes: str, req: Request) -> None:
    """Fold `report` into `primary_report` (no commit). Checks must already have passed."""
    from datetime import datetime
    from app.models.report import Rescue

    old_status_id = report.current_status_id

    report.duplicate_of_report_id = primary_report.report_id
    report.merged_at = datetime.now()
    report.merged_by = actor.user_id
    report.merge_notes = notes  # the reason staff gave for merging (shown in the case and in identity disputes)
    report.current_status_id = 18  # Merged — Duplicate

    # Duplicates previously folded into this report now belong to the main case (no duplicate-of-a-duplicate chains)
    for child in db.query(Report).filter(Report.duplicate_of_report_id == report.report_id).all():
        child.duplicate_of_report_id = primary_report.report_id
        db.add(StatusHistory(
            report_id=child.report_id,
            report_status_id=18,
            updated_by=actor.user_id,
            remarks=f"Moved to Case #{primary_report.report_id} because its main case #{report.report_id} was merged into it."
        ))

    # If the duplicate belongs to a registered pet, link the main case to the pet as well
    if report.pet_id and not primary_report.pet_id:
        primary_report.pet_id = report.pet_id

    # Reconcile claim & handler assignment (one active claim for the animal)
    if primary_report.assigned_leader_id:
        report.assigned_leader_id = primary_report.assigned_leader_id
        report.claimed_at = primary_report.claimed_at
    elif report.assigned_leader_id:
        primary_report.assigned_leader_id = report.assigned_leader_id
        primary_report.claimed_at = report.claimed_at or datetime.now()
        if primary_report.current_status_id == 1:
            primary_report.current_status_id = 2
        report.assigned_leader_id = primary_report.assigned_leader_id
        report.claimed_at = primary_report.claimed_at

    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    # Reconcile Rescue missions (one active rescue assignment for the animal)
    pri_rescue = db.query(Rescue).filter(Rescue.report_id == primary_report.report_id).first()
    for s_res in db.query(Rescue).filter(Rescue.report_id == report.report_id).all():
        if pri_rescue:
            s_res.notes = f"{(s_res.notes or '').strip()} [Consolidated into primary Case #{primary_report.report_id} Rescue #{pri_rescue.rescue_id}]".strip()
            if s_res.status_id not in [3, 4, 5]:
                s_res.status_id = 5
        else:
            s_res.report_id = primary_report.report_id
            s_res.notes = f"{(s_res.notes or '').strip()} [Transferred from linked duplicate Report #{report.report_id}]".strip()
            pri_rescue = s_res

    db.add(StatusHistory(
        report_id=report.report_id,
        report_status_id=18,
        updated_by=actor.user_id,
        remarks=f"Report confirmed as duplicate of Case #{primary_report.report_id} by {actor.name}. Linked to existing claim. Reason: {notes}"
    ))
    sec_reporter_name = report.reporter.name if report.reporter else f"Resident #{report.user_id}"
    db.add(StatusHistory(
        report_id=primary_report.report_id,
        report_status_id=primary_report.current_status_id,
        updated_by=actor.user_id,
        remarks=f"Linked duplicate Report #{report.report_id} filed by {sec_reporter_name}. Sighting evidence consolidated."
    ))

    if report.user_id and report.user_id != actor.user_id:
        db.add(Notification(
            user_id=report.user_id,
            title=f"📋 Report #{report.report_id} Linked to Active Case #{primary_report.report_id}",
            message=(
                f"Thank you for your report! Officer {actor.name} verified that this sighting matches active Case #{primary_report.report_id}. "
                f"Your photos and report have been consolidated into the active case file to aid the rescue team."
            ),
            type="report_status",
            related_id=report.report_id
        ))
    if primary_report.user_id and primary_report.user_id != actor.user_id and primary_report.user_id != report.user_id:
        db.add(Notification(
            user_id=primary_report.user_id,
            title=f"🐾 Additional Sighting Linked to Your Report #{primary_report.report_id}",
            message=f"An additional citizen report (#{report.report_id}) for this animal has been confirmed and merged into your active case.",
            type="report_status",
            related_id=primary_report.report_id
        ))

    log_activity(
        db=db,
        action="MERGE_DUPLICATE_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {actor.name} merged Report #{report.report_id} into primary Case #{primary_report.report_id}",
        user_id=actor.user_id,
        log_type="operation",
        old_values={"status_id": old_status_id, "duplicate_of_report_id": None},
        new_values={"status_id": 18, "duplicate_of_report_id": primary_report.report_id, "notes": notes},
        request=req,
        commit=False,
    )

    # Mark any AI duplicate suggestion between the two reports as confirmed
    dup_match = db.query(ReportMatch).filter(
        ReportMatch.matched_report_id.isnot(None),
        or_(
            and_(ReportMatch.source_report_id == report.report_id, ReportMatch.matched_report_id == primary_report.report_id),
            and_(ReportMatch.source_report_id == primary_report.report_id, ReportMatch.matched_report_id == report.report_id)
        )
    ).first()
    if dup_match:
        dup_match.status = "CONFIRMED_MATCH"
        dup_match.reviewed_by = actor.user_id
        dup_match.reviewer_role = "Officer / Staff"
        dup_match.verification_notes = f"Merged into primary Case #{primary_report.report_id}: {notes}"
        dup_match.verified_at = datetime.now()


def _load_for_merge(db: Session, report_id: int) -> Optional[Report]:
    return db.query(Report).options(
        joinedload(Report.reporter),
        joinedload(Report.assigned_leader),
        joinedload(Report.media),
        joinedload(Report.history)
    ).filter(Report.report_id == report_id).first()


def _merge_response(db: Session, report: Report) -> ReportResponse:
    db.refresh(report)
    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    populate_duplicate_and_merge_info(rep_data, report, db)
    return rep_data


def _require_merge_notes(notes: Optional[str]) -> str:
    notes = (notes or "").strip()
    if len(notes) < 5:
        raise HTTPException(status_code=400, detail="Please explain why these reports are the same animal (at least 5 characters).")
    return notes


def _first_reported(reports_list: List[Report]) -> Report:
    """The main case of a merged group is always the report filed first (ties: lowest report number)."""
    from datetime import datetime
    return min(reports_list, key=lambda r: (r.created_at or datetime.max, r.report_id))


def _merge_group(db: Session, actor: User, report_ids: List[int], notes: str, req: Request, commit: bool = True) -> Report:
    """
    Merge every report in the group into the first-filed one. All-or-nothing: every report is checked before anything
    changes, and any problem names the report it's about. With commit=False the caller commits (or the session is
    discarded), so a merge can be saved together with whatever triggered it.
    """
    ids = []
    for rid in report_ids:
        if rid not in ids:
            ids.append(rid)
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least two reports of the same animal to merge.")
    if len(ids) > MAX_REPORTS_PER_MERGE:
        raise HTTPException(status_code=400, detail=f"You can merge up to {MAX_REPORTS_PER_MERGE} reports at a time.")

    group = []
    for rid in ids:
        rep = _load_for_merge(db, rid)
        if not rep:
            raise HTTPException(status_code=404, detail=f"Report #{rid} not found.")
        group.append(rep)

    primary_report = _first_reported(group)
    # Across subdivisions the Barangay reviews the pair (no escalation needed); a subdivision leader can't
    from app.utils.case_review import is_cross_subdivision, require_cross_subdivision_reviewer
    cross = is_cross_subdivision(group)
    require_cross_subdivision_reviewer(actor, group)
    _check_merge_primary(db, actor, primary_report, cross_subdivision=cross)
    duplicates = [r for r in group if r.report_id != primary_report.report_id]
    for rep in duplicates:
        _check_mergeable(db, actor, rep, primary_report)
    conflict = group_pet_conflict(db, group)
    if conflict:
        raise HTTPException(status_code=409, detail=conflict)

    if not commit:
        for rep in duplicates:
            _merge_one(db, actor, rep, primary_report, notes, req)
        db.flush()
        resync_case_pet_identity(db, primary_report, actor, req)
        return primary_report
    try:
        for rep in duplicates:
            _merge_one(db, actor, rep, primary_report, notes, req)
        db.flush()
        # Reports joining a case that is already confirmed as a pet inherit it (no second confirmation needed)
        resync_case_pet_identity(db, primary_report, actor, req)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return primary_report


@router.post("/merge-group", response_model=ReportResponse)
def merge_report_group(
    merge_in: ReportMergeGroupRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Merge reports the reviewer confirmed are the same animal. The report filed first stays open as the main case;
    the others become 'Merged — Duplicate' under it. Returns the main case.
    """
    notes = _require_merge_notes(merge_in.notes)
    primary_report = _merge_group(db, current_user, merge_in.report_ids, notes, req)
    return _merge_response(db, primary_report)


@router.post("/{report_id}/merge", response_model=ReportResponse)
def merge_duplicate_report(
    report_id: int,
    merge_in: ReportMergeRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Merge two reports of the same animal. Same rule as merge-group: whichever was filed first stays the main case.
    Returns report_id's report.
    """
    notes = _require_merge_notes(merge_in.notes)
    if report_id == merge_in.primary_report_id:
        raise HTTPException(status_code=400, detail="Cannot merge a report into itself.")
    _merge_group(db, current_user, [report_id, merge_in.primary_report_id], notes, req)
    report = _load_for_merge(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    return _merge_response(db, report)

@router.post("/{report_id}/unmerge", response_model=ReportResponse)
def unmerge_duplicate_report(
    report_id: int,
    unmerge_in: ReportUnmergeRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Separates a previously merged duplicate report back into an independent active report.
    Allowed for Subdivision Leaders, Barangay Staff, and Admins.
    """
    # The signed-in user is the actor; a user_id in the body is never trusted.
    actor = current_user

    report = db.query(Report).options(
        joinedload(Report.reporter),
        joinedload(Report.media),
        joinedload(Report.history)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    verify_subdivision_scope(actor, report.subdivision_id, db=db)
    primary_for_review = db.query(Report).filter(Report.report_id == report.duplicate_of_report_id).first() if report.duplicate_of_report_id else None
    require_review_permission(actor, primary_for_review or report, db)

    if not report.duplicate_of_report_id and report.current_status_id != 18:
        raise HTTPException(status_code=400, detail=f"Report #{report_id} is not currently merged.")

    prev_primary_id = report.duplicate_of_report_id

    # Revert merge fields
    report.duplicate_of_report_id = None
    report.merged_at = None
    report.merged_by = None
    report.merge_notes = None
    # Reset status back to Verified (2) if assigned, else Reported (1)
    new_status = 2 if report.assigned_leader_id else 1
    report.current_status_id = new_status

    # Record history on unmerged report
    unmerge_history = StatusHistory(
        report_id=report.report_id,
        report_status_id=new_status,
        updated_by=actor.user_id,
        remarks=f"Separated from Case #{prev_primary_id} by {actor.name}. Reason: {unmerge_in.reason}"
    )
    db.add(unmerge_history)

    # Record note on previously primary report if it exists
    if prev_primary_id:
        pri_history = StatusHistory(
            report_id=prev_primary_id,
            updated_by=actor.user_id,
            remarks=f"Linked duplicate Report #{report.report_id} was unmerged/separated by {actor.name}. Reason: {unmerge_in.reason}"
        )
        db.add(pri_history)
        prev_primary = db.get(Report, prev_primary_id)
        if prev_primary and report.pet_id:
            db.flush()
            if release_inherited_pet(db, prev_primary, report.pet_id):
                db.add(StatusHistory(
                    report_id=prev_primary_id,
                    updated_by=actor.user_id,
                    remarks=f"Link to {pet_name(db, report.pet_id)} removed: it came only from Report #{report.report_id}, which was separated from this case."
                ))
        db.flush()
        resync_case_pet_identity(db, report, actor, req)
        if prev_primary:
            resync_case_pet_identity(db, prev_primary, actor, req)

    # Notify reporter
    if report.user_id and report.user_id != actor.user_id:
        notif = Notification(
            user_id=report.user_id,
            title=f"📋 Report #{report.report_id} Reopened as Independent Case",
            message=f"Your report #{report.report_id} has been separated from Case #{prev_primary_id} and reopened for independent handling.",
            type="report_status",
            related_id=report.report_id
        )
        db.add(notif)

    # Audit log
    log_activity(
        db=db,
        action="UNMERGE_DUPLICATE_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {actor.name} unmerged Report #{report.report_id} from Case #{prev_primary_id}",
        user_id=actor.user_id,
        log_type="operation",
        old_values={"status_id": 18, "duplicate_of_report_id": prev_primary_id},
        new_values={"status_id": new_status, "duplicate_of_report_id": None, "reason": unmerge_in.reason},
        request=req
    )

    # If an AI ReportMatch existed, update its status to NOT_A_MATCH
    try:
        dup_match = db.query(ReportMatch).filter(
            ReportMatch.matched_report_id.isnot(None),
            or_(
                and_(ReportMatch.source_report_id == report.report_id, ReportMatch.matched_report_id == prev_primary_id),
                and_(ReportMatch.source_report_id == prev_primary_id, ReportMatch.matched_report_id == report.report_id)
            )
        ).first()
        if dup_match:
            dup_match.status = "NOT_A_MATCH"
            dup_match.reviewed_by = actor.user_id
            dup_match.reviewer_role = "Officer / Staff"
            dup_match.verification_notes = f"Unmerged by {actor.name}: {unmerge_in.reason}"
            dup_match.verified_at = datetime.now()
    except Exception as m_err:
        print(f"Could not reconcile ReportMatch status on unmerge: {m_err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    populate_duplicate_and_merge_info(rep_data, report, db)
    return rep_data


# ==============================================================================
# PET OWNER DISPUTE ENDPOINTS
# ==============================================================================

@router.post("/{report_id}/disputes", response_model=ReportDisputeResponse)
async def create_report_dispute(
    report_id: int,
    req: Request,
    dispute_reason: str = Form(...),
    pet_id: Optional[int] = Form(None),
    match_id: Optional[int] = Form(None),
    resident_user_id: Optional[int] = Form(None),  # ignored: the filer is always the signed-in account
    vaccination_card: Optional[UploadFile] = File(None),
    supporting_photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lodge a formal dispute against a report targeting a resident pet. Only the signed-in pet owner can file it."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents can dispute a report about their pet.")
    if not (dispute_reason or "").strip():
        raise HTTPException(status_code=400, detail="Please explain the dispute.")
    if pet_id is not None:
        disputed_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
        if not disputed_pet or disputed_pet.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="You can only file a dispute about a pet registered to you.")
    resident = current_user

    # Link the look-alike match being disputed, so the reviewer sees its history
    from app.models.report_match import ReportMatch
    case_ids = [m.report_id for m in case_members(db, case_root(db, report))]
    disputed_match = None
    if match_id is not None:
        disputed_match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
        if (disputed_match is None or disputed_match.source_report_id not in case_ids or not disputed_match.matched_pet_id
                or not disputed_match.matched_pet or disputed_match.matched_pet.owner_id != current_user.user_id):
            raise HTTPException(status_code=400, detail="That match isn't about your pet on this report.")
        if pet_id is None:
            pet_id = disputed_match.matched_pet_id
        elif pet_id != disputed_match.matched_pet_id:
            raise HTTPException(status_code=400, detail="The pet doesn't match the disputed match.")
    elif pet_id is not None:
        disputed_match = (db.query(ReportMatch).filter(ReportMatch.source_report_id.in_(case_ids), ReportMatch.matched_pet_id == pet_id)
                          .order_by(ReportMatch.source_report_id == report_id, ReportMatch.match_id).all() or [None])[-1]

    vaccine_url = None
    if vaccination_card and vaccination_card.filename:
        v_content, v_name, _, _ = await read_and_validate_upload(vaccination_card, allowed={'Image', 'Document'})
        vaccine_url = await run_in_threadpool(upload_to_cloudinary, v_content, filename=f"dispute_vax_{v_name}")

    photo_url = None
    if supporting_photo and supporting_photo.filename:
        p_content, p_name, _, _ = await read_and_validate_upload(supporting_photo, allowed={'Image'})
        photo_url = await run_in_threadpool(upload_to_cloudinary, p_content, filename=f"dispute_proof_{p_name}")

    # Check if a pending dispute already exists for this user/report
    existing_dispute = db.query(ReportDispute).filter(
        ReportDispute.report_id == report_id,
        ReportDispute.resident_user_id == resident.user_id,
        ReportDispute.status == "Pending"
    ).first()

    if existing_dispute:
        # Update existing pending dispute
        existing_dispute.dispute_reason = dispute_reason
        if pet_id:
            existing_dispute.pet_id = pet_id
        if disputed_match is not None:
            existing_dispute.match_id = disputed_match.match_id
        if vaccine_url:
            existing_dispute.vaccination_card_url = vaccine_url
        if photo_url:
            existing_dispute.supporting_photo_url = photo_url
        dispute_record = existing_dispute
    else:
        dispute_record = ReportDispute(
            report_id=report_id,
            resident_user_id=resident.user_id,
            pet_id=pet_id,
            dispute_reason=dispute_reason,
            vaccination_card_url=vaccine_url,
            supporting_photo_url=photo_url,
            status="Pending",
            match_id=disputed_match.match_id if disputed_match is not None else None,
        )
        db.add(dispute_record)

    # Update report status to Disputed
    report.current_status_id = 15  # Disputed
    report.verification_status = 'disputed'

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=15,
        updated_by=resident.user_id,
        remarks=f"Formal dispute lodged by resident {resident.name}. Animal control operations paused pending verification of vaccination certificate."
    )
    db.add(status_hist)

    # Notify Subdivision Leader(s)
    if report.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for l in leaders:
                d_notif = Notification(
                    user_id=l.user_id,
                    title=f"Dispute Lodged: Report #{report.report_id}",
                    message=f"Resident {resident.name} has formally disputed Report #{report.report_id} with proof of vaccination.",
                    type="alert",
                    related_id=report.report_id
                )
                db.add(d_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify leaders about dispute: {notif_err}")

    log_activity(
        db=db,
        action="LODGE_DISPUTE",
        target_table="report_disputes",
        target_id=report.report_id,
        description=f"Resident {resident.name} lodged dispute against report #{report.report_id}",
        user_id=resident.user_id,
        log_type="operation",
        new_values={"report_id": report.report_id, "reason": dispute_reason},
        request=req
    )

    db.commit()
    db.refresh(dispute_record)

    resp = dispute_response(db, dispute_record)
    resp.match_history = None  # the filer is a resident; the decision trail is for reviewers
    return resp


@router.get("/{report_id}/disputes", response_model=List[ReportDisputeResponse])
def get_report_disputes(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Disputes lodged for a report: staff in scope see all of them; a resident only sees their own."""
    scoped_report = db.query(Report).filter(Report.report_id == report_id).first()
    if not scoped_report:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role_id in (2, 3):
        verify_subdivision_scope(current_user, scoped_report.subdivision_id, db=db)
    disputes = db.query(ReportDispute).options(
        joinedload(ReportDispute.resident),
        joinedload(ReportDispute.reviewer),
        joinedload(ReportDispute.pet)
    ).filter(ReportDispute.report_id == report_id).order_by(ReportDispute.created_at.desc()).all()

    out = [
        dispute_response(db, d)
        for d in disputes
        if current_user.role_id != 1 or d.resident_user_id == current_user.user_id
    ]
    if current_user.role_id == 1:
        for d in out:
            d.match_history = None  # the staff decision trail is for reviewers
    return out


@router.patch("/{report_id}/disputes/{dispute_id}/review", response_model=ReportResponse)
def review_report_dispute(
    report_id: int,
    dispute_id: int,
    review_in: ReportDisputeReviewRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    # Staff review of a citizen dispute (Accept and dismiss false alarm, or Reject).
    # The reviewer is always the signed-in officer; a reviewer_id in the request is ignored.
    dispute = db.query(ReportDispute).filter(
        ReportDispute.dispute_id == dispute_id,
        ReportDispute.report_id == report_id
    ).first()

    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute record not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    reviewer = current_user
    verify_subdivision_scope(reviewer, report.subdivision_id, db=db)
    require_review_permission(reviewer, report, db)
    require_leader_claim(report, reviewer)
    if dispute.status != "Pending":
        raise HTTPException(status_code=409, detail=f"This dispute was already reviewed ({dispute.status}).")
    if dispute.dispute_type == "wrong_identity":
        raise HTTPException(status_code=400, detail="This is an incorrect-sighting dispute: uphold or reverse it from the dispute panel.")
    if review_in.status not in ("Accepted", "Rejected"):
        raise HTTPException(status_code=400, detail="Decision must be Accepted or Rejected.")

    from datetime import datetime
    now = datetime.now()

    dispute.status = review_in.status
    dispute.reviewer_id = reviewer.user_id
    dispute.reviewer_notes = review_in.reviewer_notes
    dispute.resolved_at = now

    if review_in.status == "Accepted":
        # Owner dispute accepted -> Mark report as False Alarm / Dismissed
        report.current_status_id = 14  # False Alarm / Dismissed
        report.verification_status = 'false_alarm'
        report.false_alarm_reason = 'Pet Safely Owned / False Accusation'
        report.verification_notes = f"Owner dispute verified and accepted by Officer {reviewer.name}: {review_in.reviewer_notes or 'Vaccination & ownership verified'}"
        report.verified_by_user_id = reviewer.user_id
        report.verified_at = now

        status_hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=14,
            updated_by=reviewer.user_id,
            remarks=f"Resident dispute approved by Officer {reviewer.name}. Vaccination proof verified. Report dismissed as False Alarm."
        )
        db.add(status_hist)

        # Notify resident pet owner
        notif_owner = Notification(
            user_id=dispute.resident_user_id,
            title="Dispute Approved: Pet Cleared",
            message=f"Your dispute for Report #{report.report_id} has been APPROVED by Officer {reviewer.name}. The report is dismissed.",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif_owner)

    else:
        # Dispute rejected -> Restore to Under Investigation / Reported
        report.current_status_id = 16  # Under Investigation
        report.verification_status = 'unverified'
        report.verification_notes = f"Dispute rejected by Officer {reviewer.name}: {review_in.reviewer_notes or 'Evidence insufficient'}"

        status_hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=16,
            updated_by=reviewer.user_id,
            remarks=f"Resident dispute rejected by Officer {reviewer.name}. Protocol and field verification continue."
        )
        db.add(status_hist)

        # Notify resident pet owner
        notif_owner = Notification(
            user_id=dispute.resident_user_id,
            title="Dispute Review Update",
            message=f"Your dispute for Report #{report.report_id} was reviewed and not accepted. Notes: {review_in.reviewer_notes or 'Please consult subdivision office.'}",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif_owner)

    log_activity(
        db=db,
        action="REVIEW_DISPUTE",
        target_table="report_disputes",
        target_id=dispute.dispute_id,
        description=f"Officer {reviewer.name} reviewed dispute #{dispute.dispute_id} ({review_in.status})",
        user_id=reviewer.user_id,
        log_type="operation",
        new_values={"dispute_id": dispute.dispute_id, "status": review_in.status, "notes": review_in.reviewer_notes},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data

