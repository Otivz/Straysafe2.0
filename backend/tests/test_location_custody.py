"""
Location Intelligence: an animal is in a holding place only with recorded evidence (an open holding record or a recorded
facility), never because of a status alone. Status 7 is also the owner observation started by a First Warning, where the
animal stays with its owner.
Covers: warning + 3-day observation, escalation, dispatch, pickup, recorded intake, observation inside a holding place,
an open holding record, stale custody, the report list, and the Subdivision Leader's "already held" check.
Run from the backend folder:  python tests/test_location_custody.py
"""
import os
import sys
import tempfile
from datetime import timedelta
from unittest.mock import patch

_DB = os.path.join(tempfile.mkdtemp(), "location_custody_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-location-custody-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.owner_followups import _now  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
api.include_router(warnings.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
FACILITY_LAT, FACILITY_LNG = 14.806906, 121.0039297
impound = Landmark(name="Barangay San Vicente Animal Impound Facility", category="facility", barangay_id=1,
                   latitude=FACILITY_LAT, longitude=FACILITY_LNG, is_holding_facility=True, status="Active")
db.add(impound)


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner, leader, staff = mk("Owner One", 1), mk("Leader Santos", 2), mk("Staff Cruz", 3)
pet = Pet(owner_id=owner.user_id, pet_name="Baron", pet_type="Dog", breed="Aspin", status="Active")
db.add(pet)
db.commit()
FAC = impound.landmark_id
SIGHT_LAT, SIGHT_LNG = 14.80148264, 121.00332141


def report(status_id, **kw):
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=4, latitude=SIGHT_LAT, longitude=SIGHT_LNG,
               initial_latitude=SIGHT_LAT, initial_longitude=SIGHT_LNG, initial_landmark="Phase 1 Gate", landmark="Phase 1 Gate",
               current_status_id=status_id, animal_type="Dog", description="Roaming", priority_level="Medium", visibility="Private", **kw)
    db.add(r)
    db.commit()
    return r.report_id


H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def view(rid, user=leader):
    r = client.get(f"/reports/{rid}", headers=H(user))
    return r.json() if r.status_code == 200 else {"_status": r.status_code, "_text": r.text[:200]}


def not_held(label, d):
    check(f"{label}: not in a holding place", d.get("custody_status") == "Sighting" and not d.get("facility") and not d.get("facility_id"),
          (d.get("custody_status"), d.get("facility"), d.get("facility_id"), d.get("_text")))
    check(f"{label}: pin stays at the sighting", abs(float(d.get("latitude") or 0) - SIGHT_LAT) < 1e-6 and abs(float(d.get("longitude") or 0) - SIGHT_LNG) < 1e-6,
          (d.get("latitude"), d.get("longitude")))
    check(f"{label}: landmark is not the facility", "Impound" not in (d.get("landmark") or ""), d.get("landmark"))


def held(label, d):
    check(f"{label}: in the holding place", d.get("custody_status") == "Secured in Facility" and (d.get("facility") or {}).get("landmark_id") == FAC,
          (d.get("custody_status"), d.get("facility")))
    check(f"{label}: pin at the holding place", abs(float(d.get("latitude") or 0) - FACILITY_LAT) < 1e-6, d.get("latitude"))


# 1. Warning + 3-day observation (the reported bug): status 7, no facility, no holding record
rid = report(2, pet_id=pet.pet_id, assigned_leader_id=leader.user_id)
with patch("app.utils.notification_dispatcher.dispatch_notification"), \
        patch("app.services.email_templates.render_owner_warning_email", return_value=("S", "B", "<b>B</b>")):
    res = client.post("/warnings/", json={"user_id": owner.user_id, "pet_id": pet.pet_id, "report_id": rid, "warning_level": "1st Warning",
                                          "violation_type": "Free-Roaming Unleashed", "description": "Unattended outside.", "fine_amount": 0.0},
                      headers=H(leader))
check("first warning issued", res.status_code == 200, f"{res.status_code} {res.text[:200]}")
db.expire_all()
check("warning starts the owner observation (status 7)", db.get(Report, rid).current_status_id == 7, db.get(Report, rid).current_status_id)
fu = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == rid).first()
check("observation due 3 days from now, in UTC", fu is not None and abs((fu.due_at - (_now() + timedelta(days=3))).total_seconds()) < 120,
      fu.due_at if fu else None)
not_held("leader view of an observation case", view(rid))
not_held("resident (owner) view of an observation case", view(rid, owner))
listed = [x for x in client.get("/reports/", headers=H(leader)).json() if x.get("report_id") == rid]
check("report list: observation case not placed at the facility", listed and listed[0].get("custody_status") == "Sighting"
      and not listed[0].get("facility") and abs(float(listed[0]["latitude"]) - SIGHT_LAT) < 1e-6, listed[:1])

# 2. A leader can't mark an observation case Impounded (the animal is with its owner, not in a holding place)
r = client.put(f"/reports/{rid}/status", json={"status_id": 8, "remarks": "x"}, headers=H(leader))
check("leader: observation case can't be set to Impounded without a holding place (403)", r.status_code == 403, f"{r.status_code} {r.text[:160]}")

# 3. Escalated, dispatched, picked up: none of these means held
not_held("escalated to the barangay (4)", view(report(4)))
not_held("approved and dispatched (13, 5)", view(report(5)))
not_held("picked up, on the way (6)", view(report(6)))

# 4. Recorded intake: impounded with a facility, and observation inside the holding place
held("impounded at a recorded facility (8)", view(report(8, facility_id=FAC)))
held("observation inside the holding place (7 + facility)", view(report(7, facility_id=FAC)))

# 5. An open holding record (place not recorded on the report): held, at the barangay's holding place
rid5 = report(16)
db.add(HoldingAnimal(report_id=rid5, animal_type="Dog", facility_status=2))
db.commit()
held("open holding record (16)", view(rid5, staff))

# 6. Status 8 with no facility and no holding record (bad data): not shown as held, no facility guessed
not_held("impounded status without any record", view(report(8)))

# 7. A stored in-facility custody with no evidence is stale
not_held("stale 'Secured in Facility' custody", view(report(2, custody_status="Secured in Facility")))

# 8. Resolved cases keep the original sighting
d = view(report(11, facility_id=FAC))
check("resolved case: no facility, original sighting", not d.get("facility") and abs(float(d.get("latitude") or 0) - SIGHT_LAT) < 1e-6,
      (d.get("facility"), d.get("latitude")))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
