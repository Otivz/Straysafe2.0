"""
Claim a resident account (docs/01-system/RESIDENT_RECORD_REGISTRATION.md).

The Subdivision Leader's import creates the account locked (Inactive, no usable password) and e-mails a single-use link to the
address on the official record. Following that link proves the resident has the mailbox; the resident then chooses a password and the
account becomes Active. There is no public sign-up: nothing here can create an account, only unlock one that the import made.

  GET  /resident-activation/check       is this link usable? (only then does it return the name and a masked e-mail)
  POST /resident-activation/complete    choose a password -> Active (one winner if the same link is submitted twice)
  POST /resident-activation/request-link  ask for a new link by e-mail address (the same answer whether or not it is on the list)

Only a hash of the link token is stored; it is cleared the moment the link is used, replaced or cancelled.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.resident_registry import ACTIVE, CLAIMED, PENDING_ACTIVATION, SENT, OfficialResidentRecord, ResidentInvitation
from app.models.user import User
from app.services import resident_invitations as invites
from app.services.resident_registry import norm_email
from app.utils.audit import log_activity
from app.utils.auth import get_password_hash
from app.utils.password_policy import enforce_password_policy

router = APIRouter(prefix="/resident-activation", tags=["resident-activation"])

INVALID = "This activation link is not valid or was already used. Ask for a new link, or contact your Subdivision Leader."
EXPIRED = "This activation link has expired. Ask for a new link, or contact your Subdivision Leader."
REQUESTED = "If this email address is on your subdivision's resident list and the account is not activated yet, a new link is on its way."


class CompleteRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)
    password: str = Field(..., max_length=200)
    confirm_password: str = Field(..., max_length=200)


class RequestLink(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


def _mask(email: str) -> str:
    local, _, domain = email.partition("@")
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}{'*' * max(len(local) - len(shown), 1)}@{domain}"


def _open_invitation(db: Session, token: str):
    """(invitation, record, reason). reason is None when the link can be used; otherwise 'expired' or 'invalid'."""
    inv = db.query(ResidentInvitation).filter(ResidentInvitation.token_hash == invites.sha(token)).first()
    if inv is None or inv.delivery_status != SENT:
        return None, None, "invalid"
    record = db.get(OfficialResidentRecord, inv.record_id)
    if record is None or record.registration_status != PENDING_ACTIVATION:
        return None, None, "invalid"
    if inv.expires_at is None or inv.expires_at < datetime.now():
        return inv, record, "expired"
    return inv, record, None


@router.get("/check")
@limiter.limit("30/minute")
def check(request: Request, token: str = Query(..., min_length=20, max_length=200), db: Session = Depends(get_db)):
    _inv, record, reason = _open_invitation(db, token)
    if reason == "expired":
        raise HTTPException(status_code=410, detail=EXPIRED)
    if reason is not None or record is None:
        raise HTTPException(status_code=400, detail=INVALID)
    return {"valid": True, "full_name": record.full_name, "masked_email": _mask(record.email)}


@router.post("/complete")
@limiter.limit("10/minute")
def complete(request: Request, payload: CompleteRequest, db: Session = Depends(get_db)):
    """Choose a password: the invitation is claimed once, the account becomes Active, or none of it happens."""
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="The two passwords do not match.")
    enforce_password_policy(payload.password)
    inv, record, reason = _open_invitation(db, payload.token)
    if reason == "expired":
        raise HTTPException(status_code=410, detail=EXPIRED)
    if reason is not None or inv is None or record is None:
        raise HTTPException(status_code=400, detail=INVALID)
    try:
        now = datetime.now()
        # The single winner of a double submit: the link can be claimed exactly once.
        won = db.execute(update(ResidentInvitation).where(
            ResidentInvitation.invitation_id == inv.invitation_id, ResidentInvitation.token_hash == invites.sha(payload.token),
            ResidentInvitation.delivery_status == SENT, ResidentInvitation.expires_at > now,
        ).values(token_hash=None, expires_at=None, delivery_status=CLAIMED, claimed_at=now)).rowcount
        if won != 1:
            db.rollback()
            raise HTTPException(status_code=400, detail=INVALID)
        locked = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.record_id == record.record_id).with_for_update().first()
        user = db.get(User, locked.user_id) if locked is not None and locked.user_id else None
        if locked is None or locked.registration_status != PENDING_ACTIVATION or user is None or user.role_id != invites.RESIDENT_ROLE_ID:
            db.rollback()
            raise HTTPException(status_code=400, detail=INVALID)
        user.password = get_password_hash(payload.password)
        user.status = "Active"
        user.is_verified = True
        locked.registration_status = ACTIVE
        locked.registered_at = now
        log_activity(db=db, action="RESIDENT_ACCOUNT_ACTIVATED", target_table="official_resident_records", target_id=locked.record_id,
                     description=f"Resident account #{user.user_id} activated from resident record #{locked.record_id}.",
                     user_id=user.user_id, log_type="security", request=request, commit=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=INVALID)
    return {"status": "activated", "email": user.email, "message": "Your account is active. You can sign in now."}


@router.post("/request-link")
@limiter.limit("5/hour")
def request_link(request: Request, payload: RequestLink, db: Session = Depends(get_db)):
    """A new link for an unclaimed account, sent only to the address on the record. Always the same answer, so it reveals nothing."""
    email = norm_email(payload.email)
    record: Optional[OfficialResidentRecord] = db.query(OfficialResidentRecord).filter(
        OfficialResidentRecord.email == email, OfficialResidentRecord.registration_status == PENDING_ACTIVATION).first()
    if record is not None:
        try:
            result = invites.resend(db, record, invites.PUBLIC_RESEND_COOLDOWN_SECONDS)
            log_activity(db=db, action="RESIDENT_INVITATION_REQUESTED", target_table="official_resident_records", target_id=record.record_id,
                         description=f"A new activation link was requested by the resident ({result}).", log_type="security", request=request)
        except invites.ResendRefused:
            pass
    return {"message": REQUESTED}
