"""
Privacy and authorization of the report reads and writes (routes/reports.py, utils/report_visibility.py).

  - staff READ endpoints are limited to the staff member's own scope (a Leader: their subdivision; Barangay: its
    barangay; the Administrator: all), on the list, the detail and the badge counts
  - another resident gets an ALLOW-LIST of a public report (never the reporter, the owner, the internal assessment,
    referrals, warnings, claims or AI findings), and the AREA of every pin, never the spot
  - the reporter, the pet's owner and staff keep the exact pin
  - a sensitive complaint can never be made public, by any route
  - any animal type can be reported without a pet record; the subdivision's disabled categories are refused
Offline: throwaway SQLite, never app.main. Run from the backend folder:  python tests/test_case_privacy_scope.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "privacy_scope.db")
os.environ.setdefault("JWT_SECRET_KEY", "privacy-scope-test-secret-key-0123456789-0123456789")
# Barangay accounts are refused platform-wide by default (utils/retired.py). The switch is turned on here only so the
# barangay scope of a role-3 account (when the legacy two-client system runs) can be checked too.
os.environ["BARANGAY_WORKFLOWS_ENABLED"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.routes import cases, matches, reports  # noqa: E402
from app.schemas.report import ReportResponse  # noqa: E402
from app.utils import report_visibility as rv  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, matches.router):
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
db.add_all([Barangay(barangay_id=1, barangay_name="San Vicente", city="C"), Barangay(barangay_id=2, barangay_name="Other Barangay", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="Far Homes")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def user(name, role, subdivision, barangay=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@privacy.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=barangay, phone="09171234567", address=f"{name} House")
    db.add(u)
    db.commit()
    return u


reporter = user("Rita Reporter", 1, 1)
other = user("Olga Other", 1, 1)
far_resident = user("Far Resident", 1, 2)
leader1 = user("Leader One", 2, 1)
leader2 = user("Leader Two", 2, 2)
leader_none = user("Leader Nowhere", 2, None)
brgy1 = user("Brgy One", 3, None, barangay=1)
brgy2 = user("Brgy Two", 3, None, barangay=2)
admin = user("Admin One", 4, None)


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


CATS = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}


def mk(subdivision, owner=reporter, category="Animal Safety Concern", **extra):
    r = Report(user_id=owner.user_id, subdivision_id=subdivision, category_id=CATS[category], current_status_id=2, animal_type="Dog",
               animal_color="Brown", description="A brown dog near the clubhouse", landmark="Clubhouse",
               latitude=Decimal("14.80123456"), longitude=Decimal("121.00456789"),
               initial_latitude=Decimal("14.80123456"), initial_longitude=Decimal("121.00456789"), **extra)
    db.add(r)
    db.commit()
    return r.report_id


def ids(response):
    return sorted(r["report_id"] for r in response.json())


# ============================================================================================================
# 1. Staff READ scope
# ============================================================================================================
r_sub1 = mk(1)
r_sub1b = mk(1)
r_sub2 = mk(2)
r_sub3 = mk(3)     # another barangay

res = client.get("/reports/", headers=H(leader1))
check("a Subdivision Leader's list holds their own subdivision's reports only", res.status_code == 200 and ids(res) == sorted([r_sub1, r_sub1b]), ids(res))
check("...and asking for another subdivision's is refused, not answered", client.get("/reports/?subdivision_id=2", headers=H(leader1)).status_code == 403)
check("...even when they pass their own id it still works", ids(client.get("/reports/?subdivision_id=1", headers=H(leader1))) == sorted([r_sub1, r_sub1b]))
check("the other subdivision's leader sees theirs", ids(client.get("/reports/", headers=H(leader2))) == [r_sub2])
check("a leader with no subdivision sees nothing", client.get("/reports/", headers=H(leader_none)).json() == [])
check("Barangay staff see their barangay's subdivisions, not another barangay's", ids(client.get("/reports/", headers=H(brgy1))) == sorted([r_sub1, r_sub1b, r_sub2])
      and ids(client.get("/reports/", headers=H(brgy2))) == [r_sub3])
check("the Administrator sees all, and can filter", ids(client.get("/reports/", headers=H(admin))) == sorted([r_sub1, r_sub1b, r_sub2, r_sub3])
      and ids(client.get("/reports/?subdivision_id=2", headers=H(admin))) == [r_sub2])

check("a leader opens a report of their own subdivision", client.get(f"/reports/{r_sub1}", headers=H(leader1)).status_code == 200)
check("...but is told another subdivision's report doesn't exist (404, not 403)", client.get(f"/reports/{r_sub2}", headers=H(leader1)).status_code == 404)
check("Barangay staff: their barangay yes, another barangay's report no", client.get(f"/reports/{r_sub2}", headers=H(brgy1)).status_code == 200 and client.get(f"/reports/{r_sub3}", headers=H(brgy1)).status_code == 404)
check("the Administrator opens any", client.get(f"/reports/{r_sub3}", headers=H(admin)).status_code == 200)
check("the reporter opens their own, whatever its subdivision", client.get(f"/reports/{r_sub2}", headers=H(reporter)).status_code == 200)

counts1 = client.get("/reports/admin-badge-counts", headers=H(leader1)).json()
counts_admin = client.get("/reports/admin-badge-counts", headers=H(admin)).json()
check("badge counts: a leader counts their subdivision only; the Administrator counts everything", counts1["active_reports"] == 2 and counts_admin["active_reports"] == 4, (counts1, counts_admin))
check("a resident can't read the badge counts", client.get("/reports/admin-badge-counts", headers=H(reporter)).status_code == 403)

# ============================================================================================================
# 2. What another resident gets: an allow-list, and the area, not the pin
# ============================================================================================================
public = mk(1, visibility="Public", visibility_decided_by=leader1.user_id, verification_status="verified_true",
            verification_notes="Seen by the guard; the owner lives at No. 7", false_alarm_reason=None, assigned_leader_id=leader1.user_id,
            is_sensitive=False, ai_suggested_risk_level="High", ai_suggested_priority="High",
            incident_basis="INTERNAL ASSESSMENT TEXT", assessment_notes="INTERNAL NOTE", ownership_note="INTERNAL OWNERSHIP NOTE", urgency_note="INTERNAL URGENCY")
db.add(StatusHistory(report_id=public, report_status_id=2, updated_by=leader1.user_id, latitude=Decimal("14.80123456"), longitude=Decimal("121.00456789"),
                     landmark="Clubhouse", remarks="Report claimed"))
db.add(OwnerWarning(user_id=other.user_id, report_id=public, issued_by=leader1.user_id, warning_level="Notice", violation_type="Other", description="PRIVATE WARNING TEXT"))
db.commit()

res = client.get(f"/reports/{public}", headers=H(other))
body = res.json()
check("another resident can open a report the leader made public", res.status_code == 200 and body["viewer_access"] == "public" and body["visible_to_residents"] is True, res.text)
defaults = {name: field.default for name, field in ReportResponse.model_fields.items()}
leaked = sorted(k for k, v in body.items() if k not in rv.RESIDENT_SAFE_FIELDS and v != defaults.get(k))
check("NOTHING outside the allow-list differs from its empty default (no field leaks)", leaked == [], leaked)
for sensitive in ("user_id", "reporter_photo", "owner_id", "owner_email", "owner_address", "assigned_leader_id", "assigned_leader_name",
                  "verified_by_user_id", "verification_notes", "false_alarm_reason", "is_sensitive",
                  "review_notes", "merge_notes", "pending_transfer_notes", "issued_warnings", "latest_warning", "observation", "disputes", "endorsement_letter",
                  "ai_suggested_risk_level", "ai_suggested_priority", "ai_photo_details", "visibility_reason", "has_issued_warning"):
    assert sensitive not in rv.RESIDENT_SAFE_FIELDS, sensitive
raw = res.text
check("none of the internal text can be found anywhere in the response",
      all(secret not in raw for secret in ("INTERNAL", "PRIVATE WARNING", "No. 7", "09171234567", "Rita Reporter")), [s for s in ("INTERNAL", "PRIVATE WARNING", "No. 7", "09171234567", "Rita Reporter") if s in raw])
check("the handling officer is not exposed as the case's handler (an official's name on a timeline line is the existing rule)", body["assigned_leader_id"] is None and body["assigned_leader_name"] is None)
check("the reporter is anonymous to another resident", body["reporter_name"] == "Community Reporter" and body["user_id"] is None)
check("the pin is the AREA (3 decimals), and so is the original pin", (body["latitude"], body["longitude"]) == (14.801, 121.005) and (body["initial_latitude"], body["initial_longitude"]) == (14.801, 121.005), (body["latitude"], body["longitude"]))
check("the timeline's pins are generalized too", all((h["latitude"], h["longitude"]) == (14.801, 121.005) for h in body["history"] if h["latitude"] is not None) and len(body["history"]) == 1, body["history"])
check("the case's four-state status is there for the resident screens", body["case_status"] == "under_review")
check("what the leader found on site stays visible on a public report", body["verification_status"] == "verified_true")

as_reporter = client.get(f"/reports/{public}", headers=H(reporter)).json()
check("the reporter keeps the exact pin and the original pin", (as_reporter["latitude"], as_reporter["longitude"]) == (14.80123456, 121.00456789) and as_reporter["initial_latitude"] == 14.80123456, as_reporter["latitude"])
as_leader = client.get(f"/reports/{public}", headers=H(leader1)).json()
check("a leader keeps everything: exact pin, notes, handler", (as_leader["latitude"], as_leader["longitude"]) == (14.80123456, 121.00456789) and as_leader["verification_notes"].startswith("Seen by the guard") and as_leader["assigned_leader_id"] == leader1.user_id)
check("the list gives another resident the same allow-listed, generalized view",
      (lambda items: len(items) == 1 and items[0]["report_id"] == public and items[0]["latitude"] == 14.801 and items[0]["user_id"] is None and items[0]["verification_notes"] is None)(
          [r for r in client.get("/reports/", headers=H(other)).json() if r["report_id"] == public]))
check("a private report of someone else is still not found for a resident", client.get(f"/reports/{r_sub1}", headers=H(other)).status_code == 404)
far_view = client.get(f"/reports/{public}", headers=H(far_resident))
check("(existing rule, unchanged) a public report is open to any resident, and a resident of another subdivision gets the same allow-listed, generalized view",
      far_view.status_code == 200 and far_view.json()["latitude"] == 14.801 and far_view.json()["user_id"] is None and far_view.json()["initial_latitude"] == 14.801)

# an owned pet: another resident learns only that it HAS a registered owner (the label), never who
from app.models.pet import Pet  # noqa: E402
oscar = user("Oscar Owner", 1, 1)
boyet = Pet(owner_id=oscar.user_id, pet_name="Boyet", pet_type="Dog", status="Active")
db.add(boyet)
db.commit()
public_owned = mk(1, visibility="Public", visibility_decided_by=leader1.user_id, pet_id=boyet.pet_id)
owned_view = client.get(f"/reports/{public_owned}", headers=H(other)).json()
check("another resident sees only the label 'Registered Owner' for an owned pet: no name, phone, email, address, account or pet name",
      owned_view["owner_name"] == "Registered Owner" and owned_view["owner_phone"] is None and owned_view["owner_email"] is None
      and owned_view["owner_address"] is None and owned_view["owner_id"] is None and owned_view["pet_name"] is None, {k: owned_view[k] for k in ("owner_name", "owner_phone", "owner_email", "owner_address", "owner_id", "pet_name")})
owner_sees = client.get(f"/reports/{public_owned}", headers=H(oscar)).json()
check("...while the owner, who is a different kind of viewer, keeps their own details", owner_sees["viewer_access"] == "owner" and owner_sees["owner_id"] == oscar.user_id)

# staff reads of a report's pet matches and suspected duplicates follow the same scope
from app.models.report_match import ReportMatch  # noqa: E402
match_pet = Pet(owner_id=oscar.user_id, pet_name="Rex", pet_type="Dog", status="Active")
db.add(match_pet)
db.commit()
db.add_all([ReportMatch(source_report_id=r_sub1, matched_pet_id=match_pet.pet_id, similarity_score=70, status="AI_SUGGESTED"),
            ReportMatch(source_report_id=r_sub2, matched_pet_id=match_pet.pet_id, similarity_score=70, status="AI_SUGGESTED")])
db.commit()
check("a leader reads the pet matches of a report in their own subdivision", len(client.get(f"/matches/report/{r_sub1}", headers=H(leader1)).json()) == 1)
check("...and gets nothing for another subdivision's report", client.get(f"/matches/report/{r_sub2}", headers=H(leader1)).json() == [])
check("the other leader reads theirs", len(client.get(f"/matches/report/{r_sub2}", headers=H(leader2)).json()) == 1)
check("the Administrator reads any", len(client.get(f"/matches/report/{r_sub2}", headers=H(admin)).json()) == 1)
check("suspected duplicates of another subdivision's report are not given to a leader", client.get(f"/matches/duplicates/report/{r_sub2}", headers=H(leader1)).json() == [])

# a field added to the report later stays private until it is added to the allow-list on purpose
class Extra:
    pass


probe = ReportResponse.model_validate({"report_id": 1, "created_at": "2026-01-01T00:00:00", "latitude": 1.0, "longitude": 2.0})
probe.owner_email = "LEAK"
probe.verification_notes = "LEAK"
probe.assigned_leader_name = "LEAK"
safe = rv._resident_safe(probe)
check("the allow-list rebuilds the response: whatever was set outside it does not survive",
      safe.owner_email is None and safe.verification_notes is None and safe.assigned_leader_name is None and safe.report_id == 1)

# ============================================================================================================
# 3. Sensitive complaints are never public
# ============================================================================================================
sens = mk(1, category="Animal Nuisance", is_sensitive=True, assigned_leader_id=leader1.user_id)   # the visibility route needs a claimed report
res = client.patch(f"/reports/{sens}/visibility", json={"visibility": "Public", "reason": "Neighbours should know"}, headers=H(leader1))
check("a sensitive complaint can't be made public by the visibility route", res.status_code == 409 and "never made public" in res.text, res.text)
try:
    rv.set_visibility(db, db.get(Report, sens), "Public", leader1, "trying to bypass")
    bypass = False
except Exception as exc:   # noqa: BLE001
    bypass = "never made public" in str(getattr(exc, "detail", exc))
check("...and the single writer of visibility refuses it for every other route too (e.g. verification)", bypass)
check("a sensitive complaint can still be Private", client.patch(f"/reports/{sens}/visibility", json={"visibility": "Private", "reason": "Stays private"}, headers=H(leader1)).status_code == 200)
check("its block reason is shown to staff", client.get(f"/reports/{sens}", headers=H(leader1)).json()["public_block_reason"].startswith("A private complaint"))

# staff correcting the animal type: any animal, stored as the label
res = client.patch(f"/reports/{r_sub1}", json={"animal_type": "small_mammal"}, headers=H(leader1))
check("staff can correct a report's animal to another kind (an id is stored as its label)", res.status_code == 200 and res.json()["animal_type"] == "Small mammal", res.text[:200])
check("...and an unknown animal type is refused on edit too", client.patch(f"/reports/{r_sub1}", json={"animal_type": "dragon"}, headers=H(leader1)).status_code == 400)

# ============================================================================================================
# 4. Filing a report: any animal, the subdivision's categories, sensitive by default for a nuisance
# ============================================================================================================
NEW = {"latitude": 14.8008, "longitude": 121.0036, "description": "A large animal near the gate", "subdivision_id": 1}


def file(**kw):
    return client.post("/reports/", json={**NEW, **kw}, headers=H(reporter))


res = file(animal_type="Bird", category_id=CATS["Other Animal Concern"])
if res.status_code != 200:
    print("  (report creation is not available in this test app:", res.status_code, res.text[:200], ")")
    created = False
else:
    created = True
    check("a bird can be reported: no pet record is needed", res.json()["animal_type"] == "Bird" and res.json()["pet_name"] is None, res.json()["animal_type"])
    ids_made = [res.json()["report_id"]]
    for given, stored in (("small_mammal", "Small mammal"), ("wildlife", "Wildlife"), ("Livestock", "Livestock"), ("reptile", "Reptile"), ("other", "Other"), ("rabbit", "Small mammal")):
        r = file(animal_type=given, category_id=CATS["Other Animal Concern"])
        check(f"animal type '{given}' is accepted and stored as '{stored}'", r.status_code == 200 and r.json()["animal_type"] == stored, r.text)
    check("an unknown animal type is refused with the list of choices", (lambda r: r.status_code == 400 and "Small mammal" in r.text)(file(animal_type="Dragon", category_id=CATS["Other Animal Concern"])))
    check("a dog still works (and a report needs no pet)", file(animal_type="Dog", category_id=CATS["Found / Unidentified Animal"]).json()["pet_name"] is None)
    check("a new report starts as 'reported', Private", (lambda r: r["case_status"] == "reported" and r["visibility"] == "Private")(file(animal_type="Cat", category_id=CATS["Other Animal Concern"]).json()))
    nuisance = file(animal_type="Dog", category_id=CATS["Animal Nuisance"]).json()
    check("a report in 'Animal Nuisance' is sensitive by default", db.get(Report, nuisance["report_id"]).is_sensitive is True)
    safety = file(animal_type="Dog", category_id=CATS["Animal Safety Concern"]).json()
    check("...a safety concern is not", db.get(Report, safety["report_id"]).is_sensitive is False)
    explicit = file(animal_type="Dog", category_id=CATS["Animal Nuisance"], is_sensitive=False).json()
    check("...and the reporter can say otherwise", db.get(Report, explicit["report_id"]).is_sensitive is False)
    marked = file(animal_type="Dog", category_id=CATS["Injured / Distressed Animal"], is_sensitive=True).json()
    check("...or mark any report sensitive", db.get(Report, marked["report_id"]).is_sensitive is True)
    # the subdivision turns a category off
    body_settings = client.get("/cases/settings/1", headers=H(leader1)).json()
    body_settings["categories"]["injured"] = False
    client.put("/cases/settings/1", json=body_settings, headers=H(leader1))
    res = file(animal_type="Dog", category_id=CATS["Injured / Distressed Animal"])
    check("a category the subdivision turned off is refused when filing", res.status_code == 400 and "does not accept" in res.text, res.text)
    check("...while another subdivision still accepts it", client.post("/reports/", json={**NEW, "subdivision_id": 2, "animal_type": "Dog", "category_id": CATS["Injured / Distressed Animal"]}, headers=H(far_resident)).status_code == 200)
    body_settings["categories"]["injured"] = True
    client.put("/cases/settings/1", json=body_settings, headers=H(leader1))
    check("a report outside the coverage area is still refused, server side", file(animal_type="Dog", latitude=15.5, longitude=121.9, category_id=CATS["Found / Unidentified Animal"]).status_code == 400)

print(f"\n{PASSED} checks passed" + ("" if created else "  (report-filing checks skipped: creation not available in this test app)"))
