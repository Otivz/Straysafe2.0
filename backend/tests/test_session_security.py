"""
Session security: unverified residents are limited to verification, a password change ends older sessions,
and the refresh cookie can be marked Secure.  Throwaway SQLite DB.
Run from the backend folder:  python tests/test_session_security.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

_DB = os.path.join(tempfile.mkdtemp(), "session_security_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-session-security-0123456789")
os.environ.pop("COOKIE_SECURE", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt  # noqa: E402
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
from app.utils.auth import ALGORITHM, SECRET_KEY, create_access_token, get_password_hash  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
api.include_router(users_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

PW = "Old-Password-1!"
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))


def mk(name, role, verified=True, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password=get_password_hash(PW), role_id=role,
             is_verified=verified, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


verified = mk("Verified Resident", 1, subdivision_id=1, barangay_id=1, phone="0917", address="Blk 1")
newbie = mk("Unverified Newbie", 1, verified=False, subdivision_id=1, barangay_id=1, phone="0918", address="Blk 2")
admin = mk("Admin One", 4)
db.commit()

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def tok(u, **extra):
    return create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, **extra})


def old_token(u, seconds_ago, kind="access"):
    """A genuine-looking token that was issued `seconds_ago` seconds ago."""
    issued = datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)
    return jwt.encode({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "email": u.email, "token_type": kind,
                       "iat": issued, "exp": issued + timedelta(days=1), "jti": f"old-{u.user_id}-{seconds_ago}-{kind}"},
                      SECRET_KEY, algorithm=ALGORITHM)


H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731


def fresh():
    limiter.reset()
    db.expire_all()


# --- O1: unverified residents -----------------------------------------------------
r = client.get("/auth/me", headers=H(tok(newbie)))
check("an unverified resident can't use ordinary endpoints", r.status_code == 403 and "verify" in r.json()["detail"].lower(), r.text)
r = client.get("/auth/me", headers=H(tok(verified)))
check("a verified resident can", r.status_code == 200, r.text)
r = client.get("/auth/me", headers=H(tok(admin)))
check("staff and admins aren't affected", r.status_code == 200)
r = client.post("/auth/resend-otp", json={}, headers=H(tok(newbie)))
check("the unverified resident can still reach the verification steps", r.status_code == 200, r.text)

# --- O10: password change ends older sessions --------------------------------------
fresh()
before = tok(verified)
check("a current token works", client.get("/auth/me", headers=H(before)).status_code == 200)

u = db.get(User, verified.user_id)
u.password_changed_at = datetime.now() + timedelta(seconds=3)
db.commit()
r = client.get("/auth/me", headers=H(before))
check("a token issued before the password change stops working", r.status_code == 401 and "password was changed" in r.json()["detail"], r.text)

u = db.get(User, verified.user_id)
u.password_changed_at = None
db.commit()

fresh()
r = client.post("/auth/change-password", json={"current_password": PW, "new_password": "Fresh-New-Passw0rd!"}, headers=H(old_token(verified, 30)))
check("changing the password works with a valid session", r.status_code == 200, r.text)
r = client.get("/auth/me", headers=H(old_token(verified, 30)))
check("the session from before the change is rejected afterwards", r.status_code == 401, r.text)

fresh()
r = client.post("/auth/login", json={"email": verified.email, "password": "Fresh-New-Passw0rd!"})
check("signing in again with the new password works", r.status_code == 200, r.text[:150])
new_access = r.json()["access_token"]
check("...and the new session is accepted", client.get("/auth/me", headers=H(new_access)).status_code == 200)

# refresh tokens obey the same rule
fresh()
client.cookies.set("refresh_token", old_token(verified, 60, kind="refresh"))
r = client.post("/auth/refresh")
check("an old refresh token can't be exchanged for a new session", r.status_code == 401, r.text)
client.cookies.clear()

# password reset also ends older sessions
fresh()
auth_routes.send_password_reset_email = lambda *a, **k: True
client.post("/auth/forgot-password", json={"email": admin.email})
from app.models.otp import OtpVerification  # noqa: E402
code = db.query(OtpVerification).filter(OtpVerification.user_id == admin.user_id, OtpVerification.purpose == "password_reset").first().otp_code
fresh()
r = client.post("/auth/reset-password", json={"email": admin.email, "otp": code, "new_password": "Reset-By-Email-Passw0rd!"})
r2 = client.get("/auth/me", headers=H(old_token(admin, 120)))
check("resetting a forgotten password signs out sessions opened before it", r.status_code == 200 and r2.status_code == 401, f"{r.text} / {r2.text}")

# admin changing another person's password also ends that person's sessions
fresh()
r = client.put(f"/users/{verified.user_id}", json={"password": "Admin-Set-Passw0rd!"}, headers=H(tok(admin)))
check("an admin-set password ends the person's older sessions",
      r.status_code == 200 and client.get("/auth/me", headers=H(old_token(verified, 120))).status_code == 401, r.text[:150])

# --- O2: Secure cookie -------------------------------------------------------------
fresh()
r = client.post("/auth/login", json={"email": newbie.email, "password": PW})
check("(setup) unverified login returns no refresh cookie yet", "refresh_token" not in r.headers.get("set-cookie", ""))

okuser = mk("Cookie Resident", 1, subdivision_id=1, barangay_id=1, phone="0919", address="Blk 3")
db.commit()
fresh()
r = client.post("/auth/login", json={"email": okuser.email, "password": PW})
cookie = r.headers.get("set-cookie", "")
check("by default the refresh cookie is HttpOnly and not marked Secure (plain-HTTP development)", "HttpOnly" in cookie and "Secure" not in cookie, cookie)

os.environ["COOKIE_SECURE"] = "true"
fresh()
r = client.post("/auth/login", json={"email": okuser.email, "password": PW})
cookie = r.headers.get("set-cookie", "")
check("with COOKIE_SECURE=true the refresh cookie is marked Secure", "Secure" in cookie and "HttpOnly" in cookie, cookie)
os.environ.pop("COOKIE_SECURE", None)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
