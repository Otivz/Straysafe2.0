"""
ADO-T7: adoption certificate snapshot, signatory, no fabricated facts, public verification, revocation.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_adoption_certificate.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "adoption_certificate_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-certificate-012345")
os.environ["FRONTEND_URL"] = "https://straysafe.example"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Adoption, AdoptionCertificate, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoption_certificates, adoption_tasks, adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (adoption_certificates, adoption_tasks, adoptions):
    api.include_router(r.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria, Bulacan"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


applicant = mk_user("Maria Clara Santos", 1, subdivision_id=1, barangay_id=1)
head = mk_user("Captain Original", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731


def mk_adoption(**animal_kw):
    rep = Report(user_id=applicant.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    animal = HoldingAnimal(report_id=rep.report_id, animal_name="Bantay", animal_type="Dog", breed="Aspin", facility_status=6, **animal_kw)
    db.add(animal)
    db.flush()
    ad = Adoption(holding_id=animal.holding_id, applicant_id=applicant.user_id, status="Pending", full_name=applicant.name,
                  address="Blk 1 Lot 2, Selera Homes", contact_no="09171234567", reason="r" * 25, current_stage="Review")
    db.add(ad)
    db.commit()
    return ad.adoption_id


results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


A = mk_adoption()
r = client.put(f"/adoptions/review/{A}", json={"decision": "Approved", "review_notes": "ok"}, headers=H(head))
check("Head Officer approval issues the certificate", r.status_code == 200, r.text[:200])
r = client.get(f"/adoptions/{A}/certificate", headers=H(applicant))
c = r.json()
check("adopter can view the certificate", r.status_code == 200, r.text[:200])
check("signatory = the barangay's Head Officer (not a hard-coded name)", c.get("captain_name") == "Captain Original", c.get("captain_name"))
check("municipality/province parsed from barangays.city", c.get("municipality_city") == "Santa Maria" and c.get("province") == "Bulacan",
      (c.get("municipality_city"), c.get("province")))
check("unrecorded sex/age are shown as 'Not recorded' (no invented 'Male'/'Adult')",
      c.get("animal_sex") == "Not recorded" and c.get("animal_age") == "Not recorded", (c.get("animal_sex"), c.get("animal_age")))
check("before handover: not final, status PENDING HANDOVER", c.get("is_final") is False and c.get("adoption_status") == "PENDING HANDOVER", c)
check("QR/verify link points to the public verify page", (c.get("verify_url") or "").startswith("https://straysafe.example/verify/certificate/SS-ADOPT-"), c.get("verify_url"))

db.expire_all()
cert = db.query(AdoptionCertificate).filter_by(adoption_id=A).first()
number, h16 = cert.certificate_number, cert.verification_hash[:16]
check("snapshot frozen on first view", cert.snapshot is not None and cert.signatory_id == head.user_id)

# Head Officer changes -> the issued certificate must not change
head.is_head_officer = False
new_head = mk_user("Captain Successor", 3, barangay_id=1, is_head_officer=True)
db.commit()
c2 = client.get(f"/adoptions/{A}/certificate", headers=H(applicant)).json()
check("certificate keeps the ORIGINAL signatory after the Head Officer changes", c2.get("captain_name") == "Captain Original", c2.get("captain_name"))
check("certificate number and hash unchanged", c2.get("certificate_number") == number and c2.get("verification_hash")[:16] == h16)

# Public verification
r = client.get(f"/certificates/verify/{number}", params={"h": h16})
v = r.json()
check("verify: issued but pending handover is NOT yet valid", r.status_code == 200 and v["valid"] is False and v["status"] == "Pending_Handover", v)
check("verify response never leaks address or phone", "Selera" not in r.text and "0917" not in r.text)
check("verify shows initials only", v.get("adopter_initials") == "M. C. S.", v.get("adopter_initials"))
check("verify: wrong security code -> Tampered", client.get(f"/certificates/verify/{number}", params={"h": "0" * 16}).json()["status"] == "Tampered")
check("verify: unknown number -> Not_Found", client.get("/certificates/verify/SS-ADOPT-2099-99999").json()["status"] == "Not_Found")

ad = db.get(Adoption, A)
ad.staff_handed_over = ad.is_handed_over = True
db.commit()
v = client.get(f"/certificates/verify/{number}", params={"h": h16}).json()
check("verify: after two-way handover -> Valid", v["valid"] is True and v["status"] == "Valid", v)
check("certificate now final / APPROVED", client.get(f"/adoptions/{A}/certificate", headers=H(applicant)).json().get("is_final") is True)

# Recorded animal facts are used
B = mk_adoption(sex="Female", estimated_age="2 years")
client.put(f"/adoptions/review/{B}", json={"decision": "Approved", "review_notes": "ok"}, headers=H(new_head))
cb = client.get(f"/adoptions/{B}/certificate", headers=H(applicant)).json()
check("recorded sex appears on the certificate (age was removed from it)", cb.get("animal_sex") == "Female", cb.get("animal_sex"))

# Revocation on cancellation
r = client.post(f"/adoptions/{B}/cancel", json={"reason": "Changed my mind"}, headers=H(applicant))
db.expire_all()
cert_b = db.query(AdoptionCertificate).filter_by(adoption_id=B).first()
check("cancelling an approved application revokes its certificate", r.status_code == 200 and cert_b.certificate_status == "Revoked", f"{r.status_code} {r.text[:120]}")
vb = client.get(f"/certificates/verify/{cert_b.certificate_number}", params={"h": cert_b.verification_hash[:16]}).json()
check("verify: revoked certificate -> Revoked", vb["status"] == "Revoked" and vb["valid"] is False, vb)

# ── Pet record appears in the adopter's records at approval ────────────────
from app.models.pet import Pet  # noqa: E402
db.expire_all()
ad_a = db.get(Adoption, A)
check("approval created the pet record in the adopter's account", ad_a.created_pet_id is not None
      and db.get(Pet, ad_a.created_pet_id).owner_id == applicant.user_id and db.get(Pet, ad_a.created_pet_id).pet_name == "Bantay")
check("adopter notified that the pet is now in their records", any(
    n.related_id == A and "Pet Records" in n.title for n in db.query(__import__("app.models.notification", fromlist=["Notification"]).Notification).filter_by(user_id=applicant.user_id)))
pet_id_before = ad_a.created_pet_id
from app.routes.adoptions import _finalize_adoption_if_ready  # noqa: E402
_finalize_adoption_if_ready(ad_a, db, new_head)
db.commit()
db.expire_all()
check("handover reuses the same pet record (no duplicate)", db.get(Adoption, A).created_pet_id == pet_id_before
      and db.query(Pet).filter_by(owner_id=applicant.user_id, pet_name="Bantay").count() >= 1)
check("cancelling an approved adoption BEFORE handover archives the pet record",
      db.get(Adoption, B).created_pet_id is None and any(p.status == "Archived" for p in db.query(Pet).filter_by(owner_id=applicant.user_id)))

# ── Certificate follows edits to the Pet Record until the handover is final ──
D = mk_adoption()
client.put(f"/adoptions/review/{D}", json={"decision": "Approved", "review_notes": "ok"}, headers=H(new_head))
c0 = client.get(f"/adoptions/{D}/certificate", headers=H(applicant)).json()
check("fresh certificate is up to date and has no recorded sex", c0["details_outdated"] is False and c0["animal_sex"] == "Not recorded", c0)
adD = db.get(Adoption, D)
rep_row = db.get(Report, adD.animal.report_id)
rec = Pet(owner_id=None, pet_name="Brownie", pet_type="Dog", breed="Aspin", gender="Female", status="Active", registered_by_user_id=new_head.user_id)
db.add(rec)
db.flush()
rep_row.pet_id = rec.pet_id
db.commit()
c1 = client.get(f"/adoptions/{D}/certificate", headers=H(new_head)).json()
check("after the Pet Record is edited the certificate reports it is outdated", c1["details_outdated"] is True, c1)
check("...but still shows the old values until updated", c1["animal_sex"] == "Not recorded")
r = client.post(f"/adoptions/{D}/certificate/refresh", headers=H(applicant))
check("the adopter cannot refresh the certificate", r.status_code in (401, 403), r.status_code)
r = client.post(f"/adoptions/{D}/certificate/refresh", headers=H(new_head))
c2 = r.json()
check("Update from Pet Record: sex, name and breed now match the record", r.status_code == 200 and c2["animal_sex"] == "Female"
      and c2["animal_name"] == "Brownie" and c2["animal_breed"] == "Aspin" and c2["details_outdated"] is False, r.text[:300])
check("number, security code, issue date and signatory unchanged by the update",
      (c2["certificate_number"], c2["verification_hash"], c2["issued_at"], c2["captain_name"]) ==
      (c0["certificate_number"], c0["verification_hash"], c0["issued_at"], c0["captain_name"]))
rec.gender = "Male"
db.commit()
check("a later edit is detected again", client.get(f"/adoptions/{D}/certificate", headers=H(new_head)).json()["details_outdated"] is True)
adD = db.get(Adoption, D)
adD.staff_handed_over = adD.is_handed_over = True
db.commit()
r = client.post(f"/adoptions/{D}/certificate/refresh", headers=H(new_head))
check("once the handover is final the certificate is locked (409)", r.status_code == 409, f"{r.status_code} {r.text[:120]}")
check("...and is no longer reported as outdated", client.get(f"/adoptions/{D}/certificate", headers=H(new_head)).json()["details_outdated"] is False)

passed = sum(results)
print(f"\n{passed}/{len(results)} certificate checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
