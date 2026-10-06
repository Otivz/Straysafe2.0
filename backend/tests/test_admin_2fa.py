"""
Administrator sign-in with an emailed code (ADMIN_LOGIN_2FA=true).  Throwaway SQLite DB, SMTP mocked.
Run from the backend folder:  python tests/test_admin_2fa.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "admin_2fa_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-admin-2fa-0123456789")
os.environ["ADMIN_LOGIN_2FA"] = "true"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
import app.routes.auth as auth_routes  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.otp import OtpVerification  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.utils.auth import get_password_hash  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

PW = "Admin-Password-1!"
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password=get_password_hash(PW), role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


admin = mk("Admin One", 4)
other_admin = mk("Admin Two", 4)
staff = mk("Staff One", 3, barangay_id=1)
resident = mk("Resident One", 1, subdivision_id=1, barangay_id=1, phone="0917", address="Blk 1")
db.commit()

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


sent = []
mail_ok = {"v": True}
auth_routes.send_admin_login_code_email = lambda to, name, code, minutes=10: sent.append((to, code)) or mail_ok["v"]


def fresh():
    limiter.reset()
    db.expire_all()


def login(u, password=PW):
    return client.post("/auth/login", json={"email": u.email, "password": password})


def verify(email, code):
    return client.post("/auth/admin/verify-login", json={"email": email, "otp": code})


# --- Password step ---------------------------------------------------------------
fresh()
r = login(admin)
body = r.json()
check("a correct admin password returns a code request, not a session",
      r.status_code == 200 and body.get("requires_login_code") is True and not body.get("access_token") and "refresh_token" not in r.headers.get("set-cookie", ""), r.text[:300])
check("the code was emailed to the admin's address", len(sent) == 1 and sent[0][0] == admin.email and len(sent[0][1]) == 6)
check("the code is not in the response", sent[0][1] not in r.text)
check("the email address is masked in the message", admin.email not in body.get("message", "") and "***" in body.get("message", "") or "*" in body.get("message", ""))

fresh()
r = login(admin, "Wrong-Password-9!")
check("a wrong password gets no code at all", r.status_code == 401 and len(sent) == 1)

# --- Code step -------------------------------------------------------------------
code = sent[0][1]
fresh()
r = verify(admin.email, "000000")
check("a wrong code is refused", r.status_code == 400 and not r.json().get("access_token"), r.text)

r = verify(other_admin.email, code)
check("one admin's code doesn't work for another admin", r.status_code == 400)
r = verify(staff.email, code)
check("the code doesn't work for non-admin accounts", r.status_code == 400)

r = verify(admin.email, code)
check("the right code completes the sign-in with a session", r.status_code == 200 and r.json().get("access_token") and r.json()["role_id"] == 4, r.text[:200])
check("the refresh cookie is set only now", "refresh_token" in r.headers.get("set-cookie", ""))
db.expire_all()
check("last sign-in time is recorded", db.get(User, admin.user_id).last_login is not None)

fresh()
r = verify(admin.email, code)
check("a used code can't be used again", r.status_code == 400)

# --- Lockout, expiry, replacement ---------------------------------------------------
fresh()
login(admin)
code2 = sent[-1][1]
bad = "111111" if code2 != "111111" else "222222"
fresh()
for _ in range(5):
    verify(admin.email, bad)
r = verify(admin.email, code2)
check("after 5 wrong guesses even the right code is refused", r.status_code in (400, 429), r.text)

fresh()
login(admin)
first = sent[-1][1]
fresh()
login(admin)
second = sent[-1][1]
fresh()
r_old = verify(admin.email, first) if first != second else None
check("signing in again replaces the earlier code", first == second or (r_old is not None and r_old.status_code == 400))

db.query(OtpVerification).filter(OtpVerification.user_id == admin.user_id, OtpVerification.is_used == False).update(  # noqa: E712
    {"expires_at": datetime.now() - timedelta(minutes=1)})
db.commit()
fresh()
r = verify(admin.email, second)
check("an expired code is refused", r.status_code == 400)

# --- Email failure -------------------------------------------------------------------
mail_ok["v"] = False
fresh()
r = login(admin)
check("if the email can't be sent the admin gets a clear error and no session", r.status_code == 503 and not r.json().get("access_token") if r.headers.get("content-type", "").startswith("application/json") else r.status_code == 503, r.text[:200])
mail_ok["v"] = True

# --- Other roles and the off switch ---------------------------------------------------
fresh()
n = len(sent)
r = login(staff)
check("staff sign in normally with just a password", r.status_code == 200 and r.json().get("access_token") and len(sent) == n, r.text[:150])
r = login(resident)
check("residents sign in normally too", r.status_code == 200 and r.json().get("access_token") and len(sent) == n, r.text[:150])

os.environ["ADMIN_LOGIN_2FA"] = "false"
fresh()
r = login(admin)
check("with ADMIN_LOGIN_2FA=false admins sign in with just a password", r.status_code == 200 and r.json().get("access_token") and len(sent) == n, r.text[:150])
os.environ["ADMIN_LOGIN_2FA"] = "true"

# --- Code can't be recycled for resident verification ----------------------------------
fresh()
login(admin)
admin_code = sent[-1][1]
unverified = User(name="Newbie", email="newbie@test-mail.com", password=get_password_hash(PW), role_id=1, subdivision_id=1,
                  barangay_id=1, phone="0917", address="Blk", is_verified=False, status="Active")
db.add(unverified)
db.commit()
from app.utils.auth import create_access_token  # noqa: E402
t = create_access_token({"sub": str(unverified.user_id), "user_id": unverified.user_id, "role_id": 1})
fresh()
r = client.post("/auth/verify-otp", json={"otp": admin_code}, headers={"Authorization": f"Bearer {t}"})
check("an admin sign-in code can't verify a resident account", r.status_code == 400)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
