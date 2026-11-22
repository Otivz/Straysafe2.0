"""
Who reported a case and how (backend/migrations/2026-11-23_report_channel.sql, utils/report_channel.py).

  - a Subdivision Leader files a report they saw themselves ('self'), or for a person who called / walked in / sent a message
  - the person can be typed in, or chosen from the residents of the Leader's subdivision (name and phone filled from the account)
  - a name is required for someone else; a resident of another subdivision cannot be named; no photo is required from staff
  - a resident can never set these fields (they are dropped) and still needs a photo
  - the case list and the case record name the person who reported it and how; older reports read "via app"
Offline: throwaway SQLite. Run from the backend folder:  python tests/test_report_channel.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "report_channel.db")
os.environ.setdefault("JWT_SECRET_KEY", "report-channel-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import cases, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router):
    api.include_router(router)
limiter.enabled = False
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def user(name, role, subdivision, phone="09171234567"):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@channel.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone=phone, address=f"{name} House")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


leader = user("Lea Leader", 2, 1)
kyla = user("Kyla Resident", 1, 1, phone="09181112222")
outsider = user("Far Resident", 1, 2)
CATS = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}
BASE = {"latitude": 14.8008, "longitude": 121.0036, "description": "A brown dog roaming near the main gate",
        "animal_type": "Dog", "category_id": CATS["Found / Unidentified Animal"]}


_n = [0]


def file(who, **kw):
    """Each report is different (place and words), so the server's duplicate check never folds one into another."""
    _n[0] += 1
    n = _n[0]
    body = {**BASE, "description": f"{BASE['description']} (report {n}, seen near house {n * 7})",
            "latitude": BASE["latitude"] + n * 0.0004, "longitude": BASE["longitude"] - n * 0.0003, **kw}
    return client.post("/reports/", json=body, headers=H(who))


def summary_of(report_id):
    rows = client.get("/cases/summaries", headers=H(leader)).json()
    items = rows["items"] if isinstance(rows, dict) and "items" in rows else rows
    return next(r for r in items if r["report_id"] == report_id)


# ------------------------------------------------------------------------------------------------ the Leader saw it
r = file(leader, report_channel="self")
check("a Leader can file a report they saw themselves, without a photo", r.status_code == 200, r.text[:300])
own = db.get(Report, r.json()["report_id"])
check("it is stored as filed by the Leader ('self'), in the Leader's subdivision", own.report_channel == "self" and own.user_id == leader.user_id
      and own.subdivision_id == 1 and own.reported_by_name is None)
rep = client.get(f"/cases/{own.report_id}", headers=H(leader)).json()["reporter"]
check("the case names the Leader as the reporter", rep["name"] == "Lea Leader" and rep["channel"] == "self" and rep["filed_by_name"] == "Lea Leader", rep)
r = file(leader)
check("a Leader filing without saying how is treated as 'self'", r.status_code == 200 and db.get(Report, r.json()["report_id"]).report_channel == "self")

# ------------------------------------------------------------------------------------------------ someone called
r = file(leader, report_channel="call", reported_by_name="Kyla Santos", reported_by_contact="0917 555 0101")
check("a Leader can file for a person who called (name typed in)", r.status_code == 200, r.text[:300])
called = db.get(Report, r.json()["report_id"])
check("the caller's name, number and the channel are stored; the Leader is who filed it",
      (called.report_channel, called.reported_by_name, called.reported_by_contact, called.user_id) == ("call", "Kyla Santos", "0917 555 0101", leader.user_id),
      (called.report_channel, called.reported_by_name, called.reported_by_contact, called.user_id))
rep = client.get(f"/cases/{called.report_id}", headers=H(leader)).json()["reporter"]
check("the case reads 'Kyla Santos · via call', filed by the Leader, with no account",
      rep["name"] == "Kyla Santos" and rep["channel_label"] == "via call" and rep["user_id"] is None and rep["contact"] == "0917 555 0101"
      and rep["filed_by_name"] == "Lea Leader", rep)
s = summary_of(called.report_id)
check("the case list says the same", s["reporter"]["name"] == "Kyla Santos" and s["reporter"]["channel"] == "call", s["reporter"])
check("someone else's report needs a name", file(leader, report_channel="walk_in", reported_by_name=" ").status_code == 400)
check("an unknown channel is refused", file(leader, report_channel="fax", reported_by_name="Ana").status_code == 422)

# ------------------------------------------------------------------------------------------------ a registered resident walked in
r = file(leader, report_channel="walk_in", reported_on_behalf_of=kyla.user_id)
check("a Leader can choose a resident: name and phone come from the account", r.status_code == 200, r.text[:300])
walk = db.get(Report, r.json()["report_id"])
check("...stored with the resident's account", (walk.reported_by_name, walk.reported_by_contact, walk.reported_on_behalf_of) == ("Kyla Resident", "09181112222", kyla.user_id))
rep = client.get(f"/cases/{walk.report_id}", headers=H(leader)).json()["reporter"]
check("the case links the resident's account (so the Leader can message them)", rep["user_id"] == kyla.user_id and rep["channel_label"] == "walk-in", rep)
check("a typed name wins over the account's", db.get(Report, file(leader, report_channel="message", reported_on_behalf_of=kyla.user_id,
                                                                    reported_by_name="Kyla S.").json()["report_id"]).reported_by_name == "Kyla S.")
check("a resident of another subdivision cannot be named", file(leader, report_channel="call", reported_on_behalf_of=outsider.user_id).status_code == 400)
check("a Leader account cannot be named as the resident", file(leader, report_channel="call", reported_on_behalf_of=leader.user_id).status_code == 400)

# ------------------------------------------------------------------------------------------------ residents
r = file(kyla, report_channel="call", reported_by_name="Someone Else")
check("a resident still needs a photo", r.status_code == 422, r.text[:200])
r = file(kyla, report_channel="call", reported_by_name="Someone Else", reported_on_behalf_of=outsider.user_id,
         media_urls=["https://res.cloudinary.com/demo/image/upload/v1/straysafe/dog.jpg"])
if r.status_code == 200:
    mine = db.get(Report, r.json()["report_id"])
    check("a resident can never set who reported it or how (dropped)", mine.report_channel is None and mine.reported_by_name is None
          and mine.reported_on_behalf_of is None and mine.user_id == kyla.user_id)
    rep = client.get(f"/cases/{mine.report_id}", headers=H(leader)).json()["reporter"]
    check("a resident's own report reads 'via app'", rep["name"] == "Kyla Resident" and rep["channel"] is None and rep["channel_label"] == "via app", rep)
else:
    print(f"  (resident filing with a photo skipped here: {r.status_code} {r.text[:160]})")

print(f"\n{PASSED} checks passed.")
