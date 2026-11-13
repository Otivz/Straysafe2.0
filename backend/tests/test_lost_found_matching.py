"""
Lost and found possible matches (services/lost_found_matching.py, docs/01-system/LOST_FOUND_MATCHING.md):

  - the background check runs when EITHER report is filed (lost first, or found first) and only SUGGESTS: nothing is linked, no status
    changes, no resident is told; only the Leaders are
  - the pair is compared on what the reports say (kind of animal, colours, size, features, collar, distance, time), a different kind of
    animal never matches, a pair is never suggested twice and a found report that is already linked is never suggested again
  - only a Leader of the subdivision decides: confirming links the reports (nothing merged, both stay open), writes the history on both,
    tells BOTH residents and opens the owner/finder conversation; ruling it out tells nobody and can be reviewed again
  - a lost report can have several found reports; a found report links to ONE lost report (its other suggestions become moot)
  - a link is never a recovery, and filing a report never fails because of this check
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_lost_found_matching.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.db_migrations.case_alignment import run_case_alignment
from app.limiter import limiter
from app.models.audit_log import AuditLog
from app.models.case_messaging import CaseMessageThread
from app.models.case_records import CaseLink
from app.models.lost_found_match import LostFoundMatch
from app.models.lost_pet_alert import LostPetAlert, LostPetCoordination, LostPetSighting
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory
from app.models.user import Barangay, Subdivision, User
from app.routes import cases, lost_found, lost_pet_alerts, reports
from app.services import lost_found_matching as LFM
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, lost_pet_alerts.router, lost_found.router):
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
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@lostfound.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone=phone, address="Blk 9 Lot 15")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rita, omar, nina, noel, olga = (user("Rita Santos", phone="09171110001"), user("Omar Reyes", phone="09172220002"), user("Nina Cruz", phone="09173330003"),
                                user("Noel Garcia", phone="09174440004"), user("Olga Dela", subdivision=2, phone="09175550005"))
leader, leader2, admin = user("Leader Lee", 2, phone="09179990009"), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)


def pet(owner, name, kind, breed, color, markings):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type=kind, breed=breed, color_markings=color, distinctive_markings=markings, gender="Female",
            registered_by_user_id=owner.user_id, registered_by_name=owner.name, photo_url=f"https://res.cloudinary.com/x/{name}.jpg")
    db.add(p)
    db.commit()
    return p


pepper = pet(rita, "Pepper", "Cat", "Domestic Shorthair", "Gray tabby with a white chest", "green collar")
smokey = pet(rita, "Smokey", "Cat", "Domestic Shorthair", "Gray tabby with a white chest", "green collar")
bantay = pet(omar, "Bantay", "Dog", "Aspin", "brown", "a notch in the left ear")
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=2)).replace(microsecond=0).isoformat()
CLUBHOUSE = {"latitude": 14.8008, "longitude": 121.0036, "landmark": "Near the clubhouse"}


def file_lost(who, pet_row, place=CLUBHOUSE, **kw):
    return client.post("/reports/", json={**place, "subdivision_id": 1, "category_id": LOST, "description": "Slipped out of the gate this morning.",
                                          "pet_id": pet_row.pet_id, "last_seen_at": SEEN, **kw}, headers=H(who))


def file_found(who, subdivision=1, place=None, **kw):
    place = place or {"latitude": 14.8010, "longitude": 121.0040, "landmark": "Clubhouse"}
    body = {**place, "subdivision_id": subdivision, "category_id": FOUND, "animal_type": "Cat", "animal_color": "Gray", "estimated_size": "Small",
            "description": "A gray cat with a white chest, tabby stripes and a green collar is hiding under the clubhouse steps.", **kw}
    return client.post("/reports/", json=body, headers=H(who))


def notes(user_id, ntype=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == user_id)
    return q.filter(Notification.type == ntype).all() if ntype else q.all()


def matches(**kw):
    db.expire_all()
    q = db.query(LostFoundMatch)
    for k, v in kw.items():
        q = q.filter(getattr(LostFoundMatch, k) == v)
    return q.order_by(LostFoundMatch.match_id).all()


def staff_notes(report_id):
    db.expire_all()
    return [a.description for a in db.query(AuditLog).filter(AuditLog.action == "CASE_NOTE", AuditLog.target_id == report_id).order_by(AuditLog.log_id).all()]


def timeline(report_id):
    db.expire_all()
    return [h.remarks for h in db.query(StatusHistory).filter(StatusHistory.report_id == report_id).order_by(StatusHistory.history_id).all()]


def decide(who, match_id, decision):
    return client.post(f"/lost-found/matches/{match_id}/decision", json={"decision": decision}, headers=H(who))


# ============================================================================ 1. the comparison itself
def F(**kw):
    base = dict(species="cat", colors=["grey"], size="small", features=["white-chest"], collar=None, lat=14.8008, lng=121.0036, place="Clubhouse",
                at=datetime(2026, 11, 10, 18, 0))
    base.update(kw)
    return LFM.Facts(**base)


same = LFM.compare(F(), F(at=datetime(2026, 11, 10, 20, 0)))
check("the same kind, colours, size, feature, place and time is a strong match with reasons", same["level"] == "strong" and same["score"] >= LFM.STRONG_FROM and len(same["reasons"]) >= 4, str(same["score"]))
check("a different kind of animal can never match", LFM.compare(F(), F(species="dog"))["level"] == "none" and "kinds" in LFM.compare(F(), F(species="dog"))["excluded"])
check("a report that does not say the kind is neither excluded nor credited", LFM.compare(F(species=None), F())["rows"][0]["verdict"] == "unknown")
check("different colours count against it", LFM.compare(F(), F(colors=["black"]))["score"] < same["score"] - 30)
check("an animal found BEFORE it was last seen missing is penalised (beyond the clock allowance)",
      LFM.compare(F(), F(at=datetime(2026, 11, 9, 18, 0)))["score"] < LFM.POSSIBLE_FROM)
check("a difference in the clocks of a few hours is not held against it", LFM.compare(F(), F(at=datetime(2026, 11, 10, 14, 0)))["level"] != "none")
far = LFM.compare(F(), F(lat=14.9, lng=121.1, place="Far away"))
check("places far apart count against it", far["rows"][5]["verdict"] == "differs" and far["score"] < same["score"])
check("collar: the same collar helps, a different one counts little, none said is simply not known",
      LFM.compare(F(collar="green collar"), F(collar="green collar"))["score"] > same["score"] and LFM.compare(F(collar="green collar"), F(collar="red collar"))["rows"][4]["verdict"] == "differs"
      and LFM.compare(F(collar="green collar"), F())["rows"][4]["verdict"] == "unknown")
check("text is read into facts: colours, features, a collar, and 'no collar' means none",
      LFM._colors("Light brown and white") == ["tan", "white"] and "notched-ear" in LFM._features("has a notch in his left ear") and LFM._collar("wearing a green collar") == "green collar"
      and LFM._collar("no collar") is None and LFM._collar("wearing a collar") == "collar")

# ============================================================================ 2. lost first, then found
res = file_lost(rita, pepper)
check("a Lost Pet report is filed", res.status_code == 200, res.text[:300])
lost_id = res.json()["report_id"]
check("nothing to check against yet: no suggestion, and the Leader is not asked anything", matches() == [] and notes(leader.user_id, "lost_found_review") == [])

res = file_found(nina)
check("a Found Animal report is filed by a neighbour", res.status_code == 200, res.text[:300])
found_id = res.json()["report_id"]
pending = matches(status="pending")
check("filing it suggests ONE possible match with the lost report, strong", len(pending) == 1 and pending[0].lost_report_id == lost_id and pending[0].found_report_id == found_id
      and pending[0].level == "strong" and pending[0].score >= LFM.STRONG_FROM and pending[0].reasons, str([(m.level, m.score) for m in pending]))
mid = pending[0].match_id
check("only the Leader is told (one notification), and it names no resident", len(notes(leader.user_id, "lost_found_review")) == 1
      and "Rita" not in notes(leader.user_id, "lost_found_review")[0].message and "Nina" not in notes(leader.user_id, "lost_found_review")[0].message)
check("NEITHER resident is told anything about a suggestion", all(n.type not in ("lost_found_review", "lost_found_linked") for n in notes(rita.user_id) + notes(nina.user_id)))
check("nothing is linked, no status changed, nothing on the resident timelines", db.query(CaseLink).count() == 0
      and client.get(f"/cases/{lost_id}", headers=H(leader)).json()["case_status"] == "reported" and not any("linked" in t.lower() for t in timeline(lost_id) + timeline(found_id)))
check("both reports record the suggestion for the Leader (staff-only notes)", any("possible match" in n for n in staff_notes(lost_id)) and any("possible match" in n for n in staff_notes(found_id)))

# who may see and decide it
check("a resident cannot see possible matches", client.get("/lost-found/matches", headers=H(rita)).status_code == 403 and client.get(f"/lost-found/matches/{mid}", headers=H(nina)).status_code == 403)
check("the Leader of ANOTHER subdivision sees none and cannot open or decide this one", client.get("/lost-found/matches", headers=H(leader2)).json() == []
      and client.get(f"/lost-found/matches/{mid}", headers=H(leader2)).status_code == 403 and decide(leader2, mid, "confirm").status_code == 403)
check("the Leader sees it (and the Administrator, for the subdivision)", [m["match_id"] for m in client.get("/lost-found/matches?status=pending", headers=H(leader)).json()] == [mid]
      and [m["match_id"] for m in client.get("/lost-found/matches?subdivision_id=1", headers=H(admin)).json()] == [mid])
queue = client.get("/cases/work-queue", headers=H(leader)).json()
check("the work queue carries it as a task", [m["match_id"] for m in queue["possible_matches"]] == [mid] and queue["possible_matches"][0]["level"] == "strong")
detail = client.get(f"/lost-found/matches/{mid}", headers=H(leader)).json()
check("the review shows both reports side by side with the reasons, who reported them, and the comparison rows",
      detail["lost"]["title"] == "Pepper" and detail["found"]["reporter"]["name"] == "Nina Cruz" and detail["lost"]["reporter"]["phone"] == "09171110001"
      and [r["key"] for r in detail["rows"]] == ["species", "colors", "size", "features", "collar", "where", "when"] and detail["comparison_reasons"]
      and all(r["verdict"] in ("match", "similar", "differs", "unknown") for r in detail["rows"]))
check("a pair is never suggested twice (scanning again finds nothing new)", client.post("/lost-found/scan", headers=H(leader)).json()["suggested"] == 0 and len(matches()) == 1)

# ============================================================================ 3. confirming
res = decide(leader, mid, "confirm")
check("the Leader confirms the match", res.status_code == 200 and res.json()["status"] == "confirmed", res.text[:300])
db.expire_all()
links = db.query(CaseLink).all()
check("the two reports are LINKED as the same animal, nothing merged or hidden", len(links) == 1 and {links[0].report_id, links[0].related_report_id} == {lost_id, found_id}
      and links[0].link_type == "same_animal" and db.get(Report, lost_id).duplicate_of_report_id is None and db.get(Report, found_id).duplicate_of_report_id is None)
m = matches()[0]
check("the match records who decided, when and the link", m.status == "confirmed" and m.decided_by == leader.user_id and m.decided_at and m.link_id == links[0].link_id)
bridge = db.query(CaseMessageThread).filter(CaseMessageThread.kind == "bridge").one()
check("the OWNER is told, and the notification opens the conversation of the two reports (its related id is the thread's)",
      [(n.title, n.related_id) for n in notes(rita.user_id, "lost_found_bridge")] == [("A found animal report may be your pet", bridge.thread_id)])
check("the FINDER is told too, in the same way", [(n.title, n.related_id) for n in notes(nina.user_id, "lost_found_bridge")] == [("Your found animal report was linked", bridge.thread_id)]
      and "conversation" in notes(nina.user_id, "lost_found_bridge")[0].message)
check("neither message carries a phone number, a name or the finder's own words",
      all(not any(x in n.message for x in ("0917", "Nina", "Rita", "green collar")) for n in notes(rita.user_id, "lost_found_bridge") + notes(nina.user_id, "lost_found_bridge")))
check("the older notice-based notifications are not sent on top of it (one notification, one place)", notes(rita.user_id, "lost_pet_secured") == [] and notes(nina.user_id, "lost_pet_coordination") == [])
check("one Leader-linked pair has one bridge, no competing private invitation or fabricated secured sighting",
      db.query(LostPetCoordination).count() == 0 and db.query(LostPetSighting).count() == 0 and m.coordination_id is None)
check("both timelines say it, neutrally, and both staff histories record who decided", any("linked to a found-animal report" in t for t in timeline(lost_id))
      and any("linked to a lost-pet report" in t for t in timeline(found_id)) and not any(x in " ".join(timeline(lost_id) + timeline(found_id)) for x in ("Rita", "Nina", "Leader Lee"))
      and any("Confirmed as the same animal" in n for n in staff_notes(lost_id)) and any("Confirmed as the same animal" in n for n in staff_notes(found_id)))
check("LINKING IS NOT RECOVERY: both reports stay open, the pet stays Lost, the notice stays active",
      db.get(Report, lost_id).case_status != "closed" and db.get(Report, found_id).case_status != "closed" and db.get(Pet, pepper.pet_id).status == "Lost"
      and db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one().status == "active" and db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one().recovered_at is None)
check("deciding twice is refused (409)", decide(leader, mid, "confirm").status_code == 409 and decide(leader, mid, "reject").status_code == 409)
check("it leaves the work queue", client.get("/cases/work-queue", headers=H(leader)).json()["possible_matches"] == [])

# An independently submitted secured-pet lead still retains its separate mutual-consent/mediation workflow.
alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one()
lead = client.post(f"/lost-pet-alerts/{alert.alert_id}/sightings", data={"latitude": "14.8012", "longitude": "121.0034",
                   "accuracy_confirmed": "true", "sighting_type": "secured", "description": "The cat may be safely with me.",
                   "client_request_id": "independent-secured-lead"}, headers=H(nina))
check("a real secured-pet submission may still create its own private coordination", lead.status_code == 200 and lead.json()["coordination"]["mode"] == "none", lead.text[:200])
c = db.get(LostPetCoordination, lead.json()["coordination"]["coordination_id"])
res = client.post(f"/lost-pet-alerts/coordinations/{c.coordination_id}/mediation", headers=H(nina))
check("the finder can ask the Leader to help (the existing coordination rules apply)", res.status_code == 200, res.text[:200])
check("...and it becomes a task for the Leader in the work queue", [x["coordination_id"] for x in client.get("/cases/work-queue", headers=H(leader)).json()["coordinations"]] == [c.coordination_id])

# ============================================================================ 4. several found reports, one lost report
res = file_found(noel, place={"latitude": 14.8012, "longitude": 121.0034, "landmark": "Clubhouse steps"})
second_found = res.json()["report_id"]
check("a SECOND found report that looks like the same cat is suggested too (the lost report is still open)",
      [(m.lost_report_id, m.found_report_id, m.status) for m in matches(found_report_id=second_found)] == [(lost_id, second_found, "pending")])
res = decide(leader, matches(found_report_id=second_found)[0].match_id, "confirm")
db.expire_all()
check("a lost report can have SEVERAL confirmed found reports, each confirmed on its own", res.status_code == 200 and len(matches(lost_report_id=lost_id, status="confirmed")) == 2
      and db.query(CaseLink).count() == 2)
check("each found report is linked to one lost report", len(matches(found_report_id=found_id, status="confirmed")) == 1 and len(matches(found_report_id=second_found, status="confirmed")) == 1)

# ============================================================================ 5. a found report links to ONE lost report
res = file_lost(rita, smokey)
smokey_report = res.json()["report_id"]
check("a found report that is already linked is NEVER suggested for another lost report", [m for m in matches(lost_report_id=smokey_report)] == [], str([(m.found_report_id) for m in matches(lost_report_id=smokey_report)]))

# two lost reports compete for ONE new found report
res = file_lost(omar, bantay)
bantay_report = res.json()["report_id"]
black_res = file_found(nina, animal_type="Dog", animal_color="Black", estimated_size="Large", place={"latitude": 14.8011, "longitude": 121.0038, "landmark": "Clubhouse"},
                       description="A big black dog with no collar is resting by the clubhouse.")
check("a found dog is filed", black_res.status_code == 200, black_res.text[:300])
dog_found = black_res.json()["report_id"]
check("a found dog that does not look like the lost brown dog is not suggested for it", matches(found_report_id=dog_found) == [])

# ============================================================================ 6. found first, then lost; ruling it out
res = file_found(noel, animal_type="Dog", animal_color="Brown", estimated_size="Medium", place={"latitude": 14.8010, "longitude": 121.0039, "landmark": "Clubhouse"},
                 description="A friendly brown dog with a notch in the left ear showed up at the clubhouse.")
dog_two = res.json()["report_id"]
check("the brown dog found at the clubhouse matches the lost brown dog (Bantay) reported EARLIER: matching works in both directions",
      [(m.lost_report_id, m.found_report_id, m.status) for m in matches(found_report_id=dog_two)] == [(bantay_report, dog_two, "pending")])
dm = matches(found_report_id=dog_two)[0]
check("a dog never matches the cat reports", all(m.lost_report_id == bantay_report for m in matches(found_report_id=dog_two)) and matches(found_report_id=dog_two)[0].level in ("strong", "possible"))
told_before = (len(notes(omar.user_id)), len(notes(noel.user_id)))
res = decide(leader, dm.match_id, "reject")
db.expire_all()
check("the Leader rules it out: kept, nothing linked", res.status_code == 200 and res.json()["status"] == "rejected" and db.query(CaseLink).count() == 2)
check("...and NOBODY is told (neither the owner nor the finder gets a notification)", (len(notes(omar.user_id)), len(notes(noel.user_id))) == told_before)
check("...but both reports record the decision for the Leader", any("not the same animal" in n for n in staff_notes(bantay_report)) and any("not the same animal" in n for n in staff_notes(dog_two)))
check("a ruled-out pair is not suggested again", client.post("/lost-found/scan", headers=H(leader)).json()["suggested"] == 0 and len(matches(found_report_id=dog_two)) == 1)
check("it can be reviewed again", decide(leader, dm.match_id, "reopen").json()["status"] == "pending" and decide(leader, dm.match_id, "reopen").status_code == 409)
check("...and then confirmed", decide(leader, dm.match_id, "confirm").json()["status"] == "confirmed")

# ============================================================================ 7. competing suggestions and closed reports
rival = pet(rita, "Rival", "Dog", "Aspin", "brown", "a notch in the left ear")
rival_report = file_lost(rita, rival).json()["report_id"]
third = file_found(nina, animal_type="Dog", animal_color="Brown", estimated_size="Medium", place={"latitude": 14.8009, "longitude": 121.0037, "landmark": "Near the clubhouse"},
                   description="A brown dog with a notch in the left ear is near the clubhouse.").json()["report_id"]
both = matches(found_report_id=third)
check("one found report can be suggested for several lost reports (the Leader decides which)", {m.lost_report_id for m in both} >= {rival_report} and all(m.status == "pending" for m in both))
pick = next(m for m in both if m.lost_report_id == rival_report)
decide(leader, pick.match_id, "confirm")
others = [m for m in matches(found_report_id=third) if m.match_id != pick.match_id]
check("once it is linked to one, its other suggestions become moot and leave the queue", all(m.status == "moot" for m in others)
      and not any(q["found_report_id"] == third for q in client.get("/cases/work-queue", headers=H(leader)).json()["possible_matches"]))

# a closed report is no longer suggested, and a pending suggestion leaves the queue when a report closes
closed_pet = pet(omar, "Closed", "Cat", "Domestic Shorthair", "Gray tabby with a white chest", "green collar")
closed_report = file_lost(omar, closed_pet).json()["report_id"]
fresh_found = file_found(nina, place={"latitude": 14.8011, "longitude": 121.0038, "landmark": "Clubhouse"}).json()["report_id"]
pend = [m for m in matches(found_report_id=fresh_found) if m.lost_report_id == closed_report]
check("a new found cat is suggested for the open lost cat", len(pend) == 1 and pend[0].status == "pending")
db.query(Report).filter(Report.report_id == closed_report).update({"case_status": "closed", "current_status_id": 17})
db.commit()
check("when the lost report closes, the suggestion leaves the queue", not any(q["match_id"] == pend[0].match_id for q in client.get("/cases/work-queue", headers=H(leader)).json()["possible_matches"]))
check("...and a closed report cannot be linked (409)", decide(leader, pend[0].match_id, "confirm").status_code == 409)
later = file_found(noel, place={"latitude": 14.8011, "longitude": 121.0038, "landmark": "Clubhouse"}).json()["report_id"]
check("...and a new found report is not suggested for a closed lost report", [m for m in matches(found_report_id=later) if m.lost_report_id == closed_report] == [])

# ============================================================================ 8. other subdivisions, other kinds, and a failing check
olga_found = file_found(olga, subdivision=2)
check("a found report in ANOTHER subdivision is never matched with this subdivision's lost reports", olga_found.status_code == 200 and matches(found_report_id=olga_found.json()["report_id"]) == [])
before = len(matches())
parrot = file_found(nina, animal_type="Bird", animal_color="Green", description="A green parrot landed on the court.")
check("a bird matches no lost cat or dog (and the Leader is not asked anything)", parrot.status_code == 200 and len(matches()) == before)

original = LFM.suggest_for_report
LFM.suggest_for_report = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
try:
    survived = file_found(nina, place={"latitude": 14.8011, "longitude": 121.0038, "landmark": "Clubhouse"})
finally:
    LFM.suggest_for_report = original
db.expire_all()
check("if the background check fails, the report is STILL filed (it never blocks a resident)", survived.status_code == 200
      and db.query(Report).filter(Report.report_id == survived.json()["report_id"]).count() == 1)

# the scan picks the missed pair up later, from either side
check("a later scan suggests what the failed check missed", client.post("/lost-found/scan", headers=H(leader)).json()["suggested"] >= 1)
check("a resident cannot run the scan", client.post("/lost-found/scan", headers=H(rita)).status_code == 403)
check("the Administrator must name the subdivision", client.post("/lost-found/scan", headers=H(admin)).status_code == 422 and client.post("/lost-found/scan?subdivision_id=1", headers=H(admin)).status_code == 200)

print(f"\n{PASSED} checks passed")
