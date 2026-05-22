from passlib.context import CryptContext

# Use bcrypt scheme via passlib (compatible with all bcrypt versions)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password using bcrypt.
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt.
    """
    return pwd_context.hash(password)
