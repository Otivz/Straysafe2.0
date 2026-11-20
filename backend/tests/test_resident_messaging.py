"""
Resident-to-Administration messaging (services/case_messaging.py, routes/case_messages.py, docs/01-system/RESIDENT_MESSAGING.md):

  - a resident opens a conversation from their OWN report; asking again returns the same open one; nobody else can open or read it
  - a resident opens a general conversation (no report) with a subject and a first message
  - the Leaders of the subdivision see both in the Messages inbox (filters, counts, search); a Leader of another subdivision does not
  - notifications: the Leader is told with a link to the conversation, a second message does not stack a second unread notification,
    the resident is told the administration replied "regarding Report SS-..."
  - THE RULE: resolving the report closes its conversation in the same transaction (status, closed_at, reason, trigger, system line,
    one audit row); a general conversation stays open; nobody can write in it afterwards (409, also by direct API call); history stays
  - a repeated status update records no second closure; reopening the case does not reopen the conversation; a new one can be started
  - staff can close a conversation by hand; a resident cannot
Offline: a throwaway SQLite file, never app.main and never the configured database.
Run from the backend folder:  python tests/test_resident_messaging.py
"""
import os
import sys
import tempfile
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "resident_messaging.db")
os.environ.setdefault("JWT_SECRET_KEY", "resident-messaging-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.db_migrations import resident_messaging as schema  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.case_messaging import CaseMessage, CaseMessageThread  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import case_messages, cases  # noqa: E402
from app.utils import push_categories as PC  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (cases.router, case_messages.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def user(name, role, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@messaging.test", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rina, carl, far = user("Rina Reyes", 1), user("Carl Cruz", 1), user("Far Away", 1, subdivision=2)
leader, leader2, admin = user("Leader Lee", 2), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)
INJURED = db.query(ReportCategory).filter(ReportCategory.category_name == "Injured / Distressed Animal").one().category_id


def mk(owner):
    r = Report(user_id=owner.user_id, subdivision_id=owner.subdivision_id, category_id=INJURED, current_status_id=1, animal_type="Dog",
               latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2", description="An injured dog near the gate.")
    db.add(r)
    db.commit()
    return r.report_id


def notes(u, ntype):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == u.user_id, Notification.type == ntype).order_by(Notification.notification_id).all()


def say(u, tid, body, key=None):
    return client.post(f"/case-messages/{tid}/messages", json={"body": body, **({"client_request_id": key} if key else {})}, headers=H(u))


def inbox(u, status="all", q=None):
    return client.get("/case-messages/inbox", params={"status": status, **({"q": q} if q else {})}, headers=H(u))


check("the schema check passes on a database created from the models", schema.missing(engine) == [], str(schema.missing(engine)))

# ------------------------------------------------------------------------------------------------ open from a report
rep = mk(rina)
res = client.post(f"/case-messages/reports/{rep}", headers=H(rina))
check("the resident opens a conversation from their own report", res.status_code == 200 and res.json()["kind"] == "direct"
      and res.json()["report_id"] == rep and res.json()["status"] == "open" and res.json()["can_reply"], res.text[:300])
tid = res.json()["thread_id"]
ref = res.json()["report_ref"]
check("it carries the report reference, category and case status", ref.endswith(f"-{rep:04d}") and ref.startswith("SS-")
      and res.json()["report_category"] == "Injured / Distressed Animal" and res.json()["case_status"] == "Reported"
      and res.json()["subject"] == f"Report {ref}: Injured / Distressed Animal", res.text[:400])
check("asking again opens the SAME conversation (one per case)", client.post(f"/case-messages/reports/{rep}", headers=H(rina)).json()["thread_id"] == tid)
check("another resident cannot open a conversation on someone else's report", client.post(f"/case-messages/reports/{rep}", headers=H(carl)).status_code == 404)
check("another resident cannot read it", client.get(f"/case-messages/{tid}", headers=H(carl)).status_code == 404)
check("another resident cannot write in it", say(carl, tid, "hello").status_code == 404)
check("a Leader cannot use the resident's open-from-report action", client.post(f"/case-messages/reports/{rep}", headers=H(leader)).status_code == 403)

# ------------------------------------------------------------------------------------------------ messages and notifications
res = say(rina, tid, "The dog is limping near Gate 2. Is someone coming?")
check("the resident sends a message", res.status_code == 201 and res.json()["messages"][-1]["mine"] and res.json()["messages"][-1]["at"])
n = notes(leader, "resident_message")
check("the Leader of the subdivision is notified with a link to the conversation, naming the report",
      len(n) == 1 and n[0].related_id == tid and n[0].title == f"New message received from a resident regarding Report {ref}."
      and n[0].message == "Open the conversation to read the new message." and PC.notification_link(2, "resident_message", tid) == f"/messages/{tid}",
      str([(x.title, x.related_id) for x in n]))
check("the Leader of another subdivision is not notified", notes(leader2, "resident_message") == [])
say(rina, tid, "It is bleeding a little.")
check("a second message before the first is read does not stack a second notification", len(notes(leader, "resident_message")) == 1)
check("the message text never goes into the audit log", all("bleeding" not in (a.description or "") and "bleeding" not in str(a.new_values or "")
                                                            for a in db.query(AuditLog).filter(AuditLog.action == "CASE_MESSAGE_SENT").all()))

box = inbox(leader).json()
check("the Leader's inbox lists the conversation as unread, with counts", [i["thread_id"] for i in box["items"]] == [tid]
      and box["items"][0]["unread"] == 2 and box["counts"] == {"all": 1, "unread": 1, "open": 1, "closed": 0}, str(box)[:400])
check("the inbox shows who wrote (staff see the resident's name)", "Rina Reyes" in box["items"][0]["subtitle"])
check("search by reference finds it, by an unrelated word does not", [i["thread_id"] for i in inbox(leader, q=ref).json()["items"]] == [tid]
      and [i["thread_id"] for i in inbox(leader, q=str(rep)).json()["items"]] == [tid] and inbox(leader, q="zebra").json()["items"] == [])
check("a Leader of another subdivision sees none of it", inbox(leader2).json()["items"] == [] and client.get(f"/case-messages/{tid}", headers=H(leader2)).status_code == 404)
check("a resident cannot open the staff inbox", inbox(rina).status_code == 403)
check("the unread badge counts it for the Leader", client.get("/case-messages/unread-count", headers=H(leader)).json() == {"conversations": 1, "messages": 2})

res = say(leader, tid, "Yes, I am on my way with a carrier.")
check("the Leader replies", res.status_code == 201, res.text[:200])
n = notes(rina, "case_message")
check("the resident is told the administration replied, naming the report, and it opens the conversation",
      [(x.title, x.related_id) for x in n] == [(f"Subdivision Administration has replied to your message regarding Report {ref}.", tid)]
      and PC.notification_link(1, "case_message", tid) == f"/resident-app/conversations/{tid}", str([(x.title, x.related_id) for x in n]))
view = client.get(f"/case-messages/{tid}", headers=H(rina)).json()
check("the resident sees the Leader as Subdivision Leader, messages in order with timestamps",
      [m["sender_name"] if not m["mine"] else "me" for m in view["messages"]] == ["me", "me", "Subdivision Leader"]
      and all(m["at"] for m in view["messages"]) and view["unread"] == 1)
client.post(f"/case-messages/{tid}/read", json={"through_message_id": view["messages"][-1]["message_id"]}, headers=H(rina))
check("reading it clears the resident's unread count", client.get("/case-messages/unread-count", headers=H(rina)).json()["conversations"] == 0)

# ------------------------------------------------------------------------------------------------ general conversation
res = client.post("/case-messages/general", json={"subject": "Gate guard schedule", "body": "Who handles stray reports at night?", "client_request_id": "gen-1"}, headers=H(rina))
check("the resident starts a general conversation with a subject and a first message", res.status_code == 201 and res.json()["kind"] == "general"
      and res.json()["report_id"] is None and res.json()["title"] == "Gate guard schedule" and len(res.json()["messages"]) == 1, res.text[:300])
gid = res.json()["thread_id"]
check("the same submission id does not create a second conversation", client.post("/case-messages/general", json={"subject": "Gate guard schedule", "body": "Who handles stray reports at night?", "client_request_id": "gen-1"}, headers=H(rina)).json()["thread_id"] == gid
      and db.query(CaseMessageThread).filter(CaseMessageThread.kind == "general").count() == 1)
check("a general conversation without a subject is refused", client.post("/case-messages/general", json={"subject": " ", "body": "x"}, headers=H(rina)).status_code == 422)
check("a Leader cannot start a resident general conversation", client.post("/case-messages/general", json={"subject": "s", "body": "x"}, headers=H(leader)).status_code == 403)
check("the general conversation reaches the Leader's inbox", gid in [i["thread_id"] for i in inbox(leader).json()["items"]]
      and notes(leader, "resident_message")[-1].title == "New message received from a resident.")
check("the Leader can reply in a general conversation", say(leader, gid, "Night guards at Gate 1 take them.").status_code == 201)

# ------------------------------------------------------------------------------------------------ THE RULE: resolve -> closed
audits_before = db.query(AuditLog).filter(AuditLog.action == "CONVERSATION_AUTO_CLOSED").count()
res = client.post(f"/cases/{rep}/close", json={"disposition": "resolved_intervention", "reason": "Dog brought to the vet; private note about the owner.", "welfare_outcome": "Transferred to Veterinary Clinic"}, headers=H(leader))
check("the Leader resolves the case", res.status_code == 200, res.text[:300])
db.expire_all()
t = db.get(CaseMessageThread, tid)
check("its conversation is CLOSED automatically, with when, why and what triggered it", t.status == "closed" and t.closed_at is not None
      and t.close_trigger == "case_closed" and t.closed_by == leader.user_id)
audits = db.query(AuditLog).filter(AuditLog.action == "CONVERSATION_AUTO_CLOSED", AuditLog.target_id == tid).all()
check("exactly one closure audit row: previous and new status, reason, trigger, triggering event, who",
      len(audits) == 1 and audits[0].old_values == {"status": "open"} and audits[0].new_values["status"] == "closed"
      and audits[0].new_values["report_id"] == rep and audits[0].new_values["trigger"] == "case_closed"
      and "Resolved" in audits[0].new_values["triggering_event"] and audits[0].user_id == leader.user_id, str([a.new_values for a in audits]))
check("the general conversation is NOT closed by an unrelated case", db.get(CaseMessageThread, gid).status == "open")
view = client.get(f"/case-messages/{tid}", headers=H(rina)).json()
check("the resident still reads every message, sees Closed, why, when, and the case outcome", view["status"] == "closed" and not view["can_reply"]
      and view["close_trigger"] == "case_closed" and view["closed_at"] and view["case_status"] == "Resolved" and view["report_ref"] == ref
      and [m["kind"] for m in view["messages"]] == ["message", "message", "message", "system"], str(view)[:500])
check("the closure line never shows the Leader's private closure notes", "private note" not in view["ended_reason"] and "private note" not in view["messages"][-1]["body"])
res = say(rina, tid, "One more thing")
check("the resident cannot write in it (409, by direct API call)", res.status_code == 409 and "closed" in res.json()["detail"].lower(), res.text[:200])
check("the Leader cannot write in it either", say(leader, tid, "Follow-up").status_code == 409)
check("no message was added", db.query(CaseMessage).filter(CaseMessage.thread_id == tid, CaseMessage.kind == "message").count() == 3)
check("the inbox lists it under Closed", tid in [i["thread_id"] for i in inbox(leader, "closed").json()["items"]]
      and tid not in [i["thread_id"] for i in inbox(leader, "open").json()["items"]])
check("the resident cannot open a new conversation on the closed report", client.post(f"/case-messages/reports/{rep}", headers=H(rina)).status_code == 409)

# a repeated status update does not record a second closure
r = db.get(Report, rep)
r.current_status_id = 10
db.commit()
check("a repeated status update does not create another closure record", db.query(AuditLog).filter(AuditLog.action == "CONVERSATION_AUTO_CLOSED").count() == audits_before + 1
      and db.query(CaseMessage).filter(CaseMessage.thread_id == tid, CaseMessage.kind == "system").count() == 1)

# reopening the case does not reopen the conversation
res = client.post(f"/cases/{rep}/reopen", json={"reason": "The dog came back hurt."}, headers=H(leader))
check("the case is reopened", res.status_code == 200, res.text[:200])
db.expire_all()
check("the closed conversation stays closed and keeps its history", db.get(CaseMessageThread, tid).status == "closed"
      and client.get(f"/case-messages/{tid}", headers=H(rina)).json()["can_reply"] is False)
res = client.post(f"/case-messages/reports/{rep}", headers=H(rina))
check("the resident can start a NEW conversation on the reopened case; the old one is preserved", res.status_code == 200 and res.json()["thread_id"] != tid
      and res.json()["status"] == "open" and db.query(CaseMessage).filter(CaseMessage.thread_id == tid).count() == 4)

# ------------------------------------------------------------------------------------------------ manual close
check("a resident cannot close a conversation", client.post(f"/case-messages/{gid}/close", json={}, headers=H(rina)).status_code == 403)
res = client.post(f"/case-messages/{gid}/close", json={"reason": "Answered."}, headers=H(leader))
check("a Leader closes the general conversation by hand", res.status_code == 200 and res.json()["status"] == "closed" and res.json()["close_trigger"] == "manual", res.text[:300])
check("and nobody can write in it afterwards", say(rina, gid, "Thanks!").status_code == 409)
check("the manual closure is audited", db.query(AuditLog).filter(AuditLog.action == "CONVERSATION_CLOSED", AuditLog.target_id == gid).count() == 1)
check("the Administrator sees every subdivision's conversations", {tid, gid} <= {i["thread_id"] for i in inbox(admin).json()["items"]})
far_rep = mk(far)
check("a resident of another subdivision messages their own administration only", client.post(f"/case-messages/reports/{far_rep}", headers=H(far)).status_code == 200
      and far_rep not in [i["report_id"] for i in inbox(leader).json()["items"]] and far_rep in [i["report_id"] for i in inbox(leader2).json()["items"]])

print(f"\n{PASSED} checks passed")
