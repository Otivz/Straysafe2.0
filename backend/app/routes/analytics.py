"""Role-scoped, read-only analytics endpoints."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.services import analytics_ai_summary
from app.services.analytics_service import AnalyticsFilters, analytics_payload
from app.utils.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/subdivision")
def get_subdivision_analytics(
    filters: AnalyticsFilters = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role_id not in (2, 4):
        raise HTTPException(403, "Analytics is available to Subdivision Leaders and Administrators.")
    if current_user.role_id == 2:
        target = current_user.subdivision_id
        if not target:
            raise HTTPException(403, "A subdivision assignment is required to view local analytics.")
        if filters.subdivision_id and filters.subdivision_id != target:
            raise HTTPException(403, "You can only view analytics for your assigned subdivision.")
    else:
        target = filters.subdivision_id or current_user.subdivision_id
        if not target:
            raise HTTPException(422, "Select a subdivision to view local analytics.")
    return analytics_payload(db, filters, target, admin=False)


@router.get("/admin")
def get_admin_analytics(
    filters: AnalyticsFilters = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role_id != 4:
        raise HTTPException(403, "Administrator access is required for municipal analytics.")
    return analytics_payload(db, filters, filters.subdivision_id, admin=True)



def _summary_scope(current_user: User, subdivision_id: Optional[int]) -> int:
    """The one subdivision an AI summary is for: a Leader's own; an Administrator's chosen (or own) one."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(403, "The AI summary is available to Subdivision Leaders and Administrators.")
    if current_user.role_id == 2:
        if not current_user.subdivision_id:
            raise HTTPException(403, "A subdivision assignment is required to view local analytics.")
        if subdivision_id and subdivision_id != current_user.subdivision_id:
            raise HTTPException(403, "You can only view analytics for your assigned subdivision.")
        return current_user.subdivision_id
    target = subdivision_id or current_user.subdivision_id
    if not target:
        raise HTTPException(422, "Select a subdivision to view local analytics.")
    return target


@router.get("/ai-summary")
def get_ai_summary(
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    subdivision_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The cached AI trend and hotspot summary for this range and these numbers, or not_generated / disabled / insufficient_data. Never calls Gemini."""
    return analytics_ai_summary.read(db, _summary_scope(current_user, subdivision_id), start, end)


@router.post("/ai-summary")
@limiter.limit("10/minute")
def post_ai_summary(
    request: Request,
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    refresh: bool = Query(False),
    subdivision_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The cached summary if there is one, else make it from aggregated, anonymised statistics. refresh=true makes it again. Advisory only; a failure is a normal answer."""
    result = analytics_ai_summary.generate(db, _summary_scope(current_user, subdivision_id), start, end, current_user, refresh=refresh)
    db.commit()
    return result
