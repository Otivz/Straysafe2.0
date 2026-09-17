from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, cast, Any, Optional
from app.database import get_db
from app.models.pet import Pet
from app.models.user import User
from app.schemas.pet import PetCreate, PetUpdate, PetResponse
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.audit import log_activity
from app.utils.uploads import validate_cloudinary_url
from app.utils.model_loader import get_yolo_model

router = APIRouter(
    prefix="/pets",
    tags=["pets"]
)

@router.get("/", response_model=List[PetResponse])
def get_pets(include_archived: bool = False, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    query = db.query(Pet).options(joinedload(Pet.owner))
    if not include_archived:
        query = query.filter(Pet.status.notin_(["Archived", "Inactive"]))
    return query.all()

@router.get("/removed", response_model=List[PetResponse])
@router.get("/archived", response_model=List[PetResponse])
def get_removed_pets(subdivision_id: Optional[int] = None, db: Session = Depends(get_db)):
    from app.models.user import User
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_
    
    query = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.status.in_(["Archived", "Inactive"]))
    if subdivision_id is not None:
        query = query.outerjoin(User, Pet.owner_id == User.user_id).filter(
            or_(User.subdivision_id == subdivision_id, Pet.owner_id.is_(None))
        )
    return query.order_by(Pet.updated_at.desc()).all()

@router.get("/{pet_id}", response_model=PetResponse)
def get_pet(pet_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet

@router.get("/owner/{owner_id}", response_model=List[PetResponse])
def get_owner_pets(owner_id: int, include_archived: bool = False, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    query = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.owner_id == owner_id)
    if not include_archived:
        query = query.filter(Pet.status.notin_(["Archived", "Inactive"]))
    return query.all()

@router.get("/subdivision/{subdivision_id}", response_model=List[PetResponse])
def get_subdivision_pets(subdivision_id: int, include_archived: bool = False, db: Session = Depends(get_db)):
    from app.models.user import User
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload
    query = db.query(Pet).outerjoin(User, Pet.owner_id == User.user_id).filter(
        or_(User.subdivision_id == subdivision_id, Pet.owner_id.is_(None))
    )
    if not include_archived:
        query = query.filter(Pet.status.notin_(["Archived", "Inactive"]))
    return query.options(joinedload(Pet.owner)).all()

def get_actor_user(req: Request, db: Session) -> Optional[User]:
    """Helper to resolve the authenticated/calling user from headers or token."""
    actor_id_str = req.headers.get("x-user-id") or req.headers.get("X-User-Id")
    if actor_id_str:
        try:
            user = db.query(User).filter(User.user_id == int(actor_id_str)).first()
            if user:
                return user
        except ValueError:
            pass
    auth_header = req.headers.get("Authorization") or req.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            from app.utils.auth import decode_access_token
            payload = decode_access_token(token)
            if payload:
                user_id = payload.get("sub") or payload.get("user_id")
                if user_id:
                    user = db.query(User).filter(User.user_id == int(user_id)).first()
                    if user:
                        return user
        except Exception:
            pass
    return None

@router.post("/{pet_id}/assign-owner", response_model=PetResponse)
def assign_pet_owner(
    pet_id: int, 
    owner_id: int, 
    req: Request, 
    verified_claim: Optional[bool] = None,
    process_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Assigns an owner to an unassigned pet (Subd, Brgy, Admin) 
    or reassigns an existing owner (Admin strictly only).
    """
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    owner = db.query(User).filter(User.user_id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner user not found")
    
    actor = get_actor_user(req, db)
    actor_role = actor.role_id if actor else None
    
    old_owner_id = pet.owner_id
    
    # CASE 1: Pet ALREADY has an owner -> REASSIGNMENT / TRANSFER
    # ONLY System Admin (role_id == 4) is permitted to reassign an established owner
    if old_owner_id is not None and old_owner_id != owner_id:
        if actor and actor_role != 4:
            actor_role_name = "Subdivision Leaders" if actor_role == 2 else ("Barangay Staff" if actor_role == 3 else "Regular users")
            raise HTTPException(
                status_code=403, 
                detail=f"Permission Denied: {actor_role_name} cannot reassign the owner of an already registered pet. Only System Administrators can perform owner reassignments."
            )
        
        old_owner = db.query(User).filter(User.user_id == old_owner_id).first()
        old_owner_name = old_owner.name if old_owner else f"User #{old_owner_id}"
        
        pet.owner_id = owner_id
        db.commit()
        db.refresh(pet)

        admin_name = actor.name if actor else "System Administrator"
        log_activity(
            db=db,
            action="REASSIGN_PET_OWNER",
            target_table="pets",
            target_id=pet_id,
            description=f"Admin {admin_name} reassigned pet '{pet.pet_name}' (ID #{pet_id}) from previous owner {old_owner_name} (ID #{old_owner_id}) to new owner {owner.name} (ID #{owner_id})",
            log_type="security",
            old_values={"owner_id": old_owner_id, "owner_name": old_owner_name},
            new_values={"owner_id": owner_id, "owner_name": owner.name, "reassigned_by": admin_name},
            user_id=actor.user_id if actor else None,
            request=req
        )
        return pet

    # CASE 2: Pet has NO registered owner yet -> INITIAL ASSIGNMENT (Claim / Adoption)
    if old_owner_id is None:
        if actor and actor_role == 1:
            raise HTTPException(
                status_code=403,
                detail="Residents cannot directly assign pet ownership. Authorized officer or administrator approval is required."
            )
        
        # Check claim or adoption status
        from app.models.pet_claim import PetClaim
        existing_claims = db.query(PetClaim).filter(PetClaim.pet_id == pet_id).all()
        approved_claim = next((c for c in existing_claims if c.status in ["Approved", "Handover Complete", "Pet Received"]), None)
        
        # If there are pending claims that have not been approved, require approval first
        if existing_claims and not approved_claim and actor_role in (2, 3) and not verified_claim:
            pending = any(c.status in ["Pending Review", "Under Review", "Potential Owner Match"] for c in existing_claims)
            if pending:
                raise HTTPException(
                    status_code=400,
                    detail="This pet has pending claims under review. Please approve the official claim before assigning the owner."
                )

        pet.owner_id = owner_id
        if pet.status in ["Found", "Rescued"]:
            pet.status = "Active"
            
        if approved_claim and approved_claim.status == "Approved":
            approved_claim.status = "Handover Complete"

        db.commit()
        db.refresh(pet)

        actor_title = "Admin" if actor_role == 4 else ("Subdivision Leader" if actor_role == 2 else ("Barangay Staff" if actor_role == 3 else "Authorized Officer"))
        actor_name = actor.name if actor else actor_title
        process_label = f" via {process_type}" if process_type else " via official claim/adoption turnover"

        log_activity(
            db=db,
            action="ASSIGN_PET_OWNER",
            target_table="pets",
            target_id=pet_id,
            description=f"{actor_title} {actor_name} assigned owner {owner.name} (user_id={owner_id}) to unassigned pet '{pet.pet_name}' (pet_id={pet_id}){process_label}",
            log_type="operation",
            old_values={"owner_id": None},
            new_values={"owner_id": owner_id, "owner_name": owner.name, "assigned_by": actor_name},
            user_id=actor.user_id if actor else None,
            request=req
        )
        return pet

    return pet

@router.post("/", response_model=PetResponse)
def create_pet(pet: PetCreate, req: Request, db: Session = Depends(get_db)):
    pet_dict = pet.model_dump()
    
    # Auto-resolve registered_by_name if user ID was provided but name wasn't
    if pet_dict.get("registered_by_user_id") and not pet_dict.get("registered_by_name"):
        reg_user = db.query(User).filter(User.user_id == pet_dict["registered_by_user_id"]).first()
        if reg_user:
            pet_dict["registered_by_name"] = reg_user.name
    elif not pet_dict.get("registered_by_name") and pet_dict.get("owner_id"):
        owner_user = db.query(User).filter(User.user_id == pet_dict["owner_id"]).first()
        if owner_user:
            pet_dict["registered_by_name"] = owner_user.name
            pet_dict["registered_by_user_id"] = owner_user.user_id

    db_pet = Pet(**pet_dict)
    db.add(db_pet)
    db.commit()
    db.refresh(db_pet)
    
    # Automatically generate QR Code for the pet on registration
    try:
        from app.routes.pet_qr import generate_qr_for_pet_internal
        generate_qr_for_pet_internal(db_pet.pet_id, db)
    except Exception as e:
        # Avoid blocking registration if QR generation encounters an issue
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to auto-generate QR code for registered pet {db_pet.pet_id}: {e}")

    log_activity(
        db=db,
        action="CREATE_PET",
        target_table="pets",
        target_id=db_pet.pet_id,
        description=f"Registered new pet: {db_pet.pet_name} ({db_pet.pet_type}), owner_id={db_pet.owner_id}",
        log_type="operation",
        new_values={"pet_name": db_pet.pet_name, "pet_type": db_pet.pet_type, "owner_id": db_pet.owner_id},
        request=req
    )
    return db_pet

@router.put("/{pet_id}", response_model=PetResponse)
def update_pet(pet_id: int, pet_update: PetUpdate, req: Request, db: Session = Depends(get_db)):
    from app.models.pet_claim import PetClaim
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    # Validation: Prevent marking a deceased pet as Lost
    if pet_update.status and pet_update.status.lower() == "lost":
        if db_pet.status and db_pet.status.lower() == "deceased":
            raise HTTPException(
                status_code=400,
                detail="This pet is marked as deceased and cannot be reported as lost."
            )
    
    old_snapshot = {"pet_name": db_pet.pet_name, "pet_type": db_pet.pet_type, "status": db_pet.status}
    update_data = pet_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_pet, key, value)
    
    # If pet status is updated to 'Deceased', immediately invalidate/remove any active AI match claims
    if update_data.get("status") == "Deceased":
        db.query(PetClaim).filter(
            PetClaim.pet_id == pet_id,
            PetClaim.status.in_(["Potential Owner Match", "Possible Match Found", "Pending Review"])
        ).delete(synchronize_session=False)

    db.commit()
    db.refresh(db_pet)

    log_activity(
        db=db,
        action="UPDATE_PET",
        target_table="pets",
        target_id=pet_id,
        description=f"Updated pet record: {db_pet.pet_name} (pet_id={pet_id})",
        log_type="operation",
        old_values=old_snapshot,
        new_values={"pet_name": db_pet.pet_name, "pet_type": db_pet.pet_type, "status": db_pet.status},
        request=req
    )
    return db_pet

@router.get("/owner/{owner_id}/history")
def get_owner_pet_history(owner_id: int, db: Session = Depends(get_db)):
    from app.models.audit_log import AuditLog
    from sqlalchemy.orm import joinedload
    from datetime import datetime
    
    # 1. Current registered active pets
    current_pets = db.query(Pet).filter(Pet.owner_id == owner_id, Pet.status.notin_(["Archived", "Inactive"])).all()
    current_ids = {p.pet_id for p in current_pets}
    current_list = []
    for p in current_pets:
        created_str = p.created_at.strftime("%Y-%m-%d %H:%M:%S") if isinstance(p.created_at, datetime) else str(p.created_at or "")
        current_list.append({
            "pet_id": p.pet_id,
            "pet_name": p.pet_name,
            "pet_type": p.pet_type,
            "breed": p.breed or "Unknown",
            "gender": p.gender or "Unknown",
            "primary_color": p.primary_color or "",
            "secondary_color": p.secondary_color or "",
            "tertiary_color": p.tertiary_color or "",
            "photo_url": p.photo_url,
            "status": p.status or "Active",
            "is_vaccinated": p.is_vaccinated,
            "created_at": created_str,
            "weight": str(p.weight) if p.weight is not None else None
        })
    
    # 2. Directly get archived / removed pets from DB records
    archived_db_pets = db.query(Pet).filter(Pet.owner_id == owner_id, Pet.status.in_(["Archived", "Inactive"])).all()
    removed_pet_ids_seen = set()
    removed_pets = []

    for ap in archived_db_pets:
        removed_pet_ids_seen.add(ap.pet_id)
        archived_at_str = ap.updated_at.strftime("%Y-%m-%d %H:%M:%S") if isinstance(ap.updated_at, datetime) else str(ap.updated_at or "")
        removed_pets.append({
            "log_id": None,
            "pet_id": ap.pet_id,
            "pet_name": ap.pet_name,
            "pet_type": ap.pet_type,
            "breed": ap.breed or "Unknown Breed",
            "gender": ap.gender or "Unknown",
            "primary_color": ap.primary_color or "",
            "secondary_color": ap.secondary_color or "",
            "tertiary_color": ap.tertiary_color or "",
            "color_markings": ap.color_markings or "",
            "size_category": ap.size_category or "Medium",
            "weight": str(ap.weight) if ap.weight is not None else None,
            "photo_url": ap.photo_url,
            "is_vaccinated": ap.is_vaccinated,
            "temperament": ap.temperament or "Friendly",
            "health_condition": ap.health_condition or "Healthy",
            "notes": ap.notes or "",
            "status": "Archived",
            "removed_at": archived_at_str,
            "description": f"Archived pet record: {ap.pet_name} ({ap.pet_type}, pet_id={ap.pet_id})"
        })

    # 3. Audit logs for pet events
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.target_table == "pets")
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    
    owner_logs = []
    created_pets_history = []
    
    for l in logs:
        # Check if log belongs to this owner
        is_owner = False
        if l.user_id == owner_id:
            is_owner = True
        elif l.old_values and isinstance(l.old_values, dict) and str(l.old_values.get("owner_id")) == str(owner_id):
            is_owner = True
        elif l.new_values and isinstance(l.new_values, dict) and str(l.new_values.get("owner_id")) == str(owner_id):
            is_owner = True
        elif f"owner_id={owner_id}" in (l.description or ""):
            is_owner = True
            
        if not is_owner:
            continue
            
        ts_str = l.created_at.strftime("%Y-%m-%d %H:%M:%S") if isinstance(l.created_at, datetime) else str(l.created_at or "")
        
        entry = {
            "log_id": l.log_id,
            "action": l.action,
            "target_id": l.target_id,
            "description": l.description,
            "timestamp": ts_str,
            "old_values": l.old_values,
            "new_values": l.new_values
        }
        owner_logs.append(entry)
        
        if l.action in ("DELETE_PET", "REMOVE_PET"):
            old = l.old_values if isinstance(l.old_values, dict) else {}
            p_id = l.target_id
            if p_id and p_id not in removed_pet_ids_seen:
                removed_pet_ids_seen.add(p_id)
                removed_pets.append({
                    "log_id": l.log_id,
                    "pet_id": p_id,
                    "pet_name": old.get("pet_name") or "Unnamed Pet",
                    "pet_type": old.get("pet_type") or "Unknown",
                    "breed": old.get("breed") or "Unknown Breed",
                    "gender": old.get("gender") or "Unknown",
                    "primary_color": old.get("primary_color") or "",
                    "photo_url": old.get("photo_url"),
                    "status": "Archived",
                    "removed_at": ts_str,
                    "description": l.description
                })
        elif l.action == "CREATE_PET":
            new_val = l.new_values if isinstance(l.new_values, dict) else {}
            created_pets_history.append({
                "log_id": l.log_id,
                "pet_id": l.target_id,
                "pet_name": new_val.get("pet_name") or "Unnamed Pet",
                "pet_type": new_val.get("pet_type") or "Unknown",
                "created_at": ts_str,
                "description": l.description
            })

    # 3. Detect any pets that were previously created/logged but are no longer in current_pets
    for l in owner_logs:
        target_id = l.get("target_id")
        if target_id and target_id not in current_ids and target_id not in removed_pet_ids_seen:
            removed_pet_ids_seen.add(target_id)
            
            # Gather best snapshot across all logs for this target_id
            merged_snapshot = {}
            pet_timeline = []
            for item in owner_logs:
                if item.get("target_id") == target_id:
                    pet_timeline.append(item)
                    for src in [item.get("new_values"), item.get("old_values")]:
                        if isinstance(src, dict):
                            for k, v in src.items():
                                if v is not None and k not in merged_snapshot:
                                    merged_snapshot[k] = v

            # Extract pet name from snapshot or description
            name = merged_snapshot.get("pet_name")
            desc = l.get("description") or ""
            if not name and "Registered new pet:" in desc:
                try:
                    name = desc.split("Registered new pet:")[1].split("(")[0].strip()
                except Exception:
                    name = "Unnamed Pet"
            elif not name and "Updated pet record:" in desc:
                try:
                    name = desc.split("Updated pet record:")[1].split("(")[0].strip()
                except Exception:
                    name = "Unnamed Pet"

            removed_pets.append({
                "log_id": l.get("log_id"),
                "pet_id": target_id,
                "pet_name": name or "Unnamed Pet",
                "pet_type": merged_snapshot.get("pet_type") or "Dog",
                "breed": merged_snapshot.get("breed") or "Unknown Breed",
                "gender": merged_snapshot.get("gender") or "Unknown",
                "primary_color": merged_snapshot.get("primary_color") or "",
                "secondary_color": merged_snapshot.get("secondary_color") or "",
                "color_markings": merged_snapshot.get("color_markings") or "",
                "size_category": merged_snapshot.get("size_category") or "Medium",
                "weight": merged_snapshot.get("weight"),
                "photo_url": merged_snapshot.get("photo_url"),
                "is_vaccinated": merged_snapshot.get("is_vaccinated", True),
                "temperament": merged_snapshot.get("temperament") or "Friendly",
                "health_condition": merged_snapshot.get("health_condition") or "Healthy",
                "notes": merged_snapshot.get("notes") or "",
                "status": "Removed",
                "removed_at": l.get("timestamp") or "Past Deletion",
                "description": f"Deleted pet record: {name or 'Pet'} (pet_id={target_id})",
                "timeline": pet_timeline
            })
            
    return {
        "current_pets": current_list,
        "removed_pets": removed_pets,
        "created_pets_history": created_pets_history,
        "all_logs": owner_logs
    }

from pydantic import BaseModel as PyBaseModel
from typing import Optional as PyOptional

@router.post("/{pet_id}/restore", response_model=PetResponse)
def restore_pet_by_id(pet_id: int, req: Request, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    db_pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    old_status = db_pet.status
    db_pet.status = "Active"
    db.commit()
    db.refresh(db_pet)
    
    # Auto-ensure QR Code exists
    try:
        from app.models.pet_qr import PetQRCode
        existing_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).first()
        if not existing_qr:
            from app.routes.pet_qr import generate_qr_for_pet_internal
            generate_qr_for_pet_internal(pet_id, db)
    except Exception as e:
        print(f"Warning checking QR code during pet restore: {e}")
        
    log_activity(
        db=db,
        action="RESTORE_PET",
        target_table="pets",
        target_id=pet_id,
        description=f"Restored pet record to Active: {db_pet.pet_name} (pet_id={pet_id})",
        log_type="operation",
        old_values={"status": old_status},
        new_values={"status": "Active"},
        request=req
    )
    return db_pet

class PetRestorePayload(PyBaseModel):
    pet_id: PyOptional[int] = None
    log_id: PyOptional[int] = None
    pet_name: PyOptional[str] = None
    pet_type: PyOptional[str] = "Dog"
    breed: PyOptional[str] = "Unknown"
    gender: PyOptional[str] = "Unknown"
    primary_color: PyOptional[str] = None
    secondary_color: PyOptional[str] = None
    tertiary_color: PyOptional[str] = None
    photo_url: PyOptional[str] = None
    owner_id: PyOptional[int] = None

@router.post("/restore")
def restore_pet(payload: PetRestorePayload, req: Request, db: Session = Depends(get_db)):
    from app.models.audit_log import AuditLog
    
    # If the pet already exists in database (e.g. archived), reactivate it directly!
    if payload.pet_id:
        existing_pet = db.query(Pet).filter(Pet.pet_id == payload.pet_id).first()
        if existing_pet:
            old_status = existing_pet.status
            existing_pet.status = "Active"
            if payload.pet_name:
                existing_pet.pet_name = payload.pet_name
            if payload.photo_url:
                existing_pet.photo_url = payload.photo_url
            db.commit()
            db.refresh(existing_pet)
            
            # Ensure QR code exists
            try:
                from app.models.pet_qr import PetQRCode
                existing_qr = db.query(PetQRCode).filter(PetQRCode.pet_id == existing_pet.pet_id).first()
                if not existing_qr:
                    from app.routes.pet_qr import generate_qr_for_pet_internal
                    generate_qr_for_pet_internal(existing_pet.pet_id, db)
            except Exception as e:
                print(f"Warning generating QR for restored pet {existing_pet.pet_id}: {e}")
                
            log_activity(
                db=db,
                action="RESTORE_PET",
                target_table="pets",
                target_id=existing_pet.pet_id,
                description=f"Restored pet record: {existing_pet.pet_name} (pet_id={existing_pet.pet_id})",
                log_type="operation",
                old_values={"status": old_status},
                new_values={"status": "Active"},
                request=req
            )
            return {
                "message": "Pet restored successfully",
                "pet": {
                    "pet_id": existing_pet.pet_id,
                    "pet_name": existing_pet.pet_name,
                    "pet_type": existing_pet.pet_type,
                    "breed": existing_pet.breed,
                    "status": existing_pet.status
                }
            }

    pet_data = {
        "pet_name": payload.pet_name or "Restored Pet",
        "pet_type": payload.pet_type or "Dog",
        "breed": payload.breed or "Unknown",
        "gender": payload.gender or "Unknown",
        "primary_color": payload.primary_color or "Brown",
        "secondary_color": payload.secondary_color,
        "tertiary_color": payload.tertiary_color,
        "photo_url": payload.photo_url,
        "owner_id": payload.owner_id or 1,
        "status": "Active"
    }
    
    # Try reconstructing from audit log if available
    if payload.log_id:
        log = db.query(AuditLog).filter(AuditLog.log_id == payload.log_id).first()
        if log:
            snapshot = log.old_values or log.new_values or {}
            if isinstance(snapshot, dict):
                pet_data["pet_name"] = snapshot.get("pet_name") or pet_data["pet_name"]
                pet_data["pet_type"] = snapshot.get("pet_type") or pet_data["pet_type"]
                pet_data["breed"] = snapshot.get("breed") or pet_data["breed"]
                pet_data["gender"] = snapshot.get("gender") or pet_data["gender"]
                pet_data["primary_color"] = snapshot.get("primary_color") or pet_data["primary_color"]
                pet_data["secondary_color"] = snapshot.get("secondary_color") or pet_data["secondary_color"]
                pet_data["tertiary_color"] = snapshot.get("tertiary_color") or pet_data["tertiary_color"]
                pet_data["photo_url"] = snapshot.get("photo_url") or pet_data["photo_url"]
                owner_id_val = snapshot.get("owner_id") or log.user_id or pet_data["owner_id"]
                if owner_id_val is not None:
                    pet_data["owner_id"] = int(cast(Any, owner_id_val))
    elif payload.pet_id:
        logs = db.query(AuditLog).filter(AuditLog.target_table == "pets", AuditLog.target_id == payload.pet_id).order_by(AuditLog.created_at.desc()).all()
        for log in logs:
            snapshot = log.old_values or log.new_values or {}
            if isinstance(snapshot, dict):
                if snapshot.get("pet_name"):
                    pet_data["pet_name"] = snapshot.get("pet_name")
                if snapshot.get("pet_type"):
                    pet_data["pet_type"] = snapshot.get("pet_type")
                if snapshot.get("breed"):
                    pet_data["breed"] = snapshot.get("breed")
                if snapshot.get("gender"):
                    pet_data["gender"] = snapshot.get("gender")
                if snapshot.get("primary_color"):
                    pet_data["primary_color"] = snapshot.get("primary_color")
                if snapshot.get("secondary_color"):
                    pet_data["secondary_color"] = snapshot.get("secondary_color")
                if snapshot.get("tertiary_color"):
                    pet_data["tertiary_color"] = snapshot.get("tertiary_color")
                if snapshot.get("photo_url"):
                    pet_data["photo_url"] = snapshot.get("photo_url")
                if snapshot.get("owner_id"):
                    pet_data["owner_id"] = int(cast(Any, snapshot.get("owner_id")))
                break

    valid_type = pet_data["pet_type"] if pet_data["pet_type"] in ["Dog", "Cat"] else "Dog"
    new_pet = Pet(
        owner_id=pet_data["owner_id"],
        pet_name=pet_data["pet_name"],
        pet_type=valid_type,
        breed=pet_data.get("breed") or "Unknown",
        gender=pet_data.get("gender") or "Unknown",
        primary_color=pet_data.get("primary_color") or "Brown",
        secondary_color=pet_data.get("secondary_color"),
        tertiary_color=pet_data.get("tertiary_color"),
        photo_url=pet_data.get("photo_url"),
        status="Active",
        is_vaccinated=True
    )
    db.add(new_pet)
    db.commit()
    db.refresh(new_pet)
    
    # Auto-generate QR code
    try:
        from app.routes.pet_qr import generate_qr_for_pet_internal
        generate_qr_for_pet_internal(new_pet.pet_id, db)
    except Exception as e:
        print(f"Failed to generate QR for restored pet {new_pet.pet_id}: {e}")

    log_activity(
        db=db,
        action="RESTORE_PET",
        target_table="pets",
        target_id=new_pet.pet_id,
        description=f"Restored pet record: {new_pet.pet_name} ({new_pet.pet_type}, new_id={new_pet.pet_id})",
        log_type="operation",
        new_values={"pet_name": new_pet.pet_name, "pet_type": new_pet.pet_type, "owner_id": new_pet.owner_id},
        request=req
    )
    return {
        "message": "Pet restored successfully",
        "pet": {
            "pet_id": new_pet.pet_id,
            "pet_name": new_pet.pet_name,
            "pet_type": new_pet.pet_type,
            "breed": new_pet.breed,
            "status": new_pet.status
        }
    }

@router.delete("/{pet_id}")
@router.post("/{pet_id}/remove")
def remove_pet(pet_id: int, req: Request, db: Session = Depends(get_db)):
    """
    Soft-archives a pet for removal.
    Does NOT hard-delete from the database.
    Preserves all reports, vaccination logs, QR records, and audit history.
    """
    from app.models.pet_claim import PetClaim
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    actor = get_actor_user(req, db)
    actor_role = actor.role_id if actor else None

    # Subdivision Leaders (role 2) and Barangay Staff (role 3) are strictly prohibited from removing pet records
    if actor and actor_role in (2, 3):
        role_label = "Subdivision Leaders" if actor_role == 2 else "Barangay Staff"
        raise HTTPException(
            status_code=403,
            detail=f"Permission Denied: {role_label} do not have permission to remove pet records. Only System Administrators can remove or archive pet records."
        )

    # Citizen (role 1) can only remove their own registered pet
    if actor and actor_role == 1 and db_pet.owner_id != actor.user_id:
        raise HTTPException(
            status_code=403,
            detail="Permission Denied: Residents can only remove their own registered pets."
        )

    old_status = db_pet.status
    pet_snapshot = {
        "pet_name": db_pet.pet_name,
        "pet_type": db_pet.pet_type,
        "breed": db_pet.breed,
        "gender": db_pet.gender,
        "primary_color": db_pet.primary_color,
        "secondary_color": db_pet.secondary_color,
        "tertiary_color": db_pet.tertiary_color,
        "status": old_status,
        "photo_url": db_pet.photo_url,
        "owner_id": db_pet.owner_id
    }

    # Soft-remove: mark pet as Archived
    db_pet.status = "Archived"

    # Invalidate any pending active AI match claims
    db.query(PetClaim).filter(
        PetClaim.pet_id == pet_id,
        PetClaim.status.in_(["Potential Owner Match", "Possible Match Found", "Pending Review"])
    ).delete(synchronize_session=False)

    db.commit()
    db.refresh(db_pet)

    actor_title = "Admin" if actor_role == 4 else ("Resident" if actor_role == 1 else "Officer")
    actor_name = actor.name if actor else actor_title

    log_activity(
        db=db,
        action="REMOVE_PET",
        target_table="pets",
        target_id=pet_id,
        description=f"{actor_title} {actor_name} removed pet from active list (Archived): {pet_snapshot['pet_name']} ({pet_snapshot['pet_type']}, pet_id={pet_id})",
        log_type="operation",
        old_values=pet_snapshot,
        new_values={"status": "Archived"},
        user_id=actor.user_id if actor else None,
        request=req
    )
    return {
        "message": "Pet removed and archived successfully",
        "pet_id": pet_id,
        "status": "Archived"
    }

def auto_extract_pet_colors(file_content: bytes, filename: str, db_pet: Pet):
    # If the pet already has valid colors assigned by user / registration form, DO NOT overwrite them!
    if db_pet.primary_color and db_pet.primary_color.strip() not in ['Unknown', 'None', '']:
        return

    try:
        from app.utils.color_detection import extract_dominant_colors
        import tempfile
        import os
        
        # Save image to a temp file for YOLOv8
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
            ext = '.jpg'
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_img:
            tmp_img.write(file_content)
            tmp_img_path = tmp_img.name
            
        try:
            model = get_yolo_model()
            results = model(tmp_img_path)
            
            detected = set()
            bboxes = []
            for r in results:
                for c, box in zip(r.boxes.cls, r.boxes.xyxy):
                    label = r.names[int(c)]
                    bbox = box.tolist()
                    if label.lower() == 'dog':
                        detected.add('Dog')
                        bboxes.append((bbox, 'Dog'))
                    elif label.lower() == 'cat':
                        detected.add('Cat')
                        bboxes.append((bbox, 'Cat'))
            
            animal_type = 'Dog' if 'Dog' in detected else ('Cat' if 'Cat' in detected else 'Unknown')
            
            dominant_colors_str = 'Unknown'
            if animal_type != 'Unknown':
                target_bbox = next((b for b, t in bboxes if t == animal_type), None)
                dominant_colors_str = extract_dominant_colors(file_content, target_bbox)
            else:
                dominant_colors_str = extract_dominant_colors(file_content)
                
            if dominant_colors_str and dominant_colors_str != 'Unknown':
                # Map dog color "Orange" or "Ginger" to standard "Brown", filter out non-coat colors (Green, Blue, Mixed)
                mapped = []
                for c in dominant_colors_str.split(','):
                    c_clean = c.strip()
                    if c_clean.lower() in ['green', 'blue', 'mixed color', 'unknown', 'none', '']:
                        continue
                    if animal_type == 'Dog' and c_clean.lower() in ['orange', 'ginger']:
                        mapped.append('Brown')
                    else:
                        mapped.append(c_clean)
                # De-duplicate
                seen = set()
                clean_colors = [x for x in mapped if not (x in seen or seen.add(x))]
                
                if len(clean_colors) > 0 and clean_colors[0]:
                    db_pet.primary_color = clean_colors[0]
                if len(clean_colors) > 1 and clean_colors[1]:
                    db_pet.secondary_color = clean_colors[1]
        finally:
            if os.path.exists(tmp_img_path):
                os.unlink(tmp_img_path)
    except Exception as e:
        print(f"Error auto extracting pet colors: {e}")

@router.post("/{pet_id}/photo")
async def upload_pet_photo(
    pet_id: int,
    file: Optional[UploadFile] = File(None),
    photo_url: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    target_url = photo_url or url
    try:
        if target_url:
            validate_cloudinary_url(target_url, allowed={'Image'})
            db_pet.photo_url = target_url
            db.commit()
            return {"photo_url": target_url}
        elif file:
            file_content = await file.read()
            image_url = upload_to_cloudinary(file_content, folder="pets", filename=file.filename)
            if not image_url:
                raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
            db_pet.photo_url = image_url
            auto_extract_pet_colors(file_content, file.filename or "", db_pet)
            db.commit()
            return {"photo_url": image_url}
        else:
            raise HTTPException(status_code=400, detail="Either file or photo_url must be provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/vaccine-card")
async def upload_vaccine_card(
    pet_id: int,
    file: Optional[UploadFile] = File(None),
    card_url: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    target_url = card_url or url
    try:
        if target_url:
            validate_cloudinary_url(target_url, allowed={'Image', 'Document'})
            db_pet.vaccine_card_url = target_url
            db.commit()
            return {"vaccine_card_url": target_url}
        elif file:
            file_content = await file.read()
            card_url_res = upload_to_cloudinary(file_content, folder="vaccines", filename=file.filename)
            if not card_url_res:
                raise HTTPException(status_code=500, detail="Failed to upload vaccine card to Cloudinary")
            db_pet.vaccine_card_url = card_url_res
            db.commit()
            return {"vaccine_card_url": card_url_res}
        else:
            raise HTTPException(status_code=400, detail="Either file or card_url must be provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-front")
async def upload_pet_photo_front(
    pet_id: int,
    file: Optional[UploadFile] = File(None),
    photo_front_url: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    target_url = photo_front_url or url
    try:
        if target_url:
            validate_cloudinary_url(target_url, allowed={'Image'})
            db_pet.photo_front_url = target_url
            db.commit()
            return {"photo_front_url": target_url}
        elif file:
            file_content = await file.read()
            image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
            if not image_url:
                raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
            db_pet.photo_front_url = image_url
            db.commit()
            return {"photo_front_url": image_url}
        else:
            raise HTTPException(status_code=400, detail="Either file or photo_front_url must be provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-left")
async def upload_pet_photo_left(
    pet_id: int,
    file: Optional[UploadFile] = File(None),
    photo_left_url: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    target_url = photo_left_url or url
    try:
        if target_url:
            validate_cloudinary_url(target_url, allowed={'Image'})
            db_pet.photo_left_url = target_url
            db.commit()
            return {"photo_left_url": target_url}
        elif file:
            file_content = await file.read()
            image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
            if not image_url:
                raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
            db_pet.photo_left_url = image_url
            db.commit()
            return {"photo_left_url": image_url}
        else:
            raise HTTPException(status_code=400, detail="Either file or photo_left_url must be provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-right")
async def upload_pet_photo_right(
    pet_id: int,
    file: Optional[UploadFile] = File(None),
    photo_right_url: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    target_url = photo_right_url or url
    try:
        if target_url:
            validate_cloudinary_url(target_url, allowed={'Image'})
            db_pet.photo_right_url = target_url
            db.commit()
            return {"photo_right_url": target_url}
        elif file:
            file_content = await file.read()
            image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
            if not image_url:
                raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
            db_pet.photo_right_url = image_url
            db.commit()
            return {"photo_right_url": image_url}
        else:
            raise HTTPException(status_code=400, detail="Either file or photo_right_url must be provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{pet_id}/permanent")
def delete_pet_record(pet_id: int, db: Session = Depends(get_db)):
    """
    Permanently delete a pet record and safely clean up related references:
    - Pet QR codes
    - AI Report Matches
    - Pet Claims
    - Unlinks reports referencing this pet
    """
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    try:
        # 1. Clean up QR Codes
        from app.models.pet_qr import PetQRCode
        db.query(PetQRCode).filter(PetQRCode.pet_id == pet_id).delete(synchronize_session=False)

        # 2. Clean up AI Matches
        from app.models.report_match import ReportMatch
        db.query(ReportMatch).filter(ReportMatch.matched_pet_id == pet_id).delete(synchronize_session=False)

        # 3. Clean up Pet Claims
        from app.models.pet_claim import PetClaim
        db.query(PetClaim).filter(PetClaim.pet_id == pet_id).delete(synchronize_session=False)

        # 4. Unlink Reports pointing to this pet
        from app.models.report import Report
        db.query(Report).filter(Report.pet_id == pet_id).update({"pet_id": None}, synchronize_session=False)

        # 5. Delete the pet
        db.delete(db_pet)
        db.commit()
        return {"message": f"Pet #{pet_id} '{db_pet.pet_name}' was successfully removed from records."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete pet: {str(e)}")

