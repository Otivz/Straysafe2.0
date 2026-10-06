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
    is_new_user: Optional[bool] = False
    requires_profile_completion: Optional[bool] = False
    requires_otp: Optional[bool] = False
    requires_login_code: Optional[bool] = False
    expires_in: Optional[int] = None
    email_sent: Optional[bool] = None
    dev_otp: Optional[str] = None
    message: Optional[str] = None

    model_config = {
        "from_attributes": True
    }


class GoogleAuthRequest(BaseModel):
    # The ID token from Google Identity Services; email/name/picture are read from it after verification.
    credential: str


class CompleteProfileRequest(BaseModel):
    user_id: Optional[int] = None
    email: Optional[EmailStr] = None
    name: str
    phone: str
    subdivision_id: int
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CompleteProfileResponse(BaseModel):
    status: str
    message: str
    user_id: int
    email: str
    phone: Optional[str] = None
    expires_in: int = 300
    email_sent: Optional[bool] = None
    dev_otp: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    user_id: Optional[int] = None
    email: Optional[EmailStr] = None
    otp: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class AdminLoginCodeRequest(BaseModel):
    email: EmailStr
    otp: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class VerifyResetCodeRequest(BaseModel):
    email: EmailStr
    otp: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class ResendOtpRequest(BaseModel):
    user_id: Optional[int] = None
    email: Optional[EmailStr] = None


class UserPublicResponse(BaseModel):
    user_id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role_id: int
    subdivision_id: Optional[int] = None
    barangay_id: Optional[int] = None
    position_id: Optional[int] = None
    is_head_officer: bool = False
    profile_picture: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    is_verified: bool = False
    created_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }
