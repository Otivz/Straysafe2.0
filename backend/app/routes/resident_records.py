"""
Subdivision Leader: the official resident list and the accounts made from it (docs/01-system/RESIDENT_RECORD_REGISTRATION.md).

Upload an Excel/CSV file -> automatic validation -> preview -> one confirmation imports the valid rows, creates a locked resident
account for each, and queues its activation invitation. Residents then claim their account from the e-mailed link and choose their
own password (routes/resident_activation.py). The Leader can search the list, resend an invitation, correct details, deactivate and
reactivate. Every endpoint is for Subdivision Leaders (role 2) and is scoped to the Leader's own subdivision on the server; residents
and anyone else receive 403. No password, code or link token is ever returned here.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.audit_log import AuditLog
from app.models.resident_registry import (
    ACTIVE, DEACTIVATED, DELIVERY_FAILED, PENDING_ACTIVATION, PENDING_DELIVERY, STATUSES,
    OfficialResidentRecord, ResidentImportBatch, ResidentImportRow, ResidentInvitation,
)
from app.models.user import User
from app.services import resident_invitations as invites
from app.services import resident_registry as svc
from app.utils.audit import log_activity
from app.utils.auth import get_current_user

router = APIRouter(prefix="/resident-records", tags=["resident-records"])

ROLE_LEADER = 2


def get_current_leader(current_user: User = Depends(get_current_user)) -> User:
    """Only a Subdivision Leader who is assigned to a subdivision. Admins, staff and residents are refused."""
    if current_user.role_id != ROLE_LEADER or not current_user.subdivision_id:
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can manage the official resident records.")
    return current_user


def _batch_dict(b: ResidentImportBatch, uploader: Optional[str] = None) -> dict:
    return {
        "batch_id": b.batch_id, "filename": b.filename, "status": b.status, "uploaded_by": uploader,
        "uploaded_at": b.created_at.isoformat() if b.created_at else None,
        "confirmed_at": b.confirmed_at.isoformat() if b.confirmed_at else None,
        "total_rows": b.total_rows, "valid_rows": b.valid_rows, "duplicate_rows": b.duplicate_rows,
        "invalid_rows": b.invalid_rows, "missing_rows": b.missing_rows, "imported_rows": b.imported_rows,
        "linked_existing_rows": b.linked_existing_rows,
    }


def _record_dict(r: OfficialResidentRecord, inv: Optional[ResidentInvitation] = None) -> dict:
    return {
        "record_id": r.record_id, "full_name": r.full_name, "email": r.email, "block_number": r.block_number,
        "lot_number": r.lot_number, "contact_number": r.contact_number, "registration_status": r.registration_status,
        "has_account": r.user_id is not None, "imported_batch_id": r.imported_batch_id,
        "registered_at": r.registered_at.isoformat() if r.registered_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        # The delivery state of the activation invitation. The link itself is never returned: only its hash exists.
        "invitation_status": invites.derived_status(inv) if r.registration_status == PENDING_ACTIVATION else None,
        "invitation_sent_at": inv.last_sent_at.isoformat() if inv and inv.last_sent_at else None,
        "invitation_expires_at": inv.expires_at.isoformat() if inv and inv.expires_at else None,
        "invitation_error": inv.last_error if inv and r.registration_status == PENDING_ACTIVATION else None,
        "invitation_sends": inv.send_count if inv else 0,
    }


def _inv_of(db: Session, record_id: int) -> Optional[ResidentInvitation]:
    return db.query(ResidentInvitation).filter(ResidentInvitation.record_id == record_id).first()


def _own_batch(db: Session, batch_id: int, leader: User) -> ResidentImportBatch:
    batch = db.query(ResidentImportBatch).filter(ResidentImportBatch.batch_id == batch_id,
                                                 ResidentImportBatch.subdivision_id == leader.subdivision_id).first()
    if batch is None:
        raise HTTPException(status_code=404, detail="Import not found.")
    return batch


def _own_record(db: Session, record_id: int, leader: User) -> OfficialResidentRecord:
    rec = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.record_id == record_id,
                                                  OfficialResidentRecord.subdivision_id == leader.subdivision_id).first()
    if rec is None:
        raise HTTPException(status_code=404, detail="Resident record not found.")
    return rec


# ------------------------------------------------------------------------------------------------ template
@router.get("/template")
def download_template(format: str = Query("xlsx", pattern="^(xlsx|csv)$"), leader: User = Depends(get_current_leader)):
    """The file format the import expects (headings and one example row)."""
    if format == "csv":
        return Response(svc.template_csv(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="straysafe-resident-records-template.csv"'})
    return Response(svc.template_xlsx(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="straysafe-resident-records-template.xlsx"'})


# ------------------------------------------------------------------------------------------------ import
@router.post("/imports")
@limiter.limit("20/hour")
def upload_and_validate(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                        leader: User = Depends(get_current_leader)):
    """Read the file, validate every row, and keep the result for the preview. Nothing is created yet."""
    data = file.file.read(svc.MAX_FILE_BYTES + 1)
    try:
        table, _kind = svc.read_table(file.filename or "", data)
        parsed = svc.parse_and_validate(db, leader.subdivision_id, table)
    except svc.FileProblem as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    batch = svc.store_validation(db, leader.subdivision_id, leader.user_id, file.filename or "upload", data, parsed)
    log_activity(db=db, action="RESIDENT_RECORDS_UPLOADED", target_table="resident_import_batches", target_id=batch.batch_id,
                 description=f"Resident file '{batch.filename}' validated: {batch.valid_rows} valid of {batch.total_rows} rows.",
                 user_id=leader.user_id, log_type="operation", request=request, commit=False)
    db.commit()
    return _batch_dict(batch, leader.name)


@router.get("/imports")
def import_history(db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """Upload and import history of this subdivision, newest first."""
    rows = (db.query(ResidentImportBatch, User.name).outerjoin(User, User.user_id == ResidentImportBatch.uploaded_by)
            .filter(ResidentImportBatch.subdivision_id == leader.subdivision_id)
            .order_by(ResidentImportBatch.created_at.desc(), ResidentImportBatch.batch_id.desc()).limit(200).all())
    return [_batch_dict(b, name) for b, name in rows]


@router.get("/imports/{batch_id}")
def import_detail(batch_id: int, result: str = Query("issues", pattern="^(all|valid|issues|duplicate|invalid|missing)$"),
                  page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                  db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """The batch summary and a page of its rows: the issues (row and reason), or the valid rows that will be imported."""
    batch = _own_batch(db, batch_id, leader)
    q = db.query(ResidentImportRow).filter(ResidentImportRow.batch_id == batch_id)
    if result == "issues":
        q = q.filter(ResidentImportRow.result != "valid")
    elif result != "all":
        q = q.filter(ResidentImportRow.result == result)
    total = q.count()
    rows = q.order_by(ResidentImportRow.row_number).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "batch": _batch_dict(batch), "total": total, "page": page, "page_size": page_size,
        "rows": [{"row_number": r.row_number, "full_name": r.full_name, "email": r.email, "block_number": r.block_number,
                  "lot_number": r.lot_number, "contact_number": r.contact_number, "result": r.result, "reason": r.reason}
                 for r in rows],
    }


@router.post("/imports/{batch_id}/confirm")
@limiter.limit("20/hour")
def confirm_import(request: Request, batch_id: int, background: BackgroundTasks, db: Session = Depends(get_db),
                   leader: User = Depends(get_current_leader)):
    """
    Import the whole valid batch with one confirmation: a locked resident account is created for every valid row and its activation
    invitation is queued. The e-mails are sent in the background, not inside this request. Applied exactly once.
    """
    _own_batch(db, batch_id, leader)
    try:
        outcome = svc.confirm_import(db, batch_id, leader.subdivision_id, leader.user_id)
        log_activity(db=db, action="RESIDENT_RECORDS_IMPORTED", target_table="resident_import_batches", target_id=batch_id,
                     description=(f"Imported {outcome['imported']} resident(s): {outcome['accounts_created']} account(s) created pending activation, "
                                  f"{outcome['linked_existing']} linked to existing accounts, {outcome['skipped']} skipped."),
                     user_id=leader.user_id, log_type="operation", request=request, commit=False)
        db.commit()
    except svc.ImportConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Another change touched the resident list while importing. Nothing was imported; please confirm again.")
    if outcome["accounts_created"]:
        background.add_task(invites.process_pending, leader.subdivision_id, batch_id)
    batch = _own_batch(db, batch_id, leader)
    return {"batch": _batch_dict(batch), **outcome, "invitations_queued": outcome["accounts_created"]}


@router.post("/imports/{batch_id}/discard")
def discard_import(request: Request, batch_id: int, db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """Throw away a validated file without importing anything."""
    claimed = db.execute(update(ResidentImportBatch).where(
        ResidentImportBatch.batch_id == batch_id, ResidentImportBatch.subdivision_id == leader.subdivision_id,
        ResidentImportBatch.status == "Validated").values(status="Discarded")).rowcount
    if claimed != 1:
        db.rollback()
        _own_batch(db, batch_id, leader)                     # 404 when it is not this Leader's
        raise HTTPException(status_code=409, detail="This import was already confirmed or discarded.")
    log_activity(db=db, action="RESIDENT_RECORDS_DISCARDED", target_table="resident_import_batches", target_id=batch_id,
                 description="Resident file discarded before import.", user_id=leader.user_id, log_type="operation",
                 request=request, commit=False)
    db.commit()
    return {"batch": _batch_dict(_own_batch(db, batch_id, leader))}


# ------------------------------------------------------------------------------------------------ records
def _like(text: str) -> str:
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@router.get("")
def list_records(q: str = Query("", max_length=100), status: str = Query("all"), invitation: str = Query("all", pattern="^(all|failed)$"),
                 page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db),
                 leader: User = Depends(get_current_leader)):
    """Search by name, email, block or lot; filter by account status. Includes the status counts and the failed-invitation count."""
    if status != "all" and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status.")
    sid = leader.subdivision_id
    counts = dict(db.query(OfficialResidentRecord.registration_status, func.count()).filter(
        OfficialResidentRecord.subdivision_id == sid).group_by(OfficialResidentRecord.registration_status).all())
    failed = (db.query(func.count()).select_from(ResidentInvitation)
              .join(OfficialResidentRecord, OfficialResidentRecord.record_id == ResidentInvitation.record_id)
              .filter(OfficialResidentRecord.subdivision_id == sid, OfficialResidentRecord.registration_status == PENDING_ACTIVATION,
                      ResidentInvitation.delivery_status == DELIVERY_FAILED).scalar() or 0)
    query = (db.query(OfficialResidentRecord, ResidentInvitation)
             .outerjoin(ResidentInvitation, ResidentInvitation.record_id == OfficialResidentRecord.record_id)
             .filter(OfficialResidentRecord.subdivision_id == sid))
    if status != "all":
        query = query.filter(OfficialResidentRecord.registration_status == status)
    if invitation == "failed":
        query = query.filter(OfficialResidentRecord.registration_status == PENDING_ACTIVATION, ResidentInvitation.delivery_status == DELIVERY_FAILED)
    needle = q.strip()
    if needle:
        pattern = _like(needle.lower())
        query = query.filter(or_(
            func.lower(OfficialResidentRecord.full_name).like(pattern, escape="\\"),
            func.lower(OfficialResidentRecord.email).like(pattern, escape="\\"),
            func.lower(OfficialResidentRecord.block_number).like(pattern, escape="\\"),
            func.lower(OfficialResidentRecord.lot_number).like(pattern, escape="\\")))
    total = query.count()
    rows = (query.order_by(OfficialResidentRecord.full_name, OfficialResidentRecord.record_id)
            .offset((page - 1) * page_size).limit(page_size).all())
    return {"total": total, "page": page, "page_size": page_size, "failed_invitations": int(failed),
            "counts": {s: int(counts.get(s, 0)) for s in STATUSES}, "records": [_record_dict(r, inv) for r, inv in rows]}


@router.post("/send-invitations")
@limiter.limit("10/hour")
def send_invitations(request: Request, background: BackgroundTasks, retry_failed: bool = Query(True), db: Session = Depends(get_db),
                     leader: User = Depends(get_current_leader)):
    """Send every invitation that is still waiting and retry the failed ones. Runs in the background; the list shows each result."""
    states = [PENDING_DELIVERY, DELIVERY_FAILED] if retry_failed else [PENDING_DELIVERY]
    waiting = (db.query(func.count()).select_from(ResidentInvitation)
               .join(OfficialResidentRecord, OfficialResidentRecord.record_id == ResidentInvitation.record_id)
               .filter(OfficialResidentRecord.subdivision_id == leader.subdivision_id,
                       OfficialResidentRecord.registration_status == PENDING_ACTIVATION,
                       ResidentInvitation.delivery_status.in_(states)).scalar() or 0)
    if waiting:
        background.add_task(invites.process_pending, leader.subdivision_id, None, retry_failed)
        log_activity(db=db, action="RESIDENT_INVITATIONS_QUEUED", target_table="resident_invitations", target_id=None,
                     description=f"{waiting} resident activation invitation(s) queued for sending.", user_id=leader.user_id,
                     log_type="operation", request=request)
    return {"queued": int(waiting)}


class RecordUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=150)
    email: Optional[str] = Field(None, max_length=100)
    block_number: Optional[str] = Field(None, max_length=30)
    lot_number: Optional[str] = Field(None, max_length=30)
    contact_number: Optional[str] = Field(None, max_length=40)


@router.patch("/{record_id}")
def update_record(request: Request, record_id: int, payload: RecordUpdate, db: Session = Depends(get_db),
                  leader: User = Depends(get_current_leader)):
    """
    Correct a resident's details. Before the resident activates, the account follows the record and a changed email needs a new
    invitation. After activation the email cannot change here and the resident's own profile is not rewritten.
    """
    rec = _own_record(db, record_id, leader)
    data = payload.model_dump(exclude_unset=True)
    probe = svc.ParsedRow(row_number=0, full_name=svc.norm_text(data.get("full_name", rec.full_name)),
                          email=svc.norm_email(data.get("email", rec.email)), block=svc.norm_text(data.get("block_number", rec.block_number)),
                          lot=svc.norm_text(data.get("lot_number", rec.lot_number)),
                          contact=svc.norm_text(data["contact_number"]) if "contact_number" in data else (rec.contact_number or ""))
    svc._check_fields(probe)
    if probe.result != "valid":
        raise HTTPException(status_code=400, detail=probe.reason)
    if rec.registered_at is not None and probe.email != rec.email:
        raise HTTPException(status_code=400, detail="This resident already activated the account; the email on the record cannot be changed.")
    if (probe.email != rec.email) and db.query(User).filter(User.email == probe.email).first():
        raise HTTPException(status_code=409, detail="A StraySafe account already uses that email.")
    changed = {"full_name": probe.full_name, "email": probe.email, "block_number": probe.block, "lot_number": probe.lot}
    before = (rec.full_name, rec.email, rec.block_number, rec.lot_number, rec.contact_number)
    email_changed = probe.email != rec.email
    rec.full_name, rec.name_key = probe.full_name, probe.nkey
    rec.email = probe.email
    rec.block_number, rec.block_key = probe.block, probe.bkey
    rec.lot_number, rec.lot_key = probe.lot, probe.lkey
    rec.contact_number = probe.contact or None
    if rec.registration_status == PENDING_ACTIVATION and rec.user_id is not None:
        account = db.get(User, rec.user_id)
        if account is not None and account.status != "Active":
            account.name, account.email, account.phone = rec.full_name, rec.email, rec.contact_number
            account.address = f"Block {rec.block_number}, Lot {rec.lot_number}"
        if email_changed:
            invites.invalidate(db, rec.record_id)             # the old link went to the old address
    try:
        log_activity(db=db, action="RESIDENT_RECORD_UPDATED", target_table="official_resident_records", target_id=rec.record_id,
                     description=f"Resident record #{rec.record_id} updated.", user_id=leader.user_id, log_type="operation",
                     old_values={"full_name": before[0], "email": before[1], "block": before[2], "lot": before[3]},
                     new_values=changed, request=request, commit=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Another resident record already has that email, or that name with the same block and lot.")
    db.refresh(rec)
    return _record_dict(rec, _inv_of(db, rec.record_id))


@router.post("/{record_id}/resend-invitation")
@limiter.limit("30/hour")
def resend_invitation(request: Request, record_id: int, db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """Send this resident a new activation link (the previous link stops working). Rate-limited per resident."""
    rec = _own_record(db, record_id, leader)
    try:
        result = invites.resend(db, rec, invites.LEADER_RESEND_COOLDOWN_SECONDS)
    except invites.ResendRefused as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    log_activity(db=db, action="RESIDENT_INVITATION_SENT" if result == "sent" else "RESIDENT_INVITATION_FAILED",
                 target_table="official_resident_records", target_id=rec.record_id,
                 description=f"Activation invitation {'sent' if result == 'sent' else 'could not be sent'} to resident record #{rec.record_id}.",
                 user_id=leader.user_id, log_type="operation", request=request)
    db.refresh(rec)
    return {"result": result, "record": _record_dict(rec, _inv_of(db, rec.record_id))}


@router.get("/{record_id}/history")
def record_history(record_id: int, db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """The audit trail of one resident record: invitations, activation, deactivation. No tokens or passwords exist in it."""
    rec = _own_record(db, record_id, leader)
    rows = (db.query(AuditLog).filter(AuditLog.target_table == "official_resident_records", AuditLog.target_id == rec.record_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc()).limit(100).all())
    return [{"action": r.action, "description": r.description, "at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.post("/{record_id}/deactivate")
def deactivate_record(request: Request, record_id: int, db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """Block the account: it cannot sign in or report. Pets, reports and messages are kept. Any invitation link stops working."""
    rec = _own_record(db, record_id, leader)
    if rec.registration_status != DEACTIVATED:
        rec.registration_status = DEACTIVATED
        rec.deactivated_at = datetime.now()
        invites.invalidate(db, rec.record_id)
        account = db.get(User, rec.user_id) if rec.user_id else None
        if account is not None and account.role_id == 1:
            # 'Suspended' is the blocked state: sign-in, tokens and refresh all refuse it. ('Inactive' now means an approved account
            # that has not signed in yet, which sign-in turns Active, so it must never be used to block someone.)
            account.status = "Suspended"
        log_activity(db=db, action="RESIDENT_RECORD_DEACTIVATED", target_table="official_resident_records", target_id=rec.record_id,
                     description=f"Resident record #{rec.record_id} deactivated.", user_id=leader.user_id, log_type="operation",
                     request=request, commit=False)
        db.commit()
        db.refresh(rec)
    return _record_dict(rec, _inv_of(db, rec.record_id))


@router.post("/{record_id}/reactivate")
def reactivate_record(request: Request, record_id: int, db: Session = Depends(get_db), leader: User = Depends(get_current_leader)):
    """Reactivate: an account that was activated before works again; one that never was goes back to Pending Activation."""
    rec = _own_record(db, record_id, leader)
    if rec.registration_status == DEACTIVATED:
        account = db.get(User, rec.user_id) if rec.user_id else None
        if rec.registered_at is not None and account is not None:
            rec.registration_status = ACTIVE
            account.status = "Active"
        else:
            rec.registration_status = PENDING_ACTIVATION
            invites.invalidate(db, rec.record_id, PENDING_DELIVERY)
            if account is not None and account.role_id == 1 and account.status == "Suspended":
                account.status = "Inactive"          # locked again until the resident claims it (not verified: sign-in refuses it)
        rec.deactivated_at = None
        log_activity(db=db, action="RESIDENT_RECORD_REACTIVATED", target_table="official_resident_records", target_id=rec.record_id,
                     description=f"Resident record #{rec.record_id} reactivated.", user_id=leader.user_id, log_type="operation",
                     request=request, commit=False)
        db.commit()
        db.refresh(rec)
    return _record_dict(rec, _inv_of(db, rec.record_id))
