from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

MonitoringMethod = Literal["observation", "direct_owner", "in_person", "phone", "sms", "other"]
MonitoringOutcome = Literal["pet_secured", "owner_complied", "owner_not_available", "violation_observed", "no_improvement", "spoke_with_owner", "pet_still_roaming", "no_answer", "other"]
OwnerComplianceStatus = Literal["issue_resolved", "improving", "still_addressing", "unable_to_comply"]


class FollowUpContactLogCreate(BaseModel):
    contact_type: str = Field(..., description="Phone Call, In-Person Visit, SMS, Verbal Warning, Other")
    notes: str = Field(..., min_length=1, description="Details of the contact log")
    contact_date: Optional[datetime] = None


class FollowUpContactLogOut(BaseModel):
    contact_log_id: int
    followup_id: int
    logged_by: int
    logger_name: Optional[str] = None
    logger_role: Optional[str] = None
    contact_type: str
    contact_date: datetime
    notes: str
    created_at: Optional[datetime] = None
    report_id: Optional[int] = None
    pet_id: Optional[int] = None
    inspection_method: Optional[str] = None
    inspection_outcome: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MonitoringLogCreate(BaseModel):
    """Add Monitoring Log form on the Subdivision Under Observation page."""
    contact_method: MonitoringMethod
    outcome: MonitoringOutcome
    notes: str = Field(..., max_length=2000, description="Staff notes and evidence details")
    client_request_id: Optional[str] = Field(None, min_length=8, max_length=64, description="Form idempotency key")

    @field_validator("notes")
    @classmethod
    def notes_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Staff notes are required.")
        return value


class OwnerObservationUpdatePhotoOut(BaseModel):
    photo_id: int
    photo_url: str
    created_at: Optional[datetime] = None


class OwnerObservationUpdateOut(BaseModel):
    update_id: int
    followup_id: int
    report_id: int
    pet_id: Optional[int] = None
    animal_name: Optional[str] = None
    owner_user_id: int
    owner_name: Optional[str] = None
    compliance_status: str
    owner_remarks: str
    submitted_at: datetime
    photos: List[OwnerObservationUpdatePhotoOut] = []
    is_reviewed: bool = False
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[int] = None
    reviewer_name: Optional[str] = None
    review_remarks: Optional[str] = None


class OwnerObservationUpdateReview(BaseModel):
    review_remarks: Optional[str] = Field(None, max_length=2000, description="Staff review remarks; does not verify resolution")

    @field_validator("review_remarks")
    @classmethod
    def strip_remarks(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class OwnerFollowUpStart(BaseModel):
    report_id: int
    pet_id: Optional[int] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_address: Optional[str] = None
    duration_days: Optional[int] = Field(None, ge=1, le=30, description="Duration in days; defaults to system setting or 3")
    notes: Optional[str] = Field(None, description="Initial observation instructions or notes for the owner")


class OwnerFollowUpExtend(BaseModel):
    extension_reason: str = Field(..., min_length=3, description="Required justification for extending the observation")
    extension_days: Optional[int] = Field(None, ge=1, le=30, description="Extension duration in days; defaults to system setting or 3")


class OwnerFollowUpClose(BaseModel):
    outcome: str = Field(..., description="complied, closed, or escalated")
    reason: str = Field(..., min_length=3, description="Explanation for closing or escalating")
    compliance_notes: Optional[str] = None


class OwnerFollowUpAcknowledge(BaseModel):
    method: Optional[str] = Field("account", description="account, verbal, or phone")
    notes: Optional[str] = None


class OwnerFollowUpUpdate(BaseModel):
    owner_notes: Optional[str] = None
    owner_photo_url: Optional[str] = None


class OwnerFollowUpResolveRequest(BaseModel):
    verification_notes: str = Field(..., min_length=3, description="Verification remarks confirming owner compliance")


class OwnerFollowUpSecondWarningRequest(BaseModel):
    violation_type: str = Field(..., min_length=2, description="Violation type for second warning citation")
    description: str = Field(..., min_length=3, description="Remarks documenting continued non-compliance")
    fine_amount: Optional[float] = 0.0


class UnderObservationEndorseRequest(BaseModel):
    notes: Optional[str] = None
    endorsement_reason: str = Field(..., min_length=3, description="Justification for endorsing observation case to Barangay")


class OwnerFollowUpOut(BaseModel):
    followup_id: int
    report_id: int
    pet_id: Optional[int] = None
    pet_name: Optional[str] = None
    subdivision_id: int
    subdivision_name: Optional[str] = None
    leader_id: int
    leader_name: Optional[str] = None

    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None  # None for unauthorized users
    owner_address: Optional[str] = None

    status: str
    due_at: datetime
    duration_days: int
    notes: Optional[str] = None  # None for non-staff/non-owner

    is_extended: bool
    extended_at: Optional[datetime] = None
    extended_by: Optional[int] = None
    extension_reason: Optional[str] = None
    extension_days: Optional[int] = None

    compliance_notes: Optional[str] = None
    closed_at: Optional[datetime] = None
    closed_by: Optional[int] = None
    close_reason: Optional[str] = None

    owner_acknowledged_at: Optional[datetime] = None
    owner_acknowledgement_method: Optional[str] = None
    owner_notes: Optional[str] = None
    owner_photo_url: Optional[str] = None
    owner_photo_submitted_at: Optional[datetime] = None

    staff_caution: Optional[str] = None
    is_overdue: bool = False
    remaining_hours: Optional[float] = None
    contact_logs: List[FollowUpContactLogOut] = []
    owner_updates: List[OwnerObservationUpdateOut] = []
    owner_updates_count: int = 0
    unreviewed_owner_updates_count: int = 0
    animal_name: Optional[str] = None
    animal_photo: Optional[str] = None

    # Enriched fields for Under Observation cards & details
    report_photo: Optional[str] = None
    report_category_name: Optional[str] = None
    report_landmark: Optional[str] = None
    report_animal_type: Optional[str] = None
    report_breed: Optional[str] = None
    report_color: Optional[str] = None
    report_description: Optional[str] = None
    report_condition: Optional[str] = None

    first_warning_id: Optional[int] = None
    first_warning_date: Optional[datetime] = None
    first_warning_level: Optional[str] = None
    first_warning_violation: Optional[str] = None
    first_warning_description: Optional[str] = None
    first_warning_issuer_name: Optional[str] = None

    # Second Warning fields
    second_warning_id: Optional[int] = None
    second_warning_date: Optional[datetime] = None
    second_warning_level: Optional[str] = None
    second_warning_violation: Optional[str] = None
    second_warning_description: Optional[str] = None
    second_warning_issuer_name: Optional[str] = None
    has_second_warning: bool = False
    is_eligible_for_second_warning: bool = False
    is_eligible_for_endorsement: bool = False

    # Workflow section: active, for_second_warning, second_warning_issued, endorsed, resolved
    workflow_section: Optional[str] = "active"

    # Resolution details
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_notes: Optional[str] = None

    # Endorsement details
    endorsement_date: Optional[datetime] = None
    endorsement_status: Optional[str] = None

    current_observation_day: Optional[int] = None
    observation_day_display: Optional[str] = None
    remaining_time_display: Optional[str] = None
    progress_percent: Optional[float] = None
    is_escalated: bool = False

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UnderObservationDashboardOut(BaseModel):
    items: List[OwnerFollowUpOut]
    total_under_observation: int
    day_1_count: int
    day_2_count: int
    day_3_count: int
    overdue_count: int
    complied_count: int

    # 5 Tab Section Counts
    active_observation_count: int = 0
    for_second_warning_count: int = 0
    second_warning_issued_count: int = 0
    endorsed_count: int = 0
    resolved_count: int = 0
    unreviewed_owner_updates_count: int = 0


class OwnerFollowUpSettingsOut(BaseModel):
    default_duration_days: int


class OwnerFollowUpSettingsUpdate(BaseModel):
    default_duration_days: int = Field(..., ge=1, le=30, description="Default observation duration in days")
