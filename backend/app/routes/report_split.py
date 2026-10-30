"""
Multi-animal reports: split a group report into per-animal records, view the group, undo a split, and replace an
animal's main photo with a close-up (MULTI_ANIMAL_REPORT_PLAN.md).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.pet_claim import PetClaim
from app.models.report import HoldingAnimal, Report, ReportMedia, ReportReturn, StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import Subdivision, User
from app.utils import report_split as rs
from app.utils.audit import log_activity
from app.utils.auth import get_current_user
from app.utils.uploads import validate_cloudinary_url

router = APIRouter(prefix="/reports", tags=["multi-animal reports"])

OPEN_MATCH_STATUSES = ("AI_SUGGESTED", "PENDING_VERIFICATION")
ANIMAL_TYPES = ("Dog", "Cat", "Unknown")
SIZES = ("Small", "Medium", "Large")
SEXES = ("Male", "Female", "Unknown")


class AnimalIn(BaseModel):
    photo_url: str = Field(..., min_length=10, max_length=500)
    animal_type: Optional[str] = None
    animal_color: Optional[str] = Field(None, max_length=255)
    animal_breed: Optional[str] = Field(None, max_length=100)
    estimated_size: Optional[str] = None
    sex: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)


class CarryOver(BaseModel):
    """Which new animal record (0-based position in `animals`) takes over what the group report already has."""
    holding: Optional[int] = None
    pet: Optional[int] = None
    claims: Optional[int] = None


class SplitRequest(BaseModel):
    client_token: str = Field(..., min_length=8, max_length=64)
    animals: List[AnimalIn]
    carry: CarryOver = CarryOver()


class CountNoteRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=300)


COUNT_NOTE_ACTION = "SPLIT_COUNT_CONFIRMED"


class ReplacePhotoRequest(BaseModel):
    photo_url: str = Field(..., min_length=10, max_length=500)
    note: Optional[str] = Field(None, max_length=500)


# ---------------------------------------------------------------------------------------------- helpers
def _closed_ids():
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS
    return CASE_CLOSED_STATUS_IDS


def _require_leader_of(user: User, report: Report) -> None:
    if user.role_id != 2 or not user.subdivision_id or user.subdivision_id != report.subdivision_id:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader of this report's subdivision can do this.")


def _can_replace_photo(db: Session, user: User, report: Report) -> bool:
    if user.role_id == 2:
        return bool(user.subdivision_id) and user.subdivision_id == report.subdivision_id
    if user.role_id == 3:
        subd = db.get(Subdivision, report.subdivision_id) if report.subdivision_id else None
        return bool(user.barangay_id) and subd is not None and subd.barangay_id == user.barangay_id
    return False


def _primary_photo(report: Report) -> Optional[str]:
    imgs = rs.primary_images(report)
    return imgs[0].file_url if imgs else None


def _child_card(db: Session, child: Report, position: int, total: int) -> dict:
    holding = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == child.report_id).first()
    return {
        "report_id": child.report_id,
        "label": f"Animal {position} of {total}",
        "animal_type": child.animal_type,
        "animal_color": child.animal_color,
        "estimated_size": child.estimated_size,
        "current_status_id": child.current_status_id,
        "status_name": child.status.status_name if getattr(child, "status", None) else None,
        "photo_url": _primary_photo(child),
        "pet_id": child.pet_id,
        "holding_id": holding.holding_id if holding else None,
        "facility_status": holding.facility_status if holding else None,
        "description": child.description,
    }


def group_payload(db: Session, report: Report) -> dict:
    parent = db.get(Report, report.split_from_report_id) if report.split_from_report_id else report
    children = rs.active_children(db, parent) if parent else []
    return {
        "report_id": report.report_id,
        "is_group": bool(children) and parent.report_id == report.report_id,
        "is_animal_record": bool(report.split_from_report_id),
        "label": rs.animal_label(db, report),
        "group": {
            "report_id": parent.report_id, "animal_count": parent.animal_count,
            "current_status_id": parent.current_status_id,
            "status_name": parent.status.status_name if getattr(parent, "status", None) else None,
            "photo_url": _primary_photo(parent),
        } if parent else None,
        "children": [_child_card(db, c, i + 1, len(children)) for i, c in enumerate(children)],
        "reported_count": parent.animal_count if parent else None,
        "recorded_count": len(children),
        "count_note": _count_note(db, parent, len(children)) if parent and children else None,
        "max_per_split": rs.MAX_PER_SPLIT,
        "max_animals": rs.MAX_ANIMALS_PER_GROUP,
    }


def _count_note(db: Session, parent: Report, recorded: int) -> Optional[dict]:
    """The leader's latest "fewer were found" note, while it still matches the number of animal records."""
    log = (db.query(AuditLog).filter(AuditLog.action == COUNT_NOTE_ACTION, AuditLog.target_id == parent.report_id)
           .order_by(AuditLog.log_id.desc()).first())
    v = (log.new_values or {}) if log else {}
    if not log or v.get("recorded") != recorded:
        return None   # more animals were recorded since: the note no longer applies
    by = db.get(User, log.user_id) if log.user_id else None
    return {"reason": v.get("reason"), "reported": v.get("reported"), "recorded": recorded,
            "by": by.name if by else None}


def _carry_items(db: Session, parent: Report) -> dict:
    holding = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == parent.report_id).first()
    confirmed = db.query(ReportMatch).filter(ReportMatch.source_report_id == parent.report_id,
                                              ReportMatch.status == "CONFIRMED_MATCH",
                                              ReportMatch.matched_pet_id.isnot(None)).all()
    claims = db.query(PetClaim).filter(PetClaim.report_id == parent.report_id, PetClaim.status != "Rejected").all()
    return {"holding": holding, "pet": bool(parent.pet_id or confirmed), "confirmed": confirmed, "claims": claims}


def _queue_ai(db: Session, report_id: int, media_id: int, url: str) -> None:
    """Analyse the new photo and re-run matching. Queued after commit; a queue failure never undoes the split."""
    try:
        from app.utils import ai_jobs
        ai_jobs.enqueue_media(db, report_id, media_id, url, None)
        ai_jobs.enqueue_follow_up(report_id, db=db)
    except Exception as e:  # pragma: no cover - logged, the records are already saved
        print(f"Notice: AI queue for report #{report_id} failed: {e}")


# ---------------------------------------------------------------------------------------------- endpoints
@router.get("/{report_id}/split-group")
def get_split_group(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.utils.report_visibility import can_view
    report = db.get(Report, report_id)
    if report is None or not can_view(db, current_user, report):
        raise HTTPException(status_code=404, detail="Report not found.")
    out = group_payload(db, report)
    if current_user.role_id in (2, 3, 4):
        # each animal record's own AI analysis (the group's AI summary was made from the one original photo)
        for card in out["children"]:
            kid = db.get(Report, card["report_id"])
            card["ai"] = {
                "animal_type": kid.ai_animal_type, "color": kid.ai_dominant_color, "breed": kid.ai_possible_breed,
                "size": kid.ai_estimated_size, "risk_level": kid.ai_suggested_risk_level,
                "reason": kid.ai_suggested_priority_reason, "behavior": kid.ai_behavior_explanation,
                "photo_status": kid.ai_photo_status,
            }
    is_leader = current_user.role_id == 2 and current_user.subdivision_id == report.subdivision_id
    open_report = report.current_status_id not in _closed_ids()
    out["can_split"] = bool(is_leader and open_report and not report.split_from_report_id and not report.duplicate_of_report_id)
    out["can_unsplit"] = bool(is_leader and out["is_group"])
    out["can_replace_photo"] = bool(open_report and not out["is_group"] and _can_replace_photo(db, current_user, report)
                                    and (report.split_from_report_id or (report.animal_count or 1) <= 1))
    if out["can_split"]:
        # the photos to crop from: every image of the group report (submission photos first)
        imgs = sorted([m for m in (report.media or []) if (m.media_type or "Image") == "Image"],
                      key=lambda m: bool(m.history_id or m.holding_log_id or m.is_evidence))
        out["source_photos"] = [m.file_url for m in imgs]
        if not out["is_group"]:
            c = _carry_items(db, report)
            out["carry_needed"] = {"holding": bool(c["holding"]), "pet": bool(c["pet"]), "claims": bool(c["claims"])}
    return out


@router.post("/{report_id}/split")
def split_report(report_id: int, body: SplitRequest, req: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.report_id == report_id).with_for_update().first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    _require_leader_of(current_user, report)

    # The same request sent twice (double click, retry) returns the first result instead of new records.
    for log in db.query(AuditLog).filter(AuditLog.action == rs.SPLIT_ACTION, AuditLog.target_id == report.report_id).all():
        if (log.new_values or {}).get("client_token") == body.client_token:
            return {**group_payload(db, report), "created": (log.new_values or {}).get("children", []), "reused": True}

    if report.split_from_report_id:
        raise HTTPException(status_code=400, detail="This is already one animal's record. Split the group report instead.")
    if report.duplicate_of_report_id:
        raise HTTPException(status_code=400, detail="This sighting was merged into another case. Split the main case report instead.")
    if report.current_status_id in _closed_ids():
        raise HTTPException(status_code=409, detail="This report is already closed.")

    existing = rs.active_children(db, report)
    first_batch = not existing
    n = len(body.animals)
    if first_batch and n < 2:
        raise HTTPException(status_code=400, detail="Add at least 2 animals to split a report.")
    if n < 1:
        raise HTTPException(status_code=400, detail="Add at least 1 animal.")
    if n > rs.MAX_PER_SPLIT:
        raise HTTPException(status_code=400, detail=(
            f"Up to {rs.MAX_PER_SPLIT} animals can be added at a time. Add these first, then use "
            f"\"Add more animals\" for the rest. The group report keeps every record."))
    if len(existing) + n > rs.MAX_ANIMALS_PER_GROUP:
        raise HTTPException(status_code=400, detail=f"A group report can hold up to {rs.MAX_ANIMALS_PER_GROUP} animal records.")

    animals = []
    for i, a in enumerate(body.animals, 1):
        media_type, _ = validate_cloudinary_url(a.photo_url, allowed={"Image"})
        if a.animal_type and a.animal_type not in ANIMAL_TYPES:
            raise HTTPException(status_code=400, detail=f"Animal {i}: type must be Dog, Cat or Unknown.")
        if a.estimated_size and a.estimated_size not in SIZES:
            raise HTTPException(status_code=400, detail=f"Animal {i}: size must be Small, Medium or Large.")
        if a.sex and a.sex not in SEXES:
            raise HTTPException(status_code=400, detail=f"Animal {i}: sex must be Male, Female or Unknown.")
        animals.append(a)

    # What the group already has must go to exactly one animal (first batch only).
    carry = _carry_items(db, report) if first_batch else {"holding": None, "pet": False, "confirmed": [], "claims": []}
    choice = body.carry
    needs = [k for k, present in (("holding", bool(carry["holding"])), ("pet", carry["pet"]), ("claims", bool(carry["claims"]))) if present]
    for key in needs:
        idx = getattr(choice, key)
        if idx is None or not (0 <= idx < n):
            what = {"holding": "the animal already in the holding place",
                    "pet": "the registered pet this report is confirmed as",
                    "claims": "the open owner claims"}[key]
            raise HTTPException(status_code=400, detail=f"Choose which animal is {what}.")

    total = len(existing) + n
    created: List[Report] = []
    copy_fields = ("user_id", "subdivision_id", "category_id", "latitude", "longitude", "initial_latitude",
                   "initial_longitude", "initial_landmark", "facility_id", "custody_status", "landmark", "priority_level",
                   "visibility", "visibility_decided_by", "visibility_decided_at", "visibility_reason",
                   "current_status_id", "assigned_leader_id", "claimed_at", "verification_status", "verified_by_user_id",
                   "verified_at", "condition", "is_possible_owned")
    for i, a in enumerate(animals):
        pos = len(existing) + i + 1
        child = Report(**{f: getattr(report, f) for f in copy_fields})
        child.split_from_report_id = report.report_id
        child.animal_count = 1
        child.animal_type = a.animal_type or report.animal_type
        child.animal_color = a.animal_color or None
        child.animal_breed = a.animal_breed or None
        child.estimated_size = a.estimated_size or report.estimated_size
        details = [f"Animal {pos} from Report #{report.report_id}."]
        if a.sex and a.sex != "Unknown":
            details.append(f"Sex: {a.sex}.")
        if a.notes:
            details.append(a.notes.strip())
        child.description = " ".join(details)
        rs.give_group_priority(report, child)   # the incident's priority, not the animal's own guess
        db.add(child)
        created.append(child)
    db.flush()

    media_rows = []
    for child, a in zip(created, animals):
        m = ReportMedia(report_id=child.report_id, file_url=a.photo_url, media_type="Image",
                        animal_type=child.animal_type if child.animal_type in ANIMAL_TYPES else "Unknown")
        db.add(m)
        media_rows.append(m)
        db.add(StatusHistory(report_id=child.report_id, report_status_id=child.current_status_id,
                             updated_by=current_user.user_id,
                             remarks=f"Animal record created from group Report #{report.report_id} by {current_user.name}."))
    db.flush()

    # Carry over what the group report already had.
    if first_batch and carry["holding"] is not None:
        carry["holding"].report_id = created[choice.holding].report_id
    if first_batch and carry["pet"]:
        target = created[choice.pet]
        target.pet_id = report.pet_id or (carry["confirmed"][0].matched_pet_id if carry["confirmed"] else None)
        target.is_possible_owned = report.is_possible_owned
        for m in carry["confirmed"]:
            m.source_report_id = target.report_id
        report.pet_id = None
    if first_batch and carry["claims"]:
        for c in carry["claims"]:
            c.report_id = created[choice.claims].report_id

    # The group report steps aside: its open AI suggestions are closed as superseded.
    for m in db.query(ReportMatch).filter(
            ((ReportMatch.source_report_id == report.report_id) | (ReportMatch.matched_report_id == report.report_id)),
            ReportMatch.status.in_(OPEN_MATCH_STATUSES)).all():
        m.status = "SUPERSEDED_BY_CASE"
        m.verification_notes = rs.SUPERSEDED_NOTE

    ids = [c.report_id for c in created]
    db.add(StatusHistory(
        report_id=report.report_id, report_status_id=report.current_status_id, updated_by=current_user.user_id,
        remarks=(f"{'Split' if first_batch else 'Added'} into individual animal records: "
                 + ", ".join(f"#{i}" for i in ids) + f" ({total} animal record{'s' if total != 1 else ''} in total)."),
    ))
    log_activity(db=db, action=rs.SPLIT_ACTION, target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} added {n} animal record(s) to Report #{report.report_id}: {ids}",
                 user_id=current_user.user_id, log_type="operation",
                 new_values={"client_token": body.client_token, "children": ids, "first_batch": first_batch,
                             "carry": body.carry.model_dump() if first_batch else None},
                 request=req, commit=False)
    if report.user_id and report.user_id != current_user.user_id:
        db.add(Notification(
            user_id=report.user_id, type="status_update", related_id=report.report_id,
            title="🐾 Your report now has a record for each animal",
            message=(f"Your Report #{report.report_id} is now tracked as {total} animal record"
                     f"{'s' if total != 1 else ''}, so each animal can be matched and cared for on its own."),
        ))
    db.commit()

    for child, m in zip(created, media_rows):
        _queue_ai(db, child.report_id, m.media_id, m.file_url)
    db.refresh(report)
    return {**group_payload(db, report), "created": ids, "reused": False}


@router.post("/{report_id}/count-note")
def confirm_fewer_animals(report_id: int, body: CountNoteRequest, req: Request, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """The leader recorded fewer animals than the resident reported, and says why (e.g. only 2 were on site)."""
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    _require_leader_of(current_user, report)
    children = rs.active_children(db, report)
    reported = report.animal_count or 1
    if not children:
        raise HTTPException(status_code=400, detail="Add the animal records first.")
    if len(children) >= reported:
        raise HTTPException(status_code=400, detail="Every reported animal already has a record.")
    reason = body.reason.strip()
    db.add(StatusHistory(report_id=report.report_id, report_status_id=report.current_status_id,
                         updated_by=current_user.user_id,
                         remarks=f"{len(children)} of {reported} reported animals recorded: {reason}"))
    log_activity(db=db, action=COUNT_NOTE_ACTION, target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name}: {len(children)} of {reported} reported animals recorded ({reason})",
                 user_id=current_user.user_id, log_type="operation",
                 new_values={"reported": reported, "recorded": len(children), "reason": reason},
                 request=req, commit=False)
    db.commit()
    return group_payload(db, report)


@router.post("/{report_id}/unsplit")
def unsplit_report(report_id: int, req: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.report_id == report_id).with_for_update().first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    _require_leader_of(current_user, report)
    children = rs.active_children(db, report)
    if not children:
        raise HTTPException(status_code=400, detail="This report has no animal records to undo.")
    busy = []
    for c in children:
        reasons = []
        if db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == c.report_id).first():
            reasons.append("is in the holding place")
        if db.query(PetClaim.claim_id).filter(PetClaim.report_id == c.report_id, PetClaim.status != "Rejected").first():
            reasons.append("has an owner claim")
        if c.pet_id or db.query(ReportMatch.match_id).filter(ReportMatch.source_report_id == c.report_id,
                                                             ReportMatch.status == "CONFIRMED_MATCH").first():
            reasons.append("is confirmed as a registered pet")
        if db.query(ReportReturn.return_id).filter(ReportReturn.report_id == c.report_id).first():
            reasons.append("was returned to an owner")
        if reasons:
            busy.append(f"Report #{c.report_id} " + " and ".join(reasons))
    if busy:
        raise HTTPException(status_code=409, detail="The split can't be undone because " + "; ".join(busy) + ".")

    ids = []
    for c in children:
        c.duplicate_of_report_id = report.report_id
        c.current_status_id = rs.UNSPLIT_STATUS_ID
        db.add(StatusHistory(report_id=c.report_id, report_status_id=rs.UNSPLIT_STATUS_ID, updated_by=current_user.user_id,
                             remarks=f"Animal record folded back into group Report #{report.report_id} (split undone by {current_user.name})."))
        ids.append(c.report_id)
    db.add(StatusHistory(report_id=report.report_id, report_status_id=report.current_status_id,
                         updated_by=current_user.user_id,
                         remarks=f"Split undone by {current_user.name}; animal records {', '.join('#' + str(i) for i in ids)} were folded back into this report."))
    log_activity(db=db, action=rs.UNSPLIT_ACTION, target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} undid the split of Report #{report.report_id}",
                 user_id=current_user.user_id, log_type="operation", new_values={"children": ids},
                 request=req, commit=False)
    db.commit()
    try:
        from app.utils import ai_jobs
        ai_jobs.enqueue_follow_up(report.report_id, db=db)
    except Exception as e:  # pragma: no cover
        print(f"Notice: AI queue for report #{report.report_id} failed: {e}")
    db.refresh(report)
    return group_payload(db, report)


@router.post("/{report_id}/replace-photo")
def replace_animal_photo(report_id: int, body: ReplacePhotoRequest, req: Request, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.report_id == report_id).with_for_update().first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if not _can_replace_photo(db, current_user, report):
        raise HTTPException(status_code=403, detail=(
            "Only the Subdivision Leader of this subdivision or the Barangay Staff of its barangay can replace the photo."))
    if rs.is_split_group(db, report):
        raise HTTPException(status_code=400, detail="This is a group report. Replace the photo on one animal's record instead.")
    if not report.split_from_report_id and (report.animal_count or 1) > 1:
        raise HTTPException(status_code=400, detail="This report has several animals. Add a record for each animal first.")
    if report.current_status_id in _closed_ids():
        raise HTTPException(status_code=409, detail="This report is already closed.")
    validate_cloudinary_url(body.photo_url, allowed={"Image"})

    old = rs.primary_images(report)
    hist = StatusHistory(
        report_id=report.report_id, report_status_id=report.current_status_id, updated_by=current_user.user_id,
        remarks=("Main photo replaced with a close-up" + (f": {body.note.strip()}" if body.note else "")
                 + (". The earlier photo is kept here as evidence." if old else ".")),
    )
    db.add(hist)
    db.flush()
    for m in old:   # kept, never deleted: moved onto this timeline entry as evidence
        m.history_id = hist.history_id
        m.is_evidence = True
    new = ReportMedia(report_id=report.report_id, file_url=body.photo_url, media_type="Image",
                      animal_type=report.animal_type if report.animal_type in ANIMAL_TYPES else "Unknown")
    db.add(new)
    log_activity(db=db, action=rs.PHOTO_REPLACED_ACTION, target_table="reports", target_id=report.report_id,
                 description=f"{current_user.name} replaced the main photo of Report #{report.report_id}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"photos": [m.file_url for m in old]}, new_values={"photo": body.photo_url},
                 request=req, commit=False)
    db.commit()
    _queue_ai(db, report.report_id, new.media_id, new.file_url)
    return {"ok": True, "report_id": report.report_id, "photo_url": body.photo_url,
            "kept_as_evidence": len(old), "ai_rematch_queued": True}
