"""
Which notifications are pushed, what the lock screen shows, and where a tap goes
(PUSH_NOTIFICATION_IMPLEMENTATION.md R1, R3, R4).
"""
import re
from typing import Optional

REPORTS, RESCUES, PET_MATCHES, CLAIMS, ADOPTIONS, MESSAGES, SYSTEM = (
    "reports", "rescues", "pet_matches", "claims", "adoptions", "messages", "system")
# category -> preference column
PREF_COLUMN = {
    REPORTS: "push_reports", RESCUES: "push_rescues", PET_MATCHES: "push_pet_matches",
    CLAIMS: "push_claims", ADOPTIONS: "push_adoptions", MESSAGES: "push_messages",
}

_TYPE_CATEGORY = {
    # Reports
    "status_update": REPORTS, "status_change": REPORTS, "report_status": REPORTS, "report_visibility": REPORTS,
    "comment": REPORTS, "report_claimed": REPORTS, "report_takeover": REPORTS, "report_transfer_request": REPORTS,
    "report_transfer_accepted": REPORTS, "report_transfer_rejected": REPORTS, "unassigned_report_alert": REPORTS,
    "enforcement": REPORTS,
    # Rescues
    "rescue_assignment": RESCUES, "alert": RESCUES, "holding_overdue_alert": RESCUES,
    # Pet matches
    "potential_match": PET_MATCHES, "pet_owner_confirmation": PET_MATCHES, "pet_owner_confirmation_result": PET_MATCHES,
    "wrong_identity": PET_MATCHES, "qr_recovery_request": PET_MATCHES, "reunion_photo_requested": PET_MATCHES,
    # Claims
    "claim": CLAIMS,
    # Messages
    "message": MESSAGES, "match_message": MESSAGES, "adoption_chat": MESSAGES,
    # "Send test notification" (only the master switch applies)
    "push_test": SYSTEM,
}
NEVER_PUSHED = {"security", "operation"}

MAX_BODY = 120
GENERIC_TITLE = "StraySafe"
GENERIC_BODY = "You have a new StraySafe update. Open the app to see it."
TTL_SECONDS = 24 * 3600


def category_for(ntype: Optional[str]) -> Optional[str]:
    """The push category of a notification type, or None (not pushed). New types are opt-in."""
    t = (ntype or "").strip().lower()
    if not t or t in NEVER_PUSHED:
        return None
    if t in _TYPE_CATEGORY:
        return _TYPE_CATEGORY[t]
    if t.startswith("adoption") or t.startswith("adopter"):
        return ADOPTIONS
    return None


# ---- lock-screen text (R3) ---------------------------------------------------------------------------------------
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}")


def scrub_contact(text: str) -> str:
    """Never an email address or phone number on a lock screen."""
    return _PHONE.sub("[number hidden]", _EMAIL.sub("[email hidden]", text or ""))


def contains_contact(text: str) -> bool:
    return bool(_EMAIL.search(text or "") or _PHONE.search(text or ""))


def push_text(title: Optional[str], message: Optional[str], show_preview: bool = True) -> tuple[str, str]:
    """(title, body) for the device: short, no contact details; generic when the user hides previews."""
    if not show_preview:
        return GENERIC_TITLE, GENERIC_BODY
    t = scrub_contact((title or GENERIC_TITLE).strip())[:80] or GENERIC_TITLE
    body = scrub_contact(" ".join((message or "").split()))
    if len(body) > MAX_BODY:
        body = body[:MAX_BODY - 1].rstrip() + "…"
    return t, body or GENERIC_BODY


def push_tag(ntype: Optional[str], related_id: Optional[int]) -> str:
    """Pushes about the same thing replace each other on the device (R6)."""
    cat = category_for(ntype) or "general"
    return f"{cat}-{related_id}" if related_id else f"{cat}-general"


# ---- where a tap goes (R4): the same pages the notification bells open -----------------------------------------
def notification_link(role_id: int, ntype: Optional[str], related_id: Optional[int], title: str = "") -> str:
    t = (ntype or "").lower()
    ti = (title or "").lower()
    rid = related_id
    if role_id == 1:  # Resident (ResiNavbar)
        if t == "pet_owner_confirmation":
            return "/resident/pets"
        if t == "adoption_available_again" and rid:
            return f"/adopt/apply/{rid}"
        if t.startswith("adoption") and rid:
            return f"/adopt/applications?adoption={rid}" + ("&chat=1" if t == "adoption_chat" else "")
        if t == "status_update" and rid:
            return f"/resident/reports/{rid}"
        if t == "match_message" and rid:
            return f"/resident/reports/{rid}/match-review?openChat=true"
        if t == "potential_match" and rid:
            return f"/resident/reports/{rid}/match-review"
        if t == "reunion_photo_requested" and rid:
            return f"/resident/reports/{rid}?openReunited=true"
        if t in ("message", "comment") and rid:
            return f"/resident/reports/{rid}?openChat=true"
        if t in ("alert", "qr_recovery_request") and rid:
            return f"/resident/pet/{rid}/scan-history"
        return f"/resident/reports/{rid}" if rid else "/resident-home"
    if role_id == 2:  # Subdivision Leader (SubdNavbar)
        if t == "pet_owner_confirmation_result":
            return "/subd/pet-records"
        if t in ("message", "comment"):
            return f"/subd/reports/{rid}?openChat=true" if rid else "/subd/reports?openChat=true"
        if t == "claim":
            return "/subd/pet-claims"
        return f"/subd/reports/{rid}" if rid else "/subd/reports"
    if role_id == 3:  # Barangay Staff (BrgyNavbar)
        if t.startswith("adoption_task_") and t in ("adoption_task_assigned", "adoption_task_reassigned",
                                                    "adoption_task_cancelled", "adoption_task_updated"):
            return "/brgy/adoption-tasks"
        if t == "pet_owner_confirmation_result":
            return "/brgy/pet-records"
        if t == "adoption_chat" and rid:
            return f"/brgy/messages?adoptionId={rid}"
        if t.startswith("adoption") and rid:
            return f"/brgy/adoptions?view={rid}"
        if "holding" in t or "holding" in ti or "impound" in t:
            return "/brgy/holding-facility"
        if "adopt" in t or "adopt" in ti:
            return "/brgy/adoptions"
        if "claim" in t:
            return "/brgy/pet-claims"
        return f"/brgy/reports/{rid}" if rid else "/brgy/dashboard"
    # Admin
    return f"/admin/reports/{rid}" if rid and category_for(t) in (REPORTS, RESCUES) else "/admin/dashboard"
