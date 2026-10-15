"""
Phase 4 of RESCUE_TIMELINE_IMPROVEMENT_PLAN.md: a report returned to its owner tells every viewer who confirmed it,
'owner' (the owner's own Confirm Pet Recovered) or 'officer' (staff recorded the handover), from who recorded the
return. It carries no names; the owner-return record and the handover photo still reach only the owner and staff.
Run from the backend folder:  python tests/test_reunion_confirmed_by.py
"""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "reunion_confirmed_by_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-reunion-confirmed-by-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportReturn, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1, phone="09170000000")
    db.add(u)
    db.flush()
    return u


reporter = mk("Rita Reporter", 1)
owner = mk("Olga Owner", 1)
neighbour = mk("Nina Neighbour", 1)
leader = mk("Leo Leader", 2)


def returned_case(recorded_by, photo):
    pet = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Active")
    db.add(pet)
    db.flush()
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=9, animal_type="Dog", pet_id=pet.pet_id, assigned_leader_id=leader.user_id,
               visibility="Public", visibility_decided_by=leader.user_id, verification_status="verified_true")
    db.add(r)
    db.flush()
    db.add(StatusHistory(report_id=r.report_id, report_status_id=9, remarks="Returned to owner", updated_by=recorded_by.user_id,
                         created_at=datetime(2026, 10, 5)))
    db.add(ReportReturn(report_id=r.report_id, pet_id=pet.pet_id, has_account=True, owner_user_id=owner.user_id,
                        owner_name=owner.name, owner_phone="09179999999", relationship_to_animal="Owner",
                        handover_photo_url=photo, returned_by=recorded_by.user_id))
    db.commit()
    return r.report_id


SELF = returned_case(owner, "https://cdn.example/self.jpg")
STAFF = returned_case(leader, "https://cdn.example/handover.jpg")
OLD = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=9,
             animal_type="Dog", visibility="Public", visibility_decided_by=leader.user_id, verification_status="verified_true")
db.add(OLD)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def get(u, rid):
    return client.get(f"/reports/{rid}", headers=H(u)).json()


def photos(b):
    return {m["file_url"] for h in b.get("history", []) for m in (h.get("media") or [])}


check("the owner confirmed it themselves -> 'owner'", get(neighbour, SELF).get("reunion_confirmed_by") == "owner")
check("staff recorded the handover -> 'officer'", get(neighbour, STAFF).get("reunion_confirmed_by") == "officer")
check("no return record -> nothing claimed", get(neighbour, OLD.report_id).get("reunion_confirmed_by") is None)
for who, u in (("another resident", neighbour), ("the reporter", reporter)):
    b = get(u, STAFF)
    check(f"{who} gets who confirmed it, but not the owner-return record", b.get("reunion_confirmed_by") == "officer" and b.get("owner_return") is None)
    check(f"...and not the handover photo or the owner's phone", "https://cdn.example/handover.jpg" not in photos(b) and "09179999999" not in str(b))
b = get(owner, STAFF)
check("the owner still gets the record and the handover photo", b.get("owner_return") is not None and "https://cdn.example/handover.jpg" in photos(b))
check("staff still get the handover photo", "https://cdn.example/handover.jpg" in photos(get(leader, STAFF)))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
