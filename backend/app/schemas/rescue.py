from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.report import ReportResponse


class RescueStatusBase(BaseModel):
    status_name: str


class RescueStatusResponse(RescueStatusBase):
    status_id: int

    class Config:
        from_attributes = True


class RescueAssignmentResponse(BaseModel):
    assignment_id: int
    staff_id: int
    staff_name: Optional[str] = None
    assigned_by: int
    assigned_at: datetime
    assignment_status: str
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# DB table is "rescues" (not "rescue_requests")
class RescueBase(BaseModel):
    report_id: int
    staff_id: Optional[int] = None
    status_id: Optional[int] = None
    notes: Optional[str] = None


class RescueCreate(RescueBase):
    pass


class RescueUpdate(BaseModel):
    status_id: Optional[int] = None
    staff_id: Optional[int] = None
    notes: Optional[str] = None


class RescueResponse(RescueBase):
    rescue_id: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    report: Optional[ReportResponse] = None

    class Config:
        from_attributes = True


# Legacy alias schemas — kept for backward compatibility with existing frontend calls
class RescueRequestCreate(RescueBase):
    leader_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None


class RescueRequestUpdate(BaseModel):
    status_id: Optional[int] = None
    barangay_staff_id: Optional[int] = None
    user_id: Optional[int] = None
    assigned_personnel_id: Optional[int] = None
    remarks: Optional[str] = None
    animal_condition: Optional[str] = None


class RescueRequestResponse(RescueBase):
    rescue_id: int
    request_id: Optional[int] = None # Alias for frontend compatibility
    leader_id: Optional[int] = None
    barangay_staff_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    report: Optional[ReportResponse] = None
    leader_name: Optional[str] = None
    leader_position: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    assignments: Optional[List[RescueAssignmentResponse]] = None

    class Config:
        from_attributes = True
