import secrets
from datetime import datetime, timedelta
from typing import Set

from sqlalchemy.orm import Session

from app.models.otp import OtpVerification
from app.models.user import User

RESET_PURPOSE = "password_reset"
INVITE_PURPOSE = "account_invite"
LOGIN_PURPOSE = "admin_login"
PASSWORD_CODE_PURPOSES = (RESET_PURPOSE, INVITE_PURPOSE)
# Everything that isn't the resident email-verification code, so those never get mixed up with each other.
NON_VERIFICATION_PURPOSES = PASSWORD_CODE_PURPOSES + (LOGIN_PURPOSE,)

RESET_CODE_MINUTES = 10
INVITE_CODE_HOURS = 72


def create_password_code(db: Session, user: User, purpose: str, minutes: int) -> str:
    """Cancel this user's unused codes of the same kind, store a fresh 6-digit one, and return it."""
    now = datetime.now()
    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.user_id,
        OtpVerification.purpose == purpose,
        OtpVerification.is_used == False,  # noqa: E712
    ).update({"is_used": True})

    code = f"{secrets.randbelow(900000) + 100000}"
    db.add(OtpVerification(
        user_id=user.user_id,
        email=user.email,
        otp_code=code,
        purpose=purpose,
        is_used=False,
        attempts=0,
        max_attempts=5,
        expires_at=now + timedelta(minutes=minutes),
        created_at=now,
    ))
    db.commit()
    return code


def pending_invite_user_ids(db: Session) -> Set[int]:
    """Users who were invited by an admin and haven't set their own password yet."""
    rows = db.query(OtpVerification.user_id).filter(
        OtpVerification.purpose == INVITE_PURPOSE,
        OtpVerification.is_used == False,  # noqa: E712
    ).distinct().all()
    return {r[0] for r in rows}
