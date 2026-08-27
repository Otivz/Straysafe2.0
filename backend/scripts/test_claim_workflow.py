import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load env from workspace root
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
load_dotenv('../../.env')
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("No DATABASE_URL found!")
    sys.exit(1)

from app.models.report import Report, StatusHistory
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.notification import Notification

engine = create_engine(db_url)
Session = sessionmaker(bind=engine)
db = Session()

try:
    print("--- 1. Checking Subdivision Leader Accounts ---")
    subd_users = db.query(User).filter(User.role_id == 2).all()
    print(f"Found {len(subd_users)} subdivision officers:")
    for u in subd_users:
        print(f"  User #{u.user_id}: {u.name} ({u.email}) - Subd ID: {u.subdivision_id}")

    if len(subd_users) < 2:
        print("Note: Creating a second test subdivision officer for testing takeover/conflict...")
        user2 = User(
            name="Officer Maria Santos",
            email="maria.santos@straysafe.com",
            password="hashed_test_password",
            role_id=2,
            subdivision_id=subd_users[0].subdivision_id if subd_users else 1,
            status="Active",
            is_verified=True
        )
        db.add(user2)
        db.commit()
        db.refresh(user2)
        subd_users.append(user2)
        print(f"  Created test Officer #{user2.user_id}: {user2.name}")

    officer1 = subd_users[0]
    officer2 = subd_users[1]

    print(f"\nTesting with Officer 1 (#{officer1.user_id}: {officer1.name}) and Officer 2 (#{officer2.user_id}: {officer2.name})")

    # Find or create a test report
    test_report = db.query(Report).filter(Report.subdivision_id == officer1.subdivision_id).first()
    if not test_report:
        print("Creating a sample report...")
        test_report = Report(
            user_id=1,
            subdivision_id=officer1.subdivision_id or 1,
            category_id=1,
            animal_type='Dog',
            description="Test stray animal for claim workflow",
            latitude=14.8015,
            longitude=121.0039,
            current_status_id=1,
            priority_level='High'
        )
        db.add(test_report)
        db.commit()
        db.refresh(test_report)

    print(f"\n--- 2. Resetting Report #{test_report.report_id} to Unassigned ---")
    test_report.assigned_leader_id = None
    test_report.claimed_at = None
    db.commit()
    db.refresh(test_report)
    assert test_report.assigned_leader_id is None, "Report should be unassigned"
    print(f"Report #{test_report.report_id} is successfully unassigned.")

    print("\n--- 3. Testing Claim Endpoint Logic ---")
    # Officer 1 claims the report
    from app.schemas.report import ReportClaimRequest, ReportTakeoverRequest
    from app.routes.reports import claim_report, takeover_report, unclaim_report
    from fastapi import Request

    class DummyRequest:
        client = None
        headers = {}

    req = DummyRequest()

    res1 = claim_report(test_report.report_id, ReportClaimRequest(user_id=officer1.user_id), req, db)
    print(f"Officer 1 Claim Result: Handler={res1.assigned_leader_name} (ID: {res1.assigned_leader_id}), Status={res1.status_id}")
    assert res1.assigned_leader_id == officer1.user_id, "Handler should be Officer 1"

    print("\n--- 4. Testing Concurrency Protection (Officer 2 attempts to claim already claimed report) ---")
    from fastapi import HTTPException
    conflict_caught = False
    try:
        claim_report(test_report.report_id, ReportClaimRequest(user_id=officer2.user_id), req, db)
    except HTTPException as ex:
        if ex.status_code == 409:
            conflict_caught = True
            print(f"SUCCESS: 409 Conflict returned as expected: '{ex.detail}'")
    assert conflict_caught, "Second claim attempt MUST raise HTTP 409 Conflict"

    print("\n--- 5. Testing Takeover Workflow ---")
    takeover_payload = ReportTakeoverRequest(
        user_id=officer2.user_id,
        reason="Emergency response required",
        notes="Officer 1 is currently in transit."
    )
    res2 = takeover_report(test_report.report_id, takeover_payload, req, db)
    print(f"Officer 2 Takeover Result: Handler={res2.assigned_leader_name} (ID: {res2.assigned_leader_id})")
    assert res2.assigned_leader_id == officer2.user_id, "Handler should now be Officer 2"

    # Verify Status History has the takeover record
    latest_history = db.query(StatusHistory).filter(StatusHistory.report_id == test_report.report_id).order_by(StatusHistory.history_id.desc()).first()
    print(f"Latest StatusHistory: '{latest_history.remarks}'")
    assert "took over the report" in (latest_history.remarks or ""), "History must record takeover"

    print("\n--- 6. Testing Unclaim Workflow ---")
    res3 = unclaim_report(test_report.report_id, ReportClaimRequest(user_id=officer2.user_id), req, db)
    print(f"Unclaim Result: Handler ID={res3.assigned_leader_id} (Expected None)")
    assert res3.assigned_leader_id is None, "Report handler should be reset to None"

    print("\n=== ALL BACKEND CLAIM & TAKEOVER TESTS PASSED! ===")
finally:
    db.close()
