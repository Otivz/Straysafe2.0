import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, Subdivision
from app.models.otp import OtpVerification
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    GoogleAuthRequest,
    UserPublicResponse,
    CompleteProfileRequest,
    CompleteProfileResponse,
    VerifyOtpRequest,
    ResendOtpRequest,
)
from app.utils.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token,
    create_refresh_token,
    decode_refresh_token,
    set_refresh_cookie,
    clear_refresh_cookie,
    is_token_revoked,
    revoke_token,
    get_current_user,
)
from app.utils.audit import log_activity
from app.limiter import limiter

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)


def is_resident_profile_complete(user: User) -> bool:
    """Check if all required resident fields are present."""
    if not user.name or not user.phone or not user.address or not user.subdivision_id:
        return False
    return True


def generate_and_record_otp(db: Session, user: User, purpose: str = "resident_registration") -> str:
    """Generate a 6-digit cryptographic OTP, invalidate older codes, and record in DB."""
    # Invalidate existing unused codes for this user
    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.is_used == False
    ).update({"is_used": True})

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now() + timedelta(minutes=5)

    otp_record = OtpVerification(
        user_id=user.user_id,
        email=user.email,
        phone=user.phone,
        otp_code=otp_code,
        purpose=purpose,
        is_used=False,
        attempts=0,
        max_attempts=5,
        expires_at=expires_at
    )
    db.add(otp_record)
    db.commit()
    db.refresh(otp_record)
    return otp_code


@router.get("/subdivisions")
def get_subdivisions(db: Session = Depends(get_db)):
    """Fetch all active subdivisions for resident profile completion."""
    subs = db.query(Subdivision).all()
    return [
        {
            "subdivision_id": s.subdivision_id,
            "subdivision_name": s.subdivision_name,
            "barangay_id": s.barangay_id,
            "barangay_name": s.barangay.barangay_name if s.barangay else "San Vicente",
            "city": s.barangay.city if s.barangay else "Santa Maria, Bulacan"
        }
        for s in subs
    ]


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(request: Request, login_request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(User).filter(User.email == login_request.email).first()
    
    if not user:
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            description=f"Failed login attempt for email: {login_request.email} (user not found)",
            log_type="security",
            request=request
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(login_request.password, user.password):
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            target_id=user.user_id,
            description=f"Failed login attempt for user: {user.name} ({user.email}) — wrong password",
            user_id=user.user_id,
            log_type="security",
            request=request
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if account is inactive
    if user.status == "Inactive":
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            target_id=user.user_id,
            description=f"Login blocked for inactive account: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=request
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive. Please contact the administrator for assistance.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if resident requires profile completion or OTP
    if user.role_id == 1 and not user.is_verified:
        profile_complete = is_resident_profile_complete(user)
        token = create_access_token({
            "sub": str(user.user_id),
            "user_id": user.user_id,
            "email": user.email,
            "role_id": user.role_id,
            "is_verified": False
        })
        if not profile_complete:
            return {
                "user_id": user.user_id,
                "email": user.email,
                "name": user.name,
                "role_id": user.role_id,
                "subdivision_id": user.subdivision_id,
                "barangay_id": user.barangay_id,
                "profile_picture": user.profile_picture,
                "phone": user.phone,
                "address": user.address,
                "status": user.status,
                "is_verified": False,
                "access_token": token,
                "token_type": "bearer",
                "requires_profile_completion": True,
                "requires_otp": False,
                "message": "Please complete your resident details before proceeding."
            }
        else:
            otp_code = generate_and_record_otp(db, user, purpose="resident_verification")
            return {
                "user_id": user.user_id,
                "email": user.email,
                "name": user.name,
                "role_id": user.role_id,
                "subdivision_id": user.subdivision_id,
                "barangay_id": user.barangay_id,
                "profile_picture": user.profile_picture,
                "phone": user.phone,
                "address": user.address,
                "status": user.status,
                "is_verified": False,
                "access_token": token,
                "token_type": "bearer",
                "requires_profile_completion": False,
                "requires_otp": True,
                "dev_otp": otp_code,
                "message": f"Verification code sent to {user.email} / {user.phone}."
            }

    # Generate JWT access token & refresh token for fully verified user
    token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id,
        "is_verified": True
    })
    refresh_token = create_refresh_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id
    })
    set_refresh_cookie(response, refresh_token)

    # Successful login
    log_activity(
        db=db,
        action="LOGIN",
        target_table="users",
        target_id=user.user_id,
        description=f"Successful login: {user.name} ({user.email})",
        user_id=user.user_id,
        log_type="security",
        request=request
    )
    
    b_name = user.barangay.barangay_name if user.barangay else (user.subdivision.barangay.barangay_name if user.subdivision and user.subdivision.barangay else ("San Vicente" if user.role_id in [2, 3] else None))
    p_name = user.position.position_name if user.position else ("Barangay Head Officer" if user.is_head_officer else None)

    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "subdivision_id": user.subdivision_id,
        "barangay_id": user.barangay_id,
        "is_head_officer": user.is_head_officer,
        "position_id": user.position_id,
        "position_name": p_name,
        "barangay_name": b_name,
        "profile_picture": user.profile_picture,
        "phone": user.phone,
        "address": user.address,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "status": user.status,
        "is_verified": user.is_verified,
        "created_at": user.created_at,
        "access_token": token,
        "token_type": "bearer",
        "requires_profile_completion": False,
        "requires_otp": False
    }


@router.post("/google", response_model=LoginResponse)
def google_auth(request: GoogleAuthRequest, req: Request, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate resident via Google.
    - If user exists, is verified, and has complete profile: logs in directly.
    - If user is new or has incomplete profile: requires Profile Details form.
    - If profile is complete but unverified: requires OTP verification.
    """
    email_clean = request.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    is_new = False

    if not user:
        is_new = True
        default_name = request.name or email_clean.split('@')[0].capitalize()
        random_pass = secrets.token_urlsafe(24)
        hashed_pass = get_password_hash(random_pass)

        # Create unverified pending resident record
        user = User(
            name=default_name,
            email=email_clean,
            password=hashed_pass,
            role_id=1,  # Resident
            subdivision_id=None,
            barangay_id=None,
            phone=None,
            address=None,
            status="Active",
            is_verified=False,  # Unverified until OTP verification completes!
            profile_picture=request.profile_picture or f"https://ui-avatars.com/api/?name={default_name}&background=F97316&color=fff&bold=true"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        log_activity(
            db=db,
            action="GOOGLE_REGISTER_INITIATED",
            target_table="users",
            target_id=user.user_id,
            description=f"New resident initiated Google authentication: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=req
        )
    else:
        if user.status == "Inactive":
            log_activity(
                db=db,
                action="FAILED_LOGIN",
                target_table="auth",
                target_id=user.user_id,
                description=f"Google login blocked for inactive account: {user.name} ({user.email})",
                user_id=user.user_id,
                log_type="security",
                request=req
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account inactive. Please contact administrator.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.profile_picture and request.profile_picture:
            user.profile_picture = request.profile_picture
            db.commit()

        log_activity(
            db=db,
            action="GOOGLE_LOGIN_ATTEMPT",
            target_table="users",
            target_id=user.user_id,
            description=f"Google authentication verified for: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=req
        )

    # Check profile completion status
    profile_complete = is_resident_profile_complete(user)
    
    b_name = user.barangay.barangay_name if user.barangay else (user.subdivision.barangay.barangay_name if user.subdivision and user.subdivision.barangay else ("San Vicente" if user.role_id in [2, 3] else None))
    p_name = user.position.position_name if user.position else ("Barangay Head Officer" if user.is_head_officer else None)

    # CASE A: Existing resident, complete profile, and ALREADY VERIFIED -> Allow direct login
    if not is_new and user.is_verified and profile_complete:
        token = create_access_token({
            "sub": str(user.user_id),
            "user_id": user.user_id,
            "email": user.email,
            "role_id": user.role_id,
            "is_verified": True
        })
        refresh_token = create_refresh_token({
            "sub": str(user.user_id),
            "user_id": user.user_id,
            "email": user.email,
            "role_id": user.role_id
        })
        set_refresh_cookie(response, refresh_token)

        return {
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "role_id": user.role_id,
            "subdivision_id": user.subdivision_id,
            "barangay_id": user.barangay_id,
            "is_head_officer": user.is_head_officer,
            "position_id": user.position_id,
            "position_name": p_name,
            "barangay_name": b_name,
            "profile_picture": user.profile_picture,
            "phone": user.phone,
            "address": user.address,
            "latitude": user.latitude,
            "longitude": user.longitude,
            "status": user.status,
            "is_verified": True,
            "created_at": user.created_at,
            "access_token": token,
            "token_type": "bearer",
            "is_new_user": False,
            "requires_profile_completion": False,
            "requires_otp": False,
            "message": "Welcome back!"
        }

    # Generate restricted token for unverified / pending session
    token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id,
        "is_verified": False
    })

    # CASE B: Profile details missing -> Prompt user for profile completion
    if not profile_complete:
        return {
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "role_id": user.role_id,
            "subdivision_id": user.subdivision_id,
            "barangay_id": user.barangay_id,
            "is_head_officer": user.is_head_officer,
            "position_id": user.position_id,
            "position_name": p_name,
            "barangay_name": b_name,
            "profile_picture": user.profile_picture,
            "phone": user.phone,
            "address": user.address,
            "latitude": user.latitude,
            "longitude": user.longitude,
            "status": user.status,
            "is_verified": False,
            "created_at": user.created_at,
            "access_token": token,
            "token_type": "bearer",
            "is_new_user": is_new,
            "requires_profile_completion": True,
            "requires_otp": False,
            "message": "Please complete your resident registration details."
        }

    # CASE C: Profile complete but unverified -> Generate OTP and require verification
    otp_code = generate_and_record_otp(db, user, purpose="resident_verification")
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "subdivision_id": user.subdivision_id,
        "barangay_id": user.barangay_id,
        "is_head_officer": user.is_head_officer,
        "position_id": user.position_id,
        "position_name": p_name,
        "barangay_name": b_name,
        "profile_picture": user.profile_picture,
        "phone": user.phone,
        "address": user.address,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "status": user.status,
        "is_verified": False,
        "created_at": user.created_at,
        "access_token": token,
        "token_type": "bearer",
        "is_new_user": is_new,
        "requires_profile_completion": False,
        "requires_otp": True,
        "dev_otp": otp_code,
        "message": f"Verification code sent to {user.phone or user.email}."
    }


@router.post("/complete-profile", response_model=CompleteProfileResponse)
def complete_profile(request: CompleteProfileRequest, req: Request, db: Session = Depends(get_db)):
    """
    Step 2: Save resident profile details and dispatch OTP.
    """
    user = None
    if request.user_id:
        user = db.query(User).filter(User.user_id == request.user_id).first()
    elif request.email:
        user = db.query(User).filter(User.email == request.email.strip().lower()).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role_id != 1:
        raise HTTPException(status_code=403, detail="Only resident accounts require profile completion")

    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Full Name is required")
    if not request.phone or not request.phone.strip():
        raise HTTPException(status_code=400, detail="Contact number is required")
    if not request.address or not request.address.strip():
        raise HTTPException(status_code=400, detail="Street address is required")
    if not request.subdivision_id:
        raise HTTPException(status_code=400, detail="Subdivision is required")

    subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == request.subdivision_id).first()
    if not subdivision:
        raise HTTPException(status_code=400, detail="Invalid subdivision selected")

    user.name = request.name.strip()
    user.phone = request.phone.strip()
    user.address = request.address.strip()
    user.subdivision_id = subdivision.subdivision_id
    user.barangay_id = subdivision.barangay_id or 1
    if request.latitude is not None:
        user.latitude = request.latitude
    if request.longitude is not None:
        user.longitude = request.longitude

    db.commit()
    db.refresh(user)

    # Generate and record OTP code
    otp_code = generate_and_record_otp(db, user, purpose="resident_verification")

    log_activity(
        db=db,
        action="RESIDENT_PROFILE_COMPLETED",
        target_table="users",
        target_id=user.user_id,
        description=f"Resident {user.name} submitted profile details. OTP generated.",
        user_id=user.user_id,
        log_type="operation",
        request=req
    )

    return {
        "status": "otp_sent",
        "message": f"Verification code sent to {user.phone} and {user.email}",
        "user_id": user.user_id,
        "email": user.email,
        "phone": user.phone,
        "expires_in": 300,
        "dev_otp": otp_code
    }


@router.post("/verify-otp", response_model=LoginResponse)
def verify_otp(request: VerifyOtpRequest, req: Request, response: Response, db: Session = Depends(get_db)):
    """
    Step 3: Verify 6-digit OTP code, activate account, and issue verified JWT session.
    """
    user = None
    if request.user_id:
        user = db.query(User).filter(User.user_id == request.user_id).first()
    elif request.email:
        user = db.query(User).filter(User.email == request.email.strip().lower()).first()

    if not user:
        raise HTTPException(status_code=404, detail="User account not found")

    now = datetime.now()

    # Find latest active OTP verification record
    otp_record = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.is_used == False,
        OtpVerification.expires_at >= now
    ).order_by(OtpVerification.created_at.desc()).first()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired or is invalid. Please request a new code."
        )

    if otp_record.attempts >= otp_record.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts exceeded. Please request a new code."
        )

    clean_otp = request.otp.strip()
    if otp_record.otp_code != clean_otp:
        otp_record.attempts += 1
        db.commit()
        remaining = otp_record.max_attempts - otp_record.attempts
        if remaining > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Incorrect verification code. {remaining} attempt(s) remaining."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum verification attempts exceeded. Please request a new code."
            )

    # Success! Mark OTP as used and user as verified
    otp_record.is_used = True
    user.is_verified = True
    user.status = "Active"
    db.commit()
    db.refresh(user)

    # Generate full verified JWT tokens
    token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id,
        "is_verified": True
    })
    refresh_token = create_refresh_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id
    })
    set_refresh_cookie(response, refresh_token)

    log_activity(
        db=db,
        action="RESIDENT_OTP_VERIFIED",
        target_table="users",
        target_id=user.user_id,
        description=f"Resident {user.name} ({user.email}) successfully verified OTP and activated account.",
        user_id=user.user_id,
        log_type="security",
        request=req
    )

    b_name = user.barangay.barangay_name if user.barangay else (user.subdivision.barangay.barangay_name if user.subdivision and user.subdivision.barangay else ("San Vicente" if user.role_id in [2, 3] else None))
    p_name = user.position.position_name if user.position else ("Barangay Head Officer" if user.is_head_officer else None)

    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "subdivision_id": user.subdivision_id,
        "barangay_id": user.barangay_id,
        "is_head_officer": user.is_head_officer,
        "position_id": user.position_id,
        "position_name": p_name,
        "barangay_name": b_name,
        "profile_picture": user.profile_picture,
        "phone": user.phone,
        "address": user.address,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "status": user.status,
        "is_verified": True,
        "created_at": user.created_at,
        "access_token": token,
        "token_type": "bearer",
        "is_new_user": False,
        "requires_profile_completion": False,
        "requires_otp": False,
        "message": "Account successfully verified! Welcome to StraySafe."
    }


@router.post("/resend-otp", response_model=CompleteProfileResponse)
def resend_otp(request: ResendOtpRequest, req: Request, db: Session = Depends(get_db)):
    """
    Resend 6-digit OTP code with 30-second cooldown check.
    """
    user = None
    if request.user_id:
        user = db.query(User).filter(User.user_id == request.user_id).first()
    elif request.email:
        user = db.query(User).filter(User.email == request.email.strip().lower()).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now()

    # Check cooldown (30 seconds)
    recent_otp = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id
    ).order_by(OtpVerification.created_at.desc()).first()

    if recent_otp and recent_otp.created_at:
        seconds_since = (now - recent_otp.created_at).total_seconds()
        if seconds_since < 30:
            wait_sec = int(30 - seconds_since)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait_sec} seconds before requesting a new verification code."
            )

    otp_code = generate_and_record_otp(db, user, purpose="resident_verification")

    log_activity(
        db=db,
        action="RESEND_OTP",
        target_table="users",
        target_id=user.user_id,
        description=f"New OTP code requested and generated for {user.name} ({user.email}).",
        user_id=user.user_id,
        log_type="security",
        request=req
    )

    return {
        "status": "otp_resent",
        "message": f"New verification code sent to {user.phone or user.email}",
        "user_id": user.user_id,
        "email": user.email,
        "phone": user.phone,
        "expires_in": 300,
        "dev_otp": otp_code
    }


@router.get("/verify-session")
def verify_session(current_user: User = Depends(get_current_user)):
    b_name = current_user.barangay.barangay_name if current_user.barangay else (current_user.subdivision.barangay.barangay_name if current_user.subdivision and current_user.subdivision.barangay else ("San Vicente" if current_user.role_id in [2, 3] else None))
    p_name = current_user.position.position_name if current_user.position else ("Barangay Head Officer" if current_user.is_head_officer else None)

    profile_complete = is_resident_profile_complete(current_user) if current_user.role_id == 1 else True

    return {
        "status": "valid",
        "user_id": current_user.user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role_id": current_user.role_id,
        "subdivision_id": current_user.subdivision_id,
        "barangay_id": current_user.barangay_id,
        "is_head_officer": current_user.is_head_officer,
        "position_name": p_name,
        "barangay_name": b_name,
        "profile_picture": current_user.profile_picture,
        "status_account": current_user.status,
        "is_verified": current_user.is_verified,
        "is_profile_complete": profile_complete
    }


@router.get("/verify-session/{user_id}")
def verify_session_by_id(
    user_id: int,
    current_user: User = Depends(get_current_user)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session user mismatch"
        )
    return {
        "status": "valid",
        "user_id": current_user.user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role_id": current_user.role_id,
        "is_head_officer": current_user.is_head_officer,
        "is_verified": current_user.is_verified
    }


@router.get("/me", response_model=UserPublicResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/refresh")
def refresh_session_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Exchange a valid 7-day refresh token stored in httpOnly cookie for a new 60-min access token.
    Rotates the refresh token cookie upon successful verification.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_refresh_token(token)
    if not payload or not payload.get("user_id"):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify refresh token jti has not been revoked
    jti = payload.get("jti")
    if jti and is_token_revoked(db, jti):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.user_id == payload["user_id"]).first()
    if not user:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status == "Inactive":
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive. Please contact the administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Blacklist previous refresh token upon rotation
    if jti:
        revoke_token(db, payload, token_type="refresh")

    # Generate fresh 60-minute access token and rotated 7-day refresh token
    new_access_token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id,
        "is_verified": user.is_verified
    })
    new_refresh_token = create_refresh_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id
    })
    set_refresh_cookie(response, new_refresh_token)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Server-side logout: revokes the active access token and refresh token,
    clears the refresh cookie, and logs the logout event.
    """
    user_id_logged = None

    # 1. Revoke access token if provided in Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        access_token_str = auth_header.split(" ")[1]
        payload = decode_access_token(access_token_str)
        if payload and payload.get("jti"):
            user_id_logged = payload.get("user_id")
            revoke_token(db, payload, token_type="access")

    # 2. Revoke refresh token if present in cookies
    refresh_token_str = request.cookies.get("refresh_token")
    if refresh_token_str:
        rt_payload = decode_refresh_token(refresh_token_str)
        if rt_payload and rt_payload.get("jti"):
            user_id_logged = user_id_logged or rt_payload.get("user_id")
            revoke_token(db, rt_payload, token_type="refresh")

    # 3. Clear refresh token cookie
    clear_refresh_cookie(response)

    # 4. Record audit log
    if user_id_logged:
        try:
            log_activity(
                db=db,
                action="LOGOUT",
                target_table="users",
                target_id=int(user_id_logged),
                description="User logged out and session tokens were revoked",
                user_id=int(user_id_logged),
                log_type="security",
                request=request
            )
        except Exception:
            pass

    return {"message": "Logged out successfully"}
