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

    class Config:
        from_attributes = True

class NotificationPreferenceUpdate(BaseModel):
    email_reports: Optional[bool] = None
    email_rescues: Optional[bool] = None
    email_pet_matches: Optional[bool] = None
    email_claims: Optional[bool] = None
    email_reminders: Optional[bool] = None
