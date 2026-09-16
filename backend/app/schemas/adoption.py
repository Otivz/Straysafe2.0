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
    pins: List[JourneyPin] = []

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)
