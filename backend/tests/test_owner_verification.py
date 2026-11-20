"""
Possible Pet Owner Verification (services/owner_verification.py, routes/owner_verification.py, docs/01-system/POSSIBLE_OWNER_VERIFICATION.md):

  - the Possible Pet Owners section lists the registered pets the matching linked to a report (owner, pet, what matched, score only when the
    matcher made one), only inside the Leader's data scope; residents and other subdivisions are refused; a lost-pet report has none
  - Contact Possible Owner: the existing owner-first request (Awaiting Owner Response) + an existing case conversation tied to the report,
    the Leader's edited message, the owner notified; a repeat is idempotent; the reporter is never shown to the possible owner
  - follow-ups are counted and dated; Unable to Contact ends the request without an answer and never decides anything
  - the owner's YES goes into the conversation and unlocks the final verification; a NO marks "Ownership Not Confirmed" and other possible
    owners can still be contacted; no final decision before a YES; the final decision is told to the owner; ownership records never change
  - every step is in the request's history and in the audit log; the start-up step adds the new columns to an older table
Offline: a throwaway SQLite file, never app.main and never the configured database.
Run from the backend folder:  python tests/test_owner_verification.py
"""
import os
import sys
import tempfile
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "owner_verification.db")
os.environ.setdefault("JWT_SECRET_KEY", "owner-verification-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import ensure_pet_match_confirmation_columns, run_case_alignment  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.case_messaging import CaseMessage, CaseMessageMember, CaseMessageThread  # noqa: E402
from app.models.case_records import CaseContactLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_match_confirmation import PetMatchConfirmationRequest  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import case_messages, manual_matching, matches, owner_verification, pet_match_confirmations  # noqa: E402
from app.utils import push_categories as PC  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

os.environ.pop("GEMINI_API_KEY", None)
Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (owner_verification.router, case_messages.router, manual_matching.router, matches.router, pet_match_confirmations.router):
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
db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="attribute_only", is_enabled=False))
db.commit()


def user(name, role, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@verify.test", password="x", role_id=role, phone="09170000000",
             is_verified=True, status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


reporter = user("Rhea Reporter", 1)
owner, owner2, far_owner = user("Olive Owner", 1), user("Paolo Pina", 1), user("Far Owner", 1, subdivision=2)
leader, leader_b, leader_far = user("Leader Lee", 2), user("Leader Bea", 2), user("Leader Far", 2, subdivision=2)
admin = user("Admin Ada", 4, subdivision=None)
CATS = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}
STRAY = next(cid for name, cid in CATS.items() if "Stray" in name or "Found" in name)
LOST = next(cid for name, cid in CATS.items() if "Lost" in name)


def report(cat=STRAY, **kw):
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=cat, current_status_id=2, assigned_leader_id=leader.user_id,
               animal_type="Dog", animal_breed="Aspin", animal_color="Brown and white", estimated_size="Medium",
               latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2",
               description="Seen by Rhea Reporter at 09171112222, near her house.", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def pet(o, name, **kw):
    p = Pet(owner_id=o.user_id, pet_name=name, pet_type="Dog", status="Lost", breed="Aspin", color_markings="Brown with white chest",
            photo_front_url=f"https://img.test/{name}.jpg", registered_address="Blk 4 Lot 9, Selera Homes", **kw)
    db.add(p)
    db.commit()
    return p.pet_id


ANALYSIS = {"algorithm": "multi-attribute-v1", "score": 82, "coverage": 80, "classification": "strong",
            "classification_label": "Strong Possible Match", "attributes_compared": 4, "attributes_total": 5,
            "attributes": {"location": {"label": "Location", "score": 85, "available": True, "explanation": "Nearby: approximately 300 m."},
                           "breed": {"label": "Breed", "score": 100, "available": True, "explanation": "Strong breed match: both records say Aspin."},
                           "visual": {"label": "Visual similarity", "score": None, "available": False, "explanation": "No photo comparison."}}}


def suggest(rid, pid, evidence=None, score=82, status="AI_SUGGESTED"):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pid, similarity_score=score, status=status, owner_confirmation_status="PENDING",
                    ai_explanation="Strong Possible Match: 82% overall.", ai_evidence=evidence if evidence is not None else {"multi_attribute": ANALYSIS})
    db.add(m)
    db.commit()
    return m.match_id


def notes(u, ntype=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == u.user_id)
    if ntype:
        q = q.filter(Notification.type == ntype)
    return q.order_by(Notification.notification_id).all()


def audits(action):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).all()


def section(rid, who=leader):
    return client.get(f"/owner-verification/reports/{rid}", headers=H(who))


def cand(body, pid):
    return next((c for c in body["candidates"] if c["pet_id"] == pid), None)


bantay, puti, far_pet = pet(owner, "Bantay"), pet(owner2, "Puti"), pet(far_owner, "Malayo")
rep = report()
suggest(rep, bantay)
suggest(rep, far_pet)

# ------------------------------------------------------------------------------------------------------ the section
check("a resident cannot open the Possible Pet Owners section", section(rep, owner).status_code == 403)
check("a Leader of another subdivision cannot open it", section(rep, leader_far).status_code in (403, 404))
res = section(rep)
body = res.json()
check("the Leader of the subdivision sees it", res.status_code == 200 and body["applicable"] and body["can_contact"], res.text[:300])
c = cand(body, bantay)
check("a possible owner shows the resident, the pet, species, breed, colour and registered address",
      c is not None and c["resident"]["name"] == "Olive Owner" and c["pet"]["name"] == "Bantay" and c["pet"]["species"] == "Dog"
      and c["pet"]["breed"] == "Aspin" and "Brown" in c["pet"]["colour"] and c["registered_address"].startswith("Blk 4"), str(c)[:400])
check("the matching attributes and classification come from the existing matcher",
      c["matching"]["score"] == 82 and c["matching"]["classification_label"] == "Strong Possible Match"
      and [a["label"] for a in c["matching"]["attributes"]] == ["Visual similarity", "Location", "Breed"])
check("its status is Possible Owner Identified and it can be contacted",
      c["status"] == "identified" and c["status_label"] == "Possible Owner Identified" and c["actions"]["contact"] and not c["actions"]["finalize"])
check("a pet outside the Leader's data scope (another subdivision's registry) is not shown", cand(body, far_pet) is None)
check("the editable template names the subdivision administration",
      body["template"].startswith("Hello! This is the Selera Homes Subdivision Administration. We received a report involving an animal")
      and body["template"].endswith("Thank you for your cooperation."))
check("the reported-animal summary never carries the reporter", "Rhea" not in str(body["animal"]) and "0917" not in str(body["animal"]))
lost = report(cat=LOST)
check("a lost-pet report has no possible owners to verify", section(lost).json()["applicable"] is False)

# ------------------------------------------------------------------------------------------------------ contact
msg = body["template"] + "\n\nThe dog was seen near Gate 2 with a red collar."
check("a resident cannot contact a possible owner",
      client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": msg}, headers=H(owner)).status_code == 403)
check("a Leader who is not the assigned officer cannot",
      client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": msg}, headers=H(leader_b)).status_code == 403)
check("an empty message is refused", client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": "  "},
                                                 headers=H(leader)).status_code == 422)
res = client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": msg, "client_request_id": "ov-1"}, headers=H(leader))
check("Contact Possible Owner creates the verification", res.status_code == 201, res.text[:400])
c = cand(res.json(), bantay)
rq = c["request"]
check("the status becomes Awaiting Owner Response", c["status"] == "awaiting" and c["status_label"] == "Awaiting Owner Response"
      and rq["raw_status"] == "AWAITING_OWNER_CONFIRMATION" and rq["requested_by_name"] == "Leader Lee")
again = client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": msg, "client_request_id": "ov-1"}, headers=H(leader))
check("a repeated submission returns the same request", again.status_code == 201 and again.json()["request_id"] == rq["request_id"]
      and db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.pet_id == bantay).count() == 1)
check("a second request for the same pet while one is waiting is refused",
      client.post(f"/owner-verification/reports/{rep}/contact", json={"pet_id": bantay, "message": msg}, headers=H(leader)).status_code == 409)

db.expire_all()
req = db.get(PetMatchConfirmationRequest, rq["request_id"])
t = db.get(CaseMessageThread, req.thread_id)
check("the conversation is an existing case conversation tied to the report, the owner and the pet's request",
      t is not None and t.kind == "direct" and t.report_id == rep and t.subject.startswith("Ownership verification: Report SS-")
      and req.pet_id == bantay and req.owner_id == owner.user_id)
roles = {m.user_id: m.role for m in db.query(CaseMessageMember).filter(CaseMessageMember.thread_id == t.thread_id)}
check("its members are the possible owner (role pet_owner, no report of their own) and the Leader",
      roles == {owner.user_id: "pet_owner", leader.user_id: "leader"}
      and db.query(CaseMessageMember).filter(CaseMessageMember.user_id == owner.user_id).one().report_id is None)
rows = db.query(CaseMessage).filter(CaseMessage.thread_id == t.thread_id).order_by(CaseMessage.message_id).all()
check("it opens with the reported animal's description, then the Leader's edited message",
      rows[0].kind == "system" and "Dog · Aspin · Brown and white · Medium size" in rows[0].body and "Bantay" in rows[0].body
      and rows[1].sender_id == leader.user_id and rows[1].body.startswith(msg.strip())
      and rows[1].body.endswith(f"/resident-app/ownership/{req.request_id}"))
check("nothing the possible owner reads names the reporter", all("Rhea" not in r.body and "0917" not in r.body for r in rows))
n = notes(owner, "ownership_verification")
check("the possible owner is notified once, about the verification, linking to the verification page",
      len(n) == 1 and n[0].related_id == req.request_id and n[0].title.startswith("Ownership verification request: Bantay")
      and not notes(owner, "case_message"), str([x.title for x in n]))
page = client.get(f"/pet-match-confirmations/{req.request_id}/verification", headers=H(owner))
check("the verification page shows the reported animal and the owner's pet side by side, with Confirm / Decline open",
      page.status_code == 200 and page.json()["can_answer"] and page.json()["your_pet"]["pet_id"] == bantay
      and page.json()["reported_animal"]["reference"] and "Rhea" not in page.text, page.text[:300])
check("only the intended owner can open the verification page",
      client.get(f"/pet-match-confirmations/{req.request_id}/verification", headers=H(leader)).status_code == 404)
check("the message is logged as a contact in the case's activity",
      db.query(CaseContactLog).filter(CaseContactLog.report_id == rep, CaseContactLog.method == "message").count() == 1)
check("the history records identified, requested and contacted, with who and when",
      [e["kind"] for e in req.events] == ["identified", "requested", "contacted"] and req.events[2]["by_name"] == "Leader Lee"
      and req.events[2]["thread_id"] == t.thread_id and req.events[0]["match_id"])
check("the audit log has the identification and the contact (who, when, which message)",
      len(audits("POSSIBLE_OWNER_IDENTIFIED")) == 1 and len(audits("POSSIBLE_OWNER_CONTACTED")) == 1
      and audits("POSSIBLE_OWNER_CONTACTED")[0].user_id == leader.user_id and audits("POSSIBLE_OWNER_CONTACTED")[0].new_values["message_id"])
check("the conversation is in the Leader's Messages inbox",
      any(i["thread_id"] == t.thread_id for i in client.get("/case-messages/inbox", headers=H(leader)).json()["items"]))

# ------------------------------------------------------------------------------------------------------ the owner's side
view = client.get(f"/case-messages/{t.thread_id}", headers=H(owner))
v = view.json()
check("the possible owner opens the conversation", view.status_code == 200 and v["title"].startswith("Ownership verification")
      and v["subtitle"] == "Ownership verification with the Subdivision Administration", view.text[:300])
ver = v["verification"]
check("it carries the question, the reported animal and their own pet, with Yes/No available",
      ver["can_answer"] and ver["question"] and ver["reported_animal"]["breed"] == "Aspin" and ver["your_pet"]["pet_name"] == "Bantay"
      and ver["status_label"] == "Awaiting Owner Response")
check("the reporter's free text and identity are not in what the possible owner receives",
      "Rhea" not in view.text and "09171112222" not in view.text and "description" not in ver["reported_animal"])
check("the Leader is shown as Subdivision Leader to the owner", any(p["name"] == "Subdivision Leader" for p in v["people"]))
check("the reporter cannot open the verification conversation", client.get(f"/case-messages/{t.thread_id}", headers=H(reporter)).status_code == 404)
check("another resident cannot answer the request",
      client.post(f"/pet-match-confirmations/{req.request_id}/respond", json={"answer": "YES"}, headers=H(owner2)).status_code == 403)

# ------------------------------------------------------------------------------------------------------ follow-up / no answer
check("a resident cannot send a follow-up",
      client.post(f"/owner-verification/requests/{req.request_id}/follow-up", json={"message": "x"}, headers=H(owner)).status_code == 403)
res = client.post(f"/owner-verification/requests/{req.request_id}/follow-up", json={"message": "Just checking in about the dog near Gate 2."}, headers=H(leader))
c = cand(res.json(), bantay)
check("a follow-up is sent while there is no answer, counted and dated", res.status_code == 200 and c["request"]["follow_up_count"] == 1
      and c["request"]["last_follow_up_at"] and c["status"] == "awaiting", res.text[:300])
check("no answer never changes the status: still Awaiting Owner Response", c["status_label"] == "Awaiting Owner Response")
n = notes(owner, "ownership_verification")
check("the owner's notification says it is a follow-up (one unread, refreshed)", len(n) == 1 and n[0].title == "Follow-up: ownership verification")
check("the follow-up is in the history and the audit log", c["request"]["events"][-1]["kind"] == "follow_up"
      and c["request"]["events"][-1]["attempt"] == 1 and len(audits("OWNER_VERIFICATION_FOLLOW_UP")) == 1)
fin = client.post("/manual-matching/decisions", json={"report_a_id": rep, "pet_id": bantay, "decision": "CONFIRMED_MATCH", "notes": "Looks like it"},
                  headers=H(leader))
check("no final verification before the owner answers", fin.status_code == 409, fin.text[:200])

# ------------------------------------------------------------------------------------------------------ the owner replies, then confirms
client.post(f"/case-messages/{t.thread_id}/messages", json={"body": "He has a scar on his left ear."}, headers=H(owner))
check("an ordinary reply notifies the Leader (Messages)", len(notes(leader, "resident_message")) == 1)
res = client.post(f"/pet-match-confirmations/{req.request_id}/respond", json={"answer": "YES", "note": "Scar on the left ear."}, headers=H(owner))
check("the owner confirms ownership", res.status_code == 200, res.text[:300])
db.expire_all()
req = db.get(PetMatchConfirmationRequest, req.request_id)
last = db.query(CaseMessage).filter(CaseMessage.thread_id == t.thread_id).order_by(CaseMessage.message_id.desc()).first()
check("the confirmation is recorded and written into the conversation", req.status == "OWNER_CONFIRMED" and req.owner_response == "YES"
      and last.sender_id == owner.user_id and last.body.startswith("Yes, this is my pet Bantay."))
n = notes(leader, "owner_verification")
check("the Leader is notified that the owner confirmed, linking to the case",
      len(n) == 1 and n[0].related_id == rep and n[0].title.startswith("Owner confirmed ownership")
      and PC.notification_link(2, "owner_verification", rep) == f"/cases/{rep}" and PC.category_for("owner_verification"))
check("the older 'Manual Matching' notification is not sent as well", notes(leader, "pet_match_confirmation_result") == [])
c = cand(section(rep).json(), bantay)
check("the status is Owner Confirmed – Pending Verification and only now can it be finalized",
      c["status_label"] == "Owner Confirmed – Pending Verification" and c["actions"]["finalize"] and c["request"]["owner_note"] == "Scar on the left ear.")
check("the owner can no longer answer", client.get(f"/case-messages/{t.thread_id}", headers=H(owner)).json()["verification"]["can_answer"] is False)
check("the answer is audited", len(audits("OWNER_VERIFICATION_RESPONSE")) == 1)

fin = client.post("/manual-matching/decisions", json={"report_a_id": rep, "pet_id": bantay, "decision": "CONFIRMED_MATCH",
                                                      "notes": "Scar on the left ear matches the registry photo."}, headers=H(leader))
check("the Leader makes the final verification", fin.status_code == 200, fin.text[:400])
db.expire_all()
req = db.get(PetMatchConfirmationRequest, req.request_id)
c = cand(section(rep).json(), bantay)
check("the status is Ownership Verified, with who decided", c["status_label"] == "Ownership Verified" and c["request"]["final_by_name"] == "Leader Lee"
      and c["request"]["events"][-1]["kind"] == "final_decision")
check("the owner is told in the conversation and by notification",
      db.query(CaseMessage).filter(CaseMessage.thread_id == t.thread_id, CaseMessage.kind == "system",
                                   CaseMessage.body.like("%verified that the reported animal is your registered pet Bantay%")).count() == 1
      and notes(owner, "case_message")[-1].title == "Update on your ownership verification")
check("the final decision is audited with the administrator responsible",
      len(audits("OWNER_VERIFICATION_DECIDED")) == 1 and audits("OWNER_VERIFICATION_DECIDED")[0].user_id == leader.user_id)
check("the registry's ownership never changes", db.get(Pet, bantay).owner_id == owner.user_id)

# ------------------------------------------------------------------------------------------------------ a NO, then other possible owners
rep2 = report()
suggest(rep2, bantay)
suggest(rep2, puti, evidence={"engine": "manual", "created_by": leader.user_id}, score=0, status="PENDING_VERIFICATION")
body = section(rep2).json()
check("a staff-identified (manual) candidate shows no score", cand(body, puti)["matching"]["method"] == "manual" and cand(body, puti)["matching"]["score"] is None)
res = client.post(f"/owner-verification/reports/{rep2}/contact", json={"pet_id": bantay, "message": "Is this your dog?"}, headers=H(leader))
r2 = cand(res.json(), bantay)["request"]
res = client.post(f"/pet-match-confirmations/{r2['request_id']}/respond", json={"answer": "NO"}, headers=H(owner))
check("the owner denies ownership", res.status_code == 200)
body = section(rep2).json()
c = cand(body, bantay)
check("a decline is evidence only: Owner Declined – Pending Admin Review, the denial is kept",
      c["status_label"] == "Owner Declined – Pending Admin Review" and c["actions"]["finalize"] and c["request"]["owner_response"] == "NO"
      and c["request"]["events"][-1]["kind"] == "owner_denied" and not c["actions"]["contact"])
check("the Leader is told the owner denied it", notes(leader, "owner_verification")[-1].title.startswith("Owner declined ownership"))
check("other possible owners can still be contacted", cand(body, puti)["actions"]["contact"])
check("a decline never decides ownership by itself: the report is not linked and its ownership is under review",
      db.get(Report, rep2).pet_id != bantay and db.get(Report, rep2).ownership_status == "under_review")

res = client.post(f"/owner-verification/reports/{rep2}/contact", json={"pet_id": puti, "message": "Hello, is this your dog Puti?"}, headers=H(leader))
r3 = cand(res.json(), puti)["request"]
check("a short reason for Unable to Contact is refused",
      client.post(f"/owner-verification/requests/{r3['request_id']}/unable-to-contact", json={"note": "no"}, headers=H(leader)).status_code == 422)
res = client.post(f"/owner-verification/requests/{r3['request_id']}/unable-to-contact",
                  json={"note": "Two follow-ups and a house visit, nobody home."}, headers=H(leader))
c = cand(res.json(), puti)
check("Unable to Contact is recorded, with the reason", res.status_code == 200 and c["status_label"] == "Unable to Contact"
      and c["request"]["events"][-1]["kind"] == "unable_to_contact" and len(audits("OWNER_VERIFICATION_UNABLE_TO_CONTACT")) == 1)
check("it decides nothing: no final verification is possible",
      client.post("/manual-matching/decisions", json={"report_a_id": rep2, "pet_id": puti, "decision": "CONFIRMED_MATCH", "notes": "silence"},
                  headers=H(leader)).status_code == 409)
check("the possible owner can be contacted again later", c["actions"]["contact"])
res = client.post(f"/owner-verification/reports/{rep2}/contact", json={"pet_id": puti, "message": "Trying again: is this Puti?"}, headers=H(leader))
c = cand(res.json(), puti)
check("contacting again continues the same open conversation, and keeps the earlier request",
      res.status_code == 201 and c["request"]["thread_id"] == r3["thread_id"] and c["status"] == "awaiting"
      and len(c["earlier_requests"]) == 1 and c["earlier_requests"][0]["raw_status"] == "UNABLE_TO_CONTACT", res.text[:300])

# ------------------------------------------------------------------------------------------------------ closed case
rr = db.get(Report, rep2)
rr.current_status_id = 9
rr.case_status = "closed"
db.commit()
res = client.post(f"/owner-verification/requests/{c['request']['request_id']}/follow-up", json={"message": "Still there?"}, headers=H(leader))
check("a closed case refuses follow-ups", res.status_code == 409, res.text[:200])
check("and says why in the section", section(rep2).json()["can_contact"] is False)

# ------------------------------------------------------------------------------------------------------ start-up columns
old = create_engine("sqlite:///" + os.path.join(tempfile.mkdtemp(), "old.db"))
with old.begin() as conn:
    conn.execute(text("CREATE TABLE pet_match_confirmation_requests (request_id INTEGER PRIMARY KEY, status VARCHAR(40))"))
    first = ensure_pet_match_confirmation_columns(conn)
    second = ensure_pet_match_confirmation_columns(conn)
cols = {c["name"] for c in inspect(old).get_columns("pet_match_confirmation_requests")}
check("the start-up step adds the four columns to an older table, once",
      {"thread_id", "follow_up_count", "last_follow_up_at", "events"} <= cols and len(first) == 4 and second == [])

print(f"\n{PASSED} checks passed")
