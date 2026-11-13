"""
The Lost Pet lifecycle (docs/01-system/LOST_PET_LIFECYCLE.md), in one place.

    REGISTERED PET -> REPORT (case + Community notice, at once) -> SIGHTINGS and POSSIBLE RECOVERY LEADS
        -> COORDINATION (direct, or through the Leader) -> THE OWNER CONFIRMS THE PET IS HOME -> notice resolved, case closed

Rules kept here, on the server, whatever any screen shows:
  - filing a Lost Pet report publishes its Community notice in the SAME transaction: no approval, no acknowledgment, and a
    successful report never exists without an active notice
  - an ordinary sighting ("I saw this pet") reaches the owner and the case activity and nothing else: no chat, no Leader task
  - "I may have this pet safely with me" is a possible-recovery LEAD (a sighting of another type). It never marks anything
    recovered. Only the owner and the Leader read it, and where the pet is being kept (the care note) stays with them
  - the owner and the finder may message each other only while BOTH agreed (mode direct). Either one may instead ask the
    Leader to help, with no reason (mode leader), and direct messaging is then over. The Leader never reads the messages
  - recovery has ONE operation (`confirm_recovery`): the owner confirms in the app, or the Leader records what the owner
    confirmed by phone or in person. A sighting, a lead, a Barangay update or a generic case closure never establishes it
  - what neighbors read is masked of phone numbers, e-mail addresses and house numbers (utils/public_text.py)
"""
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.lost_pet_alert import LostPetAlert, LostPetCoordination, LostPetCoordinationMessage, LostPetSighting
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, StatusHistory
from app.models.user import Subdivision, User
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.audit import log_activity
from app.utils.public_text import redact_public_text

logger = logging.getLogger(__name__)

REQUESTED, ACTIVE, CLOSED = "requested", "active", "closed"
OPEN_ALERT = (REQUESTED, ACTIVE)
CONTACT_TEXT = {
    "app_message": "Message the owner through StraySafe (open the alert and use the chat).",
    "through_leader": "Tell your Subdivision Leader; they will contact the owner.",
}
SIGHTING_TYPES = ("seen", "secured")
RECOVERY_SOURCES = ("owner_app", "phone", "in_person")
MAX_FUTURE = timedelta(minutes=5)           # clock skew allowed on a time a person reports
MAX_BEFORE_REPORT = timedelta(days=3)       # an earlier sighting can't predate the report by more than this
MESSAGE_LIMIT = 1000


# ================================================================================================================ helpers
def db_now(db: Session) -> datetime:
    from app.utils.db_clock import db_now as _now
    return _now(db)


def manila_now() -> datetime:
    """Times residents type (last seen, sighting time, "confirmed on") are Philippine local time; they are checked against it."""
    from datetime import timezone
    return datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)


def generalize_coord(value):
    """A coordinate rounded to about 110 m. (report_visibility registers a flush listener when it is imported, so it is imported when first
    needed and never inside a flush: the closure hook below calls into this module while a flush is running.)"""
    from app.utils.report_visibility import generalize_coord as _generalize
    return _generalize(value)


def iso(v: Optional[datetime]) -> Optional[str]:
    return v.isoformat() if v else None


def num(v) -> Optional[float]:
    return float(v) if v is not None else None


def fmt_time(v: Optional[datetime]) -> str:
    return v.strftime("%I:%M %p").lstrip("0") if v else "unknown time"


def fmt_date(v: Optional[datetime]) -> str:
    return f"{v.strftime('%B')} {v.day}, {v.year}" if v else ""


def owner_ids(db: Session, report: Report) -> set:
    ids = {report.user_id} if report.user_id else set()
    if report.pet_id:
        pet = db.get(Pet, report.pet_id)
        from app.utils.pet_ownership import became_owner_after
        if pet and pet.owner_id and not became_owner_after(db, pet.pet_id, pet.owner_id, report.created_at):
            ids.add(pet.owner_id)
    return ids


def is_leader_of(user: User, subdivision_id: Optional[int]) -> bool:
    return user.role_id == 4 or (user.role_id == 2 and bool(user.subdivision_id) and user.subdivision_id == subdivision_id)


def is_owner(db: Session, user: User, alert: LostPetAlert) -> bool:
    # The case and its conversations belong to the owner who filed it, not to a later owner of the registry record.
    return user.user_id == alert.owner_id or user.user_id == alert.report.user_id


def lock_case(db: Session, report_id: int) -> Report:
    """Serialize missing-pet mutations in pet -> report -> alert -> coordination order. Refresh ORM instances after waiting.

    A SELECT FOR UPDATE alone does not refresh an already-loaded SQLAlchemy instance; populate_existing is required for a
    second recovery request to observe the first one's committed result. SQLite ignores the lock; MySQL supplies the ordering.
    """
    with db.no_autoflush:
        row = db.query(Report.pet_id).filter(Report.report_id == report_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        if row.pet_id is not None:
            db.query(Pet).filter(Pet.pet_id == row.pet_id).populate_existing().with_for_update().first()
        report = db.query(Report).filter(Report.report_id == report_id).populate_existing().with_for_update().first()
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        return report


def lock_alert(db: Session, alert: LostPetAlert) -> LostPetAlert:
    lock_case(db, alert.report_id)
    with db.no_autoflush:
        locked = db.query(LostPetAlert).filter(LostPetAlert.alert_id == alert.alert_id).populate_existing().with_for_update().first()
        if locked is None:
            raise HTTPException(status_code=404, detail="Neighborhood alert not found.")
        return locked


def leader_ids(db: Session, subdivision_id: int) -> List[int]:
    return [u for (u,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == subdivision_id, User.status == "Active").all()]


_PLACE_PREPOSITIONS = re.compile(r"^(near|behind|beside|by|at|on|in|inside|outside|under|along|across|opposite|next to|in front of)\s", re.I)


def place_phrase(label: Optional[str]) -> str:
    """A place a resident typed, as part of a sentence: "near Gate 2", and "behind the chapel" as written (never "near Near the court")."""
    text = (label or "").strip()
    if not text:
        return ""
    if _PLACE_PREPOSITIONS.match(text):
        return text[0].lower() + text[1:]
    return f"near {text}"


def first_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    u = db.get(User, user_id) if user_id else None
    return ((u.name or "").split(" ")[0] or None) if u else None


def notify(db: Session, user_ids: Iterable[Optional[int]], ntype: str, related_id: int, title: str, message: str, skip: Optional[int] = None) -> int:
    """One in-app notification per distinct user. `related_id` is the ALERT id for the types residents open in the Community
    (lost_pet_alert, lost_pet_sighting, lost_pet_secured, lost_pet_coordination, lost_pet_recovered) and the REPORT id for
    lost_pet_leader (the Leader's case screen)."""
    sent = 0
    for uid in dict.fromkeys(u for u in user_ids if u and u != skip):
        db.add(Notification(user_id=uid, type=ntype, related_id=related_id, title=title[:255], message=message[:1000]))
        sent += 1
    return sent


def history_line(db: Session, report: Report, actor: Optional[User], remarks: str) -> None:
    """A neutral line on the case timeline (residents read it: never a name, a reason, a phone number or a private note)."""
    db.add(StatusHistory(report_id=report.report_id, report_status_id=report.current_status_id,
                         updated_by=actor.user_id if actor else None, remarks=remarks))


def is_lost_pet_case(report: Optional[Report]) -> bool:
    return V.is_lost_pet_report(report)


# ================================================================================================================== views
def pet_card(db: Session, alert: LostPetAlert, privileged: bool = True) -> Dict[str, Any]:
    """
    What neighbors need to recognize the pet: the pet record if linked, else what the owner reported. Every free-text field is
    masked of contact details. For a found animal the distinguishing marks and the finder's own words are NOT shown to
    neighbors: they are how the real owner proves the animal is theirs.
    """
    rep, pet = alert.report, alert.pet
    found = alert.alert_type == "found_animal"
    photo = None
    if pet is not None:
        photo = pet.photo_url or pet.photo_front_url
    if not photo and rep is not None:
        photo = next((m.file_url for m in (rep.media or []) if m.file_url and m.media_type in ("Image", None)), None)
    user_color = (pet.color_markings or "").strip() if pet else ""
    fallback_colors = [c for c in ((pet.primary_color if pet else None), (pet.secondary_color if pet else None)) if c]
    color_str = user_color or (", ".join(dict.fromkeys(fallback_colors)) if fallback_colors else None) or (rep.animal_color if rep else None)
    hide_details = found and not privileged
    return {
        "name": redact_public_text((pet.pet_name if pet else None) or ("Found animal" if found else "Missing pet")),
        "photo_url": photo,
        "species": (pet.pet_type if pet else None) or (rep.animal_type if rep else None),
        "breed": redact_public_text((pet.breed if pet else None) or (rep.animal_breed if rep else None)),
        "color": redact_public_text(color_str),
        "distinguishing_marks": None if hide_details else redact_public_text(pet.distinctive_markings if pet else None),
        "description": None if hide_details else redact_public_text(rep.description if rep else None),
    }


def viewer_role(db: Session, viewer: User, alert: LostPetAlert, check_finder: bool = False) -> str:
    """leader | owner | finder (wrote a possible-recovery report; only looked up when asked) | neighbor. For a found animal nobody is the owner."""
    if is_leader_of(viewer, alert.subdivision_id):
        return "leader"
    if alert.alert_type != "found_animal" and is_owner(db, viewer, alert):
        return "owner"
    if check_finder and db.query(LostPetSighting.sighting_id).filter(
            LostPetSighting.alert_id == alert.alert_id, LostPetSighting.reporter_id == viewer.user_id, LostPetSighting.sighting_type == "secured").first() is not None:
        return "finder"
    return "neighbor"


def privileged(db: Session, viewer: User, alert: LostPetAlert) -> bool:
    """Who sees exact pins and names on an alert: the Leader / Administrator, and a lost pet's owner. For a found animal
    nobody is the owner: the person who reported it sees what any neighbor sees."""
    return is_leader_of(viewer, alert.subdivision_id) or (alert.alert_type != "found_animal" and is_owner(db, viewer, alert))


def can_view(db: Session, user: User, alert: LostPetAlert) -> bool:
    """Leader / admin and the owner always; the subdivision's residents while it is published; afterwards only the residents who
    submitted a sighting. Barangay staff and other subdivisions: no (location history stays here)."""
    if is_leader_of(user, alert.subdivision_id) or is_owner(db, user, alert):
        return True
    if user.role_id == 1 and user.subdivision_id == alert.subdivision_id:
        submitted = db.query(LostPetSighting.sighting_id).filter(LostPetSighting.alert_id == alert.alert_id, LostPetSighting.reporter_id == user.user_id).first() is not None
        return alert.status == ACTIVE or submitted
    return False


def sighting_view(db: Session, s: LostPetSighting, viewer: User, is_priv: bool) -> Dict[str, Any]:
    mine = s.reporter_id == viewer.user_id
    # Who wrote it. The resident app promises "your name is never shown", so only the Leader (who has to follow it up) is given the name.
    # The owner reads "A neighbor", except for a possible-recovery report: its writer is told the owner sees their FIRST name, because
    # the owner has to know whom they are getting in touch with. Never a phone number or an address.
    reporter_name = (s.reporter.name if s.reporter else None) or "A resident"
    if mine:
        label = "You"
    elif s.alert is not None and is_leader_of(viewer, s.alert.subdivision_id):
        label = reporter_name
    elif is_priv and (s.sighting_type or "seen") == "secured":
        label = reporter_name.split(" ")[0]
    else:
        label = "A neighbor"
    # Exact pins only for the person who submitted it and for the leader / the lost pet's owner; every other resident
    # gets the area (~110 m), never the spot.
    exact = mine or is_priv
    seen_by_all = redact_public_text
    reviewer = db.get(User, s.reviewed_by) if (is_priv and s.reviewed_by) else None
    return {
        "sighting_id": s.sighting_id,
        "sighting_type": s.sighting_type or "seen",
        "on_behalf": bool(s.on_behalf),
        "latitude": num(s.latitude) if exact else generalize_coord(s.latitude),
        "longitude": num(s.longitude) if exact else generalize_coord(s.longitude),
        "coordinates_generalized": not exact,
        "location_label": seen_by_all(s.location_label), "location_source": s.location_source,
        "seen_at": iso(s.seen_at), "submitted_at": iso(s.submitted_at),
        "description": seen_by_all(s.description), "photo_url": s.photo_url, "status": s.status,
        "review_note": seen_by_all(s.review_note),
        # where a secured pet is being kept: the owner, the Leader and the person who wrote it only
        "care_note": s.care_note if (is_priv or mine) else None,
        # who reviewed it and when (provenance): for the owner and the Leader
        "reviewed_by": reviewer.name if reviewer else None, "reviewed_at": iso(s.reviewed_at) if is_priv else None,
        "reported_by": label, "is_mine": mine,
    }


def _user_brief(u: Optional[User], with_contact: bool) -> Optional[Dict[str, Any]]:
    if u is None:
        return None
    out: Dict[str, Any] = {"user_id": u.user_id, "name": u.name, "first_name": (u.name or "").split(" ")[0]}
    if with_contact:
        out["phone"] = u.phone
    return out


def coordination_view(db: Session, c: LostPetCoordination, viewer: User) -> Dict[str, Any]:
    """The coordination as THIS viewer may see it. The Leader sees who and how to reach them (never the messages)."""
    alert = c.alert
    leader = is_leader_of(viewer, alert.subdivision_id)
    you = "leader" if leader else ("owner" if viewer.user_id == c.owner_id else "finder")
    direct_open = c.status == "open" and c.mode == "direct" and c.owner_consent and c.finder_consent
    unread = 0
    if not leader:
        unread = db.query(func.count(LostPetCoordinationMessage.message_id)).filter(
            LostPetCoordinationMessage.coordination_id == c.coordination_id, LostPetCoordinationMessage.is_read.is_(False),
            LostPetCoordinationMessage.sender_id != viewer.user_id).scalar() or 0
    out: Dict[str, Any] = {
        "coordination_id": c.coordination_id, "alert_id": c.alert_id, "report_id": c.report_id, "sighting_id": c.sighting_id,
        "you_are": you, "status": c.status, "mode": c.mode,
        "owner_consent": bool(c.owner_consent), "finder_consent": bool(c.finder_consent),
        "direct_open": direct_open, "can_message": direct_open and not leader,
        "mediation_requested": c.mode == "leader", "mediation_requested_by_you": bool(c.mediation_requested_by == viewer.user_id),
        "mediation_requested_at": iso(c.mediation_requested_at),
        "unread_messages": int(unread),
        "resolved_at": iso(c.resolved_at), "resolution_note": c.resolution_note,
        "created_at": iso(c.created_at),
    }
    if leader:
        out["owner"] = _user_brief(db.get(User, c.owner_id) if c.owner_id else None, True)
        out["finder"] = _user_brief(db.get(User, c.finder_id) if c.finder_id else None, True)
        # who asked the Leader to help (the Leader knows which of the two to call first)
        asked = c.mediation_requested_by
        out["mediation_requested_by_role"] = "owner" if asked is not None and asked == c.owner_id else ("finder" if asked is not None and asked == c.finder_id else None)
    elif you == "owner":
        out["other_party"] = {"first_name": first_name(db, c.finder_id)}
    else:
        out["other_party"] = {"first_name": first_name(db, c.owner_id)}
    return out


def recovery_view(alert: LostPetAlert, is_priv: bool) -> Optional[Dict[str, Any]]:
    if alert.recovered_at is None:
        return None
    out: Dict[str, Any] = {"recovered_at": iso(alert.recovered_at)}
    if is_priv:
        out.update({"source": alert.recovery_source, "recorded_by": alert.recovery_recorded_by, "confirmed_by": alert.recovery_confirmed_by,
                    "recorded_at": iso(alert.recovery_recorded_at), "note": alert.recovery_note})
    return out


def _leader_alerts(db: Session, report_id: int) -> Optional[Dict[str, Any]]:
    try:
        from app.services import case_alerts
        s = case_alerts.summary_for_owner(db, report_id)
        return {"sent": s["sent"], "last_at": iso(s["last_at"])}
    except Exception:  # noqa: BLE001  (a summary must never break the notice)
        return None


def alert_view(db: Session, alert: LostPetAlert, viewer: User, with_sightings: bool = False) -> Dict[str, Any]:
    is_priv = privileged(db, viewer, alert)
    role = viewer_role(db, viewer, alert, check_finder=with_sightings)
    all_rows = (db.query(LostPetSighting).options(joinedload(LostPetSighting.reporter)).filter(LostPetSighting.alert_id == alert.alert_id)
                .order_by(LostPetSighting.seen_at, LostPetSighting.submitted_at, LostPetSighting.sighting_id).all())
    # Neighbors read ordinary sightings only. A possible-recovery lead is for the owner and the Leader (and its own writer).
    sightings = [s for s in all_rows if is_priv or (s.sighting_type or "seen") == "seen" or s.reporter_id == viewer.user_id]
    seen_rows = [s for s in sightings if (s.sighting_type or "seen") == "seen"]
    latest = max(seen_rows if not is_priv else sightings, key=lambda s: (s.submitted_at or datetime.min, s.sighting_id), default=None)
    subd = db.get(Subdivision, alert.subdivision_id)
    data: Dict[str, Any] = {
        "alert_id": alert.alert_id, "report_id": alert.report_id, "status": alert.status, "alert_type": alert.alert_type,
        "subdivision": subd.subdivision_name if subd else None,
        "pet": pet_card(db, alert, is_priv),
        "owner_first_name": first_name(db, alert.owner_id) if is_priv else None,
        "last_seen": {"at": iso(alert.last_seen_at), "location": redact_public_text(alert.last_seen_location),
                      "latitude": num(alert.last_seen_lat) if is_priv else generalize_coord(alert.last_seen_lat),
                      "longitude": num(alert.last_seen_lng) if is_priv else generalize_coord(alert.last_seen_lng),
                      "generalized": not is_priv},
        "contact_preference": alert.contact_preference, "contact_text": CONTACT_TEXT.get(alert.contact_preference, CONTACT_TEXT["app_message"]),
        "owner_note": redact_public_text(alert.owner_note), "leader_message": redact_public_text(alert.leader_message),
        "requested_at": iso(alert.requested_at), "activated_at": iso(alert.activated_at),
        "closed_at": iso(alert.closed_at), "close_outcome": alert.close_outcome, "close_reason": redact_public_text(alert.close_reason),
        "recovered_at": iso(alert.recovered_at), "recovery": recovery_view(alert, is_priv),
        "sighting_count": len(seen_rows),
        "secured_count": sum(1 for s in sightings if s.sighting_type == "secured") if is_priv else None,
        "latest_sighting": sighting_view(db, latest, viewer, is_priv) if latest else None,
        "accepting_sightings": alert.status == ACTIVE,
        "is_owner": is_owner(db, viewer, alert), "can_manage": is_leader_of(viewer, alert.subdivision_id), "viewer_role": role,
        # how many residents were told is for the Subdivision Leader only, never for the owner or a neighbor
        "residents_notified": alert.residents_notified if is_leader_of(viewer, alert.subdivision_id) else None,
        # how many notification alerts the Subdivision Leader sent about this case (the owner sees the Leader is reaching neighbours)
        "leader_alerts": _leader_alerts(db, alert.report_id) if is_priv else None,
        # who asked for the notice: the Leader's own notice list tells a resident's request from the Leader's own (not for neighbors)
        "requested_by": alert.requested_by if is_priv else None,
    }
    if with_sightings:
        data["sightings"] = [sighting_view(db, s, viewer, is_priv) for s in sightings]
        coords = db.query(LostPetCoordination).filter(LostPetCoordination.alert_id == alert.alert_id).order_by(LostPetCoordination.coordination_id).all()
        if not is_priv:
            coords = [c for c in coords if c.finder_id == viewer.user_id]
        data["coordinations"] = [coordination_view(db, c, viewer) for c in coords]
    return data


# =========================================================================================================== publication
def broadcast(db: Session, alert: LostPetAlert, actor: Optional[User], now: datetime, req: Optional[Request] = None, how: Optional[str] = None) -> None:
    """
    Publish the notice to the subdivision's residents. `actor` is the Leader who published it, or None when it was published
    by the system: a Lost Pet report publishes its notice by itself, and a found-animal notice goes out at once when the
    subdivision's own publication setting says so. The same for a lost pet's alert and a found-animal notice; only the
    wording and who is told differ.
    """
    found = alert.alert_type == "found_animal"
    alert.status, alert.activated_by, alert.activated_at = ACTIVE, (actor.user_id if actor else None), now
    alert.closed_at = alert.closed_by = alert.close_outcome = alert.close_reason = None
    card = pet_card(db, alert, privileged=False)   # what neighbors may know: never the marks that prove ownership
    looks = ", ".join(x for x in (card["species"], card["breed"], card["color"]) if x)
    where = place_phrase(alert.last_seen_location) or "in the subdivision"     # "near Gate 2", "behind the chapel" (never "near Near ...")
    residents = [u for (u,) in db.query(User.user_id).filter(User.role_id == 1, User.subdivision_id == alert.subdivision_id, User.status == "Active").all()]
    owners = owner_ids(db, alert.report)
    if found:
        alert.residents_notified = notify(
            db, [u for u in residents if u not in owners], "lost_pet_alert", alert.alert_id,
            "Found animal: is it yours?",
            f"An animal ({looks or 'animal'}) was found {where} on {fmt_date(alert.last_seen_at)}. If it is yours, open the "
            "notice and send an ownership claim. Please do not approach an animal you do not know.")
        notify(db, owners, "lost_pet_alert", alert.alert_id, "Your found-animal notice is live",
               "Residents of the subdivision were told about the animal you reported.")
    else:
        alert.residents_notified = notify(
            db, [u for u in residents if u not in owners], "lost_pet_alert", alert.alert_id,
            f"Missing pet: {card['name']} - have you seen it?",
            f"{card['name']} ({looks or 'pet'}) was last seen {where} on {fmt_date(alert.last_seen_at)} at "
            f"{fmt_time(alert.last_seen_at)}. If you spot it, open the notice and tap I saw this pet.")
        notify(db, owners, "lost_pet_alert", alert.alert_id, "Your missing-pet notice is live",
               f"Residents of the subdivision were told about {card['name']}. "
               "You'll be notified of every sighting.")
    by = how or (f"by {actor.name}" if actor else "automatically")
    # the report's history is read by the resident too: it says the notice went out, not to how many (that is for the Leader)
    history_line(db, alert.report, actor, f"{'Found-animal notice' if found else 'Missing-pet notice'} published to the subdivision's residents {by}.")
    log_activity(db=db, action="ACTIVATE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{actor.name if actor else 'The system'} published the {'found-animal notice' if found else 'missing-pet notice'} "
                             f"for Report #{alert.report_id} ({alert.residents_notified} residents notified).",
                 user_id=actor.user_id if actor else None, log_type="operation", request=req, commit=False)


def publish_lost_pet_notice(db: Session, report: Report, owner: User, *, last_seen_at: Optional[datetime], last_seen_location: Optional[str],
                            last_seen_lat, last_seen_lng, owner_note: Optional[str] = None, contact_preference: str = "app_message",
                            req: Optional[Request] = None) -> LostPetAlert:
    """
    Create the report's Community notice and publish it, in the caller's transaction (nothing is committed here). Used when a Lost
    Pet report is filed and when the owner publishes it again after it was closed. Idempotent: a report whose notice is
    already open keeps it.
    """
    now = db_now(db)
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).with_for_update().first()
    if alert is not None and alert.status == ACTIVE:
        return alert
    if alert is None:
        alert = LostPetAlert(report_id=report.report_id)
        db.add(alert)
    alert.alert_type = "lost_pet"
    alert.subdivision_id = report.subdivision_id
    alert.pet_id = report.pet_id
    alert.owner_id = owner.user_id
    alert.status = REQUESTED
    alert.last_seen_at = last_seen_at.replace(tzinfo=None) if last_seen_at else report.created_at
    alert.last_seen_location = (last_seen_location or "").strip() or report.initial_landmark or report.landmark
    alert.last_seen_lat = Decimal(str(last_seen_lat)) if last_seen_lat is not None else report.latitude
    alert.last_seen_lng = Decimal(str(last_seen_lng)) if last_seen_lng is not None else report.longitude
    alert.contact_preference = contact_preference
    alert.owner_note = (owner_note or "").strip() or None
    alert.requested_by, alert.requested_at = owner.user_id, now
    alert.closed_at = alert.closed_by = alert.close_outcome = alert.close_reason = None
    alert.recovered_at = alert.recovery_source = alert.recovery_confirmed_by = alert.recovery_recorded_by = None
    alert.recovery_recorded_at = alert.recovery_note = None
    db.flush()
    broadcast(db, alert, None, now, req, how="automatically")
    return alert


# ============================================================================================================== sightings
def add_sighting(db: Session, alert: LostPetAlert, reporter: User, *, latitude: float, longitude: float, location_source: str,
                 location_label: Optional[str], seen: datetime, description: Optional[str], photo_url: Optional[str],
                 client_request_id: Optional[str], sighting_type: str = "seen", care_note: Optional[str] = None,
                 contact_choice: Optional[str] = None, on_behalf: bool = False, req: Optional[Request] = None) -> LostPetSighting:
    """
    Record one sighting (or one possible-recovery lead), tell the owner and put it on the case activity. An ordinary sighting
    stops there. A lead also opens its coordination (the owner decides how to get in touch) and applies the finder's own choice:
    'direct' (they agree to be messaged) or 'leader' (they ask the Leader to help, no reason needed).
    """
    now = db_now(db)
    s = LostPetSighting(alert_id=alert.alert_id, report_id=alert.report_id, reporter_id=reporter.user_id,
                        latitude=Decimal(str(latitude)), longitude=Decimal(str(longitude)), location_source=location_source,
                        location_label=location_label, seen_at=seen, submitted_at=now, description=description, photo_url=photo_url,
                        accuracy_confirmed=True, status="unverified", client_request_id=client_request_id or None,
                        sighting_type=sighting_type, care_note=care_note, on_behalf=on_behalf if sighting_type == "seen" else False)
    db.add(s)
    db.flush()
    card = pet_card(db, alert)
    subd = db.get(Subdivision, alert.subdivision_id)
    near = f"{place_phrase(s.location_label)}, {subd.subdivision_name}" if s.location_label and subd else (
        place_phrase(s.location_label) if s.location_label else f"in {subd.subdivision_name if subd else 'the subdivision'} (pinned on the map)")
    owners = owner_ids(db, alert.report)
    if sighting_type == "secured":
        history_line(db, alert.report, None, "A neighbor reported they may have the pet safely with them.")
        notify(db, owners, "lost_pet_secured", alert.alert_id, f"Someone may have {card['name']} safely!",
               f"A neighbor says they may have {card['name']} safely with them, {near}. Open the notice to see what they wrote "
               "and choose how you want to get in touch. Nothing is marked recovered until you confirm.", skip=reporter.user_id)
        coordination = LostPetCoordination(alert_id=alert.alert_id, report_id=alert.report_id, sighting_id=s.sighting_id,
                                           owner_id=alert.owner_id, finder_id=reporter.user_id, mode="none", status="open")
        db.add(coordination)
        db.flush()
        if contact_choice == "leader":
            request_mediation(db, coordination, reporter, req=req)
        elif contact_choice == "direct":
            coordination.finder_consent = True
    else:
        history_line(db, alert.report, None, f"A neighbor {'recorded a second-hand sighting of' if on_behalf else 'reported seeing'} the pet {near}.")
        body = f"A neighbour saw {card['name']} {near} at {fmt_time(s.seen_at)}. Open the sightings to see where."
        notify(db, owners, "lost_pet_sighting", alert.alert_id, f"Someone saw {card['name']}", body, skip=reporter.user_id)
    log_activity(db=db, action="SUBMIT_LOST_PET_SIGHTING" if sighting_type == "seen" else "SUBMIT_LOST_PET_LEAD", target_table="lost_pet_sightings",
                 target_id=s.sighting_id, description=f"{'Sighting' if sighting_type == 'seen' else 'Possible recovery report'} for neighborhood "
                 f"alert #{alert.alert_id} (Report #{alert.report_id}).", user_id=reporter.user_id, log_type="operation", request=req, commit=False)
    return s


# ======================================================================================================== coordination
def _party(c: LostPetCoordination, user: User) -> Optional[str]:
    if user.user_id == c.owner_id:
        return "owner"
    if user.user_id == c.finder_id:
        return "finder"
    return None


def coordination_or_404(db: Session, coordination_id: int) -> LostPetCoordination:
    with db.no_autoflush:
        row = db.query(LostPetCoordination.alert_id).filter(LostPetCoordination.coordination_id == coordination_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="That conversation was not found.")
    alert = db.get(LostPetAlert, row.alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="That conversation was not found.")
    lock_alert(db, alert)
    with db.no_autoflush:
        c = db.query(LostPetCoordination).filter(LostPetCoordination.coordination_id == coordination_id).populate_existing().with_for_update().first()
    if c is None:
        raise HTTPException(status_code=404, detail="That conversation was not found.")
    return c


def require_party_or_leader(c: LostPetCoordination, user: User) -> str:
    if is_leader_of(user, c.alert.subdivision_id):
        return "leader"
    party = _party(c, user)
    if party is None:
        raise HTTPException(status_code=404, detail="That conversation was not found.")
    return party


def _require_open(c: LostPetCoordination) -> None:
    if c.status != "open" or c.alert.status != ACTIVE or case_state.is_closed(c.alert.report):
        raise HTTPException(status_code=409, detail="This conversation is finished.")


def set_consent(db: Session, c: LostPetCoordination, user: User, allow: bool) -> LostPetCoordination:
    """The owner or the finder agrees (or stops agreeing) to message the other in the app. Direct messaging opens only when both have."""
    party = _party(c, user)
    if party is None:
        raise HTTPException(status_code=403, detail="Only the owner and the person who may have the pet can do this.")
    _require_open(c)
    if c.mode == "leader":
        raise HTTPException(status_code=409, detail="Your Subdivision Leader is already helping with this. Direct messages are closed.")
    was_direct = c.mode == "direct"
    if (c.owner_consent if party == "owner" else c.finder_consent) == allow:
        return c
    if party == "owner":
        c.owner_consent = allow
    else:
        c.finder_consent = allow
    c.mode = "direct" if (c.owner_consent and c.finder_consent) else "none"
    other = c.finder_id if party == "owner" else c.owner_id
    card = pet_card(db, c.alert)
    if allow and c.mode == "direct" and not was_direct:
        notify(db, [other], "lost_pet_coordination", c.alert_id, "You can message each other now",
               f"You both agreed to message each other about {card['name']}. Open the notice to write.")
    elif allow and c.mode == "none":
        notify(db, [other], "lost_pet_coordination", c.alert_id, "Someone agreed to message you",
               f"About {card['name']}: open the notice to agree to message them, or ask your Subdivision Leader to help instead.")
    return c


def request_mediation(db: Session, c: LostPetCoordination, user: User, req: Optional[Request] = None) -> LostPetCoordination:
    """
    Either party asks the Leader to help, with no reason given. Direct messaging stops for good, the Leader is told once, the
    case moves to In progress (a real piece of work now exists), and the other party is told the Leader will help. Asking
    again changes nothing and tells nobody again.
    """
    party = _party(c, user)
    if party is None:
        raise HTTPException(status_code=403, detail="Only the owner and the person who may have the pet can do this.")
    _require_open(c)
    if c.mode == "leader":
        return c
    now = db_now(db)
    c.mode, c.mediation_requested_by, c.mediation_requested_at = "leader", user.user_id, now
    report = c.alert.report
    card = pet_card(db, c.alert)
    other = c.finder_id if party == "owner" else c.owner_id
    notify(db, leader_ids(db, c.alert.subdivision_id), "lost_pet_leader", report.report_id, "Help requested to connect an owner and a neighbor",
           f"Report #{report.report_id}: the owner of {card['name']} and a neighbor who may have the pet need your help to get in touch. "
           "Open the case to contact them.")
    notify(db, [other], "lost_pet_coordination", c.alert_id, "Your Subdivision Leader will help",
           f"About {card['name']}: your Subdivision Leader will help you two get in touch. Direct messages are closed.", skip=user.user_id)
    history_line(db, report, None, "Leader help requested to connect the owner and a neighbor.")
    if not case_state.is_closed(report):
        from app.services import case_lifecycle as L
        L.advance_case(db, report, None, V.IN_PROGRESS, "mediation requested")
    log_activity(db=db, action="REQUEST_LOST_PET_MEDIATION", target_table="lost_pet_coordinations", target_id=c.coordination_id,
                 description=f"Leader help requested on neighborhood alert #{c.alert_id} (Report #{c.report_id}).",
                 user_id=user.user_id, log_type="operation", request=req, commit=False)
    return c


def resolve_coordination(db: Session, c: LostPetCoordination, actor: User, note: Optional[str], req: Optional[Request] = None) -> LostPetCoordination:
    """The Leader finished helping the two get in touch (the contact work itself is recorded in the case's contact log)."""
    if not is_leader_of(actor, c.alert.subdivision_id):
        raise HTTPException(status_code=403, detail="Only this subdivision's Leader can finish a mediation.")
    from app.services import case_lifecycle as L
    L.require_case_handler(c.alert.report, actor)
    if c.status != "open":
        return c
    if c.mode != "leader":
        raise HTTPException(status_code=409, detail="Nobody asked the Leader to help with this one.")
    c.status, c.resolved_at, c.resolved_by = "resolved", db_now(db), actor.user_id
    c.resolution_note = (note or "").strip() or None
    card = pet_card(db, c.alert)
    notify(db, [c.owner_id, c.finder_id], "lost_pet_coordination", c.alert_id, "Your Subdivision Leader finished helping",
           f"About {card['name']}: your Subdivision Leader recorded that you two have been connected.")
    history_line(db, c.alert.report, actor, "Leader help to connect the owner and a neighbor was completed.")
    log_activity(db=db, action="RESOLVE_LOST_PET_MEDIATION", target_table="lost_pet_coordinations", target_id=c.coordination_id,
                 description=f"{actor.name} finished helping connect the owner and a neighbor (Report #{c.report_id}).",
                 user_id=actor.user_id, log_type="operation", request=req, commit=False)
    return c


def send_message(db: Session, c: LostPetCoordination, sender: User, text_value: str,
                 client_request_id: Optional[str] = None) -> LostPetCoordinationMessage:
    """A private message, only between the owner and the finder, only while both agreed. The server decides, not the screen."""
    party = _party(c, sender)
    if party is None:
        raise HTTPException(status_code=403, detail="Only the owner and the person who may have the pet can write here.")
    if client_request_id:
        existing = db.query(LostPetCoordinationMessage).filter(LostPetCoordinationMessage.client_request_id == client_request_id).with_for_update().first()
        if existing is not None:
            if existing.coordination_id != c.coordination_id or existing.sender_id != sender.user_id:
                raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
            return existing
    _require_open(c)
    if c.mode != "direct" or not (c.owner_consent and c.finder_consent):
        raise HTTPException(status_code=409, detail="Messages are not open: both of you have to agree first, and they close if the Leader is asked to help.")
    text_clean = (text_value or "").strip()
    if not text_clean:
        raise HTTPException(status_code=400, detail="Write a message first.")
    if len(text_clean) > MESSAGE_LIMIT:
        raise HTTPException(status_code=400, detail=f"A message can be at most {MESSAGE_LIMIT} characters.")
    m = LostPetCoordinationMessage(coordination_id=c.coordination_id, sender_id=sender.user_id, message_text=text_clean,
                                   sent_at=db_now(db), client_request_id=client_request_id)
    try:
        with db.begin_nested():
            db.add(m)
            db.flush()
    except IntegrityError:
        existing = db.query(LostPetCoordinationMessage).filter(LostPetCoordinationMessage.client_request_id == client_request_id).first()
        if existing is not None and existing.coordination_id == c.coordination_id and existing.sender_id == sender.user_id:
            return existing
        raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
    other = c.finder_id if party == "owner" else c.owner_id
    card = pet_card(db, c.alert)
    # Notification payloads also reach device previews: private conversation text stays inside its authorized endpoint.
    notify(db, [other], "lost_pet_coordination", c.alert_id, f"New message about {card['name']}", "Open the private conversation to read the message.")
    return m


def message_view(m: LostPetCoordinationMessage, viewer: User) -> Dict[str, Any]:
    return {"message_id": m.message_id, "text": m.message_text, "sent_at": iso(m.sent_at), "is_mine": m.sender_id == viewer.user_id, "is_read": bool(m.is_read)}


def list_messages(db: Session, c: LostPetCoordination, viewer: User, mark_read: bool = True) -> List[Dict[str, Any]]:
    """The two parties read their messages, also after direct messaging closed. Nobody else does, the Leader included."""
    if _party(c, viewer) is None:
        raise HTTPException(status_code=404, detail="That conversation was not found.")
    rows = db.query(LostPetCoordinationMessage).filter(LostPetCoordinationMessage.coordination_id == c.coordination_id).order_by(
        LostPetCoordinationMessage.sent_at, LostPetCoordinationMessage.message_id).all()
    if mark_read:
        for m in rows:
            if m.sender_id != viewer.user_id and not m.is_read:
                m.is_read = True
    return [message_view(m, viewer) for m in rows]


def resolve_open_coordinations(db: Session, alert_id: int, actor: Optional[User], note: str) -> int:
    """Whatever ended the search (the pet is home, the case closed), an unfinished conversation is finished with it."""
    n = 0
    now = db_now(db)
    for c in db.query(LostPetCoordination).filter(LostPetCoordination.alert_id == alert_id, LostPetCoordination.status == "open").all():
        c.status, c.resolved_at, c.resolved_by, c.resolution_note = "resolved", now, actor.user_id if actor else None, note
        n += 1
    return n


# ================================================================================================================ recovery
def confirm_recovery(db: Session, alert: LostPetAlert, *, source: str, actor: User, confirmed_at: Optional[datetime] = None,
                     note: Optional[str] = None, req: Optional[Request] = None) -> Dict[str, Any]:
    """
    THE recovery operation. The owner confirms in the app (source owner_app, the actor is the owner), or the Leader records
    what the owner confirmed by phone or in person (source phone / in_person, the actor is the Leader, `confirmed_at` is when
    the owner said so). Both do exactly this, in the caller's transaction (nothing is committed here):

      1. record the confirmation: source, when, the owner who confirmed, who recorded it, the note
      2. resolve the Community notice (closed as recovered; new sightings stop)
      3. close the case (Missing pet recovered) with the neutral history line and the audit entry
      4. put the pet back to Active in the registry (and the owner-return record the earlier flows already wrote)
      5. finish the open conversations and the case's pending follow-ups, which no longer mean anything
      6. tell the owner, the neighbors who reported a sighting, and the Leader (whichever of them did not do it)

    Asking again (a double tap, two devices, a retry) changes nothing and tells nobody again: the first confirmation answers.
    """
    if source not in RECOVERY_SOURCES:
        raise HTTPException(status_code=422, detail="Say how the owner confirmed it: in the app, by phone, or in person.")
    locked = lock_alert(db, alert)
    report: Report = locked.report
    if locked.alert_type != "lost_pet" or not is_lost_pet_case(report):
        raise HTTPException(status_code=409, detail="Only a missing-pet notice can be marked recovered.")
    owner = db.get(User, locked.owner_id) if locked.owner_id else None
    if owner is None:
        raise HTTPException(status_code=409, detail="The owner's account is missing, so their confirmation cannot be recorded.")
    from app.services import case_lifecycle as L
    if source == "owner_app":
        if actor.role_id != 1 or actor.user_id != owner.user_id:
            raise HTTPException(status_code=403, detail="Only the pet's owner can confirm that the pet is home.")
        confirmed_by = actor.user_id
    else:
        if not is_leader_of(actor, locked.subdivision_id):
            raise HTTPException(status_code=403, detail="Only this subdivision's Leader can record a confirmation the owner gave by phone or in person.")
        L.require_case_handler(report, actor)
        confirmed_by = owner.user_id
    # A replay is still an authorized read of private recovery evidence. Check scope/handler before returning it.
    if locked.recovered_at is not None:
        return {"already": True, "alert": locked}
    if locked.status == CLOSED or case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="This notice or case is already closed" + (
            f" ({locked.close_reason})." if locked.close_reason else ". Reopen the case first if the pet went missing again."))
    if source != "owner_app" and confirmed_at is None:
        raise HTTPException(status_code=422, detail="Record when the owner actually confirmed the pet is safely home.")
    now = db_now(db)
    # Existing database times are Philippine wall-clock times. Respect an explicit input offset rather than discarding it.
    when = (confirmed_at.astimezone(timezone(timedelta(hours=8))).replace(tzinfo=None)
            if confirmed_at is not None and confirmed_at.tzinfo is not None else confirmed_at) if confirmed_at else manila_now()
    if when > manila_now() + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The confirmation time can't be in the future.")
    if report.created_at and when < report.created_at - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="The confirmation can't be earlier than the report.")
    note_clean = (note or "").strip() or None
    how = {"owner_app": "in the app", "phone": "by phone", "in_person": "in person"}[source]

    # 1 + 2: the confirmation and the notice
    locked.recovered_at, locked.recovery_source = when, source
    locked.recovery_confirmed_by, locked.recovery_recorded_by, locked.recovery_recorded_at = confirmed_by, actor.user_id, now
    locked.recovery_note = note_clean
    locked.status, locked.close_outcome, locked.closed_by, locked.closed_at = CLOSED, "recovered", actor.user_id, now
    locked.close_reason = "The owner confirmed the pet is safely home."

    # 4 (the owner-return record, the pet back to Active, the custody status, the case's chats closed): the existing helper
    from app.utils.owner_returns import record_owner_return
    record_owner_return(db, report, {
        "has_account": True, "owner_user_id": owner.user_id, "owner_name": owner.name, "owner_phone": owner.phone,
        "owner_email": owner.email, "owner_address": owner.address, "relationship_to_animal": "Owner",
        "return_method": "self_retrieved", "id_presented": f"Owner confirmed {how}", "id_type": None, "id_last4": None,
        "ownership_verified_by_record": True, "handover_photo_url": None, "ownership_proof_urls": None,
        "notes": f"Owner confirmed the pet is home {how}" + (f" (recorded by {actor.name})" if source != "owner_app" else "") + (f": {note_clean}" if note_clean else "."),
    }, actor=actor)
    report.custody_status = "Reunited with Owner"

    # 3: the case
    report.closure_disposition = "pet_recovered"
    report.closure_reason = note_clean or f"The owner confirmed {how} that the pet is safely home."
    report.closed_at, report.closed_by = now, actor.user_id
    L._apply_status(report, V.CLOSED)
    history_line(db, report, actor if source != "owner_app" else None,
                 f"Case closed: Missing pet recovered. The owner confirmed {how}" + ("." if source == "owner_app" else " (recorded by the Subdivision Leader)."))
    did = "confirmed the pet is home" if source == "owner_app" else "recorded that the owner confirmed the pet is home"
    L.audit(db, actor, "LOST_PET_RECOVERED", report,
            f"{actor.name} {did} ({how}) on report #{report.report_id}.",
            old={"case_status": "open"}, new={"case_status": V.CLOSED, "disposition": "pet_recovered", "source": source,
                                              "confirmed_at": when.isoformat(), "owner_id": owner.user_id, "recorded_by": actor.user_id,
                                              "note": note_clean})

    # 5: what no longer means anything
    from app.models.case_records import CaseFollowUp
    from app.services import case_messaging
    for f in db.query(CaseFollowUp).filter(CaseFollowUp.report_id == report.report_id, CaseFollowUp.status == "pending").all():
        f.status, f.cancel_reason = "cancelled", "The pet was recovered."
    resolve_open_coordinations(db, locked.alert_id, actor, "The pet was recovered.")
    case_messaging.close_for_report(db, report.report_id, actor.user_id, "The owner confirmed the pet is safely home.")

    # 6: who is told
    card = pet_card(db, locked)
    helpers = [u for (u,) in db.query(LostPetSighting.reporter_id).filter(LostPetSighting.alert_id == locked.alert_id).distinct().all() if u]
    owners = owner_ids(db, report)
    # (the owner is told by the owner-return record on the Leader's path, and needs nothing on their own)
    notify(db, [u for u in helpers if u not in owners], "lost_pet_recovered", locked.alert_id, f"Good news: {card['name']} is home",
           "Thank you for reporting. The neighborhood notice is now closed.")
    if source == "owner_app":
        notify(db, leader_ids(db, locked.subdivision_id), "lost_pet_leader", report.report_id, f"{card['name']} is home",
               f"Report #{report.report_id}: the owner confirmed the pet is safely home. The notice and the case were closed.")
    db.flush()
    return {"already": False, "alert": locked}


# ============================================================================================== closing for other reasons
def closure_outcome_for(report: Report) -> Tuple[str, str]:
    """
    How a notice ends when its case is closed WITHOUT a recovery confirmation, from what the case was actually closed as:
    (close_outcome, reason). Never 'recovered' here: only `confirm_recovery` says that.
    """
    disposition, _derived = V.effective_disposition(report.closure_disposition, report.current_status_id)
    label = V.DISPOSITIONS[disposition][2] if disposition in V.DISPOSITIONS else f"status {report.current_status_id}"
    if report.current_status_id == V.MERGED_LEGACY_ID or disposition == "duplicate_report" or report.duplicate_of_report_id:
        return "merged", "The report was merged into another case."
    if disposition == "withdrawn_by_reporter":
        return "withdrawn", "The owner withdrew the report."
    if disposition in ("no_further_sightings", "unresolved_other", "handed_off"):
        return "not_found", f"The case was closed: {label}."
    if disposition == "pet_recovered":
        return "report_closed", "The case was closed as recovered without the owner's confirmation being recorded."
    return "report_closed", f"The case was closed: {label}."


def restore_pet_after_closure(db: Session, report: Report) -> bool:
    """The case ended, so the pet is no longer 'Lost' in the registry, unless another active lost report names it."""
    if not report.pet_id:
        return False
    pet = db.get(Pet, report.pet_id)
    if pet is None or pet.status not in ("Lost", "Missing"):
        return False
    others = db.query(Report.report_id).filter(Report.pet_id == pet.pet_id, Report.report_id != report.report_id,
                                               Report.duplicate_of_report_id.is_(None)).all()
    for (rid,) in others:
        other = db.get(Report, rid)
        if other is not None and is_lost_pet_case(other) and not case_state.is_closed(other):
            return False
    from app.models.pet_history import PetHistory
    previous = pet.status
    pet.status = "Active"
    db.add(PetHistory(pet_id=pet.pet_id, event_type="LOST_REPORT_CLOSED", title="No longer reported missing",
                      description="The lost-pet report was closed without a recovery being recorded.", actor_id=None,
                      actor_name="StraySafe", actor_role="System", previous_status=previous, new_status="Active"))
    return True


def reactivate_on_reopen(db: Session, report: Report, actor: User) -> None:
    """A lost-pet case that is reopened is missing again: the pet is 'Lost' and its notice is published again."""
    if not is_lost_pet_case(report) or not report.pet_id:
        return
    pet = db.get(Pet, report.pet_id)
    if pet is not None and pet.status == "Active":
        pet.status = "Lost"
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).with_for_update().first()
    if alert is None or alert.alert_type != "lost_pet" or alert.status == ACTIVE:
        return
    owner = db.get(User, alert.owner_id) if alert.owner_id else None
    if owner is None:
        return
    publish_lost_pet_notice(db, report, owner, last_seen_at=alert.last_seen_at, last_seen_location=alert.last_seen_location,
                            last_seen_lat=alert.last_seen_lat, last_seen_lng=alert.last_seen_lng, owner_note=alert.owner_note,
                            contact_preference=alert.contact_preference)


# ============================================================================================================ Community
def _species_filter(species: str):
    s = (species or "").strip().lower()
    if s == "dog":
        return func.lower(func.coalesce(Pet.pet_type, Report.animal_type, "")) == "dog"
    if s == "cat":
        return func.lower(func.coalesce(Pet.pet_type, Report.animal_type, "")) == "cat"
    if s == "other":
        return func.lower(func.coalesce(Pet.pet_type, Report.animal_type, "")).notin_(("dog", "cat"))
    return None


def community_page(db: Session, viewer: User, *, alert_type: Optional[str] = None, q: Optional[str] = None, species: Optional[str] = None,
                   limit: int = 20, offset: int = 0, subdivision_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Active notices of one kind for the Community, newest first, with a total: searched and filtered on the server and read a
    page at a time, so a subdivision with many missing pets never loads (or renders) all of them at once.
    """
    if viewer.role_id == 1 or viewer.role_id == 2:
        if not viewer.subdivision_id:
            return {"total": 0, "limit": limit, "offset": offset, "results": []}
        subdivision_id = viewer.subdivision_id
    elif viewer.role_id != 4:
        raise HTTPException(status_code=403, detail="Neighborhood notices are for the subdivision's residents and leaders.")
    query = (db.query(LostPetAlert).join(Report, Report.report_id == LostPetAlert.report_id)
             .outerjoin(Pet, Pet.pet_id == LostPetAlert.pet_id).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet))
             .filter(LostPetAlert.status == ACTIVE))
    if alert_type:
        query = query.filter(LostPetAlert.alert_type == alert_type)
    if subdivision_id:
        query = query.filter(LostPetAlert.subdivision_id == subdivision_id)
    needle = (q or "").strip().lower()[:60]
    if needle:
        like = f"%{needle}%"
        query = query.filter(or_(func.lower(func.coalesce(Pet.pet_name, "")).like(like), func.lower(func.coalesce(Pet.breed, Report.animal_breed, "")).like(like),
                                 func.lower(func.coalesce(Pet.pet_type, Report.animal_type, "")).like(like),
                                 func.lower(func.coalesce(Pet.color_markings, Pet.primary_color, Report.animal_color, "")).like(like),
                                 func.lower(func.coalesce(LostPetAlert.last_seen_location, "")).like(like)))
    sp = _species_filter(species or "")
    if sp is not None:
        query = query.filter(sp)
    total = query.count()
    page = min(max(limit, 1), 50)
    rows = query.order_by(LostPetAlert.activated_at.desc(), LostPetAlert.alert_id.desc()).offset(max(offset, 0)).limit(page).all()
    return {"total": total, "limit": page, "offset": max(offset, 0), "results": [alert_view(db, a, viewer) for a in rows]}


def community_summary(db: Session, viewer: User, preview: int = 4) -> Dict[str, Any]:
    """The Community overview: a few of each kind plus the counts, never the whole list."""
    lost = community_page(db, viewer, alert_type="lost_pet", limit=preview)
    found = community_page(db, viewer, alert_type="found_animal", limit=preview)
    return {"lost": lost, "found": found, "preview": preview}
