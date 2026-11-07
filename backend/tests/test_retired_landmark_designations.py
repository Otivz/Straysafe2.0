"""Phase 2: ordinary landmarks and historical metadata survive retirement.

Run with .venv/Scripts/python.exe. Uses a temporary SQLite file; never app.main.
"""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
temp_dir = tempfile.TemporaryDirectory(prefix="straysafe-retired-landmarks-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(temp_dir.name) / "test.db").as_posix()
os.environ.setdefault("JWT_SECRET_KEY", "synthetic-landmark-test-secret-01234567890123")
os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import landmarks  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.retired import RETIRED_WORKFLOW_MESSAGE  # noqa: E402

Base.metadata.create_all(engine)
api = FastAPI()
api.include_router(landmarks.router)
client = TestClient(api)
db = SessionLocal()
passed = 0


def check(label, ok, detail=""):
    global passed
    assert ok, f"{label}: {detail}"
    passed += 1
    print("PASS " + label)


def headers(user):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(user.user_id), "user_id": user.user_id,
            "role_id": user.role_id, "is_verified": True})}


try:
    db.add_all([Role(role_id=2, role_name="Leader"), Role(role_id=4, role_name="Admin")])
    db.add(Barangay(barangay_id=1, barangay_name="Demo Barangay", city="Demo City"))
    db.flush()
    db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Demo Subdivision"))
    admin = User(name="Demo Admin", email="admin@example.com", password="unused-test-hash", role_id=4,
                 is_verified=True, status="Active", barangay_id=1, subdivision_id=1)
    leader = User(name="Demo Leader", email="leader@example.com", password="unused-test-hash", role_id=2,
                  is_verified=True, status="Active", barangay_id=1, subdivision_id=1)
    ordinary = Landmark(name="Demo Gate", category="gate", subdivision_id=1, barangay_id=1,
                        latitude=14.802, longitude=121.003, is_holding_facility=False)
    historical = Landmark(name="Earlier Demo Place", category="facility", subdivision_id=1, barangay_id=1,
                          latitude=14.804, longitude=121.005, is_holding_facility=True,
                          facility_type="Saved Historical Type", capacity=8)
    db.add_all([admin, leader, ordinary, historical])
    db.commit()
    initial_count = db.query(Landmark).count()

    for actor in (admin, leader):
        for designation in ({"is_holding_facility": True}, {"category": "facility"},
                            {"is_holding_facility": True, "category": "facility"}):
            payload = {"name": "Blocked New Place", "category": "general", "subdivision_id": 1,
                       "barangay_id": 1, "latitude": 14.801, "longitude": 121.002, **designation}
            r = client.post("/landmarks", json=payload, headers=headers(actor))
            check(f"role {actor.role_id} cannot create {designation}",
                  r.status_code == 403 and r.json()["detail"] == RETIRED_WORKFLOW_MESSAGE, r.text)
            r = client.put(f"/landmarks/{ordinary.landmark_id}", json={"name": "Must not change", **designation},
                           headers=headers(actor))
            check(f"role {actor.role_id} cannot convert an ordinary landmark via {designation}",
                  r.status_code == 403 and r.json()["detail"] == RETIRED_WORKFLOW_MESSAGE, r.text)
    db.expire_all()
    check("blocked designation writes are atomic", db.query(Landmark).count() == initial_count
          and db.get(Landmark, ordinary.landmark_id).name == "Demo Gate"
          and not db.get(Landmark, ordinary.landmark_id).is_holding_facility)

    for actor in (admin, leader):
        r = client.post("/landmarks", json={"name": f"Reference {actor.role_id}", "category": "gate",
                        "subdivision_id": 1, "barangay_id": 1, "latitude": 14.801, "longitude": 121.002},
                        headers=headers(actor))
        check(f"role {actor.role_id} can create a reference landmark",
              r.status_code == 201 and not r.json()["is_holding_facility"], r.text)
        r = client.put(f"/landmarks/{ordinary.landmark_id}", json={"name": "Updated Reference", "latitude": 14.803},
                       headers=headers(actor))
        check(f"role {actor.role_id} can edit ordinary reference data",
              r.status_code == 200 and r.json()["latitude"] == 14.803, r.text)
        r = client.put(f"/landmarks/{historical.landmark_id}", json={"name": "Earlier Place Reference",
                       "category": "facility", "is_holding_facility": True, "latitude": 14.804},
                       headers=headers(actor))
        check(f"role {actor.role_id} can retain an existing designation while editing reference data",
              r.status_code == 200 and r.json()["is_holding_facility"] is True
              and r.json()["facility_type"] == "Saved Historical Type" and r.json()["capacity"] == 8
              and r.json()["latitude"] == 14.804 and r.json()["longitude"] == 121.005, r.text)

    r = client.put("/landmarks/barangay/1/hq", json={"hq_lat": 14.806, "hq_lng": 121.007}, headers=headers(admin))
    check("Admin can maintain the external reference pin", r.status_code == 200, r.text)
    r = client.get("/landmarks/barangay/1/hq", headers=headers(admin))
    check("saved reference pin remains readable", r.status_code == 200 and r.json()["hq_lat"] == 14.806, r.text)
    r = client.get("/landmarks", headers=headers(admin))
    check("historical place remains in reads", r.status_code == 200
          and any(row["landmark_id"] == historical.landmark_id for row in r.json()), r.text)
    with patch.dict(os.environ, {"BARANGAY_WORKFLOWS_ENABLED": "1"}):
        r = client.post("/landmarks", json={"name": "Legacy-only Place", "category": "facility",
                        "is_holding_facility": True, "barangay_id": 1, "latitude": 14.807, "longitude": 121.008},
                        headers=headers(admin))
        check("legacy switch retains Admin facility creation compatibility", r.status_code == 201, r.text)
        r = client.put(f"/landmarks/{ordinary.landmark_id}", json={"category": "facility", "is_holding_facility": True},
                       headers=headers(admin))
        check("legacy switch retains Admin conversion compatibility", r.status_code == 200 and r.json()["is_holding_facility"], r.text)
    check("legacy switch does not remain enabled", "BARANGAY_WORKFLOWS_ENABLED" not in os.environ)
    print(f"PASS all {passed} isolated landmark designation checks")
finally:
    client.close()
    db.close()
    engine.dispose()
    temp_dir.cleanup()
