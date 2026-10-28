"""
Owner follow-up (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md).

A complaint about a registered pet with a known owner. The Subdivision Leader handling the report starts a follow-up:
the owner is told to keep the pet confined, and the leader checks for N days (default 3, set by the administrator,
one extension) whether the owner acts. The owner acknowledges in the app, or the leader logs it from a phone call; the
owner may send updates with a photo. The leader ends it: owner complied, or closed with an outcome. Escalation uses
the existing report escalation and ends the follow-up by itself (utils/case_closure.py). The Barangay sees escalated
follow-ups only. The report's status is not changed while observing.
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.owner_followup import OwnerFollowUp, OwnerFollowUpContact
from app.models.report import Report
from app.models.system_setting import SystemSetting
from app.models.user import Subdivision, User
from app.schemas.owner_followup import (OwnerFollowUpAcknowledge, OwnerFollowUpClose, OwnerFollowUpContactCreate,
                                        OwnerFollowUpDays, OwnerFollowUpExtend, OwnerFollowUpStart)
from app.schemas.report import ReportStatusUpdate
from app.utils.audit import log_activity
from app.utils.auth import get_current_staff_or_admin, get_current_user, verify_subdivision_scope
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.holding_stay import db_now
from app.utils.notification_dispatcher import dispatch_notification
from app.utils.owner_followups import SETTING_KEY, followup_days, owner_snapshot, start_refusal
from app.utils.uploads import read_and_validate_upload

router = APIRouter(prefix="/owner-followups", tags=["Owner Follow-up"])

# outcome -> (report status, follow-up status, label)
CLOSE_OUTCOMES = {
    "owner_complied": (11, "Owner Complied", "Owner complied"),
    "incident_resolved": (11, "Closed by Leader", "Incident Resolved"),
    "false_alarm": (14, "Closed by Leader", "False Alarm"),
}


# ── helpers ──────────────────────────────────────────────────────────────────────
def _load(db: Session, followup_id: int) -> OwnerFollowUp:
    f = db.query(OwnerFollowUp).options(
        joinedload(OwnerFollowUp.report).joinedload(Report.subdivision),
        joinedload(OwnerFollowUp.contacts).joinedload(OwnerFollowUpContact.contacter),
    ).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return f


def _report_barangay_id(report: Report, db: Session) -> Optional[int]:
    subd = report.subdivision or (db.get(Subdivision, report.subdivision_id) if report.subdivision_id else None)
    return subd.barangay_id if subd else None


def _can_view(user: User, f: OwnerFollowUp, db: Session) -> bool:
    """Staff view: Admin all; a leader their subdivision; Barangay staff only escalated follow-ups of their barangay."""
    report = f.report
    if user.role_id == 4:
        return True
    if user.role_id == 2:
        return bool(user.subdivision_id) and report.subdivision_id == user.subdivision_id
    if user.role_id == 3:
        return f.status == "Escalated" and user.barangay_id is not None and _report_barangay_id(report, db) == user.barangay_id
    return False


def _require_handling_leader(user: User, report: Report, db: Session) -> None:
    """Only the Subdivision Leader handling the report (it claimed) writes to its follow-up."""
    from app.routes.reports import require_leader_claim

    if user.role_id != 2:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader handling this report can do this.")
    verify_subdivision_scope(user, report.subdivision_id, db=db)
    require_leader_claim(report, user)


def _require_observing(f: OwnerFollowUp) -> None:
    if f.status != "Observing":
        raise HTTPException(status_code=409, detail=f"This follow-up has already ended ({f.status}).")


def _days_left(f: OwnerFollowUp, now) -> int:
    seconds = (f.due_at - now).total_seconds()
    return max(0, -(-int(seconds) // 86400))  # whole days, rounded up


def _notify_leader(db: Session, f: OwnerFollowUp, title: str, message: str) -> None:
    leader_id = (f.report.assigned_leader_id if f.report else None) or f.opened_by
    if leader_id:
        dispatch_notification(db, leader_id, title=title, message=message,
                              notification_type="owner_followup", related_id=f.report_id)


def _serialize(f: OwnerFollowUp, db: Session, owner_view: bool = False) -> dict:
    now = db_now(db)
    observing = f.status == "Observing"
    out = {
        "followup_id": f.followup_id,
        "report_id": f.report_id,
        "status": f.status,
        "label": "Under Observation" if observing else f.status,
        "opened_at": f.opened_at,
        "due_at": f.due_at,
        "days_left": _days_left(f, now) if observing else 0,
        "is_due": observing and now >= f.due_at,
        "extended": f.extended_at is not None,
        "acknowledged": f.acknowledged_at is not None,
        "acknowledged_at": f.acknowledged_at,
        "acknowledged_via": f.acknowledged_via,
        "pet_name": f.pet.pet_name if f.pet else None,
        "closed_at": f.closed_at,
        "closing_outcome": f.closing_outcome,
    }
    if owner_view:
        # The owner: dates, state and their own updates; never the leader's notes or contacts
        out["my_updates"] = [{"contacted_at": c.contacted_at, "note": c.note, "photo_url": c.photo_url}
                             for c in f.contacts if c.method == "Owner update" and c.contacted_by == f.owner_user_id]
        return out
    report = f.report
    out.update({
        "owner_user_id": f.owner_user_id,
        "owner_has_account": f.owner_user_id is not None,
        "owner_name": f.owner_name,
        "owner_phone": f.owner_phone,
        "pet_id": f.pet_id,
        "opened_by": f.opened_by,
        "opened_by_name": f.opener.name if f.opener else None,
        "closed_by_name": f.closer.name if f.closer else None,
        "closing_reason": f.closing_reason,
        "acknowledgement_note": f.acknowledgement_note,
        "extended_at": f.extended_at,
        "extension_reason": f.extension_reason,
        "reminder_sent_at": f.reminder_sent_at,
        "due_notified_at": f.due_notified_at,
        "subdivision_id": report.subdivision_id if report else None,
        "report_status_id": report.current_status_id if report else None,
        "contacts": [{
            "contact_id": c.contact_id,
            "contacted_at": c.contacted_at,
            "method": c.method,
            "note": c.note,
            "photo_url": c.photo_url,
            "related_report_id": c.related_report_id,
            "contacted_by": c.contacted_by,
            "contacted_by_name": c.contacter.name if c.contacter else None,
        } for c in f.contacts],
    })
    return out


# ── settings (before /{followup_id} routes) ─────────────────────────────────────
@router.get("/settings")
def get_followup_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    return {"days": followup_days(db)}


@router.put("/settings")
def update_followup_settings(body: OwnerFollowUpDays, req: Request, db: Session = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    """The administrator sets the observation length. Follow-ups already open keep their due time."""
    if current_user.role_id != 4:
        raise HTTPException(status_code=403, detail="Only the administrator can change the observation length.")
    row = db.query(SystemSetting).filter(SystemSetting.setting_key == SETTING_KEY).first()
    old = followup_days(db)
    if row is None:
        row = SystemSetting(setting_key=SETTING_KEY, description="Owner follow-up observation length (days)")
        db.add(row)
    row.setting_value = str(body.days)
    row.updated_by = current_user.user_id
    log_activity(db=db, action="UPDATE_OWNER_FOLLOWUP_DAYS", target_table="system_settings",
                 description=f"Owner follow-up observation length changed from {old} to {body.days} days.",
                 old_values={"days": old}, new_values={"days": body.days},
                 user_id=current_user.user_id, request=req, commit=False)
    db.commit()
    return {"days": body.days}


# ── start ─────────────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def start_followup(body: OwnerFollowUpStart, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_staff_or_admin)):
    from app.models.report import StatusHistory

    report = db.query(Report).options(joinedload(Report.endorsement_letter)).filter(Report.report_id == body.report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if current_user.role_id != 2:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader handling this report can start an owner follow-up.")
    verify_subdivision_scope(current_user, report.subdivision_id, db=db)
    refusal = start_refusal(report, current_user, db)
    if refusal:
        status_code = 403 if refusal.startswith(("Only", "Claim")) else 409 if "already has" in refusal else 400
        raise HTTPException(status_code=status_code, detail=refusal)

    owner_user_id, owner_name, owner_phone = owner_snapshot(report, db)
    days = followup_days(db)
    now = db_now(db)
    f = OwnerFollowUp(report_id=report.report_id, pet_id=report.pet_id, owner_user_id=owner_user_id,
                      owner_name=owner_name, owner_phone=owner_phone, opened_by=current_user.user_id,
                      opened_at=now, due_at=now + timedelta(days=days), status="Observing")
    db.add(f)
    db.flush()
    # Report history: no owner name (other residents may read the timeline)
    db.add(StatusHistory(report_id=report.report_id, report_status_id=None, updated_by=current_user.user_id,
                         remarks=f"Owner follow-up started: the subdivision contacted the pet's owner and is observing "
                                 f"until {f.due_at:%b %d, %Y}."))
    if owner_user_id:
        pet = f.pet.pet_name if f.pet else "your pet"
        dispatch_notification(
            db, owner_user_id,
            title=f"Complaint about your pet {pet} (Report #{report.report_id})",
            message=(f"A complaint was reported about your pet {pet}. Please keep it safely confined and act within "
                     f"{days} days, until {f.due_at:%b %d, %Y}. Open the report to acknowledge it and send an update."),
            notification_type="owner_followup", related_id=report.report_id)
    log_activity(db=db, action="START_OWNER_FOLLOWUP", target_table="owner_followups", target_id=f.followup_id,
                 description=f"Owner follow-up started on Report #{report.report_id} for {days} days.",
                 user_id=current_user.user_id, request=req, commit=False)
    db.commit()
    return _serialize(_load(db, f.followup_id), db)


# ── list and one report ─────────────────────────────────────────────────────────
@router.get("")
@router.get("/", include_in_schema=False)
def list_followups(status: Optional[str] = None, due: Optional[bool] = None, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_staff_or_admin)):
    """status: 'open' (Observing) or 'closed'; due=true: open and past the due time."""
    q = db.query(OwnerFollowUp).join(Report, Report.report_id == OwnerFollowUp.report_id).options(
        joinedload(OwnerFollowUp.report).joinedload(Report.subdivision),
        joinedload(OwnerFollowUp.contacts).joinedload(OwnerFollowUpContact.contacter))
    if current_user.role_id == 2:
        if not current_user.subdivision_id:
            return []
        q = q.filter(Report.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 3:
        if current_user.barangay_id is None:
            return []
        q = q.join(Subdivision, Subdivision.subdivision_id == Report.subdivision_id).filter(
            Subdivision.barangay_id == current_user.barangay_id, OwnerFollowUp.status == "Escalated")
    if status == "open":
        q = q.filter(OwnerFollowUp.status == "Observing")
    elif status == "closed":
        q = q.filter(OwnerFollowUp.status != "Observing")
    rows = q.all()
    if due:
        now = db_now(db)
        rows = [f for f in rows if f.status == "Observing" and now >= f.due_at]
    rows.sort(key=lambda f: (f.status != "Observing", f.due_at if f.status == "Observing" else -(f.closed_at or f.opened_at).timestamp()))
    return [_serialize(f, db) for f in rows]


@router.get("/by-report/{report_id}")
def followup_for_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The open follow-up of a report (else the latest), as staff may see it; the owner sees their own view."""
    rows = db.query(OwnerFollowUp).options(
        joinedload(OwnerFollowUp.report).joinedload(Report.subdivision),
        joinedload(OwnerFollowUp.contacts).joinedload(OwnerFollowUpContact.contacter),
    ).filter(OwnerFollowUp.report_id == report_id).order_by(OwnerFollowUp.followup_id.desc()).all()
    rows.sort(key=lambda f: f.status != "Observing")
    for f in rows:
        if current_user.role_id == 1:
            if f.owner_user_id == current_user.user_id:
                return _serialize(f, db, owner_view=True)
            continue
        if _can_view(current_user, f, db):
            return _serialize(f, db)
    return None


# ── log entries ───────────────────────────────────────────────────────────────────
@router.post("/{followup_id}/contacts", status_code=201)
def add_contact(followup_id: int, body: OwnerFollowUpContactCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_staff_or_admin)):
    f = _load(db, followup_id)
    _require_handling_leader(current_user, f.report, db)
    _require_observing(f)
    if body.related_report_id is not None and not db.get(Report, body.related_report_id):
        raise HTTPException(status_code=404, detail="The repeated incident's report was not found.")
    db.add(OwnerFollowUpContact(followup_id=f.followup_id, contacted_by=current_user.user_id, contacted_at=db_now(db),
                                method=body.method, note=body.note.strip(),
                                related_report_id=body.related_report_id if body.method == "Repeated incident" else None))
    db.commit()
    db.expire_all()
    return _serialize(_load(db, followup_id), db)


@router.post("/{followup_id}/owner-update", status_code=201)
async def add_owner_update(followup_id: int, note: str = Form(...), file: Optional[UploadFile] = File(None),
                           db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The owner sends an update (for example the pet confined at home), with an optional photo."""
    f = _load(db, followup_id)
    if current_user.role_id != 1 or f.owner_user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the pet's owner can send an update.")
    _require_observing(f)
    note = (note or "").strip()
    if len(note) < 3:
        raise HTTPException(status_code=422, detail="Write a short update (at least 3 characters).")
    photo_url = None
    if file is not None and file.filename:
        content, unique_filename, _media, _rt = await read_and_validate_upload(file, allowed={"Image"})
        photo_url = await run_in_threadpool(upload_to_cloudinary, content, folder="owner_followups", filename=unique_filename)
        if not photo_url:
            raise HTTPException(status_code=500, detail="The photo could not be uploaded. Try again.")
    db.add(OwnerFollowUpContact(followup_id=f.followup_id, contacted_by=current_user.user_id, contacted_at=db_now(db),
                                method="Owner update", note=note[:1000], photo_url=photo_url))
    _notify_leader(db, f, f"Owner update: Report #{f.report_id}",
                   f"The owner sent an update on the complaint in Report #{f.report_id}.")
    db.commit()
    db.expire_all()
    return _serialize(_load(db, followup_id), db, owner_view=True)


# ── acknowledge, extend, close ──────────────────────────────────────────────────
@router.post("/{followup_id}/acknowledge")
def acknowledge(followup_id: int, body: OwnerFollowUpAcknowledge, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """
    The owner acknowledges the complaint in the app. For an owner without an account, the leader handling the report
    logs the acknowledgement received by phone. Nobody else can. Acknowledging is not compliance.
    """
    f = _load(db, followup_id)
    if current_user.role_id == 1:
        if f.owner_user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Only the pet's owner can acknowledge.")
        via, note = "App", (body.note or "").strip() or None
    elif current_user.role_id == 2:
        _require_handling_leader(current_user, f.report, db)
        if f.owner_user_id is not None:
            raise HTTPException(status_code=403, detail="This owner has an account and acknowledges in the app.")
        note = (body.note or "").strip()
        if len(note) < 3:
            raise HTTPException(status_code=422, detail="Note what the owner said on the phone.")
        via = "Phone"
    else:
        raise HTTPException(status_code=403, detail="Only the pet's owner, or the leader for an owner without an account, can acknowledge.")
    _require_observing(f)
    if f.acknowledged_at:
        raise HTTPException(status_code=409, detail="The owner has already acknowledged.")
    f.acknowledged_at = db_now(db)
    f.acknowledged_via = via
    f.acknowledged_by = current_user.user_id
    f.acknowledgement_note = note
    if via == "App":
        _notify_leader(db, f, f"Owner acknowledged: Report #{f.report_id}",
                       f"The owner acknowledged the complaint in Report #{f.report_id} in the app.")
    db.commit()
    db.expire_all()
    return _serialize(_load(db, followup_id), db, owner_view=current_user.role_id == 1)


@router.post("/{followup_id}/extend")
def extend_followup(followup_id: int, body: OwnerFollowUpExtend, req: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_staff_or_admin)):
    """Monitoring extended: once, by the leader, with a reason, for the set number of days."""
    f = _load(db, followup_id)
    _require_handling_leader(current_user, f.report, db)
    _require_observing(f)
    if f.extended_at:
        raise HTTPException(status_code=409, detail="This follow-up was already extended once.")
    days = followup_days(db)
    now = db_now(db)
    f.due_at = f.due_at + timedelta(days=days)
    f.extended_at = now
    f.extended_by = current_user.user_id
    f.extension_reason = body.reason.strip()
    f.reminder_sent_at = None
    f.due_notified_at = None
    if f.owner_user_id:
        dispatch_notification(
            db, f.owner_user_id, title=f"Observation extended (Report #{f.report_id})",
            message=(f"The subdivision extended its check on the complaint about your pet until {f.due_at:%b %d, %Y}. "
                     f"Please keep it safely confined."),
            notification_type="owner_followup", related_id=f.report_id)
    log_activity(db=db, action="EXTEND_OWNER_FOLLOWUP", target_table="owner_followups", target_id=f.followup_id,
                 description=f"Owner follow-up on Report #{f.report_id} extended by {days} days.",
                 user_id=current_user.user_id, request=req, commit=False)
    db.commit()
    db.expire_all()
    return _serialize(_load(db, followup_id), db)


@router.post("/{followup_id}/close")
def close_followup(followup_id: int, body: OwnerFollowUpClose, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_staff_or_admin)):
    """
    The leader ends the follow-up. The report is closed through the existing status route, so all its rules apply;
    if it refuses, the follow-up stays open and its message is returned.
    """
    from app.routes.reports import update_report_status

    f = _load(db, followup_id)
    _require_handling_leader(current_user, f.report, db)
    _require_observing(f)
    status_id, new_state, label = CLOSE_OUTCOMES[body.outcome]
    reason = body.reason.strip()
    report_id = f.report_id

    update_report_status(report_id, ReportStatusUpdate(
        status_id=status_id, user_id=current_user.user_id,
        remarks=f"Owner follow-up ended ({label}): {reason}"), req, db, current_user)

    # The closure hook already ended the follow-up as "Report Closed": record the leader's own outcome
    db.expire_all()
    f = _load(db, followup_id)
    f.status = new_state
    f.closed_by = current_user.user_id
    f.closed_at = f.closed_at or db_now(db)
    f.closing_outcome = label
    f.closing_reason = reason
    if f.owner_user_id:
        dispatch_notification(
            db, f.owner_user_id, title=f"Complaint closed (Report #{report_id})",
            message=f"The subdivision closed the complaint about your pet in Report #{report_id}: {label}.",
            notification_type="owner_followup", related_id=report_id)
    log_activity(db=db, action="CLOSE_OWNER_FOLLOWUP", target_table="owner_followups", target_id=f.followup_id,
                 description=f"Owner follow-up on Report #{report_id} ended: {label}.",
                 user_id=current_user.user_id, request=req, commit=False)
    db.commit()
    db.expire_all()
    return _serialize(_load(db, followup_id), db)
