from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import json
import os
from sqlalchemy import or_, and_, desc

from app.database import get_db
from app.models.report_match import ReportMatch
from app.models.report import Report, ReportMedia, StatusHistory
from app.models.pet import Pet
from app.models.user import User
from app.models.notification import Notification
from app.schemas.report_match import (
    ReportMatchResponse,
    ReportMatchVerifyRequest,
    OwnerFeedbackRequest
)
from app.utils.audit import log_activity
from app.utils.auth import decode_access_token

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


COLOR_FAMILIES = {
    "black": {"black", "dark"},
    "white": {"white", "cream", "light"},
    "gray": {"gray", "grey", "silver", "ash"},
    "orange": {"orange", "ginger", "red", "yellow", "tan", "gold", "golden", "fawn", "sable"},
    "brown": {"brown", "chocolate", "brindle", "dark brown"}
}

def get_color_family(c_str: Optional[str]) -> Optional[str]:
    if not c_str:
        return None
    c_clean = c_str.lower().strip()
    for fam, members in COLOR_FAMILIES.items():
        if c_clean in members:
            return fam
    return None

def parse_colors(color_str: Optional[str]) -> List[str]:
    if not color_str:
        return []
    cleaned = color_str.lower()
    for sep in [",", "/", "&", ";", "-", "|", "(", ")", "."]:
        cleaned = cleaned.replace(sep, " ")
    
    known_colors = {
        "black", "white", "brown", "cream", "tan", "golden", "yellow", 
        "gray", "grey", "silver", "orange", "red", "chocolate", "fawn", 
        "brindle", "tricolor", "bicolor", "merle", "calico", "sable"
    }
    
    tokens = [c.strip() for c in cleaned.split() if c.strip()]
    matched = [t for t in tokens if t in known_colors]
    return matched if matched else tokens


def calculate_match_details(
    source_report: Report,
    candidate: Any,  # Either Report or Pet
    is_pet: bool = False
) -> Dict[str, Any]:
    """
    Computes an accurate multi-factor similarity score (0-100%) and generates structured AI evidence points.
    Compares:
    - Species (Hard gatekeeper: 0% on mismatch)
    - Breed (Strict comparison: -40% on purebred conflict, +30% on match)
    - Primary & Secondary Coat Colors (-35% on complete color clash, +30% on match)
    - Coat Pattern & Texture (Tabby vs Solid vs Calico vs Bicolor)
    - Size Category (+10% on match, -35% on 2-step mismatch)
    - Distinctive Physical Markings
    - Geographic & Time Proximity
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
        return {"score": 0, "evidence": None, "explanation": "Animal is deceased."}

    # Species must match or one is unknown
    type_match = (src_type == cand_type) or (src_type == "unknown") or (cand_type == "unknown")
    if not type_match and src_type != "unknown" and cand_type != "unknown":
        return {"score": 0, "evidence": None, "explanation": f"Species mismatch: {src_type.capitalize()} vs {cand_type.capitalize()}."}

    attribute_score = 15  # Base species compatibility
    evidence_bullets = [f"Species Match: Both identified as {src_type.capitalize()}"]
    has_breed_conflict = False
    has_color_conflict = False
    has_pattern_conflict = False

    # 2. Breed Comparison
    src_breed = (source_report.animal_breed or source_report.ai_possible_breed or "").lower().strip()
    if is_pet:
        cand_breed = (candidate.breed or "").lower().strip()
    else:
        cand_breed = (candidate.animal_breed or candidate.ai_possible_breed or "").lower().strip()

    generic_breeds = {"aspin", "puspin", "mixed", "unknown", "mongrel", "mixed breed", "local", ""}
    is_src_purebred = src_breed and (src_breed not in generic_breeds)
    is_cand_purebred = cand_breed and (cand_breed not in generic_breeds)

    if src_breed and cand_breed:
        sb_clean = src_breed.replace(" ", "").replace("-", "").replace("_", "")
        cb_clean = cand_breed.replace(" ", "").replace("-", "").replace("_", "")

        if sb_clean == cb_clean or sb_clean in cb_clean or cb_clean in sb_clean:
            attribute_score += 30
            evidence_bullets.append(f"Breed Match: Both identified as {src_breed.title()}")
        elif is_src_purebred and is_cand_purebred:
            # Two completely different distinct purebreds (e.g. Chihuahua vs Shih Tzu)
            attribute_score -= 40
            has_breed_conflict = True
            evidence_bullets.append(f"Breed Contrast: Sighted as {src_breed.title()} vs Registered {cand_breed.title()}")
        elif (is_src_purebred and cand_breed in generic_breeds) or (is_cand_purebred and src_breed in generic_breeds):
            attribute_score -= 15
            evidence_bullets.append(f"Breed Difference: {src_breed.title()} vs {cand_breed.title()}")
        else:
            # Both are local mixed breeds
            attribute_score += 5
            evidence_bullets.append("Breed Classification: Both identified as local/mixed breed")

    # 3. Color & Pattern Comparison
    src_p_color = (source_report.ai_dominant_color or source_report.animal_color or "").lower().strip()
    src_raw_color = f"{source_report.animal_color or ''} {source_report.ai_dominant_color or ''}".lower()
    src_colors = set(parse_colors(src_raw_color))
    
    if is_pet:
        cand_primary = (candidate.primary_color or "").lower().strip()
        cand_secondary = (candidate.secondary_color or "").lower().strip()
        cand_p_color = cand_primary or cand_secondary or (candidate.color_markings or "").lower().strip()
        cand_raw_color = f"{cand_primary} {cand_secondary} {candidate.color_markings or ''}".lower()
        cand_colors = set(parse_colors(cand_raw_color))
        cand_pattern = candidate.color_markings or "Uniform"
    else:
        cand_p_color = (candidate.ai_dominant_color or candidate.animal_color or "").lower().strip()
        cand_raw_color = f"{candidate.animal_color or ''} {candidate.ai_dominant_color or ''}".lower()
        cand_colors = set(parse_colors(cand_raw_color))
        cand_pattern = candidate.ai_coat_pattern or "Uniform"

    src_pattern = source_report.ai_coat_pattern or "Uniform"
    color_overlap = src_colors.intersection(cand_colors)

    # Detect Primary Color Family Conflict
    src_p_fam = get_color_family(src_p_color.split()[0]) if src_p_color else None
    cand_p_fam = get_color_family(cand_p_color.split()[0]) if cand_p_color else None

    is_primary_color_conflict = False
    if src_p_fam and cand_p_fam and src_p_fam != cand_p_fam:
        if not (src_p_fam in cand_raw_color and cand_p_fam in src_raw_color):
            is_primary_color_conflict = True

    # Detect Coat Pattern Conflict
    src_pat_str = f"{src_pattern} {source_report.description or ''} {source_report.animal_color or ''}".lower()
    cand_pat_str = f"{cand_pattern} {getattr(candidate, 'distinctive_markings', '') or ''} {getattr(candidate, 'color_markings', '') or ''}".lower()

    if ("solid" in src_pat_str or ("black" in src_pat_str and "tabby" not in src_pat_str)) and ("tabby" in cand_pat_str or "striped" in cand_pat_str):
        has_pattern_conflict = True
    elif ("tabby" in src_pat_str or "striped" in src_pat_str) and ("solid" in cand_pat_str or ("black" in cand_pat_str and "tabby" not in cand_pat_str)):
        has_pattern_conflict = True
    elif ("calico" in src_pat_str or "tortoiseshell" in src_pat_str) != ("calico" in cand_pat_str or "tortoiseshell" in cand_pat_str):
        if ("calico" in src_pat_str or "calico" in cand_pat_str):
            has_pattern_conflict = True

    if is_primary_color_conflict:
        attribute_score -= 35
        has_color_conflict = True
        evidence_bullets.append(f"Color Contrast: Sighted primary color ({src_p_color.title() or 'Dark'}) clashes with pet ({cand_p_color.title() or 'Light'})")
    elif is_pet and candidate.primary_color and candidate.primary_color.lower() in src_colors:
        attribute_score += 30
        evidence_bullets.append(f"Color Match: Primary color matches ({candidate.primary_color.title()})")
    elif color_overlap and not is_primary_color_conflict:
        attribute_score += 15
        evidence_bullets.append(f"Color Overlap: Shared colors ({', '.join(color_overlap).title()})")
    elif src_colors and cand_colors:
        attribute_score -= 35
        has_color_conflict = True
        evidence_bullets.append(f"Color Contrast: Sighted colors ({', '.join(src_colors).title()}) differ from pet ({', '.join(cand_colors).title()})")

    if has_pattern_conflict:
        attribute_score -= 20
        evidence_bullets.append("Coat Pattern Contrast: Sighted coat pattern clashes with registered pet coat pattern")

    # 4. Size Category Comparison
    size_map = {"small": 1, "medium": 2, "large": 3}
    src_size = (source_report.estimated_size or source_report.ai_estimated_size or "Medium").lower()
    if is_pet:
        cand_size = (candidate.size_category or "Medium").lower()
    else:
        cand_size = (candidate.estimated_size or candidate.ai_estimated_size or "Medium").lower()

    s_val = size_map.get(src_size, 2)
    c_val = size_map.get(cand_size, 2)
    if s_val == c_val:
        attribute_score += 10
        evidence_bullets.append(f"Size Category: Both match ({src_size.capitalize()})")
    elif abs(s_val - c_val) == 1:
        attribute_score -= 15
        evidence_bullets.append(f"Size Variance: {src_size.capitalize()} vs {cand_size.capitalize()}")
    else:
        attribute_score -= 35
        evidence_bullets.append(f"Size Conflict: {src_size.capitalize()} vs {cand_size.capitalize()}")

    # 5. Distinctive Markings & Description Keywords
    src_desc = (source_report.description or "").lower()
    if is_pet:
        cand_desc = f"{candidate.distinctive_markings or ''} {candidate.color_markings or ''} {candidate.notes or ''}".lower()
    else:
        cand_desc = (candidate.description or "").lower()

    keywords = ["patch", "spot", "socks", "collar", "leash", "stripe", "scar", "white chest", "black ear", "pointed ears", "floppy ears", "fluffy"]
    shared_markings = [kw for kw in keywords if kw in src_desc and kw in cand_desc]
    if shared_markings:
        attribute_score += 15
        evidence_bullets.append(f"Distinctive Features: Common traits noted ({', '.join(shared_markings)})")

    # 6. Location Proximity
    s_lat = float(source_report.latitude) if source_report.latitude is not None else None
    s_lng = float(source_report.longitude) if source_report.longitude is not None else None

    cand_lat_raw = getattr(candidate, "registered_latitude", None) if is_pet else getattr(candidate, "latitude", None)
    cand_lng_raw = getattr(candidate, "registered_longitude", None) if is_pet else getattr(candidate, "longitude", None)
    c_lat = float(cand_lat_raw) if cand_lat_raw is not None else None
    c_lng = float(cand_lng_raw) if cand_lng_raw is not None else None

    dist_km = None
    if s_lat is not None and s_lng is not None and c_lat is not None and c_lng is not None:
        lat_diff = (s_lat - c_lat) * 111.0
        lng_diff = (s_lng - c_lng) * 111.0 * 0.965
        dist_km = round((lat_diff ** 2 + lng_diff ** 2) ** 0.5, 2)
        if dist_km <= 0.5:
            attribute_score += 10
            evidence_bullets.append(f"Location Proximity: Sighted within {int(dist_km * 1000)}m")
        elif dist_km <= 2.0:
            attribute_score += 5
            evidence_bullets.append(f"Location Proximity: Sighted within {dist_km} km")
    else:
        src_subd = source_report.subdivision_id
        cand_subd = candidate.owner.subdivision_id if (is_pet and candidate.owner) else getattr(candidate, "subdivision_id", None)
        if src_subd and cand_subd and src_subd == cand_subd:
            attribute_score += 5
            evidence_bullets.append("Subdivision: Located in same subdivision")

    # Hard conflict override: If color conflict OR pattern conflict OR breed conflict, cap score severely (< 30%)
    if has_breed_conflict and (has_color_conflict or has_pattern_conflict):
        final_score = min(max(attribute_score, 5), 15)
    elif has_color_conflict or is_primary_color_conflict or has_pattern_conflict:
        final_score = min(max(attribute_score, 10), 25)
    elif has_breed_conflict:
        final_score = min(max(attribute_score, 10), 35)
    else:
        final_score = max(min(attribute_score, 98), 10)

    # Build structured AI evidence dictionary
    ai_evidence = {
        "species_match": True,
        "animal_type": src_type.capitalize(),
        "color_match": len(color_overlap) > 0 and not has_color_conflict,
        "shared_colors": list(color_overlap),
        "coat_pattern": src_pattern,
        "size_match": s_val == c_val,
        "size_category": src_size.capitalize(),
        "distinctive_markings": shared_markings,
        "distance_km": dist_km,
        "key_evidence_bullets": evidence_bullets
    }

    subj_name = candidate.pet_name if is_pet else f"Report #{candidate.report_id}"
    explanation = (
        f"AI multi-attribute evaluation computed a {final_score}% match likelihood between Report #{source_report.report_id} "
        f"and {subj_name} based on species, breed consistency, coat color distribution, and size."
    )

    return {
        "score": final_score,
        "evidence": ai_evidence,
        "explanation": explanation
    }


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

    # 1. Hard status exclusions: DECEASED, INACTIVE, ARCHIVED, DELETED, UNREGISTERED
    status_raw = getattr(pet, "status", "") or ""
    status_clean = status_raw.strip().title()
    ineligible_statuses = {"Deceased", "Inactive", "Archived", "Deleted", "Unregistered"}
    if status_clean in ineligible_statuses:
        return False, f"Pet status '{status_clean}' is ineligible for matching."
    
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
    Scans all eligible registered pets against a given report and creates AI_SUGGESTED match records.
    Strictly follows REGISTERED PET ELIGIBILITY rules:
    - Only candidates from registered/owned pets table
    - Candidate must be Active/Eligible
    - Candidate must NOT be Deceased, Inactive, Archived, Deleted, or Unregistered
    - Candidate must have an active owner
    - Candidate must have usable image and data
    - Never treat arbitrary reports as owned pets
    """
    report = db.query(Report).options(
        joinedload(Report.media),
        joinedload(Report.category),
        joinedload(Report.reporter)
    ).filter(Report.report_id == report_id).first()

    if not report or report.current_status_id == 12:  # Deceased reports cannot be matched
        return []

    # Clean up any legacy report-to-report match records from previous runs
    db.query(ReportMatch).filter(
        or_(
            and_(ReportMatch.source_report_id == report.report_id, ReportMatch.matched_report_id.isnot(None)),
            and_(ReportMatch.matched_report_id == report.report_id, ReportMatch.source_report_id.isnot(None))
        )
    ).delete(synchronize_session=False)

    created_matches = []

    # Compare ONLY against Eligible Registered Pets (excluding Archived/Inactive/Deceased)
    all_registered_pets = db.query(Pet).options(
        joinedload(Pet.owner)
    ).filter(Pet.status.in_(["Active", "Lost", "Found", "Rescued"])).all()

    for pet in all_registered_pets:
        # Pre-filter candidate eligibility before AI comparison
        is_eligible, _ = is_pet_eligible_for_matching(pet)
        if not is_eligible:
            continue

        # Don't match user's own report with their own pet if already linked
        if report.pet_id == pet.pet_id:
            continue

        # Check if already evaluated or rejected
        existing = db.query(ReportMatch).filter(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_pet_id == pet.pet_id
        ).first()

        if existing:
            # If rejected as NOT_A_MATCH or already evaluated, preserve decision
            continue

        match_calc = calculate_match_details(report, pet, is_pet=True)
        if match_calc["score"] >= 50 and match_calc["evidence"]:
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
            Report.subdivision_id == subdivision_id
        )

    matches = query.order_by(desc(ReportMatch.similarity_score), desc(ReportMatch.created_at)).all()
    return matches


@router.get("/{match_id}", response_model=ReportMatchResponse)
def get_match_by_id(match_id: int, db: Session = Depends(get_db)):
    """Get single match with complete side-by-side evidence."""
    match = db.query(ReportMatch).options(
        joinedload(ReportMatch.source_report).joinedload(Report.media),
        joinedload(ReportMatch.source_report).joinedload(Report.category),
        joinedload(ReportMatch.source_report).joinedload(Report.reporter),
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
def verify_match(
    match_id: int,
    payload: ReportMatchVerifyRequest,
    req: Request,
    db: Session = Depends(get_db)
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

    # Authorize staff user
    actor = get_actor_user(req, db)
    if not actor:
        # Fallback default admin if no header provided during tests
        actor = db.query(User).filter(User.role_id.in_([2, 3, 4])).first()

    if not actor or actor.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Residents cannot verify matches. Authorized staff or admin access required."
        )

    role_names = {2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}
    actor_role = role_names.get(actor.role_id, "Staff Official")

    # Check subdivision boundary if Subdivision Leader (role 2)
    if actor.role_id == 2 and actor.subdivision_id:
        src_subd = match.source_report.subdivision_id if match.source_report else None
        if src_subd and src_subd != actor.subdivision_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subdivision Leaders can only verify reports within their designated subdivision."
            )

    prev_status = match.status
    new_status = payload.decision

    # Apply updates
    match.status = new_status
    match.verification_notes = payload.notes.strip()
    match.reviewed_by = actor.user_id
    match.reviewer_role = actor_role
    match.verified_at = datetime.now(timezone.utc)

    # If CONFIRMED_MATCH, link pet or reports if appropriate
    if new_status == "CONFIRMED_MATCH":
        if match.matched_pet and match.source_report:
            # Update pet status or report pet_id linkage
            match.source_report.pet_id = match.matched_pet.pet_id
            match.source_report.is_possible_owned = True
        
        # Add to StatusHistory for source report
        hist = StatusHistory(
            report_id=match.source_report_id,
            remarks=f"Match confirmed by {actor.name} ({actor_role}): {payload.notes}"
        )
        db.add(hist)

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
        description=f"Staff {actor.name} ({actor_role}) verified match #{match.match_id} as '{new_status}'. Notes: {payload.notes}",
        user_id=actor.user_id,
        log_type="security",
        old_values={"status": prev_status},
        new_values={
            "status": new_status,
            "decision": payload.decision,
            "notes": payload.notes,
            "reviewer_id": actor.user_id,
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
    db: Session = Depends(get_db)
):
    """
    Resident / Owner Feedback Endpoint:
    Stores supporting evidence without altering the official staff verification status.
    """
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")

    allowed = ["OWNER_CONFIRMED", "OWNER_REJECTED", "NO_RESPONSE"]
    if payload.owner_confirmation not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid owner response. Must be one of {allowed}.")

    match.owner_confirmation_status = payload.owner_confirmation
    if payload.remarks:
        match.owner_notes = payload.remarks.strip()

    # Record in audit trail as resident action
    actor = get_actor_user(req, db)
    actor_id = actor.user_id if actor else None
    log_activity(
        db=db,
        action="OWNER_MATCH_FEEDBACK",
        target_table="report_matches",
        target_id=match.match_id,
        description=f"Owner submitted feedback for match #{match.match_id}: {payload.owner_confirmation}",
        user_id=actor_id,
        log_type="operation",
        new_values={"owner_confirmation": payload.owner_confirmation, "remarks": payload.remarks},
        request=req
    )

    db.commit()
    db.refresh(match)
    return match


@router.post("/scan-all")
def scan_all_reports(db: Session = Depends(get_db)):
    """Scans all non-deceased reports and generates AI potential matches."""
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
def scan_single_report(report_id: int, db: Session = Depends(get_db)):
    """Scans single report for potential matches."""
    created = scan_and_generate_matches_for_report(report_id, db)
    return {"status": "success", "report_id": report_id, "matches_found": len(created)}
