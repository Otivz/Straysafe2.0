from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
import os
import uuid
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.utils.auth import get_password_hash
from app.utils.cloudinary_config import upload_to_cloudinary

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/", response_model=List[UserResponse])
def get_users(
    role_id: Optional[int] = None,
    position_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role_id:
        query = query.filter(User.role_id == role_id)
    if position_id:
        query = query.filter(User.position_id == position_id)
    return query.all()

@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if email exists
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = get_password_hash(user_in.password)
    
    # Create user object
    user_data = user_in.model_dump()
    user_data["password"] = hashed_password
    
    try:
        db_user = User(**user_data)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Database integrity error. Check if subdivision ID and other data are correct."
        )

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_in: UserUpdate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_in.model_dump(exclude_unset=True)
    
    if "password" in update_data:
        update_data["password"] = get_password_hash(update_data["password"])
    
    for field, value in update_data.items():
        setattr(db_user, field, value)
        
    try:
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Database integrity error. Check if subdivision ID and other data are correct."
        )

@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(user_id: int, status_in: str, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.status = status_in
    db.commit()
    db.refresh(db_user)
    return db_user

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        db.delete(db_user)
        db.commit()
        return {"message": "User deleted successfully"}
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Cannot delete user because they have associated reports, pets, or activity logs. Please deactivate the user instead."
        )

@router.post("/{user_id}/profile-picture", response_model=UserResponse)
async def upload_profile_picture(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    safe_filename = file.filename or ""
    file_extension = os.path.splitext(safe_filename)[1]
    unique_filename = f"profile_{user_id}_{uuid.uuid4().hex[:8]}{file_extension}"

    try:
        file_content = await file.read()
        file_url = upload_to_cloudinary(file_content, unique_filename)
        
        user.profile_picture = file_url
        db.commit()
        db.refresh(user)
        return user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")
