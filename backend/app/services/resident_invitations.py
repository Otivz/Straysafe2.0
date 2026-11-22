"""
Resident account invitations (docs/01-system/RESIDENT_RECORD_REGISTRATION.md).

Importing the official resident list creates one resident account per record, locked until the resident claims it. The claim link is
e-mailed to the address on the record. The link token is created at the moment of sending and only its SHA-256 is stored; claiming,
sending again or deactivating clears it, so a link works once and an older link stops working when a new one is sent.

Delivery is done one invitation at a time by process_pending(), run in the background after an import (never inside the upload
request). Each invitation is claimed with a conditional UPDATE, so two runners (or a double click) never send the same one twice. A
failed send is recorded as such, with a retry; nothing is shown as sent unless the mail provider accepted it.
"""
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Dict, Iterable, Optional, Sequence

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.resident_registry import (
    CLAIMED, DELIVERY_FAILED, PENDING_ACTIVATION, PENDING_DELIVERY, SENDING, SENT,
    OfficialResidentRecord, ResidentInvitation,
)
from app.models.user import Subdivision, User
from app.utils.auth import get_password_hash
from app.utils.mailer import email_configured, send_activation_invitation_email

logger = logging.getLogger(__name__)

INVITE_HOURS = 24
LEADER_RESEND_COOLDOWN_SECONDS = 60
PUBLIC_RESEND_COOLDOWN_SECONDS = 300
MAX_SENDS = 20
STALE_SENDING_MINUTES = 10
RESIDENT_ROLE_ID = 1

_UNUSABLE_HASH: Optional[str] = None


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def unusable_password_hash() -> str:
    """
    The password of an account nobody has claimed yet: the hash of a random secret that is generated here and never stored or shown.
    No one can sign in with it, and the account is also Inactive. (Hashing once keeps a 5,000-resident import fast.)
    """
    global _UNUSABLE_HASH
    if _UNUSABLE_HASH is None:
        _UNUSABLE_HASH = get_password_hash(secrets.token_urlsafe(48))
    return _UNUSABLE_HASH


def activation_link(token: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()
    while base.startswith("FRONTEND_URL="):
        base = base[len("FRONTEND_URL="):].strip()
    base = base.rstrip("/")
    if not (base.startswith("https://") or base.startswith("http://")):
        base = "http://localhost:5173"
    return f"{base}/resident-app/activate?token={token}"


def derived_status(inv: Optional[ResidentInvitation], now: Optional[datetime] = None) -> Optional[str]:
    """What the Leader sees: the stored delivery state, or 'Invitation Expired' for a sent link that ran out."""
    if inv is None:
        return None
    if inv.delivery_status == SENT and inv.expires_at is not None and inv.expires_at < (now or datetime.now()):
        return "Invitation Expired"
    return inv.delivery_status


def new_resident_user(subdivision_id: int, barangay_id: int, name: str, email: str, phone: Optional[str], block: str, lot: str) -> User:
    return User(
        name=name, email=email, password=unusable_password_hash(), phone=phone, role_id=RESIDENT_ROLE_ID,
        subdivision_id=subdivision_id, barangay_id=barangay_id or 1, address=f"Block {block}, Lot {lot}",
        status="Inactive", is_verified=False, is_head_officer=False)


def barangay_of(db: Session, subdivision_id: int) -> int:
    sub = db.get(Subdivision, subdivision_id)
    return (sub.barangay_id if sub else None) or 1


def ensure_account(db: Session, record: OfficialResidentRecord) -> User:
    """The record's account, created (locked) if the record does not have one yet. Never touches an existing account's password."""
    if record.user_id is not None:
        user = db.get(User, record.user_id)
        if user is not None:
            return user
    user = db.query(User).filter(User.email == record.email).first()
    if user is None:
        user = new_resident_user(record.subdivision_id, barangay_of(db, record.subdivision_id), record.full_name, record.email,
                                 record.contact_number, record.block_number, record.lot_number)
        db.add(user)
        db.flush()
    record.user_id = user.user_id
    return user


def _from_statuses(retry_failed: bool, resend: bool) -> Sequence[str]:
    if resend:
        return (PENDING_DELIVERY, DELIVERY_FAILED, SENT)
    return (PENDING_DELIVERY, DELIVERY_FAILED) if retry_failed else (PENDING_DELIVERY,)


def deliver(db: Session, invitation_id: int, from_statuses: Iterable[str]) -> str:
    """
    Send one invitation. Returns 'sent', 'failed' or 'skipped' (not eligible, or another runner has it). Commits.
    The send is claimed first (a conditional UPDATE); the new link replaces any earlier one the moment it is created.
    """
    now = datetime.now()
    claimed = db.execute(update(ResidentInvitation).where(
        ResidentInvitation.invitation_id == invitation_id,
        or_(ResidentInvitation.delivery_status.in_(list(from_statuses)),
            (ResidentInvitation.delivery_status == SENDING) & (ResidentInvitation.last_sent_at < now - timedelta(minutes=STALE_SENDING_MINUTES))),
    ).values(delivery_status=SENDING, last_sent_at=now)).rowcount
    db.commit()
    if claimed != 1:
        return "skipped"

    inv = db.get(ResidentInvitation, invitation_id)
    record = db.get(OfficialResidentRecord, inv.record_id) if inv else None
    if inv is None or record is None or record.registration_status != PENDING_ACTIVATION:
        if inv is not None:
            inv.delivery_status = PENDING_DELIVERY
            inv.token_hash, inv.expires_at = None, None
            db.commit()
        return "skipped"

    user = ensure_account(db, record)
    inv.user_id = user.user_id
    token = secrets.token_urlsafe(32)
    inv.token_hash = sha(token)                        # earlier link stops working here
    inv.expires_at = now + timedelta(hours=INVITE_HOURS)
    db.commit()

    sub = db.get(Subdivision, record.subdivision_id)
    sub_name = sub.subdivision_name if sub else None
    try:
        ok = bool(send_activation_invitation_email(record.email, record.full_name, activation_link(token), INVITE_HOURS, subdivision_name=sub_name))
    except Exception:                                  # a provider error is a failed delivery, not a crashed import
        logger.exception("Activation invitation could not be sent for resident record %s", record.record_id)
        ok = False
    inv.send_count = (inv.send_count or 0) + 1
    if ok:
        inv.delivery_status, inv.last_error = SENT, None
    else:
        inv.delivery_status = DELIVERY_FAILED
        inv.token_hash, inv.expires_at = None, None    # the link never reached the resident
        inv.last_error = ("Email is not configured on the server." if not email_configured()
                          else "The email provider did not accept the message. Try again later.")
    inv.last_sent_at = datetime.now()
    db.commit()
    return "sent" if ok else "failed"


def process_pending(subdivision_id: int, batch_id: Optional[int] = None, retry_failed: bool = False, limit: int = 5000) -> Dict[str, int]:
    """Background job: send the invitations still waiting (and, when asked, retry the failed ones) of a subdivision or one import."""
    counts = {"sent": 0, "failed": 0, "skipped": 0}
    db = SessionLocal()
    try:
        statuses = _from_statuses(retry_failed, resend=False)
        stale = datetime.now() - timedelta(minutes=STALE_SENDING_MINUTES)
        q = (db.query(ResidentInvitation.invitation_id).join(OfficialResidentRecord, OfficialResidentRecord.record_id == ResidentInvitation.record_id)
             .filter(OfficialResidentRecord.subdivision_id == subdivision_id,
                     OfficialResidentRecord.registration_status == PENDING_ACTIVATION,
                     or_(ResidentInvitation.delivery_status.in_(list(statuses)),
                         (ResidentInvitation.delivery_status == SENDING) & (ResidentInvitation.last_sent_at < stale))))
        if batch_id is not None:
            q = q.filter(OfficialResidentRecord.imported_batch_id == batch_id)
        ids = [i for (i,) in q.order_by(ResidentInvitation.invitation_id).limit(limit).all()]
        for invitation_id in ids:
            try:
                counts[deliver(db, invitation_id, statuses)] += 1
            except Exception:
                db.rollback()
                logger.exception("Invitation %s failed unexpectedly", invitation_id)
                counts["failed"] += 1
    finally:
        db.close()
    return counts


class ResendRefused(Exception):
    """A resend that is not allowed (wrong state, too soon, too many). The message is safe to show."""


def resend(db: Session, record: OfficialResidentRecord, cooldown_seconds: int) -> str:
    """Issue a fresh link for a record that is still Pending Activation (the old link stops working). Returns the delivery result."""
    if record.registration_status != PENDING_ACTIVATION:
        raise ResendRefused("Only a resident who has not activated the account yet can be sent an invitation.")
    inv = db.query(ResidentInvitation).filter(ResidentInvitation.record_id == record.record_id).first()
    if inv is None:
        inv = ResidentInvitation(record_id=record.record_id, user_id=record.user_id, delivery_status=PENDING_DELIVERY)
        db.add(inv)
        db.commit()
        db.refresh(inv)
    if inv.delivery_status == CLAIMED:
        raise ResendRefused("This invitation was already claimed.")
    if inv.last_sent_at and (datetime.now() - inv.last_sent_at).total_seconds() < cooldown_seconds:
        wait = int(cooldown_seconds - (datetime.now() - inv.last_sent_at).total_seconds()) + 1
        raise ResendRefused(f"An invitation was sent a moment ago. Please wait {wait} seconds before sending another.")
    if (inv.send_count or 0) >= MAX_SENDS:
        raise ResendRefused("Too many invitations were sent for this resident. Check the email address on the record.")
    return deliver(db, inv.invitation_id, _from_statuses(True, resend=True))


def invalidate(db: Session, record_id: int, status: str = PENDING_DELIVERY) -> None:
    """Make any link already sent for this record useless (details changed, record deactivated). The caller commits."""
    db.execute(update(ResidentInvitation).where(ResidentInvitation.record_id == record_id, ResidentInvitation.delivery_status != CLAIMED)
               .values(token_hash=None, expires_at=None, delivery_status=status))
