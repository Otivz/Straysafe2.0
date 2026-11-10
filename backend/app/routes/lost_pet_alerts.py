"""
Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md).

Community lost-pet reunification inside the subdivision. It never creates a rescue, never endorses to the Barangay
and never tracks anyone: only locations a resident chooses to submit with a sighting are stored.

Workflow: the owner files a Lost Pet Report and requests a Neighborhood Alert -> an authorized Subdivision Leader
activates it (broadcast to the subdivision's residents) -> residents submit "Spotted Here" sightings -> the owner and
the leader are notified -> when the pet is home (owner's "Pet Recovered" or the leader's "Resolved - Pet Reunited")
the report closes and the alert closes with it; sightings are kept.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, StatusHistory
from app.models.user import Subdivision, User
from app.utils.audit import log_activity
from app.utils.auth import get_current_user
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS
from app.utils import case_policy
from app.utils import case_vocab as V
from app.utils.report_visibility import generalize_coord

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lost-pet-alerts", tags=["lost-pet-alerts"])

REQUESTED, ACTIVE, CLOSED = "requested", "active", "closed"
OPEN_ALERT = (REQUESTED, ACTIVE)
CONTACT_TEXT = {
    "app_message": "Message the owner through StraySafe (open the alert and use the chat).",
    "through_leader": "Tell your Subdivision Leader; they will contact the owner.",
}
SIGHTING_STATUSES = ("unverified", "verified", "dismissed")
MAX_FUTURE = timedelta(minutes=5)          # clock skew allowed on a reported sighting time
MAX_BEFORE_REPORT = timedelta(days=3)      # an earlier sighting can't predate the report by more than this


# ── helpers ────────────────────────────────────────────────────────────────

def _db_now(db: Session) -> datetime:
    from app.utils.db_clock import db_now
    return db_now(db)


def _manila_now() -> datetime:
    """Times residents type (last seen, sighting time) are Philippine local time; they are checked against it."""
    from datetime import timezone
    return datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)


def _iso(v: Optional[datetime]) -> Optional[str]:
    return v.isoformat() if v else None


def _num(v) -> Optional[float]:
    return float(v) if v is not None else None


def _report_or_404(db: Session, report_id: int) -> Report:
    rep = db.get(Report, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return rep


def _alert_or_404(db: Session, alert_id: int) -> LostPetAlert:
    a = db.query(LostPetAlert).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet)).filter(
        LostPetAlert.alert_id == alert_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")
    return a


def _owner_ids(db: Session, report: Report) -> set:
    ids = {report.user_id} if report.user_id else set()
    if report.pet_id:
        pet = db.get(Pet, report.pet_id)
        if pet and pet.owner_id:
            ids.add(pet.owner_id)
    return ids


def _is_leader_of(user: User, subdivision_id: Optional[int]) -> bool:
    return user.role_id == 4 or (user.role_id == 2 and bool(user.subdivision_id) and user.subdivision_id == subdivision_id)


def _is_owner(db: Session, user: User, alert: LostPetAlert) -> bool:
    return user.user_id == alert.owner_id or user.user_id in _owner_ids(db, alert.report)


def _submitted_sighting(db: Session, user: User, alert: LostPetAlert) -> bool:
    return db.query(LostPetSighting.sighting_id).filter(LostPetSighting.alert_id == alert.alert_id,
                                                        LostPetSighting.reporter_id == user.user_id).first() is not None


def _can_view(db: Session, user: User, alert: LostPetAlert) -> bool:
    """Leader / admin and the owner always; the subdivision's residents while it is broadcast; afterwards only the
    residents who submitted a sighting. Barangay staff and other subdivisions: no (location history stays here)."""
    if _is_leader_of(user, alert.subdivision_id) or _is_owner(db, user, alert):
        return True
    if user.role_id == 1 and user.subdivision_id == alert.subdivision_id:
        return alert.status == ACTIVE or _submitted_sighting(db, user, alert)
    return False


def _require_view(db: Session, user: User, alert: LostPetAlert) -> None:
    if not _can_view(db, user, alert):
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")


def _require_leader(user: User, alert_or_subdivision) -> None:
    subd = alert_or_subdivision.subdivision_id if hasattr(alert_or_subdivision, "subdivision_id") else alert_or_subdivision
    if not _is_leader_of(user, subd):
        raise HTTPException(status_code=403, detail="Only this subdivision's Leader can manage its neighborhood alerts.")


def _require_open_lost_report(report: Report, alert_type: str = "lost_pet") -> None:
    """The report must be one a notice of this type can be about: a Lost Pet Report, or a Found / Unidentified Animal case."""
    from app.utils.case_vocab import is_lost_pet_report
    if alert_type == "found_animal":
        from app.utils.warning_rules import report_family
        if report_family(report) != V.FOUND_ANIMAL:
            raise HTTPException(status_code=409, detail="A found-animal notice is for Found / Unidentified Animal reports only.")
    elif not is_lost_pet_report(report):
        raise HTTPException(status_code=409, detail="Neighborhood alerts are for Lost Pet Reports only.")
    if report.is_sensitive:
        raise HTTPException(status_code=409, detail="A private complaint is never published as a notice.")
    if report.duplicate_of_report_id or (report.current_status_id or 0) in CLOSED_REPORT_STATUS_IDS:
        raise HTTPException(status_code=409, detail="This report is already closed or merged.")
    if not report.subdivision_id:
        raise HTTPException(status_code=409, detail="This report isn't in a subdivision, so there is no neighborhood to alert.")


def _require_in_coverage(db: Session, lat: Optional[float], lng: Optional[float]) -> None:
    """A pin the user types is checked against the coverage area the server holds (the browser's map is not the rule)."""
    if lat is None or lng is None:
        return
    from app.routes.reports import is_inside_reporting_coverage
    inside, _, radius = is_inside_reporting_coverage(lat, lng, db)
    if not inside:
        raise HTTPException(status_code=400, detail=f"Pin the location inside the subdivision's coverage area (within {radius} m).")


def _privileged(db: Session, viewer: User, alert: LostPetAlert) -> bool:
    """Who sees exact pins and names on an alert: the Leader / Administrator, and a lost pet's owner. For a found animal
    nobody is the owner: the person who reported it sees what any neighbor sees."""
    return _is_leader_of(viewer, alert.subdivision_id) or (alert.alert_type != "found_animal" and _is_owner(db, viewer, alert))


def _pet_card(db: Session, alert: LostPetAlert, privileged: bool = True) -> Dict[str, Any]:
    """
    What neighbors need to recognize the pet: the pet record if linked, else what the owner reported.
    For a found animal the distinguishing marks and the finder's own words are NOT shown to neighbors: they are how the
    real owner proves the animal is theirs, and the finder's text may carry details about the finder.
    """
    rep, pet = alert.report, alert.pet
    found = alert.alert_type == "found_animal"
    photo = None
    if pet is not None:
        photo = pet.photo_url or pet.photo_front_url
    if not photo and rep is not None:
        photo = next((m.file_url for m in (rep.media or []) if m.file_url and m.media_type in ("Image", None)), None)
    colors = [c for c in ((pet.color_markings if pet else None), (pet.primary_color if pet else None), (pet.secondary_color if pet else None)) if c]
    hide_details = found and not privileged
    return {
        "name": (pet.pet_name if pet else None) or ("Found animal" if found else "Missing pet"),
        "photo_url": photo,
        "species": (pet.pet_type if pet else None) or (rep.animal_type if rep else None),
        "breed": (pet.breed if pet else None) or (rep.animal_breed if rep else None),
        "color": ", ".join(dict.fromkeys(colors)) or (rep.animal_color if rep else None),
        "distinguishing_marks": None if hide_details else (pet.distinctive_markings if pet else None),
        "description": None if hide_details else (rep.description if rep else None),
    }


def _first_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    u = db.get(User, user_id) if user_id else None
    return (u.name or "").split(" ")[0] or None if u else None


def _sighting_view(db: Session, s: LostPetSighting, viewer: User, privileged: bool) -> Dict[str, Any]:
    mine = s.reporter_id == viewer.user_id
    # Neighbors see "A neighbor"; the owner and the leader see the reporter's name (never a phone or address)
    label = "You" if mine else ((s.reporter.name if s.reporter else "A resident") if privileged else "A neighbor")
    # Exact pins only for the person who submitted it and for the leader / the lost pet's owner; every other resident
    # gets the area (~110 m), never the spot.
    exact = mine or privileged
    return {
        "sighting_id": s.sighting_id,
        "latitude": _num(s.latitude) if exact else generalize_coord(s.latitude),
        "longitude": _num(s.longitude) if exact else generalize_coord(s.longitude),
        "coordinates_generalized": not exact,
        "location_label": s.location_label, "location_source": s.location_source,
        "seen_at": _iso(s.seen_at), "submitted_at": _iso(s.submitted_at),
        "description": s.description, "photo_url": s.photo_url, "status": s.status, "review_note": s.review_note,
        "reported_by": label, "is_mine": mine,
    }


def _alert_view(db: Session, alert: LostPetAlert, viewer: User, with_sightings: bool = False) -> Dict[str, Any]:
    privileged = _privileged(db, viewer, alert)
    sightings = (db.query(LostPetSighting).options(joinedload(LostPetSighting.reporter))
                 .filter(LostPetSighting.alert_id == alert.alert_id)
                 .order_by(LostPetSighting.seen_at, LostPetSighting.submitted_at, LostPetSighting.sighting_id).all())
    latest = max(sightings, key=lambda s: (s.submitted_at or datetime.min, s.sighting_id), default=None)
    subd = db.get(Subdivision, alert.subdivision_id)
    data = {
        "alert_id": alert.alert_id, "report_id": alert.report_id, "status": alert.status, "alert_type": alert.alert_type,
        "subdivision": subd.subdivision_name if subd else None,
        "pet": _pet_card(db, alert, privileged),
        "owner_first_name": _first_name(db, alert.owner_id),
        "last_seen": {"at": _iso(alert.last_seen_at), "location": alert.last_seen_location,
                      "latitude": _num(alert.last_seen_lat) if privileged else generalize_coord(alert.last_seen_lat),
                      "longitude": _num(alert.last_seen_lng) if privileged else generalize_coord(alert.last_seen_lng),
                      "generalized": not privileged},
        "contact_preference": alert.contact_preference, "contact_text": CONTACT_TEXT.get(alert.contact_preference, CONTACT_TEXT["app_message"]),
        "owner_note": alert.owner_note, "leader_message": alert.leader_message,
        "requested_at": _iso(alert.requested_at), "activated_at": _iso(alert.activated_at),
        "closed_at": _iso(alert.closed_at), "close_outcome": alert.close_outcome, "close_reason": alert.close_reason,
        "sighting_count": len(sightings),
        "latest_sighting": _sighting_view(db, latest, viewer, privileged) if latest else None,
        "accepting_sightings": alert.status == ACTIVE,
        "is_owner": _is_owner(db, viewer, alert), "can_manage": _is_leader_of(viewer, alert.subdivision_id),
        "residents_notified": alert.residents_notified if privileged else None,
        # who asked for the notice: the Leader's own notice list tells a resident's request from the Leader's own (not for neighbors)
        "requested_by": alert.requested_by if privileged else None,
    }
    if with_sightings:
        data["sightings"] = [_sighting_view(db, s, viewer, privileged) for s in sightings]
    return data


def _notify(db: Session, user_ids, ntype: str, related_id: int, title: str, message: str, skip: Optional[int] = None) -> int:
    sent = 0
    for uid in dict.fromkeys(u for u in user_ids if u and u != skip):
        db.add(Notification(user_id=uid, type=ntype, related_id=related_id, title=title[:255], message=message[:1000]))
        sent += 1
    return sent


def _leader_ids(db: Session, subdivision_id: int) -> List[int]:
    return [u for (u,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == subdivision_id,
                                                          User.status == "Active").all()]


def _fmt_time(v: Optional[datetime]) -> str:
    return v.strftime("%I:%M %p").lstrip("0") if v else "unknown time"


def _fmt_date(v: Optional[datetime]) -> str:
    return f"{v.strftime('%B')} {v.day}, {v.year}" if v else ""


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Not saved: database error ({type(e).__name__}).")


# ── owner: request an alert ────────────────────────────────────────────────

class AlertRequest(BaseModel):
    # lost_pet: the owner of a Lost Pet Report asks for an alert. found_animal: a notice that an animal with no known
    # owner was found, so its owner can come forward (the Leader, or the resident who reported it, asks for it).
    alert_type: str = Field("lost_pet", pattern="^(lost_pet|found_animal)$")
    last_seen_at: Optional[datetime] = None
    last_seen_location: Optional[str] = Field(None, max_length=255)
    last_seen_lat: Optional[float] = Field(None, ge=-90, le=90)
    last_seen_lng: Optional[float] = Field(None, ge=-180, le=180)
    contact_preference: str = Field("app_message", pattern="^(app_message|through_leader)$")
    owner_note: Optional[str] = Field(None, max_length=1000)


@router.post("/reports/{report_id}/request")
def request_alert(report_id: int, payload: AlertRequest, req: Request, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """
    The owner asks the Subdivision Leader to broadcast a Neighborhood Alert for their Lost Pet Report. The leader can
    also prepare one from the report (then activates it). The alert always belongs to the pet's owner.
    """
    report = _report_or_404(db, report_id)
    owners = _owner_ids(db, report)
    by_leader = _is_leader_of(current_user, report.subdivision_id)
    found = payload.alert_type == "found_animal"
    if found:
        # Nobody owns it yet: the Leader / Administrator, or the resident who reported the animal, can ask for the notice
        if not by_leader and current_user.user_id != report.user_id:
            raise HTTPException(status_code=403, detail="Only the Subdivision Leader or the resident who reported the animal can ask for a found-animal notice.")
    elif current_user.user_id not in owners and not by_leader:
        raise HTTPException(status_code=403, detail="Only the pet's owner or the Subdivision Leader can request a neighborhood alert.")
    _require_open_lost_report(report, payload.alert_type)
    now = _db_now(db)
    if payload.last_seen_at and payload.last_seen_at.replace(tzinfo=None) > _manila_now() + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The last-seen time can't be in the future.")
    _require_in_coverage(db, payload.last_seen_lat, payload.last_seen_lng)
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).with_for_update().first()
    if alert is not None and alert.status in OPEN_ALERT:
        raise HTTPException(status_code=409, detail=f"A neighborhood alert for this report is already {alert.status}.")
    if alert is None:
        alert = LostPetAlert(report_id=report.report_id)
        db.add(alert)
    alert.alert_type = payload.alert_type
    alert.subdivision_id = report.subdivision_id
    alert.pet_id = None if found else report.pet_id
    pet = db.get(Pet, report.pet_id) if (report.pet_id and not found) else None
    alert.owner_id = None if found else (current_user.user_id if current_user.user_id in owners else ((pet.owner_id if pet else None) or report.user_id))
    alert.status = REQUESTED
    alert.last_seen_at = payload.last_seen_at.replace(tzinfo=None) if payload.last_seen_at else report.created_at
    alert.last_seen_location = (payload.last_seen_location or "").strip() or report.initial_landmark or report.landmark
    alert.last_seen_lat = Decimal(str(payload.last_seen_lat)) if payload.last_seen_lat is not None else report.latitude
    alert.last_seen_lng = Decimal(str(payload.last_seen_lng)) if payload.last_seen_lng is not None else report.longitude
    alert.contact_preference = payload.contact_preference
    alert.owner_note = (payload.owner_note or "").strip() or None
    alert.requested_by, alert.requested_at = current_user.user_id, now
    alert.closed_at = alert.closed_by = alert.close_outcome = alert.close_reason = None
    db.flush()
    asked_for = "a found-animal notice" if found else "a neighborhood alert for their missing pet"
    _notify(db, [] if by_leader and current_user.user_id not in owners else _leader_ids(db, report.subdivision_id), "lost_pet_alert_request", alert.alert_id,
            "Found-animal notice requested" if found else "Neighborhood alert requested",
            f"{current_user.name} asked for {asked_for} (Report #{report.report_id}). "
            "Review the report and activate the alert to notify residents.")
    log_activity(db=db, action="REQUEST_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} requested {'a found-animal notice' if found else 'a neighborhood alert'} for Report #{report.report_id}.",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    # Publication policy: submitting the request and publishing the notice are separate. A resident's request goes to
    # the Leader for review unless the subdivision chose to publish lost-pet / found-animal notices at once. A private
    # complaint, a nuisance or a safety concern is never published at once (case_policy.publication_mode).
    mode = case_policy.publication_mode(case_policy.load_settings(db, report.subdivision_id),
                                        V.FOUND_ANIMAL if found else V.LOST_PET, bool(report.is_sensitive))
    if not by_leader and mode == "immediate":
        _broadcast(db, alert, None, now)
    _commit(db)
    return _alert_view(db, alert, current_user)


@router.get("/reports/{report_id}")
def alert_for_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The report's alert (or null) for the report pages."""
    report = _report_or_404(db, report_id)
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).first()
    if alert is None:
        if current_user.user_id in _owner_ids(db, report) or _is_leader_of(current_user, report.subdivision_id):
            return {"alert": None}
        raise HTTPException(status_code=404, detail="Not found.")
    alert = _alert_or_404(db, alert.alert_id)
    if not _can_view(db, current_user, alert):
        raise HTTPException(status_code=404, detail="Not found.")
    return {"alert": _alert_view(db, alert, current_user)}


# ── leader: activate, update, close, reunited ─────────────────────────────

class ActivateRequest(BaseModel):
    leader_message: Optional[str] = Field(None, max_length=1000)
    last_seen_at: Optional[datetime] = None
    last_seen_location: Optional[str] = Field(None, max_length=255)
    last_seen_lat: Optional[float] = Field(None, ge=-90, le=90)
    last_seen_lng: Optional[float] = Field(None, ge=-180, le=180)


def _apply_details(alert: LostPetAlert, body, now: datetime, db: Session) -> None:
    if body.last_seen_at is not None:
        if body.last_seen_at.replace(tzinfo=None) > _manila_now() + MAX_FUTURE:
            raise HTTPException(status_code=400, detail="The last-seen time can't be in the future.")
        alert.last_seen_at = body.last_seen_at.replace(tzinfo=None)
    if body.last_seen_location is not None:
        alert.last_seen_location = body.last_seen_location.strip() or alert.last_seen_location
    if body.last_seen_lat is not None and body.last_seen_lng is not None:
        _require_in_coverage(db, body.last_seen_lat, body.last_seen_lng)
        alert.last_seen_lat, alert.last_seen_lng = Decimal(str(body.last_seen_lat)), Decimal(str(body.last_seen_lng))
    if body.leader_message is not None:
        alert.leader_message = body.leader_message.strip() or None


@router.post("/{alert_id}/activate")
def activate_alert(alert_id: int, payload: ActivateRequest, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Broadcast the Neighborhood Alert to the subdivision's residents (authorized Subdivision Leader only)."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    if alert.status == ACTIVE:
        raise HTTPException(status_code=409, detail="This neighborhood alert is already active.")
    _require_open_lost_report(alert.report, alert.alert_type)
    now = _db_now(db)
    _apply_details(alert, payload, now, db)
    _broadcast(db, alert, current_user, now, req)
    _commit(db)
    return _alert_view(db, alert, current_user)


def _broadcast(db: Session, alert: LostPetAlert, actor: Optional[User], now: datetime, req: Optional[Request] = None) -> None:
    """
    Publish the notice to the subdivision's residents. `actor` is the Leader who published it, or None when the
    subdivision's own publication policy published it (a resident's request under 'immediate'). The same for a lost
    pet's alert and a found-animal notice; only the wording and who is told differ.
    """
    found = alert.alert_type == "found_animal"
    alert.status, alert.activated_by, alert.activated_at = ACTIVE, (actor.user_id if actor else None), now
    alert.closed_at = alert.closed_by = alert.close_outcome = alert.close_reason = None
    card = _pet_card(db, alert, privileged=False)   # what neighbors may know: never the marks that prove ownership
    looks = ", ".join(x for x in (card["species"], card["breed"], card["color"]) if x)
    where = alert.last_seen_location or "the subdivision"
    residents = [u for (u,) in db.query(User.user_id).filter(User.role_id == 1, User.subdivision_id == alert.subdivision_id,
                                                               User.status == "Active").all()]
    owners = _owner_ids(db, alert.report)
    if found:
        alert.residents_notified = _notify(
            db, [u for u in residents if u not in owners], "lost_pet_alert", alert.alert_id,
            "Found animal: is it yours?",
            f"An animal ({looks or 'animal'}) was found near {where} on {_fmt_date(alert.last_seen_at)}. If it is yours, open the "
            "notice and send an ownership claim. Please do not approach an animal you do not know.")
        _notify(db, owners, "lost_pet_alert", alert.alert_id, "Your found-animal notice is live",
                f"Residents of the subdivision were told about the animal you reported ({alert.residents_notified} notified).")
    else:
        alert.residents_notified = _notify(
            db, [u for u in residents if u not in owners], "lost_pet_alert", alert.alert_id,
            f"Missing pet: {card['name']} - have you seen it?",
            f"{card['name']} ({looks or 'pet'}) was last seen near {where} on {_fmt_date(alert.last_seen_at)} at "
            f"{_fmt_time(alert.last_seen_at)}. If you spot it, open the alert and tap Report a Sighting.")
        _notify(db, owners, "lost_pet_alert", alert.alert_id, "Your neighborhood alert is live",
                f"Residents of the subdivision were alerted about {card['name']} ({alert.residents_notified} notified). "
                "You'll be notified of every sighting.")
    by = f"by {actor.name}" if actor else "under the subdivision's publication policy"
    db.add(StatusHistory(report_id=alert.report_id, report_status_id=alert.report.current_status_id,
                         updated_by=actor.user_id if actor else None,
                         remarks=f"{'Found-animal notice' if found else 'Neighborhood alert'} published to {alert.residents_notified} residents {by}."))
    log_activity(db=db, action="ACTIVATE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{actor.name if actor else 'The publication policy'} published the {'found-animal notice' if found else 'neighborhood alert'} "
                             f"for Report #{alert.report_id} ({alert.residents_notified} residents notified).",
                 user_id=actor.user_id if actor else None, log_type="operation", request=req, commit=False)


@router.patch("/{alert_id}")
def update_alert(alert_id: int, payload: ActivateRequest, req: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Correct the alert's details (last seen, message). The broadcast isn't repeated."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    if alert.status not in OPEN_ALERT:
        raise HTTPException(status_code=409, detail="A closed alert can't be edited.")
    _apply_details(alert, payload, _db_now(db), db)
    log_activity(db=db, action="UPDATE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} updated the neighborhood alert for Report #{alert.report_id}.",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return _alert_view(db, alert, current_user)


class CloseRequest(BaseModel):
    outcome: str = Field(..., pattern="^(not_found|declined|other)$")
    reason: str = Field(..., min_length=5, max_length=1000)


@router.post("/{alert_id}/close")
def close_alert(alert_id: int, payload: CloseRequest, req: Request, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """Close / deactivate the alert without resolving the report (the report stays open; sightings are kept)."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    if alert.status not in OPEN_ALERT:
        raise HTTPException(status_code=409, detail="This alert is already closed.")
    alert.status, alert.close_outcome, alert.close_reason = CLOSED, payload.outcome, payload.reason.strip()
    alert.closed_by, alert.closed_at = current_user.user_id, _db_now(db)
    _notify(db, [alert.owner_id], "lost_pet_alert", alert.alert_id, "Neighborhood alert closed",
            f"The neighborhood alert for Report #{alert.report_id} was closed: {alert.close_reason}")
    log_activity(db=db, action="CLOSE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} closed the neighborhood alert ({payload.outcome}): {alert.close_reason}",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return _alert_view(db, alert, current_user)


class ReunitedRequest(BaseModel):
    note: str = Field(..., min_length=3, max_length=1000)


@router.post("/{alert_id}/reunited")
def mark_reunited(alert_id: int, payload: ReunitedRequest, req: Request, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """
    The leader verified the pet is home: the Lost Pet Report becomes Resolved - Pet Reunited (Claimed by Owner, with
    the owner-return record), which closes the alert and stops new sightings. Sightings are kept.
    """
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    report = alert.report
    _require_open_lost_report(report)
    if report.facility_id is not None:
        raise HTTPException(status_code=409, detail="The animal is recorded at a facility; resolve the case from the report page so the handover is recorded.")
    owner = db.get(User, alert.owner_id) if alert.owner_id else None
    if owner is None:
        raise HTTPException(status_code=409, detail="The owner's account is missing; resolve the report from the report page.")
    from app.utils.owner_returns import record_owner_return
    note = payload.note.strip()
    record_owner_return(db, report, {
        "has_account": True, "owner_user_id": owner.user_id, "owner_name": owner.name, "owner_phone": owner.phone,
        "owner_email": owner.email, "owner_address": owner.address, "relationship_to_animal": "Owner",
        "return_method": "self_retrieved", "id_presented": "Verified by the Subdivision Leader (neighborhood alert)",
        "id_type": None, "id_last4": None, "ownership_verified_by_record": True, "handover_photo_url": None,
        "ownership_proof_urls": None, "notes": f"Resolved - Pet Reunited, verified by {current_user.name}: {note}",
    }, actor=current_user)
    old = report.current_status_id
    report.current_status_id = 9
    report.custody_status = "Reunited with Owner"
    db.add(StatusHistory(report_id=report.report_id, report_status_id=9, updated_by=current_user.user_id,
                         remarks=f"Resolved - Pet Reunited. Verified by {current_user.name} (Subdivision Leader): {note}"))
    db.flush()  # the case-closure hook closes the alert (outcome: reunited)
    card = _pet_card(db, alert)
    helpers = [u for (u,) in db.query(LostPetSighting.reporter_id).filter(LostPetSighting.alert_id == alert.alert_id).distinct().all()]
    owners = _owner_ids(db, report)
    _notify(db, owners, "lost_pet_alert", alert.alert_id, f"{card['name']} is marked reunited",
            f"Your Subdivision Leader marked Report #{report.report_id} as Resolved - Pet Reunited.")
    _notify(db, [u for u in helpers if u not in owners], "lost_pet_alert", alert.alert_id, f"Good news: {card['name']} is home",
            "Thank you for reporting your sighting. The neighborhood alert is now closed.")
    log_activity(db=db, action="LOST_PET_REUNITED", target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} marked Report #{report.report_id} Resolved - Pet Reunited.",
                 user_id=current_user.user_id, log_type="operation", old_values={"status_id": old},
                 new_values={"status_id": 9, "alert_id": alert.alert_id}, request=req, commit=False)
    _commit(db)
    return _alert_view(db, _alert_or_404(db, alert_id), current_user)


# ── lists ──────────────────────────────────────────────────────────────────

@router.get("/active")
def list_active(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Active alerts of the viewer's subdivision (residents and leaders; admins: all)."""
    q = db.query(LostPetAlert).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet)).filter(LostPetAlert.status == ACTIVE)
    if current_user.role_id in (1, 2):
        if not current_user.subdivision_id:
            return {"results": []}
        q = q.filter(LostPetAlert.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id != 4:
        raise HTTPException(status_code=403, detail="Neighborhood alerts are for the subdivision's residents and leaders.")
    return {"results": [_alert_view(db, a, current_user) for a in q.order_by(LostPetAlert.activated_at.desc()).all()]}


@router.get("/mine")
def list_mine(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """A resident's own notices in every state (requested, active, closed): the ones on reports they filed, about their
    pet, or that they asked for. Active notices of other residents are /active. Declared before /{alert_id}."""
    if current_user.role_id != 1:
        raise HTTPException(status_code=403, detail="This list is for residents. Leaders use the notice list.")
    from sqlalchemy import or_
    rows = (db.query(LostPetAlert).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet))
            .join(Report, Report.report_id == LostPetAlert.report_id)
            .filter(or_(Report.user_id == current_user.user_id, LostPetAlert.owner_id == current_user.user_id,
                        LostPetAlert.requested_by == current_user.user_id))
            .order_by(LostPetAlert.requested_at.desc(), LostPetAlert.alert_id.desc()).limit(200).all())
    return {"results": [_alert_view(db, a, current_user) for a in rows]}


@router.get("/all")
def list_all(limit: int = 200, offset: int = 0, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every notice of the Leader's subdivision in every state (requested, active, closed), newest request first: the
    Leader's notice list. The Administrator reads every subdivision's. Declared before /{alert_id}."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Subdivision Leader access required.")
    q = db.query(LostPetAlert).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet))
    if current_user.role_id == 2:
        if not current_user.subdivision_id:
            raise HTTPException(status_code=403, detail="A subdivision assignment is required.")
        q = q.filter(LostPetAlert.subdivision_id == current_user.subdivision_id)
    total = q.count()
    page = min(max(limit, 1), 200)
    rows = q.order_by(LostPetAlert.requested_at.desc(), LostPetAlert.alert_id.desc()).offset(max(offset, 0)).limit(page).all()
    return {"total": total, "limit": page, "offset": max(offset, 0), "results": [_alert_view(db, a, current_user) for a in rows]}


@router.get("/dashboard")
def leader_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Subdivision Leader overview from the records: alerts, sightings, reunions and lost reports waiting."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Subdivision Leader access required.")
    subd = current_user.subdivision_id if current_user.role_id == 2 else None
    if current_user.role_id == 2 and not subd:
        raise HTTPException(status_code=403, detail="A subdivision assignment is required.")
    alerts_q = db.query(LostPetAlert).options(joinedload(LostPetAlert.report), joinedload(LostPetAlert.pet))
    if subd:
        alerts_q = alerts_q.filter(LostPetAlert.subdivision_id == subd)
    alerts = alerts_q.all()
    ids = [a.alert_id for a in alerts]
    sightings_total = db.query(func.count(LostPetSighting.sighting_id)).filter(LostPetSighting.alert_id.in_(ids)).scalar() if ids else 0
    recent = (db.query(LostPetSighting).options(joinedload(LostPetSighting.reporter))
              .filter(LostPetSighting.alert_id.in_(ids)).order_by(LostPetSighting.submitted_at.desc(), LostPetSighting.sighting_id.desc())
              .limit(10).all()) if ids else []
    # Lost Pet Reports still open without an open alert (for the leader to review / alert)
    from app.utils.case_vocab import LOST_PET_CATEGORY_ID, LOST_PET_MARKER
    from sqlalchemy import or_
    lost_q = db.query(Report).filter(
        or_(Report.category_id == LOST_PET_CATEGORY_ID, Report.description.contains(LOST_PET_MARKER)),
        Report.duplicate_of_report_id.is_(None),
        or_(Report.current_status_id.is_(None), Report.current_status_id.notin_(CLOSED_REPORT_STATUS_IDS)))
    if subd:
        lost_q = lost_q.filter(Report.subdivision_id == subd)
    open_alert_reports = {a.report_id for a in alerts if a.status in OPEN_ALERT}
    pending = [r for r in lost_q.order_by(Report.created_at.desc()).all() if r.report_id not in open_alert_reports]
    by_id = {a.alert_id: a for a in alerts}
    view = lambda a: _alert_view(db, a, current_user)  # noqa: E731
    return {
        "stats": {
            "active_alerts": sum(a.status == ACTIVE for a in alerts),
            "requested_alerts": sum(a.status == REQUESTED for a in alerts),
            "total_sightings": int(sightings_total or 0),
            "pets_reunited": sum(a.status == CLOSED and a.close_outcome == "reunited" for a in alerts),
            "pending_lost_reports": len(pending),
        },
        "requested": [view(a) for a in alerts if a.status == REQUESTED],
        "active": [view(a) for a in sorted((a for a in alerts if a.status == ACTIVE), key=lambda a: a.activated_at or datetime.min, reverse=True)],
        "recent_sightings": [{**_sighting_view(db, s, current_user, True), "alert_id": s.alert_id,
                              "pet_name": _pet_card(db, by_id[s.alert_id])["name"]} for s in recent],
        "resolved": [view(a) for a in sorted((a for a in alerts if a.status == CLOSED and a.close_outcome == "reunited"),
                                             key=lambda a: a.closed_at or datetime.min, reverse=True)[:10]],
        "pending_reports": [{"report_id": r.report_id, "created_at": _iso(r.created_at), "landmark": r.landmark,
                             "animal_type": r.animal_type, "status_id": r.current_status_id} for r in pending[:20]],
    }


@router.get("/{alert_id}")
def alert_detail(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The alert with every sighting (oldest seen first), for the tracking map and timeline."""
    alert = _alert_or_404(db, alert_id)
    _require_view(db, current_user, alert)
    return _alert_view(db, alert, current_user, with_sightings=True)


# ── residents: Spotted Here ────────────────────────────────────────────────

@router.post("/{alert_id}/sightings")
async def submit_sighting(
    alert_id: int,
    req: Request,
    latitude: float = Form(..., ge=-90, le=90),
    longitude: float = Form(..., ge=-180, le=180),
    location_source: str = Form("map_pin", pattern="^(map_pin|device)$"),
    location_label: Optional[str] = Form(None, max_length=255),
    seen_at: Optional[datetime] = Form(None),
    description: Optional[str] = Form(None, max_length=1000),
    accuracy_confirmed: bool = Form(False),
    client_request_id: Optional[str] = Form(None, max_length=64),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A resident reports seeing the pet. Only what they submit is stored; the sighting starts unverified."""
    alert = _alert_or_404(db, alert_id)
    if not (_is_leader_of(current_user, alert.subdivision_id) or _is_owner(db, current_user, alert)
            or (current_user.role_id == 1 and current_user.subdivision_id == alert.subdivision_id)):
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")
    if client_request_id:
        existing = db.query(LostPetSighting).filter(LostPetSighting.client_request_id == client_request_id).first()
        if existing is not None:
            if existing.reporter_id != current_user.user_id or existing.alert_id != alert.alert_id:
                raise HTTPException(status_code=409, detail="This submission id was already used.")
            return {"sighting": _sighting_view(db, existing, current_user, False), "duplicate": True}
    if alert.status != ACTIVE:
        raise HTTPException(status_code=409, detail="This neighborhood alert is closed; new sightings are no longer accepted.")
    if not accuracy_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that the sighting information is accurate.")
    from app.routes.reports import is_inside_reporting_coverage
    inside, _, radius = is_inside_reporting_coverage(latitude, longitude, db)
    if not inside:
        raise HTTPException(status_code=400, detail=f"Pin the sighting inside the subdivision's coverage area (within {radius} m).")
    now = _db_now(db)              # submission time: the database clock, like every stored timestamp
    local_now = _manila_now()      # the resident's reported time is Philippine local time
    seen = seen_at.replace(tzinfo=None) if seen_at else local_now
    if seen > local_now + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The sighting time can't be in the future.")
    earliest = (alert.report.created_at or now) - MAX_BEFORE_REPORT
    if seen < earliest:
        raise HTTPException(status_code=400, detail="That sighting time is long before the pet was reported missing.")
    # A double tap without an id: same person, same pin, within a minute -> the first record
    recent = (db.query(LostPetSighting).filter(LostPetSighting.alert_id == alert.alert_id, LostPetSighting.reporter_id == current_user.user_id,
                                               LostPetSighting.submitted_at >= now - timedelta(minutes=1)).all())
    for r in recent:
        if abs(float(r.latitude) - latitude) < 1e-5 and abs(float(r.longitude) - longitude) < 1e-5:
            return {"sighting": _sighting_view(db, r, current_user, False), "duplicate": True}
    photo_url = None
    if photo is not None and photo.filename:
        from app.utils.cloudinary_config import upload_to_cloudinary
        from app.utils.uploads import read_and_validate_upload
        content, unique_name, _media_type, resource_type = await read_and_validate_upload(photo, allowed={"Image"})
        try:
            photo_url = await run_in_threadpool(upload_to_cloudinary, content, folder="straysafe/lost_pet_sightings",
                                                resource_type=resource_type, filename=unique_name)
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Sighting photo upload failed for alert {alert_id}: {exc}")
            photo_url = None
        if not photo_url:
            raise HTTPException(status_code=502, detail="Your photo couldn't be stored right now. Your sighting was not submitted; please try again.")
    s = LostPetSighting(alert_id=alert.alert_id, report_id=alert.report_id, reporter_id=current_user.user_id,
                        latitude=Decimal(str(latitude)), longitude=Decimal(str(longitude)), location_source=location_source,
                        location_label=(location_label or "").strip() or None, seen_at=seen, submitted_at=now,
                        description=(description or "").strip() or None, photo_url=photo_url, accuracy_confirmed=True,
                        status="unverified", client_request_id=client_request_id or None)
    db.add(s)
    db.flush()
    card = _pet_card(db, alert)
    subd = db.get(Subdivision, alert.subdivision_id)
    near = f"near {s.location_label}, {subd.subdivision_name}" if s.location_label and subd else (
        f"near {s.location_label}" if s.location_label else f"in {subd.subdivision_name if subd else 'the subdivision'} (pinned on the map)")
    body = (f"A resident reported seeing {card['name']} {near}. Sighting time: {_fmt_time(s.seen_at)}. "
            f"Reported on: {_fmt_date(now)}. View the latest sighting on the tracking map.")
    _notify(db, list(_owner_ids(db, alert.report)) + _leader_ids(db, alert.subdivision_id), "lost_pet_sighting", alert.alert_id,
            "New Lost Pet Sighting!", body, skip=current_user.user_id)
    log_activity(db=db, action="SUBMIT_LOST_PET_SIGHTING", target_table="lost_pet_sightings", target_id=s.sighting_id,
                 description=f"Sighting for neighborhood alert #{alert.alert_id} (Report #{alert.report_id}).",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return {"sighting": _sighting_view(db, s, current_user, False), "duplicate": False}


class ReviewRequest(BaseModel):
    status: str = Field(..., pattern="^(unverified|verified|dismissed)$")
    note: Optional[str] = Field(None, max_length=1000)


@router.post("/sightings/{sighting_id}/review")
def review_sighting(sighting_id: int, payload: ReviewRequest, req: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Only the leader marks a sighting verified or dismissed (never automatic)."""
    s = db.get(LostPetSighting, sighting_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    alert = _alert_or_404(db, s.alert_id)
    _require_leader(current_user, alert)
    old = s.status
    s.status, s.review_note = payload.status, (payload.note or "").strip() or None
    s.reviewed_by, s.reviewed_at = current_user.user_id, _db_now(db)
    log_activity(db=db, action="REVIEW_LOST_PET_SIGHTING", target_table="lost_pet_sightings", target_id=s.sighting_id,
                 description=f"{current_user.name} marked sighting #{s.sighting_id} {payload.status}.",
                 user_id=current_user.user_id, log_type="operation", old_values={"status": old},
                 new_values={"status": payload.status}, request=req, commit=False)
    _commit(db)
    return _sighting_view(db, s, current_user, True)
