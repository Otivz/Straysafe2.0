"""
Google sign-in must use a Google-verified ID token, and email OTP must be bound to the pending session.
Throwaway SQLite DB, real JWT auth, Google + SMTP mocked.  Run from the backend folder:  python tests/test_auth_google_otp.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "auth_google_otp_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-google-otp-0123456789")
os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
os.environ["OTP_DEBUG"] = "false"
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASSWORD"] = ""
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
from app.routes import users  # noqa: E402
from app.utils import mailer  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
api.include_router(users.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(User(name="Brgy Staff", email="staff@test-mail.com", password="x", role_id=3, barangay_id=1,
            is_verified=True, status="Active"))
db.add(User(name="Verified Resident", email="verified@test-mail.com", password="x", role_id=1, subdivision_id=1,
            barangay_id=1, phone="0917", address="Blk 1", is_verified=True, status="Active"))
db.commit()

results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# --- Google + SMTP mocks -------------------------------------------------------
GOOGLE_TOKENS = {
    "good-new": {"email": "new.resident@gmail.com", "email_verified": True, "name": "New Resident", "picture": "https://lh3.googleusercontent.com/a/x"},
    "good-verified": {"email": "verified@test-mail.com", "email_verified": True, "name": "Verified Resident"},
    "staff": {"email": "staff@test-mail.com", "email_verified": True, "name": "Brgy Staff"},
    "unverified-email": {"email": "someone@gmail.com", "email_verified": False},
}


def fake_verify(credential, request, audience, clock_skew_in_seconds=0):
    assert audience == os.environ["GOOGLE_CLIENT_ID"]
    if credential not in GOOGLE_TOKENS:
        raise ValueError("Token signature invalid")
    return GOOGLE_TOKENS[credential]


auth_routes.google_id_token.verify_oauth2_token = fake_verify

sent_mail = []
mail_works = {"ok": True}


def fake_send_otp_email(to, name, code, minutes=5):
    sent_mail.append((to, code))
    return mail_works["ok"]


auth_routes.send_otp_email = fake_send_otp_email


def latest_code(email):
    db.expire_all()
    u = db.query(User).filter(User.email == email).first()
    rec = db.query(OtpVerification).filter(OtpVerification.user_id == u.user_id, OtpVerification.is_used == False).order_by(OtpVerification.otp_id.desc()).first()  # noqa: E712
    return rec.otp_code if rec else None


bearer = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731

# --- The old "type any email" request is gone ---------------------------------
res = client.post("/auth/google", json={"email": "verified@test-mail.com", "name": "Attacker"})
check("old email-only Google request is rejected (no credential)", res.status_code == 422, res.text[:200])

res = client.post("/auth/google", json={"credential": "forged-token"})
check("forged Google credential is rejected", res.status_code == 401, res.text[:200])

res = client.post("/auth/google", json={"credential": "unverified-email"})
check("Google account with unverified email is rejected", res.status_code == 401, res.text[:200])

res = client.post("/auth/google", json={"credential": "staff"})
check("staff account cannot sign in through resident Google login", res.status_code == 403, res.text[:200])

saved_id = os.environ.pop("GOOGLE_CLIENT_ID")
res = client.post("/auth/google", json={"credential": "good-new"})
check("missing GOOGLE_CLIENT_ID gives a clear 503", res.status_code == 503, res.text[:200])
os.environ["GOOGLE_CLIENT_ID"] = saved_id

res = client.post("/auth/google", json={"credential": "good-verified"})
check("verified resident with a real Google token logs straight in",
      res.status_code == 200 and res.json()["is_verified"] and not res.json()["requires_otp"], res.text[:200])

# --- New Google user: profile -> email OTP -> verified ------------------------
res = client.post("/auth/google", json={"credential": "good-new"})
data = res.json()
check("new Google user is created from the token's email and asked for details",
      res.status_code == 200 and data["email"] == "new.resident@gmail.com" and data["requires_profile_completion"], res.text[:200])
check("name and picture come from Google, not the browser",
      data["name"] == "New Resident" and data["profile_picture"].startswith("https://lh3.googleusercontent.com"))
pending = data["access_token"]
new_uid = data["user_id"]

profile = {"name": "New Resident", "phone": "09171234567", "subdivision_id": 1, "address": "Blk 2 Lot 3"}
res = client.post("/auth/complete-profile", json={**profile, "user_id": new_uid})
check("complete-profile without the pending session is refused", res.status_code == 401, res.text[:200])

verified_uid = db.query(User).filter(User.email == "verified@test-mail.com").first().user_id
res = client.post("/auth/complete-profile", json={**profile, "user_id": verified_uid, "name": "Hijacked"}, headers=bearer(pending))
db.expire_all()
victim = db.query(User).get(verified_uid)
check("a user_id in the body cannot redirect the edit to someone else", victim.name == "Verified Resident")
check("complete-profile acts on the session's own account and sends the email",
      res.status_code == 200 and res.json()["email_sent"] is True and sent_mail[-1][0] == "new.resident@gmail.com", res.text[:200])
check("OTP is not returned in the API response by default", res.json().get("dev_otp") is None, res.text[:200])

res = client.post("/auth/verify-otp", json={"otp": latest_code("new.resident@gmail.com"), "user_id": new_uid})
check("verify-otp without the pending session is refused", res.status_code == 401, res.text[:200])

res = client.post("/auth/verify-otp", json={"otp": "000000"}, headers=bearer(pending))
check("wrong code is rejected with attempts remaining", res.status_code == 400 and "attempt" in res.json()["detail"], res.text[:200])

code = latest_code("new.resident@gmail.com")
check("emailed code matches the stored code", sent_mail[-1][1] == code)
res = client.post("/auth/verify-otp", json={"otp": code}, headers=bearer(pending))
db.expire_all()
check("correct code verifies the account and issues a session",
      res.status_code == 200 and res.json()["is_verified"] and db.query(User).get(new_uid).is_verified, res.text[:200])

res = client.post("/auth/complete-profile", json=profile, headers=bearer(pending))
check("verified accounts can't reuse complete-profile to change details", res.status_code == 400, res.text[:200])

# --- Password registration can't self-verify ----------------------------------
res = client.post("/users/", json={"name": "Self Verifier", "email": "self@test-mail.com", "password": "Secret123!Strong",
                                   "role_id": 1, "subdivision_id": 1, "is_verified": True})
db.expire_all()
u = db.query(User).filter(User.email == "self@test-mail.com").first()
check("public registration ignores is_verified=true from the browser", res.status_code == 200 and u and not u.is_verified, res.text[:200])

# --- Email failure is reported, debug mode shows the code ---------------------
from app.utils.auth import create_access_token  # noqa: E402
self_token = create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": 1, "is_verified": False})
mail_works["ok"] = False
res = client.post("/auth/complete-profile", json={**profile, "name": "Self Verifier"}, headers=bearer(self_token))
check("failed email is reported as email_sent=false with a retry message",
      res.status_code == 200 and res.json()["email_sent"] is False and "Resend" in res.json()["message"], res.text[:200])
mail_works["ok"] = True

os.environ["OTP_DEBUG"] = "true"
db.query(OtpVerification).update({"created_at": None})  # skip the 30s resend cooldown
db.commit()
res = client.post("/auth/resend-otp", json={}, headers=bearer(self_token))
check("OTP_DEBUG=true includes the code for local testing", res.status_code == 200 and res.json()["dev_otp"] == latest_code("self@test-mail.com"), res.text[:200])
os.environ["OTP_DEBUG"] = "false"

# --- Mailer refuses to send without SMTP settings -----------------------------
check("mailer reports not-configured instead of crashing", mailer.email_configured() is False and mailer.send_email("x@y.com", "s", "t") is False)

# --- Rate limiting on code guessing -------------------------------------------
statuses = [client.post("/auth/verify-otp", json={"otp": "111111"}, headers=bearer(self_token)).status_code for _ in range(12)]
check("verify-otp is rate limited (429 after repeated guesses)", 429 in statuses, str(statuses))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
