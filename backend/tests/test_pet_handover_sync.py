"""Automated tests for the owner-return record: it updates the pet, the case and its chats, and merged reports find it."""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "pet_handover_sync_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-pet-handover-sync-112233")
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models.user import User, Role, Subdivision, Barangay
from app.models.report import Report, ReportCategory, ReportStatus, ReportReturn
from app.models.chat import ChatThread
from app.models.pet_history import PetHistory
from app.models.pet import Pet
from app.routes import report_returns, reports
from app.utils.auth import create_access_token
import app.utils.uploads
app.utils.uploads.CLOUDINARY_CLOUD_NAME = ""

Base.metadata.create_all(bind=engine)
test_api = FastAPI()
for r in (report_returns.router, reports.router):
    test_api.include_router(r)

client = TestClient(test_api, raise_server_exceptions=True)
db = SessionLocal()

# Setup jurisdiction
b1 = Barangay(barangay_id=1, barangay_name="Barangay Central", city="Pasig")
db.add(b1)
sub1 = Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Greenfield Valley")
db.add(sub1)
cat1 = ReportCategory(category_id=1, category_name="Stray Animal")
db.add(cat1)
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"Status_{sid}"))
db.commit()

# Users
staff = User(
    user_id=10,
    name="Officer Jenny",
    email="jenny@straysafe.test",
    password="hashed",
    role_id=3,
    barangay_id=1,
    subdivision_id=1,
    status="Active",
    is_verified=True
)
resident = User(
    user_id=20,
    name="Juan Dela Cruz",
    email="juan@straysafe.test",
    password="hashed",
    phone="09171234567",
    address="Block 1 Lot 2 Greenfield",
    role_id=1,
    subdivision_id=1,
    barangay_id=1,
    status="Active",
    is_verified=True
)
db.add_all([staff, resident])
db.commit()

def auth_header(u: User):
    token = create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})
    return {"Authorization": f"Bearer {token}"}

H_STAFF = auth_header(staff)
H_RESIDENT = auth_header(resident)

passed_count = 0
failed_count = 0

def check(name: str, condition: bool, details: str = ""):
    global passed_count, failed_count
    if condition:
        passed_count += 1
        print(f"[PASS] {name}" + (f" - {details}" if details else ""))
    else:
        failed_count += 1
        print(f"[FAIL] {name}" + (f" - {details}" if details else ""))


def run_tests():
    print("=" * 70)
    print("RUNNING PET HANDOVER SYNCHRONIZATION TESTS")
    print("=" * 70)

    # ----------------------------------------------------
    # TEST 3: Recording the owner return updates the pet, the case and its chats
    # ----------------------------------------------------
    from app.utils.owner_returns import record_owner_return

    pet3 = Pet(pet_id=102, owner_id=resident.user_id, pet_type="Dog", pet_name="Luna", breed="Poodle", status="Lost")
    rep3 = Report(report_id=502, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=7, pet_id=102, latitude=14.5, longitude=121.0)
    rep3b = Report(report_id=503, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=18, duplicate_of_report_id=502, latitude=14.5, longitude=121.0)
    db.add_all([pet3, rep3, rep3b])
    db.flush()
    thread3 = ChatThread(thread_type="Report", related_id=502, created_by=resident.user_id, recipient_id=staff.user_id, title="Report #502")
    db.add(thread3)
    db.commit()

    snap3 = {
        "has_account": True,
        "owner_user_id": resident.user_id,
        "owner_name": resident.name,
        "owner_phone": resident.phone,
        "owner_email": resident.email,
        "owner_address": resident.address,
        "relationship_to_animal": "Owner",
        "id_type": "Driver's License",
        "id_last4": "5555",
        "handover_photo_url": "https://res.cloudinary.com/demo/image/upload/luna_return.jpg",
        "ownership_verified_by_record": True,
        "notes": "Direct return from Report Management"
    }

    record_owner_return(db, rep3, snap3, staff, pet_id=102)
    db.commit()

    db.expire_all()
    ret3 = db.query(ReportReturn).filter(ReportReturn.report_id == 502).first()
    check("Test 3a: the authoritative ReportReturn record is created", ret3 is not None and ret3.id_last4 == "5555" and ret3.pet_id == 102, f"Return: {ret3}")
    check("Test 3b: the pet is Active again", db.get(Pet, 102).status == "Active", f"Got: {db.get(Pet, 102).status}")
    check("Test 3c: the pet history records the return",
          db.query(PetHistory).filter(PetHistory.pet_id == 102, PetHistory.event_type == "RETURNED_TO_OWNER").count() == 1)
    check("Test 3d: every report of the case is marked Claimed by Owner",
          db.get(Report, 502).custody_status == "Claimed by Owner" and db.get(Report, 503).custody_status == "Claimed by Owner")
    check("Test 3e: the report conversation is closed", db.get(ChatThread, thread3.thread_id).is_closed is True)

    # ----------------------------------------------------
    # TEST 4: Case-Aware Return Lookup on Merged Reports
    # ----------------------------------------------------
    parent_report = Report(report_id=601, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=9, latitude=14.5, longitude=121.0)
    child_report = Report(report_id=602, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=18, duplicate_of_report_id=601, latitude=14.5, longitude=121.0)
    db.add_all([parent_report, child_report])
    db.commit()

    ret4 = ReportReturn(
        report_id=601,
        pet_id=None,
        has_account=True,
        owner_user_id=resident.user_id,
        owner_name=resident.name,
        id_type="National ID",
        id_last4="4321",
        handover_photo_url="https://res.cloudinary.com/demo/image/upload/parent_handover.jpg",
        returned_by=staff.user_id,
        returned_at=datetime.utcnow()
    )
    db.add(ret4)
    db.commit()

    res = client.get("/report-returns/by-report/602", headers=H_STAFF)
    check("Test 4a: Merged child report resolves case return (200 OK)", res.status_code == 200, f"Status: {res.status_code}")
    data4 = res.json()
    check("Test 4b: Return payload indicates is_already_reunited is True", data4.get("is_already_reunited") is True, f"Reunited: {data4.get('is_already_reunited')}")
    check("Test 4c: Return payload contains authoritative ID and photo", data4.get("id_last4") == "4321" and "parent_handover" in (data4.get("handover_photo_url") or ""), f"ID last4: {data4.get('id_last4')}")

    print("=" * 70)
    total = passed_count + failed_count
    pct = (passed_count / total * 100) if total else 0
    print(f"RESULTS: {passed_count}/{total} tests passed ({pct:.1f}%)")
    print("=" * 70)
    if failed_count > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
