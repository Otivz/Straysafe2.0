from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from decimal import Decimal

class PetQRCodeBase(BaseModel):
    pet_id: int
    qr_token: str
    qr_image_url: Optional[str] = None
    is_active: bool = True

class PetQRCodeCreate(PetQRCodeBase):
    pass

class PetQRCodeResponse(PetQRCodeBase):
    qr_id: int
    scan_count: int
    last_scanned_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class PublicPetScanResponse(BaseModel):
    pet_id: int
    pet_name: str
    pet_type: str
    breed: Optional[str] = None
    color_markings: Optional[str] = None
    gender: Optional[str] = "Unknown"
    estimated_age: Optional[str] = None
    size_category: Optional[str] = "Medium"
    temperament: Optional[str] = "Friendly"
    photo_url: Optional[str] = None
    health_condition: Optional[str] = None
    is_vaccinated: bool = False
    is_neutered: bool = False
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    owner_address: Optional[str] = None
    owner_profile_picture: Optional[str] = None
    registered_address: Optional[str] = None
    notes: Optional[str] = None  # Owner instructions or notes
    is_active: bool = True
    qr_token: str
    status: Optional[str] = "Active"  # Pet's current status (e.g., Active, Lost, Recovered)

class QRScanSubmit(BaseModel):
    scanned_by: Optional[int] = None
    finder_name: Optional[str] = None
    finder_contact: Optional[str] = None
    scan_lat: Optional[Decimal] = None
    scan_lng: Optional[Decimal] = None
    street_address: Optional[str] = None
    barangay: Optional[str] = None
    city: Optional[str] = None
    landmark: Optional[str] = None
    location_type: str = "Found Location"
    notes: Optional[str] = None

class PetRecoveryConfirmRequest(BaseModel):
    notes: Optional[str] = None

class PetRecoveryRejectRequest(BaseModel):
    rejection_reason: Optional[str] = None

class PetQRScanResponse(BaseModel):
    scan_id: int
    qr_id: int
    pet_id: int
    pet_name: Optional[str] = None
    pet_photo: Optional[str] = None
    scanned_by: Optional[int] = None
    scanned_by_name: Optional[str] = None
    finder_name: Optional[str] = None
    finder_contact: Optional[str] = None
    scan_lat: Optional[Decimal] = None
    scan_lng: Optional[Decimal] = None
    street_address: Optional[str] = None
    barangay: Optional[str] = None
    city: Optional[str] = None
    landmark: Optional[str] = None
    location_type: str = "Found Location"
    notes: Optional[str] = None
    status: str = "PENDING"  # PENDING, CONFIRMED, REJECTED, EXPIRED
    confirmed_at: Optional[datetime] = None
    confirmed_by: Optional[int] = None
    confirmed_by_name: Optional[str] = None
    rejection_reason: Optional[str] = None
    pet_status_at_scan: Optional[str] = None
    scanned_at: datetime

    class Config:
        from_attributes = True

