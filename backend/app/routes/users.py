from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
import os
import secrets
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User, Barangay, Position, Subdivision, Role
from app.schemas.user import UserCreate, AdminUserCreate, UserUpdate, UserResponse, PositionResponse
from app.utils.auth import get_password_hash, get_current_user, get_optional_user
from app.utils.mailer import send_account_invite_email
from app.utils.password_policy import enforce_password_policy
from app.utils.password_codes import INVITE_CODE_HOURS, INVITE_PURPOSE, create_password_code, pending_invite_user_ids
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.uploads import read_and_validate_upload
from app.utils.audit import log_activity
from app.limiter import limiter

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

def _populate_user_fields(user: Optional[User]) -> Optional[User]:
    if not user:
        return None
    if user.barangay:
        user.barangay_name = user.barangay.barangay_name  # type: ignore[attr-defined]
    elif user.subdivision and user.subdivision.barangay:
        user.barangay_name = user.subdivision.barangay.barangay_name  # type: ignore[attr-defined]
    else:
        user.barangay_name = "San Vicente" if user.role_id in [2, 3] else None  # type: ignore[attr-defined]

    if user.position:
        user.position_name = user.position.position_name  # type: ignore[attr-defined]
    elif user.is_head_officer:
        user.position_name = "Barangay Head Officer"  # type: ignore[attr-defined]
    else:
        user.position_name = None  # type: ignore[attr-defined]

    if user.subdivision:
        user.subdivision_name = user.subdivision.subdivision_name  # type: ignore[attr-defined]
    else:
        user.subdivision_name = None  # type: ignore[attr-defined]

    if user.role:
        user.role_name = user.role.role_name  # type: ignore[attr-defined]
    else:
        user.role_name = None  # type: ignore[attr-defined]

    return user

ROLE_LABELS = {1: "Resident", 2: "Subdivision Leader", 3: "Barangay Staff", 4: "Administrator"}
LOGIN_PATHS = {1: "/login", 2: "/staff/login", 3: "/staff/login", 4: "/admin/login"}


def _login_url(role_id: int) -> Optional[str]:
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    return f"{base}{LOGIN_PATHS.get(role_id, '/login')}" if base else None


def _send_invite(db: Session, user: User) -> bool:
    """Issue a fresh 72-hour setup code and email it. Returns whether the email was accepted for sending."""
    code = create_password_code(db, user, INVITE_PURPOSE, INVITE_CODE_HOURS * 60)
    return send_account_invite_email(
        user.email, user.name, ROLE_LABELS.get(user.role_id, "Member"), code, INVITE_CODE_HOURS, _login_url(user.role_id)
    )


class AssignHeadRequest(BaseModel):
    user_id: int
    position_id: Optional[int] = None

@router.get("/positions/list", response_model=List[PositionResponse])
def get_positions(db: Session = Depends(get_db)):
    """Fetch all available positions for the dropdown"""
    positions = db.query(Position).order_by(Position.position_name.asc()).all()
    return positions

@router.get("/", response_model=List[UserResponse])
def get_users(
    role_id: Optional[int] = None,
    position_id: Optional[int] = None,
    subdivision_id: Optional[int] = None,
    barangay_id: Optional[int] = None,
    is_head_officer: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only Subdivision Leaders, Barangay Staff, or System Administrators can view user accounts."
        )

    query = db.query(User)
    if current_user.role_id == 2:
        # Subdivision Leaders (e.g. assigning a pet owner) only see residents/leaders of their own subdivision
        if not current_user.subdivision_id:
            return []
        query = query.filter(
            User.subdivision_id == current_user.subdivision_id,
            User.role_id.in_([1, 2])
        )
    if role_id:
        query = query.filter(User.role_id == role_id)
    if position_id:
        query = query.filter(User.position_id == position_id)
    if subdivision_id:
        query = query.filter(User.subdivision_id == subdivision_id)
    if barangay_id:
        query = query.filter(User.barangay_id == barangay_id)
    if is_head_officer is not None:
        query = query.filter(User.is_head_officer == is_head_officer)
    
    users = query.all()
    pending = pending_invite_user_ids(db) if current_user.role_id == 4 else set()
    for u in users:
        _populate_user_fields(u)
        u.invite_pending = u.user_id in pending  # type: ignore[attr-defined]
    return users

@router.post("/barangay/{barangay_id}/assign-head", response_model=UserResponse)
def assign_barangay_head(
    barangay_id: int,
    payload: AssignHeadRequest,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators can designate Barangay Heads"
        )
    
    barangay = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first()
    if not barangay:
        raise HTTPException(status_code=404, detail="Barangay not found")

    target_user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    # Demote any existing head of this barangay
    existing_heads = db.query(User).filter(
        User.barangay_id == barangay_id,
        User.is_head_officer == True,
        User.user_id != payload.user_id
    ).all()
    for old_head in existing_heads:
        old_head.is_head_officer = False

    # Promote target user
    target_user.barangay_id = barangay_id
    target_user.is_head_officer = True
    target_user.role_id = 3  # Ensure Barangay role
    if payload.position_id:
        target_user.position_id = payload.position_id

    db.commit()
    db.refresh(target_user)

    log_activity(
        db=db,
        action="ASSIGN_BARANGAY_HEAD",
        target_table="users",
        target_id=target_user.user_id,
        description=f"Designated {target_user.name} ({target_user.email}) as Head Officer of Barangay {barangay.barangay_name}",
        log_type="security",
        new_values={"user_id": target_user.user_id, "barangay_id": barangay_id, "is_head_officer": True},
        request=req
    )

    return _populate_user_fields(target_user)

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.user_id != user_id and current_user.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot access another resident's account data"
        )
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _populate_user_fields(user)

def _resolve_position_id(db: Session, position_input: Optional[str | int]) -> Optional[int]:
    if not position_input:
        return None
    if isinstance(position_input, int):
        return position_input
    
    pos_str = position_input.strip()
    if not pos_str:
        return None
    if pos_str.isdigit():
        return int(pos_str)
        
    # Search existing positions case-insensitively
    pos = db.query(Position).filter(func.lower(Position.position_name) == pos_str.lower()).first()
    if pos:
        return pos.position_id
        
    # Create new position if it doesn't exist yet
    new_pos = Position(position_name=pos_str)
    db.add(new_pos)
    db.commit()
    db.refresh(new_pos)
    return new_pos.position_id

@router.post("/", response_model=UserResponse)
@limiter.limit("10/minute")
def create_user(
    user_in: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    creator: Optional[User] = Depends(get_optional_user)
):
    # Check if email exists
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    enforce_password_policy(user_in.password)
    hashed_password = get_password_hash(user_in.password)

    # Create user object
    user_data = user_in.model_dump()
    user_data["password"] = hashed_password
    
    # Role assignment enforcement:
    if creator and creator.role_id == 4:
        # Admin can provision users with any requested role (Admin, Barangay Staff, Leader, Citizen)
        user_data["role_id"] = user_in.role_id
        user_data["is_head_officer"] = bool(user_in.is_head_officer)
        user_data["is_verified"] = True
    elif creator and creator.role_id == 3 and creator.is_head_officer:
        # Barangay Head Officer can provision staff within their barangay
        if user_in.role_id != 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Barangay Head Officers can only provision Barangay Staff accounts (role_id=3)"
            )
        user_data["role_id"] = 3
        user_data["barangay_id"] = creator.barangay_id or user_in.barangay_id or 1
        user_data["is_head_officer"] = bool(user_in.is_head_officer)
        user_data["is_verified"] = True
    else:
        # Public self-registration strictly creates unverified Resident/Citizen accounts (role_id=1);
        # the email code sent on first login is what verifies them.
        user_data["role_id"] = 1
        user_data["is_head_officer"] = False
        user_data["is_verified"] = False
        user_data["status"] = "Active"
    
    # Resolve position string if provided
    pos_input = user_data.pop("position", None) or user_data.pop("position_name", None)
    user_data.pop("position", None)
    user_data.pop("position_name", None)
    if pos_input and not user_data.get("position_id"):
        user_data["position_id"] = _resolve_position_id(db, pos_input)

    
    try:
        db_user = User(**user_data)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        log_activity(
            db=db,
            action="CREATE_USER",
            target_table="users",
            target_id=db_user.user_id,
            description=f"Created new user account: {db_user.name} ({db_user.email}), role_id={db_user.role_id}",
            log_type="operation",
            new_values={"name": db_user.name, "email": db_user.email, "role_id": db_user.role_id, "status": db_user.status, "is_head_officer": db_user.is_head_officer},
            request=request
        )
        return _populate_user_fields(db_user)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Database integrity error. Check if subdivision ID / barangay ID and other data are correct."
        )

@router.post("/admin-create", response_model=UserResponse)
def admin_create_user(
    user_in: AdminUserCreate,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    is_admin = current_user.role_id == 4
    is_head_officer = current_user.role_id == 3 and bool(current_user.is_head_officer)
    if not (is_admin or is_head_officer):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators or Barangay Head Officers can provision staff accounts."
        )
    if is_head_officer and user_in.role_id != 3:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Barangay Head Officers can only provision Barangay Staff accounts (role_id=3)"
        )

    # Check if email exists
    if db.query(User).filter(func.lower(User.email) == user_in.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Nobody knows this password. The person sets their own with the emailed code, which also proves the email is theirs.
    hashed_password = get_password_hash(secrets.token_urlsafe(32))

    user_data = user_in.model_dump()
    user_data["email"] = user_in.email.strip().lower()
    user_data["password"] = hashed_password
    user_data["role_id"] = user_in.role_id
    user_data["is_head_officer"] = bool(user_in.is_head_officer)
    user_data["is_verified"] = True
    if is_head_officer:
        user_data["barangay_id"] = current_user.barangay_id or user_in.barangay_id or 1

    # Resolve position string if provided
    pos_input = user_data.pop("position", None) or user_data.pop("position_name", None)
    user_data.pop("position", None)
    user_data.pop("position_name", None)
    if pos_input and not user_data.get("position_id"):
        user_data["position_id"] = _resolve_position_id(db, pos_input)

    try:
        db_user = User(**user_data)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        log_activity(
            db=db,
            action="ADMIN_CREATE_USER",
            target_table="users",
            target_id=db_user.user_id,
            description=f"{'Admin' if is_admin else 'Head Officer'} {current_user.name} created user account: {db_user.name} ({db_user.email}), role_id={db_user.role_id}",
            user_id=current_user.user_id,
            log_type="security",
            new_values={
                "name": db_user.name,
                "email": db_user.email,
                "role_id": db_user.role_id,
                "status": db_user.status,
                "is_head_officer": db_user.is_head_officer,
                "subdivision_id": db_user.subdivision_id,
                "barangay_id": db_user.barangay_id,
                "position_id": db_user.position_id
            },
            request=req
        )
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Database integrity error. Check if subdivision ID / barangay ID and other data are correct."
        )

    invite_sent = _send_invite(db, db_user)
    _populate_user_fields(db_user)
    db_user.invite_pending = True  # type: ignore[attr-defined]
    db_user.invite_sent = invite_sent  # type: ignore[attr-defined]
    return db_user


@router.post("/{user_id}/resend-invite")
@limiter.limit("10/minute")
def resend_invite(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a new setup code to an account whose owner hasn't set a password yet."""
    if current_user.role_id != 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Only System Administrators can resend invites.")

    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id not in pending_invite_user_ids(db):
        raise HTTPException(
            status_code=400,
            detail="This person has already set a password. If they forgot it, they can use 'Forgot password?' on the sign-in page."
        )

    invite_sent = _send_invite(db, target)
    log_activity(
        db=db,
        action="ADMIN_RESEND_INVITE",
        target_table="users",
        target_id=target.user_id,
        description=f"Admin {current_user.name} resent the account setup email to {target.email}.",
        user_id=current_user.user_id,
        log_type="security",
        request=request
    )
    return {
        "invite_sent": invite_sent,
        "message": f"Setup email sent to {target.email}." if invite_sent else "The email couldn't be sent. Check the email settings and try again."
    }

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_admin = current_user.role_id == 4
    is_self = current_user.user_id == user_id
    is_brgy_head = bool(
        (current_user.is_head_officer or current_user.role_id == 5) and
        current_user.barangay_id and
        current_user.barangay_id == db_user.barangay_id
    )

    if not (is_admin or is_self or is_brgy_head):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot modify another user's profile"
        )
    
    old_snapshot = {"name": db_user.name, "email": db_user.email, "role_id": db_user.role_id, "status": db_user.status, "is_head_officer": db_user.is_head_officer}
    update_data = user_in.model_dump(exclude_unset=True)
    
    if "password" in update_data:
        if not update_data["password"]:
            update_data.pop("password")
        elif is_self:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use Change Password to update your own password. It asks for your current password first."
            )
        else:
            enforce_password_policy(update_data["password"])
            update_data["password"] = get_password_hash(update_data["password"])
            update_data["password_changed_at"] = datetime.now()
    
    # Resolve position string if provided
    pos_input = update_data.pop("position", None) or update_data.pop("position_name", None)
    if pos_input is not None:
        update_data["position_id"] = _resolve_position_id(db, pos_input)
    
    for field, value in update_data.items():
        setattr(db_user, field, value)
        
    try:
        db.commit()
        db.refresh(db_user)

        new_snapshot = {k: getattr(db_user, k, None) for k in old_snapshot}
        log_activity(
            db=db,
            action="UPDATE_USER",
            target_table="users",
            target_id=user_id,
            description=f"Updated user account: {db_user.name} ({db_user.email})",
            log_type="operation",
            old_values=old_snapshot,
            new_values=new_snapshot,
            request=req
        )
        return _populate_user_fields(db_user)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Database integrity error. Check if subdivision ID / barangay ID and other data are correct."
        )


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int, 
    status_in: str, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only System Admin (role_id == 4) or Barangay Head Officer (role_id == 3 and is_head_officer)
    is_admin = current_user.role_id == 4
    is_head_brgy = current_user.role_id == 3 and getattr(current_user, "is_head_officer", False)
    if not (is_admin or is_head_brgy):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators or Barangay Head Officers can change user statuses."
        )

    # Prevent deactivating the primary admin account (user_id == 1)
    if user_id == 1 and status_in.lower() in ["inactive", "deactivated", "suspended", "banned"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate the primary system administrator account."
        )

    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_status = db_user.status
    db_user.status = status_in
    db.commit()
    db.refresh(db_user)

    log_activity(
        db=db,
        action="UPDATE_STATUS",
        target_table="users",
        target_id=user_id,
        description=f"Updated status for user {db_user.name} ({db_user.email}): {old_status} → {status_in}",
        log_type="operation",
        old_values={"status": old_status},
        new_values={"status": status_in},
        request=req
    )
    return _populate_user_fields(db_user)

@router.delete("/{user_id}")
def delete_user(
    user_id: int, 
    req: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only System Admin (role_id == 4)
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators can delete user accounts."
        )

    # Prevent deleting the primary admin account (user_id == 1)
    if user_id == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the primary system administrator account."
        )

    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_snapshot = {"name": db_user.name, "email": db_user.email, "role_id": db_user.role_id, "status": db_user.status}
    try:
        db.delete(db_user)
        db.commit()

        log_activity(
            db=db,
            action="DELETE_USER",
            target_table="users",
            target_id=user_id,
            description=f"Permanently deleted user account: {user_snapshot['name']} ({user_snapshot['email']})",
            log_type="security",
            old_values=user_snapshot,
            request=req
        )
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
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.user_id != user_id and current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this user's profile picture"
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    content_bytes, unique_filename, media_type, resource_type = await read_and_validate_upload(
        file,
        allowed={'Image'}
    )

    safe_name = f"profile_{user_id}_{unique_filename}"
    try:
        file_url = upload_to_cloudinary(content_bytes, folder="profiles", filename=safe_name)
        if not file_url:
            raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
        
        user.profile_picture = file_url
        db.commit()
        db.refresh(user)

        log_activity(
            db=db,
            action="UPDATE_PROFILE_PICTURE",
            target_table="users",
            target_id=user.user_id,
            description=f"Updated profile picture for user: {user.name} ({user.email})",
            user_id=current_user.user_id,
            log_type="operation",
            request=request
        )

        return _populate_user_fields(user)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")
