from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    user_id: int
    email: EmailStr
    name: Optional[str] = None
    role_id: int
    subdivision_id: Optional[int] = None
    barangay_id: Optional[int] = None
    is_head_officer: Optional[bool] = False
    position_id: Optional[int] = None
    position_name: Optional[str] = None
    barangay_name: Optional[str] = None
    profile_picture: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = False
    created_at: Optional[datetime] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"

    model_config = {
        "from_attributes": True
    }

