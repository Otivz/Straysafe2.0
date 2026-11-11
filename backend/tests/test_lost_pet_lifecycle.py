"""
The Lost Pet lifecycle end to end (services/lost_pet_lifecycle.py, approved 2026-11-11):

  - filing a Lost Pet report publishes its Community notice in the same transaction (no approval), and a retry is safe
  - an ordinary sighting reaches the owner and the case activity and nothing else; a possible-recovery report ("I may have this pet
    safely with me") is a lead that never marks anything recovered and whose care note only the owner and the Leader read
  - owner and finder message directly only when BOTH agreed; either asks the Leader to help with no reason and messaging stops
  - recovery is ONE operation (the owner in the app, or the Leader recording what the owner confirmed by phone or in person) that
    closes the notice and the case and puts the pet back to Active, once, whoever asks and however often
  - any other way a case ends keeps its own reason; nothing but the owner's confirmation says "recovered"
  - a referral that was only written down is not proof the Barangay was contacted
  - the Community is read a page at a time, and what neighbors read is masked of contact details
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_lost_pet_lifecycle.py
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
from app.models.audit_log import AuditLog
from app.models.lost_pet_alert import LostPetAlert, LostPetCoordination, LostPetCoordinationMessage, LostPetSighting
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_history import PetHistory
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory
from app.models.user import Barangay, Subdivision, User
from app.routes import announcements, cases, lost_pet_alerts, pets, reports
from app.services import lost_pet_lifecycle as LP
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, lost_pet_alerts.router, pets.router, announcements.router):
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
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for status_id in range(1, 19):
    db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
db.commit()
assert run_case_alignment(engine)["errors"] == []
LOST = 6


def user(name, role=1, subdivision=1, phone="09170001111"):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@lifecycle.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone=phone, address="Blk 9 Lot 15")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rita, omar, nina, olga = user("Rita Santos", phone="09171110001"), user("Omar Reyes", phone="09172220002"), user("Nina Cruz", phone="09173330003"), user("Olga Dela", subdivision=2)
leader, leader2, admin = user("Leader Lee", 2, phone="09179990009"), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)


def pet(owner, name, kind="Dog", **kw):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type=kind, breed=kw.pop("breed", "Shih Tzu"), color_markings=kw.pop("color_markings", "white and gold"),
            distinctive_markings=kw.pop("markings", "pink collar"), gender="Male", registered_by_user_id=owner.user_id, registered_by_name=owner.name,
            photo_url=f"https://res.cloudinary.com/x/{name}.jpg", **kw)
    db.add(p)
    db.commit()
    return p


mochi, kiko, bantay = pet(rita, "Mochi"), pet(rita, "Kiko", "Cat", breed="Persian", color_markings="gray"), pet(omar, "Bantay", breed="Aspin")
NEW = {"latitude": 14.8008, "longitude": 121.0036, "subdivision_id": 1, "category_id": LOST, "description": "Slipped out of the gate this morning.", "landmark": "Near the clubhouse"}
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=2)).replace(microsecond=0).isoformat()
SOURCE = None


def file(who, pet_row, **kw):
    return client.post("/reports/", json={**NEW, "pet_id": pet_row.pet_id, "last_seen_at": SEEN, **kw}, headers=H(who))


def alert_of(report_id):
    db.expire_all()
    return db.query(LostPetAlert).filter(LostPetAlert.report_id == report_id).first()


def notes(user_id, ntype=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if ntype:
        q = q.filter(Notification.type == ntype)
    return q.all()


def history(report_id):
    db.expire_all()
    return [h.remarks for h in db.query(StatusHistory).filter(StatusHistory.report_id == report_id).order_by(StatusHistory.history_id).all()]


def sight(who, alert_id, kind="seen", **kw):
    data = {"latitude": "14.8012", "longitude": "121.0040", "accuracy_confirmed": "true", "sighting_type": kind, "description": "Near the carport, looked calm.", **kw}
    return client.post(f"/lost-pet-alerts/{alert_id}/sightings", data=data, headers=H(who))


# ============================================================================ 1. one submission: case + notice, at once, no approval
res = file(rita, mochi, client_request_id="submit-0001")
check("a Lost Pet report is filed", res.status_code == 200, res.text[:300])
rid = res.json()["report_id"]
a = alert_of(rid)
check("its Community notice exists and is ACTIVE at once (no request, no review, no Leader step)", a is not None and a.status == "active" and a.alert_type == "lost_pet")
check("the notice is the owner's, with the report's place and the time she said", a.owner_id == rita.user_id and a.last_seen_location == "Near the clubhouse" and a.pet_id == mochi.pet_id)
db.expire_all()
check("the pet is now Lost in the registry", db.get(Pet, mochi.pet_id).status == "Lost")
check("the case history says the notice was published, by itself", any("notice published" in h and "automatically" in h for h in history(rid)), str(history(rid)))
check("neighbors were notified (not the owner)", [n.type for n in notes(omar.user_id)].count("lost_pet_alert") == 1 and notes(rita.user_id, "lost_pet_alert")[0].title == "Your missing-pet notice is live")
check("the Leader was notified of the new report (no approval is asked)", len(notes(leader.user_id)) >= 1 and all(n.type != "lost_pet_alert_request" for n in notes(leader.user_id)))
check("no Leader step: the case is simply Reported", client.get(f"/cases/{rid}", headers=H(leader)).json()["case_status"] == "reported")

again = file(rita, mochi, client_request_id="submit-0001")
check("a retry with the same id returns the FIRST report, not a second one", again.status_code == 200 and again.json()["report_id"] == rid, again.text[:200])
check("...and published nothing twice", db.query(LostPetAlert).filter(LostPetAlert.report_id == rid).count() == 1 and [n.type for n in notes(omar.user_id)].count("lost_pet_alert") == 1
      and sum("notice published" in h for h in history(rid)) == 1)
twice = file(rita, mochi)
check("another report for the same pet is refused while it is missing (409, points at the open one)", twice.status_code == 409 and twice.json()["detail"]["report_id"] == rid, twice.text[:200])
check("the legacy request route cannot start a second notice for it either", client.post(f"/lost-pet-alerts/reports/{rid}/request", json={}, headers=H(rita)).status_code == 409)

# atomic: if publishing fails, no report and no half-state remain
original = LP.publish_lost_pet_notice
LP.publish_lost_pet_notice = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
try:
    failed = file(rita, kiko)
finally:
    LP.publish_lost_pet_notice = original
db.expire_all()
check("if the notice cannot be published the whole submission is undone (no report without a notice)", failed.status_code >= 400
      and db.query(Report).filter(Report.pet_id == kiko.pet_id).count() == 0 and db.get(Pet, kiko.pet_id).status != "Lost")

bad = file(rita, kiko, description="Call me at 0917 555 0123 if you see her")
check("what the owner writes is checked on the server: a phone number is refused", bad.status_code == 400 and "phone" in bad.text.lower(), bad.text[:200])
check("...and nothing was created", db.query(Report).filter(Report.pet_id == kiko.pet_id).count() == 0)

# ============================================================================ 2. an ordinary sighting
aid = a.alert_id
ordinary = sight(omar, aid)
check("a neighbor reports a sighting", ordinary.status_code == 200 and not ordinary.json()["duplicate"], ordinary.text[:200])
sid = ordinary.json()["sighting"]["sighting_id"]
db.expire_all()
check("it reaches the owner with a notification that opens the notice (type lost_pet_sighting, related = the alert)", [(n.type, n.related_id) for n in notes(rita.user_id, "lost_pet_sighting")] == [("lost_pet_sighting", aid)])
check("it is on the CASE ACTIVITY, with no name", any("neighbor reported seeing the pet" in h for h in history(rid)) and not any("Omar" in h for h in history(rid)), str(history(rid)))
check("it creates NO conversation and NO Leader task or notification", db.query(LostPetCoordination).count() == 0
      and all(n.type not in ("lost_pet_sighting", "lost_pet_leader") for n in notes(leader.user_id)))
nb = client.get(f"/lost-pet-alerts/{aid}", headers=H(nina)).json()
check("another neighbor sees it as 'A neighbor' with an area, never the pin", nb["sightings"][0]["reported_by"] == "A neighbor" and nb["sightings"][0]["coordinates_generalized"] and nb["sightings"][0]["reviewed_by"] is None)
ow = client.get(f"/lost-pet-alerts/{aid}", headers=H(rita)).json()
check("the owner sees the exact pin but not the neighbor's name (the app promises it is never shown)", ow["sightings"][0]["reported_by"] == "A neighbor" and "Omar" not in str(ow) and not ow["sightings"][0]["coordinates_generalized"])
ld = client.get(f"/lost-pet-alerts/{aid}", headers=H(leader)).json()
check("only the Leader, who has to follow it up, is given the name", ld["sightings"][0]["reported_by"] == "Omar Reyes")
rev = client.post(f"/lost-pet-alerts/sightings/{sid}/review", json={"status": "verified", "note": "The guard saw it too."}, headers=H(leader))
check("the Leader verifies it", rev.status_code == 200 and rev.json()["reviewed_by"] == "Leader Lee" and rev.json()["status"] == "verified")
ow = client.get(f"/lost-pet-alerts/{aid}", headers=H(rita)).json()
check("who reviewed it and when (provenance) is shown to the owner, not to neighbors", ow["sightings"][0]["reviewed_by"] == "Leader Lee" and ow["sightings"][0]["reviewed_at"]
      and client.get(f"/lost-pet-alerts/{aid}", headers=H(nina)).json()["sightings"][0]["reviewed_by"] is None)
check("the review is on the case activity too", any("marked verified" in h for h in history(rid)))
check("a phone number in what a neighbor saw is refused", sight(nina, aid, description="Call 09175550000").status_code == 400)
check("a house number in the place name is refused", sight(nina, aid, location_label="Lot 12 Acacia St").status_code == 400)

# ============================================================================ 3. possible recovery ("I may have this pet safely")
sec = sight(nina, aid, "secured", care_note="In my garage at the back, with water. Gate code 4455.", contact_choice="direct")
check("a neighbor says they may have the pet safely", sec.status_code == 200 and sec.json()["coordination"]["mode"] == "none", sec.text[:300])
cid = sec.json()["coordination"]["coordination_id"]
db.expire_all()
a = alert_of(rid)
check("it does NOT mark anything recovered: the notice is active, the case open, the pet still Lost", a.status == "active" and a.recovered_at is None
      and db.get(Report, rid).case_status != "closed" and db.get(Pet, mochi.pet_id).status == "Lost")
check("the owner is told (type lost_pet_secured), and nothing is claimed as found", [n.type for n in notes(rita.user_id) if n.type == "lost_pet_secured"] == ["lost_pet_secured"]
      and "Nothing is marked recovered" in notes(rita.user_id, "lost_pet_secured")[0].message)
check("the finder said she is willing to be messaged (consent is hers alone so far)", db.get(LostPetCoordination, cid).finder_consent is True and db.get(LostPetCoordination, cid).owner_consent is False)
nb = client.get(f"/lost-pet-alerts/{aid}", headers=H(omar)).json()
check("other neighbors never see the lead (not in the sightings, not in the count)", all(s["sighting_type"] == "seen" for s in nb["sightings"]) and nb["sighting_count"] == 1 and nb["secured_count"] is None)
ow = client.get(f"/lost-pet-alerts/{aid}", headers=H(rita)).json()
lead = next(s for s in ow["sightings"] if s["sighting_type"] == "secured")
check("the owner sees the lead with the care note and the writer's FIRST name only", "garage" in lead["care_note"] and lead["reported_by"] == "Nina" and "Cruz" not in str(lead) and ow["secured_count"] == 1)
check("the Leader sees the lead's writer in full", next(s for s in client.get(f"/lost-pet-alerts/{aid}", headers=H(leader)).json()["sightings"] if s["sighting_type"] == "secured")["reported_by"] == "Nina Cruz")
check("the finder sees her own lead and care note, not anyone's phone", "garage" in next(s for s in client.get(f"/lost-pet-alerts/{aid}", headers=H(nina)).json()["sightings"] if s["sighting_type"] == "secured")["care_note"])
check("the owner cannot report their own pet as secured", sight(rita, aid, "secured").status_code == 403)
check("a Leader cannot either (a lead is a neighbor's)", sight(leader, aid, "secured").status_code == 403)
check("a resident of another subdivision cannot see or write on the notice", sight(olga, aid, "secured").status_code == 404 and client.get(f"/lost-pet-alerts/{aid}", headers=H(olga)).status_code == 404)

# ============================================================================ 4. coordination: direct only when both agree
check("nobody else can read the conversation", client.get(f"/lost-pet-alerts/coordinations/{cid}", headers=H(omar)).status_code == 404)
msg = client.post(f"/lost-pet-alerts/coordinations/{cid}/messages", json={"text": "Hello, is she okay?"}, headers=H(rita))
check("the owner cannot message before they both agreed", msg.status_code == 409, msg.text[:200])
agree = client.post(f"/lost-pet-alerts/coordinations/{cid}/consent", json={"allow": True}, headers=H(rita))
check("the owner agrees: direct messaging opens (both agreed)", agree.status_code == 200 and agree.json()["mode"] == "direct" and agree.json()["can_message"], agree.text[:200])
check("the finder was told it is open", any(n.type == "lost_pet_coordination" for n in notes(nina.user_id)))
sent = client.post(f"/lost-pet-alerts/coordinations/{cid}/messages", json={"text": "Hello, is she okay? Mochi is shy."}, headers=H(rita))
check("they can message", sent.status_code == 200 and sent.json()["is_mine"])
fm = client.get(f"/lost-pet-alerts/coordinations/{cid}/messages", headers=H(nina))
check("the finder reads it (and it is marked read)", fm.status_code == 200 and fm.json()["results"][0]["text"].startswith("Hello") and fm.json()["coordination"]["unread_messages"] == 0)
check("a third resident cannot read or write", client.get(f"/lost-pet-alerts/coordinations/{cid}/messages", headers=H(omar)).status_code == 404
      and client.post(f"/lost-pet-alerts/coordinations/{cid}/messages", json={"text": "x"}, headers=H(omar)).status_code == 403)
check("the Leader never reads their messages", client.get(f"/lost-pet-alerts/coordinations/{cid}/messages", headers=H(leader)).status_code == 404
      and "owner" in client.get(f"/lost-pet-alerts/coordinations/{cid}", headers=H(leader)).json())
from app.models.chat import ChatMessage, ChatThread  # noqa: E402
check("the owner's private report chat is not part of this (no report chat thread or message was made)", db.query(ChatThread).count() == 0 and db.query(ChatMessage).count() == 0)
vw = client.get(f"/lost-pet-alerts/coordinations/{cid}", headers=H(rita)).json()
check("a party never gets the other's phone number", "phone" not in str(vw) and vw["other_party"] == {"first_name": "Nina"})
lv = client.get(f"/lost-pet-alerts/coordinations/{cid}", headers=H(leader)).json()
check("the Leader sees both parties and how to reach them", lv["owner"]["phone"] == "09171110001" and lv["finder"]["phone"] == "09173330003" and lv["you_are"] == "leader")

ask = client.post(f"/lost-pet-alerts/coordinations/{cid}/mediation", headers=H(nina))
check("the finder asks the Leader to help (no reason)", ask.status_code == 200 and ask.json()["mode"] == "leader" and ask.json()["mediation_requested_by_you"], ask.text[:200])
check("direct messaging stops at once", client.post(f"/lost-pet-alerts/coordinations/{cid}/messages", json={"text": "still there?"}, headers=H(rita)).status_code == 409)
check("...but they can still read what was said", len(client.get(f"/lost-pet-alerts/coordinations/{cid}/messages", headers=H(rita)).json()["results"]) == 1)
check("the Leader was notified ONCE, with the REPORT id (opens the case), and the other party was told", [(n.type, n.related_id) for n in notes(leader.user_id, "lost_pet_leader")] == [("lost_pet_leader", rid)]
      and any("Leader will help" in n.title for n in notes(rita.user_id)))
client.post(f"/lost-pet-alerts/coordinations/{cid}/mediation", headers=H(rita))
check("asking again changes nothing and tells nobody again", len(notes(leader.user_id, "lost_pet_leader")) == 1)
check("consent cannot reopen direct messaging once the Leader is asked", client.post(f"/lost-pet-alerts/coordinations/{cid}/consent", json={"allow": True}, headers=H(nina)).status_code == 409)
check("the case moved to In progress by itself (a real request exists)", client.get(f"/cases/{rid}", headers=H(leader)).json()["case_status"] == "in_progress")
wq = client.get("/cases/work-queue", headers=H(leader)).json()
check("the Leader's work queue lists the mediation request (names, the report, when)", len(wq["coordinations"]) == 1 and wq["coordinations"][0]["owner_name"] == "Rita Santos"
      and wq["coordinations"][0]["finder_name"] == "Nina Cruz" and wq["coordinations"][0]["report_id"] == rid)
check("another subdivision's Leader sees neither", client.get("/cases/work-queue", headers=H(leader2)).json()["coordinations"] == []
      and client.get(f"/lost-pet-alerts/coordinations/{cid}", headers=H(leader2)).status_code == 404)
case = client.get(f"/cases/{rid}", headers=H(leader)).json()
block = case["lost_pet"]["alert"]
check("the Leader's case holds the notice, every sighting and lead, the conversation and how to reach them", block["alert_id"] == aid and len(block["sightings"]) == 2
      and block["coordinations"][0]["finder"]["name"] == "Nina Cruz" and block["secured_count"] == 1)
plain = client.post("/reports/", json={**NEW, "category_id": 8, "description": "A dog keeps knocking over the bins."}, headers=H(omar)).json()["report_id"]
check("a case that is not a missing pet has no Lost Pet block", client.get(f"/cases/{plain}", headers=H(leader)).json()["lost_pet"] is None)
sec2 = sight(omar, aid, "secured")
cid2 = sec2.json()["coordination"]["coordination_id"]
check("a conversation nobody asked the Leader about cannot be 'finished' by the Leader", client.post(f"/lost-pet-alerts/coordinations/{cid2}/resolve", json={}, headers=H(leader)).status_code == 409)
fin = client.post(f"/lost-pet-alerts/coordinations/{cid}/resolve", json={"note": "Called both; they met at the gate."}, headers=H(leader))
check("the Leader finishes the mediation", fin.status_code == 200 and fin.json()["status"] == "resolved" and fin.json()["resolution_note"].startswith("Called both"))
check("residents cannot finish a mediation", client.post(f"/lost-pet-alerts/coordinations/{cid}/resolve", json={}, headers=H(rita)).status_code == 403)
check("the contact work is recorded with the existing contact log (not a new system)", client.post(f"/cases/{rid}/contacts", json={"method": "phone", "with_whom": "Nina Cruz (finder)", "summary": "Confirmed the pet is safe; arranged to meet.", "outcome": "cooperative"}, headers=H(leader)).status_code in (200, 201))

# ============================================================================ 5. Barangay assistance: written down is not contacted
ref = client.post(f"/cases/{rid}/referrals", json={"org_type": "barangay", "reason": "Safe retrieval may need physical help; the animal is in a garage.", "contacted": False}, headers=H(leader))
check("assistance can be written down WITHOUT claiming anyone was contacted", ref.status_code in (200, 201) and ref.json()["status"] == "to_contact", ref.text[:300])
check("the case history says so", any("not contacted yet" in h for h in history(rid)), str(history(rid)))
cl = client.get(f"/cases/{rid}/closure-options", headers=H(leader)).json()
check("a written-down request does not count as a hand-off on record", not next(o for o in cl["options"] if o["disposition"] == "handed_off")["available"], str(cl)[:300])
wq = client.get("/cases/work-queue", headers=H(leader)).json()
check("the Leader's queue shows it as an open referral waiting for contact", any(r["status"] == "to_contact" for r in wq["referrals"]))
bad = client.post(f"/cases/{rid}/referrals/{ref.json()['referral_id']}/updates", json={"status": "to_contact", "note": "again"}, headers=H(leader))
check("'needs contact' cannot be set as an update", bad.status_code == 422, bad.text[:200])
upd = client.post(f"/cases/{rid}/referrals/{ref.json()['referral_id']}/updates", json={"status": "sent", "note": "Phoned the barangay hall; Officer Cruz will visit tomorrow.", "contact_method": "phone", "contact_person": "Officer Cruz"}, headers=H(leader))
check("the contact attempt is recorded when it happens (how, who, what came of it)", upd.status_code in (200, 201), upd.text[:300])
detail = client.get(f"/cases/{rid}", headers=H(leader)).json()
rf = detail["referrals"][0]
check("the referral now reads as sent, with who and how", rf["status"] == "sent" and rf["contact_person"] == "Officer Cruz" and rf["contact_method"] in ("call", "phone") and any("contacted" in h for h in history(rid)))

# ============================================================================ 6. recovery: ONE operation, two authorized ways
check("a neighbor cannot say the pet is home", client.post(f"/lost-pet-alerts/{aid}/recovered", json={}, headers=H(nina)).status_code == 403)
check("a Leader cannot declare it themself through the owner's route", client.post(f"/lost-pet-alerts/{aid}/recovered", json={}, headers=H(leader)).status_code == 403)
check("...nor through the old report route", client.post(f"/reports/{rid}/confirm-reunited", json={}, headers=H(leader)).status_code == 403)
check("...nor by choosing the closure outcome 'recovered'", client.post(f"/cases/{rid}/close", json={"disposition": "pet_recovered", "reason": "Back home safely."}, headers=H(leader)).status_code == 409)
check("...nor through the legacy status change", client.put(f"/reports/{rid}/status", json={"status_id": 9, "remarks": "Claimed by owner"}, headers=H(leader)).status_code == 409)
check("the owner cannot use the Leader's recording route", client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "phone"}, headers=H(rita)).status_code == 403)
check("another subdivision's Leader cannot record it (authorization)", client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "phone"}, headers=H(leader2)).status_code == 403)
check("the Leader's record needs how the owner confirmed", client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "text"}, headers=H(leader)).status_code == 422)
check("a time in the future is refused", client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "phone", "confirmed_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(leader)).status_code == 400)
check("nothing changed after those refusals", alert_of(rid).status == "active" and db.get(Report, rid).case_status != "closed")

confirmed_at = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(minutes=20)).replace(microsecond=0)
rec = client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "phone", "confirmed_at": confirmed_at.isoformat(), "note": "Rita called the office: Mochi is home."}, headers=H(leader))
check("the Leader records what the owner confirmed by phone", rec.status_code == 200 and rec.json()["already"] is False, rec.text[:300])
db.expire_all()
a, r, p = alert_of(rid), db.get(Report, rid), db.get(Pet, mochi.pet_id)
check("the notice is resolved as RECOVERED, with how, when, who confirmed and who recorded it", a.status == "closed" and a.close_outcome == "recovered" and a.recovery_source == "phone"
      and a.recovered_at == confirmed_at and a.recovery_confirmed_by == rita.user_id and a.recovery_recorded_by == leader.user_id and a.recovery_note.startswith("Rita called"))
check("the case is closed as 'Missing pet recovered' (legacy status 9), by the Leader's recording", r.case_status == "closed" and r.closure_disposition == "pet_recovered" and r.current_status_id == 9
      and r.closed_by == leader.user_id and r.custody_status == "Reunited with Owner")
check("the pet is Active again", p.status == "Active")
check("every open conversation was finished with it", db.query(LostPetCoordination).filter(LostPetCoordination.status == "open").count() == 0)
check("history, audit and notifications were written once: the finder is thanked, the owner told by the return record",
      any("Missing pet recovered" in h and "by phone" in h for h in history(rid)) and db.query(AuditLog).filter(AuditLog.action == "LOST_PET_RECOVERED", AuditLog.target_id == rid).count() == 1
      and [n.type for n in notes(nina.user_id)].count("lost_pet_recovered") == 1 and db.query(PetHistory).filter(PetHistory.pet_id == mochi.pet_id, PetHistory.event_type == "RETURNED_TO_OWNER").count() == 1)
notice_count = len(notes(nina.user_id)) + len(notes(rita.user_id)) + len(history(rid))
check("the neighbors' list no longer has it", all(x["report_id"] != rid for x in client.get("/lost-pet-alerts/active", headers=H(omar)).json()["results"]))
n_before = db.query(Notification).count()
h_before = len(history(rid))
twice = client.post(f"/lost-pet-alerts/{aid}/recovered", json={}, headers=H(rita))
check("the owner confirming AGAIN (a second device, a retry) changes nothing", twice.status_code == 200 and twice.json()["already"] is True)
again = client.post(f"/lost-pet-alerts/{aid}/record-recovery", json={"source": "in_person"}, headers=H(leader))
check("...and so does the Leader recording it again", again.status_code == 200 and again.json()["already"] is True)
db.expire_all()
check("no second history line, audit entry, notification or return record", db.query(Notification).count() == n_before and len(history(rid)) == h_before
      and db.query(AuditLog).filter(AuditLog.action == "LOST_PET_RECOVERED", AuditLog.target_id == rid).count() == 1 and alert_of(rid).recovery_source == "phone")
check("a sighting is refused now", sight(omar, aid).status_code == 409)

# the owner's own confirmation, in the app (another pet, another report)
r2 = file(rita, kiko, client_request_id="submit-0002").json()["report_id"]
a2 = alert_of(r2).alert_id
own = client.post(f"/lost-pet-alerts/{a2}/recovered", json={"note": "Kiko came home on her own."}, headers=H(rita))
check("the owner confirms in the app", own.status_code == 200 and own.json()["alert"]["close_outcome"] == "recovered" and own.json()["alert"]["recovery"]["source"] == "owner_app")
db.expire_all()
check("recorded as the owner's own confirmation (confirmed by and recorded by are the owner)", alert_of(r2).recovery_confirmed_by == rita.user_id and alert_of(r2).recovery_recorded_by == rita.user_id
      and db.get(Report, r2).case_status == "closed" and db.get(Pet, kiko.pet_id).status == "Active")
check("the Leader is told when the owner does it", [n.related_id for n in notes(leader.user_id, "lost_pet_leader")].count(r2) == 1)
check("the old report route does the same operation (no second path)", client.post(f"/reports/{r2}/confirm-reunited", json={}, headers=H(rita)).status_code in (200, 400))

# ============================================================================ 7. every other ending keeps its own reason
r3 = file(rita, mochi, client_request_id="submit-0003").json()["report_id"]
check("a pet can be reported again after it came home", alert_of(r3).status == "active")
db.expire_all()
check("...and is Lost again", db.get(Pet, mochi.pet_id).status == "Lost")
close = client.post(f"/cases/{r3}/close", json={"disposition": "no_further_sightings", "reason": "No sightings for two weeks; the owner stopped looking."}, headers=H(leader))
check("a Leader can close for another reason", close.status_code == 200, close.text[:200])
a3 = alert_of(r3)
check("the notice ends as NOT FOUND with that reason, never as recovered", a3.status == "closed" and a3.close_outcome == "not_found" and a3.recovered_at is None and "monitoring ended" in a3.close_reason, a3.close_reason)
db.expire_all()
check("the pet is no longer 'Lost' in the registry, and no return was recorded", db.get(Pet, mochi.pet_id).status == "Active" and db.query(PetHistory).filter(PetHistory.event_type == "LOST_REPORT_CLOSED").count() == 1)
reo = client.post(f"/cases/{r3}/reopen", json={"reason": "The owner says she is missing again."}, headers=H(leader))
check("reopening a missing-pet case publishes its notice again and the pet is Lost again", reo.status_code == 200 and alert_of(r3).status == "active" and alert_of(r3).close_outcome is None
      and (db.expire_all() or db.get(Pet, mochi.pet_id).status == "Lost"))
w = client.patch(f"/reports/{r3}/cancel", headers=H(rita))
check("the owner withdraws the report", w.status_code == 200, w.text[:200])
db.expire_all()
a3, rr = alert_of(r3), db.get(Report, r3)
check("the notice ends as WITHDRAWN, the case keeps 'Withdrawn by the reporter', the pet is Active", a3.close_outcome == "withdrawn" and rr.closure_disposition == "withdrawn_by_reporter" and rr.case_status == "closed"
      and db.get(Pet, mochi.pet_id).status == "Active" and "withdrew" in a3.close_reason)
check("withdrawing twice is refused", client.patch(f"/reports/{r3}/cancel", headers=H(rita)).status_code == 409)
check("a Leader cannot pick 'withdrawn' as a closure", client.post(f"/cases/{r3}/close", json={"disposition": "withdrawn_by_reporter", "reason": "Withdrawn."}, headers=H(leader)).status_code in (409, 422))
check("someone else cannot withdraw it", client.patch(f"/reports/{r3}/cancel", headers=H(omar)).status_code == 403)

# ============================================================================ 8. the Community: a page at a time, searched, scoped
for i in range(7):
    p_i = pet(nina if i % 2 else omar, f"Pup{i}", "Cat" if i % 3 == 0 else "Dog", breed="Aspin" if i % 2 else "Persian")
    owner = nina if i % 2 else omar
    assert file(owner, p_i, client_request_id=f"bulk-{i}").status_code == 200
page = client.get("/lost-pet-alerts/active?alert_type=lost_pet&limit=3&offset=0", headers=H(omar)).json()
check("the Community reads a page at a time, with the total", page["total"] == 7 and len(page["results"]) == 3 and page["limit"] == 3)
check("the next page continues in the same order, without repeating", {x["alert_id"] for x in client.get("/lost-pet-alerts/active?alert_type=lost_pet&limit=3&offset=3", headers=H(omar)).json()["results"]}.isdisjoint({x["alert_id"] for x in page["results"]}))
check("the page size is bounded", len(client.get("/lost-pet-alerts/active?alert_type=lost_pet&limit=999", headers=H(omar)).json()["results"]) <= 50)
check("search finds by name", [x["pet"]["name"] for x in client.get("/lost-pet-alerts/active?alert_type=lost_pet&q=pup3", headers=H(omar)).json()["results"]] == ["Pup3"])
check("search finds by breed", client.get("/lost-pet-alerts/active?alert_type=lost_pet&q=persian", headers=H(omar)).json()["total"] >= 3)
check("the species filter works", client.get("/lost-pet-alerts/active?alert_type=lost_pet&species=cat", headers=H(omar)).json()["total"] == 3
      and client.get("/lost-pet-alerts/active?alert_type=lost_pet&species=dog", headers=H(omar)).json()["total"] == 4)
summary = client.get("/lost-pet-alerts/community/summary", headers=H(omar)).json()
check("the overview is a short preview plus the totals (not every notice)", summary["lost"]["total"] == 7 and len(summary["lost"]["results"]) == 4 and summary["found"]["total"] == 0 and summary["preview"] == 4)
check("another subdivision's residents see none of it", client.get("/lost-pet-alerts/community/summary", headers=H(olga)).json()["lost"]["total"] == 0)
check("a closed notice is not in the Community", all(x["status"] == "active" for x in page["results"]))

# what neighbors read is masked of contact details, even in older rows
legacy = alert_of(db.query(Report).filter(Report.client_request_id == "bulk-1").first().report_id)
legacy.owner_note = "Call 0917 555 0188 or lot 12 Acacia St."
legacy.leader_message = "Write to mia@example.com"
db.commit()
v = client.get(f"/lost-pet-alerts/{legacy.alert_id}", headers=H(omar)).json()
check("older text is masked when shown (phone, address, e-mail)", "0917" not in v["owner_note"] and "lot 12" not in v["owner_note"].lower() and "@" not in v["leader_message"] and "[removed]" in v["owner_note"], v["owner_note"])

# ============================================================================ 9. the Leader's notice list and the dashboard
dash = client.get("/lost-pet-alerts/dashboard", headers=H(leader)).json()
check("the old dashboard counts recoveries by the recorded confirmation and open mediation", dash["stats"]["pets_reunited"] == 2 and "mediation_requests" in dash["stats"])
check("a resident cannot read the Leader's list or dashboard", client.get("/lost-pet-alerts/all", headers=H(omar)).status_code == 403 and client.get("/lost-pet-alerts/dashboard", headers=H(omar)).status_code == 403)

# ============================================================================ 10. continuation: provenance, original authority and retry races
legacy_id = legacy.alert_id
observed = sight(nina, legacy_id, on_behalf="true", client_request_id="second-hand-observation")
check("second-hand sighting provenance is stored and returned", observed.status_code == 200 and observed.json()["sighting"]["on_behalf"] is True, observed.text[:200])
again_view = client.get(f"/lost-pet-alerts/{legacy_id}", headers=H(nina)).json()
check("provenance remains second-hand after a fresh read", next(s for s in again_view["sightings"] if s["sighting_id"] == observed.json()["sighting"]["sighting_id"])["on_behalf"] is True)
check("a public notice never discloses the owner's first name", client.get(f"/lost-pet-alerts/{legacy_id}", headers=H(rita)).json()["owner_first_name"] is None)

reuse = file(rita, bantay, client_request_id="submit-0001")
check("retry ids cannot bypass ownership eligibility", reuse.status_code == 404)
key_pet = pet(rita, "RetryKeyPet")
reuse = file(rita, key_pet, client_request_id="submit-0001")
check("one resident cannot reuse a submission id for a different pet", reuse.status_code == 409 and "another pet" in reuse.text, reuse.text[:200])

lead = sight(rita, legacy_id, "secured", client_request_id="private-lead-retry", contact_choice="direct", care_note="In my private carport.")
coord_id = lead.json()["coordination"]["coordination_id"]
path = f"/lost-pet-alerts/coordinations/{coord_id}"
before_notes = len(notes(rita.user_id))
check("the original owner can consent to this pair", client.post(path + "/consent", json={"allow": True}, headers=H(nina)).status_code == 200)
after_notes = len(notes(rita.user_id))
check("repeating consent has no duplicate notification", client.post(path + "/consent", json={"allow": True}, headers=H(nina)).status_code == 200 and len(notes(rita.user_id)) == after_notes and after_notes == before_notes + 1)
sent = client.post(path + "/messages", json={"text": "Contact me privately at 09171112222", "client_request_id": "message-retry-1"}, headers=H(nina))
check("a direct message accepts a stable request id", sent.status_code == 200, sent.text[:200])
before_notes = len(notes(rita.user_id))
sent_again = client.post(path + "/messages", json={"text": "Contact me privately at 09171112222", "client_request_id": "message-retry-1"}, headers=H(nina))
check("message retry returns the first message without notifying again", sent_again.status_code == 200 and sent_again.json()["message_id"] == sent.json()["message_id"] and len(notes(rita.user_id)) == before_notes)
check("private message text is absent from notification previews", all("09171112222" not in n.message for n in notes(rita.user_id)))
check("another sender cannot reuse a message request id", client.post(path + "/messages", json={"text": "A different message", "client_request_id": "message-retry-1"}, headers=H(rita)).status_code == 409)
check("mediation still stops new messages", client.post(path + "/mediation", headers=H(rita)).status_code == 200 and client.post(path + "/messages", json={"text": "Stale composer", "client_request_id": "message-retry-2"}, headers=H(nina)).status_code == 409)
check("a saved message may be reconciled after mediation without sending again", client.post(path + "/messages", json={"text": "Contact me privately at 09171112222", "client_request_id": "message-retry-1"}, headers=H(nina)).json()["message_id"] == sent.json()["message_id"])

check("Leader confirmation requires the actual confirmation time", client.post(f"/lost-pet-alerts/{legacy_id}/record-recovery", json={"source": "phone"}, headers=H(leader)).status_code == 422)
stale = SessionLocal()
stale_alert = stale.get(LostPetAlert, legacy_id)
check("a second session initially sees the notice open", stale_alert.status == "active")
finish = client.post(f"/lost-pet-alerts/{legacy_id}/recovered", json={}, headers=H(nina))
check("the original owner confirms the pet home", finish.status_code == 200)
before_history = len(history(legacy.report_id))
replayed = LP.confirm_recovery(stale, stale_alert, source="owner_app", actor=nina)
stale.commit()
stale.close()
check("a stale ORM instance is refreshed under the recovery lock and returns already", replayed["already"] is True and len(history(legacy.report_id)) == before_history)
check("another resident cannot use an idempotent recovery response to read private confirmation", client.post(f"/lost-pet-alerts/{legacy_id}/recovered", json={}, headers=H(rita)).status_code == 403)
db.expire_all()
case = db.get(Report, legacy.report_id)
case.assigned_leader_id = leader2.user_id
db.commit()
check("recovery replays still enforce the current assigned handler", client.post(f"/lost-pet-alerts/{legacy_id}/record-recovery", json={"source": "phone"}, headers=H(leader)).status_code == 403)
case.assigned_leader_id = None
linked_pet = db.get(Pet, case.pet_id)
linked_pet.owner_id = olga.user_id
db.commit()
check("a later registry owner cannot read the earlier owner's notice", client.get(f"/lost-pet-alerts/{legacy_id}", headers=H(olga)).status_code == 404)
check("a later registry owner cannot confirm its recovery", client.post(f"/lost-pet-alerts/{legacy_id}/recovered", json={}, headers=H(olga)).status_code == 404)

# ============================================================================ 11. explicit animal-only advisory classification
from app.models.announcement import Announcement, AnnouncementCategory
for name in ("General Advisory", "Emergency Alert", "Rabies Alert"):
    cat = AnnouncementCategory(category_name=name)
    db.add(cat)
    db.flush()
    db.add(Announcement(category_id=cat.category_id, created_by=leader.user_id, subdivision_id=1, title=name,
                        content="A neighbourhood update.", visibility="Subdivision Only", status="Published"))
db.commit()
animal = client.post("/announcements/", json={"category": "Animal Advisory", "title": "Keep pets safe near the gate", "content": "Keep animals away from the road.", "visibility": "Subdivision Only"}, headers=H(leader))
check("new animal advisories retain explicit animal classification", animal.status_code == 200 and db.query(AnnouncementCategory).filter(AnnouncementCategory.category_name == "Animal Advisory").count() == 1, animal.text[:200])
feed_path = f"/announcements/feed/resident/{rita.user_id}"
all_feed = client.get(feed_path, headers=H(rita)).json()
animal_feed = client.get(feed_path + "?community_animal_only=true", headers=H(rita)).json()
check("the general announcement feed retains its prior categories", any(a["title"] == "General Advisory" for a in all_feed) and any(a["title"] == "Emergency Alert" for a in all_feed))
check("Community excludes generic advisories/emergencies and includes explicit animal topics", {a["title"] for a in animal_feed} == {"Rabies Alert", "Keep pets safe near the gate"}, str(animal_feed)[:200])
bad = client.post("/announcements/", json={"category": "Animal Advisory", "title": "Contact the owner", "content": "Call 0917 555 0123", "visibility": "Subdivision Only"}, headers=H(leader))
check("animal-advisory public text is validated on the server", bad.status_code == 400)

# The additive migration supports an earlier partial message table, without rebuilding or replacing its rows.
from sqlalchemy import create_engine, inspect, text
from app.db_migrations.case_alignment import ensure_coordination_message_columns
partial = create_engine("sqlite:///:memory:")
with partial.begin() as conn:
    conn.execute(text("CREATE TABLE lost_pet_coordination_messages (message_id INTEGER PRIMARY KEY, message_text TEXT NOT NULL)"))
    conn.execute(text("INSERT INTO lost_pet_coordination_messages VALUES (1, 'kept history')"))
    changed = ensure_coordination_message_columns(conn)
    check("partial message-table migration adds retry column and unique index", len(changed) == 2 and "client_request_id" in {c["name"] for c in inspect(conn).get_columns("lost_pet_coordination_messages")} and any(ix["name"] == "uq_lost_pet_coordination_message_request" and ix["unique"] for ix in inspect(conn).get_indexes("lost_pet_coordination_messages")))
    check("partial message migration is idempotent and preserves existing history", ensure_coordination_message_columns(conn) == [] and conn.execute(text("SELECT message_text FROM lost_pet_coordination_messages WHERE message_id=1")).scalar() == "kept history")
partial.dispose()

print(f"\n{PASSED} checks passed.")
