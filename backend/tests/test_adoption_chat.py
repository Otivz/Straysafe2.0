"""
Adoption chat: authorization (IDOR), sender integrity, notifications, unread, read-only states.

Runs against a throwaway SQLite database using real JWT tokens through the real auth dependency.
Run from the backend folder:  python tests/test_adoption_chat.py
"""
import os
import sys
import tempfile

_DB_FILE = os.path.join(tempfile.mkdtemp(), "adoption_chat_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-chat")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401  (register every table)
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.chat import ChatThread, ChatMessage  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Adoption, AdoptionAssignment, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoption_chat, chat  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(chat.router)
app.include_router(adoption_chat.router)
client = TestClient(app)

db = SessionLocal()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test.local", password="x",
             role_id=role_id, is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


db.add_all([Barangay(barangay_id=1, barangay_name="Brgy One", city="C"), Barangay(barangay_id=2, barangay_name="Brgy Two", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
db.flush()

res_a = mk_user("Resident A", 1, subdivision_id=1, barangay_id=1)
res_b = mk_user("Resident B", 1, subdivision_id=1, barangay_id=1)
staff1 = mk_user("Staff One", 3, barangay_id=1)
head1 = mk_user("Head One", 3, barangay_id=1, is_head_officer=True)
staff2 = mk_user("Staff Two", 3, barangay_id=2)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
admin = mk_user("Admin", 4)
unverified = mk_user("Unverified", 1, subdivision_id=1)
unverified.is_verified = False
db.flush()


def mk_adoption(applicant, status="Approved", stage="Interview", subd=1, **kw):
    rep = Report(user_id=applicant.user_id, subdivision_id=subd, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    animal = HoldingAnimal(report_id=rep.report_id, animal_name="Max", animal_type="Dog", breed="Aspin")
    db.add(animal)
    db.flush()
    ad = Adoption(holding_id=animal.holding_id, applicant_id=applicant.user_id, status=status, full_name=applicant.name,
                  address="addr", contact_no="0900", reason="because", current_stage=stage, **kw)
    db.add(ad)
    db.flush()
    return ad


ad_a = mk_adoption(res_a)                                         # active, barangay 1
ad_b = mk_adoption(res_b)                                         # someone else's
ad_other_brgy = mk_adoption(res_a, subd=2)                        # same applicant, barangay 2
ad_rejected = mk_adoption(res_a, status="Rejected", stage="Application")
ad_cancelled = mk_adoption(res_a, status="Cancelled", stage="Application")
ad_done = mk_adoption(res_a, stage="Successful_Adoption", post_monitoring_status="Completed")
staff_unassigned = mk_user("Staff Unassigned", 3, barangay_id=1)
db.commit()
# Non-head staff reach a case's chat only through an assignment on it (Head Officer: whole barangay).
for ad, who in [(ad_a, staff1), (ad_other_brgy, staff2), (ad_rejected, staff1), (ad_cancelled, staff1), (ad_done, staff1)]:
    db.add(AdoptionAssignment(adoption_id=ad.adoption_id, task_type="Interview", assigned_to=who.user_id,
                              assigned_to_name=who.name, status="Accepted"))
db.commit()


def H(user):
    tok = create_access_token({"sub": str(user.user_id), "user_id": user.user_id, "role_id": user.role_id})
    return {"Authorization": f"Bearer {tok}"}


results = []


def check(label, cond, extra=""):
    results.append((label, bool(cond)))
    print(("[PASS] " if cond else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not cond) else ""))


def url(ad, tail):
    return f"/chat/adoptions/{ad.adoption_id}/{tail}"


# ── 1. Anonymous / unauthorized access (IDOR) ───────────────────────────────
check("anonymous GET thread -> 401", client.get(url(ad_a, "thread")).status_code == 401)
check("anonymous POST message -> 401", client.post(url(ad_a, "messages"), json={"message_text": "x"}).status_code == 401)

for who, label in [(res_b, "other resident"), (staff2, "staff of another barangay"), (leader, "subdivision leader"), (unverified, "unverified resident")]:
    # Unverified residents are now stopped even earlier, before the application is looked up (403 instead of 404).
    expected = 403 if who is unverified else 404
    for method, tail in [("get", "thread"), ("get", "messages"), ("patch", "read")]:
        r = getattr(client, method)(url(ad_a, tail), headers=H(who))
        check(f"{label}: {method.upper()} {tail} on someone else's application -> {expected}", r.status_code == expected, r.status_code)
    r = client.post(url(ad_a, "messages"), json={"message_text": "intrude"}, headers=H(who))
    check(f"{label}: POST message -> {expected}", r.status_code == expected, r.status_code)

check("resident cannot open own application in ANOTHER barangay's list of someone else's (ad_b) -> 404",
      client.get(url(ad_b, "thread"), headers=H(res_a)).status_code == 404)
check("nonexistent adoption id -> 404", client.get("/chat/adoptions/999999/thread", headers=H(res_a)).status_code == 404)
check("no thread was created by any rejected attempt", db.query(ChatThread).count() == 0)
check("no message was created by any rejected attempt", db.query(ChatMessage).count() == 0)

# ── 2. Thread header ────────────────────────────────────────────────────────
r = client.get(url(ad_a, "thread"), headers=H(res_a))
info = r.json()
check("applicant sees own thread header (200)", r.status_code == 200, r.text)
check("header shows current stage", info.get("current_stage") == "Interview" and info.get("stage_label") == "Interview", info)
check("header shows pet + barangay + applicant", info.get("pet_name") == "Max" and info.get("barangay_name") == "Brgy One" and info["applicant"]["name"] == "Resident A", info)
check("header: can_send true, viewer applicant, no thread yet", info.get("can_send") is True and info.get("viewer_role") == "applicant" and info.get("thread_id") is None, info)
r = client.get(url(ad_a, "thread"), headers=H(staff1))
check("staff of same barangay can open thread (viewer=staff)", r.status_code == 200 and r.json()["viewer_role"] == "staff", r.text)
r = client.get(url(ad_a, "thread"), headers=H(admin))
check("unassigned non-head staff of the SAME barangay cannot open the thread (404)",
      client.get(url(ad_a, "thread"), headers=H(staff_unassigned)).status_code == 404)
check("Head Officer opens any case of the barangay without an assignment",
      client.get(url(ad_b, "thread"), headers=H(head1)).status_code == 200)
check("admin can open thread (viewer=admin)", r.status_code == 200 and r.json()["viewer_role"] == "admin", r.text)
check("GET thread/messages never create a thread", db.query(ChatThread).count() == 0)

# ── 3. Sending: sender integrity + validation ───────────────────────────────
r = client.post(url(ad_a, "messages"),
                json={"message_text": "  Hello Barangay  ", "sender_id": staff1.user_id, "is_system": True, "thread_id": 999, "message_id": 5, "media_url": "http://x"},
                headers=H(res_a))
msg = r.json()
check("applicant message accepted (200)", r.status_code == 200, r.text)
check("sender comes from the session, not the request body", msg.get("sender_id") == res_a.user_id, msg)
check("client cannot set is_system / media / thread / message id", msg.get("is_system") is False and msg.get("media_url") is None and msg.get("thread_id") != 999 and msg.get("message_id") != 5, msg)
check("message text trimmed", msg.get("message_text") == "Hello Barangay", msg)
check("sender role labelled", msg.get("sender_role") == "Citizen", msg)
thread = db.query(ChatThread).filter(ChatThread.thread_type == "Adoption").one()
check("exactly one Adoption thread tied to this application", thread.related_id == ad_a.adoption_id and thread.created_by == res_a.user_id)

check("empty text -> 422", client.post(url(ad_a, "messages"), json={"message_text": ""}, headers=H(res_a)).status_code == 422)
check("whitespace-only text -> 400", client.post(url(ad_a, "messages"), json={"message_text": "   "}, headers=H(res_a)).status_code == 400)
check("over-long text -> 422", client.post(url(ad_a, "messages"), json={"message_text": "x" * 2001}, headers=H(res_a)).status_code == 422)

# ── 4. Notifications ────────────────────────────────────────────────────────
db.expire_all()
def notifs(user): return db.query(Notification).filter(Notification.user_id == user.user_id, Notification.type == "adoption_chat").all()
check("head officer of the barangay notified", len(notifs(head1)) == 1 and notifs(head1)[0].related_id == ad_a.adoption_id)
check("staff of another barangay NOT notified", len(notifs(staff2)) == 0)
check("subdivision leader NOT notified", len(notifs(leader)) == 0)
check("sender not notified of own message", len(notifs(res_a)) == 0)
client.post(url(ad_a, "messages"), json={"message_text": "second message"}, headers=H(res_a))
db.expire_all()
check("second unread message refreshes the notification instead of spamming", len(notifs(head1)) == 1 and "second message" in notifs(head1)[0].message)

# ── 5. Unread + staff reply + both sides see full history ───────────────────
r = client.get(url(ad_a, "thread"), headers=H(staff1))
check("staff unread count = 2", r.json()["unread_messages"] == 2, r.text)
r = client.get("/chat/adoptions/unread-counts", headers=H(staff1))
check("staff unread-counts lists this application (2)", r.json()["counts"].get(str(ad_a.adoption_id)) == 2 and r.json()["total"] == 2, r.text)
check("staff of another barangay sees no unread counts", client.get("/chat/adoptions/unread-counts", headers=H(staff2)).json()["total"] == 0)
check("other resident sees no unread counts", client.get("/chat/adoptions/unread-counts", headers=H(res_b)).json()["total"] == 0)
check("applicant has no unread yet", client.get(url(ad_a, "thread"), headers=H(res_a)).json()["unread_messages"] == 0)

r = client.post(url(ad_a, "messages"), json={"message_text": "Please bring a valid ID."}, headers=H(staff1))
check("staff reply accepted", r.status_code == 200 and r.json()["sender_id"] == staff1.user_id, r.text)
db.expire_all()
check("applicant notified of the reply", len(notifs(res_a)) == 1 and notifs(res_a)[0].related_id == ad_a.adoption_id)
r = client.get(url(ad_a, "thread"), headers=H(res_a))
check("applicant unread = 1, header lists the staff participant", r.json()["unread_messages"] == 1 and [p["name"] for p in r.json()["staff_participants"]] == ["Staff One"], r.text)
check("applicant unread-counts = 1", client.get("/chat/adoptions/unread-counts", headers=H(res_a)).json()["total"] == 1)
for who, label in [(res_a, "applicant"), (staff1, "staff")]:
    msgs = client.get(url(ad_a, "messages"), headers=H(who)).json()
    check(f"{label} sees complete history in order", [m["message_text"] for m in msgs] == ["Hello Barangay", "second message", "Please bring a valid ID."], msgs)

# ── 6. Mark read ────────────────────────────────────────────────────────────
r = client.patch(url(ad_a, "read"), headers=H(staff1))
check("staff mark-read clears the applicant's messages only", r.json()["marked_read"] == 2, r.text)
check("head officer bell notification is still unread before they open the chat", all(not n.is_read for n in notifs(head1)))
client.patch(url(ad_a, "read"), headers=H(head1))
db.expire_all()
check("head officer's bell notification is cleared when they open the chat", len(notifs(head1)) == 1 and all(n.is_read for n in notifs(head1)))
check("another recipient's notification is untouched by someone else opening the chat", all(not n.is_read for n in notifs(res_a)))
check("applicant still has her unread reply (staff read does not touch it)", client.get(url(ad_a, "thread"), headers=H(res_a)).json()["unread_messages"] == 1)
check("admin read does not clear unread for others", client.patch(url(ad_a, "read"), headers=H(admin)).json()["marked_read"] == 0)
r = client.patch(url(ad_a, "read"), headers=H(res_a))
check("applicant mark-read clears staff messages", r.json()["marked_read"] == 1, r.text)
check("all unread now zero", client.get("/chat/adoptions/unread-counts", headers=H(res_a)).json()["total"] == 0
      and client.get("/chat/adoptions/unread-counts", headers=H(staff1)).json()["total"] == 0)

# ── 7. Generic endpoint cannot be used to bypass adoption authorization ─────
r = client.patch(f"/chat/threads/{thread.thread_id}/read", headers=H(res_b))
check("generic /chat/threads/{id}/read refuses adoption threads (no IDOR)", r.status_code == 404, r.status_code)

# ── 8. Stage change keeps the conversation; chat never changes the stage ────
before = (db.query(Adoption).get(ad_a.adoption_id).current_stage, db.query(Adoption).get(ad_a.adoption_id).status)
db.query(Adoption).filter(Adoption.adoption_id == ad_a.adoption_id).update({"current_stage": "Handover"})
db.commit()
r = client.get(url(ad_a, "thread"), headers=H(res_a))
check("header follows the stage change", r.json()["current_stage"] == "Handover", r.text)
check("conversation preserved across the stage change", len(client.get(url(ad_a, "messages"), headers=H(res_a)).json()) == 3)
r = client.post(url(ad_a, "messages"), json={"message_text": "now at handover"}, headers=H(res_a))
db.expire_all()
after = db.query(Adoption).get(ad_a.adoption_id)
check("chat messages never change stage/status", (after.current_stage, after.status) == ("Handover", "Approved") and before == ("Interview", "Approved"))
check("still one thread for the application", db.query(ChatThread).filter(ChatThread.thread_type == "Adoption", ChatThread.related_id == ad_a.adoption_id).count() == 1)

# ── 9. Closed states: history kept, sending blocked ─────────────────────────
for ad, label in [(ad_rejected, "rejected"), (ad_cancelled, "cancelled"), (ad_done, "completed")]:
    t = ChatThread(thread_type="Adoption", related_id=ad.adoption_id, created_by=res_a.user_id, recipient_id=staff1.user_id, title="t")
    db.add(t)
    db.flush()
    db.add(ChatMessage(thread_id=t.thread_id, sender_id=res_a.user_id, message_text=f"old {label} message"))
db.commit()
for ad, label in [(ad_rejected, "rejected"), (ad_cancelled, "cancelled"), (ad_done, "completed")]:
    info = client.get(url(ad, "thread"), headers=H(res_a)).json()
    check(f"{label}: read-only with a reason", info["can_send"] is False and info["read_only_reason"], info)
    check(f"{label}: history still readable by applicant", [m["message_text"] for m in client.get(url(ad, "messages"), headers=H(res_a)).json()] == [f"old {label} message"])
    check(f"{label}: history readable by authorized staff", len(client.get(url(ad, "messages"), headers=H(staff1)).json()) == 1)
    check(f"{label}: applicant cannot send (409)", client.post(url(ad, "messages"), json={"message_text": "hi"}, headers=H(res_a)).status_code == 409)
    check(f"{label}: staff cannot send (409)", client.post(url(ad, "messages"), json={"message_text": "hi"}, headers=H(staff1)).status_code == 409)

# ── 10. Cross-barangay application of the SAME applicant ────────────────────
check("barangay-1 staff cannot read an application owned by barangay 2", client.get(url(ad_other_brgy, "thread"), headers=H(staff1)).status_code == 404)
check("barangay-2 staff can", client.get(url(ad_other_brgy, "thread"), headers=H(staff2)).status_code == 200)
check("applicant can chat on her barangay-2 application", client.post(url(ad_other_brgy, "messages"), json={"message_text": "hi"}, headers=H(res_a)).status_code == 200)
db.expire_all()
check("barangay-1 head officer NOT notified about a barangay-2 application",
      not any(n.related_id == ad_other_brgy.adoption_id for n in notifs(head1)))
check("barangay-2 staff ARE notified about their own barangay's application",
      any(n.related_id == ad_other_brgy.adoption_id for n in notifs(staff2)))

# ── 10b. Inbox list (/brgy/messages) ────────────────────────────────────────
def inbox_ids(who):
    r = client.get("/chat/adoptions/threads", headers=H(who))
    return r.status_code, {i["adoption_id"] for i in r.json()} if r.status_code == 200 else set()

code, ids = inbox_ids(staff1)
check("inbox: barangay-1 staff sees barangay-1 conversations", code == 200 and ad_a.adoption_id in ids, (code, ids))
check("inbox: barangay-1 staff does NOT see barangay-2 conversation", ad_other_brgy.adoption_id not in ids, ids)
code, ids = inbox_ids(staff2)
check("inbox: barangay-2 staff sees only barangay-2", ids == {ad_other_brgy.adoption_id}, ids)
code, ids = inbox_ids(res_b)
check("inbox: resident sees only own applications", ad_a.adoption_id not in ids, ids)
code, ids = inbox_ids(leader)
check("inbox: subdivision leader gets nothing", code == 200 and ids == set(), (code, ids))
code, ids = inbox_ids(admin)
check("inbox: admin sees all barangays", {ad_a.adoption_id, ad_other_brgy.adoption_id} <= ids, ids)
item = next(i for i in client.get("/chat/adoptions/threads", headers=H(staff1)).json() if i["adoption_id"] == ad_a.adoption_id)
check("inbox item: thread_mode adoption + pet/applicant/stage + last message",
      item["thread_mode"] == "adoption" and item["adoption"]["pet_name"] == "Max" and item["adoption"]["applicant_name"] == "Resident A"
      and item["adoption"]["stage_label"] and item["last_message"] is not None, item)
r = client.get(url(ad_done, "inbox-item"), headers=H(staff1))
check("inbox-item: completed adoption is closed / cannot interact", r.status_code == 200 and r.json()["is_closed"] and not r.json()["can_interact"], r.text)
check("inbox-item: other barangay staff -> 404", client.get(url(ad_a, "inbox-item"), headers=H(staff2)).status_code == 404)
fresh = mk_adoption(res_b)
db.commit()
r = client.get(url(fresh, "inbox-item"), headers=H(head1))
check("inbox-item without messages: placeholder negative id, no thread created",
      r.status_code == 200 and r.json()["thread_id"] < 0 and r.json()["last_message"] is None
      and db.query(ChatThread).filter(ChatThread.related_id == fresh.adoption_id, ChatThread.thread_type == "Adoption").count() == 0, r.text)

# ── 10c. Assigned staff are notified of adopter messages ───────────────────
db.query(Notification).delete()
db.commit()
client.post(url(ad_a, "messages"), json={"message_text": "Question for my interviewer"}, headers=H(res_a))
db.expire_all()
check("adopter message notifies the ASSIGNED (non-head) staff member", any(n.related_id == ad_a.adoption_id for n in notifs(staff1)))
check("...but not unassigned staff of the barangay", not any(n.related_id == ad_a.adoption_id for n in notifs(staff_unassigned)))

# ── 11. Rate limit ──────────────────────────────────────────────────────────
codes = [client.post(url(ad_b, "messages"), json={"message_text": "spam"}, headers=H(res_b)).status_code for _ in range(35)]
check("message flooding is rate limited (429)", 429 in codes, codes)

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
