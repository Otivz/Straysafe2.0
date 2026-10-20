"""
Each holding facility has its own stay clock.

When an animal in holding moves to a different facility (e.g. from the Subdivision pen to the Barangay shelter), the
stay-limit progress restarts there: one day in the Subdivision pen does not count as a day at the Barangay shelter.
The move is recorded as a holding timeline entry (event_type "facility_arrival"), and every stay-limit clock (progress
bars, nearing/needs-impoundment counts, the overdue notice, the adoption stay limit) counts from the latest arrival.
The first intake date and the total custody time are unchanged. No schema change: the arrival is a timeline row.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import event as _sa_event, func, inspect as _sa_inspect, select
from sqlalchemy.orm import Session

from app.models.report import HoldingAnimal, HoldingTimeline, Report

ARRIVAL_EVENT = "facility_arrival"
# holding records already discharged: 3 Claimed, 4 Deceased, 5 Transferred, 7 Adopted/Released, 8 Impounded
DISCHARGED_STATUSES = (3, 4, 5, 7, 8)


def db_now(session: Optional[Session]) -> datetime:
    """The database's own current time (naive), the same clock as intake_date / logged_at (server_default NOW()).
    The app server's clock may be on another time zone (UTC vs the database's local +8), which made stays 8 hours off."""
    if session is not None:
        try:
            value = session.execute(select(func.now())).scalar()
            if isinstance(value, str):          # SQLite returns text
                value = datetime.fromisoformat(value)
            if value is not None:
                return value.replace(tzinfo=None)
        except Exception:
            pass
    return datetime.now()


def facility_stay_start(animal: HoldingAnimal) -> Optional[datetime]:
    """When the animal's stay at its current facility began: the latest facility arrival, else the first intake."""
    start = animal.intake_date or animal.created_at
    for log in (animal.timeline or []):
        if log.event_type == ARRIVAL_EVENT and log.logged_at and (start is None or log.logged_at > start):
            start = log.logged_at
    # Moves made before the arrival entries existed: the report history records the facility, so the last change to
    # the current facility (e.g. Selera pen -> Barangay shelter) is when this stay began
    rep = getattr(animal, "report", None)
    if rep is not None and rep.facility_id:
        prev, moved_at = None, None
        for h in sorted(rep.history or [], key=lambda h: (h.created_at or datetime.min, h.history_id or 0)):
            if not h.facility_id:
                continue
            if prev is not None and h.facility_id != prev and h.facility_id == rep.facility_id:
                moved_at = h.created_at
            prev = h.facility_id
        if moved_at and (start is None or moved_at > start):
            start = moved_at
    return start


def _facility_label(session: Session, facility_id: Optional[int]) -> tuple:
    from app.models.landmark import Landmark
    fac = session.get(Landmark, facility_id) if facility_id else None
    if fac is None:
        return None, "the holding facility", None
    kind = "Subdivision" if fac.subdivision_id is not None else "Barangay"
    return fac, fac.name, kind


@_sa_event.listens_for(Session, "before_flush")
def _restart_stay_clock_on_facility_move(session, flush_context, instances):
    for obj in list(session.dirty):
        if not isinstance(obj, Report):
            continue
        hist = _sa_inspect(obj).attrs.facility_id.history
        if not hist.has_changes():
            continue
        new_id = obj.facility_id
        old_id = hist.deleted[0] if hist.deleted else None
        if not new_id or new_id == old_id:
            continue
        with session.no_autoflush:
            animal = (session.query(HoldingAnimal)
                      .filter(HoldingAnimal.report_id == obj.report_id,
                              HoldingAnimal.facility_status.notin_(DISCHARGED_STATUSES))
                      .order_by(HoldingAnimal.holding_id.desc()).first())
            if animal is None:
                continue   # not in holding yet: the intake itself starts the clock
            new_fac, new_name, kind = _facility_label(session, new_id)
            if new_fac is None:
                continue
            last = (session.query(HoldingTimeline)
                    .filter(HoldingTimeline.holding_id == animal.holding_id, HoldingTimeline.event_type == ARRIVAL_EVENT)
                    .order_by(HoldingTimeline.log_id.desc()).first())
            if old_id is None and last is not None and last.title == f"Arrived at {new_name}":
                continue   # back from "in transit" to the facility it was already at
            _, old_name, _ = _facility_label(session, old_id)
            moved_from = f" from {old_name}" if old_id else ""
            session.add(HoldingTimeline(
                holding_id=animal.holding_id, event_type=ARRIVAL_EVENT, title=f"Arrived at {new_name}",
                notes=(f"Moved{moved_from} to {new_name} ({kind} facility). "
                       f"The stay-limit clock restarts at this facility; total custody time is kept."),
            ))
            # a fresh stay at a new facility gets its own overdue notice
            animal.overdue_notified = False
