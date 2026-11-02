"""
Manual Report Matching (docs/01-system/MANUAL_REPORT_MATCHING.md): works with Gemini OFF, filters reports, lists
candidates without any score, saves one match row per pair, keeps every decision (rejections included) in the log,
never merges unless asked, and keeps staff inside their own area.
Run from the backend folder:  python tests/test_manual_matching.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "manual_matching_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-manual-matching-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.manual_match import ManualMatchDecision  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportCategory, ReportStatus, StatusHistory  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims, manual_matching, matches, pet_match_confirmations, reports  # noqa: E402
from app.utils import ai_suggestions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

os.environ.pop("GEMINI_API_KEY", None)  # after the imports: app.database loads .env
Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (manual_matching.router, matches.router, reports.router, pet_match_confirmations.router, claims.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for cid, name in ((1, "Injured"), (4, "Roaming Animal"), (6, "Lost Pet")):
    db.add(ReportCategory(category_id=cid, category_name=name))
db.add(SystemSetting(setting_key="gemini_vision_matching", setting_value="attribute_only", is_enabled=False))


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subd, barangay_id=1, phone="09170000000")
    db.add(u)
    db.flush()
    return u


res, leader, leader2, staff = mk("Res", 1), mk("Leader", 2), mk("LeaderTwo", 2, subd=2), mk("Staff", 3)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HL, HL2, HS, HR = H(leader), H(leader2), H(staff), H(res)
CLOCK = [datetime(2026, 10, 1)]
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(cat=4, subd=1, lat=14.8, lng=121.0, **kw):
    CLOCK[0] += timedelta(hours=1)
    r = Report(user_id=res.user_id, subdivision_id=subd, category_id=cat, latitude=lat, longitude=lng,
               current_status_id=2, assigned_leader_id=leader.user_id if subd == 1 else leader2.user_id,
               created_at=CLOCK[0], **kw)
    db.add(r)
    db.commit()
    return r.report_id


lost = report(cat=6, animal_type="Dog", animal_breed="Aspin", animal_color="Brown, White", description="Red collar, limps",
              landmark="Near the chapel")
stray1 = report(animal_type="Dog", animal_breed="Aspin mix", animal_color="Brown", description="Wearing a red collar")
stray2 = report(animal_type="Dog", animal_breed="Shih Tzu", animal_color="White", lat=14.9, lng=121.1)  # ~15 km away
cat1 = report(animal_type="Cat", animal_color="Black")
other_subd = report(subd=2, animal_type="Dog", animal_color="Brown")
db.add(HoldingAnimal(report_id=stray1, sex="Male", animal_type="Dog"))
db.commit()

# ── AI status ──
ai_suggestions.invalidate_gemini_setting_cache()
r = client.get("/manual-matching/status", headers=HL)
check("status: Gemini OFF -> manual mode active", r.status_code == 200 and r.json()["state"] == "disabled"
      and r.json()["manual_mode_active"] is True, r.text[:200])
check("status: residents can't use manual matching", client.get("/manual-matching/status", headers=HR).status_code == 403)
s = db.query(SystemSetting).first()
s.is_enabled = True
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()
check("status: Gemini ON but no API key -> not_configured, manual mode",
      client.get("/manual-matching/status", headers=HL).json()["state"] == "not_configured")
os.environ["GEMINI_API_KEY"] = "test-key"
ai_suggestions._gemini_health.update(last_failure_at=__import__("time").time(), last_error="APIError: 503")
st = client.get("/manual-matching/status", headers=HL).json()
check("status: a recent Gemini API error -> error, manual mode", st["state"] == "error" and st["manual_mode_active"], st)
ai_suggestions._gemini_health.update(last_success_at=__import__("time").time() + 1)
check("status: a later success -> operational",
      client.get("/manual-matching/status", headers=HL).json()["state"] == "operational")
os.environ.pop("GEMINI_API_KEY")
s.is_enabled = False
db.commit()
ai_suggestions.invalidate_gemini_setting_cache()

# ── Filtering ──
ids = lambda resp: {x["report_id"] for x in resp.json()["results"]}  # noqa: E731
r = client.get("/manual-matching/reports", headers=HL)
check("search: a leader sees only their own subdivision", r.status_code == 200 and ids(r) == {lost, stray1, stray2, cat1}, r.text[:300])
# Barangay scope (app/utils/matching_scope.py): Barangay-managed cases and published Lost Pet reports only
check("scope: barangay staff don't see internal subdivision reports", ids(client.get("/manual-matching/reports", headers=HS)) == {stray1},
      ids(client.get("/manual-matching/reports", headers=HS)))
db.add(StatusHistory(report_id=other_subd, report_status_id=4, updated_by=leader2.user_id))  # escalated to the Barangay
lost_row = db.get(Report, lost)
lost_row.visibility, lost_row.visibility_decided_by = "Public", leader.user_id  # the owner's Lost Pet report is published
db.commit()
check("scope: staff see escalated cases, holding intakes and published Lost Pet reports",
      ids(client.get("/manual-matching/reports", headers=HS)) == {lost, stray1, other_subd})
check("search: report type lost", ids(client.get("/manual-matching/reports?report_type=lost", headers=HL)) == {lost})
check("search: animal type cat", ids(client.get("/manual-matching/reports?animal_type=Cat", headers=HL)) == {cat1})
check("search: breed text", ids(client.get("/manual-matching/reports?breed=aspin", headers=HL)) == {lost, stray1})
check("search: color text", ids(client.get("/manual-matching/reports?color=white", headers=HL)) == {lost, stray2})
check("search: sex comes from the holding record", ids(client.get("/manual-matching/reports?gender=Male", headers=HL)) == {stray1})
check("search: distinguishing features", ids(client.get("/manual-matching/reports?features=red+collar", headers=HL)) == {lost, stray1})
check("search: radius", ids(client.get("/manual-matching/reports?lat=14.8&lng=121.0&radius_km=2", headers=HL)) == {lost, stray1, cat1})
check("search: LIKE wildcards in the text are literal", ids(client.get("/manual-matching/reports?breed=%25", headers=HL)) == set())
check("search: location text (landmark)", ids(client.get("/manual-matching/reports?location=chapel", headers=HL)) == {lost})
check("search: location text (subdivision)", ids(client.get("/manual-matching/reports?location=S2", headers=HS)) == {other_subd})
check("search: date range", ids(client.get("/manual-matching/reports?date_from=2026-10-02", headers=HL)) == set())
row = next(x for x in client.get("/manual-matching/reports", headers=HL).json()["results"] if x["report_id"] == stray1)
check("result card: type, characteristics, location, status, reporter",
      row["report_type"] == "Stray Animal" and row["gender"] == "Male" and row["reporter"]["name"] == "Res"
      and "email" not in row["reporter"] and row["status"] == "S2", row)

# ── Candidates ──
r = client.get(f"/manual-matching/reports/{lost}/candidates?report_type=stray&animal_type=Dog", headers=HL)
body = r.json()
check("candidates: several candidates for one report", r.status_code == 200 and ids(r) == {stray1, stray2}, r.text[:300])
check("candidates: no similarity score or percentage anywhere", "similarity" not in r.text and "%" not in r.text)
c1 = next(x for x in body["results"] if x["report_id"] == stray1)
check("candidates: plain shared details and distance", c1["shared_details"] and c1["distance_km"] == 0.0 and c1["pair"] is None, c1)
check("candidates: radius is measured from the report",
      ids(client.get(f"/manual-matching/reports/{lost}/candidates?radius_km=2", headers=HL)) == {stray1, cat1})
check("candidates: outside the leader's area -> 403",
      client.get(f"/manual-matching/reports/{other_subd}/candidates", headers=HL).status_code == 403)

# ── Decisions ──
dec = lambda a, b, d, h=HL, **kw: client.post("/manual-matching/decisions", headers=h, json={  # noqa: E731
    "report_a_id": a, "report_b_id": b, "decision": d, "notes": kw.pop("notes", "Checked both photos"), **kw})
check("decision: notes are required", dec(lost, stray2, "NOT_A_MATCH", notes="no").status_code == 422)
check("decision: unknown decision refused", dec(lost, stray2, "MAYBE").status_code == 400)
r = dec(lost, stray2, "NOT_A_MATCH")
check("reject: saved", r.status_code == 200 and r.json()["status"] == "NOT_A_MATCH", r.text[:300])
m = db.query(ReportMatch).filter(ReportMatch.match_id == r.json()["match_id"]).first()
check("reject: one match row with no AI score, marked manual",
      m and m.similarity_score == 0 and m.ai_evidence.get("engine") == "manual" and m.reviewed_by == leader.user_id)
r = dec(stray2, lost, "NOT_A_MATCH")
check("duplicate: same decision on the same pair (either order) is refused", r.status_code == 409, r.text[:200])
check("duplicate: still one match row", db.query(ReportMatch).filter(ReportMatch.matched_pet_id.is_(None)).count() == 1)
r = dec(lost, stray2, "UNABLE_TO_VERIFY")
check("change: needs further verification updates the same row", r.status_code == 200 and r.json()["match_id"] == m.match_id)
db.expire_all()
log = db.query(ManualMatchDecision).filter(ManualMatchDecision.match_id == m.match_id).all()
check("audit: the rejection is still on record after the change", [d.decision for d in log] == ["NOT_A_MATCH", "UNABLE_TO_VERIFY"]
      and log[0].staff_id == leader.user_id and log[0].ai_state == "disabled" and log[1].previous_status == "NOT_A_MATCH")

r = dec(lost, stray1, "CONFIRMED_MATCH")
check("confirm: saved with Gemini OFF", r.status_code == 200 and r.json()["linked_case_id"] is None, r.text[:300])
db.expire_all()
a, b = db.get(Report, lost), db.get(Report, stray1)
check("confirm: original reports are not merged or changed", a.duplicate_of_report_id is None and b.duplicate_of_report_id is None
      and b.current_status_id == 2 and b.description == "Wearing a red collar")
check("confirm: the lost-pet reporter is notified", any(n.title == "Possible Match Confirmed by Staff"
                                                         for n in db.query(app.models.Notification).all()))
r = client.get(f"/manual-matching/reports/{lost}/candidates", headers=HL)
c1 = next(x for x in r.json()["results"] if x["report_id"] == stray1)
check("refresh: candidates show the saved decision", c1["pair"]["status"] == "CONFIRMED_MATCH" and c1["pair"]["decided_manually"])
check("link: only a confirmed match can be linked", dec(lost, cat1, "NOT_A_MATCH", link_case=True).status_code == 400)
r = dec(lost, stray1, "CONFIRMED_MATCH", link_case=True, notes="Same red collar and limp on both photos")
db.expire_all()
check("link: an explicit choice links both into one case", r.status_code == 200 and r.json()["linked_case_id"] == lost
      and db.get(Report, stray1).duplicate_of_report_id == lost, r.text[:300])
r = dec(lost, stray1, "NOT_A_MATCH")
check("reject after linking: refused until the reports are unmerged", r.status_code == 409, r.text[:200])

# ── Scope ──
check("scope: a leader can't decide a pair from another subdivision", dec(lost, other_subd, "NOT_A_MATCH").status_code == 403)
r = dec(lost, other_subd, "NOT_A_MATCH", h=HS)
check("scope: barangay staff decide cross-subdivision pairs", r.status_code == 200, r.text[:200])

# ── History ──
h = client.get("/manual-matching/history", headers=HL).json()["results"]
check("history: leader sees decisions in their area only", {(x["report_a_id"], x["report_b_id"]) for x in h} == {(lost, stray2), (lost, stray1)}, h)
check("history: staff name and labels", h[0]["staff_name"] and h[0]["decision_label"])
h = client.get(f"/manual-matching/history?decision=NOT_A_MATCH", headers=HS).json()["results"]
check("history: filter by decision keeps rejections (staff: only pairs inside the Barangay scope)",
      len(h) == 1 and h[0]["decision"] == "NOT_A_MATCH" and h[0]["report_b_id"] == other_subd, h)

# ── Registered pets ──
from app.models.pet import Pet  # noqa: E402

owner_in, owner_out = mk("OwnerIn", 1), mk("OwnerOut", 1, subd=2)
outside_brgy = Barangay(barangay_id=2, barangay_name="B2", city="C")
db.add(outside_brgy)
db.flush()
db.add(Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3"))
owner_far = mk("OwnerFar", 1)  # same subdivision as the leader, but far from the sighting
owner_alien = mk("OwnerAlien", 1, subd=3)
owner_alien.barangay_id = 2


def pet(owner, name, **kw):
    kw.setdefault("photo_front_url", f"https://img.test/{name}.jpg")
    p = Pet(owner_id=owner.user_id if owner else None, pet_name=name, pet_type=kw.pop("pet_type", "Dog"),
            status=kw.pop("status", "Lost"), **kw)
    db.add(p)
    db.commit()
    return p.pet_id


bantay = pet(owner_in, "Bantay", breed="Aspin", color_markings="Brown with white socks", gender="Male",
             distinctive_markings="Red collar", registered_latitude=14.801, registered_longitude=121.0)
far_dog = pet(owner_far, "Malayo", breed="Aspin", color_markings="Brown", registered_latitude=14.95, registered_longitude=121.2)
muning = pet(owner_out, "Muning", pet_type="Cat", color_markings="Black")
alien_dog = pet(owner_alien, "Dayuhan", breed="Aspin", color_markings="Brown")
pet(owner_in, "NoPhoto", photo_front_url=None, breed="Aspin")
pet(owner_in, "Gone", status="Deceased", breed="Aspin")
sighting = report(animal_type="Dog", animal_breed="Aspin", animal_color="Brown", description="Red collar, friendly")
pid = lambda resp: {x["pet_id"] for x in resp.json()["results"]}  # noqa: E731
r = client.get(f"/manual-matching/reports/{sighting}/pet-candidates?animal_type=Dog", headers=HL)
check("pets: leaders get only pets whose owner lives in their subdivision", r.status_code == 200 and pid(r) == {bantay, far_dog}, r.text[:300])
check("pets: other subdivisions' and other barangays' registries stay private", muning not in pid(r) and alien_dog not in pid(r))
check("pets: no photo or deceased pets are left out (same rule as the AI scan)", "NoPhoto" not in r.text and "Gone" not in r.text)
check("pets: no similarity score or percentage", "similarity" not in r.text and "%" not in r.text)
b = next(x for x in r.json()["results"] if x["pet_id"] == bantay)
check("pets: shared details and distance", "Pet is reported lost" in b["shared_details"] and b["distance_km"] < 0.2, b)
check("pets: owner phone shown for an owner in the leader's area", b["owner"]["phone"] and not b["owner"]["outside_area"])
check("pets: a leader can't open another subdivision's pet", client.get(f"/manual-matching/pets/{muning}", headers=HL).status_code == 403)
check("pets: radius from the report", pid(client.get(f"/manual-matching/reports/{sighting}/pet-candidates?radius_km=1", headers=HL)) == {bantay})
check("pets: features filter", pid(client.get(f"/manual-matching/reports/{sighting}/pet-candidates?features=collar", headers=HL)) == {bantay})
check("pets: color filter", pid(client.get(f"/manual-matching/reports/{sighting}/pet-candidates?color=white", headers=HL)) == {bantay})
check("pets: color filter never reaches another subdivision's pet",
      pid(client.get(f"/manual-matching/reports/{sighting}/pet-candidates?color=black", headers=HL)) == set())

pdec = lambda d, p=bantay, h=HL, rid=None, **kw: client.post("/manual-matching/decisions", headers=h, json={  # noqa: E731
    "report_a_id": rid or sighting, "pet_id": p, "decision": d, "notes": kw.pop("notes", "Same collar and socks"), **kw})
send = lambda p=bantay, rid=None, h=HL, **kw: client.post("/manual-matching/pet-confirmations", headers=h, json={  # noqa: E731
    "report_id": rid or sighting, "pet_id": p, **kw})
answer = lambda req_id, a, h, **kw: client.post(f"/pet-match-confirmations/{req_id}/respond", headers=h, json={"answer": a, **kw})  # noqa: E731
HOI, HOF = H(owner_in), H(owner_far)
from app.models.pet_match_confirmation import PetMatchConfirmationRequest as PMC  # noqa: E402
from app.models.notification import Notification  # noqa: E402

check("pets: choose a report or a pet, not both", client.post("/manual-matching/decisions", headers=HL, json={
    "report_a_id": sighting, "report_b_id": lost, "pet_id": bantay, "decision": "NOT_A_MATCH", "notes": "both given"}).status_code == 400)
check("pets: no case linking for a pet", pdec("CONFIRMED_MATCH", link_case=True).status_code == 400)

# ── Owner first: nothing can be decided before a confirmation request is answered YES ──
for d in ("CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"):
    r = pdec(d)
    check(f"owner-first: staff can't record {d} before Send Confirmation", r.status_code == 409 and "Send Confirmation" in r.text, r.text[:200])
b = next(x for x in client.get(f"/manual-matching/reports/{sighting}/pet-candidates", headers=HL).json()["results"] if x["pet_id"] == bantay)
check("owner-first: candidate shows Send Confirmation is available", b["confirmation"] is None and b["can_send_reason"] is None, b)
check("owner-first: residents can't send requests", send(h=HR).status_code == 403)
gone = db.query(Pet).filter(Pet.pet_name == "Gone").first().pet_id
check("owner-first: an ineligible pet can't be asked", send(p=gone).status_code == 409)
ownerless = pet(None, "Komunidad", breed="Aspin", registered_by_user_id=leader.user_id)  # community pet the leader registered
r = send(p=ownerless)
check("owner-first: a pet with no registered owner can't be asked", r.status_code == 409 and "no registered owner" in r.text, r.text[:200])

r = send(message="Please check the collar")
check("send: saved as Awaiting Owner Confirmation", r.status_code == 200 and r.json()["request"]["status"] == "AWAITING_OWNER_CONFIRMATION", r.text[:300])
rq = r.json()["request"]["request_id"]
db.expire_all()
row = db.get(PMC, rq)
check("send: stores report, pet, owner, staff and time", row.report_id == sighting and row.pet_id == bantay
      and row.owner_id == owner_in.user_id and row.requested_by == leader.user_id and row.requested_at is not None)
check("send: the owner is notified", db.query(Notification).filter(Notification.user_id == owner_in.user_id,
      Notification.type == "pet_match_confirmation", Notification.related_id == rq).count() == 1)
check("send: match row and confirmation request created", db.query(ReportMatch).filter(ReportMatch.source_report_id == sighting).count() == 1
      and db.get(Report, sighting).pet_id is None)
from app.models.chat import ChatMessage  # noqa: E402
check("send: chat message delivered to owner", db.query(ChatMessage).count() >= 1)
check("duplicate: a second active request for the same pair is refused", send().status_code == 409)
for d in ("CONFIRMED_MATCH", "NOT_A_MATCH", "UNABLE_TO_VERIFY"):
    r = pdec(d)
    check(f"awaiting: staff can't record {d} before the owner answers", r.status_code == 409 and "Awaiting Owner Confirmation" in r.text, r.text[:200])

# Direct API bypass through the AI verification endpoint
ai_row = db.query(ReportMatch).filter(ReportMatch.source_report_id == sighting, ReportMatch.matched_pet_id == bantay).first()
if not ai_row:
    ai_row = ReportMatch(source_report_id=sighting, matched_pet_id=bantay, similarity_score=80, status="AI_SUGGESTED")
    db.add(ai_row)
    db.commit()
else:
    ai_row.status = "AI_SUGGESTED"
    ai_row.similarity_score = 80
    db.commit()
r = client.post(f"/matches/{ai_row.match_id}/verify", headers=HL, json={"decision": "CONFIRMED_MATCH", "notes": "Looks the same"})
check("bypass: /matches/{id}/verify can't confirm while the owner hasn't answered", r.status_code == 409, r.text[:200])
db.expire_all()
check("bypass: nothing changed", db.get(ReportMatch, ai_row.match_id).status == "AI_SUGGESTED" and db.get(Report, sighting).pet_id is None)

# ── Owner screen ──
mine = client.get("/pet-match-confirmations/mine", headers=HOI)
v = mine.json()["results"][0] if mine.status_code == 200 and mine.json()["results"] else {}
check("owner: sees the pending request with the question", mine.json().get("pending") == 1 and v.get("question") == "Is this the animal you registered as your pet?", mine.text[:300])
check("owner: both animals with photos and details", v["reported_animal"]["report_id"] == sighting and v["your_pet"]["pet_name"] == "Bantay"
      and v["your_pet"]["photos"] and v["reported_animal"]["breed"] == "Aspin" and v["staff_message"] == "Please check the collar")
check("owner: no reporter details or coordinates", "reporter" not in mine.text and "latitude" not in mine.text)
check("owner: another owner doesn't see it", client.get("/pet-match-confirmations/mine", headers=HOF).json()["results"] == [])
check("owner: someone else can't answer", answer(rq, "YES", HR).status_code == 403)
check("owner: staff can't answer for the owner", answer(rq, "YES", HL).status_code == 403)
check("owner: only YES or NO", answer(rq, "MAYBE", HOI).status_code == 422)
r = answer(rq, "YES", HOI, note="That's his red collar")
check("owner YES: saved as Owner Confirmed", r.status_code == 200 and r.json()["request"]["status"] == "OWNER_CONFIRMED", r.text[:300])
db.expire_all()
row = db.get(PMC, rq)
check("owner YES: response and time stored", row.owner_response == "YES" and row.owner_response_at and row.owner_note == "That's his red collar")
check("owner YES: staff are notified", db.query(Notification).filter(Notification.user_id == leader.user_id,
      Notification.type == "pet_match_confirmation_result").count() >= 1)
check("owner YES: not finalized automatically", db.get(Report, sighting).pet_id is None and row.final_decision is None
      and db.get(ReportMatch, ai_row.match_id).status == "AI_SUGGESTED")
check("owner: can't answer twice", answer(rq, "NO", HOI).status_code == 409)
b = next(x for x in client.get(f"/manual-matching/reports/{sighting}/pet-candidates", headers=HL).json()["results"] if x["pet_id"] == bantay)
check("staff view: Owner Confirmed and final verification enabled", b["confirmation"]["status_label"] == "Owner Confirmed"
      and b["confirmation"]["can_finalize"] and b["confirmation"]["owner_note"])

# ── Staff final verification ──
check("final: only authorized staff (outside leader refused)", pdec("CONFIRMED_MATCH", h=HL2).status_code == 403)
r = pdec("CONFIRMED_MATCH", notes="Owner confirmed and collar matches")
check("final: Confirm Verified Match", r.status_code == 200 and r.json()["status"] == "CONFIRMED_MATCH" and r.json()["linked_to_pet"], r.text[:300])
db.expire_all()
row = db.get(PMC, rq)
check("final: decision, staff and time stored on the request", row.status == "VERIFIED_MATCH" and row.final_decision == "CONFIRMED_MATCH"
      and row.final_by == leader.user_id and row.final_at and row.match_id == ai_row.match_id)
check("final: reused the pair's existing match row (no duplicate)", db.query(ReportMatch).filter(
    ReportMatch.source_report_id == sighting, ReportMatch.matched_pet_id == bantay).count() == 1)
check("final: report linked to the pet's record", db.get(Report, sighting).pet_id == bantay)
plog = db.query(ManualMatchDecision).filter(ManualMatchDecision.pet_id == bantay).all()
check("final: staff decision in the decision log", [d.decision for d in plog] == ["CONFIRMED_MATCH"] and plog[0].report_b_id is None)
check("final: can't decide again", pdec("NOT_A_MATCH").status_code == 409)

# ── Owner NO blocks the candidate ──
sighting2 = report(animal_type="Dog", animal_breed="Aspin", animal_color="Brown")
r = send(p=far_dog, rid=sighting2)
rq2 = r.json()["request"]["request_id"]
r = answer(rq2, "NO", HOF, note="Mine is at home")
check("owner NO: saved as Owner Rejected", r.status_code == 200 and r.json()["request"]["status"] == "OWNER_REJECTED", r.text[:300])
r = pdec("CONFIRMED_MATCH", p=far_dog, rid=sighting2)
check("owner NO: staff can't confirm that pet", r.status_code == 409 and "Owner Rejected" in r.text, r.text[:200])
check("owner NO: can't re-ask the same owner for this report", send(p=far_dog, rid=sighting2).status_code == 409)
ai2 = db.query(ReportMatch).filter(ReportMatch.source_report_id == sighting2, ReportMatch.matched_pet_id == far_dog).first()
if not ai2:
    ai2 = ReportMatch(source_report_id=sighting2, matched_pet_id=far_dog, similarity_score=70, status="AI_SUGGESTED")
    db.add(ai2)
    db.commit()
else:
    ai2.status = "AI_SUGGESTED"
    ai2.similarity_score = 70
    db.commit()
r = client.post(f"/matches/{ai2.match_id}/verify", headers=HL, json={"decision": "CONFIRMED_MATCH", "notes": "Looks the same"})
check("owner NO: the AI verify endpoint can't confirm it either", r.status_code == 409, r.text[:200])
cands = client.get(f"/manual-matching/reports/{sighting2}/pet-candidates", headers=HL).json()["results"]
check("owner NO: candidates show Owner Rejected for that pet", next(x for x in cands if x["pet_id"] == far_dog)["confirmation"]["status"] == "OWNER_REJECTED")

# ── Cancel, then a new request ──
r = send(p=bantay, rid=sighting2)
rq3 = r.json()["request"]["request_id"]
check("cancel: needs a reason", client.post(f"/manual-matching/pet-confirmations/{rq3}/cancel", headers=HL, json={"reason": "x"}).status_code == 422)
r = client.post(f"/manual-matching/pet-confirmations/{rq3}/cancel", headers=HL, json={"reason": "Sent for the wrong pet"})
check("cancel: an unanswered request can be withdrawn", r.status_code == 200 and r.json()["status"] == "CANCELLED", r.text[:200])
check("cancel: the owner can no longer answer it", answer(rq3, "YES", HOI).status_code == 409)
r = send(p=bantay, rid=sighting2)
check("cancel: a new request can be sent afterwards", r.status_code == 200, r.text[:200])
rq4 = r.json()["request"]["request_id"]
answer(rq4, "YES", HOI)
r = pdec("UNABLE_TO_VERIFY", p=bantay, rid=sighting2, notes="Need a vet microchip check")
check("further verification: allowed after owner YES", r.status_code == 200, r.text[:200])
db.expire_all()
check("further verification: request stays open for a final decision", db.get(PMC, rq4).status == "NEEDS_FURTHER_VERIFICATION")
r = pdec("NOT_A_MATCH", p=bantay, rid=sighting2, notes="Microchip did not match")
check("final reject after further verification", r.status_code == 200, r.text[:200])
db.expire_all()
check("final reject: request closed as Rejected Match", db.get(PMC, rq4).status == "REJECTED_MATCH")

# ── History ──
hist = client.get(f"/manual-matching/pet-confirmations?report_id={sighting2}", headers=HL).json()["results"]
check("history: every request for the report is kept", [x["status"] for x in hist] == ["REJECTED_MATCH", "CANCELLED", "OWNER_REJECTED"], hist)
mine = client.get("/pet-match-confirmations/mine", headers=HOI).json()
check("owner history: answered, cancelled and finalized requests listed", mine["pending"] == 0
      and {x["status"] for x in mine["results"]} == {"VERIFIED_MATCH", "CANCELLED", "REJECTED_MATCH"}, mine)

linked = report(animal_type="Dog", pet_id=far_dog)
r = client.get(f"/manual-matching/reports/{linked}/pet-candidates", headers=HL)
check("pets: a report already linked to a pet gets no pet candidates", r.json()["results"] == [] and r.json()["blocked_reason"])
check("pets: and can't send a confirmation", send(p=bantay, rid=linked).status_code == 409)

from app.utils.push_categories import category_for, notification_link  # noqa: E402
check("push: owner request opens My Pets on that request", notification_link(1, "pet_match_confirmation", 7) == "/resident/pets?confirm=7"
      and category_for("pet_match_confirmation") == category_for("potential_match"))
check("push: owner answer opens the report's pet candidates for staff",
      notification_link(2, "pet_match_confirmation_result", 9) == "/subd/manual-matching?report=9&kind=pet"
      and notification_link(3, "pet_match_confirmation_result", 9) == "/brgy/manual-matching?report=9&kind=pet")

# ── match-pair endpoint for Potential Match Review modal ──
mp_report = report(animal_type="Dog")
r_mp = client.post("/manual-matching/match-pair", headers=HL, json={"report_id": mp_report, "pet_id": bantay})
check("match-pair: creates manual ReportMatch for pet candidate", r_mp.status_code == 200 and r_mp.json()["source_report_id"] == mp_report and r_mp.json()["matched_pet_id"] == bantay, r_mp.text[:200])
check("match-pair: sets engine to manual and similarity to 0", r_mp.json()["ai_evidence"]["engine"] == "manual" and r_mp.json()["similarity_score"] == 0)

# Calling again returns the existing match
r_mp2 = client.post("/manual-matching/match-pair", headers=HL, json={"report_id": mp_report, "pet_id": bantay})
check("match-pair: reuses existing match pair", r_mp2.status_code == 200 and r_mp2.json()["match_id"] == r_mp.json()["match_id"])
check("match-pair: a staff-created record says matching_mode manual", r_mp.json().get("matching_mode") == "manual")

# The saved method decides the display: an AI suggestion opened from Manual Matching stays an AI record
ai_src = report(animal_type="Dog")
db.add(ReportMatch(source_report_id=ai_src, matched_pet_id=bantay, similarity_score=83, status="AI_SUGGESTED",
                   ai_explanation="Saved AI result", ai_evidence={"engine": "gemini", "key_evidence_bullets": ["Same socks"]}))
db.commit()
r_ai = client.post("/manual-matching/match-pair", headers=HL, json={"report_id": ai_src, "pet_id": bantay})
j = r_ai.json()
check("match-pair: an AI record keeps matching_mode ai, its saved score and its AI evidence",
      r_ai.status_code == 200 and j.get("matching_mode") == "ai" and j["similarity_score"] == 83
      and j["ai_evidence"].get("engine") == "gemini" and j["ai_explanation"] == "Saved AI result", r_ai.text[:300])
db.expire_all()
check("match-pair: opening it doesn't rewrite the stored record", db.query(ReportMatch).filter(
      ReportMatch.source_report_id == ai_src).one().ai_evidence.get("engine") == "gemini")

# Owner view: the actual report and pet record fields, no AI-detected values
mine_items = client.get("/pet-match-confirmations/mine", headers=HOI).json()["results"]
ra, yp = mine_items[0]["reported_animal"], mine_items[0]["your_pet"]
check("owner view: report fields as submitted (no AI coat pattern)", "coat_pattern" not in ra
      and {"initial_landmark", "animal_count", "description", "condition", "size", "reported_at"} <= set(ra), ra.keys())
check("owner view: the pet record's size, address, description, age and owner name",
      {"size", "registered_address", "notes", "estimated_age", "is_neutered", "owner_name"} <= set(yp) and yp["owner_name"] == "OwnerIn", yp)

# ── Barangay data separation: registered-pet pool and endpoint protection ──
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import EndorsementLetter  # noqa: E402

brgy_owner = mk("BrgyOwner", 1, subd=None)              # lives in the barangay, outside any subdivision
brgy_pet = pet(brgy_owner, "Brgyaso", breed="Aspin", color_markings="Brown")
staff_reg_pet = pet(owner_out, "Staffreg", breed="Aspin", color_markings="Brown", registered_by_user_id=staff.user_id)
endorsed_owner = mk("EndorsedOwner", 1, subd=2)
endorsed_pet = pet(endorsed_owner, "Endorso", breed="Aspin", color_markings="Brown")
private_pet = pet(endorsed_owner, "Pribado", breed="Aspin", color_markings="Brown")   # subdivision registry only
endorsed_case = report(subd=2, animal_type="Dog")
db.add(EndorsementLetter(report_id=endorsed_case, leader_id=leader2.user_id, letter_content="Formal endorsement"))
db.add(PetClaim(report_id=endorsed_case, pet_id=endorsed_pet, status="Pending Review"))
brgy_sighting = report(subd=2, animal_type="Dog", animal_breed="Aspin", animal_color="Brown")
db.add(HoldingAnimal(report_id=brgy_sighting, animal_type="Dog"))                    # Barangay holding intake
db.get(Report, brgy_sighting).current_status_id = 7                                 # Under Observation at the Barangay
internal = report(subd=2, animal_type="Dog", animal_breed="Aspin")                   # unendorsed subdivision record
db.commit()

r = client.get(f"/manual-matching/reports/{brgy_sighting}/pet-candidates?animal_type=Dog", headers=HS)
got = pid(r) if r.status_code == 200 else set()
check("brgy pets: Barangay-registered, staff-registered and endorsed-case pets are candidates",
      r.status_code == 200 and {brgy_pet, staff_reg_pet, endorsed_pet} <= got, (r.status_code, r.text[:200], got))
check("brgy pets: the private subdivision registry is never searched",
      not got & {private_pet, bantay, far_dog, muning, alien_dog}, got)
check("brgy pets: pet detail outside the scope -> 403", client.get(f"/manual-matching/pets/{private_pet}", headers=HS).status_code == 403)
check("brgy pets: pet detail inside the scope", client.get(f"/manual-matching/pets/{endorsed_pet}", headers=HS).status_code == 200)
r = client.post("/manual-matching/match-pair", headers=HS, json={"report_id": brgy_sighting, "pet_id": private_pet})
check("brgy pets: match-pair with a private registry pet -> 403", r.status_code == 403 and "protected" in r.text, r.text[:200])
check("brgy pets: no match row was created", db.query(ReportMatch).filter(ReportMatch.matched_pet_id == private_pet).count() == 0)
check("brgy pets: Send Confirmation to a private registry pet -> 403",
      send(p=private_pet, rid=brgy_sighting, h=HS).status_code == 403)
check("brgy pets: final decision on a private registry pet -> 403",
      pdec("CONFIRMED_MATCH", p=private_pet, h=HS, rid=brgy_sighting).status_code == 403)
r = send(p=endorsed_pet, rid=brgy_sighting, h=HS, message="Please check this animal")
check("brgy pets: owner-first still works for an endorsed pet", r.status_code == 200
      and r.json()["request"]["status"] == "AWAITING_OWNER_CONFIRMATION", r.text[:200])
db.expire_all()
check("brgy pets: the owner gets the confirmation card notification", db.query(Notification).filter(
      Notification.user_id == endorsed_owner.user_id, Notification.type == "pet_match_confirmation").count() == 1)

# Report-to-report pool for Barangay staff
pub_lost = report(cat=6, subd=2, animal_type="Dog", visibility="Public", visibility_decided_by=leader2.user_id)
priv_lost = report(cat=6, subd=2, animal_type="Dog", visibility="Private", visibility_decided_by=leader2.user_id)
r = client.get(f"/manual-matching/reports/{brgy_sighting}/candidates", headers=HS)
c = ids(r) if r.status_code == 200 else set()
check("brgy reports: published Lost Pet reports from subdivisions are included", r.status_code == 200 and pub_lost in c, c)
check("brgy reports: escalated cases and holding intakes are included", {endorsed_case, other_subd} <= c, c)
check("brgy reports: internal subdivision records and private Lost Pet reports are excluded",
      internal not in c and priv_lost not in c and stray2 not in c and cat1 not in c, c)
check("brgy reports: an internal subdivision record can't be opened -> 403",
      client.get(f"/manual-matching/reports/{internal}", headers=HS).status_code == 403)
check("brgy reports: nor used as a source for candidates -> 403",
      client.get(f"/manual-matching/reports/{internal}/candidates", headers=HS).status_code == 403)
r = client.post("/manual-matching/match-pair", headers=HS, json={"report_id": brgy_sighting, "matched_report_id": internal})
check("brgy reports: match-pair with an internal subdivision record -> 403", r.status_code == 403, r.text[:200])
check("brgy reports: decision on an internal subdivision record -> 403",
      dec(brgy_sighting, internal, "NOT_A_MATCH", h=HS).status_code == 403)
check("subdivision workflow: the leader still sees and compares their internal record",
      internal in ids(client.get(f"/manual-matching/reports/{other_subd}/candidates", headers=HL2)))

# ── Manual records carry no AI score or AI wording anywhere ──
db.expire_all()
mrow = db.query(ReportMatch).filter(ReportMatch.source_report_id == brgy_sighting, ReportMatch.matched_pet_id == endorsed_pet).first()
check("no AI: Send Confirmation stores a manual record with no score and neutral wording",
      mrow.ai_evidence.get("engine") == "manual" and mrow.similarity_score == 0 and "AI" not in (mrow.ai_explanation or ""),
      (mrow.similarity_score, mrow.ai_explanation))
cand = next(x for x in client.get(f"/manual-matching/reports/{brgy_sighting}/pet-candidates", headers=HS).json()["results"]
            if x["pet_id"] == endorsed_pet)
check("no AI: a manual pair in the candidates has no score and says manual",
      cand["pair"]["matching_mode"] == "manual" and cand["pair"]["similarity_score"] is None, cand["pair"])
old_claim = PetClaim(report_id=brgy_sighting, pet_id=endorsed_pet, status="Pending Review", match_score=50)  # saved before the rule
db.add(old_claim)
db.commit()
cr = client.get(f"/claims/{old_claim.claim_id}", headers=HS)
check("no AI: a claim from a manual match is labelled manual with no AI score (even one saved with 50)",
      cr.status_code == 200 and cr.json()["matching_mode"] == "manual" and cr.json()["match_score"] is None, cr.text[:300])
db.expire_all()
check("no AI: the stored claim isn't rewritten by reading it", db.get(PetClaim, old_claim.claim_id).match_score == 50)
hist = reports.dispute_match_history(db, mrow.match_id)
check("no AI: dispute history of a manual record says manual, no score", hist["matching_mode"] == "manual" and hist["similarity_score"] is None, hist)
ai_hist = reports.dispute_match_history(db, db.query(ReportMatch).filter(ReportMatch.source_report_id == ai_src).one().match_id)
check("AI records keep their score in the history", ai_hist["matching_mode"] == "ai" and ai_hist["similarity_score"] == 83, ai_hist)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
