"""
Announcement read access: the subdivision and barangay listings (all statuses, drafts included) are for officials of
that area only, and a resident's feed is only their own. Anonymous requests are refused.
Run from the backend folder:  python tests/test_announcement_access.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "announcement_access_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-announcements-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.announcement import Announcement  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import announcements  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(announcements.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3")])


def mk(name, role, subd, brgy=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subd, barangay_id=brgy)
    db.add(u)
    db.flush()
    return u


res1, res2 = mk("ResOne", 1, 1), mk("ResTwo", 1, 2)
lead1, lead2 = mk("LeadOne", 2, 1), mk("LeadTwo", 2, 2)
staff1, staff2 = mk("StaffOne", 3, None, 1), mk("StaffTwo", 3, None, 2)
admin = mk("Admin", 4, None, None)
db.add_all([
    Announcement(created_by=lead1.user_id, subdivision_id=1, barangay_id=1, title="S1 members only", content="x",
                 visibility="Subdivision Only", status="Published"),
    Announcement(created_by=lead1.user_id, subdivision_id=1, barangay_id=1, title="S1 draft", content="x",
                 visibility="Public", status="Draft"),
    Announcement(created_by=staff1.user_id, barangay_id=1, title="Barangay public", content="x", visibility="Public", status="Published"),
])
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


titles = lambda r: {a["title"] for a in r.json()} if r.status_code == 200 else None  # noqa: E731
get = lambda path, u=None: client.get(path, headers=H(u) if u else {})  # noqa: E731

# Subdivision listing (drafts included): officials of that area only
check("subdivision list: anonymous refused", get("/announcements/subdivision/1").status_code == 401)
check("subdivision list: residents refused", get("/announcements/subdivision/1", res1).status_code == 403)
check("subdivision list: another subdivision's leader refused", get("/announcements/subdivision/1", lead2).status_code == 403)
check("subdivision list: another barangay's staff refused", get("/announcements/subdivision/1", staff2).status_code == 403)
r = get("/announcements/subdivision/1", lead1)
check("subdivision list: its leader sees drafts and members-only posts", {"S1 members only", "S1 draft"} <= (titles(r) or set()), r.text[:200])
check("subdivision list: the barangay's staff and admin can read it",
      get("/announcements/subdivision/1", staff1).status_code == 200 and get("/announcements/subdivision/1", admin).status_code == 200)

# Barangay listing: that barangay's staff or admin
check("barangay list: anonymous refused", get("/announcements/barangay/1").status_code == 401)
check("barangay list: residents refused", get("/announcements/barangay/1", res1).status_code == 403)
check("barangay list: leaders refused", get("/announcements/barangay/1", lead1).status_code == 403)
check("barangay list: another barangay's staff refused", get("/announcements/barangay/1", staff2).status_code == 403)
r = get("/announcements/barangay/1", staff1)
check("barangay list: its staff see every status", {"S1 draft", "Barangay public"} <= (titles(r) or set()), r.text[:200])
check("barangay list: admin allowed", get("/announcements/barangay/1", admin).status_code == 200)

# Resident feed: own feed only
check("feed: anonymous refused", get(f"/announcements/feed/resident/{res1.user_id}").status_code == 401)
check("feed: another resident's feed refused (no members-only leak by user id)",
      get(f"/announcements/feed/resident/{res1.user_id}", res2).status_code == 403)
r = get(f"/announcements/feed/resident/{res1.user_id}", res1)
check("feed: own feed has published public and own-subdivision posts, no drafts",
      titles(r) == {"S1 members only", "Barangay public"}, (r.status_code, r.text[:200]))
r = get(f"/announcements/feed/resident/{res2.user_id}", res2)
check("feed: another subdivision's members-only post isn't in it", titles(r) == {"Barangay public"}, r.text[:200])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
