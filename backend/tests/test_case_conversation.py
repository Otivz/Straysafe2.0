"""
Phase 3: one owner conversation per pet and case. Every report of the case opens the same chat; new verified sightings
appear in it; an older duplicate chat is kept with a "continues in" note; an unmerged report gets its own chat again.
Run from the backend folder:  python tests/test_case_conversation.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "case_conversation_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-conversation-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import chat, matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.case_groups import resync_case_pet_identity  # noqa: E402

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


res, owner, leader = mk("Res", 1), mk("Owner", 1), mk("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO = H(LEADER, 2), H(OWNER, 1)
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


def suggest(rid, pid):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pid, similarity_score=93, status="AI_SUGGESTED")
    db.add(m)
    db.commit()
    return m.match_id


def thread_for(mid, h=HO):
    r = client.get(f"/chat/matches/{mid}/thread", headers=h)
    return r.json().get("thread_id") if r.status_code == 200 else (None, r.status_code, r.text[:200])


def threads():
    db.expire_all()
    return db.query(ChatThread).filter(ChatThread.thread_type == "Direct").count()


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
db.add(pet)
db.commit()
PET = pet.pet_id
R1, R13, R15 = report(), report(), report()
m1, m13, m15 = suggest(R1, PET), suggest(R13, PET), suggest(R15, PET)
client.post(f"/matches/{m1}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
client.post(f"/matches/{m1}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)

# An older duplicate conversation already exists for Report #13 (like thread #1 in the live data)
dup = ChatThread(thread_type="Direct", related_id=m13, created_by=LEADER, recipient_id=OWNER, title="Look-Alike Verification: Boyet (Report #13)")
db.add(dup)
db.commit()
db.add(ChatMessage(thread_id=dup.thread_id, sender_id=LEADER, message_text="Hello, is this Boyet?"))
db.commit()
DUP = dup.thread_id

client.post("/reports/merge-group", json={"report_ids": [R1, R13, R15], "notes": "same dog, checked photos"}, headers=HL)
case_thread = thread_for(m1)
check("opening the chat from Report #1 gives the case conversation", isinstance(case_thread, int), case_thread)
check("T5 Report #13 and #15 open the same conversation", thread_for(m13) == case_thread and thread_for(m15) == case_thread)
check("T5 ...no new conversation per report", threads() == 1 or (threads() == 2 and case_thread == DUP), threads())
db.expire_all()
check("T6 the existing conversation keeps its history and participants",
      db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text == "Hello, is this Boyet?").count() == 1
      and db.get(ChatThread, case_thread).created_by == LEADER and db.get(ChatThread, case_thread).recipient_id == OWNER)

# New verified sighting appears in the conversation, once
R20 = report()
m20 = suggest(R20, PET)
client.post("/reports/merge-group", json={"report_ids": [R1, R20], "notes": "same dog, same collar"}, headers=HL)
db.expire_all()
note = "New verified sighting: Report #%d was added to this case" % R20
check("a newly merged sighting is posted in the case conversation",
      db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text.like(note + "%")).count() == 1)
resync_case_pet_identity(db, db.get(Report, R1))
db.commit()
check("...and never twice", db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text.like(note + "%")).count() == 1)
check("Report #20 opens the same conversation", thread_for(m20) == case_thread)
r = client.post(f"/chat/matches/{m20}/messages", json={"message_text": "Thanks for the update"}, headers=HO)
db.expire_all()
check("the owner's reply from Report #20 lands in the case conversation", r.status_code == 200 and
      db.query(ChatMessage).filter(ChatMessage.thread_id == case_thread, ChatMessage.message_text == "Thanks for the update").count() == 1, r.text[:200])

# A second, newer duplicate (created before this fix) is closed with a pointer, history kept
late = ChatThread(thread_type="Direct", related_id=m15, created_by=OWNER, recipient_id=LEADER, title="Look-Alike Verification: Boyet (Report #15)")
db.add(late)
db.commit()
db.add(ChatMessage(thread_id=late.thread_id, sender_id=OWNER, message_text="old message in the extra chat"))
db.commit()
LATE = late.thread_id
check("the case conversation still wins over a newer duplicate", thread_for(m15) == case_thread)
db.expire_all()
check("T6 the newer duplicate keeps its messages and says where the conversation continues",
      db.query(ChatMessage).filter(ChatMessage.thread_id == LATE, ChatMessage.message_text == "old message in the extra chat").count() == 1
      and db.query(ChatMessage).filter(ChatMessage.thread_id == LATE, ChatMessage.message_text.like("This conversation continues in the Case #%")).count() == 1
      and db.get(ChatThread, LATE).is_closed)

# Unmerged: the separated report gets its own conversation again
client.post(f"/reports/{R20}/unmerge", json={"reason": "different dog after all, separating"}, headers=HL)
t20 = thread_for(m20, HL)
check("T13 after unmerge, Report #20 no longer opens the case conversation", isinstance(t20, int) and t20 != case_thread, t20)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
