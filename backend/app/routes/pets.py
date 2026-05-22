from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.pet import Pet
from app.schemas.pet import PetCreate, PetUpdate, PetResponse
from app.utils.cloudinary_config import upload_to_cloudinary

router = APIRouter(
    prefix="/pets",
    tags=["pets"]
)

@router.get("/", response_model=List[PetResponse])
def get_pets(db: Session = Depends(get_db)):
    return db.query(Pet).all()

@router.get("/{pet_id}", response_model=PetResponse)
def get_pet(pet_id: int, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet

@router.get("/owner/{owner_id}", response_model=List[PetResponse])
def get_owner_pets(owner_id: int, db: Session = Depends(get_db)):
    return db.query(Pet).filter(Pet.owner_id == owner_id).all()

@router.post("/", response_model=PetResponse)
def create_pet(pet: PetCreate, db: Session = Depends(get_db)):
    db_pet = Pet(**pet.model_dump())
    db.add(db_pet)
    db.commit()
    db.refresh(db_pet)
    return db_pet

@router.put("/{pet_id}", response_model=PetResponse)
def update_pet(pet_id: int, pet_update: PetUpdate, db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    
    update_data = pet_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_pet, key, value)
    
    db.commit()
    db.refresh(db_pet)
    return db_pet

@router.delete("/{pet_id}")
def delete_pet(pet_id: int, db: Session = Depends(get_db)):
    db_pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    db.delete(db_pet)
    db.commit()
    return {"message": "Pet deleted successfully"}

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
        db.commit()
        return {"photo_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
