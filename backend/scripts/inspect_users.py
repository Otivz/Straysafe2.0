import os
import sys

# Ensure the app directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User

def list_users():
    """Utility script to audit all users and their roles in the database."""
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.role_id, User.user_id).all()
        
        print("\n" + "="*80)
        print(f"{'ID':<4} | {'NAME':<25} | {'EMAIL':<30} | {'ROLE':<5}")
        print("-" * 80)
        
        for u in users:
            # Role 1: Citizen, 2: Subd Leader, 3: Brgy Staff, 5: Admin
            print(f"{u.user_id:<4} | {u.name:<25} | {u.email:<30} | {u.role_id:<5}")
        
        print("="*80 + "\n")
        print("Roles: 1=Citizen, 2=Subdivision Leader, 3=Barangay Staff, 5=Admin\n")
        
    finally:
        db.close()

if __name__ == "__main__":
    list_users()
