"""
Adoption eligibility after an owner claim / handover (docs/01-system/ADOPTION_ELIGIBILITY_RULES.md).
Scenarios 1-7 from the request, plus Pet Received, adoption approval / handover guards, audit trail and the
reconciliation of existing records. Throwaway SQLite DB, real JWT auth.
Run from the backend folder:  python tests/test_adoption_eligibility.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "adoption_eligibility_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-eligibility-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, HoldingTimeline, Report, ReportReturn, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoptions, claims, holding  # noqa: E402
from app.utils.adoption_eligibility import INELIGIBLE_DETAIL, owner_handover_evidence, reconcile_returned_listings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (adoptions.router, claims.router, holding.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="Brgy One", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", phone="09170000000", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Owner One", 1, subdivision_id=1, barangay_id=1)
applicant = mk_user("Applicant Two", 1, subdivision_id=1, barangay_id=1)
head = mk_user("Head Officer", 3, barangay_id=1, is_head_officer=True)
head2 = mk_user("Second Head", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HO, HA, HH = H(owner), H(applicant), H(head)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def animal(name, status=2):
    rep = Report(user_id=applicant.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1,
                 current_status_id=8 if status == 6 else 2, custody_status="In Barangay Facility")
    db.add(rep)
    db.flush()
    a = HoldingAnimal(report_id=rep.report_id, animal_name=name, animal_type="Dog", facility_status=status)
    db.add(a)
    db.commit()
    return a


def pet(name):
    p = Pet(owner_id=owner.user_id, pet_name=name, pet_type="Dog", status="Lost", photo_front_url="https://img.test/p.jpg")
    db.add(p)
    db.commit()
    return p


def application(a, status="Pending"):
    ad = Adoption(holding_id=a.holding_id, applicant_id=applicant.user_id, status=status, full_name=applicant.name,
                  address="a", contact_no="0900", reason="r" * 25, current_stage="Application")
    db.add(ad)
    db.commit()
    return ad


promote = lambda a: client.post(f"/adoptions/promote/{a.holding_id}", headers=HH, json={"min_stay_days": 0, "notes": "Healthy and friendly"})  # noqa: E731
apply = lambda a: client.post("/adoptions/apply", headers=HA, json={  # noqa: E731
    "holding_id": a.holding_id, "full_name": applicant.name, "address": "Block 1", "contact_no": "09170000000",
    "living_space": "House with yard", "has_other_pets": False, "reason": "I have a big yard and time to care for a dog."})
catalog_ids = lambda: {x["holding_id"] for x in client.get("/adoptions/catalog?include_reserved=true").json()}  # noqa: E731


def file_and_approve(a, p):
    c = client.post("/claims/", headers=HO, json={"report_id": a.report_id, "pet_id": p.pet_id, "remarks": "Mine"})
    assert c.status_code == 200, c.text
    cid = c.json()["claim_id"]
    r = client.patch(f"/claims/{cid}/status", headers=HH, json={"status": "Approved", "remarks": "Proof checked"})
    assert r.status_code == 200, r.text
    return cid


def handover(cid):
    return client.patch(f"/claims/{cid}/status", headers=HH, json={"status": "Handover Complete", "bypass_handover_photo": True,
                                                                   "merged_sightings_reviewed": True, "remarks": "Owner took the dog home"})


# 1. Under Barangay care: can be listed
a1 = animal("Brownie")
r = promote(a1)
check("1 under Barangay care: can be added to the adoption catalog", r.status_code == 200 and a1.holding_id in catalog_ids(), r.text[:200])
detail = client.get(f"/holding/{a1.holding_id}", headers=HH).json()
check("1 the holding view says it is eligible", detail.get("adoption_eligible") is True and detail.get("adoption_block_reason") is None, detail.get("adoption_eligible"))

# 2. Claim submitted, pending: nothing marked returned
a2 = animal("Bantay")
p2 = pet("Bantay")
c2 = client.post("/claims/", headers=HO, json={"report_id": a2.report_id, "pet_id": p2.pet_id, "remarks": "Mine"})
db.expire_all()
check("2 a pending claim doesn't mark the animal returned", c2.status_code == 200 and owner_handover_evidence(db, db.get(HoldingAnimal, a2.holding_id)) is None
      and db.get(HoldingAnimal, a2.holding_id).facility_status == 2 and db.get(HoldingAnimal, a2.holding_id).discharge_date is None, c2.text[:200])

# 3. Claim approved, handover pending: not completed
r = client.patch(f"/claims/{c2.json()['claim_id']}/status", headers=HH, json={"status": "Approved", "remarks": "Proof checked"})
db.expire_all()
a2r = db.get(HoldingAnimal, a2.holding_id)
check("3 an approved claim doesn't complete the handover", r.status_code == 200 and a2r.facility_status == 2 and a2r.discharge_date is None
      and db.query(ReportReturn).filter(ReportReturn.report_id == a2.report_id).count() == 0
      and owner_handover_evidence(db, a2r) is None, r.text[:200])

# 4. Handed over to its owner: can't be added to adoption
r = handover(c2.json()["claim_id"])
db.expire_all()
a2r = db.get(HoldingAnimal, a2.holding_id)
check("4 handover completed: holding record Returned to Owner (Claimed) and discharged",
      r.status_code == 200 and a2r.facility_status == 3 and a2r.discharge_date is not None, r.text[:200])
r = promote(a2r)
check("4 can't be added to the adoption catalog, with the required message", r.status_code == 409 and r.json()["detail"] == INELIGIBLE_DETAIL, r.text[:200])
check("4 the blocked attempt is audited", db.query(AuditLog).filter(AuditLog.action == "ADOPTION_BLOCKED_OWNER_RETURNED").count() >= 1)
check("4 the holding view says it isn't eligible", client.get(f"/holding/{a2.holding_id}", headers=HH).json().get("adoption_eligible") is False)

# 5. API bypass: status change to For Adoption / Adopted, even after reopening the record
r = client.patch(f"/holding/{a2.holding_id}", headers=HH, json={"facility_status": 6})
check("5 the status can't be changed to For Adoption", r.status_code == 409 and r.json()["detail"] == INELIGIBLE_DETAIL, r.text[:200])
r = client.patch(f"/holding/{a2.holding_id}", headers=HH, json={"facility_status": 7})
check("5 ...or to Adopted", r.status_code == 409, r.text[:200])
r = client.patch(f"/holding/{a2.holding_id}", headers=HH, json={"facility_status": 2})
r2 = client.patch(f"/holding/{a2.holding_id}", headers=HH, json={"facility_status": 6})
check("5 reopening the record first doesn't get around it (the return record decides)", r2.status_code == 409, f"{r.status_code} {r2.text[:200]}")

# 6. Listed with applications, then returned to its owner: removed automatically
a6 = animal("Choco")
check("6 listed first", promote(a6).status_code == 200 and a6.holding_id in catalog_ids())
ad6 = application(a6)
p6 = pet("Choco")
cid6 = file_and_approve(a6, p6)
r = handover(cid6)
db.expire_all()
a6r = db.get(HoldingAnimal, a6.holding_id)
check("6 handover completes", r.status_code == 200, r.text[:200])
check("6 removed from the adoption catalog", a6.holding_id not in catalog_ids() and a6r.facility_status == 3 and a6r.promoted_at is None)
app6 = db.get(Adoption, ad6.adoption_id)
check("6 the open application is closed with a clear reason (record kept)", app6 is not None and app6.status == "Cancelled"
      and "handed over to its owner" in (app6.cancellation_reason or ""), app6.cancellation_reason if app6 else None)
check("6 the applicant is notified", db.query(Notification).filter(Notification.user_id == applicant.user_id,
      Notification.title == "Adoption Application Closed").count() == 1)
check("6 other Barangay staff are notified (not the officer who did it)", db.query(Notification).filter(Notification.user_id == head2.user_id,
      Notification.title == "Adoption Closed: Returned to Owner").count() >= 1
      and db.query(Notification).filter(Notification.user_id == head.user_id, Notification.title == "Adoption Closed: Returned to Owner").count() == 0)
check("6 timeline shows the removal", db.query(HoldingTimeline).filter(HoldingTimeline.holding_id == a6.holding_id,
      HoldingTimeline.title == "Removed from Adoption Catalog").count() == 1)
check("6 audit trail: eligibility revoked", db.query(AuditLog).filter(AuditLog.action == "ADOPTION_ELIGIBILITY_REVOKED",
      AuditLog.target_id == a6.holding_id).count() == 1)
check("6 the public catalog detail is gone", client.get(f"/adoptions/catalog/{a6.holding_id}").status_code == 404)

# 7. Completed handover: new applications blocked
r = apply(a6r)
check("7 an adoption application is blocked", r.status_code == 409 and r.json()["detail"] == INELIGIBLE_DETAIL, r.text[:200])

# Other entry points for an animal returned to its owner
ad_old = application(a2r, status="Pending")  # e.g. created before the fix
r = client.put(f"/adoptions/review/{ad_old.adoption_id}", headers=HH, json={"decision": "Approved", "review_notes": "ok"})
check("approving an adoption for a returned animal is refused", r.status_code == 409 and r.json()["detail"] == INELIGIBLE_DETAIL, r.text[:200])
db.expire_all()
check("...and the application wasn't approved", db.get(Adoption, ad_old.adoption_id).status == "Pending")

# Owner's own "Pet Received" completes the return too
a8 = animal("Puti")
p8 = pet("Puti")
cid8 = file_and_approve(a8, p8)
r = client.patch(f"/claims/{cid8}/status", headers=HO, json={"status": "Pet Received", "remarks": "He is home"})
db.expire_all()
a8r = db.get(HoldingAnimal, a8.holding_id)
check("Pet Received discharges the holding record and ends adoption eligibility",
      r.status_code == 200 and a8r.facility_status == 3 and owner_handover_evidence(db, a8r), r.text[:200])

# Existing records: listed although already returned (inconsistent data)
a9 = animal("Old", status=6)
db.add(ReportReturn(report_id=a9.report_id, holding_id=a9.holding_id, has_account=True, owner_user_id=owner.user_id,
                    owner_name="Owner One", relationship_to_animal="Owner", returned_by=head.user_id))
ad9 = application(a9, status="Approved")
db.commit()
check("existing data: hidden from the catalog at once", a9.holding_id not in catalog_ids())
out = reconcile_returned_listings(db)
db.expire_all()
check("existing data: reconciliation removes the listing and closes the application",
      a9.holding_id in out["removed_from_catalog"] and ad9.adoption_id in out["applications_closed"]
      and db.get(HoldingAnimal, a9.holding_id).facility_status == 3 and db.get(Adoption, ad9.adoption_id).status == "Cancelled", out)
check("existing data: records kept (animal, return, application history)",
      db.get(HoldingAnimal, a9.holding_id) is not None and db.get(Adoption, ad9.adoption_id) is not None
      and db.query(ReportReturn).filter(ReportReturn.holding_id == a9.holding_id).count() == 1)
check("existing data: running it again changes nothing", reconcile_returned_listings(db) == {"removed_from_catalog": [], "applications_closed": []})

# Eligible animals keep working
check("an eligible animal is still listed and open for applications", a1.holding_id in catalog_ids() and apply(a1).status_code in (200, 201))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
