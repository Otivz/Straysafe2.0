"""
A pet owner who already submitted proof of ownership for a pet doesn't upload it again: the new claim reuses it.
Run from the backend folder:  python tests/test_claim_proof_reuse.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "claim_proof_reuse_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claim-proof-reuse-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(claims.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner, other, res = mk("Owner", 1), mk("Other", 1), mk("Res", 1)
pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
pet2 = Pet(pet_name="Choco", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add_all([pet, pet2])
db.flush()


def report():
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", ai_suggested_risk_level="Low")
    db.add(r)
    db.flush()
    return r.report_id


R1, R13, R20 = report(), report(), report()
first = PetClaim(report_id=R1, pet_id=pet.pet_id, status="Approved", vaccine_card_url="https://cdn.example/vax.jpg",
                 additional_photos_url="https://cdn.example/photo.jpg")
db.add(first)
db.commit()
FIRST, PET, PET2 = first.claim_id, pet.pet_id, pet2.pet_id
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


r = client.get("/claims/proof-on-file", params={"pet_id": PET}, headers=H(owner))
body = r.json()
check("the owner sees their proof on file for the pet", r.status_code == 200 and body.get("has_proof") and body.get("claim_id") == FIRST
      and "Vaccination card" in body.get("documents", []), body)
check("another resident can't see it", client.get("/claims/proof-on-file", params={"pet_id": PET}, headers=H(other)).status_code == 403)
check("a pet without proof: nothing on file", client.get("/claims/proof-on-file", params={"pet_id": PET2}, headers=H(owner)).json() == {"has_proof": False})

r = client.post("/claims/", json={"report_id": R13, "pet_id": PET, "remarks": "This is Boyet.", "reuse_proof_from_claim_id": FIRST}, headers=H(owner))
db.expire_all()
c = db.query(PetClaim).filter(PetClaim.report_id == R13).first()
check("answering Yes reuses the proof: no upload needed", r.status_code == 200 and c and c.vaccine_card_url == "https://cdn.example/vax.jpg"
      and c.additional_photos_url == "https://cdn.example/photo.jpg" and c.status == "Pending Review", r.text[:200])
check("...and the claim notes where the proof came from", c and f"claim #{FIRST}" in (c.remarks or ""))
check("the original claim is unchanged", db.get(PetClaim, FIRST).status == "Approved")

r = client.post("/claims/", json={"report_id": R20, "pet_id": PET2, "reuse_proof_from_claim_id": FIRST}, headers=H(owner))
check("proof of one pet can't be reused for another pet", r.status_code == 400, r.text[:200])
db.query(PetClaim).filter(PetClaim.claim_id == FIRST).update({"status": "Rejected"})
db.query(PetClaim).filter(PetClaim.report_id == R13).update({"status": "Rejected"})
db.commit()
r = client.post("/claims/", json={"report_id": R20, "pet_id": PET, "reuse_proof_from_claim_id": FIRST}, headers=H(owner))
check("proof from a rejected claim can't be reused", r.status_code == 400, r.text[:200])
check("...and isn't offered", client.get("/claims/proof-on-file", params={"pet_id": PET}, headers=H(owner)).json() == {"has_proof": False})

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
