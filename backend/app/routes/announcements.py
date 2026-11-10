from app.tasks import unassigned_checker
from datetime import datetime
from typing import List, Optional
from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.announcement import Announcement, AnnouncementMedia, AnnouncementCategory
from app.utils.audit import log_activity
from app.models.user import User, Subdivision
from app.utils.auth import get_current_user, get_current_staff_or_admin, verify_subdivision_scope
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementResponse,
)
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.uploads import read_and_validate_upload

router = APIRouter(prefix="/announcements", tags=["announcements"])

ANNOUNCEMENT_STATUSES = ("Draft", "Published", "Archived")


def _require_can_manage(ann: Announcement, user: User) -> None:
    """Who may edit an alert, change its status or add media: an administrator, its author, a Barangay staff member of
    its barangay, or the Subdivision Leader of its subdivision."""
    if user.role_id == 4 or ann.created_by == user.user_id:
        return
    if user.role_id == 3 and ann.barangay_id is not None and ann.barangay_id == user.barangay_id:
        return
    if user.role_id == 2 and ann.subdivision_id is not None and ann.subdivision_id == user.subdivision_id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only manage announcements for your own subdivision or barangay.")


def _load_full(db: Session, announcement_id: int) -> Announcement:
    ann = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(Announcement.announcement_id == announcement_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return ann


CATEGORY_MAP = {
    "Emergency": "Emergency Alert",
    "Animal Advisory": "General Advisory",
    "Vaccination Drive": "Community Event",
    "Lost and Found": "Lost and Found",
}


def _presentation_category(db_name: Optional[str]) -> str:
    reverse_map = {
        "Emergency Alert": "Emergency",
        "Rabies Alert": "Emergency",
        "General Advisory": "Animal Advisory",
        "Community Event": "Vaccination Drive",
        "Lost and Found": "Lost and Found",
        "Rescue Operation": "Animal Advisory",
    }
    return reverse_map.get(db_name or "", db_name or "Animal Advisory")


def _to_response(ann: Announcement) -> AnnouncementResponse:
    return AnnouncementResponse(
        announcement_id=ann.announcement_id,  # type: ignore
        title=ann.title,  # type: ignore
        category=_presentation_category(ann.category.category_name if ann.category else None),
        visibility=str(ann.visibility),
        content=ann.content,  # type: ignore
        pinned=(str(ann.priority_level) == "Emergency"),
        expiration=ann.expires_at,  # type: ignore
        location=ann.subdivision.subdivision_name if ann.subdivision else None,
        posted_by=ann.creator.name if ann.creator else "Subdivision Leader",
        posted_on=ann.published_at or ann.created_at,  # type: ignore
        media=ann.media or [],
        status=str(ann.status or "Published"),
    )


@router.get("/subdivision/{subdivision_id}", response_model=List[AnnouncementResponse])
def get_subdivision_announcements(subdivision_id: int, db: Session = Depends(get_db),
                                  current_user: User = Depends(get_current_staff_or_admin)):
    """A subdivision's announcements in every status (drafts and archive included), for officials managing them:
    the subdivision's leader, the barangay's staff, or an admin. Residents use /feed/resident (published only)."""
    verify_subdivision_scope(current_user, subdivision_id, db=db)
    rows = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(
            or_(
                Announcement.subdivision_id == subdivision_id,
                and_(Announcement.subdivision_id.is_(None), Announcement.visibility == "Public")
            )
        )
        .order_by(Announcement.published_at.desc(), Announcement.created_at.desc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.get("/barangay/{barangay_id}", response_model=List[AnnouncementResponse])
def get_barangay_announcements(
    barangay_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Community alerts of a barangay and its subdivisions, in every status, for that barangay's staff or an admin."""
    if current_user.role_id != 4 and not (current_user.role_id == 3 and current_user.barangay_id == barangay_id):
        raise HTTPException(status_code=403, detail="Only this barangay's staff can list all of its announcements.")
    query = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(
            or_(
                Announcement.barangay_id == barangay_id,
                Announcement.subdivision.has(Subdivision.barangay_id == barangay_id)
            )
        )
    )
    if status:
        query = query.filter(Announcement.status == status)

    rows = query.order_by(Announcement.published_at.desc(), Announcement.created_at.desc()).all()
    return [_to_response(row) for row in rows]


@router.patch("/{announcement_id}/status", response_model=AnnouncementResponse)
def update_announcement_status(
    announcement_id: int,
    status_value: Optional[str] = Query(None, alias="status"),
    payload: Optional[dict] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    """Publish, archive or draft an alert. Officials only, for alerts they may manage. Accepts ?status=Archived
    (Barangay alerts page) or {"status": "Archived"}."""
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_can_manage(ann, current_user)
    new_status = status_value or (payload or {}).get("status")
    if new_status not in ANNOUNCEMENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status. Use Draft, Published or Archived.")
    ann.status = new_status  # type: ignore
    if new_status == "Published" and not ann.published_at:  # type: ignore
        ann.published_at = datetime.now()  # type: ignore
    log_activity(
        db=db,
        action="Update Announcement Status",
        target_table="announcements",
        target_id=announcement_id,
        description=f"{current_user.name} set announcement '{ann.title}' to '{new_status}'.",
        user_id=current_user.user_id,
        log_type="operation",
    )
    db.commit()
    return _to_response(_load_full(db, announcement_id))


@router.get("/feed/resident/{user_id}", response_model=List[AnnouncementResponse])
def get_resident_announcement_feed(user_id: int, db: Session = Depends(get_db),
                                   current_user: User = Depends(get_current_user)):
    """Announcements visible to a resident: Public (system-wide) and Subdivision Only (their subdivision).
    Only the resident's own feed (an admin may view anyone's), so subdivision-only posts don't leak by user id."""
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(status_code=403, detail="You can only view your own announcement feed.")
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now()
    visibility_filter = [Announcement.visibility == "Public"]
    if user.subdivision_id:
        visibility_filter.append(
            (Announcement.visibility == "Subdivision Only")
            & (Announcement.subdivision_id == user.subdivision_id)
        )

    rows = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(
            Announcement.status == "Published",
            or_(*visibility_filter),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )
        .order_by(
            Announcement.priority_level.desc(),
            Announcement.published_at.desc(),
            Announcement.created_at.desc(),
        )
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post("/", response_model=AnnouncementResponse)
def create_announcement(
    payload: AnnouncementCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin)
):
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only Subdivision Leaders (Role 2), Barangay Staff (Role 3), or Administrators (Role 4) can create announcements."
        )

    creator = current_user

    mapped_category = CATEGORY_MAP.get(payload.category, payload.category)
    category = db.query(AnnouncementCategory).filter(AnnouncementCategory.category_name == mapped_category).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid announcement category mapping")

    target_status = payload.status or "Published"
    row = Announcement(
        barangay_id=payload.barangay_id or creator.barangay_id,  # type: ignore
        subdivision_id=payload.subdivision_id or creator.subdivision_id,  # type: ignore
        created_by=creator.user_id,  # type: ignore
        category_id=category.category_id,  # type: ignore
        title=payload.title,  # type: ignore
        content=payload.content,  # type: ignore
        visibility=payload.visibility,  # type: ignore
        priority_level="Emergency" if payload.pinned else "Normal",  # type: ignore
        status=target_status,  # type: ignore
        published_at=datetime.now() if target_status == "Published" else None,  # type: ignore
        expires_at=payload.expiration,  # type: ignore
    )
    db.add(row)
    db.flush()
    
    # Log activity
    log_activity(
        db=db,
        action="Create Announcement",
        target_table="announcements",
        target_id=row.announcement_id,  # type: ignore
        description=f"Created announcement '{payload.title}' with visibility '{payload.visibility}' (Status: {target_status}).",
        user_id=creator.user_id,
        log_type="operation"
    )

    db.commit()
    db.refresh(row)

    row = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(Announcement.announcement_id == row.announcement_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return _to_response(row)


@router.post("/{announcement_id}/media")
async def upload_announcement_media(
    announcement_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff_or_admin),
):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_can_manage(ann, current_user)

    file_content, unique_filename, media_type, resource_type = await read_and_validate_upload(file)
    file_url = await run_in_threadpool(upload_to_cloudinary, file_content, folder="announcements", filename=unique_filename)
    if not file_url:
        raise HTTPException(status_code=500, detail="Failed to upload media")

    media = AnnouncementMedia(
        announcement_id=announcement_id,
        file_url=file_url,
        media_type=media_type,
        caption=caption,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
def update_announcement(announcement_id: int, payload: AnnouncementCreate, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_staff_or_admin)):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_can_manage(ann, current_user)
    
    mapped_category = CATEGORY_MAP.get(payload.category, payload.category)
    category = db.query(AnnouncementCategory).filter(AnnouncementCategory.category_name == mapped_category).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid announcement category mapping")
        
    ann.title = payload.title  # type: ignore
    ann.content = payload.content  # type: ignore
    ann.category_id = category.category_id  # type: ignore
    ann.visibility = payload.visibility  # type: ignore
    ann.priority_level = "Emergency" if payload.pinned else "Normal"  # type: ignore
    ann.expires_at = payload.expiration  # type: ignore
    # Where the alert belongs: only an administrator may move it outside their own area
    if current_user.role_id != 4:
        if payload.subdivision_id is not None and current_user.role_id == 2 and payload.subdivision_id != current_user.subdivision_id:
            raise HTTPException(status_code=403, detail="You can only post alerts for your own subdivision.")
        if payload.barangay_id is not None and current_user.role_id == 3 and payload.barangay_id != current_user.barangay_id:
            raise HTTPException(status_code=403, detail="You can only post alerts for your own barangay.")
    ann.subdivision_id = payload.subdivision_id  # type: ignore
    ann.barangay_id = payload.barangay_id  # type: ignore
    if payload.status:
        if payload.status not in ANNOUNCEMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status. Use Draft, Published or Archived.")
        ann.status = payload.status  # type: ignore
        if payload.status == "Published" and not ann.published_at:  # type: ignore
            ann.published_at = datetime.now()  # type: ignore

    # Log activity
    log_activity(
        db=db,
        action="Update Announcement",
        target_table="announcements",
        target_id=announcement_id,
        description=f"{current_user.name} updated announcement '{payload.title}' visibility to '{payload.visibility}' (Status: {payload.status or ann.status}).",
        user_id=current_user.user_id,   # who made the change (not the created_by sent in the body)
        log_type="operation"
    )

    db.commit()
    db.refresh(ann)
    
    # Re-fetch with joinedloads
    ann = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
        )
        .filter(Announcement.announcement_id == announcement_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return _to_response(ann)


@router.delete("/{announcement_id}", response_model=dict)
def delete_announcement(
    announcement_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    # Restrict deletion to author or admin
    if current_user.role_id != 4 and ann.created_by != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only delete your own announcements unless you are an administrator."
        )

    # Log activity
    log_activity(
        db=db,
        action="Delete Announcement",
        target_table="announcements",
        target_id=announcement_id,
        description=f"Deleted announcement '{ann.title}'.",
        user_id=current_user.user_id,
        log_type="operation"
    )

    db.delete(ann)
    db.commit()
    return {"message": "Announcement deleted successfully"}
