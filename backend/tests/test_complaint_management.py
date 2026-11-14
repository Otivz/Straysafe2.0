"""
Complaint management and progressive enforcement (routes/complaints.py, services/complaints.py, utils/complaint_rules.py,
docs/01-system/COMPLAINT_MANAGEMENT.md):

  - the complainant's suggestion of the owner is kept on animal complaints only and shown to the reporter and staff only
  - only a verified incident + a confirmed rule + a person confirmed with evidence counts; a suggestion alone never does
  - the offense number is per person AND per rule, suggested by StraySafe and confirmed by the Leader (a stale number is refused)
  - a second report of the same occurrence is linked and closed as a duplicate, and is never counted
  - letters, the summons, the fine and the Barangay meeting follow their real order; nothing is assumed delivered or paid
  - a correction voids the decision (kept, no longer counted) and reopens a closed complaint; ruled-out leads are not suggested again
  - only the Subdivision Leader of the subdivision writes
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_complaint_management.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.db_migrations import complaint_management as MIG
from app.db_migrations.case_alignment import run_case_alignment
from app.limiter import limiter
from app.models.barangay_referral import BarangayReferral
from app.models.complaint import ComplaintOffense, EnforcementStepEvent
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.routes import cases, complaints, reports
from app.schemas.case import PolicyIn
from app.utils import case_policy
from app.utils import complaint_rules as R
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, complaints.router):
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
FOUND, NUISANCE = 7, 8


def user(name, role=1, subdivision=1, address="Blk 9 Lot 15, Acacia St."):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@complaints.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone="09170001111", address=address)
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


liza = user("Liza Ramos", address="Block 3 Lot 10, Narra St.")
joel = user("Joel Bautista", address="Block 3 Lot 6, Narra St.")
ramon = user("Ramon Dizon", address="Block 3 Lot 8, Narra St.")
carla = user("Carla Mendoza", address="Block 5 Lot 2, Molave St.")
leader, leader2, admin = user("Leader Lee", 2), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)
kulot = Pet(owner_id=joel.user_id, pet_name="Kulot", pet_type="Dog", breed="Poodle mix", color_markings="White", size_category="Small",
            registered_by_user_id=joel.user_id, registered_by_name=joel.name)
db.add(kulot)
db.commit()

settings = case_policy.default_settings()
settings.policies = [
    PolicyIn(id="waste", title="Pet waste left in common areas", reference="Test rule 1", summary="Pick up after your pet.",
             applies_to=["nuisance"], status="confirmed", fine_amount=500.0),
    PolicyIn(id="noise", title="Persistent barking or animal noise", reference="Test rule 2", applies_to=["nuisance"], status="confirmed"),
    PolicyIn(id="roam", title="Pet outside the lot without a leash", reference="Test rule 3", applies_to=["nuisance"], status="pending_confirmation"),
]
case_policy.save_settings(db, 1, settings, leader.user_id)
db.commit()

BASE = datetime.now().replace(microsecond=0) - timedelta(days=30)


def file(by, seen, lat=14.8008, lng=121.0036, category=NUISANCE, **extra):
    body = {"latitude": lat, "longitude": lng, "landmark": "Narra St., outside Block 3 Lot 10", "subdivision_id": 1, "category_id": category,
            "animal_type": "Dog", "description": f"A small white dog left its waste on the sidewalk again ({seen:%d %b, %H:%M}).", "seen_at": seen.isoformat(), **extra}
    r = client.post("/reports/", json=body, headers=H(by))
    assert r.status_code == 200, r.text
    return r.json()["report_id"]


def fresh(rid):
    """The report as the server left it (the test session caches what it read before)."""
    db.expire_all()
    return db.get(Report, rid)


def post(path, body, who=leader):
    return client.post(path, json=body, headers=H(who))


def detail(rid, who=leader):
    r = client.get(f"/complaints/{rid}", headers=H(who))
    assert r.status_code == 200, r.text
    return r.json()


def step(d, kind):
    return next(s for s in d["steps"] if s["kind"] == kind)


def confirm_person(rid, who_id, evidence=("cctv",), **extra):
    return post(f"/complaints/{rid}/responsible", {"mode": "user", "user_id": who_id, "evidence": list(evidence),
                                                   "note": "The gate CCTV shows this dog and its walker.", **extra})


# ============================================================================ 0. the migration check
check("the start-up check finds every table and column on the test database", MIG.missing(engine) == [])

# ============================================================================ 1. filing, the suggestion and privacy
c1 = file(liza, BASE, suspected_owner_name="Mr. Dizon", suspected_owner_address="Corner house, Block 3 Lot 8", suspected_owner_details="White shih tzu",
          animal_color="Small, white, red collar")
rep = db.get(Report, c1)
check("an animal complaint keeps when it was seen and the suggestion of the owner",
      rep.seen_at == BASE and rep.suspected_owner_name == "Mr. Dizon" and rep.animal_color == "Small, white, red collar")
found = file(joel, BASE, category=FOUND, suspected_owner_name="Someone")
check("the suggestion is dropped on any other kind of report", db.get(Report, found).suspected_owner_name is None)
r = client.post("/reports/", json={"latitude": 14.8008, "longitude": 121.0036, "subdivision_id": 1, "category_id": NUISANCE, "animal_type": "Dog",
                                   "description": "Barking all night long here.", "seen_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(liza))
check("a seen time in the future is refused", r.status_code == 400, r.text)
mine = client.get(f"/reports/{c1}", headers=H(liza)).json()
check("the reporter reads their own suggestion", mine.get("suspected_owner_name") == "Mr. Dizon" and mine.get("complaint_verified") is False)
check("another resident cannot open the complaint", client.get(f"/reports/{c1}", headers=H(carla)).status_code == 404)
check("staff read the suggestion", client.get(f"/reports/{c1}", headers=H(leader)).json().get("suspected_owner_name") == "Mr. Dizon")

# ============================================================================ 2. who may write
check("a resident cannot record findings", post(f"/complaints/{c1}/verify", {"incident": "verified", "basis": "Saw it myself.", "policy_id": "waste"}, liza).status_code == 403)
check("a Leader of another subdivision cannot", post(f"/complaints/{c1}/verify", {"incident": "verified", "basis": "Saw it myself.", "policy_id": "waste"}, leader2).status_code in (403, 404))
check("a found-animal report is not a complaint", client.get(f"/complaints/{found}", headers=H(leader)).status_code == 409)

# ============================================================================ 3. verify, rule, leads, person
check("a rule still pending confirmation cannot be chosen",
      post(f"/complaints/{c1}/verify", {"incident": "verified", "basis": "Saw it on my round.", "policy_id": "roam"}).status_code == 409)
check("an unverified complaint cannot be counted yet", post(f"/complaints/{c1}/offense", {"decision": "counted"}).status_code == 409)
d = post(f"/complaints/{c1}/verify", {"incident": "verified", "basis": "Saw it on my 8 AM round.", "policy_id": "waste"}).json()
check("verified under the waste rule", d["incident"]["status"] == "verified" and d["rule"]["title"] == "Pet waste left in common areas")
check("the reporter was told it was verified",
      db.query(Notification).filter(Notification.user_id == liza.user_id, Notification.title.like("%verified%")).count() == 1)
check("a suggestion alone never counts (no person confirmed yet)", post(f"/complaints/{c1}/offense", {"decision": "counted"}).status_code == 409)
leads = client.get(f"/complaints/{c1}/leads", headers=H(leader)).json()
check("the suggested name finds the resident", any(x["user_id"] == ramon.user_id and "name matches" in x["why"] for x in leads["suggestion"]),
      leads["suggestion"])
check("the suggested Block/Lot finds the same resident", any(x["user_id"] == ramon.user_id and "lives at Block 3 Lot 8" in x["why"] for x in leads["suggestion"]))
check("a registered look-alike is offered as a lead, never as a finding", any(x["pet_id"] == kulot.pet_id for x in leads["registry"]), leads["registry"])
check("the complainant is never a lead", all(x.get("user_id") != liza.user_id for x in leads["suggestion"]))
check("a registered pet alone is not evidence",
      confirm_person(c1, ramon.user_id, evidence=("registry",)).status_code == 422)
d = confirm_person(c1, ramon.user_id, ruled_out=[{"key": f"pet:{kulot.pet_id}", "label": "Kulot", "reason": "A poodle mix, not the shih tzu on CCTV"}]).json()
check("the person responsible is confirmed with evidence", d["respondent"]["name"] == "Ramon Dizon" and d["respondent"]["evidence"] == ["cctv"])
check("the ruled-out lead is kept and no longer suggested",
      d["ruled_out"][0]["key"] == f"pet:{kulot.pet_id}" and not client.get(f"/complaints/{c1}/leads", headers=H(leader)).json()["registry"])
check("StraySafe suggests the 1st offense", d["suggestion"] == 1 and [s["kind"] for s in d["stage_steps"]] == ["letter_1"])

# ============================================================================ 4. the 1st offense and its letter
check("a stale number is refused", post(f"/complaints/{c1}/offense", {"decision": "counted", "expected_number": 2}).status_code == 409)
d = post(f"/complaints/{c1}/offense", {"decision": "counted", "expected_number": 1}).json()
check("confirmed as the 1st offense, with the first letter to prepare",
      d["offense"]["number"] == 1 and [(s["kind"], s["state"]) for s in d["steps"]] == [("letter_1", "to_prepare")])
check("deciding twice is refused", post(f"/complaints/{c1}/offense", {"decision": "counted"}).status_code == 409)
check("the complaint is in progress", fresh(c1).case_status == "in_progress")
s1 = step(d, "letter_1")["step_id"]
check("a letter is not issued before it is prepared", post(f"/complaints/{c1}/steps/{s1}", {"action": "issue", "via": "You, by hand"}).status_code == 409)
post(f"/complaints/{c1}/steps/{s1}", {"action": "prepare", "letter_date": BASE.date().isoformat()})
post(f"/complaints/{c1}/steps/{s1}", {"action": "issue", "via": "You, by hand"})
d = post(f"/complaints/{c1}/steps/{s1}", {"action": "deliver", "delivered": False, "reason": "nobody_home", "occurred_at": (BASE + timedelta(hours=10)).isoformat()}).json()
check("a failed delivery is kept, not treated as delivered", step(d, "letter_1")["state"] == "not_delivered")
body = {"action": "deliver", "delivered": True, "received_by": "Ramon Dizon", "proof": "signed", "occurred_at": (BASE + timedelta(days=1)).isoformat(),
        "client_request_id": "retry-1"}
post(f"/complaints/{c1}/steps/{s1}", body)
d = post(f"/complaints/{c1}/steps/{s1}", body).json()
events = [e["kind"] for e in step(d, "letter_1")["events"]]
check("delivered on the second attempt; a retried save is recorded once",
      step(d, "letter_1")["state"] == "delivered" and events == ["prepared", "issued", "not_delivered", "delivered"], events)

# ============================================================================ 5. the 2nd offense: letter and summons
c2 = file(joel, BASE + timedelta(days=10), lat=14.8020, lng=121.0050)
post(f"/complaints/{c2}/verify", {"incident": "verified", "basis": "Gate CCTV at 6:18 AM.", "policy_id": "waste"})
d = confirm_person(c2, ramon.user_id).json()
check("the same person and rule: StraySafe suggests the 2nd offense", d["suggestion"] == 2 and len(d["history"]["counted"]) == 1)
d = post(f"/complaints/{c2}/offense", {"decision": "counted", "expected_number": 2}).json()
check("the 2nd offense asks for the second letter and the summons",
      [(s["kind"], s["state"]) for s in d["steps"]] == [("letter_2", "to_prepare"), ("summons", "waiting")])
l2, sm = step(d, "letter_2")["step_id"], step(d, "summons")["step_id"]
check("no attendance before the summons has a date",
      post(f"/complaints/{c2}/steps/{sm}", {"action": "attendance", "result": "attended", "note": "Came on time."}).status_code == 409)
summons_at = (BASE + timedelta(days=15)).replace(hour=16, minute=0)
d = post(f"/complaints/{c2}/steps/{l2}", {"action": "prepare", "letter_date": (BASE + timedelta(days=11)).date().isoformat(),
                                          "summons_at": summons_at.isoformat(), "place": "Subdivision office"}).json()
check("the second letter sets the summons date", step(d, "summons")["state"] == "scheduled" and step(d, "summons")["details"]["place"] == "Subdivision office")
check("no attendance before the letter that tells them the date is delivered",
      post(f"/complaints/{c2}/steps/{sm}", {"action": "attendance", "result": "attended", "note": "Came on time."}).status_code == 409)
post(f"/complaints/{c2}/steps/{l2}", {"action": "issue", "via": "The guard on duty"})
check("a delivery cannot be dated in the future",
      post(f"/complaints/{c2}/steps/{l2}", {"action": "deliver", "delivered": True, "received_by": "X", "proof": "signed",
                                            "occurred_at": (datetime.now() + timedelta(days=3)).isoformat()}).status_code == 422)
post(f"/complaints/{c2}/steps/{l2}", {"action": "deliver", "delivered": True, "received_by": "A household member", "proof": "signed",
                                      "occurred_at": (BASE + timedelta(days=12)).isoformat()})
d = post(f"/complaints/{c2}/steps/{sm}", {"action": "attendance", "result": "absent", "note": "Did not come."}).json()
check("a missed summons is recorded", step(d, "summons")["state"] == "absent")
post(f"/complaints/{c2}/steps/{sm}", {"action": "reschedule", "at": (BASE + timedelta(days=18)).isoformat(), "told": "By phone"})
d = post(f"/complaints/{c2}/steps/{sm}", {"action": "attendance", "result": "attended", "note": "Agreed to carry bags on walks."}).json()
check("a new date, then attended", step(d, "summons")["state"] == "attended")

# ============================================================================ 6. another rule counts on its own; unverified never counts
c3 = file(joel, BASE + timedelta(days=12), lat=14.8030, lng=121.0060, description="Barking all night from the corner house again.")
post(f"/complaints/{c3}/verify", {"incident": "verified", "basis": "Heard it myself at 11 PM.", "policy_id": "noise"})
d = confirm_person(c3, ramon.user_id).json()
check("a different rule starts its own count", d["suggestion"] == 1)
c4 = file(carla, BASE + timedelta(days=13), lat=14.8040, lng=121.0070)
post(f"/complaints/{c4}/verify", {"incident": "unverified", "basis": "Nothing found on two visits."})
check("an unverified complaint never counts", post(f"/complaints/{c4}/offense", {"decision": "counted"}).status_code == 409)

# ============================================================================ 7. the same occurrence reported twice counts once
c5 = file(liza, BASE + timedelta(days=20))
c6 = file(carla, BASE + timedelta(days=20, minutes=25), lat=14.8009, lng=121.0037)
check("StraySafe asks whether the later complaint is the same occurrence", detail(c6)["maybe_same"]["report_id"] == c5)
post(f"/complaints/{c6}/verify", {"incident": "verified", "basis": "The mess was there at 8 AM.", "policy_id": "waste"})
confirm_person(c6, ramon.user_id)
check("it cannot be counted before that is decided", post(f"/complaints/{c6}/offense", {"decision": "counted"}).status_code == 409)
d = post(f"/complaints/{c6}/same-occurrence", {"other_report_id": c5, "decision": "same"}).json()
check("linked and closed as a duplicate", d["same_as"]["report_id"] == c5 and fresh(c6).closure_disposition == "duplicate_report")
check("the earlier complaint shows it was also reported", any(x["report_id"] == c6 for x in detail(c5)["also_reported"]))

# ============================================================================ 8. the 3rd offense: fine and Barangay meeting
post(f"/complaints/{c5}/verify", {"incident": "verified", "basis": "Saw it myself.", "policy_id": "waste"})
d = confirm_person(c5, ramon.user_id).json()
check("third verified incident of the same rule: the 3rd offense", d["suggestion"] == 3)
d = post(f"/complaints/{c5}/offense", {"decision": "counted", "expected_number": 3}).json()
check("the 3rd offense asks for the fine and the meeting", [s["kind"] for s in d["steps"]] == ["fine", "meeting"])
check("the same occurrence is listed as not counted", any(n["kind"] == "same_occurrence" and n["report_id"] == c6 for n in d["history"]["not_counted"]))
fine, meet = step(d, "fine")["step_id"], step(d, "meeting")["step_id"]
check("no payment before the fine is imposed", post(f"/complaints/{c5}/steps/{fine}", {"action": "pay", "paid_on": BASE.date().isoformat(), "received_by": "Leader"}).status_code == 409)
settings.policies[0].fine_amount = None
case_policy.save_settings(db, 1, settings, leader.user_id)
db.commit()
check("no fine without an amount in the confirmed rule",
      post(f"/complaints/{c5}/steps/{fine}", {"action": "impose", "imposed_on": BASE.date().isoformat(), "told": "In writing"}).status_code == 409)
settings.policies[0].fine_amount = 500.0
case_policy.save_settings(db, 1, settings, leader.user_id)
db.commit()
d = post(f"/complaints/{c5}/steps/{fine}", {"action": "impose", "imposed_on": (BASE + timedelta(days=21)).date().isoformat(), "told": "In writing"}).json()
check("the amount is read from the rule", step(d, "fine")["state"] == "imposed" and step(d, "fine")["details"]["amount"] == 500.0)
d = post(f"/complaints/{c5}/steps/{fine}", {"action": "pay", "paid_on": (BASE + timedelta(days=22)).date().isoformat(), "received_by": "Leader Lee"}).json()
check("paid", step(d, "fine")["state"] == "paid")
d = post(f"/complaints/{c5}/steps/{meet}", {"action": "arrange", "contact": "Kagawad on duty", "at": (BASE + timedelta(days=25)).isoformat(),
                                             "place": "Barangay hall", "complainant_agreed": True}).json()
check("the meeting is arranged and written in the Barangay referral log",
      step(d, "meeting")["state"] == "arranged" and db.query(BarangayReferral).filter(BarangayReferral.report_id == c5).count() == 1)
d = post(f"/complaints/{c5}/steps/{meet}", {"action": "meeting", "held": True, "attendance": {"complainant": True, "respondent": True, "leader": True},
                                             "outcome": "Agreed to keep the dog leashed and clean up."}).json()
check("the meeting is recorded with who attended", step(d, "meeting")["state"] == "held" and step(d, "meeting")["details"]["attendance"]["respondent"])

# ============================================================================ 9. the workspace and the person's history
w = client.get("/complaints", headers=H(leader)).json()
row = next(x for x in w["items"] if x["report_id"] == c5)
check("the workspace lists the complaint with its decision and steps", row["offense"]["number"] == 3 and len(row["steps"]) == 2)
person = next(p for p in w["people"] if p["name"] == "Ramon Dizon")
rules = {r["policy_id"]: r for r in person["rules"]}
check("the person's history is per rule", rules["waste"]["counted"] == 3 and rules["noise"]["pending"] == 1, person)
p = client.get(f"/complaints/people/{person['respondent_id']}", headers=H(leader)).json()
check("the person page has one history per rule", {r["policy_id"] for r in p["rules"]} == {"waste", "noise"})
check("another subdivision's Leader cannot read it", client.get(f"/complaints/people/{person['respondent_id']}", headers=H(leader2)).status_code == 404)

# ============================================================================ 10. a correction keeps the history
post(f"/cases/{c1}/close", {"disposition": "resolved_intervention", "reason": "First letter delivered."})
r = post(f"/complaints/{c1}/responsible", {"mode": "new", "name": "Rico Lim", "address": "Block 3 Lot 9, Narra St.", "evidence": ["firsthand"],
                                           "note": "Saw Mr. Lim walking that dog at 6 AM; he confirmed it."})
check("changing the person after a decision needs a reason", r.status_code == 422, r.text)
d = post(f"/complaints/{c1}/responsible", {"mode": "new", "name": "Rico Lim", "address": "Block 3 Lot 9, Narra St.", "evidence": ["firsthand"],
                                           "note": "Saw Mr. Lim walking that dog at 6 AM; he confirmed it.", "correction_reason": "The CCTV walker was Mr. Lim."}).json()
check("corrected: the decision is voided and kept, the complaint reopened",
      d["respondent"]["name"] == "Rico Lim" and d["offense"] is None and len(d["corrections"]) == 1 and fresh(c1).case_status != "closed")
check("the voided decision keeps its steps", d["corrections"][0]["steps"][0]["state"] == "delivered")
check("the new person starts at the 1st offense", d["suggestion"] == 1)
h = detail(c5)["history"]
check("the old person's history no longer counts it, and says why",
      len(h["counted"]) == 2 and any(n["kind"] == "corrected" and n["report_id"] == c1 for n in h["not_counted"]))
check("the confirmed numbers are never renumbered", sorted(x["number"] for x in h["counted"]) == [2, 3])
check("nothing was deleted", db.query(ComplaintOffense).count() == 3 and db.query(EnforcementStepEvent).count() > 10)

# ============================================================================ 11. still checking; the counting window
d = post(f"/complaints/{c4}/responsible", {"mode": "none", "check_note": "Asked the guard; nothing yet.",
                                           "ruled_out": [{"key": f"user:{carla.user_id}", "label": "Carla Mendoza", "reason": "Away that week"}]}).json()
check("'not identified yet' saves what was checked", d["check"]["note"] == "Asked the guard; nothing yet." and d["respondent"] is None)
late = fresh(c5)
check("without a window, every earlier offense counts", R.suggest_number(db, late, person["respondent_id"], "waste", None) == 2)
check("with a window, older offenses stop counting", R.suggest_number(db, late, person["respondent_id"], "waste", 5) == 1)

print(f"\n{PASSED} checks passed")
