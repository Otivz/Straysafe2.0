from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.pet import PetResponse
from app.schemas.report import ReportResponse

class PetClaimBase(BaseModel):
    report_id: int
    pet_id: int
    remarks: Optional[str] = None
    status: Optional[str] = "Potential Owner Match"
    evidence_url: Optional[str] = None

class PetClaimCreate(BaseModel):
    report_id: int
    pet_id: int
    remarks: Optional[str] = None

class PetClaimStatusUpdate(BaseModel):
    status: str
    remarks: Optional[str] = None

class PetClaimUpdate(BaseModel):
    status: Optional[str] = None
    remarks: Optional[str] = None
    evidence_url: Optional[str] = None

class PetClaimResponse(PetClaimBase):
    claim_id: int
    created_at: datetime
    updated_at: datetime
    pet: Optional[PetResponse] = None
    report: Optional[ReportResponse] = None

    class Config:
        from_attributes = True
