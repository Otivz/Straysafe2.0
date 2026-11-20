from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.models.case_messaging import CaseMessageThread
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.qr_collar_request import QrCollarRequest
from app.models.user import User
from app.services import case_messaging as CM
from app.services import lost_pet_lifecycle as LP
from app.utils.auth import verify_subdivision_scope
from app.utils.db_clock import db_now

STATUS_LABELS: Dict[str, str] = {
    "pending": "Pending",
    "accepted": "Accepted",
    "ready_for_pickup": "Ready for Pickup",
    "completed": "Picked Up",
}
ACTIVE_STATUSES = ("pending", "accepted", "ready_for_pickup")


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _ref(request_id: int) -> str:
    return f"QCR-{request_id:04d}"


def _serialize(req: QrCollarRequest) -> Dict[str, Any]:
    pet = req.pet
    res = req.resident
    return {
        "request_id": req.request_id,
        "reference": _ref(req.request_id),
        "pet_id": req.pet_id,
        "pet_name": pet.display_name if pet else f"Pet #{req.pet_id}",
        "pet_reference": pet.reference_code if pet else None,
        "pet_type": pet.pet_type if pet else None,
        "pet_breed": pet.breed if pet else None,
        "pet_color": pet.color_markings if pet else None,
        "pet_size": pet.size_category if pet else None,
        "pet_photo_url": (pet.photo_url or pet.photo_front_url) if pet else None,
        "resident_id": req.resident_id,
        "resident_name": res.name if res else f"Resident #{req.resident_id}",
        "resident_unit": res.address if res else None,
        "subdivision_id": req.subdivision_id,
        "status": req.status,
        "status_label": STATUS_LABELS.get(req.status, req.status),
        "notes": req.notes,
        "admin_notes": req.admin_notes,
        "thread_id": req.thread_id,
        "requested_at": _iso(req.requested_at),
        "accepted_at": _iso(req.accepted_at),
        "accepted_by_name": req.accepted_admin.name if req.accepted_admin else None,
        "ready_at": _iso(req.ready_at),
        "ready_by_name": req.ready_admin.name if req.ready_admin else None,
        "completed_at": _iso(req.completed_at),
        "completed_by_name": req.completed_admin.name if req.completed_admin else None,
        "updated_at": _iso(req.updated_at),
        "history": list(req.history or []),
    }


def _query_base(db: Session):
    return db.query(QrCollarRequest).options(
        joinedload(QrCollarRequest.pet),
        joinedload(QrCollarRequest.resident),
        joinedload(QrCollarRequest.accepted_admin),
        joinedload(QrCollarRequest.ready_admin),
        joinedload(QrCollarRequest.completed_admin),
    )


def _append_history(req: QrCollarRequest, status: str, actor: User, note: Optional[str] = None) -> None:
    now = db_now(actor._sa_instance_state.session)
    entries = list(req.history or [])
    entries.append({
        "status": status,
        "label": STATUS_LABELS.get(status, status),
        "at": now.isoformat(),
        "by_id": actor.user_id,
        "by_name": actor.name,
        "note": note.strip() if note and note.strip() else None,
    })
    req.history = entries


def _notify_user(db: Session, user_id: int, title: str, message: str, notif_type: str, related_id: int) -> None:
    db.add(Notification(
        user_id=user_id,
        title=title[:255],
        message=message[:1000],
        type=notif_type,
        related_id=related_id,
    ))


def list_resident_requests(db: Session, resident: User, pet_id: Optional[int] = None) -> List[Dict[str, Any]]:
    if resident.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents can access their own QR collar requests.")
    q = _query_base(db).filter(QrCollarRequest.resident_id == resident.user_id)
    if pet_id is not None:
        q = q.filter(QrCollarRequest.pet_id == pet_id)
    rows = q.order_by(QrCollarRequest.request_id.desc()).all()
    return [_serialize(r) for r in rows]


def create_request(db: Session, resident: User, pet_id: int, notes: Optional[str] = None) -> Dict[str, Any]:
    if resident.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents can request a QR collar for their registered pets.")
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if pet is None:
        raise HTTPException(status_code=404, detail="Registered pet not found.")
    if pet.owner_id != resident.user_id:
        raise HTTPException(status_code=403, detail="You can only request a QR collar for your own registered pet.")
    if pet.status == "Deceased" or pet.merged_into_pet_id:
        raise HTTPException(status_code=422, detail="This pet record is not active and cannot receive a QR collar.")

    subdivision_id = (pet.owner.subdivision_id if pet.owner else None) or resident.subdivision_id
    if not subdivision_id:
        raise HTTPException(status_code=422, detail="Your account is not assigned to a subdivision yet.")

    existing = (
        db.query(QrCollarRequest)
        .filter(
            QrCollarRequest.pet_id == pet.pet_id,
            QrCollarRequest.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"A QR collar request for {pet.display_name} is already {STATUS_LABELS.get(existing.status, existing.status).lower()} ({_ref(existing.request_id)}).",
        )

    now = db_now(db)
    clean_notes = (notes or "").strip()[:500] or None
    req = QrCollarRequest(
        pet_id=pet.pet_id,
        resident_id=resident.user_id,
        subdivision_id=subdivision_id,
        status="pending",
        notes=clean_notes,
        history=[{
            "status": "pending",
            "label": "Pending",
            "at": now.isoformat(),
            "by_id": resident.user_id,
            "by_name": resident.name,
            "note": clean_notes,
        }],
        requested_at=now,
        updated_at=now,
    )
    db.add(req)
    db.flush()

    pet_desc = " · ".join(p for p in [pet.pet_type, pet.breed, pet.color_markings] if p)
    for leader_id in LP.leader_ids(db, subdivision_id):
        _notify_user(
            db,
            leader_id,
            f"New QR collar request: {pet.display_name}",
            f"{resident.name} requested a QR collar for {pet.display_name}{f' ({pet_desc})' if pet_desc else ''}.",
            "qr_collar_request",
            req.request_id,
        )

    db.add(AuditLog(
        user_id=resident.user_id,
        action="QR_COLLAR_REQUESTED",
        target_table="qr_collar_requests",
        target_id=req.request_id,
        description=f"{resident.name} requested a QR collar for pet #{pet.pet_id} ({pet.display_name}).",
        log_type="operation",
        new_values={"request_id": req.request_id, "pet_id": pet.pet_id, "status": "pending"},
    ))

    loaded = _query_base(db).filter(QrCollarRequest.request_id == req.request_id).first()
    return _serialize(loaded or req)


def list_admin_requests(db: Session, actor: User) -> Dict[str, Any]:
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only Subdivision Administration can view QR collar requests.")
    q = _query_base(db)
    if actor.role_id == 2:
        if not actor.subdivision_id:
            return {"items": [], "counts": {"total": 0, "pending": 0, "accepted": 0, "ready_for_pickup": 0, "completed": 0}}
        q = q.filter(QrCollarRequest.subdivision_id == actor.subdivision_id)
    rows = q.order_by(QrCollarRequest.request_id.desc()).all()
    items = [_serialize(r) for r in rows]
    return {
        "items": items,
        "counts": {
            "total": len(items),
            "pending": sum(1 for r in rows if r.status == "pending"),
            "accepted": sum(1 for r in rows if r.status == "accepted"),
            "ready_for_pickup": sum(1 for r in rows if r.status == "ready_for_pickup"),
            "completed": sum(1 for r in rows if r.status == "completed"),
        },
    }


def _staff_request(db: Session, actor: User, request_id: int) -> QrCollarRequest:
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only Subdivision Administration can manage QR collar requests.")
    req = _query_base(db).filter(QrCollarRequest.request_id == request_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="QR collar request not found.")
    verify_subdivision_scope(actor, req.subdivision_id, db=db)
    return req


def accept_request(db: Session, actor: User, request_id: int, admin_notes: Optional[str] = None) -> Dict[str, Any]:
    req = _staff_request(db, actor, request_id)
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Request {_ref(req.request_id)} is already {STATUS_LABELS.get(req.status, req.status)}.")
    now = db_now(db)
    req.status = "accepted"
    req.accepted_at = now
    req.accepted_by = actor.user_id
    if admin_notes and admin_notes.strip():
        req.admin_notes = admin_notes.strip()[:500]
    req.updated_at = now
    _append_history(req, "accepted", actor, admin_notes)

    pet_name = req.pet.display_name if req.pet else f"Pet #{req.pet_id}"
    _notify_user(
        db,
        req.resident_id,
        f"QR collar request accepted: {pet_name}",
        f"Your QR collar request ({_ref(req.request_id)}) for {pet_name} has been accepted by Subdivision Administration.",
        "qr_collar_status",
        req.pet_id,
    )

    db.add(AuditLog(
        user_id=actor.user_id,
        action="QR_COLLAR_REQUEST_ACCEPTED",
        target_table="qr_collar_requests",
        target_id=req.request_id,
        description=f"{actor.name} accepted QR collar request {_ref(req.request_id)} for {pet_name}.",
        log_type="operation",
        old_values={"status": "pending"},
        new_values={"status": "accepted"},
    ))
    db.flush()
    return _serialize(_query_base(db).filter(QrCollarRequest.request_id == req.request_id).first() or req)


def mark_ready_for_pickup(
    db: Session,
    actor: User,
    request_id: int,
    message: Optional[str] = None,
    admin_notes: Optional[str] = None,
) -> Dict[str, Any]:
    req = _staff_request(db, actor, request_id)
    if req.status not in ("pending", "accepted"):
        raise HTTPException(status_code=409, detail=f"Request {_ref(req.request_id)} is already {STATUS_LABELS.get(req.status, req.status)}.")

    now = db_now(db)
    prev_status = req.status
    if not req.accepted_at:
        req.accepted_at = now
        req.accepted_by = actor.user_id
    req.status = "ready_for_pickup"
    req.ready_at = now
    req.ready_by = actor.user_id
    if admin_notes and admin_notes.strip():
        req.admin_notes = admin_notes.strip()[:500]
    req.updated_at = now
    _append_history(req, "ready_for_pickup", actor, admin_notes)

    pet = req.pet
    pet_name = pet.display_name if pet else f"Pet #{req.pet_id}"
    pet_details = " · ".join(
        p for p in [
            pet.pet_type if pet else None,
            pet.breed if pet else None,
            pet.color_markings if pet else None,
            f"Ref {pet.reference_code}" if pet and pet.reference_code else None,
        ]
        if p
    )
    default_msg = (
        f"Your requested QR collar for {pet_name}"
        f"{f' ({pet_details})' if pet_details else ''} is ready for pickup. "
        f"Please coordinate with the Subdivision Administration regarding its collection. "
        f"[Request {_ref(req.request_id)}]"
    )
    body = (message or "").strip() or default_msg
    if _ref(req.request_id) not in body:
        body = f"{body}\n\nRequest Reference: {_ref(req.request_id)} · Pet: {pet_name}{f' ({pet_details})' if pet_details else ''}"

    # Reuse an open conversation thread for this request if one exists; otherwise open a general thread with the resident
    thread: Optional[CaseMessageThread] = None
    if req.thread_id:
        existing_thread = db.get(CaseMessageThread, req.thread_id)
        if existing_thread is not None and CM.ended_reason(db, existing_thread) is None:
            thread = existing_thread

    if thread is None:
        thread = CaseMessageThread(
            subdivision_id=req.subdivision_id,
            kind="general",
            report_id=None,
            subject=f"QR Collar Ready for Pickup: {pet_name}",
            created_by=actor.user_id,
        )
        db.add(thread)
        db.flush()
        CM._add_member(db, thread, req.resident_id, CM.RESIDENT)
        CM._add_member(db, thread, actor.user_id, CM.LEADER)

    req.thread_id = thread.thread_id
    db.flush()
    CM.send(db, thread, actor, body)

    db.add(AuditLog(
        user_id=actor.user_id,
        action="QR_COLLAR_READY_FOR_PICKUP",
        target_table="qr_collar_requests",
        target_id=req.request_id,
        description=f"{actor.name} marked QR collar request {_ref(req.request_id)} ({pet_name}) ready for pickup and notified resident.",
        log_type="operation",
        old_values={"status": prev_status},
        new_values={"status": "ready_for_pickup", "thread_id": thread.thread_id},
    ))
    db.flush()
    return _serialize(_query_base(db).filter(QrCollarRequest.request_id == req.request_id).first() or req)


def mark_completed(db: Session, actor: User, request_id: int, admin_notes: Optional[str] = None) -> Dict[str, Any]:
    req = _staff_request(db, actor, request_id)
    if req.status != "ready_for_pickup":
        raise HTTPException(status_code=409, detail="Only requests marked Ready for Pickup can be marked as picked up.")
    now = db_now(db)
    req.status = "completed"
    req.completed_at = now
    req.completed_by = actor.user_id
    if admin_notes and admin_notes.strip():
        req.admin_notes = admin_notes.strip()[:500]
    req.updated_at = now
    _append_history(req, "completed", actor, admin_notes)

    pet_name = req.pet.display_name if req.pet else f"Pet #{req.pet_id}"
    _notify_user(
        db,
        req.resident_id,
        f"QR collar picked up: {pet_name}",
        f"Your QR collar request ({_ref(req.request_id)}) for {pet_name} has been marked as picked up.",
        "qr_collar_status",
        req.pet_id,
    )
    db.flush()
    return _serialize(_query_base(db).filter(QrCollarRequest.request_id == req.request_id).first() or req)
