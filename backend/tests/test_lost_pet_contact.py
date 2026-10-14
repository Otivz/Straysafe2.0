"""
A pet owner's own lost-pet report: other residents see the contact the owner typed in the lost-pet form (name and phone,
already written in the report's description) so a finder can call, while the pet is still Lost. Nothing else about
the owner is shown (address, email, QR), and a sighting someone else reported about a registered pet stays private
(report visibility, rule 6).
Run from the backend folder:  python tests/test_lost_pet_contact.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "lost_pet_contact_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-lost-pet-contact-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_qr import PetQRCode  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", phone="09170000000", address="12 Private St.", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Emma Owner", 1, subdivision_id=1, barangay_id=1)
finder = mk_user("Sam Finder", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leo Leader", 2, subdivision_id=1, barangay_id=1)
pet = Pet(pet_name="Rocky", pet_type="Dog", owner_id=owner.user_id, status="Lost")
db.add(pet)
db.flush()
db.add(PetQRCode(pet_id=pet.pet_id, qr_token="secret-qr-token-123456", qr_image_url="https://cdn.example/qr.png", is_active=True))


def lost_desc(contact):
    return ("[LOST PET REPORT] Missing registered pet: Rocky.\n\n"
            "• Species & Breed: Dog - Aspin\n"
            f"• Contact Person: {contact}\n"
            "• Last Seen: Recently around the park\n\n"
            "If you see this pet, please immediately call them or scan the pet's StraySafe QR tag!")


def report(user, desc, category=6):
    r = Report(user_id=user.user_id, subdivision_id=1, category_id=category, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", pet_id=pet.pet_id, description=desc,
               visibility="Public", verification_status="verified_true")
    db.add(r)
    db.flush()
    return r.report_id


# The owner typed a different contact person and number than their account's
LOST = report(owner, lost_desc("Emma's Brother (0918 765 4321)"))
NO_PHONE = report(owner, lost_desc("Emma Owner (Available in StraySafe)"))
SIGHTING = report(finder, "Saw a brown dog near the gate.", category=1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def owner_fields(b):
    return {k: b.get(k) for k in ("owner_name", "owner_phone", "owner_email", "owner_address", "owner_id", "pet_qr_token",
                                  "pet_qr_code_url", "reporter_name", "user_id")}


b = client.get(f"/reports/{LOST}", headers=H(finder)).json()
check("another resident sees the contact name the owner typed", b.get("owner_name") == "Emma's Brother", owner_fields(b))
check("...and the phone they typed (not the account's)", b.get("owner_phone") == "0918 765 4321", owner_fields(b))
check("...but not the owner's email, home address, id or QR",
      all(b.get(k) is None for k in ("owner_email", "owner_address", "owner_id", "pet_qr_token", "pet_qr_code_url")), owner_fields(b))
check("...and the reporter fields stay anonymous", b.get("user_id") is None and b.get("reporter_name") != owner.name, owner_fields(b))

b = client.get(f"/reports/{NO_PHONE}", headers=H(finder)).json()
check("no number given ('Available in StraySafe'): name only, no phone", b.get("owner_name") == "Emma Owner" and b.get("owner_phone") is None, owner_fields(b))

b = client.get(f"/reports/{SIGHTING}", headers=H(leader)).json()  # staff: unchanged, full details
check("staff still see the owner's real details", b.get("owner_phone") == "09170000000" and b.get("owner_address") == "12 Private St.", owner_fields(b))
b = client.get(f"/reports/{SIGHTING}", headers=H(finder)).json()  # the finder's own sighting of the registered pet
check("a sighting someone else reported about the pet stays private", b.get("owner_name") == "Registered Owner" and b.get("owner_phone") is None, owner_fields(b))

b = client.get(f"/reports/{LOST}", headers=H(owner)).json()
check("the owner sees their own details as before", b.get("owner_name") == owner.name and b.get("owner_phone") == "09170000000", owner_fields(b))

# The pet is found: the contact goes private again
db.query(Pet).filter(Pet.pet_id == pet.pet_id).update({"status": "Active"})
db.commit()
b = client.get(f"/reports/{LOST}", headers=H(finder)).json()
check("once the pet is no longer Lost, the card hides the contact again", b.get("owner_name") == "Registered Owner" and b.get("owner_phone") is None, owner_fields(b))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
