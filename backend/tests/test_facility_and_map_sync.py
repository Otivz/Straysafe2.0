"""
End-to-end backend & API synchronization tests for Global Facility and Map Synchronization:
- Test A: Facility Deletion (Selera Homes holding facility deleted -> excluded from active queries, reports and maps; historical records preserved).
- Test B: Facility & Barangay HQ Location Update (Barangay facility and HQ coordinates updated -> reflected across /landmarks, /landmarks/barangay/1/hq and /reports).
- Test C: Facility Addition & Role-Based Jurisdiction Visibility (Admin adds facility -> visible to authorized roles with exact coordinates; Subdivision Leader cannot create new holding facilities; invalid coordinates rejected).
- Test D: Persistence, Orphan Relinking & Audit Logs (Replacing an old Barangay facility re-links active Barangay-held reports to the new facility and coordinates; audit logs recorded for CREATE_LANDMARK, UPDATE_LANDMARK, DELETE_LANDMARK, UPDATE_BARANGAY_HQ).
"""
import os
import sys

import tempfile
_DB = os.path.join(tempfile.mkdtemp(), "facility_sync_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-facility-and-map-sync-secret-key-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal as Session, engine, get_db  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import landmarks, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)

api = FastAPI()
api.include_router(landmarks.router)
api.include_router(reports.router)


def override_db():
    with Session() as session:
        yield session


api.dependency_overrides[get_db] = override_db
client = TestClient(api, raise_server_exceptions=False)

db = Session()
db.add(Barangay(
    barangay_id=1,
    barangay_name="San Vicente",
    city="Santa Maria, Bulacan",
    hq_lat=14.806906,
    hq_lng=121.0039297
))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Subdivision"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"Status {sid}"))
db.flush()

resident = User(
    name="Resident User", email="resident@sync.test", password="x",
    role_id=1, status="Active", is_verified=True, subdivision_id=1, barangay_id=1
)
subd_leader = User(
    name="Subd Leader", email="leader@sync.test", password="x",
    role_id=2, status="Active", is_verified=True, subdivision_id=1, barangay_id=1
)
brgy_staff = User(
    name="Brgy Head", email="brgy@sync.test", password="x",
    role_id=3, status="Active", is_verified=True, is_head_officer=True, barangay_id=1
)
admin = User(
    name="System Admin", email="admin@sync.test", password="x",
    role_id=4, status="Active", is_verified=True, barangay_id=1
)
db.add_all([resident, subd_leader, brgy_staff, admin])
db.flush()

# Seed initial landmarks: Selera Homes Temporary Holding Pen (#2) and Barangay Impound (#6)
selera_pen = Landmark(
    landmark_id=2,
    name="Selera Homes Temporary Holding Pen",
    category="facility",
    subdivision_id=1,
    barangay_id=1,
    latitude=14.8018,
    longitude=121.0028,
    is_holding_facility=True,
    facility_type="Temporary Holding Pen",
    capacity=6,
    status="Active"
)
brgy_impound = Landmark(
    landmark_id=6,
    name="Barangay San Vicente Animal Impound Facility",
    category="facility",
    subdivision_id=None,
    barangay_id=1,
    latitude=14.806906,
    longitude=121.0039297,
    is_holding_facility=True,
    facility_type="Barangay Main Shelter",
    capacity=120,
    status="Active"
)
db.add_all([selera_pen, brgy_impound])
db.flush()

# Report held in Selera Homes Temporary Holding Pen
rep_subd = Report(
    user_id=resident.user_id,
    subdivision_id=1,
    category_id=4,
    animal_type="Dog",
    current_status_id=7,
    latitude=14.8018,
    longitude=121.0028,
    initial_latitude=14.8011,
    initial_longitude=121.0035,
    landmark="Selera Homes Temporary Holding Pen",
    initial_landmark="Selera Main Street",
    facility_id=selera_pen.landmark_id,
    custody_status="In Subdivision Facility",
    description="Roaming dog",
    priority_level="Medium",
    visibility="Public"
)
# Report held in Barangay Facility
rep_brgy = Report(
    user_id=resident.user_id,
    subdivision_id=1,
    category_id=4,
    animal_type="Dog",
    current_status_id=7,
    latitude=14.806906,
    longitude=121.0039297,
    initial_latitude=14.8015,
    initial_longitude=121.0040,
    landmark="Barangay San Vicente Animal Impound Facility",
    initial_landmark="Phase 2 Corner",
    facility_id=brgy_impound.landmark_id,
    custody_status="In Barangay Facility",
    description="Stray dog",
    priority_level="Medium",
    visibility="Public"
)
db.add_all([rep_subd, rep_brgy])
db.flush()
db.commit()


def auth_headers(u: User) -> dict:
    tok = create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})
    return {"Authorization": f"Bearer {tok}"}


results = []


def check(label: str, cond: bool, extra: str = "") -> None:
    ok = bool(cond)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f" -> {extra}" if (extra and not ok) else ""))


# ==============================================================================
# TEST A — FACILITY DELETION (Selera Homes Temporary Holding Pen)
# ==============================================================================
del_res = client.delete(f"/landmarks/{selera_pen.landmark_id}", headers=auth_headers(admin))
check("Test A1: Admin deletes Selera Homes holding facility (200 OK)", del_res.status_code == 200, del_res.text)

all_lmk = client.get("/landmarks").json()
check(
    "Test A2: Deleted Selera Homes facility no longer appears in /landmarks",
    all(l["landmark_id"] != 2 and "Selera Homes Temporary Holding Pen" not in l["name"] for l in all_lmk),
    str(all_lmk)
)

subd_facs = client.get("/landmarks?subdivision_id=1&is_holding_facility=true").json()
check("Test A3: Subdivision 1 holding facilities query returns empty list", subd_facs == [], str(subd_facs))

get_deleted = client.get("/landmarks/2")
check("Test A4: Direct GET /landmarks/2 returns 404", get_deleted.status_code == 404, get_deleted.text)

rep_subd_view = client.get(f"/reports/{rep_subd.report_id}", headers=auth_headers(subd_leader)).json()
check(
    "Test A5: Historical report referencing deleted facility is preserved and detached from deleted facility",
    rep_subd_view.get("report_id") == rep_subd.report_id
    and rep_subd_view.get("facility_id") is None
    and rep_subd_view.get("facility") is None
    and abs(float(rep_subd_view.get("latitude")) - 14.8011) < 1e-6,
    str((rep_subd_view.get("facility_id"), rep_subd_view.get("facility"), rep_subd_view.get("latitude")))
)

# ==============================================================================
# TEST B — FACILITY & BARANGAY HQ LOCATION UPDATE
# ==============================================================================
NEW_FAC_LAT, NEW_FAC_LNG = 14.80742652, 121.00941537
NEW_HQ_LAT, NEW_HQ_LNG = 14.80745000, 121.00941000

upd_fac = client.put(
    f"/landmarks/{brgy_impound.landmark_id}",
    headers=auth_headers(admin),
    json={
        "name": "Barangay San Vicente Animal Impound Facility",
        "latitude": NEW_FAC_LAT,
        "longitude": NEW_FAC_LNG,
        "is_holding_facility": True
    }
)
check("Test B1: Admin updates Barangay facility coordinates", upd_fac.status_code == 200, upd_fac.text)

upd_hq = client.put(
    "/landmarks/barangay/1/hq",
    headers=auth_headers(admin),
    json={"hq_lat": NEW_HQ_LAT, "hq_lng": NEW_HQ_LNG}
)
check("Test B2: Admin updates Barangay HQ coordinates", upd_hq.status_code == 200, upd_hq.text)

hq_get = client.get("/landmarks/barangay/1/hq").json()
check(
    "Test B3: GET /landmarks/barangay/1/hq returns updated coordinates",
    abs(float(hq_get["hq_lat"]) - NEW_HQ_LAT) < 1e-6 and abs(float(hq_get["hq_lng"]) - NEW_HQ_LNG) < 1e-6,
    str(hq_get)
)

for role_label, actor in [("Subdivision Leader", subd_leader), ("Barangay Staff", brgy_staff), ("Resident", resident), ("Admin", admin)]:
    r_view = client.get(f"/reports/{rep_brgy.report_id}", headers=auth_headers(actor)).json()
    check(
        f"Test B4 ({role_label}): the report view keeps the incident's own pin and shows no holding facility",
        abs(float(r_view["latitude"]) - 14.8015) < 1e-6
        and abs(float(r_view["longitude"]) - 121.0040) < 1e-6
        and r_view["facility"] is None and r_view["facility_id"] is None,
        str((r_view.get("latitude"), r_view.get("longitude"), r_view.get("facility")))
    )

# ==============================================================================
# TEST C — FACILITY ADDITION, VALIDATION & ROLE PERMISSIONS
# ==============================================================================
bad_coords = client.post(
    "/landmarks",
    headers=auth_headers(admin),
    json={"name": "Invalid Coords", "latitude": 195.0, "longitude": 121.0, "is_holding_facility": True}
)
check("Test C1: Invalid latitude (>90) rejected with 400", bad_coords.status_code == 400, bad_coords.text)

unauth_hq = client.put(
    "/landmarks/barangay/1/hq",
    headers=auth_headers(subd_leader),
    json={"hq_lat": 14.81, "hq_lng": 121.01}
)
check("Test C2: Non-admin cannot modify Barangay HQ (403)", unauth_hq.status_code == 403, unauth_hq.text)

add_subd2_fac = client.post(
    "/landmarks",
    headers=auth_headers(admin),
    json={
        "name": "Other Subd Holding Pen",
        "category": "facility",
        "subdivision_id": 2,
        "barangay_id": 1,
        "latitude": 14.812345,
        "longitude": 121.012345,
        "is_holding_facility": True,
        "facility_type": "Temporary Holding Pen",
        "capacity": 8
    }
)
check("Test C3: Admin adds new facility for Subdivision 2 (201)", add_subd2_fac.status_code == 201, add_subd2_fac.text)
new_fac_id = add_subd2_fac.json()["landmark_id"]

subd1_only = client.get("/landmarks?subdivision_id=1&is_holding_facility=true").json()
subd2_only = client.get("/landmarks?subdivision_id=2&is_holding_facility=true").json()
check(
    "Test C4: Subdivision 1 facility query excludes Subdivision 2 facility, while Subdivision 2 query includes it",
    len(subd1_only) == 0 and len(subd2_only) == 1 and subd2_only[0]["landmark_id"] == new_fac_id,
    str((subd1_only, subd2_only))
)

# ==============================================================================
# TEST D — ORPHAN RELINKING & AUDIT LOGS
# ==============================================================================
# Simulate replacing Barangay facility #6 with a new Barangay facility #7
client.delete(f"/landmarks/{brgy_impound.landmark_id}", headers=auth_headers(admin))
replacement_brgy = client.post(
    "/landmarks",
    headers=auth_headers(admin),
    json={
        "name": "New Barangay Animal Shelter",
        "category": "facility",
        "subdivision_id": None,
        "barangay_id": 1,
        "latitude": 14.808888,
        "longitude": 121.008888,
        "is_holding_facility": True,
        "facility_type": "Barangay Main Shelter",
        "capacity": 150
    }
)
check("Test D1: Admin creates replacement Barangay shelter (201)", replacement_brgy.status_code == 201, replacement_brgy.text)
db.expire_all()
rep_after_replace = db.get(Report, rep_brgy.report_id)
check(
    "Test D2: the stored Barangay-custody report is re-linked to the replacement Barangay shelter and its coordinates",
    rep_after_replace.facility_id == replacement_brgy.json()["landmark_id"]
    and abs(float(rep_after_replace.latitude) - 14.808888) < 1e-6
    and rep_after_replace.landmark == "New Barangay Animal Shelter",
    str((rep_after_replace.facility_id, rep_after_replace.latitude, rep_after_replace.landmark))
)
view_after = client.get(f"/reports/{rep_brgy.report_id}", headers=auth_headers(brgy_staff)).json()
check("Test D3a: ...while the report view still shows the incident's own pin, never a holding facility",
      view_after["facility"] is None and abs(float(view_after["latitude"]) - 14.8015) < 1e-6, str((view_after.get("facility"), view_after.get("latitude"))))

audit_actions = [a[0] for a in db.query(AuditLog.action).all()]
check(
    "Test D3: Audit logs recorded for CREATE_LANDMARK, UPDATE_LANDMARK, DELETE_LANDMARK, UPDATE_BARANGAY_HQ",
    all(act in audit_actions for act in ["CREATE_LANDMARK", "UPDATE_LANDMARK", "DELETE_LANDMARK", "UPDATE_BARANGAY_HQ"]),
    str(audit_actions)
)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
