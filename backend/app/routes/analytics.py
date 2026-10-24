"""Role-scoped, read-only analytics endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
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
