import os
import sys
import json
import urllib.request
import urllib.parse
from datetime import date
from decimal import Decimal
from dotenv import load_dotenv

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Load environment variables
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(dotenv_path)

from app.database import SessionLocal
from app.models.user import User, Role, Subdivision, Barangay
from app.models.pet import Pet
from app.routes.pet_qr import generate_qr_for_pet_internal
from app.utils.auth import get_password_hash

CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "du6iy39p5")
UPLOAD_PRESET = os.getenv("CLOUDINARY_UPLOAD_PRESET", "straysafe_unsigned")
DEFAULT_PASSWORD = "password123"

SAMPLE_DATA = [
    {
        "resident": {
            "name": "Mateo Santos",
            "email": "resident_mateo@straysafe.com",
            "phone": "+639171010001",
            "address": "Phase 1 Block 3 Lot 5, Selera Homes",
            "latitude": Decimal("14.80165000"),
            "longitude": Decimal("120.98562000"),
        },
        "pet": {
            "name": "Max",
            "species": "Dog",
            "breed": "Golden Retriever",
            "gender": "Male",
            "estimated_age": "3 years",
            "birth_date": date(2023, 4, 15),
            "weight": Decimal("28.5"),
            "size_category": "Large",
            "primary_color": "Golden",
            "secondary_color": "Cream",
            "tertiary_color": None,
            "color_markings": "Cream chest patch",
            "distinctive_markings": "Friendly expression, slight wave on back coat",
            "temperament": "Friendly",
            "health_condition": "Healthy and active, complete DHPP and Anti-Rabies vaccinations",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 3, 10),
            "is_neutered": True,
            "image_source": "https://cdn4.thedogapi.com/optimized/X9w40D9ojT.jpg"
        }
    },
    {
        "resident": {
            "name": "Bea Valencia",
            "email": "resident_bea@straysafe.com",
            "phone": "+639171010002",
            "address": "Phase 1 Block 4 Lot 12, Selera Homes",
            "latitude": Decimal("14.80182000"),
            "longitude": Decimal("120.98545000"),
        },
        "pet": {
            "name": "Luna",
            "species": "Cat",
            "breed": "Siamese",
            "gender": "Female",
            "estimated_age": "2 years",
            "birth_date": date(2024, 2, 20),
            "weight": Decimal("3.8"),
            "size_category": "Small",
            "primary_color": "Cream",
            "secondary_color": "Brown",
            "tertiary_color": None,
            "color_markings": "Seal point face, ears, and paws",
            "distinctive_markings": "Vivid deep blue almond eyes, dark brown tail",
            "temperament": "Friendly",
            "health_condition": "Fully vaccinated with FVRCP and Rabies",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 2, 14),
            "is_neutered": True,
            "image_source": "https://cdn2.thecatapi.com/images/Xwp-MBOtI.jpg"
        }
    },
    {
        "resident": {
            "name": "Carlos Mendoza",
            "email": "resident_carlos@straysafe.com",
            "phone": "+639171010003",
            "address": "Phase 1 Block 5 Lot 8, Selera Homes",
            "latitude": Decimal("14.80145000"),
            "longitude": Decimal("120.98585000"),
        },
        "pet": {
            "name": "Rocky",
            "species": "Dog",
            "breed": "German Shepherd",
            "gender": "Male",
            "estimated_age": "4 years",
            "birth_date": date(2022, 6, 10),
            "weight": Decimal("34.0"),
            "size_category": "Large",
            "primary_color": "Black",
            "secondary_color": "Tan",
            "tertiary_color": None,
            "color_markings": "Classic black saddle with rich tan legs and chest",
            "distinctive_markings": "Erect pointed ears, black muzzle mask",
            "temperament": "Protective",
            "health_condition": "Healthy, microchipped, up to date on 5-in-1 vaccine",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 1, 20),
            "is_neutered": False,
            "image_source": "https://cdn4.thedogapi.com/optimized/kc6oAx2b3X.jpg"
        }
    },
    {
        "resident": {
            "name": "Sofia Reyes",
            "email": "resident_sofia@straysafe.com",
            "phone": "+639171010004",
            "address": "Phase 1 Block 6 Lot 2, Selera Homes",
            "latitude": Decimal("14.80132000"),
            "longitude": Decimal("120.98528000"),
        },
        "pet": {
            "name": "Bella",
            "species": "Dog",
            "breed": "Beagle",
            "gender": "Female",
            "estimated_age": "2 years",
            "birth_date": date(2024, 5, 8),
            "weight": Decimal("10.5"),
            "size_category": "Medium",
            "primary_color": "Brown",
            "secondary_color": "Black",
            "tertiary_color": "White",
            "color_markings": "Tri-color coat with white blaze, chest, and white-tipped tail",
            "distinctive_markings": "Droopy hound ears, white muzzle stripe",
            "temperament": "Friendly",
            "health_condition": "Healthy, routine dewormed and anti-rabies updated",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 4, 18),
            "is_neutered": True,
            "image_source": "https://storage.googleapis.com/dog-api-uploads-prod/originals/076906f8-69d2-41be-957b-9542e1e36bbc.jpeg"
        }
    },
    {
        "resident": {
            "name": "Gabriel Castro",
            "email": "resident_gabriel@straysafe.com",
            "phone": "+639171010005",
            "address": "Phase 1 Block 7 Lot 15, Selera Homes",
            "latitude": Decimal("14.80195000"),
            "longitude": Decimal("120.98575000"),
        },
        "pet": {
            "name": "Simba",
            "species": "Cat",
            "breed": "Persian",
            "gender": "Male",
            "estimated_age": "3 years",
            "birth_date": date(2023, 8, 12),
            "weight": Decimal("4.5"),
            "size_category": "Small",
            "primary_color": "White",
            "secondary_color": None,
            "tertiary_color": None,
            "color_markings": "Solid pure white longhair coat",
            "distinctive_markings": "Round copper eyes, short brachycephalic nose, plush ruff",
            "temperament": "Friendly",
            "health_condition": "Regularly groomed, feline leukemia negative, core vaccines complete",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 3, 25),
            "is_neutered": True,
            "image_source": "https://cdn2.thecatapi.com/images/Pqtwt4FCq.jpg"
        }
    },
    {
        "resident": {
            "name": "Patricia Lim",
            "email": "resident_patricia@straysafe.com",
            "phone": "+639171010006",
            "address": "Phase 1 Block 8 Lot 9, Selera Homes",
            "latitude": Decimal("14.80155000"),
            "longitude": Decimal("120.98515000"),
        },
        "pet": {
            "name": "Milo",
            "species": "Dog",
            "breed": "Labrador Retriever",
            "gender": "Male",
            "estimated_age": "1 year",
            "birth_date": date(2025, 3, 1),
            "weight": Decimal("26.0"),
            "size_category": "Large",
            "primary_color": "Black",
            "secondary_color": None,
            "tertiary_color": None,
            "color_markings": "Solid sleek black coat",
            "distinctive_markings": "Thick otter tail, expressive warm brown eyes",
            "temperament": "Friendly",
            "health_condition": "Full puppy vaccination series completed",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 4, 5),
            "is_neutered": False,
            "image_source": "https://cdn4.thedogapi.com/optimized/BE5AcsNMdm.jpg"
        }
    },
    {
        "resident": {
            "name": "Rafael Tan",
            "email": "resident_rafael@straysafe.com",
            "phone": "+639171010007",
            "address": "Phase 1 Block 9 Lot 3, Selera Homes",
            "latitude": Decimal("14.80170000"),
            "longitude": Decimal("120.98595000"),
        },
        "pet": {
            "name": "Oreo",
            "species": "Dog",
            "breed": "Siberian Husky",
            "gender": "Male",
            "estimated_age": "2 years",
            "birth_date": date(2024, 7, 19),
            "weight": Decimal("23.0"),
            "size_category": "Medium",
            "primary_color": "Black",
            "secondary_color": "White",
            "tertiary_color": "Gray",
            "color_markings": "Classic black and white facial mask, white underbelly and socks",
            "distinctive_markings": "Striking icy blue eyes, bushy curved tail",
            "temperament": "Friendly",
            "health_condition": "Excellent health, annual rabies booster up to date",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 2, 28),
            "is_neutered": True,
            "image_source": "https://cdn2.thedogapi.com/images/S17ZilqNm_1280.jpg"
        }
    },
    {
        "resident": {
            "name": "Chloe Bautista",
            "email": "resident_chloe@straysafe.com",
            "phone": "+639171010008",
            "address": "Phase 1 Block 10 Lot 18, Selera Homes",
            "latitude": Decimal("14.80120000"),
            "longitude": Decimal("120.98540000"),
        },
        "pet": {
            "name": "Nala",
            "species": "Cat",
            "breed": "British Shorthair",
            "gender": "Female",
            "estimated_age": "2 years",
            "birth_date": date(2024, 4, 11),
            "weight": Decimal("4.2"),
            "size_category": "Small",
            "primary_color": "Gray",
            "secondary_color": None,
            "tertiary_color": None,
            "color_markings": "Uniform dense blue-gray plush coat",
            "distinctive_markings": "Round cheeks, brilliant amber-gold eyes",
            "temperament": "Friendly",
            "health_condition": "Indoor cat, vaccinated and regular vet checked",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 3, 15),
            "is_neutered": True,
            "image_source": "https://cdn2.thecatapi.com/images/HYTJQgs2M.jpg"
        }
    },
    {
        "resident": {
            "name": "Daniel Ramos",
            "email": "resident_daniel@straysafe.com",
            "phone": "+639171010009",
            "address": "Phase 1 Block 11 Lot 7, Selera Homes",
            "latitude": Decimal("14.80138000"),
            "longitude": Decimal("120.98570000"),
        },
        "pet": {
            "name": "Bruno",
            "species": "Dog",
            "breed": "Boxer",
            "gender": "Male",
            "estimated_age": "3 years",
            "birth_date": date(2023, 9, 5),
            "weight": Decimal("30.5"),
            "size_category": "Large",
            "primary_color": "Tan",
            "secondary_color": "White",
            "tertiary_color": "Black",
            "color_markings": "Fawn body, black mask around eyes/muzzle, white chest star",
            "distinctive_markings": "Muscular build, docked tail, floppy natural ears",
            "temperament": "Friendly",
            "health_condition": "Athletic, fully vaccinated and dewormed",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 1, 15),
            "is_neutered": True,
            "image_source": "https://storage.googleapis.com/dog-api-uploads-prod/originals/25802549-e31b-457c-89d9-062e6d47469e.jpeg"
        }
    },
    {
        "resident": {
            "name": "Elena Cruz",
            "email": "resident_elena@straysafe.com",
            "phone": "+639171010010",
            "address": "Phase 1 Block 12 Lot 14, Selera Homes",
            "latitude": Decimal("14.80188000"),
            "longitude": Decimal("120.98532000"),
        },
        "pet": {
            "name": "Cleo",
            "species": "Cat",
            "breed": "Bengal",
            "gender": "Female",
            "estimated_age": "1 year",
            "birth_date": date(2025, 5, 22),
            "weight": Decimal("4.0"),
            "size_category": "Small",
            "primary_color": "Orange",
            "secondary_color": "Black",
            "tertiary_color": "Cream",
            "color_markings": "Brown rosetted leopard print over warm golden background",
            "distinctive_markings": "M-shaped forehead tabby marking, luminous green eyes",
            "temperament": "Friendly",
            "health_condition": "Active, playful, complete feline immunizations",
            "is_vaccinated": True,
            "vaccination_date": date(2026, 4, 30),
            "is_neutered": True,
            "image_source": "https://cdn2.thecatapi.com/images/dN6eoeLjY.jpg"
        }
    }
]

def upload_to_cloudinary(source_url: str) -> str:
    """Uploads an image URL to Cloudinary unsigned preset and returns the secure Cloudinary URL."""
    payload = urllib.parse.urlencode({
        "file": source_url,
        "upload_preset": UPLOAD_PRESET,
        "folder": "pets"
    }).encode("utf-8")
    
    endpoint = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload"
    req = urllib.request.Request(endpoint, data=payload, headers={"User-Agent": "StraySafe-Seeder/2.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["secure_url"]

def seed_sample_residents():
    db = SessionLocal()
    try:
        # Check default subdivision and barangay
        subd = db.query(Subdivision).first()
        subd_id = subd.subdivision_id if subd else 1
        brgy_id = subd.barangay_id if subd else 1
        
        hashed_password = get_password_hash(DEFAULT_PASSWORD)
        
        inserted_records = []
        
        for idx, item in enumerate(SAMPLE_DATA, start=1):
            r_data = item["resident"]
            p_data = item["pet"]
            
            # 1. Check if user already exists
            user = db.query(User).filter(User.email == r_data["email"]).first()
            if not user:
                user = User(
                    name=r_data["name"],
                    email=r_data["email"],
                    password=hashed_password,
                    phone=r_data["phone"],
                    role_id=1,  # Citizen / Resident
                    position_id=None,
                    subdivision_id=subd_id,
                    barangay_id=brgy_id,
                    is_head_officer=False,
                    address=r_data["address"],
                    latitude=r_data["latitude"],
                    longitude=r_data["longitude"],
                    status="Active",
                    is_verified=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"[{idx}/10] Created Resident User: {user.name} (ID: {user.user_id}, {user.email})")
            else:
                print(f"[{idx}/10] Resident User exists: {user.name} (ID: {user.user_id})")
                
            # 2. Check if pet already exists for this owner
            pet = db.query(Pet).filter(Pet.owner_id == user.user_id, Pet.pet_name == p_data["name"]).first()
            if not pet:
                print(f"   Uploading pet photo for {p_data['name']} ({p_data['breed']})...")
                cloudinary_photo_url = upload_to_cloudinary(p_data["image_source"])
                print(f"   Photo uploaded: {cloudinary_photo_url}")
                
                pet = Pet(
                    owner_id=user.user_id,
                    pet_name=p_data["name"],
                    pet_type=p_data["species"],
                    breed=p_data["breed"],
                    gender=p_data["gender"],
                    estimated_age=p_data["estimated_age"],
                    birth_date=p_data["birth_date"],
                    weight=p_data["weight"],
                    size_category=p_data["size_category"],
                    primary_color=p_data["primary_color"],
                    secondary_color=p_data["secondary_color"],
                    tertiary_color=p_data["tertiary_color"],
                    color_markings=p_data["color_markings"],
                    distinctive_markings=p_data["distinctive_markings"],
                    temperament=p_data["temperament"],
                    health_condition=p_data["health_condition"],
                    is_vaccinated=p_data["is_vaccinated"],
                    vaccination_date=p_data["vaccination_date"],
                    is_neutered=p_data["is_neutered"],
                    status="Active",
                    is_verified=True,
                    photo_url=cloudinary_photo_url,
                    registered_address=r_data["address"],
                    registered_latitude=r_data["latitude"],
                    registered_longitude=r_data["longitude"],
                    emergency_contact_name=user.name,
                    emergency_contact_phone=user.phone,
                    registered_by_user_id=user.user_id,
                    registered_by_name=user.name
                )
                db.add(pet)
                db.commit()
                db.refresh(pet)
                
                # Auto-generate QR code
                try:
                    generate_qr_for_pet_internal(pet.pet_id, db)
                    print(f"   QR Code successfully generated for Pet ID {pet.pet_id}")
                except Exception as qr_err:
                    print(f"   Warning on QR generation for Pet ID {pet.pet_id}: {qr_err}")
                
                print(f"   Created Pet: {pet.pet_name} ({pet.breed}, Ref: {pet.reference_code})")
            else:
                print(f"   Pet already exists: {pet.pet_name} (ID: {pet.pet_id})")
                
            inserted_records.append({
                "owner_id": user.user_id,
                "owner_name": user.name,
                "owner_email": user.email,
                "pet_id": pet.pet_id,
                "pet_name": pet.pet_name,
                "species": pet.pet_type,
                "breed": pet.breed,
                "ref_code": pet.reference_code,
                "photo_url": pet.photo_url
            })
            
        print("\n" + "="*90)
        print("SEEDING COMPLETED SUCCESSFULLY!")
        print("="*90)
        print(f"{'#':<3} | {'OWNER NAME':<18} | {'EMAIL':<30} | {'PET NAME':<8} | {'BREED':<18} | {'REF CODE'}")
        print("-" * 90)
        for i, rec in enumerate(inserted_records, start=1):
            print(f"{i:<3} | {rec['owner_name']:<18} | {rec['owner_email']:<30} | {rec['pet_name']:<8} | {rec['breed']:<18} | {rec['ref_code']}")
        print("="*90)
        print(f"Default password for all sample accounts: {DEFAULT_PASSWORD}\n")
        
    finally:
        db.close()

if __name__ == "__main__":
    seed_sample_residents()

