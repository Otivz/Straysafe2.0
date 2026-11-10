"""
Analytics for the case workflow (services/analytics_service.case_lifecycle_summary, exposed as "case_lifecycle" in
GET /analytics/subdivision and /analytics/admin). Additive: the existing payload is unchanged.

  - a closed case is NOT counted as resolved: the documented outcome decides (resolved / unresolved / invalid)
  - closures are dated by closed_at; the median is report -> closure
  - referrals are counted by organisation, type and status, several per case
  - the subdivision view is scoped; the Administrator sees all
Offline: throwaway SQLite, never app.main. Run from the backend folder:  python tests/test_case_analytics.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)
from datetime import datetime, time, timedelta
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "case_analytics.db")
os.environ.setdefault("JWT_SECRET_KEY", "case-analytics-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.models.barangay_referral import BarangayReferral  # noqa: E402
from app.models.case_records import CaseFollowUp, OwnershipClaim  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import analytics  # noqa: E402
from app.services.analytics_service import local_now  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
assert run_case_alignment(engine)["errors"] == []
api = FastAPI()
api.include_router(analytics.router)
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
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@analytics.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


resident, leader, other_leader, admin = user("Res", 1), user("Lead", 2), user("Lead Two", 2, 2), user("Admin", 4)


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


CATS = {c.category_name: c.category_id for c in db.query(ReportCategory).all()}
# Every timestamp is noon of a Manila date, so no result depends on the hour or the machine's time zone
TODAY = local_now().date()


def at(days_ago):
    return datetime.combine(TODAY, time(12, 0)) - timedelta(days=days_ago)




def mk(category, created_days_ago, status, subdivision=1, closed_days_after=None, disposition=None, reopened=0):
    created = at(created_days_ago)
    r = Report(user_id=resident.user_id, subdivision_id=subdivision, category_id=CATS[category], current_status_id=status, animal_type="Dog",
               latitude=Decimal("14.8"), longitude=Decimal("121.0"), created_at=created, closure_disposition=disposition, reopened_count=reopened)
    if closed_days_after is not None:
        r.closed_at = created + timedelta(days=closed_days_after)
    db.add(r)
    db.commit()
    return r.report_id


a = mk("Animal Nuisance", 9, 11, closed_days_after=4, disposition="resolved_intervention")
b = mk("Lost Pet", 8, 9, closed_days_after=2, disposition="pet_recovered")
c = mk("Animal Safety Concern", 7, 17, closed_days_after=6, disposition="handed_off")
d = mk("Other Animal Concern", 6, 14, closed_days_after=1, disposition="invalid_report")
e = mk("Found / Unidentified Animal", 5, 7)
f = mk("Animal Nuisance", 1, 1)
g = mk("Injured / Distressed Animal", 3, 11, reopened=2)          # a legacy-style closure: no stored disposition
db.get(Report, g).closed_at = at(1)
db.commit()
elsewhere = mk("Animal Nuisance", 2, 1, subdivision=2)

db.add_all([
    BarangayReferral(report_id=c, barangay_id=1, reason="r", contact_method="call", org_type="barangay", org_name="Barangay San Vicente", referral_status="completed", final_outcome="resolved", referred_at=at(6)),
    BarangayReferral(report_id=c, barangay_id=None, reason="r", contact_method="call", org_type="animal_control", org_name="Animal Control", referral_status="in_progress", referred_at=at(5)),
    BarangayReferral(report_id=e, barangay_id=None, reason="r", contact_method="message", org_type="veterinary", org_name="City Vet", referral_status="sent", referred_at=at(2)),
    BarangayReferral(report_id=e, barangay_id=None, reason="r", contact_method="message", org_type="veterinary", org_name="City Vet", referral_status="declined", referred_at=at(4)),
    BarangayReferral(report_id=elsewhere, barangay_id=None, reason="r", contact_method="call", org_type="wildlife", org_name="Wildlife Unit", referral_status="sent", referred_at=at(1)),
    CaseFollowUp(report_id=e, subdivision_id=1, kind="follow_up", title="overdue one", due_at=at(1), status="pending"),
    CaseFollowUp(report_id=e, subdivision_id=1, kind="site_check", title="future one", due_at=at(-3), status="pending"),
    CaseFollowUp(report_id=e, subdivision_id=1, kind="follow_up", title="done one", status="done", completed_at=at(1)),
    OwnershipClaim(report_id=e, subdivision_id=1, claimant_user_id=resident.user_id, statement="mine mine mine", status="submitted", submitted_at=at(1)),
    OwnershipClaim(report_id=e, subdivision_id=1, claimant_user_id=resident.user_id, statement="mine, truly", status="accepted", submitted_at=at(2)),
])
db.commit()

res = client.get("/analytics/subdivision", headers=H(leader), params={"days": 30})
check("the endpoint still answers, and the existing payload is intact", res.status_code == 200 and "kpis" in res.json() and "status_distribution" in res.json() and "category_breakdown" in res.json(), res.text[:200])
cl = res.json()["case_lifecycle"]
check("received: the seven cases of the subdivision (not the other subdivision's)", cl["received"] == 7, cl["received"])
check("closed in the period: five (four documented + one legacy closure with a date)", cl["closed"] == 5, cl["closed"])
check("a closed case is NOT assumed resolved: 2 of 5 closures are resolutions (resolved_intervention, pet_recovered), the legacy 'Incident Resolved' is read as one too",
      cl["resolved_share"] == 60.0, cl["resolved_share"])
groups = {o["group"]: o for o in cl["outcomes"]}
check("outcomes by group: resolved 3, unresolved 1, invalid 1", (groups["resolved"]["count"], groups["unresolved"]["count"], groups["invalid"]["count"]) == (3, 1, 1), groups)
items = {i["id"]: i["count"] for o in cl["outcomes"] for i in o["items"]}
check("...and by disposition (a legacy closure is read from its legacy status)", items["resolved_intervention"] == 2 and items["pet_recovered"] == 1 and items["handed_off"] == 1 and items["invalid_report"] == 1 and items["duplicate_report"] == 0, items)
check("closed without resolution is its own number", cl["closed_without_resolution"] == 1)
check("median days to close: 4, 2, 6, 1 and 2 -> 2", cl["median_days_to_close"] == 2.0, cl["median_days_to_close"])
check("status snapshot adds up to the cases in scope", cl["status_counts"] == {"reported": 1, "under_review": 0, "in_progress": 1, "closed": 5} and sum(cl["status_counts"].values()) == 7, cl["status_counts"])
cats = {x["id"]: x["count"] for x in cl["categories"]}
check("categories are the six, counted among the cases received", cats == {"lost_pet": 1, "found_animal": 1, "nuisance": 2, "safety": 1, "injured": 1, "other": 1}, cats)
check("the timeline has a bucket per day and both series", len(cl["timeline"]) == 30 and sum(x["received"] for x in cl["timeline"]) == 7 and sum(x["closed"] for x in cl["timeline"]) == 5)
check("reopened cases and events are counted", cl["reopened"] == {"cases": 1, "events": 2})
ref = cl["referrals"]
check("referrals in the period: four for this subdivision, several per case", ref["total"] == 4, ref)
check("referrals by type, organisation and status", {x["org_type"]: x["count"] for x in ref["by_type"]} == {"veterinary": 2, "barangay": 1, "animal_control": 1}
      and {x["name"]: x["count"] for x in ref["by_org"]}["City Vet"] == 2 and {x["status"]: x["count"] for x in ref["by_status"]} == {"completed": 1, "in_progress": 1, "sent": 1, "declined": 1}, ref)
check("open now: sent + in progress (a completed or declined referral is not open)", ref["open_now"] == 2, ref["open_now"])
check("follow-ups: two pending, one overdue, one done in the period", cl["followups"] == {"pending": 2, "overdue": 1, "completed_in_period": 1}, cl["followups"])
check("claims: two, one open, one accepted", cl["claims"] == {"submitted_in_period": 2, "open_now": 1, "accepted": 1, "rejected": 0}, cl["claims"])

check("another subdivision's leader sees only theirs", client.get("/analytics/subdivision", headers=H(other_leader), params={"days": 30}).json()["case_lifecycle"]["received"] == 1)
check("a leader can't ask for another subdivision", client.get("/analytics/subdivision", headers=H(leader), params={"days": 30, "subdivision_id": 2}).status_code == 403)
adm = client.get("/analytics/admin", headers=H(admin), params={"days": 30}).json()["case_lifecycle"]
check("the Administrator sees every subdivision", adm["received"] == 8 and adm["referrals"]["total"] == 5, (adm["received"], adm["referrals"]["total"]))
check("a resident gets no analytics", client.get("/analytics/subdivision", headers=H(resident)).status_code == 403)
narrow = client.get("/analytics/subdivision", headers=H(leader), params={"days": 3}).json()["case_lifecycle"]
check("the date window applies (the last 3 days): 1 case received, 2 closed (the two closed yesterday), 1 referral",
      (narrow["received"], narrow["closed"], narrow["referrals"]["total"]) == (1, 2, 1), (narrow["received"], narrow["closed"], narrow["referrals"]["total"]))
filtered = client.get("/analytics/subdivision", headers=H(leader), params={"days": 30, "category_id": CATS["Animal Nuisance"]}).json()["case_lifecycle"]
check("the shared filters apply (category = Animal Nuisance)", filtered["received"] == 2 and filtered["closed"] == 1, filtered["received"])

print(f"\n{PASSED} checks passed")
