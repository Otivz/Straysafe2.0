"""
Barangay Referral log (SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md, Phase 2).

Access scope, audit entries, no custody or holding change, the outcome closes the report once, another subdivision
is refused, and no Rescue row is created.

Run: .venv/Scripts/python.exe backend/tests/test_barangay_referrals.py  (throwaway SQLite, never the app database)
"""
import os
import sys
import tempfile
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "referrals.db")
os.environ.setdefault("JWT_SECRET_KEY", "referral-test-secret-key-0123456789-0123456789")
os.environ.pop("BARANGAY_WORKFLOWS_ENABLED", None)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.barangay_referral import BarangayReferral, BarangayReferralUpdate  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import (EndorsementLetter, HoldingAnimal, Report, ReportCategory, ReportStatus,  # noqa: E402
                               Rescue, StatusHistory)
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import barangay_referrals  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(barangay_referrals.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
db.add(ReportCategory(category_id=4, category_name="Roaming"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def make_user(name, role, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@referraltest.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


resident = make_user("Resident One", 1)
leader = make_user("Leader One", 2)
other_leader = make_user("Leader Two", 2, subdivision=2)
admin = make_user("Admin One", 4)
brgy = make_user("Head Reyes", 3)
pet = Pet(owner_id=None, pet_name="Brownie", pet_type="Dog", status="Active")
db.add(pet)
db.commit()


def make_report(status_id=2, **extra):
    r = Report(user_id=resident.user_id, subdivision_id=1, category_id=4, current_status_id=status_id, animal_type="Dog",
               latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2",
               custody_status="Sighting", facility_id=None, pet_id=pet.pet_id, **extra)
    db.add(r)
    db.commit()
    return r.report_id


def H(u):
    return {"Authorization": "Bearer " + create_access_token(
        {"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


passed = 0


def check(label, condition, info=""):
    global passed
    assert condition, f"{label} {info}"
    passed += 1
    print(f"[PASS] {label}")


def fresh(model, key):
    db.expire_all()
    return db.get(model, key)


REFERRAL = {"reason": "Aggressive dog near the playground", "contact_method": "call", "reference_no": "BRGY-0042"}
today = date.today()

with patch("app.services.email_service._deliver_email_sync", return_value=True):
    rid = make_report()

    # Access scope
    for who, label in ((resident, "resident"), (brgy, "Barangay account")):
        r = client.post(f"/reports/{rid}/referral", json=REFERRAL, headers=H(who))
        check(f"{label} cannot refer (403)", r.status_code == 403, r.text)
    r = client.post(f"/reports/{rid}/referral", json=REFERRAL, headers=H(other_leader))
    check("leader of another subdivision cannot refer (403)", r.status_code == 403, r.text)
    check("no referral was written by refused calls", db.query(BarangayReferral).count() == 0)

    # Create
    r = client.post(f"/reports/{rid}/referral", json=REFERRAL, headers=H(leader))
    check("leader refers the case (201)", r.status_code == 201, r.text)
    body = r.json()
    ref_id = body["referral_id"]
    check("referral goes to the subdivision's own Barangay", body["barangay_name"] == "San Vicente" and body["referred_by_name"] == "Leader One")
    rep = fresh(Report, rid)
    check("report is now status 4 (Referred to Barangay)", rep.current_status_id == 4)
    hist = db.query(StatusHistory).filter(StatusHistory.report_id == rid).all()
    check("one history entry naming the Barangay and the leader",
          len(hist) == 1 and "Referred to Barangay San Vicente by Leader One" in (hist[0].remarks or ""))
    check("endorsement letter kept", db.query(EndorsementLetter).filter(EndorsementLetter.report_id == rid).count() == 1)
    check("response carries the letter title", body["letter_title"] == f"Endorsement for Report #{rid}")
    check("no Rescue row created", db.query(Rescue).count() == 0)
    check("audit entry for the referral",
          db.query(AuditLog).filter(AuditLog.action == "Create Barangay Referral").count() == 1)
    check("reporter notified", db.query(Notification).filter(Notification.user_id == resident.user_id,
                                                             Notification.related_id == rid).count() >= 1)
    check("Barangay account not notified", db.query(Notification).filter(Notification.user_id == brgy.user_id).count() == 0)
    r = client.post(f"/reports/{rid}/referral", json=REFERRAL, headers=H(leader))
    check("a second referral is refused (409)", r.status_code == 409, r.text)

    # Read
    check("leader reads the referral", client.get(f"/reports/{rid}/referral", headers=H(leader)).status_code == 200)
    check("admin reads the referral", client.get(f"/reports/{rid}/referral", headers=H(admin)).status_code == 200)
    check("other leader cannot read it (403)", client.get(f"/reports/{rid}/referral", headers=H(other_leader)).status_code == 403)
    check("resident cannot read it (403)", client.get(f"/reports/{rid}/referral", headers=H(resident)).status_code == 403)
    check("leader's list has it", len(client.get("/referrals/", headers=H(leader)).json()) == 1)
    check("other leader's list is empty", client.get("/referrals/", headers=H(other_leader)).json() == [])

    # Updates
    upd = {"update_type": "held", "update_date": today.isoformat(), "note": "Barangay says the dog is in their pound",
           "evidence_url": "https://res.cloudinary.com/demo/image/upload/proof.jpg"}
    r = client.post(f"/referrals/{ref_id}/updates", json=upd, headers=H(leader))
    check("leader records a Barangay update (201)", r.status_code == 201, r.text)
    u = r.json()["updates"][0]
    check("update labelled 'Reported by Barangay' with recorder", u["source_label"] == "Reported by Barangay" and u["recorded_by_name"] == "Leader One")
    rep = fresh(Report, rid)
    check("'held' update does not touch custody, facility or pin",
          rep.custody_status == "Sighting" and rep.facility_id is None
          and rep.latitude == Decimal("14.80000000") and rep.longitude == Decimal("121.00000000"))
    check("no holding record created", db.query(HoldingAnimal).count() == 0)
    check("report status unchanged by an update", rep.current_status_id == 4)
    check("audit entry for the update", db.query(AuditLog).filter(AuditLog.action == "Record Barangay Update").count() == 1)
    r = client.post(f"/referrals/{ref_id}/updates", json={**upd, "evidence_url": "http://insecure.example/x.jpg"}, headers=H(leader))
    check("non-https evidence refused (422)", r.status_code == 422, r.text)
    r = client.post(f"/referrals/{ref_id}/updates", json={**upd, "update_date": (today + timedelta(days=5)).isoformat()}, headers=H(leader))
    check("future update date refused (400)", r.status_code == 400, r.text)
    r = client.post(f"/referrals/{ref_id}/updates", json={**upd, "update_type": "teleported"}, headers=H(leader))
    check("unknown update type refused (422)", r.status_code == 422, r.text)
    r = client.post(f"/referrals/{ref_id}/updates", json=upd, headers=H(other_leader))
    check("other leader cannot add an update (403)", r.status_code == 403, r.text)

    # Outcome
    out = {"final_outcome": "claimed", "outcome_date": today.isoformat(), "note": "Owner picked it up at the barangay hall"}
    r = client.post(f"/referrals/{ref_id}/outcome", json=out, headers=H(other_leader))
    check("other leader cannot record the outcome (403)", r.status_code == 403, r.text)
    r = client.post(f"/referrals/{ref_id}/outcome", json=out, headers=H(leader))
    check("leader records the outcome (200)", r.status_code == 200, r.text)
    rep = fresh(Report, rid)
    check("outcome closes the report as status 9", rep.current_status_id == 9)
    check("closing does not touch custody or facility", rep.custody_status == "Sighting" and rep.facility_id is None)
    last = db.query(StatusHistory).filter(StatusHistory.report_id == rid).order_by(StatusHistory.history_id.desc()).first()
    check("closing history entry is marked as reported by the Barangay",
          last.report_status_id == 9 and (last.remarks or "").startswith("Reported by Barangay San Vicente on"))
    check("audit entry for the outcome", db.query(AuditLog).filter(AuditLog.action == "Record Barangay Outcome").count() == 1)
    r = client.post(f"/referrals/{ref_id}/outcome", json={**out, "final_outcome": "deceased"}, headers=H(leader))
    check("a second outcome is refused (409)", r.status_code == 409, r.text)
    check("status still 9 after the refused second outcome", fresh(Report, rid).current_status_id == 9)
    r = client.post(f"/referrals/{ref_id}/updates", json=upd, headers=H(leader))
    check("no updates after the outcome (409)", r.status_code == 409, r.text)
    check("open-only list excludes closed referrals", client.get("/referrals/?open_only=true", headers=H(leader)).json() == [])

    # Other cases
    rejected = make_report(status_id=3)
    r = client.post(f"/reports/{rejected}/referral", json=REFERRAL, headers=H(leader))
    check("a rejected report cannot be referred (400)", r.status_code == 400, r.text)
    primary = make_report()
    merged = make_report(status_id=18, duplicate_of_report_id=primary)
    r = client.post(f"/reports/{merged}/referral", json=REFERRAL, headers=H(leader))
    check("a merged report cannot be referred (400)", r.status_code == 400, r.text)
    old = make_report(status_id=4)
    r = client.post(f"/reports/{old}/referral", json=REFERRAL, headers=H(admin))
    check("admin can open a referral record for an older escalation (201)", r.status_code == 201, r.text)
    check("older escalation keeps its status 4 and gets no new history",
          fresh(Report, old).current_status_id == 4 and db.query(StatusHistory).filter(StatusHistory.report_id == old).count() == 0)
    stray = Report(user_id=resident.user_id, subdivision_id=1, category_id=4, current_status_id=2, animal_type="Dog",
                   latitude=Decimal("14.8"), longitude=Decimal("121.0"), pet_id=None)
    db.add(stray)
    db.commit()
    r = client.post(f"/reports/{stray.report_id}/referral", json=REFERRAL, headers=H(leader))
    check("a case without an animal record cannot be referred yet (400)", r.status_code == 400 and "animal record" in r.text, r.text)
    check("updates table holds only the one accepted update", db.query(BarangayReferralUpdate).count() == 1)

db.close()
print(f"\nAll {passed} Barangay referral checks passed.")
