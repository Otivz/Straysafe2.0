"""
Keeps AI work from being repeated for the same report.

1. Analysis cache: the report form already runs YOLO + the Gemini authenticity check on a photo (analyze-media).
   When the identical file is uploaded afterwards, the background job reuses those server-side results.
2. One follow-up per report: Gemini suggestions + the matching scan run once, after the report's last photo has
   been processed (queued as an `ai_jobs` row, run by the AI worker).
3. Image cache per scan: each image is downloaded once per matching scan, not once per candidate.
"""
import hashlib
import logging
import os
import threading
import time
from collections import OrderedDict
from contextvars import ContextVar
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# --- 1. Analysis cache ---------------------------------------------------------------------------------------------
_CACHE_TTL = 2 * 60 * 60
_CACHE_MAX = 200
_cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
_cache_lock = threading.Lock()


def file_key(content: Optional[bytes]) -> Optional[str]:
    return hashlib.sha256(content).hexdigest() if content else None


def _entry(key: str) -> Dict[str, Any]:
    e = _cache.get(key)
    if e is None or time.time() - e["at"] > _CACHE_TTL:
        e = {"at": time.time()}
        _cache[key] = e
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return e


def remember_yolo(content: bytes, labels: List[str], boxes: List[List[float]], confs: Optional[List[float]] = None) -> None:
    """Dog/Cat detections of a still image: labels like 'Dog', boxes as [x1, y1, x2, y2] in that image, box confidences."""
    key = file_key(content)
    if key:
        with _cache_lock:
            e = _entry(key)
            e["yolo"] = (list(labels), [list(b) for b in boxes])
            if confs is not None:
                e["yolo_conf"] = [float(c) for c in confs]


def remember_photo_check(content: bytes, check: Dict[str, Any]) -> None:
    """Same shape as photo_checks.check_animal_photo()."""
    key = file_key(content)
    if key:
        with _cache_lock:
            _entry(key)["photo_check"] = dict(check)


def cached_analysis(content: Optional[bytes]) -> Dict[str, Any]:
    key = file_key(content)
    if not key:
        return {}
    with _cache_lock:
        e = _cache.get(key)
        if e is None or time.time() - e["at"] > _CACHE_TTL:
            return {}
        return {k: v for k, v in e.items() if k != "at"}


# --- 2. Work the AI worker runs (queued through app/utils/ai_jobs.py) --------------------------------------------
def run_follow_up_now(report_id: int, hint: Optional[Dict[str, Any]] = None) -> None:
    """Gemini suggestions (when a photo gave new information) and one look-alike + duplicate scan."""
    from app.database import SessionLocal
    from app.models.report import Report
    from app.routes.matches import scan_and_generate_matches_for_report

    db = SessionLocal()
    try:
        report = db.get(Report, report_id)
        if report is None:
            return
        if hint:
            try:
                _refresh_suggestions(report, hint)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"AI suggestions failed for report #{report_id}: {e}")
        # A failed scan raises so the AI job is retried; a failed suggestion refresh above is not worth a retry.
        scan_and_generate_matches_for_report(report_id, db)
    finally:
        db.close()


def _refresh_suggestions(report, hint: Dict[str, Any]) -> None:
    from app.utils.ai_suggestions import generate_ai_suggestions
    category_name = str(report.category.category_name) if report.category and report.category.category_name else ""
    s = generate_ai_suggestions(
        description=report.description or "",
        category_name=category_name,
        media_animal_type=hint.get("animal_type"),
        media_dominant_color=hint.get("dominant_color"),
        media_estimated_size=hint.get("visual_size"),
    )
    for field in ("ai_animal_type", "ai_dominant_color", "ai_estimated_size", "ai_possible_breed", "ai_suggested_risk_level",
                  "ai_suggested_priority", "ai_suggested_priority_reason", "ai_behavior_explanation"):
        setattr(report, field, s.get(field))
    for field in ("ai_behavior_chasing", "ai_behavior_actual_bite", "ai_behavior_attempted_bite", "ai_behavior_injury",
                  "ai_behavior_aggressive"):
        setattr(report, field, s.get(field, False))
    report.ai_description_confidence = s.get("ai_field_confidence")


def media_hint(report) -> Dict[str, Any]:
    """What the report's processed photos already tell us about the animal."""
    hint: Dict[str, Any] = {"animal_type": None, "dominant_color": None, "visual_size": None}
    for m in getattr(report, "media", None) or []:
        if m.animal_type and m.animal_type != "Unknown":
            hint["animal_type"] = m.animal_type
        if m.dominant_color and m.dominant_color != "Unknown":
            hint["dominant_color"] = m.dominant_color
    return hint


def run_backfill_now(report_id: int, hint: Optional[Dict[str, Any]] = None) -> None:
    """Fill in missing AI suggestions (only if still missing). Raises on failure so the job is retried."""
    from app.database import SessionLocal
    from app.models.report import Report
    db = SessionLocal()
    try:
        report = db.get(Report, report_id)
        if report is not None and report.ai_suggested_risk_level is None:
            _refresh_suggestions(report, hint or {})
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# --- 3. Image cache per matching scan ------------------------------------------------------------------------------
_scan_images: ContextVar[Optional[Dict[str, Any]]] = ContextVar("scan_images", default=None)


def begin_scan_image_cache():
    return _scan_images.set({})


def end_scan_image_cache(token) -> None:
    _scan_images.reset(token)


def scan_image_cache() -> Optional[Dict[str, Any]]:
    return _scan_images.get()
