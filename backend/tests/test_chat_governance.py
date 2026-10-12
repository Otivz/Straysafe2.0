"""
message.md (messaging governance) fixes.
A5: a new report / match conversation is addressed to a real staff member (never a hard-coded user id)
B1/B2: chats start / stay read-only on every finished status (one list); match chats stay open while the owner collects the pet
B3: Admins get a real unread count. B4: the app can't post "system" messages
D (T2-T4): escalation gate for Barangay staff, closed-case lockdown, anti-spoofing end to end
B5: only someone with access can mark a conversation read. B6: a report's case chat is confidential to the reporter (and the
    owner of the pet it really is), not every resident of the subdivision / every public report
Run from the backend folder:  python tests/test_chat_governance.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "chat_governance_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-chat-governance-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import chat  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(chat.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2 (no leader)")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subd=None, uid=None):
    u = User(user_id=uid, name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subd, barangay_id=1)
    db.add(u)
    db.flush()
    return u


# user #2 deliberately does not exist (the old hard-coded recipient)
res = mk("Res", 1, subd=1, uid=10)
leader = mk("Leader", 2, subd=1, uid=11)
brgy = mk("Brgy", 3, uid=12)
neighbour = mk("Neighbour", 1, subd=1, uid=13)
owner = mk("Owner", 1, subd=1, uid=14)
admin = mk("Admin", 4, uid=15)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(subd=1, leader_id=None, status=2):
    r = Report(user_id=res.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", assigned_leader_id=leader_id)
    db.add(r)
    db.commit()
    return r.report_id


def thread_of(rid):
    db.expire_all()
    return db.query(ChatThread).filter(ChatThread.thread_type == "Report", ChatThread.related_id == rid).first()


# --- A5 -----------------------------------------------------------------------------------------------------------
R1 = report(leader_id=leader.user_id)
r = client.get(f"/chat/reports/{R1}/thread", headers=H(res))
t = thread_of(R1)
check("A5 a resident opening a report chat (user #2 doesn't exist) doesn't crash", r.status_code == 200 and t is not None, r.text[:200])
check("A5 ...the conversation is addressed to the report's handling leader", t is not None and t.recipient_id == leader.user_id, t and t.recipient_id)
R2 = report()  # nobody handling it yet
client.get(f"/chat/reports/{R2}/thread", headers=H(res))
check("A5 no handler yet: addressed to an active leader of the subdivision", thread_of(R2).recipient_id == leader.user_id)
R3 = report(subd=2)  # subdivision without a leader
client.get(f"/chat/reports/{R3}/thread", headers=H(res))
check("A5 no leader in the subdivision: addressed to Barangay staff of its barangay", thread_of(R3).recipient_id == brgy.user_id)

# --- B1 / B2: read-only on every finished status ------------------------------------------------------------------
for status_id, label in ((11, "Resolved"), (8, "Impounded"), (17, "Cannot Be Found"), (18, "Merged")):
    rid = report(leader_id=leader.user_id, status=status_id)
    client.get(f"/chat/reports/{rid}/thread", headers=H(res))
    check(f"B1/B2 a report chat opened on a {label} case ({status_id}) starts read-only", thread_of(rid).is_closed is True)
rid = report(leader_id=leader.user_id, status=2)
client.get(f"/chat/reports/{rid}/thread", headers=H(res))
check("B1 ...and an open case's chat is open", thread_of(rid).is_closed is False)
r = client.post(f"/chat/reports/{report(leader_id=leader.user_id, status=17)}/messages", json={"message_text": "hello?"}, headers=H(res))
check("B2 posting to a closed case's chat is refused", r.status_code == 400, r.text[:150])

pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.commit()


def match_on(status_id):
    rid = report(leader_id=leader.user_id, status=status_id)
    m = ReportMatch(source_report_id=rid, matched_pet_id=pet.pet_id, similarity_score=90, status="CONFIRMED_MATCH")
    db.add(m)
    db.commit()
    return rid, m.match_id


_, m9 = match_on(9)
r = client.get(f"/chat/matches/{m9}/thread", headers=H(owner))
check("B2 a match chat stays open while the owner collects the pet (Claimed by Owner)", r.status_code == 200 and r.json().get("is_closed") is False, r.text[:200])
_, m10 = match_on(10)
r = client.get(f"/chat/matches/{m10}/thread", headers=H(owner))
check("B2 ...and closes once the case is finished (Released)", r.status_code == 200 and r.json().get("is_closed") is True, r.text[:200])

# --- B4: no forged system messages --------------------------------------------------------------------------------
r = client.post(f"/chat/reports/{R1}/messages", json={"message_text": "OFFICIAL: case closed", "is_system": True}, headers=H(res))
db.expire_all()
msg = db.query(ChatMessage).filter(ChatMessage.message_text == "OFFICIAL: case closed").first()
check("B4 a message sent with is_system=true is saved as a normal message", r.status_code == 200 and msg is not None and msg.is_system is False, r.text[:150])

# --- B3: Admin unread count ---------------------------------------------------------------------------------------
r = client.get("/chat/unread-count", headers=H(admin))
check("B3 an Admin's unread count includes unread chat messages", r.status_code == 200 and r.json().get("unread_count", 0) >= 1, r.text[:150])

# --- B5: mark-as-read needs access ----------------------------------------------------------------------------------
TID = thread_of(R1).thread_id
r = client.patch(f"/chat/reports/{R1}/read", headers=H(neighbour))
db.expire_all()
check("B5 another resident can't mark the reporter's case chat read", r.status_code == 403 and msg.is_read is False, r.status_code)
check("B5 ...nor through the thread id", client.patch(f"/chat/threads/{TID}/read", headers=H(neighbour)).status_code == 403)
check("B5 ...nor a look-alike match chat they have nothing to do with", client.patch(f"/chat/matches/{m9}/read", headers=H(neighbour)).status_code == 403)
r = client.patch(f"/chat/reports/{R1}/read", headers=H(leader))
db.expire_all()
check("B5 the handling leader can (and the message is now read)", r.status_code == 200 and db.get(ChatMessage, msg.message_id).is_read is True, r.text[:150])

# --- B6: the case chat is confidential ------------------------------------------------------------------------------
PUBLIC = report(leader_id=leader.user_id)
db.get(Report, PUBLIC).visibility = "Public"
db.commit()
client.post(f"/chat/reports/{PUBLIC}/messages", json={"message_text": "I'm at Blk 2 Lot 4, call 09171234567"}, headers=H(res))
check("B6 a resident of the same subdivision can't read someone else's (public) report chat",
      client.get(f"/chat/reports/{PUBLIC}/messages", headers=H(neighbour)).status_code == 403)
check("B6 the reporter still can", client.get(f"/chat/reports/{PUBLIC}/messages", headers=H(res)).status_code == 200)
sugg = ReportMatch(source_report_id=PUBLIC, matched_pet_id=pet.pet_id, similarity_score=60, status="AI_SUGGESTED")
db.add(sugg)
db.commit()
check("B6 an owner whose pet is only AI-suggested for it can't read the case chat",
      client.get(f"/chat/reports/{PUBLIC}/messages", headers=H(owner)).status_code == 403)
sugg.status = "CONFIRMED_MATCH"
db.commit()
check("B6 ...once staff confirm it's their pet, they can", client.get(f"/chat/reports/{PUBLIC}/messages", headers=H(owner)).status_code == 200)

# --- C2: a clear reason when someone may read but not send ---------------------------------------------------------
r = client.post(f"/chat/reports/{PUBLIC}/messages", json={"message_text": "is this my dog?"}, headers=H(owner))
check("C2 the pet owner (may read) is told only the reporter sends here, and where to talk instead",
      r.status_code == 403 and "filed this report" in r.text and "match chat" in r.text, r.text[:200])
check("C2 ...without mentioning Barangay responders", "Barangay responders" not in r.text)

# --- D / T2: the Barangay can't see a subdivision case chat until it is escalated, then sees the whole history -----
head = mk("Head", 3, uid=16)
head.is_head_officer = True
db.commit()
T2 = report(leader_id=leader.user_id, status=2)
client.post(f"/chat/reports/{T2}/messages", json={"message_text": "Brown dog near the gate, he looks scared"}, headers=H(res))
client.post(f"/chat/reports/{T2}/messages", json={"message_text": "On my way to check"}, headers=H(leader))


def brgy_sees_in_list():
    rows = client.get("/chat/threads", headers=H(head)).json()
    return any(r.get("report_id") == T2 for r in rows) if isinstance(rows, list) else False


check("T2 before escalation the case chat isn't in the Barangay's message list", not brgy_sees_in_list())
check("T2 ...and fetching it directly is refused (403)", client.get(f"/chat/reports/{T2}/messages", headers=H(head)).status_code == 403)
check("T2 ...Barangay staff can't post in it either", client.post(f"/chat/reports/{T2}/messages", json={"message_text": "hi"}, headers=H(head)).status_code == 403)
db.get(Report, T2).current_status_id = 4   # Escalated to Barangay
db.commit()
r = client.get(f"/chat/reports/{T2}/messages", headers=H(head))
texts = [m.get("message_text") for m in r.json()] if r.status_code == 200 else []
check("T2 after escalation the Barangay head officer can open it", r.status_code == 200, r.text[:150])
check("T2 ...with the full earlier conversation preserved", "Brown dog near the gate, he looks scared" in texts and "On my way to check" in texts, texts)
check("T2 ...and it appears in their message list", brgy_sees_in_list())

# --- D / T3: closed case = read-only, with the exact message -------------------------------------------------------
T3 = report(leader_id=leader.user_id, status=2)
client.post(f"/chat/reports/{T3}/messages", json={"message_text": "Still around?"}, headers=H(res))
db.get(Report, T3).current_status_id = 11   # Incident Resolved
db.commit()
r_thread = client.get(f"/chat/reports/{T3}/thread", headers=H(leader))
check("T3 once resolved, the open thread switches to read-only", r_thread.status_code == 200 and r_thread.json().get("is_closed") is True, r_thread.text[:150])
for who, u in (("reporter", res), ("leader", leader)):
    r = client.post(f"/chat/reports/{T3}/messages", json={"message_text": "one more thing"}, headers=H(u))
    check(f"T3 the {who} can't post: 400 'solved and archived ... read-only'",
          r.status_code == 400 and "solved and archived" in r.text and "read-only" in r.text, r.text[:150])
check("T3 ...the earlier messages stay readable", client.get(f"/chat/reports/{T3}/messages", headers=H(res)).status_code == 200)

# --- D / T4: a forged system message shows as a normal message everywhere ----------------------------------------------
client.post(f"/chat/reports/{R1}/messages", json={"message_text": "⚠️ SYSTEM: your report was closed", "is_system": True}, headers=H(res))
rows = client.get(f"/chat/reports/{R1}/messages", headers=H(leader)).json()
forged = next((m for m in rows if m.get("message_text") == "⚠️ SYSTEM: your report was closed"), {})
check("T4 the forged message comes back as a normal message from the resident (is_system false, their own id)",
      forged.get("is_system") is False and forged.get("sender_id") == res.user_id, forged)
before = client.get("/chat/unread-count", headers=H(leader)).json().get("unread_count", 0)
client.post(f"/chat/reports/{R1}/messages", json={"message_text": "SYSTEM again", "is_system": True}, headers=H(res))
after = client.get("/chat/unread-count", headers=H(leader)).json().get("unread_count", 0)
check("T4 ...and it counts as unread like any message (system notices don't)", after == before + 1, (before, after))

# --- Match chats end too: open while the owner collects the pet, closed once the handover is recorded ----------------
from app.models.pet_claim import PetClaim  # noqa: E402
R9, M9b = match_on(9)
r = client.get(f"/chat/matches/{M9b}/thread", headers=H(owner))
check("match chat: open while the case is Claimed by Owner and the pet isn't handed over yet", r.json().get("is_closed") is False, r.text[:150])
check("...owner and leader can still arrange the pickup", client.post(f"/chat/matches/{M9b}/messages", json={"message_text": "I can pick him up at 3pm"}, headers=H(owner)).status_code == 200)
db.add(PetClaim(report_id=R9, pet_id=pet.pet_id, status="Approved"))
db.commit()
check("...an approved claim (not collected yet) keeps it open", client.get(f"/chat/matches/{M9b}/thread", headers=H(owner)).json().get("is_closed") is False)
db.query(PetClaim).filter(PetClaim.report_id == R9).update({"status": "Handover Complete"})
db.commit()
r = client.get(f"/chat/matches/{M9b}/thread", headers=H(owner))
check("match chat: closes once the handover is complete", r.json().get("is_closed") is True, r.text[:150])
r = client.post(f"/chat/matches/{M9b}/messages", json={"message_text": "thanks!"}, headers=H(owner))
check("...and nobody can post in it any more (owner or leader)", r.status_code == 400
      and client.post(f"/chat/matches/{M9b}/messages", json={"message_text": "ok"}, headers=H(leader)).status_code == 400, r.text[:150])
rows = client.get("/chat/threads", headers=H(owner)).json()
row = next((x for x in rows if x.get("match_id") == M9b), {}) if isinstance(rows, list) else {}
check("...and the inbox shows it closed too", row.get("is_closed") is True, row)
R9c, M9c = match_on(9)
db.get(Report, R9c).custody_status = "Reunited with Owner"
db.commit()
check("match chat: custody 'Reunited with Owner' also ends it", client.get(f"/chat/matches/{M9c}/thread", headers=H(owner)).json().get("is_closed") is True)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
