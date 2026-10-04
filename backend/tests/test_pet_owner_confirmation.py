"""
Staff 'Assign Owner' no longer sets ownership directly: the resident must accept (or reject a wrong owner).
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_pet_owner_confirmation.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "pet_owner_confirm_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-confirm-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import pet_ownership, pets  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(pets.router)
api.include_router(pet_ownership.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


right = mk_user("Right Owner", 1, subdivision_id=1, barangay_id=1)
wrong = mk_user("Wrong Person", 1, subdivision_id=1, barangay_id=1)
staff = mk_user("Brgy Staff", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


pet = Pet(pet_name="Brownie", pet_type="Dog", status="Rescued", registered_by_user_id=staff.user_id)
db.add(pet)
db.commit()
pid = pet.pet_id


def assign(uid):
    return client.post(f"/pets/{pid}/assign-owner", params={"owner_id": uid, "verified_claim": "true"}, headers=H(staff))


check("staff / admin accounts cannot be proposed as owners", assign(staff.user_id).status_code == 400)

res = assign(wrong.user_id)
db.expire_all()
check("staff assign succeeds but does not set the owner yet", res.status_code == 200 and db.query(Pet).get(pid).owner_id is None, res.text[:200])
w = client.get("/pet-ownership/mine", headers=H(wrong)).json()
check("the proposed resident has one pending request", len(w) == 1 and w[0]["pet_name"] == "Brownie")
notif = db.execute(text("select type from notifications where user_id=:u"), {"u": wrong.user_id}).all()
check("the proposed resident was notified", any(n[0] == "pet_owner_confirmation" for n in notif))

res = client.post(f"/pet-ownership/{w[0]['confirmation_id']}/reject", json={"reason": "Not my dog"}, headers=H(wrong))
db.expire_all()
check("wrong person rejects; pet stays unowned", res.status_code == 200 and db.query(Pet).get(pid).owner_id is None)
latest = client.get(f"/pet-ownership/by-pet/{pid}", headers=H(staff)).json()
check("staff see the rejection and reason", latest["status"] == "Rejected" and latest["reject_reason"] == "Not my dog")
notif = db.execute(text("select type from notifications where user_id=:u"), {"u": staff.user_id}).all()
check("staff were notified of the rejection", any(n[0] == "pet_owner_confirmation_result" for n in notif))

assign(right.user_id)
r = client.get("/pet-ownership/mine", headers=H(right)).json()
check("staff can propose the correct owner afterwards", len(r) == 1)
assign(wrong.user_id)
db.expire_all()
check("a new proposal cancels the previous pending one",
      client.get("/pet-ownership/mine", headers=H(right)).json() == [] and len(client.get("/pet-ownership/mine", headers=H(wrong)).json()) == 1)
assign(right.user_id)
r = client.get("/pet-ownership/mine", headers=H(right)).json()
res = client.post(f"/pet-ownership/{r[0]['confirmation_id']}/accept", headers=H(right))
db.expire_all()
p = db.query(Pet).get(pid)
check("correct owner accepts; ownership applied and pet Active", res.status_code == 200 and p.owner_id == right.user_id and p.status == "Active", res.text[:200])
check("residents cannot use the staff view", client.get(f"/pet-ownership/by-pet/{pid}", headers=H(right)).status_code in (401, 403))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
