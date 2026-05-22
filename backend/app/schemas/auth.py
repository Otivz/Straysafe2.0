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
    profile_picture: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = False
    created_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }
