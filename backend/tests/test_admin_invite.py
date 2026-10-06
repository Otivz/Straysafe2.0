"""
Admin creates an account -> the person is emailed a setup code, sets their own password, and that proves the email.
Throwaway SQLite DB, real JWT auth, SMTP mocked.  Run from the backend folder:  python tests/test_admin_invite.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "admin_invite_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-admin-invite-0123456789")
os.environ["FRONTEND_URL"] = "http://localhost:5173"
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
from app.models.otp import OtpVerification  # noqa: E402
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

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
admin = User(name="Admin One", email="admin@test-mail.com", password=get_password_hash("AdminPass123"), role_id=4,
             is_verified=True, status="Active")
resident = User(name="Plain Resident", email="resident@test-mail.com", password=get_password_hash("ResidentPass1"), role_id=1,
                subdivision_id=1, barangay_id=1, is_verified=True, status="Active")
db.add_all([admin, resident])
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


invites = []
mail_ok = {"v": True}
users_routes.send_account_invite_email = lambda to, name, role_label, code, hours, login_url=None: invites.append(
    {"to": to, "code": code, "role": role_label, "hours": hours, "url": login_url}) or mail_ok["v"]
auth_routes.send_password_reset_email = lambda to, name, code, minutes=10: True


def fresh():
    limiter.reset()
    db.expire_all()


def pw_ok(email, password):
    db.expire_all()
    return verify_password(password, db.query(User).filter(User.email == email).first().password)


payload = {"name": "New Leader", "email": "New.Leader@Test-Mail.com", "phone": "09171234567", "role_id": 2, "subdivision_id": 1, "status": "Active"}

# --- Permissions ----------------------------------------------------------------
res = client.post("/users/admin-create", json=payload, headers=H(resident))
check("a resident can't create accounts", res.status_code == 403 and not invites, res.text[:150])
res = client.post("/users/admin-create", json=payload)
check("creating an account without logging in is refused", res.status_code == 401)

# --- Creating -------------------------------------------------------------------
res = client.post("/users/admin-create", json={**payload, "password": "Typed-By-Admin-1"}, headers=H(admin))
body = res.json()
check("admin creates the account", res.status_code == 200 and body["email"] == "new.leader@test-mail.com", res.text[:200])
check("setup email goes to the entered address with a 72-hour code",
      len(invites) == 1 and invites[0]["to"] == "new.leader@test-mail.com" and invites[0]["hours"] == 72 and len(invites[0]["code"]) == 6, str(invites))
check("email names the role and links to the staff sign-in page", invites[0]["role"] == "Subdivision Leader" and invites[0]["url"] == "http://localhost:5173/staff/login", str(invites[0]))
check("response says the invite was sent and is pending", body["invite_sent"] is True and body["invite_pending"] is True)
new_id = body["user_id"]
check("a password typed by the admin is ignored", not pw_ok("new.leader@test-mail.com", "Typed-By-Admin-1"))
check("the code is never in the response", invites[0]["code"] not in res.text)

res = client.post("/users/admin-create", json={**payload, "email": "NEW.LEADER@test-mail.com"}, headers=H(admin))
check("the same email can't be used twice (any capitalisation)", res.status_code == 400)

# --- The person can't sign in until they set a password -------------------------
fresh()
for guess in ("Typed-By-Admin-1", "password123", ""):
    r = client.post("/auth/login", json={"email": "new.leader@test-mail.com", "password": guess})
    if r.status_code == 200:
        break
check("the new account can't be signed into before setup", r.status_code != 200)

# --- Listing --------------------------------------------------------------------
res = client.get("/users/", headers=H(admin))
rows = {u["email"]: u for u in res.json()}
check("user list marks who is awaiting setup", rows["new.leader@test-mail.com"]["invite_pending"] is True and rows["resident@test-mail.com"]["invite_pending"] is False)

# --- Resending ------------------------------------------------------------------
fresh()
res = client.post(f"/users/{new_id}/resend-invite", headers=H(resident))
check("only admins can resend an invite", res.status_code == 403)
res = client.post(f"/users/{resident.user_id}/resend-invite", headers=H(admin))
check("can't send an invite to someone who already has a password", res.status_code == 400)
res = client.post("/users/99999/resend-invite", headers=H(admin))
check("unknown user gives 404", res.status_code == 404)

first_code = invites[0]["code"]
res = client.post(f"/users/{new_id}/resend-invite", headers=H(admin))
check("admin can resend the setup email", res.status_code == 200 and res.json()["invite_sent"] is True and len(invites) == 2, res.text[:200])
second_code = invites[1]["code"]

fresh()
r = client.post("/auth/reset-password", json={"email": "new.leader@test-mail.com", "otp": first_code, "new_password": "MyOwnPassword1!"})
check("the old invite code stops working after a resend", first_code == second_code or r.status_code == 400, r.text[:150])

mail_ok["v"] = False
res = client.post(f"/users/{new_id}/resend-invite", headers=H(admin))
check("a failed email is reported instead of pretending success", res.status_code == 200 and res.json()["invite_sent"] is False)
second_code = invites[-1]["code"]
mail_ok["v"] = True

# --- The person finishes setup --------------------------------------------------
fresh()
r = client.post("/auth/reset-password", json={"email": "new.leader@test-mail.com", "otp": "000000", "new_password": "MyOwnPassword1!"})
check("a wrong code is refused", r.status_code == 400 and not pw_ok("new.leader@test-mail.com", "MyOwnPassword1!"))

r = client.post("/auth/reset-password", json={"email": "new.leader@test-mail.com", "otp": second_code, "new_password": "short"})
check("the password rules apply to setup too", r.status_code == 400)

fresh()
r = client.post("/auth/reset-password", json={"email": "new.leader@test-mail.com", "otp": second_code, "new_password": "MyOwnPassword1!"})
check("the emailed code lets them choose their own password", r.status_code == 200 and pw_ok("new.leader@test-mail.com", "MyOwnPassword1!"), r.text[:200])

fresh()
login = client.post("/auth/login", json={"email": "new.leader@test-mail.com", "password": "MyOwnPassword1!"})
check("they can now sign in with it", login.status_code == 200 and login.json()["role_id"] == 2, login.text[:200])

rows = {u["email"]: u for u in client.get("/users/", headers=H(admin)).json()}
check("they're no longer shown as awaiting setup", rows["new.leader@test-mail.com"]["invite_pending"] is False)
res = client.post(f"/users/{new_id}/resend-invite", headers=H(admin))
check("a finished account can't be sent another invite", res.status_code == 400)

fresh()
r = client.post("/auth/reset-password", json={"email": "new.leader@test-mail.com", "otp": second_code, "new_password": "SecondUse1234!"})
check("the setup code can't be used a second time", r.status_code == 400 and pw_ok("new.leader@test-mail.com", "MyOwnPassword1!"))

# --- Invite code and forgot-password code can both be held -----------------------
fresh()
res = client.post("/users/admin-create", json={**payload, "email": "second@test-mail.com", "name": "Second Person"}, headers=H(admin))
sid = res.json()["user_id"]
invite_code = invites[-1]["code"]
fresh()
client.post("/auth/forgot-password", json={"email": "second@test-mail.com"})
r = client.post("/auth/reset-password", json={"email": "second@test-mail.com", "otp": invite_code, "new_password": "SecondPerson123!"})
check("requesting a forgot-password code doesn't cancel the setup code", r.status_code == 200 and pw_ok("second@test-mail.com", "SecondPerson123!"), r.text[:200])

# --- Expiry ---------------------------------------------------------------------
fresh()
res = client.post("/users/admin-create", json={**payload, "email": "late@test-mail.com", "name": "Late Person"}, headers=H(admin))
lid = res.json()["user_id"]
late_code = invites[-1]["code"]
db.query(OtpVerification).filter(OtpVerification.user_id == lid).update({"expires_at": datetime.now() - timedelta(minutes=1)})
db.commit()
fresh()
r = client.post("/auth/reset-password", json={"email": "late@test-mail.com", "otp": late_code, "new_password": "LatePerson12345!"})
check("an expired setup code is refused", r.status_code == 400)
rows = {u["email"]: u for u in client.get("/users/", headers=H(admin)).json()}
check("an expired invite still shows as awaiting setup, so admin can resend", rows["late@test-mail.com"]["invite_pending"] is True)
res = client.post(f"/users/{lid}/resend-invite", headers=H(admin))
fresh()
r = client.post("/auth/reset-password", json={"email": "late@test-mail.com", "otp": invites[-1]["code"], "new_password": "LatePerson12345!"})
check("a resent invite works after the first one expired", res.status_code == 200 and r.status_code == 200 and pw_ok("late@test-mail.com", "LatePerson12345!"), r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
