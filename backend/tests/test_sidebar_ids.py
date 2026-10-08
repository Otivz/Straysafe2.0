"""
RC6: sidebar badges use GET /reports/sidebar-ids (ids only) instead of downloading the whole report list,
and the report list no longer runs 2 extra queries per report.
Run from the backend folder:  python tests/test_sidebar_ids.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "sidebar_ids_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-sidebar-ids-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
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
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


res = mk_user("Resident", 1, subdivision_id=1, barangay_id=1)
leader1 = mk_user("Leader One", 2, subdivision_id=1, barangay_id=1)
staff = mk_user("Brgy Staff", 3, barangay_id=1)
ids = {}
for name, subd, st in [("new1", 1, 1), ("verified1", 1, 2), ("new2", 2, 1), ("esc1", 1, 4), ("rescue2", 2, 5), ("approved1", 1, 13), ("done1", 1, 11)]:
    r = Report(user_id=res.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0, current_status_id=st, animal_type="Dog", ai_suggested_risk_level="Low")
    db.add(r)
    db.flush()
    ids[name] = r.report_id
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


r = client.get("/reports/sidebar-ids", params={"status_ids": "1"}, headers=H(leader1))
check("leader gets only their subdivision's new reports", r.status_code == 200 and sorted(r.json()["report_ids"]) == [ids["new1"]], r.text)
r = client.get("/reports/sidebar-ids", params={"status_ids": "1", "subdivision_id": 2}, headers=H(leader1))
check("...even when asking for another subdivision", r.status_code == 200 and r.json()["report_ids"] == [ids["new1"]], r.text)
r = client.get("/reports/sidebar-ids", params={"status_ids": "4,5,13"}, headers=H(staff))
check("barangay staff get escalated / approved / rescue reports", sorted(r.json()["report_ids"]) == sorted([ids["esc1"], ids["rescue2"], ids["approved1"]]), r.text)
r = client.get("/reports/sidebar-ids", params={"status_ids": "11,2"}, headers=H(staff))
check("only sidebar statuses can be asked for", r.status_code == 200 and r.json()["report_ids"] == [], r.text)
check("bad status list -> 400", client.get("/reports/sidebar-ids", params={"status_ids": "x"}, headers=H(staff)).status_code == 400)
check("residents can't use it", client.get("/reports/sidebar-ids", headers=H(res)).status_code == 403)
check("requires sign-in", client.get("/reports/sidebar-ids").status_code == 401)
check("/reports/{id} still works next to it", client.get(f"/reports/{ids['new1']}", headers=H(staff)).status_code == 200)

# The list no longer runs extra queries per report
for i in range(30):
    db.add(Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=1, animal_type="Dog", ai_suggested_risk_level="Low"))
db.commit()
count = {"q": 0}


@event.listens_for(engine, "before_cursor_execute")
def _c(*a, **k):
    count["q"] += 1


from fastapi import Response  # noqa: E402

out = reports.get_reports(response=Response(), subdivision_id=1, db=db, current_user=staff)
check(f"report list: {len(out)} reports in {count['q']} queries (not ~2 per report)", len(out) >= 30 and count["q"] < 25, count["q"])
# D3: default and maximum page size
reports.REPORTS_DEFAULT_PAGE_SIZE, reports.REPORTS_MAX_PAGE_SIZE = 10, 20
r = client.get("/reports/", headers=H(staff))
total = int(r.headers.get("X-Total-Count", 0))
check("no page size asked -> the default (newest first)", len(r.json()) == 10 and total > 10 and r.headers.get("X-Has-More") == "true",
      (len(r.json()), r.headers.get("X-Total-Count"), r.headers.get("X-Has-More")))
check("...newest reports come first", [x["report_id"] for x in r.json()] == sorted([x["report_id"] for x in r.json()], reverse=True))
r = client.get("/reports/", params={"limit": 5}, headers=H(staff))
check("an explicit smaller page size is kept", len(r.json()) == 5 and r.headers.get("X-Page-Size") == "5")
r = client.get("/reports/", params={"limit": 999}, headers=H(staff))
check("asking for more than the maximum is capped", len(r.json()) == 20 and r.headers.get("X-Page-Size") == "20", len(r.json()))
r = client.get("/reports/", params={"limit": 20, "offset": total - 3}, headers=H(staff))
check("the last page says there is no more", len(r.json()) == 3 and r.headers.get("X-Has-More") == "false", (len(r.json()), r.headers.get("X-Has-More")))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
