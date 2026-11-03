from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from app.database import get_db
from app.models.landmark import Landmark
from app.models.user import User, Barangay, Subdivision
from app.schemas.landmark import (
    LandmarkCreate,
    LandmarkUpdate,
    LandmarkResponse,
    BarangayHQResponse,
    BarangayHQUpdate
)
from app.utils.auth import get_current_user
from app.utils.audit import log_activity
from app.utils.landmark_cache import invalidate_landmarks_cache

router = APIRouter(
    prefix="/landmarks",
    tags=["landmarks"]
)

RESOLVED_REPORT_STATUS_IDS = (9, 10, 11, 12, 14, 17, 18)
RESOLVED_HOLDING_STATUS_IDS = (3, 4, 5, 7, 8)


def _validate_coordinates(lat: Optional[float], lng: Optional[float]) -> None:
    if lat is not None:
        try:
            f_lat = float(lat)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid latitude value.")
        if not (-90.0 <= f_lat <= 90.0):
            raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90 degrees.")
    if lng is not None:
        try:
            f_lng = float(lng)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid longitude value.")
        if not (-180.0 <= f_lng <= 180.0):
            raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180 degrees.")


def _sync_facility_reports(landmark: Landmark, db: Session) -> None:
    """Ensure active reports held in this facility (or orphaned Barangay facility reports)
    reflect the latest facility ID, name, latitude, and longitude."""
    if not landmark.is_holding_facility or landmark.status != "Active":
        return

    from app.models.report import Report, HoldingAnimal

    # 1. Update all active reports already referencing this facility_id
    active_reports = db.query(Report).filter(
        Report.facility_id == landmark.landmark_id,
        Report.current_status_id.notin_(RESOLVED_REPORT_STATUS_IDS)
    ).all()
    for rep in active_reports:
        rep.latitude = landmark.latitude
        rep.longitude = landmark.longitude
        rep.landmark = landmark.name

    # 2. If this is an active Barangay holding facility (subdivision_id is None),
    # re-link any active Barangay-custody reports whose facility_id became NULL when an earlier facility row was replaced.
    if landmark.subdivision_id is None:
        open_holding_report_ids = [
            r[0] for r in db.query(HoldingAnimal.report_id).filter(
                HoldingAnimal.report_id.isnot(None),
                HoldingAnimal.discharge_date.is_(None),
                HoldingAnimal.facility_status.notin_(RESOLVED_HOLDING_STATUS_IDS)
            ).all()
        ]
        orphan_candidates = db.query(Report).filter(
            Report.facility_id.is_(None),
            Report.current_status_id.in_([7, 8, 15, 16])
        ).all()
        for rep in orphan_candidates:
            if rep.custody_status == "In Barangay Facility" or (
                rep.report_id in open_holding_report_ids and rep.custody_status != "In Subdivision Facility"
            ):
                rep.facility_id = landmark.landmark_id
                rep.latitude = landmark.latitude
                rep.longitude = landmark.longitude
                rep.landmark = landmark.name


def enrich_landmark(landmark: Landmark, db: Session) -> dict:
    subd = db.query(Subdivision).filter(Subdivision.subdivision_id == landmark.subdivision_id).first() if landmark.subdivision_id else None
    brgy = db.query(Barangay).filter(Barangay.barangay_id == landmark.barangay_id).first() if landmark.barangay_id else None

    return {
        "landmark_id": landmark.landmark_id,
        "name": landmark.name,
        "category": landmark.category or ("facility" if landmark.is_holding_facility else "general"),
        "description": landmark.description,
        "subdivision_id": landmark.subdivision_id,
        "barangay_id": landmark.barangay_id,
        "latitude": float(landmark.latitude),
        "longitude": float(landmark.longitude),
        "is_holding_facility": landmark.is_holding_facility,
        "facility_type": landmark.facility_type,
        "capacity": landmark.capacity,
        "contact_person": landmark.contact_person,
        "contact_number": landmark.contact_number,
        "status": landmark.status,
        "subdivision_name": subd.subdivision_name if subd else None,
        "barangay_name": brgy.barangay_name if brgy else None,
        "created_at": landmark.created_at,
        "updated_at": landmark.updated_at
    }


@router.get("", response_model=List[LandmarkResponse])
def get_landmarks(
    subdivision_id: Optional[int] = None,
    barangay_id: Optional[int] = None,
    is_holding_facility: Optional[bool] = None,
    barangay_only: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Landmark).filter(Landmark.status == 'Active')

    if subdivision_id is not None:
        query = query.filter(Landmark.subdivision_id == subdivision_id)
    elif barangay_only:
        query = query.filter(Landmark.subdivision_id.is_(None))
        if barangay_id is not None:
            query = query.filter(Landmark.barangay_id == barangay_id)
    elif barangay_id is not None:
        query = query.filter(Landmark.barangay_id == barangay_id)

    if is_holding_facility is not None:
        query = query.filter(Landmark.is_holding_facility == is_holding_facility)

    landmarks = query.order_by(Landmark.is_holding_facility.desc(), Landmark.name.asc()).all()
    return [enrich_landmark(l, db) for l in landmarks]


@router.get("/jurisdictions")
def get_jurisdictions(db: Session = Depends(get_db)):
    barangays = db.query(Barangay).all()
    subdivisions = db.query(Subdivision).all()

    return {
        "barangays": [
            {
                "barangay_id": b.barangay_id,
                "barangay_name": b.barangay_name,
                "city": b.city
            } for b in barangays
        ],
        "subdivisions": [
            {
                "subdivision_id": s.subdivision_id,
                "subdivision_name": s.subdivision_name,
                "barangay_id": s.barangay_id,
                "barangay_name": s.barangay.barangay_name if s.barangay else None
            } for s in subdivisions
        ]
    }


@router.get("/{landmark_id}", response_model=LandmarkResponse)
def get_landmark(landmark_id: int, db: Session = Depends(get_db)):
    landmark = db.query(Landmark).filter(
        Landmark.landmark_id == landmark_id,
        Landmark.status == "Active"
    ).first()
    if not landmark:
        raise HTTPException(status_code=404, detail="Landmark not found")
    return enrich_landmark(landmark, db)


@router.post("", response_model=LandmarkResponse, status_code=status.HTTP_201_CREATED)
def create_landmark(
    data: LandmarkCreate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Permission: Admin can create anywhere; Subd Leader can create in their subdivision; Barangay Head Officer in their barangay
    is_admin = current_user.role_id == 4
    is_subd_leader = current_user.role_id == 2 and current_user.subdivision_id
    is_brgy_head = current_user.role_id == 3 and current_user.barangay_id and (current_user.is_head_officer or False)

    if not (is_admin or is_subd_leader or is_brgy_head):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only Barangay Head Officers, Subdivision Leaders, and Administrators can register landmarks & holding places."
        )

    if current_user.role_id == 2 and data.is_holding_facility:
        raise HTTPException(status_code=403, detail="New subdivision holding places cannot be designated. Register an ordinary landmark or coordinate with the Barangay.")

    _validate_coordinates(data.latitude, data.longitude)

    # If Subd Leader, lock to their subdivision; if Barangay Head, lock to barangay level (subdivision_id = None)
    target_subd_id = current_user.subdivision_id if (is_subd_leader and not is_admin) else (None if is_brgy_head and not is_admin else data.subdivision_id)
    target_brgy_id = current_user.barangay_id if ((is_brgy_head or current_user.role_id == 3) and not is_admin) else (data.barangay_id or 1)

    new_landmark = Landmark(
        name=data.name.strip(),
        category=data.category or ("facility" if data.is_holding_facility else "general"),
        description=data.description.strip() if data.description else None,
        subdivision_id=target_subd_id,
        barangay_id=target_brgy_id,
        latitude=Decimal(str(data.latitude)),
        longitude=Decimal(str(data.longitude)),
        is_holding_facility=bool(data.is_holding_facility),
        facility_type=data.facility_type.strip() if data.facility_type else None,
        capacity=data.capacity,
        contact_person=data.contact_person.strip() if data.contact_person else None,
        contact_number=data.contact_number.strip() if data.contact_number else None,
        status=data.status or "Active"
    )

    db.add(new_landmark)
    db.flush()
    _sync_facility_reports(new_landmark, db)
    db.commit()
    db.refresh(new_landmark)
    invalidate_landmarks_cache()

    log_activity(
        db=db,
        user_id=current_user.user_id,
        action="CREATE_LANDMARK",
        target_table="landmarks",
        target_id=new_landmark.landmark_id,
        description=f"Created landmark '{new_landmark.name}' (Holding Place: {new_landmark.is_holding_facility})",
        request=req
    )

    return enrich_landmark(new_landmark, db)


@router.put("/{landmark_id}", response_model=LandmarkResponse)
def update_landmark(
    landmark_id: int,
    data: LandmarkUpdate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    landmark = db.query(Landmark).filter(Landmark.landmark_id == landmark_id).first()
    if not landmark:
        raise HTTPException(status_code=404, detail="Landmark not found")

    is_admin = current_user.role_id == 4
    is_subd_leader = current_user.role_id == 2 and bool(current_user.subdivision_id) and current_user.subdivision_id == landmark.subdivision_id
    is_brgy_head = current_user.role_id == 3 and (current_user.is_head_officer or False) and current_user.barangay_id == landmark.barangay_id

    if not (is_admin or is_subd_leader or is_brgy_head):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the Barangay Head Officer, Subdivision Leader, or Admin can edit this landmark."
        )

    update_dict = data.model_dump(exclude_unset=True)
    if current_user.role_id == 2:
        own = db.get(Subdivision, current_user.subdivision_id)
        if ("subdivision_id" in update_dict and update_dict["subdivision_id"] != current_user.subdivision_id
                or "barangay_id" in update_dict and (not own or update_dict["barangay_id"] != own.barangay_id)):
            raise HTTPException(status_code=403, detail="Subdivision Leaders cannot change a landmark's jurisdiction.")
    if current_user.role_id == 2 and update_dict.get("is_holding_facility") and not landmark.is_holding_facility:
        raise HTTPException(status_code=403, detail="New subdivision holding places cannot be designated. Existing designations may be retained or switched off.")

    _validate_coordinates(update_dict.get("latitude"), update_dict.get("longitude"))

    was_holding_facility = bool(landmark.is_holding_facility)

    if "latitude" in update_dict and update_dict["latitude"] is not None:
        landmark.latitude = Decimal(str(update_dict["latitude"]))
    if "longitude" in update_dict and update_dict["longitude"] is not None:
        landmark.longitude = Decimal(str(update_dict["longitude"]))

    for field, val in update_dict.items():
        if field not in ["latitude", "longitude"]:
            setattr(landmark, field, val)

    if landmark.is_holding_facility and landmark.status == "Active":
        _sync_facility_reports(landmark, db)
    elif was_holding_facility and (not landmark.is_holding_facility or landmark.status != "Active"):
        # If holding designation was switched off or deactivated, clear active report references to it
        from app.models.report import Report
        affected_reports = db.query(Report).filter(Report.facility_id == landmark.landmark_id).all()
        for rep in affected_reports:
            rep.facility_id = None
            if rep.initial_latitude is not None and rep.initial_longitude is not None:
                rep.latitude = rep.initial_latitude
                rep.longitude = rep.initial_longitude
            if rep.initial_landmark:
                rep.landmark = rep.initial_landmark
            if rep.custody_status == "In Subdivision Facility":
                rep.custody_status = "Sighting"

    db.commit()
    db.refresh(landmark)
    invalidate_landmarks_cache()

    log_activity(
        db=db,
        user_id=current_user.user_id,
        action="UPDATE_LANDMARK",
        target_table="landmarks",
        target_id=landmark.landmark_id,
        description=f"Updated landmark '{landmark.name}' (Lat: {landmark.latitude}, Lng: {landmark.longitude})",
        request=req
    )

    return enrich_landmark(landmark, db)


@router.delete("/{landmark_id}", status_code=status.HTTP_200_OK)
def delete_landmark(
    landmark_id: int,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    landmark = db.query(Landmark).filter(Landmark.landmark_id == landmark_id).first()
    if not landmark:
        raise HTTPException(status_code=404, detail="Landmark not found")

    is_admin = current_user.role_id == 4
    is_subd_leader = current_user.role_id == 2 and current_user.subdivision_id == landmark.subdivision_id
    is_brgy_head = current_user.role_id == 3 and (current_user.is_head_officer or False) and current_user.barangay_id == landmark.barangay_id

    if not (is_admin or is_subd_leader or is_brgy_head):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the Barangay Head Officer, local Subdivision Leader, or Admin can delete landmarks."
        )

    landmark_name = landmark.name
    was_holding = bool(landmark.is_holding_facility)
    was_subd_id = landmark.subdivision_id
    was_brgy_id = landmark.barangay_id

    # Cleanly detach any reports or status history referencing this landmark so no stale facility coordinates remain
    from app.models.report import Report, StatusHistory

    alt_fac = None
    if was_holding:
        if was_subd_id is None:
            alt_fac = db.query(Landmark).filter(
                Landmark.landmark_id != landmark_id,
                Landmark.barangay_id == was_brgy_id,
                Landmark.subdivision_id.is_(None),
                Landmark.is_holding_facility == True,
                Landmark.status == "Active"
            ).first()
        else:
            alt_fac = db.query(Landmark).filter(
                Landmark.landmark_id != landmark_id,
                Landmark.subdivision_id == was_subd_id,
                Landmark.is_holding_facility == True,
                Landmark.status == "Active"
            ).first()

    referencing_reports = db.query(Report).filter(Report.facility_id == landmark_id).all()
    for rep in referencing_reports:
        is_resolved = rep.current_status_id in RESOLVED_REPORT_STATUS_IDS
        if alt_fac and not is_resolved and rep.current_status_id in (7, 8, 15, 16):
            rep.facility_id = alt_fac.landmark_id
            rep.latitude = alt_fac.latitude
            rep.longitude = alt_fac.longitude
            rep.landmark = alt_fac.name
        else:
            rep.facility_id = None
            if rep.initial_latitude is not None and rep.initial_longitude is not None:
                rep.latitude = rep.initial_latitude
                rep.longitude = rep.initial_longitude
            if rep.initial_landmark:
                rep.landmark = rep.initial_landmark
            if was_subd_id is not None and rep.custody_status == "In Subdivision Facility":
                rep.custody_status = "Sighting"

    # Preserve historical StatusHistory records while detaching foreign key before deleting landmark
    db.query(StatusHistory).filter(StatusHistory.facility_id == landmark_id).update(
        {StatusHistory.facility_id: None}, synchronize_session=False
    )

    db.delete(landmark)
    db.commit()
    invalidate_landmarks_cache()

    log_activity(
        db=db,
        user_id=current_user.user_id,
        action="DELETE_LANDMARK",
        target_table="landmarks",
        target_id=landmark_id,
        description=f"Deleted landmark '{landmark_name}'",
        request=req
    )

    return {"message": "Landmark deleted successfully", "deleted_landmark_id": landmark_id}


# ─── BARANGAY HEADQUARTERS LOCATION (ADMIN-ONLY EDIT) ──────────────────────────

@router.get("/barangay/{barangay_id}/hq", response_model=BarangayHQResponse)
def get_barangay_hq(barangay_id: int, db: Session = Depends(get_db)):
    brgy = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first()
    if not brgy:
        raise HTTPException(status_code=404, detail="Barangay not found")

    return {
        "barangay_id": brgy.barangay_id,
        "barangay_name": brgy.barangay_name,
        "city": brgy.city,
        "contact_no": brgy.contact_no,
        "hq_plus_code": brgy.hq_plus_code,
        "hq_lat": float(brgy.hq_lat) if brgy.hq_lat is not None else None,
        "hq_lng": float(brgy.hq_lng) if brgy.hq_lng is not None else None,
    }


@router.put("/barangay/{barangay_id}/hq", response_model=BarangayHQResponse)
def update_barangay_hq(
    barangay_id: int,
    data: BarangayHQUpdate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # STRICT RULE: Only System Administrators can modify Barangay HQ location
    if current_user.role_id != 4:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only System Administrators have permission to modify Barangay Headquarters location."
        )

    brgy = db.query(Barangay).filter(Barangay.barangay_id == barangay_id).first()
    if not brgy:
        raise HTTPException(status_code=404, detail="Barangay not found")

    update_dict = data.model_dump(exclude_unset=True)
    _validate_coordinates(update_dict.get("hq_lat"), update_dict.get("hq_lng"))

    if "hq_lat" in update_dict and update_dict["hq_lat"] is not None:
        brgy.hq_lat = Decimal(str(update_dict["hq_lat"]))
    if "hq_lng" in update_dict and update_dict["hq_lng"] is not None:
        brgy.hq_lng = Decimal(str(update_dict["hq_lng"]))

    for field, val in update_dict.items():
        if field not in ["hq_lat", "hq_lng"]:
            setattr(brgy, field, val)

    db.commit()
    db.refresh(brgy)
    invalidate_landmarks_cache()

    log_activity(
        db=db,
        user_id=current_user.user_id,
        action="UPDATE_BARANGAY_HQ",
        target_table="barangays",
        target_id=brgy.barangay_id,
        description=f"Admin updated Barangay {brgy.barangay_name} Headquarters location (Lat: {brgy.hq_lat}, Lng: {brgy.hq_lng})",
        request=req
    )

    return {
        "barangay_id": brgy.barangay_id,
        "barangay_name": brgy.barangay_name,
        "city": brgy.city,
        "contact_no": brgy.contact_no,
        "hq_plus_code": brgy.hq_plus_code,
        "hq_lat": float(brgy.hq_lat) if brgy.hq_lat is not None else None,
        "hq_lng": float(brgy.hq_lng) if brgy.hq_lng is not None else None,
    }
