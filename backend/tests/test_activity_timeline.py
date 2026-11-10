"""
Phase 8 (docs/01-system/ACTIVITY_TIMELINE_RULES.md): observation started / extended / ended events on the report's
own history (manual start, first-warning start, extension, close, resolve and case closure), the public-safe
observation summary on the report detail, and owner names / contact details kept out of the timeline other residents
see.
Run from the backend folder:  python tests/test_activity_timeline.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "activity_timeline_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-activity-timeline-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402
from unittest.mock import patch  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from _case_helpers import make_warning_ready  # noqa: E402  (what an owner warning now requires)
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import owner_followups, reports, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (owner_followups.router, reports.router, warnings.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.add(ReportCategory(category_id=4, category_name="Roaming Animal"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=1, barangay_id=1, phone="09171234567")
    db.add(u)
    db.flush()
    return u


owner, viewer, leader = mk("Juan Dela Cruz", 1), mk("Maria Viewer", 1), mk("Leader Alpha", 2)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HO, HV, HL = H(owner), H(viewer), H(leader)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def pet(name):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type="Dog", status="Active")
    db.add(p)
    db.commit()
    return p.pet_id


def report(pet_id, **kw):
    r = Report(user_id=viewer.user_id, subdivision_id=1, category_id=4, animal_type="Dog", current_status_id=2,
               latitude=14.5, longitude=121.0, pet_id=pet_id, visibility="Public", visibility_decided_by=leader.user_id,
               assigned_leader_id=leader.user_id, landmark="Gate 2", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def history(rid):
    db.expire_all()
    return [h.remarks or "" for h in db.query(StatusHistory).filter(StatusHistory.report_id == rid).order_by(StatusHistory.history_id).all()]


def detail(rid, h):
    return client.get(f"/reports/{rid}", headers=h)


# ── Manual start, extension, close ──
r1 = report(pet("Bantay"))
r = client.post("/owner-followups/", json={"report_id": r1, "notes": "Keep him leashed"}, headers=HL)
check("start: observation started", r.status_code == 201, r.text[:200])
fu1 = r.json()["followup_id"]
h = history(r1)
check("timeline: 'Observation started' with its deadline", any(x.startswith("Observation started: the owner has until") for x in h), h)
check("timeline: the start entry names no owner", not any("Juan" in x for x in h if x.startswith("Observation")))
d = detail(r1, HV).json()
check("summary: open observation with a UTC due date on the public report", d.get("observation", {}).get("open") is True
      and (d["observation"]["due_at"] or "").endswith("+00:00"), d.get("observation"))
check("summary: no owner details in it", set(d["observation"].keys()) == {"open", "status", "due_at", "extended", "ended_at", "outcome", "started_at"},
      sorted(d["observation"].keys()))

r = client.post(f"/owner-followups/{fu1}/extend", json={"extension_reason": "Owner is fixing the gate latch", "extension_days": 2}, headers=HL)
check("extend: extended once", r.status_code == 200, r.text[:200])
h = history(r1)
check("timeline: 'Observation extended by 2 days' with the new deadline", any(x.startswith("Observation extended by 2 days: new deadline") for x in h), h)
check("timeline: the extension reason (staff text) isn't on the public timeline entry", not any("gate latch" in x for x in h))
check("summary: shows the extension", detail(r1, HV).json()["observation"]["extended"] is True)

r = client.post(f"/owner-followups/{fu1}/close", json={"outcome": "complied", "reason": "Gate fixed, dog kept inside"}, headers=HL)
check("close: ended as complied", r.status_code == 200, r.text[:200])
check("timeline: 'Observation ended: the owner complied'", "Observation ended: the owner complied." in history(r1))
obs = detail(r1, HV).json()["observation"]
check("summary: no longer open, with the outcome", obs["open"] is False and obs["outcome"] == "the owner complied" and obs["ended_at"], obs)
starts = [i for i, x in enumerate(history(r1)) if x.startswith("Observation started")]
ends = [i for i, x in enumerate(history(r1)) if x.startswith("Observation ended")]
check("timeline: started comes before ended", starts and ends and starts[0] < ends[0])

# ── First warning starts the observation ──
r2 = report(pet("Browny"))
make_warning_ready(db, r2, owner.user_id, observation_days=3)   # verified incident, confirmed owner, confirmed policy
with patch("app.routes.warnings.dispatch_notification"), \
     patch("app.services.email_templates.render_owner_warning_email", return_value=("S", "B", "<b>B</b>")):
    r = client.post("/warnings/", headers=HL, json={"user_id": owner.user_id, "report_id": r2, "warning_level": "1st Warning",
                                                    "violation_type": "Free-Roaming Unleashed", "description": "Roaming again"})
check("warning: first warning issued", r.status_code == 200, r.text[:200])
h = history(r2)
check("timeline: the first warning's observation uses the same 'Observation started' entry",
      any(x.startswith("Observation started") for x in h) and not any("3-day monitoring period initiated" in x for x in h), h)
check("history: entries take the database clock (no explicit app-server time)", all(
    e.created_at is not None for e in db.query(StatusHistory).filter(StatusHistory.report_id == r2).all()))

# ── Case closure ends the observation ──
r3 = report(pet("Tagpi"))
fu3 = client.post("/owner-followups/", json={"report_id": r3}, headers=HL).json()["followup_id"]
rep3 = db.get(Report, r3)
rep3.current_status_id = 11
db.commit()
db.expire_all()
check("closure: the observation ends with the case", db.get(OwnerFollowUp, fu3).status == "closed")
check("timeline: 'Observation ended: closed with the case'", "Observation ended: closed with the case." in history(r3))

r5 = report(pet("Puti"))
fu5 = client.post("/owner-followups/", json={"report_id": r5}, headers=HL).json()["followup_id"]
r = client.post(f"/owner-followups/{fu5}/close", json={"outcome": "escalated", "reason": "No compliance after the deadline"}, headers=HL)
check("escalation: the observation is endorsed", r.status_code == 200, r.text[:200])
check("timeline: 'Observation ended: endorsed to the Barangay'", "Observation ended: endorsed to the Barangay." in history(r5))
check("timeline: the endorsement reason (staff text) isn't on the public entry", not any("No compliance" in x for x in history(r5)))

# ── Names and contact details out of the public timeline ──
r4 = report(None)
db.add(OwnerFollowUp(report_id=r4, subdivision_id=1, leader_id=leader.user_id, owner_id=None, owner_name="Mang Kanor Reyes",
                     owner_phone="09175556666", status="observing", due_at=datetime.utcnow() + timedelta(days=3), duration_days=3))
db.add(StatusHistory(report_id=r4, report_status_id=2, updated_by=leader.user_id,
                     remarks="Talked to Mang Kanor Reyes at 0917 555 6666 (kanor@mail.com) about the dog."))
db.commit()
pub = " ".join((h_.get("remarks") or "") for h_ in detail(r4, HV).json().get("history", []))
check("redact: the observed owner's name is out of another resident's timeline", "Mang Kanor" not in pub and "Talked to" in pub, pub[:300])
check("redact: phone numbers and emails are out too", "0917 555 6666" not in pub and "kanor@mail.com" not in pub, pub[:300])
staff = " ".join((h_.get("remarks") or "") for h_ in detail(r4, HL).json().get("history", []))
check("redact: staff still see the full entry", "Mang Kanor Reyes" in staff and "0917 555 6666" in staff, staff[:300])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
