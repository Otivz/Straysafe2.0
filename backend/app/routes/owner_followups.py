import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response, Form, File, UploadFile, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import or_, and_, desc, func

from app.database import get_db
from app.models.owner_followup import OwnerFollowUp, FollowUpContactLog, OwnerObservationUpdate, OwnerObservationUpdatePhoto
from app.models.report import Report
from app.models.warning import OwnerWarning
from app.models.user import User, Subdivision
from app.schemas.owner_followup import (
    OwnerFollowUpStart,
    OwnerFollowUpExtend,
    OwnerFollowUpClose,
    OwnerFollowUpAcknowledge,
    OwnerFollowUpUpdate,
    OwnerFollowUpOut,
    FollowUpContactLogCreate,
    FollowUpContactLogOut,
    MonitoringLogCreate,
    OwnerObservationUpdateOut,
    OwnerObservationUpdateReview,
    OwnerFollowUpSettingsOut,
    OwnerFollowUpSettingsUpdate,
    UnderObservationDashboardOut,
    UnderObservationEndorseRequest,
    OwnerFollowUpResolveRequest,
    OwnerFollowUpSecondWarningRequest
)
from app.models.report import Report, EndorsementLetter, StatusHistory
from app.utils.auth import get_current_user
from app.utils.owner_followups import (
    _now,
    get_default_duration_days,
    set_default_duration_days,
    validate_followup_start,
    record_observation_event,
    enrich_and_redact_followup,
    serialize_contact_log,
    sort_contact_logs,
    serialize_owner_update,
    sort_owner_updates,
    OWNER_COMPLIANCE_LABELS
)
from app.utils.uploads import read_and_validate_upload
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.audit import log_activity
from app.utils.notification_dispatcher import dispatch_notification
from app.utils.observation_resolution import notify_case_resolved, require_resolvable, resolve_observation_case

logger = logging.getLogger("stray_safe.owner_followups_route")

router = APIRouter(
    prefix="/owner-followups",
    tags=["owner-followups"]
)


def _notify(db: Session, **kwargs) -> None:
    """Dispatch an in-app notification and commit it.

    The action it reports on is already committed, so a failure here rolls back
    only the notification and is raised for the caller to log.
    """
    try:
        dispatch_notification(db=db, **kwargs)
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.post("/", response_model=OwnerFollowUpOut, status_code=status.HTTP_201_CREATED)
def start_owner_followup(
    payload: OwnerFollowUpStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start an owner observation follow-up on an eligible report."""
    report = db.query(Report).filter(Report.report_id == payload.report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    validated = validate_followup_start(
        db=db,
        report=report,
        actor=current_user,
        pet_id=payload.pet_id,
        owner_id=payload.owner_id,
        owner_name=payload.owner_name
    )

    duration = payload.duration_days or get_default_duration_days(db)
    due_date = _now() + timedelta(days=duration)

    followup = OwnerFollowUp(
        report_id=report.report_id,
        pet_id=validated["pet_id"],
        subdivision_id=report.subdivision_id,
        leader_id=current_user.user_id,
        owner_id=validated["owner_id"],
        owner_name=validated["owner_name"],
        owner_phone=payload.owner_phone,
        owner_address=payload.owner_address,
        status="observing",
        due_at=due_date,
        duration_days=duration,
        notes=payload.notes,
        is_extended=False
    )
    db.add(followup)
    record_observation_event(db, followup, "started", current_user.user_id)  # Phase 8: on the report's timeline
    db.commit()
    db.refresh(followup)

    # Notify owner if registered
    if followup.owner_id:
        try:
            _notify(
                db,
                user_id=followup.owner_id,
                title="Pet Under Observation Notice",
                message=(
                    f"A follow-up observation has been initiated for your pet regarding Report #{report.report_id}. "
                    f"Observation deadline: {due_date.strftime('%Y-%m-%d %H:%M')}. "
                    "Please keep your pet safely secured and view details in your portal."
                ),
                notification_type="followup_started",
                related_id=report.report_id
            )
        except Exception as e:
            logger.warning(f"Error dispatching followup start notification: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.get("/", response_model=List[OwnerFollowUpOut])
def list_owner_followups(
    report_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List follow-ups scoped by role and jurisdiction."""
    query = db.query(OwnerFollowUp)

    if current_user.role_id == 4:
        # Admin can view all
        pass
    elif current_user.role_id == 3:
        # Barangay staff: subdivisions in their barangay
        subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
        query = query.filter(OwnerFollowUp.subdivision_id.in_(subd_ids))
    elif current_user.role_id == 2:
        # Subdivision Leader: their subdivision
        query = query.filter(OwnerFollowUp.subdivision_id == current_user.subdivision_id)
    else:
        # Resident: only their own pets' follow-ups
        query = query.filter(OwnerFollowUp.owner_id == current_user.user_id)

    if report_id:
        query = query.filter(OwnerFollowUp.report_id == report_id)
    if status_filter:
        query = query.filter(OwnerFollowUp.status == status_filter)

    records = query.order_by(desc(OwnerFollowUp.created_at)).all()
    return [enrich_and_redact_followup(r, current_user, db) for r in records]


@router.get("/by-report/{report_id}", response_model=Optional[OwnerFollowUpOut])
def get_followup_by_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the latest follow-up for a report."""
    followup = db.query(OwnerFollowUp).filter(
        OwnerFollowUp.report_id == report_id
    ).order_by(desc(OwnerFollowUp.created_at)).first()

    if not followup:
        return None

    # Scope check
    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if current_user.role_id == 1 and followup.owner_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return enrich_and_redact_followup(followup, current_user, db)


@router.get("/settings/duration", response_model=OwnerFollowUpSettingsOut)
def get_followup_duration_setting(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the default observation duration."""
    return {"default_duration_days": get_default_duration_days(db)}


@router.put("/settings/duration", response_model=OwnerFollowUpSettingsOut)
def update_followup_duration_setting(
    payload: OwnerFollowUpSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Administrator update for the default observation duration."""
    if current_user.role_id != 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator role required.")
    days = set_default_duration_days(db, payload.default_duration_days, current_user.user_id)
    return {"default_duration_days": days}


@router.get("/active-count")
def get_active_observation_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve count of active observation cases for the sidebar badge."""
    if current_user.role_id not in (2, 3, 4):
        return {"active_count": 0}

    warning_report_ids = [w[0] for w in db.query(OwnerWarning.report_id).filter(OwnerWarning.report_id.isnot(None)).distinct().all()]
    if not warning_report_ids:
        return {"active_count": 0}

    query = db.query(OwnerFollowUp).filter(
        OwnerFollowUp.status == "observing",
        OwnerFollowUp.report_id.in_(warning_report_ids)
    )

    if current_user.role_id == 2:
        query = query.filter(OwnerFollowUp.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 3:
        subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
        query = query.filter(OwnerFollowUp.subdivision_id.in_(subd_ids))

    return {"active_count": query.count()}


@router.get("/under-observation", response_model=UnderObservationDashboardOut)
def get_under_observation_dashboard(
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    day_filter: Optional[int] = Query(None, alias="day"),
    tab_filter: Optional[str] = Query(None, alias="tab"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dedicated endpoint for the Subdivision Leader Under Observation page.
    Strict Rule: Only reports with an issued First Warning appear!
    Automatically creates/activates observation records for any reports with a First Warning.
    """
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required.")

    # 1. Base query for reports with First Warnings in jurisdiction
    rep_query = db.query(Report).join(OwnerWarning, OwnerWarning.report_id == Report.report_id)
    if current_user.role_id == 2:
        rep_query = rep_query.filter(Report.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 3:
        subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
        rep_query = rep_query.filter(Report.subdivision_id.in_(subd_ids))

    reports_with_warnings = rep_query.all()

    # 2. Auto-sync: ensure an OwnerFollowUp exists for every report with an issued warning
    created_followups = 0
    for rep in reports_with_warnings:
        existing_fu = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == rep.report_id).first()
        if not existing_fu:
            first_w = db.query(OwnerWarning).filter(
                OwnerWarning.report_id == rep.report_id
            ).order_by(OwnerWarning.created_at.asc()).first()
            if first_w:
                w_time = first_w.created_at or _now()
                owner_user = db.query(User).filter(User.user_id == first_w.user_id).first() if first_w.user_id else None
                new_fu = OwnerFollowUp(
                    report_id=rep.report_id,
                    pet_id=rep.pet_id or first_w.pet_id,
                    subdivision_id=rep.subdivision_id,
                    leader_id=first_w.issued_by or current_user.user_id,
                    owner_id=first_w.user_id,
                    owner_name=getattr(owner_user, 'name', None) or "Identified Owner",
                    owner_phone=getattr(owner_user, 'phone', None),
                    owner_address=getattr(owner_user, 'address', None) or getattr(rep, 'landmark', None),
                    status="observing",
                    duration_days=3,
                    due_at=w_time + timedelta(days=3),
                    notes=f"Observation automatically tracked from First Warning ({first_w.violation_type}): {first_w.description}",
                    created_at=w_time
                )
                db.add(new_fu)
                db.flush()
                created_followups += 1

    # Commit so the synced observation ids are real rows that logs and actions can reference.
    if created_followups:
        db.commit()

    # 3. Query follow-ups strictly tied to reports with warnings
    warning_report_ids = [r.report_id for r in reports_with_warnings]
    if not warning_report_ids:
        return {
            "items": [],
            "total_under_observation": 0,
            "day_1_count": 0,
            "day_2_count": 0,
            "day_3_count": 0,
            "overdue_count": 0,
            "complied_count": 0
        }

    fu_query = db.query(OwnerFollowUp).filter(
        OwnerFollowUp.report_id.in_(warning_report_ids)
    )
    if current_user.role_id == 2:
        fu_query = fu_query.filter(OwnerFollowUp.subdivision_id == current_user.subdivision_id)
    elif current_user.role_id == 3:
        subd_ids = [s.subdivision_id for s in db.query(Subdivision).filter(Subdivision.barangay_id == current_user.barangay_id).all()]
        fu_query = fu_query.filter(OwnerFollowUp.subdivision_id.in_(subd_ids))

    all_records = fu_query.order_by(desc(OwnerFollowUp.created_at)).all()
    enriched_items = [enrich_and_redact_followup(r, current_user, db) for r in all_records]

    # Calculate summary counts
    total_under_obs = len(enriched_items)
    day_1_c = sum(1 for it in enriched_items if (it.get("current_observation_day") or 0) == 1 and it.get("status") == "observing" and not it.get("is_overdue"))
    day_2_c = sum(1 for it in enriched_items if (it.get("current_observation_day") or 0) == 2 and it.get("status") == "observing" and not it.get("is_overdue"))
    day_3_c = sum(1 for it in enriched_items if (it.get("current_observation_day") or 0) >= 3 and it.get("status") == "observing" and not it.get("is_overdue"))
    overdue_c = sum(1 for it in enriched_items if it.get("is_overdue"))
    complied_c = sum(1 for it in enriched_items if it.get("status") == "complied")

    # Workflow Section Tab Counts
    active_obs_c = sum(1 for it in enriched_items if it.get("workflow_section") == "active")
    for_second_w_c = sum(1 for it in enriched_items if it.get("workflow_section") == "for_second_warning")
    second_w_issued_c = sum(1 for it in enriched_items if it.get("workflow_section") == "second_warning_issued")
    endorsed_c = sum(1 for it in enriched_items if it.get("workflow_section") == "endorsed")
    resolved_c = sum(1 for it in enriched_items if it.get("workflow_section") == "resolved")
    unreviewed_updates_c = sum(it.get("unreviewed_owner_updates_count") or 0 for it in enriched_items)

    # Apply filters to items
    filtered_items = enriched_items
    if tab_filter:
        tab_norm = tab_filter.lower().strip()
        filtered_items = [it for it in filtered_items if (it.get("workflow_section") or "").lower() == tab_norm]

    if status_filter:
        if status_filter.lower() == "overdue":
            filtered_items = [it for it in filtered_items if it.get("is_overdue")]
        elif status_filter.lower() == "active":
            filtered_items = [it for it in filtered_items if it.get("status") == "observing" and not it.get("is_overdue")]
        else:
            filtered_items = [it for it in filtered_items if (it.get("status") or "").lower() == status_filter.lower()]

    if day_filter:
        filtered_items = [it for it in filtered_items if it.get("current_observation_day") == day_filter]

    if search:
        s_lower = search.lower()
        filtered_items = [
            it for it in filtered_items
            if s_lower in str(it.get("report_id", "")).lower()
            or s_lower in (it.get("pet_name") or "").lower()
            or s_lower in (it.get("owner_name") or "").lower()
            or s_lower in (it.get("report_landmark") or "").lower()
            or s_lower in (it.get("report_animal_type") or "").lower()
            or s_lower in (it.get("first_warning_violation") or "").lower()
        ]

    return {
        "items": filtered_items,
        "total_under_observation": total_under_obs,
        "day_1_count": day_1_c,
        "day_2_count": day_2_c,
        "day_3_count": day_3_c,
        "overdue_count": overdue_c,
        "complied_count": complied_c,
        "active_observation_count": active_obs_c,
        "for_second_warning_count": for_second_w_c,
        "second_warning_issued_count": second_w_issued_c,
        "endorsed_count": endorsed_c,
        "resolved_count": resolved_c,
        "unreviewed_owner_updates_count": unreviewed_updates_c
    }


@router.get("/my-observations", response_model=List[OwnerFollowUpOut])
def list_my_observations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Observation records where the signed-in user is the identified pet owner."""
    records = db.query(OwnerFollowUp).filter(
        OwnerFollowUp.owner_id == current_user.user_id
    ).order_by(desc(OwnerFollowUp.created_at)).all()
    return [enrich_and_redact_followup(r, current_user, db) for r in records]


@router.post("/{followup_id}/resolve", response_model=OwnerFollowUpOut)
def resolve_owner_observation(
    followup_id: int,
    payload: OwnerFollowUpResolveRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Subdivision personnel verify compliance and mark the observation resolved. The case report becomes Incident
    Resolved in the same transaction (app/utils/observation_resolution.py).
    """
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subdivision Leader authority required.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).with_for_update().first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up record not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    if followup.status in ("complied", "closed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Case has already been marked as resolved.")
    require_resolvable(db, followup)

    followup.status = "complied"
    record_observation_event(db, followup, "ended", current_user.user_id)
    followup.closed_at = _now()
    followup.closed_by = current_user.user_id
    followup.compliance_notes = payload.verification_notes
    followup.close_reason = f"Verified by {current_user.name}: {payload.verification_notes}"
    outcome = resolve_observation_case(db, followup, current_user, payload.verification_notes, req)

    db.commit()
    db.refresh(followup)
    try:
        notify_case_resolved(db, followup, outcome, payload.verification_notes, current_user)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Error notifying reporters of resolution: {e}")

    if followup.owner_id:
        try:
            _notify(
                db,
                user_id=followup.owner_id,
                title="Observation Case Resolved",
                message=f"Subdivision personnel verified your compliance for Report #{followup.report_id}. The case is now resolved. Thank you for securing your pet!",
                notification_type="followup_resolved",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying owner of resolution: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/issue-second-warning", response_model=OwnerFollowUpOut)
def issue_second_warning_for_observation(
    followup_id: int,
    payload: OwnerFollowUpSecondWarningRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Subdivision personnel review non-compliant observation and issue Second Warning."""
    if current_user.role_id != 2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Subdivision Leader can issue official warnings.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    # Validate that 3-day observation has expired or is overdue
    now_utc = _now()
    due_naive = followup.due_at.replace(tzinfo=None) if followup.due_at.tzinfo is not None else followup.due_at
    if now_utc < due_naive and followup.status == "observing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The 3-day observation period is still active. A Second Warning requires the observation period to expire with unresolved non-compliance."
        )

    # Check if a 2nd Warning was already issued
    existing_second = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == followup.report_id,
        OwnerWarning.warning_level == "2nd Warning"
    ).first()
    if existing_second:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Second Warning has already been issued for this case."
        )

    if followup.status in ("complied", "closed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot issue Second Warning on a resolved or closed case."
        )

    if followup.status == "escalated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot issue warning on an already endorsed case."
        )

    # An owner without an account gets a logged verbal warning, never an account warning for someone else
    if not followup.owner_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This owner has no account. Log the second warning as a verbal warning (phone or in person) on the observation."
        )
    from app.utils.warning_rules import check_tier_for_incident
    check_tier_for_incident(db, followup.report_id, payload.violation_type, followup.pet_id, "2nd Warning")

    # Create OwnerWarning record
    w_time = _now()
    second_w = OwnerWarning(
        user_id=followup.owner_id,
        report_id=followup.report_id,
        pet_id=followup.pet_id,
        issued_by=current_user.user_id,
        warning_level="2nd Warning",
        violation_type=payload.violation_type,
        description=payload.description,
        fine_amount=payload.fine_amount or 0.0,
        status="Pending",
        created_at=w_time
    )
    db.add(second_w)

    followup.notes = (followup.notes or "") + f" | Second Warning issued ({payload.violation_type}): {payload.description}"

    report = db.query(Report).filter(Report.report_id == followup.report_id).first()
    if report:
        hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=7,  # Remains Under Observation with Second Warning badge
            updated_by=current_user.user_id,
            remarks=f"⚠️ Second Warning Issued by {current_user.name}: {payload.violation_type} - {payload.description}. Case eligible for Barangay Endorsement.",
        )
        db.add(hist)

    db.commit()
    db.refresh(followup)

    # Notify owner
    if followup.owner_id:
        try:
            _notify(
                db,
                user_id=followup.owner_id,
                title="Official Notice: Second Warning Issued",
                message=f"You have received a Second Warning regarding '{payload.violation_type}' for Report #{followup.report_id}. Continued non-compliance will result in endorsement to Barangay San Vicente.",
                notification_type="warning_issued",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying owner of 2nd warning: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/endorse-barangay")
def endorse_observation_to_barangay(
    followup_id: int,
    payload: UnderObservationEndorseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Endorse an unresolved observation case to Barangay San Vicente following Second Warning."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subdivision Leader authority required.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up record not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    # Rule 7: Only allow Barangay endorsement after the Second Warning has been issued
    has_second_w = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == followup.report_id,
        OwnerWarning.warning_level == "2nd Warning"
    ).first()
    if not has_second_w:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Barangay endorsement requires a Second Warning to be issued first after the 3-day observation period."
        )

    report = db.query(Report).filter(Report.report_id == followup.report_id).first()

    # Rule 7: Prevent duplicate Barangay endorsements
    if followup.status == "escalated" or (report and report.current_status_id in (4, 13)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Case has already been endorsed to Barangay San Vicente."
        )

    # Create / update EndorsementLetter record
    end_letter = db.query(EndorsementLetter).filter(EndorsementLetter.report_id == followup.report_id).first()
    if not end_letter:
        end_letter = EndorsementLetter(
            report_id=followup.report_id,
            leader_id=current_user.user_id,
            title=f"Community Observation Escalation — Report #{followup.report_id}",
            letter_content=payload.endorsement_reason,
            status_id=1
        )
        db.add(end_letter)
    else:
        end_letter.letter_content = payload.endorsement_reason

    followup.status = "escalated"
    record_observation_event(db, followup, "ended", current_user.user_id)
    followup.closed_at = _now()
    followup.closed_by = current_user.user_id
    followup.close_reason = f"Endorsed to Barangay: {payload.endorsement_reason}"
    if payload.notes:
        followup.compliance_notes = payload.notes

    if report:
        report.current_status_id = 4
        hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=4,
            updated_by=current_user.user_id,
            remarks=f"🏛️ Endorsed to Barangay San Vicente following Second Warning: {payload.endorsement_reason}",
        )
        db.add(hist)

    db.commit()
    db.refresh(followup)

    # Notify Barangay staff (role_id == 3)
    brgy_users = db.query(User).filter(User.role_id == 3).all()
    for b_user in brgy_users:
        try:
            _notify(
                db,
                user_id=b_user.user_id,
                title="Incoming Barangay Endorsement",
                message=f"Report #{followup.report_id} has been formally endorsed to Barangay San Vicente following non-compliance and Second Warning.",
                notification_type="endorsement",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying barangay staff: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.get("/{followup_id}", response_model=OwnerFollowUpOut)
def get_owner_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get single follow-up details."""
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up record not found.")

    # Authorization
    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden outside your subdivision.")
    if current_user.role_id == 1 and followup.owner_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden.")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/contact-logs", response_model=FollowUpContactLogOut, status_code=status.HTTP_201_CREATED)
def add_contact_log(
    followup_id: int,
    payload: FollowUpContactLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Staff records an in-person, phone, or SMS contact attempt."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required to record contact logs.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    log = FollowUpContactLog(
        followup_id=followup.followup_id,
        logged_by=current_user.user_id,
        report_id=followup.report_id,
        pet_id=followup.pet_id,
        contact_type=payload.contact_type,
        notes=payload.notes,
        contact_date=payload.contact_date or _now()
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return serialize_contact_log(log, db)


@router.get("/{followup_id}/contact-logs", response_model=List[FollowUpContactLogOut])
def list_contact_logs(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Staff views contact logs. Hidden from regular residents."""
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required to view contact logs.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden outside your subdivision.")

    logs = db.query(FollowUpContactLog).filter(
        FollowUpContactLog.followup_id == followup.followup_id
    ).order_by(desc(FollowUpContactLog.contact_date)).all()

    return [serialize_contact_log(l, db) for l in logs]


# Under Observation monitoring logs. Each submission is an append-only row in
# followup_contact_logs; there is no edit or delete endpoint by design.
MONITORING_METHOD_TO_CONTACT_TYPE = {
    "observation": "Other",
    "direct_owner": "In-Person Visit",
    "in_person": "In-Person Visit",
    "phone": "Phone Call",
    "sms": "SMS",
    "other": "Other",
}


def _get_followup_for_staff(followup_id: int, db: Session, current_user: User) -> OwnerFollowUp:
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation record not found.")
    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")
    if current_user.role_id == 3:
        subd = db.query(Subdivision).filter(Subdivision.subdivision_id == followup.subdivision_id).first()
        if not subd or subd.barangay_id != current_user.barangay_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your barangay.")
    return followup


def _existing_monitoring_log(db: Session, client_request_id: Optional[str]) -> Optional[FollowUpContactLog]:
    if not client_request_id:
        return None
    return db.query(FollowUpContactLog).filter(FollowUpContactLog.client_request_id == client_request_id).first()


@router.post("/{followup_id}/logs", response_model=FollowUpContactLogOut, status_code=status.HTTP_201_CREATED)
def add_monitoring_log(
    followup_id: int,
    payload: MonitoringLogCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Subdivision personnel record a daily inspection or follow-up. Does not change the countdown or status."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subdivision staff role required to add monitoring logs.")

    followup = _get_followup_for_staff(followup_id, db, current_user)

    # A repeated click or a retry after a lost response returns the row already saved.
    existing = _existing_monitoring_log(db, payload.client_request_id)
    if existing:
        if existing.followup_id != followup.followup_id or existing.logged_by != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate submission key. Reload the page and try again.")
        response.status_code = status.HTTP_200_OK
        return serialize_contact_log(existing, db)

    report = db.query(Report).filter(Report.report_id == followup.report_id).first()
    if followup.status in ("complied", "closed", "cancelled") or (report and report.current_status_id == 11):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This observation is already resolved or closed. Monitoring logs can no longer be added."
        )

    # contact_date and created_at are left to the database server timestamp.
    log = FollowUpContactLog(
        followup_id=followup.followup_id,
        report_id=followup.report_id,
        pet_id=followup.pet_id or (report.pet_id if report else None),
        logged_by=current_user.user_id,
        contact_type=MONITORING_METHOD_TO_CONTACT_TYPE[payload.contact_method],
        inspection_method=payload.contact_method,
        inspection_outcome=payload.outcome,
        notes=payload.notes,
        client_request_id=payload.client_request_id,
    )
    db.add(log)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing_monitoring_log(db, payload.client_request_id)
        if existing and existing.followup_id == followup.followup_id and existing.logged_by == current_user.user_id:
            response.status_code = status.HTTP_200_OK
            return serialize_contact_log(existing, db)
        logger.exception("Monitoring log insert violated a constraint for follow-up %s", followup_id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The monitoring log could not be saved because of conflicting data.")
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to save monitoring log for follow-up %s", followup_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The monitoring log could not be saved to the database. Please try again.")
    db.refresh(log)
    return serialize_contact_log(log, db)


@router.get("/{followup_id}/logs", response_model=List[FollowUpContactLogOut])
def list_monitoring_logs(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """All monitoring and contact logs for an observation, newest first."""
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required to view monitoring logs.")
    followup = _get_followup_for_staff(followup_id, db, current_user)
    logs = db.query(FollowUpContactLog).filter(FollowUpContactLog.followup_id == followup.followup_id).all()
    return [serialize_contact_log(l, db) for l in sort_contact_logs(logs)]


# Owner observation updates. Owner fields are append-only; staff review is recorded
# separately and never verifies resolution or changes the countdown.
OWNER_UPDATE_MAX_PHOTOS = 5
OWNER_UPDATE_REMARKS_MAX = 2000


def _existing_owner_update(db: Session, client_request_id: Optional[str]) -> Optional[OwnerObservationUpdate]:
    if not client_request_id:
        return None
    return db.query(OwnerObservationUpdate).filter(OwnerObservationUpdate.client_request_id == client_request_id).first()


@router.post("/{followup_id}/owner-updates", response_model=OwnerObservationUpdateOut, status_code=status.HTTP_201_CREATED)
async def submit_owner_observation_update(
    followup_id: int,
    response: Response,
    request: Request,
    compliance_status: str = Form(...),
    owner_remarks: str = Form(...),
    client_request_id: Optional[str] = Form(None),
    photos: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """The identified pet owner submits a compliance update with optional photo evidence."""
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    # Owner identity comes from the session; anyone else gets the same answer as a missing record.
    if not followup or not followup.owner_id or followup.owner_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation record not found for your account.")

    request_key = (client_request_id or "").strip() or None
    if request_key and not (8 <= len(request_key) <= 64):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid submission key.")

    # A repeated click or a retry after a lost response returns the update already saved.
    existing = _existing_owner_update(db, request_key)
    if existing:
        if existing.followup_id != followup.followup_id or existing.owner_user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate submission key. Reload the page and try again.")
        response.status_code = status.HTTP_200_OK
        return serialize_owner_update(existing, db)

    report = db.query(Report).filter(Report.report_id == followup.report_id).first()
    if followup.status != "observing" or (report and report.current_status_id == 11):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This observation is no longer active, so updates can no longer be submitted."
        )

    if compliance_status not in OWNER_COMPLIANCE_LABELS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Please choose a compliance status.")
    remarks = (owner_remarks or "").strip()
    if len(remarks) < 3:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Please describe what you did to address the reported issue.")
    if len(remarks) > OWNER_UPDATE_REMARKS_MAX:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Remarks must be {OWNER_UPDATE_REMARKS_MAX} characters or fewer.")

    named_photos = [f for f in photos if f and f.filename]
    if len(named_photos) > OWNER_UPDATE_MAX_PHOTOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"You can attach at most {OWNER_UPDATE_MAX_PHOTOS} photos.")

    # Validate every photo before uploading any, so a bad file does not leave partial uploads.
    validated = [await read_and_validate_upload(f, allowed={"Image"}) for f in named_photos]
    photo_urls: List[str] = []
    for content, unique_name, _media_type, resource_type in validated:
        try:
            url = await run_in_threadpool(
                upload_to_cloudinary, content,
                folder="straysafe/observation_updates", resource_type=resource_type, filename=unique_name
            )
        except Exception as exc:
            logger.error(f"Owner observation photo upload failed for follow-up {followup_id}: {exc}")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Your photos could not be stored right now. Your update was not submitted; please try again.")
        if not url:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Your photos could not be stored right now. Your update was not submitted; please try again.")
        photo_urls.append(url)

    update = OwnerObservationUpdate(
        followup_id=followup.followup_id,
        report_id=followup.report_id,
        pet_id=followup.pet_id or (report.pet_id if report else None),
        owner_user_id=current_user.user_id,
        compliance_status=compliance_status,
        owner_remarks=remarks,
        client_request_id=request_key,
        # submitted_at, created_at and updated_at use the database server timestamp.
    )
    update.photos = [OwnerObservationUpdatePhoto(photo_url=u) for u in photo_urls]
    db.add(update)
    try:
        db.flush()
        log_activity(
            db=db,
            action="SUBMIT_OWNER_OBSERVATION_UPDATE",
            target_table="owner_observation_updates",
            target_id=update.update_id,
            description=f"Owner submitted observation update ({OWNER_COMPLIANCE_LABELS[compliance_status]}) for Report #{followup.report_id} with {len(photo_urls)} photo(s)",
            user_id=current_user.user_id,
            log_type="enforcement",
            request=request,
            commit=False,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing_owner_update(db, request_key)
        if existing and existing.followup_id == followup.followup_id and existing.owner_user_id == current_user.user_id:
            response.status_code = status.HTTP_200_OK
            return serialize_owner_update(existing, db)
        logger.exception("Owner observation update insert violated a constraint for follow-up %s", followup_id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your update could not be saved because of conflicting data.")
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to save owner observation update for follow-up %s", followup_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Your update could not be saved. Please try again.")
    db.refresh(update)

    status_label = OWNER_COMPLIANCE_LABELS[compliance_status]
    photo_note = f" with {len(photo_urls)} photo(s) of evidence" if photo_urls else ""
    notices = [
        dict(
            user_id=followup.leader_id,
            title="New Owner Observation Update" if not photo_urls else "New Owner Update with Photo Evidence",
            message=f"{current_user.name} submitted an observation update for Report #{followup.report_id}: {status_label}{photo_note}. Please review it.",
            notification_type="followup_owner_update",
            related_id=followup.report_id,
        ),
        dict(
            user_id=current_user.user_id,
            title="Observation Update Submitted",
            message=f"Your observation update for Report #{followup.report_id} was received. Your subdivision will review it; the observation deadline is unchanged.",
            notification_type="followup_owner_update_received",
            related_id=followup.report_id,
        ),
    ]
    if compliance_status == "issue_resolved":
        notices.append(dict(
            user_id=followup.leader_id,
            title="Owner Reports Issue Resolved",
            message=f"The owner reports the issue for Report #{followup.report_id} is resolved. Verify on site before marking the case resolved.",
            notification_type="followup_owner_resolved_claim",
            related_id=followup.report_id,
        ))
    for notice in notices:
        try:
            _notify(db, **notice)
        except Exception as e:
            logger.warning(f"Error sending owner update notification for follow-up {followup_id}: {e}")

    return serialize_owner_update(update, db)


@router.get("/{followup_id}/owner-updates", response_model=List[OwnerObservationUpdateOut])
def list_owner_observation_updates(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Owner updates for an observation, newest first. Visible to the owner and to staff in scope."""
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    is_owner = bool(followup and followup.owner_id and followup.owner_id == current_user.user_id)
    if not is_owner:
        if current_user.role_id not in (2, 3, 4):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation record not found for your account.")
        followup = _get_followup_for_staff(followup_id, db, current_user)
    return [serialize_owner_update(u, db) for u in sort_owner_updates(followup.owner_updates)]


@router.post("/{followup_id}/owner-updates/{update_id}/review", response_model=OwnerObservationUpdateOut)
def review_owner_observation_update(
    followup_id: int,
    update_id: int,
    payload: OwnerObservationUpdateReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Subdivision staff mark an owner update as reviewed. This does not verify or resolve the case."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subdivision staff role required to review owner updates.")
    followup = _get_followup_for_staff(followup_id, db, current_user)
    update = db.query(OwnerObservationUpdate).filter(
        OwnerObservationUpdate.update_id == update_id,
        OwnerObservationUpdate.followup_id == followup.followup_id
    ).first()
    if not update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner update not found for this observation.")
    if update.reviewed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This update has already been reviewed.")

    update.reviewed_at = func.current_timestamp()
    update.reviewed_by = current_user.user_id
    update.review_remarks = payload.review_remarks
    try:
        log_activity(
            db=db,
            action="REVIEW_OWNER_OBSERVATION_UPDATE",
            target_table="owner_observation_updates",
            target_id=update.update_id,
            description=f"Reviewed owner observation update #{update.update_id} for Report #{followup.report_id}",
            user_id=current_user.user_id,
            log_type="enforcement",
            request=request,
            commit=False,
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to save review for owner update %s", update_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="The review could not be saved. Please try again.")
    db.refresh(update)
    return serialize_owner_update(update, db)


@router.post("/{followup_id}/acknowledge", response_model=OwnerFollowUpOut)
def acknowledge_followup(
    followup_id: int,
    payload: OwnerFollowUpAcknowledge,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Owner acknowledges observation notice, or staff records verbal acknowledgement."""
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    is_owner = followup.owner_id and current_user.user_id == followup.owner_id
    is_staff = current_user.role_id in (2, 4)

    if not is_owner and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to acknowledge this follow-up.")

    method = payload.method or ("account" if is_owner else "verbal")
    followup.owner_acknowledged_at = _now()
    followup.owner_acknowledgement_method = method
    if payload.notes:
        if is_owner:
            followup.owner_notes = payload.notes
        else:
            # Staff logging verbal acknowledgement: add contact log
            log = FollowUpContactLog(
                followup_id=followup.followup_id,
                logged_by=current_user.user_id,
                contact_type="Phone Call" if method == "phone" else "In-Person Visit",
                notes=f"Owner verbal acknowledgement: {payload.notes}"
            )
            db.add(log)

    db.commit()
    db.refresh(followup)

    # If owner acknowledged via app, notify the leader
    if is_owner:
        try:
            _notify(
                db,
                user_id=followup.leader_id,
                title="Observation Notice Acknowledged",
                message=f"The owner has acknowledged the follow-up observation for Report #{followup.report_id}.",
                notification_type="followup_acknowledged",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying leader of acknowledgement: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/owner-update", response_model=OwnerFollowUpOut)
def update_owner_followup(
    followup_id: int,
    payload: OwnerFollowUpUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Owner provides status notes or proof photo of containment."""
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if followup.status != "observing":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Follow-up observation is no longer active.")

    is_owner = followup.owner_id and current_user.user_id == followup.owner_id
    is_staff = current_user.role_id in (2, 4)

    if not is_owner and not is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if payload.owner_notes is not None:
        followup.owner_notes = payload.owner_notes
    if payload.owner_photo_url is not None:
        followup.owner_photo_url = payload.owner_photo_url
        followup.owner_photo_submitted_at = _now()

    db.commit()
    db.refresh(followup)

    if is_owner:
        try:
            _notify(
                db,
                user_id=followup.leader_id,
                title="Owner Compliance Update Submitted",
                message=f"The owner submitted a progress update for Report #{followup.report_id}.",
                notification_type="followup_owner_update",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying leader of owner update: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/extend", response_model=OwnerFollowUpOut)
def extend_owner_followup(
    followup_id: int,
    payload: OwnerFollowUpExtend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Leader grants a single reasoned extension."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required to extend observation.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    if followup.status != "observing":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot extend an ended or closed observation.")

    # Single extension enforcement rule
    if followup.is_extended:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only one extension is allowed for this follow-up observation."
        )

    ext_days = payload.extension_days or get_default_duration_days(db)
    followup.is_extended = True
    followup.extended_at = _now()
    followup.extended_by = current_user.user_id
    followup.extension_reason = payload.extension_reason
    followup.extension_days = ext_days
    followup.due_at = followup.due_at + timedelta(days=ext_days)
    record_observation_event(db, followup, "extended", current_user.user_id)

    db.commit()
    db.refresh(followup)

    if followup.owner_id:
        try:
            _notify(
                db,
                user_id=followup.owner_id,
                title="Observation Period Extended",
                message=(
                    f"The observation period for Report #{followup.report_id} has been extended by {ext_days} days. "
                    f"New deadline: {followup.due_at.strftime('%Y-%m-%d %H:%M')}. Reason: {payload.extension_reason}"
                ),
                notification_type="followup_extended",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying owner of extension: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


@router.post("/{followup_id}/close", response_model=OwnerFollowUpOut)
def close_owner_followup(
    followup_id: int,
    payload: OwnerFollowUpClose,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Leader marks follow-up complied, closed, or escalated. Complied is the resolution: the case report becomes
    Incident Resolved in the same transaction, exactly as /resolve (app/utils/observation_resolution.py).
    A concluded observation can't be closed again (no duplicate events or notifications).
    """
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required to close observation.")

    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")

    if current_user.role_id == 2 and current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")

    if payload.outcome not in ("complied", "closed", "escalated"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Outcome must be 'complied', 'closed', or 'escalated'."
        )

    if followup.status != "observing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This observation has already been concluded; nothing was changed.")
    if payload.outcome == "complied":
        require_resolvable(db, followup)

    followup.status = payload.outcome
    followup.closed_at = _now()
    followup.closed_by = current_user.user_id
    followup.close_reason = payload.reason
    followup.compliance_notes = payload.compliance_notes
    record_observation_event(db, followup, "ended", current_user.user_id)
    outcome = None
    if payload.outcome == "complied":
        remarks = (payload.compliance_notes or "").strip() or payload.reason
        outcome = resolve_observation_case(db, followup, current_user, remarks, req)

    db.commit()
    db.refresh(followup)
    if outcome is not None:
        try:
            notify_case_resolved(db, followup, outcome, remarks, current_user)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning(f"Error notifying reporters of resolution: {e}")

    if followup.owner_id:
        outcome_title = "Observation Completed: Complied" if payload.outcome == "complied" else f"Observation {payload.outcome.capitalize()}"
        try:
            _notify(
                db,
                user_id=followup.owner_id,
                title=outcome_title,
                message=f"The follow-up observation for Report #{followup.report_id} has been concluded ({payload.outcome}). Reason: {payload.reason}",
                notification_type="followup_closed",
                related_id=followup.report_id
            )
        except Exception as e:
            logger.warning(f"Error notifying owner of closure: {e}")

    return enrich_and_redact_followup(followup, current_user, db)


# ── Phase 6: verbal warnings, repeated incidents, pet history summary ───────

def _handling_leader_followup(db: Session, followup_id: int, current_user: User) -> OwnerFollowUp:
    """The follow-up, for its handling Subdivision Leader (own subdivision) only."""
    if current_user.role_id != 2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the handling Subdivision Leader can do this.")
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).with_for_update().first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")
    if current_user.subdivision_id != followup.subdivision_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied outside your subdivision.")
    return followup


VERBAL_METHODS = {"phone": "Phone call", "in_person": "In person"}
VERBAL_TIERS = ("Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation")


class VerbalWarningRequest(BaseModel):
    method: str = Field(..., pattern="^(phone|in_person)$")
    tier: str = Field(..., pattern="^(Notice|1st Warning|2nd Warning|Final Notice / Escalation)$")
    report_id: Optional[int] = None  # the incident: the observed report (default) or a logged repeat
    notes: str = Field(..., min_length=10, max_length=2000)
    contact_date: Optional[datetime] = None


@router.post("/{followup_id}/verbal-warning", response_model=FollowUpContactLogOut, status_code=status.HTTP_201_CREATED)
def log_verbal_warning(followup_id: int, payload: VerbalWarningRequest, req: Request, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """
    An owner recorded without an account is warned by phone or in person. It is logged as a contact entry on the
    observation (contact type Verbal Warning) instead of creating an account warning for anyone.
    """
    followup = _handling_leader_followup(db, followup_id, current_user)
    if followup.owner_id:
        raise HTTPException(status_code=409, detail="This owner has an account. Issue an official warning instead.")
    if followup.status != "observing":
        raise HTTPException(status_code=409, detail="Verbal warnings are logged during an open observation.")
    from app.utils.owner_followups import logged_repeat_report_ids
    report_id = payload.report_id or followup.report_id
    if report_id != followup.report_id and report_id not in logged_repeat_report_ids(db, followup):
        raise HTTPException(status_code=400, detail="Choose the observed report or a logged repeat incident.")
    dup = db.query(FollowUpContactLog.contact_log_id).filter(
        FollowUpContactLog.followup_id == followup.followup_id, FollowUpContactLog.contact_type == "Verbal Warning",
        FollowUpContactLog.report_id == report_id, FollowUpContactLog.inspection_outcome == payload.tier).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"A verbal {payload.tier} is already logged for Report #{report_id}.")

    method_label = VERBAL_METHODS[payload.method]
    log = FollowUpContactLog(
        followup_id=followup.followup_id, logged_by=current_user.user_id, report_id=report_id, pet_id=followup.pet_id,
        contact_type="Verbal Warning", inspection_method=payload.method, inspection_outcome=payload.tier,
        notes=f"Verbal {payload.tier} ({method_label}): {payload.notes.strip()}",
        contact_date=payload.contact_date or _now(),
    )
    db.add(log)
    db.add(StatusHistory(report_id=report_id, report_status_id=7, updated_by=current_user.user_id,
                         remarks=f"Verbal {payload.tier} given to the owner ({method_label.lower()}) by {current_user.name}."))
    log_activity(db=db, action="LOG_VERBAL_WARNING", target_table="followup_contact_logs", target_id=None,
                 description=f"{current_user.name} logged a verbal {payload.tier} for follow-up #{followup.followup_id} (Report #{report_id}).",
                 user_id=current_user.user_id, log_type="enforcement", request=req, commit=False)
    db.commit()
    db.refresh(log)
    return serialize_contact_log(log, db)


class RepeatIncidentRequest(BaseModel):
    report_id: int
    notes: str = Field(..., min_length=10, max_length=2000)
    incident_date: Optional[datetime] = None


def _repeat_view(inc, db: Session) -> Dict[str, Any]:
    rep = db.get(Report, inc.report_id)
    return {
        "incident_id": inc.incident_id, "report_id": inc.report_id, "notes": inc.notes,
        "incident_date": (inc.incident_date or (rep.created_at if rep else None)),
        "landmark": rep.landmark if rep else None,
        "logged_by_name": inc.logger.name if inc.logger else None, "created_at": inc.created_at,
    }


@router.get("/{followup_id}/repeated-reports")
def get_repeated_reports(followup_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Logged repeat incidents, and other reports about the observed pet that may be repeats (the cross-report banner).
    Opening it also makes sure the handling leader was alerted once about each one.
    """
    from app.models.owner_followup import FollowUpRepeatedIncident
    from app.utils.auth import verify_subdivision_scope
    from app.utils.owner_followups import alert_repeat_reports, repeat_report_candidates
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required.")
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")
    verify_subdivision_scope(current_user, followup.subdivision_id, db=db)
    if alert_repeat_reports(db, followup):
        db.commit()
    logged = (db.query(FollowUpRepeatedIncident).filter(FollowUpRepeatedIncident.followup_id == followup_id)
              .order_by(FollowUpRepeatedIncident.created_at).all())
    return {
        "followup_id": followup_id,
        "observed_report_id": followup.report_id,
        "can_log": current_user.role_id == 2 and current_user.subdivision_id == followup.subdivision_id
                   and followup.status == "observing",
        "candidates": [{"report_id": r.report_id, "landmark": r.landmark, "created_at": r.created_at,
                        "description": (r.description or "")[:160] or None} for r in repeat_report_candidates(db, followup)],
        "logged": [_repeat_view(i, db) for i in logged],
    }


@router.post("/{followup_id}/repeated-incidents", status_code=status.HTTP_201_CREATED)
def log_repeated_incident(followup_id: int, payload: RepeatIncidentRequest, req: Request, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """
    Log another report as a repeat incident of the observed pet. It must be a related report (about the same pet, or
    in the same subdivision when the pet has no record), not the observed report or its merged duplicates, and only once.
    """
    from app.models.owner_followup import FollowUpRepeatedIncident
    from app.utils.case_groups import case_root
    followup = _handling_leader_followup(db, followup_id, current_user)
    if followup.status != "observing":
        raise HTTPException(status_code=409, detail="Repeat incidents are logged during an open observation.")
    if payload.report_id == followup.report_id:
        raise HTTPException(status_code=400, detail="That is the observed report itself. Choose the other, related report.")
    rep = db.query(Report).filter(Report.report_id == payload.report_id).first()
    if rep is None:
        raise HTTPException(status_code=404, detail=f"Report #{payload.report_id} not found.")
    observed = db.get(Report, followup.report_id)
    if rep.duplicate_of_report_id or (observed and case_root(db, rep).report_id == case_root(db, observed).report_id):
        raise HTTPException(status_code=400, detail=(
            f"Report #{rep.report_id} is merged into a case (or is the observed case), so it is not a separate incident."))
    related = rep.pet_id == followup.pet_id if followup.pet_id else rep.subdivision_id == followup.subdivision_id
    if not related:
        raise HTTPException(status_code=400, detail=(
            f"Report #{rep.report_id} isn't related to the observed pet. Link it to the pet first if it is the same animal."))
    if db.query(FollowUpRepeatedIncident.incident_id).filter(
            FollowUpRepeatedIncident.followup_id == followup.followup_id,
            FollowUpRepeatedIncident.report_id == rep.report_id).first():
        raise HTTPException(status_code=409, detail=f"Report #{rep.report_id} is already logged as a repeat incident.")

    inc = FollowUpRepeatedIncident(
        followup_id=followup.followup_id, report_id=rep.report_id, pet_id=followup.pet_id, logged_by=current_user.user_id,
        notes=payload.notes.strip(), incident_date=payload.incident_date or rep.created_at,
    )
    db.add(inc)
    db.add(FollowUpContactLog(
        followup_id=followup.followup_id, logged_by=current_user.user_id, report_id=followup.report_id,
        pet_id=followup.pet_id, contact_type="Other", inspection_method="observation",
        inspection_outcome="repeat_incident", notes=f"Repeat incident logged: Report #{rep.report_id}. {payload.notes.strip()}",
        contact_date=_now(),
    ))
    db.add(StatusHistory(report_id=followup.report_id, report_status_id=7, updated_by=current_user.user_id,
                         remarks=f"Repeat incident logged by {current_user.name}: Report #{rep.report_id}."))
    log_activity(db=db, action="LOG_REPEAT_INCIDENT", target_table="followup_repeated_incidents", target_id=None,
                 description=f"{current_user.name} logged Report #{rep.report_id} as a repeat incident of follow-up #{followup.followup_id}.",
                 user_id=current_user.user_id, log_type="enforcement", request=req, commit=False)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Report #{rep.report_id} is already logged as a repeat incident.")
    db.refresh(inc)
    return _repeat_view(inc, db)


@router.get("/pet/{pet_id}/summary")
def get_pet_followup_summary(pet_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Staff only: this pet's observations, repeat incidents and warning counts, for the existing pet history view."""
    from app.models.owner_followup import FollowUpRepeatedIncident
    from app.utils.auth import verify_subdivision_scope
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff role required.")
    followups = [f for f in db.query(OwnerFollowUp).filter(OwnerFollowUp.pet_id == pet_id)
                 .order_by(OwnerFollowUp.created_at.desc()).all()
                 if verify_subdivision_scope(current_user, f.subdivision_id, db=db, raise_exception=False)]
    ids = [f.followup_id for f in followups]
    repeats = (db.query(FollowUpRepeatedIncident).filter(FollowUpRepeatedIncident.followup_id.in_(ids))
               .order_by(FollowUpRepeatedIncident.created_at).all()) if ids else []
    verbal = (db.query(FollowUpContactLog).filter(FollowUpContactLog.followup_id.in_(ids),
                                                  FollowUpContactLog.contact_type == "Verbal Warning").count()) if ids else 0
    account = db.query(OwnerWarning).filter(OwnerWarning.pet_id == pet_id).all()
    from app.utils.warning_rules import visible_warnings
    account = visible_warnings(db, current_user, account)
    return {
        "pet_id": pet_id,
        "observations": [{
            "followup_id": f.followup_id, "report_id": f.report_id, "status": f.status, "started_at": f.created_at,
            "due_at": f.due_at, "is_extended": f.is_extended, "closed_at": f.closed_at, "close_reason": f.close_reason,
            "repeat_count": sum(1 for r in repeats if r.followup_id == f.followup_id),
        } for f in followups],
        "repeated_incidents": [_repeat_view(i, db) for i in repeats],
        "counts": {
            "observations": len(followups),
            "repeated_incidents": len(repeats),
            "verbal_warnings": verbal,
            "account_warnings": len(account),
        },
    }
