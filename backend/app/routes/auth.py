from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse
from app.utils.auth import verify_password

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(request.password, str(user.password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if account is inactive
    if user.status == "Inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive. Please contact the administrator for assistance.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Access control is handled by the frontend routes based on the returned role_id
    
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "role_id": user.role_id,
        "profile_picture": user.profile_picture,
        "phone": user.phone,
        "address": user.address,
        "status": user.status,
        "is_verified": user.is_verified,
        "created_at": user.created_at
    }

@router.get("/verify-session/{user_id}")
def verify_session(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return {"status": "valid", "user_id": user.user_id}
