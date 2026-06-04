from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ReportBase(BaseModel):
    user_id: int
    subdivision_id: int
    category_id: Optional[int] = None
    pet_id: Optional[int] = None
    animal_type: Optional[str] = 'Unknown'
    animal_breed: Optional[str] = None
    animal_color: Optional[str] = None
    estimated_size: Optional[str] = None
    description: Optional[str] = None
    condition: Optional[str] = None
    latitude: float
    longitude: float
    animal_count: Optional[int] = 1
    landmark: Optional[str] = None
    priority_level: Optional[str] = 'Medium'
    visibility: Optional[str] = 'Public'
    is_possible_owned: Optional[bool] = False
    # Frontend sends "status_id"; we accept it here and map to current_status_id in the route
    status_id: Optional[int] = 1


class ReportCreate(ReportBase):
    pass


class CommentBase(BaseModel):
    # DB column is "comment" (not "message")
    comment: str


class CommentCreate(CommentBase):
    user_id: int
    parent_comment_id: Optional[int] = None


class CommentResponse(CommentBase):
    comment_id: int
    report_id: int
    user_id: int
    parent_comment_id: Optional[int] = None
    created_at: datetime
    user_name: Optional[str] = None
    user_photo: Optional[str] = None

    class Config:
        from_attributes = True


class ReportMediaResponse(BaseModel):
    media_id: int
    file_url: str
    media_type: str
    animal_type: str | None = None
    dominant_color: str | None = None
    history_id: Optional[int] = None
    status_id: Optional[int] = None
    is_evidence: Optional[bool] = False
    uploaded_at: datetime
    # AI Suggestions
    ai_animal_type: Optional[str] = None
    ai_dominant_color: Optional[str] = None
    ai_estimated_size: Optional[str] = None
    ai_possible_breed: Optional[str] = None
    ai_suggested_risk_level: Optional[str] = None
    ai_suggested_priority: Optional[str] = None

    class Config:
        from_attributes = True


class StatusHistoryResponse(BaseModel):
    history_id: int
    report_status_id: Optional[int] = None
    rescue_status_id: Optional[int] = None
    remarks: Optional[str] = None
    created_at: datetime
    updater_name: Optional[str] = None
    updater_photo: Optional[str] = None
    media: Optional[list[ReportMediaResponse]] = []

    class Config:
        from_attributes = True


class ReportResponse(ReportBase):
    report_id: int
    created_at: datetime
    reporter_name: Optional[str] = None
    reporter_photo: Optional[str] = None
    media: Optional[list[ReportMediaResponse]] = []
    comments: Optional[list[CommentResponse]] = []
    history: Optional[list[StatusHistoryResponse]] = []
    
    # AI Suggestions
    ai_animal_type: Optional[str] = None
    ai_dominant_color: Optional[str] = None
    ai_estimated_size: Optional[str] = None
    ai_possible_breed: Optional[str] = None
    ai_suggested_risk_level: Optional[str] = None
    ai_suggested_priority: Optional[str] = None
    ai_suggested_priority_reason: Optional[str] = None

    class Config:
        from_attributes = True


class ReportStatusUpdate(BaseModel):
    status_id: int
    user_id: Optional[int] = None
    remarks: Optional[str] = None
    status_remarks: Optional[str] = None
    animal_condition: Optional[str] = None


class ReportUpdate(BaseModel):
    category_id: Optional[int] = None
    animal_type: Optional[str] = None
    animal_breed: Optional[str] = None
    animal_color: Optional[str] = None
    estimated_size: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    animal_count: Optional[int] = None
    landmark: Optional[str] = None
    visibility: Optional[str] = None
    priority_level: Optional[str] = None
    is_possible_owned: Optional[bool] = None
    status_id: Optional[int] = None
