"""
Phase 5: separate-incident override. A pet confirmed in an active case locks look-alike suggestions on other reports
("merge into Case #N"). Staff can mark a report as a genuinely separate incident (reason required, logged); it then
follows the normal flow as its own case. A resolved case never locks anything.
Run from the backend folder:  python tests/test_separate_incident.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "separate_incident_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-separate-incident-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (matches.router, reports.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, leader = mk("Res", 1), mk("Owner", 1), mk("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO = H(LEADER, 2), H(OWNER, 1)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report():
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def suggest(rid, pid=None, other=None):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pid, matched_report_id=other, similarity_score=90, status="AI_SUGGESTED")
    db.add(m)
    db.commit()
    return m.match_id


def view(mid):
    return client.get(f"/matches/{mid}", headers=HL).json()


def looks(rid):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == OWNER, Notification.related_id == rid,
                                         Notification.title.like("%Look-Alike%")).count()


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
db.add(pet)
db.commit()
PET = pet.pet_id
R1 = report()
m1 = suggest(R1, PET)
client.post(f"/matches/{m1}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
client.post(f"/matches/{m1}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)

R20 = report()
m20, pair = suggest(R20, PET), suggest(R20, other=R1)
v = view(m20)
check("Boyet's active case locks the suggestion on Report #20", bool(v.get("identity_lock_reason")) and v.get("separate_incident_case_id") == R1, v)
check("...confirming it is refused", client.post(f"/matches/{m20}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "looks like Boyet"},
                                                 headers=HL).status_code == 409)

body = {"reason": "Boyet was returned home on Sept 2; this is a new escape a week later"}
check("a reason is required", client.post(f"/reports/{R20}/separate-incident", json={"reason": "new"}, headers=HL).status_code == 400)
check("residents can't override", client.post(f"/reports/{R20}/separate-incident", json=body, headers=HO).status_code == 403)
R25 = report()
check("a report with nothing locked has nothing to override", client.post(f"/reports/{R25}/separate-incident", json=body, headers=HL).status_code == 400)

r = client.post(f"/reports/{R20}/separate-incident", json=body, headers=HL)
check("staff mark Report #20 as a separate incident", r.status_code == 200 and r.json().get("cases") == [R1], r.text[:200])
db.expire_all()
rep = db.get(Report, R20)
check("...the reason, who and when are recorded", rep.separate_incident_reason == body["reason"] and rep.separate_incident_by == LEADER
      and rep.separate_incident_at is not None)
check("...the override is logged", db.query(AuditLog).filter(AuditLog.action == "OVERRIDE_SEPARATE_INCIDENT").count() == 1)
p = db.get(ReportMatch, pair)
check("...the 'same animal as Case #1' suggestion is answered as not the same case", p.status == "NOT_A_MATCH" and p.reviewed_by == LEADER)
check("...nothing is confirmed by the override", db.get(ReportMatch, m20).status == "AI_SUGGESTED" and rep.duplicate_of_report_id is None)
check("...the owner gets the usual look-alike notice, once", looks(R20) == 1)
check("doing it twice is refused", client.post(f"/reports/{R20}/separate-incident", json=body, headers=HL).status_code == 409)
check("the lock is lifted", not view(m20).get("identity_lock_reason"))

# Normal flow from here: staff confirm, then the owner is asked
r = client.post(f"/matches/{m20}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar, new escape"}, headers=HL)
check("staff can now confirm it as its own case", r.status_code == 200, r.text[:200])
db.expire_all()
check("...and the owner is asked to confirm, as for any new case", db.get(ReportMatch, m20).owner_confirmation_status == "PENDING")

# A merged report can't be split off this way
R30 = report()
client.post("/reports/merge-group", json={"report_ids": [R1, R30], "notes": "same dog, same collar"}, headers=HL)
check("a report inside a case must be unmerged first", client.post(f"/reports/{R30}/separate-incident", json=body, headers=HL).status_code == 400)

# Resolved case: a new report is a new incident, no override needed
db.get(Report, R1).current_status_id = 11
db.get(Report, R20).current_status_id = 11
db.commit()
R40 = report()
m40 = suggest(R40, PET)
check("after the case is resolved a new report isn't locked", not view(m40).get("identity_lock_reason"))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
