from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class PetHistoryBase(BaseModel):
    pet_id: int
    event_type: str
    title: str
    description: Optional[str] = None
    recovery_method: Optional[str] = None
    scan_id: Optional[int] = None
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None


class PetHistoryCreate(PetHistoryBase):
    pass


class PetHistoryResponse(PetHistoryBase):
    history_id: int
    created_at: datetime

    class Config:
        from_attributes = True
