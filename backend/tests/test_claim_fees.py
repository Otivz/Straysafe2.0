"""
Pet claiming fees (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md): dog fine PHP 500-1,000 (RA 9482), a separate cat fine
only when configured with its legal basis ("No Authorized Fine Configured" otherwise), separately authorized impounding
and boarding fees, permissions, change log with reasons, payment and receipt, waiver, and the handover only after the
charges are settled (payment never completes it).
Run from the backend folder:  python tests/test_claim_fees.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "claim_fees_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claim-fees-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.claim_assessment import ClaimAssessment, ClaimAssessmentChange  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claim_assessments, claims  # noqa: E402
from app.utils.adoption_eligibility import owner_handover_evidence  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (claims.router, claim_assessments.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=kw.pop("subdivision_id", 1), barangay_id=1, phone="09170000000", **kw)
    db.add(u)
    db.flush()
    return u


owner, other = mk("Owner", 1), mk("Other", 1)
leader = mk("Leader", 2)
staff, head, admin = mk("Staff", 3), mk("Head", 3, is_head_officer=True), mk("Admin", 4, subdivision_id=None)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HO, HX, HL, HS, HH, HA = (H(u) for u in (owner, other, leader, staff, head, admin))
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def held_case(species, name):
    rep = Report(user_id=other.user_id, subdivision_id=1, category_id=4, latitude=1, longitude=1, current_status_id=8,
                 custody_status="In Barangay Facility", animal_type=species)
    db.add(rep)
    db.flush()
    db.add(StatusHistory(report_id=rep.report_id, report_status_id=4, updated_by=leader.user_id))  # escalated to the Barangay
    db.add(HoldingAnimal(report_id=rep.report_id, animal_name=name, animal_type=species, facility_status=2,
                         intake_date=datetime.now() - timedelta(days=3, hours=2)))
    pet = Pet(owner_id=owner.user_id, pet_name=name, pet_type=species, status="Lost", photo_front_url="https://img.test/p.jpg")
    db.add(pet)
    db.commit()
    return rep, pet


def claim_for(rep, pet, approve=True):
    r = client.post("/claims/", headers=HO, json={"report_id": rep.report_id, "pet_id": pet.pet_id, "remarks": "Mine"})
    assert r.status_code == 200, r.text
    cid = r.json()["claim_id"]
    if approve:
        a = client.patch(f"/claims/{cid}/status", headers=HS, json={"status": "Approved", "remarks": "Ownership verified"})
        assert a.status_code == 200, a.text
    return cid


assess = lambda cid, h=HS, **body: client.post(f"/claim-assessments/claims/{cid}", headers=h, json=body)  # noqa: E731
handover = lambda cid: client.patch(f"/claims/{cid}/status", headers=HS, json={  # noqa: E731
    "status": "Handover Complete", "bypass_handover_photo": True, "merged_sightings_reviewed": True, "remarks": "Handed over"})

# ── Dog ──
dog_rep, dog_pet = held_case("Dog", "Bantay")
pending_cid = claim_for(dog_rep, dog_pet, approve=False)
check("workflow: no assessment before ownership is verified", assess(pending_cid, fine_amount=500).status_code == 409)
client.patch(f"/claims/{pending_cid}/status", headers=HS, json={"status": "Approved", "remarks": "Ownership verified"})
dog_cid = pending_cid
q = client.get(f"/claim-assessments/claims/{dog_cid}/quote", headers=HS).json()
check("dog: species detected first", q["species"] == "Dog", q)
check("dog: Dog Impounding Fine PHP 500-1,000 with RA 9482 as basis", q["fine"]["category"] == "DOG_IMPOUNDING_FINE"
      and q["fine"]["min"] == 500 and q["fine"]["max"] == 1000 and "9482" in q["fine"]["legal_basis"], q["fine"])
check("dog: no impounding or boarding fee without an authorized schedule",
      q["impounding_fee"]["configured"] is False and q["boarding_fee"]["configured"] is False)
check("permissions: Subdivision Leaders can't assess", assess(dog_cid, HL, fine_amount=500).status_code == 403)
check("permissions: residents can't assess", assess(dog_cid, HO, fine_amount=500).status_code == 403)
check("dog: below PHP 500 refused", assess(dog_cid, fine_amount=499).status_code == 400)
check("dog: above PHP 1,000 refused", assess(dog_cid, fine_amount=1001).status_code == 400)
check("dog: an amount is required", assess(dog_cid).status_code == 400)
r = assess(dog_cid, fine_amount=750, notes="First impoundment")
d = r.json()
check("dog: assessment created within the range", r.status_code == 200 and d["fine_amount"] == 750 and d["total_due"] == 750
      and d["status"] == "Assessed" and d["fine_label"] == "Dog Impounding Fine", r.text[:300])
check("breakdown: animal, species, owner, claim reference, staff and date",
      d["animal_id"] and d["animal_name"] == "Bantay" and d["species"] == "Dog" and d["owner_name"] == "Owner"
      and d["claim_reference"].startswith("CLM-") and d["assessed_by_name"] == "Staff" and d["assessed_at"])
check("one active assessment per claim", assess(dog_cid, fine_amount=600).status_code == 409)
r = handover(dog_cid)
check("handover refused while charges are unpaid", r.status_code == 409 and "settled" in r.text, r.text[:200])

aid = d["assessment_id"]
check("adjusting needs a reason", client.patch(f"/claim-assessments/{aid}", headers=HS, json={"fine_amount": 900}).status_code == 422)
r = client.patch(f"/claim-assessments/{aid}", headers=HS, json={"fine_amount": 900, "reason": "Second impoundment this year"})
check("adjusted with a reason", r.status_code == 200 and r.json()["total_due"] == 900, r.text[:200])
ch = [c for c in r.json()["changes"] if c["action"] == "adjusted" and c["field"] == "fine_amount"]
check("change log: previous and new amount, reason, staff and time",
      ch and ch[0]["previous_value"] == "750.00" and ch[0]["new_value"] == "900.00" and ch[0]["reason"] == "Second impoundment this year"
      and ch[0]["changed_by_name"] == "Staff" and ch[0]["changed_at"], ch)
check("adjusting still respects the legal range", client.patch(f"/claim-assessments/{aid}", headers=HS,
      json={"fine_amount": 1200, "reason": "Typo correction attempt"}).status_code == 400)

pay = lambda amount, receipt="OR-000123", h=HS: client.post(f"/claim-assessments/{aid}/payment", headers=h,  # noqa: E731
                                                            json={"receipt_number": receipt, "amount_paid": amount})
check("payment: must match the total due", pay(750).status_code == 400)
check("payment: Subdivision Leaders can't collect", pay(900, h=HL).status_code == 403)
r = pay(900)
check("payment recorded with the official receipt", r.status_code == 200 and r.json()["status"] == "Paid"
      and r.json()["receipt_number"] == "OR-000123" and r.json()["payment_recorded_by_name"] == "Staff", r.text[:200])
db.expire_all()
check("payment alone doesn't complete the handover", db.get(PetClaim, dog_cid).status == "Approved"
      and db.query(HoldingAnimal).filter(HoldingAnimal.report_id == dog_rep.report_id).first().facility_status == 2)
check("a paid assessment can't be adjusted", client.patch(f"/claim-assessments/{aid}", headers=HS,
      json={"fine_amount": 800, "reason": "Late change after payment"}).status_code == 409)
r = handover(dog_cid)
db.expire_all()
h = db.query(HoldingAnimal).filter(HoldingAnimal.report_id == dog_rep.report_id).first()
check("handover after payment: Returned to Owner and out of adoption", r.status_code == 200 and h.facility_status == 3
      and owner_handover_evidence(db, h), r.text[:200])

# ── Views ──
v = client.get(f"/claim-assessments/claims/{dog_cid}", headers=HO).json()
check("residents see their own assessment and payment status", v["assessment"]["status"] == "Paid" and v["can_manage"] is False)
check("other residents can't", client.get(f"/claim-assessments/claims/{dog_cid}", headers=HX).status_code == 404)
v = client.get(f"/claim-assessments/claims/{dog_cid}", headers=HL).json()
check("Subdivision Leaders can monitor (read-only)", v["assessment"]["status"] == "Paid" and v["can_manage"] is False)

# ── Cat: the claiming charge is entered by hand by Barangay staff ──
cat_rep, cat_pet = held_case("Cat", "Muning")
cat_cid = claim_for(cat_rep, cat_pet)
q = client.get(f"/claim-assessments/claims/{cat_cid}/quote", headers=HS).json()
check("cat: Cat Claiming Charge, manual entry, no default amount or range", q["species"] == "Cat"
      and q["fine"]["category"] == "CAT_CLAIMING_FINE" and q["fine"]["entry"] == "manual"
      and q["fine"]["min"] is None and q["fine"]["max"] is None and q["fine"]["legal_basis"] is None, q["fine"])
check("cat: nothing is added automatically (no amount, no 'no charge' choice)", assess(cat_cid).status_code == 400)
CAT = {"charge_description": "Cat claiming charge (impounded cat)", "charge_basis": "Barangay Resolution No. 5, s. 2026"}
check("cat: amount required", assess(cat_cid, **CAT).status_code == 400)
check("cat: a negative amount is refused", assess(cat_cid, fine_amount=-1, **CAT).status_code == 422)
check("cat: letters are refused", assess(cat_cid, fine_amount="abc", **CAT).status_code == 422)
check("cat: more than 2 decimals is refused", assess(cat_cid, fine_amount="10.555", **CAT).status_code == 422)
check("cat: a charge description is required",
      assess(cat_cid, fine_amount=300, charge_basis=CAT["charge_basis"]).status_code == 400)
check("cat: a reason / basis is required",
      assess(cat_cid, fine_amount=300, charge_description=CAT["charge_description"]).status_code == 400)
check("permissions: Subdivision Leaders can't enter a cat charge", assess(cat_cid, HL, fine_amount=300, **CAT).status_code == 403)
check("permissions: residents can't enter a cat charge", assess(cat_cid, HO, fine_amount=300, **CAT).status_code == 403)
r = assess(cat_cid, fine_amount="300.50", **CAT)
c = r.json()
check("cat: the entered amount, description, basis, staff and date are saved", r.status_code == 200
      and c["fine_amount"] == 300.5 and c["charge_description"] == CAT["charge_description"]
      and c["fine_legal_basis"] == CAT["charge_basis"] and c["assessed_by_name"] == "Staff" and c["assessed_at"]
      and c["fine_label"] == "Cat Claiming Charge" and c["charge_entry"] == "manual", r.text[:300])
check("cat: the total is only what was entered", c["total_due"] == 300.5 and c["impounding_fee"] == 0 and c["boarding_fee"] == 0)
check("cat: species Cat, animal name and ID on the breakdown", c["species"] == "Cat" and c["animal_name"] == "Muning" and c["animal_id"])
cat_aid = c["assessment_id"]
check("cat: adjusting needs a reason", client.patch(f"/claim-assessments/{cat_aid}", headers=HS, json={"fine_amount": 250}).status_code == 422)
r = client.patch(f"/claim-assessments/{cat_aid}", headers=HS, json={"fine_amount": 250, "charge_description": "Cat claiming charge (reduced)",
                                                                     "reason": "Resolution allows reduced charge for first claim"})
ch = {x["field"]: x for x in r.json().get("changes", []) if x["action"] == "adjusted"}
check("cat: an adjustment keeps the previous and new amount, staff, time and reason", r.status_code == 200
      and ch.get("fine_amount", {}).get("previous_value") == "300.50" and ch["fine_amount"]["new_value"] == "250.00"
      and ch["fine_amount"]["changed_by_name"] == "Staff" and ch["fine_amount"]["changed_at"]
      and ch["fine_amount"]["reason"] == "Resolution allows reduced charge for first claim", r.text[:300])
check("cat: the description change is on record too", ch.get("charge_description", {}).get("previous_value") == CAT["charge_description"])
check("cat: nothing silently overwritten (created row kept)", any(x["action"] == "created" for x in r.json()["changes"]))
r = handover(cat_cid)
check("cat: unpaid charge blocks the handover", r.status_code == 409, r.text[:200])
client.post(f"/claim-assessments/{cat_aid}/payment", headers=HS, json={"receipt_number": "OR-CAT-1", "amount_paid": 250})
check("cat: after payment the handover proceeds", handover(cat_cid).status_code == 200)

# Cat: staff record that no charge applies
catn_rep, catn_pet = held_case("Cat", "Puti")
catn = claim_for(catn_rep, catn_pet)
check("no charge: an amount can't come with 'no charge applicable'",
      assess(catn, no_charge=True, fine_amount=50, charge_basis="No ordinance covers cats").status_code == 400)
check("no charge: the reason is required", assess(catn, no_charge=True).status_code == 400)
r = assess(catn, no_charge=True, charge_basis="No ordinance covers cat claiming charges")
check("no charge: recorded with its reason, nothing owed", r.status_code == 200 and r.json()["fine_amount"] is None
      and r.json()["no_charge_applicable"] is True and r.json()["fine_note"] == "No charge applicable"
      and r.json()["total_due"] == 0, r.text[:300])
check("no charge: the handover can proceed", handover(catn).status_code == 200)

# Dog and cat rules stay separate
dogx_rep, dogx_pet = held_case("Dog", "Askal")
dogx = claim_for(dogx_rep, dogx_pet)
check("separate: cat-only fields are refused for a dog", assess(dogx, fine_amount=600, **CAT).status_code == 400)
check("separate: 'no charge' can't skip the dog fine", assess(dogx, no_charge=True, charge_basis="x" * 10).status_code == 400)

# ── Configured schedules (Head Officer / Admin, with legal basis): impounding and boarding only ──
sched = lambda body, h=HH: client.post("/claim-assessments/schedules", headers=h, json=body)  # noqa: E731
IMP = {"fee_type": "IMPOUNDING_FEE", "min_amount": 100, "max_amount": 100, "legal_basis": "Barangay Ordinance No. 13, s. 2026"}
check("schedules: regular staff can't configure", sched(IMP, HS).status_code == 403)
check("schedules: a legal basis is required", sched({**IMP, "legal_basis": "x"}).status_code == 422)
check("schedules: minimum can't exceed maximum", sched({**IMP, "min_amount": 400, "max_amount": 300}).status_code == 400)
r = sched({"fee_type": "CAT_CLAIMING_FINE", "min_amount": 200, "max_amount": 300, "legal_basis": "Barangay Ordinance No. 12, s. 2026"})
check("schedules: no configured cat fine (cat charges are entered per assessment)", r.status_code == 400, r.text[:200])
check("schedules: the Head Officer configures the impounding fee", sched(IMP).status_code == 200)
sched({"fee_type": "BOARDING_FEE_PER_DAY", "min_amount": 50, "max_amount": 50, "legal_basis": "Barangay Ordinance No. 13, s. 2026"})
lst = client.get("/claim-assessments/schedules", headers=HL).json()
check("schedules: dog fine shown as fixed (RA 9482), configured fees listed", lst["dog_fine"]["editable"] is False
      and {s["fee_type"] for s in lst["schedules"]} == {"IMPOUNDING_FEE", "BOARDING_FEE_PER_DAY"} and lst["can_configure"] is False)

cat2_rep, cat2_pet = held_case("Cat", "Ming")
cat2 = claim_for(cat2_rep, cat2_pet)
r = assess(cat2, fine_amount=250, charge_description="Cat claiming charge", charge_basis="Barangay Resolution No. 5, s. 2026")
c = r.json()
check("cat charge, impounding fee and boarding (rate x days) itemized", r.status_code == 200 and c["fine_amount"] == 250
      and c["impounding_fee"] == 100 and c["boarding_days"] == 4 and c["boarding_fee"] == 200 and c["total_due"] == 550
      and c["fine_legal_basis"] == "Barangay Resolution No. 5, s. 2026", r.text[:300])
check("never both fines on one animal", c["fine_category"] == "CAT_CLAIMING_FINE")

# ── Waiver ──
wid = c["assessment_id"]
check("waiver needs an authorized reason", client.post(f"/claim-assessments/{wid}/waive", headers=HS, json={"reason": "no"}).status_code == 422)
r = client.post(f"/claim-assessments/{wid}/waive", headers=HS, json={"reason": "Indigent owner, waiver under Ordinance No. 12 Sec. 4"})
check("waived with the reason", r.status_code == 200 and r.json()["status"] == "Waived" and r.json()["waived_by_name"] == "Staff", r.text[:200])
check("a waived claim can be handed over", handover(cat2).status_code == 200)

# ── Every owner-return path (holding release, report resolution, rescue) is held back by unpaid charges ──
dog3_rep, dog3_pet = held_case("Dog", "Tagpi")
dog3 = claim_for(dog3_rep, dog3_pet)
a3 = assess(dog3, fine_amount=500).json()["assessment_id"]
from fastapi import HTTPException  # noqa: E402
from app.utils.owner_returns import record_owner_return  # noqa: E402
try:
    record_owner_return(db, db.get(Report, dog3_rep.report_id), {"has_account": True, "owner_user_id": owner.user_id,
                        "owner_name": "Owner", "relationship_to_animal": "Owner"}, db.get(User, staff.user_id))
    blocked = None
except HTTPException as e:
    blocked = e
db.rollback()
check("owner return outside the claim screen refused while unpaid", blocked is not None and blocked.status_code == 409
      and "settled" in blocked.detail, blocked)
check("...and nothing was recorded", db.query(HoldingAnimal).filter(HoldingAnimal.report_id == dog3_rep.report_id).first().facility_status == 2)

# ── Rejected claim cancels its unpaid assessment ──
client.patch(f"/claims/{dog3}/status", headers=HS, json={"status": "Rejected", "remarks": "Wrong owner"})
db.expire_all()
check("rejecting the claim cancels the unpaid assessment (kept on record)", db.get(ClaimAssessment, a3).status == "Cancelled"
      and db.query(ClaimAssessmentChange).filter(ClaimAssessmentChange.assessment_id == a3, ClaimAssessmentChange.action == "cancelled").count() == 1)

# ── Audit trail ──
actions = {a for (a,) in db.query(AuditLog.action).all()}
check("audit: create, adjust, payment, waiver and fee configuration recorded",
      {"CREATE_CLAIM_ASSESSMENT", "ADJUST_CLAIM_ASSESSMENT", "RECORD_CLAIM_PAYMENT", "WAIVE_CLAIM_ASSESSMENT", "CONFIGURE_CLAIM_FEE"} <= actions, actions)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
