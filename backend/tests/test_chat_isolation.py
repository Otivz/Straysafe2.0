"""
Chat isolation (docs/03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md, adoption parts retired):
1. a stranger can't read, post in or open a report's private conversation (the reporter and staff still can)
2. match chat: a stranger can't make themselves a participant; the pet's real owner still can
2b. a LATER owner of the linked pet (the pet became theirs after the report was filed) can't open the reporter's
    private conversation, an old look-alike chat, or confirm the old report as reunited; the owner since before the
    report, and a report filed after they became the owner, are not affected
3. a refused caller creates no thread; one thread per report; duplicates merge without losing messages
4. report chat counts only for people who may read the conversation
Run from the backend folder:  python tests/test_chat_isolation.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "chat_isolation_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-chat-isolation-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_owner_confirmation import PetOwnerConfirmation  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import chat, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(chat.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(uid, name, role):
    db.add(User(user_id=uid, name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
                status="Active", subdivision_id=1, barangay_id=1))


for uid, name, role in [(20, "Reporter", 1), (21, "Adopter", 1), (22, "Stranger", 1), (23, "Leader", 2), (24, "Finder", 1)]:
    mk(uid, name, role)
db.commit()
H = lambda uid, role=1: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
REPORTER, ADOPTER, STRANGER, LEADER, FINDER = H(20), H(21), H(22), H(23, 2), H(24)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


long_ago, adopted_at = datetime.now() - timedelta(days=60), datetime.now() - timedelta(days=5)

# The stray report (filed by the reporter) with its private conversation
db.add(Report(report_id=1, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=long_ago))
db.flush()
db.add(Pet(pet_id=4, pet_name="Bantay", pet_type="Dog", owner_id=21, status="Active", created_at=adopted_at))
db.query(Report).filter(Report.report_id == 1).update({"pet_id": 4})
thread = ChatThread(thread_type="Report", related_id=1, created_by=20, recipient_id=23, title="Incident Report #1")
db.add(thread)
db.flush()
db.add(ChatMessage(thread_id=thread.thread_id, sender_id=20, message_text="private note from the reporter"))
db.commit()

# ---- 1. the report's conversation ----
r = client.get("/chat/reports/1/messages", headers=STRANGER)
check("1 a stranger can't read the report's conversation (403)", r.status_code == 403, r.status_code)
r = client.post("/chat/reports/1/messages", json={"message_text": "hello"}, headers=STRANGER)
check("1 ...nor post in it (403)", r.status_code == 403, r.status_code)
check("1 ...nor open its thread details (403)", client.get("/chat/reports/1/thread", headers=STRANGER).status_code == 403)
r = client.get("/chat/reports/1/messages", headers=REPORTER)
check("1 the reporter still reads it", r.status_code == 200 and any("private note" in m["message_text"] for m in r.json()), r.text[:120])
check("1 the subdivision leader still reads it", client.get("/chat/reports/1/messages", headers=LEADER).status_code == 200)

# ---- 2. match chat ----
db.add(Report(report_id=3, user_id=24, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Cat", created_at=long_ago))
db.flush()
db.add(Pet(pet_id=5, pet_name="Mingming", pet_type="Cat", owner_id=24, status="Active", created_at=long_ago))
db.add(ReportMatch(match_id=2, source_report_id=3, matched_pet_id=5, status="POTENTIAL_MATCH"))
db.commit()
before = db.query(ChatThread).filter(ChatThread.thread_type == "Direct").count()
r = client.get("/chat/matches/2/messages", headers=STRANGER)
db.expire_all()
check("2 a stranger can't make themselves a participant of a match chat that doesn't exist yet (403)", r.status_code == 403, r.status_code)
check("2 ...and no thread was created for them", db.query(ChatThread).filter(ChatThread.thread_type == "Direct").count() == before)
check("2 the pet's real owner can still open it", client.get("/chat/matches/2/messages", headers=FINDER).status_code == 200)

# ---- 2b. a later owner of the linked pet ----
# pet 4 became user 21's after report 1 was filed (the record was created 5 days ago, the report 60 days ago)
r = client.get("/chat/reports/1/messages", headers=ADOPTER)
check("2b a later owner can't read the reporter's private conversation (403)", r.status_code == 403, r.status_code)
check("2b ...nor post in it (403)", client.post("/chat/reports/1/messages", json={"message_text": "hello"}, headers=ADOPTER).status_code == 403)
check("2b ...nor open its thread details (403)", client.get("/chat/reports/1/thread", headers=ADOPTER).status_code == 403)
db.add(ReportMatch(match_id=1, source_report_id=1, matched_pet_id=4, status="CONFIRMED_MATCH"))
db.commit()
check("2b ...a confirmed match to their pet doesn't open it either (403)", client.get("/chat/reports/1/messages", headers=ADOPTER).status_code == 403)
check("2b ...nor does it open the old look-alike chat (403)", client.get("/chat/matches/1/messages", headers=ADOPTER).status_code == 403)
r = client.post("/reports/1/confirm-reunited", json={"notes": "mine now"}, headers=ADOPTER)
check("2b ...nor can they confirm the old report as reunited (403)", r.status_code == 403, f"{r.status_code} {r.text[:120]}")
check("2b ...while the reporter and the leader still read it",
      client.get("/chat/reports/1/messages", headers=REPORTER).status_code == 200 and client.get("/chat/reports/1/messages", headers=LEADER).status_code == 200)

# a report filed after they became the owner (the pet goes missing later) is their own business
db.add(Report(report_id=2, user_id=24, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", pet_id=4, created_at=datetime.now()))
db.commit()
check("2b a report filed after they became the owner is open to them", client.get("/chat/reports/2/messages", headers=ADOPTER).status_code == 200)

# an owner who registered the pet themselves after the report was filed is the original owner, not a later one
mk(27, "Selfreg", 1)
db.commit()
SELFREG = H(27)
db.add(Pet(pet_id=9, pet_name="Bantay2", pet_type="Dog", owner_id=27, registered_by_user_id=27, status="Active", created_at=adopted_at))
db.flush()
db.add(Report(report_id=9, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", pet_id=9, created_at=long_ago))
db.commit()
check("2b an owner who registered the pet themselves is not treated as a later owner", client.get("/chat/reports/9/messages", headers=SELFREG).status_code == 200)

# the owner since before the report is unaffected; an ownership accepted after the report is "later"
mk(25, "Longtime", 1)
mk(26, "Assigned", 1)
db.commit()
OLDOWNER, ASSIGNED = H(25), H(26)
db.add(Pet(pet_id=6, pet_name="Rex", pet_type="Dog", owner_id=25, status="Active", created_at=long_ago - timedelta(days=30)))
db.add(Pet(pet_id=7, pet_name="Tiger", pet_type="Dog", owner_id=26, status="Active", created_at=long_ago - timedelta(days=30)))
db.flush()
db.add(PetOwnerConfirmation(pet_id=7, proposed_owner_id=26, status="Accepted", source="assign", created_at=adopted_at, responded_at=adopted_at))
for rid, pid in ((6, 6), (7, 7)):
    db.add(Report(report_id=rid, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
                  animal_type="Dog", pet_id=pid, created_at=long_ago))
db.commit()
check("2b the owner since before the report still reads its conversation", client.get("/chat/reports/6/messages", headers=OLDOWNER).status_code == 200)
check("2b an owner assigned (and accepted) after the report was filed can't (403)", client.get("/chat/reports/7/messages", headers=ASSIGNED).status_code == 403)
db.add(Report(report_id=8, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", pet_id=7, created_at=datetime.now()))
db.commit()
check("2b ...but they can open a report filed after they became the owner", client.get("/chat/reports/8/messages", headers=ASSIGNED).status_code == 200)

# ---- 3. thread creation ----
db.add(Report(report_id=5, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=long_ago))
db.commit()
r = client.get("/chat/reports/5/messages", headers=STRANGER)
db.expire_all()
check("3 a refused caller gets 403 and creates no thread", r.status_code == 403 and
      db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 0, r.status_code)
client.get("/chat/reports/5/messages", headers=REPORTER)
client.post("/chat/reports/5/messages", json={"message_text": "first"}, headers=REPORTER)
client.get("/chat/reports/5/thread", headers=LEADER)
db.expire_all()
check("3 one thread per report after several opens and a message",
      db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 1)
# an old duplicate (as in the live data): reads use the oldest thread; the script merges the newer one into it
dup = ChatThread(thread_type="Report", related_id=5, created_by=20, recipient_id=23, title="Incident Report #5")
db.add(dup)
db.flush()
db.add(ChatMessage(thread_id=dup.thread_id, sender_id=23, message_text="lost in a duplicate"))
db.commit()
import merge_duplicate_chat_threads as merger  # noqa: E402
groups = merger.duplicate_groups(db)
check("3 the script finds the duplicate", any(t == "Report" and rid == 5 and len(ids) == 2 for t, rid, ids in groups), groups)
for t, rid, ids in groups:
    merger.merge(db, ids[0], ids[1:])
db.commit()
db.expire_all()
r = client.get("/chat/reports/5/messages", headers=REPORTER)
texts = [m["message_text"] for m in r.json()] if r.status_code == 200 else []
check("3 after merging, one thread holds every message", "first" in texts and "lost in a duplicate" in texts
      and db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 1, texts)

# ---- 4. counts ----
r = client.get("/chat/reports/1/stats", headers=STRANGER)
check("4 someone who may not read it learns nothing (no thread id, zero counts)",
      r.status_code == 200 and r.json()["thread_id"] is None and r.json()["total_messages"] == 0, r.text[:120])
r = client.get("/chat/reports/1/stats", headers=REPORTER)
check("4 the reporter gets the real counts", r.status_code == 200 and r.json()["total_messages"] >= 1, r.text[:120])

passed = sum(results)
print(f"\n{passed}/{len(results)} chat isolation checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
