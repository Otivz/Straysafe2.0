from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse
from app.utils.auth import verify_password, create_access_token, get_current_user
from app.utils.audit import log_activity

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, req: Request, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        # Log failed login — unknown user
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            description=f"Failed login attempt for email: {request.email} (user not found)",
            log_type="security",
            request=req
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(request.password, str(user.password)):
        log_activity(
            db=db,
            action="FAILED_LOGIN",
            target_table="auth",
            target_id=user.user_id,
            description=f"Failed login attempt for user: {user.name} ({user.email}) — wrong password",
            user_id=user.user_id,
            log_type="security",
            request=req
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
            request=req
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
        request=req
    )
    
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "subdivision_id": user.subdivision_id,
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
    return {
        "status": "valid",
        "user_id": current_user.user_id,
        "email": current_user.email,
        "name": current_user.name,
        "role_id": current_user.role_id,
        "subdivision_id": current_user.subdivision_id,
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
        "role_id": current_user.role_id
    }

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
