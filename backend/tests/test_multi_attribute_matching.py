"""
Multi-attribute animal matching (utils/match_scoring.py, services/lost_found_matching.py, routes/matches.py, docs/01-system/MULTI_ATTRIBUTE_MATCHING.md):

  - the engine: location (Haversine, classes, never a rejection), breed (normalized, Aspin/mixed/unknown), coat (families, partial, patterns,
    markings are not coat colours), description (distinctive features weigh more, contradictions count), visual (the stored AI comparison)
  - the combination: weights renormalized over what could be compared, missing information never a zero, no inflation from one attribute,
    the classification, explanations built only from what the records say, configurable weights and thresholds
  - lost/found: the stored breakdown, Under review with notes, confirm/reject with notes (who, when, notes, final status), recalculation keeps
    the earlier result, the AI photo comparison (and when it is off), the configuration API (Administrator only)
  - Pet Registry: a registered pet is scored on all five attributes, and a resident never sees the distance to another resident's home
Offline: a throwaway SQLite file through tests/_isolated_db.py. Run from the backend folder:  python tests/test_multi_attribute_matching.py
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
from app.models.lost_found_match import LostFoundMatch
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.routes import cases, lost_found, lost_pet_alerts, reports
from app.services import lost_found_matching as LFM
from app.utils import match_scoring as MS
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


P = MS.Profile

# ============================================================================================== 1. the engine
spec_lost = P(species="dog", breed="Aspin", colors=["Brown", "White"], size="medium",
              texts=["Medium-sized brown dog with a white patch on its chest and a dark mark near its left eye."], lat=14.8008, lng=121.0036, subdivision_id=1)
spec_pet = P(species="dog", breed="aspin", colors=["Brown", "White"], size="Medium",
             texts=["Brown Aspin, medium-sized, white chest marking, dark spot beside the left eye."], lat=14.8035, lng=121.0050, subdivision_id=1)
full = MS.analyze(spec_lost, spec_pet, vision={"individual_similarity_score": 92, "reason": "same white chest and facial spot"}, b_label="the registered owner's home pin")
A = full["attributes"]
check("the request's example: Strong Possible Match from all five attributes, 100% of the information",
      full["classification"] == "strong" and full["coverage"] == 100 and full["attributes_compared"] == 5 and full["score"] >= 85, str(full["score"]))
check("each attribute has its own 0-100 score and explanation", all(isinstance(A[a]["score"], int) and A[a]["explanation"] for a in MS.ATTRIBUTES))
check("location: Haversine distance, a proximity class, and the distance in the explanation",
      A["location"]["proximity"] == "Nearby" and 300 <= A["location"]["distance_m"] <= 360 and "approximately" in A["location"]["explanation"])
check("breed: Aspin and aspin are a strong breed match", A["breed"]["score"] == 100 and "Strong breed match" in A["breed"]["explanation"])
check("coat: both brown and white", A["coat"]["score"] == 100 and "brown and white" in A["coat"]["explanation"])
check("description: the white chest and the mark near the left eye are named, nothing invented",
      "white chest" in A["description"]["explanation"] and "left eye" in A["description"]["explanation"] and "scar" not in A["description"]["explanation"])
check("visual: the stored AI score and its reason", A["visual"]["score"] == 92 and "same white chest" in A["visual"]["explanation"])
check("a similarity percentage is never presented as ownership", "not a probability of ownership" in full["disclaimer"])

r = MS.analyze(P(species="dog", breed="Mixed Breed"), P(species="dog", breed="Unknown"))
check("Mixed Breed vs Unknown: Insufficient Breed Information, not a mismatch",
      r["attributes"]["breed"]["score"] is None and "Insufficient breed information" in r["attributes"]["breed"]["explanation"])
check("breed spellings and local names are normalized", MS.normalize_breed("askal")[0] == "aspin" and MS.normalize_breed("Shi Tzu")[0] == "shih tzu"
      and MS.normalize_breed("Pusang Pinoy")[0] == "puspin" and MS.normalize_breed("Shih Tzu mix") == ("shih tzu", True) and MS.normalize_breed("not sure")[0] is None)
check("Aspin vs mixed is a similar breed description; Aspin vs Shih Tzu is partly compatible; Beagle vs Pug differs",
      MS.score_breed(P(breed="Aspin"), P(breed="Mixed"))["score"] == 65 and MS.score_breed(P(breed="Aspin"), P(breed="Shih Tzu"))["score"] == 40
      and MS.score_breed(P(breed="Beagle"), P(breed="Pug"))["score"] == 10)

one = MS.analyze(P(species="dog", lat=14.8, lng=121.0), P(species="dog", lat=14.8, lng=121.0))
check("one attribute alone is Insufficient Information and its 100% is not inflated into a high overall score",
      one["classification"] == "insufficient" and one["raw_score"] == 100 and one["score"] < 50 and one["notes"])
check("missing attributes are not zeros: weights are spread over what was compared",
      one["attributes"]["location"]["effective_weight"] == 100.0 and one["attributes"]["breed"]["score"] is None)
check("a different kind of animal is excluded", MS.analyze(P(species="dog"), P(species="cat"))["classification"] == "excluded")

far = MS.score_location(P(lat=14.80, lng=121.00, subdivision_id=1), P(lat=14.95, lng=121.20, subdivision_id=2), MS.DEFAULT_CONFIG)
check("far away lowers the location score but never to zero", far["proximity"] == "Farther Away" and 0 < far["score"] <= 50)
check("no coordinates: the same subdivision still counts, nothing at all is Unknown",
      MS.score_location(P(subdivision_id=1), P(subdivision_id=1), MS.DEFAULT_CONFIG)["proximity"] == "Same Subdivision"
      and MS.score_location(P(), P(), MS.DEFAULT_CONFIG)["score"] is None and MS.score_location(P(lat=0, lng=0), P(lat=0, lng=0), MS.DEFAULT_CONFIG)["score"] is None)

check("coat: colour variations normalized, partial matches, patterns", MS.coat_of(["Black with brown markings"]) == (["black", "brown"], {"markings"})
      and MS.coat_of(["White with black spots"]) == (["white", "black"], {"spotted"}) and MS.coat_of(["Golden"])[0] == ["golden"])
check("coat: a marking colour is not a coat colour ('a white chest')", MS.coat_of(["Gray tabby with a white chest"]) == (["grey"], {"tabby"}))
part = MS.score_coat(P(colors=["Brown", "White"]), P(colors=["Brown"]))
check("coat: brown-and-white vs brown is a partial match", 40 <= part["score"] < 100 and "Partial" in part["explanation"])
check("coat: no colours on one side is not compared", MS.score_coat(P(colors=["Brown"]), P())["score"] is None)

d = MS.score_description(P(texts=["large dog, floppy ears, long fur"]), P(texts=["small dog with erect ears and short fur"]))
check("description: contradictions (ears, fur length, size) count against it and are explained", d["score"] == 0 and "floppy ears vs erect" in d["explanation"])
g = MS.score_description(P(texts=["short fur and floppy ears"]), P(texts=["floppy ears, short haired"]))
check("description: generic characteristics alone never score as high as distinctive ones", g["score"] <= 55 and "Generic" in g["explanation"])
check("description: a missing description is not compared", MS.score_description(P(texts=["scar on nose"]), P())["score"] is None)
check("description: 'no collar' is not a collar", "collar" not in MS.features_of("no collar, thin dog"))

# ============================================================================================== 2. configuration
cfg = MS.validate_config({"weights": {"visual": 0, "location": 50, "breed": 50, "coat": 0, "description": 0}})
check("weights are configurable (here: location and breed only)", MS.analyze(spec_lost, spec_pet, cfg)["coverage"] == 100
      and MS.analyze(spec_lost, spec_pet, cfg)["attributes"]["visual"]["available"] is False)
for bad in ({"weights": {"visual": -1}}, {"weights": {a: 0 for a in MS.ATTRIBUTES}}, {"thresholds": {"potential": 90, "strong": 80}}):
    try:
        MS.validate_config(bad)
        check(f"invalid config refused {bad}", False)
    except ValueError:
        check(f"invalid config refused {bad}", True)

# ============================================================================================== 3. lost/found review flow
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


def user(name, role=1, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@multi.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone="09170000000", address="Blk 9 Lot 15 Acacia St")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


rita, nina, leader, leader2, admin = user("Rita Santos"), user("Nina Cruz"), user("Leader Lee", 2), user("Leader Two", 2, 2), user("Admin Ada", 4, None)
pepper = Pet(owner_id=rita.user_id, pet_name="Pepper", pet_type="Cat", breed="Puspin", color_markings="Gray tabby with a white chest",
             distinctive_markings="notched left ear, green collar", gender="Female", registered_by_user_id=rita.user_id, registered_by_name=rita.name,
             photo_url="https://res.cloudinary.com/x/pepper.jpg", registered_latitude=14.8008, registered_longitude=121.0036)
db.add(pepper)
db.commit()
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=2)).replace(microsecond=0).isoformat()
lost_id = client.post("/reports/", json={"latitude": 14.8008, "longitude": 121.0036, "landmark": "Clubhouse", "subdivision_id": 1, "category_id": LOST,
                                         "description": "Slipped out of the gate this morning.", "pet_id": pepper.pet_id, "last_seen_at": SEEN},
                      headers=H(rita)).json()["report_id"]
res = client.post("/reports/", json={"latitude": 14.8012, "longitude": 121.0041, "landmark": "Clubhouse steps", "subdivision_id": 1, "category_id": FOUND,
                                     "animal_type": "Cat", "animal_color": "Gray", "estimated_size": "Small",
                                     "description": "A gray tabby cat with a white chest and a notched ear, wearing a green collar."}, headers=H(nina))
found_id = res.json()["report_id"]
db.expire_all()
m = db.query(LostFoundMatch).filter(LostFoundMatch.lost_report_id == lost_id, LostFoundMatch.found_report_id == found_id).first()
check("filing the found report stores a suggestion with its breakdown and algorithm", m is not None and m.algorithm == MS.ALGORITHM
      and isinstance(m.analysis, dict) and m.analysis["classification"] in ("strong", "potential") and m.history == [], str(m and m.analysis))
mid = m.match_id
check("the suggestion is audited with its attribute scores (no contact details)",
      db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_SUGGESTED", AuditLog.target_id == mid).count() == 1
      and "attribute_scores" in db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_SUGGESTED", AuditLog.target_id == mid).first().new_values
      and "0917" not in str(db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_SUGGESTED", AuditLog.target_id == mid).first().new_values))
check("the Leader's notification names both references and the similarity, and no resident",
      any("Potential Animal Match Detected" == n.title and "SS-" in n.message and "%" in n.message and "Rita" not in n.message and "Nina" not in n.message
          for n in db.query(app.models.notification.Notification).filter_by(user_id=leader.user_id, type="lost_found_review").all()))
check("a Leader of another subdivision cannot see it", client.get(f"/lost-found/matches/{mid}", headers=H(leader2)).status_code == 403)
check("a resident cannot see it", client.get(f"/lost-found/matches/{mid}", headers=H(rita)).status_code == 403)

res = client.post(f"/lost-found/matches/{mid}/decision", json={"decision": "under_review", "note": "Asked the guard to check the collar."}, headers=H(leader))
check("a Leader marks it Under review with a note", res.status_code == 200 and res.json()["status"] == "under_review"
      and "Asked the guard to check the collar." in res.json()["review_note"] and "Leader Lee" in res.json()["review_note"], res.text[:300])
check("Under review is still waiting for a decision (the work queue keeps it)", mid in [x["match_id"] for x in LFM.queue_rows(db, 1, [lost_id, found_id])])
check("marking it again is refused", client.post(f"/lost-found/matches/{mid}/decision", json={"decision": "under_review"}, headers=H(leader)).status_code == 409)
check("nothing is linked and no resident is told while it is under review", db.query(app.models.case_records.CaseLink).count() == 0)

# recalculation keeps the earlier result
before = res.json()["score"]
r = db.get(Report, found_id)
r.description = "A gray tabby cat. Large and stocky, with floppy ears."
r.estimated_size = "Large"
db.commit()
res = client.post(f"/lost-found/matches/{mid}/rescore", headers=H(leader))
check("recalculating with changed details changes the score and keeps the earlier result in the history",
      res.status_code == 200 and res.json()["score"] != before and len(res.json()["history"]) == 1 and res.json()["history"][0]["score"] == before
      and res.json()["history"][0]["replaced_because"] == "Recalculated by a Leader.", res.text[:400])
check("the recalculation is audited", db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_RESCORED", AuditLog.target_id == mid).count() == 1)
check("recalculating again with nothing new adds nothing", len(client.post(f"/lost-found/matches/{mid}/rescore", headers=H(leader)).json()["history"]) == 1)

# AI photo comparison
import app.utils.ai_suggestions as ai_sugg  # noqa: E402
import app.utils.ai_matching as ai_matching  # noqa: E402
ai_sugg.is_gemini_enabled_in_db = lambda db=None: False
db.get(Report, lost_id).pet_snapshot = {**(db.get(Report, lost_id).pet_snapshot or {}), "pet": {**((db.get(Report, lost_id).pet_snapshot or {}).get("pet") or {}),
                                                                                                  "photos": ["https://res.cloudinary.com/x/pepper.jpg"]}}
db.commit()
res = client.post(f"/lost-found/matches/{mid}/photo-comparison", headers=H(leader))
check("without a photo on the found report the AI comparison is refused, and says why", res.status_code == 422 and "photo" in res.json()["detail"])
from app.models.report import ReportMedia  # noqa: E402
db.add(ReportMedia(report_id=found_id, file_url="https://res.cloudinary.com/x/found.jpg", media_type="Image"))
db.commit()
res = client.post(f"/lost-found/matches/{mid}/photo-comparison", headers=H(leader))
check("with the AI turned off by the administrator it is refused, and the other attributes still count", res.status_code == 409 and "turned off" in res.json()["detail"])
from PIL import Image  # noqa: E402
ai_sugg.is_gemini_enabled_in_db = lambda db=None: True
ai_matching._load_image = lambda url: Image.new("RGB", (8, 8))
ai_matching.compare_animals_vision = lambda *a, **k: {"individual_similarity_score": 88, "final_assessment": "POTENTIAL MATCH", "reason": "same notched ear",
                                                       "_model": "test-model"}
res = client.post(f"/lost-found/matches/{mid}/photo-comparison", headers=H(leader))
check("with the AI on: the photo comparison is stored, the visual attribute is scored and the match recalculated (history kept)",
      res.status_code == 200 and res.json()["has_photo_comparison"] and res.json()["analysis"]["attributes"]["visual"]["score"] == 88
      and len(res.json()["history"]) == 2 and "same notched ear" in res.json()["analysis"]["attributes"]["visual"]["explanation"], res.text[:400])
check("the photo comparison is audited with the model", db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_PHOTO_COMPARED").first().new_values["model"] == "test-model")

res = client.post(f"/lost-found/matches/{mid}/decision", json={"decision": "reject", "note": "The collar is a different shade; owner's cat is home."}, headers=H(leader))
db.expire_all()
m = db.get(LostFoundMatch, mid)
check("ruling it out from Under review records who, when, the notes and the final status",
      res.status_code == 200 and m.status == "rejected" and m.decided_by == leader.user_id and m.decided_at is not None and "different shade" in m.review_note)
audit = db.query(AuditLog).filter(AuditLog.action == "LOST_FOUND_MATCH_REJECTED", AuditLog.target_id == mid).first()
check("the decision's audit row carries the previous status, the scores and the note",
      audit.old_values == {"status": "under_review"} and audit.new_values["note"].startswith("The collar") and "attribute_scores" in audit.new_values)
check("a decided match keeps the result it was decided on", client.post(f"/lost-found/matches/{mid}/rescore", headers=H(leader)).status_code == 409)
check("nothing about ownership changed: the lost report is still open and the pet is still lost-or-active",
      not LFM.case_state.is_closed(db.get(Report, lost_id)) and db.get(Pet, pepper.pet_id).owner_id == rita.user_id)

# configuration API
check("a Leader can read the configuration", client.get("/lost-found/matching-config", headers=H(leader)).json()["config"]["weights"]["visual"] == 35)
check("a Leader cannot change it", client.put("/lost-found/matching-config", json={"weights": {"visual": 50}}, headers=H(leader)).status_code == 403)
check("a resident cannot read it", client.get("/lost-found/matching-config", headers=H(rita)).status_code == 403)
check("the Administrator cannot save an invalid one", client.put("/lost-found/matching-config", json={"weights": {"visual": 500}}, headers=H(admin)).status_code == 422)
res = client.put("/lost-found/matching-config", json={"weights": {"visual": 40, "location": 20, "breed": 10, "coat": 15, "description": 15}}, headers=H(admin))
check("the Administrator changes the weights; it is audited and used from then on", res.status_code == 200 and MS.load_config(db)["weights"]["visual"] == 40
      and db.query(AuditLog).filter(AuditLog.action == "MATCHING_CONFIG_UPDATED").count() == 1, res.text[:300])

# ============================================================================================== 4. Pet Registry candidates
from app.routes import matches as matches_mod  # noqa: E402
ai_sugg.is_gemini_enabled_in_db = lambda db=None: False
matches_mod.is_gemini_vision_enabled = lambda db=None: False
db.expire_all()
found = db.get(Report, found_id)
found.description = "A gray tabby cat with a white chest and a notched ear, wearing a green collar."
found.estimated_size = "Small"
db.commit()
calc = matches_mod.calculate_match_details(found, db.get(Pet, pepper.pet_id), is_pet=True, db=db)
ma = calc["evidence"]["multi_attribute"]
check("a registered pet is scored on location, breed, coat and description together (not on one engine alone)",
      ma["algorithm"] == MS.ALGORITHM and ma["attributes"]["location"]["available"] and ma["attributes"]["coat"]["available"]
      and ma["attributes"]["description"]["available"] and calc["score"] == ma["score"] and "single_engine_score" in calc["evidence"], str(ma["score"]))
check("its explanation is built from the comparison", calc["explanation"].startswith(ma["classification_label"]) and "notched" in " ".join(ma["explanations"]))
check("the registered home is described only by distance (never an address)", "Acacia" not in str(ma) and "Blk" not in str(ma))

from app.schemas.report_match import ReportMatchResponse  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
rm = ReportMatch(source_report_id=found_id, matched_pet_id=pepper.pet_id, similarity_score=calc["score"], status="AI_SUGGESTED",
                 ai_explanation=calc["explanation"], ai_evidence=calc["evidence"])
db.add(rm)
db.commit()
resp = ReportMatchResponse.model_validate(rm, from_attributes=True)
redacted = matches_mod._redact_for_resident(resp, nina)
loc = redacted.ai_evidence["multi_attribute"]["attributes"]["location"]
check("a resident (the finder) never sees the distance to another resident's home", loc["distance_m"] is None and "staff only" in loc["explanation"]
      and not any("approximately" in e for e in redacted.ai_evidence["multi_attribute"]["explanations"]))
own = matches_mod._redact_for_resident(ReportMatchResponse.model_validate(rm, from_attributes=True), rita)
check("the pet's own owner still sees it", own.ai_evidence["multi_attribute"]["attributes"]["location"]["distance_m"] is not None)

print(f"\n{PASSED} checks passed")
