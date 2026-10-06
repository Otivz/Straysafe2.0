"""
Password rules: 12-128 characters with an uppercase letter, a lowercase letter, a number and a special character.
Enforced on registration, profile/password updates and resets.  Throwaway SQLite DB.
Run from the backend folder:  python tests/test_password_policy.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "password_policy_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-password-policy-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
import app.routes.auth as auth_routes  # noqa: E402
import app.routes.users as users_routes  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.utils.auth import create_access_token, get_password_hash, verify_password  # noqa: E402
from app.utils.password_policy import password_problems  # noqa: E402

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# --- The rule itself ------------------------------------------------------------
check("a strong password has no problems", password_problems("Correct-Horse-9-Battery") == [])
check("exactly 12 characters is accepted", password_problems("Abcdefgh1!xy") == [])
check("11 characters is too short", any("12 characters" in p for p in password_problems("Abcdefgh1!x")))
check("exactly 128 characters is accepted", password_problems("Aa1!" + "x" * 124) == [])
check("129 characters is too long", any("128" in p for p in password_problems("Aa1!" + "x" * 125)))
check("missing uppercase is reported", password_problems("abcdefghij1!xyz") == ["an uppercase letter"])
check("missing lowercase is reported", password_problems("ABCDEFGHIJ1!XYZ") == ["a lowercase letter"])
check("missing number is reported", password_problems("Abcdefghij!xyzw") == ["a number"])
check("missing special character is reported", len(password_problems("Abcdefghij1xyzw")) == 1 and "special" in password_problems("Abcdefghij1xyzw")[0])
check("a space is not counted as a special character", len(password_problems("Abcdefg hij1 xyz")) == 1)
check("several problems are all listed", len(password_problems("abc")) == 4)
check("empty password fails", len(password_problems("")) >= 4)

# --- Enforced by the API --------------------------------------------------------
Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
api.include_router(users_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
me = User(name="Me", email="me@test-mail.com", password=get_password_hash("Old-Password-1!"), role_id=1, subdivision_id=1,
          barangay_id=1, is_verified=True, status="Active")
db.add(me)
db.commit()
H = {"Authorization": "Bearer " + create_access_token({"sub": str(me.user_id), "user_id": me.user_id, "role_id": 1})}


def fresh():
    limiter.reset()
    db.expire_all()


reg = {"name": "Reg User", "email": "reg@test-mail.com", "role_id": 1, "subdivision_id": 1, "phone": "0917"}

fresh()
r = client.post("/users/", json={**reg, "password": "password123"})
check("registration with a weak password is refused and says what's missing",
      r.status_code == 400 and "12 characters" in r.json()["detail"] and "uppercase" in r.json()["detail"], r.text)
check("the refused registration created no account", db.query(User).filter(User.email == "reg@test-mail.com").count() == 0)

fresh()
r = client.post("/users/", json={**reg, "password": "Strong-Passw0rd!"})
check("registration with a strong password works", r.status_code == 200, r.text[:200])

fresh()
r = client.post("/auth/change-password", json={"current_password": "Old-Password-1!", "new_password": "short"}, headers=H)
db.expire_all()
check("changing your password to a weak one is refused", r.status_code == 400 and verify_password("Old-Password-1!", db.get(User, me.user_id).password), r.text)

r = client.post("/auth/change-password", json={"current_password": "Old-Password-1!", "new_password": "Brand-New-Passw0rd!"}, headers=H)
db.expire_all()
check("changing your password to a strong one works", r.status_code == 200 and verify_password("Brand-New-Passw0rd!", db.get(User, me.user_id).password), r.text[:200])

def new_session():
    # A password change ends older sessions, so use a token issued after it (as if signed in again).
    return {"Authorization": "Bearer " + create_access_token({"sub": str(me.user_id), "user_id": me.user_id, "role_id": 1})}


r = client.put(f"/users/{me.user_id}", json={"name": "Me Renamed", "password": ""}, headers=new_session())
db.expire_all()
check("an empty password field on an edit leaves the password alone", r.status_code == 200 and verify_password("Brand-New-Passw0rd!", db.get(User, me.user_id).password), r.text[:200])

fresh()
r = client.post("/auth/change-password", json={"current_password": "Brand-New-Passw0rd!", "new_password": "A" * 200 + "a1!"}, headers=new_session())
check("a password over 128 characters is refused", r.status_code == 400, r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
