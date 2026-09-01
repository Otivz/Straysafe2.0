import logging
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.database import get_db
from app.models.report import Rescue, Report, RescueAssignment, StatusHistory, HoldingAnimal, HoldingTimeline, ReportMedia, EndorsementLetter
from app.models.user import User
from app.models.notification import Notification
from app.schemas.rescue import RescueRequestCreate, RescueRequestResponse, RescueRequestUpdate
from app.utils.audit import log_activity

router = APIRouter(
    prefix="/rescue-requests",
    tags=["rescue-requests"]
)

def _populate_rescue_fields(rescue: Optional[Rescue], db: Session) -> Optional[Rescue]:
    if not rescue:
        return None
    
    # Populate dynamic fields for frontend compatibility
    if rescue.report:
        rescue.report.reporter_name = rescue.report.reporter.name if rescue.report.reporter else "Citizen"  # type: ignore[attr-defined]
        rescue.report.status_id = rescue.report.current_status_id  # type: ignore[attr-defined]
        rescue.title = f"Rescue: {rescue.report.animal_type} at {rescue.report.landmark}"
        rescue.description = rescue.report.description
        rescue.created_at = rescue.report.created_at  # type: ignore[attr-defined]
    else:
        rescue.title = f"Rescue Request #{rescue.rescue_id}"
        rescue.description = rescue.notes if rescue.notes else "No description provided."
        rescue.created_at = None  # type: ignore[attr-defined]

    # Determine the name of the Subdivision Leader who sent the request
    if rescue.leader:
        rescue.leader_name = rescue.leader.name
        rescue.leader_position = rescue.leader.position.position_name if rescue.leader.position else "Subdivision Leader"
    elif rescue.report and rescue.report.reporter and rescue.report.reporter.role_id == 2:
        # Fallback 1: Report creator if they are a Subdivision Leader
        rescue.leader_name = rescue.report.reporter.name
        rescue.leader_position = rescue.report.reporter.position.position_name if rescue.report.reporter.position else "Subdivision Leader"
    elif rescue.report and rescue.report.history:
        # Fallback 2: Look for the person who escalated the report (Status 4) or ANY official who touched it
        official_actions = [h for h in rescue.report.history if h.updater and h.updater.role_id == 2]
        if official_actions:
            # Use the most recent official action
            latest_official = sorted(official_actions, key=lambda x: x.created_at, reverse=True)[0].updater
            if latest_official:
                rescue.leader_name = latest_official.name
                rescue.leader_position = latest_official.position.position_name if latest_official.position else "Subdivision Leader"
            else:
                rescue.leader_name = "Subdivision Leader"
                rescue.leader_position = "Official"
        else:
            rescue.leader_name = "Subdivision Leader"
            rescue.leader_position = "Official"
    else:
        rescue.leader_name = "Subdivision Leader"
        rescue.leader_position = "Official"
    
    # Determine assigned staff name
    rescue.assigned_staff_name = None
    if rescue.staff:
         # If staff_id is set on the rescue, that's the primary assigned person
         rescue.assigned_staff_name = rescue.staff.name
    elif rescue.assignments:
        # Fallback to history
        latest = sorted(rescue.assignments, key=lambda x: x.assigned_at, reverse=True)[0]  # type: ignore[arg-type]
        if latest.staff:
            rescue.assigned_staff_name = latest.staff.name
        else:
            staff_user_id = getattr(latest, "staff_id", None) or getattr(latest, "user_id", None)
            if staff_user_id:
                assigned_staff = db.query(User).filter(User.user_id == staff_user_id).first()
                rescue.assigned_staff_name = assigned_staff.name if assigned_staff else None
        
    # Populate staff_name for each assignment
    if rescue.assignments:
        for asgn in rescue.assignments:
            if not getattr(asgn, "staff_id", None) and getattr(asgn, "user_id", None):
                asgn.staff_id = asgn.user_id
            if asgn.staff:
                asgn.staff_name = asgn.staff.name  # type: ignore[attr-defined]
            elif getattr(asgn, "user_id", None) or getattr(asgn, "staff_id", None):
                uid = getattr(asgn, "user_id", None) or getattr(asgn, "staff_id", None)
                u = db.query(User).filter(User.user_id == uid).first()
                asgn.staff_name = u.name if u else None

    # Populate request_id for frontend compatibility
    rescue.request_id = rescue.rescue_id  # type: ignore[assignment]

    # Populate updater names for report history entries
    if rescue.report and rescue.report.history:
        for hist in rescue.report.history:
            hist.updater_name = hist.updater.name if hist.updater else "System"
            
    return rescue


@router.post("/", response_model=RescueRequestResponse)
def create_rescue_request(request_in: RescueRequestCreate, db: Session = Depends(get_db)):
    try:
        # Check if a Rescue record already exists for this report
        existing_rescue = db.query(Rescue).filter(Rescue.report_id == request_in.report_id).first()
        if existing_rescue:
            db_rescue = existing_rescue
            if request_in.leader_id:
                db_rescue.leader_id = request_in.leader_id
            if request_in.description:
                db_rescue.notes = request_in.description
        else:
            rescue_data = {
                "report_id": request_in.report_id,
                "staff_id": request_in.barangay_staff_id if hasattr(request_in, 'barangay_staff_id') else None,
                "leader_id": request_in.leader_id if hasattr(request_in, 'leader_id') else None,
                "status_id": request_in.status_id,
                "notes": request_in.description
            }
            db_rescue = Rescue(**{k: v for k, v in rescue_data.items() if v is not None or k == "report_id"})
            db.add(db_rescue)
        
        # Create or update EndorsementLetter record if escalated by subdivision leader (leader_id is set)
        if request_in.leader_id:
            # Find the latest evidence file uploaded for this report
            media_file = db.query(ReportMedia).filter(
                ReportMedia.report_id == request_in.report_id,
                ReportMedia.is_evidence == True
            ).order_by(ReportMedia.media_id.desc()).first()
            file_url = media_file.file_url if media_file else None

            existing_letter = db.query(EndorsementLetter).filter(EndorsementLetter.report_id == request_in.report_id).first()
            if existing_letter:
                existing_letter.leader_id = request_in.leader_id
                existing_letter.title = request_in.title or f"Endorsement for Report #{request_in.report_id}"
                existing_letter.letter_content = request_in.description or "Official subdivision endorsement letter."
                if file_url:
                    existing_letter.file_url = file_url
                existing_letter.status_id = 2 # Sent
            else:
                db_letter = EndorsementLetter(
                    report_id=request_in.report_id,
                    leader_id=request_in.leader_id,
                    title=request_in.title or f"Endorsement for Report #{request_in.report_id}",
                    letter_content=request_in.description or "Official subdivision endorsement letter.",
                    file_url=file_url,
                    status_id=2 # Sent
                )
                db.add(db_letter)

        # Notify Barangay staff and admins about the newly escalated report
        try:
            barangay_officials = db.query(User).filter(User.role_id.in_([3, 4])).all()
            for official in barangay_officials:
                b_notif = Notification(
                    user_id=official.user_id,
                    title=f"New Escalated Report #{request_in.report_id}",
                    message=f"Report #{request_in.report_id} has been escalated to Barangay with an Endorsement Letter.",
                    type="alert",
                    related_id=request_in.report_id
                )
                db.add(b_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create barangay escalation notification: {notif_err}")

        # Log activity
        log_activity(
            db=db,
            action="Create Rescue Request",
            target_table="rescues",
            target_id=db_rescue.rescue_id,
            description=f"Rescue request created for Report #{request_in.report_id} by Subdivision Leader #{request_in.leader_id}.",
            user_id=request_in.leader_id or (request_in.barangay_staff_id if hasattr(request_in, 'barangay_staff_id') else None),
            log_type="operation"
        )

        db.commit()
        db.refresh(db_rescue)
        # Fetch fully loaded rescue to populate all relations for frontend
        db_rescue = db.query(Rescue).options(
            joinedload(Rescue.report).joinedload(Report.media),
            joinedload(Rescue.report).joinedload(Report.reporter),
            joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
            joinedload(Rescue.report).joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
            joinedload(Rescue.staff),
            joinedload(Rescue.leader).joinedload(User.position),
            joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
        ).filter(Rescue.rescue_id == db_rescue.rescue_id).first()
        return _populate_rescue_fields(db_rescue, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[RescueRequestResponse])
def get_rescue_requests(subdivision_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Rescue).join(Rescue.report)
    if subdivision_id is not None:
        query = query.filter(Report.subdivision_id == subdivision_id)

    rescues = query.options(
        joinedload(Rescue.report).joinedload(Report.media),
        joinedload(Rescue.report).joinedload(Report.reporter),
        joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
        joinedload(Rescue.report).joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
        joinedload(Rescue.staff),
        joinedload(Rescue.leader).joinedload(User.position),
        joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
    ).all()

    for rescue in rescues:
        _populate_rescue_fields(rescue, db)

    return rescues


@router.get("/report/{report_id}", response_model=Optional[RescueRequestResponse])
def get_request_by_report(report_id: int, db: Session = Depends(get_db)):
    rescue = db.query(Rescue).options(
        joinedload(Rescue.report).joinedload(Report.media),
        joinedload(Rescue.report).joinedload(Report.reporter),
        joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
        joinedload(Rescue.report).joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
        joinedload(Rescue.staff),
        joinedload(Rescue.leader).joinedload(User.position),
        joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
    ).filter(Rescue.report_id == report_id).first()
    return _populate_rescue_fields(rescue, db)


@router.patch("/{rescue_id}", response_model=RescueRequestResponse)
def update_rescue_request(rescue_id: int, request_in: RescueRequestUpdate, db: Session = Depends(get_db)):
    try:
        db_rescue = db.query(Rescue).options(
            joinedload(Rescue.report).joinedload(Report.media),
            joinedload(Rescue.report).joinedload(Report.reporter),
            joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater)
        ).filter(Rescue.rescue_id == rescue_id).first()

        if not db_rescue:
            raise HTTPException(status_code=404, detail="Rescue not found")

        update_data = request_in.model_dump(exclude_unset=True)
        
        # Handle assignment if personnel ID is provided
        assigned_id = update_data.pop("assigned_personnel_id", None)
        remarks = update_data.pop("remarks", None)
        animal_condition = update_data.pop("animal_condition", None)  # Pop early; applied to Report, not Rescue
        # Accept both barangay_staff_id and user_id for flexibility
        staff_id_for_history = update_data.pop("user_id", None) or update_data.get("barangay_staff_id")

        # Map barangay_staff_id → staff_id (DB column name) if it exists in update_data
        if "barangay_staff_id" in update_data:
            update_data["staff_id"] = update_data.pop("barangay_staff_id")

        # Capture original staff_id BEFORE overwriting it
        original_staff_id = db_rescue.staff_id

        if assigned_id:
            # Update the main staff_id for the rescue as the assigned person
            db_rescue.staff_id = assigned_id
            
            # Also create record in assignment history
            new_assignment = RescueAssignment(
                rescue_id=rescue_id,
                user_id=assigned_id,
                staff_id=assigned_id,
                assigned_by=staff_id_for_history or original_staff_id or assigned_id,
                remarks=remarks
            )
            db.add(new_assignment)

        # Update rescue fields — skip status_id (handled below), staff_id (handled above)
        SKIP_KEYS = {"status_id", "staff_id"}
        for key, value in update_data.items():
            if key not in SKIP_KEYS and hasattr(db_rescue, key):
                setattr(db_rescue, key, value)

        # Record Status History and Synchronize
        if "status_id" in update_data:
            report_status_id = update_data["status_id"]
            
            # Map Report Status ID → Rescue Status ID
            # Report: 1:Reported, 2:Verified, 3:Rejected, 4:Escalated, 13:Approved, 5:In Action, 7:Picked Up, 11:Resolved
            # Rescue: 1:Pending, 2:Approved, 3:Rejected, 4:Started, 5:Dispatched, 6:Resolved
            report_to_rescue_map = {
                1: 1, # Reported -> Pending
                2: 1, # Verified -> Pending
                3: 3, # Rejected -> Rejected
                4: 1, # Escalated -> Pending
                13: 2, # Approved by Barangay -> Approved
                5: 5, # Dispatched -> Dispatched
                6: 5, # Picked Up -> Still Dispatched
                7: 5, # Under Observation -> Still Dispatched
                11: 6, # Resolved -> Resolved
                12: 6  # Deceased -> Resolved (Operational end)
            }
            
            rescue_status_id = report_to_rescue_map.get(report_status_id)
            
            # Update Rescue status if mapping exists
            if rescue_status_id:
                db_rescue.status_id = rescue_status_id
                if rescue_status_id in (3, 6):
                    db_rescue.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                elif rescue_status_id in (4, 5):
                    db_rescue.started_at = datetime.now(timezone.utc).replace(tzinfo=None)

            # Record history for both the rescue and the report
            history_remarks = remarks
            if not history_remarks:
                friendly_defaults = {
                    1: "Reported.",
                    2: "Incident report has been officially verified by the Subdivision Leader.",
                    3: "Report rejected based on verification criteria.",
                    4: "Report forwarded to Barangay Operations for official review and approval.",
                    5: "Rescue team has been dispatched to the location.",
                    6: "Picked up by the barangay and in a safe place.",
                    7: "Under observation.",
                    8: "Securely impounded.",
                    9: "Claimed by owner.",
                    10: "Safely released.",
                    11: "Incident has been resolved.",
                    12: "Resolved (animal deceased).",
                    13: "Approved by Barangay. Rescue operation is being planned."
                }
            # Avoid duplicate StatusHistory if already recorded
            last_history = db.query(StatusHistory).filter(
                StatusHistory.report_id == db_rescue.report_id
            ).order_by(StatusHistory.history_id.desc()).first()

            is_duplicate = (
                last_history is not None
                and last_history.report_status_id == report_status_id
                and db_rescue.report is not None
                and db_rescue.report.current_status_id == report_status_id
            )

            if not is_duplicate:
                db_history = StatusHistory(
                    rescue_id=rescue_id,
                    report_id=db_rescue.report_id,
                    report_status_id=report_status_id,
                    rescue_status_id=rescue_status_id,
                    updated_by=staff_id_for_history,
                    remarks=history_remarks
                )
                db.add(db_history)

            # Update the associated Report's current status and condition
            if db_rescue.report_id:
                report_obj = db.query(Report).filter(Report.report_id == db_rescue.report_id).first()
                if report_obj:
                    report_obj.current_status_id = report_status_id
                    if animal_condition:  # Use the pre-popped value
                        report_obj.condition = animal_condition

                    # Create Notification for Resident
                    status_names = {
                        1: "Reported",
                        2: "Verified",
                        3: "Rejected",
                        4: "Escalated to Barangay",
                        5: "Team Dispatched",
                        6: "Picked Up",
                        7: "Under Observation",
                        8: "Impounded",
                        9: "Claimed by Owner",
                        10: "Released",
                        11: "Resolved",
                        12: "Deceased",
                        13: "Approved by Barangay"
                    }
                    status_name = status_names.get(report_status_id, "Updated")
                    
                    new_notif = Notification(
                        user_id=report_obj.user_id,
                        title="Incident Status Update",
                        message=f"Your report #{report_obj.report_id} has been updated to: {status_name}.",
                        type="status_update",
                        related_id=report_obj.report_id
                    )
                    db.add(new_notif)

                    # Also notify subdivision leader(s)
                    if report_obj.subdivision_id:
                        try:
                            leaders = db.query(User).filter(
                                User.subdivision_id == report_obj.subdivision_id,
                                User.role_id == 2
                            ).all()
                            for leader in leaders:
                                if leader.user_id != report_obj.user_id:
                                    subd_notif = Notification(
                                        user_id=leader.user_id,
                                        title=f"Rescue Status: {status_name}",
                                        message=f"Report #{report_obj.report_id} status updated to '{status_name}' by Barangay action team.",
                                        type="status_update",
                                        related_id=report_obj.report_id
                                    )
                                    db.add(subd_notif)
                        except Exception as notif_err:
                            print(f"Notice: Failed to create leader rescue notification: {notif_err}")

                    # ── Auto-intake into Holding Facility when Picked Up ──────
                    if report_status_id == 6:
                        already_in = db.query(HoldingAnimal).filter(
                            HoldingAnimal.report_id == report_obj.report_id
                        ).first()
                        if not already_in:
                            new_holding = HoldingAnimal(
                                report_id       = report_obj.report_id,
                                rescue_id       = rescue_id,
                                animal_type     = report_obj.animal_type,
                                breed           = report_obj.animal_breed,
                                color           = report_obj.animal_color,
                                estimated_size  = report_obj.estimated_size,
                                facility_status = 1,  # Default: Need Treatment
                                intake_staff_id = staff_id_for_history,
                            )
                            db.add(new_holding)
                            db.flush()  # get holding_id
                            db.add(HoldingTimeline(
                                holding_id = new_holding.holding_id,
                                event_type = 'intake',
                                title      = 'Animal Admitted to Holding Facility',
                                notes      = f'Automatically admitted after pickup. Report #{report_obj.report_id}.',
                                logged_by  = staff_id_for_history,
                            ))

        # Log to audit log
        log_action = "Update Rescue Request"
        log_desc = f"Rescue request #{rescue_id} updated."
        if "status_id" in update_data:
            status_names = {
                1: "Reported", 2: "Verified", 3: "Rejected", 4: "Escalated to Barangay",
                5: "Team Dispatched", 6: "Picked Up", 7: "Under Observation", 8: "Impounded",
                9: "Claimed by Owner", 10: "Released", 11: "Resolved", 12: "Deceased", 13: "Approved"
            }
            status_name = status_names.get(update_data["status_id"], "Updated")
            log_action = f"Update Rescue Status: {status_name}"
            log_desc = f"Rescue request #{rescue_id} (Report #{db_rescue.report_id}) status updated to {status_name}. Remarks: {remarks or '-'}"
        elif assigned_id:
            log_action = "Assign Rescue Personnel"
            log_desc = f"Assigned personnel #{assigned_id} to rescue request #{rescue_id}."
        
        log_activity(
            db=db,
            action=log_action,
            target_table="rescues",
            target_id=rescue_id,
            description=log_desc,
            user_id=staff_id_for_history or original_staff_id,
            log_type="operation"
        )

        db.commit()
        db.refresh(db_rescue)
        
        # Re-fetch fully loaded rescue to populate all relations for frontend response
        full_rescue = db.query(Rescue).options(
            joinedload(Rescue.report).joinedload(Report.media),
            joinedload(Rescue.report).joinedload(Report.reporter),
            joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
            joinedload(Rescue.report).joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
            joinedload(Rescue.staff),
            joinedload(Rescue.leader).joinedload(User.position),
            joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
        ).filter(Rescue.rescue_id == rescue_id).first()
        
        return _populate_rescue_fields(full_rescue, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating rescue {rescue_id}: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"{type(e).__name__}: {str(e)}")
