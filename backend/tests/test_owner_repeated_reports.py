"""
Repeated reports, Phase 5B of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md: a report linked to a pet
that is under observation on another report notifies the handling leader once (whatever path sets the link), shows
on both reports, and is logged with one "Repeated incident" entry. A report merged into another is not a repeat.
Run from the backend folder:  python tests/test_owner_repeated_reports.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "owner_repeated_reports_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-repeated-reports-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import owner_followups, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (reports.router, owner_followups.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)

db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Olga Owner", 1, subdivision_id=1, barangay_id=1)
neighbour = mk_user("Nina Neighbour", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leo Leader", 2, subdivision_id=1, barangay_id=1)
bantay = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Active")
other_pet = Pet(pet_name="Brownie", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add_all([bantay, other_pet])
db.flush()


def mk_report(pet=None, **kw):
    r = Report(user_id=neighbour.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", pet_id=pet.pet_id if pet else None,
               assigned_leader_id=leader.user_id, **kw)
    db.add(r)
    db.flush()
    return r


R_MAIN = mk_report(bantay)
R_EARLY = mk_report()        # linked to Bantay before any observation
R_REPEAT = mk_report()       # a new sighting of Bantay during the observation
R_MERGED = mk_report()       # the same event, merged into the main report
R_OTHER = mk_report()        # a different pet
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def repeat_notes(report_id):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == leader.user_id,
                                         Notification.title == f"Repeated report: Report #{report_id}").count()


def link(report, pet, **kw):
    """Set the link the way any route does: on the report, then commit (the save hook does the rest)."""
    row = db.get(Report, report.report_id)
    row.pet_id = pet.pet_id if pet else None
    for k, v in kw.items():
        setattr(row, k, v)
    db.commit()


def followup():
    return client.get(f"/owner-followups/by-report/{R_MAIN.report_id}", headers=H(leader)).json()


# ---- before any observation: a pet link is not a repeat ----
link(R_EARLY, bantay)
check("a link before any observation notifies nobody", repeat_notes(R_EARLY.report_id) == 0)
link(R_EARLY, None)

r = client.post("/owner-followups", json={"report_id": R_MAIN.report_id}, headers=H(leader))
F = r.json().get("followup_id") if r.status_code == 201 else None
check("the leader starts observing Bantay on the main report", F is not None, r.text[:200])
check("...no repeats yet", followup().get("unlogged_repeat_report_ids") == [], followup())

# ---- a new report about Bantay during the observation ----
link(R_REPEAT, bantay)
check("a report linked to Bantay notifies the handling leader", repeat_notes(R_REPEAT.report_id) == 1)
n = db.query(Notification).filter(Notification.title == f"Repeated report: Report #{R_REPEAT.report_id}").first()
check("...the notice points to the report under observation", n is not None and n.related_id == R_MAIN.report_id
      and f"#{R_MAIN.report_id}" in n.message, n and n.message)
link(R_REPEAT, None)
link(R_REPEAT, bantay)
check("...unlinking and linking it again does not notify twice", repeat_notes(R_REPEAT.report_id) == 1)
body = client.get(f"/reports/{R_REPEAT.report_id}", headers=H(leader)).json()
check("the new report shows the report under observation (leader)", body.get("observing_followup_report_id") == R_MAIN.report_id,
      {k: body.get(k) for k in ("observing_followup_report_id", "detail")})
body = client.get(f"/reports/{R_REPEAT.report_id}", headers=H(neighbour)).json()
check("...the reporter does not see it", body.get("observing_followup_report_id") is None)
check("the main report's follow-up lists it as not logged", followup().get("unlogged_repeat_report_ids") == [R_REPEAT.report_id], followup())

# ---- a merged duplicate is the same event ----
link(R_MERGED, bantay, duplicate_of_report_id=R_MAIN.report_id)
check("a report merged into the main report notifies nobody", repeat_notes(R_MERGED.report_id) == 0)
check("...and is not listed as a repeat", followup().get("unlogged_repeat_report_ids") == [R_REPEAT.report_id], followup())

# ---- another pet ----
link(R_OTHER, other_pet)
check("a report about another pet notifies nobody", repeat_notes(R_OTHER.report_id) == 0)

# ---- one-click log ----
url = f"/owner-followups/{F}/contacts"
check("a repeated incident needs its report", client.post(url, json={"method": "Repeated incident", "note": "Seen again"},
      headers=H(leader)).status_code == 422)
check("...and not the report under observation itself", client.post(url, json={"method": "Repeated incident", "note": "Seen again",
      "related_report_id": R_MAIN.report_id}, headers=H(leader)).status_code == 422)
r = client.post(url, json={"method": "Repeated incident", "note": f"Report #{R_REPEAT.report_id}: seen roaming again",
                           "related_report_id": R_REPEAT.report_id}, headers=H(leader))
check("the leader logs the repeat in one entry", r.status_code == 201 and r.json().get("unlogged_repeat_report_ids") == [], r.text[:200])
check("...logging the same report twice is refused", client.post(url, json={"method": "Repeated incident", "note": "again",
      "related_report_id": R_REPEAT.report_id}, headers=H(leader)).status_code == 409)
link(R_REPEAT, None)
link(R_REPEAT, bantay)
check("...a logged repeat does not notify again", repeat_notes(R_REPEAT.report_id) == 1)

print(f"\n{sum(results)}/{len(results)} repeated report checks passed")
db.close()
sys.exit(0 if all(results) else 1)
