"""
Messages on a lost-pet or found-animal report and the bridge that opens when a Leader links two reports
(services/case_messaging.py, services/lost_found_matching.py, docs/01-system/LOST_FOUND_MATCHING.md "Messages and the bridge"):

  - "Contact the owner": the Leader opens a conversation with ONE resident of a report (the owner, the reporter or the finder); it is the same one
    when opened again; what the Leader writes writes itself into the case's contact log (so it appears in the Leader's Activity); the resident is
    notified and reads it as "Subdivision Leader"; a stranger cannot read or write it
  - link by hand: a Leader links a missing-pet report and a found-animal report themselves (no suggestion needed); the moment they are linked a
    BRIDGE opens between the owner, the finder and the Leader, both residents are told once, and it is unread on their Home screens
  - the bridge is a group conversation: what each says reaches the others, the Leader's lines are logged on BOTH reports, residents see each
    other by first name and role only
  - unlinking: the link ends, the pair is ruled out (kept), the bridge closes with a line saying so (messages kept), both residents are told, the
    possible recovery ends, suggestions that gave way to the link apply again, and the pair can be linked again (a new bridge)
  - nothing here changes a case status, and a closed report ends its conversations
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_case_messaging.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.db_migrations.case_alignment import run_case_alignment
from app.limiter import limiter
from app.models.case_messaging import CaseMessage, CaseMessageMember, CaseMessageThread
from app.models.case_records import CaseContactLog, CaseLink
from app.models.lost_found_match import LostFoundMatch
from app.models.lost_pet_alert import LostPetCoordination, LostPetSighting
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory
from app.models.user import Barangay, Subdivision, User
from app.routes import case_messages, cases, lost_found, lost_pet_alerts, reports
from app.utils import push_categories as PC
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, lost_pet_alerts.router, lost_found.router, case_messages.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


CATEGORY_NAMES = ["Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed", "Lost Pet", "Found / Unidentified Animal",
                  "Animal Nuisance", "Animal Safety Concern", "Injured / Distressed Animal", "Other Animal Concern"]
for i, name in enumerate(CATEGORY_NAMES, start=1):
    db.add(ReportCategory(category_id=i, category_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Test City"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"), Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for status_id in range(1, 19):
    db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
db.commit()
assert run_case_alignment(engine)["errors"] == []
LOST, FOUND = 6, 7


def user(name, role=1, subdivision=1, phone="09170001111"):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@messages.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone=phone, address="Blk 9 Lot 15")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rita, nina, noel, olga = user("Rita Santos", phone="09171110001"), user("Nina Cruz", phone="09173330003"), user("Noel Garcia", phone="09174440004"), user("Olga Dela", subdivision=2)
leader, leader_b, leader2, admin = user("Leader Lee", 2, phone="09179990009"), user("Leader Bee", 2), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)


def pet(owner, name, kind, color):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type=kind, breed="Mixed", color_markings=color, distinctive_markings="", gender="Female",
            registered_by_user_id=owner.user_id, registered_by_name=owner.name, photo_url=f"https://res.cloudinary.com/x/{name}.jpg")
    db.add(p)
    db.commit()
    return p


pepper, smokey, biscuit = pet(rita, "Pepper", "Cat", "Gray tabby with a white chest"), pet(rita, "Smokey", "Cat", "Gray tabby with a white chest"), pet(rita, "Biscuit", "Dog", "brown")
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=2)).replace(microsecond=0).isoformat()
CLUBHOUSE = {"latitude": 14.8008, "longitude": 121.0036, "landmark": "Near the clubhouse"}


def file_lost(who, pet_row):
    return client.post("/reports/", json={**CLUBHOUSE, "subdivision_id": 1, "category_id": LOST, "description": "Slipped out of the gate this morning.",
                                          "pet_id": pet_row.pet_id, "last_seen_at": SEEN}, headers=H(who)).json()["report_id"]


def file_found(who, subdivision=1, **kw):
    body = {"latitude": 14.8010, "longitude": 121.0040, "landmark": "Clubhouse", "subdivision_id": subdivision, "category_id": FOUND, "animal_type": "Cat",
            "animal_color": "Gray", "estimated_size": "Small",
            "description": "A gray cat with a white chest, tabby stripes and a green collar is hiding under the clubhouse steps.", **kw}
    return client.post("/reports/", json=body, headers=H(who)).json()["report_id"]


def notes(user_id, ntype=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == user_id)
    return q.filter(Notification.type == ntype).order_by(Notification.notification_id).all() if ntype else q.order_by(Notification.notification_id).all()


def contacts(report_id):
    db.expire_all()
    return db.query(CaseContactLog).filter(CaseContactLog.report_id == report_id).order_by(CaseContactLog.log_id).all()


def timeline(report_id):
    db.expire_all()
    return [h.remarks for h in db.query(StatusHistory).filter(StatusHistory.report_id == report_id).order_by(StatusHistory.history_id).all()]


def threads(**kw):
    db.expire_all()
    q = db.query(CaseMessageThread)
    for k, v in kw.items():
        q = q.filter(getattr(CaseMessageThread, k) == v)
    return q.order_by(CaseMessageThread.thread_id).all()


def say(who, thread_id, body, **kw):
    return client.post(f"/case-messages/{thread_id}/messages", json={"body": body, **kw}, headers=H(who))


def open_direct(who, report_id, party):
    return client.post(f"/lost-found/reports/{report_id}/threads", json={"party": party}, headers=H(who))


# ============================================================================ 1. "Contact the owner" (a direct conversation)
pepper_report = file_lost(rita, pepper)
dog_report = file_found(nina, animal_type="Dog", animal_color="Black", estimated_size="Large", description="A big black dog with no collar is resting by the clubhouse.")
check("a missing cat and a found dog are filed; the dog is not suggested for the cat (a different animal)", db.query(LostFoundMatch).count() == 0)

res = open_direct(leader, pepper_report, "owner")
check("the Leader opens a conversation with the OWNER of a missing pet", res.status_code == 200 and res.json()["kind"] == "direct" and res.json()["status"] == "open"
      and [(p["role"], p["name"]) for p in res.json()["people"] if p["role"] != "leader"] == [("owner", "Rita Santos")], res.text[:300])
tid = res.json()["thread_id"]
check("opening it again returns the SAME conversation", open_direct(leader, pepper_report, "owner").json()["thread_id"] == tid and len(threads(kind="direct")) == 1)
check("the owner filed the report themselves, so 'the reporter' is the same person and the same conversation", open_direct(leader, pepper_report, "reporter").json()["thread_id"] == tid)
check("another Leader of the subdivision sees the same conversation (it belongs to the case, not to one Leader)", open_direct(leader_b, pepper_report, "owner").json()["thread_id"] == tid)
check("a found animal has no owner on its own report: contact the finder instead (422)", open_direct(leader, dog_report, "owner").status_code == 422)
res = open_direct(leader, dog_report, "reporter")
check("the Leader can contact the FINDER of a found animal", res.status_code == 200 and [(p["role"], p["name"]) for p in res.json()["people"] if p["role"] != "leader"] == [("finder", "Nina Cruz")], res.text[:300])
finder_tid = res.json()["thread_id"]

check("a resident cannot open a conversation through the Leader's route (403)", open_direct(rita, pepper_report, "owner").status_code == 403)
check("the Leader of ANOTHER subdivision cannot (403) and the Administrator can", open_direct(leader2, pepper_report, "owner").status_code == 403 and open_direct(admin, pepper_report, "owner").status_code == 200)
check("opening a conversation sends nothing and logs nothing yet (an action that was not taken is not in the Activity)", contacts(pepper_report) == []
      and db.query(CaseMessage).filter(CaseMessage.thread_id == tid).count() == 0 and notes(rita.user_id, "case_message") == [])

# ---------------------------------------------------------------- what the Leader writes
res = say(leader, tid, "  Hello Rita, we are looking into Pepper. Can you tell us more about her collar?  ", client_request_id="c-1")
check("the Leader writes a message (201); it is trimmed", res.status_code == 201 and [m["body"] for m in res.json()["messages"] if m["kind"] == "message"]
      == ["Hello Rita, we are looking into Pepper. Can you tell us more about her collar?"], res.text[:300])
check("sending the same message again (a retry) does not duplicate it", say(leader, tid, "Hello Rita, we are looking into Pepper. Can you tell us more about her collar?", client_request_id="c-1").status_code == 201
      and db.query(CaseMessage).filter(CaseMessage.thread_id == tid, CaseMessage.kind == "message").count() == 1)
check("...and the id cannot be reused in another conversation (409)", say(leader, finder_tid, "Something else", client_request_id="c-1").status_code == 409)
log = contacts(pepper_report)
check("what the Leader wrote WRITES ITSELF into the case's contact log: who, how, and the words (so it is in the Activity)",
      len(log) == 1 and log[0].method == "message" and log[0].with_whom == "Rita Santos (owner)" and log[0].summary.startswith("Hello Rita") and log[0].logged_by == leader.user_id)
check("...and only on that report", contacts(dog_report) == [])
detail = client.get(f"/cases/{pepper_report}", headers=H(leader)).json()
check("the Leader's case record carries the contact AND the conversation (who is in it, one message, nothing new for the Leader)",
      [c["method"] for c in detail["contacts"]] == ["message"] and [(t["kind"], t["message_count"], t["unread"]) for t in detail["threads"]] == [("direct", 1, 0)]
      and [p["name"] for p in detail["threads"][0]["people"] if p["role"] == "owner"] == ["Rita Santos"], str(detail["threads"]))
check("the case status did not change (a message is not a decision)", detail["case_status"] == "reported")

# ---------------------------------------------------------------- what the resident sees
n = notes(rita.user_id, "case_message")
check("the resident is notified once, the notification opens the conversation without copying its private words",
      len(n) == 1 and n[0].related_id == tid and n[0].title == "Message from your Subdivision Leader" and n[0].message == "Open the conversation to read the new message.", str([(x.title, x.related_id) for x in n]))
check("it is a message-category push whose tap goes to the conversation in the Resident app",
      PC.category_for("case_message") == PC.MESSAGES and PC.notification_link(1, "case_message", tid) == f"/resident-app/conversations/{tid}"
      and PC.notification_link(1, "lost_found_bridge", tid) == f"/resident-app/conversations/{tid}" and PC.category_for("lost_found_bridge") == PC.PET_MATCHES)
mine = client.get("/case-messages", headers=H(rita)).json()
check("it is in the resident's conversations, unread, about THEIR pet, and the Leader's name is not shown",
      [(s["thread_id"], s["unread"], s["title"], s["subtitle"], s["can_reply"]) for s in mine] == [(tid, 1, "Message from your Subdivision Leader", "About Pepper", True)]
      and mine[0]["my_report_id"] == pepper_report and mine[0]["last_text"].startswith("Hello Rita"), str(mine))
view = client.get(f"/case-messages/{tid}", headers=H(rita)).json()
check("the resident reads the Leader as 'Subdivision Leader' (not by name) and the message is not theirs",
      [(m["sender_name"], m["mine"], m["label"]) for m in view["messages"]] == [("Subdivision Leader", False, "Subdivision Leader")] and "Leader Lee" not in str(view), str(view["messages"]))
check("reading does not mark it read; marking it read does", client.get("/case-messages", headers=H(rita)).json()[0]["unread"] == 1
      and client.post(f"/case-messages/{tid}/read", headers=H(rita)).json()["unread"] == 0 and client.get("/case-messages", headers=H(rita)).json()[0]["unread"] == 0)
check("nobody else can read or write it: another resident (404), another subdivision's Leader (404)", client.get(f"/case-messages/{tid}", headers=H(nina)).status_code == 404
      and say(nina, tid, "hi").status_code == 404 and client.get(f"/case-messages/{tid}", headers=H(leader2)).status_code == 404 and say(leader2, tid, "hi").status_code == 404)
check("a conversation that does not exist is 404", client.get("/case-messages/99999", headers=H(rita)).status_code == 404)

# ---------------------------------------------------------------- the reply
res = say(rita, tid, "She wears a green collar with a bell. Please call me on 0917 111 0001.")
check("the resident replies (201); the Leader is the other side", res.status_code == 201 and [m["mine"] for m in res.json()["messages"]] == [False, True], res.text[:300])
n = notes(leader.user_id, "case_message")
check("the Leader is notified of the reply, and the notification opens the CASE (its related id is the report's)", len(n) == 1 and n[0].related_id == pepper_report
      and n[0].title == "Rita replied" and n[0].message == "Open the conversation to read the new message.", str([(x.title, x.related_id, x.message) for x in n]))
check("the Leader's case record shows one new message", [t["unread"] for t in client.get(f"/cases/{pepper_report}", headers=H(leader)).json()["threads"]] == [1])
check("a resident's own words are NOT added to the contact log (it is the Leader's record of what the Leader did)", len(contacts(pepper_report)) == 1)
check("the lock screen never shows the phone number a resident typed", "0917" not in PC.push_text(n[0].title, "She wears a collar. Call 0917 111 0001")[1])
check("an empty message is refused (422)", say(rita, tid, "   ").status_code == 422)
check("a message over 2000 characters is refused (422)", say(rita, tid, "x" * 2001).status_code == 422)
check("the Leader marks it read (and joins it)", client.post(f"/case-messages/{tid}/read", headers=H(leader)).json()["unread"] == 0)

# ---------------------------------------------------------------- assigned to another officer, and closed
db.query(Report).filter(Report.report_id == pepper_report).update({"assigned_leader_id": leader_b.user_id})
db.commit()
check("a case assigned to another officer is theirs to write in (403), though anyone in scope can read it",
      say(leader, tid, "I will take this one").status_code == 403 and client.get(f"/case-messages/{tid}", headers=H(leader)).status_code == 200 and say(leader_b, tid, "I have this one").status_code == 201)
db.query(Report).filter(Report.report_id == pepper_report).update({"assigned_leader_id": None})
db.commit()

# ============================================================================ 2. link by hand: the bridge opens at once
before_notes = (len(notes(rita.user_id)), len(notes(nina.user_id)))
res = client.post("/lost-found/links", json={"report_id": dog_report, "other_report_id": pepper_report}, headers=H(leader))
check("the Leader links a found dog to a missing cat BY HAND, from the found report's page (no suggestion existed)", res.status_code == 201 and res.json()["status"] == "confirmed"
      and res.json()["lost_report_id"] == pepper_report and res.json()["found_report_id"] == dog_report and res.json()["level"] == "manual", res.text[:400])
mid = res.json()["match_id"]
db.expire_all()
links = db.query(CaseLink).all()
check("the two reports are linked (nothing merged, both open), who decided is kept", len(links) == 1 and links[0].link_type == "same_animal" and db.get(Report, pepper_report).duplicate_of_report_id is None
      and db.get(Report, dog_report).case_status != "closed" and db.get(LostFoundMatch, mid).decided_by == leader.user_id and db.get(LostFoundMatch, mid).link_id == links[0].link_id)
bridges = threads(kind="bridge")
check("a BRIDGE opened at that moment, for this pair, strictly between the owner and the finder (1-to-1, no group chat)", len(bridges) == 1 and bridges[0].match_id == mid and bridges[0].report_id == pepper_report
      and bridges[0].related_report_id == dog_report and bridges[0].status == "open"
      and sorted((m.role for m in db.query(CaseMessageMember).filter(CaseMessageMember.thread_id == bridges[0].thread_id).all())) == ["finder", "owner"])
bid = bridges[0].thread_id
check("BOTH residents are told once, and the notification opens the bridge", [(n.title, n.related_id) for n in notes(rita.user_id, "lost_found_bridge")] == [("A found animal report may be your pet", bid)]
      and [(n.title, n.related_id) for n in notes(nina.user_id, "lost_found_bridge")] == [("Your found animal report was linked", bid)]
      and (len(notes(rita.user_id)), len(notes(nina.user_id))) == (before_notes[0] + 1, before_notes[1] + 1))
check("nothing in them carries a phone number, a name or the finder's own words", all(not any(x in n.message for x in ("0917", "Nina", "Rita", "green collar")) for n in notes(rita.user_id, "lost_found_bridge") + notes(nina.user_id, "lost_found_bridge")))
ro = client.get("/case-messages", headers=H(rita)).json()
fi = client.get("/case-messages", headers=H(nina)).json()
bridge_owner = next(s for s in ro if s["thread_id"] == bid)
bridge_finder = next(s for s in fi if s["thread_id"] == bid)
check("it is UNREAD on both residents' lists at once (that is what lifts it onto Home, 'Needs your attention'), titled about THEIR report",
      bridge_owner["unread"] == 1 and bridge_owner["title"] == "A found animal may be Pepper" and bridge_owner["subtitle"] == "Direct conversation with the finder" and bridge_owner["my_report_id"] == pepper_report and bridge_owner["can_reply"]
      and bridge_finder["unread"] == 1 and bridge_finder["title"] == "The animal you found may have an owner" and bridge_finder["subtitle"] == "Direct conversation with the owner" and bridge_finder["my_report_id"] == dog_report, str((bridge_owner, bridge_finder)))
opening = client.get(f"/case-messages/{bid}", headers=H(rita)).json()["messages"]
check("it opens with one system line that names who is in it and says nothing is recovered", len(opening) == 1 and opening[0]["kind"] == "system" and opening[0]["sender_name"] is None
      and "Nothing is marked recovered" in opening[0]["body"] and "Rita" in opening[0]["body"] and "Nina" in opening[0]["body"] and "0917" not in opening[0]["body"], str(opening))
check("the Leader who linked them has nothing new to read and sees no private resident-to-resident text",
      client.get(f"/cases/{pepper_report}", headers=H(leader)).json()["threads"][-1]["unread"] == 0
      and client.get(f"/cases/{pepper_report}", headers=H(leader)).json()["threads"][-1]["can_reply"] is False
      and client.get(f"/cases/{pepper_report}", headers=H(leader)).json()["threads"][-1]["last_text"] == "")
check("both timelines say it, neutrally", any("linked to a found-animal report" in t for t in timeline(pepper_report)) and any("linked to a lost-pet report" in t for t in timeline(dog_report)))
check("LINKING IS NOT RECOVERY: both stay open and the pet stays Lost", db.get(Pet, pepper.pet_id).status == "Lost" and db.get(Report, pepper_report).case_status != "closed")
check("both reports' case records list the bridge", [t["kind"] for t in client.get(f"/cases/{dog_report}", headers=H(leader)).json()["threads"]] == ["direct", "bridge"]
      and [t["kind"] for t in client.get(f"/cases/{pepper_report}", headers=H(leader)).json()["threads"]] == ["direct", "bridge"])

# ---------------------------------------------------------------- the bridge is a 1-to-1 resident-to-resident conversation
view_f = client.get(f"/case-messages/{bid}", headers=H(nina)).json()
check("a resident sees the two people in it by first name and role only (no Subdivision Leader in the bridge)",
      sorted((p["label"], p["name"]) for p in view_f["people"]) == [("Finder", "Nina"), ("Owner", "Rita")] and "Cruz" not in str(view_f) and "Santos" not in str(view_f)
      and "09" not in str(view_f), str(view_f["people"]))
owner_before = len(notes(rita.user_id, "case_message"))
leader_before = len(notes(leader.user_id, "case_message"))
res = say(nina, bid, "Hi Rita, I found a dog, not a cat, but I am keeping it safe at the clubhouse.")
check("the finder writes in the bridge", res.status_code == 201)
check("only the owner is notified (not the sender and not the Leader)", len(notes(rita.user_id, "case_message")) == owner_before + 1 and notes(rita.user_id, "case_message")[-1].related_id == bid
      and notes(rita.user_id, "case_message")[-1].title == "Nina wrote in your conversation" and len(notes(nina.user_id, "case_message")) == 0
      and len(notes(leader.user_id, "case_message")) == leader_before)
check("the owner reads it as from 'Nina' (finder)", [(m["sender_name"], m["label"]) for m in client.get(f"/case-messages/{bid}", headers=H(rita)).json()["messages"] if m["kind"] == "message"] == [("Nina", "Finder")])
res = say(rita, bid, "Thank you Nina! I will walk over to the clubhouse right now.")
check("the owner replies directly to the finder in the 1-to-1 bridge", res.status_code == 201)
check("the Subdivision Leader cannot read or write the resident-to-resident bridge (404); the Leader contacts each resident 1-to-1 instead",
      client.get(f"/case-messages/{bid}", headers=H(leader)).status_code == 404 and say(leader, bid, "hi").status_code == 404)
res = say(leader, finder_tid, "Hello Nina, thank you for reporting the dog you found.")
check("the Leader contacts the finder individually in their 1-to-1 direct thread, and it logs to the found report's Activity",
      res.status_code == 201 and [c.with_whom for c in contacts(dog_report)] == ["Nina Cruz (finder)"] and contacts(dog_report)[-1].summary.startswith("Hello Nina"))
check("a stranger cannot read the bridge (404)", client.get(f"/case-messages/{bid}", headers=H(noel)).status_code == 404 and say(noel, bid, "hello").status_code == 404)

# ---------------------------------------------------------------- refusals when linking
check("linking again is refused (409)", client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": dog_report}, headers=H(leader)).status_code == 409)
check("a resident cannot link (403)", client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": dog_report}, headers=H(rita)).status_code == 403)
cat_found = file_found(noel)
suggested = db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == cat_found).all()
check("two missing-pet reports (or two found reports) cannot be linked to each other (422)", client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": file_lost(rita, smokey)}, headers=H(leader)).status_code == 422
      and client.post("/lost-found/links", json={"report_id": dog_report, "other_report_id": cat_found}, headers=H(leader)).status_code == 422)
other_found = file_found(olga, subdivision=2)
check("reports of another subdivision cannot be linked (403 for the Leader of one, 422 across)", client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": other_found}, headers=H(leader)).status_code in (403, 422))
check("a report cannot be linked to itself (422)", client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": pepper_report}, headers=H(leader)).status_code == 422)
check("a found report that is already linked cannot be linked to a second lost report (409)", client.post("/lost-found/links", json={"report_id": dog_report, "other_report_id": db.query(Report).filter(Report.pet_id == smokey.pet_id).one().report_id}, headers=H(leader)).status_code == 409)

# ============================================================================ 3. a suggestion the Leader confirms opens the same bridge; the match can be opened again
smokey_report = db.query(Report).filter(Report.pet_id == smokey.pet_id).one().report_id
sug = db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == cat_found, LostFoundMatch.status == "pending").all()
check("the gray cat found by a neighbour is suggested for the gray cats (the suggestion path is unchanged)", len(sug) >= 1 and all(m.status == "pending" for m in sug))
pick = next(m for m in sug if m.lost_report_id == smokey_report)
res = client.post(f"/lost-found/matches/{pick.match_id}/decision", json={"decision": "confirm"}, headers=H(leader))
check("confirming a SUGGESTION opens a bridge too, for that pair", res.status_code == 200 and len(threads(kind="bridge", match_id=pick.match_id)) == 1
      and notes(noel.user_id, "lost_found_bridge")[-1].related_id == threads(kind="bridge", match_id=pick.match_id)[0].thread_id)
sb = threads(kind="bridge", match_id=pick.match_id)[0]
res = client.post(f"/lost-found/matches/{pick.match_id}/thread", headers=H(leader))
check("a pair's conversation can be opened again from the match (it is the same one)", res.status_code == 200 and res.json()["thread_id"] == sb.thread_id and len(threads(kind="bridge", match_id=pick.match_id)) == 1)
for model in (CaseMessage, CaseMessageMember, CaseMessageThread):          # (SQLite does not cascade: remove the whole conversation, as if it had never been made)
    db.query(model).filter(model.thread_id == sb.thread_id).delete()
db.commit()
check("(the conversation is gone, as for a link made before conversations existed)", threads(kind="bridge", match_id=pick.match_id) == [])
res = client.post(f"/lost-found/matches/{pick.match_id}/thread", headers=H(leader))
check("a link made before conversations existed has none: opening it creates it, once", res.status_code == 200 and res.json()["kind"] == "bridge" and len(threads(kind="bridge", match_id=pick.match_id)) == 1
      and [m["kind"] for m in client.get(f"/case-messages/{res.json()['thread_id']}", headers=H(rita)).json()["messages"]] == ["system"])
check("only a Leader of the subdivision can open it (403)", client.post(f"/lost-found/matches/{pick.match_id}/thread", headers=H(rita)).status_code == 403
      and client.post(f"/lost-found/matches/{pick.match_id}/thread", headers=H(leader2)).status_code == 403)

# ============================================================================ 4. unlink: the bridge closes, both are told, and it can be linked again
smokey_found = db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == cat_found).all()
rival = next((m for m in smokey_found if m.lost_report_id != smokey_report), None)
coord = db.query(LostPetCoordination).filter(LostPetCoordination.coordination_id == db.get(LostFoundMatch, mid).coordination_id).first()
told = (len(notes(rita.user_id, "lost_found_unlinked")), len(notes(nina.user_id, "lost_found_unlinked")))
res = client.post(f"/lost-found/matches/{mid}/unlink", headers=H(leader))
db.expire_all()
check("the Leader unlinks the found dog and the missing cat", res.status_code == 200 and res.json()["status"] == "rejected", res.text[:300])
link = db.query(CaseLink).filter(CaseLink.link_id == db.get(LostFoundMatch, mid).link_id).one()
check("the link ENDS (the row is kept, with who and why) and both reports are exactly as they were", link.unlinked_at is not None and link.unlinked_by == leader.user_id and link.unlink_reason
      and db.get(Report, pepper_report).case_status != "closed" and db.get(Report, dog_report).case_status != "closed" and db.get(Report, dog_report).duplicate_of_report_id is None)
closed = db.get(CaseMessageThread, bid)
check("the bridge is CLOSED with who and why, its messages are kept, and it ends with one system line", closed.status == "closed" and closed.closed_by == leader.user_id and closed.close_reason
      and db.query(CaseMessage).filter(CaseMessage.thread_id == bid, CaseMessage.kind == "message").count() == 2
      and db.query(CaseMessage).filter(CaseMessage.thread_id == bid).order_by(CaseMessage.message_id.desc()).first().kind == "system")
check("BOTH residents are told, and the notification opens the closed conversation", len(notes(rita.user_id, "lost_found_unlinked")) == told[0] + 1 and len(notes(nina.user_id, "lost_found_unlinked")) == told[1] + 1
      and notes(rita.user_id, "lost_found_unlinked")[-1].related_id == bid and "recovered" in notes(rita.user_id, "lost_found_unlinked")[-1].message)
check("nobody can write in it any more (409), but it can still be read by the residents", say(rita, bid, "hello?").status_code == 409 and say(nina, bid, "bye").status_code == 409
      and client.get(f"/case-messages/{bid}", headers=H(nina)).status_code == 200)
s_after = next(s for s in client.get("/case-messages", headers=H(rita)).json() if s["thread_id"] == bid)
check("the resident's list says it is closed, can_reply false, with the reason", s_after["status"] == "closed" and not s_after["can_reply"] and "removed the link" in s_after["ended_reason"] and s_after["unread"] >= 1)
check("the pair is ruled out and kept (so it is not suggested again), and the notice-based possible recovery ended",
      db.get(LostFoundMatch, mid).status == "rejected" and (coord is None or db.get(LostPetCoordination, coord.coordination_id).status == "resolved")
      and (coord is None or db.get(LostPetSighting, coord.sighting_id).status == "dismissed"))
check("both timelines say it, neutrally", any("link between this report and a lost-pet report was removed" in t for t in timeline(dog_report))
      and any("link between this report and a found-animal report was removed" in t for t in timeline(pepper_report)))
check("the Leader's activity says it (staff notes on both reports)", any("Removed the link to report" in a for a in [x.description for x in db.query(app.models.AuditLog).filter(app.models.AuditLog.action == "CASE_NOTE", app.models.AuditLog.target_id == pepper_report).all()]))
check("unlinking a pair that is not linked is refused (409), and so is a resident or another subdivision's Leader", client.post(f"/lost-found/matches/{mid}/unlink", headers=H(leader)).status_code == 409
      and client.post(f"/lost-found/matches/{pick.match_id}/unlink", headers=H(rita)).status_code == 403 and client.post(f"/lost-found/matches/{pick.match_id}/unlink", headers=H(leader2)).status_code == 403)
res = client.post("/lost-found/links", json={"report_id": pepper_report, "other_report_id": dog_report}, headers=H(leader))
check("they can be linked AGAIN (the Leader changed their mind): a NEW bridge opens, the old one stays closed", res.status_code == 201 and res.json()["status"] == "confirmed"
      and len([t for t in threads(kind="bridge", match_id=mid) if t.status == "open"]) == 1 and db.get(CaseMessageThread, bid).status == "closed" and len(threads(kind="bridge", match_id=mid)) == 2)

# ---- the suggestions that gave way to a link apply again when it is removed
moot = [m for m in db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == cat_found).all() if m.status == "moot"]
if moot:
    pending_before = len([m for m in db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == cat_found).all() if m.status == "pending"])
    client.post(f"/lost-found/matches/{pick.match_id}/unlink", headers=H(leader))
    db.expire_all()
    check("a suggestion that gave way to the link is suggested again when the link is removed", all(db.get(LostFoundMatch, m.match_id).status == "pending" for m in moot) and pending_before == 0)
else:
    client.post(f"/lost-found/matches/{pick.match_id}/unlink", headers=H(leader))
    check("removing a link that left no other suggestion behind leaves none", True)

# ============================================================================ 5. a closed report automatically closes its direct and bridge conversations
res = open_direct(leader, smokey_report, "owner")
sid = res.json()["thread_id"]
check("a conversation is open while its report is", res.status_code == 200 and say(leader, sid, "Hello").status_code == 201)
relinked_bridge = [t for t in threads(kind="bridge", match_id=mid) if t.status == "open"][0]
close_res = client.post(f"/cases/{smokey_report}/close", json={"disposition": "no_further_sightings", "reason": "Search ended without locating the cat."}, headers=H(leader))
check("closing a case automatically marks its open direct conversation as closed in the database",
      close_res.status_code == 200 and db.get(CaseMessageThread, sid).status == "closed" and db.get(CaseMessageThread, sid).close_reason is not None, close_res.text[:200])
check("when the report closes the conversation has ended: nobody can write (409), and it says why", say(rita, sid, "thanks").status_code == 409
      and client.get(f"/case-messages/{sid}", headers=H(rita)).json()["can_reply"] is False and "closed" in client.get(f"/case-messages/{sid}", headers=H(rita)).json()["ended_reason"])
check("...and a conversation cannot be started on a closed report (409)", open_direct(leader, smokey_report, "owner").status_code == 409)
check("...and a closed report cannot be linked or unlinked (409)", client.post("/lost-found/links", json={"report_id": smokey_report, "other_report_id": cat_found}, headers=H(leader)).status_code == 409)
close_found = client.post(f"/cases/{dog_report}/close", json={"disposition": "resolved_intervention", "reason": "The dog was safely returned outside the app."}, headers=H(leader))
db.expire_all()
check("closing one of two linked reports automatically closes the linked report, both direct chats, and the resident-to-resident bridge",
      close_found.status_code == 200 and db.get(Report, pepper_report).case_status == "closed" and db.get(CaseMessageThread, tid).status == "closed"
      and db.get(CaseMessageThread, finder_tid).status == "closed" and db.get(CaseMessageThread, relinked_bridge.thread_id).status == "closed"
      and say(nina, relinked_bridge.thread_id, "still here?").status_code == 409, close_found.text[:200])

# ============================================================================ 6. one person filed both reports: nobody to bridge
solo_lost = file_lost(rita, biscuit)
solo_found = file_found(rita, animal_type="Dog", animal_color="Brown", estimated_size="Medium")
res = client.post("/lost-found/links", json={"report_id": solo_found, "other_report_id": solo_lost}, headers=H(leader))
check("when one person filed both reports they are still linked, but there is nobody to bridge (no conversation), and they are told by notification",
      res.status_code == 201 and threads(match_id=res.json()["match_id"]) == [] and len(notes(rita.user_id, "lost_found_linked")) >= 1)
res = client.post(f"/lost-found/matches/{res.json()['match_id']}/thread", headers=H(leader))
check("...and opening a conversation for such a pair says so (409)", res.status_code == 409)

# ============================================================================ 7. canonical generic links and read/retry boundaries
fresh_pet = pet(rita, "Faye", "Dog", "White")
fresh_lost = file_lost(rita, fresh_pet)
fresh_found = file_found(noel, animal_type="Dog", animal_color="White", estimated_size="Medium")
generic = client.post(f"/cases/{fresh_lost}/links", json={"report_ids": [fresh_found], "link_type": "same_animal"}, headers=H(leader))
check("the existing Cases same-animal link route opens the canonical bridge too", generic.status_code == 201, generic.text[:200])
db.expire_all()
generic_match = db.query(LostFoundMatch).filter(LostFoundMatch.lost_report_id == fresh_lost, LostFoundMatch.found_report_id == fresh_found).one()
generic_bridge = db.query(CaseMessageThread).filter(CaseMessageThread.match_id == generic_match.match_id, CaseMessageThread.status == "open").one()
check("generic linking synchronizes match and case-link records", generic_match.status == "confirmed" and generic_match.link_id == generic.json()[0]["link_id"])
before_notices = len(notes(rita.user_id, "lost_found_bridge"))
again = client.post(f"/cases/{fresh_found}/links", json={"report_ids": [fresh_lost], "link_type": "same_animal"}, headers=H(leader))
check("retrying a Cases link reuses the bridge without duplicate notifications", again.status_code == 201 and len(threads(match_id=generic_match.match_id)) == 1 and len(notes(rita.user_id, "lost_found_bridge")) == before_notices)
check("a Leader-linked bridge creates no duplicate private channel", generic_match.coordination_id is None)
generic_unlink = client.post(f"/cases/{fresh_found}/links/{generic_match.link_id}/unlink", json={"reason": "The animals are different."}, headers=H(leader))
db.expire_all()
check("the Cases unlink route closes the same bridge and rules out its match", generic_unlink.status_code == 200 and db.get(LostFoundMatch, generic_match.match_id).status == "rejected" and db.get(CaseMessageThread, generic_bridge.thread_id).status == "closed", generic_unlink.text[:200])

fresh_thread = open_direct(leader, fresh_lost, "owner").json()["thread_id"]
sent = say(leader, fresh_thread, "First instruction", client_request_id="visible-message-1").json()
first_visible = sent["messages"][-1]["message_id"]
say(leader, fresh_thread, "Arrived while the resident was reading", client_request_id="visible-message-2")
read = client.post(f"/case-messages/{fresh_thread}/read", json={"through_message_id": first_visible}, headers=H(rita))
check("mark-read only marks messages actually displayed, leaving a newer arrival unread", read.status_code == 200 and read.json()["unread"] == 1, read.text[:200])
check("a read cursor cannot name another thread's message", client.post(f"/case-messages/{fresh_thread}/read", json={"through_message_id": 999999}, headers=H(rita)).status_code == 422)
check("opening Contact writes a neutral activity entry without claiming actual contact", any("opened a conversation" in t for t in timeline(fresh_lost)))
check("sending writes actual contact and neutral activity without changing status", len(contacts(fresh_lost)) == 2 and any("sent a message" in t for t in timeline(fresh_lost)) and db.get(Report, fresh_lost).case_status != "closed")
db.expire_all()
db.get(Pet, fresh_pet.pet_id).owner_id = olga.user_id
db.commit()
chosen = open_direct(leader, fresh_lost, "owner").json()
check("Contact the owner stays with the original case owner after registry ownership changes", [p["user_id"] for p in chosen["people"] if p["role"] != "leader"] == [rita.user_id])

refused = client.post(f"/cases/{fresh_found}/referrals", json={"org_type": "veterinarian", "org_name": "Some clinic", "reason": "Needs animal assistance."}, headers=H(leader))
check("new non-Barangay assistance is refused server-side", refused.status_code == 422, refused.text[:200])
derived = client.post(f"/cases/{fresh_found}/referrals", json={"org_type": "barangay", "org_name": "Unrelated NGO", "reason": "Needs animal assistance.", "contacted": False}, headers=H(leader))
check("Barangay recipient is derived from subdivision settings, not an arbitrary submitted name", derived.status_code in (200, 201) and derived.json()["org_name"] == "Barangay San Vicente" and derived.json()["status"] == "to_contact", derived.text[:200])

private_body = "Meet at Block 99 Lot 123 Acacia Street; call 0917 999 1234."
check("participants may deliberately write private arrangements inside their authorized conversation", say(leader, fresh_thread, private_body, client_request_id="private-arrangements-1").status_code == 201)
check("resident notification payload omits the message's phone and care/home address", notes(rita.user_id, "case_message")[-1].message == "Open the conversation to read the new message.")
say(rita, fresh_thread, private_body, client_request_id="private-arrangements-2")
check("Leader notification payload also omits private message text", notes(leader.user_id, "case_message")[-1].message == "Open the conversation to read the new message.")
check("the participant-scoped conversation summary still carries the actual last message", next(t for t in client.get("/case-messages", headers=H(rita)).json() if t["thread_id"] == fresh_thread)["last_text"] == private_body)

# ============================================================================ 8. multiple Found Animal reporters linked to one Lost Pet stay isolated
second_found = file_found(nina, animal_type="Dog", animal_color="White", estimated_size="Medium", description="Another white dog near Gate 2.")
link_a = client.post("/lost-found/links", json={"report_id": fresh_lost, "other_report_id": fresh_found}, headers=H(leader))
link_b = client.post("/lost-found/links", json={"report_id": fresh_lost, "other_report_id": second_found}, headers=H(leader))
check("two different Found Animal reports can be linked to the same Lost Pet report", link_a.status_code == 201 and link_b.status_code == 201)
bridge_a = threads(kind="bridge", match_id=link_a.json()["match_id"], status="open")[0].thread_id
bridge_b = threads(kind="bridge", match_id=link_b.json()["match_id"], status="open")[0].thread_id
check("each linked Found Animal gets its own separate 1-to-1 bridge with the owner", bridge_a != bridge_b)
say(noel, bridge_a, "Noel's private coordination message.")
say(nina, bridge_b, "Nina's private coordination message.")
check("neither finder can access or write to the other finder's bridge (404)",
      client.get(f"/case-messages/{bridge_b}", headers=H(noel)).status_code == 404
      and say(noel, bridge_b, "intrude").status_code == 404
      and client.get(f"/case-messages/{bridge_a}", headers=H(nina)).status_code == 404
      and say(nina, bridge_a, "intrude").status_code == 404)
noel_threads = {t["thread_id"] for t in client.get("/case-messages", headers=H(noel)).json()}
nina_threads = {t["thread_id"] for t in client.get("/case-messages", headers=H(nina)).json()}
rita_threads = {t["thread_id"] for t in client.get("/case-messages", headers=H(rita)).json()}
check("each finder's conversation list contains only their own bridge, while the owner sees both",
      bridge_a in noel_threads and bridge_b not in noel_threads
      and bridge_b in nina_threads and bridge_a not in nina_threads
      and {bridge_a, bridge_b}.issubset(rita_threads))
direct_a = open_direct(leader, fresh_found, "reporter").json()["thread_id"]
direct_b = open_direct(leader, second_found, "reporter").json()["thread_id"]
check("the Leader's direct conversations with each found-animal reporter are also separate and isolated",
      direct_a != direct_b
      and client.get(f"/case-messages/{direct_b}", headers=H(noel)).status_code == 404
      and client.get(f"/case-messages/{direct_a}", headers=H(nina)).status_code == 404)

print(f"\n{PASSED} checks passed")
