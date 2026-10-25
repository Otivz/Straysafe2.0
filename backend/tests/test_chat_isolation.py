"""
Chat isolation (docs/03-development/audits/ADOPTION_CHAT_ISOLATION_AUDIT_2026-10-25.md):
1. an adopter can't open the original report's conversation (the reporter and staff still can)
2. ...but can open a report about the adopted pet filed after the adoption
3. match chat: no access through an adopted pet; a stranger can't make themselves a participant
4. a refused caller creates no thread; one thread per report; duplicates merge without losing messages
5. report chat counts only for people who may read the conversation
6. an adopter can't "confirm reunited" on the original report
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
from app.models.report import Adoption, HoldingAnimal, Report, ReportStatus  # noqa: E402
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

# The stray report (filed by the reporter), rescued, held, adopted: the merge moved the report onto the adopter's pet
db.add(Report(report_id=1, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=long_ago))
db.flush()
db.add(Pet(pet_id=4, pet_name="Bantay", pet_type="Dog", owner_id=21, status="Active", created_at=adopted_at))
db.add(HoldingAnimal(holding_id=1, report_id=1, animal_type="Dog", facility_status=6))
db.flush()
db.add(Adoption(adoption_id=1, holding_id=1, applicant_id=21, full_name="Adopter", address="Street", contact_no="09123456789",
                reason="Home", status="Approved", created_pet_id=4))
db.query(Report).filter(Report.report_id == 1).update({"pet_id": 4})
thread = ChatThread(thread_type="Report", related_id=1, created_by=20, recipient_id=23, title="Incident Report #1")
db.add(thread)
db.flush()
db.add(ChatMessage(thread_id=thread.thread_id, sender_id=20, message_text="private note from the reporter"))
db.commit()

# ---- 1. the original report's conversation ----
r = client.get("/chat/reports/1/messages", headers=ADOPTER)
check("1 adopter can't read the original report's conversation (403)", r.status_code == 403, r.status_code)
r = client.post("/chat/reports/1/messages", json={"message_text": "hello"}, headers=ADOPTER)
check("1 ...nor post in it (403)", r.status_code == 403, r.status_code)
check("1 ...nor open its thread details (403)", client.get("/chat/reports/1/thread", headers=ADOPTER).status_code == 403)
r = client.get("/chat/reports/1/messages", headers=REPORTER)
check("1 the reporter still reads it", r.status_code == 200 and any("private note" in m["message_text"] for m in r.json()), r.text[:120])
check("1 the subdivision leader still reads it", client.get("/chat/reports/1/messages", headers=LEADER).status_code == 200)

# ---- 2. a report filed after the adoption (the adopted dog goes missing, a finder reports it) ----
db.add(Report(report_id=2, user_id=24, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", pet_id=4, created_at=datetime.now()))
db.commit()
r = client.get("/chat/reports/2/messages", headers=ADOPTER)
check("2 the adopter, now the owner, can open a report filed after the adoption", r.status_code == 200, r.status_code)

# ---- 3. match chat ----
db.add(ReportMatch(match_id=1, source_report_id=1, matched_pet_id=4, status="CONFIRMED_MATCH"))
db.add(Report(report_id=3, user_id=24, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Cat", created_at=long_ago))
db.flush()
db.add(Pet(pet_id=5, pet_name="Mingming", pet_type="Cat", owner_id=24, status="Active", created_at=long_ago))
db.add(ReportMatch(match_id=2, source_report_id=3, matched_pet_id=5, status="POTENTIAL_MATCH"))
db.commit()
r = client.get("/chat/matches/1/messages", headers=ADOPTER)
check("3 adopter isn't admitted to the old look-alike chat through the adopted pet (403)", r.status_code == 403, r.status_code)
before = db.query(ChatThread).filter(ChatThread.thread_type == "Direct").count()
r = client.get("/chat/matches/2/messages", headers=STRANGER)
db.expire_all()
check("3 a stranger can't make themselves a participant of a match chat that doesn't exist yet (403)", r.status_code == 403, r.status_code)
check("3 ...and no thread was created for them", db.query(ChatThread).filter(ChatThread.thread_type == "Direct").count() == before)
check("3 the pet's real owner can still open it", client.get("/chat/matches/2/messages", headers=FINDER).status_code == 200)
check("3 the confirmed-match rule doesn't admit the adopter to the report chat either",
      client.get("/chat/reports/1/messages", headers=ADOPTER).status_code == 403)

# ---- 4. thread creation ----
db.add(Report(report_id=5, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=long_ago))
db.commit()
r = client.get("/chat/reports/5/messages", headers=STRANGER)
db.expire_all()
check("4 a refused caller gets 403 and creates no thread", r.status_code == 403 and
      db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 0, r.status_code)
client.get("/chat/reports/5/messages", headers=REPORTER)
client.post("/chat/reports/5/messages", json={"message_text": "first"}, headers=REPORTER)
client.get("/chat/reports/5/thread", headers=LEADER)
db.expire_all()
check("4 one thread per report after several opens and a message",
      db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 1)
# an old duplicate (as in the live data): reads use the oldest thread; the script merges the newer one into it
dup = ChatThread(thread_type="Report", related_id=5, created_by=20, recipient_id=23, title="Incident Report #5")
db.add(dup)
db.flush()
db.add(ChatMessage(thread_id=dup.thread_id, sender_id=23, message_text="lost in a duplicate"))
db.commit()
import merge_duplicate_chat_threads as merger  # noqa: E402
groups = merger.duplicate_groups(db)
check("4 the script finds the duplicate", any(t == "Report" and rid == 5 and len(ids) == 2 for t, rid, ids in groups), groups)
for t, rid, ids in groups:
    merger.merge(db, ids[0], ids[1:])
db.commit()
db.expire_all()
r = client.get("/chat/reports/5/messages", headers=REPORTER)
texts = [m["message_text"] for m in r.json()] if r.status_code == 200 else []
check("4 after merging, one thread holds every message", "first" in texts and "lost in a duplicate" in texts
      and db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == 5).count() == 1, texts)

# ---- 5. counts ----
r = client.get("/chat/reports/1/stats", headers=STRANGER)
check("5 someone who may not read it learns nothing (no thread id, zero counts)",
      r.status_code == 200 and r.json()["thread_id"] is None and r.json()["total_messages"] == 0, r.text[:120])
r = client.get("/chat/reports/1/stats", headers=REPORTER)
check("5 the reporter gets the real counts", r.status_code == 200 and r.json()["total_messages"] >= 1, r.text[:120])

# ---- 6. confirm reunited ----
r = client.post("/reports/1/confirm-reunited", json={"notes": "mine now"}, headers=ADOPTER)
check("6 the adopter can't confirm the original report as reunited (403)", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

passed = sum(results)
print(f"\n{passed}/{len(results)} chat isolation checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
