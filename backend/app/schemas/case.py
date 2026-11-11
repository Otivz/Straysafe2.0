"""
Request bodies for the case workflow endpoints (app/routes/cases.py, app/routes/ownership_claims.py) and the stored
subdivision case settings. Identifiers are the ones the approved Admin UI uses (utils/case_vocab.py). The rules that need
the database (eligibility, scope, transitions) live in the service layer, not here.
"""
import re
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

CaseStatusId = Literal["reported", "under_review", "in_progress", "closed"]
OpenStatusId = Literal["reported", "under_review", "in_progress"]
PriorityId = Literal["urgent", "high", "normal", "low"]
DispositionId = Literal["resolved_intervention", "owner_compliance", "pet_recovered", "handed_off",
                        "no_further_sightings", "unresolved_other", "invalid_report", "duplicate_report", "withdrawn_by_reporter"]
IncidentId = Literal["not_reviewed", "verified", "partial", "unverified", "invalid"]
SufficiencyId = Literal["not_assessed", "sufficient", "needs_more"]
UrgencyId = Literal["not_assessed", "immediate", "possible", "none"]
IdentityId = Literal["unidentified", "possible_match", "identified"]
OwnershipId = Literal["unknown", "claimed", "under_review", "confirmed", "disputed", "unconfirmed"]
OrgTypeId = Literal["barangay", "animal_control", "veterinary", "animal_welfare", "wildlife", "other"]
ReferralStatusId = Literal["to_contact", "sent", "acknowledged", "in_progress", "completed", "declined", "no_response"]
ContactMethodId = Literal["in_person", "phone", "message", "letter"]
ContactOutcomeId = Literal["cooperative", "denied_ownership", "no_response", "other"]
FollowUpKindId = Literal["follow_up", "site_check", "reporter_update", "referral_check", "warning_end", "post_closure"]
LinkTypeId = Literal["related", "duplicate", "same_animal", "same_incident"]
ClaimDecisionId = Literal["under_review", "needs_info", "accepted", "rejected"]
PublicationModeId = Literal["immediate", "review"]
CategoryFamilyId = Literal["lost_pet", "found_animal", "nuisance", "safety", "injured", "other"]


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


class NoteIn(BaseModel):
    """An internal note on a case: staff only, never shown to residents."""
    text: str = Field(..., min_length=1, max_length=2000)


class StatusMove(BaseModel):
    to: OpenStatusId
    note: Optional[str] = Field(None, max_length=1000)


class PriorityChange(BaseModel):
    priority: PriorityId
    reason: Optional[str] = Field(None, max_length=1000)


class IdentityIn(BaseModel):
    status: IdentityId
    note: Optional[str] = Field(None, max_length=2000)


class OwnershipIn(BaseModel):
    status: OwnershipId
    owner_user_id: Optional[int] = None
    evidence: List[str] = Field(default_factory=list, max_length=20)
    note: Optional[str] = Field(None, max_length=2000)


class AssessmentIn(BaseModel):
    """Everything the assessment step records. Each part is optional: only what is sent is changed."""
    incident: Optional[IncidentId] = None
    incident_basis: Optional[str] = Field(None, max_length=2000)
    evidence_sufficiency: Optional[SufficiencyId] = None
    evidence_reviewed: Optional[List[str]] = Field(None, max_length=50)
    urgency: Optional[UrgencyId] = None
    urgency_note: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=4000)
    identity: Optional[IdentityIn] = None
    ownership: Optional[OwnershipIn] = None
    is_sensitive: Optional[bool] = None

    @field_validator("evidence_reviewed")
    @classmethod
    def _short_items(cls, v):
        if v is not None and any(len(str(x)) > 100 for x in v):
            raise ValueError("Each evidence reference must be 100 characters or fewer.")
        return v


class CloseIn(BaseModel):
    disposition: DispositionId
    reason: str = Field(..., min_length=5, max_length=4000)
    # End the case's pending follow-ups together with the case (the observation, rescue and alert close either way)
    end_open_items: bool = True
    # Schedule a check after closure that the concern has not returned
    post_closure_check_at: Optional[datetime] = None


class ReopenIn(BaseModel):
    reason: str = Field(..., min_length=5, max_length=2000)


class ReferralIn(BaseModel):
    org_type: OrgTypeId
    org_name: Optional[str] = Field(None, max_length=150)
    reason: str = Field(..., min_length=3, max_length=2000)
    contact_method: ContactMethodId = "phone"
    contact_person: Optional[str] = Field(None, max_length=150)
    contact_detail: Optional[str] = Field(None, max_length=255)
    reference_no: Optional[str] = Field(None, max_length=100)
    is_urgent: bool = False
    referred_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)
    # False: the assistance is written down but nobody has been contacted yet (status to_contact). True (the default): it was sent.
    contacted: bool = True


class ReferralUpdateIn(BaseModel):
    status: ReferralStatusId
    note: str = Field(..., min_length=3, max_length=2000)
    external_outcome: Optional[str] = Field(None, max_length=2000)
    remaining_follow_up: Optional[str] = Field(None, max_length=1000)
    follow_up_at: Optional[datetime] = None
    update_date: Optional[datetime] = None
    evidence_url: Optional[str] = Field(None, max_length=500)
    # The contact attempt itself (how and who), when this update records one
    contact_method: Optional[ContactMethodId] = None
    contact_person: Optional[str] = Field(None, max_length=150)
    contact_detail: Optional[str] = Field(None, max_length=255)

    @field_validator("evidence_url")
    @classmethod
    def _https(cls, v):
        v = _clean(v)
        if v and not v.startswith("https://"):
            raise ValueError("Evidence must be an https link to an uploaded file.")
        return v


class FollowUpIn(BaseModel):
    kind: FollowUpKindId = "follow_up"
    title: str = Field(..., min_length=3, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)
    due_at: Optional[datetime] = None
    # Record something already done instead of scheduling it
    done_now: bool = False


class FollowUpDone(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class FollowUpCancel(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)


ComplianceResultId = Literal["compliant", "partial", "non_compliant", "unable_to_observe"]


class ComplianceIn(BaseModel):
    """A compliance observation on a warning. `conclude` ends the observation (the case itself stays open)."""
    result: ComplianceResultId
    notes: str = Field(..., min_length=3, max_length=2000)
    observed_at: Optional[datetime] = None
    conclude: Optional[Literal["compliant", "non_compliant"]] = None


class ContactIn(BaseModel):
    method: ContactMethodId
    with_whom: str = Field(..., min_length=2, max_length=200)
    summary: str = Field(..., min_length=3, max_length=3000)
    outcome: ContactOutcomeId = "other"
    contact_at: Optional[datetime] = None
    next_step_at: Optional[datetime] = None


class LinkIn(BaseModel):
    report_ids: List[int] = Field(..., min_length=1, max_length=10)
    link_type: LinkTypeId = "related"
    note: Optional[str] = Field(None, max_length=1000)


class UnlinkIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class ClaimIn(BaseModel):
    statement: str = Field(..., min_length=10, max_length=3000)
    evidence: List[str] = Field(default_factory=list, max_length=10)
    evidence_urls: List[str] = Field(default_factory=list, max_length=6)
    claimed_pet_id: Optional[int] = None

    @field_validator("evidence_urls")
    @classmethod
    def _https_only(cls, v):
        out = []
        for url in v:
            url = (url or "").strip()
            if not url.startswith("https://") or len(url) > 500:
                raise ValueError("Evidence links must be https links to uploaded files (500 characters or fewer).")
            out.append(url)
        return out


class ClaimInfoIn(BaseModel):
    """What the claimant adds when an officer asked for more information."""
    text: str = Field(..., min_length=3, max_length=2000)


class ClaimReviewIn(BaseModel):
    decision: ClaimDecisionId
    note: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _note_for_refusals(self):
        if self.decision in ("needs_info", "rejected") and len((self.note or "").strip()) < 3:
            raise ValueError("Say what is needed, or why the claim is not accepted.")
        return self


class FoundNoticeIn(BaseModel):
    """Open a found-animal notice for a case (the report's own record stays private)."""
    last_seen_at: Optional[datetime] = None
    last_seen_location: Optional[str] = Field(None, max_length=255)
    note: Optional[str] = Field(None, max_length=1000)


# ----------------------------------------------------------------------------------------------- stored settings
class PolicyIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    title: str = Field(..., min_length=1, max_length=200)
    reference: str = Field(..., min_length=1, max_length=200)
    summary: str = Field("", max_length=1000)
    applies_to: List[CategoryFamilyId] = Field(default_factory=list)
    # None: the policy defines no observation period, and none is assumed
    observation_days: Optional[int] = Field(None, ge=1, le=365)
    status: Literal["confirmed", "pending_confirmation"] = "pending_confirmation"


class FollowUpSettings(BaseModel):
    default_days: int = Field(7, ge=1, le=365)
    min_days: int = Field(0, ge=0, le=365)
    max_days: int = Field(90, ge=1, le=730)

    @model_validator(mode="after")
    def _ordered(self):
        if not (self.min_days <= self.default_days <= self.max_days):
            raise ValueError("Follow-up days must satisfy minimum <= default <= maximum.")
        return self


class PublicationSettings(BaseModel):
    lost_pet: PublicationModeId = "review"
    found_animal: PublicationModeId = "review"


class OfficeProfile(BaseModel):
    """How residents reach the subdivision office (shown on the resident Contact page). Stored with the case settings."""
    address: str = Field("", max_length=255)
    phone: str = Field("", max_length=50)
    email: str = Field("", max_length=150)
    hours: str = Field("", max_length=200)

    @field_validator("address", "phone", "email", "hours", mode="before")
    @classmethod
    def _trimmed(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else v

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        if v and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v):
            raise ValueError("Enter a valid office email address.")
        return v


class CaseSettings(BaseModel):
    categories: dict = Field(default_factory=dict)
    policies: List[PolicyIn] = Field(default_factory=list, max_length=50)
    followups: FollowUpSettings = Field(default_factory=FollowUpSettings)
    publication: PublicationSettings = Field(default_factory=PublicationSettings)
    office: OfficeProfile = Field(default_factory=OfficeProfile)

    @field_validator("categories")
    @classmethod
    def _known_categories(cls, v):
        allowed = {"lost_pet", "found_animal", "nuisance", "safety", "injured", "other"}
        bad = [k for k in v if k not in allowed]
        if bad or any(not isinstance(x, bool) for x in v.values()):
            raise ValueError("categories must map the six category ids to true or false.")
        return v

    @model_validator(mode="after")
    def _unique_policy_ids(self):
        ids = [p.id for p in self.policies]
        if len(ids) != len(set(ids)):
            raise ValueError("Policy ids must be unique.")
        return self
