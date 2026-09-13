from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, GoogleAuthRequest, UserPublicResponse
from app.utils.auth import verify_password, create_access_token, get_current_user
from app.utils.audit import log_activity
from app.limiter import limiter

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(request: Request, login_request: LoginRequest, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(User).filter(User.email == login_request.email).first()
    
    if not user:
        # Log failed login — unknown user
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
    
    # Generate JWT token
    token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id
    })

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
    
    # Get location and position names
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
        "token_type": "bearer"
    }

@router.get("/verify-session")
def verify_session(current_user: User = Depends(get_current_user)):
    b_name = current_user.barangay.barangay_name if current_user.barangay else (current_user.subdivision.barangay.barangay_name if current_user.subdivision and current_user.subdivision.barangay else ("San Vicente" if current_user.role_id in [2, 3] else None))
    p_name = current_user.position.position_name if current_user.position else ("Barangay Head Officer" if current_user.is_head_officer else None)

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
        "status_account": current_user.status
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
        "is_head_officer": current_user.is_head_officer
    }

@router.get("/me", response_model=UserPublicResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/google", response_model=LoginResponse)
def google_auth(request: GoogleAuthRequest, req: Request, db: Session = Depends(get_db)):
    import secrets
    from app.utils.auth import get_password_hash

    email_clean = request.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user:
        # Create new resident user via Google
        default_name = request.name or email_clean.split('@')[0].capitalize()
        random_pass = secrets.token_urlsafe(24)
        hashed_pass = get_password_hash(random_pass)

        user = User(
            name=default_name,
            email=email_clean,
            password=hashed_pass,
            role_id=1,  # Resident
            subdivision_id=1,  # Selera Homes
            barangay_id=1,
            status="Active",
            is_verified=True,
            profile_picture=request.profile_picture or None
        )
        db.add(user)
        db.flush()

        log_activity(
            db=db,
            action="GOOGLE_REGISTER",
            target_table="users",
            target_id=user.user_id,
            description=f"New resident registered via Google: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=req
        )
    else:
        # Check active status
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

        log_activity(
            db=db,
            action="GOOGLE_LOGIN",
            target_table="users",
            target_id=user.user_id,
            description=f"Successful Google login: {user.name} ({user.email})",
            user_id=user.user_id,
            log_type="security",
            request=req
        )

    db.commit()
    db.refresh(user)

    # Generate JWT token
    token = create_access_token({
        "sub": str(user.user_id),
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id
    })

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
        "token_type": "bearer"
    }

