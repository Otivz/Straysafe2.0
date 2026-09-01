from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
import os
import uuid
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional
from sqlalchemy import or_
from app.database import get_db
from app.models.report import Report, ReportMedia, Comment, StatusHistory, ReportCategory, EndorsementLetter, ReportStatus, Rescue, HoldingAnimal
from app.models.user import User, Subdivision
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_qr import PetQRCode
from app.models.pet_claim import PetClaim
from app.models.report_dispute import ReportDispute
from app.models.report_match import ReportMatch
from app.models.warning import OwnerWarning
from app.models.chat import ChatThread
from app.schemas.report import (
    ReportCreate, ReportResponse, ReportStatusUpdate, ReportUpdate, 
    ReportMediaResponse, CommentCreate, CommentResponse,
    ReportClaimRequest, ReportTakeoverRequest,
    ReportTransferRequest, ReportTransferActionRequest, ReportTransferRejectRequest,
    ReportDisputeCreate, ReportDisputeResponse, ReportDisputeReviewRequest,
    ReportFalseAlarmRequest, ReportVerifyRequest
)
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.color_detection import extract_dominant_colors
from app.utils.audit import log_activity
from app.utils.ai_suggestions import call_gemini_with_fallback

router = APIRouter(
    prefix="/reports",
    tags=["reports"]
)


def populate_handler_info(rep_data: ReportResponse, rep: Report):
    """Populates current handler officer and pending transfer details on ReportResponse."""
    if rep.assigned_leader:
        rep_data.assigned_leader_id = rep.assigned_leader_id
        rep_data.assigned_leader_name = rep.assigned_leader.name
        rep_data.assigned_leader_photo = rep.assigned_leader.profile_picture
    elif rep.assigned_leader_id:
        rep_data.assigned_leader_id = rep.assigned_leader_id
        rep_data.assigned_leader_name = f"Officer #{rep.assigned_leader_id}"
        rep_data.assigned_leader_photo = None
    else:
        rep_data.assigned_leader_id = None
        rep_data.assigned_leader_name = None
        rep_data.assigned_leader_photo = None
    rep_data.claimed_at = rep.claimed_at

    # Pending Transfer
    rep_data.pending_transfer_to_id = rep.pending_transfer_to_id
    rep_data.pending_transfer_from_id = rep.pending_transfer_from_id
    rep_data.pending_transfer_notes = rep.pending_transfer_notes
    rep_data.pending_transfer_created_at = rep.pending_transfer_created_at

    if rep.pending_transfer_to:
        rep_data.pending_transfer_to_name = rep.pending_transfer_to.name
        rep_data.pending_transfer_to_photo = rep.pending_transfer_to.profile_picture
    elif rep.pending_transfer_to_id:
        rep_data.pending_transfer_to_name = f"Officer #{rep.pending_transfer_to_id}"
        rep_data.pending_transfer_to_photo = None
    else:
        rep_data.pending_transfer_to_name = None
        rep_data.pending_transfer_to_photo = None

    if rep.pending_transfer_from:
        rep_data.pending_transfer_from_name = rep.pending_transfer_from.name
    elif rep.pending_transfer_from_id:
        rep_data.pending_transfer_from_name = f"Officer #{rep.pending_transfer_from_id}"
    else:
        rep_data.pending_transfer_from_name = None

    # Takeover Eligibility based on Inactivity
    compute_takeover_eligibility(rep, rep_data)


def compute_takeover_eligibility(rep: Report, rep_data: ReportResponse):
    """
    Determines if a claimed report is eligible for takeover due to inactivity.
    - Urgent / High priority: 2 hours of inactivity
    - Standard / Medium / Low priority: 24 hours of inactivity
    """
    from datetime import datetime, timedelta
    now = datetime.now()

    if not rep.assigned_leader_id or rep.current_status_id in [11, 12, 14, 3]:
        rep_data.is_takeover_eligible = True
        rep_data.takeover_cooldown_remaining_seconds = 0
        rep_data.takeover_locked_until = None
        rep_data.last_activity_at = rep.claimed_at or rep.created_at
        return

    # Determine priority
    priority = (getattr(rep, 'priority_level', None) or getattr(rep_data, 'ai_suggested_priority', None) or "").lower()
    is_urgent = any(kw in priority for kw in ["emergency", "high", "urgent", "bite", "severe"])
    
    # 2 hours for urgent/high priority, 24 hours for standard
    hours_threshold = 2 if is_urgent else 24
    rep_data.takeover_inactivity_hours_threshold = hours_threshold

    latest_activity: datetime = rep.claimed_at or rep.created_at or now
    if rep.history:
        for hist in rep.history:
            if hist.created_at and hist.created_at > latest_activity:
                latest_activity = hist.created_at

    rep_data.last_activity_at = latest_activity

    locked_until = latest_activity + timedelta(hours=hours_threshold)
    rep_data.takeover_locked_until = locked_until

    if now >= locked_until:
        rep_data.is_takeover_eligible = True
        rep_data.takeover_cooldown_remaining_seconds = 0
    else:
        rep_data.is_takeover_eligible = False
        remaining = int((locked_until - now).total_seconds())
        rep_data.takeover_cooldown_remaining_seconds = max(0, remaining)


def get_hist_updater_name(hist, rep) -> str:
    if hist.updater and hist.updater.name:
        return hist.updater.name
    if hasattr(rep, 'assigned_leader') and rep.assigned_leader and rep.assigned_leader.name:
        return rep.assigned_leader.name
    if hasattr(rep, 'reporter') and rep.reporter and rep.reporter.name:
        return rep.reporter.name
    return "Subdivision Officer / Responders"


def populate_pet_and_owner_info(rep_data: ReportResponse, rep: Report, db: Session):
    """Populate linked pet details, QR code, and owner contact information for lost pet reports."""
    try:
        target_pet_id = rep.pet_id or rep_data.pet_id
        if target_pet_id:
            linked_pet = db.query(Pet).filter(Pet.pet_id == target_pet_id).first()
            if linked_pet:
                rep_data.pet_name = getattr(linked_pet, "pet_name", None) or getattr(linked_pet, "name", None)
                qr = db.query(PetQRCode).filter(PetQRCode.pet_id == linked_pet.pet_id).first()
                if not qr:
                    try:
                        from app.routes.pet_qr import generate_qr_for_pet_internal
                        qr = generate_qr_for_pet_internal(linked_pet.pet_id, db)
                    except Exception as qr_err:
                        print(f"Could not auto-generate QR for pet #{linked_pet.pet_id}: {qr_err}")
                if qr:
                    rep_data.pet_qr_code_url = qr.qr_image_url
                    rep_data.pet_qr_token = qr.qr_token
                    rep_data.pet_qr_code_hash = qr.qr_token[:10].upper() if qr.qr_token else None
                
                if linked_pet.owner_id:
                    pet_owner = db.query(User).filter(User.user_id == linked_pet.owner_id).first()
                    if pet_owner:
                        rep_data.owner_id = pet_owner.user_id
                        rep_data.owner_name = pet_owner.name
                        rep_data.owner_phone = pet_owner.phone
                        rep_data.owner_email = pet_owner.email
                        rep_data.owner_address = pet_owner.address
                        rep_data.is_owner_report = (rep.user_id == pet_owner.user_id)
                else:
                    # Explicitly unowned / community pet
                    rep_data.owner_id = None
                    rep_data.owner_name = None
                    rep_data.owner_phone = None
                    rep_data.owner_email = None
                    rep_data.owner_address = None
                    rep_data.is_owner_report = False
    except Exception as err:
        print(f"Failed to populate pet/owner info for report {rep.report_id}: {err}")


def populate_verification_and_disputes(rep_data: ReportResponse, rep: Report, db: Session):
    """Populates on-site verification status, false alarm findings, and pet owner disputes."""
    try:
        rep_data.verification_status = getattr(rep, "verification_status", None) or "unverified"
        rep_data.false_alarm_reason = getattr(rep, "false_alarm_reason", None)
        rep_data.verification_notes = getattr(rep, "verification_notes", None)
        rep_data.verified_by_user_id = getattr(rep, "verified_by_user_id", None)
        rep_data.verified_at = getattr(rep, "verified_at", None)
        rep_data.verified_actual_bite = getattr(rep, "verified_actual_bite", False)
        rep_data.verified_chasing = getattr(rep, "verified_chasing", False)
        rep_data.verified_attempted_bite = getattr(rep, "verified_attempted_bite", False)
        rep_data.verified_injury = getattr(rep, "verified_injury", False)
        rep_data.verified_aggressive = getattr(rep, "verified_aggressive", False)
        rep_data.behavior_finding = getattr(rep, "behavior_finding", None)

        if hasattr(rep, "verified_by_user") and rep.verified_by_user:
            rep_data.verified_by_name = rep.verified_by_user.name
        elif rep.verified_by_user_id:
            v_user = db.query(User).filter(User.user_id == rep.verified_by_user_id).first()
            rep_data.verified_by_name = v_user.name if v_user else f"Officer #{rep.verified_by_user_id}"

        # Load disputes
        disputes_list = []
        disputes_records = db.query(ReportDispute).options(
            joinedload(ReportDispute.resident),
            joinedload(ReportDispute.reviewer),
            joinedload(ReportDispute.pet)
        ).filter(ReportDispute.report_id == rep.report_id).order_by(ReportDispute.created_at.desc()).all()

        for d in disputes_records:
            d_resp = ReportDisputeResponse(
                dispute_id=d.dispute_id,
                report_id=d.report_id,
                resident_user_id=d.resident_user_id,
                pet_id=d.pet_id,
                dispute_reason=d.dispute_reason,
                vaccination_card_url=d.vaccination_card_url,
                supporting_photo_url=d.supporting_photo_url,
                status=d.status,
                reviewer_id=d.reviewer_id,
                reviewer_notes=d.reviewer_notes,
                created_at=d.created_at,
                resolved_at=d.resolved_at,
                resident_name=d.resident.name if d.resident else None,
                pet_name=d.pet.pet_name if d.pet else None,
                reviewer_name=d.reviewer.name if d.reviewer else None
            )
            disputes_list.append(d_resp)
        rep_data.disputes = disputes_list
    except Exception as err:
        print(f"Failed to populate verification/dispute info for report {rep.report_id}: {err}")


@router.get("/", response_model=List[ReportResponse])
def get_reports(
    subdivision_id: Optional[int] = None,
    escalated_only: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Report)
    if subdivision_id is not None:
        query = query.filter(Report.subdivision_id == subdivision_id)

    if escalated_only:
        query = query.filter(
            or_(
                Report.current_status_id.in_([4, 5, 6, 7, 8, 9, 10, 13]),
                Report.endorsement_letter.has(),
                Report.rescues.any(),
                Report.history.any(StatusHistory.report_status_id == 4)
            )
        )

    reports = query.options(
        joinedload(Report.reporter),
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).all()
    
    results = []
    
    from app.utils.ai_suggestions import generate_ai_suggestions
    
    for rep in reports:
        try:
            # Dynamic backfill for legacy reports missing suggestions
            if rep.ai_suggested_risk_level is None:
                category_name = rep.category.category_name if rep.category else ""
                
                # Check for media metadata if available
                media_animal = None
                media_color = None
                if rep.media:
                    for m in rep.media:
                        if m.animal_type and m.animal_type != "Unknown":
                            media_animal = m.animal_type
                        if m.dominant_color and m.dominant_color != "Unknown":
                            media_color = m.dominant_color
                            
                suggestions = generate_ai_suggestions(
                    description=rep.description,  # type: ignore
                    category_name=category_name,  # type: ignore
                    media_animal_type=media_animal,  # type: ignore
                    media_dominant_color=media_color  # type: ignore
                )
                
                rep.ai_animal_type = suggestions["ai_animal_type"]  # type: ignore
                rep.ai_dominant_color = suggestions["ai_dominant_color"]  # type: ignore
                rep.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
                rep.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
                rep.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
                rep.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
                rep.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore
                rep.ai_behavior_chasing = suggestions.get("ai_behavior_chasing", False)  # type: ignore
                rep.ai_behavior_actual_bite = suggestions.get("ai_behavior_actual_bite", False)  # type: ignore
                rep.ai_behavior_attempted_bite = suggestions.get("ai_behavior_attempted_bite", False)  # type: ignore
                rep.ai_behavior_injury = suggestions.get("ai_behavior_injury", False)  # type: ignore
                rep.ai_behavior_aggressive = suggestions.get("ai_behavior_aggressive", False)  # type: ignore
                rep.ai_behavior_explanation = suggestions.get("ai_behavior_explanation")  # type: ignore
                
                db.commit()
                db.refresh(rep)

            rep_data = ReportResponse.model_validate(rep)
            # Map current_status_id → status_id for frontend compatibility
            rep_data.status_id = rep.current_status_id  # type: ignore[assignment]
            rep_data.reporter_name = rep.reporter.name if rep.reporter else "Unknown User"
            rep_data.reporter_photo = rep.reporter.profile_picture if rep.reporter else None
            
            # Map AI suggestions explicitly
            rep_data.ai_animal_type = rep.ai_animal_type  # type: ignore
            rep_data.ai_dominant_color = rep.ai_dominant_color  # type: ignore
            rep_data.ai_estimated_size = rep.ai_estimated_size  # type: ignore
            rep_data.ai_possible_breed = rep.ai_possible_breed  # type: ignore
            rep_data.ai_suggested_risk_level = rep.ai_suggested_risk_level  # type: ignore
            rep_data.ai_suggested_priority = rep.ai_suggested_priority  # type: ignore
            
            # Populate history updater names
            if rep.history:
                for i, hist in enumerate(rep.history):  # type: ignore[arg-type]
                    if rep_data.history and i < len(rep_data.history):
                        rep_data.history[i].updater_name = get_hist_updater_name(hist, rep)
                        rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

            if rep.comments:
                for i, comment in enumerate(rep.comments):  # type: ignore[arg-type]
                    if rep_data.comments and i < len(rep_data.comments):
                        rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                        rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None

            # Populate pet & owner contact info for lost pet reports
            populate_pet_and_owner_info(rep_data, rep, db)

            # Populate handler details
            populate_handler_info(rep_data, rep)

            # Populate verification & dispute data
            populate_verification_and_disputes(rep_data, rep, db)

            results.append(rep_data)
        except Exception as e:
            print(f"Error validating or backfilling report {rep.report_id}: {e}")
            db.rollback()
            continue
    return results


# Define the Selera Homes boundary polygon for geofencing
# North, East, South, West corners approximated from coordinates
SELERA_POLYGON = [
    (14.801496, 121.005174),
    (14.799577, 121.003911),
    (14.800634, 121.002228),
    (14.802461, 121.003280)
]

def is_inside_selera_homes(lat: float | None, lng: float | None) -> bool:
    """Check if point is within the Selera Homes / Santa Maria, Bulacan area."""
    if lat is None or lng is None:
        return True
    try:
        # Bounding box covering Selera Homes, San Vicente, and Santa Maria, Bulacan
        if 14.70 <= lat <= 14.90 and 120.90 <= lng <= 121.10:
            return True
    except (ValueError, TypeError):
        pass
    return True


def classify_category_from_description(description: str) -> int:
    """Classify report category based on description keywords.
    Uses a priority precedence order based on urgency and risk:
    1. Possible Rabies Risk (Category 3)
    2. Aggressive Stray (Category 2)
    3. Injured Animal (Category 1)
    4. Roaming Pack (Category 4)
    5. Animal Rescue Needed (Category 5) - fallback
    """
    text = (description or "").lower()
    
    # 1. Possible Rabies Risk (highest threat priority)
    rabies_keywords = ["rabies", "rabid", "foaming", "frothing", "drooling", "furious"]
    if any(kw in text for kw in rabies_keywords):
        return 3
        
    # 2. Aggressive Stray (active hazard)
    aggressive_keywords = [
        "aggressive", "bite", "biting", "attack", "attacking", "growl", "growling", 
        "snarl", "snarling", "snap", "snapping", "hostile"
    ]
    if any(kw in text for kw in aggressive_keywords):
        return 2
        
    # 3. Injured Animal (physical trauma/distress)
    injured_keywords = [
        "injured", "bleeding", "wound", "hurt", "broken", "hit by car", "blood", "accident"
    ]
    if any(kw in text for kw in injured_keywords):
        return 1
        
    # 4. Roaming Pack (grouping & roaming behaviors)
    roaming_keywords = ["roaming", "pack", "group", "multiple", "horde"]
    if any(kw in text for kw in roaming_keywords):
        return 4
        
    # 5. Fallback/Animal Rescue Needed
    return 5


def trigger_looks_matching(report: Report, db: Session):
    """Compare stray report AI suggestions against registered pets of other owners using the unified AI matching engine."""
    try:
        from app.routes.matches import scan_and_generate_matches_for_report
        scan_and_generate_matches_for_report(report.report_id, db)
    except Exception as e:
        print(f"Error in trigger_looks_matching: {e}")




@router.post("/analyze-media")
async def analyze_report_media(
    file: UploadFile = File(...)
):
    """Analyze uploaded stray animal image and return AI predictions or indicate if no animal was detected."""
    try:
        content = await file.read()
        from PIL import Image
        import io
        import os
        import json
        import tempfile

        img = Image.open(io.BytesIO(content)).convert("RGB")

        # Run YOLOv8 detection first to check for cats/dogs and bounding boxes
        yolo_count = 0
        detected_yolo_labels = []
        detected_yolo_boxes = []
        try:
            from ultralytics import YOLO
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            try:
                yolo_model = YOLO('yolov8n.pt')
                results = yolo_model(tmp_path)
                for r in results:
                    for c, box in zip(r.boxes.cls, r.boxes.xyxy):
                        label = r.names[int(c)]
                        if label.lower() in ['dog', 'cat']:
                            yolo_count += 1
                            detected_yolo_labels.append(label.capitalize())
                            detected_yolo_boxes.append([float(v) for v in box])
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
        except Exception as yerr:
            print("YOLO check in analyze-media error:", yerr)

        # Crop image to primary animal subject bounding box to eliminate background distraction (cobblestones, street, buildings)
        cropped_img = img
        if detected_yolo_boxes:
            box = max(detected_yolo_boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
            x1, y1, x2, y2 = box
            w, h = img.size
            pad_w = (x2 - x1) * 0.05
            pad_h = (y2 - y1) * 0.05
            cx1 = max(0, int(x1 - pad_w))
            cy1 = max(0, int(y1 - pad_h))
            cx2 = min(w, int(x2 + pad_w))
            cy2 = min(h, int(y2 + pad_h))
            if cx2 > cx1 and cy2 > cy1:
                cropped_img = img.crop((cx1, cy1, cx2, cy2))

        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            try:
                prompt = """
                You are an expert AI animal inspector for a stray pet safety system.
                Inspect the attached image of the animal subject and determine whether a real, live stray dog or cat is clearly visible.

                CRITICAL RULE FOR COLOR & PATTERN DETECTION:
                Focus strictly and exclusively on the fur/coat of the animal subject in the foreground.
                Do NOT include background colors (such as ground, pavement, street, cobblestones, grass, walls, or furniture).

                Provide predictions in a valid JSON object with the following fields:
                1. "animal_detected": true ONLY if a real dog or cat is clearly visible in the image. Set to false if the image shows inanimate objects, landscapes, food, people without a pet, documents, or non-dog/cat animals.
                2. "animal_type": "Dog", "Cat", or "Unknown" (if animal_detected is false, must be "Unknown").
                3. "primary_color": Dominant primary fur color of the animal (e.g. "Black", "White", "Brown", "Orange", "Gray", "Calico", "Cream", "Golden", or "Unknown"). If the animal is solid black, primary_color MUST be "Black".
                4. "secondary_color": Secondary fur color or "None".
                5. "tertiary_color": Third fur color or "None" if there is no third color.
                6. "coat_pattern": "Solid", "Bicolor", "Tricolor", "Spotted", "Striped", "Patched", "Brindle", "Merle", "Tabby", "Calico", "Tortoiseshell", "Mixed", or "Unknown".
                7. "estimated_size": "Small", "Medium", "Large", or "Unknown". (Default "Small" for cats).
                8. "possible_breed": Likely breed name (e.g., "Puspin" for domestic cats, "Shih Tzu", "Aspin" for local dogs, "Siamese", "Persian", "Golden Retriever", "Beagle", or "Unknown").
                9. "collar_detected": true ONLY if a collar or harness is clearly visible around the neck, otherwise false.
                10. "qr_tag_detected": true ONLY if a QR tag or ID tag is attached, otherwise false.
                11. "message": If animal_detected is false, provide a short friendly message: "No animal detected in the uploaded image. Please ensure a cat or dog is clearly visible in your photo." If detected, provide "Animal detected successfully."

                Be extremely accurate.
                Respond ONLY with a valid JSON block.
                """

                res = call_gemini_with_fallback(
                    [prompt, cropped_img],
                    generation_config={"response_mime_type": "application/json"}
                )

                if not res or not getattr(res, "text", None):
                    raise ValueError("Gemini API returned an empty or invalid response.")

                text_resp = res.text.strip()
                if text_resp.startswith("```"):
                    lines = text_resp.split("\n")
                    if lines[0].startswith("```json"):
                        text_resp = "\n".join(lines[1:-1])
                    elif lines[0].startswith("```"):
                        text_resp = "\n".join(lines[1:-1])

                data = json.loads(text_resp)
                gemini_detected = bool(data.get("animal_detected", False))
                animal_type = str(data.get("animal_type", "Unknown"))

                # Combine YOLO & Gemini validation
                is_detected = gemini_detected or (yolo_count > 0)
                if not is_detected or animal_type.lower() in ["unknown", "none", "null"]:
                    if yolo_count > 0:
                        is_detected = True
                        animal_type = detected_yolo_labels[0] if detected_yolo_labels else "Dog"
                    else:
                        is_detected = False
                        animal_type = "Unknown"

                if not is_detected:
                    return {
                        "animal_detected": False,
                        "animal_type": "Unknown",
                        "primary_color": "Unknown",
                        "secondary_color": "None",
                        "tertiary_color": "None",
                        "coat_pattern": "Unknown",
                        "estimated_size": "Unknown",
                        "possible_breed": "Unknown",
                        "collar_detected": False,
                        "qr_tag_detected": False,
                        "message": "No animal detected in the uploaded image. Please ensure a cat or dog is clearly visible."
                    }

                return {
                    "animal_detected": True,
                    "animal_type": animal_type if animal_type in ["Dog", "Cat"] else ("Dog" if "dog" in animal_type.lower() else "Cat"),
                    "primary_color": str(data.get("primary_color", "Black")),
                    "secondary_color": str(data.get("secondary_color", "None")),
                    "tertiary_color": str(data.get("tertiary_color", "None")),
                    "coat_pattern": str(data.get("coat_pattern", "Solid")),
                    "estimated_size": str(data.get("estimated_size", "Small")),
                    "possible_breed": str(data.get("possible_breed", "Puspin" if animal_type == "Cat" else "Aspin")),
                    "collar_detected": bool(data.get("collar_detected", False)),
                    "qr_tag_detected": bool(data.get("qr_tag_detected", False)),
                    "message": "Animal detected successfully."
                }
            except Exception as gem_err:
                print("Gemini Vision analysis error:", gem_err)

        # Fallback if Gemini is not available: use YOLO detection result and extract color from cropped animal subject
        if yolo_count == 0:
            return {
                "animal_detected": False,
                "animal_type": "Unknown",
                "primary_color": "Unknown",
                "secondary_color": "None",
                "tertiary_color": "None",
                "coat_pattern": "Unknown",
                "estimated_size": "Unknown",
                "possible_breed": "Unknown",
                "collar_detected": False,
                "qr_tag_detected": False,
                "message": "No animal detected in the uploaded image. Please ensure a cat or dog is clearly visible."
            }

        # YOLO found an animal; extract dominant colors strictly from the cropped animal region
        detected_type = detected_yolo_labels[0] if detected_yolo_labels else "Dog"
        cropped_bytes_io = io.BytesIO()
        cropped_img.save(cropped_bytes_io, format='JPEG')
        extracted_color_str = extract_dominant_colors(cropped_bytes_io.getvalue())
        extracted_colors = [c.strip() for c in extracted_color_str.split(',') if c.strip() and c.strip() != "Unknown"]
        
        p_color = extracted_colors[0] if extracted_colors else "Black"
        s_color = extracted_colors[1] if len(extracted_colors) > 1 else "None"
        t_color = extracted_colors[2] if len(extracted_colors) > 2 else "None"

        return {
            "animal_detected": True,
            "animal_type": detected_type,
            "primary_color": p_color,
            "secondary_color": s_color,
            "tertiary_color": t_color,
            "coat_pattern": "Solid",
            "estimated_size": "Small" if detected_type == "Cat" else "Medium",
            "possible_breed": "Puspin" if detected_type == "Cat" else "Aspin",
            "collar_detected": False,
            "qr_tag_detected": False,
            "message": "Animal detected successfully."
        }
    except Exception as e:
        print("Media analysis error:", e)
        return {
            "animal_detected": False,
            "animal_type": "Unknown",
            "primary_color": "Unknown",
            "secondary_color": "None",
            "tertiary_color": "None",
            "coat_pattern": "Unknown",
            "estimated_size": "Unknown",
            "possible_breed": "Unknown",
            "collar_detected": False,
            "qr_tag_detected": False,
            "message": "Unable to verify animal in image. Please ensure a clear photo of a dog or cat."
        }


@router.post("/validate-images")
async def validate_report_images(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    try:
        from ultralytics import YOLO
        import tempfile
        from PIL import Image
        import io
        import os
        import json
        import google.generativeai as genai
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required library missing: {str(e)}")

    valid_images = []
    pil_images = []
    api_key = os.getenv("GEMINI_API_KEY")

    # Validate each uploaded image
    for file in files:
        filename = file.filename or ""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
            # Skip non-image files if any are sent
            continue

        try:
            # Read file content
            content = await file.read()
            await file.seek(0)
            
            # Load as PIL Image to verify it's valid
            try:
                img = Image.open(io.BytesIO(content))
                img.verify()
                # Re-open because verify() closes/invalidates the image object
                img = Image.open(io.BytesIO(content)).convert("RGB")
            except Exception:
                return {
                    "valid": False,
                    "error_type": "invalid_image",
                    "message": f"Uploaded file {filename} is not a valid image."
                }

            # Save to temporary file for YOLOv8
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            animal_count = 0
            try:
                model = YOLO('yolov8n.pt')
                results = model(tmp_path)
                
                for r in results:
                    for c in r.boxes.cls:
                        label = r.names[int(c)]
                        if label.lower() in ['dog', 'cat']:
                            animal_count += 1
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            # If YOLO detected 0 animals, double-check with Gemini Vision to prevent false negatives
            if animal_count == 0:
                try:
                    check_prompt = """
                    Is there a real live dog or cat visible in this photo?
                    Respond ONLY with a JSON object: {"animal_detected": true/false, "count": number}
                    """
                    g_res = call_gemini_with_fallback(
                        [check_prompt, img],
                        generation_config={"response_mime_type": "application/json"}
                    )
                    if not g_res or not getattr(g_res, "text", None):
                        raise ValueError("Gemini API returned an empty or invalid response.")
                    g_text = g_res.text.strip()
                    if g_text.startswith("```"):
                        lines = g_text.split("\n")
                        g_text = "\n".join(lines[1:-1] if lines[0].startswith("```") else lines)
                    g_data = json.loads(g_text)
                    if g_data.get("animal_detected"):
                        animal_count = max(1, int(g_data.get("count", 1)))
                except Exception as gem_check_err:
                    print(f"Gemini fallback validation error for {filename}:", gem_check_err)

            if animal_count == 0:
                return {
                    "valid": False,
                    "error_type": "no_animal",
                    "message": "No animal was detected in the uploaded image. Please upload a clear photo of a dog or cat."
                }
            elif animal_count > 1:
                return {
                    "valid": False,
                    "error_type": "multiple_animals",
                    "message": "Multiple animals were detected in one or more uploaded images. Please upload images containing only one animal per report."
                }

            # Keep valid image content and PIL image for similarity analysis
            valid_images.append(content)
            pil_images.append(img)

        except Exception as e:
            print(f"Error analyzing image {filename}: {e}")
            return {
                "valid": False,
                "error_type": "error",
                "message": f"Error analyzing image {filename}: {str(e)}"
            }

    # If multiple images, run visual similarity analysis
    if len(pil_images) > 1:
        try:
            prompt = """
            You are the StraySafe Copilot, an AI assistant for a subdivision's stray animal reporting and safety system.
            You are given multiple images of stray animals uploaded for a single report.
            Your task is to analyze these images and determine if they depict the same individual animal.

            Analyze visual characteristics of the animal in each image, including:
            - Fur color and color patterns (e.g., solid, spotted, striped, patches)
            - Body shape, size, and proportions
            - Facial features (e.g., muzzle length, snout color, eyes)
            - Ear shape and position (e.g., floppy, erect, cropped)
            - Tail shape and length (e.g., bushy, long, docked)
            - Distinctive markings or scars

            Rules:
            1. The purpose is solely to check that a single report focuses on a single animal. Do not attempt to determine ownership.
            2. Respond ONLY with a valid JSON block containing two fields:
               - "status": Must be one of the following strings:
                 * "same": if you are confident that all images depict the same individual animal.
                 * "different": if you detect that the images show different individual animals (e.g., a dog and a cat, or two dogs with different color/breed/markings).
                 * "inconclusive": if you cannot confidently determine whether they are the same or different (e.g., poor lighting, blurry images, or only one image doesn't show the animal clearly).
               - "reason": A short, conversational, and warm explanation (1-2 sentences) of your reasoning. Do not mention technical terms or 'JSON'.

            Respond ONLY with a valid JSON block.
            """

            content_to_send = [prompt]
            for img in pil_images:
                content_to_send.append(img)

            response = call_gemini_with_fallback(
                content_to_send,
                generation_config={"response_mime_type": "application/json"}
            )

            if not response or not getattr(response, "text", None):
                raise ValueError("Gemini API returned an empty or invalid response.")

            text_resp = response.text.strip()
            if text_resp.startswith("```"):
                lines = text_resp.split("\n")
                if lines[0].startswith("```json"):
                    text_resp = "\n".join(lines[1:-1])
                elif lines[0].startswith("```"):
                    text_resp = "\n".join(lines[1:-1])

            data = json.loads(text_resp)
            status = data.get("status", "inconclusive")

            if status == "same":
                return {"valid": True, "status": "same"}
            elif status == "different":
                return {
                    "valid": False,
                    "error_type": "different_animals",
                    "message": "The uploaded images appear to show different animals. Please create a separate report for each animal."
                }
            else:
                return {
                    "valid": False,
                    "error_type": "inconclusive",
                    "message": "The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting."
                }

        except Exception as gemini_err:
            print(f"Gemini similarity error: {gemini_err}")
            return {
                "valid": False,
                "error_type": "inconclusive",
                "message": "The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting."
            }

    return {"valid": True, "status": "success"}


@router.post("/", response_model=ReportResponse)
def create_report(report_in: ReportCreate, req: Request, db: Session = Depends(get_db)):
    try:
        # Geofence validation
        if not is_inside_selera_homes(report_in.latitude, report_in.longitude):
            raise HTTPException(
                status_code=400, 
                detail="Location outside Selera Homes. Reports are only accepted within the subdivision boundary."
            )

        report_data = report_in.model_dump()

        # Hard validation: Prevent deceased pets from being reported as Lost or linked to lost reports
        if report_data.get("pet_id"):
            pet_to_check = db.query(Pet).filter(Pet.pet_id == report_data["pet_id"]).first()
            if not pet_to_check:
                raise HTTPException(status_code=404, detail="Selected pet not found.")
            if pet_to_check.status and pet_to_check.status.lower() == "deceased":
                raise HTTPException(
                    status_code=400,
                    detail="This pet is marked as deceased and cannot be reported as lost."
                )
            # Mark the pet status as 'Lost' if creating a lost pet report
            if report_data.get("category_id") == 6:
                pet_to_check.status = "Lost"

        # Map frontend "status_id" → DB "current_status_id"
        raw_status_id = report_data.pop("status_id", 1) or 1
        status_obj = db.query(ReportStatus).filter(ReportStatus.status_id == raw_status_id).first()
        report_data["current_status_id"] = status_obj.status_id if status_obj else 1

        # Validate user_id exists in DB, fallback to existing user (1)
        raw_user_id = report_data.get("user_id")
        user_obj = db.query(User).filter(User.user_id == raw_user_id).first() if raw_user_id else None
        if not user_obj:
            user_obj = db.query(User).first()
            report_data["user_id"] = user_obj.user_id if user_obj else 1

        # Validate subdivision_id exists in DB, fallback to user's subdivision or default (1)
        raw_subd_id = report_data.get("subdivision_id")
        subd_obj = db.query(Subdivision).filter(Subdivision.subdivision_id == raw_subd_id).first() if raw_subd_id else None
        if not subd_obj:
            report_data["subdivision_id"] = user_obj.subdivision_id if (user_obj and user_obj.subdivision_id) else 1

        # Drop any frontend-only fields not in the DB (condition, behavior_tags, is_archived are not in reports table)
        for field in ["condition", "behavior_tags", "is_archived", "status_remarks"]:
            report_data.pop(field, None)

        # Auto-classify category if not provided or invalid
        raw_cat_id = report_data.get("category_id")
        cat_obj = db.query(ReportCategory).filter(ReportCategory.category_id == raw_cat_id).first() if raw_cat_id else None
        if not cat_obj:
            report_data["category_id"] = classify_category_from_description(report_data.get("description", "")) or 1
        else:
            report_data["category_id"] = cat_obj.category_id

        db_report = Report(**report_data)
        db.add(db_report)
        db.flush()  # Get report_id before committing

        # Generate initial AI suggestions based on report details
        from app.utils.ai_suggestions import generate_ai_suggestions
        category_name = ""
        if db_report.category_id:
            category_obj = db.query(ReportCategory).filter(ReportCategory.category_id == db_report.category_id).first()
            if category_obj:
                category_name = category_obj.category_name
        
        suggestions = generate_ai_suggestions(
            description=db_report.description,  # type: ignore
            category_name=category_name  # type: ignore
        )
        db_report.ai_animal_type = suggestions["ai_animal_type"]  # type: ignore
        db_report.ai_dominant_color = suggestions["ai_dominant_color"]  # type: ignore
        db_report.ai_coat_pattern = suggestions.get("ai_coat_pattern") or "Solid"  # type: ignore
        db_report.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
        db_report.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
        db_report.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
        db_report.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
        db_report.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore
        db_report.ai_behavior_chasing = suggestions.get("ai_behavior_chasing", False)  # type: ignore
        db_report.ai_behavior_actual_bite = suggestions.get("ai_behavior_actual_bite", False)  # type: ignore
        db_report.ai_behavior_attempted_bite = suggestions.get("ai_behavior_attempted_bite", False)  # type: ignore
        db_report.ai_behavior_injury = suggestions.get("ai_behavior_injury", False)  # type: ignore
        db_report.ai_behavior_aggressive = suggestions.get("ai_behavior_aggressive", False)  # type: ignore
        db_report.ai_behavior_explanation = suggestions.get("ai_behavior_explanation")  # type: ignore

        # Create initial history entry for status 1 (Reported)
        initial_history = StatusHistory(
            report_id=db_report.report_id,
            report_status_id=db_report.current_status_id,
            updated_by=db_report.user_id,
            remarks="Initial report submitted by resident."
        )
        db.add(initial_history)
        
        # If pet_id is linked and the pet has a photo, automatically create ReportMedia so the lost pet's photo is visible in all report feeds
        if db_report.pet_id:
            linked_pet = db.query(Pet).filter(Pet.pet_id == db_report.pet_id).first()
            if linked_pet and linked_pet.photo_url:
                p_type = 'Unknown'
                if linked_pet.pet_type:
                    if linked_pet.pet_type.lower() == 'dog':
                        p_type = 'Dog'
                    elif linked_pet.pet_type.lower() == 'cat':
                        p_type = 'Cat'

                pet_media = ReportMedia(
                    report_id=db_report.report_id,
                    file_url=linked_pet.photo_url,
                    media_type='Image',
                    animal_type=p_type,
                    dominant_color=linked_pet.primary_color or 'Brown',
                    is_evidence=False
                )
                db.add(pet_media)

        db.commit()
        db.refresh(db_report)
        try:
            trigger_looks_matching(db_report, db)
        except Exception as match_err:
            print(f"Failed to match pets on report creation: {match_err}")

        rep_data = ReportResponse.model_validate(db_report)
        rep_data.status_id = db_report.current_status_id  # type: ignore[assignment]
        rep_data.reporter_name = db_report.reporter.name if db_report.reporter else "Unknown User"
        rep_data.reporter_photo = db_report.reporter.profile_picture if db_report.reporter else None
        
        # Map AI suggestions explicitly
        rep_data.ai_animal_type = db_report.ai_animal_type  # type: ignore
        rep_data.ai_dominant_color = db_report.ai_dominant_color  # type: ignore
        rep_data.ai_estimated_size = db_report.ai_estimated_size  # type: ignore
        rep_data.ai_possible_breed = db_report.ai_possible_breed  # type: ignore
        rep_data.ai_suggested_risk_level = db_report.ai_suggested_risk_level  # type: ignore
        rep_data.ai_suggested_priority = db_report.ai_suggested_priority  # type: ignore
        rep_data.ai_suggested_priority_reason = db_report.ai_suggested_priority_reason  # type: ignore

        # Notify subdivision leader(s) about the new report
        if db_report.subdivision_id:
            try:
                leaders = db.query(User).filter(
                    User.subdivision_id == db_report.subdivision_id,
                    User.role_id == 2
                ).all()
                for leader in leaders:
                    if leader.user_id != db_report.user_id:
                        subd_notif = Notification(
                            user_id=leader.user_id,
                            title=f"New Stray Report #{db_report.report_id}",
                            message=f"A new {db_report.animal_type or 'stray'} report was submitted in your subdivision at {db_report.landmark or 'designated location'}.",
                            type="alert",
                            related_id=db_report.report_id
                        )
                        db.add(subd_notif)
            except Exception as notif_err:
                print(f"Notice: Failed to create leader notification: {notif_err}")

        log_activity(
            db=db,
            action="CREATE_REPORT",
            target_table="reports",
            target_id=db_report.report_id,
            description=f"New report submitted (report_id={db_report.report_id}): {db_report.animal_type}, priority={db_report.priority_level}",
            user_id=db_report.user_id,
            log_type="operation",
            new_values={"animal_type": str(db_report.animal_type), "priority_level": str(db_report.priority_level), "subdivision_id": db_report.subdivision_id},
            request=req
        )

        # Populate pet & owner contact info for lost pet reports
        populate_pet_and_owner_info(rep_data, db_report, db)
        populate_handler_info(rep_data, db_report)
        populate_verification_and_disputes(rep_data, db_report, db)

        return rep_data
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).options(
        joinedload(Report.reporter),
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if report.endorsement_letter:
        let = report.endorsement_letter
        if let.leader:
            let.leader_name = let.leader.name
            if let.leader.position:
                let.leader_position = let.leader.position.position_name

    from app.utils.ai_suggestions import generate_ai_suggestions

    try:
        # Backfill AI suggestions if missing
        if report.ai_suggested_risk_level is None:
            category_name = report.category.category_name if report.category else ""
            media_animal = None
            media_color = None
            if report.media:
                for m in report.media:
                    if m.animal_type and m.animal_type != "Unknown":
                        media_animal = m.animal_type
                    if m.dominant_color and m.dominant_color != "Unknown":
                        media_color = m.dominant_color

            suggestions = generate_ai_suggestions(
                description=report.description,  # type: ignore
                category_name=category_name,  # type: ignore
                media_animal_type=media_animal,  # type: ignore
                media_dominant_color=media_color  # type: ignore
            )
            report.ai_animal_type = suggestions["ai_animal_type"]  # type: ignore
            report.ai_dominant_color = suggestions["ai_dominant_color"]  # type: ignore
            report.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
            report.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
            report.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
            report.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
            report.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore
            report.ai_behavior_chasing = suggestions.get("ai_behavior_chasing", False)  # type: ignore
            report.ai_behavior_actual_bite = suggestions.get("ai_behavior_actual_bite", False)  # type: ignore
            report.ai_behavior_attempted_bite = suggestions.get("ai_behavior_attempted_bite", False)  # type: ignore
            report.ai_behavior_injury = suggestions.get("ai_behavior_injury", False)  # type: ignore
            report.ai_behavior_aggressive = suggestions.get("ai_behavior_aggressive", False)  # type: ignore
            report.ai_behavior_explanation = suggestions.get("ai_behavior_explanation")  # type: ignore
            db.commit()
            db.refresh(report)

        rep_data = ReportResponse.model_validate(report)
        rep_data.status_id = report.current_status_id  # type: ignore[assignment]
        rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
        rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

        rep_data.ai_animal_type = report.ai_animal_type  # type: ignore
        rep_data.ai_dominant_color = report.ai_dominant_color  # type: ignore
        rep_data.ai_estimated_size = report.ai_estimated_size  # type: ignore
        rep_data.ai_possible_breed = report.ai_possible_breed  # type: ignore
        rep_data.ai_suggested_risk_level = report.ai_suggested_risk_level  # type: ignore
        rep_data.ai_suggested_priority = report.ai_suggested_priority  # type: ignore

        if report.history:
            for i, hist in enumerate(report.history):  # type: ignore[arg-type]
                if rep_data.history and i < len(rep_data.history):
                    rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                    rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

        if report.comments:
            for i, comment in enumerate(report.comments):  # type: ignore[arg-type]
                if rep_data.comments and i < len(rep_data.comments):
                    rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                    rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None

        # Populate pet & owner contact info for lost pet reports
        populate_pet_and_owner_info(rep_data, report, db)
        populate_handler_info(rep_data, report)
        populate_verification_and_disputes(rep_data, report, db)

        return rep_data
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error fetching report: {str(e)}")


@router.delete("/{report_id}")
def delete_report(report_id: int, req: Request, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report_snapshot = {"report_id": report.report_id, "animal_type": str(report.animal_type), "status_id": report.current_status_id}
    
    try:
        # 1. Clean up report matches (both source and matched targets)
        db.query(ReportMatch).filter(
            (ReportMatch.source_report_id == report_id) | (ReportMatch.matched_report_id == report_id)
        ).delete(synchronize_session=False)

        # 2. Clean up pet claims
        db.query(PetClaim).filter(PetClaim.report_id == report_id).delete(synchronize_session=False)

        # 3. Clean up holding animals admitted from this report
        db.query(HoldingAnimal).filter(HoldingAnimal.report_id == report_id).delete(synchronize_session=False)

        # 4. Nullify warnings referencing this report
        db.query(OwnerWarning).filter(OwnerWarning.report_id == report_id).update({"report_id": None}, synchronize_session=False)

        # 5. Clean up chat threads for this report
        chat_threads = db.query(ChatThread).filter((ChatThread.thread_type == "Report") & (ChatThread.related_id == report_id)).all()
        for ct in chat_threads:
            db.delete(ct)

        db.delete(report)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete report: {str(e)}")

    log_activity(
        db=db,
        action="DELETE_REPORT",
        target_table="reports",
        target_id=report_id,
        description=f"Deleted report #{report_id}",
        log_type="operation",
        old_values=report_snapshot,
        request=req
    )
    return {"message": "Report deleted successfully"}


@router.patch("/{report_id}", response_model=ReportResponse)
def update_report(report_id: int, report_update: ReportUpdate, db: Session = Depends(get_db)):
    db_report = db.query(Report).options(joinedload(Report.assigned_leader)).filter(Report.report_id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")

    update_data = report_update.model_dump(exclude_unset=True)

    # Map frontend "status_id" → DB "current_status_id" if present
    if "status_id" in update_data:
        update_data["current_status_id"] = update_data.pop("status_id")

    for key, value in update_data.items():
        if hasattr(db_report, key):
            setattr(db_report, key, value)

    db.commit()
    db.refresh(db_report)

    rep_data = ReportResponse.model_validate(db_report)
    rep_data.status_id = db_report.current_status_id  # type: ignore[assignment]
    rep_data.reporter_name = db_report.reporter.name if db_report.reporter else "Unknown User"

    # Populate pet & owner contact info for lost pet reports
    populate_pet_and_owner_info(rep_data, db_report, db)
    populate_handler_info(rep_data, db_report)

    return rep_data


@router.post("/{report_id}/media", response_model=ReportMediaResponse)
async def upload_report_media(
    report_id: int,
    file: UploadFile = File(...),
    history_id: Optional[int] = Form(None),
    status_id: Optional[int] = Form(None),
    is_evidence: Optional[bool] = Form(False),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    safe_filename = file.filename or ""
    file_extension = os.path.splitext(safe_filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    
    try:
        file_content = await file.read()
        if len(file_content) > MAX_FILE_SIZE:
             raise HTTPException(
                status_code=413, 
                detail=f"File too large ({len(file_content)} bytes). Maximum allowed is 10MB."
            )
        
        file_url = upload_to_cloudinary(file_content, filename=unique_filename)
        
        if not file_url:
            raise Exception("Cloudinary returned an empty URL")

        ext = file_extension.lower()
        if ext in ['.mp4', '.mov', '.avi', '.webm']:
            media_type = 'Video'
        elif ext in ['.pdf', '.docx', '.doc']:
            media_type = 'Document'
        else:
            media_type = 'Image'

        animal_type = None
        dominant_color = None
        visual_size = None
        # Only run AI analysis on original report images, NOT on evidence/endorsement files
        if media_type == 'Image' and not is_evidence:
            try:
                from ultralytics import YOLO
                import tempfile
                from PIL import Image
                import io
                
                # Get image dimensions using PIL
                img = Image.open(io.BytesIO(file_content))
                img_width, img_height = img.size
                image_area = img_width * img_height

                # Save image to a temp file for YOLOv8
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as tmp_img:
                    tmp_img.write(file_content)
                    tmp_img_path = tmp_img.name
                model = YOLO('yolov8n.pt')  # Use the nano model or your custom model
                results = model(tmp_img_path)
                
                # Parse results for dog/cat and extract colors
                detected = set()
                bboxes = []
                
                for r in results:
                    for c, box in zip(r.boxes.cls, r.boxes.xyxy):
                        label = r.names[int(c)]
                        bbox = box.tolist()  # [x1, y1, x2, y2]
                        
                # Determine animal type: prioritize user selection first, then visual detection
                user_selected = (report.animal_type or "").capitalize()
                if user_selected in ['Dog', 'Cat']:
                    animal_type = user_selected
                elif 'Cat' in detected:
                    animal_type = 'Cat'
                elif 'Dog' in detected:
                    animal_type = 'Dog'
                else:
                    animal_type = 'Unknown'
                
                # Extract dominant color and visual size estimate if animal type is known
                if animal_type != 'Unknown':
                    target_bbox = next((b for b, t in bboxes if t == animal_type), None)
                    if target_bbox:
                        dominant_color = extract_dominant_colors(file_content, target_bbox)
                        # Calculate visual size estimate from bounding box area ratio
                        x1, y1, x2, y2 = target_bbox
                        bbox_width = x2 - x1
                        bbox_height = y2 - y1
                        bbox_area = bbox_width * bbox_height
                        ratio = bbox_area / image_area
                        
                        if animal_type == 'Cat':
                            # Cats are physically small animals. For rescue purposes, practically all domestic cats are classified as "Small".
                            visual_size = 'Small'
                        else:  # Dog
                            if ratio < 0.20:
                                visual_size = 'Small'
                            elif ratio <= 0.55:
                                visual_size = 'Medium'
                            else:
                                visual_size = 'Large'
                    else:
                        dominant_color = extract_dominant_colors(file_content)
                        visual_size = 'Medium'  # Default fallback

                    # Map dog color "Orange" or "Ginger" to standard "Brown"
                    if animal_type == 'Dog' and dominant_color and dominant_color != 'Unknown':
                        mapped = []
                        for c in dominant_color.split(','):
                            c_clean = c.strip()
                            if c_clean.lower() in ['orange', 'ginger']:
                                mapped.append('Brown')
                            else:
                                mapped.append(c_clean)
                        # De-duplicate
                        seen = set()
                        dominant_color = ", ".join([x for x in mapped if not (x in seen or seen.add(x))])
                else:
                    animal_type = 'Unknown'
                    dominant_color = 'Unknown'
                    visual_size = 'Unknown'
                    
                # Clean up temp file
                os.unlink(tmp_img_path)
            except Exception as e:
                print(f"YOLOv8 error: {e}")
                animal_type = 'Unknown'
                dominant_color = 'Unknown'
                visual_size = 'Unknown'
        
        db_media = ReportMedia(
            report_id=report_id,
            history_id=history_id,
            status_id=status_id,
            is_evidence=is_evidence,
            file_url=file_url,
            media_type=media_type,
            animal_type=animal_type,
            dominant_color=dominant_color
        )
        db.add(db_media)

        # Only refine parent report AI suggestions from original media, NOT from evidence/endorsement files
        if not is_evidence:
            try:
                from app.utils.ai_suggestions import generate_ai_suggestions
                category_name = ""
                if report.category:
                    category_name = report.category.category_name
                elif report.category_id:
                    category_obj = db.query(ReportCategory).filter(ReportCategory.category_id == report.category_id).first()
                    if category_obj:
                        category_name = category_obj.category_name
                
                suggestions = generate_ai_suggestions(
                    description=report.description,  # type: ignore
                    category_name=category_name,  # type: ignore
                    media_animal_type=animal_type,
                    media_dominant_color=dominant_color,
                    media_estimated_size=visual_size
                )
                report.ai_animal_type = suggestions["ai_animal_type"]  # type: ignore
                report.ai_dominant_color = suggestions["ai_dominant_color"]  # type: ignore
                report.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
                report.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
                report.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
                report.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
                report.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore
                report.ai_behavior_chasing = suggestions.get("ai_behavior_chasing", False)  # type: ignore
                report.ai_behavior_actual_bite = suggestions.get("ai_behavior_actual_bite", False)  # type: ignore
                report.ai_behavior_attempted_bite = suggestions.get("ai_behavior_attempted_bite", False)  # type: ignore
                report.ai_behavior_injury = suggestions.get("ai_behavior_injury", False)  # type: ignore
                report.ai_behavior_aggressive = suggestions.get("ai_behavior_aggressive", False)  # type: ignore
                report.ai_behavior_explanation = suggestions.get("ai_behavior_explanation")  # type: ignore

                # Dynamically set suggestion fields on db_media to be serialized in ReportMediaResponse
                db_media.ai_animal_type = suggestions.get("ai_animal_type")  # type: ignore
                db_media.ai_dominant_color = suggestions.get("ai_dominant_color")  # type: ignore
                db_media.ai_estimated_size = suggestions.get("ai_estimated_size")  # type: ignore
                db_media.ai_possible_breed = suggestions.get("ai_possible_breed")  # type: ignore
                db_media.ai_suggested_risk_level = suggestions.get("ai_suggested_risk_level")  # type: ignore
                db_media.ai_suggested_priority = suggestions.get("ai_suggested_priority")  # type: ignore
            except Exception as suggestions_err:
                print(f"Error refining suggestions during media upload: {suggestions_err}")

        db.commit()
        db.refresh(db_media)
        try:
            trigger_looks_matching(report, db)
        except Exception as match_err:
            print(f"Failed to match pets on media upload: {match_err}")
        return db_media
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error in upload_report_media: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Media upload failed: {str(e)}")


@router.patch("/{report_id}/status", response_model=ReportResponse)
def update_report_status(report_id: int, status_update: ReportStatusUpdate, req: Request, db: Session = Depends(get_db)):
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    prev_status_id = report.current_status_id

    # Update current_status_id (DB column name)
    report.current_status_id = status_update.status_id

    # Update animal condition if provided
    if status_update.animal_condition:
        report.condition = status_update.animal_condition

    # Use either remarks or status_remarks
    final_remarks = status_update.remarks or status_update.status_remarks
    if not final_remarks:
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
        final_remarks = friendly_defaults.get(status_update.status_id, "Status updated.")

    # Avoid adding duplicate StatusHistory entries if status hasn't changed
    last_history = db.query(StatusHistory).filter(
        StatusHistory.report_id == report_id
    ).order_by(StatusHistory.history_id.desc()).first()

    is_duplicate = (
        last_history is not None
        and last_history.report_status_id == status_update.status_id
        and prev_status_id == status_update.status_id
    )

    if not is_duplicate:
        # Create status history entry using DB column names
        db_history = StatusHistory(
            report_id=report_id,
            report_status_id=status_update.status_id,
            updated_by=status_update.user_id,  # Link the update to the user
            remarks=final_remarks
        )
        db.add(db_history)
    
    # Create Notification for Resident
    if report.user_id:
        status_names = {
            1: "Reported",
            2: "Verified",
            3: "Rejected",
            4: "Escalated to Barangay",
            5: "Rescue In Progress",
            6: "Picked Up",
            7: "Under Observation",
            8: "Impounded",
            9: "Claimed by Owner",
            10: "Released",
            11: "Resolved",
            12: "Deceased",
            13: "Approved"
        }
        status_name = status_names.get(status_update.status_id, "Updated")
        notif_msg = f"Your report #{report_id} status has been updated to '{status_name}'."
        if final_remarks:
            notif_msg += f" Remarks: {final_remarks}"

        new_notif = Notification(
            user_id=report.user_id,
            title=f"Report Update: {status_name}",
            message=notif_msg,
            type="status_update",
            related_id=report_id
        )
        db.add(new_notif)

    # Notify Barangay staff and admins if status is escalated to Barangay (Status 4)
    if status_update.status_id == 4:
        try:
            barangay_officials = db.query(User).filter(User.role_id.in_([3, 4])).all()
            for official in barangay_officials:
                b_notif = Notification(
                    user_id=official.user_id,
                    title=f"New Escalated Report #{report_id}",
                    message=f"Report #{report_id} has been escalated to Barangay.",
                    type="alert",
                    related_id=report_id
                )
                db.add(b_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify barangay of escalation: {notif_err}")
        
    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id  # type: ignore[assignment]
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    
    if report.endorsement_letter:
        let = report.endorsement_letter
        if let.leader:
            rep_data.endorsement_letter.leader_name = let.leader.name  # type: ignore[union-attr]
            if let.leader.position:
                rep_data.endorsement_letter.leader_position = let.leader.position.position_name  # type: ignore[union-attr]
    
    # Populate updater names for history entries in the response
    if report.history:
        for i, hist in enumerate(report.history):  # type: ignore[arg-type]
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)

    status_names = {
        1: "Reported", 2: "Verified", 3: "Rejected", 4: "Escalated to Barangay",
        5: "Rescue In Progress", 6: "Picked Up", 7: "Under Observation", 8: "Impounded",
        9: "Claimed by Owner", 10: "Released", 11: "Resolved", 12: "Deceased", 13: "Approved"
    }
    new_status_name = status_names.get(status_update.status_id, str(status_update.status_id))
    log_activity(
        db=db,
        action="UPDATE_STATUS",
        target_table="reports",
        target_id=report_id,
        description=f"Report #{report_id} status updated to '{new_status_name}'",
        user_id=status_update.user_id,
        log_type="operation",
        new_values={"status_id": status_update.status_id, "status_name": new_status_name},
        request=req
    )
    return rep_data


@router.post("/{report_id}/comments", response_model=CommentResponse)
def add_comment(report_id: int, comment_in: CommentCreate, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db_comment = Comment(
        report_id=report_id,
        user_id=comment_in.user_id,
        parent_comment_id=comment_in.parent_comment_id,
        comment=comment_in.comment
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    # Create notification for report owner if commenter is different
    if report.user_id != comment_in.user_id:
        commenter_name = db_comment.user.name if db_comment.user else "Someone"
        comment_text = comment_in.comment
        new_notif = Notification(
            user_id=report.user_id,
            title="New Comment on Your Report",
            message=f"{commenter_name} commented on your report #{report.report_id}: \"{comment_text[:50]}{'...' if len(comment_text) > 50 else ''}\"",
            type="comment",
            related_id=report.report_id
        )
        db.add(new_notif)

    # Also notify subdivision leader(s) if commenter is not the subdivision leader
    if report.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for leader in leaders:
                if leader.user_id != comment_in.user_id and leader.user_id != report.user_id:
                    commenter_name = db_comment.user.name if db_comment.user else "Someone"
                    comment_text = comment_in.comment
                    subd_notif = Notification(
                        user_id=leader.user_id,
                        title=f"New Message on Report #{report.report_id}",
                        message=f"{commenter_name} commented: \"{comment_text[:60]}{'...' if len(comment_text) > 60 else ''}\"",
                        type="message",
                        related_id=report.report_id
                    )
                    db.add(subd_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create leader comment notification: {notif_err}")

    db.commit()

    comment_data = CommentResponse.model_validate(db_comment)
    comment_data.user_name = db_comment.user.name if db_comment.user else "Unknown User"
    comment_data.user_photo = db_comment.user.profile_picture if db_comment.user else None
    return comment_data


@router.delete("/media/{media_id}")
def delete_report_media(media_id: int, db: Session = Depends(get_db)):
    media = db.query(ReportMedia).filter(ReportMedia.media_id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    db.delete(media)
    db.commit()
    return {"message": "Media deleted successfully"}


@router.post("/{report_id}/link-pet")
def link_pet_to_report(report_id: int, pet_id: int, req: Request, db: Session = Depends(get_db)):
    """Links a newly registered or identified pet record to an existing incident report."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    report.pet_id = pet_id
    db.flush()

    # Sync pet behavioral traits with verified reports
    has_verified_bites = db.query(Report).filter(
        Report.pet_id == pet.pet_id,
        Report.verification_status == 'verified_true',
        Report.verified_actual_bite == True
    ).count() > 0

    bite_count = db.query(Report).filter(
        Report.pet_id == pet.pet_id,
        Report.verification_status == 'verified_true',
        Report.verified_actual_bite == True
    ).count()

    chase_count = db.query(Report).filter(
        Report.pet_id == pet.pet_id,
        Report.verification_status == 'verified_true',
        Report.verified_chasing == True
    ).count()

    has_verified_aggression = db.query(Report).filter(
        Report.pet_id == pet.pet_id,
        Report.verification_status == 'verified_true',
        Report.verified_aggressive == True
    ).count() > 0

    pet.has_bite_history = (bite_count > 0)
    pet.bite_incident_count = bite_count
    pet.chase_behavior = (chase_count > 0)
    pet.chase_incident_count = chase_count
    if has_verified_aggression or (bite_count > 0):
        pet.temperament = 'Aggressive'
    else:
        pet.temperament = 'Friendly'

    db.commit()
    db.refresh(report)
    db.refresh(pet)

    log_activity(
        db=db,
        action="LINK_PET_REPORT",
        target_table="reports",
        target_id=report_id,
        description=f"Linked Report #{report_id} to Registered Pet #{pet_id} ('{pet.pet_name}')",
        log_type="operation",
        new_values={"pet_id": pet_id, "pet_name": pet.pet_name},
        request=req
    )

    return {
        "message": f"Report #{report_id} successfully linked to Registered Pet #{pet_id} ('{pet.pet_name}')",
        "report_id": report_id,
        "pet_id": pet_id
    }


@router.post("/{report_id}/claim", response_model=ReportResponse)
def claim_report(report_id: int, claim_in: ReportClaimRequest, req: Request, db: Session = Depends(get_db)):
    """Claim ownership of an unassigned report by a subdivision officer with atomic concurrency check."""
    # 1. Fetch claiming officer
    user = db.query(User).filter(User.user_id == claim_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role_id not in [2, 4]:
        raise HTTPException(status_code=403, detail="Only Subdivision Leaders / Officers are authorized to claim reports.")

    # 2. Fetch report with locking
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # 3. Check subdivision match
    if user.role_id == 2 and user.subdivision_id and report.subdivision_id:
        if user.subdivision_id != report.subdivision_id:
            raise HTTPException(status_code=403, detail="You can only claim reports within your assigned subdivision.")

    # 4. Atomic Concurrency Check
    if report.assigned_leader_id is not None:
        if report.assigned_leader_id == user.user_id:
            rep_data = ReportResponse.model_validate(report)
            rep_data.status_id = report.current_status_id
            rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
            rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
            populate_handler_info(rep_data, report)
            populate_pet_and_owner_info(rep_data, report, db)
            return rep_data

        current_handler_name = report.assigned_leader.name if report.assigned_leader else f"Officer #{report.assigned_leader_id}"
        raise HTTPException(
            status_code=409,
            detail=f"This report has already been claimed by {current_handler_name}."
        )

    # 5. Assign handler
    from datetime import datetime
    now = datetime.now()
    report.assigned_leader_id = user.user_id
    report.claimed_at = now

    prev_status = report.current_status_id
    # Transition 'Reported' (1) to 'Verified' / Under Review (2)
    if report.current_status_id == 1:
        report.current_status_id = 2

    # 6. Record in StatusHistory
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} claimed the report and is now handling the case."
    )
    db.add(status_hist)

    # 7. Record in AuditLog
    log_activity(
        db=db,
        action="CLAIM_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} claimed report #{report.report_id}",
        user_id=user.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": None, "status_id": prev_status},
        new_values={"assigned_leader_id": user.user_id, "status_id": report.current_status_id},
        request=req
    )

    # 8. Notify other subdivision officers
    if report.subdivision_id:
        try:
            colleagues = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2,
                User.user_id != user.user_id
            ).all()
            for col in colleagues:
                notif = Notification(
                    user_id=col.user_id,
                    title=f"Report #{report.report_id} Claimed",
                    message=f"Officer {user.name} has claimed Report #{report.report_id} and is now handling it.",
                    type="report_claimed",
                    related_id=report.report_id
                )
                db.add(notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create claim notification: {notif_err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/take-over", response_model=ReportResponse)
def takeover_report(report_id: int, takeover_in: ReportTakeoverRequest, req: Request, db: Session = Depends(get_db)):
    """Take over handling of a report from another officer with reason tracking."""
    # 1. Fetch new handler
    new_officer = db.query(User).filter(User.user_id == takeover_in.user_id).first()
    if not new_officer:
        raise HTTPException(status_code=404, detail="User not found")

    if new_officer.role_id not in [2, 4]:
        raise HTTPException(status_code=403, detail="Only Subdivision Leaders / Officers are authorized to take over reports.")

    # 2. Fetch report with locking
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if new_officer.role_id == 2 and new_officer.subdivision_id and report.subdivision_id:
        if new_officer.subdivision_id != report.subdivision_id:
            raise HTTPException(status_code=403, detail="You can only take over reports within your assigned subdivision.")

    prev_handler_id = report.assigned_leader_id
    prev_handler_name = report.assigned_leader.name if report.assigned_leader else (f"Officer #{prev_handler_id}" if prev_handler_id else "Unassigned")

    if prev_handler_id == new_officer.user_id:
        rep_data = ReportResponse.model_validate(report)
        rep_data.status_id = report.current_status_id
        rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
        rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
        populate_handler_info(rep_data, report)
        populate_pet_and_owner_info(rep_data, report, db)
        return rep_data

    # Check inactivity / response window for non-admins
    from datetime import datetime, timedelta
    now = datetime.now()

    if new_officer.role_id != 4 and prev_handler_id:
        priority = (report.priority_level or "").lower()
        is_urgent = any(kw in priority for kw in ["emergency", "high", "urgent", "bite", "severe"])
        hours_threshold = 2 if is_urgent else 24

        latest_activity = report.claimed_at or report.created_at or now
        if report.history:
            for hist in report.history:
                if hist.created_at and hist.created_at > latest_activity:
                    latest_activity = hist.created_at

        locked_until = latest_activity + timedelta(hours=hours_threshold)
        if now < locked_until:
            rem_seconds = int((locked_until - now).total_seconds())
            hrs = rem_seconds // 3600
            mins = (rem_seconds % 3600) // 60
            time_str = f"{hrs}h {mins}m" if hrs > 0 else f"{mins}m"
            raise HTTPException(
                status_code=400,
                detail=f"Takeover is currently locked. The assigned handler is within the active response window ({time_str} remaining). Takeover will unlock if no progress is made after {hours_threshold} hours of inactivity."
            )

    # 3. Update handler
    report.assigned_leader_id = new_officer.user_id
    report.claimed_at = now

    # 4. Record takeover in StatusHistory
    reason_text = takeover_in.reason.strip() if takeover_in.reason else "Workload reassignment"
    notes_text = f" (Notes: {takeover_in.notes.strip()})" if takeover_in.notes and takeover_in.notes.strip() else ""
    history_remarks = f"Officer {new_officer.name} took over the report from {prev_handler_name}. Reason: {reason_text}{notes_text}"

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=new_officer.user_id,
        remarks=history_remarks
    )
    db.add(status_hist)

    # 5. Record in AuditLog
    log_activity(
        db=db,
        action="TAKEOVER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {new_officer.name} took over report #{report.report_id} from {prev_handler_name}. Reason: {reason_text}",
        user_id=new_officer.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": prev_handler_id, "handler_name": prev_handler_name},
        new_values={"assigned_leader_id": new_officer.user_id, "handler_name": new_officer.name, "reason": reason_text, "notes": takeover_in.notes},
        request=req
    )

    # 6. Notify previous handler
    if prev_handler_id and prev_handler_id != new_officer.user_id:
        try:
            prev_notif = Notification(
                user_id=prev_handler_id,
                title=f"Report #{report.report_id} Handover",
                message=f"Officer {new_officer.name} has taken over Report #{report.report_id}. Reason: {reason_text}.",
                type="report_takeover",
                related_id=report.report_id
            )
            db.add(prev_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify previous handler: {notif_err}")

    # 7. Notify other subdivision colleagues
    if report.subdivision_id:
        try:
            colleagues = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2,
                User.user_id.notin_([new_officer.user_id, prev_handler_id] if prev_handler_id else [new_officer.user_id])
            ).all()
            for col in colleagues:
                col_notif = Notification(
                    user_id=col.user_id,
                    title=f"Report #{report.report_id} Handover",
                    message=f"Officer {new_officer.name} took over Report #{report.report_id} from {prev_handler_name}.",
                    type="report_takeover",
                    related_id=report.report_id
                )
                db.add(col_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify colleagues: {notif_err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/unclaim", response_model=ReportResponse)
def unclaim_report(report_id: int, unclaim_in: ReportClaimRequest, req: Request, db: Session = Depends(get_db)):
    """Release a claimed report back to the unassigned queue."""
    user = db.query(User).filter(User.user_id == unclaim_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.assigned_leader_id != user.user_id and user.role_id != 4:
        raise HTTPException(status_code=403, detail="You can only unclaim reports assigned to yourself.")

    report.assigned_leader_id = None
    report.claimed_at = None

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} released this report back to the unassigned queue."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="UNCLAIM_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} released report #{report.report_id} back to unassigned queue",
        user_id=user.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": user.user_id},
        new_values={"assigned_leader_id": None},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# REPORT TRANSFER WORKFLOW ENDPOINTS (Between Subdivision Officers)
# ==============================================================================

@router.post("/{report_id}/transfer/request", response_model=ReportResponse)
def request_transfer_report(report_id: int, transfer_in: ReportTransferRequest, req: Request, db: Session = Depends(get_db)):
    """Initiate a transfer request from the current handler to another subdivision leader."""
    sender = db.query(User).filter(User.user_id == transfer_in.user_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender user not found")

    target = db.query(User).filter(User.user_id == transfer_in.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target officer not found")

    if target.role_id not in [2, 4]:
        raise HTTPException(status_code=400, detail="Transfers can only be proposed to Subdivision Leaders / Officers.")

    if sender.user_id == target.user_id:
        raise HTTPException(status_code=400, detail="You cannot transfer a report to yourself.")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.assigned_leader_id != sender.user_id and sender.role_id != 4:
        raise HTTPException(status_code=403, detail="Only the currently assigned handler can transfer this report.")

    if target.role_id == 2 and report.subdivision_id and target.subdivision_id:
        if target.subdivision_id != report.subdivision_id:
            raise HTTPException(status_code=400, detail="Target officer must be assigned to the same subdivision.")

    from datetime import datetime
    now = datetime.now()
    notes_clean = transfer_in.notes.strip() if transfer_in.notes else None

    report.pending_transfer_to_id = target.user_id
    report.pending_transfer_from_id = sender.user_id
    report.pending_transfer_notes = notes_clean
    report.pending_transfer_created_at = now

    notes_str = f" Reason/Notes: '{notes_clean}'" if notes_clean else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=sender.user_id,
        remarks=f"Officer {sender.name} initiated a case transfer request to Officer {target.name}.{notes_str}"
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="REQUEST_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {sender.name} requested to transfer report #{report.report_id} to Officer {target.name}",
        user_id=sender.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": sender.user_id},
        new_values={"pending_transfer_to_id": target.user_id, "notes": notes_clean},
        request=req
    )

    # Notify target officer
    try:
        notif = Notification(
            user_id=target.user_id,
            title=f"🔄 Transfer Request: Report #{report.report_id}",
            message=f"Officer {sender.name} requested to transfer Report #{report.report_id} to you.{f' Notes: {notes_clean}' if notes_clean else ''}",
            type="report_transfer_request",
            related_id=report.report_id
        )
        db.add(notif)
    except Exception as err:
        print(f"Notice: Failed to create transfer notification: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/accept", response_model=ReportResponse)
def accept_transfer_report(report_id: int, action_in: ReportTransferActionRequest, req: Request, db: Session = Depends(get_db)):
    """Accept an incoming transfer request and assume primary handling of the report."""
    recipient = db.query(User).filter(User.user_id == action_in.user_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.pending_transfer_to_id != recipient.user_id and recipient.role_id != 4:
        raise HTTPException(status_code=403, detail="You are not the designated recipient of this transfer request.")

    prev_sender_id = report.pending_transfer_from_id
    prev_sender = report.pending_transfer_from
    sender_name = prev_sender.name if prev_sender else (f"Officer #{prev_sender_id}" if prev_sender_id else "Previous Handler")

    from datetime import datetime
    now = datetime.now()

    # Reassign handler
    report.assigned_leader_id = recipient.user_id
    report.claimed_at = now

    # Clear pending transfer fields
    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    # Record in StatusHistory with explicit wording required by user
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=recipient.user_id,
        remarks=f"{sender_name} transferred report to {recipient.name}. This report is now being handled by {recipient.name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="ACCEPT_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {recipient.name} accepted transfer of report #{report.report_id} from {sender_name}",
        user_id=recipient.user_id,
        log_type="operation",
        old_values={"assigned_leader_id": prev_sender_id},
        new_values={"assigned_leader_id": recipient.user_id},
        request=req
    )

    # Notify original sender
    if prev_sender_id and prev_sender_id != recipient.user_id:
        try:
            notif = Notification(
                user_id=prev_sender_id,
                title=f"✅ Transfer Accepted: Report #{report.report_id}",
                message=f"Officer {recipient.name} ACCEPTED your transfer request for Report #{report.report_id}. The report is now assigned to {recipient.name}.",
                type="report_transfer_accepted",
                related_id=report.report_id
            )
            db.add(notif)
        except Exception as err:
            print(f"Notice: Failed to notify sender of acceptance: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/reject", response_model=ReportResponse)
def reject_transfer_report(report_id: int, reject_in: ReportTransferRejectRequest, req: Request, db: Session = Depends(get_db)):
    """Decline an incoming transfer request with reason, keeping the original handler responsible."""
    recipient = db.query(User).filter(User.user_id == reject_in.user_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.pending_transfer_to_id != recipient.user_id and recipient.role_id != 4:
        raise HTTPException(status_code=403, detail="You are not the designated recipient of this transfer request.")

    prev_sender_id = report.pending_transfer_from_id
    prev_sender = report.pending_transfer_from
    sender_name = prev_sender.name if prev_sender else (f"Officer #{prev_sender_id}" if prev_sender_id else "Current Handler")

    rejection_reason = reject_in.reason.strip() if reject_in.reason else None

    # Clear pending transfer fields, keep original handler
    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    reason_str = f" Reason: '{rejection_reason}'." if rejection_reason else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=recipient.user_id,
        remarks=f"Officer {recipient.name} declined the case transfer request from {sender_name}.{reason_str} Report remains handled by {sender_name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="REJECT_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {recipient.name} declined transfer of report #{report.report_id} from {sender_name}. Reason: {rejection_reason}",
        user_id=recipient.user_id,
        log_type="operation",
        old_values={"pending_transfer_to_id": recipient.user_id},
        new_values={"pending_transfer_to_id": None, "rejection_reason": rejection_reason},
        request=req
    )

    # Notify sender that transfer was rejected and they remain responsible
    if prev_sender_id:
        try:
            reason_msg = f" Reason: '{rejection_reason}'." if rejection_reason else ""
            notif = Notification(
                user_id=prev_sender_id,
                title=f"❌ Transfer Declined: Report #{report.report_id}",
                message=f"Officer {recipient.name} DECLINED your transfer request for Report #{report.report_id}.{reason_msg} You remain responsible for this report.",
                type="report_transfer_rejected",
                related_id=report.report_id
            )
            db.add(notif)
        except Exception as err:
            print(f"Notice: Failed to notify sender of rejection: {err}")

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/transfer/cancel", response_model=ReportResponse)
def cancel_transfer_report(report_id: int, action_in: ReportTransferActionRequest, req: Request, db: Session = Depends(get_db)):
    """Withdraw/cancel a pending transfer request before it is accepted."""
    user = db.query(User).filter(User.user_id == action_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.pending_transfer_to),
        joinedload(Report.pending_transfer_from),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).with_for_update().first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.pending_transfer_from_id != user.user_id and user.role_id != 4:
        raise HTTPException(status_code=403, detail="You can only cancel transfer requests you initiated.")

    target_id = report.pending_transfer_to_id
    target_name = report.pending_transfer_to.name if report.pending_transfer_to else (f"Officer #{target_id}" if target_id else "colleague")

    report.pending_transfer_to_id = None
    report.pending_transfer_from_id = None
    report.pending_transfer_notes = None
    report.pending_transfer_created_at = None

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=report.current_status_id,
        updated_by=user.user_id,
        remarks=f"Officer {user.name} withdrew the pending case transfer request to {target_name}."
    )
    db.add(status_hist)

    log_activity(
        db=db,
        action="CANCEL_TRANSFER_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} cancelled transfer request for report #{report.report_id}",
        user_id=user.user_id,
        log_type="operation",
        old_values={"pending_transfer_to_id": target_id},
        new_values={"pending_transfer_to_id": None},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None

    if report.history:
        for i, hist in enumerate(report.history):
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = get_hist_updater_name(hist, report)
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# FALSE REPORT DISMISSAL & ON-SITE VERIFICATION ENDPOINTS
# ==============================================================================

@router.post("/{report_id}/verify-incident", response_model=ReportResponse)
def verify_incident_report(report_id: int, verify_in: ReportVerifyRequest, req: Request, db: Session = Depends(get_db)):
    """Mark an incident report as officially verified on-site after field inspection."""
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    user = db.query(User).filter(User.user_id == verify_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from datetime import datetime
    now = datetime.now()

    report.current_status_id = 2  # Verified
    report.verification_status = 'verified_true'
    report.verification_notes = verify_in.notes or "Physical on-site inspection confirmed the reported incident."
    report.verified_by_user_id = user.user_id
    report.verified_at = now
    report.verified_actual_bite = bool(verify_in.verified_actual_bite)
    report.verified_chasing = bool(verify_in.verified_chasing)
    report.verified_attempted_bite = bool(verify_in.verified_attempted_bite)
    report.verified_injury = bool(verify_in.verified_injury)
    report.verified_aggressive = bool(verify_in.verified_aggressive)
    report.behavior_finding = verify_in.behavior_finding or (
        "Substantiated" if (verify_in.verified_actual_bite or verify_in.verified_aggressive) else "Unsubstantiated / Friendly"
    )

    finding_str = f" [Finding: {report.behavior_finding}]" if report.behavior_finding else ""
    notes_txt = f" Notes: {verify_in.notes}" if verify_in.notes else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=2,
        updated_by=user.user_id,
        remarks=f"Official on-site investigation confirmed by Officer {user.name}.{finding_str}{notes_txt}"
    )
    db.add(status_hist)

    # Sync Pet Behavioral Profile if this report is linked to a registered pet
    if report.pet_id:
        db.flush()
        pet = db.query(Pet).filter(Pet.pet_id == report.pet_id).first()
        if pet:
            has_verified_bites = db.query(Report).filter(
                Report.pet_id == pet.pet_id,
                Report.verification_status == 'verified_true',
                Report.verified_actual_bite == True
            ).count() > 0

            bite_count = db.query(Report).filter(
                Report.pet_id == pet.pet_id,
                Report.verification_status == 'verified_true',
                Report.verified_actual_bite == True
            ).count()

            chase_count = db.query(Report).filter(
                Report.pet_id == pet.pet_id,
                Report.verification_status == 'verified_true',
                Report.verified_chasing == True
            ).count()

            has_verified_aggression = db.query(Report).filter(
                Report.pet_id == pet.pet_id,
                Report.verification_status == 'verified_true',
                Report.verified_aggressive == True
            ).count() > 0

            pet.has_bite_history = (bite_count > 0)
            pet.bite_incident_count = bite_count
            pet.chase_behavior = (chase_count > 0)
            pet.chase_incident_count = chase_count
            if has_verified_aggression or (bite_count > 0):
                pet.temperament = 'Aggressive'
            else:
                pet.temperament = 'Friendly'

    # Notify reporter
    if report.user_id and report.user_id != user.user_id:
        notif = Notification(
            user_id=report.user_id,
            title=f"Report #{report.report_id} Verified",
            message=f"Your report #{report.report_id} was verified on-site by Subdivision Officer {user.name} ({report.behavior_finding}).",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif)

    log_activity(
        db=db,
        action="VERIFY_REPORT",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} verified report #{report.report_id} on-site ({report.behavior_finding})",
        user_id=user.user_id,
        log_type="operation",
        old_values={"verification_status": "unverified", "status_id": report.current_status_id},
        new_values={
            "verification_status": "verified_true",
            "status_id": 2,
            "behavior_finding": report.behavior_finding,
            "verified_actual_bite": report.verified_actual_bite,
            "verified_chasing": report.verified_chasing,
            "verified_aggressive": report.verified_aggressive,
            "notes": verify_in.notes
        },
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


@router.post("/{report_id}/mark-false-alarm", response_model=ReportResponse)
def mark_report_false_alarm(report_id: int, false_in: ReportFalseAlarmRequest, req: Request, db: Session = Depends(get_db)):
    """Dismiss a report as a false alarm / invalid claim with documented investigation findings."""
    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    user = db.query(User).filter(User.user_id == false_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from datetime import datetime
    now = datetime.now()

    report.current_status_id = 14  # False Alarm / Dismissed
    report.verification_status = 'false_alarm'
    report.false_alarm_reason = false_in.reason
    report.verification_notes = false_in.notes or f"Investigation concluded report is invalid: {false_in.reason}"
    report.verified_by_user_id = user.user_id
    report.verified_at = now

    notes_snippet = f" | Notes: {false_in.notes}" if false_in.notes else ""
    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=14,
        updated_by=user.user_id,
        remarks=f"Report dismissed as False Alarm / Invalid. Reason: {false_in.reason}{notes_snippet}"
    )
    db.add(status_hist)

    # Notify reporter about the dismissal
    if report.user_id and report.user_id != user.user_id:
        notif = Notification(
            user_id=report.user_id,
            title=f"Report #{report.report_id} Dismissed",
            message=f"Your report #{report.report_id} was reviewed and dismissed by Subdivision Officer {user.name} ({false_in.reason}).",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif)

    log_activity(
        db=db,
        action="DISMISS_FALSE_ALARM",
        target_table="reports",
        target_id=report.report_id,
        description=f"Officer {user.name} dismissed report #{report.report_id} as false alarm ({false_in.reason})",
        user_id=user.user_id,
        log_type="operation",
        old_values={"verification_status": "unverified", "status_id": report.current_status_id},
        new_values={"verification_status": "false_alarm", "status_id": 14, "reason": false_in.reason, "notes": false_in.notes},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data


# ==============================================================================
# PET OWNER DISPUTE ENDPOINTS
# ==============================================================================

@router.post("/{report_id}/disputes", response_model=ReportDisputeResponse)
async def create_report_dispute(
    report_id: int,
    req: Request,
    resident_user_id: int = Form(...),
    dispute_reason: str = Form(...),
    pet_id: Optional[int] = Form(None),
    vaccination_card: Optional[UploadFile] = File(None),
    supporting_photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Lodge a formal dispute against a report targeting a resident's pet, uploading vaccination card and home confinement photos."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    resident = db.query(User).filter(User.user_id == resident_user_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident user not found")

    vaccine_url = None
    if vaccination_card and vaccination_card.filename:
        v_content = await vaccination_card.read()
        v_ext = os.path.splitext(vaccination_card.filename)[1] or ".jpg"
        v_name = f"dispute_vax_{uuid.uuid4()}{v_ext}"
        vaccine_url = upload_to_cloudinary(v_content, filename=v_name)

    photo_url = None
    if supporting_photo and supporting_photo.filename:
        p_content = await supporting_photo.read()
        p_ext = os.path.splitext(supporting_photo.filename)[1] or ".jpg"
        p_name = f"dispute_proof_{uuid.uuid4()}{p_ext}"
        photo_url = upload_to_cloudinary(p_content, filename=p_name)

    # Check if a pending dispute already exists for this user/report
    existing_dispute = db.query(ReportDispute).filter(
        ReportDispute.report_id == report_id,
        ReportDispute.resident_user_id == resident_user_id,
        ReportDispute.status == "Pending"
    ).first()

    if existing_dispute:
        # Update existing pending dispute
        existing_dispute.dispute_reason = dispute_reason
        if pet_id:
            existing_dispute.pet_id = pet_id
        if vaccine_url:
            existing_dispute.vaccination_card_url = vaccine_url
        if photo_url:
            existing_dispute.supporting_photo_url = photo_url
        dispute_record = existing_dispute
    else:
        dispute_record = ReportDispute(
            report_id=report_id,
            resident_user_id=resident_user_id,
            pet_id=pet_id,
            dispute_reason=dispute_reason,
            vaccination_card_url=vaccine_url,
            supporting_photo_url=photo_url,
            status="Pending"
        )
        db.add(dispute_record)

    # Update report status to Disputed
    report.current_status_id = 15  # Disputed
    report.verification_status = 'disputed'

    status_hist = StatusHistory(
        report_id=report.report_id,
        report_status_id=15,
        updated_by=resident.user_id,
        remarks=f"Formal dispute lodged by resident {resident.name}. Animal control operations paused pending verification of vaccination certificate."
    )
    db.add(status_hist)

    # Notify Subdivision Leader(s)
    if report.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for l in leaders:
                d_notif = Notification(
                    user_id=l.user_id,
                    title=f"Dispute Lodged: Report #{report.report_id}",
                    message=f"Resident {resident.name} has formally disputed Report #{report.report_id} with proof of vaccination.",
                    type="alert",
                    related_id=report.report_id
                )
                db.add(d_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to notify leaders about dispute: {notif_err}")

    log_activity(
        db=db,
        action="LODGE_DISPUTE",
        target_table="report_disputes",
        target_id=report.report_id,
        description=f"Resident {resident.name} lodged dispute against report #{report.report_id}",
        user_id=resident.user_id,
        log_type="operation",
        new_values={"report_id": report.report_id, "reason": dispute_reason},
        request=req
    )

    db.commit()
    db.refresh(dispute_record)

    return ReportDisputeResponse(
        dispute_id=dispute_record.dispute_id,
        report_id=dispute_record.report_id,
        resident_user_id=dispute_record.resident_user_id,
        pet_id=dispute_record.pet_id,
        dispute_reason=dispute_record.dispute_reason,
        vaccination_card_url=dispute_record.vaccination_card_url,
        supporting_photo_url=dispute_record.supporting_photo_url,
        status=dispute_record.status,
        reviewer_id=dispute_record.reviewer_id,
        reviewer_notes=dispute_record.reviewer_notes,
        created_at=dispute_record.created_at,
        resolved_at=dispute_record.resolved_at,
        resident_name=resident.name,
        pet_name=dispute_record.pet.pet_name if dispute_record.pet else None,
        reviewer_name=None
    )


@router.get("/{report_id}/disputes", response_model=List[ReportDisputeResponse])
def get_report_disputes(report_id: int, db: Session = Depends(get_db)):
    """Fetch all disputes lodged for a specific report."""
    disputes = db.query(ReportDispute).options(
        joinedload(ReportDispute.resident),
        joinedload(ReportDispute.reviewer),
        joinedload(ReportDispute.pet)
    ).filter(ReportDispute.report_id == report_id).order_by(ReportDispute.created_at.desc()).all()

    return [
        ReportDisputeResponse(
            dispute_id=d.dispute_id,
            report_id=d.report_id,
            resident_user_id=d.resident_user_id,
            pet_id=d.pet_id,
            dispute_reason=d.dispute_reason,
            vaccination_card_url=d.vaccination_card_url,
            supporting_photo_url=d.supporting_photo_url,
            status=d.status,
            reviewer_id=d.reviewer_id,
            reviewer_notes=d.reviewer_notes,
            created_at=d.created_at,
            resolved_at=d.resolved_at,
            resident_name=d.resident.name if d.resident else None,
            pet_name=d.pet.pet_name if d.pet else None,
            reviewer_name=d.reviewer.name if d.reviewer else None
        )
        for d in disputes
    ]


@router.patch("/{report_id}/disputes/{dispute_id}/review", response_model=ReportResponse)
def review_report_dispute(
    report_id: int,
    dispute_id: int,
    review_in: ReportDisputeReviewRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """Staff review of a citizen dispute (Accept and dismiss false alarm, or Reject)."""
    dispute = db.query(ReportDispute).filter(
        ReportDispute.dispute_id == dispute_id,
        ReportDispute.report_id == report_id
    ).first()

    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute record not found")

    report = db.query(Report).options(
        joinedload(Report.assigned_leader),
        joinedload(Report.reporter),
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    reviewer = db.query(User).filter(User.user_id == review_in.reviewer_id).first()
    if not reviewer:
        raise HTTPException(status_code=404, detail="Reviewer not found")

    from datetime import datetime
    now = datetime.now()

    dispute.status = review_in.status
    dispute.reviewer_id = reviewer.user_id
    dispute.reviewer_notes = review_in.reviewer_notes
    dispute.resolved_at = now

    if review_in.status == "Accepted":
        # Owner dispute accepted -> Mark report as False Alarm / Dismissed
        report.current_status_id = 14  # False Alarm / Dismissed
        report.verification_status = 'false_alarm'
        report.false_alarm_reason = 'Pet Safely Owned / False Accusation'
        report.verification_notes = f"Owner dispute verified and accepted by Officer {reviewer.name}: {review_in.reviewer_notes or 'Vaccination & ownership verified'}"
        report.verified_by_user_id = reviewer.user_id
        report.verified_at = now

        status_hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=14,
            updated_by=reviewer.user_id,
            remarks=f"Resident dispute approved by Officer {reviewer.name}. Vaccination proof verified. Report dismissed as False Alarm."
        )
        db.add(status_hist)

        # Notify resident pet owner
        notif_owner = Notification(
            user_id=dispute.resident_user_id,
            title="Dispute Approved: Pet Cleared",
            message=f"Your dispute for Report #{report.report_id} has been APPROVED by Officer {reviewer.name}. The report is dismissed.",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif_owner)

    else:
        # Dispute rejected -> Restore to Under Investigation / Reported
        report.current_status_id = 16  # Under Investigation
        report.verification_status = 'unverified'
        report.verification_notes = f"Dispute rejected by Officer {reviewer.name}: {review_in.reviewer_notes or 'Evidence insufficient'}"

        status_hist = StatusHistory(
            report_id=report.report_id,
            report_status_id=16,
            updated_by=reviewer.user_id,
            remarks=f"Resident dispute rejected by Officer {reviewer.name}. Protocol and field verification continue."
        )
        db.add(status_hist)

        # Notify resident pet owner
        notif_owner = Notification(
            user_id=dispute.resident_user_id,
            title="Dispute Review Update",
            message=f"Your dispute for Report #{report.report_id} was reviewed and not accepted. Notes: {review_in.reviewer_notes or 'Please consult subdivision office.'}",
            type="status_update",
            related_id=report.report_id
        )
        db.add(notif_owner)

    log_activity(
        db=db,
        action="REVIEW_DISPUTE",
        target_table="report_disputes",
        target_id=dispute.dispute_id,
        description=f"Officer {reviewer.name} reviewed dispute #{dispute.dispute_id} ({review_in.status})",
        user_id=reviewer.user_id,
        log_type="operation",
        new_values={"dispute_id": dispute.dispute_id, "status": review_in.status, "notes": review_in.reviewer_notes},
        request=req
    )

    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    populate_handler_info(rep_data, report)
    populate_pet_and_owner_info(rep_data, report, db)
    populate_verification_and_disputes(rep_data, report, db)
    return rep_data

