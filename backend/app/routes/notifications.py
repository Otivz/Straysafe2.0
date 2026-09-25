from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationResponse, NotificationUpdate, NotificationCreate
from app.utils.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/user/{user_id}", response_model=List[NotificationResponse])
def get_user_notifications(
    user_id: int, 
    include_archived: bool = True, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot view notifications for other users."
        )
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if not include_archived:
        query = query.filter(Notification.is_archived == False)
    return query.order_by(Notification.created_at.desc()).all()

@router.post("/", response_model=NotificationResponse)
def create_notification(
    notification: NotificationCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_notification = Notification(**notification.model_dump())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.patch("/{notification_id}", response_model=NotificationResponse)
@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def update_notification(
    notification_id: int, 
    notification_update: NotificationUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if db_notification.user_id != current_user.user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot update notifications for other users."
        )

    if notification_update.is_read is not None:
        db_notification.is_read = notification_update.is_read  # type: ignore
    if notification_update.is_archived is not None:
        db_notification.is_archived = notification_update.is_archived  # type: ignore

    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.post("/{notification_id}/archive", response_model=NotificationResponse)
def archive_notification(
    notification_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if db_notification.user_id != current_user.user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot archive notifications for other users."
        )

    db_notification.is_archived = True  # type: ignore
    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.post("/{notification_id}/unarchive", response_model=NotificationResponse)
def unarchive_notification(
    notification_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if db_notification.user_id != current_user.user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot unarchive notifications for other users."
        )

    db_notification.is_archived = False  # type: ignore
    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if db_notification.user_id != current_user.user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot delete notifications for other users."
        )

    db.delete(db_notification)
    db.commit()
    return {"message": "Notification deleted"}

@router.post("/mark-all-read/{user_id}")
def mark_all_read(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot modify notifications for other users."
        )
    db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}

@router.post("/archive-all/{user_id}")
def archive_all_notifications(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot modify notifications for other users."
        )
    db.query(Notification).filter(Notification.user_id == user_id, Notification.is_archived == False).update({"is_archived": True})
    db.commit()
    return {"message": "All notifications archived"}

@router.delete("/archived/clear/{user_id}")
def clear_archived_notifications(
    user_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You cannot clear notifications for other users."
        )
    db.query(Notification).filter(Notification.user_id == user_id, Notification.is_archived == True).delete()
    db.commit()
    return {"message": "Archived notifications cleared"}
