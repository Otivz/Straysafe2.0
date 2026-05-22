from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.database import get_db
# Import Rescue (not RescueRequest) to match the DB "rescues" table
from app.models.report import Rescue, Report, RescueAssignment, StatusHistory
from app.models.user import User
from app.models.notification import Notification
from app.schemas.rescue import RescueRequestCreate, RescueRequestResponse, RescueRequestUpdate

router = APIRouter(
    prefix="/rescue-requests",
    tags=["rescue-requests"]
)


@router.post("/", response_model=RescueRequestResponse)
def create_rescue_request(request_in: RescueRequestCreate, db: Session = Depends(get_db)):
    try:
        rescue_data = {
            "report_id": request_in.report_id,
            "staff_id": request_in.barangay_staff_id if hasattr(request_in, 'barangay_staff_id') else None,
            "leader_id": request_in.leader_id if hasattr(request_in, 'leader_id') else None,
            "status_id": request_in.status_id,
            "notes": request_in.description
        }
        db_rescue = Rescue(**{k: v for k, v in rescue_data.items() if v is not None or k == "report_id"})
        db.add(db_rescue)
        db.commit()
        db.refresh(db_rescue)
        return db_rescue
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[RescueRequestResponse])
def get_rescue_requests(db: Session = Depends(get_db)):
    rescues = db.query(Rescue).join(Rescue.report).filter(Report.subdivision_id == 1).options(
        joinedload(Rescue.report).joinedload(Report.media),
        joinedload(Rescue.report).joinedload(Report.reporter),
        joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
        joinedload(Rescue.staff),
        joinedload(Rescue.leader).joinedload(User.position),
        joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
    ).all()

    for rescue in rescues:
        # Populate dynamic fields for frontend compatibility
        if rescue.report:
            rescue.report.reporter_name = rescue.report.reporter.name if rescue.report.reporter else "Citizen"  # type: ignore[attr-defined]
            rescue.report.status_id = rescue.report.current_status_id  # type: ignore[attr-defined]
            rescue.title = f"Rescue: {rescue.report.animal_type} at {rescue.report.landmark}"
            rescue.description = rescue.report.description
        else:
            rescue.title = f"Rescue Request #{rescue.rescue_id}"
            rescue.description = str(rescue.notes) if rescue.notes else "No description provided."

        # Determine the name of the Subdivision Leader who sent the request
        if rescue.leader:
            rescue.leader_name = rescue.leader.name
            rescue.leader_position = rescue.leader.position.name if rescue.leader.position else "Subdivision Leader"
        elif rescue.report and rescue.report.reporter and rescue.report.reporter.role_id == 2:
            # Fallback 1: Report creator if they are a Subdivision Leader
            rescue.leader_name = rescue.report.reporter.name
            rescue.leader_position = rescue.report.reporter.position.name if rescue.report.reporter.position else "Subdivision Leader"
        elif rescue.report and rescue.report.history:
            # Fallback 2: Look for the person who escalated the report (Status 4) or ANY official who touched it
            # Sort history by created_at descending to find the most recent official action
            official_actions = [h for h in rescue.report.history if h.updater and h.updater.role_id == 2]
            if official_actions:
                # Use the most recent official action
                latest_official = sorted(official_actions, key=lambda x: x.created_at, reverse=True)[0].updater
                rescue.leader_name = latest_official.name
                rescue.leader_position = latest_official.position.name if latest_official.position else "Subdivision Leader"
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
            assigned_staff = db.query(User).filter(User.user_id == latest.staff_id).first()
            rescue.assigned_staff_name = str(assigned_staff.name) if assigned_staff else None
            
        # Populate staff_name for each assignment
        if rescue.assignments:
            for asgn in rescue.assignments:
                if asgn.staff:
                    asgn.staff_name = asgn.staff.name  # type: ignore[attr-defined]

        # Populate request_id for frontend compatibility
        rescue.request_id = rescue.rescue_id  # type: ignore[assignment]

        # Populate updater names for report history entries
        if rescue.report and rescue.report.history:
            for hist in rescue.report.history:
                hist.updater_name = hist.updater.name if hist.updater else "System"

    return rescues


@router.get("/report/{report_id}", response_model=Optional[RescueRequestResponse])
def get_request_by_report(report_id: int, db: Session = Depends(get_db)):
    return db.query(Rescue).options(
        joinedload(Rescue.report).joinedload(Report.media),
        joinedload(Rescue.report).joinedload(Report.reporter),
        joinedload(Rescue.assignments)
    ).filter(Rescue.report_id == report_id).first()


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
        # Accept both barangay_staff_id and user_id for flexibility
        staff_id_for_history = update_data.pop("user_id", None) or update_data.get("barangay_staff_id")

        # Map barangay_staff_id → staff_id (DB column name) if it exists in update_data
        if "barangay_staff_id" in update_data:
            update_data["staff_id"] = update_data.pop("barangay_staff_id")

        if assigned_id:
            # Update the main staff_id for the rescue as the assigned person
            db_rescue.staff_id = assigned_id
            
            # Also create record in assignment history
            new_assignment = RescueAssignment(
                rescue_id=rescue_id,
                staff_id=assigned_id,
                assigned_by=staff_id_for_history or (db_rescue.staff_id if db_rescue.staff_id else assigned_id),
                remarks=remarks
            )
            db.add(new_assignment)

        # Update rescue fields
        for key, value in update_data.items():
            if key != "status_id" and hasattr(db_rescue, key):
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

            # Record history for both the rescue and the report
            history_remarks = remarks or f"Status updated to {report_status_id}"
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
                    if "animal_condition" in update_data:
                        report_obj.condition = update_data["animal_condition"]

                    # Create Notification for Resident
                    status_names = {
                        1: "Reported", 2: "Verified", 3: "Rejected",
                        4: "Escalated", 13: "Approved by Barangay", 5: "Dispatched", 
                        6: "Resolved", 11: "Resolved", 7: "Picked Up", 
                        8: "Under Observation", 9: "Impounded", 10: "Released"
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

        db.commit()
        db.refresh(db_rescue)
        
        # Populate updater names and photos for history entries in the response
        if db_rescue.report and db_rescue.report.history:
            for hist in db_rescue.report.history:
                hist.updater_name = hist.updater.name if hist.updater else "System"
                hist.updater_photo = hist.updater.profile_picture if hist.updater else None
                
        return db_rescue
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
