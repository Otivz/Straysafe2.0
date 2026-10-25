"""
Account fields: nobody grants themselves a role, Head Officer status, position, barangay or verification.
- self-edit: personal details only (unchanged values from a whole-record save are fine)
- Head Officer: name, phone, address, position, status and officer-in-charge of staff in their own barangay
- administrator: everything
- public sign-up: no position; certificate signatory: the Head Officer flag, never a position title
Run from the backend folder:  python tests/test_account_self_edit.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "account_self_edit_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-account-self-edit-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, Report  # noqa: E402
from app.models.user import Barangay, Position, Subdivision, User  # noqa: E402
from app.routes import users  # noqa: E402
from app.routes.adoptions import _certificate_signatory  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.include_router(users.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add_all([Position(position_id=i, position_name=n) for i, n in [(1, "President"), (5, "Animal Rescuer"), (6, "Barangay Captain"),
                                                                   (7, "Subdivision President / Leader"), (9, "Field Rescuer")]])
people = [(1, "Resident", 1, None, 1, False, None), (2, "Rescuer", 3, None, 1, False, 9), (3, "Head", 3, None, 1, True, 6),
          (4, "Leader", 2, 1, 1, False, 7), (5, "Admin", 4, None, None, False, None), (6, "OtherHead", 3, None, 2, True, None)]
for uid, name, role, subd, brgy, head, pos in people:
    db.add(User(user_id=uid, name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
                status="Active", subdivision_id=subd if subd else (1 if role == 1 else None), barangay_id=brgy,
                is_head_officer=head, position_id=pos))
db.commit()
H = {uid: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}
     for uid, _n, role, *_ in people}
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def user(uid):
    db.expire_all()
    return db.get(User, uid)


def put(by, uid, body):
    return client.put(f"/users/{uid}", json=body, headers=H[by])


# ---- self-edit: residents ----
r = put(1, 1, {"role_id": 4})
check("a resident can't make themselves an administrator (403)", r.status_code == 403 and user(1).role_id == 1, f"{r.status_code} {r.text[:120]}")
for body, label in [({"is_head_officer": True}, "Head Officer"), ({"is_verified": False}, "verification"),
                    ({"status": "Inactive"}, "account status"), ({"subdivision_id": 99}, "subdivision"), ({"barangay_id": 2}, "barangay"),
                    ({"position": "Barangay Captain"}, "position")]:
    r = put(1, 1, body)
    check(f"a resident can't change their own {label} (403)", r.status_code == 403, f"{r.status_code} {r.text[:120]}")
whole = {"name": "Resident Renamed", "email": "resident@test-mail.com", "phone": "09170000000", "role_id": 1, "status": "Active",
         "is_verified": True, "subdivision_id": 1, "barangay_id": 1, "is_head_officer": False, "position_id": None}
r = put(1, 1, whole)
check("a whole-record save with only personal changes works (resident settings page)", r.status_code == 200 and user(1).name == "Resident Renamed",
      f"{r.status_code} {r.text[:160]}")
check("...and nothing else changed", user(1).role_id == 1 and user(1).is_verified)

# ---- self-edit: barangay staff ----
r = put(2, 2, {"position": "Barangay Captain"})
check("a field rescuer can't change their own position (403)", r.status_code == 403 and user(2).position_id == 9, f"{r.status_code} {r.text[:120]}")
check("...and is told to ask the Head Officer", "Head Officer" in r.json().get("detail", ""), r.text[:160])
check("a field rescuer can't make themselves Head Officer (403)", put(2, 2, {"is_head_officer": True}).status_code == 403 and not user(2).is_head_officer)
r = put(2, 2, {"phone": "09171111111", "address": "Purok 1", "position": "Field Rescuer", "latitude": 14.8, "longitude": 121.0})
check("staff still update their own phone, address and pin (same position sent back is fine)", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
check("the Head Officer can't change their own position either (403)", put(3, 3, {"position": "Animal Rescuer"}).status_code == 403)

# ---- Head Officer managing staff ----
before = db.query(Position).count()
r = put(3, 2, {"role_id": 3, "is_head_officer": True, "position": "Dispatch Officer", "status": "Active"})
check("the Head Officer sets a staff member's position (a new title is added) and officer-in-charge", r.status_code == 200
      and user(2).is_head_officer and db.query(Position).count() == before + 1, f"{r.status_code} {r.text[:160]}")
check("the Head Officer deactivates a staff member", put(3, 2, {"status": "Inactive"}).status_code == 200 and user(2).status == "Inactive")
check("the Head Officer can't change a staff member's role (403)", put(3, 2, {"role_id": 4}).status_code == 403 and user(2).role_id == 3)
check("...nor move them to another barangay (403)", put(3, 2, {"barangay_id": 2}).status_code == 403)
r = put(3, 2, {"position": "Subdivision President / Leader"})
check("...nor give barangay staff a subdivision position (400)", r.status_code == 400, f"{r.status_code} {r.text[:120]}")
check("...nor edit a subdivision leader's account (403)", put(3, 4, {"position": "Animal Rescuer"}).status_code == 403)
check("a Head Officer of another barangay can't edit them (403)", put(6, 2, {"status": "Active"}).status_code == 403)
before = db.query(Position).count()
put(1, 1, {"position": "Supreme Commander"})
check("a refused change adds no title to the positions list", db.query(Position).count() == before)

# ---- administrator ----
r = put(5, 2, {"role_id": 3, "barangay_id": 2, "is_head_officer": False, "position_id": 5})
check("the administrator still changes role, barangay, Head Officer and position", r.status_code == 200 and user(2).barangay_id == 2
      and user(2).position_id == 5, f"{r.status_code} {r.text[:160]}")

# ---- public sign-up ----
before = db.query(Position).count()
r = client.post("/users/", json={"name": "New Person", "email": "newperson@test-mail.com", "password": "Str0ng!Passw0rd#1",
                                 "position": "Barangay Captain", "subdivision_id": 1, "role_id": 4})
new = db.query(User).filter(User.email == "newperson@test-mail.com").first() if r.status_code == 200 else None
check("public sign-up creates a resident without a position", r.status_code == 200 and new and new.role_id == 1 and new.position_id is None,
      f"{r.status_code} {r.text[:160]}")
check("...and adds no title to the positions list", db.query(Position).count() == before)

# ---- certificate signatory ----
db.add(Report(report_id=1, user_id=1, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=10, animal_type="Dog"))
db.flush()
db.add(HoldingAnimal(holding_id=1, report_id=1, animal_type="Dog", facility_status=6))
db.flush()
db.add(Adoption(adoption_id=1, holding_id=1, applicant_id=1, full_name="A", address="S", contact_no="09123456789", reason="R"))
db.add(User(user_id=50, name="Self-Titled Captain", email="captain@test-mail.com", password="x", role_id=3, is_verified=True,
            status="Active", barangay_id=1, is_head_officer=False, position_id=6))
db.commit()
db.expire_all()
signer = _certificate_signatory(db.get(Adoption, 1), db)
check("the certificate is signed by the Head Officer, not by someone titled 'Barangay Captain'", signer is not None and signer.user_id == 3,
      signer.name if signer else None)
db.query(User).filter(User.user_id == 3).update({"is_head_officer": False})
db.commit()
db.expire_all()
signer = _certificate_signatory(db.get(Adoption, 1), db)
check("with no Head Officer, a 'Barangay Captain' title alone doesn't sign", signer is None or signer.user_id != 50, signer.name if signer else None)

passed = sum(results)
print(f"\n{passed}/{len(results)} account self-edit checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
