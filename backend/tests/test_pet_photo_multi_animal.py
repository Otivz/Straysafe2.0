"""
Pet registration with a photo of several animals (MULTI_ANIMAL_REPORT_PLAN.md, pet registration):
- the photo check counts animals (multi-animal detection, and a cropped photo checked again);
- one animal per pet record; a person's override of the AI count is validated and logged;
- "register another animal from this photo" makes separate pets, logged, same owner allowed;
- the cropped photo is what AI matching compares; front/left/right photos keep working;
- ownership permissions are unchanged; single-animal registration is unchanged.
Run from the backend folder:  python tests/test_pet_photo_multi_animal.py
"""
import io
import os
import sys

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pet-photo-multi-animal-0123456789")
os.environ["GEMINI_API_KEY"] = ""          # photo check runs YOLO only here (a fake model below)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import app.models  # noqa: E402,F401
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import pets, reports  # noqa: E402
from app.utils.ai_matching import image_url_for_entity  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
SessionLocal = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)
api = FastAPI()

def isolated_db():
    with SessionLocal() as session:
        yield session

api.dependency_overrides[get_db] = isolated_db
api.include_router(pets.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
for rid, rn in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=rn))
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd if role in (1, 2) else None, barangay_id=1,
             phone="09170000000")
    db.add(u)
    db.flush()
    return u


resident = mk("Rosa Resident", 1)
other_resident = mk("Oscar Other", 1)
leader = mk("Lito Leader", 2)
staff = mk("Sara Staff", 3)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok  " if ok else "  FAIL") + f" {label}" + ("" if ok else f"  -> {str(extra)[:300]}"))


# ------------------------------------------------------------------ multi-animal detection (real analyze-media code)
class _Boxes:
    def __init__(self, n):
        self.cls = [16] * n                                   # COCO 16 = dog
        self.xyxy = [[10 + 60 * i, 10, 60 + 60 * i, 80] for i in range(n)]
        self.conf = [0.9] * n


class _Result:
    def __init__(self, n):
        self.boxes = _Boxes(n)
        self.names = {16: "dog"}


class _FakeYolo:
    def __init__(self, n):
        self.n = n

    def __call__(self, path):
        return [_Result(self.n)]


def photo(w=200, h=120):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (150, 110, 70)).save(buf, format="JPEG")
    return buf.getvalue()


def analyze(n_dogs):
    reports.get_yolo_model = lambda: _FakeYolo(n_dogs)
    return client.post("/reports/analyze-media", headers=H(leader),
                       files={"file": ("pets.jpg", photo(), "image/jpeg")})


r2 = analyze(2)
check("a photo with two dogs is flagged as several animals", r2.status_code == 200
      and r2.json().get("multiple_animals_detected") is True and r2.json().get("detected_animal_count") == 2, r2.text[:300])
r1 = analyze(1)
check("a cropped photo with one dog passes the same check", r1.status_code == 200
      and r1.json().get("multiple_animals_detected") is False and r1.json().get("detected_animal_count") == 1, r1.text[:300])

# ------------------------------------------------------------------ pet registration mode: YOLO only, never Gemini
gemini_calls = []
_saved = (reports.is_gemini_enabled_in_db, reports.call_gemini_with_fallback, os.environ.get("GEMINI_API_KEY", ""))
reports.is_gemini_enabled_in_db = lambda *a, **k: True          # Gemini switched on, with a key...
reports.call_gemini_with_fallback = lambda *a, **k: gemini_calls.append(1)
os.environ["GEMINI_API_KEY"] = "test-key"


def analyze_pet(yolo):
    reports.get_yolo_model = yolo
    return client.post("/reports/analyze-media", headers=H(resident), data={"purpose": "pet"},
                       files={"file": ("pet.jpg", photo(), "image/jpeg")})


rp = analyze_pet(lambda: _FakeYolo(1))
body = rp.json() if rp.status_code == 200 else {}
check("pet mode: a dog is detected with YOLO", body.get("animal_detected") is True and body.get("animal_type") == "Dog", rp.text[:300])
check("pet mode: Gemini is never called, even when it is switched on", not gemini_calls, len(gemini_calls))
check("pet mode: no authenticity verdict and no guessed breed or size in the answer",
      not any(k in body for k in ("verification_status", "is_ai_generated", "ai_generation_confidence", "ai_photo_status"))
      and body.get("possible_breed") == "Unknown" and body.get("estimated_size") == "Unknown", body)
rp = analyze_pet(lambda: _FakeYolo(0))
check("pet mode: a photo with no dog or cat says so (the form then refuses it)", rp.json().get("animal_detected") is False, rp.text[:300])
rp = analyze_pet(lambda: (_ for _ in ()).throw(RuntimeError("model missing")))
check("pet mode: if YOLO itself fails the photo is 'not checked' (None), not refused", rp.status_code == 200
      and rp.json().get("animal_detected") is None, rp.text[:300])
rp = analyze_pet(lambda: None)
check("pet mode: a missing model is unavailable rather than a negative detection", rp.status_code == 200
      and rp.json().get("animal_detected") is None, rp.text[:300])
rp = analyze_pet(lambda: _FakeYolo(2))
check("pet mode: multiple animals still require cropping or a validated override", rp.status_code == 200
      and rp.json().get("multiple_animals_detected") is True and rp.json().get("detected_animal_count") == 2, rp.text[:300])
check("...and Gemini is still not called", not gemini_calls, len(gemini_calls))
analyze(1)   # control: the same photo checked for a report (no purpose) does go to Gemini
check("control: report photos still go to Gemini under the same settings", len(gemini_calls) == 1, len(gemini_calls))
reports.is_gemini_enabled_in_db, reports.call_gemini_with_fallback = _saved[0], _saved[1]
os.environ["GEMINI_API_KEY"] = _saved[2]

# ------------------------------------------------------------------ registration
CROP_A = "https://res.cloudinary.com/demo/image/upload/v1/pets/crop-a.jpg"
CROP_B = "https://res.cloudinary.com/demo/image/upload/v1/pets/crop-b.jpg"
FRONT = "https://res.cloudinary.com/demo/image/upload/v1/pets/sides/front.jpg"


def pet_body(name, url=CROP_A, **extra):
    return {"pet_name": name, "pet_type": "Dog", "breed": "Aspin", "photo_url": url, **extra}


def audits(action, pet_id):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action, AuditLog.target_id == pet_id).all()


r = client.post("/pets/", headers=H(resident), json=pet_body("Solo"))
check("single-animal registration works as before", r.status_code in (200, 201), r.text[:300])
solo = r.json().get("pet_id")
check("...and logs no override", not audits("PET_PHOTO_OVERRIDE", solo))

ov = {"fields": ["photo_url"], "ai_verdict": "multiple", "detected_count": 2, "reason": "The second dog is a reflection"}
r = client.post("/pets/", headers=H(resident), json=pet_body("Bantay", photo_override=ov))
bantay = r.json().get("pet_id")
check("a person can override the AI count with a reason", r.status_code in (200, 201), r.text[:300])
log = audits("PET_PHOTO_OVERRIDE", bantay)
check("...the override is logged with who, why, the count and the photo",
      len(log) == 1 and log[0].user_id == resident.user_id and log[0].new_values["reason"] == ov["reason"]
      and log[0].new_values["detected_count"] == 2 and log[0].new_values["photo_urls"]["photo_url"] == CROP_A,
      log[0].new_values if log else None)


def refused(body, label):
    db.expire_all()
    before = db.query(Pet).count()
    resp = client.post("/pets/", headers=H(resident), json=body)
    db.expire_all()
    check(label, resp.status_code == 400 and db.query(Pet).count() == before, (resp.status_code, resp.text[:200]))


refused(pet_body("X", photo_override={**ov, "reason": "no"}), "an override without a real reason is refused (nothing saved)")
refused(pet_body("X", photo_override={**ov, "fields": ["photo_front_url"]}), "an override naming a photo that isn't saved is refused")
refused(pet_body("X", photo_override={**ov, "fields": ["vaccine_card_url"]}), "an override naming a non-photo field is refused")
refused(pet_body("X", photo_override={**ov, "ai_verdict": "fine"}), "an override with an unknown verdict is refused")

# ------------------------------------------------------------------ register another animal from this photo
r = client.post("/pets/", headers=H(resident), json=pet_body("Brownie", url=CROP_B, registered_from_photo_of_pet_id=bantay))
brownie = r.json().get("pet_id")
db.expire_all()
pa, pb = db.get(Pet, bantay), db.get(Pet, brownie)
check("the second animal from the same photo is its own pet record", r.status_code in (200, 201) and brownie != bantay, r.text[:200])
check("...each record keeps only its own cropped photo", pa.photo_url == CROP_A and pb.photo_url == CROP_B)
check("...both belong to the same owner", pa.owner_id == pb.owner_id == resident.user_id)
check("...and the shared photo is logged", len(audits("PET_REGISTERED_FROM_SHARED_PHOTO", brownie)) == 1)
r = client.post("/pets/", headers=H(other_resident), json=pet_body("Sneaky", url=CROP_B, registered_from_photo_of_pet_id=bantay))
check("pointing at someone else's pet is ignored (registration still works, nothing logged)",
      r.status_code in (200, 201) and not audits("PET_REGISTERED_FROM_SHARED_PHOTO", r.json().get("pet_id")), r.text[:200])

# leader: two pets from one photo for an owner without an account
owner = {"emergency_contact_name": "Mang Tomas", "emergency_contact_phone": "09171112222", "registered_address": "Blk 5"}
r1 = client.post("/pets/", headers=H(leader), json=pet_body("Kulot", **owner))
r2 = client.post("/pets/", headers=H(leader), json=pet_body("Puti", url=CROP_B, registered_from_photo_of_pet_id=r1.json().get("pet_id"), **owner))
db.expire_all()
k, p2 = db.get(Pet, r1.json().get("pet_id")), db.get(Pet, r2.json().get("pet_id"))
check("a leader registers two pets from one photo for an owner without an account",
      r1.status_code in (200, 201) and r2.status_code in (200, 201) and k.pet_id != p2.pet_id, (r1.text[:150], r2.text[:150]))
check("...the owner's details are on both, the pet details are separate",
      k.emergency_contact_name == p2.emergency_contact_name == "Mang Tomas" and k.pet_name != p2.pet_name
      and k.photo_url != p2.photo_url)

# ------------------------------------------------------------------ ownership permissions unchanged
r = client.post("/pets/", headers=H(resident), json=pet_body("NotMine", owner_id=other_resident.user_id))
check("a resident still can't register a pet for someone else (403)", r.status_code == 403, r.status_code)
r = client.post("/pets/", headers=H(staff), json=pet_body("StaffPet"))
check("barangay staff still can't add a pet outside a report (403)", r.status_code == 403, r.status_code)

# ------------------------------------------------------------------ AI matching uses the crop; side photos still work
check("AI matching compares the cropped photo", image_url_for_entity(pb, is_pet=True) == CROP_B)
r = client.post("/pets/", headers=H(resident), json=pet_body("WithFront", photo_front_url=FRONT))
db.expire_all()
wf = db.get(Pet, r.json().get("pet_id"))
check("front / left / right photos are kept (front photo saved and used first for matching)",
      r.status_code in (200, 201) and wf.photo_front_url == FRONT and image_url_for_entity(wf, is_pet=True) == FRONT)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
