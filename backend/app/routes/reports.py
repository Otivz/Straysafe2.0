from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import os
import uuid
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional
from app.database import get_db
from app.models.report import Report, ReportMedia, Comment, StatusHistory
from app.models.user import User, Subdivision
from app.models.notification import Notification
from app.schemas.report import ReportCreate, ReportResponse, ReportStatusUpdate, ReportUpdate, ReportMediaResponse, CommentCreate, CommentResponse
from app.utils.cloudinary_config import upload_to_cloudinary

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
        selectinload(Report.history).selectinload(StatusHistory.media)
    ).all()
    results = []
    for rep in reports:
        try:
            rep_data = ReportResponse.model_validate(rep)
            # Map current_status_id → status_id for frontend compatibility
            rep_data.status_id = rep.current_status_id  # type: ignore[assignment]
            rep_data.reporter_name = rep.reporter.name if rep.reporter else "Unknown User"
            rep_data.reporter_photo = rep.reporter.profile_picture if rep.reporter else None
            
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
            print(f"Error validating report {rep.report_id}: {e}")
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

@router.post("/", response_model=ReportResponse)
def create_report(report_in: ReportCreate, db: Session = Depends(get_db)):
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

        db_report = Report(**report_data)
        db.add(db_report)
        db.flush()  # Get report_id before committing

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
            message=f"Your report #{db_report.report_id} has been submitted and is pending verification.",
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
        return rep_data
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()
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
        if media_type == 'Image':
            try:
                from ultralytics import YOLO
                import tempfile
                # Save image to a temp file for YOLOv8
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as tmp_img:
                    tmp_img.write(file_content)
                    tmp_img_path = tmp_img.name
                model = YOLO('yolov8n.pt')  # Use the nano model or your custom model
                results = model(tmp_img_path)
                # Parse results for dog/cat
                detected = set()
                for r in results:
                    for c in r.boxes.cls:
                        label = r.names[int(c)]
                        if label.lower() == 'dog':
                            detected.add('Dog')
                        elif label.lower() == 'cat':
                            detected.add('Cat')
                if 'Dog' in detected:
                    animal_type = 'Dog'
                elif 'Cat' in detected:
                    animal_type = 'Cat'
                else:
                    animal_type = 'Unknown'
            except Exception as e:
                print(f"YOLOv8 error: {e}")
                animal_type = 'Unknown'
        
        db_media = ReportMedia(
            report_id=report_id,
            history_id=history_id,
            status_id=status_id,
            is_evidence=is_evidence,
            file_url=file_url,
            media_type=media_type,
            animal_type=animal_type
        )
        db.add(db_media)
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
def update_report_status(report_id: int, status_update: ReportStatusUpdate, db: Session = Depends(get_db)):
    report = db.query(Report).options(
        selectinload(Report.history)
    ).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Update current_status_id (DB column name)
    report.current_status_id = status_update.status_id

    # Use either remarks or status_remarks
    final_remarks = status_update.remarks or status_update.status_remarks

    # Create status history entry using DB column names
    db_history = StatusHistory(
        report_id=report_id,
        report_status_id=status_update.status_id,
        updated_by=status_update.user_id,  # Link the update to the user
        remarks=final_remarks
    )
    db.add(db_history)
    
    db.commit()
    db.refresh(report)

    rep_data = ReportResponse.model_validate(report)
    rep_data.status_id = report.current_status_id  # type: ignore[assignment]
    rep_data.reporter_name = report.reporter.name if report.reporter else "Unknown User"
    rep_data.reporter_photo = report.reporter.profile_picture if report.reporter else None
    
    # Populate updater names for history entries in the response
    if report.history:
        for i, hist in enumerate(report.history):  # type: ignore[arg-type]
            if rep_data.history and i < len(rep_data.history):
                rep_data.history[i].updater_name = hist.updater.name if hist.updater else "System"
                rep_data.history[i].updater_photo = hist.updater.profile_picture if hist.updater else None
                
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
        new_notif = Notification(
            user_id=report.user_id,
            title="New Comment on Your Report",
            message=f"{commenter_name} commented on your report #{report.report_id}: \"{db_comment.comment[:50]}{'...' if len(db_comment.comment) > 50 else ''}\"",
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
