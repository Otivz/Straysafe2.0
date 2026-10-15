"""
A report filed by an official (e.g. a Subdivision Leader) shows that official's name on their own timeline actions to
other residents ("Report claimed by Leo Leader"), instead of "Community Reporter". A resident who files a report
stays anonymous everywhere, exactly as before (report visibility, rule 3).
Run from the backend folder:  python tests/test_official_reporter_timeline.py
"""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "official_reporter_timeline_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-official-reporter-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils import report_visibility as rv  # noqa: E402
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
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


leader = mk("Leo Leader", 2)
resident = mk("Rita Reporter", 1)
neighbour = mk("Nina Neighbour", 1)


def case(filed_by):
    r = Report(user_id=filed_by.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", assigned_leader_id=leader.user_id, visibility="Public",
               visibility_decided_by=leader.user_id, verification_status="verified_true")
    db.add(r)
    db.flush()
    db.add(StatusHistory(report_id=r.report_id, report_status_id=2, updated_by=leader.user_id, created_at=datetime(2026, 10, 2),
                         remarks=f"Claimed the report by {leader.name}."))
    db.add(StatusHistory(report_id=r.report_id, report_status_id=2, updated_by=filed_by.user_id, created_at=datetime(2026, 10, 3),
                         remarks=f"Extra detail added by {filed_by.name}."))
    db.commit()
    return r.report_id


BY_LEADER = case(leader)
BY_RESIDENT = case(resident)
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


b = client.get(f"/reports/{BY_LEADER}", headers=H(neighbour)).json()
names = [h.get("updater_name") for h in b.get("history", [])]
text = " ".join(h.get("remarks") or "" for h in b.get("history", []))
check("report filed by a leader: their actions show their name to other residents", names and all(n == "Leo Leader" for n in names), names)
check("...and their name stays in the entry text", "Leo Leader" in text and "a resident" not in text, text)
check("...the 'reported by' field itself stays as before", b.get("reporter_name") == rv.COMMUNITY_REPORTER, b.get("reporter_name"))

b = client.get(f"/reports/{BY_RESIDENT}", headers=H(neighbour)).json()
names = [h.get("updater_name") for h in b.get("history", [])]
text = " ".join(h.get("remarks") or "" for h in b.get("history", []))
check("report filed by a resident: the reporter is still anonymous", b.get("reporter_name") == rv.COMMUNITY_REPORTER and "Rita Reporter" not in text, text)
check("...their own entry shows 'Community Reporter', the leader's shows the leader", names == ["Leo Leader", rv.COMMUNITY_REPORTER], names)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
