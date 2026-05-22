import sys
import os

# Add the root directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.user import User, Role, Subdivision, Barangay, Position
from app.utils.auth import get_password_hash
from dotenv import load_dotenv

# Explicitly load .env
load_dotenv()

def seed_db():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Seed Roles
        print("Seeding roles...")
        roles = {
            1: 'Citizen',
            2: 'Subdivision Leader',
            3: 'Barangay Staff',
            4: 'Admin'
        }
        for r_id, r_name in roles.items():
            role = db.query(Role).filter(Role.role_id == r_id).first()
            if not role:
                db.add(Role(role_id=r_id, role_name=r_name))
        db.commit()

        # 2. Seed Positions
        print("Seeding positions...")
        positions = [
            'President',
            'Secretary',
            'Barangay Staff',
            'Tanod',
            'Animal Rescuer',
            'Barangay Captain'
        ]
        for p_name in positions:
            pos = db.query(Position).filter(Position.position_name == p_name).first()
            if not pos:
                db.add(Position(position_name=p_name))
        db.commit()

        # 3. Seed Barangay
        print("Seeding barangay...")
        barangay = db.query(Barangay).filter(Barangay.barangay_id == 1).first()
        if not barangay:
            barangay = Barangay(barangay_id=1, barangay_name='San Vicente', city='Angeles City')
            db.add(barangay)
            db.commit()

        # 4. Seed Subdivisions
        print("Seeding subdivisions...")
        subdivisions = [
            {'id': 1, 'name': 'Selera Homes', 'barangay_id': 1}
        ]
        for sub in subdivisions:
            subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == sub['id']).first()
            if not subdivision:
                db.add(Subdivision(subdivision_id=sub['id'], subdivision_name=sub['name'], barangay_id=sub['barangay_id']))
        db.commit()

        # 5. Seed Users
        print("Seeding users...")
        seed_password = os.getenv("SEED_PASSWORD", "password123")
        default_password_hash = get_password_hash(seed_password)
        
        users_to_seed = [
            {
                "name": "Emmanuel Vito Cruz",
                "email": os.getenv("CITIZEN_EMAIL"),
                "role_id": 1, # Citizen
                "status": "Active",
                "is_verified": True
            },
            {
                "name": "Kyla Joy Arriola",
                "email": os.getenv("SUBD_LEADER_EMAIL"),
                "role_id": 2, # Subdivision Leader
                "subdivision_id": 1,
                "status": "Active",
                "is_verified": True
            },
            {
                "name": "Kyla Bianca Frias",
                "email": os.getenv("BRGY_STAFF_EMAIL"),
                "role_id": 3, # Barangay Staff
                "position_id": db.query(Position).filter(Position.position_name == "Barangay Captain").first().position_id,
                "status": "Active",
                "is_verified": True
            }
        ]

        for user_data in users_to_seed:
            if not user_data["email"]:
                print(f"Skipping seeding for {user_data['name']} (email not found in .env)")
                continue

            user = db.query(User).filter(User.email == user_data["email"]).first()
            if not user:
                print(f"Creating user: {user_data['email']}")
                new_user = User(
                    name=user_data["name"],
                    email=user_data["email"],
                    password=default_password_hash,
                    role_id=user_data["role_id"],
                    subdivision_id=user_data.get("subdivision_id"),
                    position_id=user_data.get("position_id"),
                    status=user_data["status"],
                    is_verified=user_data["is_verified"]
                )
                db.add(new_user)
            else:
                print(f"User {user_data['email']} exists. Updating role and status...")
                user.role_id = user_data["role_id"]
                user.status = user_data["status"]
                user.is_verified = user_data["is_verified"]
                if "subdivision_id" in user_data:
                    user.subdivision_id = user_data["subdivision_id"]
                if "position_id" in user_data:
                    user.position_id = user_data["position_id"]

        # 6. Seed Admin User
        admin_email = os.getenv("ADMIN_EMAIL")
        admin_password = os.getenv("ADMIN_PASSWORD")
        
        admin = db.query(User).filter(User.email == admin_email).first()
        hashed_admin_password = get_password_hash(admin_password)
        
        if not admin:
            print(f"Creating default admin: {admin_email}")
            new_admin = User(
                name="System Admin",
                email=admin_email,
                password=hashed_admin_password,
                role_id=4,
                status="Active",
                is_verified=True
            )
            db.add(new_admin)
        else:
            print(f"Admin user {admin_email} exists. Updating password...")
            admin.password = hashed_admin_password
            admin.role_id = 4
            admin.status = "Active"
            admin.is_verified = True
            
        db.commit()
        print("Database seeding completed successfully!")
            
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
