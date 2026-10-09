from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload, selectinload, aliased
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import json
import os
from sqlalchemy import or_, and_, desc, func

from app.database import get_db
from app.models.report_match import ReportMatch
from app.models.report import Report, ReportMedia, StatusHistory, HoldingAnimal, HoldingTimeline
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.user import User
from app.models.notification import Notification
from app.models.pet_history import PetHistory
from app.models.system_setting import SystemSetting
from app.schemas.report_match import (
    ReportMatchResponse,
    ReportMatchVerifyRequest,
    OwnerFeedbackRequest,
    AiMatchingSettingResponse,
    AiMatchingSettingUpdate
)
from app.utils.audit import log_activity
from app.utils.auth import decode_access_token, get_current_user, get_current_staff_or_admin, verify_subdivision_scope
from app.utils.case_review import (
    CROSS_SUBDIVISION_NOTE, is_cross_subdivision, require_cross_subdivision_reviewer, require_review_permission,
)
from app.utils.case_groups import (
    confirm_report_match,
    case_members,
    case_pet_claims,
    active_case_for_pet,
    case_root,
    match_identity_lock,
    active_case_lock,
    pet_conflict_for_case,
    preview_report_match,
    reject_report_match,
    release_inherited_pet,
    resync_case_pet_identity,
    COVERED_STATUS,
    SUPERSEDED_STATUS,
    PENDING_MATCH_STATUSES,
    case_confirmed_match,
    root_ids,
    pick_case_claim,
    live_claim,
)


def _require_merge_notes(notes: Optional[str]) -> str:
    from app.routes.reports import _require_merge_notes as require
    return require(notes)

# Statuses representing closed, resolved, terminal, impounded, or consolidated cases
RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]

# Thresholds for saving AI suggestions
PET_MATCH_MIN_SCORE = 50
DUPLICATE_MIN_SCORE = 65
DUPLICATE_RADIUS_KM = 1.5
DUPLICATE_WINDOW_DAYS = 7
# Gemini Vision is only called for the strongest candidates per scan (ranked by the free rule-based score);
# the rest keep their rule-based result. Keeps a scan fast and bounded no matter how many pets are registered.
VISION_CANDIDATES_PER_SCAN = 10


def _distance_km(lat1, lng1, lat2, lng2) -> float:
    """Great-circle (haversine) distance in km."""
    import math
    r = 6371.0
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dp = p2 - p1
    dl = math.radians(float(lng2) - float(lng1))
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _known(v) -> str:
    """Attribute value, or '' when it is missing / a placeholder (so it can never earn match points)."""
    t = (v or "").strip()
    return "" if t.lower() in ("", "unknown", "none", "n/a", "uniform") else t

router = APIRouter(
    prefix="/matches",
    tags=["matches"]
)


# ── Access control for match records ────────────────────────────────────────
# Match records embed full reports and pet records (owner phone / email / address, the pet's registered address and
# emergency contact), so every read needs a logged-in user and is scoped by role.

def _report_in_staff_scope(user: User, rep: Optional[Report], db: Session) -> bool:
    if rep is None:
        return False
    return verify_subdivision_scope(user, rep.subdivision_id, db=db, raise_exception=False)


def _match_visible_to(user: User, m: ReportMatch, db: Session) -> bool:
    if user.role_id == 4:
        return True
    if user.role_id in (2, 3):
        return _report_in_staff_scope(user, m.source_report, db) or _report_in_staff_scope(user, m.matched_report, db)
    # Residents: the reporter of either report, or the owner of the matched pet
    if m.source_report is not None and m.source_report.user_id == user.user_id:
        return True
    if m.matched_report is not None and m.matched_report.user_id == user.user_id:
        return True
    return bool(m.matched_pet is not None and m.matched_pet.owner_id == user.user_id)


_REPORT_PRIVATE = ("owner_phone", "owner_email", "owner_address", "reporter_phone", "reporter_email", "contact_number")
_PET_PRIVATE = ("registered_address", "registered_latitude", "registered_longitude", "emergency_contact_name", "emergency_contact_phone")


def _redact_for_resident(resp: ReportMatchResponse, user: User) -> ReportMatchResponse:
    """A resident only sees contact details that are their own."""
    for rep_obj in (resp.source_report, resp.matched_report):
        if rep_obj is None:
            continue
        # owner_* fields describe the registered pet's owner; keep them only for that owner
        if getattr(rep_obj, "owner_id", None) != user.user_id:
            for k in _REPORT_PRIVATE:
                if hasattr(rep_obj, k):
                    setattr(rep_obj, k, None)
    pet = resp.matched_pet
    if pet is not None and getattr(pet, "owner_id", None) != user.user_id:
        for k in _PET_PRIVATE:
            if hasattr(pet, k):
                setattr(pet, k, None)
        if pet.owner is not None:
            pet.owner.email = ""
            pet.owner.phone = None
            pet.owner.address = None
            pet.owner.latitude = None
            pet.owner.longitude = None
    return resp


def _serialize_with_case_confirmation(matches: List[ReportMatch], report_id: Optional[int], user: User, db: Session,
                                      status_filter: Optional[str] = None) -> List[ReportMatchResponse]:
    """
    A report's own pet matches, plus (when it belongs to a case confirmed on another report) that confirmation,
    marked via_case_report_id, so every report of the case shows the same confirmed identity.
    """
    out = _serialize_matches(matches, user, db)
    if report_id is None or status_filter not in (None, "", "CONFIRMED_MATCH"):
        return out
    rep_obj = db.get(Report, report_id)
    if rep_obj is None:
        return out
    conf = case_confirmed_match(db, case_members(db, case_root(db, rep_obj)))
    if conf is None or conf.source_report_id == report_id or any(m.match_id == conf.match_id for m in matches):
        return out
    extra = _serialize_matches([conf], user, db)
    from app.models.report_dispute import ReportDispute
    disputed = db.query(ReportDispute.dispute_id).filter(
        ReportDispute.report_id == report_id, ReportDispute.dispute_type == "wrong_identity", ReportDispute.status == "Pending"
    ).first() is not None
    for e in extra:
        e.via_case_report_id = conf.source_report_id
        e.case_identity_disputed = disputed
    return extra + out


def _serialize_matches(matches: List[ReportMatch], user: User, db: Session) -> List[ReportMatchResponse]:
    out = []
    for m in matches:
        if not _match_visible_to(user, m, db):
            continue
        resp = ReportMatchResponse.model_validate(m)
        if user.role_id != 1:
            resp.identity_lock_reason = match_identity_lock(db, m)
            if (not resp.identity_lock_reason and user.role_id == 2 and m.matched_report_id
                    and m.status in PENDING_MATCH_STATUSES and is_cross_subdivision([m.source_report, m.matched_report])):
                resp.identity_lock_reason = CROSS_SUBDIVISION_NOTE
            if resp.identity_lock_reason:
                active = active_case_lock(db, m)
                resp.separate_incident_case_id = active["root"].report_id if active else None
        out.append(_redact_for_resident(resp, user) if user.role_id == 1 else resp)
    return out


def is_ownerless_pet_match(match: ReportMatch) -> bool:
    """The matched registered pet is a community animal with no owner, so there is no owner to confirm."""
    pet = match.matched_pet
    return match.matched_pet_id is not None and pet is not None and not pet.owner_id


def is_pet_match_fully_confirmed(match: ReportMatch) -> bool:
    """
    A registered-pet match is only official once BOTH staff and the pet owner have confirmed it.
    For a pet with no owner (community animal), the staff confirmation alone is sufficient.
    """
    if match.matched_pet_id is None or match.status != "CONFIRMED_MATCH":
        return False
    return is_ownerless_pet_match(match) or match.owner_confirmation_status == "OWNER_CONFIRMED"


def link_confirmed_pet_match(match: ReportMatch, db: Session, actor: User) -> bool:
    """
    Links the sighting report to the registered pet record once both confirmations exist.
    The pet record's incident history is built from reports whose pet_id points at the pet,
    so setting report.pet_id is what makes the sighting appear in the pet's records.
    Returns True if a new link was created.
    """
    if not is_pet_match_fully_confirmed(match):
        return False

    report = match.source_report
    pet = match.matched_pet
    if not report or not pet or report.pet_id == pet.pet_id:
        return False
    # One case, one registered pet: never link a second identity (e.g. legacy double confirmations).
    if pet_conflict_for_case(db, report, pet.pet_id):
        return False

    ownerless = is_ownerless_pet_match(match)
    report.pet_id = pet.pet_id
    report.is_possible_owned = not ownerless
    db.flush()

    confirmed_by = (
        "the reviewing official (community animal with no registered owner)"
        if ownerless else "both the reviewing official and the pet owner"
    )
    db.add(StatusHistory(
        report_id=report.report_id,
        updated_by=actor.user_id,
        remarks=(
            f"Sighting linked to registered pet '{pet.display_name}' "
            f"after confirmation by {confirmed_by}."
        )
    ))

    db.add(PetHistory(
        pet_id=pet.pet_id,
        event_type="SIGHTING_MATCH_CONFIRMED",
        title=f"Sighting Confirmed — Report #{report.report_id}",
        description=(
            f"Report #{report.report_id} was confirmed as {pet.display_name} by {confirmed_by}. "
            f"Staff notes: {match.verification_notes or 'None'}."
            + ("" if ownerless else f" Owner notes: {match.owner_notes or 'None'}.")
        ),
        recovery_method="AI Potential Match",
        actor_id=actor.user_id,
        actor_name=actor.name,
        actor_role="Owner" if actor.user_id == pet.owner_id else (match.reviewer_role or "Staff"),
        previous_status=pet.status,
        new_status=pet.status,
        location_name=report.landmark,
        latitude=report.latitude,
        longitude=report.longitude,
    ))

    if pet.owner_id:
        db.add(Notification(
            user_id=pet.owner_id,
            title=f"🐾 Sighting Linked to {pet.display_name}'s Record",
            message=(
                f"Report #{report.report_id} has been confirmed by both you and the reviewing official "
                f"and is now linked to {pet.display_name}'s pet record."
            ),
            type="potential_match",
            related_id=report.report_id
        ))

    if report.user_id and report.user_id != pet.owner_id:
        db.add(Notification(
            user_id=report.user_id,
            title="Animal Match Confirmed",
            message=(
                f"The animal in your Report #{report.report_id} was confirmed as the registered community animal '{pet.display_name}'."
                if ownerless else
                f"The animal in your Report #{report.report_id} was confirmed as a registered pet and its owner has been identified."
            ),
            type="status_update",
            related_id=report.report_id
        ))

    # Every other report of the case now shares this confirmed identity (no second confirmation)
    resync_case_pet_identity(db, report, actor)

    if match.reviewed_by and match.reviewed_by != actor.user_id:
        db.add(Notification(
            user_id=match.reviewed_by,
            title=f"Pet Match Linked: Report #{report.report_id}",
            message=f"Both confirmations are complete. Report #{report.report_id} is now linked to '{pet.display_name}'.",
            type="potential_match",
            related_id=report.report_id
        ))

    return True


def is_pet_match_disputed(match: ReportMatch) -> bool:
    """Staff and owner did not both agree: the owner rejected it, or staff marked it Not a Match."""
    return match.matched_pet_id is not None and (
        match.owner_confirmation_status == "OWNER_REJECTED" or match.status == "NOT_A_MATCH"
    )


def unlink_pet_match(match: ReportMatch, db: Session, actor: User, reason: str, actor_role: str) -> bool:
    """
    Removes a report -> pet link for a match that was not agreed by both sides.
    Clearing report.pet_id removes the sighting from that pet's records and re-enables
    'Add Record for this Animal' so the animal can be registered as a new animal.
    Returns True if a link was removed.
    """
    report = match.source_report
    pet = match.matched_pet
    if not report or not pet or report.pet_id != pet.pet_id:
        return False

    report.pet_id = None
    report.is_possible_owned = False

    db.add(StatusHistory(
        report_id=report.report_id,
        updated_by=actor.user_id,
        remarks=(
            f"{reason} Link to registered pet '{pet.display_name}' removed — "
            f"this animal will be recorded as a new animal."
        )
    ))
    db.add(PetHistory(
        pet_id=pet.pet_id,
        event_type="SIGHTING_MATCH_UNLINKED",
        title=f"Sighting Unlinked — Report #{report.report_id}",
        description=f"{reason} The sighting in Report #{report.report_id} was removed from {pet.display_name}'s record.",
        recovery_method="AI Potential Match",
        actor_id=actor.user_id,
        actor_name=actor.name,
        actor_role=actor_role,
        previous_status=pet.status,
        new_status=pet.status,
        location_name=report.landmark,
        latitude=report.latitude,
        longitude=report.longitude,
    ))
    db.flush()
    resync_case_pet_identity(db, report, actor)
    return True


def get_actor_user(req: Request, db: Session) -> Optional[User]:
    """Helper to resolve current acting user from Authorization header or x-user-id."""
    token = None
    auth_header = req.headers.get("Authorization") or req.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif "token" in req.query_params:
        token = req.query_params.get("token")

    if token:
        payload = decode_access_token(token)
        if payload:
            uid = payload.get("user_id") or payload.get("sub")
            if uid:
                try:
                    return db.query(User).filter(User.user_id == int(uid)).first()
                except (ValueError, TypeError):
                    pass

    # Header fallback
    actor_id_str = req.headers.get("x-user-id") or req.headers.get("X-User-Id")
    if actor_id_str:
        try:
            return db.query(User).filter(User.user_id == int(actor_id_str)).first()
        except ValueError:
            pass

    return None


def is_gemini_vision_enabled(db: Optional[Session]) -> bool:
    """Gemini Vision matching ON, or attribute-only mode. Same Admin setting and rules as every other Gemini call."""
    from app.utils.ai_suggestions import is_gemini_enabled_in_db
    return is_gemini_enabled_in_db(db)


from app.utils.ai_matching import (
    COLOR_FAMILIES,
    get_color_family,
    parse_colors,
    fetch_image_for_entity,
    compare_animals_vision,
    compare_animals_vision_cached,
    compare_animals_rule_based
)


def calculate_match_details(
    source_report: Report,
    candidate: Any,  # Either Report or Pet
    is_pet: bool = False,
    db: Optional[Session] = None,
    allow_vision: bool = True
) -> Dict[str, Any]:
    """
    Computes a multi-factor similarity score (0-100%). It is a suggestion for staff, not a measured accuracy
    and generates structured AI visual evidence points.
    
    CORE MANDATE: INDIVIDUAL VISUAL IDENTITY > BREED / GENERIC SIMILARITY
    - The AI determines: "Do these images appear to show the SAME INDIVIDUAL ANIMAL?"
    - "Same Breed" (e.g. Aspin + Dog) does NOT equate to the same individual animal.
    - Prioritizes face/muzzle shape, ear posture, exact coat color distribution, 
      patches, facial markings, and distinctive scars/markings.
    - Obvious visual contradictions heavily reduce match confidence.
    """
    # 1. Animal Type Check (Hard gatekeeper)
    src_type = (source_report.animal_type or source_report.ai_animal_type or "Unknown").lower().strip()
    if is_pet:
        cand_type = (candidate.pet_type or "Unknown").lower().strip()
        cand_status = (candidate.status or "Active").lower().strip()
        cand_name = candidate.display_name
    else:
        cand_type = (candidate.animal_type or candidate.ai_animal_type or "Unknown").lower().strip()
        cand_status = "deceased" if candidate.current_status_id == 12 else "active"
        cand_name = f"Report #{candidate.report_id}"

    # RULE: Deceased animals must NEVER be matched
    if cand_status == "deceased":
        return {
            "score": 0,
            "evidence": None,
            "explanation": "Animal is deceased.",
            "visual_comparison": {
                "face_structure": "Different",
                "ear_structure": "Different",
                "coat_pattern": "Different",
                "facial_markings": "Different",
                "body_structure": "Different",
                "distinctive_markings": "Different",
                "final_assessment": "NOT A MATCH",
                "reason": "Animal is deceased.",
                "visual_contradictions": ["Animal is deceased."],
                "visual_corroborations": []
            }
        }

    # Species must match or one is unknown
    type_match = (src_type == cand_type) or (src_type == "unknown") or (cand_type == "unknown")
    if not type_match and src_type != "unknown" and cand_type != "unknown":
        return {
            "score": 0,
            "evidence": None,
            "explanation": f"Species mismatch: {src_type.capitalize()} vs {cand_type.capitalize()}.",
            "visual_comparison": {
                "face_structure": "Different",
                "ear_structure": "Different",
                "coat_pattern": "Different",
                "facial_markings": "Different",
                "body_structure": "Different",
                "distinctive_markings": "Different",
                "final_assessment": "NOT A MATCH",
                "reason": f"Species mismatch: {src_type.capitalize()} vs {cand_type.capitalize()}.",
                "visual_contradictions": [f"Species mismatch: {src_type.capitalize()} vs {cand_type.capitalize()}"],
                "visual_corroborations": []
            }
        }

    # Extract metadata for both entities
    # Only values that were actually recorded take part; missing ones stay '' (no invented "Aspin"/"Medium")
    src_breed = _known(source_report.animal_breed or source_report.ai_possible_breed)
    src_color = _known(source_report.animal_color or source_report.ai_dominant_color)
    src_pattern = _known(source_report.ai_coat_pattern)
    src_size = _known(source_report.estimated_size or source_report.ai_estimated_size)
    src_desc = (source_report.description or "").strip()

    if is_pet:
        cand_breed = _known(candidate.breed)
        cand_p = _known(candidate.primary_color)
        cand_s = _known(candidate.secondary_color)
        cand_color = f"{cand_p} {cand_s}".strip() or _known(candidate.color_markings)
        cand_pattern = _known(candidate.color_markings)
        cand_size = _known(candidate.size_category)
        cand_desc = f"{candidate.distinctive_markings or ''} {candidate.color_markings or ''} {candidate.notes or ''}".strip()
    else:
        cand_breed = _known(candidate.animal_breed or candidate.ai_possible_breed)
        cand_color = _known(candidate.animal_color or candidate.ai_dominant_color)
        cand_pattern = _known(candidate.ai_coat_pattern)
        cand_size = _known(candidate.estimated_size or candidate.ai_estimated_size)
        cand_desc = (candidate.description or "").strip()

    # Geographic Proximity calculation
    s_lat = float(source_report.latitude) if source_report.latitude is not None else None
    s_lng = float(source_report.longitude) if source_report.longitude is not None else None
    cand_lat_raw = getattr(candidate, "registered_latitude", None) if is_pet else getattr(candidate, "latitude", None)
    cand_lng_raw = getattr(candidate, "registered_longitude", None) if is_pet else getattr(candidate, "longitude", None)
    c_lat = float(cand_lat_raw) if cand_lat_raw is not None else None
    c_lng = float(cand_lng_raw) if cand_lng_raw is not None else None

    dist_km = None
    dist_m = None
    if s_lat is not None and s_lng is not None and c_lat is not None and c_lng is not None:
        dist_km = round(_distance_km(s_lat, s_lng, c_lat, c_lng), 2)
        dist_m = int(dist_km * 1000)

    # Time Proximity (for duplicate reports)
    time_diff_hrs = None
    if not is_pet and getattr(source_report, "created_at", None) and getattr(candidate, "created_at", None):
        s_dt = source_report.created_at.replace(tzinfo=None) if hasattr(source_report.created_at, "tzinfo") and source_report.created_at.tzinfo else source_report.created_at
        c_dt = candidate.created_at.replace(tzinfo=None) if hasattr(candidate.created_at, "tzinfo") and candidate.created_at.tzinfo else candidate.created_at
        time_diff_hrs = abs((c_dt - s_dt).total_seconds()) / 3600.0

    src_meta = {
        "species": src_type.capitalize(),
        "breed": src_breed,
        "color": src_color,
        "coat_pattern": src_pattern,
        "size": src_size,
        "description": src_desc,
        "dist_km": dist_km,
        "dist_m": dist_m,
        "time_diff_hrs": time_diff_hrs
    }

    cand_meta = {
        "name": cand_name,
        "species": cand_type.capitalize(),
        "breed": cand_breed,
        "color": cand_color,
        "coat_pattern": cand_pattern,
        "size": cand_size,
        "description": cand_desc
    }

    # Attempt to load visual images for both subjects ONLY if Gemini Vision is enabled
    vision_result = None
    if allow_vision and is_gemini_vision_enabled(db):
        # Reuses the stored result when this exact pair of photos was already compared (e.g. on a rescan)
        vision_result = compare_animals_vision_cached(db, source_report, candidate, is_pet, src_meta, cand_meta)

    if vision_result is not None:
        # Gemini Vision successfully produced an individual biometric comparison!
        v_score = vision_result.get("individual_similarity_score", 50)
        v_assessment = vision_result.get("final_assessment", "POTENTIAL MATCH")
        v_reason = vision_result.get("reason", "Visual comparison evaluated.")
        v_contradictions = vision_result.get("visual_contradictions", [])
        v_corroborations = vision_result.get("visual_corroborations", [])

        # Build closest attributes pills
        closest_attributes = [
            {
                "attribute": "Face Structure",
                "source_value": vision_result.get("face_structure", "Evaluated"),
                "match_status": vision_result.get("face_structure", "Evaluated"),
                "is_match": vision_result.get("face_structure") in ["Similar", "Highly Similar"],
                "badge": f"👤 Face: {vision_result.get('face_structure', 'Evaluated')}"
            },
            {
                "attribute": "Ear Structure",
                "source_value": vision_result.get("ear_structure", "Evaluated"),
                "match_status": vision_result.get("ear_structure", "Evaluated"),
                "is_match": vision_result.get("ear_structure") in ["Similar", "Highly Similar"],
                "badge": f"👂 Ears: {vision_result.get('ear_structure', 'Evaluated')}"
            },
            {
                "attribute": "Coat Pattern",
                "source_value": vision_result.get("coat_pattern", "Evaluated"),
                "match_status": vision_result.get("coat_pattern", "Evaluated"),
                "is_match": vision_result.get("coat_pattern") in ["Similar", "Highly Similar"],
                "badge": f"🎨 Coat: {vision_result.get('coat_pattern', 'Evaluated')}"
            },
            {
                "attribute": "Facial Markings",
                "source_value": vision_result.get("facial_markings", "Evaluated"),
                "match_status": vision_result.get("facial_markings", "Evaluated"),
                "is_match": vision_result.get("facial_markings") in ["Similar", "Highly Similar"],
                "badge": f"✨ Markings: {vision_result.get('facial_markings', 'Evaluated')}"
            }
        ]

        # Key evidence bullets
        evidence_bullets = [f"Species: Both identified as {src_type.capitalize()}"]
        if v_corroborations:
            for c in v_corroborations[:3]:
                evidence_bullets.append(f"Matching Trait: {c}")
        if v_contradictions:
            for diff in v_contradictions[:3]:
                evidence_bullets.append(f"Visual Contradiction: {diff}")

        if dist_km is not None:
            dist_str = f"{dist_m}m apart" if dist_km < 1.0 else f"{dist_km}km apart"
            closest_attributes.append({
                "attribute": "Distance",
                "source_value": source_report.landmark or "Area",
                "candidate_value": getattr(candidate, "landmark", None) or "Area",
                "match_status": dist_str,
                "is_match": dist_km <= 0.5,
                "badge": f"📍 Location: {dist_str}"
            })
            if dist_km <= 0.5:
                evidence_bullets.append(f"Location Proximity: Sighted within {dist_m}m (Immediate vicinity)")

        visual_comparison_payload = {
            "face_structure": vision_result.get("face_structure", "Evaluated"),
            "ear_structure": vision_result.get("ear_structure", "Evaluated"),
            "coat_pattern": vision_result.get("coat_pattern", "Evaluated"),
            "facial_markings": vision_result.get("facial_markings", "Evaluated"),
            "body_structure": vision_result.get("body_structure", "Evaluated"),
            "distinctive_markings": vision_result.get("distinctive_markings", "Evaluated"),
            "final_assessment": v_assessment,
            "reason": v_reason,
            "visual_contradictions": v_contradictions,
            "visual_corroborations": v_corroborations
        }

        ai_evidence_payload = {
            "engine": "gemini_vision",
            "model": vision_result.get("_model"),
            "species_match": True,
            "animal_type": src_type.capitalize(),
            "breed_name": src_breed.title() if src_breed else "Mixed/Unknown",
            "candidate_breed": cand_breed.title() if cand_breed else "Mixed/Unknown",
            "distance_km": dist_km,
            "distance_meters": dist_m,
            "time_diff_hours": round(time_diff_hrs, 1) if time_diff_hrs is not None else None,
            "closest_attributes": closest_attributes,
            "key_evidence_bullets": evidence_bullets,
            "visual_comparison": visual_comparison_payload
        }

        return {
            "score": v_score,
            "visual_comparison": visual_comparison_payload,
            "evidence": ai_evidence_payload,
            "explanation": v_reason
        }

    # Fallback to calibrated rule-based analysis
    rule_res = compare_animals_rule_based(src_meta, cand_meta, is_pet=is_pet)
    
    # Add closest attributes pills to rule-based evidence
    closest_attributes = [
        {
            "attribute": "Species",
            "source_value": src_type.capitalize(),
            "match_status": "Exact Match",
            "is_match": True,
            "badge": f"🐾 Species: {src_type.capitalize()}"
        },
        {
            "attribute": "Breed",
            "source_value": src_breed.title(),
            "candidate_value": cand_breed.title(),
            "match_status": ("Same Breed" if src_breed.lower() == cand_breed.lower() else "Different Breed") if (src_breed and cand_breed) else "Not recorded",
            "is_match": bool(src_breed and cand_breed and src_breed.lower() == cand_breed.lower()),
            "badge": f"🐕 Breed: {src_breed.title() or 'Not recorded'}"
        },
        {
            "attribute": "Coat Color",
            "source_value": src_color.title(),
            "candidate_value": cand_color.title(),
            "match_status": "Shared Color" if rule_res["evidence"].get("color_match") else "Color Contrast",
            "is_match": bool(rule_res["evidence"].get("color_match")),
            "badge": f"🎨 Color: {src_color.title() or 'Not recorded'}"
        }
    ]
    if dist_km is not None:
        dist_str = f"{dist_m}m apart" if dist_km < 1.0 else f"{dist_km}km apart"
        closest_attributes.append({
            "attribute": "Distance",
            "source_value": source_report.landmark or "Area",
            "candidate_value": getattr(candidate, "landmark", None) or "Area",
            "match_status": dist_str,
            "is_match": dist_km <= 0.5,
            "badge": f"📍 Location: {dist_str}"
        })

    rule_res["evidence"]["closest_attributes"] = closest_attributes
    rule_res["evidence"]["engine"] = "rules"
    return rule_res



def is_pet_eligible_for_matching(pet: Pet) -> tuple[bool, str]:
    """
    Validates all mandatory eligibility criteria for a registered pet candidate:
    - Exists in registered pets records
    - Belongs to a registered user/owner who is active (not deleted or inactive/suspended)
    - Status is Active/Lost/Found/Rescued (never Deceased, Inactive, Archived, Deleted, or Unregistered)
    - Has valid pet information (pet_name, pet_type)
    - Has at least one usable pet image (photo_url, photo_front_url, photo_left_url, photo_right_url)
    """
    if not pet or not getattr(pet, "pet_id", None):
        return False, "Pet does not exist in registered pet records."

    # 1. Hard status exclusions: DECEASED, INACTIVE, ARCHIVED, DELETED, UNREGISTERED, IMPOUNDED
    status_raw = getattr(pet, "status", "") or ""
    status_clean = status_raw.strip().title()
    ineligible_statuses = {"Deceased", "Inactive", "Archived", "Deleted", "Unregistered", "Impounded"}
    if status_clean in ineligible_statuses:
        return False, f"Pet status '{status_clean}' is ineligible for matching. Impounded animals cannot be a potential match."
    
    # Must be in explicitly eligible statuses
    eligible_statuses = {"Active", "Lost", "Found", "Rescued"}
    if status_clean not in eligible_statuses:
        return False, f"Pet status '{status_clean}' is not an active/eligible status."

    # 2. Registered owner validation (if an owner is assigned, they must have an active account)
    if getattr(pet, "owner_id", None) and getattr(pet, "owner", None):
        owner = pet.owner
        owner_status = getattr(owner, "status", "Active") or "Active"
        if owner_status.strip().title() in {"Inactive", "Suspended", "Deleted"}:
            return False, f"Pet owner account is {owner_status}."

    # 3. Valid pet information
    if not getattr(pet, "pet_name", None) or not pet.pet_name.strip():
        return False, "Pet record lacks a valid name."
    if not getattr(pet, "pet_type", None) or not pet.pet_type.strip():
        return False, "Pet record lacks animal type."

    # 4. Usable matching image requirement (NO_USABLE_IMAGE exclusion)
    has_usable_image = bool(
        (pet.photo_url and pet.photo_url.strip()) or
        (pet.photo_front_url and pet.photo_front_url.strip()) or
        (pet.photo_left_url and pet.photo_left_url.strip()) or
        (pet.photo_right_url and pet.photo_right_url.strip())
    )
    if not has_usable_image:
        return False, "Pet record does not have a usable image."

    return True, "Eligible"


def _score_candidates(report: Report, candidates: List[Any], is_pet: bool, db: Session) -> Dict[int, Dict[str, Any]]:
    """
    Score every candidate with the free rule engine, then re-score only the best VISION_CANDIDATES_PER_SCAN
    with Gemini Vision. Returns {candidate_id: match_details}.
    """
    key = (lambda c: c.pet_id) if is_pet else (lambda c: c.report_id)
    results = {key(c): calculate_match_details(report, c, is_pet=is_pet, db=db, allow_vision=False) for c in candidates}
    if candidates and is_gemini_vision_enabled(db):
        ranked = sorted(candidates, key=lambda c: results[key(c)]["score"], reverse=True)
        for c in ranked[:VISION_CANDIDATES_PER_SCAN]:
            if results[key(c)]["score"] <= 0:  # hard gate (species mismatch / deceased)
                continue
            results[key(c)] = calculate_match_details(report, c, is_pet=is_pet, db=db, allow_vision=True)
    return results


def scan_and_generate_matches_for_report(report_id: int, db: Session) -> List[ReportMatch]:
    """Look-alike + duplicate scan for one report. Each image is downloaded at most once per scan."""
    from app.utils.ai_pipeline import begin_scan_image_cache, end_scan_image_cache
    token = begin_scan_image_cache()
    try:
        return _scan_and_generate_matches_for_report(report_id, db)
    finally:
        end_scan_image_cache(token)


def _scan_and_generate_matches_for_report(report_id: int, db: Session) -> List[ReportMatch]:
    """
    Scans:
    1. All eligible registered pets against a given report (registered pet look-alike detection).
    2. Other active stray reports within same subdivision / geographic radius for duplicate sightings (Phase 2).
    
    Strictly adheres to:
    - Individual Visual Identity > Breed / Generic Similarity
    - Excludes reports that have reached report status 8 (Impounded) or terminal states.
    - Preserves animals in Holding Facility (facility_status 1-7).
    """
    report = db.query(Report).options(
        joinedload(Report.media),
        joinedload(Report.category),
        joinedload(Report.reporter)
    ).filter(Report.report_id == report_id).first()

    if not report or report.current_status_id in RESOLVED_STATUS_IDS or report.duplicate_of_report_id or report.custody_status == "Impounded":
        return []

    # Gather previous unreviewed AI_SUGGESTED records for this report so we can update them in-place (upsert)
    # rather than deleting and re-creating with new auto-increment IDs. This prevents 404 errors for
    # users actively reviewing matches, keeps chat threads intact, and avoids race conditions with background AI workers.
    # Preserves any human verified records (CONFIRMED_MATCH, NOT_A_MATCH, UNABLE_TO_VERIFY)
    # and any suggestion the pet owner has already responded to (needed for two-way confirmation).
    existing_unreviewed = db.query(ReportMatch).filter(
        ReportMatch.status == "AI_SUGGESTED",
        ReportMatch.owner_confirmation_status == "PENDING",
        or_(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_report_id == report.report_id
        )
    ).all()

    existing_by_pet: Dict[int, ReportMatch] = {}
    existing_by_report: Dict[int, ReportMatch] = {}
    for m in existing_unreviewed:
        if m.source_report_id == report.report_id:
            if m.matched_pet_id:
                existing_by_pet[m.matched_pet_id] = m
            elif m.matched_report_id:
                existing_by_report[m.matched_report_id] = m
        elif m.matched_report_id == report.report_id and m.source_report_id:
            existing_by_report[m.source_report_id] = m

    matched_pet_ids = set()
    matched_report_ids = set()
    created_matches = []
    case_hints = []  # (active case, pet, score): pets already confirmed in another active case

    # ── PART 1: Compare Against Eligible Registered Pets ──
    pet_query = db.query(Pet).options(
        joinedload(Pet.owner)
    ).filter(Pet.status.in_(["Active", "Lost", "Found", "Rescued"]), Pet.status != "Impounded")

    if report.animal_type and report.animal_type.strip().lower() in ["dog", "cat"]:
        pet_query = pet_query.filter(Pet.pet_type.ilike(report.animal_type.strip()))

    # A report already linked to a registered pet (e.g. an owner's own Lost Pet report, or a two-way
    # confirmed sighting) already has its identity — don't suggest other registered pets for it.
    # The same holds once any report in its case is tied to a pet (linked, or staff-confirmed awaiting the owner).
    case_has_pet = bool(report.pet_id) or bool(case_pet_claims(db, case_members(db, case_root(db, report))))
    all_registered_pets = [] if case_has_pet else pet_query.all()

    # Pre-load all pet matches for this report that survived cleanup (human-verified or owner-responded)
    human_verified_pet_ids = set(
        row[0] for row in db.query(ReportMatch.matched_pet_id).filter(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_pet_id.isnot(None),
            or_(
                ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
                ReportMatch.owner_confirmation_status != "PENDING"
            )
        ).all()
    )

    eligible_pets = [
        p for p in all_registered_pets
        if is_pet_eligible_for_matching(p)[0] and report.pet_id != p.pet_id and p.pet_id not in human_verified_pet_ids
    ]
    pet_results = _score_candidates(report, eligible_pets, is_pet=True, db=db)

    for pet in eligible_pets:
        match_calc = pet_results[pet.pet_id]
        v_assessment = match_calc.get("visual_comparison", {}).get("final_assessment", "POTENTIAL MATCH")
        
        # Only suggest if score >= 50 AND assessment is NOT a contradiction / NOT A MATCH
        if match_calc["score"] >= PET_MATCH_MIN_SCORE and v_assessment not in ["NOT A MATCH", "LOW CONFIDENCE"] and match_calc.get("evidence"):
            matched_pet_ids.add(pet.pet_id)
            if pet.pet_id in existing_by_pet:
                new_match = existing_by_pet[pet.pet_id]
                new_match.similarity_score = match_calc["score"]
                new_match.ai_explanation = match_calc["explanation"]
                new_match.ai_evidence = match_calc["evidence"]
                new_match.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                new_match = ReportMatch(
                    source_report_id=report.report_id,
                    matched_pet_id=pet.pet_id,
                    similarity_score=match_calc["score"],
                    status="AI_SUGGESTED",
                    ai_explanation=match_calc["explanation"],
                    ai_evidence=match_calc["evidence"]
                )
                db.add(new_match)
                db.flush()
            created_matches.append(new_match)

            # The pet is already confirmed in another active case: don't ask the owner again, point staff to that case
            active = None
            if not getattr(report, "separate_incident_reason", None):
                active = active_case_for_pet(db, pet.pet_id, exclude_report=report)
            if active is not None:
                case_hints.append((active, pet, match_calc["score"]))
                if (pet.status or "").lower() == "lost" and pet.owner_id and pet.owner_id != report.user_id:
                    lost_title = f"👀 Possible New Sighting of {pet.display_name} (Report #{report.report_id})"
                    if not db.query(Notification.notification_id).filter(
                            Notification.user_id == pet.owner_id, Notification.related_id == report.report_id,
                            Notification.title == lost_title).first():
                        db.add(Notification(
                            user_id=pet.owner_id, title=lost_title, type="status_update", related_id=report.report_id,
                            message=(f"Possible new sighting of {pet.display_name} (Report #{report.report_id}), not yet verified by staff. "
                                     f"No action needed. We'll update you once it's checked."),
                        ))
                continue

            # Notify the pet owner once per report/pet pair (rescans must not re-notify)
            if pet.owner_id and pet.owner_id != report.user_id:
                already_notified = db.query(Notification.notification_id).filter(
                    Notification.user_id == pet.owner_id,
                    Notification.type == "potential_match",
                    Notification.related_id == report.report_id,
                    Notification.message.contains(f"'{pet.display_name}'")
                ).first()
                if not already_notified:
                    db.add(Notification(
                        user_id=pet.owner_id,
                        title=f"🔍 Look-Alike Pet Sighting Detected (Report #{report.report_id})",
                        message=(
                            f"AI identified a {match_calc['score']}% look-alike match for your registered pet '{pet.display_name}' "
                            f"in Report #{report.report_id}. Please review the sighting and confirm whether it is your pet. "
                            f"It will only be added to your pet's record after both you and a reviewing official confirm it."
                        ),
                        type="potential_match",
                        related_id=report.report_id
                    ))

    # ── PART 2: Compare Against Other Active Stray Reports for Duplicate Sightings (Phase 2) ──
    if True:  # every report is checked for duplicates, even when its species is not identified yet
        report_dt = report.created_at.replace(tzinfo=None) if hasattr(report.created_at, "tzinfo") and report.created_at.tzinfo else (report.created_at or datetime.now())
        window_start = report_dt - timedelta(days=DUPLICATE_WINDOW_DAYS)
        window_end = report_dt + timedelta(days=DUPLICATE_WINDOW_DAYS)
        src_species = (report.animal_type or report.ai_animal_type or "").strip().lower()
        # Same species, or either side not yet identified (the species gate in the scorer still rejects Dog vs Cat)
        species_filter = (
            or_(func.lower(Report.animal_type) == src_species, Report.animal_type.is_(None), func.lower(Report.animal_type) == "unknown")
            if src_species in ("dog", "cat") else True
        )
        cand_reports = db.query(Report).options(
            joinedload(Report.media),
            joinedload(Report.category),
            joinedload(Report.reporter)
        ).filter(
            Report.report_id != report.report_id,
            Report.current_status_id.notin_(RESOLVED_STATUS_IDS),
            Report.duplicate_of_report_id.is_(None),
            or_(Report.custody_status.is_(None), Report.custody_status != "Impounded"),
            species_filter,
            Report.created_at >= window_start,
            Report.created_at <= window_end
        ).all()

        # Pairs a person already decided on, counted per case: a decision on any report in this case (or in the
        # candidate's case) covers the whole case, so e.g. "#3 is not #2" also stops #3 being suggested against #1.
        case_ids = [report.report_id] + [rid for (rid,) in db.query(Report.report_id).filter(Report.duplicate_of_report_id == report.report_id).all()]
        decided = db.query(ReportMatch).filter(
            ReportMatch.matched_report_id.isnot(None),
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
            or_(
                ReportMatch.source_report_id.in_(case_ids),
                ReportMatch.matched_report_id.in_(case_ids)
            )
        ).all()
        roots = root_ids(db, [x for m in decided for x in (m.source_report_id, m.matched_report_id)])
        existing_human_dup_pairs = set()
        for m in decided:
            ra, rb = roots.get(m.source_report_id, m.source_report_id), roots.get(m.matched_report_id, m.matched_report_id)
            existing_human_dup_pairs.add((ra, rb))
            existing_human_dup_pairs.add((rb, ra))

        def _near(cand) -> bool:
            if report.latitude is not None and report.longitude is not None and cand.latitude is not None and cand.longitude is not None:
                return _distance_km(report.latitude, report.longitude, cand.latitude, cand.longitude) <= DUPLICATE_RADIUS_KM
            return bool(report.subdivision_id and cand.subdivision_id and report.subdivision_id == cand.subdivision_id)

        near_cands = [
            c for c in cand_reports
            if _near(c) and (report.report_id, c.report_id) not in existing_human_dup_pairs
        ]
        dup_results = _score_candidates(report, near_cands, is_pet=False, db=db)

        for cand in near_cands:
            dup_calc = dup_results[cand.report_id]
            v_dup_assessment = dup_calc.get("visual_comparison", {}).get("final_assessment", "POTENTIAL MATCH")
            
            if dup_calc["score"] >= DUPLICATE_MIN_SCORE and v_dup_assessment not in ["NOT A MATCH", "LOW CONFIDENCE"] and dup_calc.get("evidence"):
                matched_report_ids.add(cand.report_id)
                # Prepend time proximity if within 24 hours
                if cand.created_at and report.created_at:
                    c_dt = cand.created_at.replace(tzinfo=None) if hasattr(cand.created_at, "tzinfo") and cand.created_at.tzinfo else cand.created_at
                    r_dt = report.created_at.replace(tzinfo=None) if hasattr(report.created_at, "tzinfo") and report.created_at.tzinfo else report.created_at
                    time_diff_hrs = abs((c_dt - r_dt).total_seconds()) / 3600.0
                    if time_diff_hrs <= 24:
                        hrs_str = f"{int(time_diff_hrs)}h" if time_diff_hrs >= 1 else f"{int(time_diff_hrs * 60)}m"
                        dup_calc["evidence"].setdefault("key_evidence_bullets", []).insert(
                            0, f"Time Proximity: Reported within {hrs_str} of each other"
                        )

                if cand.report_id in existing_by_report:
                    new_dup = existing_by_report[cand.report_id]
                    new_dup.similarity_score = dup_calc["score"]
                    new_dup.ai_explanation = f"Suspected duplicate sighting ({dup_calc['score']}% similarity): {dup_calc['explanation']}"
                    new_dup.ai_evidence = dup_calc["evidence"]
                    new_dup.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                else:
                    new_dup = ReportMatch(
                        source_report_id=report.report_id,
                        matched_report_id=cand.report_id,
                        similarity_score=dup_calc["score"],
                        status="AI_SUGGESTED",
                        ai_explanation=f"Suspected duplicate sighting ({dup_calc['score']}% similarity): {dup_calc['explanation']}",
                        ai_evidence=dup_calc["evidence"]
                    )
                    db.add(new_dup)
                    db.flush()
                created_matches.append(new_dup)

                # Across subdivisions: the Barangay reviews the pair; both subdivisions' leaders are told
                if is_cross_subdivision([report, cand]):
                    _notify_cross_subdivision_pair(db, report, cand)
                # Notify Subdivision Leader if report is in a subdivision (once per report pair; rescans flip direction)
                target_subd = report.subdivision_id or cand.subdivision_id
                if target_subd and not is_cross_subdivision([report, cand]):
                    pair_titles = [
                        f"⚠️ Suspected Duplicate: #{report.report_id} & #{cand.report_id}",
                        f"⚠️ Suspected Duplicate: #{cand.report_id} & #{report.report_id}",
                    ]
                    officers = db.query(User).filter(User.subdivision_id == target_subd, User.role_id == 2).all()
                    for off in officers:
                        already_alerted = db.query(Notification.notification_id).filter(
                            Notification.user_id == off.user_id,
                            Notification.title.in_(pair_titles)
                        ).first()
                        if already_alerted:
                            continue
                        db.add(Notification(
                            user_id=off.user_id,
                            title=f"⚠️ Suspected Duplicate: #{report.report_id} & #{cand.report_id}",
                            message=(
                                f"AI flagged potential duplicate sighting between Report #{report.report_id} and #{cand.report_id} "
                                f"({dup_calc['score']}% similarity). Review and confirm to merge."
                            ),
                            type="alert",
                            related_id=report.report_id
                        ))

    # ── PART 3: a pet already confirmed in another active case -> make sure staff can merge in one step ──
    for active, pet, score in case_hints:
        root = active["root"]
        pair = db.query(ReportMatch).filter(
            or_(and_(ReportMatch.source_report_id == report.report_id, ReportMatch.matched_report_id == root.report_id),
                and_(ReportMatch.source_report_id == root.report_id, ReportMatch.matched_report_id == report.report_id))
        ).first()
        if pair is None:
            pair = ReportMatch(
                source_report_id=report.report_id, matched_report_id=root.report_id, similarity_score=score, status="AI_SUGGESTED",
                ai_explanation=(f"Looks like {pet.display_name}, who is already confirmed in active Case #{root.report_id}. "
                                f"If this is the same animal, merge it into Case #{root.report_id}."),
                ai_evidence={"key_evidence_bullets": [f"Look-alike of {pet.display_name} ({score}%)",
                                                      f"{pet.display_name} is confirmed in Case #{root.report_id}"],
                             "case_hint_pet_id": pet.pet_id},
            )
            db.add(pair)
            db.flush()
            created_matches.append(pair)
        handler = root.assigned_leader_id
        hint_title = f"🔁 Possible New Sighting of {pet.display_name}: Report #{report.report_id}"
        if handler and not db.query(Notification.notification_id).filter(
                Notification.user_id == handler, Notification.related_id == report.report_id, Notification.title == hint_title).first():
            db.add(Notification(
                user_id=handler, title=hint_title, type="alert", related_id=report.report_id,
                message=(f"Report #{report.report_id} looks like {pet.display_name}, already confirmed in your Case #{root.report_id}. "
                         f"Review it and merge it into the case if it's the same animal. The owner was not asked again."),
            ))
        try:
            from app.utils.audit import log_activity as _log
            _log(db=db, action="OWNER_REQUEST_SKIPPED_CASE_CONFIRMED", target_table="reports", target_id=report.report_id,
                 description=f"Report #{report.report_id}: {pet.display_name} already confirmed in active Case #{root.report_id}; "
                             f"no owner confirmation request sent, staff pointed to the case.",
                 log_type="operation", new_values={"case": root.report_id, "pet_id": pet.pet_id}, commit=False)
        except Exception:
            pass

    from app.models.chat import ChatThread
    for p_id, old_m in existing_by_pet.items():
        if p_id not in matched_pet_ids:
            has_thread = db.query(ChatThread.thread_id).filter(ChatThread.related_id == old_m.match_id).first()
            if not has_thread:
                db.delete(old_m)

    for r_id, old_m in existing_by_report.items():
        if r_id not in matched_report_ids:
            has_thread = db.query(ChatThread.thread_id).filter(ChatThread.related_id == old_m.match_id).first()
            if not has_thread:
                db.delete(old_m)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error saving matches: {e}")

    return created_matches


@router.get("/", response_model=List[ReportMatchResponse])
def get_matches(
    subdivision_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    report_id: Optional[int] = None,
    pet_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    List all AI potential matches with eager loaded relationships.
    Server-side enforced: Only returns matches against eligible registered pets.
    """
    query = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report).joinedload(Report.media),
        joinedload(ReportMatch.source_report).joinedload(Report.category),
        joinedload(ReportMatch.source_report).joinedload(Report.reporter),
        joinedload(ReportMatch.matched_pet).joinedload(Pet.owner),
        joinedload(ReportMatch.reviewer)
    ).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(
        ReportMatch.matched_pet_id.isnot(None),
        Pet.status != "Deceased",
        Pet.status != "Impounded",
        Pet.status.in_(["Active", "Lost", "Found", "Rescued"])
    )

    if status_filter:
        query = query.filter(ReportMatch.status == status_filter)

    if report_id is not None:
        query = query.filter(ReportMatch.source_report_id == report_id)

    if pet_id is not None:
        query = query.filter(ReportMatch.matched_pet_id == pet_id)

    if subdivision_id is not None:
        query = query.join(Report, ReportMatch.source_report_id == Report.report_id).filter(
            Report.subdivision_id == subdivision_id,
            Report.current_status_id.notin_(RESOLVED_STATUS_IDS),
            or_(Report.custody_status.is_(None), Report.custody_status != "Impounded")
        )

    matches = query.order_by(desc(ReportMatch.similarity_score), desc(ReportMatch.created_at)).all()
    return _serialize_with_case_confirmation(matches, report_id, current_user, db, status_filter)


@router.get("/duplicates", response_model=List[ReportMatchResponse])
def get_duplicate_matches(
    subdivision_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    report_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    List all AI suspected duplicate report matches (Report-to-Report).
    When a report has been resolved or impounded, it will no longer appear under Suspected Duplicate Sightings.
    Both source and candidate reports must be active, ongoing, and not impounded.
    """
    SrcReport = aliased(Report)
    CandReport = aliased(Report)

    query = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report).joinedload(Report.media),
        joinedload(ReportMatch.source_report).joinedload(Report.category),
        joinedload(ReportMatch.source_report).joinedload(Report.reporter),
        joinedload(ReportMatch.matched_report).joinedload(Report.media),
        joinedload(ReportMatch.matched_report).joinedload(Report.category),
        joinedload(ReportMatch.matched_report).joinedload(Report.reporter),
        joinedload(ReportMatch.reviewer)
    ).filter(
        ReportMatch.matched_report_id.isnot(None),
        ReportMatch.matched_pet_id.is_(None)
    )

    # Exclude unreviewed AI suggestions if resolved/merged/impounded, but always retain human verified/confirmed records
    query = query.join(SrcReport, ReportMatch.source_report_id == SrcReport.report_id).filter(
        or_(
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
            and_(
                SrcReport.current_status_id.notin_(RESOLVED_STATUS_IDS),
                SrcReport.duplicate_of_report_id.is_(None),
                or_(SrcReport.custody_status.is_(None), SrcReport.custody_status != "Impounded")
            )
        )
    )
    query = query.join(CandReport, ReportMatch.matched_report_id == CandReport.report_id).filter(
        or_(
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
            and_(
                CandReport.current_status_id.notin_(RESOLVED_STATUS_IDS),
                CandReport.duplicate_of_report_id.is_(None),
                or_(CandReport.custody_status.is_(None), CandReport.custody_status != "Impounded")
            )
        )
    )

    if status_filter and status_filter != 'ALL':
        query = query.filter(ReportMatch.status == status_filter)

    if report_id is not None:
        query = query.filter(
            or_(
                ReportMatch.source_report_id == report_id,
                ReportMatch.matched_report_id == report_id
            )
        )

    if subdivision_id is not None:
        query = query.filter(
            or_(
                SrcReport.subdivision_id == subdivision_id,
                CandReport.subdivision_id == subdivision_id
            )
        )

    matches = query.order_by(desc(ReportMatch.similarity_score), desc(ReportMatch.created_at)).all()
    return _serialize_matches(matches, current_user, db)


@router.get("/duplicates/report/{report_id}", response_model=List[ReportMatchResponse])
def get_duplicates_for_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Fetch all suspected duplicate report matches involving a specific report (either as source or candidate).
    When a report has been resolved, it will no longer appear under Suspected Duplicate Sightings.
    However, if the report is still ongoing and another ongoing report exists, it will appear.
    """
    curr_rep = db.query(Report).filter(Report.report_id == report_id).first()
    if not curr_rep:
        return []

    # If report is closed/resolved (not duplicate 18) and not merged, check if any confirmed matches exist
    if curr_rep.current_status_id in [3, 9, 10, 11, 12, 14, 17] and not curr_rep.duplicate_of_report_id:
        has_confirmed = db.query(ReportMatch).filter(
            ReportMatch.matched_report_id.isnot(None),
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
            or_(ReportMatch.source_report_id == report_id, ReportMatch.matched_report_id == report_id)
        ).first()
        if not has_confirmed:
            return []

    SrcReport = aliased(Report)
    CandReport = aliased(Report)

    def build_query():
        return db.query(ReportMatch).options(
            joinedload(ReportMatch.source_report).joinedload(Report.media),
            joinedload(ReportMatch.source_report).joinedload(Report.category),
            joinedload(ReportMatch.source_report).joinedload(Report.reporter),
            joinedload(ReportMatch.matched_report).joinedload(Report.media),
            joinedload(ReportMatch.matched_report).joinedload(Report.category),
            joinedload(ReportMatch.matched_report).joinedload(Report.reporter),
            joinedload(ReportMatch.reviewer)
        ).filter(
            ReportMatch.matched_report_id.isnot(None),
            ReportMatch.matched_pet_id.is_(None),
            or_(
                ReportMatch.source_report_id == report_id,
                ReportMatch.matched_report_id == report_id
            )
        ).join(
            SrcReport, ReportMatch.source_report_id == SrcReport.report_id
        ).filter(
            or_(
                ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
                and_(
                    SrcReport.current_status_id.notin_(RESOLVED_STATUS_IDS),
                    SrcReport.duplicate_of_report_id.is_(None),
                    or_(SrcReport.custody_status.is_(None), SrcReport.custody_status != "Impounded")
                )
            )
        ).join(
            CandReport, ReportMatch.matched_report_id == CandReport.report_id
        ).filter(
            or_(
                ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
                and_(
                    CandReport.current_status_id.notin_(RESOLVED_STATUS_IDS),
                    CandReport.duplicate_of_report_id.is_(None),
                    or_(CandReport.custody_status.is_(None), CandReport.custody_status != "Impounded")
                )
            )
        ).order_by(desc(ReportMatch.similarity_score))

    matches = build_query().all()
    return _serialize_matches(matches, current_user, db)


@router.get("/settings", response_model=AiMatchingSettingResponse)
def get_ai_matching_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Retrieve current AI Matching engine mode (Google Gemini Vision vs Text Attribute Heuristics)."""
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
    if not setting:
        return AiMatchingSettingResponse(
            gemini_vision_enabled=True,
            matching_mode="vision",
            description="Toggle between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching",
            updated_at=None
        )
    return AiMatchingSettingResponse(
        gemini_vision_enabled=bool(setting.is_enabled),
        matching_mode="vision" if setting.is_enabled else "attribute_only",
        description=setting.description,
        updated_at=setting.updated_at
    )


@router.put("/settings", response_model=AiMatchingSettingResponse)
def update_ai_matching_settings(
    payload: AiMatchingSettingUpdate,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Update AI Matching engine mode (Admin Role ID 4 only).
    Enables toggling between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching
    to preserve Gemini API quota.
    """
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only System Administrators (Role Level 4) can configure AI Matching engine settings."
        )

    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "gemini_vision_matching").first()
    if not setting:
        setting = SystemSetting(
            setting_key="gemini_vision_matching",
            setting_value="vision" if payload.gemini_vision_enabled else "attribute_only",
            is_enabled=payload.gemini_vision_enabled,
            description=payload.description or "Toggle between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching",
            updated_by=current_user.user_id
        )
        db.add(setting)
    else:
        old_val = setting.is_enabled
        setting.is_enabled = payload.gemini_vision_enabled
        setting.setting_value = "vision" if payload.gemini_vision_enabled else "attribute_only"
        if payload.description:
            setting.description = payload.description
        setting.updated_by = current_user.user_id
        setting.updated_at = datetime.now()

    mode_label = "Google Gemini Vision AI (Active Biometrics)" if payload.gemini_vision_enabled else "Text & Attribute Rule Engine (Free Tier Mode - 0 Quota Used)"
    log_activity(
        db=db,
        action="UPDATE_AI_MATCHING_ENGINE_SETTING",
        target_table="system_settings",
        target_id=setting.id if getattr(setting, 'id', None) else 1,
        description=f"Admin {current_user.name} switched AI Matching Engine mode to: {mode_label}",
        user_id=current_user.user_id,
        log_type="security",
        new_values={
            "gemini_vision_enabled": payload.gemini_vision_enabled,
            "matching_mode": "vision" if payload.gemini_vision_enabled else "attribute_only"
        },
        request=req
    )

    db.commit()
    from app.utils.ai_suggestions import invalidate_gemini_setting_cache
    invalidate_gemini_setting_cache()  # takes effect on the next AI call, not after the cache expires
    db.refresh(setting)

    return AiMatchingSettingResponse(
        gemini_vision_enabled=bool(setting.is_enabled),
        matching_mode="vision" if setting.is_enabled else "attribute_only",
        description=setting.description,
        updated_at=setting.updated_at
    )


@router.get("/case-review/{report_id}")
def get_case_match_review(
    report_id: int,
    pet_id: Optional[int] = Query(None),
    match_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Consolidated Multi-Report Case Review endpoint for Pet Match Review.
    Retrieves all reports linked to the case, ordered chronologically,
    with the canonical initial claim report placed as Tab 1.
    Strictly isolated per pet and authorized only for the registered pet owner
    and jurisdictionally scoped staff.
    """
    report = db.query(Report).options(
        joinedload(Report.media),
        joinedload(Report.reporter),
        joinedload(Report.subdivision),
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    is_staff = current_user.role_id in (2, 3, 4)
    if is_staff:
        if current_user.role_id in (2, 3):
            barangay_id = (report.subdivision.barangay_id if report.subdivision else None) or getattr(report, "barangay_id", None)
            verify_subdivision_scope(
                current_user,
                resource_subdivision_id=report.subdivision_id,
                resource_barangay_id=barangay_id,
                db=db,
                raise_exception=True
            )

    root = case_root(db, report)
    members = case_members(db, root)
    member_ids = [m.report_id for m in members]

    # Resolve target registered pet
    target_pet: Optional[Pet] = None
    if pet_id:
        target_pet = db.get(Pet, pet_id)
        if not target_pet:
            raise HTTPException(status_code=404, detail="Requested pet not found")
        if not is_staff and target_pet.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied: You do not own this pet.")
    elif match_id:
        req_match = db.query(ReportMatch).options(
            joinedload(ReportMatch.matched_pet).joinedload(Pet.owner)
        ).filter(ReportMatch.match_id == match_id).first()
        if not req_match or not req_match.matched_pet_id:
            raise HTTPException(status_code=404, detail="Match record or matched pet not found")
        if req_match.source_report_id not in member_ids:
            raise HTTPException(status_code=400, detail="Match record does not belong to this case")
        target_pet = req_match.matched_pet or db.get(Pet, req_match.matched_pet_id)
        if not target_pet:
            raise HTTPException(status_code=404, detail="Matched pet not found")
        if not is_staff and target_pet.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied: You do not own this pet.")
    else:
        matches_query = db.query(ReportMatch).options(
            joinedload(ReportMatch.matched_pet).joinedload(Pet.owner)
        ).filter(
            ReportMatch.source_report_id.in_(member_ids),
            ReportMatch.matched_pet_id.isnot(None),
            ReportMatch.status != SUPERSEDED_STATUS
        )
        if not is_staff:
            matches_query = matches_query.join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(
                Pet.owner_id == current_user.user_id
            )

        case_matches = matches_query.all()
        candidate_pet_ids = list(dict.fromkeys(
            m.matched_pet_id for m in case_matches if m.matched_pet_id and (is_staff or (m.matched_pet and m.matched_pet.owner_id == current_user.user_id))
        ))

        for m_rep in members:
            if m_rep.pet_id and m_rep.pet_id not in candidate_pet_ids:
                p_obj = db.get(Pet, m_rep.pet_id)
                if p_obj and (is_staff or p_obj.owner_id == current_user.user_id):
                    candidate_pet_ids.append(m_rep.pet_id)

        # 1. Check direct matches on the requested report_id
        direct_matches = [m for m in case_matches if m.source_report_id == report.report_id]
        direct_pet_ids = list(dict.fromkeys(m.matched_pet_id for m in direct_matches if m.matched_pet_id))

        if not candidate_pet_ids:
            if not is_staff:
                raise HTTPException(status_code=403, detail="Access denied: No matching registered pet found for your account on this case.")
            target_pet = None
        elif len(candidate_pet_ids) == 1:
            target_pet = db.get(Pet, candidate_pet_ids[0])
        elif len(direct_pet_ids) == 1:
            # The requested report has exactly one matching pet for this owner
            target_pet = db.get(Pet, direct_pet_ids[0])
        else:
            # Multiple pets are potential matches: NEVER arbitrarily pick one by score or index
            raise HTTPException(
                status_code=400,
                detail="Multiple pets are potential matches for this case. Please specify pet_id to review the case for the correct pet."
            )

    if not is_staff:
        if not target_pet or target_pet.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Access denied: Only the registered pet owner or authorized staff can review this case.")

    target_pet_id = target_pet.pet_id if target_pet else None

    # Resolve canonical claim report from active PetClaims across the case
    active_claim: Optional[PetClaim] = None
    if target_pet_id:
        raw_claims = db.query(PetClaim).filter(
            PetClaim.report_id.in_(member_ids),
            PetClaim.pet_id == target_pet_id
        ).order_by(PetClaim.claim_id).all()
        live_claims = []
        for c in raw_claims:
            resolved = live_claim(db, c)
            if resolved and resolved.status != "Merged" and resolved not in live_claims:
                live_claims.append(resolved)
        active_claim = pick_case_claim(live_claims) if live_claims else None

    canonical_claim_report_id = active_claim.report_id if active_claim else root.report_id

    # Arrange reports: canonical claim report is always Tab 1, others ordered chronologically
    canonical_rep = next((m for m in members if m.report_id == canonical_claim_report_id), members[0])
    other_reps = [m for m in members if m.report_id != canonical_rep.report_id]
    other_reps.sort(key=lambda r: (r.created_at or datetime.max, r.report_id))
    ordered_reports = [canonical_rep] + other_reps

    # Load report matches for target_pet
    report_matches_by_id: Dict[int, ReportMatch] = {}
    if target_pet_id:
        rep_matches = db.query(ReportMatch).options(
            joinedload(ReportMatch.reviewer)
        ).filter(
            ReportMatch.source_report_id.in_(member_ids),
            ReportMatch.matched_pet_id == target_pet_id
        ).all()
        for rm in rep_matches:
            report_matches_by_id[rm.source_report_id] = rm

    root_match = report_matches_by_id.get(canonical_rep.report_id) or report_matches_by_id.get(root.report_id)

    tabs = []
    for idx, rep_item in enumerate(ordered_reports):
        is_initial = (idx == 0)
        tab_label = "Initial Claim" if is_initial else f"Sighting {idx + 1}"
        m_rec = report_matches_by_id.get(rep_item.report_id)
        if not m_rec and target_pet_id:
            # Ensure every sighting in the merged case has its own isolated, writable ReportMatch row
            cov_match = ReportMatch(
                source_report_id=rep_item.report_id,
                matched_pet_id=target_pet_id,
                similarity_score=root_match.similarity_score if root_match else 85,
                status=COVERED_STATUS if not is_initial else "PENDING_VERIFICATION",
                covered_by_match_id=root_match.match_id if (root_match and not is_initial) else None,
                owner_confirmation_status="PENDING",
                verification_notes=f"Linked to {target_pet.display_name if target_pet else 'pet'} via Case #{root.report_id}."
            )
            db.add(cov_match)
            db.flush()
            m_rec = cov_match
            report_matches_by_id[rep_item.report_id] = m_rec

        owner_status = m_rec.owner_confirmation_status if m_rec else ("OWNER_CONFIRMED" if is_initial and active_claim else "PENDING")
        official_status = m_rec.status if m_rec else ("COVERED_BY_CASE" if not is_initial else "PENDING_VERIFICATION")

        # Tab status indicator
        if is_initial:
            has_proof = bool(
                active_claim and (
                    active_claim.vaccine_card_url or
                    active_claim.vet_record_url or
                    active_claim.registration_record_url or
                    active_claim.additional_photos_url or
                    active_claim.evidence_url
                )
            )
            if active_claim:
                if active_claim.status in ("Handover Complete", "Pet Received"):
                    tab_status = "Officially Verified"
                elif active_claim.status == "Approved":
                    tab_status = "Claim Approved"
                elif active_claim.status == "Rejected":
                    tab_status = "Rejected"
                elif active_claim.status == "Evidence Requested":
                    tab_status = "Evidence Requested"
                elif active_claim.status == "Pending Review":
                    tab_status = "Claim Pending Review"
                elif not has_proof:
                    if owner_status == "OWNER_CONFIRMED":
                        tab_status = "Ownership Claim Incomplete"
                    elif owner_status == "OWNER_REJECTED":
                        tab_status = "Rejected"
                    elif owner_status == "UNSURE":
                        tab_status = "Unsure"
                    else:
                        tab_status = "Awaiting Response"
                else:
                    tab_status = "Claim Pending Review"
            else:
                if owner_status == "OWNER_CONFIRMED":
                    tab_status = "Ownership Claim Incomplete"
                elif owner_status == "OWNER_REJECTED":
                    tab_status = "Rejected"
                elif owner_status == "UNSURE":
                    tab_status = "Unsure"
                else:
                    tab_status = "Awaiting Response"
        else:
            if official_status == "CONFIRMED_MATCH":
                tab_status = "Officially Verified"
            elif owner_status == "OWNER_CONFIRMED":
                tab_status = "Confirmed by Owner"
            elif owner_status == "OWNER_REJECTED":
                tab_status = "Rejected"
            elif owner_status == "UNSURE":
                tab_status = "Unsure"
            else:
                tab_status = "Awaiting Response"

        media_list = [{
            "media_id": med.media_id,
            "file_url": med.file_url,
            "media_type": med.media_type
        } for med in (rep_item.media or [])]

        match_data = None
        if m_rec:
            match_data = {
                "match_id": m_rec.match_id,
                "similarity_score": m_rec.similarity_score,
                "status": m_rec.status,
                "ai_explanation": m_rec.ai_explanation,
                "ai_evidence": m_rec.ai_evidence,
                "owner_confirmation_status": m_rec.owner_confirmation_status,
                "owner_notes": m_rec.owner_notes,
                "owner_dispute_count": m_rec.owner_dispute_count,
                "covered_by_match_id": m_rec.covered_by_match_id,
                "owner_verification_requested_at": m_rec.owner_verification_requested_at.isoformat() if m_rec.owner_verification_requested_at else None,
                "owner_verification_answered_at": m_rec.owner_verification_answered_at.isoformat() if m_rec.owner_verification_answered_at else None,
                "reviewer_name": m_rec.reviewer.name if m_rec.reviewer else None,
                "reviewer_role": m_rec.reviewer_role,
                "verification_notes": m_rec.verification_notes,
                "verified_at": m_rec.verified_at.isoformat() if m_rec.verified_at else None,
            }

        rep_dict = {
            "report_id": rep_item.report_id,
            "created_at": rep_item.created_at.isoformat() if rep_item.created_at else None,
            "landmark": rep_item.landmark,
            "latitude": float(rep_item.latitude) if rep_item.latitude is not None else None,
            "longitude": float(rep_item.longitude) if rep_item.longitude is not None else None,
            "street_address": getattr(rep_item, "street_address", None) or rep_item.landmark,
            "animal_type": rep_item.animal_type or rep_item.ai_animal_type or "Dog",
            "animal_breed": rep_item.animal_breed or rep_item.ai_possible_breed or "Unknown",
            "animal_color": rep_item.animal_color or rep_item.ai_dominant_color or "Unknown",
            "animal_pattern": getattr(rep_item, "coat_pattern", None) or getattr(rep_item, "animal_pattern", None) or getattr(rep_item, "ai_coat_pattern", None) or None,
            "distinctive_markings": getattr(rep_item, "distinctive_markings", None) or getattr(rep_item, "color_markings", None) or getattr(rep_item, "ai_distinctive_markings", None) or None,
            "description": rep_item.description,
            "estimated_size": rep_item.estimated_size or "Medium",
            "priority_level": rep_item.priority_level or "Medium",
            "current_status_id": rep_item.current_status_id,
            "duplicate_of_report_id": rep_item.duplicate_of_report_id,
            "merged_at": rep_item.merged_at.isoformat() if rep_item.merged_at else None,
            "merge_notes": rep_item.merge_notes,
            "reporter_name": rep_item.reporter.name if rep_item.reporter else "Resident Reporter",
            "reporter_photo": rep_item.reporter.profile_picture if rep_item.reporter else None,
            "media": media_list
        }

        tabs.append({
            "report_id": rep_item.report_id,
            "tab_number": idx + 1,
            "tab_label": tab_label,
            "is_initial_claim": is_initial,
            "tab_status": tab_status,
            "owner_confirmation_status": owner_status,
            "official_review_status": official_status,
            "report": rep_dict,
            "match": match_data
        })

    claim_payload = None
    if active_claim:
        claim_payload = {
            "claim_id": active_claim.claim_id,
            "report_id": active_claim.report_id,
            "pet_id": active_claim.pet_id,
            "status": active_claim.status,
            "evidence_url": active_claim.evidence_url,
            "vaccine_card_url": active_claim.vaccine_card_url,
            "vet_record_url": active_claim.vet_record_url,
            "registration_record_url": active_claim.registration_record_url,
            "additional_photos_url": active_claim.additional_photos_url,
            "distinctive_markings": active_claim.distinctive_markings,
            "remarks": active_claim.remarks,
            "match_score": active_claim.match_score,
            "created_at": active_claim.created_at.isoformat() if active_claim.created_at else None,
            "updated_at": active_claim.updated_at.isoformat() if active_claim.updated_at else None,
        }

    pet_payload = None
    if target_pet:
        pet_payload = {
            "pet_id": target_pet.pet_id,
            "pet_name": target_pet.display_name,
            "pet_type": target_pet.pet_type,
            "breed": target_pet.breed,
            "gender": target_pet.gender,
            "primary_color": target_pet.primary_color,
            "secondary_color": target_pet.secondary_color,
            "tertiary_color": target_pet.tertiary_color,
            "distinctive_markings": target_pet.distinctive_markings,
            "color_markings": target_pet.color_markings,
            "photo_url": target_pet.photo_url or target_pet.photo_front_url,
            "registered_address": target_pet.registered_address,
            "registered_latitude": float(target_pet.registered_latitude) if target_pet.registered_latitude is not None else None,
            "registered_longitude": float(target_pet.registered_longitude) if target_pet.registered_longitude is not None else None,
            "status": target_pet.status,
            "owner_id": target_pet.owner_id,
            "owner": {
                "name": target_pet.owner.name if target_pet.owner else "Owner",
                "email": target_pet.owner.email if target_pet.owner and (is_staff or target_pet.owner_id == current_user.user_id) else None,
                "phone": target_pet.owner.phone if target_pet.owner and (is_staff or target_pet.owner_id == current_user.user_id) else None,
            } if target_pet.owner else None
        }

    has_valid_claim_proof = bool(
        active_claim and (
            active_claim.vaccine_card_url or
            active_claim.vet_record_url or
            active_claim.registration_record_url or
            active_claim.additional_photos_url or
            active_claim.evidence_url or
            active_claim.status in ("Approved", "Handover Complete", "Pet Received")
        ) and active_claim.status not in ("Rejected", "Merged")
    )
    canonical_match_record = report_matches_by_id.get(canonical_claim_report_id) or root_match
    initial_claim_completed = bool(
        has_valid_claim_proof and (
            not canonical_match_record or canonical_match_record.owner_confirmation_status != "OWNER_REJECTED"
        )
    )

    db.commit()

    return {
        "case_root_id": root.report_id,
        "canonical_claim_report_id": canonical_claim_report_id,
        "is_merged_case": len(tabs) > 1,
        "initial_claim_completed": initial_claim_completed,
        "pet": pet_payload,
        "claim": claim_payload,
        "reports": tabs
    }


@router.get("/{match_id}", response_model=ReportMatchResponse)
def get_match_by_id(match_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get single match with complete side-by-side evidence."""
    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report).joinedload(Report.media),
        joinedload(ReportMatch.source_report).joinedload(Report.category),
        joinedload(ReportMatch.source_report).joinedload(Report.reporter),
        joinedload(ReportMatch.matched_report).joinedload(Report.media),
        joinedload(ReportMatch.matched_report).joinedload(Report.category),
        joinedload(ReportMatch.matched_report).joinedload(Report.reporter),
        joinedload(ReportMatch.matched_pet).joinedload(Pet.owner),
        joinedload(ReportMatch.reviewer)
    ).filter(ReportMatch.match_id == match_id).first()

    if not match or not _match_visible_to(current_user, match, db):
        raise HTTPException(status_code=404, detail="Potential match record not found")
    return _serialize_matches([match], current_user, db)[0]


@router.get("/report/{report_id}", response_model=List[ReportMatchResponse])
def get_matches_for_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch all registered pet matches involving a specific report."""
    matches = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report).joinedload(Report.media),
        joinedload(ReportMatch.source_report).joinedload(Report.reporter),
        joinedload(ReportMatch.matched_pet).joinedload(Pet.owner),
        joinedload(ReportMatch.reviewer)
    ).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(
        ReportMatch.source_report_id == report_id,
        ReportMatch.matched_pet_id.isnot(None),
        Pet.status != "Deceased",
        Pet.status.in_(["Active", "Lost", "Found", "Rescued"])
    ).order_by(desc(ReportMatch.similarity_score)).all()

    return _serialize_with_case_confirmation(matches, report_id, current_user, db)


@router.get("/{match_id}/case-preview")
def preview_match_decision(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """What clicking Matched on a report-to-report suggestion would do (join, combine, or already one case)."""
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")
    if not (match.source_report and match.matched_report):
        raise HTTPException(status_code=400, detail="Only report-to-report suggestions have a case preview.")
    require_review_permission(current_user, match.source_report, db)
    return preview_report_match(db, current_user, match)


def _notify_cross_subdivision_pair(db: Session, a: Report, b: Report) -> None:
    """A suspected duplicate across a subdivision border: Barangay staff review it, both leaders are informed. Once."""
    from app.models.user import Subdivision
    titles = [f"🔀 Cross-Subdivision Duplicate: #{a.report_id} & #{b.report_id}",
              f"🔀 Cross-Subdivision Duplicate: #{b.report_id} & #{a.report_id}"]
    subds = {s.subdivision_id: s for s in db.query(Subdivision).filter(Subdivision.subdivision_id.in_([a.subdivision_id, b.subdivision_id])).all()}
    name = lambda r: subds[r.subdivision_id].subdivision_name if r.subdivision_id in subds else f"Subdivision #{r.subdivision_id}"  # noqa: E731
    brgys = {subds[s].barangay_id for s in subds}
    staff = db.query(User).filter(User.role_id == 3, User.barangay_id.in_(brgys)).all() if brgys else []
    leaders = db.query(User).filter(User.role_id == 2, User.subdivision_id.in_([a.subdivision_id, b.subdivision_id])).all()
    for u in staff + leaders:
        if db.query(Notification.notification_id).filter(Notification.user_id == u.user_id, Notification.title.in_(titles)).first():
            continue
        is_staff = u.role_id == 3
        db.add(Notification(
            user_id=u.user_id, title=titles[0], type="alert", related_id=a.report_id,
            message=(f"Report #{a.report_id} ({name(a)}) and Report #{b.report_id} ({name(b)}) may be the same animal. "
                     + ("Please review the pair and merge it if it's the same animal." if is_staff
                        else "The reports are in different subdivisions, so the Barangay reviews this pair.")),
        ))
    db.flush()


def _verify_snapshot(db: Session, match: ReportMatch) -> dict:
    """Which record a match decision touches, for the audit log: the report's pet link, its case and the owner's answer."""
    db.flush()
    report = db.query(Report).filter(Report.report_id == match.source_report_id).first()
    root = case_root(db, report) if report else None
    return {
        "report_id": match.source_report_id,
        "report_pet_id": report.pet_id if report else None,
        "case_id": root.report_id if root else None,
        "matched_pet_id": match.matched_pet_id,
        "matched_report_id": match.matched_report_id,
        "owner_confirmation_status": match.owner_confirmation_status,
    }


@router.post("/{match_id}/verify", response_model=ReportMatchResponse)
@router.put("/{match_id}/verify", response_model=ReportMatchResponse)
def verify_match(
    match_id: int,
    payload: ReportMatchVerifyRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Staff Verification Endpoint:
    - Decisions: CONFIRMED_MATCH, NOT_A_MATCH, UNABLE_TO_VERIFY
    - Requires mandatory verification explanation notes
    - Enforces role permissions (Leader/Staff/Admin)
    - Records comprehensive AuditLog entry
    - Dispatches notifications to relevant parties
    - Prevents duplicate AI re-matching if rejected
    """
    if payload.decision == "CONFIRMED_DUPLICATE":
        payload.decision = "CONFIRMED_MATCH"

    allowed_decisions = ["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]
    if payload.decision not in allowed_decisions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid decision '{payload.decision}'. Must be one of {allowed_decisions}."
        )

    if not payload.notes or len(payload.notes.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification notes/rationale are mandatory before submitting a decision."
        )

    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report),
        joinedload(ReportMatch.matched_report),
        joinedload(ReportMatch.matched_pet)
    ).filter(ReportMatch.match_id == match_id).first()

    if not match and payload.source_report_id:
        fallback_q = db.query(ReportMatch).options(
            joinedload(ReportMatch.source_report),
            joinedload(ReportMatch.matched_report),
            joinedload(ReportMatch.matched_pet)
        ).filter(ReportMatch.source_report_id == payload.source_report_id)
        if payload.matched_pet_id:
            match = fallback_q.filter(ReportMatch.matched_pet_id == payload.matched_pet_id).first()
        elif payload.matched_report_id:
            match = fallback_q.filter(ReportMatch.matched_report_id == payload.matched_report_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")
    cross_pair = bool(match.matched_report_id) and is_cross_subdivision([match.source_report, match.matched_report])
    if cross_pair:
        require_cross_subdivision_reviewer(current_user, [match.source_report, match.matched_report])
        for rep in (match.source_report, match.matched_report):
            verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    elif match.source_report:
        require_review_permission(current_user, match.source_report, db)
    if match.status == COVERED_STATUS:
        raise HTTPException(
            status_code=409,
            detail=f"This suggestion is covered by the case's confirmed Match #{match.covered_by_match_id}. "
                   f"It doesn't need a separate decision.",
        )
    if match.status == SUPERSEDED_STATUS:
        raise HTTPException(
            status_code=409,
            detail=f"This suggestion was superseded: the case is confirmed as another pet (Match #{match.covered_by_match_id}). "
                   f"If that is wrong, correct the case's confirmation first.",
        )

    role_names = {2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}
    actor_role = role_names.get(current_user.role_id, "Staff Official")

    # Check subdivision boundary if Subdivision Leader (role 2)
    if current_user.role_id == 2 and current_user.subdivision_id:
        src_subd = match.source_report.subdivision_id if match.source_report else None
        if src_subd and src_subd != current_user.subdivision_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subdivision Leaders can only verify reports within their designated subdivision."
            )

    prev_status = match.status
    prev_snapshot = _verify_snapshot(db, match)
    new_status = payload.decision
    is_report_pair = bool(match.source_report_id and match.matched_report_id and match.source_report and match.matched_report)

    # Decisions on report pairs apply to whole cases (see app/utils/case_groups.py). Anything refused here raises
    # before the commit, so the match decision and the merge are saved together or not at all.
    main_case_id = None
    if is_report_pair and new_status == "CONFIRMED_MATCH":
        main_case_id = confirm_report_match(db, current_user, match, _require_merge_notes(payload.notes), req, actor_role)
    elif is_report_pair and new_status == "NOT_A_MATCH":
        reject_report_match(db, current_user, match, payload.notes.strip(), actor_role)
    elif match.matched_pet_id and new_status == "CONFIRMED_MATCH" and match.source_report:
        conflict = match_identity_lock(db, match) if match.status in PENDING_MATCH_STATUSES else None
        conflict = conflict or pet_conflict_for_case(db, match.source_report, match.matched_pet_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    # Apply updates
    match.status = new_status
    match.verification_notes = payload.notes.strip()
    match.reviewed_by = current_user.user_id
    match.reviewer_role = actor_role
    match.verified_at = datetime.now(timezone.utc)

    # Registered-pet match: staff confirmation is one half of the two-way confirmation.
    # The sighting is linked to the pet record only once the owner has also confirmed.
    if match.matched_pet_id:
        pet = match.matched_pet
        report_ref = f"Report #{match.source_report_id}"
        if new_status == "CONFIRMED_MATCH":
            db.add(StatusHistory(
                report_id=match.source_report_id,
                updated_by=current_user.user_id,
                remarks=f"Pet match verified by {current_user.name} ({actor_role}): {payload.notes}"
            ))
            if not link_confirmed_pet_match(match, db, current_user) and pet and pet.owner_id:
                if match.owner_confirmation_status == "OWNER_REJECTED":
                    owner_msg = (
                        f"A reviewing official believes {report_ref} shows your pet '{pet.display_name}', but you reported it is not your pet. "
                        f"It will not be added to your pet's record unless you confirm it."
                    )
                else:
                    owner_msg = (
                        f"{current_user.name} ({actor_role}) verified that {report_ref} looks like your pet '{pet.display_name}'. "
                        f"Please open the sighting and confirm if it is your pet so it can be linked to your pet's record."
                    )
                db.add(Notification(
                    user_id=pet.owner_id,
                    title=f"🔍 Please Confirm: Is This {pet.display_name}?",
                    message=owner_msg,
                    type="potential_match",
                    related_id=match.source_report_id
                ))
        if new_status == "NOT_A_MATCH":
            unlink_pet_match(
                match, db, current_user,
                reason=f"{current_user.name} ({actor_role}) marked this sighting as Not a Match.",
                actor_role=actor_role
            )
        if new_status == "NOT_A_MATCH" and pet and pet.owner_id and match.owner_confirmation_status == "OWNER_CONFIRMED":
            db.add(Notification(
                user_id=pet.owner_id,
                title=f"Sighting Not Matched to {pet.display_name}",
                message=(
                    f"After review, {report_ref} was determined not to be '{pet.display_name}'. Notes: {payload.notes}"
                    + (" This second review is final. If you still believe it is your pet, file a formal dispute on the report."
                       if (match.owner_dispute_count or 0) >= MAX_OWNER_DISPUTES else
                       " If you believe this is your pet, open the sighting and request a second review.")
                ),
                type="potential_match",
                related_id=match.source_report_id
            ))

    # If CONFIRMED_MATCH on a report-to-report suggestion, link the duplicate reports
    elif new_status == "CONFIRMED_MATCH":
        # The reports were already linked into one case above (confirm_report_match). The merge marks this
        # suggestion with its own wording, so put the reviewer's decision back on it.
        match.status = new_status
        match.verification_notes = payload.notes.strip()
        match.reviewed_by = current_user.user_id
        match.reviewer_role = actor_role
        if match.source_report_id and match.matched_report_id:
            # Deduplicate/reconcile holding records if both reports were admitted
            src_holding = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == match.source_report_id).first()
            tgt_holding = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == match.matched_report_id).first()

            if src_holding and tgt_holding and src_holding.holding_id != tgt_holding.holding_id:
                # If target is already transferred to Barangay or further along, resolve source holding
                tgt_is_brgy = bool(tgt_holding.report and tgt_holding.report.facility and tgt_holding.report.facility.facility_type == 'barangay_facility')
                src_is_brgy = bool(src_holding.report and src_holding.report.facility and src_holding.report.facility.facility_type == 'barangay_facility')

                if tgt_is_brgy and not src_is_brgy:
                    src_holding.facility_status = 5  # Transferred to Shelter / Barangay
                    src_holding.discharge_date = datetime.now(timezone.utc).replace(tzinfo=None)
                else:
                    tgt_holding.facility_status = 5
                    tgt_holding.discharge_date = datetime.now(timezone.utc).replace(tzinfo=None)

        # Add to StatusHistory for source report
        hist = StatusHistory(
            report_id=match.source_report_id,
            remarks=f"Match confirmed by {current_user.name} ({actor_role}): {payload.notes}"
            + (f" Both reports are in Case #{main_case_id}." if main_case_id else "")
        )
        db.add(hist)
        if match.matched_report_id:
            hist_matched = StatusHistory(
                report_id=match.matched_report_id,
                remarks=f"Confirmed duplicate match with Report #{match.source_report_id} by {current_user.name} ({actor_role}): {payload.notes}"
            )
            db.add(hist_matched)

        # Notify source reporter
        if match.source_report and match.source_report.user_id:
            db.add(Notification(
                user_id=match.source_report.user_id,
                title="Animal Match Confirmed by Staff",
                message=f"Official verification: Report #{match.source_report_id} has been confirmed as a match. Note: {payload.notes}",
                type="status_update",
                related_id=match.source_report_id
            ))

    # Record Audit Log
    log_activity(
        db=db,
        action="VERIFY_AI_MATCH",
        target_table="report_matches",
        target_id=match.match_id,
        description=f"Staff {current_user.name} ({actor_role}) verified match #{match.match_id} as '{new_status}'. Notes: {payload.notes}",
        user_id=current_user.user_id,
        log_type="security",
        old_values={"status": prev_status, **prev_snapshot},
        new_values={
            "status": new_status,
            "decision": payload.decision,
            "notes": payload.notes,
            "reviewer_id": current_user.user_id,
            "reviewer_role": actor_role,
            **_verify_snapshot(db, match),
        },
        request=req
    )

    db.commit()
    db.refresh(match)
    return match


MAX_OWNER_DISPUTES = 1


def _reopen_for_owner_dispute(match: ReportMatch, remarks: Optional[str], owner: User, req: Request, db: Session) -> ReportMatch:
    """
    Owner disputes a staff Not a Match: the match goes back to Pending Verification for the reviewing official.
    Nothing is linked here; the official decides again. Allowed once, after that the owner files a formal dispute.
    """
    if match.owner_confirmation_status == "OWNER_REJECTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already said this is not your pet. Please contact your subdivision office or file a formal dispute on the report.",
        )
    if (match.owner_dispute_count or 0) >= MAX_OWNER_DISPUTES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This sighting was already reviewed again after your request and is final. "
                   "If you still believe it is your pet, file a formal dispute on the report so the Barangay can review it.",
        )
    if match.source_report and match.matched_pet_id is not None:
        conflict = pet_conflict_for_case(db, match.source_report, match.matched_pet_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)

    pet = match.matched_pet
    previous = match.verification_notes or "No notes"
    reason = (remarks or "").strip()
    match.status = "PENDING_VERIFICATION"
    match.owner_confirmation_status = "OWNER_CONFIRMED"
    match.owner_dispute_count = (match.owner_dispute_count or 0) + 1
    if reason:
        match.owner_notes = reason
    match.verification_notes = (
        f"Owner {owner.name} disputes the Not a Match decision and says this is their pet."
        + (f" Owner's reason: {reason}" if reason else "")
        + f" Previous decision ({match.reviewer_role or 'Staff'}): {previous}"
    )
    match.verified_at = None

    rep = match.source_report
    pet_name = pet.display_name if pet else "Registered Pet"
    if rep:
        db.add(StatusHistory(
            report_id=rep.report_id,
            updated_by=owner.user_id,
            remarks=f"Owner of '{pet_name}' disputed the Not a Match decision. Sent back for re-review."
                    + (f" Reason: {reason}" if reason else ""),
        ))
        recipient_ids = set()
        if match.reviewed_by:
            recipient_ids.add(match.reviewed_by)
        if rep.assigned_leader_id:
            recipient_ids.add(rep.assigned_leader_id)
        elif rep.subdivision_id:
            recipient_ids.update(
                row[0] for row in db.query(User.user_id).filter(User.subdivision_id == rep.subdivision_id, User.role_id == 2).all()
            )
        recipient_ids.discard(owner.user_id)
        for uid in recipient_ids:
            db.add(Notification(
                user_id=uid,
                title=f"⚖️ Owner Disputes Not a Match: Report #{rep.report_id}",
                message=(
                    f"{owner.name} says the animal in Report #{rep.report_id} is their pet '{pet_name}'. "
                    f"The match was reopened for your re-review. Ask for proof (photos, vet or vaccination records, QR) before deciding. "
                    f"Your next decision is final."
                    + (f" Owner's reason: {reason[:300]}" if reason else "")
                ),
                type="potential_match",
                related_id=rep.report_id,
            ))

    log_activity(
        db=db,
        action="OWNER_DISPUTE_NOT_A_MATCH",
        target_table="report_matches",
        target_id=match.match_id,
        description=f"Owner {owner.name} disputed the Not a Match decision on match #{match.match_id}; reopened for re-review.",
        user_id=owner.user_id,
        log_type="operation",
        old_values={"status": "NOT_A_MATCH", "verification_notes": previous},
        new_values={"status": "PENDING_VERIFICATION", "owner_confirmation": "OWNER_CONFIRMED",
                    "owner_dispute_count": match.owner_dispute_count, "remarks": reason or None},
        request=req,
    )
    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/owner-feedback", response_model=ReportMatchResponse)
def submit_owner_feedback(
    match_id: int,
    payload: OwnerFeedbackRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Resident / Owner Feedback Endpoint:
    Records the owner's half of the two-way confirmation without altering the official staff verification status.
    When the staff decision is already CONFIRMED_MATCH, an owner confirmation links the sighting to the pet record.
    Only the pet's owner may confirm or reject; staff may only record NO_RESPONSE.
    """
    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report),
        joinedload(ReportMatch.matched_pet)
    ).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")

    # Protection against shared match ID submission:
    # If payload.report_id is specified and differs from match.source_report_id,
    # ensure we resolve/provision the matching record for payload.report_id instead of mutating sibling/root reports.
    if payload.report_id and payload.report_id != match.source_report_id:
        target_rep = db.get(Report, payload.report_id)
        if target_rep and match.source_report and (
            case_root(db, target_rep).report_id == case_root(db, match.source_report).report_id
        ):
            target_match = db.query(ReportMatch).options(
                joinedload(ReportMatch.source_report),
                joinedload(ReportMatch.matched_pet)
            ).filter(
                ReportMatch.source_report_id == payload.report_id,
                ReportMatch.matched_pet_id == match.matched_pet_id
            ).first()
            if not target_match:
                target_match = ReportMatch(
                    source_report_id=payload.report_id,
                    matched_pet_id=match.matched_pet_id,
                    similarity_score=match.similarity_score or 85,
                    status=COVERED_STATUS,
                    covered_by_match_id=match.match_id,
                    owner_confirmation_status="PENDING",
                    verification_notes=f"Linked to pet via Case #{case_root(db, target_rep).report_id}."
                )
                db.add(target_match)
                db.flush()
                target_match = db.query(ReportMatch).options(
                    joinedload(ReportMatch.source_report),
                    joinedload(ReportMatch.matched_pet)
                ).filter(ReportMatch.match_id == target_match.match_id).first()
            if target_match:
                match = target_match

    if match.status == SUPERSEDED_STATUS:
        raise HTTPException(
            status_code=409,
            detail="Staff confirmed this sighting as a different registered pet, so no answer is needed. "
                   "If you believe it is your pet, contact your subdivision office.",
        )

    allowed = ["OWNER_CONFIRMED", "OWNER_REJECTED", "UNSURE", "NO_RESPONSE"]
    if payload.owner_confirmation not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid owner response. Must be one of {allowed}.")

    is_owner = bool(match.matched_pet and match.matched_pet.owner_id == current_user.user_id)
    is_staff = current_user.role_id in [2, 3, 4]

    # The owner half of the confirmation can only come from the pet's actual owner.
    # Staff may only record that the owner did not respond.
    if payload.owner_confirmation in ["OWNER_CONFIRMED", "OWNER_REJECTED", "UNSURE"]:
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the registered owner of this pet can confirm or reject this match."
            )
    elif not (is_owner or is_staff):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only submit feedback for your own pet."
        )

    root_rep = case_root(db, match.source_report) if match.source_report else None
    is_merged_sighting = bool(
        match.status == COVERED_STATUS or
        match.covered_by_match_id is not None or
        (match.source_report and (
            match.source_report.duplicate_of_report_id or
            match.source_report.current_status_id == 18 or
            (root_rep and root_rep.report_id != match.source_report_id)
        ))
    )

    if is_merged_sighting:
        if is_owner and payload.owner_confirmation in ["OWNER_CONFIRMED", "OWNER_REJECTED", "UNSURE"]:
            # Backend validation requirement:
            # Sighting confirmations require that the initial ownership claim has been submitted with proof.
            canonical_claim_report_id = None
            has_valid_claim_proof = False
            if root_rep and match.matched_pet_id:
                members = case_members(db, root_rep)
                member_ids = [m.report_id for m in members]
                raw_claims = db.query(PetClaim).filter(
                    PetClaim.report_id.in_(member_ids),
                    PetClaim.pet_id == match.matched_pet_id
                ).order_by(PetClaim.claim_id).all()
                live_claims = []
                for c in raw_claims:
                    resolved = live_claim(db, c)
                    if resolved and resolved.status not in ("Merged", "Rejected") and resolved not in live_claims:
                        live_claims.append(resolved)
                active_c = pick_case_claim(live_claims) if live_claims else None
                canonical_claim_report_id = active_c.report_id if active_c else root_rep.report_id

                if active_c:
                    has_proof = bool(
                        active_c.vaccine_card_url or
                        active_c.vet_record_url or
                        active_c.registration_record_url or
                        active_c.additional_photos_url or
                        active_c.evidence_url or
                        active_c.status in ("Approved", "Handover Complete", "Pet Received")
                    )
                    if has_proof:
                        has_valid_claim_proof = True

            # Verify that the canonical claim match is not OWNER_REJECTED
            canonical_match = None
            if canonical_claim_report_id and match.matched_pet_id:
                canonical_match = db.query(ReportMatch).filter(
                    ReportMatch.source_report_id == canonical_claim_report_id,
                    ReportMatch.matched_pet_id == match.matched_pet_id
                ).first()

            if (not has_valid_claim_proof) or (canonical_match and canonical_match.owner_confirmation_status == "OWNER_REJECTED"):
                initial_rep_label = f"Report #{canonical_claim_report_id}" if canonical_claim_report_id else "the initial report"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Before confirming additional sightings, please complete your initial pet ownership claim and submit the required proof of ownership in {initial_rep_label}."
                )

        match.owner_confirmation_status = payload.owner_confirmation
        if payload.remarks:
            match.owner_notes = payload.remarks.strip()

        pet_name = match.matched_pet.display_name if match.matched_pet else "Registered Pet"
        rep = match.source_report

        if payload.owner_confirmation == "OWNER_CONFIRMED":
            title = f"🐾 Merged Sighting Confirmed: Report #{match.source_report_id}"
            message = (
                f"Resident {current_user.name} confirmed that merged Report #{match.source_report_id} is their pet '{pet_name}'."
                + (f" Owner remarks: {match.owner_notes[:300]}" if match.owner_notes else "")
            )
        elif payload.owner_confirmation == "OWNER_REJECTED":
            title = f"⚠️ Merged Sighting Rejected by Owner: Report #{match.source_report_id}"
            message = (
                f"Resident {current_user.name} reported that merged Report #{match.source_report_id} is NOT their pet '{pet_name}'. "
                f"Flagged for staff review to verify the case merge."
                + (f" Owner remarks: {match.owner_notes[:300]}" if match.owner_notes else "")
            )
            if rep:
                db.add(StatusHistory(
                    report_id=rep.report_id,
                    report_status_id=rep.current_status_id,
                    updated_by=current_user.user_id,
                    remarks=f"Owner reported merged sighting is NOT their pet ({pet_name}). Flagged for staff review. Remarks: {match.owner_notes or 'None'}"
                ))
        else:  # UNSURE
            title = f"❓ Merged Sighting Response (Unsure): Report #{match.source_report_id}"
            message = (
                f"Resident {current_user.name} is unsure whether merged Report #{match.source_report_id} is their pet '{pet_name}'."
                + (f" Owner remarks: {match.owner_notes[:300]}" if match.owner_notes else "")
            )
            if rep:
                db.add(StatusHistory(
                    report_id=rep.report_id,
                    report_status_id=rep.current_status_id,
                    updated_by=current_user.user_id,
                    remarks=f"Owner marked merged sighting as UNSURE ({pet_name}). Remarks: {match.owner_notes or 'None'}"
                ))

        recipient_ids = set()
        if match.reviewed_by:
            recipient_ids.add(match.reviewed_by)
        if rep and rep.assigned_leader_id:
            recipient_ids.add(rep.assigned_leader_id)
        elif rep and rep.subdivision_id:
            recipient_ids.update(
                row[0] for row in db.query(User.user_id).filter(
                    User.subdivision_id == rep.subdivision_id,
                    User.role_id == 2
                ).all()
            )
        for uid in recipient_ids:
            db.add(Notification(
                user_id=uid,
                title=title,
                message=message,
                type="potential_match",
                related_id=match.source_report_id
            ))

        log_activity(
            db=db,
            action="OWNER_MERGED_SIGHTING_FEEDBACK",
            target_table="report_matches",
            target_id=match.match_id,
            description=f"User {current_user.name} responded to merged sighting #{match.source_report_id}: {payload.owner_confirmation}",
            user_id=current_user.user_id,
            log_type="operation",
            new_values={"owner_confirmation": payload.owner_confirmation, "remarks": payload.remarks},
            request=req
        )
        db.commit()
        db.refresh(match)
        return match

    already_linked = bool(
        match.source_report and match.matched_pet_id and match.source_report.pet_id == match.matched_pet_id
    )
    # A link the owner already confirmed (two-way) cannot be undone by the owner alone.
    if already_linked and match.owner_confirmation_status == "OWNER_CONFIRMED" and payload.owner_confirmation != "OWNER_CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already confirmed this sighting and it is linked to your pet's record. Please contact your subdivision office to dispute it."
        )

    # The owner says "this is my pet" after staff marked it Not a Match: send it back for one more human review.
    if payload.owner_confirmation == "OWNER_CONFIRMED" and match.status == "NOT_A_MATCH":
        reason = (payload.second_review_reason or "").strip()
        if len(reason) < 5:
            raise HTTPException(
                status_code=400,
                detail="Staff marked this sighting as not your pet. To ask for a second review, explain why it is your pet "
                       "(e.g. a scar, collar, or vaccination record).",
            )
        return _reopen_for_owner_dispute(match, reason, current_user, req, db)

    match.owner_confirmation_status = payload.owner_confirmation
    if payload.remarks:
        match.owner_notes = payload.remarks.strip()

    if payload.owner_confirmation == "UNSURE":
        pet_name = match.matched_pet.display_name if match.matched_pet else "Registered Pet"
        recipient_ids = set()
        if match.reviewed_by:
            recipient_ids.add(match.reviewed_by)
        if match.source_report and match.source_report.assigned_leader_id:
            recipient_ids.add(match.source_report.assigned_leader_id)
        elif match.source_report and match.source_report.subdivision_id:
            recipient_ids.update(
                row[0] for row in db.query(User.user_id).filter(
                    User.subdivision_id == match.source_report.subdivision_id,
                    User.role_id == 2
                ).all()
            )
        for uid in recipient_ids:
            db.add(Notification(
                user_id=uid,
                title=f"❓ Owner Response: Unsure (Report #{match.source_report_id})",
                message=f"Resident {current_user.name} is unsure whether Report #{match.source_report_id} is their pet '{pet_name}'."
                        + (f" Owner remarks: {match.owner_notes[:300]}" if match.owner_notes else ""),
                type="potential_match",
                related_id=match.source_report_id
            ))
        log_activity(
            db=db,
            action="OWNER_MATCH_FEEDBACK",
            target_table="report_matches",
            target_id=match.match_id,
            description=f"User {current_user.name} responded UNSURE to match #{match.match_id}",
            user_id=current_user.user_id,
            log_type="operation",
            new_values={"owner_confirmation": payload.owner_confirmation, "remarks": payload.remarks},
            request=req
        )
        db.commit()
        db.refresh(match)
        return match

    linked = link_confirmed_pet_match(match, db, current_user)

    # Owner says it's not their pet: remove any staff-only link so the animal can be recorded as a new animal.
    unlinked = False
    if payload.owner_confirmation == "OWNER_REJECTED":
        # The owner's rejection is final: the match is closed as Not a Match.
        match.status = "NOT_A_MATCH"
        match.verification_notes = (
            f"Owner {current_user.name} confirmed this is not their pet."
            + (f" Remarks: {match.owner_notes}" if match.owner_notes else "")
        )
        match.verified_at = datetime.now(timezone.utc)
        unlinked = unlink_pet_match(
            match, db, current_user,
            reason=f"Owner {current_user.name} reported this is not their pet.",
            actor_role="Owner"
        )

    # Notify the assigned handler (or subdivision leaders) about the owner's response
    if payload.owner_confirmation in ["OWNER_CONFIRMED", "OWNER_REJECTED"] and match.source_report and not linked:
        pet_name = match.matched_pet.display_name if match.matched_pet else "Registered Pet"
        if payload.owner_confirmation == "OWNER_CONFIRMED":
            title = f"🐾 Owner Confirmed Match: Report #{match.source_report_id}"
            message = (
                f"Resident {current_user.name} confirmed that the animal in Report #{match.source_report_id} is their pet '{pet_name}'. "
                f"Your verification is needed before it is linked to the pet record."
            )
        else:
            title = f"❌ Owner Rejected Match: Report #{match.source_report_id}"
            message = (
                f"Resident {current_user.name} reported that the animal in Report #{match.source_report_id} is NOT their pet '{pet_name}'. "
                f"{'The previous link to that pet record was removed. ' if unlinked else ''}"
                f"Treat it as a new animal and use 'Add Record for this Animal' on the report."
            )
            if match.owner_notes:
                message += f" Owner remarks: {match.owner_notes[:300]}"

        # Always reach the Subdivision Leader side: the handling leader if the report is claimed,
        # otherwise every leader of the report's subdivision. The staff reviewer (if any) is added too.
        recipient_ids = set()
        if match.reviewed_by:
            recipient_ids.add(match.reviewed_by)
        if match.source_report.assigned_leader_id:
            recipient_ids.add(match.source_report.assigned_leader_id)
        elif match.source_report.subdivision_id:
            recipient_ids.update(
                row[0] for row in db.query(User.user_id).filter(
                    User.subdivision_id == match.source_report.subdivision_id,
                    User.role_id == 2
                ).all()
            )
        for uid in recipient_ids:
            db.add(Notification(
                user_id=uid,
                title=title,
                message=message,
                type="potential_match",
                related_id=match.source_report_id
            ))

    # Record in audit trail as resident action
    log_activity(
        db=db,
        action="OWNER_MATCH_FEEDBACK",
        target_table="report_matches",
        target_id=match.match_id,
        description=f"User {current_user.name} submitted feedback for match #{match.match_id}: {payload.owner_confirmation}",
        user_id=current_user.user_id,
        log_type="operation",
        new_values={"owner_confirmation": payload.owner_confirmation, "remarks": payload.remarks},
        request=req
    )

    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/unlink-pet", response_model=ReportMatchResponse)
def unlink_disputed_pet_match(
    match_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Staff action for a potential pet match that staff and owner did not both agree on
    (owner rejected it, or staff marked it Not a Match). Removes any link between the report
    and the potential pet so the animal can be added as a new record. Idempotent.
    """
    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report),
        joinedload(ReportMatch.matched_pet)
    ).filter(ReportMatch.match_id == match_id).first()
    if not match or not match.matched_pet_id:
        raise HTTPException(status_code=404, detail="Pet match record not found")

    if match.source_report:
        verify_subdivision_scope(current_user, match.source_report.subdivision_id, db=db)
        require_review_permission(current_user, match.source_report, db)

    if is_pet_match_fully_confirmed(match):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Both staff and the owner confirmed this match. It cannot be unlinked to add a new record."
        )
    if not is_pet_match_disputed(match):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A new record can only be added after the owner rejects this match or it is marked Not a Match."
        )

    role_names = {2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}
    actor_role = role_names.get(current_user.role_id, "Staff Official")
    reason = (
        "Owner rejected this potential match." if match.owner_confirmation_status == "OWNER_REJECTED"
        else "Staff marked this potential match as Not a Match."
    )
    unlinked = unlink_pet_match(
        match, db, current_user,
        reason=f"{reason} Unlinked by {current_user.name} ({actor_role}) to add a new animal record.",
        actor_role=actor_role
    )

    log_activity(
        db=db,
        action="UNLINK_DISPUTED_PET_MATCH",
        target_table="report_matches",
        target_id=match.match_id,
        description=(
            f"{current_user.name} ({actor_role}) released Report #{match.source_report_id} from potential pet "
            f"#{match.matched_pet_id} to add a new animal record. Link removed: {unlinked}."
        ),
        user_id=current_user.user_id,
        log_type="operation",
        old_values={"report_pet_id": match.matched_pet_id if unlinked else None},
        new_values={"report_pet_id": None},
        request=req
    )

    db.commit()
    db.refresh(match)
    return match


class ReverseDecisionRequest(BaseModel):
    notes: str


# A case past these statuses is finished (resolved, returned, dismissed...): reopen it before changing its pet identity.
REVERSE_BLOCKED_CASE_STATUSES = [3, 9, 10, 11, 12, 14]


@router.post("/{match_id}/reverse", response_model=ReportMatchResponse)
def reverse_pet_match_decision(
    match_id: int,
    payload: ReverseDecisionRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """
    Correct a staff decision on a registered-pet look-alike:
      - Confirmed  -> Not a Match: removes the pet link from the report (and from the main case if it only came from here).
      - Not a Match (by staff) -> Pending Verification: reopens it for a fresh decision.
    Report-to-report decisions are corrected with Unmerge instead.
    """
    notes = (payload.notes or "").strip()
    if len(notes) < 10:
        raise HTTPException(status_code=400, detail="Explain why the decision is being reversed (at least 10 characters).")

    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report),
        joinedload(ReportMatch.matched_pet)
    ).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")
    if not match.matched_pet_id:
        raise HTTPException(status_code=400, detail="Duplicate-report decisions are reversed with Unmerge on the merged report.")
    report = match.source_report
    if not report:
        raise HTTPException(status_code=404, detail="The sighting report for this match no longer exists.")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)

    root = case_root(db, report)
    from app.routes.reports import require_leader_claim
    require_leader_claim(root, current_user)
    if root.current_status_id in REVERSE_BLOCKED_CASE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Case #{root.report_id} is already closed. Reopen the case before changing which pet it is.",
        )

    role_names = {2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}
    actor_role = role_names.get(current_user.role_id, "Staff Official")
    pet = match.matched_pet
    pet_label = f"'{pet.display_name}'" if pet else "the registered pet"
    old = {"status": match.status, "owner_confirmation": match.owner_confirmation_status,
           "report_pet_id": report.pet_id, "case_pet_id": root.pet_id, "verification_notes": match.verification_notes}

    if match.status == "CONFIRMED_MATCH":
        match.status = "NOT_A_MATCH"
        match.verification_notes = f"Decision reversed by {current_user.name} ({actor_role}): {notes}"
        unlink_pet_match(match, db, current_user, reason=f"Confirmed match reversed by {current_user.name} ({actor_role}): {notes}", actor_role=actor_role)
        db.flush()
        if root.report_id != report.report_id:
            release_inherited_pet(db, root, match.matched_pet_id)
        resync_case_pet_identity(db, report, current_user, req)
        summary = f"Confirmed match with {pet_label} reversed to Not a Match"
        if pet and pet.owner_id:
            db.add(Notification(
                user_id=pet.owner_id,
                title=f"Sighting Unlinked from {pet.display_name}",
                message=(
                    f"After further review, Report #{report.report_id} was determined not to be '{pet.display_name}' and was removed from its record. "
                    f"Reason: {notes[:300]}. If you believe this is your pet, open the sighting and request a second review."
                ),
                type="potential_match",
                related_id=report.report_id
            ))
    elif match.status == "NOT_A_MATCH":
        if match.owner_confirmation_status == "OWNER_REJECTED":
            raise HTTPException(status_code=409, detail="The owner said this is not their pet. That answer can't be reversed by staff.")
        match.status = "PENDING_VERIFICATION"
        match.verification_notes = f"Not a Match reversed by {current_user.name} ({actor_role}) for a fresh review: {notes}"
        summary = f"Not a Match with {pet_label} reopened for review"
    else:
        raise HTTPException(status_code=400, detail="Only a Confirmed or Not a Match decision can be reversed.")

    match.reviewed_by = current_user.user_id
    match.reviewer_role = actor_role
    match.verified_at = datetime.now(timezone.utc)
    db.add(StatusHistory(report_id=report.report_id, updated_by=current_user.user_id,
                        remarks=f"{summary} by {current_user.name} ({actor_role}). Reason: {notes}"))

    db.flush()
    log_activity(
        db=db,
        action="REVERSE_AI_MATCH_DECISION",
        target_table="report_matches",
        target_id=match.match_id,
        description=f"{current_user.name} ({actor_role}): {summary} on Report #{report.report_id}. Reason: {notes}",
        user_id=current_user.user_id,
        log_type="security",
        old_values=old,
        new_values={"status": match.status, "owner_confirmation": match.owner_confirmation_status,
                    "report_pet_id": report.pet_id, "case_pet_id": root.pet_id, "verification_notes": match.verification_notes},
        request=req
    )
    db.commit()
    db.refresh(match)
    return match


class OwnerVerificationRequest(BaseModel):
    note: str


class OwnerVerificationAnswer(BaseModel):
    answer: str  # YES | NO | UNSURE
    note: Optional[str] = None


def _verification_thread(db: Session, match: ReportMatch, actor: User):
    """The owner conversation to use: the pet's active case conversation if any, else this match's own."""
    from app.routes.chat import find_match_thread, get_or_create_match_thread
    report = match.source_report
    if report and match.matched_pet_id is not None:
        active = active_case_for_pet(db, match.matched_pet_id, exclude_report=report)
        if active is not None:
            from app.utils.case_groups import case_conversation
            thread = case_conversation(db, active["root"], match.matched_pet_id)
            if thread is not None:
                return thread
            return get_or_create_match_thread(active["match"].match_id, actor, db)
    return find_match_thread(match, db) or get_or_create_match_thread(match.match_id, actor, db)


@router.post("/{match_id}/request-owner-verification", response_model=ReportMatchResponse)
def request_owner_verification(match_id: int, payload: OwnerVerificationRequest, req: Request, db: Session = Depends(get_db),
                               current_user: User = Depends(get_current_staff_or_admin)):
    """
    Staff aren't sure a sighting is this registered pet: ask the owner to look (Yes / No / Unsure). The answer is
    evidence only; nothing is confirmed or merged by it. One open request per suggestion.
    """
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match or not match.matched_pet_id:
        raise HTTPException(status_code=404, detail="Pet match not found")
    report = match.source_report
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)
    pet = match.matched_pet
    if not pet or not pet.owner_id:
        raise HTTPException(status_code=400, detail="This pet has no registered owner to ask.")
    if match.status not in ("AI_SUGGESTED", "PENDING_VERIFICATION"):
        raise HTTPException(status_code=409, detail="This suggestion was already decided; there's nothing to verify.")
    note = (payload.note or "").strip()
    if len(note) < 10:
        raise HTTPException(status_code=400, detail="Tell the owner what you're unsure about (at least 10 characters).")
    if match.owner_verification_requested_at and not match.owner_verification_answered_at:
        return match  # one open request at a time

    match.owner_verification_requested_at = datetime.now(timezone.utc).replace(tzinfo=None)
    match.owner_verification_requested_by = current_user.user_id
    match.owner_verification_note = note
    match.owner_verification_answer = match.owner_verification_answer_note = match.owner_verification_answered_at = None
    photo = next((m.file_url for m in (report.media or []) if m.file_url and (m.media_type in ("Image", None))), None)
    thread = _verification_thread(db, match, current_user)
    from app.models.chat import ChatMessage
    db.add(ChatMessage(thread_id=thread.thread_id, sender_id=current_user.user_id, media_url=photo, is_system=False, is_read=False,
                       message_text=note))
    db.add(Notification(user_id=pet.owner_id, type="potential_match", related_id=report.report_id,
                        title=f"❓ Help Us Check: Is This {pet.display_name}? (Report #{report.report_id})",
                        message=(f"Staff aren't sure whether the animal in Report #{report.report_id} is {pet.display_name}. "
                                 f"Please look at the photo and answer Yes, No or Unsure. Staff make the final decision.")))
    log_activity(db=db, action="REQUEST_OWNER_VERIFICATION", target_table="report_matches", target_id=match.match_id,
                 description=f"{current_user.name} asked the owner of {pet.display_name} to help verify Report #{report.report_id}. {note}",
                 user_id=current_user.user_id, log_type="operation", new_values={"note": note}, request=req, commit=False)
    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/owner-verification", response_model=ReportMatchResponse)
def answer_owner_verification(match_id: int, payload: OwnerVerificationAnswer, req: Request, db: Session = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    """The owner's answer to a staff verification request. Recorded as evidence; staff still decide."""
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match or not match.matched_pet_id:
        raise HTTPException(status_code=404, detail="Pet match not found")
    pet = match.matched_pet
    if not pet or pet.owner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the pet's owner can answer this request.")
    if not match.owner_verification_requested_at:
        raise HTTPException(status_code=400, detail="Staff haven't asked you about this sighting.")
    if match.owner_verification_answered_at:
        raise HTTPException(status_code=409, detail="You already answered this request.")
    answer = (payload.answer or "").strip().upper()
    if answer not in ("YES", "NO", "UNSURE"):
        raise HTTPException(status_code=400, detail="Answer Yes, No or Unsure.")
    match.owner_verification_answer = answer
    match.owner_verification_answer_note = (payload.note or "").strip()[:1000] or None
    match.owner_verification_answered_at = datetime.now(timezone.utc).replace(tzinfo=None)
    label = {"YES": "Yes, it's my pet", "NO": "No, it's not my pet", "UNSURE": "Not sure"}[answer]
    thread = _verification_thread(db, match, current_user)
    from app.models.chat import ChatMessage
    db.add(ChatMessage(thread_id=thread.thread_id, sender_id=current_user.user_id, is_system=False, is_read=False,
                       message_text=f"About Report #{match.source_report_id}: {label}."
                                    + (f" {match.owner_verification_answer_note}" if match.owner_verification_answer_note else "")))
    if match.owner_verification_requested_by:
        db.add(Notification(user_id=match.owner_verification_requested_by, type="potential_match", related_id=match.source_report_id,
                            title=f"Owner Answered: Report #{match.source_report_id}",
                            message=(f"The owner of {pet.display_name} answered \"{label}\" about Report #{match.source_report_id}. "
                                     f"It's evidence for your decision; nothing was merged or confirmed automatically.")))
    log_activity(db=db, action="OWNER_VERIFICATION_ANSWERED", target_table="report_matches", target_id=match.match_id,
                 description=f"Owner answered {answer} for Report #{match.source_report_id} ({pet.display_name}).",
                 user_id=current_user.user_id, log_type="operation", new_values={"answer": answer}, request=req, commit=False)
    db.commit()
    db.refresh(match)
    return match


@router.post("/scan-all")
def scan_all_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Scans all non-deceased reports and generates AI potential matches (Admin only: it touches every subdivision)."""
    if current_user.role_id != 4:
        raise HTTPException(status_code=403, detail="Only administrators can re-scan every report. Scan a single report instead.")
    active_reports = db.query(Report).filter(
        Report.current_status_id != 12,
        Report.current_status_id.notin_([3])
    ).all()

    total_created = 0
    for rep in active_reports:
        created = scan_and_generate_matches_for_report(rep.report_id, db)
        total_created += len(created)

    return {"status": "success", "matches_generated": total_created, "scanned_reports": len(active_reports)}


@router.post("/scan/{report_id}")
def scan_single_report(
    report_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Scans single report for potential matches (the reviewer for this report, or Admin)."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    require_review_permission(current_user, report, db)
    created = scan_and_generate_matches_for_report(report_id, db)
    return {"status": "success", "report_id": report_id, "matches_found": len(created)}

