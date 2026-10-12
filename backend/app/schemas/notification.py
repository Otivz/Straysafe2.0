from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "status_update"
    related_id: Optional[int] = None

class NotificationCreate(NotificationBase):
    user_id: int

class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_archived: Optional[bool] = None

class NotificationResponse(NotificationBase):
    notification_id: int
    user_id: int
    is_read: bool
    is_archived: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationPreferenceResponse(BaseModel):
    user_id: int
    email_reports: bool
    email_rescues: bool
    email_pet_matches: bool
    email_claims: bool
    email_reminders: bool
    # Push notifications (PUSH_NOTIFICATION_IMPLEMENTATION.md R2)
    push_enabled: bool = True
    push_reports: bool = True
    push_rescues: bool = True
    push_pet_matches: bool = True
    push_claims: bool = True
    push_adoptions: bool = True
    push_messages: bool = True
    push_show_preview: bool = True

    class Config:
        from_attributes = True

class NotificationPreferenceUpdate(BaseModel):
    email_reports: Optional[bool] = None
    email_rescues: Optional[bool] = None
    email_pet_matches: Optional[bool] = None
    email_claims: Optional[bool] = None
    email_reminders: Optional[bool] = None
    push_enabled: Optional[bool] = None
    push_reports: Optional[bool] = None
    push_rescues: Optional[bool] = None
    push_pet_matches: Optional[bool] = None
    push_claims: Optional[bool] = None
    push_adoptions: Optional[bool] = None
    push_messages: Optional[bool] = None
    push_show_preview: Optional[bool] = None
