from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class PositionResponse(BaseModel):
    position_id: int
    position_name: str
    
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role_id: int
    subdivision_id: Optional[int] = None
    position_id: Optional[int] = None
    barangay_id: Optional[int] = None
    is_head_officer: Optional[bool] = False
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = "Active"
    is_verified: Optional[bool] = False
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str
    position: Optional[str] = None
    position_name: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[int] = None
    subdivision_id: Optional[int] = None
    position_id: Optional[int] = None
    position: Optional[str] = None
    position_name: Optional[str] = None
    barangay_id: Optional[int] = None
    is_head_officer: Optional[bool] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = None


class UserResponse(UserBase):
    user_id: int
    barangay_name: Optional[str] = None
    position_name: Optional[str] = None
    subdivision_name: Optional[str] = None
    role_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

