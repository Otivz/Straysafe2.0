"""
A pet record whose animal is in the adoption process shows it (adoption_info), and staff can't assign it an owner while
an adoption is approved or completed (the adoption decides ownership). Pending applications only show an indicator.
Run from the backend folder:  python tests/test_pet_adoption_lock.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "pet_adoption_lock_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pet-adoption-lock-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import pets  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(pets.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


resident = mk("Rita Resident", 1, subdivision_id=1, barangay_id=1)
adopter = mk("Ada Adopter", 1, subdivision_id=1, barangay_id=1)
staff = mk("Kyla Staff", 3, barangay_id=1, is_head_officer=True)
admin = mk("Ada Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def animal_with(status=None, handed=False):
    pet = Pet(pet_name="No Name", pet_type="Dog", owner_id=None, status="Active", registered_by_user_id=staff.user_id)
    db.add(pet)
    db.flush()
    rep = Report(user_id=resident.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=8, pet_id=pet.pet_id)
    db.add(rep)
    db.flush()
    h = HoldingAnimal(report_id=rep.report_id, animal_type="Dog", facility_status=6)
    db.add(h)
    db.flush()
    if status:
        db.add(Adoption(holding_id=h.holding_id, applicant_id=adopter.user_id, status=status, full_name="Ada Adopter",
                        address="x", contact_no="09171234567", reason="r" * 25, current_stage="Handover",
                        is_handed_over=handed, staff_handed_over=handed))
    db.commit()
    return pet.pet_id


def info(pid, who=staff):
    r = client.get(f"/pets/{pid}", headers=H(who))
    return r.json().get("adoption_info") if r.status_code == 200 else ("ERR", r.status_code)


def assign(pid, who=staff):
    return client.post(f"/pets/{pid}/assign-owner", params={"owner_id": resident.user_id}, headers=H(who))


free = animal_with()
in_progress = animal_with("Approved")
adopted = animal_with("Approved", handed=True)
pending = animal_with("Pending")

check("a pet with no adoption has no adoption_info", info(free) is None)
i = info(in_progress)
check("approved adoption: state in_progress with the adopter's name", i and i["state"] == "in_progress" and i["adopter_name"] == "Ada Adopter", i)
check("completed handover: state adopted", (info(adopted) or {}).get("state") == "adopted")
check("pending applications: state applications with a count", (info(pending) or {}).get("state") == "applications"
      and info(pending)["pending_applications"] == 1)
lst = {p["pet_id"]: p.get("adoption_info") for p in client.get("/pets/", headers=H(staff)).json()}
check("the Pet Records list carries the same indicator", (lst.get(in_progress) or {}).get("state") == "in_progress" and lst.get(free) is None, lst)

r = assign(in_progress)
check("assigning an owner during an approved adoption is refused (409)", r.status_code == 409 and "adoption" in r.json()["detail"].lower(), r.text[:200])
check("...also for an Admin", assign(in_progress, admin).status_code == 409)
check("assigning an owner to an adopted animal is refused (409)", assign(adopted).status_code == 409)
db.expire_all()
check("...and the record stays ownerless", db.get(Pet, in_progress).owner_id is None and db.get(Pet, adopted).owner_id is None)
check("a pet that is only in the catalog (pending applications) can still get its real owner",
      assign(pending).status_code == 200, assign(pending).text[:200])
check("a pet with no adoption can be assigned as before", assign(free).status_code == 200)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
