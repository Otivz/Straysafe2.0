import sys
from app.database import SessionLocal
from app.models.pet import Pet
from app.models.user import User

def test_soft_remove():
    db = SessionLocal()
    try:
        # Check active pets
        pets = db.query(Pet).all()
        print(f"Total pets in DB: {len(pets)}")
        for p in pets[:5]:
            print(f"  Pet ID: {p.pet_id}, Name: {p.pet_name}, Status: {p.status}")
    finally:
        db.close()

if __name__ == "__main__":
    test_soft_remove()
