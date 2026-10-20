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
    created_by: int
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


class AnnouncementCommentResponse(BaseModel):
    comment_id: int
    announcement_id: int
    user_id: int
    user_name: Optional[str] = None
    user_photo: Optional[str] = None
    parent_comment_id: Optional[int] = None
    comment: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnnouncementCommentCreate(BaseModel):
    user_id: Optional[int] = None   # ignored: the comment is always by the logged-in user
    comment: str
    parent_comment_id: Optional[int] = None


class AnnouncementReactionResponse(BaseModel):
    reaction_id: int
    announcement_id: int
    user_id: int
    reaction_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnnouncementReactionCreate(BaseModel):
    user_id: Optional[int] = None   # ignored: the reaction is always by the logged-in user
    reaction_type: str = "Like"


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
    comments: List[AnnouncementCommentResponse] = []
    reactions: List[AnnouncementReactionResponse] = []
    status: str = "Published"


