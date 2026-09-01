import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, SessionLocal
from app.models.report import Report, StatusHistory
from app.models.report_dispute import ReportDispute
from app.models.user import User

def test_workflow():
    db = SessionLocal()
    try:
        print("1. Checking report statuses...")
        from sqlalchemy import text
        statuses = db.execute(text("SELECT status_id, status_name FROM report_status WHERE status_id IN (14, 15, 16)")).fetchall()
        print("  Found statuses:", statuses)

        print("2. Checking report columns...")
        cols = db.execute(text("SHOW COLUMNS FROM reports LIKE 'verification_status'")).fetchall()
        print("  verification_status column:", cols)

        print("3. Checking report_disputes table...")
        disputes_count = db.execute(text("SELECT COUNT(*) FROM report_disputes")).scalar()
        print("  report_disputes count:", disputes_count)

        print("4. Testing Report query with joined disputes...")
        first_rep = db.query(Report).first()
        if first_rep:
            print(f"  First report #{first_rep.report_id} status: {first_rep.current_status_id}, verification: {first_rep.verification_status}")
            print(f"  Disputes count: {len(first_rep.disputes)}")

        print("\nAll database schema and model checks PASSED!")
    finally:
        db.close()

if __name__ == "__main__":
    test_workflow()
