"""
Stay signed in (like Facebook): how long each role stays signed in, and the installed app's refresh token.
- Residents 30 days, Subdivision Leaders / Barangay Staff 7 days, Admins 1 day; every refresh starts a new full period.
- The app (X-StraySafe-Client: app) gets the refresh token in X-Refresh-Token and can refresh / sign out with it.
- Browsers never see that header (cookie only), and a token from a signed-out app can't be reused.
Throwaway SQLite DB.  Run from the backend folder:  python tests/test_app_stay_signed_in.py
"""
import os
import sys
import tempfile
from datetime import datetime, timezone

_DB = os.path.join(tempfile.mkdtemp(), "stay_signed_in_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-stay-signed-in-0123456789")
os.environ.pop("COOKIE_SECURE", None)
os.environ.pop("ADMIN_LOGIN_2FA", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
import app.routes.auth as auth_routes  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.utils.auth import ALGORITHM, SECRET_KEY, get_password_hash, strip_app_refresh_header  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
api.middleware("http")(strip_app_refresh_header)
db = SessionLocal()

PW = "Stay-Signed-In-1!"
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password=get_password_hash(PW), role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


resident = mk("Resident One", 1, subdivision_id=1, barangay_id=1, phone="09170000001", address="Blk 1")
leader = mk("Leader One", 2, subdivision_id=1, barangay_id=1)
staff = mk("Staff One", 3, barangay_id=1)
admin = mk("Admin One", 4)
db.commit()

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


APP = {"X-StraySafe-Client": "app"}


def days_left(token):
    exp = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["exp"]
    return (exp - datetime.now(timezone.utc).timestamp()) / 86400


def login(user, headers=None):
    limiter.reset()  # the real 5-per-minute sign-in limit would stop this test, not what it checks
    c = TestClient(api, raise_server_exceptions=False)
    r = c.post("/auth/login", json={"email": user.email, "password": PW}, headers=headers or {})
    return c, r


# 1. Period per role (cookie and token agree)
for user, want in ((resident, 30), (leader, 7), (staff, 7), (admin, 1)):
    c, r = login(user)
    cookie = c.cookies.get("refresh_token")
    ok = r.status_code == 200 and cookie and abs(days_left(cookie) - want) < 0.01
    check(f"1 {user.name}: signed in for {want} day(s)", ok, f"{r.status_code} {r.text[:120]}")
    set_cookie = r.headers.get("set-cookie", "")
    check(f"1 {user.name}: cookie lasts {want} day(s)", f"Max-Age={want * 86400}" in set_cookie or f"Max-Age={want * 86400 - 1}" in set_cookie, set_cookie[:160])

# 2. Browser: never gets the header (cookie only)
c, r = login(resident)
check("2 a browser sign-in does not expose the refresh token header", "x-refresh-token" not in r.headers)
r2 = c.post("/auth/refresh")
check("2 a browser still refreshes with the cookie", r2.status_code == 200 and r2.json().get("access_token"))
check("2 ...and still gets no header", "x-refresh-token" not in r2.headers)

# 3. Installed app: header token, refresh without any cookie, rotation restarts the 30 days
c, r = login(resident, APP)
app_token = r.headers.get("x-refresh-token")
check("3 the app gets the refresh token in X-Refresh-Token", r.status_code == 200 and app_token, f"{r.status_code} {r.text[:100]} {dict(r.headers)}")
check("3 ...valid for 30 days", app_token and abs(days_left(app_token) - 30) < 0.01)

fresh = TestClient(api, raise_server_exceptions=False)  # no cookies at all, like the APK
r = fresh.post("/auth/refresh", headers={**APP, "X-Refresh-Token": app_token})
new_token = r.headers.get("x-refresh-token")
check("3 the app refreshes with only the header (no cookie)", r.status_code == 200 and r.json().get("access_token"), r.text[:120])
check("3 ...and receives a new 30-day token", new_token and new_token != app_token and abs(days_left(new_token) - 30) < 0.01)

r = TestClient(api, raise_server_exceptions=False).post("/auth/refresh", headers={**APP, "X-Refresh-Token": app_token})
check("3 the replaced token can't be used again", r.status_code == 401)

r = TestClient(api, raise_server_exceptions=False).post("/auth/refresh", headers={"X-Refresh-Token": new_token})
check("3 the header alone (without the app marker) is ignored", r.status_code == 401)

# 4. Sign out in the app ends that session
access = TestClient(api, raise_server_exceptions=False).post(
    "/auth/refresh", headers={**APP, "X-Refresh-Token": new_token})
latest = access.headers.get("x-refresh-token")
r = TestClient(api, raise_server_exceptions=False).post(
    "/auth/logout", headers={**APP, "X-Refresh-Token": latest, "Authorization": f"Bearer {access.json()['access_token']}"})
check("4 the app can sign out", r.status_code == 200, r.text[:120])
r = TestClient(api, raise_server_exceptions=False).post("/auth/refresh", headers={**APP, "X-Refresh-Token": latest})
check("4 after signing out, that token no longer works", r.status_code == 401)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
