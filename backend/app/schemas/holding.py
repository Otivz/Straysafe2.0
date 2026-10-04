from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from app.schemas.report import ReportMediaResponse
from app.utils.owner_returns import OwnerReturnInfo


class HoldingTimelineResponse(BaseModel):
    log_id:     int
    holding_id: int
    event_type: str
    title:      str
    notes:      Optional[str] = None
    logged_by:  Optional[int] = None
    staff_name: Optional[str] = None
    logged_at:  datetime
    media:      Optional[List[ReportMediaResponse]] = []

    class Config:
        from_attributes = True


class HoldingTimelineCreate(BaseModel):
    event_type: str = "observation"
    title:      str
    notes:      Optional[str] = None
    logged_by:  Optional[int] = None
    media_ids:  Optional[List[int]] = None


class HoldingAnimalCreate(BaseModel):
    report_id:       int
    rescue_id:       Optional[int] = None
    animal_type:     Optional[str] = None
    animal_name:     Optional[str] = None
    breed:           Optional[str] = None
    color:           Optional[str] = None
    estimated_size:  Optional[str] = None
    facility_status: Optional[int] = 2
    kennel_slot:     Optional[str] = None
    medical_notes:   Optional[str] = None
    intake_staff_id: Optional[int] = None


class HoldingAnimalUpdate(BaseModel):
    animal_name:     Optional[str] = None
    facility_status: Optional[int] = None
    kennel_slot:     Optional[str] = None
    medical_notes:   Optional[str] = None
    intake_date:     Optional[datetime] = None
    updated_by:      Optional[int] = None   # staff who made the change (for timeline)
    update_notes:    Optional[str] = None   # optional notes for the timeline entry
    media_ids:       Optional[List[int]] = None
    owner_return:    Optional[OwnerReturnInfo] = None   # required when facility_status becomes 3 (Claimed by Owner)


class HoldingAnimalResponse(BaseModel):
    holding_id:        int
    report_id:         int
    rescue_id:         Optional[int] = None
    facility_id:       Optional[int] = None
    facility_name:     Optional[str] = None
    facility_type:     Optional[str] = None
    subdivision_id:    Optional[int] = None
    barangay_id:       Optional[int] = None
    animal_type:       Optional[str] = None
    animal_name:       Optional[str] = None
    breed:             Optional[str] = None
    color:             Optional[str] = None
    estimated_size:    Optional[str] = None
    facility_status:   int
    facility_status_name: Optional[str] = None
    kennel_slot:       Optional[str] = None
    medical_notes:     Optional[str] = None
    intake_date:       Optional[datetime] = None
    discharge_date:    Optional[datetime] = None
    intake_staff_id:   Optional[int] = None
    intake_staff_name: Optional[str] = None
    report_landmark:   Optional[str] = None
    report_category:   Optional[str] = None
    report_media:      Optional[List[ReportMediaResponse]] = []
    created_at:        Optional[datetime] = None
    subd_intake_date:  Optional[datetime] = None
    subd_discharge_date: Optional[datetime] = None
    subd_duration_days: Optional[float] = None
    subd_duration_display: Optional[str] = None
    brgy_intake_date:  Optional[datetime] = None
    brgy_discharge_date: Optional[datetime] = None
    brgy_duration_days: Optional[float] = None
    brgy_duration_display: Optional[str] = None
    total_duration_days: Optional[float] = None
    total_duration_display: Optional[str] = None
    current_facility_duration_display: Optional[str] = None
    original_photo_url: Optional[str] = None
    overdue_notified:  Optional[bool] = False
    report_status_id:  Optional[int] = None
    custody_status:    Optional[str] = None
    is_escalated:      Optional[bool] = False
    escalation_status: Optional[str] = None
    timeline:          List[HoldingTimelineResponse] = []

    @field_validator("original_photo_url", mode="before")
    @classmethod
    def sanitize_photo_url(cls, v):
        if not v or "res.cloudinary.com/test" in str(v) or str(v).endswith("original_reporter_dog.jpg"):
            return "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80"
        return str(v)

    class Config:
        from_attributes = True


class HoldingMetricsResponse(BaseModel):
    total:            int
    need_treatment:   int
    healthy:          int
    nearing_expiry:   int   # intake_date within warn threshold of impound deadline
    resolved_today:   int   # discharged today
    needs_impoundment: int = 0  # intake_date reached or exceeded impound deadline


class HoldingEscalateRequest(BaseModel):
    barangay_facility_id: Optional[int] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
