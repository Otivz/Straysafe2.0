from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.chat import ChatThread, ChatMessage
from app.models.report import Report, Rescue, RescueAssignment, EndorsementLetter
from app.models.user import User, Subdivision
from app.models.notification import Notification
from app.models.report_match import ReportMatch
from app.models.pet import Pet
from app.schemas.chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse,
    ChatStatsResponse
)
from app.utils.auth import get_current_user
from app.utils.uploads import validate_cloudinary_url

router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)

def sender_role_label(sender: Optional[User]) -> str:
    """Human-readable role label for a chat participant."""
    sender_role = "Citizen"
    if sender:
        if sender.role_id == 2:
            sender_role = "Subdivision Leader"
        elif sender.role_id == 3:
            if sender.position and getattr(sender.position, 'position_name', None):
                sender_role = sender.position.position_name
            elif getattr(sender, 'is_head_officer', False):
                sender_role = "Barangay Head Officer"
            else:
                sender_role = "Barangay Staff"
        elif sender.role_id == 4:
            sender_role = "Admin"
    return sender_role


def format_message_dict(msg: ChatMessage, db: Session) -> dict:
    sender = db.query(User).filter(User.user_id == msg.sender_id).first()
    sender_name = sender.name if sender else "User"
    sender_role = sender_role_label(sender)

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
    pet_name = pet.display_name if pet else "Candidate Pet"
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


def is_report_escalated_to_barangay(report: Optional[Report], db: Session) -> bool:
    """
    Determines if an incident report has been escalated or forwarded to Barangay Operations.
    Subdivision internal reports (Reported, Verified, Rejected) without a rescue or endorsement
    are strictly invisible and inaccessible to Barangay staff.
    """
    if not report:
        return False
    # Direct barangay-level reports (no subdivision) belong to Barangay
    if report.subdivision_id is None:
        return True
    # Rescue mission or request created
    has_rescue = db.query(Rescue.rescue_id).filter(Rescue.report_id == report.report_id).first() is not None
    if has_rescue:
        return True
    # Endorsement letter created/sent
    has_endorsement = db.query(EndorsementLetter.letter_id).filter(EndorsementLetter.report_id == report.report_id).first() is not None
    if has_endorsement:
        return True
    # Escalated or active barangay operational statuses
    status_id = report.current_status_id or getattr(report, 'status_id', None)
    if status_id in [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17]:
        return True
    return False


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
            is_closed=report.status_id in [3, 9, 10, 11, 12, 14]
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

    # Update is_closed if report status changed to resolved/closed
    is_resolved = (report.current_status_id or report.status_id) in [3, 9, 10, 11, 12, 14]
    if thread.is_closed != is_resolved:
        thread.is_closed = is_resolved
        db.commit()

    return thread


def check_user_report_chat_access(report_id: int, current_user: User, thread: ChatThread, db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Admin oversight

    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        return False

    if current_user.role_id == 2:
        # Subdivision Leader: only reports in their subdivision or assigned
        if current_user.subdivision_id and report.subdivision_id == current_user.subdivision_id:
            return True
        if report.assigned_leader_id == current_user.user_id:
            return True
        return False

    if current_user.role_id == 3:
        # Barangay Staff & Responders:
        # Cannot see or access chat if subdivision report is NOT yet escalated to Barangay!
        if not is_report_escalated_to_barangay(report, db):
            return False

        is_head = getattr(current_user, 'is_head_officer', False)
        if is_head:
            if current_user.barangay_id and report.subdivision_id:
                subd = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
                if subd and subd.barangay_id and subd.barangay_id != current_user.barangay_id:
                    return False
            return True

        # Non-head barangay responder: can view if assigned to report or part of rescue
        if is_user_assigned_to_report(report_id, current_user.user_id, db):
            return True
        if current_user.barangay_id and report.subdivision_id:
            subd = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
            if subd and subd.barangay_id and subd.barangay_id == current_user.barangay_id:
                return True
        elif report.subdivision_id is None:
            return True
        return False

    # Citizen (role_id == 1):
    if thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id:
        return True
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


def is_user_assigned_to_report(report_id: int, user_id: int, db: Session) -> bool:
    rescues = db.query(Rescue).filter(Rescue.report_id == report_id).all()
    for r in rescues:
        if r.staff_id == user_id or r.leader_id == user_id:
            return True
        assignment = db.query(RescueAssignment).filter(
            RescueAssignment.rescue_id == r.rescue_id,
            (RescueAssignment.user_id == user_id) | (RescueAssignment.staff_id == user_id)
        ).first()
        if assignment:
            return True
    return False


def can_user_interact_with_report_chat(report_id: int, current_user: User, db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Admin can interact

    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        return False

    if current_user.role_id == 1:
        return report.user_id == current_user.user_id

    if current_user.role_id == 2:
        if current_user.subdivision_id and report.subdivision_id == current_user.subdivision_id:
            return True
        return report.assigned_leader_id == current_user.user_id

    if current_user.role_id == 3:
        # Barangay Staff: cannot send message if report is not yet escalated / sent to Barangay!
        if not is_report_escalated_to_barangay(report, db):
            return False

        if getattr(current_user, 'is_head_officer', False):
            if current_user.barangay_id and report.subdivision_id:
                subd = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
                if subd and subd.barangay_id and subd.barangay_id != current_user.barangay_id:
                    return False
            return True

        return is_user_assigned_to_report(report_id, current_user.user_id, db)

    return False


def find_match_thread(match: ReportMatch, db: Session) -> Optional[ChatThread]:
    """
    The conversation for this look-alike match. For a registered pet: the case's primary conversation about that pet
    (one per pet and case), so every report of the case opens the same chat. Otherwise the match's own thread.
    """
    if match.matched_pet_id:
        from app.utils.case_groups import case_conversation, case_root
        source_report = db.query(Report).filter(Report.report_id == match.source_report_id).first()
        if source_report is not None:
            shared = case_conversation(db, case_root(db, source_report), match.matched_pet_id)
            if shared is not None:
                return shared
    return db.query(ChatThread).filter(ChatThread.thread_type == "Direct", ChatThread.related_id == match.match_id).first()


def get_or_create_match_thread(match_id: int, current_user: User, db: Session) -> ChatThread:
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        existing_thread = db.query(ChatThread).filter(ChatThread.thread_type == "Direct", ChatThread.related_id == match_id).first()
        if existing_thread:
            return existing_thread
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

    thread = find_match_thread(match, db)
    own = db.query(ChatThread).filter(ChatThread.thread_type == "Direct", ChatThread.related_id == match_id).first()
    if own is not None and thread is not None and own.thread_id != thread.thread_id and not own.is_closed:
        # An older duplicate conversation for the same pet and case: keep its history, continue in the case one
        from app.utils.case_groups import case_root, post_case_message
        root = case_root(db, source_report) if source_report else None
        post_case_message(db, own, f"This conversation continues in the Case #{root.report_id if root else ''} conversation.",
                          sender_id=own.created_by)
        own.is_closed = True
        db.commit()

    is_resolved = False
    if source_report:
        # Match threads remain open during "Claimed by Owner" (ID 9) so owner and leader can coordinate handover.
        # Match threads are only closed on final resolution/dismissal (11, 12, 3, 14) of the case.
        from app.utils.case_groups import case_root
        case_status = case_root(db, source_report)
        is_resolved = (case_status.current_status_id or case_status.status_id) in [3, 11, 12, 14]

    if not thread:
        pet_name = pet.display_name if pet else "Pet"
        thread = ChatThread(
            thread_type="Direct",
            related_id=match_id,
            created_by=current_user.user_id,
            recipient_id=recipient_id,
            title=f"Look-Alike Verification: {pet_name} (Report #{match.source_report_id})",
            is_closed=is_resolved
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

        welcome_msg = ChatMessage(
            thread_id=thread.thread_id,
            sender_id=current_user.user_id,
            message_text=f"Direct look-alike verification channel started for Pet '{pet_name}' and Report #{match.source_report_id}.",
            is_system=True,
            is_read=True
        )
        db.add(welcome_msg)
        db.commit()
    elif thread.is_closed != is_resolved:
        thread.is_closed = is_resolved
        db.commit()

    return thread


def check_user_match_chat_access(match_id: int, current_user: User, thread: ChatThread, db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Staff, leaders, admin have access

    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        return thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id

    source_report = db.query(Report).filter(Report.report_id == match.source_report_id).first()

    if current_user.role_id == 2:
        if source_report and source_report.subdivision_id and source_report.subdivision_id == current_user.subdivision_id:
            return True
        if source_report and source_report.assigned_leader_id == current_user.user_id:
            return True
        return thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id

    if current_user.role_id == 3:
        # Barangay Staff: Source report must be escalated to Barangay!
        if not is_report_escalated_to_barangay(source_report, db):
            return False

        if getattr(current_user, 'is_head_officer', False):
            if current_user.barangay_id and source_report and source_report.subdivision_id:
                subd = db.query(Subdivision).filter(Subdivision.subdivision_id == source_report.subdivision_id).first()
                if subd and subd.barangay_id and subd.barangay_id != current_user.barangay_id:
                    return False
            return True

        return is_user_assigned_to_report(match.source_report_id, current_user.user_id, db)

    # Citizen (role_id == 1)
    if thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id:
        return True

    pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
    if pet and pet.owner_id == current_user.user_id:
        return True
    if source_report and source_report.user_id == current_user.user_id:
        return True

    return False


_ROLE_LABELS = {1: "Resident", 2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}


def thread_counterpart(t, current_user, db, fallback_user, fallback_role: str) -> dict:
    """
    The person on the other side of a chat thread, for the signed-in user: whichever of the thread's starter and
    recipient isn't them. Falls back to the given user (e.g. the pet owner) only if the thread doesn't say.
    """
    other_id = None
    if t.created_by and t.created_by != current_user.user_id:
        other_id = t.created_by
    elif t.recipient_id and t.recipient_id != current_user.user_id:
        other_id = t.recipient_id
    other = db.query(User).filter(User.user_id == other_id).first() if other_id else None
    if other is None and fallback_user is not None and fallback_user.user_id != current_user.user_id:
        other = fallback_user
    if other is None:
        return {"user_id": None, "name": "StraySafe Staff" if current_user.role_id == 1 else fallback_role, "role": fallback_role, "avatar": None}
    if fallback_user is not None and other.user_id == fallback_user.user_id:
        role = fallback_role
    else:
        role = _ROLE_LABELS.get(other.role_id, "User")
    return {"user_id": other.user_id, "name": other.name, "role": role, "avatar": other.profile_picture}


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
        "can_interact": can_user_interact_with_report_chat(report_id, current_user, db),
        "is_assigned": is_user_assigned_to_report(report_id, current_user.user_id, db),
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
def send_report_message(
    report_id: int,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_report_thread(report_id, current_user, db)

    if thread.is_closed:
        raise HTTPException(status_code=400, detail="This case has been solved and archived. Chat is in read-only mode.")

    if not check_user_report_chat_access(report_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")

    if not can_user_interact_with_report_chat(report_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only Barangay responders assigned to this report can send messages. Higher role officers have view-all oversight."
        )

    message_text = payload.message_text
    is_system = payload.is_system

    media_url = None
    if payload.media_url:
        # File already lives in Cloudinary (browser uploaded directly via the
        # unsigned preset); just verify the URL is genuinely ours before trusting it.
        validate_cloudinary_url(payload.media_url, allowed={'Image', 'Video', 'Document'})
        media_url = payload.media_url

    new_msg = ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,
        message_text=message_text,
        media_url=media_url,
        is_read=False,
        is_system=is_system or False
    )
    db.add(new_msg)
    thread.updated_at = datetime.now()

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

        # 5. Assigned Barangay Responders and Staff for this report
        rescues = db.query(Rescue).filter(Rescue.report_id == report_id).all()
        for r in rescues:
            if r.staff_id and r.staff_id != current_user.user_id:
                recipient_user_ids.add(r.staff_id)
            if r.leader_id and r.leader_id != current_user.user_id:
                recipient_user_ids.add(r.leader_id)
            assignments = db.query(RescueAssignment).filter(RescueAssignment.rescue_id == r.rescue_id).all()
            for a in assignments:
                if a.user_id and a.user_id != current_user.user_id:
                    recipient_user_ids.add(a.user_id)
                if a.staff_id and a.staff_id != current_user.user_id:
                    recipient_user_ids.add(a.staff_id)

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
        ChatMessage.is_read == False,
        ChatMessage.is_system == False
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

    # Adoption chats are authorized per application; they must use /chat/adoptions/{id}/read.
    if thread.thread_type == "Adoption":
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
def send_match_message(
    match_id: int,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    thread = get_or_create_match_thread(match_id, current_user, db)
    if thread.is_closed:
        raise HTTPException(status_code=400, detail="This pet claim/case has been completed and archived. Chat is in read-only mode.")

    if not check_user_match_chat_access(match_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")

    message_text = payload.message_text
    is_system = payload.is_system

    media_url = None
    if payload.media_url:
        validate_cloudinary_url(payload.media_url, allowed={'Image', 'Video', 'Document'})
        media_url = payload.media_url

    new_msg = ChatMessage(
        thread_id=thread.thread_id,
        sender_id=current_user.user_id,
        message_text=message_text,
        media_url=media_url,
        is_read=False,
        is_system=is_system or False
    )
    db.add(new_msg)
    thread.updated_at = datetime.now()

    # Targeted Notification dispatch for Match Chat
    try:
        match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
        pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match and match.matched_pet_id else None
        pet_name = pet.display_name if pet else "Pet"

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
    _match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    thread = find_match_thread(_match, db) if _match else None

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
        ChatMessage.is_read == False,
        ChatMessage.is_system == False
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
    _match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    thread = find_match_thread(_match, db) if _match else None
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
    seen_report_ids = set()
    seen_match_ids = set()
    assigned_rescue_report_ids = []

    # 1. REPORT CASE THREADS (thread_type == 'Report')
    report_query = db.query(ChatThread).filter(ChatThread.thread_type == "Report").join(Report, ChatThread.related_id == Report.report_id)

    if current_user.role_id == 2:
        if current_user.subdivision_id:
            report_query = report_query.filter(Report.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 1:
        # Resident only sees Case Threads for reports they created
        report_query = report_query.filter(Report.user_id == current_user.user_id)
    elif current_user.role_id == 3:
        # Barangay Staff & Responders:
        is_head = getattr(current_user, 'is_head_officer', False)
        assigned_rescue_report_ids = [
            r[0] for r in db.query(Rescue.report_id).join(
                RescueAssignment, Rescue.rescue_id == RescueAssignment.rescue_id
            ).filter(
                (RescueAssignment.user_id == current_user.user_id) |
                (RescueAssignment.staff_id == current_user.user_id)
            ).all()
        ] + [
            r[0] for r in db.query(Rescue.report_id).filter(
                (Rescue.staff_id == current_user.user_id) | (Rescue.leader_id == current_user.user_id)
            ).all()
        ]

        rescue_rep_ids = [r[0] for r in db.query(Rescue.report_id).all()]
        endorsement_rep_ids = [e[0] for e in db.query(EndorsementLetter.report_id).all()]
        escalated_statuses = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17]

        escalation_filter = or_(
            Report.report_id.in_(rescue_rep_ids),
            Report.report_id.in_(endorsement_rep_ids),
            Report.current_status_id.in_(escalated_statuses),
            Report.subdivision_id.is_(None)
        )

        if is_head:
            # Head Officer (In Charge): can view and interact with all escalated reports in their barangay
            if current_user.barangay_id:
                subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
                report_query = report_query.filter(
                    escalation_filter,
                    or_(
                        Report.report_id.in_(assigned_rescue_report_ids),
                        Report.subdivision_id.in_(subd_ids),
                        Report.subdivision_id.is_(None)
                    )
                )
            else:
                report_query = report_query.filter(
                    escalation_filter,
                    or_(
                        Report.report_id.in_(assigned_rescue_report_ids),
                        Report.subdivision_id.is_(None)
                    )
                )
        else:
            # User NOT in charge: ONLY reports assigned to them that are escalated can appear in the messages!
            if assigned_rescue_report_ids:
                report_query = report_query.filter(
                    escalation_filter,
                    Report.report_id.in_(assigned_rescue_report_ids)
                )
            else:
                report_query = report_query.filter(Report.report_id == -1)

    report_threads = report_query.order_by(ChatThread.updated_at.desc()).all()

    for t in report_threads:
        if t.thread_id in seen_thread_ids or t.related_id in seen_report_ids:
            continue
        seen_thread_ids.add(t.thread_id)
        seen_report_ids.add(t.related_id)
        report = db.query(Report).filter(Report.report_id == t.related_id).first()
        reporter = db.query(User).filter(User.user_id == report.user_id).first() if (report and report.user_id) else None
        assigned_leader = db.query(User).filter(User.user_id == report.assigned_leader_id).first() if (report and report.assigned_leader_id) else None

        last_msg = db.query(ChatMessage).filter(ChatMessage.thread_id == t.thread_id).order_by(ChatMessage.sent_at.desc()).first()
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.thread_id == t.thread_id,
            ChatMessage.sender_id != current_user.user_id,
            ChatMessage.is_read == False,
            ChatMessage.is_system == False
        ).count()

        media_url = None
        if report and report.media and len(report.media) > 0:
            media_url = report.media[0].file_url

        memorable_title = generate_memorable_report_title(report, reporter)

        can_interact = can_user_interact_with_report_chat(report.report_id, current_user, db) if report else True
        is_assigned = is_user_assigned_to_report(report.report_id, current_user.user_id, db) if report else False

        results.append({
            "thread_id": t.thread_id,
            "thread_type": "Report",
            "thread_mode": "report",
            "report_id": t.related_id,
            "match_id": None,
            "title": memorable_title or t.title or f"Report #{t.related_id} Case Coordination",
            "is_closed": t.is_closed,
            "can_interact": can_interact,
            "is_assigned": is_assigned,
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
            "counterpart": thread_counterpart(t, current_user, db, reporter, "Incident Reporter"),
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
    elif current_user.role_id == 3:
        is_head = getattr(current_user, 'is_head_officer', False)
        rescue_rep_ids = [r[0] for r in db.query(Rescue.report_id).all()]
        endorsement_rep_ids = [e[0] for e in db.query(EndorsementLetter.report_id).all()]
        escalated_statuses = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17]

        escalation_filter = or_(
            Report.report_id.in_(rescue_rep_ids),
            Report.report_id.in_(endorsement_rep_ids),
            Report.current_status_id.in_(escalated_statuses),
            Report.subdivision_id.is_(None)
        )

        if is_head:
            if current_user.barangay_id:
                subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
                match_query = match_query.filter(
                    escalation_filter,
                    or_(
                        Report.report_id.in_(assigned_rescue_report_ids),
                        Report.subdivision_id.in_(subd_ids),
                        Report.subdivision_id.is_(None)
                    )
                )
            else:
                match_query = match_query.filter(
                    escalation_filter,
                    or_(
                        Report.report_id.in_(assigned_rescue_report_ids),
                        Report.subdivision_id.is_(None)
                    )
                )
        else:
            if assigned_rescue_report_ids:
                match_query = match_query.filter(
                    escalation_filter,
                    Report.report_id.in_(assigned_rescue_report_ids)
                )
            else:
                match_query = match_query.filter(Report.report_id == -1)

    match_threads = match_query.order_by(ChatThread.updated_at.desc()).all()

    for t in match_threads:
        if t.thread_id in seen_thread_ids or t.related_id in seen_match_ids:
            continue
        seen_thread_ids.add(t.thread_id)
        seen_match_ids.add(t.related_id)

        match = db.query(ReportMatch).filter(ReportMatch.match_id == t.related_id).first()
        if not match:
            continue

        report = db.query(Report).filter(Report.report_id == match.source_report_id).first()
        pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
        owner = db.query(User).filter(User.user_id == pet.owner_id).first() if (pet and pet.owner_id) else None
        reporter = db.query(User).filter(User.user_id == report.user_id).first() if (report and report.user_id) else None
        assigned_leader = db.query(User).filter(User.user_id == report.assigned_leader_id).first() if (report and report.assigned_leader_id) else None
        # Match threads remain open for coordination during Claimed by Owner (ID 9)
        is_resolved = ((report.current_status_id or report.status_id) in [3, 11, 12, 14]) if report else False
        if t.is_closed != is_resolved:
            t.is_closed = is_resolved
            db.commit()

        last_msg = db.query(ChatMessage).filter(ChatMessage.thread_id == t.thread_id).order_by(ChatMessage.sent_at.desc()).first()
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.thread_id == t.thread_id,
            ChatMessage.sender_id != current_user.user_id,
            ChatMessage.is_read == False,
            ChatMessage.is_system == False
        ).count()

        media_url = None
        if report and report.media and len(report.media) > 0:
            media_url = report.media[0].file_url

        memorable_match_title = generate_memorable_match_title(pet, report, reporter)

        matched_pet_info = {
            "pet_id": pet.pet_id if pet else None,
            "pet_name": pet.display_name if pet else "Candidate Pet",
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
            "title": memorable_match_title or t.title or f"Match Inquiry: {pet.display_name if pet else 'Pet'} (Report #{match.source_report_id})",
            "is_closed": t.is_closed,
            "can_interact": True,
            "is_assigned": False,
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
            "counterpart": thread_counterpart(t, current_user, db, owner, "Pet Owner"),
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

    # Sort all threads with newest messages on top
    def get_thread_sort_key(t_dict):
        last_msg = t_dict.get("last_message")
        if last_msg and last_msg.get("sent_at"):
            sent_at = last_msg.get("sent_at")
            if isinstance(sent_at, str):
                try:
                    return datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
                except Exception:
                    pass
            elif isinstance(sent_at, datetime):
                return sent_at
        return t_dict.get("updated_at") or t_dict.get("created_at") or datetime.min

    results.sort(key=get_thread_sort_key, reverse=True)
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

    elif current_user.role_id == 3:
        # Barangay Staff & Responders:
        is_head = getattr(current_user, 'is_head_officer', False)
        rescue_rep_ids = [r[0] for r in db.query(Rescue.report_id).all()]
        endorsement_rep_ids = [e[0] for e in db.query(EndorsementLetter.report_id).all()]
        escalated_statuses = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17]

        escalation_filter = or_(
            Report.report_id.in_(rescue_rep_ids),
            Report.report_id.in_(endorsement_rep_ids),
            Report.current_status_id.in_(escalated_statuses),
            Report.subdivision_id.is_(None)
        )

        assigned_report_ids = [
            r[0] for r in db.query(Rescue.report_id).join(
                RescueAssignment, Rescue.rescue_id == RescueAssignment.rescue_id
            ).filter(
                (RescueAssignment.user_id == current_user.user_id) |
                (RescueAssignment.staff_id == current_user.user_id)
            ).all()
        ] + [
            r[0] for r in db.query(Rescue.report_id).filter(
                (Rescue.staff_id == current_user.user_id) | (Rescue.leader_id == current_user.user_id)
            ).all()
        ]

        if is_head and current_user.barangay_id:
            subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
            rep_threads = db.query(ChatThread.thread_id).filter(
                ChatThread.thread_type == "Report"
            ).join(Report, ChatThread.related_id == Report.report_id).filter(
                escalation_filter,
                or_(
                    Report.report_id.in_(assigned_report_ids),
                    Report.subdivision_id.in_(subd_ids),
                    Report.subdivision_id.is_(None)
                )
            ).all()
            for r in rep_threads:
                thread_ids.add(r[0])

            dir_threads = db.query(ChatThread.thread_id).filter(
                ChatThread.thread_type == "Direct"
            ).join(ReportMatch, ChatThread.related_id == ReportMatch.match_id).join(
                Report, ReportMatch.source_report_id == Report.report_id
            ).filter(
                escalation_filter,
                or_(
                    Report.report_id.in_(assigned_report_ids),
                    Report.subdivision_id.in_(subd_ids),
                    Report.subdivision_id.is_(None)
                )
            ).all()
            for d in dir_threads:
                thread_ids.add(d[0])
        else:
            if assigned_report_ids:
                rep_threads = db.query(ChatThread.thread_id).filter(
                    ChatThread.thread_type == "Report"
                ).join(Report, ChatThread.related_id == Report.report_id).filter(
                    escalation_filter,
                    Report.report_id.in_(assigned_report_ids)
                ).all()
                for r in rep_threads:
                    thread_ids.add(r[0])

                dir_threads = db.query(ChatThread.thread_id).filter(
                    ChatThread.thread_type == "Direct"
                ).join(ReportMatch, ChatThread.related_id == ReportMatch.match_id).join(
                    Report, ReportMatch.source_report_id == Report.report_id
                ).filter(
                    escalation_filter,
                    Report.report_id.in_(assigned_report_ids)
                ).all()
                for d in dir_threads:
                    thread_ids.add(d[0])

    if not thread_ids:
        return {"unread_count": 0}

    count = db.query(ChatMessage).filter(
        ChatMessage.thread_id.in_(list(thread_ids)),
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False,
        ChatMessage.is_system == False
    ).count()

    return {"unread_count": count}



