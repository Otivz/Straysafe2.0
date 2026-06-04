import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.report import HoldingAnimal, HoldingTimeline, Report, FacilityStatus
from app.schemas.holding import (
    HoldingAnimalCreate,
    HoldingAnimalUpdate,
    HoldingAnimalResponse,
    HoldingTimelineCreate,
    HoldingTimelineResponse,
    HoldingMetricsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/holding", tags=["holding-facility"])

# Status IDs that mean the case is resolved / discharged
RESOLVED_STATUSES = {3, 4, 5}  # Claimed, Deceased, Transferred
IMPOUND_DAYS = 7                # days before expiry warning triggers
EXPIRY_WARNING_DAYS = 2         # warn when ≤ 2 days remain

CATEGORY_MAP = {
    1: "Injured Animal",
    2: "Aggressive Stray",
    3: "Possible Rabies Risk",
    4: "Roaming Pack",
    5: "Animal Rescue Needed",
}


def _populate(animal: HoldingAnimal) -> HoldingAnimal:
    """Populate transient fields for a HoldingAnimal."""
    if animal.intake_staff:
        animal.intake_staff_name = animal.intake_staff.name  # type: ignore[attr-defined]
    if animal.status_obj:
        animal.facility_status_name = animal.status_obj.status_name  # type: ignore[attr-defined]
    if animal.report:
        animal.report_landmark = animal.report.landmark  # type: ignore[attr-defined]
        animal.report_category = CATEGORY_MAP.get(animal.report.category_id, "Unknown")  # type: ignore[attr-defined]
    for log in animal.timeline:
        if log.staff:
            log.staff_name = log.staff.name  # type: ignore[attr-defined]
    return animal


def _load(holding_id: int, db: Session) -> Optional[HoldingAnimal]:
    return (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report),
            joinedload(HoldingAnimal.intake_staff),
            joinedload(HoldingAnimal.status_obj),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
        )
        .filter(HoldingAnimal.holding_id == holding_id)
        .first()
    )


# ── GET /holding/metrics ───────────────────────────────────────────────────────
@router.get("/metrics", response_model=HoldingMetricsResponse)
def get_metrics(db: Session = Depends(get_db)):
    animals = (
        db.query(HoldingAnimal)
        .options(joinedload(HoldingAnimal.status_obj))
        .all()
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    deadline = timedelta(days=IMPOUND_DAYS)
    warn_threshold = timedelta(days=EXPIRY_WARNING_DAYS)

    total = len(animals)
    need_treatment = 0
    healthy = 0
    nearing_expiry = 0
    resolved_today = 0

    for a in animals:
        if a.facility_status == 1:
            need_treatment += 1
        elif a.facility_status == 2:
            healthy += 1

        # Only count active animals for expiry
        if a.facility_status not in RESOLVED_STATUSES and a.intake_date:
            time_in = now - a.intake_date
            remaining = deadline - time_in
            if timedelta(0) <= remaining <= warn_threshold:
                nearing_expiry += 1

        # Discharged today
        if a.discharge_date and a.discharge_date.date() == now.date():
            resolved_today += 1

    return HoldingMetricsResponse(
        total=total,
        need_treatment=need_treatment,
        healthy=healthy,
        nearing_expiry=nearing_expiry,
        resolved_today=resolved_today,
    )


# ── GET /holding/ ─────────────────────────────────────────────────────────────
@router.get("/", response_model=List[HoldingAnimalResponse])
def list_animals(db: Session = Depends(get_db)):
    animals = (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report),
            joinedload(HoldingAnimal.intake_staff),
            joinedload(HoldingAnimal.status_obj),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
        )
        .order_by(HoldingAnimal.intake_date.desc())
        .all()
    )
    for a in animals:
        _populate(a)
    return animals


# ── GET /holding/{holding_id} ─────────────────────────────────────────────────
@router.get("/{holding_id}", response_model=HoldingAnimalResponse)
def get_animal(holding_id: int, db: Session = Depends(get_db)):
    animal = _load(holding_id, db)
    if not animal:
        raise HTTPException(status_code=404, detail="Holding record not found")
    return _populate(animal)


# ── POST /holding/ ────────────────────────────────────────────────────────────
@router.post("/", response_model=HoldingAnimalResponse)
def create_animal(body: HoldingAnimalCreate, db: Session = Depends(get_db)):
    try:
        # Prevent duplicate intakes for the same report
        existing = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == body.report_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Animal already in holding facility for this report")

        animal = HoldingAnimal(**body.model_dump())
        db.add(animal)
        db.flush()

        # Auto-create first timeline entry
        first_log = HoldingTimeline(
            holding_id=animal.holding_id,
            event_type="intake",
            title="Animal Admitted to Holding Facility",
            notes=f"Admitted from Report #{body.report_id}.",
            logged_by=body.intake_staff_id,
        )
        db.add(first_log)
        db.commit()
        db.refresh(animal)

        full = _load(animal.holding_id, db)
        return _populate(full)  # type: ignore[arg-type]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating holding record: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── PATCH /holding/{holding_id} ───────────────────────────────────────────────
@router.patch("/{holding_id}", response_model=HoldingAnimalResponse)
def update_animal(holding_id: int, body: HoldingAnimalUpdate, db: Session = Depends(get_db)):
    try:
        animal = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == holding_id).first()
        if not animal:
            raise HTTPException(status_code=404, detail="Holding record not found")

        old_status = animal.facility_status
        update_data = body.model_dump(exclude_unset=True)

        updated_by   = update_data.pop("updated_by", None)
        update_notes = update_data.pop("update_notes", None)

        for key, value in update_data.items():
            if hasattr(animal, key):
                setattr(animal, key, value)

        new_status = animal.facility_status

        # ── Resolution logic ──────────────────────────────────────────────────
        if new_status in RESOLVED_STATUSES and old_status not in RESOLVED_STATUSES:
            animal.discharge_date = datetime.now(timezone.utc).replace(tzinfo=None)

            # Close the linked report (status 11 = Resolved)
            report = db.query(Report).filter(Report.report_id == animal.report_id).first()
            if report:
                report.current_status_id = 11

            # Determine outcome label
            outcome_labels = {
                3: "Claimed by Owner",
                4: "Deceased",
                5: "Transferred to Shelter",
            }
            outcome_label = outcome_labels.get(new_status, "Resolved")

            # Timeline entry for outcome
            db.add(HoldingTimeline(
                holding_id=holding_id,
                event_type="outcome",
                title=f"Case Resolved — {outcome_label}",
                notes=update_notes or f"Animal status updated to '{outcome_label}'. Linked report automatically closed.",
                logged_by=updated_by,
            ))

        elif new_status != old_status:
            # Status changed but not to a resolution status
            status_obj = db.query(FacilityStatus).filter(FacilityStatus.status_id == new_status).first()
            status_name = status_obj.status_name if status_obj else str(new_status)
            db.add(HoldingTimeline(
                holding_id=holding_id,
                event_type="status_change",
                title=f"Status Updated to '{status_name}'",
                notes=update_notes,
                logged_by=updated_by,
            ))

        elif update_notes:
            # Notes added without a status change — treat as general observation
            db.add(HoldingTimeline(
                holding_id=holding_id,
                event_type="observation",
                title="Medical / Observation Note Added",
                notes=update_notes,
                logged_by=updated_by,
            ))

        db.commit()
        full = _load(holding_id, db)
        return _populate(full)  # type: ignore[arg-type]
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating holding record {holding_id}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── POST /holding/{holding_id}/timeline ───────────────────────────────────────
@router.post("/{holding_id}/timeline", response_model=HoldingTimelineResponse)
def add_timeline_entry(holding_id: int, body: HoldingTimelineCreate, db: Session = Depends(get_db)):
    try:
        animal = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == holding_id).first()
        if not animal:
            raise HTTPException(status_code=404, detail="Holding record not found")

        log = HoldingTimeline(
            holding_id=holding_id,
            event_type=body.event_type,
            title=body.title,
            notes=body.notes,
            logged_by=body.logged_by,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        if log.staff:
            log.staff_name = log.staff.name  # type: ignore[attr-defined]
        return log
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
