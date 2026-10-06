"""
Forgot password: emailed 6-digit code -> new password.  Throwaway SQLite DB, SMTP mocked.
Run from the backend folder:  python tests/test_password_reset.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "password_reset_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-password-reset-0123456789")
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
from app.utils.auth import get_password_hash, verify_password  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(auth_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(User(name="Resident One", email="resident@test-mail.com", password=get_password_hash("OldPassword1"), role_id=1,
            subdivision_id=1, barangay_id=1, is_verified=True, status="Active"))
db.add(User(name="Admin One", email="admin@test-mail.com", password=get_password_hash("OldAdminPass1"), role_id=4,
            is_verified=True, status="Active"))
db.add(User(name="Gone Person", email="gone@test-mail.com", password=get_password_hash("OldPassword1"), role_id=1,
            is_verified=True, status="Inactive"))
db.commit()

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


sent = []
auth_routes.send_password_reset_email = lambda to, name, code, minutes=10: sent.append((to, code)) or True


def fresh():
    limiter.reset()
    db.expire_all()


def pw_ok(email, password):
    db.expire_all()
    u = db.query(User).filter(User.email == email).first()
    return verify_password(password, u.password)


def age_codes(email, seconds):
    """Pretend the codes were created `seconds` ago, to skip the resend cooldown."""
    u = db.query(User).filter(User.email == email).first()
    db.query(OtpVerification).filter(OtpVerification.user_id == u.user_id).update(
        {"created_at": datetime.now() - timedelta(seconds=seconds)})
    db.commit()


# --- Requesting a code ---------------------------------------------------------
fresh()
r_known = client.post("/auth/forgot-password", json={"email": "resident@test-mail.com"})
r_unknown = client.post("/auth/forgot-password", json={"email": "nobody@test-mail.com"})
check("registered and unknown emails get the identical response",
      r_known.status_code == 200 and r_known.json() == r_unknown.json(), f"{r_known.text} vs {r_unknown.text}")
check("only the registered email was actually emailed", [s[0] for s in sent] == ["resident@test-mail.com"], str(sent))

r_gone = client.post("/auth/forgot-password", json={"email": "gone@test-mail.com"})
check("inactive account gets the same response but no email", r_gone.json() == r_known.json() and len(sent) == 1)

r_case = client.post("/auth/forgot-password", json={"email": "RESIDENT@Test-Mail.com"})
check("a second request inside 30s is silently ignored (no email spam)", r_case.status_code == 200 and len(sent) == 1)

check("code is never returned in the response", "dev_otp" not in r_known.text and sent[0][1] not in r_known.text)
code1 = sent[0][1]

# --- Resetting -----------------------------------------------------------------
fresh()
res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": code1, "new_password": "short"})
check("password shorter than 12 characters is rejected", res.status_code == 400 and "12 characters" in res.json()["detail"], res.text)
check("a rejected short password doesn't burn the code", pw_ok("resident@test-mail.com", "OldPassword1"))

res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": "000000", "new_password": "BrandNewPass1!"})
wrong_msg = res.json()["detail"]
res2 = client.post("/auth/reset-password", json={"email": "nobody@test-mail.com", "otp": "000000", "new_password": "BrandNewPass1!"})
check("wrong code and unknown email give the same error", res.status_code == 400 and res2.status_code == 400 and res2.json()["detail"] == wrong_msg, f"{res.text} / {res2.text}")
check("password unchanged after a wrong code", pw_ok("resident@test-mail.com", "OldPassword1"))

res = client.post("/auth/reset-password", json={"email": "admin@test-mail.com", "otp": code1, "new_password": "BrandNewPass1!"})
check("one person's code can't reset someone else's password", res.status_code == 400 and pw_ok("admin@test-mail.com", "OldAdminPass1"))

res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": f" {code1} ", "new_password": "BrandNewPass1!"})
check("correct code resets the password", res.status_code == 200 and pw_ok("resident@test-mail.com", "BrandNewPass1!") and not pw_ok("resident@test-mail.com", "OldPassword1"), res.text)

fresh()
res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": code1, "new_password": "AnotherPass22!"})
check("a used code can't be used again", res.status_code == 400 and pw_ok("resident@test-mail.com", "BrandNewPass1!"), res.text)

login = client.post("/auth/login", json={"email": "resident@test-mail.com", "password": "BrandNewPass1!"})
check("the new password works on the normal login", login.status_code == 200 and login.json().get("access_token"), login.text[:200])

# --- Lockout, expiry, newer code replaces older --------------------------------
fresh()
age_codes("resident@test-mail.com", 60)
client.post("/auth/forgot-password", json={"email": "resident@test-mail.com"})
code2 = sent[-1][1]
fresh()
for _ in range(5):
    client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": "111111" if code2 != "111111" else "222222", "new_password": "HackedPass99!"})
res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": code2, "new_password": "HackedPass99!"})
check("after 5 wrong guesses even the right code is locked out", res.status_code == 400 and pw_ok("resident@test-mail.com", "BrandNewPass1!"), res.text)

fresh()
age_codes("resident@test-mail.com", 60)
client.post("/auth/forgot-password", json={"email": "resident@test-mail.com"})
code3 = sent[-1][1]
age_codes("resident@test-mail.com", 60)
client.post("/auth/forgot-password", json={"email": "resident@test-mail.com"})
code4 = sent[-1][1]
fresh()
res_old = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": code3, "new_password": "OlderCodePass1!"})
check("requesting a new code cancels the previous one", res_old.status_code == 400 and pw_ok("resident@test-mail.com", "BrandNewPass1!"), res_old.text)

u = db.query(User).filter(User.email == "resident@test-mail.com").first()
db.query(OtpVerification).filter(OtpVerification.user_id == u.user_id, OtpVerification.is_used == False).update(  # noqa: E712
    {"expires_at": datetime.now() - timedelta(minutes=1)})
db.commit()
fresh()
res = client.post("/auth/reset-password", json={"email": "resident@test-mail.com", "otp": code4, "new_password": "ExpiredPass11!"})
check("an expired code is rejected", res.status_code == 400 and pw_ok("resident@test-mail.com", "BrandNewPass1!"), res.text)

# --- Works for staff/admin too, and doesn't touch the verification flow --------
fresh()
client.post("/auth/forgot-password", json={"email": "admin@test-mail.com"})
admin_code = sent[-1][1]
fresh()
res = client.post("/auth/reset-password", json={"email": "admin@test-mail.com", "otp": admin_code, "new_password": "NewAdminPass99!"})
check("admin accounts can reset through the same flow", res.status_code == 200 and pw_ok("admin@test-mail.com", "NewAdminPass99!"), res.text)

fresh()
client.post("/auth/forgot-password", json={"email": "gone@test-mail.com"})
res = client.post("/auth/reset-password", json={"email": "gone@test-mail.com", "otp": "123456", "new_password": "GonePass1234!"})
check("inactive accounts can't be reset", res.status_code == 400)

# registration codes and reset codes are kept apart
fresh()
unverified = User(name="Newbie", email="newbie@test-mail.com", password=get_password_hash("x12345678"), role_id=1,
                  subdivision_id=1, barangay_id=1, phone="0917", address="Blk", is_verified=False, status="Active")
db.add(unverified)
db.commit()
client.post("/auth/forgot-password", json={"email": "newbie@test-mail.com"})
reset_code = sent[-1][1]
from app.utils.auth import create_access_token  # noqa: E402
tok = create_access_token({"sub": str(unverified.user_id), "user_id": unverified.user_id, "role_id": 1, "is_verified": False})
res = client.post("/auth/verify-otp", json={"otp": reset_code}, headers={"Authorization": f"Bearer {tok}"})
check("a password-reset code can't be used to verify an account", res.status_code == 400, res.text)

fresh()
res = client.post("/auth/forgot-password", json={"email": "not-an-email"})
check("malformed email is rejected with 422", res.status_code == 422)

fresh()
codes = [client.post("/auth/forgot-password", json={"email": f"x{i}@test-mail.com"}).status_code for i in range(8)]
check("forgot-password is rate limited", 429 in codes, str(codes))

# --- Code is checked on its own screen before the password step ----------------
fresh()
client.post("/auth/forgot-password", json={"email": "newbie@test-mail.com"})
age_codes("newbie@test-mail.com", 60)
fresh()
client.post("/auth/forgot-password", json={"email": "newbie@test-mail.com"})
vcode = sent[-1][1]
fresh()
res = client.post("/auth/verify-reset-code", json={"email": "newbie@test-mail.com", "otp": vcode})
check("a correct code is accepted by the verify step", res.status_code == 200 and res.json() == {"valid": True}, res.text)
res = client.post("/auth/verify-reset-code", json={"email": "newbie@test-mail.com", "otp": vcode})
check("verifying doesn't use the code up (it can be checked again)", res.status_code == 200, res.text)

bad = client.post("/auth/verify-reset-code", json={"email": "newbie@test-mail.com", "otp": "000000"})
nobody = client.post("/auth/verify-reset-code", json={"email": "nobody@test-mail.com", "otp": "000000"})
check("wrong code and unknown email give the same error at the verify step",
      bad.status_code == 400 and nobody.status_code == 400 and bad.json() == nobody.json(), f"{bad.text} / {nobody.text}")

fresh()
res = client.post("/auth/reset-password", json={"email": "newbie@test-mail.com", "otp": vcode, "new_password": "NewbieNewPass1!"})
check("the verified code then sets the password on the next step", res.status_code == 200 and pw_ok("newbie@test-mail.com", "NewbieNewPass1!"), res.text)
res = client.post("/auth/verify-reset-code", json={"email": "newbie@test-mail.com", "otp": vcode})
check("a used code no longer verifies", res.status_code == 400)

fresh()
client.post("/auth/forgot-password", json={"email": "admin@test-mail.com"})
age_codes("admin@test-mail.com", 60)
fresh()
client.post("/auth/forgot-password", json={"email": "admin@test-mail.com"})
acode = sent[-1][1]
fresh()
wrong = "111111" if acode != "111111" else "222222"
for _ in range(5):
    client.post("/auth/verify-reset-code", json={"email": "admin@test-mail.com", "otp": wrong})
res = client.post("/auth/verify-reset-code", json={"email": "admin@test-mail.com", "otp": acode})
check("guessing at the verify step also locks the code after 5 tries", res.status_code in (400, 429), res.text)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
