"""
Several pet photos / videos on a claim: up to 5, each added (not replacing the previous one), only Cloudinary-hosted
images or videos, and a clear message when the limit is reached.
Run from the backend folder:  python tests/test_claim_photos.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "claim_photos_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claim-photos-0123456789")
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
from app.utils import uploads  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

uploads.CLOUDINARY_CLOUD_NAME = "demo"
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
owner = User(name="Owner", email="owner@test-mail.com", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
db.add(owner)
db.flush()
rep = Report(user_id=owner.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2, animal_type="Dog")
pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add_all([rep, pet])
db.commit()
H = {"Authorization": "Bearer " + create_access_token({"sub": str(owner.user_id), "user_id": owner.user_id, "role_id": 1})}
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


U = lambda n, ext="jpg", kind="image": f"https://res.cloudinary.com/demo/{kind}/upload/claims/p{n}.{ext}"  # noqa: E731
r = client.post("/claims/", json={"report_id": rep.report_id, "pet_id": pet.pet_id, "additional_photos_url": f"{U(1)},{U(2, 'mp4', 'video')}"}, headers=H)
check("a claim can be filed with several photos / videos at once", r.status_code == 200
      and claims.claim_photo_list(r.json().get("additional_photos_url")) == [U(1), U(2, 'mp4', 'video')], r.text[:300])
CID = r.json().get("claim_id")
ev = lambda url: client.post(f"/claims/{CID}/evidence", json={"file_url": url, "document_type": "additional_photo"}, headers=H)  # noqa: E731
r = ev(U(3))
check("adding another photo keeps the earlier ones", r.status_code == 200 and len(claims.claim_photo_list(r.json()["additional_photos_url"])) == 3, r.text[:200])
check("the same photo twice is stored once", ev(U(3)).status_code == 200 and len(claims.claim_photo_list(db.get(PetClaim, CID).additional_photos_url if db.expire_all() is None else "")) == 3)
ev(U(4))
r = ev(U(5))
check("up to 5 are accepted", r.status_code == 200 and len(claims.claim_photo_list(r.json()["additional_photos_url"])) == 5)
r = ev(U(6))
check("a 6th is refused with a clear message (not a server error)", r.status_code == 400 and "up to 5" in r.text, r.text[:200])
r = ev("https://example.com/p7.jpg")
check("a link that isn't one of our Cloudinary uploads is refused", r.status_code == 400, r.text[:200])
r = client.post("/claims/", json={"report_id": rep.report_id, "pet_id": pet.pet_id, "additional_photos_url": "https://evil.example/x.jpg"}, headers=H)
check("...also when filing the claim (that path didn't check links before)", r.status_code == 400, r.text[:200])
check("the shown list is the stored one, in order", claims.claim_photo_list(db.get(PetClaim, CID).additional_photos_url)[:2] == [U(1), U(2, 'mp4', 'video')])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
