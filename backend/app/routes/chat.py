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
    is_resolved = report.status_id in [9, 10, 11, 12]
    if thread.is_closed != is_resolved:
        thread.is_closed = is_resolved
        db.commit()

    return thread


@router.get("/reports/{report_id}/thread", response_model=ChatThreadResponse)
def get_report_thread_endpoint(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_report_thread(report_id, current_user, db)
    
    # Check access: Only reporter or staff/leader/admin
    if current_user.role_id == 1 and thread.created_by != current_user.user_id and thread.recipient_id != current_user.user_id:
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
    
    if current_user.role_id == 1 and thread.created_by != current_user.user_id and thread.recipient_id != current_user.user_id:
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

    if current_user.role_id == 1 and thread.created_by != current_user.user_id and thread.recipient_id != current_user.user_id:
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

