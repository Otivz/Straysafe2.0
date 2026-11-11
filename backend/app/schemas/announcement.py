from app.utils.local_time import LocalDateTime  # picked times are saved as local time
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AnnouncementMediaResponse(BaseModel):
    media_id: int
    file_url: str
    media_type: str
    caption: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


class AnnouncementCreate(BaseModel):
    created_by: Optional[int] = None
    title: str
    category: str
    visibility: str = "Public"
    content: str
    pinned: bool = False
    expiration: Optional[LocalDateTime] = None
    location: Optional[str] = None
    subdivision_id: Optional[int] = None
    barangay_id: Optional[int] = None
    status: Optional[str] = "Published"


class AnnouncementResponse(BaseModel):
    announcement_id: int
    title: str
    category: str
    visibility: str
    content: str
    pinned: bool
    expiration: Optional[datetime] = None
    location: Optional[str] = None
    posted_by: str
    posted_on: datetime
    media: List[AnnouncementMediaResponse] = []
    status: str = "Published"


