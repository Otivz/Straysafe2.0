from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
from datetime import datetime

from app.database import get_db
from app.models.chat import ChatThread, ChatMessage
from app.models.report import Report
from app.models.user import User
from app.models.notification import Notification
from app.models.report_match import ReportMatch
from app.models.pet import Pet
from app.schemas.chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse,
    ChatStatsResponse
)
from app.utils.auth import get_current_user
from app.utils.cloudinary_config import upload_to_cloudinary

router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)

def format_message_dict(msg: ChatMessage, db: Session) -> dict:
    sender = db.query(User).filter(User.user_id == msg.sender_id).first()
    sender_name = sender.name if sender else "User"
    sender_role = "Citizen"
    if sender:
        if sender.role_id == 2:
            sender_role = "Subdivision Leader"
        elif sender.role_id == 3:
            sender_role = "Barangay Staff"
        elif sender.role_id == 4:
            sender_role = "Admin"

    sender_avatar = sender.profile_picture if sender else None

    return {
        "message_id": msg.message_id,
        "thread_id": msg.thread_id,
        "sender_id": msg.sender_id,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "sender_avatar": sender_avatar,
        "message_text": msg.message_text,
        "media_url": msg.media_url,
        "is_read": msg.is_read,
        "is_system": msg.is_system,
        "sent_at": msg.sent_at
    }


def generate_memorable_report_title(report: Optional[Report], reporter: Optional[User] = None) -> str:
    if not report:
        return "Case Coordination"

    # Category Prefix
    cat_name = report.category.category_name if getattr(report, 'category', None) else ""
    cat_lower = cat_name.lower() if cat_name else ""
    cat_id = getattr(report, 'category_id', None)

    if "lost" in cat_lower or cat_id == 6:
        prefix = "Lost"
    elif "injured" in cat_lower or cat_id == 1:
        prefix = "Injured"
    elif "aggressive" in cat_lower or cat_id == 2:
        prefix = "Aggressive"
    elif "rabies" in cat_lower or cat_id == 3:
        prefix = "Rabies Alert"
    elif "roaming" in cat_lower or cat_id == 4:
        prefix = "Roaming"
    elif "rescue" in cat_lower or cat_id == 5:
        prefix = "Rescue"
    else:
        prefix = cat_name or "Report"

    # Animal Descriptor (Color + Breed/Type)
    color = (getattr(report, 'animal_color', None) or "").strip()
    breed = (getattr(report, 'animal_breed', None) or "").strip()
    animal_type = (getattr(report, 'animal_type', None) or "").strip()
    if animal_type.lower() == "unknown":
        animal_type = "Animal"

    parts = []
    if color and color.lower() not in ["unknown", "n/a", "none", "null"]:
        parts.append(color)
    if breed and breed.lower() not in ["unknown", "n/a", "none", "null", "mixed", "other"]:
        parts.append(breed)
    elif animal_type:
        parts.append(animal_type)

    animal_desc = " ".join(parts) if parts else (animal_type or "Animal")

    # Location: Street + Landmark
    street = (reporter.address.strip() if reporter and reporter.address else "").strip()
    landmark = (getattr(report, 'landmark', None) or "").strip()
    if landmark.lower() in ["no landmark", "no landmark specified", "n/a", "none", "unknown", "null"]:
        landmark = ""

    subd_name = report.subdivision.subdivision_name if getattr(report, 'subdivision', None) else "Selera Homes"

    loc_str = ""
    if street and landmark:
        if street.lower() == landmark.lower():
            loc_str = f"at {street}"
        else:
            loc_str = f"at {street} (near {landmark})"
    elif street:
        loc_str = f"at {street}"
    elif landmark:
        loc_str = f"near {landmark}"
    elif subd_name:
        loc_str = f"in {subd_name}"

    if loc_str:
        return f"{prefix}: {animal_desc} {loc_str}"
    return f"{prefix}: {animal_desc} (Report #{report.report_id})"


def generate_memorable_match_title(pet: Optional[Pet], report: Optional[Report], reporter: Optional[User] = None) -> str:
    pet_name = pet.pet_name if pet else "Candidate Pet"
    breed = pet.breed if (pet and pet.breed) else (report.animal_breed if report else None)
    animal_type = pet.pet_type if (pet and pet.pet_type) else (report.animal_type if report else "Pet")
    descriptor = breed or animal_type or "Pet"

    # Location
    street = (reporter.address.strip() if reporter and reporter.address else "").strip()
    landmark = (getattr(report, 'landmark', None) or "").strip() if report else ""
    if landmark.lower() in ["no landmark", "no landmark specified", "n/a", "none", "unknown", "null"]:
        landmark = ""

    loc_str = ""
    if street and landmark:
        if street.lower() == landmark.lower():
            loc_str = f"at {street}"
        else:
            loc_str = f"at {street} (near {landmark})"
    elif street:
        loc_str = f"at {street}"
    elif landmark:
        loc_str = f"near {landmark}"

    if loc_str:
        return f"Match: {pet_name} ({descriptor}) • {loc_str}"
    return f"Match: {pet_name} ({descriptor})"


def get_or_create_report_thread(report_id: int, current_user: User, db: Session) -> ChatThread:
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Look for existing thread
    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Report",
        ChatThread.related_id == report_id
    ).first()

    if not thread:
        # Determine creator and recipient
        reporter_id = report.user_id or current_user.user_id
        recipient_id = 2 # default to leader/staff placeholder or current user if they are staff
        if current_user.role_id != 1 and current_user.user_id != reporter_id:
            recipient_id = current_user.user_id

        thread = ChatThread(
            thread_type="Report",
            related_id=report_id,
            created_by=reporter_id,
            recipient_id=recipient_id,
            title=f"Incident Report #{report_id}",
            is_closed=report.status_id in [9, 10, 11, 12]
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

        # Add initial system message if empty
        welcome_msg = ChatMessage(
            thread_id=thread.thread_id,
            sender_id=reporter_id,
            message_text=f"Official coordination channel established for Report #STR-{report_id:04d}. Direct messaging is bound to this case.",
            is_system=True
        )
        db.add(welcome_msg)
        db.commit()

    # Update is_closed if report status changed to resolved
    is_resolved = (report.current_status_id or report.status_id) in [9, 10, 11, 12]
    if thread.is_closed != is_resolved:
        thread.is_closed = is_resolved
        db.commit()

    return thread


def check_user_report_chat_access(report_id: int, current_user: User, thread: ChatThread, db: Session) -> bool:
    if current_user.role_id != 1:
        return True  # Staff, leaders, admin have access

    if thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id:
        return True

    report = db.query(Report).filter(Report.report_id == report_id).first()
    if report:
        if report.user_id == current_user.user_id:
            return True
        if report.assigned_leader_id == current_user.user_id:
            return True
        if report.subdivision_id and current_user.subdivision_id and report.subdivision_id == current_user.subdivision_id:
            return True
        if getattr(report, 'visibility', 'Public') == 'Public':
            return True

        # Check if user has a matched pet for this report
        match = db.query(ReportMatch).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(
            ReportMatch.source_report_id == report_id,
            Pet.owner_id == current_user.user_id
        ).first()
        if match:
            return True

    return False


def get_or_create_match_thread(match_id: int, current_user: User, db: Session) -> ChatThread:
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match record not found")

    pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
    owner_id = pet.owner_id if pet else None
    source_report = db.query(Report).filter(Report.report_id == match.source_report_id).first()

    # Determine recipient
    if owner_id and current_user.user_id != owner_id:
        recipient_id = owner_id
    elif source_report and source_report.assigned_leader_id and current_user.user_id != source_report.assigned_leader_id:
        recipient_id = source_report.assigned_leader_id
    elif source_report and source_report.user_id and current_user.user_id != source_report.user_id:
        recipient_id = source_report.user_id
    else:
        recipient_id = 2  # default staff placeholder

    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Direct",
        ChatThread.related_id == match_id
    ).first()

    if not thread:
        pet_name = pet.pet_name if pet else "Pet"
        thread = ChatThread(
            thread_type="Direct",
            related_id=match_id,
            created_by=current_user.user_id,
            recipient_id=recipient_id,
            title=f"Look-Alike Verification: {pet_name} (Report #{match.source_report_id})",
            is_closed=False
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

        welcome_msg = ChatMessage(
            thread_id=thread.thread_id,
            sender_id=current_user.user_id,
            message_text=f"Direct look-alike verification channel started for Pet '{pet_name}' and Report #{match.source_report_id}.",
            is_system=True
        )
        db.add(welcome_msg)
        db.commit()

    return thread


def check_user_match_chat_access(match_id: int, current_user: User, thread: ChatThread, db: Session) -> bool:
    if current_user.role_id != 1:
        return True  # Staff, leaders, admin have access

    if thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id:
        return True

    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if match:
        pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
        if pet and pet.owner_id == current_user.user_id:
            return True
        source_report = db.query(Report).filter(Report.report_id == match.source_report_id).first()
        if source_report and source_report.user_id == current_user.user_id:
            return True

    return False


@router.get("/reports/{report_id}/thread", response_model=ChatThreadResponse)
def get_report_thread_endpoint(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_report_thread(report_id, current_user, db)
    
    # Check access: reporter, staff/leader/admin, look-alike pet owner, or resident
    if not check_user_report_chat_access(report_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    formatted_messages = [format_message_dict(m, db) for m in messages]

    creator = db.query(User).filter(User.user_id == thread.created_by).first()
    recipient = db.query(User).filter(User.user_id == thread.recipient_id).first()

    return {
        "thread_id": thread.thread_id,
        "thread_type": thread.thread_type,
        "related_id": thread.related_id,
        "created_by": thread.created_by,
        "recipient_id": thread.recipient_id,
        "title": thread.title,
        "is_closed": thread.is_closed,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "creator_name": creator.name if creator else None,
        "recipient_name": recipient.name if recipient else None,
        "messages": formatted_messages
    }


@router.get("/reports/{report_id}/messages", response_model=List[ChatMessageResponse])
def get_report_messages(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_report_thread(report_id, current_user, db)
    
    if not check_user_report_chat_access(report_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    return [format_message_dict(m, db) for m in messages]


@router.post("/reports/{report_id}/messages", response_model=ChatMessageResponse)
async def send_report_message(
    report_id: int,
    message_text: str = Form(...),
    file: Optional[UploadFile] = File(None),
    is_system: Optional[bool] = Form(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_report_thread(report_id, current_user, db)

    if thread.is_closed:
        raise HTTPException(status_code=400, detail="This case has been solved and archived. Chat is in read-only mode.")

    if not check_user_report_chat_access(report_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")

    media_url = None
    if file:
        try:
            media_url = upload_to_cloudinary(file, folder="chat_media")
        except Exception as e:
            # Fallback to local upload
            upload_dir = "uploads/chat"
            os.makedirs(upload_dir, exist_ok=True)
            ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
            filename = f"{uuid.uuid4().hex}{ext}"
            file_path = os.path.join(upload_dir, filename)
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            media_url = f"http://localhost:8000/uploads/chat/{filename}"

    new_msg = ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,
        message_text=message_text,
        media_url=media_url,
        is_read=False,
        is_system=is_system or False
    )
    db.add(new_msg)

    # ── Notification Dispatch for Messages ──────────────────────────────────
    try:
        report = db.query(Report).filter(Report.report_id == report_id).first()
        snippet = message_text.strip()
        if not snippet and media_url:
            snippet = "[Photo attached]"
        elif len(snippet) > 80:
            snippet = snippet[:80] + "..."

        recipient_user_ids = set()

        # 1. If report creator is not the sender, notify report creator
        if report and report.user_id and report.user_id != current_user.user_id:
            recipient_user_ids.add(report.user_id)

        # 2. Thread creator and designated thread recipient
        if thread.created_by and thread.created_by != current_user.user_id:
            recipient_user_ids.add(thread.created_by)
        if thread.recipient_id and thread.recipient_id != current_user.user_id:
            recipient_user_ids.add(thread.recipient_id)

        # 3. Assigned subdivision leader
        if report and report.assigned_leader_id and report.assigned_leader_id != current_user.user_id:
            recipient_user_ids.add(report.assigned_leader_id)

        # 4. If sender is citizen/resident, notify all active subdivision leaders
        if current_user.role_id == 1 and report and report.subdivision_id:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for leader in leaders:
                if leader.user_id != current_user.user_id:
                    recipient_user_ids.add(leader.user_id)

        for uid in recipient_user_ids:
            notif = Notification(
                user_id=uid,
                title=f"💬 New Message on Report #{report_id}",
                message=f"{current_user.name}: {snippet}",
                type="message",
                related_id=report_id,
                is_read=False
            )
            db.add(notif)
    except Exception as notif_err:
        print(f"Notice: Failed to dispatch message notification: {notif_err}")

    db.commit()
    db.refresh(new_msg)

    return format_message_dict(new_msg, db)


@router.get("/reports/{report_id}/stats", response_model=ChatStatsResponse)
def get_report_chat_stats(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Report",
        ChatThread.related_id == report_id
    ).first()

    if not thread:
        return {
            "thread_id": None,
            "total_messages": 0,
            "unread_messages": 0,
            "is_closed": False
        }

    total = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).count()
    unread = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).count()

    return {
        "thread_id": thread.thread_id,
        "total_messages": total,
        "unread_messages": unread,
        "is_closed": thread.is_closed
    }


@router.patch("/threads/{thread_id}/read")
def mark_thread_messages_as_read(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = db.query(ChatThread).filter(ChatThread.thread_id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).update({"is_read": True})
    db.commit()

    return {"message": "Thread marked as read"}


@router.patch("/reports/{report_id}/read")
def mark_report_messages_as_read(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Report",
        ChatThread.related_id == report_id
    ).first()
    if not thread:
        return {"message": "No thread found"}

    db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).update({"is_read": True})
    db.commit()

    return {"message": "Report messages marked as read"}


@router.get("/matches/{match_id}/thread", response_model=ChatThreadResponse)
def get_match_thread_endpoint(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_match_thread(match_id, current_user, db)
    if not check_user_match_chat_access(match_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    formatted_messages = [format_message_dict(m, db) for m in messages]

    creator = db.query(User).filter(User.user_id == thread.created_by).first()
    recipient = db.query(User).filter(User.user_id == thread.recipient_id).first()

    return {
        "thread_id": thread.thread_id,
        "thread_type": thread.thread_type,
        "related_id": thread.related_id,
        "created_by": thread.created_by,
        "recipient_id": thread.recipient_id,
        "title": thread.title,
        "is_closed": thread.is_closed,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "creator_name": creator.name if creator else None,
        "recipient_name": recipient.name if recipient else None,
        "messages": formatted_messages
    }


@router.get("/matches/{match_id}/messages", response_model=List[ChatMessageResponse])
def get_match_messages(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_match_thread(match_id, current_user, db)
    if not check_user_match_chat_access(match_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    return [format_message_dict(m, db) for m in messages]


@router.post("/matches/{match_id}/messages", response_model=ChatMessageResponse)
async def send_match_message(
    match_id: int,
    message_text: str = Form(...),
    file: Optional[UploadFile] = File(None),
    is_system: Optional[bool] = Form(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_match_thread(match_id, current_user, db)
    if not check_user_match_chat_access(match_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")

    media_url = None
    if file:
        try:
            media_url = upload_to_cloudinary(file, folder="chat_media")
        except Exception:
            upload_dir = "uploads/chat"
            os.makedirs(upload_dir, exist_ok=True)
            ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
            filename = f"{uuid.uuid4().hex}{ext}"
            file_path = os.path.join(upload_dir, filename)
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            media_url = f"http://localhost:8000/uploads/chat/{filename}"

    new_msg = ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,
        message_text=message_text,
        media_url=media_url,
        is_read=False,
        is_system=is_system or False
    )
    db.add(new_msg)

    # Targeted Notification dispatch for Match Chat
    try:
        match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
        pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match and match.matched_pet_id else None
        pet_name = pet.pet_name if pet else "Pet"

        snippet = message_text.strip()
        if not snippet and media_url:
            snippet = "[Photo attached]"
        elif len(snippet) > 80:
            snippet = snippet[:80] + "..."

        target_uid = thread.recipient_id if thread.created_by == current_user.user_id else thread.created_by
        if target_uid and target_uid != current_user.user_id:
            notif = Notification(
                user_id=target_uid,
                title=f"💬 Match Inquiry: {pet_name}",
                message=f"{current_user.name}: {snippet}",
                type="match_message",
                related_id=match.source_report_id if match else match_id,
                is_read=False
            )
            db.add(notif)
    except Exception as notif_err:
        print(f"Notice: Failed to dispatch match chat notification: {notif_err}")

    db.commit()
    db.refresh(new_msg)
    return format_message_dict(new_msg, db)


@router.get("/matches/{match_id}/stats", response_model=ChatStatsResponse)
def get_match_chat_stats(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Direct",
        ChatThread.related_id == match_id
    ).first()

    if not thread:
        return {
            "thread_id": None,
            "total_messages": 0,
            "unread_messages": 0,
            "is_closed": False
        }

    total = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).count()
    unread = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).count()

    return {
        "thread_id": thread.thread_id,
        "total_messages": total,
        "unread_messages": unread,
        "is_closed": thread.is_closed
    }


@router.patch("/matches/{match_id}/read")
def mark_match_messages_as_read(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = db.query(ChatThread).filter(
        ChatThread.thread_type == "Direct",
        ChatThread.related_id == match_id
    ).first()
    if not thread:
        return {"message": "No thread found"}

    db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).update({"is_read": True})
    db.commit()

    return {"message": "Match messages marked as read"}


@router.get("/threads")
def list_user_threads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all accessible chat threads for the current user.
    Separates Report Case threads (with Reporter) and Match Inquiry threads (with Pet Owner).
    """
    results = []
    seen_thread_ids = set()

    # 1. REPORT CASE THREADS (thread_type == 'Report')
    report_query = db.query(ChatThread).filter(ChatThread.thread_type == "Report").join(Report, ChatThread.related_id == Report.report_id)

    if current_user.role_id == 2:
        if current_user.subdivision_id:
            report_query = report_query.filter(Report.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 1:
        # Resident only sees Case Threads for reports they created
        report_query = report_query.filter(Report.user_id == current_user.user_id)

    report_threads = report_query.order_by(ChatThread.updated_at.desc()).all()

    for t in report_threads:
        seen_thread_ids.add(t.thread_id)
        report = db.query(Report).filter(Report.report_id == t.related_id).first()
        reporter = db.query(User).filter(User.user_id == report.user_id).first() if (report and report.user_id) else None
        assigned_leader = db.query(User).filter(User.user_id == report.assigned_leader_id).first() if (report and report.assigned_leader_id) else None

        last_msg = db.query(ChatMessage).filter(ChatMessage.thread_id == t.thread_id).order_by(ChatMessage.sent_at.desc()).first()
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.thread_id == t.thread_id,
            ChatMessage.sender_id != current_user.user_id,
            ChatMessage.is_read == False
        ).count()

        media_url = None
        if report and report.media and len(report.media) > 0:
            media_url = report.media[0].file_url

        memorable_title = generate_memorable_report_title(report, reporter)

        results.append({
            "thread_id": t.thread_id,
            "thread_type": "Report",
            "thread_mode": "report",
            "report_id": t.related_id,
            "match_id": None,
            "title": memorable_title or t.title or f"Report #{t.related_id} Case Coordination",
            "is_closed": t.is_closed,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "report": {
                "report_id": report.report_id if report else t.related_id,
                "user_id": report.user_id if report else None,
                "reporter_name": reporter.name if reporter else "Resident",
                "reporter_photo": reporter.profile_picture if reporter else None,
                "animal_type": report.animal_type if report else None,
                "animal_breed": report.animal_breed if report else None,
                "animal_color": report.animal_color if report else None,
                "category_id": report.category_id if report else None,
                "category_name": report.category.category_name if (report and report.category) else None,
                "status_id": report.status_id if hasattr(report, 'status_id') else (report.current_status_id if report else None),
                "landmark": report.landmark if report else None,
                "street_address": (reporter.address if reporter else None) or (report.subdivision.subdivision_name if (report and report.subdivision) else None),
                "subdivision_name": report.subdivision.subdivision_name if (report and report.subdivision) else None,
                "media_url": media_url,
                "assigned_leader_id": report.assigned_leader_id if report else None,
                "assigned_leader_name": assigned_leader.name if assigned_leader else None
            } if report else None,
            "matched_pet": None,
            "counterpart": {
                "user_id": reporter.user_id if reporter else None,
                "name": reporter.name if reporter else "Reporter",
                "role": "Incident Reporter",
                "avatar": reporter.profile_picture if reporter else None
            },
            "last_message": {
                "message_id": last_msg.message_id,
                "text": last_msg.message_text,
                "sender_id": last_msg.sender_id,
                "sender_name": last_msg.sender.name if last_msg and last_msg.sender else "User",
                "sent_at": last_msg.sent_at,
                "is_read": last_msg.is_read
            } if last_msg else None,
            "unread_count": unread_count
        })

    # 2. MATCH INQUIRY THREADS (thread_type == 'Direct' with related_id == match_id)
    match_query = db.query(ChatThread).filter(ChatThread.thread_type == "Direct").join(ReportMatch, ChatThread.related_id == ReportMatch.match_id).join(Report, ReportMatch.source_report_id == Report.report_id).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id)

    if current_user.role_id == 2:
        if current_user.subdivision_id:
            match_query = match_query.filter(Report.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 1:
        match_query = match_query.filter(Pet.owner_id == current_user.user_id)

    match_threads = match_query.order_by(ChatThread.updated_at.desc()).all()

    for t in match_threads:
        if t.thread_id in seen_thread_ids:
            continue
        seen_thread_ids.add(t.thread_id)

        match = db.query(ReportMatch).filter(ReportMatch.match_id == t.related_id).first()
        if not match:
            continue

        report = db.query(Report).filter(Report.report_id == match.source_report_id).first()
        pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
        owner = db.query(User).filter(User.user_id == pet.owner_id).first() if (pet and pet.owner_id) else None
        reporter = db.query(User).filter(User.user_id == report.user_id).first() if (report and report.user_id) else None
        assigned_leader = db.query(User).filter(User.user_id == report.assigned_leader_id).first() if (report and report.assigned_leader_id) else None

        last_msg = db.query(ChatMessage).filter(ChatMessage.thread_id == t.thread_id).order_by(ChatMessage.sent_at.desc()).first()
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.thread_id == t.thread_id,
            ChatMessage.sender_id != current_user.user_id,
            ChatMessage.is_read == False
        ).count()

        media_url = None
        if report and report.media and len(report.media) > 0:
            media_url = report.media[0].file_url

        memorable_match_title = generate_memorable_match_title(pet, report, reporter)

        matched_pet_info = {
            "pet_id": pet.pet_id if pet else None,
            "pet_name": pet.pet_name if pet else "Candidate Pet",
            "photo_url": pet.photo_url if pet else None,
            "breed": pet.breed if pet else None,
            "color": getattr(pet, "color_markings", None) if pet else None,
            "size": getattr(pet, "size_category", None) if pet else None,
            "owner_id": pet.owner_id if pet else None,
            "owner_name": owner.name if owner else "Pet Owner",
            "similarity_score": match.similarity_score or 95
        }

        results.append({
            "thread_id": t.thread_id,
            "thread_type": "Direct",
            "thread_mode": "match",
            "report_id": match.source_report_id,
            "match_id": match.match_id,
            "title": memorable_match_title or t.title or f"Match Inquiry: {pet.pet_name if pet else 'Pet'} (Report #{match.source_report_id})",
            "is_closed": t.is_closed,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "report": {
                "report_id": report.report_id if report else match.source_report_id,
                "user_id": report.user_id if report else None,
                "reporter_name": reporter.name if reporter else "Resident",
                "reporter_photo": reporter.profile_picture if reporter else None,
                "animal_type": report.animal_type if report else None,
                "animal_breed": report.animal_breed if report else None,
                "animal_color": report.animal_color if report else None,
                "category_id": report.category_id if report else None,
                "category_name": report.category.category_name if (report and report.category) else None,
                "status_id": report.status_id if hasattr(report, 'status_id') else (report.current_status_id if report else None),
                "landmark": report.landmark if report else None,
                "street_address": (reporter.address if reporter else None) or (report.subdivision.subdivision_name if (report and report.subdivision) else None),
                "subdivision_name": report.subdivision.subdivision_name if (report and report.subdivision) else None,
                "media_url": media_url,
                "assigned_leader_id": report.assigned_leader_id if report else None,
                "assigned_leader_name": assigned_leader.name if assigned_leader else None
            } if report else None,
            "matched_pet": matched_pet_info,
            "counterpart": {
                "user_id": owner.user_id if owner else None,
                "name": owner.name if owner else "Pet Owner",
                "role": "Pet Owner",
                "avatar": owner.profile_picture if owner else None
            },
            "last_message": {
                "message_id": last_msg.message_id,
                "text": last_msg.message_text,
                "sender_id": last_msg.sender_id,
                "sender_name": last_msg.sender.name if last_msg and last_msg.sender else "User",
                "sent_at": last_msg.sent_at,
                "is_read": last_msg.is_read
            } if last_msg else None,
            "unread_count": unread_count
        })

    # Sort all threads by latest update
    results.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or datetime.min, reverse=True)
    return results


@router.get("/unread-count")
def get_unread_chat_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread_ids = set()

    if current_user.role_id == 2:
        if current_user.subdivision_id:
            rep_threads = db.query(ChatThread.thread_id).filter(ChatThread.thread_type == "Report").join(Report, ChatThread.related_id == Report.report_id).filter(Report.subdivision_id == current_user.subdivision_id).all()
            for r in rep_threads:
                thread_ids.add(r[0])

            dir_threads = db.query(ChatThread.thread_id).filter(ChatThread.thread_type == "Direct").join(ReportMatch, ChatThread.related_id == ReportMatch.match_id).join(Report, ReportMatch.source_report_id == Report.report_id).filter(Report.subdivision_id == current_user.subdivision_id).all()
            for d in dir_threads:
                thread_ids.add(d[0])

    elif current_user.role_id == 1:
        rep_threads = db.query(ChatThread.thread_id).filter(ChatThread.thread_type == "Report").join(Report, ChatThread.related_id == Report.report_id).filter(Report.user_id == current_user.user_id).all()
        for r in rep_threads:
            thread_ids.add(r[0])

        dir_threads = db.query(ChatThread.thread_id).filter(ChatThread.thread_type == "Direct").join(ReportMatch, ChatThread.related_id == ReportMatch.match_id).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(Pet.owner_id == current_user.user_id).all()
        for d in dir_threads:
            thread_ids.add(d[0])

    if not thread_ids:
        return {"unread_count": 0}

    count = db.query(ChatMessage).filter(
        ChatMessage.thread_id.in_(list(thread_ids)),
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).count()

    return {"unread_count": count}


