from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

class PetBase(BaseModel):
    pet_name: str
    pet_type: str
    breed: Optional[str] = None
    color_markings: Optional[str] = None
    gender: Optional[str] = "Unknown"
    birth_date: Optional[date] = None
    estimated_age: Optional[str] = None
    weight: Optional[Decimal] = None
    size_category: Optional[str] = "Medium"
    photo_url: Optional[str] = None
    health_condition: Optional[str] = None
    is_vaccinated: Optional[bool] = False
    vaccination_date: Optional[date] = None
    vaccine_expiry: Optional[date] = None
    is_neutered: Optional[bool] = False
    temperament: Optional[str] = "Friendly"
    has_bite_history: Optional[bool] = False
    bite_incident_count: Optional[int] = 0
    chase_behavior: Optional[bool] = False
    notes: Optional[str] = None
    status: Optional[str] = "Active"
    is_verified: Optional[bool] = False
    last_seen_lat: Optional[Decimal] = None
    last_seen_lng: Optional[Decimal] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

class PetCreate(PetBase):
    owner_id: int

class PetUpdate(BaseModel):
    pet_name: Optional[str] = None
    pet_type: Optional[str] = None
    breed: Optional[str] = None
    color_markings: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    estimated_age: Optional[str] = None
    weight: Optional[Decimal] = None
    size_category: Optional[str] = None
    photo_url: Optional[str] = None
    health_condition: Optional[str] = None
    is_vaccinated: Optional[bool] = None
    vaccination_date: Optional[date] = None
    vaccine_expiry: Optional[date] = None
    is_neutered: Optional[bool] = None
    temperament: Optional[str] = None
    has_bite_history: Optional[bool] = None
    bite_incident_count: Optional[int] = None
    chase_behavior: Optional[bool] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = None
    last_seen_lat: Optional[Decimal] = None
    last_seen_lng: Optional[Decimal] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

class PetResponse(PetBase):
    pet_id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
