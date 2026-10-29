"""
Owner warning rules, Phase 5A of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md:
only the Subdivision Leader issues owner warnings; a Rabies Risk report cannot be observed; an Injured, Aggressive
or High priority report carries a caution on the follow-up; a pet has at most one follow-up under observation.
Run from the backend folder:  python tests/test_owner_warning_rules.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "owner_warning_rules_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-warning-rules-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import owner_followups, reports, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (reports.router, owner_followups.router, warnings.router):
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
staff = mk_user("Ben Barangay", 3, barangay_id=1)
admin = mk_user("Ada Admin", 4)
pets = [Pet(pet_name=f"Dog {i}", pet_type="Dog", owner_id=owner.user_id, status="Active") for i in range(6)]
db.add_all(pets)
db.flush()


def mk_report(pet, category=4, priority="Medium"):
    r = Report(user_id=neighbour.user_id, subdivision_id=1, category_id=category, priority_level=priority,
               latitude=14.8, longitude=121.0, current_status_id=2, animal_type="Dog", pet_id=pet.pet_id,
               assigned_leader_id=leader.user_id)
    db.add(r)
    db.flush()
    return r


R_ROAM = mk_report(pets[0])
R_RABIES = mk_report(pets[1], category=3)
R_INJURED = mk_report(pets[2], category=1)
R_AGGRESSIVE_HIGH = mk_report(pets[3], category=2, priority="High")
R_SAME_PET = mk_report(pets[0])
R_HIGH = mk_report(pets[4], priority="High")
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def start(report):
    return client.post("/owner-followups", json={"report_id": report.report_id}, headers=H(leader))


def warn(who, level="Notice"):
    return client.post("/warnings/", headers=H(who), json={
        "user_id": owner.user_id, "warning_level": level, "violation_type": "Free-Roaming Unleashed",
        "description": "Your dog was seen roaming the street without a leash."})


# ---- only the Subdivision Leader issues warnings ----
r = warn(staff)
check("Barangay staff can't issue an owner warning", r.status_code == 403 and "Subdivision Leader" in r.text, r.text[:200])
check("the administrator can't issue one", warn(admin).status_code == 403)
check("a resident can't issue one", warn(neighbour).status_code == 403)
r = warn(leader)
check("the Subdivision Leader issues one", r.status_code == 200, r.text[:200])
check("Barangay staff still read the warning history", client.get("/warnings/", headers=H(staff)).status_code == 200)
check("the administrator still reads it", client.get(f"/warnings/user/{owner.user_id}", headers=H(admin)).status_code == 200)

# ---- Rabies Risk cannot be observed ----
r = start(R_RABIES)
check("a Rabies Risk report can't be observed", r.status_code == 400 and "Rabies Risk" in r.text, r.text[:200])

# ---- caution for Injured, Aggressive or High priority ----
r = start(R_ROAM)
check("a Roaming Animal report starts with no caution", r.status_code == 201 and r.json().get("caution") is None, r.text[:200])
r = start(R_INJURED)
check("an Injured report can be observed, with a caution", r.status_code == 201 and "Injured" in (r.json().get("caution") or ""), r.text[:200])
r = start(R_AGGRESSIVE_HIGH)
c = r.json().get("caution") or "" if r.status_code == 201 else ""
check("an Aggressive, High priority report names both reasons", "Aggressive" in c and "High priority" in c, r.text[:200])
r = start(R_HIGH)
check("a High priority report carries a caution", r.status_code == 201 and "High priority" in (r.json().get("caution") or ""), r.text[:200])
own = client.get(f"/owner-followups/by-report/{R_INJURED.report_id}", headers=H(owner)).json()
check("the owner's view carries no caution", own is not None and "caution" not in own, own)

# ---- one follow-up under observation per pet ----
r = start(R_SAME_PET)
check("a second follow-up for the same pet on another report is refused",
      r.status_code == 409 and f"Report #{R_ROAM.report_id}" in r.text and "repeated incident" in r.text, r.text[:200])
db.expire_all()
check("...no follow-up was created for it",
      db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == R_SAME_PET.report_id).count() == 0)
f_roam = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == R_ROAM.report_id).one()
r = client.post(f"/owner-followups/{f_roam.followup_id}/close", headers=H(leader),
                json={"outcome": "owner_complied", "reason": "Owner fixed the gate, dog kept inside"})
check("the first follow-up ends (owner complied)", r.status_code == 200, r.text[:200])
r = start(R_SAME_PET)
check("...then the pet can be observed again on the new report", r.status_code == 201, r.text[:200])

# ---- one warning per incident (Phase 5D): the original report and a repeated incident each get one ----
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
db.flush()
leader_s2 = mk_user("Lou Second", 2, subdivision_id=2, barangay_id=1)
R_REPEAT_INCIDENT = mk_report(pets[0])
db.commit()


def warn_on(report, who=leader, user_id=None, level="Notice"):
    return client.post("/warnings/", headers=H(who), json={
        "user_id": user_id or owner.user_id, "pet_id": report.pet_id, "report_id": report.report_id, "warning_level": level,
        "violation_type": "Free-Roaming Unleashed", "description": "Seen roaming without a leash during the observation."})


check("a warning on the observed report", warn_on(R_ROAM).status_code == 200)
check("...a second one for the same incident is refused", warn_on(R_ROAM, level="1st Warning").status_code == 400)
r = warn_on(R_REPEAT_INCIDENT, level="1st Warning")
check("the repeated incident (another report) gets its own next warning", r.status_code == 200, r.text[:200])
check("a leader of another subdivision can't warn on this subdivision's report", warn_on(R_HIGH, who=leader_s2).status_code == 403)
check("a warning about a registered pet can't go to someone else", warn_on(R_HIGH, user_id=neighbour.user_id).status_code == 400)

# ---- who reads a report's or a pet's warnings (they carry the owner's name and phone) ----
check("another resident sees none of a report's warnings", client.get(f"/warnings/report/{R_ROAM.report_id}", headers=H(neighbour)).json() == [])
check("...nor of a pet's", client.get(f"/warnings/pet/{pets[0].pet_id}", headers=H(neighbour)).json() == [])
mine = client.get(f"/warnings/report/{R_ROAM.report_id}", headers=H(owner)).json()
check("the owner sees the warnings issued to them", len(mine) == 1 and mine[0]["user_id"] == owner.user_id, mine)
check("the leader sees them", len(client.get(f"/warnings/report/{R_ROAM.report_id}", headers=H(leader)).json()) == 1)

print(f"\n{sum(results)}/{len(results)} owner warning rule checks passed")
db.close()
sys.exit(0 if all(results) else 1)
