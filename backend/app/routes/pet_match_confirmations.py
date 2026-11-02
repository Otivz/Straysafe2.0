"""
Owner side of owner-first pet matching: a registered owner sees staff's "Is this your pet?" requests and answers
YES or NO. An answer never finalizes a match; staff still make the final verification (manual_matching.py).
Rules: app/utils/pet_match_confirmation.py.
"""
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_match_confirmation import PetMatchConfirmationRequest
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.models.user import User
from app.utils.audit import log_activity
from app.utils.auth import get_current_user
from app.utils.pet_match_confirmation import AWAITING, OWNER_CONFIRMED, OWNER_REJECTED, STATUS_LABELS

router = APIRouter(prefix="/pet-match-confirmations", tags=["pet-match-confirmations"])

QUESTION = "Is this the animal you registered as your pet?"
FINAL_LABELS = {"CONFIRMED_MATCH": "Verified match", "NOT_A_MATCH": "Not a match", "UNABLE_TO_VERIFY": "Needs further verification"}


def _pet_photos(pet: Pet) -> list:
    out: list = []
    for url in (pet.photo_front_url, pet.photo_url, pet.photo_left_url, pet.photo_right_url):
        if url and url.strip() and url not in out:
            out.append(url)
    return out


def _pet_colors(pet: Pet) -> Optional[str]:
    parts = []
    for p in (pet.color_markings, pet.primary_color, pet.secondary_color, pet.tertiary_color):
        if p and p.strip() and p.strip() not in parts:
            parts.append(p.strip())
    return ", ".join(parts) or None


def owner_view(r: PetMatchConfirmationRequest) -> Dict[str, Any]:
    """What the owner sees: the reported animal (no reporter details, no exact coordinates) and their own pet."""
    rep, pet = r.report, r.pet
    return {
        "request_id": r.request_id,
        "question": QUESTION,
        "status": r.status,
        "status_label": STATUS_LABELS.get(r.status, r.status),
        "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        "requested_by_name": r.requester.name if r.requester else None,
        "staff_message": r.staff_message,
        "owner_response": r.owner_response,
        "owner_note": r.owner_note,
        "owner_response_at": r.owner_response_at.isoformat() if r.owner_response_at else None,
        "final_decision": r.final_decision,
        "final_label": FINAL_LABELS.get(r.final_decision or "", None),
        "final_at": r.final_at.isoformat() if r.final_at else None,
        "reported_animal": None if rep is None else {
            "report_id": rep.report_id,
            "photos": [m.file_url for m in (rep.media or []) if m.media_type == "Image" and m.file_url],
            "animal_type": rep.animal_type,
            "breed": rep.animal_breed,
            "color": rep.animal_color,
            "size": rep.estimated_size,
            # Only what the reporter submitted (no AI-detected values): Manual Matching shows the actual record
            "description": rep.description,
            "condition": rep.condition,
            "landmark": rep.landmark,
            "initial_landmark": rep.initial_landmark,
            "animal_count": rep.animal_count,
            "subdivision": rep.subdivision.subdivision_name if rep.subdivision else None,
            "reported_at": rep.created_at.isoformat() if rep.created_at else None,
        },
        "your_pet": None if pet is None else {
            "pet_id": pet.pet_id,
            "pet_name": pet.pet_name,
            "reference_code": pet.reference_code,
            "photos": _pet_photos(pet),
            "animal_type": pet.pet_type,
            "breed": pet.breed,
            "color": _pet_colors(pet),
            "gender": pet.gender,
            "distinctive_markings": pet.distinctive_markings,
            "size": pet.size_category,
            "registered_address": pet.registered_address,
            "notes": pet.notes,
            "estimated_age": pet.estimated_age,
            "is_neutered": pet.is_neutered,
            "owner_name": pet.owner.name if pet.owner else None,
        },
    }


def _query(db: Session):
    return db.query(PetMatchConfirmationRequest).options(
        joinedload(PetMatchConfirmationRequest.report).joinedload(Report.subdivision),
        joinedload(PetMatchConfirmationRequest.report).selectinload(Report.media),
        joinedload(PetMatchConfirmationRequest.pet),
        joinedload(PetMatchConfirmationRequest.requester),
    )


def _mine(db: Session, user: User):
    """Requests sent to this user for a pet they still own."""
    return (_query(db).join(Pet, Pet.pet_id == PetMatchConfirmationRequest.pet_id)
            .filter(PetMatchConfirmationRequest.owner_id == user.user_id, Pet.owner_id == user.user_id))


@router.get("/mine")
def my_requests(
    status: str = Query("all", pattern="^(pending|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pending requests first, then the history (answered, cancelled and finalized ones)."""
    q = _mine(db, current_user)
    if status == "pending":
        q = q.filter(PetMatchConfirmationRequest.status == AWAITING)
    rows = q.order_by(PetMatchConfirmationRequest.requested_at.desc(), PetMatchConfirmationRequest.request_id.desc()).limit(100).all()
    rows.sort(key=lambda r: r.status != AWAITING)  # stable: pending first, newest first within each group
    return {"results": [owner_view(r) for r in rows], "pending": sum(1 for r in rows if r.status == AWAITING)}


@router.get("/{request_id}")
def my_request(request_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = _mine(db, current_user).filter(PetMatchConfirmationRequest.request_id == request_id).first()
    if r is None:
        raise HTTPException(status_code=404, detail="Confirmation request not found.")
    return owner_view(r)


class OwnerAnswer(BaseModel):
    answer: str = Field(..., pattern="^(YES|NO)$")
    note: Optional[str] = Field(None, max_length=1000)


@router.post("/{request_id}/respond")
def respond(request_id: int, payload: OwnerAnswer, req: Request, db: Session = Depends(get_db),
            current_user: User = Depends(get_current_user)):
    """The owner's YES / NO. Saved and staff are told; the match itself is decided by staff afterwards."""
    r = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.request_id == request_id)
         .with_for_update().first())
    if r is None:
        raise HTTPException(status_code=404, detail="Confirmation request not found.")
    pet = db.query(Pet).filter(Pet.pet_id == r.pet_id).first()
    if r.owner_id != current_user.user_id or pet is None or pet.owner_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the pet's registered owner can answer this request.")
    if r.status != AWAITING:
        raise HTTPException(status_code=409, detail=(
            f"This request is no longer waiting for an answer ({STATUS_LABELS.get(r.status, r.status)})."))

    yes = payload.answer == "YES"
    r.owner_response = payload.answer
    r.owner_note = (payload.note or "").strip() or None
    r.owner_response_at = datetime.now()
    r.status = OWNER_CONFIRMED if yes else OWNER_REJECTED

    # Synchronize ReportMatch
    match = db.query(ReportMatch).filter(ReportMatch.match_id == r.match_id).first() if r.match_id else None
    if not match:
        match = db.query(ReportMatch).filter(
            ReportMatch.source_report_id == r.report_id,
            ReportMatch.matched_pet_id == r.pet_id,
        ).order_by(ReportMatch.match_id.desc()).first()
    if match:
        match.owner_confirmation_status = "OWNER_CONFIRMED" if yes else "OWNER_REJECTED"
        match.owner_verification_answer = "YES" if yes else "NO"
        match.owner_verification_answer_note = r.owner_note
        match.owner_verification_answered_at = r.owner_response_at
        if not yes and match.status in ("AI_SUGGESTED", "PENDING_VERIFICATION"):
            match.status = "NOT_A_MATCH"

        # Also post message back in chat thread
        from app.routes.chat import find_match_thread
        thread = find_match_thread(match, db)
        if thread:
            from app.models.chat import ChatMessage
            ans_label = "YES (Confirmed: this is my pet)" if yes else "NO (Not my pet)"
            note_extra = f" Note: {r.owner_note}" if r.owner_note else ""
            db.add(ChatMessage(
                thread_id=thread.thread_id,
                sender_id=current_user.user_id,
                is_system=False,
                is_read=False,
                message_text=f"Owner Response for Report #{r.report_id} ({pet.pet_name}): {ans_label}.{note_extra}",
            ))

    report = db.query(Report).filter(Report.report_id == r.report_id).first()
    staff_ids = {i for i in (r.requested_by, report.assigned_leader_id if report else None) if i}
    title = (f"Owner Confirmed: Report #{r.report_id} is {pet.pet_name}" if yes
             else f"Owner Rejected: Report #{r.report_id} is not {pet.pet_name}")
    message = (f"{current_user.name} said the animal in Report #{r.report_id} IS their pet '{pet.pet_name}'. "
               f"Review it and make the final verification in Manual Matching." if yes else
               f"{current_user.name} said the animal in Report #{r.report_id} is NOT their pet '{pet.pet_name}'. "
               f"It can't be confirmed for this report; search for another registered pet.")
    if r.owner_note:
        message += f" Owner's note: {r.owner_note}"
    for uid in staff_ids:
        db.add(Notification(user_id=uid, title=title, message=message, type="pet_match_confirmation_result",
                            related_id=r.report_id))
    log_activity(
        db=db, action="OWNER_PET_MATCH_RESPONSE", target_table="pet_match_confirmation_requests", target_id=r.request_id,
        description=f"Owner {current_user.name} answered {payload.answer} for Report #{r.report_id} and pet #{pet.pet_id}.",
        user_id=current_user.user_id, log_type="security",
        old_values={"status": AWAITING}, new_values={"status": r.status, "owner_response": payload.answer},
        request=req, commit=False,
    )
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Your answer was not saved: database error ({type(e).__name__}).")
    saved = _mine(db, current_user).filter(PetMatchConfirmationRequest.request_id == request_id).first()
    return {
        "message": ("Thank you. Staff will review and make the final verification." if yes
                    else "Thank you. Staff have been told this is not your pet."),
        "request": owner_view(saved) if saved else None,
    }
