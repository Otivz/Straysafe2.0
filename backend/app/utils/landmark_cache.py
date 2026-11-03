import time
from typing import Dict
from sqlalchemy.orm import Session
from app.models.landmark import Landmark

_landmarks_cache: Dict[int, Landmark] = {}
_landmarks_cache_time: float = 0.0
_CACHE_TTL_SECONDS: float = 300.0  # 5 minutes


def get_landmarks_map(db: Session) -> Dict[int, Landmark]:
    """
    Return active landmarks dictionary mapping landmark_id -> Landmark object
    directly from the current database session so deleted or updated facilities
    are always immediately reflected.
    """
    global _landmarks_cache, _landmarks_cache_time
    try:
        all_lm = db.query(Landmark).filter(Landmark.status == "Active").all()
        _landmarks_cache = {l.landmark_id: l for l in all_lm}
        _landmarks_cache_time = time.monotonic()
    except Exception:
        if not _landmarks_cache:
            raise
    return _landmarks_cache


def invalidate_landmarks_cache() -> None:
    """
    Invalidate the landmark cache so next call reloads from the database.
    Call this on Landmark CREATE / UPDATE / DELETE operations.
    """
    global _landmarks_cache, _landmarks_cache_time
    _landmarks_cache.clear()
    _landmarks_cache_time = 0.0
