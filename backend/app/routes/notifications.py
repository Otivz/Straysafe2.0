from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse, NotificationUpdate, NotificationCreate

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/user/{user_id}", response_model=List[NotificationResponse])
def get_user_notifications(user_id: int, db: Session = Depends(get_db)):
    return db.query(Notification).filter(Notification.user_id == user_id).order_by(Notification.created_at.desc()).all()

@router.post("/", response_model=NotificationResponse)
def create_notification(notification: NotificationCreate, db: Session = Depends(get_db)):
    db_notification = Notification(**notification.model_dump())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.patch("/{notification_id}", response_model=NotificationResponse)
def update_notification(notification_id: int, notification_update: NotificationUpdate, db: Session = Depends(get_db)):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db_notification.is_read = notification_update.is_read  # type: ignore
    db.commit()
    db.refresh(db_notification)
    return db_notification

@router.delete("/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    db_notification = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(db_notification)
    db.commit()
    return {"message": "Notification deleted"}

@router.post("/mark-all-read/{user_id}")
def mark_all_read(user_id: int, db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
