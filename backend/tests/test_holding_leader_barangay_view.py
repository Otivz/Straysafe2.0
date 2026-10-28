"""
A Subdivision Leader follows every animal at the Barangay holding place of their own barangay (read-only view on the
leader's "At Barangay" tab), but never another barangay's, whatever the request says:
  GET /holding/?barangay_only=true  as a Subdivision Leader  -> animals at Barangay facilities of the leader's barangay,
                                                              from every subdivision of it
  ...even when the request names another barangay_id; and a leader with no subdivision gets nothing.
Run from the backend folder:  python tests/test_holding_leader_barangay_view.py
"""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "holding_leader_barangay_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-leader-barangay-view-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.report import FacilityStatus, HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import holding  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(holding.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for fid in range(1, 9):
    db.add(FacilityStatus(status_id=fid, status_name=f"F{fid}"))
db.flush()

# Facilities: the Barangay holding place of barangay 1 and of barangay 2, and a subdivision pen of subdivision 1
FAC_B1 = Landmark(name="Barangay B1 Holding", latitude=14.8, longitude=121.0, is_holding_facility=True, barangay_id=1, subdivision_id=None)
FAC_B2 = Landmark(name="Barangay B2 Holding", latitude=14.9, longitude=121.1, is_holding_facility=True, barangay_id=2, subdivision_id=None)
FAC_S1 = Landmark(name="S1 Pen", latitude=14.81, longitude=121.01, is_holding_facility=True, barangay_id=1, subdivision_id=1)
db.add_all([FAC_B1, FAC_B2, FAC_S1])
db.flush()


def mk_user(name, role, subd):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd, barangay_id=None)
    db.add(u)
    db.flush()
    return u


reporter = mk_user("Rita Reporter", 1, 1)
leader1 = mk_user("Leo One", 2, 1)       # subdivision 1, barangay 1
leader3 = mk_user("Lea Three", 2, 3)     # subdivision 3, barangay 2
leader_none = mk_user("Lou Nobody", 2, None)


def hold(subd, fac, label):
    r = Report(user_id=reporter.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=7, animal_type="Dog", facility_id=fac.landmark_id, custody_status="In Barangay Facility")
    db.add(r)
    db.flush()
    a = HoldingAnimal(report_id=r.report_id, animal_type="Dog", animal_name=label, facility_status=2, intake_date=datetime(2026, 10, 1))
    db.add(a)
    db.flush()
    return a


own_at_b1 = hold(1, FAC_B1, "own-at-B1")
other_subd_at_b1 = hold(2, FAC_B1, "other-subd-at-B1")
at_b2 = hold(3, FAC_B2, "at-B2")
own_in_pen = hold(1, FAC_S1, "own-in-pen")
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def names(resp):
    return sorted(a["animal_name"] for a in resp.json()) if resp.status_code == 200 else resp.status_code


r = client.get("/holding/", params={"barangay_only": True}, headers=H(leader1))
check("a leader sees the animals at the Barangay holding place of their barangay, from every subdivision",
      names(r) == ["other-subd-at-B1", "own-at-B1"], names(r))
check("...not the subdivision pen, and not another barangay's holding place",
      "own-in-pen" not in names(r) and "at-B2" not in names(r))

r = client.get("/holding/", params={"barangay_only": True, "barangay_id": 2}, headers=H(leader1))
check("naming another barangay in the request changes nothing: the server uses the leader's barangay",
      names(r) == ["other-subd-at-B1", "own-at-B1"], names(r))

r = client.get("/holding/", params={"barangay_only": True}, headers=H(leader3))
check("a leader of another barangay sees only that barangay's holding place", names(r) == ["at-B2"], names(r))

r = client.get("/holding/", params={"barangay_only": True}, headers=H(leader_none))
check("a leader with no subdivision sees nothing", names(r) == [], names(r))

r = client.get("/holding/", params={"subdivision_id": 1}, headers=H(leader1))
check("the leader's own subdivision list is unchanged: own animals wherever they are held",
      names(r) == ["own-at-B1", "own-in-pen"], names(r))

r = client.get("/holding/", params={"barangay_only": True}, headers=H(reporter))
check("a resident still gets no holding list (403)", r.status_code == 403, r.status_code)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
