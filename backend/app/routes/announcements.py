from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.announcement import Announcement, AnnouncementMedia, AnnouncementCategory, AnnouncementComment, AnnouncementReaction
from app.utils.audit import log_activity
from app.models.user import User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementResponse,
    AnnouncementCommentCreate,
    AnnouncementCommentResponse,
    AnnouncementReactionCreate,
    AnnouncementReactionResponse
)
from app.utils.cloudinary_config import upload_to_cloudinary

router = APIRouter(prefix="/announcements", tags=["announcements"])


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
    comments_list = []
    if ann.comments:
        for c in ann.comments:
            comments_list.append(
                AnnouncementCommentResponse(
                    comment_id=c.comment_id,  # type: ignore
                    announcement_id=c.announcement_id,  # type: ignore
                    user_id=c.user_id,  # type: ignore
                    user_name=c.user.name if c.user else "Unknown User",
                    user_photo=c.user.profile_picture if c.user else None,
                    parent_comment_id=c.parent_comment_id,  # type: ignore
                    comment=c.comment,  # type: ignore
                    created_at=c.created_at,  # type: ignore
                )
            )

    reactions_list = []
    if ann.reactions:
        for r in ann.reactions:
            reactions_list.append(
                AnnouncementReactionResponse(
                    reaction_id=r.reaction_id,  # type: ignore
                    announcement_id=r.announcement_id,  # type: ignore
                    user_id=r.user_id,  # type: ignore
                    reaction_type=r.reaction_type,  # type: ignore
                    created_at=r.created_at,  # type: ignore
                )
            )

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
        comments=comments_list,
        reactions=reactions_list,
        status=str(ann.status or "Published"),
    )


@router.get("/subdivision/{subdivision_id}", response_model=List[AnnouncementResponse])
def get_subdivision_announcements(subdivision_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
            selectinload(Announcement.comments).joinedload(AnnouncementComment.user),
            selectinload(Announcement.reactions),
        )
        .filter(
            Announcement.subdivision_id == subdivision_id,
        )
        .order_by(Announcement.published_at.desc(), Announcement.created_at.desc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.get("/feed/resident/{user_id}", response_model=List[AnnouncementResponse])
def get_resident_announcement_feed(user_id: int, db: Session = Depends(get_db)):
    """Announcements visible to a resident: Public (system-wide) and Subdivision Only (their subdivision)."""
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
            selectinload(Announcement.comments).joinedload(AnnouncementComment.user),
            selectinload(Announcement.reactions),
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
def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db)):
    creator = db.query(User).filter(User.user_id == payload.created_by).first()
    if not creator:
        raise HTTPException(status_code=404, detail="User not found")

    mapped_category = CATEGORY_MAP.get(payload.category, payload.category)
    category = db.query(AnnouncementCategory).filter(AnnouncementCategory.category_name == mapped_category).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid announcement category mapping")

    target_status = payload.status or "Published"
    row = Announcement(
        barangay_id=payload.barangay_id,  # type: ignore
        subdivision_id=payload.subdivision_id or creator.subdivision_id,  # type: ignore
        created_by=payload.created_by,  # type: ignore
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
        user_id=payload.created_by,
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
            selectinload(Announcement.comments).joinedload(AnnouncementComment.user),
            selectinload(Announcement.reactions)
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
):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    file_content = await file.read()
    file_url = upload_to_cloudinary(file_content, folder="announcements", filename=file.filename)
    if not file_url:
        raise HTTPException(status_code=500, detail="Failed to upload media")

    ext = (file.filename or "").lower()
    if ext.endswith((".mp4", ".mov", ".avi", ".webm")):
        media_type = "Video"
    elif ext.endswith((".pdf", ".doc", ".docx")):
        media_type = "Document"
    else:
        media_type = "Image"

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


@router.post("/{announcement_id}/comments", response_model=AnnouncementCommentResponse)
def add_announcement_comment(
    announcement_id: int,
    payload: AnnouncementCommentCreate,
    db: Session = Depends(get_db)
):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db_comment = AnnouncementComment(
        announcement_id=announcement_id,
        user_id=payload.user_id,
        parent_comment_id=payload.parent_comment_id,
        comment=payload.comment,
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    db_comment = (
        db.query(AnnouncementComment)
        .options(joinedload(AnnouncementComment.user))
        .filter(AnnouncementComment.comment_id == db_comment.comment_id)
        .first()
    )
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    return AnnouncementCommentResponse(
        comment_id=db_comment.comment_id,  # type: ignore
        announcement_id=db_comment.announcement_id,  # type: ignore
        user_id=db_comment.user_id,  # type: ignore
        user_name=db_comment.user.name if db_comment.user else "Unknown User",
        user_photo=db_comment.user.profile_picture if db_comment.user else None,
        parent_comment_id=db_comment.parent_comment_id,  # type: ignore
        comment=db_comment.comment,  # type: ignore
        created_at=db_comment.created_at,  # type: ignore
    )


@router.post("/{announcement_id}/react", response_model=dict)
def react_to_announcement(
    announcement_id: int,
    payload: AnnouncementReactionCreate,
    db: Session = Depends(get_db)
):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")

    existing = (
        db.query(AnnouncementReaction)
        .filter(
            AnnouncementReaction.announcement_id == announcement_id,
            AnnouncementReaction.user_id == payload.user_id,
        )
        .first()
    )

    if existing:
        if existing.reaction_type == payload.reaction_type:
            db.delete(existing)
            db.commit()
            return {"status": "removed", "reaction_type": payload.reaction_type}
        else:
            existing.reaction_type = payload.reaction_type  # type: ignore
            db.commit()
            return {"status": "updated", "reaction_type": payload.reaction_type}
    else:
        new_reaction = AnnouncementReaction(
            announcement_id=announcement_id,  # type: ignore
            user_id=payload.user_id,  # type: ignore
            reaction_type=payload.reaction_type,  # type: ignore
        )
        db.add(new_reaction)
        db.commit()
        return {"status": "added", "reaction_type": payload.reaction_type}


@router.patch("/{announcement_id}/status", response_model=AnnouncementResponse)
def update_announcement_status(announcement_id: int, payload: dict, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    new_status = payload.get("status")
    if new_status not in ["Draft", "Published", "Archived"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    ann.status = new_status  # type: ignore
    if new_status == "Published" and not ann.published_at:  # type: ignore
        ann.published_at = datetime.now()  # type: ignore
    # Log activity
    log_activity(
        db=db,
        action="Update Announcement Status",
        target_table="announcements",
        target_id=announcement_id,
        description=f"Updated status of announcement '{ann.title}' to '{new_status}'.",
        user_id=ann.created_by,  # type: ignore
        log_type="operation"
    )

    db.commit()
    db.refresh(ann)
    # Re-fetch with joinedloads to match _to_response requirements
    ann = (
        db.query(Announcement)
        .options(
            joinedload(Announcement.creator),
            joinedload(Announcement.category),
            joinedload(Announcement.subdivision),
            joinedload(Announcement.media),
            selectinload(Announcement.comments).joinedload(AnnouncementComment.user),
            selectinload(Announcement.reactions)
        )
        .filter(Announcement.announcement_id == announcement_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return _to_response(ann)


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
def update_announcement(announcement_id: int, payload: AnnouncementCreate, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
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
    ann.subdivision_id = payload.subdivision_id  # type: ignore
    ann.barangay_id = payload.barangay_id  # type: ignore
    if payload.status:
        ann.status = payload.status  # type: ignore
        if payload.status == "Published" and not ann.published_at:  # type: ignore
            ann.published_at = datetime.now()  # type: ignore

    # Log activity
    log_activity(
        db=db,
        action="Update Announcement",
        target_table="announcements",
        target_id=announcement_id,
        description=f"Updated announcement '{payload.title}' visibility to '{payload.visibility}' (Status: {payload.status or ann.status}).",
        user_id=payload.created_by,
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
            selectinload(Announcement.comments).joinedload(AnnouncementComment.user),
            selectinload(Announcement.reactions)
        )
        .filter(Announcement.announcement_id == announcement_id)
        .first()
    )
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return _to_response(ann)


@router.delete("/{announcement_id}", response_model=dict)
def delete_announcement(announcement_id: int, db: Session = Depends(get_db)):
    ann = db.query(Announcement).filter(Announcement.announcement_id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    # Log activity
    log_activity(
        db=db,
        action="Delete Announcement",
        target_table="announcements",
        target_id=announcement_id,
        description=f"Deleted announcement '{ann.title}'.",
        user_id=ann.created_by,  # type: ignore
        log_type="operation"
    )

    db.delete(ann)
    db.commit()
    return {"message": "Announcement deleted successfully"}
