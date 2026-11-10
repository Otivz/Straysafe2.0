"""
Manual Report Matching: staff search and compare reports and decide pairs themselves. Works with Gemini ON or OFF;
it is the fallback whenever Gemini is disabled, not configured or failing (docs/01-system/MANUAL_REPORT_MATCHING.md).

Rules:
- Never decides anything by itself and never shows a similarity percentage. "Shared details" are plain facts
  (same animal type, breed text overlaps, distance) for the reviewer to weigh.
- A decision is saved on the pair's single report_matches row (no duplicate rows for one pair) and appended to
  manual_match_decisions, so rejected and changed decisions stay on record.
- Confirming does not merge the reports. Linking both into one case is a separate, explicit choice (link_case).
- A report can also be compared with registered pets (same eligibility rules as the AI scan). Pets are owner-first:
  staff Send Confirmation, the owner answers YES or NO, and only after a YES can staff make the final verification
  (through the existing verify_match). A NO blocks that pet for the report. See app/utils/pet_match_confirmation.py.
"""
import math
from datetime import date, datetime, time as dtime
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.manual_match import ManualMatchDecision
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import Subdivision, User
from app.utils.audit import log_activity
from app.utils.auth import get_current_staff_or_admin, verify_subdivision_scope
from app.utils.ai_suggestions import gemini_status
from app.utils.case_groups import (
    COVERED_STATUS, SUPERSEDED_STATUS, case_members, case_pet_claims, case_root, confirm_report_match,
    impounded_pets, reject_report_match,
)
from app.utils.case_review import is_cross_subdivision, require_cross_subdivision_reviewer, require_review_permission
from app.models.pet_match_confirmation import PetMatchConfirmationRequest
from app.utils import pet_match_confirmation as owner_first
from app.utils.matching_scope import (
    pet_pool_condition, report_pool_condition, require_pet_in_scope, require_report_in_pool,
)

router = APIRouter(prefix="/manual-matching", tags=["manual-matching"])

LOST_PET_CATEGORY_ID = 6
# Closed, resolved, impounded or merged-duplicate reports (same list the AI matcher skips)
CLOSED_STATUS_IDS = [3, 8, 9, 10, 11, 12, 14, 17, 18]
DECISIONS = ("CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY")
DECISION_LABELS = {
    "CONFIRMED_MATCH": "Confirmed Match",
    "NOT_A_MATCH": "Rejected",
    "UNABLE_TO_VERIFY": "Needs Further Verification",
}
ROLE_NAMES = {2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}
MAX_RESULTS = 100
# Registered pets that can be a match (same list as the AI scan; is_pet_eligible_for_matching checks the rest)
ELIGIBLE_PET_STATUSES = ["Active", "Lost", "Found", "Rescued"]


# ── Helpers ─────────────────────────────────────────────────────────────────

def _distance_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dp, dl = p2 - p1, math.radians(float(lng2) - float(lng1))
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _like(term: str) -> str:
    """A LIKE pattern for user text, with its own wildcards escaped (the value is still a bound parameter)."""
    t = term.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{t}%"


def _contains(col, term: str):
    return func.lower(col).like(_like(term), escape="\\")


def _known(v: Optional[str]) -> str:
    t = (v or "").strip()
    return "" if t.lower() in ("", "unknown", "none", "n/a") else t


def _words(v: Optional[str]) -> set:
    return {w for w in "".join(c.lower() if c.isalnum() else " " for c in (v or "")).split() if len(w) > 2}


def _scoped(q, user: User):
    """
    Only reports in the user's matching scope (app/utils/matching_scope.py): own subdivision (leader); Barangay-managed
    cases and published Lost Pet reports in the barangay (staff); all (admin). Applied in SQL.
    """
    return q.filter(report_pool_condition(user))


class Filters(BaseModel):
    report_type: Optional[str] = None      # lost | stray
    animal_type: Optional[str] = None      # Dog | Cat
    breed: Optional[str] = None
    color: Optional[str] = None
    gender: Optional[str] = None           # Male | Female
    features: Optional[str] = None         # words looked up in the description, condition and markings
    location: Optional[str] = None         # landmark or subdivision name
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None
    include_closed: bool = False


def _filters(
    report_type: Optional[str] = Query(None, pattern="^(lost|stray)$"),
    animal_type: Optional[str] = Query(None, pattern="^(Dog|Cat)$"),
    breed: Optional[str] = Query(None, max_length=100),
    color: Optional[str] = Query(None, max_length=100),
    gender: Optional[str] = Query(None, pattern="^(Male|Female)$"),
    features: Optional[str] = Query(None, max_length=200),
    location: Optional[str] = Query(None, max_length=100),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: Optional[float] = Query(None, gt=0, le=50),
    include_closed: bool = False,
) -> Filters:
    return Filters(report_type=report_type, animal_type=animal_type, breed=breed, color=color, gender=gender,
                   features=features, location=location, date_from=date_from, date_to=date_to, lat=lat, lng=lng,
                   radius_km=radius_km, include_closed=include_closed)


def _apply_filters(q, f: Filters):
    if f.report_type == "lost":
        q = q.filter(Report.category_id == LOST_PET_CATEGORY_ID)
    elif f.report_type == "stray":
        q = q.filter(Report.category_id != LOST_PET_CATEGORY_ID)
    if f.animal_type:
        q = q.filter(Report.animal_type == f.animal_type)
    if f.breed and f.breed.strip():
        q = q.filter(or_(_contains(Report.animal_breed, f.breed), _contains(Report.ai_possible_breed, f.breed)))
    if f.color and f.color.strip():
        q = q.filter(or_(_contains(Report.animal_color, f.color), _contains(Report.ai_dominant_color, f.color)))
    if f.gender:
        # Reports have no sex field: it comes from the linked registered pet
        q = q.filter(exists().where(and_(Pet.pet_id == Report.pet_id, Pet.gender == f.gender)))
    if f.features:
        for word in [w for w in f.features.split() if w.strip()][:6]:
            q = q.filter(or_(_contains(Report.description, word), _contains(Report.condition, word),
                             _contains(Report.ai_coat_pattern, word), _contains(Report.animal_color, word)))
    if f.location and f.location.strip():
        subs = select(Subdivision.subdivision_id).where(_contains(Subdivision.subdivision_name, f.location))
        q = q.filter(or_(_contains(Report.landmark, f.location), _contains(Report.initial_landmark, f.location),
                         Report.subdivision_id.in_(subs)))
    if f.date_from:
        q = q.filter(Report.created_at >= datetime.combine(f.date_from, dtime.min))
    if f.date_to:
        q = q.filter(Report.created_at <= datetime.combine(f.date_to, dtime.max))
    if not f.include_closed:
        q = q.filter(or_(Report.current_status_id.is_(None), Report.current_status_id.notin_(CLOSED_STATUS_IDS)))
        q = q.filter(Report.duplicate_of_report_id.is_(None))
    if f.lat is not None and f.lng is not None and f.radius_km:
        # Bounding box in SQL; the exact circle is checked afterwards (_within_radius)
        dlat = f.radius_km / 111.0
        dlng = f.radius_km / (111.0 * max(math.cos(math.radians(f.lat)), 0.01))
        q = q.filter(Report.latitude.between(f.lat - dlat, f.lat + dlat),
                     Report.longitude.between(f.lng - dlng, f.lng + dlng))
    return q


def _within_radius(reports: List[Report], f: Filters) -> List[Report]:
    if f.lat is None or f.lng is None or not f.radius_km:
        return reports
    return [r for r in reports if r.latitude is not None and r.longitude is not None
            and _distance_km(f.lat, f.lng, r.latitude, r.longitude) <= f.radius_km]


def _load_options(q):
    return q.options(
        joinedload(Report.category), joinedload(Report.status), joinedload(Report.subdivision),
        joinedload(Report.reporter), selectinload(Report.media),
    )


def _genders(db: Session, reports: Iterable[Report]) -> Dict[int, str]:
    reports = list(reports)
    out: Dict[int, str] = {}
    pet_ids = {r.pet_id for r in reports if r.pet_id}
    if pet_ids:
        pets = dict(db.query(Pet.pet_id, Pet.gender).filter(Pet.pet_id.in_(pet_ids)).all())
        for r in reports:
            if r.report_id not in out and _known(pets.get(r.pet_id)):
                out[r.report_id] = pets[r.pet_id]
    return out


def _reporter(rep: Report, viewer: User) -> Optional[Dict[str, Any]]:
    """Staff see who reported and how to reach them (needed to verify a match); the email only for Admins."""
    u = rep.reporter
    if u is None:
        return None
    data: Dict[str, Any] = {"user_id": u.user_id, "name": u.name, "phone": u.phone}
    if viewer.role_id == 4:
        data["email"] = u.email
    return data


def _serialize(rep: Report, viewer: User, genders: Dict[int, str], detail: bool = False) -> Dict[str, Any]:
    images = [m.file_url for m in (rep.media or []) if m.media_type == "Image" and m.file_url]
    data = {
        "report_id": rep.report_id,
        "report_type": "Lost Pet" if rep.category_id == LOST_PET_CATEGORY_ID else "Stray Animal",
        "category": rep.category.category_name if rep.category else None,
        "photo_url": images[0] if images else None,
        "animal_type": rep.animal_type,
        "breed": rep.animal_breed,
        "color": rep.animal_color,
        "size": rep.estimated_size,
        "gender": genders.get(rep.report_id),
        "coat_pattern": rep.ai_coat_pattern,
        "landmark": rep.landmark,
        "subdivision_id": rep.subdivision_id,
        "subdivision": rep.subdivision.subdivision_name if rep.subdivision else None,
        "latitude": float(rep.latitude) if rep.latitude is not None else None,
        "longitude": float(rep.longitude) if rep.longitude is not None else None,
        "created_at": rep.created_at.isoformat() if rep.created_at else None,
        "status_id": rep.current_status_id,
        "status": rep.status.status_name if rep.status else None,
        "case_id": rep.duplicate_of_report_id or rep.report_id,
        "pet_id": rep.pet_id,
        "reporter": _reporter(rep, viewer),
    }
    if detail:
        data.update({
            "photos": images,
            "description": rep.description,
            "condition": rep.condition,
            "custody_status": rep.custody_status,
            "animal_count": rep.animal_count,
        })
    else:
        data["description_preview"] = (rep.description or "")[:160] or None
    return data


def _get_report(db: Session, report_id: int, user: User) -> Report:
    rep = _load_options(db.query(Report)).filter(Report.report_id == report_id).first()
    if rep is None:
        raise HTTPException(status_code=404, detail=f"Report #{report_id} not found.")
    verify_subdivision_scope(user, rep.subdivision_id, db=db)
    require_report_in_pool(db, user, rep)
    return rep


def _pair_matches(db: Session, a: int, b: int) -> List[ReportMatch]:
    return (db.query(ReportMatch)
            .filter(ReportMatch.matched_pet_id.is_(None), or_(
                and_(ReportMatch.source_report_id == a, ReportMatch.matched_report_id == b),
                and_(ReportMatch.source_report_id == b, ReportMatch.matched_report_id == a)))
            .order_by(ReportMatch.match_id).all())


def _shared_details(src: Report, cand: Report, genders: Dict[int, str]) -> List[str]:
    """Plain facts the two reports have in common. Not a score: similar details never make two reports the same animal."""
    out = []
    if _known(src.animal_type) and src.animal_type == cand.animal_type:
        out.append(f"Both {src.animal_type.lower()}s")
    b1, b2 = _words(src.animal_breed), _words(cand.animal_breed)
    if b1 & b2:
        out.append("Breed description overlaps")
    c1, c2 = _words(src.animal_color), _words(cand.animal_color)
    if c1 & c2:
        out.append("Shares color: " + ", ".join(sorted(c1 & c2)))
    g1, g2 = genders.get(src.report_id), genders.get(cand.report_id)
    if g1 and g1 == g2:
        out.append(f"Both recorded as {g1.lower()}")
    if _known(src.estimated_size) and src.estimated_size == cand.estimated_size:
        out.append(f"Both {src.estimated_size.lower()} size")
    return out


def _ai_payload(db: Session) -> Dict[str, Any]:
    status = gemini_status(db)
    return {**status, "manual_mode_active": not status["ai_available"]}


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/status")
def manual_matching_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    """Gemini's state. Manual Matching is always available; it is the active mode whenever Gemini is not operational."""
    return _ai_payload(db)


@router.get("/reports")
def search_reports(
    f: Filters = Depends(_filters),
    limit: int = Query(50, ge=1, le=MAX_RESULTS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Search reports in the staff member's area by type, animal, breed, color, sex, features, date and radius."""
    q = _apply_filters(_scoped(_load_options(db.query(Report)), current_user), f)
    rows = _within_radius(q.order_by(Report.created_at.desc(), Report.report_id.desc()).limit(limit * 3 if f.radius_km else limit).all(), f)[:limit]
    genders = _genders(db, rows)
    return {"results": [_serialize(r, current_user, genders) for r in rows], "count": len(rows)}


@router.get("/reports/{report_id}")
def report_detail(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    rep = _get_report(db, report_id, current_user)
    return _serialize(rep, current_user, _genders(db, [rep]), detail=True)


@router.get("/reports/{report_id}/candidates")
def candidate_reports(
    report_id: int,
    f: Filters = Depends(_filters),
    limit: int = Query(50, ge=1, le=MAX_RESULTS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Possible related reports for one report. A radius is measured from that report's location. Every candidate is
    listed with its current decision (if any) and the plain details it shares; nothing is ranked by a score.
    """
    src = _get_report(db, report_id, current_user)
    if f.radius_km and (f.lat is None or f.lng is None):
        f.lat, f.lng = float(src.latitude), float(src.longitude)
    q = _apply_filters(_scoped(_load_options(db.query(Report)), current_user), f)
    root_id = src.duplicate_of_report_id or src.report_id
    q = q.filter(Report.report_id != src.report_id,
                 or_(Report.duplicate_of_report_id.is_(None), Report.duplicate_of_report_id != root_id),
                 Report.report_id != root_id)
    rows = _within_radius(q.order_by(Report.created_at.desc(), Report.report_id.desc()).limit(limit * 3 if f.radius_km else limit).all(), f)[:limit]
    genders = _genders(db, rows + [src])

    ids = [r.report_id for r in rows]
    pair_status: Dict[int, ReportMatch] = {}
    if ids:
        for m in db.query(ReportMatch).filter(ReportMatch.matched_pet_id.is_(None), or_(
                and_(ReportMatch.source_report_id == src.report_id, ReportMatch.matched_report_id.in_(ids)),
                and_(ReportMatch.matched_report_id == src.report_id, ReportMatch.source_report_id.in_(ids)))).all():
            other = m.matched_report_id if m.source_report_id == src.report_id else m.source_report_id
            pair_status.setdefault(other, m)

    results = []
    for r in rows:
        item = _serialize(r, current_user, genders)
        m = pair_status.get(r.report_id)
        item["pair"] = None if m is None else {
            "match_id": m.match_id, "status": m.status,
            "decided_manually": bool(isinstance(m.ai_evidence, dict) and m.ai_evidence.get("engine") == "manual"),
        }
        item["distance_km"] = (round(_distance_km(src.latitude, src.longitude, r.latitude, r.longitude), 2)
                               if src.latitude is not None and r.latitude is not None else None)
        item["shared_details"] = _shared_details(src, r, genders)
        results.append(item)
    return {"source": _serialize(src, current_user, genders, detail=True), "results": results, "count": len(results)}


# ── Registered pets ─────────────────────────────────────────────────────────

def _pet_photos(pet: Pet) -> List[str]:
    out: List[str] = []
    for url in (pet.photo_front_url, pet.photo_url, pet.photo_left_url, pet.photo_right_url):
        if url and url.strip() and url not in out:
            out.append(url)
    return out


def _pet_colors(pet: Pet) -> str:
    seen: List[str] = []
    for p in (pet.color_markings, pet.primary_color, pet.secondary_color, pet.tertiary_color):
        if p and p.strip() and p.strip() not in seen:
            seen.append(p.strip())
    return ", ".join(seen)


def _pet_points(pet: Pet) -> List[tuple]:
    """Where the pet may be: its last-seen spot and its registered home."""
    pts = []
    if pet.last_seen_lat is not None and pet.last_seen_lng is not None:
        pts.append((pet.last_seen_lat, pet.last_seen_lng))
    if pet.registered_latitude is not None and pet.registered_longitude is not None:
        pts.append((pet.registered_latitude, pet.registered_longitude))
    return pts


def _serialize_pet(pet: Pet, viewer: User, db: Session, detail: bool = False) -> Dict[str, Any]:
    """Owner name for every staff member (as on AI pet matches); the phone only when the owner is in their area."""
    photos = _pet_photos(pet)
    owner = None
    if pet.owner is not None:
        in_scope = verify_subdivision_scope(viewer, pet.owner.subdivision_id, db=db, raise_exception=False)
        owner = {"user_id": pet.owner.user_id, "name": pet.owner.name,
                 "phone": pet.owner.phone if in_scope else None, "outside_area": not in_scope}
        if viewer.role_id == 4:
            owner["email"] = pet.owner.email
    data = {
        "pet_id": pet.pet_id,
        "reference_code": pet.reference_code,
        "pet_name": pet.pet_name,
        "animal_type": pet.pet_type,
        "breed": pet.breed,
        "color": _pet_colors(pet) or None,
        "gender": pet.gender if _known(pet.gender) else None,
        "size": pet.size_category,
        "distinctive_markings": pet.distinctive_markings,
        "photo_url": photos[0] if photos else None,
        "pet_status": pet.status,
        "registered_address": pet.registered_address,
        "last_seen_at": pet.last_seen_at.isoformat() if pet.last_seen_at else None,
        "owner": owner,
    }
    if detail:
        data.update({"photos": photos, "estimated_age": pet.estimated_age, "notes": pet.notes,
                     "is_neutered": pet.is_neutered, "temperament": pet.temperament})
    return data


def _pet_shared_details(src: Report, pet: Pet, genders: Dict[int, str]) -> List[str]:
    """Plain facts a report and a registered pet have in common. Not a score."""
    out = []
    if _known(src.animal_type) and src.animal_type == pet.pet_type:
        out.append(f"Both {pet.pet_type.lower()}s")
    if _words(src.animal_breed) & _words(pet.breed):
        out.append("Breed description overlaps")
    common = _words(src.animal_color) & _words(_pet_colors(pet))
    if common:
        out.append("Shares color: " + ", ".join(sorted(common)))
    g = genders.get(src.report_id)
    if g and _known(pet.gender) and g == pet.gender:
        out.append(f"Both recorded as {g.lower()}")
    if _known(src.estimated_size) and src.estimated_size == pet.size_category:
        out.append(f"Both {src.estimated_size.lower()} size")
    if (pet.status or "").lower() == "lost":
        out.append("Pet is reported lost")
    return out


def _report_pet_block(db: Session, src: Report) -> Optional[str]:
    """Why a report can't be matched to a registered pet (it, or its case, already has one), or None."""
    if src.pet_id:
        return f"Report #{src.report_id} is already linked to a registered pet."
    if case_pet_claims(db, case_members(db, case_root(db, src))):
        return f"Report #{src.report_id}'s case is already tied to a registered pet."
    return None


@router.get("/reports/{report_id}/pet-candidates")
def candidate_pets(
    report_id: int,
    animal_type: Optional[str] = Query(None, pattern="^(Dog|Cat)$"),
    breed: Optional[str] = Query(None, max_length=100),
    color: Optional[str] = Query(None, max_length=100),
    gender: Optional[str] = Query(None, pattern="^(Male|Female)$"),
    features: Optional[str] = Query(None, max_length=200),
    location: Optional[str] = Query(None, max_length=100),
    pet_status: Optional[str] = Query(None, pattern="^(Active|Lost|Found|Rescued)$"),
    radius_km: Optional[float] = Query(None, gt=0, le=50),
    limit: int = Query(50, ge=1, le=MAX_RESULTS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Registered pets that could be the animal in this report. Same pool as the AI scan (eligible status, active owner,
    a usable photo, not impounded), limited to the user's scope (app/utils/matching_scope.py). A radius is measured from the report to
    the pet's last-seen spot or registered home. Nothing is ranked by a score.
    """
    src = _get_report(db, report_id, current_user)
    genders = _genders(db, [src])
    blocked = _report_pet_block(db, src)
    if blocked:
        return {"source": _serialize(src, current_user, genders, detail=True), "results": [], "count": 0,
                "blocked_reason": blocked}

    # Only pets in the user's scope (Barangay-managed / endorsed for staff, own subdivision for leaders); never the
    # private subdivision registry for Barangay staff (app/utils/matching_scope.py)
    q = (db.query(Pet).options(joinedload(Pet.owner))
         .filter(Pet.status.in_(ELIGIBLE_PET_STATUSES), Pet.merged_into_pet_id.is_(None), pet_pool_condition(current_user)))
    if pet_status:
        q = q.filter(Pet.status == pet_status)
    if animal_type:
        q = q.filter(Pet.pet_type == animal_type)
    if breed and breed.strip():
        q = q.filter(_contains(Pet.breed, breed))
    if color and color.strip():
        q = q.filter(or_(_contains(Pet.color_markings, color), _contains(Pet.primary_color, color),
                         _contains(Pet.secondary_color, color), _contains(Pet.tertiary_color, color)))
    if gender:
        q = q.filter(Pet.gender == gender)
    if features:
        for word in [w for w in features.split() if w.strip()][:6]:
            q = q.filter(or_(_contains(Pet.distinctive_markings, word), _contains(Pet.color_markings, word),
                             _contains(Pet.notes, word)))
    if location and location.strip():
        q = q.filter(_contains(Pet.registered_address, location))
    if radius_km and src.latitude is not None:
        lat, lng = float(src.latitude), float(src.longitude)
        dlat = radius_km / 111.0
        dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
        q = q.filter(or_(
            and_(Pet.last_seen_lat.between(lat - dlat, lat + dlat), Pet.last_seen_lng.between(lng - dlng, lng + dlng)),
            and_(Pet.registered_latitude.between(lat - dlat, lat + dlat),
                 Pet.registered_longitude.between(lng - dlng, lng + dlng)),
        ))
    from app.routes.matches import is_pet_eligible_for_matching
    impounded = impounded_pets(db)
    rows = []
    for pet in q.order_by(Pet.updated_at.desc(), Pet.pet_id.desc()).limit(limit * 4).all():
        if pet.pet_id in impounded or not is_pet_eligible_for_matching(pet)[0]:
            continue
        dist = None
        pts = _pet_points(pet)
        if src.latitude is not None and pts:
            dist = min(_distance_km(src.latitude, src.longitude, a, b) for a, b in pts)
        if radius_km and (dist is None or dist > radius_km):
            continue
        rows.append((pet, dist))
        if len(rows) >= limit:
            break

    pair_status: Dict[int, ReportMatch] = {}
    ids = [p.pet_id for p, _ in rows]
    latest_requests: Dict[int, PetMatchConfirmationRequest] = {}
    if ids:
        for creq in (db.query(PetMatchConfirmationRequest)
                     .options(joinedload(PetMatchConfirmationRequest.requester), joinedload(PetMatchConfirmationRequest.finalizer))
                     .filter(PetMatchConfirmationRequest.report_id == src.report_id, PetMatchConfirmationRequest.pet_id.in_(ids))
                     .order_by(PetMatchConfirmationRequest.request_id.desc()).all()):
            latest_requests.setdefault(creq.pet_id, creq)
    if ids:
        for m in (db.query(ReportMatch).filter(ReportMatch.source_report_id == src.report_id,
                                               ReportMatch.matched_pet_id.in_(ids))
                  .order_by(ReportMatch.match_id).all()):
            pair_status.setdefault(m.matched_pet_id, m)
    results = []
    for pet, dist in rows:
        item = _serialize_pet(pet, current_user, db)
        m = pair_status.get(pet.pet_id)
        manual = bool(isinstance(m.ai_evidence, dict) and m.ai_evidence.get("engine") == "manual") if m is not None else False
        item["pair"] = None if m is None else {
            "match_id": m.match_id, "status": m.status, "owner_confirmation_status": m.owner_confirmation_status,
            "decided_manually": manual, "matching_mode": "manual" if manual else "ai",
            # Only an AI record has a similarity score; a manual (staff-identified) record has none
            "similarity_score": None if manual else m.similarity_score,
        }
        item["distance_km"] = round(dist, 2) if dist is not None else None
        item["shared_details"] = _pet_shared_details(src, pet, genders)
        creq = latest_requests.get(pet.pet_id)
        item["confirmation"] = _request_view(creq) if creq else None
        item["can_send_reason"] = _send_block_reason(pet, creq)
        results.append(item)
    return {"source": _serialize(src, current_user, genders, detail=True), "results": results,
            "count": len(results), "blocked_reason": None}


@router.get("/pets/{pet_id}")
def pet_detail(pet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if pet is None:
        raise HTTPException(status_code=404, detail=f"Registered pet #{pet_id} not found.")
    require_pet_in_scope(db, current_user, pet)
    return _serialize_pet(pet, current_user, db, detail=True)


class MatchPairRequest(BaseModel):
    report_id: int
    pet_id: Optional[int] = None
    matched_report_id: Optional[int] = None


@router.post("/match-pair")
def get_or_create_manual_match_pair(
    payload: MatchPairRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Returns the ReportMatch record between a report and candidate (registered pet or report).
    Creates a pending manual match row if one does not exist yet so the full Potential Match
    Review modal, Two-Way Confirmation, and verification process can be conducted.
    """
    rep = db.query(Report).filter(Report.report_id == payload.report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail=f"Report #{payload.report_id} not found.")
    verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    require_report_in_pool(db, current_user, rep)

    from app.routes.matches import _serialize_matches

    if payload.pet_id:
        pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == payload.pet_id).first()
        if not pet:
            raise HTTPException(status_code=404, detail=f"Registered pet #{payload.pet_id} not found.")
        require_pet_in_scope(db, current_user, pet)

        match = db.query(ReportMatch).options(
            joinedload(ReportMatch.source_report),
            joinedload(ReportMatch.matched_pet)
        ).filter(
            ReportMatch.source_report_id == payload.report_id,
            ReportMatch.matched_pet_id == payload.pet_id
        ).order_by(ReportMatch.match_id.desc()).first()

        if not match:
            match = ReportMatch(
                source_report_id=payload.report_id,
                matched_pet_id=payload.pet_id,
                similarity_score=0,
                status="PENDING_VERIFICATION",
                ai_explanation="Manual staff match. Staff identified candidate pet.",
                ai_evidence={
                    "engine": "manual",
                    "identified_by": current_user.user_id,
                    "staff_name": current_user.name
                },
                owner_confirmation_status="PENDING",
            )
            db.add(match)
            db.commit()
            db.refresh(match)

        # Synchronize with latest owner confirmation request if any
        creq = owner_first.latest_request(db, match.source_report_id, match.matched_pet_id)
        if creq:
            changed = False
            if creq.requested_at and not match.owner_verification_requested_at:
                match.owner_verification_requested_at = creq.requested_at
                changed = True
            if creq.staff_message and not match.owner_verification_note:
                match.owner_verification_note = creq.staff_message
                changed = True
            if creq.owner_response and not match.owner_verification_answer:
                match.owner_verification_answer = creq.owner_response
                match.owner_confirmation_status = "OWNER_CONFIRMED" if creq.owner_response == "YES" else "OWNER_REJECTED"
                changed = True
            if creq.owner_note and not match.owner_notes:
                match.owner_verification_answer_note = creq.owner_note
                match.owner_notes = creq.owner_note
                changed = True
            if creq.owner_response_at and not match.owner_verification_answered_at:
                match.owner_verification_answered_at = creq.owner_response_at
                changed = True
            if changed:
                db.commit()
                db.refresh(match)

        serialized = _serialize_matches([match], current_user, db)
        if not serialized:
            raise HTTPException(status_code=404, detail="Unable to serialize match record.")
        # The record's own method (an AI suggestion opened from Manual Matching stays an AI record)
        return serialized[0]

    if payload.matched_report_id:
        other_rep = db.query(Report).filter(Report.report_id == payload.matched_report_id).first()
        if not other_rep:
            raise HTTPException(status_code=404, detail=f"Report #{payload.matched_report_id} not found.")
        verify_subdivision_scope(current_user, other_rep.subdivision_id, db=db)
        require_report_in_pool(db, current_user, other_rep)

        # Check existing match in either direction
        match = db.query(ReportMatch).options(
            joinedload(ReportMatch.source_report),
            joinedload(ReportMatch.matched_report)
        ).filter(
            or_(
                and_(ReportMatch.source_report_id == payload.report_id, ReportMatch.matched_report_id == payload.matched_report_id),
                and_(ReportMatch.source_report_id == payload.matched_report_id, ReportMatch.matched_report_id == payload.report_id)
            )
        ).order_by(ReportMatch.match_id.desc()).first()

        if not match:
            match = ReportMatch(
                source_report_id=payload.report_id,
                matched_report_id=payload.matched_report_id,
                similarity_score=0,
                status="PENDING_VERIFICATION",
                ai_explanation="Manual duplicate review. Staff identified candidate report.",
                ai_evidence={
                    "engine": "manual",
                    "identified_by": current_user.user_id,
                    "staff_name": current_user.name
                },
            )
            db.add(match)
            db.commit()
            db.refresh(match)

        serialized = _serialize_matches([match], current_user, db)
        if not serialized:
            raise HTTPException(status_code=404, detail="Unable to serialize match record.")
        # The record's own method (an AI suggestion opened from Manual Matching stays an AI record)
        return serialized[0]

    raise HTTPException(status_code=400, detail="Either pet_id or matched_report_id must be provided.")




def _request_view(r: PetMatchConfirmationRequest) -> Dict[str, Any]:
    return {
        "request_id": r.request_id,
        "report_id": r.report_id,
        "pet_id": r.pet_id,
        "owner_id": r.owner_id,
        "status": r.status,
        "status_label": owner_first.STATUS_LABELS.get(r.status, r.status),
        "can_finalize": r.status in owner_first.FINALIZABLE,
        "requested_by": r.requested_by,
        "requested_by_name": r.requester.name if r.requester else None,
        "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        "staff_message": r.staff_message,
        "owner_response": r.owner_response,
        "owner_note": r.owner_note,
        "owner_response_at": r.owner_response_at.isoformat() if r.owner_response_at else None,
        "cancel_reason": r.cancel_reason,
        "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
        "final_decision": r.final_decision,
        "final_by_name": r.finalizer.name if r.finalizer else None,
        "final_at": r.final_at.isoformat() if r.final_at else None,
        "match_id": r.match_id,
    }


def _send_block_reason(pet: Pet, latest: Optional[PetMatchConfirmationRequest]) -> Optional[str]:
    """Why Send Confirmation isn't available for this pet (None = it is)."""
    if not pet.owner_id or pet.owner is None:
        return "This pet has no registered owner to ask."
    if (pet.owner.status or "Active").strip().title() in {"Inactive", "Suspended", "Deleted"}:
        return f"The owner's account is {pet.owner.status}."
    return owner_first.new_request_block_reason(latest)


class SendConfirmationRequest(BaseModel):
    report_id: int
    pet_id: int
    message: Optional[str] = Field(None, max_length=1000)


@router.post("/pet-confirmations")
def send_pet_confirmation(
    payload: SendConfirmationRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Send Confirmation: ask the registered owner whether the reported animal is their pet. Status becomes Awaiting
    Owner Confirmation. Nothing is decided; staff can't make a final decision on this pair until the owner says YES.
    """
    from app.routes.matches import is_pet_eligible_for_matching

    rep = db.query(Report).filter(Report.report_id == payload.report_id).with_for_update().first()
    if rep is None:
        raise HTTPException(status_code=404, detail=f"Report #{payload.report_id} not found.")
    verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    require_report_in_pool(db, current_user, rep)
    require_review_permission(current_user, rep, db)
    if (rep.current_status_id or 0) in CLOSED_STATUS_IDS or rep.duplicate_of_report_id:
        raise HTTPException(status_code=409, detail=f"Report #{rep.report_id} is closed or merged into another case.")
    blocked = _report_pet_block(db, rep)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == payload.pet_id).with_for_update().first()
    if pet is None:
        raise HTTPException(status_code=404, detail=f"Registered pet #{payload.pet_id} not found.")
    require_pet_in_scope(db, current_user, pet)
    ok, reason = is_pet_eligible_for_matching(pet)
    if not ok:
        raise HTTPException(status_code=409, detail=reason)
    if pet.pet_id in impounded_pets(db):
        raise HTTPException(status_code=409, detail=f"{pet.pet_name} is impounded, so it can't be a new sighting.")
    latest = owner_first.latest_request(db, rep.report_id, pet.pet_id)
    why_not = _send_block_reason(pet, latest)
    if why_not:
        raise HTTPException(status_code=409, detail=why_not)

    actor_role = ROLE_NAMES.get(current_user.role_id, "Staff Official")
    creq = PetMatchConfirmationRequest(
        report_id=rep.report_id, pet_id=pet.pet_id, owner_id=pet.owner_id, requested_by=current_user.user_id,
        requested_at=datetime.now(), staff_message=(payload.message or "").strip() or None, status=owner_first.AWAITING,
    )
    db.add(creq)
    db.flush()

    match = (db.query(ReportMatch).filter(ReportMatch.source_report_id == rep.report_id,
                                          ReportMatch.matched_pet_id == pet.pet_id)
             .order_by(ReportMatch.match_id.desc()).first())
    if match is None:
        match = ReportMatch(
            source_report_id=rep.report_id,
            matched_pet_id=pet.pet_id,
            similarity_score=0,  # manual: no score
            status="PENDING_VERIFICATION",
            ai_explanation=f"Staff-identified potential match: manual comparison by {current_user.name} ({actor_role}).",
            ai_evidence={"engine": "manual", "created_by": current_user.user_id},
            owner_confirmation_status="PENDING",
        )
        db.add(match)
        db.flush()

    creq.match_id = match.match_id
    match.owner_verification_requested_at = creq.requested_at
    match.owner_verification_requested_by = current_user.user_id
    match.owner_verification_note = creq.staff_message

    from app.routes.chat import find_match_thread, get_or_create_match_thread
    thread = find_match_thread(match, db) or get_or_create_match_thread(match.match_id, current_user, db)

    from app.models.chat import ChatMessage
    photo = next((m.file_url for m in (rep.media or []) if m.file_url and (m.media_type in ("Image", None))), None) or getattr(rep, "photo_url", None)

    staff_note = (payload.message or "").strip()
    if staff_note:
        msg_text = (
            f"{staff_note}\n\n"
            f"[Look-Alike Pet Confirmation: Please check Report #{rep.report_id} and confirm if this is your pet '{pet.pet_name}']"
        )
    else:
        msg_text = (
            f"Hello, staff found a reported animal in Report #{rep.report_id} that may be your registered pet '{pet.pet_name}'. "
            f"[Look-Alike Pet Confirmation: Please confirm if Report #{rep.report_id} is your pet '{pet.pet_name}']"
        )

    db.add(ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,
        media_url=photo,
        is_system=False,
        is_read=False,
        message_text=msg_text,
    ))

    db.add(Notification(
        user_id=pet.owner_id, type="pet_match_confirmation", related_id=creq.request_id,
        title=f"Is this {pet.pet_name}? Please confirm",
        message=(f"{actor_role} {current_user.name} found a reported animal (Report #{rep.report_id}) that may be your pet "
                 f"'{pet.pet_name}'. {owner_first_question()} Open My Pets to compare the photos and answer."),
    ))
    db.add(Notification(
        user_id=pet.owner_id,
        type="match_message",
        related_id=rep.report_id,
        title=f"💬 Look-Alike Pet Confirmation: {pet.pet_name}",
        message=f"{current_user.name}: {staff_note or f'Please confirm if Report #{rep.report_id} is {pet.pet_name}.'}",
        is_read=False,
    ))
    db.add(StatusHistory(
        report_id=rep.report_id, updated_by=current_user.user_id,
        remarks=f"{current_user.name} ({actor_role}) asked a registered pet owner to confirm whether this animal is their pet.",
    ))
    log_activity(
        db=db, action="SEND_PET_MATCH_CONFIRMATION", target_table="pet_match_confirmation_requests", target_id=creq.request_id,
        description=(f"{current_user.name} ({actor_role}) asked the owner of pet #{pet.pet_id} ({pet.pet_name}) to confirm "
                     f"Report #{rep.report_id}."),
        user_id=current_user.user_id, log_type="security",
        new_values={"status": owner_first.AWAITING, "report_id": rep.report_id, "pet_id": pet.pet_id, "owner_id": pet.owner_id},
        request=req, commit=False,
    )
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"The request was not sent: database error ({type(e).__name__}).")
    saved = (db.query(PetMatchConfirmationRequest).options(joinedload(PetMatchConfirmationRequest.requester))
             .filter(PetMatchConfirmationRequest.request_id == creq.request_id).first())
    return {"message": f"Confirmation request sent to {pet.owner.name if pet.owner else 'the owner'}. Status: Awaiting Owner Confirmation.",
            "request": _request_view(saved)}


def owner_first_question() -> str:
    from app.routes.pet_match_confirmations import QUESTION
    return QUESTION


class CancelConfirmationRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=1000)


@router.post("/pet-confirmations/{request_id}/cancel")
def cancel_pet_confirmation(
    request_id: int,
    payload: CancelConfirmationRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Withdraw a request the owner hasn't answered yet (e.g. sent for the wrong pet). Kept on record as Cancelled."""
    creq = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.request_id == request_id)
            .with_for_update().first())
    if creq is None:
        raise HTTPException(status_code=404, detail="Confirmation request not found.")
    rep = db.query(Report).filter(Report.report_id == creq.report_id).first()
    if rep is None:
        raise HTTPException(status_code=404, detail=f"Report #{creq.report_id} not found.")
    verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    require_review_permission(current_user, rep, db)
    if creq.status != owner_first.AWAITING:
        raise HTTPException(status_code=409, detail=(
            f"Only a request still waiting for the owner can be cancelled "
            f"(this one is {owner_first.STATUS_LABELS.get(creq.status, creq.status)})."))
    creq.status = owner_first.CANCELLED
    creq.cancelled_by = current_user.user_id
    creq.cancelled_at = datetime.now()
    creq.cancel_reason = payload.reason.strip()
    log_activity(
        db=db, action="CANCEL_PET_MATCH_CONFIRMATION", target_table="pet_match_confirmation_requests", target_id=creq.request_id,
        description=f"{current_user.name} cancelled confirmation request #{creq.request_id}: {creq.cancel_reason}",
        user_id=current_user.user_id, log_type="security",
        old_values={"status": owner_first.AWAITING}, new_values={"status": owner_first.CANCELLED},
        request=req, commit=False,
    )
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"The request was not cancelled: database error ({type(e).__name__}).")
    return {"message": f"Confirmation request #{creq.request_id} cancelled.", "status": creq.status}


@router.get("/pet-confirmations")
def list_pet_confirmations(
    report_id: int,
    pet_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Every confirmation request for a report (optionally one pet), newest first: the pair's full history."""
    rep = _get_report(db, report_id, current_user)
    q = (db.query(PetMatchConfirmationRequest)
         .options(joinedload(PetMatchConfirmationRequest.requester), joinedload(PetMatchConfirmationRequest.finalizer))
         .filter(PetMatchConfirmationRequest.report_id == rep.report_id))
    if pet_id is not None:
        q = q.filter(PetMatchConfirmationRequest.pet_id == pet_id)
    rows = q.order_by(PetMatchConfirmationRequest.request_id.desc()).all()
    return {"results": [_request_view(r) for r in rows]}


class ManualDecisionRequest(BaseModel):
    report_a_id: int
    # The other side: another report (report_b_id) or a registered pet (pet_id). Exactly one.
    report_b_id: Optional[int] = None
    pet_id: Optional[int] = None
    decision: str = Field(..., description="CONFIRMED_MATCH, NOT_A_MATCH or UNABLE_TO_VERIFY")
    notes: str = Field(..., min_length=5, max_length=2000)
    # Report pairs, confirmed only: also link both into one case (the later one becomes 'Merged — Duplicate')
    link_case: bool = False


@router.post("/decisions")
def record_decision(
    payload: ManualDecisionRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """
    Save a staff decision on a report and another report or a registered pet. One report_matches row per pair;
    every decision is kept in the log.
    """
    if payload.decision not in DECISIONS:
        raise HTTPException(status_code=400, detail=f"Decision must be one of {', '.join(DECISIONS)}.")
    notes = payload.notes.strip()
    if len(notes) < 5:
        raise HTTPException(status_code=400, detail="Explain the decision (at least 5 characters).")
    if (payload.report_b_id is None) == (payload.pet_id is None):
        raise HTTPException(status_code=400, detail="Choose either another report or a registered pet.")
    if payload.pet_id is not None:
        return _record_pet_decision(payload, notes, req, db, current_user)
    if payload.report_a_id == payload.report_b_id:
        raise HTTPException(status_code=400, detail="Choose two different reports.")
    if payload.link_case and payload.decision != "CONFIRMED_MATCH":
        raise HTTPException(status_code=400, detail="Only a confirmed match can be linked into one case.")

    # Lock both reports (lower id first) so two reviewers can't record the same pair at the same time
    a_id, b_id = payload.report_a_id, int(payload.report_b_id or 0)
    locked = {r.report_id: r for r in db.query(Report).filter(Report.report_id.in_(sorted((a_id, b_id))))
              .order_by(Report.report_id).with_for_update().all()}
    for rid in (a_id, b_id):
        if rid not in locked:
            raise HTTPException(status_code=404, detail=f"Report #{rid} not found.")
        verify_subdivision_scope(current_user, locked[rid].subdivision_id, db=db)
        require_report_in_pool(db, current_user, locked[rid])
    rep_a, rep_b = locked[a_id], locked[b_id]
    if is_cross_subdivision([rep_a, rep_b]):
        require_cross_subdivision_reviewer(current_user, [rep_a, rep_b])
    else:
        require_review_permission(current_user, rep_a, db)

    actor_role = ROLE_NAMES.get(current_user.role_id, "Staff Official")
    existing = _pair_matches(db, a_id, b_id)
    match = existing[0] if existing else None
    if match is not None:
        if match.status in (COVERED_STATUS, SUPERSEDED_STATUS):
            raise HTTPException(status_code=409, detail=(
                f"This pair is already settled by the case's decision on Match #{match.covered_by_match_id}."))
        if match.status == payload.decision and not payload.link_case:
            raise HTTPException(status_code=409, detail=(
                f"Report #{a_id} and Report #{b_id} are already recorded as "
                f"'{DECISION_LABELS[payload.decision]}' (Match #{match.match_id}). No duplicate record was created."))
    prev_status = match.status if match else None
    same_case = case_root(db, rep_a).report_id == case_root(db, rep_b).report_id
    if payload.link_case and same_case and match is not None and match.status == "CONFIRMED_MATCH":
        raise HTTPException(status_code=409, detail="These reports are already confirmed and in the same case.")

    if match is None:
        match = ReportMatch(
            source_report_id=a_id, matched_report_id=b_id,
            similarity_score=0,  # no AI score: never shown for manual decisions
            status=payload.decision,
            ai_explanation="Staff-identified potential match (manual comparison).",
            ai_evidence={"engine": "manual", "created_by": current_user.user_id},
        )
        db.add(match)
        db.flush()
    match.source_report, match.matched_report = (rep_a, rep_b) if match.source_report_id == a_id else (rep_b, rep_a)

    linked_case_id = None
    if payload.decision == "CONFIRMED_MATCH" and payload.link_case and not same_case:
        linked_case_id = confirm_report_match(db, current_user, match, notes, req, actor_role)
    elif payload.decision == "NOT_A_MATCH":
        # Closes any other open suggestion between the two cases; refuses reports already merged together
        reject_report_match(db, current_user, match, notes, actor_role)

    match.status = payload.decision
    match.verification_notes = notes
    match.reviewed_by = current_user.user_id
    match.reviewer_role = actor_role
    match.verified_at = datetime.now()

    label = DECISION_LABELS[payload.decision]
    for rep, other in ((rep_a, rep_b), (rep_b, rep_a)):
        db.add(StatusHistory(
            report_id=rep.report_id, updated_by=current_user.user_id,
            remarks=f"Manual match review with Report #{other.report_id}: {label} by {current_user.name} ({actor_role}). {notes}"
            + (f" Both reports are in Case #{linked_case_id}." if linked_case_id else ""),
        ))
    if payload.decision == "CONFIRMED_MATCH":
        # Tell the owner of a Lost Pet report that staff matched it to another report
        for rep, other in ((rep_a, rep_b), (rep_b, rep_a)):
            if rep.category_id == LOST_PET_CATEGORY_ID and rep.user_id:
                db.add(Notification(
                    user_id=rep.user_id, title="Possible Match Confirmed by Staff",
                    message=(f"{actor_role} {current_user.name} confirmed that Report #{other.report_id} matches your "
                             f"lost pet report #{rep.report_id}. Open your report for the next steps."),
                    type="status_update", related_id=rep.report_id,
                ))

    ai_state = gemini_status(db)["state"]
    decision = ManualMatchDecision(
        match_id=match.match_id, report_a_id=a_id, report_b_id=b_id, decision=payload.decision,
        previous_status=prev_status, notes=notes, staff_id=current_user.user_id, staff_role=actor_role,
        linked_case_id=linked_case_id, ai_state=ai_state,
    )
    db.add(decision)
    log_activity(
        db=db, action="MANUAL_MATCH_DECISION", target_table="report_matches", target_id=match.match_id,
        description=(f"{current_user.name} ({actor_role}) recorded '{label}' for Report #{a_id} and Report #{b_id} "
                     f"in Manual Matching (Gemini: {ai_state}). Notes: {notes}"),
        user_id=current_user.user_id, log_type="security",
        old_values={"status": prev_status},
        new_values={"status": payload.decision, "report_a_id": a_id, "report_b_id": b_id,
                    "linked_case_id": linked_case_id, "ai_state": ai_state},
        request=req, commit=False,
    )
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"The decision was not saved: database error ({type(e).__name__}).")
    db.refresh(decision)
    return {
        "message": (f"Saved: Report #{a_id} and Report #{b_id} marked '{label}'."
                    + (f" Both reports are now in Case #{linked_case_id}." if linked_case_id else "")),
        "match_id": match.match_id,
        "status": match.status,
        "decision_id": decision.decision_id,
        "linked_case_id": linked_case_id,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
    }


def _record_pet_decision(payload: ManualDecisionRequest, notes: str, req: Request, db: Session, current_user: User):
    """
    Staff final verification of a report and a registered pet. Only after the owner answered YES to a confirmation
    request (owner-first). It goes through verify_match, which enforces the same rule again and applies identity locks,
    closed cases, impounded pets, notifications and the audit log. A Confirm then links the report to the pet's record.
    """
    from app.routes.matches import is_pet_eligible_for_matching, verify_match
    from app.schemas.report_match import ReportMatchVerifyRequest

    if payload.link_case:
        raise HTTPException(status_code=400, detail="Linking into one case is only for two reports.")
    rep = db.query(Report).filter(Report.report_id == payload.report_a_id).with_for_update().first()
    if rep is None:
        raise HTTPException(status_code=404, detail=f"Report #{payload.report_a_id} not found.")
    verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    require_report_in_pool(db, current_user, rep)
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == payload.pet_id).with_for_update().first()
    if pet is None:
        raise HTTPException(status_code=404, detail=f"Registered pet #{payload.pet_id} not found.")
    require_pet_in_scope(db, current_user, pet)
    if rep.pet_id == pet.pet_id:
        raise HTTPException(status_code=409, detail=f"Report #{rep.report_id} is already linked to {pet.pet_name}.")
    if pet.owner_id is not None:
        creq = owner_first.latest_request(db, rep.report_id, pet.pet_id)
        if creq is None or creq.status == owner_first.CANCELLED:
            raise HTTPException(status_code=409, detail=(
                "Send Confirmation to the owner first. Staff can decide only after the owner confirms this is their pet."))
        if creq.status == owner_first.AWAITING:
            raise HTTPException(status_code=409, detail=(
                "Awaiting Owner Confirmation: the final decision unlocks after the owner confirms this is their pet."))
        if creq.status == owner_first.OWNER_REJECTED:
            if payload.decision == "CONFIRMED_MATCH":
                raise HTTPException(status_code=409, detail=(
                    "Owner Rejected: the owner said this is not their pet, so it can't be confirmed. Search for another registered pet."))
        elif creq.status not in owner_first.FINALIZABLE:
            raise HTTPException(status_code=409, detail=(
                f"This pair already has a final decision ({owner_first.STATUS_LABELS.get(creq.status, creq.status)})."))
    if payload.decision == "CONFIRMED_MATCH":
        ok, reason = is_pet_eligible_for_matching(pet)
        if not ok:
            raise HTTPException(status_code=409, detail=reason)
        blocked = _report_pet_block(db, rep)
        if blocked:
            raise HTTPException(status_code=409, detail=blocked)

    match = (db.query(ReportMatch).filter(ReportMatch.source_report_id == rep.report_id,
                                          ReportMatch.matched_pet_id == pet.pet_id)
             .order_by(ReportMatch.match_id).first())
    if match is not None and match.status == payload.decision:
        raise HTTPException(status_code=409, detail=(
            f"Report #{rep.report_id} and {pet.pet_name} are already recorded as "
            f"'{DECISION_LABELS[payload.decision]}' (Match #{match.match_id}). No duplicate record was created."))
    prev_status = match.status if match else None
    if match is None:
        # Opened as a pending suggestion so verify_match applies its identity-lock and closed-case checks
        match = ReportMatch(
            source_report_id=rep.report_id, matched_pet_id=pet.pet_id,
            similarity_score=0,  # no AI score: never shown for manual decisions
            status="PENDING_VERIFICATION",
            ai_explanation="Staff-identified potential match (manual comparison).",
            ai_evidence={"engine": "manual", "created_by": current_user.user_id},
        )
        db.add(match)
        db.flush()

    actor_role = ROLE_NAMES.get(current_user.role_id, "Staff Official")
    ai_state = gemini_status(db)["state"]
    label = DECISION_LABELS[payload.decision]
    decision = ManualMatchDecision(
        match_id=match.match_id, report_a_id=rep.report_id, pet_id=pet.pet_id, decision=payload.decision,
        previous_status=prev_status, notes=notes, staff_id=current_user.user_id, staff_role=actor_role,
        ai_state=ai_state,
    )
    db.add(decision)
    log_activity(
        db=db, action="MANUAL_MATCH_DECISION", target_table="report_matches", target_id=match.match_id,
        description=(f"{current_user.name} ({actor_role}) recorded '{label}' for Report #{rep.report_id} and registered "
                     f"pet #{pet.pet_id} ({pet.pet_name}) in Manual Matching (Gemini: {ai_state}). Notes: {notes}"),
        user_id=current_user.user_id, log_type="security",
        old_values={"status": prev_status},
        new_values={"status": payload.decision, "report_a_id": rep.report_id, "pet_id": pet.pet_id,
                    "ai_state": ai_state},
        request=req, commit=False,
    )
    try:
        # Commits the decision, this log row and the audit entries together, or raises before anything is saved
        verify_match(match.match_id, ReportMatchVerifyRequest(decision=payload.decision, notes=notes), req, db,
                     current_user)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"The decision was not saved: database error ({type(e).__name__}).")
    db.refresh(decision)
    db.refresh(rep)
    linked = rep.pet_id == pet.pet_id
    message = f"Saved: Report #{rep.report_id} and {pet.pet_name} marked '{label}'."
    if payload.decision == "CONFIRMED_MATCH":
        message += (f" Verified match: the report is now linked to {pet.pet_name}'s record." if linked else
                    " The report could not be linked to the pet's record yet; check the report for details.")
    return {
        "message": message,
        "match_id": match.match_id,
        "status": match.status,
        "decision_id": decision.decision_id,
        "linked_case_id": None,
        "linked_to_pet": linked,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
    }


@router.get("/history")
def decision_history(
    report_id: Optional[int] = None,
    pet_id: Optional[int] = None,
    decision: Optional[str] = Query(None, pattern="^(CONFIRMED_MATCH|NOT_A_MATCH|UNABLE_TO_VERIFY)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Every manual decision (rejected and changed ones included) on reports in the staff member's area, newest first."""
    q = db.query(ManualMatchDecision).options(joinedload(ManualMatchDecision.staff))
    if pet_id is not None:
        q = q.filter(ManualMatchDecision.pet_id == pet_id)
    if report_id is not None:
        q = q.filter(or_(ManualMatchDecision.report_a_id == report_id, ManualMatchDecision.report_b_id == report_id))
    if decision:
        q = q.filter(ManualMatchDecision.decision == decision)
    if current_user.role_id != 4:
        visible = _scoped(db.query(Report.report_id), current_user).subquery()
        q = q.filter(ManualMatchDecision.report_a_id.in_(select(visible.c.report_id)),
                     or_(ManualMatchDecision.report_b_id.is_(None),
                         ManualMatchDecision.report_b_id.in_(select(visible.c.report_id))))
    rows = q.order_by(ManualMatchDecision.created_at.desc(), ManualMatchDecision.decision_id.desc()).limit(limit).all()
    pet_ids = {d.pet_id for d in rows if d.pet_id}
    pet_names = dict(db.query(Pet.pet_id, Pet.pet_name).filter(Pet.pet_id.in_(pet_ids)).all()) if pet_ids else {}
    return {"results": [{
        "decision_id": d.decision_id, "match_id": d.match_id,
        "report_a_id": d.report_a_id, "report_b_id": d.report_b_id,
        "pet_id": d.pet_id, "pet_name": pet_names.get(d.pet_id) if d.pet_id else None,
        "decision": d.decision, "decision_label": DECISION_LABELS.get(d.decision, d.decision),
        "previous_status": d.previous_status, "notes": d.notes,
        "staff_id": d.staff_id, "staff_name": d.staff.name if d.staff else None, "staff_role": d.staff_role,
        "linked_case_id": d.linked_case_id, "ai_state": d.ai_state,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    } for d in rows]}
