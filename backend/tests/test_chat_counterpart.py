"""
The chat list names the person on the OTHER side of each thread (never yourself), with their own photo.
Run from the backend folder:  python tests/test_chat_counterpart.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "chat_counterpart_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-chat-counterpart-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
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


def mk(name, role, photo, **kw):
    u = User(name=name, email=f"{name.split()[0].lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", profile_picture=photo, **kw)
    db.add(u)
    db.flush()
    return u


owner = mk("Emmanuel Owner", 1, "https://cdn.example/owner.jpg", subdivision_id=1)
reporter = mk("Samuel Reporter", 1, "https://cdn.example/reporter.jpg", subdivision_id=1)
leader = mk("Kyla Leader", 2, "https://cdn.example/leader.jpg", subdivision_id=1)
pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.flush()
rep = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
             animal_type="Dog", assigned_leader_id=leader.user_id, ai_suggested_risk_level="Low")
db.add(rep)
db.flush()
m = ReportMatch(source_report_id=rep.report_id, matched_pet_id=pet.pet_id, similarity_score=95, status="AI_SUGGESTED")
db.add(m)
db.flush()
t = ChatThread(thread_type="Direct", related_id=m.match_id, created_by=leader.user_id, recipient_id=owner.user_id, title="Match")
db.add(t)
db.flush()
db.add(ChatMessage(thread_id=t.thread_id, sender_id=leader.user_id, message_text="Is this your pet?"))
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def match_thread(u):
    r = client.get("/chat/threads", headers=H(u))
    rows = r.json() if r.status_code == 200 else []
    return next((x for x in rows if x.get("thread_mode") == "match"), None), r


row, r = match_thread(owner)
cp = (row or {}).get("counterpart") or {}
check("the owner's chat list includes the look-alike chat", row is not None, r.text[:300])
check("...and names the leader who started it, not the owner", cp.get("name") == "Kyla Leader" and cp.get("role") == "Subdivision Leader", cp)
check("...with the leader's own photo (not the sighting reporter's)", cp.get("avatar") == "https://cdn.example/leader.jpg", cp)

row, r = match_thread(leader)
cp = (row or {}).get("counterpart") or {}
check("the leader sees the pet owner as the other person", cp.get("name") == "Emmanuel Owner" and cp.get("role") == "Pet Owner"
      and cp.get("avatar") == "https://cdn.example/owner.jpg", (cp, r.text[:200]))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
