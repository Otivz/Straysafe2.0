from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

TaskType = Literal["Verification", "Interview", "Home_Visit", "Handover", "Monitoring", "Other"]


class AssignmentCreateRequest(BaseModel):
    """Only ids are accepted; the server validates the target (role, barangay, active, not the applicant)."""
    task_type: TaskType
    assigned_to: int
    scheduled_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    monitoring_log_id: Optional[int] = None
    remarks: Optional[str] = Field(None, max_length=1000)


class DeclineRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class ReasonRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=1000)


class TransferRequest(BaseModel):
    to_user_id: int
    reason: str = Field(..., min_length=3, max_length=1000)


class StaffOption(BaseModel):
    user_id: int
    name: str
    position_name: Optional[str] = None
    is_head_officer: bool = False
    open_tasks: int = 0


class AssignmentResponse(BaseModel):
    assignment_id: int
    adoption_id: int
    task_type: str
    task_label: str
    monitoring_log_id: Optional[int] = None
    milestone_name: Optional[str] = None
    assigned_to: Optional[int] = None
    assigned_to_name: Optional[str] = None
    assigned_by: Optional[int] = None
    assigned_by_name: Optional[str] = None
    status: str
    scheduled_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None
    completed_at: Optional[datetime] = None
    remarks: Optional[str] = None


class TaskAdoptionSummary(BaseModel):
    adoption_id: int
    holding_id: int
    applicant_name: str
    contact_no: Optional[str] = None
    address: Optional[str] = None
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    pet_photo: Optional[str] = None
    status: str
    current_stage: str
    application_stage_status: Optional[str] = None
    case_owner_id: Optional[int] = None
    case_owner_name: Optional[str] = None
    interview_scheduled_at: Optional[datetime] = None
    interview_mode: Optional[str] = None
    interview_location: Optional[str] = None
    interview_recommendation: Optional[str] = None
    home_visit_scheduled_at: Optional[datetime] = None
    home_visit_type: Optional[str] = None
    home_visit_result: Optional[str] = None


class MyTaskResponse(AssignmentResponse):
    adoption: TaskAdoptionSummary
    can_act: bool = False  # accepted/in progress and the case is still open


class CaseInfoResponse(BaseModel):
    adoption_id: int
    case_owner_id: Optional[int] = None
    case_owner_name: Optional[str] = None
    case_owner_assigned_at: Optional[datetime] = None
    is_owner: bool = False
    can_claim: bool = False
    can_assign: bool = False
    assignments: List[AssignmentResponse] = []
