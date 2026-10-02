from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class AdoptionApplyRequest(BaseModel):
    holding_id: int
    full_name: str
    address: str
    contact_no: str
    has_other_pets: bool = False
    living_space: str = "House with yard"
    reason: str
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_photo_url: Optional[str] = None


class AdoptionHandoverConfirmRequest(BaseModel):
    notes: Optional[str] = None
    handover_evidence_url: Optional[str] = None


class AdoptionReviewRequest(BaseModel):
    decision: str  # 'Approved' | 'Rejected'
    review_notes: Optional[str] = None


class PromoteToAdoptionRequest(BaseModel):
    adoption_catalog_notes: Optional[str] = None
    notes: Optional[str] = None
    min_stay_days: Optional[int] = None


class LateClaimInfoResponse(BaseModel):
    adopter_name: str
    adopter_contact_no: str

    model_config = ConfigDict(from_attributes=True)


class CatalogAnimalResponse(BaseModel):
    holding_id: int
    report_id: int
    animal_name: Optional[str] = None
    animal_type: Optional[str] = None
    breed: Optional[str] = None
    color: Optional[str] = None
    estimated_size: Optional[str] = None
    facility_status: int
    adoption_catalog_notes: Optional[str] = None
    intake_date: Optional[datetime] = None
    promoted_at: Optional[datetime] = None
    photos: List[str] = []
    intake_staff_name: Optional[str] = None
    intake_staff_contact: Optional[str] = None
    facility_name: Optional[str] = None
    facility_contact: Optional[str] = None
    managing_unit: Optional[str] = None
    sighting_lat: Optional[float] = None
    sighting_lng: Optional[float] = None
    sighting_landmark: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class JourneyPin(BaseModel):
    id: str
    label: str
    description: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    date: Optional[str] = None
    pin_color: str  # 'red', 'orange', 'blue', 'green'


class UserJourneyPetSummary(BaseModel):
    holding_id: int
    animal_name: Optional[str] = None
    animal_type: Optional[str] = None
    breed: Optional[str] = None
    photo: Optional[str] = None
    application_status: Optional[str] = None
    is_adopted: bool = False
    adoption_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AnimalJourneyResponse(BaseModel):
    holding_id: int
    animal_name: Optional[str] = None
    animal_type: Optional[str] = None
    breed: Optional[str] = None
    color: Optional[str] = None
    photos: List[str] = []
    is_adopted: bool = False
    adopter_name_public: Optional[str] = None
    adopter_date: Optional[str] = None
    adopter_area: Optional[str] = None
    adopter_name_full: Optional[str] = None  # Staff only
    adopter_contact: Optional[str] = None    # Staff only
    adopter_address: Optional[str] = None    # Staff only
    application_status: Optional[str] = None
    pins: List[JourneyPin] = []
    user_pets: List[UserJourneyPetSummary] = []

    model_config = ConfigDict(from_attributes=True)


class AdoptionCancelRequest(BaseModel):
    reason: str


class AdoptionResponse(BaseModel):
    adoption_id: int
    holding_id: int
    applicant_id: int
    status: str
    full_name: str
    address: str
    contact_no: str
    has_other_pets: bool
    living_space: str
    reason: str
    reviewed_by: Optional[int] = None
    reviewer_role: Optional[str] = None
    reviewer_name: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    animal_name: Optional[str] = None
    animal_type: Optional[str] = None
    animal_breed: Optional[str] = None
    animal_photo: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_photo_url: Optional[str] = None
    has_id_uploaded: bool = False
    is_handed_over: bool = False
    handover_date: Optional[datetime] = None
    staff_handed_over: bool = False
    staff_handover_date: Optional[datetime] = None
    staff_handover_by: Optional[int] = None
    staff_handover_name: Optional[str] = None
    created_pet_id: Optional[int] = None
    cancellation_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None

    # 9-Stage Workflow Fields
    current_stage: str = "Application"
    application_stage_status: str = "Submitted"
    agreement_signed_at: Optional[datetime] = None
    agreement_signature_url: Optional[str] = None
    certificate_id: Optional[int] = None
    is_certificate_sent: bool = False
    certificate_sent_at: Optional[datetime] = None
    handover_location: Optional[str] = None
    handover_scheduled_date: Optional[datetime] = None
    handover_scheduled_time: Optional[str] = None
    handover_assigned_staff: Optional[str] = None
    handover_notes: Optional[str] = None
    handover_status: Optional[str] = "Pending"
    resident_handover_confirmed: bool = False
    resident_handover_confirmed_at: Optional[datetime] = None
    handover_photo_url: Optional[str] = None
    post_monitoring_status: str = "Not_Started"
    adoption_completed_at: Optional[datetime] = None

    # Contextual Summary Fields for Cards & Detail Views
    interview_scheduled_at: Optional[datetime] = None
    interview_mode: Optional[str] = None
    interview_location: Optional[str] = None
    interview_result: Optional[str] = None
    interviewer_name: Optional[str] = None
    interview_notes: Optional[str] = None
    home_visit_scheduled_date: Optional[datetime] = None
    home_visit_result: Optional[str] = None
    home_visit_notes: Optional[str] = None
    home_visit_inspector_name: Optional[str] = None
    home_visit_photos: Optional[List[str]] = None
    certificate_number: Optional[str] = None
    approval_date: Optional[datetime] = None
    approved_by_name: Optional[str] = None
    monitoring_records_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class AdoptionCertificateSendRequest(BaseModel):
    notes: Optional[str] = None


class AdoptionHandoverScheduleRequest(BaseModel):
    handover_date: datetime
    handover_time: Optional[str] = "10:00 AM"
    handover_location: Optional[str] = "Barangay Holding Facility"
    assigned_staff: Optional[str] = None
    notes: Optional[str] = None


class SecureIdViewResponse(BaseModel):
    temporary_url: str
    expires_in_seconds: int = 300
    masked_id: Optional[str] = None
    id_type: Optional[str] = None
    applicant_name: str


class IdPurgeResponse(BaseModel):
    purged_rejected_or_cancelled: int
    purged_finalized_handover: int
    total_purged: int
    executed_at: str


# ==========================================
# 9-Stage Adoption Lifecycle Workflow Schemas
# ==========================================

# Stage 2: Verification
class AdoptionVerificationRequest(BaseModel):
    id_match_status: str = "Matched"          # 'Matched', 'Mismatched', 'Unclear'
    residency_status: str = "Resident_Confirmed" # 'Resident_Confirmed', 'Non_Resident', 'Unknown'
    blacklist_checked: bool = True
    is_blacklisted: bool = False
    verification_notes: Optional[str] = None
    decision: str = "Pass"                    # 'Pass', 'Needs_Correction', 'Fail'
    rejection_reason: Optional[str] = None


class AdoptionVerificationResponse(BaseModel):
    verification_id: int
    adoption_id: int
    verified_by: Optional[int] = None
    verifier_name: Optional[str] = None
    id_match_status: str
    residency_status: str
    blacklist_checked: bool
    is_blacklisted: bool
    verification_notes: Optional[str] = None
    verified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Stage 3: Interview
class AdoptionInterviewScheduleRequest(BaseModel):
    scheduled_at: datetime
    interview_mode: str = "In-Person"         # 'In-Person', 'Video_Call', 'Phone'
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    interviewer_name: Optional[str] = None
    notes: Optional[str] = None


class AdoptionInterviewEvaluateRequest(BaseModel):
    score_care_knowledge: Optional[int] = 5                 # 1 to 5
    score_financial_readiness: Optional[int] = 5            # 1 to 5
    score_environment_suitability: Optional[int] = 5        # 1 to 5
    interview_result: Optional[str] = "Successful"          # 'Successful', 'Needs Follow-up', 'Unsuccessful'
    recommendation: Optional[str] = "Successful"            # 'Successful', 'Needs Follow-up', 'Unsuccessful'
    interviewer_name: Optional[str] = None
    conducted_at: Optional[datetime] = None
    questions_discussed: Optional[str] = None
    applicant_responses: Optional[str] = None
    additional_observations: Optional[str] = None
    interview_notes: Optional[str] = None


class AdoptionInterviewResponse(BaseModel):
    interview_id: int
    adoption_id: int
    interviewer_id: Optional[int] = None
    interviewer_name: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    interview_mode: str = "In-Person"
    meeting_link: Optional[str] = None
    score_care_knowledge: Optional[int] = None
    score_financial_readiness: Optional[int] = None
    score_environment_suitability: Optional[int] = None
    total_score: Optional[float] = None
    recommendation: str
    interview_notes: Optional[str] = None
    conducted_at: Optional[datetime] = None
    questions_discussed: Optional[str] = None
    applicant_responses: Optional[str] = None
    additional_observations: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Stage 4: Home Visit
class AdoptionHomeVisitScheduleRequest(BaseModel):
    scheduled_date: datetime
    visit_type: str = "Physical"              # 'Physical', 'Virtual'
    assigned_personnel: Optional[str] = None
    adopter_address: Optional[str] = None
    contact_no: Optional[str] = None
    location_notes: Optional[str] = None
    notes: Optional[str] = None


class AdoptionHomeVisitEvaluateRequest(BaseModel):
    residence_condition: Optional[str] = None
    available_living_space: Optional[str] = None
    environment_safety: Optional[str] = None
    cleanliness_sanitation: Optional[str] = None
    presence_of_hazards: Optional[str] = None
    existing_pets: Optional[str] = None
    is_fencing_secure: bool = True
    is_shelter_adequate: bool = True
    hazard_free: bool = True
    checklist_notes: Optional[str] = None
    overall_suitability: Optional[str] = "Suitable"
    additional_observations: Optional[str] = None
    recommendations: Optional[str] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    visit_photos: Optional[List[str]] = []
    inspection_result: str = "Suitable"         # 'Suitable', 'Suitable with Conditions', 'Not Suitable', 'Requires Follow-up'


class AdoptionHomeVisitResponse(BaseModel):
    visit_id: int
    adoption_id: int
    inspector_id: Optional[int] = None
    inspector_name: Optional[str] = None
    visit_type: str = "Physical"
    scheduled_date: Optional[datetime] = None
    is_fencing_secure: bool = True
    is_shelter_adequate: bool = True
    hazard_free: bool = True
    checklist_notes: Optional[str] = None
    overall_suitability: Optional[str] = None
    recommendations: Optional[str] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    visit_photos: Optional[List[str]] = None
    inspection_result: str
    conducted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Stage 5: Review
class AdoptionReviewSubmitRequest(BaseModel):
    review_notes: str
    decision: Optional[str] = "Approve"         # 'Approve', 'Return for Follow-up', 'Reject', 'Recommend_Approval'
    recommendation: Optional[str] = "Approve"


# Stage 6: Approval
class AdoptionDecisionRequest(BaseModel):
    decision: str                             # 'Approved', 'Rejected'
    review_notes: Optional[str] = None


# Stage 7: Agreement & Certificate
class AdoptionAgreementSignRequest(BaseModel):
    signature_data_url: Optional[str] = None
    agreed_terms: bool = True


class AdoptionCertificateResponse(BaseModel):
    certificate_id: int
    adoption_id: int
    certificate_number: str
    verification_hash: str
    pdf_url: str
    qr_code_url: str
    issued_by: Optional[int] = None
    issuer_name: Optional[str] = None
    issued_at: datetime
    adopter_name: Optional[str] = None
    adopter_address: Optional[str] = None
    adopter_phone: Optional[str] = None
    animal_name: Optional[str] = None
    animal_type: Optional[str] = None
    animal_breed: Optional[str] = None
    animal_sex: Optional[str] = None
    animal_age: Optional[str] = None
    animal_id: Optional[str] = None
    animal_photo: Optional[str] = None
    holding_id: Optional[int] = None
    application_number: Optional[str] = None
    date_applied: Optional[datetime] = None
    date_approved: Optional[datetime] = None
    adoption_status: Optional[str] = "APPROVED"
    barangay_name: Optional[str] = "San Vicente"
    municipality_city: Optional[str] = "Santa Maria"
    province: Optional[str] = "Bulacan"
    captain_name: Optional[str] = "Kyla Bianca Frias"
    captain_position: Optional[str] = "Punong Barangay / Barangay Captain"
    captain_signature_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Stage 8: Handover
class AdoptionHandoverCompleteRequest(BaseModel):
    handover_date: Optional[datetime] = None
    handover_time: Optional[str] = None
    receiving_adopter: Optional[str] = None
    assigned_personnel: Optional[str] = None
    animal_condition: Optional[str] = "Healthy & Active"
    handover_location: Optional[str] = "Barangay Holding Facility"
    handover_photo_url: Optional[str] = None
    notes: Optional[str] = None
    documents_verified: bool = True
    handover_confirmed: bool = True


# Stage 9: Monitoring
class AdoptionMonitoringSubmitRequest(BaseModel):
    health_status: str                        # 'Healthy', 'Minor_Illness', 'Under_Treatment'
    photos: List[str] = []
    vet_record_url: Optional[str] = None
    adopter_notes: Optional[str] = None


class AdoptionMonitoringReviewRequest(BaseModel):
    status: str                               # 'Approved', 'Needs_Correction', 'Delinquent', 'Escalated'
    review_notes: Optional[str] = None


class AdoptionStaffMonitoringRecordRequest(BaseModel):
    monitoring_date: Optional[datetime] = None
    monitoring_type: Optional[str] = "Initial Follow-up"
    monitoring_personnel: Optional[str] = None
    animal_condition: Optional[str] = "Good"
    health_status: Optional[str] = "Healthy"
    living_condition: Optional[str] = "Good"
    food_and_water: Optional[str] = "Adequate"
    shelter_condition: Optional[str] = "Safe"
    vaccination_status: Optional[str] = "Up to Date"
    behavior: Optional[str] = "Normal"
    adopter_compliance: Optional[str] = "Compliant"
    remarks: Optional[str] = None
    observations: Optional[str] = None
    comments: Optional[str] = None
    follow_up_action: Optional[str] = None
    next_followup_date: Optional[str] = None
    photos: Optional[List[str]] = []


class AdoptionMonitoringLogResponse(BaseModel):
    log_id: int
    adoption_id: int
    milestone_name: str
    due_date: str
    submitted_at: Optional[datetime] = None
    status: str
    health_status: Optional[str] = None
    photos: Optional[List[str]] = None
    vet_record_url: Optional[str] = None
    adopter_notes: Optional[str] = None
    reviewed_by: Optional[int] = None
    reviewer_name: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Timeline Audit
class AdoptionTimelineLogResponse(BaseModel):
    timeline_id: int
    adoption_id: int
    stage: str
    action: str
    performed_by: Optional[int] = None
    actor_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Unified Adoption Dossier Response
class AdoptionDossierResponse(BaseModel):
    adoption: AdoptionResponse
    verification: Optional[AdoptionVerificationResponse] = None
    interview: Optional[AdoptionInterviewResponse] = None
    home_visit: Optional[AdoptionHomeVisitResponse] = None
    certificate: Optional[AdoptionCertificateResponse] = None
    monitoring_logs: List[AdoptionMonitoringLogResponse] = []
    timeline_logs: List[AdoptionTimelineLogResponse] = []

    model_config = ConfigDict(from_attributes=True)

