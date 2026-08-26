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


class OwnerFeedbackRequest(BaseModel):
    owner_confirmation: str = Field(..., description="'OWNER_CONFIRMED', 'OWNER_REJECTED', or 'NO_RESPONSE'")
    remarks: Optional[str] = None


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

    class Config:
        from_attributes = True
