"""
Changing your own password must ask for the current one; the old edit route can't be used for it.
Head officers create staff through the emailed setup code.  Throwaway SQLite DB, SMTP mocked.
Run from the backend folder:  python tests/test_change_password.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "change_password_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-change-password-0123456789")
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
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.utils.auth import create_access_token, get_password_hash, verify_password  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
api.include_router(users_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

OLD = "Old-Password-1!"
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.add(Barangay(barangay_id=2, barangay_name="B2", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password=get_password_hash(OLD), role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


resident = mk("Resident One", 1, subdivision_id=1, barangay_id=1)
admin = mk("Admin One", 4)
head = mk("Head Officer", 3, barangay_id=1, is_head_officer=True)
staff = mk("Field Staff", 3, barangay_id=1, is_head_officer=False)
other = mk("Other Resident", 1, subdivision_id=1, barangay_id=1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


invites = []
users_routes.send_account_invite_email = lambda to, name, role_label, code, hours, login_url=None: invites.append((to, code)) or True


def fresh():
    limiter.reset()
    db.expire_all()


def pw_is(user, password):
    db.expire_all()
    return verify_password(password, db.get(User, user.user_id).password)


NEW = "Brand-New-Passw0rd!"

# --- Change password ------------------------------------------------------------
fresh()
r = client.post("/auth/change-password", json={"current_password": OLD, "new_password": NEW})
check("changing a password requires being signed in", r.status_code == 401)

r = client.post("/auth/change-password", json={"current_password": "Wrong-Password-9!", "new_password": NEW}, headers=H(resident))
check("a wrong current password is refused", r.status_code == 400 and "current password" in r.json()["detail"] and pw_is(resident, OLD), r.text)
failed = db.query(AuditLog).filter(AuditLog.action == "FAILED_PASSWORD_CHANGE", AuditLog.target_id == resident.user_id).count()
check("the failed attempt is written to the audit log", failed == 1)

r = client.post("/auth/change-password", json={"current_password": OLD, "new_password": OLD}, headers=H(resident))
check("the new password must differ from the current one", r.status_code == 400 and "different" in r.json()["detail"], r.text)

r = client.post("/auth/change-password", json={"current_password": OLD, "new_password": "weakpass"}, headers=H(resident))
check("a weak new password is refused with the rules", r.status_code == 400 and "12 characters" in r.json()["detail"] and pw_is(resident, OLD), r.text)

r = client.post("/auth/change-password", json={"current_password": OLD, "new_password": NEW}, headers=H(resident))
check("the right current password plus a strong new one works", r.status_code == 200 and pw_is(resident, NEW) and not pw_is(resident, OLD), r.text)
check("the change is audit logged", db.query(AuditLog).filter(AuditLog.action == "PASSWORD_CHANGED", AuditLog.target_id == resident.user_id).count() == 1)

fresh()
login = client.post("/auth/login", json={"email": resident.email, "password": NEW})
check("signing in works with the new password", login.status_code == 200, login.text[:150])

# --- The old route can't be used to skip the current-password check -------------
fresh()
r = client.put(f"/users/{admin.user_id}", json={"password": "Sneaky-Passw0rd!x"}, headers=H(admin))
check("an admin can't set their own password through the edit route", r.status_code == 400 and "Change Password" in r.json()["detail"] and pw_is(admin, OLD), r.text)
r = client.put(f"/users/{head.user_id}", json={"password": "Sneaky-Passw0rd!x"}, headers=H(head))
check("a head officer can't either", r.status_code == 400 and pw_is(head, OLD))
r = client.put(f"/users/{resident.user_id}", json={"name": "Renamed Resident"}, headers=H(resident))
check("editing other profile fields still works", r.status_code == 200)

r = client.put(f"/users/{other.user_id}", json={"password": "Admin-Reset-Passw0rd!"}, headers=H(admin))
check("an admin can still set someone else's password (and the rules apply)", r.status_code == 200 and pw_is(other, "Admin-Reset-Passw0rd!"), r.text[:150])
r = client.put(f"/users/{other.user_id}", json={"password": "weak"}, headers=H(admin))
check("...but not a weak one", r.status_code == 400)

fresh()
r = client.put(f"/users/{other.user_id}", json={"password": "Hacker-Passw0rd!x"}, headers=H(resident))
check("a resident can't change someone else's password", r.status_code == 403 and pw_is(other, "Admin-Reset-Passw0rd!"), r.text[:150])

# --- Rate limit -----------------------------------------------------------------
fresh()
codes = [client.post("/auth/change-password", json={"current_password": "Nope-Nope-Nope-1!", "new_password": NEW}, headers=H(resident)).status_code for _ in range(8)]
check("guessing the current password is rate limited", 429 in codes, str(codes))

# --- Head officers use the emailed setup code -----------------------------------
fresh()
payload = {"name": "New Staffer", "email": "New.Staffer@Test-Mail.com", "phone": "0917", "role_id": 3, "is_head_officer": False, "position": "Field Rescuer", "barangay_id": 2}
r = client.post("/users/admin-create", json=payload, headers=H(head))
body = r.json()
check("a head officer can create a staff account", r.status_code == 200 and body["role_id"] == 3, r.text[:200])
check("it lands in the head officer's own barangay", body["barangay_id"] == 1, str(body.get("barangay_id")))
check("the new staffer gets a setup email, with no password set by the officer", invites and invites[-1][0] == "new.staffer@test-mail.com" and body["invite_sent"] is True)

r = client.post("/users/admin-create", json={**payload, "email": "leader@test-mail.com", "role_id": 2}, headers=H(head))
check("a head officer can't create other roles", r.status_code == 403)
r = client.post("/users/admin-create", json={**payload, "email": "x@test-mail.com"}, headers=H(staff))
check("ordinary staff can't create accounts", r.status_code == 403)
r = client.post("/users/admin-create", json={**payload, "email": "y@test-mail.com"}, headers=H(resident))
check("residents can't create accounts", r.status_code == 403)

fresh()
r = client.post("/auth/reset-password", json={"email": "new.staffer@test-mail.com", "otp": invites[-1][1], "new_password": "Staffer-Own-Passw0rd!"})
check("the new staffer sets their own password with the code", r.status_code == 200, r.text[:150])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
