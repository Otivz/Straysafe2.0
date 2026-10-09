from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.schemas.pet import PetResponse
from app.schemas.report import ReportResponse


class ReportMatchBase(BaseModel):
    source_report_id: int
    matched_report_id: Optional[int] = None
    matched_pet_id: Optional[int] = None
    similarity_score: int = 50
    status: str = "AI_SUGGESTED"
    ai_explanation: Optional[str] = None
    ai_evidence: Optional[Dict[str, Any]] = None
    owner_confirmation_status: str = "PENDING"
    owner_notes: Optional[str] = None
    reviewed_by: Optional[int] = None
    reviewer_role: Optional[str] = None
    verification_notes: Optional[str] = None
    verified_at: Optional[datetime] = None


class ReportMatchCreate(BaseModel):
    source_report_id: int
    matched_report_id: Optional[int] = None
    matched_pet_id: Optional[int] = None
    similarity_score: int
    ai_explanation: Optional[str] = None
    ai_evidence: Optional[Dict[str, Any]] = None


class ReportMatchVerifyRequest(BaseModel):
    decision: str = Field(..., description="'CONFIRMED_MATCH', 'NOT_A_MATCH', or 'UNABLE_TO_VERIFY'")
    notes: str = Field(..., min_length=3, description="Mandatory explanation for verification decision")
    source_report_id: Optional[int] = None
    matched_pet_id: Optional[int] = None
    matched_report_id: Optional[int] = None


class OwnerFeedbackRequest(BaseModel):
    owner_confirmation: str = Field(..., description="'OWNER_CONFIRMED', 'OWNER_REJECTED', 'UNSURE', or 'NO_RESPONSE'")
    remarks: Optional[str] = None
    # Required to reopen a staff "Not a Match": the owner's own explanation (Request a Second Review)
    second_review_reason: Optional[str] = None
    report_id: Optional[int] = Field(None, description="Report ID this feedback pertains to, ensuring isolation in merged cases")


class ReviewerInfo(BaseModel):
    user_id: int
    name: str
    email: Optional[str] = None
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


class ReportMatchResponse(ReportMatchBase):
    match_id: int
    created_at: datetime
    updated_at: datetime
    source_report: Optional[ReportResponse] = None
    matched_report: Optional[ReportResponse] = None
    matched_pet: Optional[PetResponse] = None
    reviewer: Optional[ReviewerInfo] = None
    identity_lock_reason: Optional[str] = None
    # Set when the lock is "already confirmed in active Case #N": staff may mark this report a separate incident
    separate_incident_case_id: Optional[int] = None
    owner_dispute_count: int = 0
    covered_by_match_id: Optional[int] = None
    owner_verification_requested_at: Optional[datetime] = None
    owner_verification_note: Optional[str] = None
    owner_verification_answer: Optional[str] = None
    owner_verification_answer_note: Optional[str] = None
    owner_verification_answered_at: Optional[datetime] = None
    # Set on a match shown on another report of the same case: the case's confirmation, made on this report
    via_case_report_id: Optional[int] = None
    # The owner disputes that this report is the case's pet (shown instead of "Confirmed via Report #N")
    case_identity_disputed: bool = False

    class Config:
        from_attributes = True


class AiMatchingSettingResponse(BaseModel):
    gemini_vision_enabled: bool
    matching_mode: str
    description: Optional[str] = None
    updated_at: Optional[datetime] = None


class AiMatchingSettingUpdate(BaseModel):
    gemini_vision_enabled: bool
    description: Optional[str] = None
