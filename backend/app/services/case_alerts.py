"""
Notification alerts on a lost-pet or found-animal case (docs/01-system/LOST_FOUND_ALERTS.md).

An alert is a push notification the Subdivision Leader sends to residents about ONE case: its own title, message and (when chosen) the
animal's photo, sent now, at a chosen time, or on a repeating schedule that always ends. It is NOT the Community notice: nothing here
creates, publishes, republishes or edits a notice (lost_pet_alerts); a tap on an alert only opens a screen.

Exactly once: every planned send is claimed by inserting one case_alert_sends row keyed on (alert, planned time) before anything is sent.
The database refuses a second row, so two workers, a retry or a restart can never send the same occurrence twice. After downtime only the
latest missed send goes out (the others are counted as skipped, never sent in a burst). When the case is resolved or closed, every alert
of it stops by itself, and the background loop checks that the case is still open before each send.

A resident gets one in-app row per alert (each send replaces the earlier one) and, on a phone, one notification per alert (same tag).
Residents who turned "Lost & found alerts" off get none. The case's own reporter and owner are left out: they have their own updates.
"""
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.models.case_alert import CaseAlert, CaseAlertSend
from app.models.lost_pet_alert import LostPetAlert, LostPetSighting
from app.models.notification import Notification
from app.models.notification_preference import UserNotificationPreference
from app.models.report import Report
from app.models.user import User
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.db_clock import db_now
from app.utils.public_text import require_public_text

NOTIF_TYPE = "case_alert"
NOTE_ACTION = "CASE_NOTE"              # staff-only lines on the case (the Leader's Activity), like services/case_notes.py
MIN_EVERY_MINUTES = 5                  # a typo guard, not a product rule
MAX_TIMES_A_DAY = 12
DEFAULT_LATEST_DAYS = 14               # "until resolved" also ends on a date the Leader sees and can extend
MAX_LATEST_DAYS = 60
MAX_SENDS = 500
LIVE = ("scheduled", "active", "paused")
DUE = ("scheduled", "active")
DESTINATIONS = ("notice", "sighting", "claim", "inbox")
AUDIENCES = ("all", "helpers")
RESIDENT_APP = "/resident-app"
UNIT_MINUTES = {"minutes": 1, "hours": 60, "days": 1440}


# ------------------------------------------------------------------------------------------------------------- small things
def _family(report: Report) -> Optional[str]:
    if V.is_lost_pet_report(report):
        return V.LOST_PET
    name = report.category.category_name if report.category is not None else None
    return V.FOUND_ANIMAL if V.category_family(name) == V.FOUND_ANIMAL else None


def _clean(dt: Optional[datetime]) -> Optional[datetime]:
    """Times arrive as the Leader's local (Philippine) time without a zone, like every other time in the app. A zoned one is converted."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        from datetime import timezone
        dt = dt.astimezone(timezone(timedelta(hours=8))).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def _fmt(t: Optional[datetime], ref: Optional[datetime] = None) -> str:
    if t is None:
        return ""
    clock = t.strftime("%I:%M %p").lstrip("0")
    if ref is not None and t.date() == ref.date():
        return clock
    return f"{t.strftime('%b')} {t.day}, {clock}"


def _people(n: int) -> str:
    """"1 resident", "3 residents"."""
    return f"{n} resident{'' if n == 1 else 's'}"


def _times(a: CaseAlert) -> List[dtime]:
    out = []
    for part in (a.times_of_day or "").split(","):
        part = part.strip()
        if part:
            h, m = part.split(":")
            out.append(dtime(int(h), int(m)))
    return sorted(set(out))


def _note(db: Session, report: Report, actor: Optional[User], text: str) -> None:
    """A staff-only line on the case: the Leader's Activity shows it as written. `actor` None: written by the system."""
    db.add(AuditLog(user_id=actor.user_id if actor else None, action=NOTE_ACTION, target_table="reports", target_id=report.report_id,
                    description=text[:2000], log_type="case_note"))


def _notice(db: Session, report_id: int) -> Optional[LostPetAlert]:
    """The case's Community notice when it is published (an alert may point at it; it is never changed here)."""
    return db.query(LostPetAlert).filter(LostPetAlert.report_id == report_id, LostPetAlert.status == "active").first()


# ------------------------------------------------------------------------------------------------------------- the schedule
def next_slot(a: CaseAlert, after: datetime, inclusive: bool = False) -> Optional[datetime]:
    """The first planned send of `a` after `after` (or at it, when `inclusive`), within its end. None when there is none left."""
    if a.max_sends is not None and a.sends_done >= a.max_sends:
        return None
    if a.mode in ("now", "later"):
        t = a.start_at
        ok = t >= after if inclusive else t > after
        return t if ok else None
    if a.repeat_kind == "every":
        step = timedelta(minutes=max(1, a.every_minutes or 0))
        if after < a.start_at or (inclusive and after == a.start_at):
            t = a.start_at
        else:
            k = (after - a.start_at) // step
            t = a.start_at + k * step
            if t < after or (t == after and not inclusive):
                t += step
    else:
        times = _times(a)
        if not times:
            return None
        day = max(after, a.start_at).date()
        t = None
        for i in range(0, 400):
            d = day + timedelta(days=i)
            for tm in times:
                cand = datetime.combine(d, tm)
                if cand < a.start_at or cand < after or (cand == after and not inclusive):
                    continue
                t = cand
                break
            if t is not None:
                break
        if t is None:
            return None
    if a.end_at is not None and t > a.end_at:
        return None
    return t


def _latest_due(a: CaseAlert, now: datetime) -> Tuple[Optional[datetime], int]:
    """The latest planned send at or before `now`, starting from the one due, and how many earlier ones were missed (never sent late)."""
    t = a.next_send_at
    if t is None or t > now:
        return None, 0
    skipped = 0
    for _ in range(20000):
        nxt = next_slot(a, t)
        if nxt is None or nxt > now:
            break
        t, skipped = nxt, skipped + 1
    return t, skipped


def plan(a: CaseAlert, after: datetime, limit: int = 5) -> List[datetime]:
    """The next few planned sends (for the screens)."""
    out: List[datetime] = []
    t = next_slot(a, after, inclusive=True)
    while t is not None and len(out) < limit:
        out.append(t)
        t = next_slot(a, t)
    return out


def describe(a: CaseAlert, subject: str) -> str:
    """"every 30 minutes, until Mochi is home (by Nov 26)" — for the Activity lines."""
    if a.mode == "now":
        return "once"
    if a.mode == "later":
        return f"once, on {_fmt(a.start_at)}"
    if a.repeat_kind == "every":
        n = a.every_minutes or 0
        how = f"every {n // 1440} days" if n % 1440 == 0 and n >= 2880 else "every day" if n == 1440 else \
            f"every {n // 60} hours" if n % 60 == 0 and n >= 120 else "every hour" if n == 60 else f"every {n} minutes"
    else:
        how = "daily at " + ", ".join(t.strftime("%I:%M %p").lstrip("0") for t in _times(a))
    if a.end_kind == "resolved":
        end = f"until {subject} (by {_fmt(a.end_at).split(',')[0]})" if a.end_at else f"until {subject}"
    elif a.end_kind == "date":
        end = f"until {_fmt(a.end_at)}"
    else:
        end = f"{a.max_sends} sends in all"
    return f"{how}, {end}"


def _subject(report: Report) -> str:
    """How the end of "until resolved" reads: "Mochi is home", or "the owner is found"."""
    if V.is_lost_pet_report(report):
        snap = report.pet_snapshot if isinstance(report.pet_snapshot, dict) else {}
        name = ((snap.get("pet") or {}).get("name") or "").strip()
        return f"{name} is home" if name else "the pet is home"
    return "the owner is found"


def _apply_schedule(a: CaseAlert, sch, now: datetime) -> None:
    """Validate the schedule the Leader chose and put it on the alert. Safeguards, not presets."""
    a.mode = sch.mode
    a.repeat_kind = a.every_minutes = a.times_of_day = None
    a.end_kind = a.end_at = a.max_sends = None
    if sch.mode == "now":
        a.start_at = now
        return
    if sch.mode == "later":
        at = _clean(sch.at)
        if at is None or at <= now:
            raise HTTPException(status_code=422, detail="Choose a time in the future.")
        a.start_at = at
        return
    # repeat
    if sch.repeat == "every":
        if not sch.every or not sch.unit:
            raise HTTPException(status_code=422, detail="Say how often: a number and minutes, hours or days.")
        minutes = sch.every * UNIT_MINUTES[sch.unit]
        if minutes < MIN_EVERY_MINUTES:
            raise HTTPException(status_code=422, detail=f"Sends must be at least {MIN_EVERY_MINUTES} minutes apart.")
        a.repeat_kind, a.every_minutes = "every", minutes
    elif sch.repeat == "times":
        clean: List[str] = []
        for raw in sch.times or []:
            try:
                h, m = (int(x) for x in str(raw).strip().split(":")[:2])
                if not (0 <= h < 24 and 0 <= m < 60):
                    raise ValueError
            except ValueError:
                raise HTTPException(status_code=422, detail=f"“{raw}” is not a time of day (HH:MM).")
            clean.append(f"{h:02d}:{m:02d}")
        clean = sorted(set(clean))
        if not clean:
            raise HTTPException(status_code=422, detail="Add at least one time of day.")
        if len(clean) > MAX_TIMES_A_DAY:
            raise HTTPException(status_code=422, detail=f"At most {MAX_TIMES_A_DAY} times a day.")
        a.repeat_kind, a.times_of_day = "times", ",".join(clean)
    else:
        raise HTTPException(status_code=422, detail="Choose how it repeats: at an interval, or at set times.")
    start = _clean(sch.start_at) if sch.start_at else now
    if start < now - timedelta(minutes=1):
        raise HTTPException(status_code=422, detail="Choose a start in the future.")
    a.start_at = max(start, now) if sch.start_at else now
    if sch.until == "resolved":
        latest = _clean(sch.latest_end) if sch.latest_end else a.start_at + timedelta(days=DEFAULT_LATEST_DAYS)
        if latest <= a.start_at:
            raise HTTPException(status_code=422, detail="The latest end must be after the start.")
        if latest > a.start_at + timedelta(days=MAX_LATEST_DAYS):
            raise HTTPException(status_code=422, detail=f"An alert can run for at most {MAX_LATEST_DAYS} days. You can extend it later.")
        a.end_kind, a.end_at = "resolved", latest
    elif sch.until == "date":
        until = _clean(sch.until_at)
        if until is None or until <= a.start_at:
            raise HTTPException(status_code=422, detail="Choose an end after the start.")
        if until > a.start_at + timedelta(days=MAX_LATEST_DAYS):
            raise HTTPException(status_code=422, detail=f"An alert can run for at most {MAX_LATEST_DAYS} days.")
        a.end_kind, a.end_at = "date", until
    elif sch.until == "count":
        if not sch.count or not (1 <= sch.count <= MAX_SENDS):
            raise HTTPException(status_code=422, detail=f"Choose between 1 and {MAX_SENDS} sends.")
        a.end_kind, a.max_sends = "count", sch.count
        a.end_at = a.start_at + timedelta(days=MAX_LATEST_DAYS)
    else:
        raise HTTPException(status_code=422, detail="Every repeating alert must end: when the case is resolved, on a date, or after a number of sends.")


# ------------------------------------------------------------------------------------------------------------- who receives it
def recipients(db: Session, a: CaseAlert, report: Report) -> List[int]:
    """Residents of the subdivision (or only those who reported a sighting of this pet) who allow lost & found alerts, minus the
    case's own reporter and owner."""
    from app.services import lost_pet_lifecycle as LP
    q = db.query(User.user_id).filter(User.role_id == 1, User.subdivision_id == report.subdivision_id, User.status == "Active")
    ids = [u for (u,) in q.all()]
    if a.audience == "helpers":
        notice_ids = [n for (n,) in db.query(LostPetAlert.alert_id).filter(LostPetAlert.report_id == report.report_id).all()]
        helpers = {u for (u,) in db.query(LostPetSighting.reporter_id).filter(LostPetSighting.alert_id.in_(notice_ids)).all()} if notice_ids else set()
        ids = [u for u in ids if u in helpers]
    excluded = set(LP.owner_ids(db, report)) | {report.user_id}
    off = {u for (u,) in db.query(UserNotificationPreference.user_id).filter(UserNotificationPreference.push_lost_found_alerts.is_(False)).all()}
    return [u for u in ids if u not in excluded and u not in off]


def audience_counts(db: Session, report: Report) -> Dict[str, Any]:
    """How many residents each choice reaches now (the screen shows it before sending), and whether phones can be reached at all:
    without Web Push keys or the Firebase service account, alerts still reach each resident's notification list, never a lock screen."""
    from app.services import push_service as PS
    probe = CaseAlert(report_id=report.report_id, audience="all")
    all_ids = recipients(db, probe, report)
    probe.audience = "helpers"
    helpers = recipients(db, probe, report)
    residents = db.query(func.count(User.user_id)).filter(User.role_id == 1, User.subdivision_id == report.subdivision_id, User.status == "Active").scalar() or 0
    off = db.query(func.count(UserNotificationPreference.user_id)).join(User, User.user_id == UserNotificationPreference.user_id).filter(
        User.role_id == 1, User.subdivision_id == report.subdivision_id, User.status == "Active",
        UserNotificationPreference.push_lost_found_alerts.is_(False)).scalar() or 0
    return {"all": len(all_ids), "helpers": len(helpers), "residents": residents, "turned_off": off, "push_ready": PS.push_configured()}


# ------------------------------------------------------------------------------------------------------------- sending
def _deliver(db: Session, a: CaseAlert, report: Report, slot: datetime, skipped: int) -> CaseAlertSend:
    """Claim the occurrence, then notify. The claim is a row the database accepts once (IntegrityError: somebody already sent it)."""
    send = CaseAlertSend(alert_id=a.alert_id, slot_at=slot, status="sent", recipients=0, skipped_before=skipped)
    with db.begin_nested():
        db.add(send)
        db.flush()
    users = recipients(db, a, report)
    if users:
        # one row per alert in each resident's list: the earlier send is replaced (and its push, if still waiting, with it)
        db.query(Notification).filter(Notification.type == NOTIF_TYPE, Notification.related_id == a.alert_id,
                                      Notification.user_id.in_(users)).delete(synchronize_session=False)
        for uid in users:
            db.add(Notification(user_id=uid, type=NOTIF_TYPE, related_id=a.alert_id, title=a.title[:255], message=a.message[:1000]))
    send.recipients = len(users)
    a.sends_done = (a.sends_done or 0) + 1
    return send


def _advance(a: CaseAlert, after: datetime) -> None:
    nxt = next_slot(a, after)
    a.next_send_at = nxt
    if nxt is None:
        a.status = "finished"
    elif a.sends_done > 0:
        a.status = "active"


def run_due(db: Session, now: Optional[datetime] = None, limit: int = 50) -> Dict[str, int]:
    """The background loop's step: send what is due, each alert in its own transaction. Commits."""
    now = now or db_now(db)
    counts = {"sent": 0, "finished": 0, "stopped": 0, "raced": 0, "failed": 0}
    due = (db.query(CaseAlert).filter(CaseAlert.status.in_(DUE), CaseAlert.next_send_at.isnot(None), CaseAlert.next_send_at <= now)
           .order_by(CaseAlert.next_send_at, CaseAlert.alert_id).limit(limit).all())
    for a in due:
        try:
            outcome = _run_one(db, a, now)
            db.commit()
            counts[outcome] += 1
        except IntegrityError:
            db.rollback()
            counts["raced"] += 1                  # another worker sent this occurrence: nothing more to do
        except Exception as e:  # noqa: BLE001  (one alert must not stop the others)
            db.rollback()
            counts["failed"] += 1
            print(f"Notice: lost & found alert {a.alert_id} could not be sent: {e}")
    return counts


def _run_one(db: Session, a: CaseAlert, now: datetime) -> str:
    report = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == a.report_id).first()
    if report is None or case_state.is_closed(report):
        _stop(db, a, None, "the case was resolved", now)
        if report is not None:
            _note(db, report, None, f"The alert “{a.title}” stopped by itself: the case was resolved.")
        return "stopped"
    slot, skipped = _latest_due(a, now)
    if slot is None:
        _advance(a, now)
        return "finished"
    first = a.sends_done == 0
    send = _deliver(db, a, report, slot, skipped)
    _advance(a, slot)
    if a.mode == "later":
        _note(db, report, None, f"The scheduled alert “{a.title}” was sent to {_people(send.recipients)}.")
    elif first:
        _note(db, report, None, f"The repeating alert “{a.title}” started: first send to {_people(send.recipients)}.")
    if skipped:
        _note(db, report, None, f"The alert “{a.title}” skipped {skipped} planned send{'s' if skipped != 1 else ''} while the server was down; only the latest went out.")
    if a.status == "finished" and a.mode == "repeat":
        _note(db, report, None, f"The repeating alert “{a.title}” reached its end after {a.sends_done} send{'s' if a.sends_done != 1 else ''}.")
    return "sent"


# ------------------------------------------------------------------------------------------------------------- the Leader's actions
def _check_case(db: Session, report: Report, data) -> None:
    fam = _family(report)
    if fam is None:
        raise HTTPException(status_code=422, detail="Notification alerts are for missing pets and found animals.")
    if case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="The case is closed. Reopen it to send an alert.")
    if report.is_sensitive:
        raise HTTPException(status_code=409, detail="This is a private report: nothing about it can be sent to residents.")
    if data.audience not in AUDIENCES or (data.audience == "helpers" and fam != V.LOST_PET):
        raise HTTPException(status_code=422, detail="Choose who receives it: all residents, or (for a missing pet) the residents who reported a sighting.")
    if data.destination not in DESTINATIONS:
        raise HTTPException(status_code=422, detail="Choose where a tap goes.")
    if data.destination != "inbox" and _notice(db, report.report_id) is None:
        raise HTTPException(status_code=409, detail="There is no published Community notice to open. A tap can open the alert itself instead.")
    if data.destination == "sighting" and fam != V.LOST_PET:
        raise HTTPException(status_code=422, detail="Only a missing pet has a sighting form.")
    if data.destination == "claim" and fam != V.FOUND_ANIMAL:
        raise HTTPException(status_code=422, detail="Only a found animal has a claim form.")


def _texts(data) -> Tuple[str, str]:
    """The title and the message as residents will read them. An alert reaches every resident, so the rule of a public notice applies:
    no phone numbers, email addresses or exact addresses (utils/public_text.py)."""
    title = require_public_text(data.title, "The title", 60)
    message = require_public_text(data.message, "The message", 180)
    if not title or not message:
        raise HTTPException(status_code=422, detail="Write a title and a message.")
    return title, message


def create(db: Session, report: Report, actor: User, data, now: Optional[datetime] = None) -> CaseAlert:
    """A new alert. "Send now" (and a repeating alert that starts now) sends its first occurrence at once. Commits nothing."""
    now = _clean(now or db_now(db))
    if data.client_request_id:
        existing = db.query(CaseAlert).filter(CaseAlert.client_request_id == data.client_request_id).first()
        if existing is not None:
            if existing.report_id != report.report_id:
                raise HTTPException(status_code=409, detail="This submission id was already used for another alert.")
            return existing
    _check_case(db, report, data)
    title, message = _texts(data)
    a = CaseAlert(report_id=report.report_id, subdivision_id=report.subdivision_id, title=title, message=message,
                  include_photo=bool(data.include_photo), destination=data.destination, audience=data.audience, status="scheduled",
                  sends_done=0, created_by=actor.user_id, client_request_id=data.client_request_id)
    _apply_schedule(a, data.schedule, now)
    db.add(a)
    db.flush()
    a.next_send_at = next_slot(a, now, inclusive=True)
    if a.next_send_at is None:
        raise HTTPException(status_code=422, detail="No send fits that schedule. Choose a later end or a shorter interval.")
    subject = _subject(report)
    if a.next_send_at <= now:
        send = _deliver(db, a, report, a.next_send_at, 0)
        _advance(a, a.next_send_at)
        if a.mode == "now":
            _note(db, report, actor, f"You sent the alert “{a.title}” to {_people(send.recipients)}.")
        else:
            _note(db, report, actor, f"You started a repeating alert “{a.title}”: {describe(a, subject)}. First send to {_people(send.recipients)}.")
    elif a.mode == "later":
        _note(db, report, actor, f"You scheduled the alert “{a.title}” for {_fmt(a.start_at)}.")
    else:
        _note(db, report, actor, f"You scheduled a repeating alert “{a.title}”: {describe(a, subject)}, starting {_fmt(a.start_at)}.")
    from app.services import case_lifecycle as L
    L.audit(db, actor, "CASE_ALERT_CREATED", report, f"{actor.name} created notification alert #{a.alert_id} on report #{report.report_id}.",
            table="case_alerts", target_id=a.alert_id, new={"mode": a.mode, "audience": a.audience, "destination": a.destination})
    return a


def update(db: Session, a: CaseAlert, report: Report, actor: User, data, now: Optional[datetime] = None) -> CaseAlert:
    """Change a live alert. Only future sends follow the new settings; what already went out stays in its history. Commits nothing."""
    now = _clean(now or db_now(db))
    if a.status not in LIVE:
        raise HTTPException(status_code=409, detail="This alert has ended. Send a new one instead.")
    _check_case(db, report, data)
    a.title, a.message = _texts(data)
    a.include_photo, a.destination, a.audience = bool(data.include_photo), data.destination, data.audience
    paused = a.status == "paused"
    _apply_schedule(a, data.schedule, now)
    if a.mode == "now":
        send = _deliver(db, a, report, now, 0)
        a.next_send_at, a.status = None, "finished"
        _note(db, report, actor, f"You changed the alert “{a.title}” and sent it now to {_people(send.recipients)}.")
        return a
    if a.mode == "repeat" and a.end_kind == "count" and a.max_sends is not None:
        a.max_sends += a.sends_done or 0                              # "N sends" counts from now on
    if a.mode == "later":
        nxt: Optional[datetime] = a.start_at
    elif a.start_at > now:
        nxt = next_slot(a, now, inclusive=True)
    else:
        nxt = next_slot(a, now)                                       # an edit never sends at once
    if paused:
        a.next_send_at = None
    else:
        a.next_send_at = nxt
        a.status = "finished" if nxt is None else ("active" if a.sends_done and a.mode == "repeat" else "scheduled")
    _note(db, report, actor, f"You changed the alert “{a.title}”: {describe(a, _subject(report))}. Future sends follow the new settings.")
    return a


def pause(db: Session, a: CaseAlert, report: Report, actor: User) -> CaseAlert:
    if a.status not in DUE:
        raise HTTPException(status_code=409, detail="Only a scheduled or running alert can be paused.")
    if a.mode != "repeat":
        raise HTTPException(status_code=409, detail="A one-time alert is cancelled, not paused.")
    a.status, a.next_send_at = "paused", None
    _note(db, report, actor, f"You paused the alert “{a.title}”.")
    return a


def resume(db: Session, a: CaseAlert, report: Report, actor: User, now: Optional[datetime] = None) -> CaseAlert:
    """Continue from now: sends missed while paused are not caught up."""
    now = _clean(now or db_now(db))
    if a.status != "paused":
        raise HTTPException(status_code=409, detail="This alert is not paused.")
    if case_state.is_closed(report):
        raise HTTPException(status_code=409, detail="The case is closed.")
    nxt = next_slot(a, now)
    a.next_send_at = nxt
    a.status = "finished" if nxt is None else ("active" if a.sends_done else "scheduled")
    _note(db, report, actor, f"You resumed the alert “{a.title}”." + (f" Next send {_fmt(nxt, now)}." if nxt else " Its end has passed, so nothing more is sent."))
    return a


def _stop(db: Session, a: CaseAlert, actor: Optional[User], reason: str, now: datetime) -> None:
    a.status = "stopped" if a.sends_done else "cancelled"
    a.next_send_at = None
    a.stop_reason = reason[:255]
    a.stopped_at, a.stopped_by = now, actor.user_id if actor else None


def stop(db: Session, a: CaseAlert, report: Report, actor: User, now: Optional[datetime] = None) -> CaseAlert:
    now = _clean(now or db_now(db))
    if a.status not in LIVE:
        raise HTTPException(status_code=409, detail="This alert has already ended.")
    sent = a.sends_done or 0
    _stop(db, a, actor, "stopped by the Subdivision Leader" if sent else "cancelled by the Subdivision Leader", now)
    _note(db, report, actor, f"You stopped the alert “{a.title}” after {sent} send{'s' if sent != 1 else ''}." if sent
          else f"You cancelled the alert “{a.title}” before it was sent.")
    return a


def stop_for_report(db: Session, report_id: int, reason: str = "the case was resolved") -> int:
    """Every live alert of a report ends when the report closes (called from the closure hook). Never raises."""
    try:
        live = db.query(CaseAlert).filter(CaseAlert.report_id == report_id, CaseAlert.status.in_(LIVE)).all()
        if not live:
            return 0
        now = db_now(db)
        report = db.get(Report, report_id)
        for a in live:
            _stop(db, a, None, reason, now)
            if report is not None:
                _note(db, report, None, f"The alert “{a.title}” stopped by itself: {reason}.")
        return len(live)
    except Exception as e:  # noqa: BLE001  (stopping alerts must never break closing a case)
        print(f"Notice: alerts of report {report_id} could not be stopped: {e}")
        return 0


# ------------------------------------------------------------------------------------------------------------- views
def link_for(db: Session, alert_id: Optional[int]) -> str:
    """Where a tap on this alert goes in the Resident app (a screen only: nothing is changed by opening it)."""
    a = db.get(CaseAlert, alert_id) if alert_id else None
    if a is None:
        return f"{RESIDENT_APP}/notifications"
    notice = _notice(db, a.report_id) if a.destination != "inbox" else None
    if notice is None:
        return f"{RESIDENT_APP}/notifications"
    base = f"{RESIDENT_APP}/community/alert-{notice.alert_id}"
    return base + {"sighting": "/sighting", "claim": "/claim"}.get(a.destination, "")


def image_for(db: Session, alert_id: Optional[int]) -> Optional[str]:
    """The animal's photo for the phone notification, when the alert includes it (https only)."""
    a = db.get(CaseAlert, alert_id) if alert_id else None
    if a is None or not a.include_photo:
        return None
    from app.services import lost_pet_lifecycle as LP
    notice = db.query(LostPetAlert).filter(LostPetAlert.report_id == a.report_id).order_by(LostPetAlert.alert_id.desc()).first()
    photo = None
    if notice is not None:
        photo = LP.pet_card(db, notice, privileged=False).get("photo_url")
    if not photo:
        report = db.get(Report, a.report_id)
        photo = next((m.file_url for m in (report.media or []) if m.file_url and m.media_type in ("Image", None)), None) if report else None
    return photo if isinstance(photo, str) and photo.startswith("https://") else None


def alert_view(db: Session, a: CaseAlert, names: Optional[Dict[int, str]] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or db_now(db)
    sends = db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == a.alert_id).order_by(CaseAlertSend.send_id.desc()).limit(30).all()
    return {
        "alert_id": a.alert_id, "report_id": a.report_id, "title": a.title, "message": a.message, "include_photo": a.include_photo,
        "destination": a.destination, "audience": a.audience, "status": a.status, "stop_reason": a.stop_reason,
        "schedule": {"mode": a.mode, "repeat": a.repeat_kind, "every_minutes": a.every_minutes, "times": [t.strftime("%H:%M") for t in _times(a)],
                     "start_at": a.start_at, "end_kind": a.end_kind, "end_at": a.end_at, "max_sends": a.max_sends},
        "next_send_at": a.next_send_at, "upcoming": plan(a, now) if a.status in DUE else [], "sends_done": a.sends_done,
        "created_at": a.created_at, "created_by": a.created_by, "created_by_name": (names or {}).get(a.created_by),
        "stopped_at": a.stopped_at,
        "sends": [{"slot_at": s.slot_at, "sent_at": s.sent_at, "recipients": s.recipients, "skipped_before": s.skipped_before} for s in sends],
    }


def alerts_for_report(db: Session, report: Report) -> List[Dict[str, Any]]:
    rows = db.query(CaseAlert).filter(CaseAlert.report_id == report.report_id).order_by(CaseAlert.alert_id.desc()).all()
    ids = {a.created_by for a in rows if a.created_by}
    names = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(ids)).all()} if ids else {}
    now = db_now(db)
    return [alert_view(db, a, names, now) for a in rows]


def summary_for_owner(db: Session, report_id: int) -> Dict[str, Any]:
    """What the owner sees: how many alerts went out to neighbours about their pet, and when the last one did."""
    row = db.query(func.count(CaseAlertSend.send_id), func.max(CaseAlertSend.sent_at)).join(CaseAlert, CaseAlert.alert_id == CaseAlertSend.alert_id).filter(
        CaseAlert.report_id == report_id, CaseAlertSend.status == "sent").first()
    return {"sent": int(row[0] or 0), "last_at": row[1]}
