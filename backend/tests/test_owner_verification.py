"""
Phase 4: staff unsure about a sighting can ask the owner (Yes / No / Unsure) inside the case conversation.
The answer is evidence only: nothing is confirmed or merged by it.
Run from the backend folder:  python tests/test_owner_verification.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "owner_verification_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-verification-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportMedia, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import chat, matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (chat.router, matches.router, reports.router):
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


res, owner, other, leader = mk("Res", 1), mk("Owner", 1), mk("Other", 1), mk("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO, HX = H(LEADER, 2), H(OWNER, 1), H(other.user_id, 1)
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


def mrow(mid):
    db.expire_all()
    return db.get(ReportMatch, mid)


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
db.add(pet)
db.commit()
PET = pet.pet_id
R1, R20 = report(), report()
db.add(ReportMedia(report_id=R20, file_url="https://cdn.example/sighting20.jpg", media_type="Image"))
m1 = ReportMatch(source_report_id=R1, matched_pet_id=PET, similarity_score=95, status="AI_SUGGESTED")
m20 = ReportMatch(source_report_id=R20, matched_pet_id=PET, similarity_score=88, status="AI_SUGGESTED")
db.add_all([m1, m20])
db.commit()
M1, M20 = m1.match_id, m20.match_id
client.post(f"/matches/{M1}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
client.post(f"/matches/{M1}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
case_thread = client.get(f"/chat/matches/{M1}/thread", headers=HO).json()["thread_id"]

req = {"note": "The collar looks different, but the markings match"}
check("T6 requesting needs a reason", client.post(f"/matches/{M20}/request-owner-verification", json={"note": "?"}, headers=HL).status_code == 400)
check("residents can't request it", client.post(f"/matches/{M20}/request-owner-verification", json=req, headers=HO).status_code == 403)
r = client.post(f"/matches/{M20}/request-owner-verification", json=req, headers=HL)
check("T6 staff ask the owner to help verify Report #20", r.status_code == 200 and r.json().get("owner_verification_requested_at"), r.text[:200])
db.expire_all()
msgs = db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text.like("Can you help us check%")).all()
check("T6 the request is posted in the case's existing conversation, with the sighting photo",
      len(msgs) == 1 and msgs[0].media_url == "https://cdn.example/sighting20.jpg")
check("T6 the owner is notified once", db.query(Notification).filter(Notification.user_id == OWNER, Notification.title.like("%Help Us Check%")).count() == 1)
client.post(f"/matches/{M20}/request-owner-verification", json=req, headers=HL)
db.expire_all()
check("T6 asking again while it's open doesn't duplicate anything",
      db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text.like("Can you help us check%")).count() == 1
      and db.query(Notification).filter(Notification.user_id == OWNER, Notification.title.like("%Help Us Check%")).count() == 1)
check("no new conversation was created", db.query(ChatThread).count() == 1)
check("T6 the report stays unconfirmed and unmerged", mrow(M20).status == "AI_SUGGESTED" and db.get(Report, R20).duplicate_of_report_id is None)

ans = {"answer": "UNSURE", "note": "Boyet has a scar on the nose, I can't see it here"}
check("T8 someone else can't answer", client.post(f"/matches/{M20}/owner-verification", json=ans, headers=HX).status_code == 403)
check("a wrong answer value is refused", client.post(f"/matches/{M20}/owner-verification", json={"answer": "MAYBE"}, headers=HO).status_code == 400)
r = client.post(f"/matches/{M20}/owner-verification", json=ans, headers=HO)
m = mrow(M20)
check("T7 the owner answers Unsure: recorded with the time", r.status_code == 200 and m.owner_verification_answer == "UNSURE"
      and m.owner_verification_answered_at is not None, r.text[:200])
check("T7 nothing is confirmed or merged by the answer", m.status == "AI_SUGGESTED" and m.owner_confirmation_status == "PENDING"
      and db.get(Report, R20).duplicate_of_report_id is None)
db.expire_all()
check("T7 the staff member who asked is told", db.query(Notification).filter(Notification.user_id == LEADER, Notification.title.like("Owner Answered%")).count() == 1)
check("T7 the answer appears in the case conversation",
      db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text.like("About Report #%: Not sure.%")).count() == 1)
check("answering twice is refused", client.post(f"/matches/{M20}/owner-verification", json={"answer": "YES"}, headers=HO).status_code == 409)

# A pet with no owner can't be asked; a decided suggestion can't be asked about
stray = Pet(pet_name="Community", pet_type="Dog", owner_id=None, status="Active")
db.add(stray)
db.commit()
R30 = report()
ms = ReportMatch(source_report_id=R30, matched_pet_id=stray.pet_id, similarity_score=80, status="AI_SUGGESTED")
db.add(ms)
db.commit()
check("a community animal has no owner to ask", client.post(f"/matches/{ms.match_id}/request-owner-verification", json=req, headers=HL).status_code == 400)
check("an already decided match can't be asked about", client.post(f"/matches/{M1}/request-owner-verification", json=req, headers=HL).status_code == 409)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
