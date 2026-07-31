import sys
import os

# Add the root directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models.user import User, Role, Subdivision, Barangay, Position
from app.models.report import ReportCategory
from app.utils.auth import get_password_hash
from dotenv import load_dotenv

# Explicitly load .env from project root
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(dotenv_path)

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

        # 3.5 Seed Report Categories
        print("Seeding report categories...")
        categories = {
            1: 'Injured',
            2: 'Aggressive',
            3: 'Rabies Risk',
            4: 'Roaming',
            5: 'Rescue Needed'
        }
        for cat_id, cat_name in categories.items():
            cat = db.query(ReportCategory).filter(ReportCategory.category_id == cat_id).first()
            if not cat:
                db.add(ReportCategory(category_id=cat_id, category_name=cat_name))
            else:
                cat.category_name = cat_name
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
                "email": os.getenv("CITIZEN_EMAIL") or "emmanuelvitocruz@gmail.com",
                "phone": "09171234567",
                "role_id": 1, # Citizen
                "subdivision_id": 1,
                "address": "Block 5 Lot 12, Selera Homes, San Vicente, Santa Maria, Bulacan",
                "latitude": 14.80131300,
                "longitude": 121.00310900,
                "profile_picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop",
                "status": "Active",
                "is_verified": True
            },
            {
                "name": "Maria Clara Santos",
                "email": "resident2@straysafe.com",
                "phone": "09189876543",
                "role_id": 1, # Citizen
                "subdivision_id": 1,
                "address": "Block 8 Lot 24, Selera Homes, San Vicente, Santa Maria, Bulacan",
                "latitude": 14.80095000,
                "longitude": 121.00355000,
                "profile_picture": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop",
                "status": "Active",
                "is_verified": True
            },
            {
                "name": "Kyla Joy Arriola",
                "email": os.getenv("SUBD_LEADER_EMAIL") or "kylajoyarriola@gmail.com",
                "phone": "09192223344",
                "role_id": 2, # Subdivision Leader
                "subdivision_id": 1,
                "position_id": db.query(Position).filter(Position.position_name == "President").first().position_id if db.query(Position).filter(Position.position_name == "President").first() else 1,
                "address": "Block 1 Lot 2, Selera Homes, San Vicente, Santa Maria, Bulacan",
                "latitude": 14.80180000,
                "longitude": 121.00280000,
                "profile_picture": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop",
                "status": "Active",
                "is_verified": True
            },
            {
                "name": "Kyla Bianca Frias",
                "email": os.getenv("BRGY_STAFF_EMAIL") or "kylabiancafrias@gmail.com",
                "phone": "09205556677",
                "role_id": 3, # Barangay Staff
                "position_id": db.query(Position).filter(Position.position_name == "Barangay Captain").first().position_id if db.query(Position).filter(Position.position_name == "Barangay Captain").first() else 6,
                "address": "Barangay Hall, San Vicente, Santa Maria, Bulacan",
                "latitude": 14.80690600,
                "longitude": 121.00392970,
                "profile_picture": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop",
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
                    phone=user_data.get("phone"),
                    role_id=user_data["role_id"],
                    subdivision_id=user_data.get("subdivision_id"),
                    position_id=user_data.get("position_id"),
                    address=user_data.get("address"),
                    latitude=user_data.get("latitude"),
                    longitude=user_data.get("longitude"),
                    profile_picture=user_data.get("profile_picture"),
                    status=user_data["status"],
                    is_verified=user_data["is_verified"]
                )
                db.add(new_user)
            else:
                print(f"User {user_data['email']} exists. Updating complete details...")
                user.name = user_data["name"]
                user.role_id = user_data["role_id"]
                user.phone = user_data.get("phone")
                user.address = user_data.get("address")
                user.latitude = user_data.get("latitude")
                user.longitude = user_data.get("longitude")
                user.profile_picture = user_data.get("profile_picture")
                user.status = user_data["status"]
                user.is_verified = user_data["is_verified"]
                if "subdivision_id" in user_data:
                    user.subdivision_id = user_data["subdivision_id"]
                if "position_id" in user_data:
                    user.position_id = user_data["position_id"]

        # 6. Seed Admin User
        admin_email = os.getenv("ADMIN_EMAIL", "admin@straysafe.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "password123")
        
        admin = db.query(User).filter(User.email == admin_email).first()
        hashed_admin_password = get_password_hash(admin_password)
        
        if not admin:
            print(f"Creating default admin: {admin_email}")
            new_admin = User(
                name="System Admin",
                email=admin_email,
                password=hashed_admin_password,
                phone="09110001111",
                role_id=4,
                address="StraySafe HQ, Santa Maria, Bulacan",
                latitude=14.80690600,
                longitude=121.00392970,
                profile_picture="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop",
                status="Active",
                is_verified=True
            )
            db.add(new_admin)
        else:
            print(f"Admin user {admin_email} exists. Updating details...")
            admin.password = hashed_admin_password
            admin.role_id = 4
            admin.phone = "09110001111"
            admin.address = "StraySafe HQ, Santa Maria, Bulacan"
            admin.latitude = 14.80690600
            admin.longitude = 121.00392970
            admin.profile_picture = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop"
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
