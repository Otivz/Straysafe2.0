"""Phase 2 custody/designation rules. Isolated in-memory SQLite; mocked notices, no live services."""
import os
import sys
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-phase2-custody-secret-key-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
import app.models  # noqa: E402,F401
from app.database import Base, get_db  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import landmarks, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(engine)
api = FastAPI()
api.include_router(landmarks.router)
api.include_router(reports.router)

def test_db():
    with Session() as session:
        yield session

api.dependency_overrides[get_db] = test_db
client = TestClient(api, raise_server_exceptions=False)
db = Session()
db.add(Barangay(barangay_id=1, barangay_name="Synthetic Barangay", city="Test"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Synthetic Subdivision"))
db.flush()
for status_id in range(1, 19):
    db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
leader = User(name="Synthetic Leader", email="leader@phase2.invalid", password="unused", role_id=2,
              status="Active", is_verified=True, subdivision_id=1, barangay_id=1)
admin = User(name="Synthetic Admin", email="admin@phase2.invalid", password="unused", role_id=4,
             status="Active", is_verified=True, barangay_id=1)
db.add_all([leader, admin])
db.flush()
pen = Landmark(name="Earlier pen", barangay_id=1, subdivision_id=1, latitude=14.8, longitude=121,
               is_holding_facility=True, status="Active")
ordinary = Landmark(name="Ordinary landmark", barangay_id=1, subdivision_id=1, latitude=14.8, longitude=121,
                    is_holding_facility=False, status="Active")
db.add_all([pen, ordinary])
db.flush()
case = Report(user_id=leader.user_id, subdivision_id=1, category_id=4, animal_type="Dog",
              current_status_id=2, assigned_leader_id=leader.user_id, latitude=14.801, longitude=121.002,
              landmark="Original sighting", custody_status="Not in custody")
db.add(case)
db.commit()
headers = lambda actor: {"Authorization": "Bearer " + create_access_token({"sub": str(actor.user_id), "user_id": actor.user_id, "role_id": actor.role_id})}
results = []

def check(label, condition, extra=""):
    results.append(bool(condition))
    print(("[PASS] " if condition else "[FAIL] ") + label + (f": {extra}" if not condition else ""))

with patch.object(reports, "notify_report_status_update"), patch.object(reports, "dispatch_notification"):
    r = client.patch(f"/reports/{case.report_id}/status", headers=headers(leader),
                     json={"status_id": 2, "custody_status": "Secured by Resident", "remarks": "Synthetic resident care"})
    check("resident custody can retain Verified status", r.status_code == 200, r.text)
    db.expire_all()
    check("resident care does not assign a facility", db.get(Report, case.report_id).facility_id is None)
    check("resident care does not create a holding record", db.query(HoldingAnimal).count() == 0)
    check("resident care preserves the location", float(db.get(Report, case.report_id).latitude) == 14.801)
    for status_id in [7, 8]:
        r = client.patch(f"/reports/{case.report_id}/status", headers=headers(leader),
                         json={"status_id": status_id, "custody_status": "Secured by Resident"})
        check("resident custody cannot imply facility admission", r.status_code == 400, r.text)
    r = client.patch(f"/reports/{case.report_id}/status", headers=headers(leader),
                     json={"status_id": 2, "custody_status": "Secured by Resident", "facility_id": pen.landmark_id})
    check("resident care cannot carry facility metadata", r.status_code == 400, r.text)
    r = client.patch(f"/reports/{case.report_id}/status", headers=headers(leader), json={"status_id": 7})
    check("leader cannot place a new animal through a status-only request", r.status_code == 403, r.text)
    r = client.patch(f"/reports/{case.report_id}/status", headers=headers(leader),
                     json={"status_id": 7, "facility_id": pen.landmark_id})
    check("leader cannot place a new animal through explicit facility metadata", r.status_code == 403, r.text)
    db.expire_all()
    check("refused requests leave the case and holdings unchanged", db.get(Report, case.report_id).current_status_id == 2 and db.query(HoldingAnimal).count() == 0)

body = {"name": "New synthetic landmark", "latitude": 14.8, "longitude": 121, "is_holding_facility": True}
r = client.post("/landmarks", json=body, headers=headers(leader))
check("leader cannot create a new pen designation", r.status_code == 403, r.text)
r = client.put(f"/landmarks/{ordinary.landmark_id}", json={"is_holding_facility": True}, headers=headers(leader))
check("leader cannot turn an ordinary landmark into a pen", r.status_code == 403, r.text)
r = client.put(f"/landmarks/{pen.landmark_id}", json={"is_holding_facility": True, "description": "Earlier record"}, headers=headers(leader))
check("an earlier pen designation can be retained", r.status_code == 200, r.text)
r = client.put(f"/landmarks/{pen.landmark_id}", json={"subdivision_id": None}, headers=headers(leader))
check("an earlier pen cannot be moved to Barangay jurisdiction by its leader", r.status_code == 403, r.text)
r = client.put(f"/landmarks/{pen.landmark_id}", json={"is_holding_facility": False}, headers=headers(leader))
check("an earlier pen designation can be switched off", r.status_code == 200, r.text)
r = client.post("/landmarks", json={**body, "is_holding_facility": False}, headers=headers(leader))
check("ordinary landmark creation is retained", r.status_code == 201, r.text)
r = client.post("/landmarks", json=body, headers=headers(admin))
check("administrator holding-place designation is retained", r.status_code == 201, r.text)
if r.status_code == 201:
    facility_id = r.json()["landmark_id"]
    held = Report(user_id=leader.user_id, subdivision_id=1, category_id=4, animal_type="Dog",
                  current_status_id=7, assigned_leader_id=leader.user_id, latitude=14.8, longitude=121,
                  facility_id=facility_id, custody_status="In Barangay Facility")
    db.add(held)
    db.commit()
    r = client.patch(f"/reports/{held.report_id}/status", json={"status_id": 2}, headers=headers(leader))
    check("report status cannot bypass the read-only Barangay holding view", r.status_code == 403, r.text)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
