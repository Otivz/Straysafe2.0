"""
Analytics accuracy (docs/01-system/ANALYTICS_RULES.md): status groups that add up, no Barangay analytics,
rescue counts by status, a current custody snapshot that never counts returned
animals as available for adoption, successful adoptions = completed handovers, observations, claims, locations.
Run from the backend folder:  python tests/test_analytics_accuracy.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "analytics_accuracy_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-analytics-accuracy-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import (Adoption, EndorsementLetter, HoldingAnimal, Report, ReportCategory, ReportReturn,  # noqa: E402
                               ReportStatus, Rescue, StatusHistory)
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.routes import analytics  # noqa: E402
from app.services import analytics_service  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(analytics.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="San Vicente", city="C"), Barangay(barangay_id=2, barangay_name="Other", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="Elsewhere")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.add(ReportCategory(category_id=4, category_name="Roaming Animal"))


def mk(name, role, subd=1, brgy=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subd, barangay_id=brgy)
    db.add(u)
    db.flush()
    return u


res, leader, staff = mk("Res", 1), mk("Leader", 2), mk("Staff", 3, None)
staff2, admin = mk("StaffTwo", 3, None, 2), mk("Admin", 4, None, None)
db.commit()
NOW = datetime.now() - timedelta(hours=1)
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(status, subd=1, landmark=None, days_ago=0, escalated=False, **kw):
    r = Report(user_id=res.user_id, subdivision_id=subd, category_id=4, latitude=14.5, longitude=121.0, current_status_id=status,
               landmark=landmark, animal_type="Dog", created_at=NOW - timedelta(days=days_ago), **kw)
    db.add(r)
    db.flush()
    if escalated:
        db.add(StatusHistory(report_id=r.report_id, report_status_id=4, updated_by=leader.user_id))
    return r


# Subdivision 1 reports: one of every status group (+ a status-less one and a merged duplicate)
pending = report(1, landmark="  Gate 1 ")
nostatus = report(None, landmark="gate 1")
review = report(16)
verified = report(2, landmark="Clubhouse")
endorsed = report(4)                               # status 4 = Barangay-handled
db.add(EndorsementLetter(report_id=endorsed.report_id, leader_id=leader.user_id, letter_content="Endorsed"))
in_progress = report(8, escalated=True)            # impounded at the Barangay
resolved = report(11, escalated=True)
rejected = report(3)
closed_other = report(12)
merged = report(18, duplicate_of_report_id=pending.report_id)
other_area = report(2, subd=2)                     # another barangay
db.commit()

# ── Status groups add up; merged duplicates aren't incidents ──
d = client.get("/analytics/subdivision", headers=H(leader)).json()
dist = {x["key"]: x["count"] for x in d["status_distribution"]}
check("status: every report in exactly one group, groups add up to the total",
      sum(dist.values()) == d["kpis"]["total_reports"] == 9, (dist, d["kpis"]["total_reports"]))
check("status: pending includes reports with no status yet", dist["pending"] == 2 and d["kpis"]["pending_reports"] == 2)
check("status: under review, verified, endorsed, in progress, resolved, rejected, closed",
      (dist["under_review"], dist["verified"], dist["endorsed"], dist["in_progress"], dist["resolved"], dist["rejected"], dist["closed_other"])
      == (1, 1, 1, 1, 1, 1, 1), dist)
check("status: resolved reports are never pending", d["kpis"]["resolved_reports"] == 1 and dist["pending"] == 2)
r = client.get("/analytics/subdivision", headers=H(leader), params={"status": "endorsed"}).json()
check("filter: status group 'endorsed' filters KPIs and charts", r["kpis"]["total_reports"] == 1
      and sum(r["animal_distribution"].values()) == 1, r["kpis"])
r = client.get("/analytics/subdivision", headers=H(leader), params={"status": "pending"}).json()
check("filter: 'pending' includes status-less reports", r["kpis"]["total_reports"] == 2)
check("filter: unknown status refused", client.get("/analytics/subdivision", headers=H(leader), params={"status": "bogus"}).status_code == 422)
loc = {x["location"]: x["count"] for x in d["top_locations"]}
check("locations: same place with different spacing / case counted together", loc.get("Gate 1") == 2 and loc.get("Clubhouse") == 1, loc)

# ── No Barangay analytics: the endpoint is gone and Barangay staff get no analytics ──
check("barangay: no Barangay analytics endpoint", client.get("/analytics/barangay", headers=H(staff)).status_code == 404)
check("barangay: staff can't open subdivision or admin analytics",
      client.get("/analytics/subdivision", headers=H(staff)).status_code == 403 and client.get("/analytics/admin", headers=H(staff)).status_code == 403)
db.add(Pet(owner_id=res.user_id, pet_name="Registry pet", pet_type="Dog", status="Active"))
db.commit()
check("subdivision: its own registry counted", client.get("/analytics/subdivision", headers=H(leader)).json()["pet_compliance"]["total_pets"] == 1)

# ── Rescue counts by status (cohort = report filing date) ──
db.add_all([Rescue(report_id=endorsed.report_id, status_id=1),
            Rescue(report_id=in_progress.report_id, status_id=5, started_at=NOW + timedelta(minutes=30)),
            Rescue(report_id=resolved.report_id, status_id=6, started_at=NOW + timedelta(hours=1), completed_at=NOW + timedelta(hours=2)),
            Rescue(report_id=resolved.report_id, status_id=3)])
db.commit()
rs = client.get("/analytics/admin", headers=H(admin)).json()["rescue_summary"]
check("rescues: total, pending, active, completed, cancelled", (rs["total"], rs["pending"], rs["active"], rs["completed"], rs["cancelled"])
      == (4, 1, 1, 1, 1), rs)
check("rescues: report-to-start time only from real timestamps", rs["response_samples"] == 2 and rs["avg_report_to_start_hours"] == 0.8, rs)
check("rescues: KPI total counts every request (not only completed ones)",
      client.get("/analytics/admin", headers=H(admin)).json()["kpis"]["total_rescues"] == 4)

# ── Custody snapshot: current, and returned animals never 'available for adoption' ──
old = report(8, days_ago=100, escalated=True)      # intake long before the 30-day window
db.add(HoldingAnimal(report_id=old.report_id, animal_type="Dog", facility_status=2, intake_date=NOW - timedelta(days=100)))
listed = HoldingAnimal(report_id=in_progress.report_id, animal_type="Dog", facility_status=6, intake_date=NOW)
returned_listed = HoldingAnimal(report_id=resolved.report_id, animal_type="Dog", facility_status=6, intake_date=NOW)
db.add_all([listed, returned_listed])
db.flush()
db.add(ReportReturn(report_id=resolved.report_id, holding_id=returned_listed.holding_id, has_account=True, owner_name="Res",
                    relationship_to_animal="Owner"))
adopted = HoldingAnimal(report_id=endorsed.report_id, animal_type="Cat", facility_status=7, intake_date=NOW)
db.add(adopted)
db.commit()
bd = client.get("/analytics/admin", headers=H(admin), params={"days": 30}).json()
cs = bd["custody_snapshot"]
check("custody: animals held now are counted even if they arrived before the period", cs["in_custody_now"] == 2, cs)
check("custody: a returned animal is not available for adoption", cs["available_for_adoption_now"] == 1, cs)
check("custody: returned to owner counted from the return record", cs["returned_to_owner_total"] == 1, cs)
check("custody: adopted counted", cs["adopted_total"] == 1, cs)
check("holding cohort: returned-to-owner counts the return record too", bd["holding_summary"]["returned_to_owner"] == 1, bd["holding_summary"])

# ── Adoptions: only completed handovers are successful ──
for status, handed in (("Pending", False), ("Approved", False), ("Approved", True)):
    db.add(Adoption(holding_id=adopted.holding_id, applicant_id=res.user_id, status=status, full_name="A", address="X", contact_no="1",
                    reason="R", staff_handed_over=handed, is_handed_over=handed, created_at=NOW))
db.commit()
ha = client.get("/analytics/admin", headers=H(admin)).json()
check("adoptions: pending and approved-only applications are not successful adoptions",
      ha["holding_and_adoption"]["successful_adoptions"] == 1 and ha["kpis"]["total_adoptions"] == 1
      and ha["holding_and_adoption"]["approved_adoptions"] == 2 and ha["holding_and_adoption"]["pending_adoptions"] == 1, ha["holding_and_adoption"])

# ── Claims and observations ──
pet = db.query(Pet).filter(Pet.pet_name == "Registry pet").one()
db.add_all([PetClaim(report_id=endorsed.report_id, pet_id=pet.pet_id, status="Approved"),
            PetClaim(report_id=resolved.report_id, pet_id=pet.pet_id, status="Handover Complete"),
            PetClaim(report_id=in_progress.report_id, pet_id=pet.pet_id, status="Rejected")])
fu_open = OwnerFollowUp(report_id=verified.report_id, pet_id=pet.pet_id, subdivision_id=1, leader_id=leader.user_id,
                        owner_name="Res", status="observing", duration_days=3, due_at=NOW + timedelta(days=3))
fu_done = OwnerFollowUp(report_id=review.report_id, pet_id=pet.pet_id, subdivision_id=1, leader_id=leader.user_id,
                        owner_name="Res", status="complied", duration_days=3, due_at=NOW, closed_at=NOW)
db.add_all([fu_open, fu_done])
db.commit()
cl = client.get("/analytics/admin", headers=H(admin)).json()["claims_summary"]
check("claims: submitted, awaiting handover, handed over, rejected", (cl["submitted"], cl["approved_pending_handover"], cl["handed_over"], cl["rejected"])
      == (3, 1, 1, 1), cl)
ob = client.get("/analytics/subdivision", headers=H(leader)).json()["observations"]
check("observations: open now and resolved in the period", ob["active_now"] == 1 and ob["resolved_in_period"] == 1, ob)

# ── Records change -> analytics change (no stale numbers) ──
before = client.get("/analytics/subdivision", headers=H(leader)).json()["kpis"]
db.get(Report, verified.report_id).current_status_id = 11      # e.g. the observation resolved the report
db.commit()
after = client.get("/analytics/subdivision", headers=H(leader)).json()["kpis"]
check("updates: a resolved report moves from verified to resolved", after["resolved_reports"] == before["resolved_reports"] + 1
      and after["verified_status_reports"] == before["verified_status_reports"] - 1, (before, after))

# ── The pet registry is aggregated in SQL (no per-pet rows) ──
from sqlalchemy import event  # noqa: E402
count = [0]
listener = lambda *a, **k: count.__setitem__(0, count[0] + 1)  # noqa: E731
event.listen(engine, "before_cursor_execute", listener)
sizes = []
for batch in range(2):
    for i in range(30):
        db.add(Pet(owner_id=res.user_id, pet_name=f"Bulk{batch}-{i}", pet_type="Cat", status="Active", is_vaccinated=True))
    db.commit()
    count[0] = 0
    r = client.get("/analytics/subdivision", headers=H(leader)).json()
    sizes.append((count[0], r["pet_compliance"]["total_pets"]))
check("performance: query count independent of the number of pets (31 vs 61 pets)",
      sizes[0][0] == sizes[1][0] and sizes[1][1] == 61, sizes)
check("registry: vaccination counted from records", r["pet_compliance"]["vaccinated"] == 60)
event.remove(engine, "before_cursor_execute", listener)
check("status groups cover every status id", all(analytics_service.status_group(i) for i in range(1, 19)))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
