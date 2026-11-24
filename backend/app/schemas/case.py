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
ReferralStatusId = Literal[
    "to_contact", "pending", "sent", "acknowledged", "in_progress",
    "awaiting_response", "resolved", "completed", "declined", "cancelled", "no_response"
]
ReferralPriorityId = Literal["normal", "high", "urgent"]
ContactMethodId = Literal["in_person", "phone", "email", "message", "letter", "other"]
ContactOutcomeId = Literal["cooperative", "denied_ownership", "no_response", "other"]
FollowUpKindId = Literal[
    "follow_up", "coordination_update", "rescue_update", "welfare_check",
    "site_check", "reporter_update", "referral_check", "warning_end", "post_closure"
]
LinkTypeId = Literal["related", "duplicate", "same_animal", "same_incident"]
ClaimDecisionId = Literal["under_review", "needs_info", "accepted", "rejected"]
PublicationModeId = Literal["immediate", "review"]
CategoryFamilyId = Literal["lost_pet", "found_animal", "nuisance", "safety", "injured", "other"]
ConcernStatusId = Literal["ongoing_assessment", "in_progress", "resolved", "not_applicable"]


class ConcernUpdateIn(BaseModel):
    status: ConcernStatusId
    outcome: Optional[str] = Field(None, max_length=160)
    threat_ongoing: Optional[str] = Field(None, max_length=10)
    resolution_notes: Optional[str] = Field(None, max_length=2000)
    final_animal_condition: Optional[str] = Field(None, max_length=500)
    assistance_provided: Optional[str] = Field(None, max_length=1000)
    security_actions_performed: Optional[str] = Field(None, max_length=1000)
    advisory_status: Optional[str] = Field(None, max_length=200)
    referral_outcome: Optional[str] = Field(None, max_length=500)


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


class CategoryChange(BaseModel):
    """The Leader moves a case to another kind of concern (never to or from Lost Pet)."""
    category: CategoryFamilyId


class IdentityIn(BaseModel):
    status: IdentityId
    note: Optional[str] = Field(None, max_length=2000)


class OwnershipIn(BaseModel):
    status: OwnershipId
    owner_user_id: Optional[int] = None
    evidence: List[str] = Field(default_factory=list, max_length=20)
    note: Optional[str] = Field(None, max_length=2000)


class InjuredAssessmentIn(BaseModel):
    injury_severity: Optional[str] = Field(None, max_length=100)
    bleeding: Optional[str] = Field(None, max_length=100)
    illness_signs: Optional[str] = Field(None, max_length=100)
    weakness: Optional[str] = Field(None, max_length=100)
    mobility: Optional[str] = Field(None, max_length=100)
    trapped: Optional[str] = Field(None, max_length=100)
    neglect_suspected: Optional[str] = Field(None, max_length=100)


class DangerousAssessmentIn(BaseModel):
    aggressive_severity: Optional[str] = Field(None, max_length=100)
    attack_or_bite_occurred: Optional[str] = Field(None, max_length=100)
    people_threatened: Optional[str] = Field(None, max_length=100)
    animals_threatened: Optional[str] = Field(None, max_length=100)
    still_in_area: Optional[str] = Field(None, max_length=100)
    threat_ongoing: Optional[str] = Field(None, max_length=100)
    rabies_signs_reported: Optional[str] = Field(None, max_length=100)
    security_required: Optional[str] = Field(None, max_length=100)


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
    injured_assessment: Optional[InjuredAssessmentIn] = None
    dangerous_assessment: Optional[DangerousAssessmentIn] = None
    priority_override: Optional[PriorityId] = None
    priority_change_reason: Optional[str] = Field(None, max_length=1000)

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
    # Injured / Sick Animal welfare outcome documentation
    welfare_outcome: Optional[str] = Field(None, max_length=120)
    final_animal_condition: Optional[str] = Field(None, max_length=500)
    assistance_provided: Optional[str] = Field(None, max_length=1000)
    referral_outcome: Optional[str] = Field(None, max_length=500)
    # Dangerous Animal resolution documentation
    dangerous_outcome: Optional[str] = Field(None, max_length=120)
    security_actions_performed: Optional[str] = Field(None, max_length=1000)
    advisory_status: Optional[str] = Field(None, max_length=200)
    threat_ongoing: Optional[str] = Field(None, max_length=50)


class ReopenIn(BaseModel):
    reason: str = Field(..., min_length=5, max_length=2000)


class ReferralAttachmentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=500)
    type: Optional[str] = Field("document", max_length=50)
    uploaded_at: Optional[str] = Field(None, max_length=60)


class ReferralIn(BaseModel):
    org_type: OrgTypeId
    org_name: Optional[str] = Field(None, max_length=150)
    reason: str = Field(..., min_length=3, max_length=2000)
    priority_level: ReferralPriorityId = "normal"
    contact_method: ContactMethodId = "phone"
    contact_person: Optional[str] = Field(None, max_length=150)
    contact_detail: Optional[str] = Field(None, max_length=255)
    reference_no: Optional[str] = Field(None, max_length=100)
    is_urgent: bool = False
    referred_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)
    additional_notes: Optional[str] = Field(None, max_length=2000)
    supporting_documents: List[ReferralAttachmentIn] = Field(default_factory=list)
    initial_status: Optional[Literal["pending", "sent", "to_contact"]] = None
    # False: the assistance is written down but nobody has been contacted yet (status to_contact). True (the default): it was sent.
    contacted: bool = True


class ReferralUpdateIn(BaseModel):
    status: ReferralStatusId
    note: str = Field(..., min_length=3, max_length=2000)
    update_type: Optional[Literal["status_change", "agency_response", "outcome"]] = None
    responder_name: Optional[str] = Field(None, max_length=150)
    assistance_provided: Optional[str] = Field(None, max_length=2000)
    actions_completed: Optional[str] = Field(None, max_length=2000)
    progress_notes: Optional[str] = Field(None, max_length=2000)
    follow_up_instructions: Optional[str] = Field(None, max_length=2000)
    additional_notes: Optional[str] = Field(None, max_length=2000)
    external_outcome: Optional[str] = Field(None, max_length=2000)
    remaining_follow_up: Optional[str] = Field(None, max_length=1000)
    follow_up_at: Optional[datetime] = None
    update_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    evidence_url: Optional[str] = Field(None, max_length=500)
    supporting_documents: List[ReferralAttachmentIn] = Field(default_factory=list)
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


class DuplicateDecisionIn(BaseModel):
    other_report_id: int
    decision: Literal["not_duplicate", "defer"]
    reason: Optional[str] = Field(None, max_length=1000)


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
    # Complaint management (docs/01-system/COMPLAINT_MANAGEMENT.md). Both are the subdivision's decision and never assumed:
    # the fine for a 3rd offense under this rule (None: no fine can be imposed under it), and how many days an offense keeps
    # counting towards the next one (None: it never stops counting).
    fine_amount: Optional[float] = Field(None, ge=0, le=1_000_000)
    count_window_days: Optional[int] = Field(None, ge=1, le=3650)


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


def _validate_phone(v: str) -> str:
    if v:
        digits = re.sub(r"\D", "", v)
        if not re.fullmatch(r"[0-9+\-().\s/]{7,50}", v) or len(digits) < 7 or len(digits) > 20:
            raise ValueError("Enter a valid official contact number (7 to 20 digits).")
    return v


def _validate_email(v: str) -> str:
    if v and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v):
        raise ValueError("Enter a valid official email address.")
    return v


class OfficeProfile(BaseModel):
    """Official Subdivision Administration contact information (shown on the resident Contact page and used for subdivision autofill). Stored per subdivision with the case settings."""
    administration_name: str = Field("", max_length=200)
    contact_person: str = Field("", max_length=150)
    address: str = Field("", max_length=255)
    phone: str = Field("", max_length=50)
    email: str = Field("", max_length=150)
    hours: str = Field("", max_length=200)

    @field_validator("administration_name", "contact_person", "address", "phone", "email", "hours", mode="before")
    @classmethod
    def _trimmed(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else v

    @field_validator("phone")
    @classmethod
    def _phone_shape(cls, v):
        return _validate_phone(v)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        return _validate_email(v)


class ExternalAgencyContact(BaseModel):
    """One saved external agency / organization for referrals and external coordination."""
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field("", max_length=200)
    agency_type: str = Field("barangay", max_length=60)
    contact_person: str = Field("", max_length=150)
    phone: str = Field("", max_length=50)
    email: str = Field("", max_length=150)
    address: str = Field("", max_length=255)

    @field_validator("id", "name", "agency_type", "contact_person", "phone", "email", "address", mode="before")
    @classmethod
    def _trimmed(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else v

    @field_validator("phone")
    @classmethod
    def _phone_shape(cls, v):
        return _validate_phone(v)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        return _validate_email(v)


class ExternalCoordinationProfile(BaseModel):
    """External agency / Barangay official contact configuration for referrals and external coordination. Stored separately from Subdivision Office details."""
    barangay_name: str = Field("", max_length=200)
    contact_person: str = Field("", max_length=150)
    phone: str = Field("", max_length=50)
    email: str = Field("", max_length=150)
    address: str = Field("", max_length=255)
    agencies: List[ExternalAgencyContact] = Field(default_factory=list, max_length=50)

    @field_validator("barangay_name", "contact_person", "phone", "email", "address", mode="before")
    @classmethod
    def _trimmed(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else v

    @field_validator("phone")
    @classmethod
    def _phone_shape(cls, v):
        return _validate_phone(v)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        return _validate_email(v)

    @model_validator(mode="after")
    def _sync_legacy_and_agencies(self):
        # Preserve legacy single-Barangay data as the first agency if agencies list is empty
        if not self.agencies and self.barangay_name:
            self.agencies = [
                ExternalAgencyContact(
                    id="barangay-default",
                    name=self.barangay_name,
                    agency_type="barangay",
                    contact_person=self.contact_person,
                    phone=self.phone,
                    email=self.email,
                    address=self.address,
                )
            ]
        return self


class CaseSettings(BaseModel):
    categories: dict = Field(default_factory=dict)
    policies: List[PolicyIn] = Field(default_factory=list, max_length=50)
    followups: FollowUpSettings = Field(default_factory=FollowUpSettings)
    publication: PublicationSettings = Field(default_factory=PublicationSettings)
    office: OfficeProfile = Field(default_factory=OfficeProfile)
    external_coordination: ExternalCoordinationProfile = Field(default_factory=ExternalCoordinationProfile)

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
