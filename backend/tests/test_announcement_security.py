"""
Community alerts (announcements) can only be changed by officials allowed to manage them, and comments / reactions are
always by the logged-in user (SYSTEM_AUDIT.md 4.1). Run from the backend folder:
    python tests/test_announcement_security.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "announcement_security_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-announcement-security-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.announcement import Announcement, AnnouncementCategory, AnnouncementComment, AnnouncementReaction  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import announcements  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(announcements.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok   " if ok else "  FAIL ") + label + ("" if ok else f"  -> {extra}"))


for rid, rn in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=rn))
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
db.add(AnnouncementCategory(category_id=1, category_name="General Advisory"))
db.flush()


def mk(name, role, subd=1, brgy=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd if role in (1, 2) else None, barangay_id=brgy,
             phone="09170000000")
    db.add(u)
    db.flush()
    return u


resident = mk("Rita Resident", 1)
other_resident = mk("Oscar Other", 1)
leader = mk("Leo Leader", 2)
other_leader = mk("Lara Leader", 2, subd=2, brgy=2)
staff = mk("Sam Staff", 3)
other_staff = mk("Sid Staff", 3, brgy=2)
admin = mk("Ada Admin", 4)
ann = Announcement(barangay_id=1, subdivision_id=1, created_by=leader.user_id, category_id=1, title="Rabies advisory",
                   content="Keep pets inside.", status="Published")
db.add(ann)
db.commit()
A = ann.announcement_id
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
EDIT = {"created_by": 1, "title": "FAKE ALERT", "content": "hacked", "category": "Animal Advisory", "visibility": "Public",
        "pinned": False, "subdivision_id": 1, "barangay_id": 1}

# ---- no login: every write is refused
check("no login: can't edit an alert", client.put(f"/announcements/{A}", json=EDIT).status_code == 401)
check("no login: can't change its status", client.patch(f"/announcements/{A}/status?status=Archived").status_code == 401)
check("no login: can't upload media",
      client.post(f"/announcements/{A}/media", files={"file": ("x.jpg", b"x", "image/jpeg")}).status_code == 401)
check("no login: can't comment", client.post(f"/announcements/{A}/comments", json={"user_id": resident.user_id, "comment": "hi"}).status_code == 401)
check("no login: can't react", client.post(f"/announcements/{A}/react", json={"user_id": resident.user_id}).status_code == 401)
db.expire_all()
check("...and the alert is unchanged", db.get(Announcement, A).title == "Rabies advisory" and db.get(Announcement, A).status == "Published")

# ---- who may manage it
check("a resident can't change its status", client.patch(f"/announcements/{A}/status?status=Archived", headers=H(resident)).status_code == 403)
check("a resident can't edit it", client.put(f"/announcements/{A}", json=EDIT, headers=H(resident)).status_code == 403)
check("another subdivision's leader can't edit it", client.put(f"/announcements/{A}", json=EDIT, headers=H(other_leader)).status_code == 403)
check("another barangay's staff can't archive it", client.patch(f"/announcements/{A}/status?status=Archived", headers=H(other_staff)).status_code == 403)
r = client.patch(f"/announcements/{A}/status?status=Archived", headers=H(staff))
check("its barangay's staff can archive it (?status=, as the alerts page sends)", r.status_code == 200 and r.json()["status"] == "Archived", r.text[:200])
r = client.patch(f"/announcements/{A}/status", json={"status": "Published"}, headers=H(leader))
check("its author can publish it again ({\"status\": ...} body)", r.status_code == 200 and r.json()["status"] == "Published", r.text[:200])
check("an unknown status is refused (400)", client.patch(f"/announcements/{A}/status?status=Hacked", headers=H(admin)).status_code == 400)
check("the status change is in the audit log with who did it",
      db.query(AuditLog).filter(AuditLog.action == "Update Announcement Status", AuditLog.user_id == staff.user_id).count() == 1)
r = client.put(f"/announcements/{A}", json={**EDIT, "title": "Rabies advisory (updated)"}, headers=H(admin))
check("an admin can edit any alert", r.status_code == 200 and r.json()["title"] == "Rabies advisory (updated)", r.text[:200])

# ---- comments and reactions are by the logged-in user, whatever user_id is sent
r = client.post(f"/announcements/{A}/comments", json={"user_id": other_resident.user_id, "comment": "posted as someone else?"}, headers=H(resident))
check("a comment is saved as the logged-in user, not the user_id sent", r.status_code == 200 and r.json()["user_id"] == resident.user_id, r.text[:200])
r = client.post(f"/announcements/{A}/comments", json={"comment": "no user_id at all"}, headers=H(other_resident))
check("...and works without a user_id in the body", r.status_code == 200 and r.json()["user_id"] == other_resident.user_id, r.text[:200])
r = client.post(f"/announcements/{A}/react", json={"user_id": other_resident.user_id, "reaction_type": "Like"}, headers=H(resident))
db.expire_all()
reacts = db.query(AnnouncementReaction).filter(AnnouncementReaction.announcement_id == A).all()
check("a reaction is saved as the logged-in user", r.status_code == 200 and [x.user_id for x in reacts] == [resident.user_id],
      (r.text[:200], [x.user_id for x in reacts]))

# ---- reading stays public
check("reading a subdivision's alerts still works without login", client.get("/announcements/subdivision/1").status_code == 200)

r = client.put(f"/announcements/{A}", json={**EDIT, "title": "Rabies advisory", "subdivision_id": 2, "barangay_id": 2}, headers=H(leader))
check("the author can't move the alert to another subdivision", r.status_code == 403, r.text[:200])
r = client.put(f"/announcements/{A}", json={**EDIT, "title": "Rabies advisory", "status": "Hacked"}, headers=H(leader))
check("an edit with an unknown status is refused (400)", r.status_code == 400, r.text[:200])
r = client.put(f"/announcements/{A}", json={**EDIT, "title": "Rabies advisory", "created_by": admin.user_id}, headers=H(leader))
db.expire_all()
log = db.query(AuditLog).filter(AuditLog.action == "Update Announcement").order_by(AuditLog.log_id.desc()).first()
check("an edit is logged as who made it, not the created_by sent", r.status_code == 200 and log is not None and log.user_id == leader.user_id,
      (r.status_code, getattr(log, "user_id", None)))

print(f"\n{sum(results)}/{len(results)} checks passed")
db.close()
sys.exit(0 if all(results) else 1)
