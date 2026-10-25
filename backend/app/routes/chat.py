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
from app.utils.pet_adoption import owned_through_later_adoption
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


def _report_thumb(report) -> Optional[str]:
    """The picture for a report's chat thread: its main photo (not evidence, a document, a video or a timeline
    attachment); any image if it has no main photo; nothing otherwise. The first file could be a screenshot or PDF."""
    if not report or not report.media:
        return None
    from app.utils.report_split import primary_images
    main = primary_images(report)
    if main:
        return main[0].file_url
    image = next((m for m in report.media if (m.media_type or "Image") == "Image"
                  and not (m.file_url or "").lower().endswith((".pdf", ".doc", ".docx", ".mp4", ".mov", ".webm"))), None)
    return image.file_url if image else None

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


def find_report_thread(report_id: int, db: Session) -> Optional[ChatThread]:
    """The report's case conversation, if one exists (the oldest, if duplicates were ever created)."""
    return db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == report_id) \
        .order_by(ChatThread.thread_id.asc()).first()


def get_or_create_report_thread(report_id: int, current_user: User, db: Session) -> ChatThread:
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Look for existing thread
    thread = find_report_thread(report_id, db)
    if not thread:
        # Serialize concurrent first messages so a single thread is created per report (the same lock as adoption chats)
        db.query(Report.report_id).filter(Report.report_id == report_id).with_for_update().first()
        thread = find_report_thread(report_id, db)

    if not thread:
        # Determine creator and recipient
        reporter_id = report.user_id or current_user.user_id
        if current_user.role_id != 1 and current_user.user_id != reporter_id:
            recipient_id = current_user.user_id
        else:
            recipient_id = default_staff_recipient(db, report, exclude_user_id=reporter_id, fallback_user_id=current_user.user_id)

        thread = ChatThread(
            thread_type="Report",
            related_id=report_id,
            created_by=reporter_id,
            recipient_id=recipient_id,
            title=f"Incident Report #{report_id}",
            is_closed=report_chat_finished(db, report)
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

    # Update is_closed if report status changed to resolved/closed
    is_resolved = report_chat_finished(db, report)
    if thread.is_closed != is_resolved:
        thread.is_closed = is_resolved
        db.commit()

    return thread


def check_user_report_chat_access(report_id: int, current_user: User, thread: Optional[ChatThread], db: Session) -> bool:
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

    # Citizen (role_id == 1): the case chat is confidential between the reporter and staff (message.md Ruling 2, B6).
    # Living in the same subdivision or the report being public does NOT open it.
    if thread is not None and (thread.created_by == current_user.user_id or thread.recipient_id == current_user.user_id):
        return True
    if report.user_id == current_user.user_id:
        return True
    # ...and the owner of the pet the report really is: linked to their pet, or staff confirmed the match and the
    # owner hasn't rejected it. A mere AI suggestion doesn't (the owner has the look-alike match chat for that).
    # (Not when the pet became theirs by adopting it after this report was filed: the conversation between the
    # reporter and the officials is not the adopter's.)
    if report.pet_id and db.query(Pet.pet_id).filter(Pet.pet_id == report.pet_id, Pet.owner_id == current_user.user_id).first() \
            and not owned_through_later_adoption(db, report.pet_id, current_user.user_id, report.created_at):
        return True
    confirmed_pet_ids = [pid for (pid,) in db.query(ReportMatch.matched_pet_id).join(Pet, ReportMatch.matched_pet_id == Pet.pet_id).filter(
        ReportMatch.source_report_id == report_id,
        Pet.owner_id == current_user.user_id,
        ReportMatch.status.in_(("CONFIRMED_MATCH", "COVERED_BY_CASE")),
        ReportMatch.owner_confirmation_status != "OWNER_REJECTED",
    ).all()]
    return any(not owned_through_later_adoption(db, pid, current_user.user_id, report.created_at) for pid in confirmed_pet_ids)


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


def report_chat_send_denied_message(user: User) -> str:
    """Why someone who can read a case chat can't post in it, in words that fit who they are (message.md C2)."""
    if user.role_id == 1:
        return ("Only the person who filed this report can send messages in its case chat. "
                "To talk to staff about your pet, use the look-alike match chat on the sighting page.")
    if user.role_id == 2:
        return ("Only the leader who claimed this case can send messages in its chat. "
                "Claim the case first if it is unassigned; if another leader handles it, you can follow the conversation.")
    if user.role_id == 3:
        return ("Only the responders assigned to this rescue can send messages here during the operation. "
                "You can follow the conversation; ask the head officer to assign you if you need to reply.")
    return "You can read this case chat, but you can't send messages in it."


def can_user_interact_with_report_chat(report_id: int, current_user: User, db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Admin can interact

    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        return False

    if current_user.role_id == 1:
        return report.user_id == current_user.user_id

    if current_user.role_id == 2:
        # Only the leader who claimed the case (its handler) talks to the reporter; others in the subdivision can read
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


def _is_participant(thread: Optional[ChatThread], user: User) -> bool:
    return thread is not None and (thread.created_by == user.user_id or thread.recipient_id == user.user_id)


def existing_match_thread(match_id: int, db: Session) -> Optional[ChatThread]:
    """The match's conversation if one exists, without creating it (for the access check)."""
    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if match is not None:
        return find_match_thread(match, db)
    return db.query(ChatThread).filter(ChatThread.thread_type == "Direct", ChatThread.related_id == match_id).first()


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
        recipient_id = default_staff_recipient(db, source_report, exclude_user_id=current_user.user_id,
                                               fallback_user_id=current_user.user_id)

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

    # Open during "Claimed by Owner" (9) so owner and leader can arrange the pickup; closed once the handover is
    # recorded or the case is finished (judged on the case's main report)
    is_resolved = match_chat_finished(db, match, source_report)

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


def check_user_match_chat_access(match_id: int, current_user: User, thread: Optional[ChatThread], db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Staff, leaders, admin have access

    match = db.query(ReportMatch).filter(ReportMatch.match_id == match_id).first()
    if not match:
        return _is_participant(thread, current_user)

    source_report = db.query(Report).filter(Report.report_id == match.source_report_id).first()

    if current_user.role_id == 2:
        if source_report and source_report.subdivision_id and source_report.subdivision_id == current_user.subdivision_id:
            return True
        if source_report and source_report.assigned_leader_id == current_user.user_id:
            return True
        return _is_participant(thread, current_user)

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
    if _is_participant(thread, current_user):
        return True

    pet = db.query(Pet).filter(Pet.pet_id == match.matched_pet_id).first() if match.matched_pet_id else None
    if pet and pet.owner_id == current_user.user_id and not owned_through_later_adoption(
            db, pet.pet_id, current_user.user_id, source_report.created_at if source_report else None):
        return True
    if source_report and source_report.user_id == current_user.user_id:
        return True

    return False


_ROLE_LABELS = {1: "Resident", 2: "Subdivision Leader", 3: "Barangay Staff", 4: "Admin"}


def thread_counterpart(t, current_user, db, fallback_user, fallback_role: str, users: Optional[dict] = None) -> dict:
    """
    The person on the other side of a chat thread, for the signed-in user: whichever of the thread's starter and
    recipient isn't them. Falls back to the given user (e.g. the pet owner) only if the thread doesn't say.
    """
    other_id = None
    if t.created_by and t.created_by != current_user.user_id:
        other_id = t.created_by
    elif t.recipient_id and t.recipient_id != current_user.user_id:
        other_id = t.recipient_id
    if users is not None and other_id in users:
        other = users[other_id]
    else:
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





# One list of "case finished" statuses for chats (message.md Ruling 6): 3 Rejected, 8 Impounded,
# 10 Released, 11 Resolved, 12 Deceased, 14 False Alarm / Dismissed, 17 Cannot Be Found, 18 Merged (Duplicate).
# Case coordination and look-alike match chats stay open while the owner collects the pet (9 Claimed by Owner)
# to arrange the handover, until the physical handover is recorded (Handover Complete).
REPORT_CHAT_CLOSED_STATUS_IDS = (3, 8, 10, 11, 12, 14, 17, 18)
MATCH_CHAT_CLOSED_STATUS_IDS = (3, 8, 10, 11, 12, 14, 17, 18)


def report_status(report: Optional[Report]) -> Optional[int]:
    """The real status column (current_status_id); status_id is only a response-time alias."""
    if report is None:
        return None
    return getattr(report, "current_status_id", None) or getattr(report, "status_id", None)


def report_chat_finished(db: Session, report: Optional[Report]) -> bool:
    """
    Case coordination chat ends when the case is finished. While the case is "Claimed by Owner" (9),
    the chat stays open so the leader, reporter, and owner can coordinate until the physical handover is recorded
    (an owner return, the claim at Handover Complete / Pet Received, or custody "Reunited").
    """
    if report is None:
        return False
    from app.models.pet_claim import PetClaim
    from app.models.report import ReportReturn
    from app.utils.case_groups import case_members, case_root
    root = case_root(db, report)
    st = report_status(root)
    if st in REPORT_CHAT_CLOSED_STATUS_IDS:
        return True
    if st != 9:
        return False
    if "reunited" in (root.custody_status or "").lower():
        return True
    ids = [m.report_id for m in case_members(db, root)]
    if db.query(ReportReturn.return_id).filter(ReportReturn.report_id.in_(ids)).first():
        return True
    return db.query(PetClaim.claim_id).filter(
        PetClaim.report_id.in_(ids),
        PetClaim.status.in_(("Handover Complete", "Pet Received"))
    ).first() is not None


def match_chat_finished(db: Session, match: Optional[ReportMatch], source_report: Optional[Report]) -> bool:
    """
    A look-alike match chat ends like report and adoption chats: when the case is finished, or, while the case is
    "Claimed by Owner" (kept open so owner and leader can arrange the pickup), once the handover is recorded
    (an owner return, the claim at Handover Complete / Pet Received, or custody "Reunited").
    """
    if source_report is None:
        return False
    from app.models.pet_claim import PetClaim
    from app.models.report import ReportReturn
    from app.utils.case_groups import case_members, case_root
    root = case_root(db, source_report)
    st = report_status(root)
    if st in MATCH_CHAT_CLOSED_STATUS_IDS:
        return True
    if st != 9:
        return False
    if "reunited" in (root.custody_status or "").lower():
        return True
    ids = [m.report_id for m in case_members(db, root)]
    if db.query(ReportReturn.return_id).filter(ReportReturn.report_id.in_(ids)).first():
        return True
    pet_id = match.matched_pet_id if match is not None else None
    q = db.query(PetClaim.claim_id).filter(PetClaim.report_id.in_(ids), PetClaim.status.in_(("Handover Complete", "Pet Received")))
    if pet_id:
        q = q.filter(PetClaim.pet_id == pet_id)
    return q.first() is not None

def default_staff_recipient(db: Session, report: Optional[Report], exclude_user_id: Optional[int], fallback_user_id: int) -> int:
    """
    Who a new conversation is addressed to when nobody specific is: the report's handling leader, else an active
    leader of its subdivision, else active Barangay staff of its barangay, else an active Admin, else the caller.
    Always an existing user (the column is a required foreign key: a made-up id would crash the request).
    """
    from app.models.user import Subdivision
    def first(q):
        if exclude_user_id:
            q = q.filter(User.user_id != exclude_user_id)
        row = q.filter(User.status == "Active").order_by(User.user_id).first()
        return row.user_id if row else None

    if report is not None and report.assigned_leader_id and report.assigned_leader_id != exclude_user_id:
        if db.query(User.user_id).filter(User.user_id == report.assigned_leader_id).first():
            return report.assigned_leader_id
    if report is not None and report.subdivision_id:
        uid = first(db.query(User).filter(User.role_id == 2, User.subdivision_id == report.subdivision_id))
        if uid:
            return uid
        sub = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
        if sub and sub.barangay_id:
            uid = first(db.query(User).filter(User.role_id == 3, User.barangay_id == sub.barangay_id))
            if uid:
                return uid
    uid = first(db.query(User).filter(User.role_id == 4))
    return uid or fallback_user_id

@router.get("/reports/{report_id}/thread", response_model=ChatThreadResponse)
def get_report_thread_endpoint(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check access first (reporter, staff/leader/admin, the pet's owner): a refused caller creates nothing
    if not check_user_report_chat_access(report_id, current_user, find_report_thread(report_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")
    thread = get_or_create_report_thread(report_id, current_user, db)

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
    if not check_user_report_chat_access(report_id, current_user, find_report_thread(report_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")
    thread = get_or_create_report_thread(report_id, current_user, db)

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    return [format_message_dict(m, db) for m in messages]


@router.post("/reports/{report_id}/messages", response_model=ChatMessageResponse)
def send_report_message(
    report_id: int,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not check_user_report_chat_access(report_id, current_user, find_report_thread(report_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this case chat")
    thread = get_or_create_report_thread(report_id, current_user, db)

    if thread.is_closed:
        raise HTTPException(status_code=400, detail="This case has been solved and archived. Chat is in read-only mode.")

    if not can_user_interact_with_report_chat(report_id, current_user, db):
        raise HTTPException(status_code=403, detail=report_chat_send_denied_message(current_user))

    message_text = payload.message_text
    is_system = False  # a person's message is never a system notice: only the server posts those (message.md Ruling 8)

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
    thread = find_report_thread(report_id, db)

    # Someone who may not read the conversation learns nothing about it (not even that it exists)
    if not thread or not check_user_report_chat_access(report_id, current_user, thread, db):
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
    if thread.related_id is None:
        raise HTTPException(status_code=400, detail="Invalid thread association")
    related_id = thread.related_id
    # Only someone who may read this conversation can mark it read (message.md B5)
    allowed = (check_user_report_chat_access(related_id, current_user, thread, db) if thread.thread_type == "Report"
               else check_user_match_chat_access(related_id, current_user, thread, db))
    if not allowed:
        raise HTTPException(status_code=403, detail="You don't have access to this conversation.")

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
    if not check_user_report_chat_access(report_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="You don't have access to this conversation.")

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
    # Check access before a thread exists: a new thread names its caller as creator, which would pass the check
    if not check_user_match_chat_access(match_id, current_user, existing_match_thread(match_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")
    thread = get_or_create_match_thread(match_id, current_user, db)

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
    # Check access before a thread exists: a new thread names its caller as creator, which would pass the check
    if not check_user_match_chat_access(match_id, current_user, existing_match_thread(match_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")
    thread = get_or_create_match_thread(match_id, current_user, db)

    messages = db.query(ChatMessage).filter(ChatMessage.thread_id == thread.thread_id).order_by(ChatMessage.sent_at.asc()).all()
    return [format_message_dict(m, db) for m in messages]


@router.post("/matches/{match_id}/messages", response_model=ChatMessageResponse)
def send_match_message(
    match_id: int,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not check_user_match_chat_access(match_id, current_user, existing_match_thread(match_id, db), db):
        raise HTTPException(status_code=403, detail="Access denied to this match verification chat")
    thread = get_or_create_match_thread(match_id, current_user, db)
    if thread.is_closed:
        raise HTTPException(status_code=400, detail="This pet claim/case has been completed and archived. Chat is in read-only mode.")

    message_text = payload.message_text
    is_system = False  # a person's message is never a system notice: only the server posts those (message.md Ruling 8)

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
    if not check_user_match_chat_access(match_id, current_user, thread, db):
        raise HTTPException(status_code=403, detail="You don't have access to this conversation.")

    db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.thread_id,
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False
    ).update({"is_read": True})
    db.commit()

    return {"message": "Match messages marked as read"}


class _ThreadListContext:
    """
    Everything the thread list needs, loaded in a few queries instead of ~14 per thread: reports (with category,
    subdivision, media), users, each thread's last message and unread count, and the viewer's escalation/assignment
    facts. Also applies report visibility rule 3: a resident never gets another resident's name, photo or address.
    """

    def __init__(self, db: Session, user: User):
        self.db, self.user = db, user
        self.reports: dict = {}
        self.users: dict = {}
        self.last_messages: dict = {}
        self.unread: dict = {}
        self.assigned_report_ids = set(
            [r for (r,) in db.query(Rescue.report_id).join(RescueAssignment, Rescue.rescue_id == RescueAssignment.rescue_id).filter(
                (RescueAssignment.user_id == user.user_id) | (RescueAssignment.staff_id == user.user_id)).all()]
            + [r for (r,) in db.query(Rescue.report_id).filter(
                (Rescue.staff_id == user.user_id) | (Rescue.leader_id == user.user_id)).all()])
        self._escalated_ids: Optional[set] = None
        self._subd_barangay: Optional[dict] = None

    def load_reports(self, ids):
        from sqlalchemy.orm import joinedload, selectinload
        ids = {i for i in ids if i}
        if ids:
            for r in self.db.query(Report).options(joinedload(Report.category), joinedload(Report.subdivision),
                                                   selectinload(Report.media)).filter(Report.report_id.in_(ids)).all():
                self.reports[r.report_id] = r

    def load_users(self, ids):
        ids = {i for i in ids if i} - set(self.users)
        if ids:
            for u in self.db.query(User).filter(User.user_id.in_(ids)).all():
                self.users[u.user_id] = u

    def load_thread_messages(self, thread_ids):
        from sqlalchemy import func
        from sqlalchemy.orm import joinedload
        ids = {i for i in thread_ids if i}
        if not ids:
            return
        last_ids = [m for (m,) in self.db.query(func.max(ChatMessage.message_id)).filter(
            ChatMessage.thread_id.in_(ids)).group_by(ChatMessage.thread_id).all()]
        if last_ids:
            for m in self.db.query(ChatMessage).options(joinedload(ChatMessage.sender)).filter(
                    ChatMessage.message_id.in_(last_ids)).all():
                self.last_messages[m.thread_id] = m
        self.unread = {
            tid: count for tid, count in self.db.query(
                ChatMessage.thread_id, func.count(ChatMessage.message_id)
            ).filter(
                ChatMessage.thread_id.in_(ids),
                ChatMessage.sender_id != self.user.user_id,
                ChatMessage.is_read == False,
                ChatMessage.is_system == False,  # noqa: E712
            ).group_by(ChatMessage.thread_id).all()
        }

    def _escalated(self, report) -> bool:
        """Same rule as is_report_escalated_to_barangay(), from two queries for the whole list."""
        if report.subdivision_id is None:
            return True
        if self._escalated_ids is None:
            self._escalated_ids = ({r for (r,) in self.db.query(Rescue.report_id).all()}
                                   | {r for (r,) in self.db.query(EndorsementLetter.report_id).all()})
        return (report.report_id in self._escalated_ids
                or (report.current_status_id or getattr(report, "status_id", None)) in [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17])

    def can_interact(self, report) -> bool:
        """Same answers as can_user_interact_with_report_chat(), without a query per thread."""
        u = self.user
        if u.role_id == 4:
            return True
        if u.role_id == 1:
            return report.user_id == u.user_id
        if u.role_id == 2:
            return report.assigned_leader_id == u.user_id
        if u.role_id == 3:
            if not self._escalated(report):
                return False
            if getattr(u, "is_head_officer", False):
                if u.barangay_id and report.subdivision_id:
                    if self._subd_barangay is None:
                        self._subd_barangay = {
                            sid: bid for sid, bid in self.db.query(
                                Subdivision.subdivision_id, Subdivision.barangay_id
                            ).all()
                        }
                    brgy = self._subd_barangay.get(report.subdivision_id)
                    if brgy and brgy != u.barangay_id:
                        return False
                return True
            return report.report_id in self.assigned_report_ids
        return False

    def report_summary(self, report, reporter, assigned_leader, media_url) -> dict:
        subd_name = report.subdivision.subdivision_name if report.subdivision else None
        # Report visibility rule 3: another resident (e.g. a pet owner in a match chat) never gets the reporter's
        # name, photo or home address
        hide_reporter = self.user.role_id == 1 and report.user_id != self.user.user_id
        return {
            "report_id": report.report_id,
            "user_id": None if hide_reporter else report.user_id,
            "reporter_name": "Community Reporter" if hide_reporter else (reporter.name if reporter else "Resident"),
            "reporter_photo": None if hide_reporter else (reporter.profile_picture if reporter else None),
            "animal_type": report.animal_type,
            "animal_breed": report.animal_breed,
            "animal_color": report.animal_color,
            "category_id": report.category_id,
            "category_name": report.category.category_name if report.category else None,
            "status_id": report.status_id if hasattr(report, 'status_id') else report.current_status_id,
            "landmark": report.landmark,
            "street_address": subd_name if hide_reporter else ((reporter.address if reporter else None) or subd_name),
            "subdivision_name": subd_name,
            "media_url": media_url,
            "assigned_leader_id": report.assigned_leader_id,
            "assigned_leader_name": assigned_leader.name if assigned_leader else None,
        }

    @staticmethod
    def message_summary(last_msg) -> Optional[dict]:
        if not last_msg:
            return None
        return {
            "message_id": last_msg.message_id,
            "text": last_msg.message_text,
            "sender_id": last_msg.sender_id,
            "sender_name": last_msg.sender.name if last_msg.sender else "User",
            "sent_at": last_msg.sent_at,
            "is_read": last_msg.is_read,
        }


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
    ctx = _ThreadListContext(db, current_user)
    ctx.load_reports([t.related_id for t in report_threads])
    ctx.load_thread_messages([t.thread_id for t in report_threads])

    # Find any active / top match with a registered pet for these reports
    rep_ids = [t.related_id for t in report_threads]
    matches_by_report_id = {}
    if rep_ids:
        report_matches = db.query(ReportMatch).filter(
            ReportMatch.source_report_id.in_(rep_ids),
            ReportMatch.matched_pet_id.isnot(None)
        ).order_by(ReportMatch.similarity_score.desc()).all()
        for rm in report_matches:
            if rm.source_report_id not in matches_by_report_id:
                matches_by_report_id[rm.source_report_id] = rm

    matched_pet_ids = {rm.matched_pet_id for rm in matches_by_report_id.values() if rm.matched_pet_id}
    matched_pets_by_id = {p.pet_id: p for p in db.query(Pet).filter(Pet.pet_id.in_(matched_pet_ids)).all()} if matched_pet_ids else {}

    ctx.load_users([u for t in report_threads for u in (t.created_by, t.recipient_id)]
                   + [u for r in ctx.reports.values() for u in (r.user_id, r.assigned_leader_id)]
                   + [p.owner_id for p in matched_pets_by_id.values() if p.owner_id])

    for t in report_threads:
        if t.thread_id in seen_thread_ids or t.related_id in seen_report_ids:
            continue
        seen_thread_ids.add(t.thread_id)
        seen_report_ids.add(t.related_id)
        report = ctx.reports.get(t.related_id)
        if report:
            is_resolved = report_chat_finished(db, report)
            if t.is_closed != is_resolved:
                t.is_closed = is_resolved
                db.commit()
        reporter = ctx.users.get(report.user_id) if (report and report.user_id) else None
        assigned_leader = ctx.users.get(report.assigned_leader_id) if (report and report.assigned_leader_id) else None
        last_msg = ctx.last_messages.get(t.thread_id)
        unread_count = ctx.unread.get(t.thread_id, 0)

        media_url = _report_thumb(report)

        memorable_title = generate_memorable_report_title(report, reporter)

        can_interact = ctx.can_interact(report) if report else True
        is_assigned = (report.report_id in ctx.assigned_report_ids) if report else False

        report_match = matches_by_report_id.get(t.related_id)
        matched_pet_info = None
        match_id_val = None
        if report_match and report_match.matched_pet_id:
            mpet = matched_pets_by_id.get(report_match.matched_pet_id)
            if mpet:
                mowner = ctx.users.get(mpet.owner_id)
                matched_pet_info = {
                    "pet_id": mpet.pet_id,
                    "pet_name": mpet.display_name,
                    "photo_url": mpet.photo_url,
                    "breed": mpet.breed,
                    "color": getattr(mpet, "color_markings", None),
                    "size": getattr(mpet, "size_category", None),
                    "owner_id": mpet.owner_id,
                    "owner_name": mowner.name if mowner else "Pet Owner",
                    "similarity_score": report_match.similarity_score or 95
                }
                match_id_val = report_match.match_id

        results.append({
            "thread_id": t.thread_id,
            "thread_type": "Report",
            "thread_mode": "report",
            "report_id": t.related_id,
            "match_id": None,
            "linked_match_id": match_id_val,
            "title": memorable_title or t.title or f"Report #{t.related_id} Case Coordination",
            "is_closed": t.is_closed,
            "can_interact": can_interact,
            "is_assigned": is_assigned,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "report": ctx.report_summary(report, reporter, assigned_leader, media_url) if report else None,
            "matched_pet": matched_pet_info,
            "counterpart": thread_counterpart(t, current_user, db, reporter, "Incident Reporter", users=ctx.users),
            "last_message": ctx.message_summary(last_msg),
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
    mctx = _ThreadListContext(db, current_user)
    matches_by_id = {m.match_id: m for m in db.query(ReportMatch).filter(
        ReportMatch.match_id.in_({t.related_id for t in match_threads} or {-1})).all()}
    pets_by_id = {p.pet_id: p for p in db.query(Pet).filter(
        Pet.pet_id.in_({m.matched_pet_id for m in matches_by_id.values() if m.matched_pet_id} or {-1})).all()}
    mctx.load_reports([m.source_report_id for m in matches_by_id.values()])
    mctx.load_thread_messages([t.thread_id for t in match_threads])
    mctx.load_users([u for t in match_threads for u in (t.created_by, t.recipient_id)]
                    + [u for r in mctx.reports.values() for u in (r.user_id, r.assigned_leader_id)]
                    + [p.owner_id for p in pets_by_id.values()])

    for t in match_threads:
        match_id = t.related_id
        if match_id is None:
            continue
        if t.thread_id in seen_thread_ids or match_id in seen_match_ids:
            continue
        seen_thread_ids.add(t.thread_id)
        seen_match_ids.add(match_id)

        match = matches_by_id.get(match_id)
        if not match:
            continue

        report = mctx.reports.get(match.source_report_id)
        pet = pets_by_id.get(match.matched_pet_id) if match.matched_pet_id else None
        owner = mctx.users.get(pet.owner_id) if (pet and pet.owner_id) else None
        reporter = mctx.users.get(report.user_id) if (report and report.user_id) else None
        assigned_leader = mctx.users.get(report.assigned_leader_id) if (report and report.assigned_leader_id) else None
        # Open during Claimed by Owner (9) for the pickup, closed once the handover is recorded or the case finished
        is_resolved = match_chat_finished(db, match, report)
        if t.is_closed != is_resolved:
            t.is_closed = is_resolved
            db.commit()

        last_msg = mctx.last_messages.get(t.thread_id)
        unread_count = mctx.unread.get(t.thread_id, 0)

        media_url = _report_thumb(report)

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
            "report": mctx.report_summary(report, reporter, assigned_leader, media_url) if report else None,
            "matched_pet": matched_pet_info,
            "counterpart": thread_counterpart(t, current_user, db, owner, "Pet Owner", users=mctx.users),
            "last_message": mctx.message_summary(last_msg),
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

    elif current_user.role_id == 4:
        # Admin: global oversight of report and look-alike match chats (the same threads GET /chat/threads lists)
        thread_ids.update(t[0] for t in db.query(ChatThread.thread_id).filter(ChatThread.thread_type.in_(("Report", "Direct"))).all())

    if not thread_ids:
        return {"unread_count": 0}

    count = db.query(ChatMessage).filter(
        ChatMessage.thread_id.in_(list(thread_ids)),
        ChatMessage.sender_id != current_user.user_id,
        ChatMessage.is_read == False,
        ChatMessage.is_system == False
    ).count()

    return {"unread_count": count}



