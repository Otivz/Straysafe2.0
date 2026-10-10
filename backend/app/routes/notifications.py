from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.notification import Notification
from app.models.notification_preference import UserNotificationPreference
from app.models.user import User
from app.schemas.notification import (
    NotificationResponse, NotificationUpdate, NotificationCreate,
    NotificationPreferenceResponse, NotificationPreferenceUpdate
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/me", response_model=List[NotificationResponse])
def get_my_notifications(
    include_archived: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.user_id)
    if not include_archived:
        query = query.filter(Notification.is_archived == False)
    return query.order_by(Notification.created_at.desc()).all()


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
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only System Administrators can dispatch notifications directly via API."
        )

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


# =============================================================================
# USER EMAIL NOTIFICATION PREFERENCES
# =============================================================================

@router.get("/preferences", response_model=NotificationPreferenceResponse)
def get_my_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pref = db.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == current_user.user_id
    ).first()
    if not pref:
        pref = UserNotificationPreference(
            user_id=current_user.user_id,
            email_reports=True,
            email_rescues=True,
            email_pet_matches=True,
            email_claims=True,
            email_reminders=True
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


@router.put("/preferences", response_model=NotificationPreferenceResponse)
def update_my_notification_preferences(
    pref_update: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pref = db.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == current_user.user_id
    ).first()
    if not pref:
        pref = UserNotificationPreference(user_id=current_user.user_id)
        db.add(pref)

    if pref_update.email_reports is not None:
        pref.email_reports = pref_update.email_reports
    if pref_update.email_rescues is not None:
        pref.email_rescues = pref_update.email_rescues
    if pref_update.email_pet_matches is not None:
        pref.email_pet_matches = pref_update.email_pet_matches
    if pref_update.email_claims is not None:
        pref.email_claims = pref_update.email_claims
    if pref_update.email_reminders is not None:
        pref.email_reminders = pref_update.email_reminders

    db.commit()
    db.refresh(pref)
    return pref


@router.post("/test-email")
def test_email_delivery(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only System Administrators can trigger test emails."
        )
    from datetime import datetime
    from app.services.email_service import queue_email, is_smtp_configured, is_resend_configured
    log = queue_email(
        db=db,
        recipient_email=current_user.email,
        subject="StraySafe Email Notification System Test",
        text_body=f"Hello {current_user.name},\n\nThis is a test notification confirming that the StraySafe Email Notification System is operational.",
        html_body=f"<div style='font-family:Arial,sans-serif;padding:20px;max-width:480px;'><h2 style='color:#F97316;'>StraySafe Email Test</h2><p>Hello {current_user.name},</p><p>This is a test notification confirming that the StraySafe Email Notification System is operational.</p></div>",
        template_key="admin_test_email",
        category="security",
        user_id=current_user.user_id,
        idempotency_key=f"test_email_{current_user.user_id}_{int(datetime.now().timestamp())}",
    )
    return {
        "message": f"Test email queued for {current_user.email}",
        "smtp_configured": is_smtp_configured(),
        "resend_configured": is_resend_configured(),
        "email_log_id": log.email_id if log else None,
        "status": log.status if log else "Failed"
    }

