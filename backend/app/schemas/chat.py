from pydantic import BaseModel
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
    messages: List[ChatMessageResponse] = []

    class Config:
        from_attributes = True

class ChatStatsResponse(BaseModel):
    thread_id: Optional[int] = None
    total_messages: int
    unread_messages: int
    is_closed: bool = False
