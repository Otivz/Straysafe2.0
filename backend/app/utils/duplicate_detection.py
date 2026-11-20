"""
Attribute-based Related Report Detection & Similarity Scoring (No AI / Visual Scoring).

Evaluates reports that may describe the same animal, incident, or related occurrence using:
  - Species / Animal Type: MANDATORY filter (checked before scoring; incompatible types excluded)
  - Location (25%): Haversine distance + landmark + subdivision
  - Breed (15%): Exact & normalized breed comparison (unavailable if missing, never penalized as mismatch)
  - Colour / Coat (15%): Colour tags, primary/secondary colours, and partial multi-colour overlap
  - Description (20%): Normalized keyword overlap + distinctive physical/incident characteristic boost
  - Date (15%): Incident date proximity (prefers seen_at over created_at)
  - Time (10%): Incident time-of-day proximity

Uploaded photos remain available for manual side-by-side review only and NEVER contribute to scores.
Missing attributes are safely excluded and weights are redistributed across available attributes.
"""
import math
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.utils import case_vocab as V

DEFAULT_WEIGHTS: Dict[str, float] = {
    "location": 0.25,
    "breed": 0.15,
    "colour": 0.15,
    "description": 0.20,
    "date": 0.15,
    "time": 0.10,
}

CLASSIFICATION_THRESHOLDS: Tuple[Tuple[float, str], ...] = (
    (0.78, "Strongly Related"),
    (0.55, "Potentially Related"),
    (0.35, "Low Similarity"),
    (0.0, "Not Related"),
)

_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "in", "on", "at", "near", "by", "to", "of",
    "with", "for", "is", "was", "were", "it", "its", "this", "that", "from",
    "animal", "stray", "found", "seen", "saw", "around", "area", "gate",
})

_DISTINCTIVE_WORDS = frozenset({
    "collar", "leash", "tag", "patch", "spot", "spotted", "stripe", "striped",
    "chest", "paw", "paws", "limp", "limping", "injured", "bleeding", "wound",
    "scar", "ear", "notched", "tail", "blind", "eye", "pregnant", "puppy",
    "kitten", "aggressive", "bite", "bitten", "chasing", "white", "black",
    "brown", "tan", "golden", "gray", "grey", "orange", "tabby", "tricolor",
    "calico", "aspin", "puspin", "fur", "long", "short", "medium", "small", "large",
})

_BREED_ALIASES: Dict[str, str] = {
    "askal": "aspin",
    "asong pinoy": "aspin",
    "philippine native dog": "aspin",
    "pusakal": "puspin",
    "pusang pinoy": "puspin",
    "mixed breed": "mixed",
    "mix": "mixed",
    "crossbreed": "mixed",
    "half": "mixed",
}


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def animal_types_compatible(type_a: Optional[str], type_b: Optional[str]) -> bool:
    """Mandatory filter: reports involving different known animal types are never related as same-animal."""
    a = V.normalize_animal_type(type_a) if type_a else None
    b = V.normalize_animal_type(type_b) if type_b else None
    if not a or not b or a == "Other" or b == "Other":
        return True
    return a == b


def _tokens(text: Optional[str]) -> set:
    if not text:
        return set()
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if len(w) >= 2 and w not in _STOPWORDS}


def _location_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[float], str, Optional[str]]:
    dist_m: Optional[float] = None
    if a.latitude is not None and a.longitude is not None and b.latitude is not None and b.longitude is not None:
        dist_m = round(haversine_meters(float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude)), 1)
        if dist_m <= 50:
            score, loc_class = 1.0, "Same Location"
        elif dist_m <= 150:
            score, loc_class = 0.85, "Very Near"
        elif dist_m <= 400:
            score, loc_class = 0.65, "Nearby"
        elif dist_m <= 1000:
            score, loc_class = 0.35, "Different Location"
        else:
            score, loc_class = 0.10, "Different Location"

        la, lb = _tokens(a.landmark), _tokens(b.landmark)
        if la and lb and (la & lb):
            score = min(1.0, score + 0.1)

        place = (a.landmark or b.landmark or "").strip()
        if place:
            reason = f"Location: {loc_class} near {place}, approximately {int(round(dist_m))} meters apart."
        else:
            reason = f"Location: {loc_class}, approximately {int(round(dist_m))} meters apart."
        return score, dist_m, loc_class, reason

    la, lb = _tokens(a.landmark), _tokens(b.landmark)
    if la and lb:
        overlap = len(la & lb) / len(la | lb)
        loc_class = "Same Location" if overlap >= 0.7 else "Nearby" if overlap >= 0.35 else "Different Location"
        return overlap, None, loc_class, (f"Location: {loc_class} (matching landmark details)." if overlap >= 0.35 else None)
    if a.subdivision_id and b.subdivision_id and a.subdivision_id == b.subdivision_id:
        return 0.5, None, "Nearby", "Location: Same subdivision."
    return None, None, "Unknown", None


def normalize_breed_strict(raw: Optional[str]) -> str:
    """Normalize breed by removing unnecessary spaces and ignoring capitalization differences. No fuzzy/alias cross-matching."""
    txt = re.sub(r"\s+", " ", (raw or "").strip().lower())
    if not txt or txt in ("unknown", "not sure", "unsure", "n/a", "na", "none", "-", "not known", "unspecified"):
        return ""
    return txt


def _normalize_breed(raw: Optional[str]) -> str:
    return normalize_breed_strict(raw)


def _breed_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[str]]:
    ba, bb = normalize_breed_strict(a.animal_breed), normalize_breed_strict(b.animal_breed)
    if not ba or not bb:
        return None, None
    if ba == bb:
        return 1.0, f"Breed: {(a.animal_breed or '').strip()} – Exact Match."
    return 0.0, f"Breed: {(a.animal_breed or '').strip()} vs {(b.animal_breed or '').strip()} – Mismatch."


_COLOUR_PLACEHOLDERS = {"", "unknown", "not sure", "unsure", "n/a", "na", "none", "-", "not known", "unspecified"}


def normalize_colours_list(colors_list: Optional[Any], color_text: Optional[str] = None) -> set:
    """Extract normalized individual colour names (trimming extra spaces and ignoring case)."""
    parts: List[str] = []
    if isinstance(colors_list, (list, tuple, set)):
        for item in colors_list:
            if item:
                parts.extend(re.split(r"[,/&+·]+|\band\b|\bwith\b", str(item), flags=re.IGNORECASE))
    if color_text:
        parts.extend(re.split(r"[,/&+·]+|\band\b|\bwith\b", str(color_text), flags=re.IGNORECASE))
    normalized = set()
    for p in parts:
        clean = re.sub(r"\s+", " ", p.strip().lower())
        if clean and clean not in _COLOUR_PLACEHOLDERS:
            normalized.add(clean)
    return normalized


def _colour_tokens(r: Report) -> set:
    return normalize_colours_list(getattr(r, "animal_colors", None), getattr(r, "animal_color", None))


def _colour_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[str]]:
    ca, cb = _colour_tokens(a), _colour_tokens(b)
    if not ca or not cb:
        return None, None
    shared = ca.intersection(cb)
    if not shared:
        return 0.0, None
    jaccard = len(shared) / len(ca | cb)
    overlap_min = len(shared) / min(len(ca), len(cb))
    score = 1.0 if ca == cb else min(1.0, 0.5 * jaccard + 0.5 * overlap_min)
    label = ", ".join(w.title() for w in sorted(shared)[:3])
    status = "Exact Match" if ca == cb else "Partial Match"
    return score, f"Colour / Coat: {label} – {status}."


def is_eligible_match(reported: Any, candidate: Any) -> Tuple[bool, str, str]:
    """
    Mandatory 3-step validation sequence BEFORE calculating similarity scores:
      1. Animal species/type exact compatibility.
      2. Exact breed match after normalization (missing -> Insufficient Information; different -> Reject).
      3. At least one common coat colour via set intersection (missing -> Insufficient Information; disjoint -> Reject).
    Returns (is_eligible, classification_if_not_eligible, reason).
    """
    sp_a = V.normalize_animal_type(getattr(reported, "animal_type", None) or getattr(reported, "pet_type", None))
    sp_b = V.normalize_animal_type(getattr(candidate, "animal_type", None) or getattr(candidate, "pet_type", None))
    if not sp_a or not sp_b or sp_a == "Unknown" or sp_b == "Unknown":
        return False, "Insufficient Information", "Species / Animal Type is missing on one or both records."
    if sp_a.lower() != sp_b.lower():
        return False, "Not Related", "Species / Animal Type mismatch — excluded from same-animal incident suggestions."

    br_a = normalize_breed_strict(getattr(reported, "animal_breed", None) or getattr(reported, "breed", None))
    br_b = normalize_breed_strict(getattr(candidate, "animal_breed", None) or getattr(candidate, "breed", None))
    if not br_a or not br_b:
        return False, "Insufficient Information", "Insufficient Information: breed is missing or unrecorded on one or both records."
    if br_a != br_b:
        return False, "Not Related", f"Breed mismatch ({br_a.title()} vs {br_b.title()}) — rejected."

    col_a = normalize_colours_list(
        getattr(reported, "animal_colors", None) or getattr(reported, "colors", None),
        getattr(reported, "animal_color", None) or getattr(reported, "color_markings", None) or getattr(reported, "color", None),
    )
    col_b = normalize_colours_list(
        getattr(candidate, "animal_colors", None) or getattr(candidate, "colors", None),
        getattr(candidate, "animal_color", None) or getattr(candidate, "color_markings", None) or getattr(candidate, "color", None),
    )
    if not col_a or not col_b:
        return False, "Insufficient Information", "Insufficient Information: coat colour is missing or unrecorded on one or both records."
    if not col_a.intersection(col_b):
        return False, "Not Related", "Coat colour mismatch (no common colour) — rejected."

    return True, "Eligible", "Mandatory species, breed, and colour checks passed."


def _description_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[str]]:
    ta = _tokens(f"{a.description or ''} {a.condition or ''} {a.estimated_size or ''}")
    tb = _tokens(f"{b.description or ''} {b.condition or ''} {b.estimated_size or ''}")
    if not ta or not tb:
        return None, None
    shared = ta & tb
    union = ta | tb
    base = len(shared) / len(union) if union else 0.0
    distinctive = shared & _DISTINCTIVE_WORDS
    boost = min(0.35, 0.12 * len(distinctive))
    score = min(1.0, base * 1.4 + boost)
    if distinctive:
        return score, f"Description: Similar characteristics ({', '.join(sorted(distinctive)[:3])})."
    if score >= 0.4:
        return score, "Description: Similar physical or incident details."
    return score, None


def _incident_time(r: Report) -> Optional[datetime]:
    return getattr(r, "seen_at", None) or r.created_at


def _date_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[str]]:
    ta, tb = _incident_time(a), _incident_time(b)
    if not ta or not tb:
        return None, None
    days = abs((ta.date() - tb.date()).days)
    if days == 0:
        return 1.0, "Date: Same incident date."
    if days == 1:
        return 0.85, "Date: 1 day apart."
    if days <= 3:
        return 0.65, f"Date: {days} days apart."
    if days <= 7:
        return 0.40, f"Date: {days} days apart."
    if days <= 14:
        return 0.15, f"Date: {days} days apart."
    return 0.0, None


def _time_score(a: Report, b: Report) -> Tuple[Optional[float], Optional[str]]:
    ta, tb = _incident_time(a), _incident_time(b)
    if not ta or not tb:
        return None, None
    mins_a = ta.hour * 60 + ta.minute
    mins_b = tb.hour * 60 + tb.minute
    diff_mins = abs(mins_a - mins_b)
    diff_mins = min(diff_mins, 1440 - diff_mins)
    if diff_mins <= 30:
        return 1.0, f"Time: Approximately {diff_mins} minute(s) apart."
    if diff_mins <= 120:
        hrs = round(diff_mins / 60, 1)
        return 0.85, f"Time: Approximately {hrs} hour(s) apart."
    if diff_mins <= 240:
        return 0.60, f"Time: Approximately {round(diff_mins / 60, 1)} hours apart."
    if diff_mins <= 480:
        return 0.30, None
    return 0.10, None


def classify_score(score: float, insufficient_data: bool = False) -> str:
    if insufficient_data:
        return "Insufficient Information"
    for threshold, label in CLASSIFICATION_THRESHOLDS:
        if score >= threshold:
            return label
    return "Not Related"


def score_pair(
    a: Report,
    b: Report,
    weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Compute attribute-based similarity between two reports using conventional database & text logic.
    Mandatory validation sequence (1. Species, 2. Exact Breed, 3. Partial Colour Overlap) is enforced FIRST.
    Photographs are never scored.
    """
    if not animal_types_compatible(a.animal_type, b.animal_type):
        return {
            "eligible": False,
            "combined_score": None,
            "classification": "Not Related",
            "species_compatible": False,
            "species_status": f"{a.animal_type or 'Unknown'} vs {b.animal_type or 'Unknown'} – Incompatible",
            "distance_meters": None,
            "location_class": "Unknown",
            "scores": {"location": None, "breed": None, "colour": None, "description": None, "date": None, "time": None},
            "reasons": ["Species / Animal Type mismatch — excluded from same-animal incident suggestions."],
        }

    norm_a = V.normalize_animal_type(a.animal_type) if a.animal_type else "Unknown"
    species_status = f"{norm_a} – Compatible"

    eligible, fail_classification, fail_reason = is_eligible_match(a, b)
    if not eligible:
        breed_s, _ = _breed_score(a, b)
        colour_s, _ = _colour_score(a, b)
        return {
            "eligible": False,
            "combined_score": None,
            "classification": fail_classification,
            "species_compatible": True,
            "species_status": species_status,
            "distance_meters": None,
            "location_class": "Unknown",
            "scores": {
                "location": None,
                "breed": round(breed_s, 3) if breed_s is not None else None,
                "colour": round(colour_s, 3) if colour_s is not None else None,
                "description": None,
                "date": None,
                "time": None,
            },
            "reasons": [fail_reason],
        }

    w = weights or DEFAULT_WEIGHTS
    loc_s, dist_m, loc_class, loc_reason = _location_score(a, b)
    breed_s, breed_reason = _breed_score(a, b)
    colour_s, colour_reason = _colour_score(a, b)
    desc_s, desc_reason = _description_score(a, b)
    date_s, date_reason = _date_score(a, b)
    time_s, time_reason = _time_score(a, b)

    raw_scores = {
        "location": loc_s,
        "breed": breed_s,
        "colour": colour_s,
        "description": desc_s,
        "date": date_s,
        "time": time_s,
    }
    available = {k: v for k, v in raw_scores.items() if v is not None}
    total_w = sum(w[k] for k in available)
    combined = (sum(available[k] * w[k] for k in available) / total_w) if total_w > 0 else 0.0
    combined = round(max(0.0, min(1.0, combined)), 4)

    insufficient = len(available) < 2
    classification = classify_score(combined, insufficient_data=insufficient)

    norm_a = V.normalize_animal_type(a.animal_type) if a.animal_type else "Unknown"
    species_status = f"{norm_a} – Compatible"
    reasons: List[str] = [f"Species: {species_status}"]
    for r in (loc_reason, breed_reason, colour_reason, desc_reason, date_reason, time_reason):
        if r:
            reasons.append(r)

    return {
        "eligible": True,
        "combined_score": combined,
        "classification": classification,
        "species_compatible": True,
        "species_status": species_status,
        "distance_meters": dist_m,
        "location_class": loc_class,
        "scores": {k: (round(v, 3) if v is not None else None) for k, v in raw_scores.items()},
        "reasons": reasons,
    }


def _rejected_partner_ids(db: Session, report_id: int) -> set:
    rejected = set()
    rows = db.query(ReportMatch).filter(
        ReportMatch.matched_report_id.isnot(None),
        ReportMatch.status == "REJECTED_MATCH",
        or_(ReportMatch.source_report_id == report_id, ReportMatch.matched_report_id == report_id),
    ).all()
    for m in rows:
        rejected.add(m.matched_report_id if m.source_report_id == report_id else m.source_report_id)

    audits = db.query(AuditLog).filter(
        AuditLog.action == "DUPLICATE_MARKED_NOT_DUPLICATE",
        AuditLog.target_table == "reports",
        AuditLog.target_id == report_id,
    ).all()
    for a in audits:
        if isinstance(a.new_values, dict) and a.new_values.get("other_report_id"):
            rejected.add(int(a.new_values["other_report_id"]))
    return rejected


def find_duplicate_candidates(
    db: Session,
    base: Report,
    min_score: float = 0.55,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Find ranked potentially related report candidates for `base` without AI/photo scoring."""
    rejected_ids = _rejected_partner_ids(db, base.report_id)
    q = (
        db.query(Report)
        .options(joinedload(Report.reporter), joinedload(Report.media), joinedload(Report.category))
        .filter(
            Report.report_id != base.report_id,
            Report.duplicate_of_report_id.is_(None),
            Report.split_from_report_id.is_(None),
            or_(Report.current_status_id.is_(None), Report.current_status_id != V.MERGED_LEGACY_ID),
        )
    )
    if base.subdivision_id is not None:
        q = q.filter(Report.subdivision_id == base.subdivision_id)
    if rejected_ids:
        q = q.filter(Report.report_id.notin_(list(rejected_ids)))

    candidates = q.order_by(Report.report_id.desc()).limit(150).all()

    results: List[Dict[str, Any]] = []
    for cand in candidates:
        scored = score_pair(base, cand)
        if not scored["eligible"] or scored["combined_score"] is None or scored["combined_score"] < min_score:
            continue
        yr = (cand.created_at or datetime.now()).year
        color_display = ", ".join(cand.animal_colors) if cand.animal_colors else (cand.animal_color or None)
        results.append({
            "report_id": cand.report_id,
            "reference": f"SS-{yr}-{cand.report_id:04d}",
            "category": cand.category.category_name if cand.category else None,
            "animal_type": cand.animal_type,
            "breed": cand.animal_breed,
            "color": color_display,
            "landmark": cand.landmark,
            "incident_at": getattr(cand, "seen_at", None) or cand.created_at,
            "created_at": cand.created_at,
            "reporter_name": cand.reporter.name if cand.reporter else "Unknown",
            "description": cand.description,
            "condition": cand.condition,
            "case_status": cand.case_status or V.case_status_from_legacy(cand.current_status_id),
            # Supporting evidence photos for manual review only (never scored)
            "photo_urls": [m.file_url for m in (cand.media or []) if m.file_url and not m.is_evidence],
            "combined_score": scored["combined_score"],
            "classification": scored["classification"],
            "species_status": scored["species_status"],
            "location_class": scored["location_class"],
            "distance_meters": scored["distance_meters"],
            "scores": scored["scores"],
            "reasons": scored["reasons"],
        })

    results.sort(key=lambda x: x["combined_score"], reverse=True)
    return results[:limit]
