from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class HoldingTimelineResponse(BaseModel):
    log_id:     int
    holding_id: int
    event_type: str
    title:      str
    notes:      Optional[str] = None
    logged_by:  Optional[int] = None
    staff_name: Optional[str] = None
    logged_at:  datetime

    class Config:
        from_attributes = True


class HoldingTimelineCreate(BaseModel):
    event_type: str = "observation"
    title:      str
    notes:      Optional[str] = None
    logged_by:  Optional[int] = None


class HoldingAnimalCreate(BaseModel):
    report_id:       int
    rescue_id:       Optional[int] = None
    animal_type:     Optional[str] = None
    animal_name:     Optional[str] = None
    breed:           Optional[str] = None
    color:           Optional[str] = None
    estimated_size:  Optional[str] = None
    facility_status: Optional[int] = 1
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


class HoldingAnimalResponse(BaseModel):
    holding_id:        int
    report_id:         int
    rescue_id:         Optional[int] = None
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
    created_at:        Optional[datetime] = None
    timeline:          List[HoldingTimelineResponse] = []

    class Config:
        from_attributes = True


class HoldingMetricsResponse(BaseModel):
    total:            int
    need_treatment:   int
    healthy:          int
    nearing_expiry:   int   # intake_date within 2 days of 7-day deadline
    resolved_today:   int   # discharged today
