"""
Individual self-registration with residency verification (docs/01-system/RESIDENT_RECORD_REGISTRATION.md), next to the bulk import.

  register -> e-mail code (wrong / expired / right) -> PENDING_RESIDENCY_VERIFICATION (still locked) -> a Leader or an Admin reviews,
  helped by the official-list comparison (Match Found / Possible Match / No Match Found) -> approve (ACTIVE) or reject with a reason
  (REJECTED) -> a rejected applicant corrects and resubmits; residents cannot review; bulk-created accounts keep working.
Offline: a throwaway SQLite file (tests/_isolated_db.py); every e-mail sender is replaced and records what it was asked to send.
Run from the backend folder:  python tests/test_resident_applications.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.routes.auth as auth_routes
from app.limiter import limiter
from app.routes import resident_activation, resident_applications, resident_records
from app.services import resident_registry as svc

api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (auth_routes.router, resident_applications.router, resident_records.router, resident_activation.router):
    api.include_router(r)
ids = _isolated_db.create_schema_and_seed()
limiter.enabled = False

from app.database import SessionLocal  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.otp import OtpVerification  # noqa: E402
from app.models.resident_registry import OfficialResidentRecord, ResidentApplication  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import resident_invitations as invites  # noqa: E402
from app.utils.auth import create_access_token, verify_password  # noqa: E402

client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0
mail = {"otp": [], "approved": [], "rejected": [], "invite": []}


def fake_otp(to, name, code, minutes=5):
    mail["otp"].append((to, code))
    return True


auth_routes.send_otp_email = fake_otp
resident_applications.send_residency_approved_email = lambda to, name, url=None: mail["approved"].append(to) or True
resident_applications.send_residency_rejected_email = lambda to, name, reason, url=None: mail["rejected"].append((to, reason)) or True
invites.send_activation_invitation_email = lambda to, name, link, hours, *a, **kw: mail["invite"].append((to, link)) or True


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


leader = db.get(User, ids["leader"])          # role 2, subdivision 1
admin = db.get(User, ids["admin"])            # role 4
resident = db.get(User, ids["resident"])      # role 1, active
other_leader = User(name="Other Leader", email="other.leader@isolated.test", password="x", role_id=2, is_verified=True, status="Active",
                    subdivision_id=2, barangay_id=1)
db.add(other_leader)
db.commit()
LH, AH, RH, OH = H(leader), H(admin), H(resident), H(other_leader)
PW = "Str0ng!Passw0rd#1"


def register(name, email, block, lot, contact="0917 123 4567", pw=PW, confirm=None):
    return client.post("/resident-applications/register", json={
        "full_name": name, "email": email, "contact_number": contact, "block_number": block, "lot_number": lot,
        "password": pw, "confirm_password": confirm if confirm is not None else pw, "subdivision_id": 1})


def login(email, pw=PW):
    return client.post("/auth/login", json={"email": email, "password": pw})


def verify(token, code):
    return client.post("/auth/verify-otp", json={"otp": code}, headers={"Authorization": f"Bearer {token}"})


def last_code(email):
    return next(code for to, code in reversed(mail["otp"]) if to == email)


def app_of(email):
    db.expire_all()
    return db.query(ResidentApplication).filter(ResidentApplication.email == email).one()


# the official list the reviewer compares against (bulk import, unchanged)
batch = svc.build_xlsx([svc.TEMPLATE_HEADERS, ["Maria Santos", "maria.list@example.com", "4", "21", ""], ["Pedro Cruz", "pedro.list@example.com", "7", "3", ""]])
up = client.post("/resident-records/imports", files={"file": ("list.xlsx", batch, "application/octet-stream")}, headers=LH).json()
conf = client.post(f"/resident-records/imports/{up['batch_id']}/confirm", headers=LH)
check("the bulk import still creates accounts and sends invitations", conf.status_code == 200 and conf.json()["accounts_created"] == 2 and len(mail["invite"]) == 2, conf.text)

# ------------------------------------------------------------------------------------------------ 1. register
MARIA = "maria.santos.self@example.com"
r = register("Maria Santos", MARIA, "Block 04", "21")
check("1. an applicant registers", r.status_code == 200 and r.json()["status"] == "PENDING_EMAIL_VERIFICATION", r.text)
a = app_of(MARIA)
u = db.get(User, a.user_id)
check("   the account exists, unverified, resident role, password hashed", u.role_id == 1 and not u.is_verified and verify_password(PW, u.password) and u.password != PW)
check("   the same email cannot register twice", register("Maria Santos", MARIA, "4", "21").status_code == 409)
check("   an email of a bulk-created account cannot self-register", register("Maria Santos", "maria.list@example.com", "4", "21").status_code == 409)
check("   mismatched passwords are refused", register("Juan Dela", "juan.x@example.com", "1", "1", confirm=PW + "x").status_code == 400)
check("   a weak password is refused", register("Juan Dela", "juan.y@example.com", "1", "1", pw="short", confirm="short").status_code in (400, 422))
check("   an invalid email is refused", register("Juan Dela", "not-an-email", "1", "1").status_code == 400)
check("   a missing block is refused", register("Juan Dela", "juan.z@example.com", "", "1").status_code in (400, 422))
check("   an invalid contact number is refused", register("Juan Dela", "juan.w@example.com", "1", "1", contact="12").status_code == 400)
check("   a refused registration created no account", db.query(User).filter(User.email.in_(["juan.x@example.com", "juan.y@example.com", "juan.w@example.com"])).count() == 0)

# sign-in starts the e-mail code (existing flow)
lg = login(MARIA)
check("   signing in e-mails a code and opens only a restricted session", lg.status_code == 200 and lg.json()["requires_otp"] and lg.json()["is_verified"] is False, lg.text)
pending_token = lg.json()["access_token"]
check("   the restricted session cannot use resident features", client.get("/auth/me", headers={"Authorization": f"Bearer {pending_token}"}).status_code in (401, 403))

# ------------------------------------------------------------------------------------------------ 2-4. OTP
wrong = "000000" if last_code(MARIA) != "000000" else "111111"
v = verify(pending_token, wrong)
check("2. a wrong code is refused with the attempts left", v.status_code == 400 and "remaining" in v.json()["detail"], v.text)
check("   and the application is still waiting for the e-mail", app_of(MARIA).status == "PENDING_EMAIL_VERIFICATION")
otp = db.query(OtpVerification).filter(OtpVerification.email == MARIA, OtpVerification.is_used == False).first()  # noqa: E712
otp.expires_at = datetime.now() - timedelta(minutes=1)
db.commit()
v = verify(pending_token, last_code(MARIA))
check("3. an expired code is refused", v.status_code == 400 and "expired" in v.json()["detail"].lower(), v.text)
otp.created_at = datetime.now() - timedelta(minutes=2)
db.commit()
rs = client.post("/auth/resend-otp", json={}, headers={"Authorization": f"Bearer {pending_token}"})
check("   a new code can be requested", rs.status_code == 200, rs.text)
v = verify(pending_token, last_code(MARIA))
check("4. the right code verifies the e-mail", v.status_code == 200 and v.json()["residency_status"] == "PENDING_RESIDENCY_VERIFICATION", v.text)
db.expire_all()
notes = db.query(Notification).filter(Notification.type == "resident_application").all()
check("   the Subdivision Leader is notified at once (in-app; push follows the type)",
      [n.user_id for n in notes] == [leader.user_id] and not notes[0].is_read and "Maria Santos" in notes[0].message, [(n.user_id, n.message) for n in notes])
check("   the notice never carries the e-mail or phone", MARIA not in notes[0].message and "0917" not in notes[0].message)
check("   another subdivision's Leader is not notified", db.query(Notification).filter(Notification.user_id == other_leader.user_id).count() == 0)
check("   the pending count for the sidebar badge is 1", client.get("/resident-applications/pending-count", headers=LH).json() == {"pending": 1})
check("   another subdivision's Leader counts 0", client.get("/resident-applications/pending-count", headers=OH).json() == {"pending": 0})
check("   a resident cannot read the count", client.get("/resident-applications/pending-count", headers=RH).status_code == 403)
from app.utils import push_categories as _pc  # noqa: E402
check("   it is a pushed type that opens the Applications tab", _pc.category_for("resident_application") == "reports"
      and _pc.notification_link(2, "resident_application", 1) == "/residents/applications")
check("   and opens NO session", not v.json().get("access_token"))
a = app_of(MARIA)
u = db.get(User, a.user_id)
check("5. the verified applicant stays pending: locked account, e-mail verified", a.status == "PENDING_RESIDENCY_VERIFICATION" and a.email_verified_at and u.is_verified and u.status == "Inactive")
lg = login(MARIA)
check("   signing in shows the residency status instead of a session",
      lg.status_code == 403 and lg.json()["detail"]["code"] == "RESIDENCY_PENDING" and "awaiting residency verification" in lg.json()["detail"]["message"], lg.text)
check("   a wrong password reveals nothing about the application", login(MARIA, "Wrong!Passw0rd#9").json().get("detail") == "Invalid email or password")
me = client.get("/auth/me", headers=H(u))
check("6. even with a token, a pending applicant is refused every resident feature (lost pet report included)", me.status_code == 403, me.text)

# ------------------------------------------------------------------------------------------------ 7-8. review with the list
lst = client.get("/resident-applications", headers=LH)
check("   the Leader sees the pending registration", lst.status_code == 200 and lst.json()["total"] == 1 and lst.json()["applications"][0]["email"] == MARIA, lst.text)
d = client.get(f"/resident-applications/{a.application_id}", headers=LH).json()
check("7. a matching official record is shown as Match Found", d["match"]["result"] == "Match Found" and d["match"]["candidates"][0]["full_name"] == "Maria Santos", d["match"])
check("   the review shows the details the spec lists", all(k in d for k in ("full_name", "email", "contact_number", "block_number", "lot_number", "registered_at", "email_verified", "status")))
check("   matching did not decide anything", app_of(MARIA).status == "PENDING_RESIDENCY_VERIFICATION")

NOBODY = "stranger@example.com"
register("Totally Unknown", NOBODY, "99", "99")
lg = login(NOBODY)
verify(lg.json()["access_token"], last_code(NOBODY))
nb = app_of(NOBODY)
check("8. an applicant with no record is shown as No Match Found", client.get(f"/resident-applications/{nb.application_id}", headers=LH).json()["match"]["result"] == "No Match Found")
NEAR = "near@example.com"
register("Someone Else", NEAR, "7", "3")
verify(login(NEAR).json()["access_token"], last_code(NEAR))
check("   the same block and lot with another name is a Possible Match",
      client.get(f"/resident-applications/{app_of(NEAR).application_id}", headers=LH).json()["match"]["result"] == "Possible Match")

# ------------------------------------------------------------------------------------------------ 13. who may review
check("13. a resident cannot list registrations", client.get("/resident-applications", headers=RH).status_code == 403)
check("    a resident cannot approve", client.post(f"/resident-applications/{a.application_id}/approve", headers=RH).status_code == 403)
check("    a resident cannot reject", client.post(f"/resident-applications/{a.application_id}/reject", json={"reason": "Not a resident here"}, headers=RH).status_code == 403)
check("    a pending applicant cannot approve themselves", client.post(f"/resident-applications/{a.application_id}/approve", headers=H(u)).status_code == 403)
check("    another subdivision's Leader cannot see or approve it",
      client.get(f"/resident-applications/{a.application_id}", headers=OH).status_code == 404
      and client.post(f"/resident-applications/{a.application_id}/approve", headers=OH).status_code == 404)
check("    no one can approve an application still waiting for its e-mail",
      register("Late Verifier", "late@example.com", "2", "2").status_code == 200
      and client.post(f"/resident-applications/{app_of('late@example.com').application_id}/approve", headers=LH).status_code == 409)

# ------------------------------------------------------------------------------------------------ 9-10. approve
ap = client.post(f"/resident-applications/{a.application_id}/approve", headers=LH)
check("9. the Leader approves", ap.status_code == 200 and ap.json()["status"] == "ACTIVE" and ap.json()["reviewed_by"] == leader.name, ap.text)
db.expire_all()
check("   deciding marks the reviewers' notice about it as read",
      all(n.is_read for n in db.query(Notification).filter(Notification.type == "resident_application", Notification.related_id == ap.json()["application_id"])))
a = app_of(MARIA)
u = db.get(User, a.user_id)
check("   approver and time are recorded; the account is verified (it turns Active at the first sign-in)", a.reviewed_by == leader.user_id and a.reviewed_at and u.is_verified)
check("   the applicant is e-mailed", mail["approved"] == [MARIA])
check("   approving twice is refused", client.post(f"/resident-applications/{a.application_id}/approve", headers=LH).status_code == 409)
lg = login(MARIA)
check("10. the approved resident signs in with a full session", lg.status_code == 200 and lg.json()["access_token"] and not lg.json().get("requires_otp"), lg.text)
check("    and can use resident features", client.get("/auth/me", headers={"Authorization": f"Bearer {lg.json()['access_token']}"}).status_code == 200)

# ------------------------------------------------------------------------------------------------ 11-12. reject, resubmit
check("11. a reason is required to reject", client.post(f"/resident-applications/{nb.application_id}/reject", json={"reason": ""}, headers=AH).status_code in (400, 422))
rj = client.post(f"/resident-applications/{nb.application_id}/reject", json={"reason": "No resident with this name at Block 99 Lot 99."}, headers=AH)
check("    an Admin rejects with a reason", rj.status_code == 200 and rj.json()["status"] == "REJECTED", rj.text)
nb = app_of(NOBODY)
check("    reviewer, time and reason are recorded", nb.reviewed_by == admin.user_id and nb.reviewed_at and "Block 99" in nb.rejection_reason)
check("    the applicant is e-mailed the reason", mail["rejected"] and mail["rejected"][-1][0] == NOBODY and "Block 99" in mail["rejected"][-1][1])
lg = login(NOBODY)
check("12. a rejected applicant has no session and sees the reason",
      lg.status_code == 403 and lg.json()["detail"]["code"] == "RESIDENCY_REJECTED" and "Block 99" in lg.json()["detail"]["reason"], lg.text)
check("    and is refused every resident feature", client.get("/auth/me", headers=H(db.get(User, nb.user_id))).status_code == 403)
bad = client.post("/resident-applications/resubmit", json={"email": NOBODY, "password": "Wrong!Passw0rd#9", "full_name": "Totally Unknown",
                                                           "block_number": "9", "lot_number": "9"})
check("    resubmitting needs the right password", bad.status_code == 401)
rsb = client.post("/resident-applications/resubmit", json={"email": NOBODY, "password": PW, "full_name": "Pedro Cruz", "block_number": "7",
                                                           "lot_number": "3", "contact_number": "0917 555 0101"})
check("    a rejected applicant corrects the details and asks for another review", rsb.status_code == 200 and rsb.json()["status"] == "PENDING_RESIDENCY_VERIFICATION", rsb.text)
db.expire_all()
check("    a resubmission notifies the Leader again", db.query(Notification).filter(Notification.type == "resident_application",
      Notification.related_id == nb.application_id, Notification.is_read == False, Notification.title.like("%resubmitted%")).count() == 1)  # noqa: E712
check("    on the same account: no duplicate", db.query(User).filter(User.email == NOBODY).count() == 1 and app_of(NOBODY).resubmit_count == 1)
check("    the corrected details now match the list", client.get(f"/resident-applications/{nb.application_id}", headers=LH).json()["match"]["result"] == "Match Found")
check("    a pending application cannot be resubmitted again", client.post("/resident-applications/resubmit", json={
    "email": NOBODY, "password": PW, "full_name": "X Y", "block_number": "1", "lot_number": "1"}).status_code == 409)

# ------------------------------------------------------------------------------------------------ 14. bulk accounts unaffected
link = mail["invite"][0][1]
done = client.post("/resident-activation/complete", json={"token": link.split("token=")[1], "password": PW, "confirm_password": PW})
check("14. a bulk-created account still activates from its invitation", done.status_code == 200, done.text)
lg = login(done.json()["email"])
check("    and signs in normally (no residency step)", lg.status_code == 200 and lg.json()["access_token"], lg.text)
check("    bulk-created accounts never appear as registrations", db.query(ResidentApplication).filter(ResidentApplication.email.like("%.list@example.com")).count() == 0)
check("    an existing resident still signs in untouched", db.get(User, resident.user_id).status == "Active")
counts = client.get("/resident-applications?status=all", headers=AH).json()["counts"]
check("    the Admin sees every subdivision's counts", counts["ACTIVE"] == 1 and counts["REJECTED"] == 0 and counts["PENDING_RESIDENCY_VERIFICATION"] == 2, counts)
check("    the official list is not exposed to applicants",
      client.get("/resident-records", headers=H(db.get(User, app_of(NEAR).user_id))).status_code == 403)

# ------------------------------------------------------------------------------------------------ deactivation blocks SIGN-IN
bulk_email = done.json()["email"]
brec = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == bulk_email).one()
d = client.post(f"/resident-records/{brec.record_id}/deactivate", headers=LH)
db.expire_all()
check("    deactivating an activated resident suspends the account", d.status_code == 200 and db.get(User, brec.user_id).status == "Suspended", d.text)
lg = login(bulk_email)
db.expire_all()
check("    a deactivated resident cannot sign in again (and is not re-activated by trying)",
      lg.status_code == 403 and db.get(User, brec.user_id).status == "Suspended", lg.text)
r2 = client.post(f"/resident-records/{brec.record_id}/reactivate", headers=LH)
check("    reactivating restores sign-in", r2.status_code == 200 and login(bulk_email).status_code == 200)
pend = db.query(OfficialResidentRecord).filter(OfficialResidentRecord.email == "pedro.list@example.com").one()
client.post(f"/resident-records/{pend.record_id}/deactivate", headers=LH)
client.post(f"/resident-records/{pend.record_id}/reactivate", headers=LH)
db.expire_all()
check("    a never-activated account goes back to locked (Inactive, unverified), not usable",
      db.get(User, pend.user_id).status == "Inactive" and not db.get(User, pend.user_id).is_verified)

print(f"\n{PASSED} checks passed.")
