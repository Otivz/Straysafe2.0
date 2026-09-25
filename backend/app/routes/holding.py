import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.report import HoldingAnimal, HoldingTimeline, Report, FacilityStatus, StatusHistory
from app.models.landmark import Landmark
from app.models.user import Subdivision, User
from app.utils.audit import log_activity
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
RESOLVED_STATUSES = {3, 4, 5, 7, 8}  # Claimed, Deceased, Transferred, Adopted/Released, Impounded
IMPOUND_DAYS = 0                # default days before stay limit / impoundment triggers (0 for immediate testing)
EXPIRY_WARNING_DAYS = 2         # warn when ≤ 2 days remain

CATEGORY_MAP = {
    1: "Injured Animal",
    2: "Aggressive Stray",
    3: "Possible Rabies Risk",
    4: "Roaming Pack",
    5: "Animal Rescue Needed",
}


def _format_duration(delta_seconds: float) -> str:
    """Format duration in seconds into human readable format like '2 days, 4 hrs' or '3 days'."""
    if delta_seconds < 0:
        delta_seconds = 0
    days = int(delta_seconds // 86400)
    hours = int((delta_seconds % 86400) // 3600)
    mins = int((delta_seconds % 3600) // 60)
    if days > 0:
        if hours > 0:
            return f"{days}d {hours}h"
        return f"{days} day{'s' if days != 1 else ''}"
    elif hours > 0:
        if mins > 0:
            return f"{hours}h {mins}m"
        return f"{hours} hr{'s' if hours != 1 else ''}"
    else:
        return f"{max(mins, 1)} min{'s' if mins != 1 else ''}"


def _populate(animal: HoldingAnimal) -> HoldingAnimal:
    """Populate transient fields and calculate Subdivision & Barangay stay durations for a HoldingAnimal."""
    if animal.intake_staff:
        animal.intake_staff_name = animal.intake_staff.name  # type: ignore[attr-defined]
    if animal.status_obj:
        animal.facility_status_name = animal.status_obj.status_name  # type: ignore[attr-defined]

    current_facility = None
    if animal.report:
        # Reconcile breed if animal.breed is missing or generic (Aspin/Puspin/Unknown) while report has specific breed
        if animal.report.animal_breed:
            if not animal.breed or animal.breed in ('Unknown', 'Aspin', 'Puspin') or animal.breed != animal.report.animal_breed:
                animal.breed = animal.report.animal_breed
        if not animal.color and (animal.report.animal_color or animal.report.ai_dominant_color):
            animal.color = animal.report.animal_color or animal.report.ai_dominant_color
        if not animal.estimated_size and (animal.report.estimated_size or animal.report.ai_estimated_size):
            animal.estimated_size = animal.report.estimated_size or animal.report.ai_estimated_size

        # If facility_status is 1 (Need Treatment) but the animal has no injuries/wounds/illness, default to Healthy (2)
        if animal.facility_status == 1:
            cond_text = (str(animal.report.condition or '') + ' ' + str(getattr(animal.report, 'description', '') or '')).lower()
            is_injured = any(k in cond_text for k in ['injured', 'bleeding', 'limping', 'weak', 'sick', 'treatment', 'wound', 'trapped', 'fracture', 'broken', 'infection', 'rabid'])
            if not is_injured:
                animal.facility_status = 2
                animal.facility_status_name = "Healthy"

        animal.report_landmark = animal.report.landmark  # type: ignore[attr-defined]
        animal.report_category = CATEGORY_MAP.get(animal.report.category_id, "Unknown")  # type: ignore[attr-defined]
        animal.report_media = animal.report.media  # type: ignore[attr-defined]
        animal.facility_id = animal.report.facility_id  # type: ignore[attr-defined]
        animal.subdivision_id = animal.report.subdivision_id  # type: ignore[attr-defined]
        animal.barangay_id = (
            animal.report.subdivision.barangay_id
            if animal.report.subdivision
            else None
        )  # type: ignore[attr-defined]
        if animal.report.facility:
            current_facility = animal.report.facility
            animal.facility_name = animal.report.facility.name  # type: ignore[attr-defined]
            animal.facility_type = animal.report.facility.facility_type  # type: ignore[attr-defined]
        else:
            animal.facility_name = animal.report.landmark if animal.report.facility_id else None  # type: ignore[attr-defined]
            animal.facility_type = None  # type: ignore[attr-defined]
    else:
        animal.report_media = []  # type: ignore[attr-defined]
        animal.facility_id = None  # type: ignore[attr-defined]
        animal.facility_name = None  # type: ignore[attr-defined]
        animal.facility_type = None  # type: ignore[attr-defined]
        animal.subdivision_id = None  # type: ignore[attr-defined]
        animal.barangay_id = None  # type: ignore[attr-defined]

    # Calculate Subdivision and Barangay Stay Durations
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    intake_time = animal.intake_date or animal.created_at or now
    resolved = animal.facility_status in RESOLVED_STATUSES
    discharge_time = animal.discharge_date if resolved else None

    subd_intake: Optional[datetime] = None
    subd_discharge: Optional[datetime] = None
    brgy_intake: Optional[datetime] = None
    brgy_discharge: Optional[datetime] = None
    transfer_date: Optional[datetime] = None
    has_subd_history = False

    # Check status history for facility transitions
    if animal.report and hasattr(animal.report, 'history') and animal.report.history:
        sorted_history = sorted(animal.report.history, key=lambda h: h.created_at or datetime.min)
        for h in sorted_history:
            if h.facility:
                if h.facility.subdivision_id is not None:
                    has_subd_history = True
                    if subd_intake is None:
                        subd_intake = h.created_at
                else:
                    if brgy_intake is None:
                        brgy_intake = h.created_at
                        if has_subd_history and transfer_date is None:
                            transfer_date = h.created_at

    # Also check timeline logs for transfer events
    if animal.timeline:
        sorted_logs = sorted(animal.timeline, key=lambda l: l.logged_at or datetime.min)
        for log in sorted_logs:
            title_lower = (log.title or '').lower()
            notes_lower = (log.notes or '').lower()
            if 'transfer' in title_lower or 'relocat' in title_lower or 'transfer' in notes_lower:
                if transfer_date is None and ('barangay' in title_lower or 'barangay' in notes_lower or 'shelter' in notes_lower):
                    transfer_date = log.logged_at

    is_curr_subd = current_facility and current_facility.subdivision_id is not None
    is_curr_brgy = current_facility and current_facility.subdivision_id is None

    if is_curr_subd:
        subd_intake = subd_intake or intake_time
        if discharge_time:
            subd_discharge = discharge_time
    elif is_curr_brgy:
        if transfer_date:
            subd_intake = subd_intake or intake_time
            subd_discharge = transfer_date
            brgy_intake = transfer_date
            if discharge_time:
                brgy_discharge = discharge_time
        elif has_subd_history or (animal.report and animal.report.subdivision_id):
            subd_intake = subd_intake or intake_time
            brgy_intake = brgy_intake or intake_time
            if discharge_time:
                brgy_discharge = discharge_time
        else:
            brgy_intake = intake_time
            if discharge_time:
                brgy_discharge = discharge_time
    else:
        brgy_intake = intake_time
        if discharge_time:
            brgy_discharge = discharge_time

    # Compute Subdivision duration
    if subd_intake:
        end_subd = subd_discharge or (now if is_curr_subd and not resolved else (transfer_date or now))
        subd_duration_sec = max(0.0, (end_subd - subd_intake).total_seconds())
        animal.subd_intake_date = subd_intake
        animal.subd_discharge_date = subd_discharge
        animal.subd_duration_days = round(subd_duration_sec / 86400, 2)
        animal.subd_duration_display = _format_duration(subd_duration_sec)
    else:
        animal.subd_intake_date = None
        animal.subd_discharge_date = None
        animal.subd_duration_days = 0.0
        animal.subd_duration_display = "0 days"

    # Compute Barangay duration
    if brgy_intake:
        end_brgy = brgy_discharge or (now if not resolved else brgy_intake)
        brgy_duration_sec = max(0.0, (end_brgy - brgy_intake).total_seconds())
        animal.brgy_intake_date = brgy_intake
        animal.brgy_discharge_date = brgy_discharge
        animal.brgy_duration_days = round(brgy_duration_sec / 86400, 2)
        animal.brgy_duration_display = _format_duration(brgy_duration_sec)
    else:
        animal.brgy_intake_date = None
        animal.brgy_discharge_date = None
        animal.brgy_duration_days = 0.0
        animal.brgy_duration_display = "0 days"

    # Compute total custody duration
    start_total = subd_intake or brgy_intake or intake_time
    end_total = discharge_time or now
    total_sec = max(0.0, (end_total - start_total).total_seconds())
    animal.total_duration_days = round(total_sec / 86400, 2)
    animal.total_duration_display = _format_duration(total_sec)
    animal.current_facility_duration_display = (
        animal.subd_duration_display if is_curr_subd else animal.brgy_duration_display
    )

    for log in animal.timeline:
        if log.staff:
            log.staff_name = log.staff.name  # type: ignore[attr-defined]
        elif log.logged_by is None:
            log.staff_name = "System Monitor"
    return animal


def _load(holding_id: int, db: Session) -> Optional[HoldingAnimal]:
    return (
        db.query(HoldingAnimal)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
            joinedload(HoldingAnimal.report).joinedload(Report.history).joinedload(StatusHistory.facility),
            joinedload(HoldingAnimal.intake_staff),
            joinedload(HoldingAnimal.status_obj),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.media),
        )
        .filter(HoldingAnimal.holding_id == holding_id)
        .first()
    )


# ── GET /holding/metrics ───────────────────────────────────────────────────────
@router.get("/metrics", response_model=HoldingMetricsResponse)
def get_metrics(
    subdivision_id: Optional[int] = None,
    barangay_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    barangay_only: Optional[bool] = None,
    impound_days: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = (
        db.query(HoldingAnimal)
        .join(HoldingAnimal.report)
        .options(joinedload(HoldingAnimal.status_obj))
    )

    if facility_id is not None:
        query = query.filter(Report.facility_id == facility_id)
    elif subdivision_id is not None:
        query = query.outerjoin(Report.facility).filter(
            or_(
                Report.subdivision_id == subdivision_id,
                Landmark.subdivision_id == subdivision_id
            )
        )
    elif barangay_only:
        query = query.outerjoin(Report.facility).filter(Landmark.subdivision_id.is_(None))
        if barangay_id is not None:
            query = query.filter(Landmark.barangay_id == barangay_id)
    elif barangay_id is not None:
        query = query.outerjoin(Report.subdivision).outerjoin(Report.facility).filter(
            or_(
                Subdivision.barangay_id == barangay_id,
                Landmark.barangay_id == barangay_id
            )
        )

    effective_impound_days = impound_days if (impound_days is not None and impound_days >= 0) else IMPOUND_DAYS

    # Run check & notify for overdue animals
    try:
        from app.tasks.unassigned_checker import check_and_notify_overdue_holding_animals
        check_and_notify_overdue_holding_animals(default_stay_days=effective_impound_days)
    except Exception as notif_err:
        logger.warning(f"Error checking overdue notifications in get_metrics: {notif_err}")

    animals = query.all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    deadline = timedelta(days=effective_impound_days)
    warn_threshold = timedelta(days=EXPIRY_WARNING_DAYS)

    total = len(animals)
    need_treatment = 0
    healthy = 0
    nearing_expiry = 0
    needs_impoundment = 0
    resolved_today = 0

    for a in animals:
        eff_status = a.facility_status
        if eff_status == 1 and a.report and a.report.condition:
            cond_text = str(a.report.condition).lower()
            is_injured = any(k in cond_text for k in ['injured', 'bleeding', 'limping', 'weak', 'sick', 'treatment', 'wound', 'trapped'])
            is_healthy = 'healthy' in cond_text or 'no condition' in cond_text
            if is_healthy and not is_injured:
                eff_status = 2

        if eff_status == 1:
            need_treatment += 1
        elif eff_status == 2:
            healthy += 1

        # Only count active animals for expiry / impoundment
        if a.facility_status not in RESOLVED_STATUSES and a.intake_date:
            time_in = now - a.intake_date
            if time_in >= deadline:
                needs_impoundment += 1
            elif (deadline - time_in) <= warn_threshold:
                nearing_expiry += 1

        # Discharged today
        if a.discharge_date and a.discharge_date.date() == now.date():
            resolved_today += 1

    return HoldingMetricsResponse(
        total=total,
        need_treatment=need_treatment,
        healthy=healthy,
        nearing_expiry=nearing_expiry,
        needs_impoundment=needs_impoundment,
        resolved_today=resolved_today,
    )


# ── GET /holding/ ─────────────────────────────────────────────────────────────
@router.get("/", response_model=List[HoldingAnimalResponse])
def list_animals(
    subdivision_id: Optional[int] = None,
    barangay_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    barangay_only: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = (
        db.query(HoldingAnimal)
        .join(HoldingAnimal.report)
        .options(
            joinedload(HoldingAnimal.report).joinedload(Report.media),
            joinedload(HoldingAnimal.report).joinedload(Report.facility),
            joinedload(HoldingAnimal.report).joinedload(Report.subdivision),
            joinedload(HoldingAnimal.report).joinedload(Report.history).joinedload(StatusHistory.facility),
            joinedload(HoldingAnimal.intake_staff),
            joinedload(HoldingAnimal.status_obj),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.staff),
            joinedload(HoldingAnimal.timeline).joinedload(HoldingTimeline.media),
        )
    )

    if facility_id is not None:
        query = query.filter(Report.facility_id == facility_id)
    elif subdivision_id is not None:
        query = query.outerjoin(Report.facility).filter(
            or_(
                Report.subdivision_id == subdivision_id,
                Landmark.subdivision_id == subdivision_id
            )
        )
    elif barangay_only:
        query = query.outerjoin(Report.facility).filter(Landmark.subdivision_id.is_(None))
        if barangay_id is not None:
            query = query.filter(Landmark.barangay_id == barangay_id)
    elif barangay_id is not None:
        query = query.outerjoin(Report.subdivision).outerjoin(Report.facility).filter(
            or_(
                Subdivision.barangay_id == barangay_id,
                Landmark.barangay_id == barangay_id
            )
        )

    animals = query.order_by(HoldingAnimal.intake_date.desc()).all()
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
        
        # Log activity
        log_activity(
            db=db,
            action="Intake Holding Animal",
            target_table="holding_animals",
            target_id=animal.holding_id,
            description=f"Stray animal from Report #{body.report_id} admitted to holding facility (ID: {animal.holding_id}).",
            user_id=body.intake_staff_id,
            log_type="operation"
        )

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
        media_ids    = update_data.pop("media_ids", None)

        if updated_by:
            updater = db.query(User).filter(User.user_id == updated_by).first()
            if updater and updater.role_id == 2:
                # Check if animal is transferred to barangay or in barangay custody
                is_in_barangay = False
                if animal.report and animal.report.facility:
                    is_in_barangay = (
                        animal.report.facility.facility_type == 'barangay_facility' or
                        'barangay' in (animal.report.facility.name or '').lower()
                    )
                elif animal.facility_status == 5:
                    is_in_barangay = True
                
                if is_in_barangay:
                    raise HTTPException(
                        status_code=403,
                        detail="This animal is currently in a Barangay facility and cannot be modified by Subdivision Leaders. You can only track its progress."
                    )

                if update_data.get("facility_status") in (6, 7, 8):
                    raise HTTPException(
                        status_code=403,
                        detail="Only Barangay staff and administrators have the authority to manage adoption or mark an animal as Impounded."
                    )

        for key, value in update_data.items():
            if hasattr(animal, key):
                setattr(animal, key, value)

        new_status = animal.facility_status
        db_log = None

        # ── Resolution logic ──────────────────────────────────────────────────
        if new_status in RESOLVED_STATUSES and old_status not in RESOLVED_STATUSES:
            animal.discharge_date = datetime.now(timezone.utc).replace(tzinfo=None)

            # Determine outcome label
            outcome_labels = {
                3: "Claimed by Owner",
                4: "Deceased",
                5: "Transferred to Shelter",
                7: "Adopted/Released",
                8: "Impounded",
            }
            outcome_label = outcome_labels.get(new_status, "Resolved")

            # Close the linked report (status 11 = Resolved)
            report = db.query(Report).filter(Report.report_id == animal.report_id).first()
            if report:
                report.current_status_id = 11
                if new_status == 8:
                    report.custody_status = "Impounded"
                elif new_status == 7:
                    report.custody_status = "Adopted"
                elif new_status == 3:
                    report.custody_status = "Claimed by Owner"
                elif new_status == 4:
                    report.custody_status = "Deceased"

                # Record official impoundment/resolution in status history
                history_status_id = 8 if new_status == 8 else 11
                impound_hist = StatusHistory(
                    report_id=report.report_id,
                    report_status_id=history_status_id,
                    updated_by=updated_by or animal.intake_staff_id,
                    remarks=update_notes or f"Animal officially marked as '{outcome_label}' after holding facility stay at {animal.facility_name or 'Holding Facility'}. Case resolved.",
                )
                db.add(impound_hist)

            # Timeline entry for outcome
            db_log = HoldingTimeline(
                holding_id=holding_id,
                event_type="outcome",
                title=f"Case Resolved — {outcome_label}",
                notes=update_notes or f"Animal status updated to '{outcome_label}'. Linked report automatically closed.",
                logged_by=updated_by,
            )
            db.add(db_log)

        elif new_status != old_status:
            # Status changed but not to a resolution status
            status_obj = db.query(FacilityStatus).filter(FacilityStatus.status_id == new_status).first()
            status_name = status_obj.status_name if status_obj else str(new_status)
            db_log = HoldingTimeline(
                holding_id=holding_id,
                event_type="status_change",
                title=f"Status Updated to '{status_name}'",
                notes=update_notes,
                logged_by=updated_by,
            )
            db.add(db_log)

        elif update_notes:
            # Notes added without a status change — treat as general observation
            db_log = HoldingTimeline(
                holding_id=holding_id,
                event_type="observation",
                title="Medical / Observation Note Added",
                notes=update_notes,
                logged_by=updated_by,
            )
            db.add(db_log)

        if db_log:
            db.flush()
            if media_ids:
                from app.models.report import ReportMedia
                db.query(ReportMedia).filter(
                    ReportMedia.media_id.in_(media_ids),
                    ReportMedia.report_id == animal.report_id
                ).update({ReportMedia.holding_log_id: db_log.log_id}, synchronize_session=False)

        # Log activity
        if new_status != old_status:
            status_obj = db.query(FacilityStatus).filter(FacilityStatus.status_id == new_status).first()
            status_name = status_obj.status_name if status_obj else str(new_status)
            log_desc = f"Updated holding animal #{holding_id} status to '{status_name}'."
            if update_notes:
                log_desc += f" Notes: {update_notes}"
            log_act = "Update Holding Status"
        else:
            log_desc = f"Added medical/observation note to holding animal #{holding_id}."
            if update_notes:
                log_desc += f" Notes: {update_notes}"
            log_act = "Add Holding Note"

        log_activity(
            db=db,
            action=log_act,
            target_table="holding_animals",
            target_id=holding_id,
            description=log_desc,
            user_id=updated_by,
            log_type="operation"
        )

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

        if body.logged_by:
            updater = db.query(User).filter(User.user_id == body.logged_by).first()
            if updater and updater.role_id == 2:
                is_in_barangay = False
                if animal.report and animal.report.facility:
                    is_in_barangay = (
                        animal.report.facility.facility_type == 'barangay_facility' or
                        'barangay' in (animal.report.facility.name or '').lower()
                    )
                elif animal.facility_status == 5:
                    is_in_barangay = True
                
                if is_in_barangay:
                    raise HTTPException(
                        status_code=403,
                        detail="This animal is currently in a Barangay facility and cannot be modified by Subdivision Leaders. You can only track its progress."
                    )

        log = HoldingTimeline(
            holding_id=holding_id,
            event_type=body.event_type,
            title=body.title,
            notes=body.notes,
            logged_by=body.logged_by,
        )
        db.add(log)
        db.flush()
        
        if body.media_ids:
            from app.models.report import ReportMedia
            db.query(ReportMedia).filter(
                ReportMedia.media_id.in_(body.media_ids),
                ReportMedia.report_id == animal.report_id
            ).update({ReportMedia.holding_log_id: log.log_id}, synchronize_session=False)

        # Log activity
        log_activity(
            db=db,
            action="Add Holding Timeline Entry",
            target_table="holding_timeline",
            target_id=log.log_id,
            description=f"Added timeline event '{body.title}' to holding animal #{holding_id}.",
            user_id=body.logged_by,
            log_type="operation"
        )

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
