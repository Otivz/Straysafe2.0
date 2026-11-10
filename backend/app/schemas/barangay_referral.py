from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

ContactMethod = Literal["call", "visit", "message", "letter", "other"]
UpdateType = Literal["acknowledged", "dispatched", "picked_up", "held", "impounded", "claimed", "adopted", "not_found", "other"]
UpdateSource = Literal["barangay_reported", "org_reported", "straysafe_user"]
FinalOutcome = Literal["claimed", "released", "resolved", "deceased", "not_found"]


def _https_url(value: Optional[str]) -> Optional[str]:
    if value is None or not value.strip():
        return None
    value = value.strip()
    if not value.startswith("https://"):
        raise ValueError("Evidence must be an https link to an uploaded file.")
    return value


class ReferralCreate(BaseModel):
    """A referral to the Barangay (the original form). Other organisations are referred through /cases/{id}/referrals."""
    reason: str = Field(..., min_length=3, max_length=2000)
    contact_method: ContactMethod
    reference_no: Optional[str] = Field(None, max_length=100)


class ReferralUpdateCreate(BaseModel):
    update_type: UpdateType
    update_date: date
    source: UpdateSource = "barangay_reported"
    note: Optional[str] = Field(None, max_length=2000)
    evidence_url: Optional[str] = Field(None, max_length=500)

    _check_url = field_validator("evidence_url")(_https_url)


class ReferralOutcomeCreate(BaseModel):
    """What the Barangay reported happened. It is recorded as reported: it does NOT close or change the case."""
    final_outcome: FinalOutcome
    outcome_date: date
    note: Optional[str] = Field(None, max_length=2000)


class ReferralUpdateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    update_id: int
    update_type: str
    source: str
    source_label: str
    update_date: date
    note: Optional[str] = None
    evidence_url: Optional[str] = None
    status_after: Optional[str] = None
    recorded_by: Optional[int] = None
    recorded_by_name: Optional[str] = None
    recorded_at: datetime


class ReferralResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    referral_id: int
    report_id: int
    # Set for a Barangay referral; empty for the other organisations
    barangay_id: Optional[int] = None
    barangay_name: Optional[str] = None
    org_type: Optional[str] = None
    org_name: Optional[str] = None
    referral_status: Optional[str] = None
    is_urgent: bool = False
    contact_person: Optional[str] = None
    contact_detail: Optional[str] = None
    external_outcome: Optional[str] = None
    remaining_follow_up: Optional[str] = None
    follow_up_at: Optional[datetime] = None
    referred_by: Optional[int] = None
    referred_by_name: Optional[str] = None
    referred_at: datetime
    reason: str
    reference_no: Optional[str] = None
    contact_method: str
    final_outcome: Optional[str] = None
    outcome_date: Optional[date] = None
    outcome_note: Optional[str] = None
    outcome_recorded_by: Optional[int] = None
    outcome_recorded_by_name: Optional[str] = None
    outcome_recorded_at: Optional[datetime] = None
    report_status_id: Optional[int] = None
    updates: List[ReferralUpdateResponse] = []
