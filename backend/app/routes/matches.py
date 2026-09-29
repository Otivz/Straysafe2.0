from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload, selectinload, aliased
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import json
import os
from sqlalchemy import or_, and_, desc

from app.database import get_db
from app.models.report_match import ReportMatch
from app.models.report import Report, ReportMedia, StatusHistory, HoldingAnimal, HoldingTimeline
from app.models.pet import Pet
from app.models.user import User
from app.models.notification import Notification
from app.schemas.report_match import (
    ReportMatchResponse,
    ReportMatchVerifyRequest,
    OwnerFeedbackRequest
)
from app.utils.audit import log_activity
from app.utils.auth import decode_access_token, get_current_user, get_current_staff_or_admin

# Statuses representing closed, resolved, terminal, impounded, or consolidated cases
RESOLVED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]

router = APIRouter(
    prefix="/matches",
    tags=["matches"]
)


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


from app.utils.ai_matching import (
    COLOR_FAMILIES,
    get_color_family,
    parse_colors,
    fetch_image_for_entity,
    compare_animals_vision,
    compare_animals_rule_based
)


def calculate_match_details(
    source_report: Report,
    candidate: Any,  # Either Report or Pet
    is_pet: bool = False
) -> Dict[str, Any]:
    """
    Computes an accurate multi-factor individual biometric similarity score (0-100%)
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
        cand_name = candidate.pet_name
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
    src_breed = (source_report.animal_breed or source_report.ai_possible_breed or "Aspin").strip()
    src_color = (source_report.animal_color or source_report.ai_dominant_color or "Unknown").strip()
    src_pattern = (source_report.ai_coat_pattern or "Uniform").strip()
    src_size = (source_report.estimated_size or source_report.ai_estimated_size or "Medium").strip()
    src_desc = (source_report.description or "").strip()

    if is_pet:
        cand_breed = (candidate.breed or "Aspin").strip()
        cand_p = (candidate.primary_color or "").strip()
        cand_s = (candidate.secondary_color or "").strip()
        cand_color = f"{cand_p} {cand_s}".strip() or (candidate.color_markings or "Unknown").strip()
        cand_pattern = (candidate.color_markings or "Uniform").strip()
        cand_size = (candidate.size_category or "Medium").strip()
        cand_desc = f"{candidate.distinctive_markings or ''} {candidate.color_markings or ''} {candidate.notes or ''}".strip()
    else:
        cand_breed = (candidate.animal_breed or candidate.ai_possible_breed or "Aspin").strip()
        cand_color = (candidate.animal_color or candidate.ai_dominant_color or "Unknown").strip()
        cand_pattern = (candidate.ai_coat_pattern or "Uniform").strip()
        cand_size = (candidate.estimated_size or candidate.ai_estimated_size or "Medium").strip()
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
        lat_diff = (s_lat - c_lat) * 111.0
        lng_diff = (s_lng - c_lng) * 111.0 * 0.965
        dist_km = round((lat_diff ** 2 + lng_diff ** 2) ** 0.5, 2)
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

    # Attempt to load visual images for both subjects
    img_src = fetch_image_for_entity(source_report, is_pet=False)
    img_cand = fetch_image_for_entity(candidate, is_pet=is_pet)

    vision_result = None
    if img_src is not None and img_cand is not None:
        vision_result = compare_animals_vision(img_src, img_cand, src_meta, cand_meta)

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
            "match_status": "Same Breed" if src_breed.lower() == cand_breed.lower() else "Different Breed",
            "is_match": src_breed.lower() == cand_breed.lower(),
            "badge": f"🐕 Breed: {src_breed.title()}"
        },
        {
            "attribute": "Coat Color",
            "source_value": src_color.title(),
            "candidate_value": cand_color.title(),
            "match_status": "Shared Color" if rule_res["evidence"].get("color_match") else "Color Contrast",
            "is_match": bool(rule_res["evidence"].get("color_match")),
            "badge": f"🎨 Color: {src_color.title()}"
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


def scan_and_generate_matches_for_report(report_id: int, db: Session) -> List[ReportMatch]:
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

    # Clean up previous unreviewed AI_SUGGESTED records (both pet look-alikes and duplicate strays) for this report before rescanning.
    # Preserves any human verified records (CONFIRMED_MATCH, NOT_A_MATCH, UNABLE_TO_VERIFY).
    db.query(ReportMatch).filter(
        ReportMatch.status == "AI_SUGGESTED",
        or_(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_report_id == report.report_id
        )
    ).delete(synchronize_session=False)

    created_matches = []

    # ── PART 1: Compare Against Eligible Registered Pets ──
    all_registered_pets = db.query(Pet).options(
        joinedload(Pet.owner)
    ).filter(Pet.status.in_(["Active", "Lost", "Found", "Rescued"]), Pet.status != "Impounded").all()

    # Pre-load all human-verified pet decisions for this report
    human_verified_pet_ids = set(
        row[0] for row in db.query(ReportMatch.matched_pet_id).filter(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_pet_id.isnot(None),
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"])
        ).all()
    )

    for pet in all_registered_pets:
        # Pre-filter candidate eligibility before AI comparison
        is_eligible, _ = is_pet_eligible_for_matching(pet)
        if not is_eligible:
            continue

        # Don't match user's own report with their own pet if already linked
        if report.pet_id == pet.pet_id:
            continue

        # Check if already evaluated by human staff
        if pet.pet_id in human_verified_pet_ids:
            continue

        match_calc = calculate_match_details(report, pet, is_pet=True)
        v_assessment = match_calc.get("visual_comparison", {}).get("final_assessment", "POTENTIAL MATCH")
        
        # Only suggest if score >= 50 AND assessment is NOT a contradiction / NOT A MATCH
        if match_calc["score"] >= 50 and v_assessment not in ["NOT A MATCH", "LOW CONFIDENCE"] and match_calc.get("evidence"):
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

            # Also create notification for pet owner
            if pet.owner_id and pet.owner_id != report.user_id:
                notif = Notification(
                    user_id=pet.owner_id,
                    title=f"🔍 Look-Alike Pet Sighting Detected (Report #{report.report_id})",
                    message=(
                        f"AI identified a {match_calc['score']}% look-alike match for your registered pet '{pet.pet_name}' "
                        f"in Report #{report.report_id}. Please review the sighting and message the reporter to confirm if it is your pet."
                    ),
                    type="potential_match",
                    related_id=report.report_id
                )
                db.add(notif)

    # ── PART 2: Compare Against Other Active Stray Reports for Duplicate Sightings (Phase 2) ──
    if report.animal_type:
        report_dt = report.created_at.replace(tzinfo=None) if hasattr(report.created_at, "tzinfo") and report.created_at.tzinfo else (report.created_at or datetime.now())
        window_start = report_dt - timedelta(days=7)
        window_end = report_dt + timedelta(days=7)
        cand_reports = db.query(Report).options(
            joinedload(Report.media),
            joinedload(Report.category),
            joinedload(Report.reporter)
        ).filter(
            Report.report_id != report.report_id,
            Report.current_status_id.notin_(RESOLVED_STATUS_IDS),
            Report.duplicate_of_report_id.is_(None),
            or_(Report.custody_status.is_(None), Report.custody_status != "Impounded"),
            Report.animal_type == report.animal_type,
            Report.created_at >= window_start,
            Report.created_at <= window_end
        ).all()

        # Pre-load all existing human verified duplicate pair matches for this report
        existing_human_dup_pairs = set()
        for m in db.query(ReportMatch).filter(
            ReportMatch.matched_report_id.isnot(None),
            ReportMatch.status.in_(["CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"]),
            or_(
                ReportMatch.source_report_id == report.report_id,
                ReportMatch.matched_report_id == report.report_id
            )
        ).all():
            existing_human_dup_pairs.add((m.source_report_id, m.matched_report_id))
            existing_human_dup_pairs.add((m.matched_report_id, m.source_report_id))

        for cand in cand_reports:
            # Geographic proximity check
            is_near = False
            dist_km = None
            if report.latitude is not None and report.longitude is not None and cand.latitude is not None and cand.longitude is not None:
                lat_diff = (float(report.latitude) - float(cand.latitude)) * 111.0
                lng_diff = (float(report.longitude) - float(cand.longitude)) * 111.0 * 0.965
                dist_km = (lat_diff ** 2 + lng_diff ** 2) ** 0.5
                if dist_km <= 1.5:  # within 1.5 km
                    is_near = True
            elif report.subdivision_id and cand.subdivision_id and report.subdivision_id == cand.subdivision_id:
                is_near = True

            if not is_near:
                continue

            # Check if pair was already evaluated by human staff
            if (report.report_id, cand.report_id) in existing_human_dup_pairs:
                continue

            dup_calc = calculate_match_details(report, cand, is_pet=False)
            v_dup_assessment = dup_calc.get("visual_comparison", {}).get("final_assessment", "POTENTIAL MATCH")
            
            if dup_calc["score"] >= 65 and v_dup_assessment not in ["NOT A MATCH", "LOW CONFIDENCE"] and dup_calc.get("evidence"):
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

                # Notify Subdivision Leader if report is in a subdivision
                target_subd = report.subdivision_id or cand.subdivision_id
                if target_subd:
                    officers = db.query(User).filter(User.subdivision_id == target_subd, User.role_id == 2).all()
                    for off in officers:
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
    db: Session = Depends(get_db)
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
    return matches


@router.get("/duplicates", response_model=List[ReportMatchResponse])
def get_duplicate_matches(
    subdivision_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    report_id: Optional[int] = None,
    db: Session = Depends(get_db)
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
    return matches


@router.get("/duplicates/report/{report_id}", response_model=List[ReportMatchResponse])
def get_duplicates_for_report(report_id: int, db: Session = Depends(get_db)):
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
    return matches


@router.get("/{match_id}", response_model=ReportMatchResponse)
def get_match_by_id(match_id: int, db: Session = Depends(get_db)):
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

    if not match:
        raise HTTPException(status_code=404, detail="Potential match record not found")
    return match


@router.get("/report/{report_id}", response_model=List[ReportMatchResponse])
def get_matches_for_report(report_id: int, db: Session = Depends(get_db)):
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

    return matches


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

    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")

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
    new_status = payload.decision

    # Apply updates
    match.status = new_status
    match.verification_notes = payload.notes.strip()
    match.reviewed_by = current_user.user_id
    match.reviewer_role = actor_role
    match.verified_at = datetime.now(timezone.utc)

    # If CONFIRMED_MATCH, link pet or reports if appropriate
    if new_status == "CONFIRMED_MATCH":
        if match.matched_pet and match.source_report:
            # Update pet status or report pet_id linkage
            match.source_report.pet_id = match.matched_pet.pet_id
            match.source_report.is_possible_owned = True
        
        # Link duplicate reports and set Duplicate status (18)
        if match.source_report_id and match.matched_report_id:
            src = match.source_report
            tgt = match.matched_report
            if src and tgt:
                # If neither is already merged, link tgt as duplicate of src
                if not tgt.duplicate_of_report_id and not src.duplicate_of_report_id:
                    tgt.duplicate_of_report_id = src.report_id
                    tgt.current_status_id = 18
                    tgt.merged_at = datetime.now()
                    tgt.merged_by = current_user.user_id
                    tgt.merge_notes = payload.notes
                    if tgt.pet_id and not src.pet_id:
                        src.pet_id = tgt.pet_id
                elif tgt.duplicate_of_report_id:
                    tgt.current_status_id = 18
                    tgt.merged_at = tgt.merged_at or datetime.now()
                    tgt.merged_by = tgt.merged_by or current_user.user_id
                    tgt.merge_notes = payload.notes or tgt.merge_notes

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

        # Notify matched pet owner
        if match.matched_pet and match.matched_pet.owner_id:
            db.add(Notification(
                user_id=match.matched_pet.owner_id,
                title="Pet Sighting Confirmed",
                message=f"Staff confirmed Report #{match.source_report_id} matches your pet '{match.matched_pet.pet_name}'.",
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
        old_values={"status": prev_status},
        new_values={
            "status": new_status,
            "decision": payload.decision,
            "notes": payload.notes,
            "reviewer_id": current_user.user_id,
            "reviewer_role": actor_role
        },
        request=req
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
    Stores supporting evidence without altering the official staff verification status.
    Requires authentication. User must be the owner of the matched pet, report submitter, or staff/admin.
    """
    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report),
        joinedload(ReportMatch.matched_pet)
    ).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")

    allowed = ["OWNER_CONFIRMED", "OWNER_REJECTED", "NO_RESPONSE"]
    if payload.owner_confirmation not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid owner response. Must be one of {allowed}.")

    is_owner = bool(match.matched_pet and match.matched_pet.owner_id == current_user.user_id)
    is_reporter = bool(match.source_report and match.source_report.user_id == current_user.user_id)
    is_staff = current_user.role_id in [2, 3, 4]

    if not (is_owner or is_reporter or is_staff):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only submit feedback for your own pet or report."
        )

    match.owner_confirmation_status = payload.owner_confirmation
    if payload.remarks:
        match.owner_notes = payload.remarks.strip()

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


@router.post("/scan-all")
def scan_all_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    """Scans all non-deceased reports and generates AI potential matches (Staff/Admin only)."""
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
    """Scans single report for potential matches (Staff/Admin only)."""
    created = scan_and_generate_matches_for_report(report_id, db)
    return {"status": "success", "report_id": report_id, "matches_found": len(created)}
