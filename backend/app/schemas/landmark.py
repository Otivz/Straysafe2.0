from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LandmarkBase(BaseModel):
    name: str
    category: Optional[str] = "general"
    description: Optional[str] = None
    subdivision_id: Optional[int] = None
    barangay_id: Optional[int] = 1
    latitude: float
    longitude: float
    is_holding_facility: Optional[bool] = False
    facility_type: Optional[str] = None
    capacity: Optional[int] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    status: Optional[str] = "Active"

class LandmarkCreate(LandmarkBase):
    pass

class LandmarkUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    subdivision_id: Optional[int] = None
    barangay_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_holding_facility: Optional[bool] = None
    facility_type: Optional[str] = None
    capacity: Optional[int] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    status: Optional[str] = None

class LandmarkResponse(LandmarkBase):
    landmark_id: int
    subdivision_name: Optional[str] = None
    barangay_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BarangayHQResponse(BaseModel):
    barangay_id: int
    barangay_name: str
    city: str
    contact_no: Optional[str] = None
    hq_plus_code: Optional[str] = None
    hq_lat: Optional[float] = None
    hq_lng: Optional[float] = None

    class Config:
        from_attributes = True

class BarangayHQUpdate(BaseModel):
    barangay_name: Optional[str] = None
    city: Optional[str] = None
    contact_no: Optional[str] = None
    hq_plus_code: Optional[str] = None
    hq_lat: Optional[float] = None
    hq_lng: Optional[float] = None
