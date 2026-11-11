"""
Lost Pet notices in the Community (docs/01-system/LOST_PET_LIFECYCLE.md, LOST_PET_SIGHTING_PING.md).

Routes only: every rule is in services/lost_pet_lifecycle.py. It never creates a rescue, never endorses to the Barangay
and never tracks anyone: only locations a resident chooses to submit with a sighting are stored.

A Lost Pet report publishes its own notice when it is filed (routes/reports.py), so nothing here asks a Leader to approve a
missing pet. From then on: residents report a sighting ("I saw this pet") or a possible recovery ("I may have this pet safely
with me"); the owner and that neighbor get in touch directly (both agree) or through the Leader (either asks, no reason);
and the notice and the case end together when the owner confirms the pet is home. Found-animal notices keep their own
request and review (the subdivision's publication setting).
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.services import lost_pet_lifecycle as LP
from app.utils.audit import log_activity
from app.utils.auth import get_current_user
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS
from app.utils import case_policy
from app.utils import case_vocab as V
from app.utils import lost_pet_rules
from app.utils.public_text import require_public_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lost-pet-alerts", tags=["lost-pet-alerts"])

REQUESTED, ACTIVE, CLOSED = LP.REQUESTED, LP.ACTIVE, LP.CLOSED
OPEN_ALERT = LP.OPEN_ALERT
SIGHTING_STATUSES = ("unverified", "verified", "dismissed")
MAX_FUTURE, MAX_BEFORE_REPORT = LP.MAX_FUTURE, LP.MAX_BEFORE_REPORT


# ── helpers ────────────────────────────────────────────────────────────────

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


def _require_view(db: Session, user: User, alert: LostPetAlert) -> None:
    if not LP.can_view(db, user, alert):
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")


def _require_leader(user: User, alert_or_subdivision) -> None:
    subd = alert_or_subdivision.subdivision_id if hasattr(alert_or_subdivision, "subdivision_id") else alert_or_subdivision
    if not LP.is_leader_of(user, subd):
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


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Not saved: database error ({type(e).__name__}).")


# ── request a notice (a lost pet's owner again, or the Leader; the found-animal notice) ──────────────────

class AlertRequest(BaseModel):
    # lost_pet: publish the missing-pet notice again (a Lost Pet report publishes its own notice when it is filed). found_animal: a notice
    # that an animal with no known owner was found, so its owner can come forward (the Leader, or the resident who reported it, asks).
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
    A missing pet's notice is published at once (no review). The owner, or the Leader for an older report, can publish it again after
    it was closed. A found-animal notice is requested by the Leader or the resident who reported the animal and goes through the
    subdivision's publication setting.
    """
    report = _report_or_404(db, report_id)
    owners = LP.owner_ids(db, report)
    by_leader = LP.is_leader_of(current_user, report.subdivision_id)
    found = payload.alert_type == "found_animal"
    if found:
        # Nobody owns it yet: the Leader / Administrator, or the resident who reported the animal, can ask for the notice
        if not by_leader and current_user.user_id != report.user_id:
            raise HTTPException(status_code=403, detail="Only the Subdivision Leader or the resident who reported the animal can ask for a found-animal notice.")
    elif current_user.user_id not in owners and not by_leader:
        raise HTTPException(status_code=403, detail="Only the pet's owner or the Subdivision Leader can publish a missing-pet notice.")
    report = LP.lock_case(db, report.report_id)
    _require_open_lost_report(report, payload.alert_type)
    if not found:
        # Registration-first: a lost-pet notice needs the resident's own registered pet (a Leader may prepare one for an older report)
        lost_pet_rules.require_alert_eligible(db, report, current_user, by_leader)
    now = LP.db_now(db)
    if payload.last_seen_at and payload.last_seen_at.replace(tzinfo=None) > LP.manila_now() + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The last-seen time can't be in the future.")
    _require_in_coverage(db, payload.last_seen_lat, payload.last_seen_lng)
    where = require_public_text(payload.last_seen_location, "The last-seen place", 255)
    note = require_public_text(payload.owner_note, "Your note", 1000)
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).with_for_update().first()
    if alert is not None and alert.status in OPEN_ALERT:
        raise HTTPException(status_code=409, detail=f"A neighborhood alert for this report is already {alert.status}.")
    if not found:
        pet = db.get(Pet, report.pet_id) if report.pet_id else None
        owner = current_user if current_user.user_id in owners else db.get(User, (pet.owner_id if pet else None) or report.user_id)
        if owner is None:
            raise HTTPException(status_code=409, detail="The owner's account is missing, so a notice cannot be published for this report.")
        alert = LP.publish_lost_pet_notice(db, report, owner, last_seen_at=payload.last_seen_at, last_seen_location=where,
                                           last_seen_lat=payload.last_seen_lat, last_seen_lng=payload.last_seen_lng, owner_note=note,
                                           contact_preference=payload.contact_preference, req=req)
        log_activity(db=db, action="REQUEST_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                     description=f"{current_user.name} published the missing-pet notice for Report #{report.report_id} again.",
                     user_id=current_user.user_id, log_type="operation", request=req, commit=False)
        _commit(db)
        return LP.alert_view(db, alert, current_user)
    if alert is None:
        alert = LostPetAlert(report_id=report.report_id)
        db.add(alert)
    alert.alert_type = "found_animal"
    alert.subdivision_id = report.subdivision_id
    alert.pet_id = None
    alert.owner_id = None
    alert.status = REQUESTED
    alert.last_seen_at = payload.last_seen_at.replace(tzinfo=None) if payload.last_seen_at else report.created_at
    alert.last_seen_location = where or report.initial_landmark or report.landmark
    alert.last_seen_lat = Decimal(str(payload.last_seen_lat)) if payload.last_seen_lat is not None else report.latitude
    alert.last_seen_lng = Decimal(str(payload.last_seen_lng)) if payload.last_seen_lng is not None else report.longitude
    alert.contact_preference = payload.contact_preference
    alert.owner_note = note
    alert.requested_by, alert.requested_at = current_user.user_id, now
    alert.closed_at = alert.closed_by = alert.close_outcome = alert.close_reason = None
    db.flush()
    LP.notify(db, [] if by_leader and current_user.user_id not in owners else LP.leader_ids(db, report.subdivision_id), "lost_pet_alert_request", alert.alert_id,
              "Found-animal notice requested",
              f"{current_user.name} asked for a found-animal notice (Report #{report.report_id}). Review the report and publish the notice to notify residents.")
    log_activity(db=db, action="REQUEST_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} requested a found-animal notice for Report #{report.report_id}.",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    # Publication policy: submitting the request and publishing the notice are separate. A resident's request goes to the Leader for
    # review unless the subdivision chose to publish found-animal notices at once (never for a sensitive, nuisance or safety case).
    mode = case_policy.publication_mode(case_policy.load_settings(db, report.subdivision_id), V.FOUND_ANIMAL, bool(report.is_sensitive))
    if not by_leader and mode == "immediate":
        LP.broadcast(db, alert, None, now, req, how="under the subdivision's publication policy")
    _commit(db)
    return LP.alert_view(db, alert, current_user)


@router.get("/reports/{report_id}")
def alert_for_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The report's alert (or null) for the report pages."""
    report = _report_or_404(db, report_id)
    alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).first()
    if alert is None:
        if current_user.user_id in LP.owner_ids(db, report) or LP.is_leader_of(current_user, report.subdivision_id):
            return {"alert": None}
        raise HTTPException(status_code=404, detail="Not found.")
    alert = _alert_or_404(db, alert.alert_id)
    if not LP.can_view(db, current_user, alert):
        raise HTTPException(status_code=404, detail="Not found.")
    return {"alert": LP.alert_view(db, alert, current_user)}


# ── leader: publish a found-animal notice, update, close ─────────────────────

class ActivateRequest(BaseModel):
    leader_message: Optional[str] = Field(None, max_length=1000)
    last_seen_at: Optional[datetime] = None
    last_seen_location: Optional[str] = Field(None, max_length=255)
    last_seen_lat: Optional[float] = Field(None, ge=-90, le=90)
    last_seen_lng: Optional[float] = Field(None, ge=-180, le=180)


def _apply_details(alert: LostPetAlert, body, now: datetime, db: Session) -> None:
    if body.last_seen_at is not None:
        if body.last_seen_at.replace(tzinfo=None) > LP.manila_now() + MAX_FUTURE:
            raise HTTPException(status_code=400, detail="The last-seen time can't be in the future.")
        alert.last_seen_at = body.last_seen_at.replace(tzinfo=None)
    if body.last_seen_location is not None:
        alert.last_seen_location = require_public_text(body.last_seen_location, "The last-seen place", 255) or alert.last_seen_location
    if body.last_seen_lat is not None and body.last_seen_lng is not None:
        _require_in_coverage(db, body.last_seen_lat, body.last_seen_lng)
        alert.last_seen_lat, alert.last_seen_lng = Decimal(str(body.last_seen_lat)), Decimal(str(body.last_seen_lng))
    if body.leader_message is not None:
        alert.leader_message = require_public_text(body.leader_message, "Your message", 1000)


@router.post("/{alert_id}/activate")
def activate_alert(alert_id: int, payload: ActivateRequest, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Publish a requested notice to the subdivision's residents (authorized Subdivision Leader only): a found-animal notice, or an older request."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    if alert.status == ACTIVE:
        raise HTTPException(status_code=409, detail="This neighborhood alert is already active.")
    _require_open_lost_report(alert.report, alert.alert_type)
    now = LP.db_now(db)
    _apply_details(alert, payload, now, db)
    LP.broadcast(db, alert, current_user, now, req)
    _commit(db)
    return LP.alert_view(db, alert, current_user)


@router.patch("/{alert_id}")
def update_alert(alert_id: int, payload: ActivateRequest, req: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Correct the alert's details (last seen, message). The broadcast isn't repeated."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    alert = LP.lock_alert(db, alert)
    if alert.status not in OPEN_ALERT:
        raise HTTPException(status_code=409, detail="A closed alert can't be edited.")
    _apply_details(alert, payload, LP.db_now(db), db)
    log_activity(db=db, action="UPDATE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} updated the neighborhood alert for Report #{alert.report_id}.",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return LP.alert_view(db, alert, current_user)


class CloseRequest(BaseModel):
    outcome: str = Field(..., pattern="^(not_found|declined|other)$")
    reason: str = Field(..., min_length=5, max_length=1000)


@router.post("/{alert_id}/close")
def close_alert(alert_id: int, payload: CloseRequest, req: Request, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """Close / deactivate the notice without resolving the case (the case stays open; sightings are kept). It never says the pet is home."""
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    alert = LP.lock_alert(db, alert)
    if alert.status not in OPEN_ALERT:
        raise HTTPException(status_code=409, detail="This alert is already closed.")
    reason = require_public_text(payload.reason, "The reason", 1000) or payload.reason.strip()
    alert.status, alert.close_outcome, alert.close_reason = CLOSED, payload.outcome, reason
    alert.closed_by, alert.closed_at = current_user.user_id, LP.db_now(db)
    LP.resolve_open_coordinations(db, alert.alert_id, current_user, f"The notice was closed: {reason}")
    LP.notify(db, [alert.owner_id], "lost_pet_alert", alert.alert_id, "Neighborhood alert closed",
              f"The neighborhood alert for Report #{alert.report_id} was closed: {alert.close_reason}")
    log_activity(db=db, action="CLOSE_LOST_PET_ALERT", target_table="lost_pet_alerts", target_id=alert.alert_id,
                 description=f"{current_user.name} closed the neighborhood alert ({payload.outcome}): {alert.close_reason}",
                 user_id=current_user.user_id, log_type="operation", request=req, commit=False)
    _commit(db)
    return LP.alert_view(db, alert, current_user)


# ── recovery: ONE operation, two authorized ways in ─────────────────────────

class RecoveredRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


class RecordRecoveryRequest(BaseModel):
    source: str = Field(..., pattern="^(phone|in_person)$")
    confirmed_at: Optional[datetime] = None
    note: Optional[str] = Field(None, max_length=1000)


def _recovery_answer(db: Session, alert_id: int, user: User, result) -> dict:
    return {"already": result["already"], "alert": LP.alert_view(db, _alert_or_404(db, alert_id), user)}


@router.post("/{alert_id}/recovered")
def owner_confirms_recovery(alert_id: int, payload: RecoveredRequest, req: Request, db: Session = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    """The owner says "My pet is home" and confirms it: the notice is resolved, the case is closed and the pet is Active again."""
    alert = _alert_or_404(db, alert_id)
    _require_view(db, current_user, alert)
    result = LP.confirm_recovery(db, alert, source="owner_app", actor=current_user, note=require_public_text(payload.note, "Your note", 1000), req=req)
    _commit(db)
    return _recovery_answer(db, alert_id, current_user, result)


@router.post("/{alert_id}/record-recovery")
def leader_records_recovery(alert_id: int, payload: RecordRecoveryRequest, req: Request, db: Session = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    """
    The Leader records that the OWNER confirmed by phone or in person that the pet is home. A Leader never declares a pet recovered
    by themself: this records the owner's confirmation (how, when it was given, who recorded it, a note) and does exactly what the
    owner's own confirmation does.
    """
    alert = _alert_or_404(db, alert_id)
    _require_leader(current_user, alert)
    result = LP.confirm_recovery(db, alert, source=payload.source, actor=current_user, confirmed_at=payload.confirmed_at,
                                 note=(payload.note or "").strip() or None, req=req)
    _commit(db)
    return _recovery_answer(db, alert_id, current_user, result)


# ── lists ──────────────────────────────────────────────────────────────────

@router.get("/active")
def list_active(alert_type: Optional[str] = None, q: Optional[str] = None, species: Optional[str] = None, limit: int = 50, offset: int = 0,
                db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Active notices of the viewer's subdivision (residents and leaders; admins: all), newest first, searched, filtered and paged on the server."""
    if alert_type is not None and alert_type not in V.ALERT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown notice type.")
    return LP.community_page(db, current_user, alert_type=alert_type, q=q, species=species, limit=limit, offset=offset)


@router.get("/community/summary")
def community_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The Community overview: a few missing pets and a few found animals with their totals. Declared before /{alert_id}."""
    return LP.community_summary(db, current_user)


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
    return {"results": [LP.alert_view(db, a, current_user) for a in rows]}


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
    return {"total": total, "limit": page, "offset": max(offset, 0), "results": [LP.alert_view(db, a, current_user) for a in rows]}


@router.get("/dashboard")
def leader_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Subdivision Leader overview from the records: notices, sightings, recoveries and the conversations waiting for the Leader."""
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
    by_id = {a.alert_id: a for a in alerts}
    view = lambda a: LP.alert_view(db, a, current_user)  # noqa: E731
    recovered = lambda a: a.status == CLOSED and a.close_outcome in ("reunited", "recovered")  # noqa: E731
    from app.models.lost_pet_alert import LostPetCoordination
    waiting = db.query(func.count(LostPetCoordination.coordination_id)).filter(
        LostPetCoordination.alert_id.in_(ids), LostPetCoordination.mode == "leader", LostPetCoordination.status == "open").scalar() if ids else 0
    return {
        "stats": {
            "active_alerts": sum(a.status == ACTIVE for a in alerts),
            "requested_alerts": sum(a.status == REQUESTED for a in alerts),
            "total_sightings": int(sightings_total or 0),
            "pets_reunited": sum(recovered(a) for a in alerts),
            "mediation_requests": int(waiting or 0),
        },
        "requested": [view(a) for a in alerts if a.status == REQUESTED],
        "active": [view(a) for a in sorted((a for a in alerts if a.status == ACTIVE), key=lambda a: a.activated_at or datetime.min, reverse=True)],
        "recent_sightings": [{**LP.sighting_view(db, s, current_user, True), "alert_id": s.alert_id,
                              "pet_name": LP.pet_card(db, by_id[s.alert_id])["name"]} for s in recent],
        "resolved": [view(a) for a in sorted((a for a in alerts if recovered(a)), key=lambda a: a.closed_at or datetime.min, reverse=True)[:10]],
    }


@router.get("/{alert_id}")
def alert_detail(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The alert with every sighting (oldest seen first), for the tracking map and timeline."""
    alert = _alert_or_404(db, alert_id)
    _require_view(db, current_user, alert)
    return LP.alert_view(db, alert, current_user, with_sightings=True)


# ── residents: "I saw this pet" and "I may have this pet safely with me" ────────────────

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
    sighting_type: str = Form("seen", pattern="^(seen|secured)$"),
    on_behalf: bool = Form(False),
    care_note: Optional[str] = Form(None, max_length=500),
    contact_choice: Optional[str] = Form(None, pattern="^(direct|leader)$"),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    A resident reports seeing the pet, or says they may have it safely with them. Only what they submit is stored; it starts
    unverified. An ordinary sighting reaches the owner and the case activity and nothing else. A possible-recovery report also
    opens the conversation about how the owner and the neighbor get in touch (their choice; no reason is ever asked) and never
    marks the pet recovered.
    """
    alert = _alert_or_404(db, alert_id)
    if not (LP.is_leader_of(current_user, alert.subdivision_id) or LP.is_owner(db, current_user, alert)
            or (current_user.role_id == 1 and current_user.subdivision_id == alert.subdivision_id)):
        raise HTTPException(status_code=404, detail="Neighborhood alert not found.")
    secured = sighting_type == "secured"
    if secured and (alert.alert_type != "lost_pet" or LP.is_owner(db, current_user, alert) or current_user.role_id != 1):
        raise HTTPException(status_code=403, detail="Only a neighbor can say they may have a missing pet safely with them.")
    # Serialize the duplicate check and save with recovery/withdrawal, then read current state after any lock wait.
    alert = LP.lock_alert(db, alert)
    if client_request_id:
        existing = db.query(LostPetSighting).filter(LostPetSighting.client_request_id == client_request_id).with_for_update().first()
        if existing is not None:
            if existing.reporter_id != current_user.user_id or existing.alert_id != alert.alert_id:
                raise HTTPException(status_code=409, detail="This submission id was already used.")
            return {"sighting": LP.sighting_view(db, existing, current_user, False), "duplicate": True}
    if alert.status != ACTIVE or LP.case_state.is_closed(alert.report):
        raise HTTPException(status_code=409, detail="This neighborhood alert is closed; new sightings are no longer accepted.")
    if not accuracy_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that the sighting information is accurate.")
    label = require_public_text(location_label, "The place name", 255)
    words = require_public_text(description, "What you saw", 1000)
    care = (care_note or "").strip() or None          # private to the owner and the Leader: contact details here are the writer's own choice
    from app.routes.reports import is_inside_reporting_coverage
    inside, _, radius = is_inside_reporting_coverage(latitude, longitude, db)
    if not inside:
        raise HTTPException(status_code=400, detail=f"Pin the sighting inside the subdivision's coverage area (within {radius} m).")
    now = LP.db_now(db)              # submission time: the database clock, like every stored timestamp
    local_now = LP.manila_now()      # the resident's reported time is Philippine local time
    seen = seen_at.replace(tzinfo=None) if seen_at else local_now
    if seen > local_now + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="The sighting time can't be in the future.")
    earliest = (alert.report.created_at or now) - MAX_BEFORE_REPORT
    if seen < earliest:
        raise HTTPException(status_code=400, detail="That sighting time is long before the pet was reported missing.")
    # A double tap without an id: same person, same pin, same kind, within a minute -> the first record
    from datetime import timedelta
    recent = (db.query(LostPetSighting).filter(LostPetSighting.alert_id == alert.alert_id, LostPetSighting.reporter_id == current_user.user_id,
                                               LostPetSighting.sighting_type == sighting_type,
                                               LostPetSighting.submitted_at >= now - timedelta(minutes=1)).all())
    for r in recent:
        if abs(float(r.latitude) - latitude) < 1e-5 and abs(float(r.longitude) - longitude) < 1e-5:
            return {"sighting": LP.sighting_view(db, r, current_user, False), "duplicate": True}
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
    s = LP.add_sighting(db, alert, current_user, latitude=latitude, longitude=longitude, location_source=location_source, location_label=label,
                        seen=seen, description=words, photo_url=photo_url, client_request_id=client_request_id,
                        sighting_type=sighting_type, care_note=care if secured else None, contact_choice=contact_choice if secured else None,
                        on_behalf=(on_behalf or LP.is_owner(db, current_user, alert)) if not secured else False, req=req)
    _commit(db)
    out: dict = {"sighting": LP.sighting_view(db, s, current_user, False), "duplicate": False}
    if secured:
        from app.models.lost_pet_alert import LostPetCoordination
        coord = db.query(LostPetCoordination).filter(LostPetCoordination.sighting_id == s.sighting_id).first()
        out["coordination"] = LP.coordination_view(db, coord, current_user) if coord else None
    return out


class ReviewRequest(BaseModel):
    status: str = Field(..., pattern="^(unverified|verified|dismissed)$")
    note: Optional[str] = Field(None, max_length=1000)


@router.post("/sightings/{sighting_id}/review")
def review_sighting(sighting_id: int, payload: ReviewRequest, req: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Only the leader marks a sighting verified or dismissed (never automatic). Who did it and when are kept."""
    s = db.get(LostPetSighting, sighting_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Sighting not found.")
    alert = _alert_or_404(db, s.alert_id)
    _require_leader(current_user, alert)
    alert = LP.lock_alert(db, alert)
    if LP.case_state.is_closed(alert.report):
        raise HTTPException(status_code=409, detail="This case is closed; no further sighting reviews can be recorded.")
    s = db.query(LostPetSighting).filter(LostPetSighting.sighting_id == sighting_id).populate_existing().with_for_update().first()
    from app.services import case_lifecycle as L
    L.require_case_handler(alert.report, current_user)
    note = require_public_text(payload.note, "The note", 1000)
    if s.status == payload.status and s.review_note == note:
        return LP.sighting_view(db, s, current_user, True)
    old = s.status
    s.status, s.review_note = payload.status, note
    s.reviewed_by, s.reviewed_at = current_user.user_id, LP.db_now(db)
    LP.history_line(db, alert.report, current_user, f"A {'possible recovery report' if s.sighting_type == 'secured' else 'sighting'} was marked {payload.status} by the Subdivision Leader.")
    log_activity(db=db, action="REVIEW_LOST_PET_SIGHTING", target_table="lost_pet_sightings", target_id=s.sighting_id,
                 description=f"{current_user.name} marked sighting #{s.sighting_id} {payload.status}.",
                 user_id=current_user.user_id, log_type="operation", old_values={"status": old},
                 new_values={"status": payload.status}, request=req, commit=False)
    _commit(db)
    return LP.sighting_view(db, s, current_user, True)


# ── coordination: how the owner and the person who may have the pet get in touch ───────────────

class ConsentRequest(BaseModel):
    allow: bool = True


class ResolveRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


class MessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=LP.MESSAGE_LIMIT)
    client_request_id: Optional[str] = Field(None, min_length=1, max_length=64)


@router.get("/coordinations/{coordination_id}")
def get_coordination(coordination_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = LP.coordination_or_404(db, coordination_id)
    LP.require_party_or_leader(c, current_user)
    return LP.coordination_view(db, c, current_user)


@router.post("/coordinations/{coordination_id}/consent")
def coordination_consent(coordination_id: int, payload: ConsentRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Agree (or stop agreeing) to message the other person in the app. Messaging opens only when BOTH have agreed."""
    c = LP.coordination_or_404(db, coordination_id)
    LP.require_party_or_leader(c, current_user)
    LP.set_consent(db, c, current_user, payload.allow)
    _commit(db)
    return LP.coordination_view(db, c, current_user)


@router.post("/coordinations/{coordination_id}/mediation")
def coordination_mediation(coordination_id: int, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ask the Subdivision Leader to help instead. No reason is asked or kept; direct messaging is over from now on."""
    c = LP.coordination_or_404(db, coordination_id)
    LP.require_party_or_leader(c, current_user)
    LP.request_mediation(db, c, current_user, req=req)
    _commit(db)
    return LP.coordination_view(db, c, current_user)


@router.post("/coordinations/{coordination_id}/resolve")
def coordination_resolve(coordination_id: int, payload: ResolveRequest, req: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The Leader finished helping the two get in touch. The contact work itself is recorded in the case's contact log and follow-ups."""
    c = LP.coordination_or_404(db, coordination_id)
    LP.resolve_coordination(db, c, current_user, require_public_text(payload.note, "The note", 1000), req=req)
    _commit(db)
    return LP.coordination_view(db, c, current_user)


@router.get("/coordinations/{coordination_id}/messages")
def coordination_messages(coordination_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = LP.coordination_or_404(db, coordination_id)
    rows = LP.list_messages(db, c, current_user)
    _commit(db)
    return {"results": rows, "coordination": LP.coordination_view(db, c, current_user)}


@router.post("/coordinations/{coordination_id}/messages")
def coordination_send(coordination_id: int, payload: MessageRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = LP.coordination_or_404(db, coordination_id)
    m = LP.send_message(db, c, current_user, payload.text, payload.client_request_id)
    _commit(db)
    return LP.message_view(m, current_user)
