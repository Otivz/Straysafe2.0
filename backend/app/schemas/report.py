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
    ai_animal_type: Optional[str] = None
    ai_dominant_color: Optional[str] = None
    ai_coat_pattern: Optional[str] = None
    ai_estimated_size: Optional[str] = None
    ai_possible_breed: Optional[str] = None
    ai_suggested_risk_level: Optional[str] = None
    ai_suggested_priority: Optional[str] = None
    ai_suggested_priority_reason: Optional[str] = None
    ai_behavior_chasing: Optional[bool] = False
    ai_behavior_actual_bite: Optional[bool] = False
    ai_behavior_attempted_bite: Optional[bool] = False
    ai_behavior_injury: Optional[bool] = False
    ai_behavior_aggressive: Optional[bool] = False
    ai_behavior_explanation: Optional[str] = None
    # Verified Investigation Behavioral Findings
    verified_actual_bite: Optional[bool] = False
    verified_chasing: Optional[bool] = False
    verified_attempted_bite: Optional[bool] = False
    verified_injury: Optional[bool] = False
    verified_aggressive: Optional[bool] = False
    behavior_finding: Optional[str] = None
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
    holding_log_id: Optional[int] = None
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


class EndorsementLetterResponse(BaseModel):
    letter_id: int
    report_id: int
    title: Optional[str] = None
    leader_id: int
    letter_content: str
    file_url: Optional[str] = None
    status_id: Optional[int] = None
    issued_at: datetime
    leader_name: Optional[str] = None
    leader_position: Optional[str] = None

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
    endorsement_letter: Optional[EndorsementLetterResponse] = None
    
    # AI Suggestions
    ai_animal_type: Optional[str] = None
    ai_dominant_color: Optional[str] = None
    ai_estimated_size: Optional[str] = None
    ai_possible_breed: Optional[str] = None
    ai_suggested_risk_level: Optional[str] = None
    ai_suggested_priority: Optional[str] = None
    ai_suggested_priority_reason: Optional[str] = None

    # Owner & Pet Details (for Lost Pet Reports)
    pet_name: Optional[str] = None
    pet_qr_code_url: Optional[str] = None
    pet_qr_code_hash: Optional[str] = None
    pet_qr_token: Optional[str] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    owner_address: Optional[str] = None
    is_owner_report: Optional[bool] = False
    # Handler / Officer Ownership
    assigned_leader_id: Optional[int] = None
    assigned_leader_name: Optional[str] = None
    assigned_leader_photo: Optional[str] = None
    claimed_at: Optional[datetime] = None
    unassigned_notified: Optional[bool] = False

    # Pending Transfer Workflow
    pending_transfer_to_id: Optional[int] = None
    pending_transfer_to_name: Optional[str] = None
    pending_transfer_to_photo: Optional[str] = None
    pending_transfer_from_id: Optional[int] = None
    pending_transfer_from_name: Optional[str] = None
    pending_transfer_notes: Optional[str] = None
    pending_transfer_created_at: Optional[datetime] = None

    # Takeover Eligibility & Inactivity Tracking
    is_takeover_eligible: Optional[bool] = False
    takeover_locked_until: Optional[datetime] = None
    takeover_cooldown_remaining_seconds: Optional[int] = 0
    takeover_inactivity_hours_threshold: Optional[int] = 24
    last_activity_at: Optional[datetime] = None

    # Verification & Dispute Tracking
    verification_status: Optional[str] = 'unverified'
    false_alarm_reason: Optional[str] = None
    verification_notes: Optional[str] = None
    verified_by_user_id: Optional[int] = None
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    verified_actual_bite: Optional[bool] = False
    verified_chasing: Optional[bool] = False
    verified_attempted_bite: Optional[bool] = False
    verified_injury: Optional[bool] = False
    verified_aggressive: Optional[bool] = False
    behavior_finding: Optional[str] = None
    disputes: Optional[list['ReportDisputeResponse']] = []

    class Config:
        from_attributes = True


class ReportDisputeCreate(BaseModel):
    resident_user_id: int
    pet_id: Optional[int] = None
    dispute_reason: str
    vaccination_card_url: Optional[str] = None
    supporting_photo_url: Optional[str] = None


class ReportDisputeReviewRequest(BaseModel):
    reviewer_id: int
    status: str  # 'Accepted' or 'Rejected'
    reviewer_notes: Optional[str] = None


class ReportDisputeResponse(BaseModel):
    dispute_id: int
    report_id: int
    resident_user_id: int
    pet_id: Optional[int] = None
    dispute_reason: str
    vaccination_card_url: Optional[str] = None
    supporting_photo_url: Optional[str] = None
    status: str
    reviewer_id: Optional[int] = None
    reviewer_notes: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resident_name: Optional[str] = None
    pet_name: Optional[str] = None
    reviewer_name: Optional[str] = None

    class Config:
        from_attributes = True


class ReportFalseAlarmRequest(BaseModel):
    user_id: int
    reason: str  # e.g., 'No Animal Found', 'Exaggerated / No Bite Occurred', 'Neighbor Dispute / Harassment', 'Duplicate Report', 'Other'
    notes: Optional[str] = None


class ReportVerifyRequest(BaseModel):
    user_id: int
    notes: Optional[str] = None
    verified_actual_bite: Optional[bool] = False
    verified_chasing: Optional[bool] = False
    verified_attempted_bite: Optional[bool] = False
    verified_injury: Optional[bool] = False
    verified_aggressive: Optional[bool] = False
    behavior_finding: Optional[str] = "Unsubstantiated / Friendly"


class ReportClaimRequest(BaseModel):
    user_id: int


class ReportTakeoverRequest(BaseModel):
    user_id: int
    reason: str
    notes: Optional[str] = None


class ReportTransferRequest(BaseModel):
    user_id: int  # The user initiating the transfer (must be current handler)
    target_user_id: int  # The officer to transfer to
    notes: Optional[str] = None  # Reason / handover instructions


class ReportTransferActionRequest(BaseModel):
    user_id: int  # The officer accepting or cancelling


class ReportTransferRejectRequest(BaseModel):
    user_id: int  # The officer rejecting the transfer
    reason: Optional[str] = None  # Rejection explanation note


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

