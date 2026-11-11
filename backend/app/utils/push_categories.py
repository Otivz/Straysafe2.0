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
    # Case activity (preference column push_rescues)
    "alert": RESCUES,
    # Pet matches
    "lost_pet_alert": PET_MATCHES, "lost_pet_sighting": PET_MATCHES, "lost_pet_alert_request": PET_MATCHES,
    "lost_pet_secured": PET_MATCHES, "lost_pet_coordination": PET_MATCHES, "lost_pet_recovered": PET_MATCHES, "lost_pet_leader": PET_MATCHES,
    "potential_match": PET_MATCHES, "pet_owner_confirmation": PET_MATCHES, "pet_owner_confirmation_result": PET_MATCHES,
    "pet_match_confirmation": PET_MATCHES, "pet_match_confirmation_result": PET_MATCHES, "leader_identity_verified": PET_MATCHES,
    "wrong_identity": PET_MATCHES, "reunion_photo_requested": PET_MATCHES,
    # Claims
    "claim": CLAIMS,
    # Messages
    "message": MESSAGES, "match_message": MESSAGES,
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


# ---- where a tap goes (R4): a screen of the StraySafe 2.0 interface of that role --------------------------------
# The Resident app and the Subdivision Leader app (frontend/src/live/config.ts). A resident's report screen is addressed by the case
# reference (SS-<year>-<id>), which a push does not know, so it opens the list; a Leader's case screen accepts the bare report id.
RESIDENT_APP = "/resident-app"
LEADER_APP = ""


def notification_link(role_id: int, ntype: Optional[str], related_id: Optional[int], title: str = "") -> str:
    t = (ntype or "").lower()
    rid = related_id
    if role_id == 1:  # Resident app
        if t in ("pet_owner_confirmation", "pet_match_confirmation"):
            return f"{RESIDENT_APP}/pets"
        if t in ("lost_pet_alert", "lost_pet_secured", "lost_pet_coordination", "lost_pet_recovered"):
            return f"{RESIDENT_APP}/community/alert-{rid}" if rid else f"{RESIDENT_APP}/community"
        if t == "lost_pet_sighting":
            return f"{RESIDENT_APP}/community/alert-{rid}/sightings" if rid else f"{RESIDENT_APP}/community"
        return f"{RESIDENT_APP}/reports" if rid else f"{RESIDENT_APP}/home"
    if role_id == 2:  # Subdivision Leader app
        if t == "pet_owner_confirmation_result":
            return f"{LEADER_APP}/pets"
        if t in ("lost_pet_alert", "lost_pet_sighting", "lost_pet_alert_request"):
            return f"{LEADER_APP}/community"
        # lost_pet_leader carries the REPORT id: the Leader's case screen (the default below)
        return f"{LEADER_APP}/cases/{rid}" if rid else f"{LEADER_APP}/cases"
    # No other role has an interface: retired Barangay accounts are never pushed to, and the Administrator has no screen yet.
    return "/"
