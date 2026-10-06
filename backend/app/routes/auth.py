import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import func
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
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyResetCodeRequest,
    ChangePasswordRequest,
    AdminLoginCodeRequest,
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
    get_pending_user,
    token_predates_password_change,
)
from app.utils.audit import log_activity
from app.utils.mailer import send_admin_login_code_email, send_otp_email, send_password_reset_email
from app.utils.password_policy import enforce_password_policy
from app.utils.password_codes import (
    LOGIN_PURPOSE,
    NON_VERIFICATION_PURPOSES,
    PASSWORD_CODE_PURPOSES,
    RESET_CODE_MINUTES,
    RESET_PURPOSE,
    create_password_code,
)
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


RESET_RESEND_SECONDS = 30


def generate_and_record_otp(db: Session, user: User, purpose: str = "resident_registration") -> str:
    """Generate a 6-digit cryptographic OTP, invalidate older codes, and record in DB."""
    # Invalidate existing unused verification codes for this user (password-reset codes are separate)
    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.is_used == False,
        OtpVerification.purpose.notin_(NON_VERIFICATION_PURPOSES),
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


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}{'*' * max(len(local) - len(shown), 1)}@{domain}"


def otp_debug_enabled() -> bool:
    # Only for local testing without SMTP: puts the code in the API response. Never enable on a real server.
    return os.getenv("OTP_DEBUG", "false").strip().lower() in ("1", "true", "yes")


def issue_otp(db: Session, user: User) -> dict:
    """Create a fresh code, email it, and return the response fields describing what happened."""
    code = generate_and_record_otp(db, user, purpose="resident_verification")
    sent = send_otp_email(user.email, user.name, code)
    if sent:
        message = f"Verification code sent to {mask_email(user.email)}."
    else:
        message = "We couldn't send the verification email right now. Tap Resend Code in a moment."
    return {"message": message, "email_sent": sent, "dev_otp": code if otp_debug_enabled() else None}


def verify_google_credential(credential: str) -> dict:
    """Check the Google ID token's signature, audience, issuer and expiry; never trust browser-sent profile data."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not set up on the server yet.")
    try:
        info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id, clock_skew_in_seconds=10
        )
    except TransportError:
        raise HTTPException(status_code=503, detail="Couldn't reach Google to check your sign-in. Check the server's internet connection.")
    except (ValueError, GoogleAuthError):
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified. Please try again.")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Your Google account's email address is not verified.")
    return info


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


LOGIN_CODE_MINUTES = 10


def admin_login_2fa_enabled() -> bool:
    return os.getenv("ADMIN_LOGIN_2FA", "false").strip().lower() in ("1", "true", "yes")


def start_admin_login_code(request: Request, db: Session, user: User) -> dict:
    """Password was correct: email a one-time code and hand back no session until it's entered."""
    code = create_password_code(db, user, LOGIN_PURPOSE, LOGIN_CODE_MINUTES)
    if not send_admin_login_code_email(user.email, user.name, code, LOGIN_CODE_MINUTES):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't email your sign-in code right now. Please try again in a moment.",
        )
    log_activity(
        db=db,
        action="ADMIN_LOGIN_CODE_SENT",
        target_table="auth",
        target_id=user.user_id,
        description=f"Sign-in code emailed to administrator {user.email}.",
        user_id=user.user_id,
        log_type="security",
        request=request
    )
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "requires_login_code": True,
        "expires_in": LOGIN_CODE_MINUTES * 60,
        "message": f"We emailed a 6-digit sign-in code to {mask_email(user.email)}.",
    }


def finish_login(request: Request, response: Response, db: Session, user: User) -> dict:
    """Everything that happens once someone is fully authenticated: tokens, cookie, audit log, response body."""
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

    user.last_login = datetime.now()
    db.commit()

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
            otp_info = issue_otp(db, user)
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
                **otp_info,
            }

    # Administrators can be required to enter an emailed code after the password (ADMIN_LOGIN_2FA=true)
    if user.role_id == 4 and admin_login_2fa_enabled():
        return start_admin_login_code(request, db, user)

    return finish_login(request, response, db, user)


@router.post("/admin/verify-login", response_model=LoginResponse)
@limiter.limit("10/minute")
def admin_verify_login(request: Request, payload: AdminLoginCodeRequest, response: Response, db: Session = Depends(get_db)):
    """Second step of an administrator sign-in: the code that was emailed after the password was accepted."""
    invalid_code = HTTPException(status_code=400, detail="That code is invalid or has expired. Please sign in again.")
    user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()
    if not user or user.role_id != 4 or user.status == "Inactive":
        raise invalid_code

    candidates = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose == LOGIN_PURPOSE,
        OtpVerification.is_used == False,
        OtpVerification.expires_at >= datetime.now(),
    ).all()
    candidates = [c for c in candidates if c.attempts < c.max_attempts]
    if not candidates:
        raise invalid_code

    entered = payload.otp.strip()
    if not any(secrets.compare_digest(c.otp_code, entered) for c in candidates):
        for c in candidates:
            c.attempts += 1
        db.commit()
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            target_id=user.user_id,
            description=f"Wrong administrator sign-in code entered for {user.email}.",
            user_id=user.user_id,
            log_type="security",
            request=request
        )
        raise invalid_code

    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose == LOGIN_PURPOSE,
        OtpVerification.is_used == False,
    ).update({"is_used": True})
    db.commit()
    return finish_login(request, response, db, user)


@router.post("/google", response_model=LoginResponse)
@limiter.limit("10/minute")
def google_auth(request: Request, payload: GoogleAuthRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate a resident with a Google ID token (from Google Identity Services).
    - If user exists, is verified, and has complete profile: logs in directly.
    - If user is new or has incomplete profile: requires Profile Details form.
    - If profile is complete but unverified: requires OTP verification.
    """
    info = verify_google_credential(payload.credential)
    email_clean = info["email"].strip().lower()
    google_name = (info.get("name") or "").strip()
    google_picture = info.get("picture")
    user = db.query(User).filter(User.email == email_clean).first()
    is_new = False

    if not user:
        is_new = True
        default_name = google_name or email_clean.split('@')[0].capitalize()
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
            profile_picture=google_picture or f"https://ui-avatars.com/api/?name={default_name}&background=F97316&color=fff&bold=true"
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
            request=request
        )
    else:
        if user.role_id != 1:
            log_activity(
                db=db,
                action="FAILED_LOGIN",
                target_table="auth",
                target_id=user.user_id,
                description=f"Google sign-in refused for non-resident account: {user.name} ({user.email})",
                user_id=user.user_id,
                log_type="security",
                request=request
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This Google account belongs to a staff or admin account. Please use the staff or admin login.",
            )

        if user.status == "Inactive":
            log_activity(
                db=db,
                action="FAILED_LOGIN",
                target_table="auth",
                target_id=user.user_id,
                description=f"Google login blocked for inactive account: {user.name} ({user.email})",
                user_id=user.user_id,
                log_type="security",
                request=request
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account inactive. Please contact administrator.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.profile_picture and google_picture:
            user.profile_picture = google_picture
            db.commit()

        log_activity(
            db=db,
            action="GOOGLE_LOGIN_ATTEMPT",
            target_table="users",
            target_id=user.user_id,
            description=f"Google authentication verified for: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=request
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
    otp_info = issue_otp(db, user)
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
        **otp_info,
    }


@router.post("/complete-profile", response_model=CompleteProfileResponse)
@limiter.limit("10/minute")
def complete_profile(
    request: Request,
    payload: CompleteProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_pending_user),
):
    """
    Step 2: Save resident profile details and dispatch OTP.
    Uses the pending session from login / Google sign-in, so nobody can edit another person's profile.
    """
    if user.role_id != 1:
        raise HTTPException(status_code=403, detail="Only resident accounts require profile completion")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="This account is already verified. Edit your details from your profile page.")

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Full Name is required")
    if not payload.phone or not payload.phone.strip():
        raise HTTPException(status_code=400, detail="Contact number is required")
    if not payload.address or not payload.address.strip():
        raise HTTPException(status_code=400, detail="Street address is required")
    if not payload.subdivision_id:
        raise HTTPException(status_code=400, detail="Subdivision is required")

    subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == payload.subdivision_id).first()
    if not subdivision:
        raise HTTPException(status_code=400, detail="Invalid subdivision selected")

    user.name = payload.name.strip()
    user.phone = payload.phone.strip()
    user.address = payload.address.strip()
    user.subdivision_id = subdivision.subdivision_id
    user.barangay_id = subdivision.barangay_id or 1
    if payload.latitude is not None:
        user.latitude = payload.latitude
    if payload.longitude is not None:
        user.longitude = payload.longitude

    db.commit()
    db.refresh(user)

    otp_info = issue_otp(db, user)

    log_activity(
        db=db,
        action="RESIDENT_PROFILE_COMPLETED",
        target_table="users",
        target_id=user.user_id,
        description=f"Resident {user.name} submitted profile details. OTP generated.",
        user_id=user.user_id,
        log_type="operation",
        request=request
    )

    return {
        "status": "otp_sent",
        "user_id": user.user_id,
        "email": user.email,
        "phone": user.phone,
        "expires_in": 300,
        **otp_info,
    }


@router.post("/verify-otp", response_model=LoginResponse)
@limiter.limit("10/minute")
def verify_otp(
    request: Request,
    payload: VerifyOtpRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_pending_user),
):
    """
    Step 3: Verify 6-digit OTP code, activate account, and issue verified JWT session.
    Bound to the pending session, so a code can't be guessed for someone else's account by user_id.
    """
    if user.is_verified:
        raise HTTPException(status_code=400, detail="This account is already verified. Please sign in.")

    now = datetime.now()

    # Find latest active OTP verification record
    otp_record = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.is_used == False,
        OtpVerification.purpose.notin_(NON_VERIFICATION_PURPOSES),
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

    clean_otp = payload.otp.strip()
    if not secrets.compare_digest(otp_record.otp_code, clean_otp):
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
@limiter.limit("5/minute")
def resend_otp(
    request: Request,
    payload: Optional[ResendOtpRequest] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_pending_user),
):
    """
    Resend 6-digit OTP code with 30-second cooldown check.
    """
    if user.is_verified:
        raise HTTPException(status_code=400, detail="This account is already verified. Please sign in.")

    now = datetime.now()

    # Check cooldown (30 seconds)
    recent_otp = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose.notin_(NON_VERIFICATION_PURPOSES),
    ).order_by(OtpVerification.created_at.desc()).first()

    if recent_otp and recent_otp.created_at:
        seconds_since = (now - recent_otp.created_at).total_seconds()
        if seconds_since < 30:
            wait_sec = int(30 - seconds_since)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait_sec} seconds before requesting a new verification code."
            )

    otp_info = issue_otp(db, user)

    log_activity(
        db=db,
        action="RESEND_OTP",
        target_table="users",
        target_id=user.user_id,
        description=f"New OTP code requested and generated for {user.name} ({user.email}).",
        user_id=user.user_id,
        log_type="security",
        request=request
    )

    return {
        "status": "otp_resent",
        "user_id": user.user_id,
        "email": user.email,
        "phone": user.phone,
        "expires_in": 300,
        **otp_info,
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Email a 6-digit reset code. The answer is identical whether or not the email is registered,
    and the email is sent in the background so response time doesn't give it away either.
    """
    generic = {"message": f"If that email is registered, we've sent a 6-digit reset code. It expires in {RESET_CODE_MINUTES} minutes."}
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if not user or user.status == "Inactive":
        return generic

    now = datetime.now()
    recent = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose == RESET_PURPOSE,
        OtpVerification.created_at >= now - timedelta(seconds=RESET_RESEND_SECONDS),
    ).first()
    if recent:
        return generic

    code = create_password_code(db, user, RESET_PURPOSE, RESET_CODE_MINUTES)

    log_activity(
        db=db,
        action="PASSWORD_RESET_REQUESTED",
        target_table="users",
        target_id=user.user_id,
        description=f"Password reset code requested for {user.email}.",
        user_id=user.user_id,
        log_type="security",
        request=request,
    )
    background_tasks.add_task(send_password_reset_email, user.email, user.name, code, RESET_CODE_MINUTES)
    return generic


def _user_for_valid_password_code(db: Session, email: str, otp: str) -> User:
    """Return the user if `otp` is a live reset/invite code for them. Every failure gives the same error,
    and a wrong guess counts against the code's 5 attempts."""
    invalid_code = HTTPException(status_code=400, detail="That code is invalid or has expired. Request a new one.")
    user = db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
    if not user or user.status == "Inactive":
        raise invalid_code

    # A person can hold both an admin invite code and a forgot-password code; either one may be used.
    candidates = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose.in_(PASSWORD_CODE_PURPOSES),
        OtpVerification.is_used == False,
        OtpVerification.expires_at >= datetime.now(),
    ).all()
    candidates = [c for c in candidates if c.attempts < c.max_attempts]
    if not candidates:
        raise invalid_code

    entered = otp.strip()
    if not any(secrets.compare_digest(c.otp_code, entered) for c in candidates):
        for c in candidates:
            c.attempts += 1
        db.commit()
        raise invalid_code
    return user


@router.post("/verify-reset-code")
@limiter.limit("10/minute")
def verify_reset_code(request: Request, payload: VerifyResetCodeRequest, db: Session = Depends(get_db)):
    """Check the emailed code without using it up, so the page can move on to the new-password step."""
    _user_for_valid_password_code(db, payload.email, payload.otp)
    return {"valid": True}


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using the emailed code. Every failure about the code gives the same message."""
    enforce_password_policy(payload.new_password)

    user = _user_for_valid_password_code(db, payload.email, payload.otp)

    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose.in_(PASSWORD_CODE_PURPOSES),
        OtpVerification.is_used == False,
    ).update({"is_used": True})
    user.password = get_password_hash(payload.new_password)
    user.password_changed_at = datetime.now()
    db.commit()

    log_activity(
        db=db,
        action="PASSWORD_RESET",
        target_table="users",
        target_id=user.user_id,
        description=f"Password reset completed for {user.email}.",
        user_id=user.user_id,
        log_type="security",
        request=request,
    )
    return {"message": "Your password has been updated. You can now sign in."}


@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change your own password. Requires the current one, so a borrowed or unlocked session can't take over the account."""
    if not verify_password(payload.current_password, current_user.password):
        log_activity(
            db=db,
            action="FAILED_PASSWORD_CHANGE",
            target_table="users",
            target_id=current_user.user_id,
            description=f"Wrong current password entered while changing the password for {current_user.email}.",
            user_id=current_user.user_id,
            log_type="security",
            request=request,
        )
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Your new password must be different from your current one.")
    enforce_password_policy(payload.new_password)

    current_user.password = get_password_hash(payload.new_password)
    current_user.password_changed_at = datetime.now()
    db.commit()

    log_activity(
        db=db,
        action="PASSWORD_CHANGED",
        target_table="users",
        target_id=current_user.user_id,
        description=f"{current_user.email} changed their password.",
        user_id=current_user.user_id,
        log_type="security",
        request=request,
    )
    return {"message": "Your password has been updated. For your security you've been signed out everywhere, so please sign in again."}


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

    if token_predates_password_change(payload, user):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your password was changed. Please sign in again.",
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
