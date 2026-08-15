from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.pet import PetResponse
from app.schemas.report import ReportResponse

class PetClaimBase(BaseModel):
    report_id: int
    pet_id: int
    remarks: Optional[str] = None
    match_score: Optional[int] = None
    status: Optional[str] = "Potential Owner Match"
    evidence_url: Optional[str] = None
    vaccine_card_url: Optional[str] = None
    vet_record_url: Optional[str] = None
    registration_record_url: Optional[str] = None
    additional_photos_url: Optional[str] = None
    distinctive_markings: Optional[str] = None

class PetClaimCreate(BaseModel):
    report_id: int
    pet_id: int
    remarks: Optional[str] = None
    distinctive_markings: Optional[str] = None

class PetClaimStatusUpdate(BaseModel):
    status: str
    remarks: Optional[str] = None

class PetClaimUpdate(BaseModel):
    status: Optional[str] = None
    remarks: Optional[str] = None
    evidence_url: Optional[str] = None
    vaccine_card_url: Optional[str] = None
    vet_record_url: Optional[str] = None
    registration_record_url: Optional[str] = None
    additional_photos_url: Optional[str] = None
    distinctive_markings: Optional[str] = None

class PetClaimResponse(PetClaimBase):
    claim_id: int
    created_at: datetime
    updated_at: datetime
    pet: Optional[PetResponse] = None
    report: Optional[ReportResponse] = None

    class Config:
        from_attributes = True
