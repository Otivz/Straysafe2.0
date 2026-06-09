from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.pet import Pet
from app.models.user import User
from app.schemas.pet import PetCreate, PetUpdate, PetResponse
from app.utils.cloudinary_config import upload_to_cloudinary
from app.utils.audit import log_activity

router = APIRouter(
    prefix="/pets",
    tags=["pets"]
)

@router.get("/", response_model=List[PetResponse])
def get_pets(db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    return db.query(Pet).options(joinedload(Pet.owner)).all()

@router.get("/{pet_id}", response_model=PetResponse)
def get_pet(pet_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet

@router.get("/owner/{owner_id}", response_model=List[PetResponse])
def get_owner_pets(owner_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    return db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.owner_id == owner_id).all()

@router.get("/subdivision/{subdivision_id}", response_model=List[PetResponse])
def get_subdivision_pets(subdivision_id: int, db: Session = Depends(get_db)):
    from app.models.user import User
    from sqlalchemy.orm import joinedload
    return db.query(Pet).join(User).filter(User.subdivision_id == subdivision_id).options(joinedload(Pet.owner)).all()

@router.post("/", response_model=PetResponse)
def create_pet(pet: PetCreate, req: Request, db: Session = Depends(get_db)):
    db_pet = Pet(**pet.model_dump())
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
        new_values={"pet_name": db_pet.pet_name, "pet_type": str(db_pet.pet_type), "owner_id": db_pet.owner_id},
        request=req
    )
    return db_pet

@router.put("/{pet_id}", response_model=PetResponse)
def update_pet(pet_id: int, pet_update: PetUpdate, req: Request, db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    old_snapshot = {"pet_name": db_pet.pet_name, "pet_type": str(db_pet.pet_type), "status": str(db_pet.status)}
    update_data = pet_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_pet, key, value)
    
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
        new_values={"pet_name": db_pet.pet_name, "pet_type": str(db_pet.pet_type), "status": str(db_pet.status)},
        request=req
    )
    return db_pet

@router.delete("/{pet_id}")
def delete_pet(pet_id: int, req: Request, db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    pet_snapshot = {"pet_name": db_pet.pet_name, "pet_type": str(db_pet.pet_type), "owner_id": db_pet.owner_id}
    db.delete(db_pet)
    db.commit()
    log_activity(
        db=db,
        action="DELETE_PET",
        target_table="pets",
        target_id=pet_id,
        description=f"Deleted pet record: {pet_snapshot['pet_name']} (pet_id={pet_id})",
        log_type="operation",
        old_values=pet_snapshot,
        request=req
    )
    return {"message": "Pet deleted successfully"}

def auto_extract_pet_colors(file_content: bytes, filename: str, db_pet: Pet):
    try:
        from ultralytics import YOLO
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
            model = YOLO('yolov8n.pt')
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
                # Map dog color "Orange" or "Ginger" to standard "Brown"
                mapped = []
                for c in dominant_colors_str.split(','):
                    c_clean = c.strip()
                    if animal_type == 'Dog' and c_clean.lower() in ['orange', 'ginger']:
                        mapped.append('Brown')
                    else:
                        mapped.append(c_clean)
                # De-duplicate
                seen = set()
                clean_colors = [x for x in mapped if not (x in seen or seen.add(x))]
                
                if len(clean_colors) > 0 and clean_colors[0] and clean_colors[0] != 'Mixed Color':
                    db_pet.primary_color = clean_colors[0]
                if len(clean_colors) > 1 and clean_colors[1] and clean_colors[1] != 'Mixed Color':
                    db_pet.secondary_color = clean_colors[1]
        finally:
            if os.path.exists(tmp_img_path):
                os.unlink(tmp_img_path)
    except Exception as e:
        print(f"Error auto extracting pet colors: {e}")

@router.post("/{pet_id}/photo")
async def upload_pet_photo(pet_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    try:
        # Read file content
        file_content = await file.read()
        image_url = upload_to_cloudinary(file_content, folder="pets", filename=file.filename)
        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
            
        db_pet.photo_url = image_url
        auto_extract_pet_colors(file_content, file.filename or "", db_pet)
        db.commit()
        return {"photo_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/vaccine-card")
async def upload_vaccine_card(pet_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    try:
        # Read file content
        file_content = await file.read()
        card_url = upload_to_cloudinary(file_content, folder="vaccines", filename=file.filename)
        if not card_url:
            raise HTTPException(status_code=500, detail="Failed to upload vaccine card to Cloudinary")
            
        db_pet.vaccine_card_url = card_url
        db.commit()
        return {"vaccine_card_url": card_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-front")
async def upload_pet_photo_front(pet_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    try:
        file_content = await file.read()
        image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
        db_pet.photo_front_url = image_url
        auto_extract_pet_colors(file_content, file.filename or "", db_pet)
        db.commit()
        return {"photo_front_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-left")
async def upload_pet_photo_left(pet_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    try:
        file_content = await file.read()
        image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
        db_pet.photo_left_url = image_url
        auto_extract_pet_colors(file_content, file.filename or "", db_pet)
        db.commit()
        return {"photo_left_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pet_id}/photo-right")
async def upload_pet_photo_right(pet_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    try:
        file_content = await file.read()
        image_url = upload_to_cloudinary(file_content, folder="pets/sides", filename=file.filename)
        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to upload image to Cloudinary")
        db_pet.photo_right_url = image_url
        auto_extract_pet_colors(file_content, file.filename or "", db_pet)
        db.commit()
        return {"photo_right_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

