"""
Individual self-registration with residency verification (docs/01-system/RESIDENT_RECORD_REGISTRATION.md).

It runs beside the bulk import (routes/resident_records.py), which is unchanged.

  1. POST /resident-applications/register   a person registers (name, e-mail, contact, block, lot, password). The account is created
                                              unverified; signing in then e-mails the existing 6-digit code (routes/auth.py).
  2. POST /auth/verify-otp                    the right code proves the mailbox ONLY: the application becomes
                                              PENDING_RESIDENCY_VERIFICATION and the account stays locked (users.status 'Inactive').
  3. A Subdivision Leader (own subdivision) or an Admin reviews it here, helped by a comparison with the official resident list,
     and approves (ACTIVE: the account works) or rejects with a reason (REJECTED: still locked). Both are e-mailed and audited.
  4. A rejected applicant can correct the details and ask for another review (same account, same application).

Locked accounts are refused by the existing sign-in, token and refresh checks, so the backend, not the screen, keeps a pending or
rejected applicant away from every resident feature. The official resident list is only ever shown to reviewers.
"""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.resident_registry import (
    APP_ACTIVE, APP_PENDING_EMAIL, APP_PENDING_RESIDENCY, APP_REJECTED, APP_STATUSES, OfficialResidentRecord, ResidentApplication,
)
from app.models.user import Subdivision, User
from app.services import resident_registry as svc
from app.utils.audit import log_activity
from app.utils.auth import get_current_user, get_password_hash, verify_password
from app.utils.mailer import send_residency_approved_email, send_residency_rejected_email
from app.utils.password_policy import enforce_password_policy

router = APIRouter(prefix="/resident-applications", tags=["resident-applications"])

ROLE_RESIDENT, ROLE_LEADER, ROLE_ADMIN = 1, 2, 4
MAX_RESUBMITS = 3

PENDING_MESSAGE = ("Your email has been successfully verified. Your STRAYSAFE account is currently awaiting residency verification. "
                   "An authorized Subdivision Administrator will review your registration. You will receive a notification once your "
                   "account has been approved.")


# ------------------------------------------------------------------------------------------------ helpers
def _login_url() -> Optional[str]:
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    return f"{base}/resident-app/login" if base else None


def _validate(full_name: str, email: str, block: str, lot: str, contact: Optional[str]) -> svc.ParsedRow:
    """The same field rules as the official resident list (name, e-mail, block, lot, Philippine contact number)."""
    row = svc.ParsedRow(row_number=0, full_name=svc.norm_text(full_name), email=svc.norm_email(email), block=svc.norm_text(block),
                        lot=svc.norm_text(lot), contact=svc.norm_text(contact or ""))
    svc._check_fields(row)
    if row.result != "valid":
        raise HTTPException(status_code=400, detail=(row.reason or "Please check your details.").replace("Full Name", "Full name"))
    return row


def match_record(db: Session, app: ResidentApplication) -> dict:
    """
    A reviewer's aid: compare the application with the official resident list of its subdivision. Never decides anything.
    Match Found = same name, block and lot. Possible Match = same block and lot, or same name. No Match Found otherwise.
    """
    nk, bk, lk = svc.name_key(app.full_name), svc.place_key(app.block_number), svc.place_key(app.lot_number)
    rows = (db.query(OfficialResidentRecord)
            .filter(OfficialResidentRecord.subdivision_id == app.subdivision_id,
                    or_(OfficialResidentRecord.name_key == nk,
                        (OfficialResidentRecord.block_key == bk) & (OfficialResidentRecord.lot_key == lk)))
            .limit(10).all())

    def record(r: OfficialResidentRecord, why: str) -> dict:
        return {"record_id": r.record_id, "full_name": r.full_name, "block_number": r.block_number, "lot_number": r.lot_number,
                "email_matches": r.email == svc.norm_email(app.email), "registration_status": r.registration_status, "why": why}

    exact = [r for r in rows if r.name_key == nk and r.block_key == bk and r.lot_key == lk]
    if exact:
        return {"result": "Match Found", "candidates": [record(r, "Same name, block and lot") for r in exact]}
    partial = []
    for r in rows:
        if r.block_key == bk and r.lot_key == lk:
            partial.append(record(r, "Same block and lot, different name"))
        elif r.name_key == nk:
            partial.append(record(r, "Same name, different block or lot"))
    if partial:
        return {"result": "Possible Match", "candidates": partial}
    return {"result": "No Match Found", "candidates": []}


def _dict(app: ResidentApplication, reviewer: Optional[str] = None) -> dict:
    return {
        "application_id": app.application_id, "user_id": app.user_id, "full_name": app.full_name, "email": app.email,
        "contact_number": app.contact_number, "block_number": app.block_number, "lot_number": app.lot_number,
        "status": app.status, "email_verified": app.email_verified_at is not None,
        "email_verified_at": app.email_verified_at.isoformat() if app.email_verified_at else None,
        "registered_at": app.created_at.isoformat() if app.created_at else None,
        "reviewed_by": reviewer, "reviewed_at": app.reviewed_at.isoformat() if app.reviewed_at else None,
        "rejection_reason": app.rejection_reason, "resubmit_count": app.resubmit_count,
        "resubmitted_at": app.resubmitted_at.isoformat() if app.resubmitted_at else None,
    }


def residency_refusal(db: Session, user: User) -> Optional[dict]:
    """For routes/auth.py: why a locked self-registered account cannot sign in yet, as a structured detail (or None)."""
    app = db.query(ResidentApplication).filter(ResidentApplication.user_id == user.user_id).first()
    if app is None or app.status == APP_ACTIVE or app.status == APP_PENDING_EMAIL:
        return None
    if app.status == APP_PENDING_RESIDENCY:
        return {"code": "RESIDENCY_PENDING", "message": PENDING_MESSAGE, "status": app.status}
    return {"code": "RESIDENCY_REJECTED", "status": app.status, "reason": app.rejection_reason,
            "can_resubmit": app.resubmit_count < MAX_RESUBMITS,
            "message": "Your registration was not approved after residency verification. Correct your details and ask for another review, "
                       "or contact your Subdivision Leader.",
            "details": {"full_name": app.full_name, "contact_number": app.contact_number,
                        "block_number": app.block_number, "lot_number": app.lot_number}}


NOTIFICATION_TYPE = "resident_application"      # in-app + push to the reviewers (utils/push_categories.py); related id = application


def notify_reviewers(db: Session, app: ResidentApplication, resubmitted: bool = False) -> int:
    """
    Tell the Subdivision Leaders of the applicant's subdivision that a registration is waiting for them (in-app; push follows the
    notification automatically). Name, block and lot only: never the e-mail or phone. The caller commits. Returns how many were told.
    """
    from app.models.notification import Notification
    leaders = db.query(User.user_id).filter(User.role_id == ROLE_LEADER, User.subdivision_id == app.subdivision_id,
                                            User.status == "Active").all()
    title = "Registration resubmitted for review" if resubmitted else "New resident registration to review"
    message = (f"{app.full_name} (Block {app.block_number}, Lot {app.lot_number}) "
               + ("corrected their details and asked for another residency review." if resubmitted
                  else "verified their email and is waiting for residency verification."))
    for (leader_id,) in leaders:
        db.add(Notification(user_id=leader_id, type=NOTIFICATION_TYPE, related_id=app.application_id, title=title, message=message, is_read=False))
    return len(leaders)


def _close_reviewer_notifications(db: Session, application_id: int) -> None:
    """Once one reviewer decides, the other Leaders' notices about it are marked read (the badge then drops for everyone)."""
    from app.models.notification import Notification
    db.query(Notification).filter(Notification.type == NOTIFICATION_TYPE, Notification.related_id == application_id,
                                  Notification.is_read == False).update({"is_read": True}, synchronize_session=False)  # noqa: E712


def mark_email_verified(db: Session, user: User) -> Optional[ResidentApplication]:
    """For POST /auth/verify-otp: a self-registered applicant's e-mail is verified, the account stays locked for review."""
    app = db.query(ResidentApplication).filter(ResidentApplication.user_id == user.user_id).first()
    if app is None or app.status == APP_ACTIVE:
        return None
    if app.status == APP_PENDING_EMAIL:
        app.status = APP_PENDING_RESIDENCY
        app.email_verified_at = datetime.now()
        notify_reviewers(db, app)                  # only on this one transition, so a repeated code never notifies twice
    user.is_verified = True
    user.status = "Inactive"
    return app


def get_reviewer(current_user: User = Depends(get_current_user)) -> User:
    """A Subdivision Leader (own subdivision) or an Admin (every subdivision). Residents and everyone else get 403."""
    if current_user.role_id == ROLE_ADMIN or (current_user.role_id == ROLE_LEADER and current_user.subdivision_id):
        return current_user
    raise HTTPException(status_code=403, detail="Only a Subdivision Leader or an Admin can review resident registrations.")


def _own_application(db: Session, application_id: int, reviewer: User) -> ResidentApplication:
    q = db.query(ResidentApplication).filter(ResidentApplication.application_id == application_id)
    if reviewer.role_id != ROLE_ADMIN:
        q = q.filter(ResidentApplication.subdivision_id == reviewer.subdivision_id)
    app = q.first()
    if app is None:
        raise HTTPException(status_code=404, detail="Registration not found.")
    return app


# ------------------------------------------------------------------------------------------------ applicant (public)
class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=150)
    email: str = Field(..., min_length=3, max_length=254)
    contact_number: Optional[str] = Field(None, max_length=40)
    block_number: str = Field(..., min_length=1, max_length=30)
    lot_number: str = Field(..., min_length=1, max_length=30)
    password: str = Field(..., max_length=200)
    confirm_password: str = Field(..., max_length=200)
    subdivision_id: Optional[int] = None


@router.post("/register")
@limiter.limit("10/hour")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    """Create the applicant's account (unverified and unusable until the e-mail code and the residency review are both done)."""
    row = _validate(payload.full_name, payload.email, payload.block_number, payload.lot_number, payload.contact_number)
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="The two passwords do not match.")
    enforce_password_policy(payload.password)
    if db.query(User).filter(func.lower(User.email) == row.email).first() is not None:
        raise HTTPException(status_code=409, detail=(
            "This email is already registered. Sign in, or use Forgot password. If your Subdivision Leader created your account, "
            "use the activation link we emailed you."))
    sub = db.get(Subdivision, payload.subdivision_id) if payload.subdivision_id else db.query(Subdivision).order_by(Subdivision.subdivision_id).first()
    if sub is None:
        raise HTTPException(status_code=400, detail="Choose your subdivision.")
    try:
        user = User(name=row.full_name, email=row.email, password=get_password_hash(payload.password), phone=row.contact or None,
                    role_id=ROLE_RESIDENT, subdivision_id=sub.subdivision_id, barangay_id=sub.barangay_id or 1,
                    address=f"Block {row.block}, Lot {row.lot}", status="Active", is_verified=False, is_head_officer=False)
        db.add(user)
        db.flush()
        app = ResidentApplication(user_id=user.user_id, subdivision_id=sub.subdivision_id, full_name=row.full_name, email=row.email,
                                  contact_number=row.contact or None, block_number=row.block, lot_number=row.lot, status=APP_PENDING_EMAIL)
        db.add(app)
        log_activity(db=db, action="RESIDENT_SELF_REGISTERED", target_table="resident_applications", target_id=None,
                     description=f"Self-registration started for account #{user.user_id} (awaiting email verification).",
                     user_id=user.user_id, log_type="security", request=request, commit=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This email is already registered.")
    return {"status": APP_PENDING_EMAIL, "email": row.email,
            "message": "Account created. Verify your email with the code we send you; your residency is then reviewed before you can use StraySafe."}


class ResubmitRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., max_length=200)
    full_name: str = Field(..., min_length=1, max_length=150)
    contact_number: Optional[str] = Field(None, max_length=40)
    block_number: str = Field(..., min_length=1, max_length=30)
    lot_number: str = Field(..., min_length=1, max_length=30)


@router.post("/resubmit")
@limiter.limit("5/hour")
def resubmit(request: Request, payload: ResubmitRequest, db: Session = Depends(get_db)):
    """A rejected applicant corrects the details and asks for another review. Re-authenticated with the password; same account."""
    user = db.query(User).filter(func.lower(User.email) == svc.norm_email(payload.email)).first()
    if user is None or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    app = db.query(ResidentApplication).filter(ResidentApplication.user_id == user.user_id).first()
    if app is None or app.status != APP_REJECTED:
        raise HTTPException(status_code=409, detail="Only a registration that was not approved can be sent for another review.")
    if app.resubmit_count >= MAX_RESUBMITS:
        raise HTTPException(status_code=409, detail="This registration was already reviewed several times. Please contact your Subdivision Leader.")
    row = _validate(payload.full_name, app.email, payload.block_number, payload.lot_number, payload.contact_number)
    app.full_name, app.contact_number, app.block_number, app.lot_number = row.full_name, row.contact or None, row.block, row.lot
    user.name, user.phone, user.address = row.full_name, row.contact or None, f"Block {row.block}, Lot {row.lot}"
    app.status = APP_PENDING_RESIDENCY
    app.resubmit_count += 1
    app.resubmitted_at = datetime.now()
    notify_reviewers(db, app, resubmitted=True)
    log_activity(db=db, action="RESIDENT_REGISTRATION_RESUBMITTED", target_table="resident_applications", target_id=app.application_id,
                 description=f"Registration #{app.application_id} corrected and sent for another review.", user_id=user.user_id,
                 log_type="security", request=request, commit=False)
    db.commit()
    return {"status": app.status, "message": PENDING_MESSAGE}


# ------------------------------------------------------------------------------------------------ reviewers
@router.get("/pending-count")
def pending_count(db: Session = Depends(get_db), reviewer: User = Depends(get_reviewer)):
    """How many registrations wait for a residency decision (the sidebar badge). One COUNT; scoped like the list."""
    q = db.query(func.count(ResidentApplication.application_id)).filter(ResidentApplication.status == APP_PENDING_RESIDENCY)
    if reviewer.role_id != ROLE_ADMIN:
        q = q.filter(ResidentApplication.subdivision_id == reviewer.subdivision_id)
    return {"pending": int(q.scalar() or 0)}


@router.get("")
def list_applications(status: str = Query(APP_PENDING_RESIDENCY), q: str = Query("", max_length=100), page: int = Query(1, ge=1),
                      page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db), reviewer: User = Depends(get_reviewer)):
    if status != "all" and status not in APP_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status.")
    base = db.query(ResidentApplication)
    if reviewer.role_id != ROLE_ADMIN:
        base = base.filter(ResidentApplication.subdivision_id == reviewer.subdivision_id)
    counts = dict(base.with_entities(ResidentApplication.status, func.count()).group_by(ResidentApplication.status).all())
    query = base if status == "all" else base.filter(ResidentApplication.status == status)
    needle = q.strip().lower()
    if needle:
        like = "%" + needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.filter(or_(func.lower(ResidentApplication.full_name).like(like, escape="\\"),
                                 func.lower(ResidentApplication.email).like(like, escape="\\"),
                                 func.lower(ResidentApplication.block_number).like(like, escape="\\"),
                                 func.lower(ResidentApplication.lot_number).like(like, escape="\\")))
    total = query.count()
    rows = query.order_by(ResidentApplication.created_at.desc(), ResidentApplication.application_id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for a in rows:
        d = _dict(a)
        d["match"] = match_record(db, a)["result"]
        items.append(d)
    return {"total": total, "page": page, "page_size": page_size, "counts": {s: int(counts.get(s, 0)) for s in APP_STATUSES}, "applications": items}


@router.get("/{application_id}")
def application_detail(application_id: int, db: Session = Depends(get_db), reviewer: User = Depends(get_reviewer)):
    app = _own_application(db, application_id, reviewer)
    name = db.query(User.name).filter(User.user_id == app.reviewed_by).scalar() if app.reviewed_by else None
    return {**_dict(app, name), "match": match_record(db, app)}


@router.post("/{application_id}/approve")
@limiter.limit("120/hour")
def approve(request: Request, application_id: int, db: Session = Depends(get_db), reviewer: User = Depends(get_reviewer)):
    """Residency confirmed: the account becomes Active. Only an e-mail-verified application awaiting review can be approved."""
    app = _own_application(db, application_id, reviewer)
    if app.status != APP_PENDING_RESIDENCY:
        raise HTTPException(status_code=409, detail="Only a registration awaiting residency verification can be approved.")
    user = db.get(User, app.user_id)
    if user is None or user.role_id != ROLE_RESIDENT:
        raise HTTPException(status_code=409, detail="This registration no longer has a resident account.")
    now = datetime.now()
    app.status, app.reviewed_by, app.reviewed_at, app.rejection_reason = APP_ACTIVE, reviewer.user_id, now, None
    # Account stays Inactive until the resident logs in for the first time.
    user.status = "Active" if user.last_login is not None else "Inactive"
    user.is_verified = True
    _close_reviewer_notifications(db, app.application_id)
    log_activity(db=db, action="RESIDENT_REGISTRATION_APPROVED", target_table="resident_applications", target_id=app.application_id,
                 description=f"Residency of account #{user.user_id} approved by {reviewer.name} (#{reviewer.user_id}).",
                 user_id=reviewer.user_id, log_type="security", request=request, commit=False)
    db.commit()
    emailed = bool(send_residency_approved_email(app.email, app.full_name, _login_url()))
    return {**_dict(app, reviewer.name), "email_sent": emailed}


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=1000)


@router.post("/{application_id}/reject")
@limiter.limit("120/hour")
def reject(request: Request, application_id: int, payload: RejectRequest, db: Session = Depends(get_db), reviewer: User = Depends(get_reviewer)):
    """Residency not confirmed: the account stays locked. A reason is required and sent to the applicant."""
    app = _own_application(db, application_id, reviewer)
    if app.status != APP_PENDING_RESIDENCY:
        raise HTTPException(status_code=409, detail="Only a registration awaiting residency verification can be rejected.")
    reason = svc.norm_text(payload.reason)
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Give the applicant a reason (at least a few words).")
    user = db.get(User, app.user_id)
    now = datetime.now()
    app.status, app.reviewed_by, app.reviewed_at, app.rejection_reason = APP_REJECTED, reviewer.user_id, now, reason
    if user is not None:
        user.status = "Inactive"
    _close_reviewer_notifications(db, app.application_id)
    log_activity(db=db, action="RESIDENT_REGISTRATION_REJECTED", target_table="resident_applications", target_id=app.application_id,
                 description=f"Residency of account #{app.user_id} rejected by {reviewer.name} (#{reviewer.user_id}): {reason}",
                 user_id=reviewer.user_id, log_type="security", request=request, commit=False)
    db.commit()
    emailed = bool(send_residency_rejected_email(app.email, app.full_name, reason, _login_url()))
    return {**_dict(app, reviewer.name), "email_sent": emailed}
