"""
An owner without a StraySafe account: registering their pet creates no account. Their name, number and address are
kept on the pet record, and a later case of that pet shows them to staff ("<name> (no StraySafe account)"). Other
residents still see only "Registered Owner", with no contact details.
Run from the backend folder:  python tests/test_offline_pet_owner.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "offline_pet_owner_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-offline-owner-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import pets, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(pets.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


leader = mk("Leo Leader", 2)
reporter = mk("Rita Reporter", 1)
neighbour = mk("Nina Neighbour", 1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


users_before = db.query(User).count()
# what the pet form now sends for "Owner Without Account"
r = client.post("/pets/", headers=H(leader), json={
    "pet_name": "Bantay", "pet_type": "Dog", "owner_id": None, "status": "Active",
    "emergency_contact_name": "Ramirez Ramos", "emergency_contact_phone": "0977 032 8167",
    "registered_address": "14 Dama de Noche, Brgy. Cutcut",
})
check("the pet is registered", r.status_code in (200, 201), r.text[:300])
pet_id = (r.json() or {}).get("pet_id") if r.status_code in (200, 201) else None
db.expire_all()
check("no account was created", db.query(User).count() == users_before, db.query(User).count())
pet = db.get(Pet, pet_id) if pet_id else None
check("the owner's details are on the pet record", pet is not None and pet.owner_id is None and pet.emergency_contact_name == "Ramirez Ramos"
      and pet.emergency_contact_phone and pet.registered_address, pet and (pet.emergency_contact_name, pet.emergency_contact_phone))

# a later case of this pet
rep = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
             animal_type="Dog", pet_id=pet_id, assigned_leader_id=leader.user_id, visibility="Public",
             visibility_decided_by=leader.user_id, verification_status="verified_true")
db.add(rep)
db.commit()
b = client.get(f"/reports/{rep.report_id}", headers=H(leader)).json()
check("staff see the owner on the later case", b.get("owner_name") == "Ramirez Ramos (no StraySafe account)"
      and b.get("owner_phone") and b.get("owner_address"), {k: b.get(k) for k in ("owner_name", "owner_phone", "owner_address")})
check("...with no account id", b.get("owner_id") is None)
b = client.get(f"/reports/{rep.report_id}", headers=H(neighbour)).json()
check("other residents see only 'Registered Owner', no contact", b.get("owner_name") == "Registered Owner"
      and b.get("owner_phone") is None and b.get("owner_address") is None, {k: b.get(k) for k in ("owner_name", "owner_phone")})

community = Pet(pet_name="Brownie", pet_type="Dog", owner_id=None, status="Active")
db.add(community)
db.flush()
rep2 = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", pet_id=community.pet_id, assigned_leader_id=leader.user_id)
db.add(rep2)
db.commit()
b = client.get(f"/reports/{rep2.report_id}", headers=H(leader)).json()
check("a community animal (no owner details) still shows no owner", b.get("owner_name") is None, b.get("owner_name"))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
