from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class WarningCreate(BaseModel):
    user_id: int
    pet_id: Optional[int] = None
    report_id: Optional[int] = None
    warning_level: Literal['Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation']
    violation_type: Literal['Free-Roaming Unleashed', 'Nuisance / Aggressive Behavior', 'Overdue Vaccination', 'Repeated Impoundment Retrieval', 'Other']
    description: str
    # Never worked out by the system: whatever the issuer types, 0 otherwise
    fine_amount: Optional[float] = 0.0
    # The confirmed subdivision policy the warning is issued under. May be left out when exactly one confirmed
    # policy applies to the concern; required when several do.
    policy_id: Optional[str] = None

class WarningResponse(BaseModel):
    warning_id: int
    user_id: int
    pet_id: Optional[int] = None
    report_id: Optional[int] = None
    issued_by: int
    warning_level: str
    violation_type: str
    warning_type: Optional[str] = None
    description: str
    warning_reason: Optional[str] = None
    fine_amount: float
    status: str
    acknowledged_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    issued_at: Optional[datetime] = None
    # The policy it was issued under, and the observation it started (None on warnings issued before policies)
    policy_id: Optional[str] = None
    policy_title: Optional[str] = None
    policy_reference: Optional[str] = None
    observation_days: Optional[int] = None
    follow_up_at: Optional[datetime] = None

    # Enriched details
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    pet_name: Optional[str] = None
    pet_id_display: Optional[str] = None
    report_ref_display: Optional[str] = None
    issuer_name: Optional[str] = None
    issuer_role: Optional[str] = None
    report_landmark: Optional[str] = None
    report_animal_type: Optional[str] = None
    report_photo: Optional[str] = None

    class Config:
        from_attributes = True

class WarningAcknowledge(BaseModel):
    status: Optional[str] = "Acknowledged"
