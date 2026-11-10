"""
The case list the Subdivision Admin loads first: one short row per case, with only what a list, a filter, the dashboard and a
map need. The whole case (assessment text, referrals, follow-ups, warnings, claims, links) is fetched when a case is opened
(GET /cases/{id}), so the list stays light however many cases there are.

STAFF ONLY, like every /cases route: it carries the reporter's name and internal assessment state. Residents never get this
shape (what a resident may see of a report is decided by utils/report_visibility.redact_response).
"""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import case as sql_case, func
from sqlalchemy.orm import Session, joinedload

from app.models.report import Report, ReportMedia, StatusHistory
from app.models.user import User
from app.utils import case_state, case_vocab as V
from app.utils.warning_rules import report_family

DEFAULT_PAGE = 100
MAX_PAGE = 200
DESCRIPTION_CHARS = 400          # the list needs a line or two; the case view has the whole text


def status_expr():
    """
    The SQL twin of case_state.case_status_of: the stored case_status when it is one of the four, otherwise the status read
    from the legacy ladder. Always a string (never NULL), so `== x` and `!= x` behave the same for an old row as a new one.
    """
    legacy = sql_case(
        (Report.current_status_id.in_(list(V.CLOSED_LEGACY_IDS)), V.CLOSED),
        (Report.current_status_id.in_(list(V.IN_PROGRESS_LEGACY_IDS)), V.IN_PROGRESS),
        (Report.current_status_id.in_(list(V.UNDER_REVIEW_LEGACY_IDS)), V.UNDER_REVIEW),
        else_=V.REPORTED)
    return sql_case((Report.case_status.in_(list(V.CASE_STATUSES)), Report.case_status), else_=legacy)


def scope_of(user: User, subdivision_id: Optional[int], what: str) -> Optional[int]:
    """The subdivision a staff member may read: a Leader's own, the Administrator's any (None = all)."""
    if user.role_id == 2:
        if not user.subdivision_id:
            raise HTTPException(status_code=403, detail="Your account is not assigned to a subdivision.")
        if subdivision_id is not None and subdivision_id != user.subdivision_id:
            raise HTTPException(status_code=403, detail=f"That is another subdivision's {what}.")
        return user.subdivision_id
    if user.role_id == 4:
        return subdivision_id
    raise HTTPException(status_code=403, detail=f"Only the Subdivision Leader or the Administrator can read the {what}.")


def _clip(text: Optional[str], limit: int = DESCRIPTION_CHARS) -> Optional[str]:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def case_summaries(db: Session, user: User, limit: Optional[int] = None, offset: int = 0, status: Optional[str] = None,
                   subdivision_id: Optional[int] = None) -> Dict[str, Any]:
    scope = scope_of(user, subdivision_id, "case list")
    page = min(limit if limit and limit > 0 else DEFAULT_PAGE, MAX_PAGE)
    offset = max(0, offset or 0)

    query = db.query(Report)
    if scope is not None:
        query = query.filter(Report.subdivision_id == scope)
    if status == "open":
        query = query.filter(status_expr() != V.CLOSED)
    elif status in V.CASE_STATUSES:
        query = query.filter(status_expr() == status)
    elif status:
        raise HTTPException(status_code=422, detail="status must be open, reported, under_review, in_progress or closed.")

    total = query.count()
    reports = (query.options(joinedload(Report.category)).order_by(Report.report_id.desc()).offset(offset).limit(page).all())
    return {"total": total, "limit": page, "offset": offset, "has_more": offset + len(reports) < total,
            "items": _rows(db, reports)}


def _rows(db: Session, reports: List[Report]) -> List[Dict[str, Any]]:
    ids = [r.report_id for r in reports]
    names: Dict[int, str] = {}
    photos: Dict[int, Dict[str, Any]] = {}
    latest: Dict[Any, StatusHistory] = {}
    if ids:
        # the newest timeline line of each case, for "last activity" and the dashboard's recent-activity feed
        newest = (db.query(func.max(StatusHistory.history_id)).filter(StatusHistory.report_id.in_(ids))
                  .group_by(StatusHistory.report_id))
        latest = {h.report_id: h for h in db.query(StatusHistory).filter(StatusHistory.history_id.in_(newest)).all()}
        user_ids = {i for r in reports for i in (r.user_id, r.assigned_leader_id, r.ownership_owner_id) if i}
        user_ids |= {h.updated_by for h in latest.values() if h.updated_by}
        names = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}
        for rid, url, kind in (db.query(ReportMedia.report_id, ReportMedia.file_url, ReportMedia.media_type)
                               .filter(ReportMedia.report_id.in_(ids)).order_by(ReportMedia.media_id).all()):
            entry = photos.setdefault(rid, {"count": 0, "thumbnail": None})
            entry["count"] += 1
            if entry["thumbnail"] is None and kind == "Image":
                entry["thumbnail"] = url            # the first photo is the list thumbnail

    rows = []
    for r in reports:
        status = case_state.case_status_of(r)
        family = report_family(r)
        media = photos.get(r.report_id, {"count": 0, "thumbnail": None})
        last = latest.get(r.report_id)
        rows.append({
            "report_id": r.report_id, "reported_at": r.created_at, "updated_at": (last.created_at if last else None) or r.created_at,
            "last_event": ({"history_id": last.history_id, "at": last.created_at, "text": _clip(last.remarks, 240),
                            "by_name": names.get(last.updated_by)} if last and last.remarks else None),
            "subdivision_id": r.subdivision_id,
            "case_status": status, "status_label": V.STATUS_LABELS[status], "legacy_status_id": r.current_status_id,
            "priority": case_state.priority_of(r), "is_sensitive": bool(r.is_sensitive),
            "category": {"category_id": r.category_id, "name": r.category.category_name if r.category else None, "family": family,
                         "label": V.CATEGORY_FAMILIES[family]},
            "animal": {"type": r.animal_type, "breed": r.animal_breed, "color": r.animal_color, "size": r.estimated_size,
                       "count": r.animal_count, "description": _clip(r.description), "condition": _clip(r.condition)},
            "location": {"landmark": r.landmark, "latitude": float(r.latitude) if r.latitude is not None else None,
                         "longitude": float(r.longitude) if r.longitude is not None else None},
            "reporter": {"user_id": r.user_id, "name": names.get(r.user_id)},
            "assigned_leader_id": r.assigned_leader_id, "assigned_leader_name": names.get(r.assigned_leader_id),
            "assessment": {"incident": case_state.incident_of(r), "evidence_sufficiency": case_state.sufficiency_of(r),
                           "urgency": case_state.urgency_of(r), "saved_at": r.assessed_at},
            "identity_status": case_state.identity_of(r), "ownership_status": case_state.ownership_of(r),
            "ownership_owner_id": r.ownership_owner_id, "pet_id": r.pet_id,
            "closure": case_state.closure_of(r), "reopened_count": r.reopened_count or 0,
            "merged_into_report_id": r.duplicate_of_report_id,
            "photo_count": media["count"], "thumbnail_url": media["thumbnail"],
        })
    return rows
