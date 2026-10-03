"""
Adoption application chat (adopter <-> Barangay).

One thread per adoption application: ChatThread(thread_type="Adoption", related_id=adoption_id),
reusing the existing ChatThread / ChatMessage tables and the Notification system.

Security model
- Every endpoint is keyed ONLY by adoption_id and authorizes against the application itself.
- Thread ids and message ids are never accepted from the client (no IDOR surface).
- The sender is always the authenticated user; the client only supplies the message text.
- Chat never touches the adoption stage or status.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.limiter import limiter
from app.models.chat import ChatThread, ChatMessage
from app.models.notification import Notification
from app.models.report import Adoption, HoldingAnimal, Report
from app.models.user import User, Subdivision
from app.routes.chat import sender_role_label
from app.schemas.chat import (
    AdoptionChatMessageCreate,
    AdoptionChatParticipant,
    AdoptionChatThreadInfo,
    AdoptionChatUnreadResponse,
    ChatMessageResponse,
)
from app.utils.audit import log_activity
from app.utils.auth import get_current_user

router = APIRouter(prefix="/chat", tags=["adoption-chat"])

ADOPTION_STAGE_LABELS = {
    "Application": "Application",
    "Verification": "Verification",
    "Interview": "Interview",
    "Home_Visit": "Home Visit",
    "Review": "Review",
    "Approval": "Approval",
    "Certificate": "Certificate",
    "Handover": "Handover",
    "Monitoring": "Monitoring",
    "Successful_Adoption": "Completed",
}
MAX_FETCH = 1000


# ── Authorization ────────────────────────────────────────────────────────────

def _adoption_barangay_id(adoption: Adoption) -> Optional[int]:
    """Barangay that owns an application: animal's report -> subdivision -> barangay."""
    animal = adoption.animal
    report = animal.report if animal else None
    subdivision = report.subdivision if report else None
    return subdivision.barangay_id if subdivision else None


def get_adoption_chat_role(adoption: Adoption, user: User) -> Optional[str]:
    """
    Returns "applicant", "staff", "admin" or None.
      - Resident: only the applicant of THIS application, and only a verified account.
      - Barangay Staff (role 3): only applications of their own barangay. Fails closed when the
        owning barangay cannot be resolved. Same scoping as GET /adoptions/applications.
      - Admin (role 4): oversight access.
      - Subdivision Leaders (role 2) and anyone else: no access (they do not manage adoptions).
    """
    if user.role_id == 1:
        if user.is_verified and adoption.applicant_id == user.user_id:
            return "applicant"
        return None
    if user.role_id == 4:
        return "admin"
    if user.role_id == 3:
        barangay_id = _adoption_barangay_id(adoption)
        if barangay_id is not None and user.barangay_id is not None and barangay_id == user.barangay_id:
            return "staff"
        return None
    return None


def load_adoption_for_chat(adoption_id: int, user: User, db: Session) -> tuple[Adoption, str]:
    """Load the application and authorize the caller. Unauthorized callers get a plain 404 (no existence leak)."""
    adoption = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.subdivision).joinedload(Subdivision.barangay),
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).selectinload(Report.media),
            joinedload(Adoption.applicant),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    role = get_adoption_chat_role(adoption, user) if adoption else None
    if not adoption or not role:
        raise HTTPException(status_code=404, detail="Adoption application not found")
    return adoption, role


def adoption_chat_read_only_reason(adoption: Adoption) -> Optional[str]:
    """The conversation is preserved as history once the application can no longer progress."""
    if adoption.status == "Rejected":
        return "This application was rejected. The conversation is kept as read-only history."
    if adoption.status == "Cancelled":
        return "This application was cancelled. The conversation is kept as read-only history."
    if (
        adoption.current_stage == "Successful_Adoption"
        or adoption.post_monitoring_status == "Completed"
        or adoption.adoption_completed_at is not None
    ):
        return "This adoption is completed. The conversation is kept as read-only history."
    return None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _adoption_thread(adoption_id: int, db: Session) -> Optional[ChatThread]:
    return db.query(ChatThread).filter(
        ChatThread.thread_type == "Adoption",
        ChatThread.related_id == adoption_id
    ).first()


def _unread_filter(role: str, adoption: Adoption):
    """Unread = not yet read by the OTHER side. The applicant reads staff; staff/admin read the applicant."""
    if role == "applicant":
        return ChatMessage.sender_id != adoption.applicant_id
    return ChatMessage.sender_id == adoption.applicant_id


def _pet_label(adoption: Adoption) -> str:
    animal = adoption.animal
    return animal.animal_name if animal and animal.animal_name else f"Rescue #{adoption.holding_id}"


def _default_staff_contact_id(adoption: Adoption, db: Session) -> int:
    """Informational default recipient stored on the thread (access is NOT derived from it)."""
    if adoption.reviewed_by:
        return adoption.reviewed_by
    if adoption.staff_handover_by:
        return adoption.staff_handover_by
    barangay_id = _adoption_barangay_id(adoption)
    if barangay_id is not None:
        head = db.query(User.user_id).filter(
            User.role_id == 3, User.barangay_id == barangay_id, User.is_head_officer == True
        ).first()
        if head:
            return head[0]
        any_staff = db.query(User.user_id).filter(User.role_id == 3, User.barangay_id == barangay_id).first()
        if any_staff:
            return any_staff[0]
    return adoption.applicant_id


def _staff_recipient_ids(adoption: Adoption, thread: ChatThread, db: Session, exclude_user_id: int) -> set:
    """Barangay people to notify when the adopter writes: handlers of this application + head officers."""
    barangay_id = _adoption_barangay_id(adoption)
    candidate_ids = set()
    for uid in (adoption.reviewed_by, adoption.staff_handover_by, thread.recipient_id):
        if uid:
            candidate_ids.add(uid)
    if adoption.verification and adoption.verification.verified_by:
        candidate_ids.add(adoption.verification.verified_by)
    if adoption.interview and adoption.interview.interviewer_id:
        candidate_ids.add(adoption.interview.interviewer_id)
    if adoption.home_visit and adoption.home_visit.inspector_id:
        candidate_ids.add(adoption.home_visit.inspector_id)
    prior_staff = db.query(ChatMessage.sender_id).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != adoption.applicant_id,
        ChatMessage.is_system == False
    ).distinct().all()
    candidate_ids.update(row[0] for row in prior_staff)

    recipients = set()
    if candidate_ids:
        for u in db.query(User).filter(User.user_id.in_(candidate_ids), User.status != "Inactive").all():
            if u.role_id == 4 or (u.role_id == 3 and barangay_id is not None and u.barangay_id == barangay_id):
                recipients.add(u.user_id)
    if barangay_id is not None:
        heads = db.query(User.user_id).filter(
            User.role_id == 3, User.barangay_id == barangay_id,
            User.is_head_officer == True, User.status != "Inactive"
        ).all()
        recipients.update(row[0] for row in heads)
        if not recipients:  # nobody assigned yet and no head officer: fall back to the barangay's staff
            staff = db.query(User.user_id).filter(
                User.role_id == 3, User.barangay_id == barangay_id, User.status != "Inactive"
            ).all()
            recipients.update(row[0] for row in staff)
    recipients.discard(exclude_user_id)
    return recipients


def _push_notification(db: Session, user_id: int, adoption_id: int, title: str, message: str) -> None:
    """One notification per unread conversation: later messages refresh it instead of flooding the bell."""
    existing = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.type == "adoption_chat",
        Notification.related_id == adoption_id,
        Notification.is_read == False
    ).first()
    if existing:
        existing.title = title[:255]
        existing.message = message[:1000]
        existing.created_at = datetime.now()
        existing.is_archived = False
        return
    db.add(Notification(
        user_id=user_id, title=title[:255], message=message[:1000],
        type="adoption_chat", related_id=adoption_id, is_read=False
    ))


def _format_messages(messages: List[ChatMessage], db: Session) -> List[dict]:
    sender_ids = {m.sender_id for m in messages}
    senders = {}
    if sender_ids:
        senders = {
            u.user_id: u
            for u in db.query(User).options(joinedload(User.position)).filter(User.user_id.in_(sender_ids)).all()
        }
    out = []
    for m in messages:
        s = senders.get(m.sender_id)
        out.append({
            "message_id": m.message_id,
            "thread_id": m.thread_id,
            "sender_id": m.sender_id,
            "sender_name": s.name if s else "User",
            "sender_role": sender_role_label(s),
            "sender_avatar": s.profile_picture if s else None,
            "message_text": m.message_text,
            "media_url": None,
            "is_read": m.is_read,
            "is_system": m.is_system,
            "sent_at": m.sent_at,
        })
    return out


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/adoptions/unread-counts", response_model=AdoptionChatUnreadResponse)
def get_adoption_chat_unread_counts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unread adoption-chat messages per application, limited to applications the caller may access."""
    if current_user.role_id not in (1, 3, 4):
        return {"counts": {}, "total": 0}

    query = (
        db.query(ChatThread.related_id, func.count(ChatMessage.message_id))
        .join(ChatMessage, ChatMessage.thread_id == ChatThread.thread_id)
        .join(Adoption, Adoption.adoption_id == ChatThread.related_id)
        .filter(
            ChatThread.thread_type == "Adoption",
            ChatMessage.is_read == False,
            ChatMessage.is_system == False
        )
    )
    if current_user.role_id == 1:
        if not current_user.is_verified:
            return {"counts": {}, "total": 0}
        query = query.filter(
            Adoption.applicant_id == current_user.user_id,
            ChatMessage.sender_id != Adoption.applicant_id
        )
    else:
        query = query.filter(ChatMessage.sender_id == Adoption.applicant_id)
        if current_user.role_id == 3:
            if current_user.barangay_id is None:
                return {"counts": {}, "total": 0}
            query = (
                query.join(HoldingAnimal, HoldingAnimal.holding_id == Adoption.holding_id)
                .join(Report, Report.report_id == HoldingAnimal.report_id)
                .join(Subdivision, Subdivision.subdivision_id == Report.subdivision_id)
                .filter(Subdivision.barangay_id == current_user.barangay_id)
            )

    counts = {int(adoption_id): int(n) for adoption_id, n in query.group_by(ChatThread.related_id).all()}
    return {"counts": counts, "total": sum(counts.values())}


def _adoption_photo(adoption: Adoption) -> Optional[str]:
    report = adoption.animal.report if adoption.animal else None
    if report and report.media:
        return next((m.file_url for m in report.media if m.media_type == "Image"), None)
    return None


def _inbox_item(adoption: Adoption, thread: Optional[ChatThread], role: str, db: Session) -> dict:
    """One adoption conversation in the same shape as GET /chat/threads items (thread_mode="adoption")."""
    last = unread = None
    if thread:
        last = (
            db.query(ChatMessage)
            .filter(ChatMessage.thread_id == thread.thread_id)
            .order_by(ChatMessage.sent_at.desc(), ChatMessage.message_id.desc())
            .first()
        )
        unread = db.query(ChatMessage).filter(
            ChatMessage.thread_id == thread.thread_id,
            ChatMessage.is_read == False,
            ChatMessage.is_system == False,
            _unread_filter(role, adoption)
        ).count()
    last_sender = db.query(User).filter(User.user_id == last.sender_id).first() if last else None
    applicant = adoption.applicant
    animal = adoption.animal
    stage = adoption.current_stage or "Application"
    read_only_reason = adoption_chat_read_only_reason(adoption)
    report = animal.report if animal else None
    barangay = report.subdivision.barangay if report and report.subdivision else None
    return {
        # Threads that do not exist yet get a negative placeholder id (never sent back to the server).
        "thread_id": thread.thread_id if thread else -adoption.adoption_id,
        "thread_type": "Adoption",
        "thread_mode": "adoption",
        "adoption_id": adoption.adoption_id,
        "report_id": report.report_id if report else 0,
        "title": thread.title if thread else f"Adoption #{adoption.adoption_id} — {_pet_label(adoption)}",
        "is_closed": read_only_reason is not None,
        "can_interact": read_only_reason is None,
        "is_assigned": False,
        "created_at": (thread.created_at if thread else adoption.created_at),
        "updated_at": (thread.updated_at if thread else adoption.updated_at or adoption.created_at),
        "adoption": {
            "adoption_id": adoption.adoption_id,
            "holding_id": adoption.holding_id,
            "pet_name": animal.animal_name if animal else None,
            "pet_type": animal.animal_type if animal else None,
            "pet_breed": animal.breed if animal else None,
            "pet_photo": _adoption_photo(adoption),
            "applicant_id": adoption.applicant_id,
            "applicant_name": (applicant.name if applicant else None) or adoption.full_name,
            "applicant_photo": applicant.profile_picture if applicant else None,
            "current_stage": stage,
            "stage_label": ADOPTION_STAGE_LABELS.get(stage, stage.replace("_", " ")),
            "application_status": adoption.status,
            "read_only_reason": read_only_reason,
            "barangay_name": barangay.barangay_name if barangay else None,
        },
        # Who the viewer is talking to: staff/admin see the adopter, the adopter sees the barangay.
        "counterpart": (
            {"user_id": None, "name": barangay.barangay_name if barangay else "Barangay", "role": "Barangay", "avatar": None}
            if role == "applicant" else
            {"user_id": adoption.applicant_id, "name": (applicant.name if applicant else None) or adoption.full_name,
             "role": "Adopter", "avatar": applicant.profile_picture if applicant else None}
        ),
        "last_message": {
            "message_id": last.message_id,
            "text": last.message_text,
            "sender_id": last.sender_id,
            "sender_name": last_sender.name if last_sender else "User",
            "sent_at": last.sent_at,
            "is_read": last.is_read,
        } if last else None,
        "unread_count": unread or 0,
    }


@router.get("/adoptions/threads")
def list_adoption_chat_threads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Inbox list of adoption conversations the caller may access (only applications that have messages)."""
    if current_user.role_id not in (1, 3, 4):
        return []
    query = (
        db.query(Adoption, ChatThread)
        .join(ChatThread, (ChatThread.related_id == Adoption.adoption_id) & (ChatThread.thread_type == "Adoption"))
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).joinedload(Report.subdivision).joinedload(Subdivision.barangay),
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).selectinload(Report.media),
            joinedload(Adoption.applicant),
        )
    )
    if current_user.role_id == 1:
        if not current_user.is_verified:
            return []
        query = query.filter(Adoption.applicant_id == current_user.user_id)
    elif current_user.role_id == 3:
        if current_user.barangay_id is None:
            return []
        query = (
            query.join(HoldingAnimal, HoldingAnimal.holding_id == Adoption.holding_id)
            .join(Report, Report.report_id == HoldingAnimal.report_id)
            .join(Subdivision, Subdivision.subdivision_id == Report.subdivision_id)
            .filter(Subdivision.barangay_id == current_user.barangay_id)
        )
    items = []
    for adoption, thread in query.order_by(ChatThread.updated_at.desc()).limit(MAX_FETCH).all():
        role = get_adoption_chat_role(adoption, current_user)  # re-check per row; never trust the join alone
        if role:
            items.append(_inbox_item(adoption, thread, role, db))
    return items


@router.get("/adoptions/{adoption_id}/inbox-item")
def get_adoption_chat_inbox_item(
    adoption_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Inbox entry for one application, even before the first message (used to open a new conversation)."""
    adoption, role = load_adoption_for_chat(adoption_id, current_user, db)
    return _inbox_item(adoption, _adoption_thread(adoption.adoption_id, db), role, db)


@router.get("/adoptions/{adoption_id}/thread", response_model=AdoptionChatThreadInfo)
def get_adoption_chat_thread(
    adoption_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Conversation header: pet, application, current stage, participants and whether sending is allowed."""
    adoption, role = load_adoption_for_chat(adoption_id, current_user, db)
    thread = _adoption_thread(adoption_id, db)
    read_only_reason = adoption_chat_read_only_reason(adoption)

    total = unread = 0
    staff_participants: List[AdoptionChatParticipant] = []
    if thread:
        total = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).count()
        unread = db.query(ChatMessage).filter(
            ChatMessage.thread_id == thread.thread_id,
            ChatMessage.is_read == False,
            ChatMessage.is_system == False,
            _unread_filter(role, adoption)
        ).count()
        staff_rows = (
            db.query(User)
            .options(joinedload(User.position))
            .join(ChatMessage, ChatMessage.sender_id == User.user_id)
            .filter(ChatMessage.thread_id == thread.thread_id, ChatMessage.sender_id != adoption.applicant_id)
            .distinct().all()
        )
        staff_participants = [
            AdoptionChatParticipant(user_id=u.user_id, name=u.name, role=sender_role_label(u)) for u in staff_rows
        ]

    animal = adoption.animal
    report = animal.report if animal else None
    photo = None
    if report and report.media:
        photo = next((m.file_url for m in report.media if m.media_type == "Image"), None)
    barangay_name = None
    if report and report.subdivision and report.subdivision.barangay:
        barangay_name = report.subdivision.barangay.barangay_name

    applicant = adoption.applicant
    stage = adoption.current_stage or "Application"
    return AdoptionChatThreadInfo(
        adoption_id=adoption.adoption_id,
        thread_id=thread.thread_id if thread else None,
        current_stage=stage,
        stage_label=ADOPTION_STAGE_LABELS.get(stage, stage.replace("_", " ")),
        stage_status=adoption.application_stage_status,
        application_status=adoption.status,
        can_send=read_only_reason is None,
        read_only_reason=read_only_reason,
        viewer_role=role,
        pet_name=animal.animal_name if animal else None,
        pet_type=animal.animal_type if animal else None,
        pet_breed=animal.breed if animal else None,
        pet_photo=photo,
        holding_id=adoption.holding_id,
        barangay_name=barangay_name,
        applicant=AdoptionChatParticipant(
            user_id=adoption.applicant_id,
            name=(applicant.name if applicant else None) or adoption.full_name,
            role="Adopter"
        ),
        staff_participants=staff_participants,
        total_messages=total,
        unread_messages=unread,
    )


@router.get("/adoptions/{adoption_id}/messages", response_model=List[ChatMessageResponse])
def get_adoption_chat_messages(
    adoption_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Complete conversation history for one application (kept across stage changes and after closure)."""
    adoption, _role = load_adoption_for_chat(adoption_id, current_user, db)
    thread = _adoption_thread(adoption.adoption_id, db)
    if not thread:
        return []
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.thread_id == thread.thread_id)
        .order_by(ChatMessage.sent_at.asc(), ChatMessage.message_id.asc())
        .limit(MAX_FETCH)
        .all()
    )
    return _format_messages(messages, db)


@router.post("/adoptions/{adoption_id}/messages", response_model=ChatMessageResponse)
@limiter.limit("30/minute")
def send_adoption_chat_message(
    request: Request,
    adoption_id: int,
    payload: AdoptionChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message. The sender is the authenticated user; chat never changes the adoption stage/status."""
    adoption, role = load_adoption_for_chat(adoption_id, current_user, db)

    read_only_reason = adoption_chat_read_only_reason(adoption)
    if read_only_reason:
        raise HTTPException(status_code=409, detail=read_only_reason)

    text = payload.message_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Serialize concurrent first messages so a single thread is created per application.
    db.query(Adoption.adoption_id).filter(Adoption.adoption_id == adoption.adoption_id).with_for_update().first()
    thread = _adoption_thread(adoption.adoption_id, db)
    created_thread = False
    pet_name = _pet_label(adoption)
    if not thread:
        thread = ChatThread(
            thread_type="Adoption",
            related_id=adoption.adoption_id,
            created_by=adoption.applicant_id,
            recipient_id=_default_staff_contact_id(adoption, db),
            title=f"Adoption #{adoption.adoption_id} — {pet_name}",
            is_closed=False,
        )
        db.add(thread)
        db.flush()
        created_thread = True
    elif thread.is_closed:
        thread.is_closed = False

    message = ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,  # never taken from the request
        message_text=text,
        media_url=None,
        is_read=False,
        is_system=False,
    )
    db.add(message)
    thread.updated_at = datetime.now()

    snippet = text if len(text) <= 80 else text[:80] + "..."
    stage_label = ADOPTION_STAGE_LABELS.get(adoption.current_stage or "Application", adoption.current_stage)
    try:
        if role == "applicant":
            for uid in _staff_recipient_ids(adoption, thread, db, exclude_user_id=current_user.user_id):
                _push_notification(
                    db, uid, adoption.adoption_id,
                    title=f"💬 Adoption chat: {adoption.full_name} — {pet_name}",
                    message=f"{current_user.name} ({stage_label}): {snippet}",
                )
        elif adoption.applicant_id != current_user.user_id:
            _push_notification(
                db, adoption.applicant_id, adoption.adoption_id,
                title=f"💬 Barangay replied about {pet_name}",
                message=f"{current_user.name}: {snippet}",
            )
    except Exception as notif_err:
        print(f"Notice: Failed to dispatch adoption chat notification: {notif_err}")

    db.commit()
    db.refresh(message)

    if created_thread:
        log_activity(
            db=db,
            action="ADOPTION_CHAT_STARTED",
            target_table="adoptions",
            target_id=adoption.adoption_id,
            description=f"Adoption chat started on application #{adoption.adoption_id} by {current_user.name} ({role}).",
            user_id=current_user.user_id,
            log_type="operation",
            request=request,
        )

    return _format_messages([message], db)[0]


@router.patch("/adoptions/{adoption_id}/read")
def mark_adoption_chat_read(
    adoption_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark the OTHER side's messages as read. Admin oversight never clears the staff/adopter unread state."""
    adoption, role = load_adoption_for_chat(adoption_id, current_user, db)
    if role == "admin":
        return {"marked_read": 0}
    thread = _adoption_thread(adoption.adoption_id, db)
    if not thread:
        return {"marked_read": 0}
    updated = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.is_read == False,
        _unread_filter(role, adoption)
    ).update({"is_read": True}, synchronize_session=False)
    # Opening the conversation also clears the matching bell notification for this user.
    db.query(Notification).filter(
        Notification.user_id == current_user.user_id,
        Notification.type == "adoption_chat",
        Notification.related_id == adoption.adoption_id,
        Notification.is_read == False
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"marked_read": updated}
