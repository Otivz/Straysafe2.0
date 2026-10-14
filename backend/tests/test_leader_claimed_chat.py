"""
A report's case chat: a Subdivision Leader can send messages only on a case they have claimed (the report's
assigned leader). Other leaders of the same subdivision can still read the conversation, and an unclaimed case has to be
claimed first. The reporter and admins are unchanged.
Run from the backend folder:  python tests/test_leader_claimed_chat.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "leader_claimed_chat_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-leader-claimed-chat-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import chat  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(chat.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subd=None):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd, barangay_id=1)
    db.add(u)
    db.flush()
    return u


reporter = mk("Rita Reporter", 1, subd=1)
claimer = mk("Cora Claimer", 2, subd=1)
other = mk("Omar Other", 2, subd=1)
admin = mk("Ada Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(leader_id=None):
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", assigned_leader_id=leader_id)
    db.add(r)
    db.commit()
    return r.report_id


def send(u, rid, text="Hello"):
    return client.post(f"/chat/reports/{rid}/messages", json={"message_text": text}, headers=H(u))


def can_interact(u, rid):
    return client.get(f"/chat/reports/{rid}/thread", headers=H(u)).json().get("can_interact")


UNCLAIMED = report()
CLAIMED = report(claimer.user_id)

r = send(other, UNCLAIMED)
check("unclaimed case: a leader can't message until they claim it", r.status_code == 403, r.status_code)
check("...and is told to claim it first", "claim" in (r.json().get("detail") or "").lower(), r.json())
check("unclaimed case: the thread says can_interact = false for the leader", can_interact(other, UNCLAIMED) is False)

check("claimed case: the leader who claimed it can message", send(claimer, CLAIMED).status_code == 200)
check("claimed case: the thread says can_interact = true for them", can_interact(claimer, CLAIMED) is True)
r = send(other, CLAIMED)
check("claimed by someone else: another leader of the same subdivision can't message", r.status_code == 403, r.status_code)
check("...but can still read the conversation", client.get(f"/chat/reports/{CLAIMED}/messages", headers=H(other)).status_code == 200)
check("...and the thread says can_interact = false", can_interact(other, CLAIMED) is False)

threads = client.get("/chat/threads", headers=H(other)).json()
flags = {t.get("report_id"): t.get("can_interact") for t in (threads if isinstance(threads, list) else threads.get("threads", []))}
check("thread list: can_interact false on the case another leader claimed", flags.get(CLAIMED) is False, flags)

check("the reporter can still message on their report", send(reporter, CLAIMED).status_code == 200)
check("admins can still message", send(admin, CLAIMED).status_code == 200)

# The case is handed to the other leader: the permission follows the claim
db.query(Report).filter(Report.report_id == CLAIMED).update({"assigned_leader_id": other.user_id})
db.commit()
check("after the case is reassigned, the new handler can message", send(other, CLAIMED).status_code == 200)
check("...and the previous handler can't", send(claimer, CLAIMED).status_code == 403)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
