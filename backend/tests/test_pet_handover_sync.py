"""Automated tests for Pet Handover Synchronization between Pet Claims and Report Management."""
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
from app.models.report import Report, ReportCategory, ReportStatus, ReportReturn, HoldingAnimal, HoldingTimeline
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.routes import claims, report_returns, reports
from app.utils.auth import create_access_token
import app.utils.uploads
app.utils.uploads.CLOUDINARY_CLOUD_NAME = ""

Base.metadata.create_all(bind=engine)
test_api = FastAPI()
for r in (claims.router, report_returns.router, reports.router):
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
    # TEST 1: Physical Handover Validation Requirements
    # ----------------------------------------------------
    pet1 = Pet(pet_id=100, owner_id=resident.user_id, pet_type="Dog", pet_name="Buddy", breed="Golden Retriever", status="Lost")
    rep1 = Report(report_id=500, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=2, pet_id=100, latitude=14.5, longitude=121.0)
    claim1 = PetClaim(claim_id=1, report_id=500, pet_id=100, status="Approved")
    db.add_all([pet1, rep1, claim1])
    db.commit()

    # 1a. Missing photo
    res = client.patch("/claims/1/status", headers=H_STAFF, json={
        "status": "Handover Complete",
        "id_type": "Driver's License",
        "id_last4": "1234"
    })
    check("Test 1a: Handover Complete without photo returns 400", res.status_code == 400 and "photo" in res.json().get("detail", "").lower(), f"Status: {res.status_code}")

    # 1b. Missing ID type
    res = client.patch("/claims/1/status", headers=H_STAFF, json={
        "status": "Handover Complete",
        "handover_photo_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "id_last4": "1234"
    })
    check("Test 1b: Handover Complete without ID type returns 400", res.status_code == 400 and "id" in res.json().get("detail", "").lower(), f"Status: {res.status_code}")

    # 1c. Invalid ID last 4 digits
    res = client.patch("/claims/1/status", headers=H_STAFF, json={
        "status": "Handover Complete",
        "handover_photo_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "id_type": "Driver's License",
        "id_last4": "12X"
    })
    check("Test 1c: Handover Complete with invalid last 4 digits returns 400", res.status_code == 400 and "last 4 digits" in res.json().get("detail", "").lower(), f"Status: {res.status_code}")

    # ----------------------------------------------------
    # TEST 2: Pet Claims Handover Synchronizes to Report Management
    # ----------------------------------------------------
    pet2 = Pet(pet_id=101, owner_id=resident.user_id, pet_type="Dog", pet_name="Max", breed="Aspin", status="Lost")
    rep2 = Report(report_id=501, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=7, pet_id=101, latitude=14.5, longitude=121.0)
    holding2 = HoldingAnimal(holding_id=10, report_id=501, facility_status=1, kennel_slot="K-1")
    claim2 = PetClaim(claim_id=2, report_id=501, pet_id=101, status="Approved")
    db.add_all([pet2, rep2, holding2, claim2])
    db.commit()

    res = client.patch("/claims/2/status", headers=H_STAFF, json={
        "status": "Handover Complete",
        "handover_photo_url": "https://res.cloudinary.com/demo/image/upload/handover1.jpg",
        "id_type": "Passport",
        "id_last4": "9876",
        "remarks": "Handover completed with owner Juan Dela Cruz"
    })
    check("Test 2a: Valid Handover Complete succeeds (200 OK)", res.status_code == 200, f"Status: {res.status_code}")

    db.expire_all()
    c2_db = db.query(PetClaim).filter(PetClaim.claim_id == 2).first()
    check("Test 2b: Claim status updated to Handover Complete", c2_db.status == "Handover Complete", f"Got: {c2_db.status}")

    r2_db = db.query(Report).filter(Report.report_id == 501).first()
    check("Test 2c: Report status updated to 9 (Claimed by Owner)", r2_db.current_status_id == 9, f"Got: {r2_db.current_status_id}")
    check("Test 2d: Report custody status updated to Claimed by Owner", r2_db.custody_status == "Claimed by Owner", f"Got: {r2_db.custody_status}")

    p2_db = db.query(Pet).filter(Pet.pet_id == 101).first()
    check("Test 2e: Pet status updated to Active", p2_db.status == "Active", f"Got: {p2_db.status}")

    h2_db = db.query(HoldingAnimal).filter(HoldingAnimal.holding_id == 10).first()
    check("Test 2f: Holding facility animal discharged (status 3)", h2_db.facility_status == 3 and h2_db.kennel_slot is None, f"Status: {h2_db.facility_status}")

    ret2_db = db.query(ReportReturn).filter(ReportReturn.report_id == 501).first()
    check("Test 2g: Authoritative ReportReturn record created", ret2_db is not None and ret2_db.id_last4 == "9876", f"Return: {ret2_db.return_id if ret2_db else None}")

    # ----------------------------------------------------
    # TEST 3: Report Management Return Synchronizes Pet Claims
    # ----------------------------------------------------
    from app.utils.owner_returns import record_owner_return

    pet3 = Pet(pet_id=102, owner_id=resident.user_id, pet_type="Dog", pet_name="Luna", breed="Poodle", status="Lost")
    rep3 = Report(report_id=502, user_id=resident.user_id, subdivision_id=1, category_id=1, current_status_id=7, pet_id=102, latitude=14.5, longitude=121.0)
    claim3 = PetClaim(claim_id=3, report_id=502, pet_id=102, status="Approved")
    db.add_all([pet3, rep3, claim3])
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
    c3_db = db.query(PetClaim).filter(PetClaim.claim_id == 3).first()
    check("Test 3a: Report return auto-syncs PetClaim to Handover Complete", c3_db.status == "Handover Complete", f"Got: {c3_db.status}")
    check("Test 3b: Claim remarks document Report sync provenance", "Report #502" in (c3_db.remarks or ""), f"Remarks: {c3_db.remarks}")

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
