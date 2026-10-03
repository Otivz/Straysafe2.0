from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ChatMessageCreate(BaseModel):
    message_text: str
    media_url: Optional[str] = None
    is_system: Optional[bool] = False

class ChatMessageResponse(BaseModel):
    message_id: int
    thread_id: int
    sender_id: int
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    sender_avatar: Optional[str] = None
    message_text: str
    media_url: Optional[str] = None
    is_read: bool
    is_system: bool
    sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ChatThreadCreate(BaseModel):
    thread_type: str = "Report"
    related_id: Optional[int] = None
    recipient_id: int
    title: Optional[str] = None

class ChatThreadResponse(BaseModel):
    thread_id: int
    thread_type: str
    related_id: Optional[int] = None
    created_by: int
    recipient_id: int
    title: Optional[str] = None
    is_closed: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    creator_name: Optional[str] = None
    recipient_name: Optional[str] = None
    can_interact: Optional[bool] = True
    is_assigned: Optional[bool] = False
    messages: List[ChatMessageResponse] = []

    class Config:
        from_attributes = True

class AdoptionChatMessageCreate(BaseModel):
    """Only the text is accepted from the client. Sender, thread and flags are always derived server-side."""
    message_text: str = Field(..., min_length=1, max_length=2000)


class AdoptionChatParticipant(BaseModel):
    user_id: int
    name: str
    role: str


class AdoptionChatThreadInfo(BaseModel):
    adoption_id: int
    thread_id: Optional[int] = None
    current_stage: str
    stage_label: str
    stage_status: Optional[str] = None
    application_status: str
    can_send: bool
    read_only_reason: Optional[str] = None
    viewer_role: str  # "applicant" | "staff" | "admin"
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    pet_breed: Optional[str] = None
    pet_photo: Optional[str] = None
    holding_id: Optional[int] = None
    barangay_name: Optional[str] = None
    applicant: AdoptionChatParticipant
    staff_participants: List[AdoptionChatParticipant] = []
    total_messages: int = 0
    unread_messages: int = 0


class AdoptionChatUnreadResponse(BaseModel):
    counts: dict[int, int] = {}
    total: int = 0


class ChatStatsResponse(BaseModel):
    thread_id: Optional[int] = None
    total_messages: int
    unread_messages: int
    is_closed: bool = False
