from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
import os
import uuid
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional
from app.database import get_db
from app.models.report import Report, ReportMedia, Comment, StatusHistory, ReportCategory, EndorsementLetter
from app.models.user import User, Subdivision
from app.models.notification import Notification
from app.schemas.report import ReportCreate, ReportResponse, ReportStatusUpdate, ReportUpdate, ReportMediaResponse, CommentCreate, CommentResponse
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.color_detection import extract_dominant_colors
from app.utils.audit import log_activity

router = APIRouter(
    prefix="/reports",
    tags=["reports"]
)


@router.get("/", response_model=List[ReportResponse])
def get_reports(subdivision_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Report)
    if subdivision_id is not None:
        query = query.filter(Report.subdivision_id == subdivision_id)

    reports = query.options(
        joinedload(Report.reporter),
        joinedload(Report.category),
        joinedload(Report.status),
        joinedload(Report.subdivision),
        selectinload(Report.media),
        selectinload(Report.comments).joinedload(Comment.user),
        selectinload(Report.history).joinedload(StatusHistory.updater),
        selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).all()
    
    for rep in reports:
        if rep.endorsement_letter:
            let = rep.endorsement_letter
            if let.leader:
                let.leader_name = let.leader.name
                if let.leader.position:
                    let.leader_position = let.leader.position.position_name
                    
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
                        rep_data.history[i].updater_name = hist.updater.name if hist.updater else "System"
                        rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

            if rep.comments:
                for i, comment in enumerate(rep.comments):  # type: ignore[arg-type]
                    if rep_data.comments and i < len(rep_data.comments):
                        rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                        rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None
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

def is_inside_selera_homes(lat: float, lng: float) -> bool:
    """Ray-casting algorithm to check if a point is inside a polygon."""
    n = len(SELERA_POLYGON)
    inside = False
    p1x, p1y = SELERA_POLYGON[0]
    for i in range(n + 1):
        p2x, p2y = SELERA_POLYGON[i % n]
        if lat > min(p1x, p2x):
            if lat <= max(p1x, p2x):
                if lng <= max(p1y, p2y):
                    xints = 0.0
                    if p1x != p2x:
                        xints = (lat - p1x) * (p2y - p1y) / (p2x - p1x) + p1y
                    if p1y == p2y or lng <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


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

    # First, validate each uploaded image using YOLOv8
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
                img = Image.open(io.BytesIO(content))
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

            try:
                model = YOLO('yolov8n.pt')
                results = model(tmp_path)
                
                animal_count = 0
                for r in results:
                    for c in r.boxes.cls:
                        label = r.names[int(c)]
                        if label.lower() in ['dog', 'cat']:
                            animal_count += 1
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            if animal_count == 0:
                return {
                    "valid": False,
                    "error_type": "no_animal",
                    "message": "No animal was detected in one or more uploaded images. Please upload a valid animal image."
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
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "valid": False,
                "error_type": "inconclusive",
                "message": "The system could not confidently determine whether the uploaded images belong to the same animal. Please review your uploaded images before submitting."
            }

        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")

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

            response = model.generate_content(
                content_to_send,
                generation_config={"response_mime_type": "application/json"}
            )

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

        # Map frontend "status_id" → DB "current_status_id"
        report_data["current_status_id"] = report_data.pop("status_id", 1)

        # Drop any frontend-only fields not in the DB (condition, behavior_tags, is_archived are not in reports table)
        for field in ["condition", "behavior_tags", "is_archived", "status_remarks"]:
            report_data.pop(field, None)

        # Auto-classify category if not provided by frontend (missing, None, or 0)
        if not report_data.get("category_id"):
            report_data["category_id"] = classify_category_from_description(report_data.get("description", ""))

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
        db_report.ai_estimated_size = suggestions["ai_estimated_size"]  # type: ignore
        db_report.ai_possible_breed = suggestions["ai_possible_breed"]  # type: ignore
        db_report.ai_suggested_risk_level = suggestions["ai_suggested_risk_level"]  # type: ignore
        db_report.ai_suggested_priority = suggestions["ai_suggested_priority"]  # type: ignore
        db_report.ai_suggested_priority_reason = suggestions.get("ai_suggested_priority_reason")  # type: ignore

        # Create initial history entry for status 1 (Reported)
        initial_history = StatusHistory(
            report_id=db_report.report_id,
            report_status_id=db_report.current_status_id,
            updated_by=db_report.user_id,
            remarks="Initial report submitted by resident."
        )
        db.add(initial_history)
        
        # Create Notification for Resident
        new_notif = Notification(
            user_id=db_report.user_id,
            title="Report Submitted Successfully",
            message="Your community incident report was successfully submitted. You will receive updates once the report has been reviewed and verified.",
            type="status_update",
            related_id=db_report.report_id
        )
        db.add(new_notif)
        
        db.commit()
        db.refresh(db_report)

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
        return rep_data
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).options(
        joinedload(Report.reporter),
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
                    rep_data.history[i].updater_name = hist.updater.name if hist.updater else "System"
                    rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

        if report.comments:
            for i, comment in enumerate(report.comments):  # type: ignore[arg-type]
                if rep_data.comments and i < len(rep_data.comments):
                    rep_data.comments[i].user_name = comment.user.name if comment.user else "Unknown User"
                    rep_data.comments[i].user_photo = comment.user.profile_picture if comment.user else None

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
    db.delete(report)
    db.commit()
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
    db_report = db.query(Report).filter(Report.report_id == report_id).first()
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
                        
                        if label.lower() == 'dog':
                            detected.add('Dog')
                            bboxes.append((bbox, 'Dog'))
                        elif label.lower() == 'cat':
                            detected.add('Cat')
                            bboxes.append((bbox, 'Cat'))
                
                # Determine animal type
                if 'Dog' in detected:
                    animal_type = 'Dog'
                elif 'Cat' in detected:
                    animal_type = 'Cat'
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
        selectinload(Report.history),
        joinedload(Report.endorsement_letter).joinedload(EndorsementLetter.leader).joinedload(User.position)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

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
                rep_data.history[i].updater_name = hist.updater.name if hist.updater else "System"
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None

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
