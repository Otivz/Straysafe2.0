import logging
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.database import get_db
from app.models.report import Rescue, Report, RescueAssignment, StatusHistory, HoldingAnimal, HoldingTimeline, ReportMedia, EndorsementLetter
from app.models.user import User, Barangay, Subdivision
from app.models.landmark import Landmark
from app.models.notification import Notification
from app.schemas.rescue import RescueRequestCreate, RescueRequestResponse, RescueRequestUpdate, RescueAssignTeamRequest
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
        latest = sorted(rescue.assignments, key=lambda x: x.assigned_at or datetime.min, reverse=True)[0]  # type: ignore[arg-type]
        if latest.staff:
            rescue.assigned_staff_name = latest.staff.name
        else:
            staff_user_id = getattr(latest, "staff_id", None) or getattr(latest, "user_id", None)
            if staff_user_id:
                assigned_staff = db.query(User).filter(User.user_id == staff_user_id).first()
                rescue.assigned_staff_name = assigned_staff.name if assigned_staff else None
        
    # Populate detailed staff information for each assignment (email, photo, phone, name)
    if rescue.assignments:
        seen_user_ids = set()
        unique_assignments = []
        # Sort by assignment_id descending to prioritize latest assignments
        sorted_assignments = sorted(
            rescue.assignments,
            key=lambda x: getattr(x, "assignment_id", 0) or 0,
            reverse=True
        )
        # Filter for active "Assigned" status first
        active_list = [a for a in sorted_assignments if getattr(a, "assignment_status", "Assigned") == "Assigned"]
        candidates = active_list if active_list else sorted_assignments

        for asgn in candidates:
            uid = getattr(asgn, "staff_id", None) or getattr(asgn, "user_id", None)
            if uid and uid not in seen_user_ids:
                seen_user_ids.add(uid)
                unique_assignments.append(asgn)

        rescue.assignments = unique_assignments

        for asgn in rescue.assignments:
            if not getattr(asgn, "staff_id", None) and getattr(asgn, "user_id", None):
                asgn.staff_id = asgn.user_id
            staff_obj = asgn.staff
            if not staff_obj and (getattr(asgn, "user_id", None) or getattr(asgn, "staff_id", None)):
                uid = getattr(asgn, "user_id", None) or getattr(asgn, "staff_id", None)
                staff_obj = db.query(User).filter(User.user_id == uid).first()
            if staff_obj:
                asgn.staff_name = staff_obj.name
                asgn.staff_email = staff_obj.email
                asgn.staff_phone = getattr(staff_obj, "phone", None) or getattr(staff_obj, "phone_number", None)
                asgn.staff_photo = staff_obj.profile_picture

    # Populate request_id for frontend compatibility
    rescue.request_id = rescue.rescue_id  # type: ignore[assignment]

    # Populate updater names and facility names for report history entries
    if rescue.report:
        rescue.report.initial_landmark = rescue.report.initial_landmark or rescue.report.landmark
        if rescue.report.facility_id and not rescue.report.facility:
            rescue.report.facility = db.query(Landmark).filter(Landmark.landmark_id == rescue.report.facility_id).first()
        if rescue.report.history:
            for hist in rescue.report.history:
                hist.updater_name = hist.updater.name if hist.updater else "System"
                if hist.facility_id and not getattr(hist, "facility_name", None):
                    h_fac = db.query(Landmark).filter(Landmark.landmark_id == hist.facility_id).first()
                    hist.facility_name = h_fac.name if h_fac else None
            
    return rescue


@router.post("/", response_model=RescueRequestResponse)
def create_rescue_request(request_in: RescueRequestCreate, db: Session = Depends(get_db)):
    try:
        # If the report is merged as duplicate, attach to the primary case to maintain single active rescue assignment
        target_report_id = request_in.report_id
        target_report = db.query(Report).filter(Report.report_id == request_in.report_id).first()
        if target_report and (target_report.duplicate_of_report_id or target_report.current_status_id == 18):
            target_report_id = target_report.duplicate_of_report_id or request_in.report_id

        # Check if a Rescue record already exists for this report
        existing_rescue = db.query(Rescue).filter(Rescue.report_id == target_report_id).first()
        if existing_rescue:
            db_rescue = existing_rescue
            if request_in.leader_id:
                db_rescue.leader_id = request_in.leader_id
            if request_in.description:
                db_rescue.notes = request_in.description
        else:
            rescue_data = {
                "report_id": target_report_id,
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
                ReportMedia.report_id == target_report_id,
                ReportMedia.is_evidence == True
            ).order_by(ReportMedia.media_id.desc()).first()
            file_url = media_file.file_url if media_file else None

            existing_letter = db.query(EndorsementLetter).filter(EndorsementLetter.report_id == target_report_id).first()
            if existing_letter:
                existing_letter.leader_id = request_in.leader_id
                existing_letter.title = request_in.title or f"Endorsement for Report #{target_report_id}"
                existing_letter.letter_content = request_in.description or "Official subdivision endorsement letter."
                if file_url:
                    existing_letter.file_url = file_url
                existing_letter.status_id = 2 # Sent
            else:
                db_letter = EndorsementLetter(
                    report_id=target_report_id,
                    leader_id=request_in.leader_id,
                    title=request_in.title or f"Endorsement for Report #{target_report_id}",
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
            joinedload(Rescue.report).joinedload(Report.facility),
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
        joinedload(Rescue.report).joinedload(Report.facility),
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
        joinedload(Rescue.report).joinedload(Report.facility),
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
        
        # Handle assignment if personnel ID or multiple personnel IDs are provided
        assigned_id = update_data.pop("assigned_personnel_id", None)
        assigned_ids = update_data.pop("assigned_personnel_ids", None)

        if assigned_ids is None and assigned_id is not None:
            assigned_ids = [assigned_id]

        remarks = update_data.pop("remarks", None)
        animal_condition = update_data.pop("animal_condition", None)
        facility_id = update_data.pop("facility_id", None)
        lat = update_data.pop("latitude", None)
        lng = update_data.pop("longitude", None)
        lmk = update_data.pop("landmark", None)
        custody_status = update_data.pop("custody_status", None)
        # Accept both barangay_staff_id and user_id for flexibility
        staff_id_for_history = update_data.pop("user_id", None) or update_data.get("barangay_staff_id")

        # Check permission: Only personnel assigned to this report (or Barangay Head Officer) can update its status
        updater_user_id = staff_id_for_history or update_data.get("barangay_staff_id") or update_data.get("staff_id")
        if updater_user_id:
            updater = db.query(User).filter(User.user_id == updater_user_id).first()
            if updater and updater.role_id == 3:
                is_head = getattr(updater, 'is_head_officer', False)
                if not is_head:
                    is_assigned = (
                        db_rescue.staff_id == updater.user_id or
                        db_rescue.leader_id == updater.user_id or
                        db.query(RescueAssignment).filter(
                            RescueAssignment.rescue_id == rescue_id,
                            (RescueAssignment.user_id == updater.user_id) | (RescueAssignment.staff_id == updater.user_id),
                            RescueAssignment.assignment_status == "Assigned"
                        ).first() is not None
                    )
                    if not is_assigned:
                        raise HTTPException(
                            status_code=403,
                            detail="Only personnel assigned to this report have the ability to update its status."
                        )

        # Map barangay_staff_id → staff_id (DB column name) if it exists in update_data
        if "barangay_staff_id" in update_data:
            update_data["staff_id"] = update_data.pop("barangay_staff_id")

        # Capture original staff_id BEFORE overwriting it
        original_staff_id = db_rescue.staff_id

        if assigned_ids is not None and len(assigned_ids) > 0:
            unique_ids = list(dict.fromkeys(assigned_ids))
            # Update the primary staff_id for the rescue to the lead assigned responder
            db_rescue.staff_id = unique_ids[0]
            assigner_id = staff_id_for_history or original_staff_id or unique_ids[0]

            # Mark previous active assignments for this rescue as Cancelled
            db.query(RescueAssignment).filter(
                RescueAssignment.rescue_id == rescue_id,
                RescueAssignment.assignment_status == "Assigned"
            ).update({"assignment_status": "Cancelled"}, synchronize_session=False)

            # Create RescueAssignment for each assigned responder
            assigned_users = db.query(User).filter(User.user_id.in_(unique_ids)).all()
            assigned_names = [u.name for u in assigned_users]

            for idx, pid in enumerate(unique_ids):
                asgn_remarks = remarks or "Field Responder"
                new_assignment = RescueAssignment(
                    rescue_id=rescue_id,
                    user_id=pid,
                    staff_id=pid,
                    assigned_by=assigner_id,
                    assignment_status="Assigned",
                    remarks=asgn_remarks
                )
                db.add(new_assignment)

            # Trigger notification to assigned field personnel
            try:
                assigner_user = db.query(User).filter(User.user_id == assigner_id).first() if assigner_id else None
                assigner_name = assigner_user.name if assigner_user else "Barangay Head Officer"
                team_desc = f"{len(assigned_ids)}-person responder team ({', '.join(assigned_names)})" if len(assigned_ids) > 1 else "field responder"
                for pid in assigned_ids:
                    personnel_notif = Notification(
                        user_id=pid,
                        title="🚨 New Rescue Mission Assignment",
                        message=f"You have been assigned to Rescue Mission #{rescue_id} (Report #{db_rescue.report_id}) as part of a {team_desc} by {assigner_name}.",
                        type="rescue_assignment",
                        related_id=db_rescue.report_id
                    )
                    db.add(personnel_notif)
            except Exception as notif_err:
                logger.warning(f"Failed to create personnel assignment notification: {notif_err}")

            # Also log to StatusHistory if status is not changing in this call
            if "status_id" not in update_data:
                team_str = ", ".join(assigned_names) if assigned_names else f"{len(assigned_ids)} responders"
                db_history = StatusHistory(
                    rescue_id=rescue_id,
                    report_id=db_rescue.report_id,
                    report_status_id=db_rescue.report.current_status_id if db_rescue.report else 5,
                    rescue_status_id=db_rescue.status_id,
                    updated_by=assigner_id,
                    remarks=remarks or f"Field responder team assigned ({team_str})."
                )
                db.add(db_history)


        # Update rescue fields — skip status_id (handled below), staff_id (handled above)
        SKIP_KEYS = {"status_id", "staff_id"}
        for key, value in update_data.items():
            if key not in SKIP_KEYS and hasattr(db_rescue, key):
                setattr(db_rescue, key, value)

        # Record Status History and Synchronize
        if "status_id" in update_data:
            report_status_id = update_data["status_id"]
            
            # Map Report Status ID → Rescue Status ID
            # Report: 1:Reported, 2:Verified, 3:Rejected, 4:Escalated, 13:Approved, 5:In Action, 6:Picked Up, 7:Observation, 8:Impounded, 11:Resolved, 17:Cannot Be Found
            # Rescue: 1:Pending, 2:Approved, 3:Rejected, 4:Started, 5:Dispatched, 6:Resolved
            report_to_rescue_map = {
                1: 1, # Reported -> Pending
                2: 1, # Verified -> Pending
                3: 3, # Rejected -> Rejected
                4: 1, # Escalated -> Pending
                13: 2, # Approved by Barangay -> Approved
                5: 5, # Dispatched -> Dispatched
                6: 5, # Picked Up -> Still Dispatched / In Action
                7: 5, # Under Observation -> Still Dispatched
                8: 5, # Impounded -> Dispatched / Facility
                9: 6, # Claimed by Owner -> Resolved
                10: 6, # Released -> Resolved
                11: 6, # Resolved -> Resolved
                12: 6, # Deceased -> Resolved (Operational end)
                14: 6, # False Alarm -> Resolved
                17: 6  # Animal Cannot Be Found -> Resolved (Operational end)
            }
            
            rescue_status_id = report_to_rescue_map.get(report_status_id, 6 if report_status_id in (11, 12, 14, 17) else 5)
            
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
                    13: "Approved by Barangay. Rescue operation is being planned.",
                    14: "False Alarm / Dismissed.",
                    15: "Disputed.",
                    16: "Under Investigation.",
                    17: "Animal cannot be found at the reported location."
                }
                history_remarks = friendly_defaults.get(report_status_id, "Status updated.")

            # Update the associated Report's current status, condition, and facility location
            relocation_note = None
            if db_rescue.report_id:
                report_obj = db.query(Report).filter(Report.report_id == db_rescue.report_id).first()
                if report_obj:
                    report_obj.current_status_id = report_status_id
                    if animal_condition is not None:  # Use the pre-popped value
                        report_obj.condition = animal_condition

                    # Ensure initial origin is preserved
                    if report_obj.initial_latitude is None:
                        report_obj.initial_latitude = report_obj.latitude
                        report_obj.initial_longitude = report_obj.longitude
                        report_obj.initial_landmark = report_obj.landmark

                    prev_fac_name = report_obj.landmark if report_obj.facility_id else None
                    fac = None

                    if facility_id:
                        fac = db.query(Landmark).filter(Landmark.landmark_id == facility_id).first()
                        if fac:
                            report_obj.facility_id = fac.landmark_id
                            report_obj.latitude = fac.latitude
                            report_obj.longitude = fac.longitude
                            report_obj.landmark = fac.name
                            report_obj.custody_status = custody_status or ("In Barangay Facility" if fac.subdivision_id is None else "In Subdivision Facility")
                            caretaker_str = f" • Caretaker: {fac.contact_person} ({fac.contact_number})" if fac.contact_person else ""
                            if prev_fac_name and prev_fac_name != fac.name:
                                relocation_note = f"Transferred to {fac.name}{caretaker_str} (Previously held at: {prev_fac_name})"
                            elif report_status_id in (6, 7, 8):
                                relocation_note = f"Secured at {fac.name}{caretaker_str}"
                    elif lat is not None and lng is not None:
                        report_obj.latitude = Decimal(str(lat))
                        report_obj.longitude = Decimal(str(lng))
                        if lmk:
                            report_obj.landmark = lmk
                        if custody_status:
                            report_obj.custody_status = custody_status
                    elif report_status_id in (6, 7, 8) and not report_obj.facility_id:
                        # Auto-resolve Barangay HQ location and custody status if picked up / under observation / impounded
                        brgy = None
                        if report_obj.subdivision_id:
                            subd = db.query(Subdivision).filter(Subdivision.subdivision_id == report_obj.subdivision_id).first()
                            if subd and subd.barangay_id:
                                brgy = db.query(Barangay).filter(Barangay.barangay_id == subd.barangay_id).first()
                        if not brgy:
                            brgy = db.query(Barangay).first()

                        brgy_hq_name = f"Barangay {brgy.barangay_name} HQ" if brgy else "Barangay HQ"
                        if not report_obj.custody_status:
                            report_obj.custody_status = "In Barangay Facility"
                        if not relocation_note:
                            relocation_note = f"Secured at {brgy_hq_name}"

                    if relocation_note:
                        if "Secured at" not in history_remarks and "Transferred to" not in history_remarks:
                            history_remarks = f"{history_remarks} {relocation_note}"
                        elif prev_fac_name and prev_fac_name != (fac.name if fac else None):
                            history_remarks = f"Facility Relocation: {relocation_note}"

                    # Avoid duplicate StatusHistory if already recorded with same remarks and facility
                    last_history = db.query(StatusHistory).filter(
                        StatusHistory.report_id == db_rescue.report_id
                    ).order_by(StatusHistory.history_id.desc()).first()

                    is_duplicate = (
                        last_history is not None
                        and last_history.report_status_id == report_status_id
                        and db_rescue.report is not None
                        and db_rescue.report.current_status_id == report_status_id
                        and last_history.remarks == history_remarks
                        and (facility_id is None or last_history.facility_id == facility_id)
                    )

                    if not is_duplicate:
                        db_history = StatusHistory(
                            rescue_id=rescue_id,
                            report_id=db_rescue.report_id,
                            report_status_id=report_status_id,
                            rescue_status_id=rescue_status_id,
                            updated_by=staff_id_for_history,
                            latitude=report_obj.latitude,
                            longitude=report_obj.longitude,
                            landmark=report_obj.landmark,
                            facility_id=report_obj.facility_id,
                            remarks=history_remarks
                        )
                        db.add(db_history)

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
                        13: "Approved by Barangay",
                        14: "False Alarm / Dismissed",
                        15: "Disputed",
                        16: "Under Investigation",
                        17: "Animal Cannot Be Found"
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

                    # ── Auto-intake into Holding Facility or Log Relocation when Picked Up, Under Observation, Impounded, or Moved to Facility ──────
                    if report_status_id in (6, 7, 8) or facility_id:
                        already_in = db.query(HoldingAnimal).filter(
                            HoldingAnimal.report_id == report_obj.report_id
                        ).first()
                        staff_id_for_log = staff_id_for_history or updater_user_id or original_staff_id
                        if not already_in:
                            raw_t = (report_obj.animal_type or '').strip().lower()
                            a_type = 'Dog' if ('dog' in raw_t or 'canine' in raw_t or 'puppy' in raw_t) else ('Cat' if ('cat' in raw_t or 'feline' in raw_t or 'kitten' in raw_t) else 'Unknown')
                            
                            # Derive initial facility_status based on animal condition
                            cond_text = str(report_obj.condition or animal_condition or '').lower()
                            is_deceased = 'deceased' in cond_text or 'dead' in cond_text
                            is_injured = any(k in cond_text for k in ['injured', 'bleeding', 'limping', 'weak', 'sick', 'treatment', 'wound', 'trapped'])
                            is_healthy = 'healthy' in cond_text or 'no condition' in cond_text

                            if is_deceased:
                                init_fac_status = 4  # Deceased
                            elif is_healthy and not is_injured:
                                init_fac_status = 2  # Healthy
                            elif is_injured:
                                init_fac_status = 1  # Need Treatment
                            else:
                                init_fac_status = 2 if 'healthy' in cond_text else 1

                            new_holding = HoldingAnimal(
                                report_id       = report_obj.report_id,
                                rescue_id       = rescue_id,
                                animal_type     = a_type,
                                breed           = getattr(report_obj, 'animal_breed', None) or getattr(report_obj, 'ai_possible_breed', None) or getattr(report_obj, 'breed', None),
                                color           = getattr(report_obj, 'animal_color', None) or getattr(report_obj, 'ai_dominant_color', None),
                                estimated_size  = getattr(report_obj, 'estimated_size', None) or getattr(report_obj, 'ai_estimated_size', None),
                                facility_status = init_fac_status,
                                intake_staff_id = staff_id_for_log,
                            )
                            db.add(new_holding)
                            db.flush()  # get holding_id
                            # Resolve specific facility or Barangay HQ location
                            loc_name = None
                            if report_obj.facility_id:
                                fac = db.query(Landmark).filter(Landmark.landmark_id == report_obj.facility_id).first()
                                if fac:
                                    loc_name = fac.name
                            if not loc_name:
                                if report_obj.landmark:
                                    loc_name = report_obj.landmark
                            else:
                                brgy = None
                                if report_obj.subdivision_id:
                                    subd = db.query(Subdivision).filter(Subdivision.subdivision_id == report_obj.subdivision_id).first()
                                    if subd and subd.barangay_id:
                                        brgy = db.query(Barangay).filter(Barangay.barangay_id == subd.barangay_id).first()
                                if not brgy:
                                    brgy = db.query(Barangay).first()
                                loc_name = f"Barangay {brgy.barangay_name} HQ" if brgy else "Barangay HQ"

                            db.add(HoldingTimeline(
                                holding_id = new_holding.holding_id,
                                event_type = 'intake',
                                title      = f'Animal Admitted to Holding Facility ({loc_name})',
                                notes      = f'Admitted into custody at {loc_name}. Report #{report_obj.report_id}.',
                                logged_by  = staff_id_for_log,
                            ))
                        else:
                            # Sync breed/color/size and condition if out of sync
                            if getattr(report_obj, 'animal_breed', None) and (not already_in.breed or already_in.breed in ('Aspin', 'Puspin', 'Unknown')):
                                already_in.breed = report_obj.animal_breed
                            if not already_in.color and (getattr(report_obj, 'animal_color', None) or getattr(report_obj, 'ai_dominant_color', None)):
                                already_in.color = getattr(report_obj, 'animal_color', None) or getattr(report_obj, 'ai_dominant_color', None)
                            if not already_in.estimated_size and (getattr(report_obj, 'estimated_size', None) or getattr(report_obj, 'ai_estimated_size', None)):
                                already_in.estimated_size = getattr(report_obj, 'estimated_size', None) or getattr(report_obj, 'ai_estimated_size', None)

                            # Animal record already exists — log relocation/transfer or update if facility moved
                            if relocation_note:
                                loc_name = None
                                if report_obj.facility_id:
                                    fac = db.query(Landmark).filter(Landmark.landmark_id == report_obj.facility_id).first()
                                    if fac:
                                        loc_name = fac.name
                                if not loc_name:
                                    loc_name = report_obj.landmark or "Barangay HQ"

                                db.add(HoldingTimeline(
                                    holding_id = already_in.holding_id,
                                    event_type = 'transfer',
                                    title      = f'Animal Relocated / Transferred ({loc_name})',
                                    notes      = relocation_note,
                                    logged_by  = staff_id_for_log,
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
            joinedload(Rescue.report).joinedload(Report.facility),
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


@router.post("/assign-team", response_model=RescueRequestResponse)
def assign_rescue_team(payload: RescueAssignTeamRequest, db: Session = Depends(get_db)):
    """Assign 1 to 5 field responders to a rescue mission."""
    try:
        db_rescue = None
        if payload.rescue_id:
            db_rescue = db.query(Rescue).filter(Rescue.rescue_id == payload.rescue_id).first()
        if not db_rescue and payload.report_id:
            db_rescue = db.query(Rescue).filter(Rescue.report_id == payload.report_id).first()
            if not db_rescue:
                # Create a Rescue record for this report if it doesn't exist yet
                db_rescue = Rescue(
                    report_id=payload.report_id,
                    status_id=2,  # Approved
                    notes=payload.remarks or "Rescue operation initiated by Barangay Staff."
                )
                db.add(db_rescue)
                db.flush()

        if not db_rescue:
            raise HTTPException(status_code=404, detail="Rescue request or report not found")

        assigned_ids = payload.assigned_personnel_ids
        if not assigned_ids or len(assigned_ids) == 0:
            raise HTTPException(status_code=400, detail="Please select at least one field responder.")

        assigner_id = payload.user_id or payload.barangay_staff_id or assigned_ids[0]

        # Set primary staff to the lead responder
        db_rescue.staff_id = assigned_ids[0]

        # Mark prior active assignments as Cancelled
        db.query(RescueAssignment).filter(
            RescueAssignment.rescue_id == db_rescue.rescue_id,
            RescueAssignment.assignment_status == "Assigned"
        ).update({"assignment_status": "Cancelled"}, synchronize_session=False)

        # Create new assignments
        assigned_users = db.query(User).filter(User.user_id.in_(assigned_ids)).all()
        assigned_names = [u.name for u in assigned_users]

        for idx, pid in enumerate(assigned_ids):
            is_lead = idx == 0
            asgn_remarks = payload.remarks or (f"Team Lead" if is_lead and len(assigned_ids) > 1 else f"Field Responder")
            new_assignment = RescueAssignment(
                rescue_id=db_rescue.rescue_id,
                user_id=pid,
                staff_id=pid,
                assigned_by=assigner_id,
                assignment_status="Assigned",
                remarks=asgn_remarks
            )
            db.add(new_assignment)

        # Trigger notifications
        try:
            assigner_user = db.query(User).filter(User.user_id == assigner_id).first() if assigner_id else None
            assigner_name = assigner_user.name if assigner_user else "Barangay Head Officer"
            team_desc = f"{len(assigned_ids)}-person responder team ({', '.join(assigned_names)})" if len(assigned_ids) > 1 else "field responder"
            for pid in assigned_ids:
                personnel_notif = Notification(
                    user_id=pid,
                    title="🚨 New Rescue Mission Assignment",
                    message=f"You have been assigned to Rescue Mission #{db_rescue.rescue_id} (Report #{db_rescue.report_id}) as part of a {team_desc} by {assigner_name}.",
                    type="rescue_assignment",
                    related_id=db_rescue.report_id
                )
                db.add(personnel_notif)
        except Exception as notif_err:
            logger.warning(f"Failed to create personnel assignment notification: {notif_err}")

        # Add StatusHistory record
        team_str = ", ".join(assigned_names) if assigned_names else f"{len(assigned_ids)} responders"
        db_history = StatusHistory(
            rescue_id=db_rescue.rescue_id,
            report_id=db_rescue.report_id,
            report_status_id=db_rescue.report.current_status_id if db_rescue.report else 5,
            rescue_status_id=db_rescue.status_id,
            updated_by=assigner_id,
            remarks=payload.remarks or f"Field responder team assigned ({team_str})."
        )
        db.add(db_history)

        log_activity(
            db=db,
            action="Assign Rescue Team",
            target_table="rescues",
            target_id=db_rescue.rescue_id,
            description=f"Assigned {len(assigned_ids)} responder(s) ({team_str}) to rescue mission #{db_rescue.rescue_id}.",
            user_id=assigner_id,
            log_type="operation"
        )

        db.commit()
        db.refresh(db_rescue)

        full_rescue = db.query(Rescue).options(
            joinedload(Rescue.report).joinedload(Report.media),
            joinedload(Rescue.report).joinedload(Report.reporter),
            joinedload(Rescue.report).joinedload(Report.history).joinedload(StatusHistory.updater),
            joinedload(Rescue.report).joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position),
            joinedload(Rescue.staff),
            joinedload(Rescue.leader).joinedload(User.position),
            joinedload(Rescue.assignments).joinedload(RescueAssignment.staff)
        ).filter(Rescue.rescue_id == db_rescue.rescue_id).first()

        return _populate_rescue_fields(full_rescue, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning team: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
