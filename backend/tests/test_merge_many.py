"""
Merging a group of reports of the same animal: the first-filed report is always the main case. All-or-nothing.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_merge_many.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "merge_many_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-merge-many-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
for sid, name in [(1, "Reported"), (2, "Verified"), (11, "Incident Resolved"), (18, "Merged — Duplicate")]:
    db.add(ReportStatus(status_id=sid, status_name=name))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


res_a = mk_user("Resident A", 1, subdivision_id=1, barangay_id=1)
res_b = mk_user("Resident B", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
other_leader = mk_user("Other Leader", 2, subdivision_id=1, barangay_id=1)
leader2 = mk_user("Leader Two", 2, subdivision_id=2, barangay_id=1)
staff = mk_user("Brgy Staff", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


CLOCK = [datetime(2026, 10, 1, 8, 0)]


def mk(status=2, breed="Shih Tzu", animal="Dog", by=res_a, claimed=leader, subd=1, filed=None):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=by.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0, current_status_id=status,
               animal_type=animal, animal_breed=breed, assigned_leader_id=claimed.user_id if claimed else None,
               created_at=filed or CLOCK[0])
    db.add(r)
    db.commit()
    return r.report_id


def merge_many(main, ids, who=leader, notes="same dog seen by several residents"):
    # The group is every ticked report; the server picks the first-filed one as the main case.
    return client.post("/reports/merge-group", json={"report_ids": [main] + list(ids), "notes": notes}, headers=H(who))


def get(rid):
    db.expire_all()
    return db.get(Report, rid)


# --- Happy path ---------------------------------------------------------------------
M = mk()
D1, D2, D3 = mk(by=res_b), mk(claimed=None), mk(by=res_b, claimed=None)
r = merge_many(M, [D1, D2, D3, D1, M])
check("four reports merge in one action, with the first-filed as main", r.status_code == 200 and r.json()["report_id"] == M, r.text[:200])
check("each one is now 'Merged — Duplicate' pointing at the main case",
      all(get(x).current_status_id == 18 and get(x).duplicate_of_report_id == M for x in (D1, D2, D3)))
check("the main case stays open", get(M).current_status_id == 2 and get(M).duplicate_of_report_id is None)
check("repeated ids and the main case itself in the list are ignored",
      db.query(StatusHistory).filter(StatusHistory.report_id == D1, StatusHistory.report_status_id == 18).count() == 1)
check("unclaimed duplicates take the main case's handler", get(D2).assigned_leader_id == leader.user_id)
check("the main case's history lists each linked report",
      db.query(StatusHistory).filter(StatusHistory.report_id == M, StatusHistory.remarks.like("Linked duplicate Report #%")).count() == 3)
check("each merge is audit-logged", db.query(AuditLog).filter(AuditLog.action == "MERGE_DUPLICATE_REPORT").count() == 3)
check("other reporters are notified", db.query(Notification).filter(Notification.user_id == res_b.user_id).count() >= 2)

# --- The first-filed report is the main case, whatever was ticked first ----------------
LATE, EARLY = mk(), mk(filed=datetime(2026, 9, 1, 7, 0))
r = merge_many(LATE, [EARLY])
check("the earliest-filed report becomes the main case automatically",
      r.status_code == 200 and r.json()["report_id"] == EARLY and get(LATE).duplicate_of_report_id == EARLY, r.text[:200])
NEWER, OLDER = mk(), mk(filed=datetime(2026, 9, 2, 7, 0))
r = client.post(f"/reports/{OLDER}/merge", json={"primary_report_id": NEWER, "notes": "asked to make the newer one main"}, headers=H(leader))
check("the one-at-a-time merge follows the same rule: the older report stays main even if the newer one was named",
      r.status_code == 200 and get(NEWER).duplicate_of_report_id == OLDER and get(OLDER).duplicate_of_report_id is None, r.text[:200])

# --- Earlier duplicates follow their main case -----------------------------------------
OLDEST = mk(filed=datetime(2026, 8, 1, 7, 0))
r = merge_many(M, [OLDEST])
check("a main case with its own duplicates can be merged into an older report", r.status_code == 200 and r.json()["report_id"] == OLDEST, r.text[:200])
check("its earlier duplicates now point at the oldest report (no chains)",
      all(get(x).duplicate_of_report_id == OLDEST for x in (M, D1, D2, D3)))

# --- All-or-nothing -------------------------------------------------------------------
M3 = mk()
ok1, bad_breed = mk(), mk(breed="Aspin")
r = merge_many(M3, [ok1, bad_breed])
check("one different-breed report makes the whole merge fail, naming it",
      r.status_code == 400 and f"#{bad_breed}" in r.json()["detail"], r.text[:200])
check("...and nothing was merged", get(ok1).current_status_id == 2 and get(ok1).duplicate_of_report_id is None)

cat = mk(animal="Cat", breed=None)
r = merge_many(M3, [ok1, cat])
check("a different animal type is refused", r.status_code == 400 and f"#{cat}" in r.json()["detail"], r.text[:200])

closed = mk(status=11)
r = merge_many(M3, [ok1, closed])
check("a closed report is refused", r.status_code == 400 and f"#{closed}" in r.json()["detail"], r.text[:200])

theirs = mk(claimed=other_leader)
r = merge_many(M3, [ok1, theirs])
check("a report another officer is handling is refused", r.status_code == 403 and f"#{theirs}" in r.json()["detail"], r.text[:200])

elsewhere = mk(subd=2, claimed=leader2)
r = merge_many(M3, [ok1, elsewhere])
check("a report from another subdivision is refused", r.status_code == 403, r.text[:200])
check("...still nothing merged after all refused attempts", get(ok1).duplicate_of_report_id is None)

# --- Main case and permission checks ------------------------------------------------------
r = merge_many(D1, [ok1])
check("a report that's already a duplicate can't be in a new group", r.status_code == 400, r.text[:200])
other_main = mk(claimed=other_leader, filed=datetime(2026, 7, 1, 7, 0))
r = merge_many(other_main, [ok1])
check("can't merge into another officer's case (their report is the first one)", r.status_code == 403, r.text[:200])
r = merge_many(M3, [ok1], notes="x")
check("a short reason is refused", r.status_code == 400, r.text[:200])
r = merge_many(M3, [])
check("a group of one is refused", r.status_code == 400, r.text[:200])
r = merge_many(M3, [ok1], who=res_a)
check("residents can't merge", r.status_code == 403, r.text[:200])
r = merge_many(M3, [ok1], who=staff)
check("Barangay staff can't merge cases the Subdivision Leader is handling", r.status_code == 403, r.text[:200])
r = client.post("/reports/merge-group", json={"report_ids": [M3, ok1], "notes": "same dog again"})
check("merging requires signing in", r.status_code == 401)

r = merge_many(M3, [ok1])
check("after all that, a valid merge still works", r.status_code == 200 and get(ok1).duplicate_of_report_id == M3, r.text[:200])

# --- Single merge still works the same way ------------------------------------------------
S_main, S_dup = mk(), mk(claimed=None)
r = client.post(f"/reports/{S_dup}/merge", json={"primary_report_id": S_main, "notes": "same dog, single merge"}, headers=H(leader))
check("the original one-at-a-time merge still works", r.status_code == 200 and get(S_dup).duplicate_of_report_id == S_main, r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
