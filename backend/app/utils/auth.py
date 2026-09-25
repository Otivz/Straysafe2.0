import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database import get_db
from app.models.user import User, Subdivision
from app.models.revoked_token import RevokedToken

# Load environment variables from the project root if needed
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), '.env')
load_dotenv(dotenv_path=env_path)

SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY or SECRET_KEY environment variable is required and must not be empty.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer(auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password using bcrypt.
    """
    try:
        password_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt.
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)
    return hashed_bytes.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate a signed JWT access token with 60-minute default validity.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
        "token_type": "access"
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate a signed JWT refresh token with 7-day default validity.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
        "token_type": "refresh"
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT access token.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("token_type") == "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def decode_refresh_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT refresh token.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("token_type") != "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None

def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    Store refresh token in an httpOnly, SameSite=Lax cookie with 7-day expiration.
    """
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/"
    )

def clear_refresh_cookie(response: Response) -> None:
    """
    Clear refresh token cookie.
    """
    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        samesite="lax"
    )

def is_token_revoked(db: Session, jti: str) -> bool:
    """
    Check if a token's jti is present in the revoked_tokens blacklist.
    """
    if not jti:
        return False
    revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
    return revoked is not None

def revoke_token(db: Session, payload: dict, token_type: str = "access") -> Optional[RevokedToken]:
    """
    Insert a token's jti into the revoked_tokens blacklist.
    """
    jti = payload.get("jti")
    if not jti:
        return None

    existing = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
    if existing:
        return existing

    exp = payload.get("exp")
    if exp:
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
    else:
        expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    raw_user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(raw_user_id) if raw_user_id is not None else None
    except (ValueError, TypeError):
        user_id = None

    revoked = RevokedToken(
        jti=jti,
        token_type=token_type,
        user_id=user_id,
        expires_at=expires_at
    )
    db.add(revoked)
    try:
        db.commit()
    except Exception:
        db.rollback()
    return revoked

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Extract JWT token from Authorization header, decode it, and return DB User.
    """
    token = None
    if credentials:
        token = credentials.credentials
    else:
        # Check raw Authorization header fallback
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token jti is not revoked
    jti = payload.get("jti")
    if jti and is_token_revoked(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status == "Inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive. Please contact the administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

def get_current_resident(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Ensure current user has the Resident/Citizen role (role_id = 1).
    """
    if current_user.role_id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Resident role required"
        )
    return current_user

def get_current_staff_or_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Ensure current user is Subdivision Leader (2), Barangay Staff (3), or Admin (4).
    """
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Staff or Admin role required"
        )
    return current_user


def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Ensure current user has the System Administrator role (role_id = 4).
    """
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin role required"
        )
    return current_user


def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Extract optional authenticated user without raising 401 on missing or invalid token.
    """
    token = None
    if credentials:
        token = credentials.credentials
    else:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        return None

    try:
        return db.query(User).filter(User.user_id == int(user_id)).first()
    except Exception:
        return None


def verify_subdivision_scope(
    current_user: User,
    resource_subdivision_id: Optional[int],
    resource_owner_id: Optional[int] = None,
    db: Optional[Session] = None,
    resource_barangay_id: Optional[int] = None,
    raise_exception: bool = True
) -> bool:
    """
    Enforce multi-tenant scoping and IDOR prevention across user roles.

    Rules:
    - Admin (role_id == 4): Full system-wide access.
    - Barangay Staff (role_id == 3): Full access within their barangay.
    - Subdivision Leader (role_id == 2): Access only within their assigned subdivision.
    - Citizen / Resident (role_id == 1): Access denied unless they are the explicit resource owner.
    """
    # 1. Admin (role_id == 4) has unrestricted access
    if current_user.role_id == 4:
        return True

    # 2. Barangay Staff (role_id == 3): Full access within barangay
    if current_user.role_id == 3:
        if resource_barangay_id is not None and current_user.barangay_id is not None:
            if current_user.barangay_id != resource_barangay_id:
                if raise_exception:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access forbidden: You do not have permission to access resources outside your barangay."
                    )
                return False

        if (
            resource_barangay_id is None
            and resource_subdivision_id is not None
            and current_user.barangay_id is not None
            and db is not None
        ):
            subd = db.query(Subdivision).filter(Subdivision.subdivision_id == resource_subdivision_id).first()
            if subd and subd.barangay_id != current_user.barangay_id:
                if raise_exception:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access forbidden: You do not have permission to access resources outside your barangay."
                    )
                return False

        return True

    # 3. Subdivision Leader (role_id == 2): Must match current_user.subdivision_id == resource_subdivision_id
    if current_user.role_id == 2:
        if (
            not current_user.subdivision_id
            or resource_subdivision_id is None
            or current_user.subdivision_id != resource_subdivision_id
        ):
            if raise_exception:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: Subdivision leaders may only access resources within their assigned subdivision."
                )
            return False
        return True

    # 4. Citizen / Resident (role_id == 1): Access denied unless explicit resource owner
    if current_user.role_id == 1:
        if resource_owner_id is not None and current_user.user_id == resource_owner_id:
            return True
        if raise_exception:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Resident access is restricted to owned resources."
            )
        return False

    # Any other unrecognized role
    if raise_exception:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Insufficient permissions."
        )
    return False

