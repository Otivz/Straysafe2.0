"""
Leader-verified identity, Phase 5C of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md: when the owner
did not answer a staff-confirmed pet match within 24 hours, or said it is not their pet, the Subdivision Leader handling
the report may confirm the identity with a method ("Photos and markings match") and a reason. The report is linked to
the pet, the owner is told and can dispute it, and it is in the audit log. Anyone else, or too early, is refused.
Run from the backend folder:  python tests/test_leader_verified_identity.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "leader_verified_identity_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-leader-verified-identity-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, owner_followups, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (reports.router, matches.router, owner_followups.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)

db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Olga Owner", 1, subdivision_id=1, barangay_id=1)
neighbour = mk_user("Nina Neighbour", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leo Leader", 2, subdivision_id=1, barangay_id=1)
other_leader = mk_user("Lia Other", 2, subdivision_id=1, barangay_id=1)
staff = mk_user("Ben Barangay", 3, barangay_id=1)
pets = [Pet(pet_name=f"Dog {i}", pet_type="Dog", owner_id=owner.user_id, status="Active") for i in range(6)]
db.add_all(pets)
db.flush()

now = datetime.now()


def mk_case(pet, owner_status="PENDING", status="CONFIRMED_MATCH", confirmed_ago=timedelta(hours=25), reporter=neighbour):
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", assigned_leader_id=leader.user_id)
    db.add(r)
    db.flush()
    m = ReportMatch(source_report_id=r.report_id, matched_pet_id=pet.pet_id, status=status, similarity_score=85,
                    owner_confirmation_status=owner_status, verified_at=now - confirmed_ago,
                    created_at=now - confirmed_ago)
    db.add(m)
    db.flush()
    return r, m


R_SILENT, M_SILENT = mk_case(pets[0])
R_EARLY, M_EARLY = mk_case(pets[1], confirmed_ago=timedelta(hours=2))
R_NO, M_NO = mk_case(pets[2], owner_status="OWNER_REJECTED", confirmed_ago=timedelta(minutes=5))
R_SUGG, M_SUGG = mk_case(pets[3], status="AI_SUGGESTED")
R_OWN, M_OWN = mk_case(pets[4], reporter=owner)
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
GOOD = {"method": "Photos and markings match", "reason": "Same white blaze on the chest and torn left ear as the record photos"}
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def verify(match, who=leader, body=GOOD):
    return client.post(f"/matches/{match.match_id}/leader-verify-identity", json=body, headers=H(who))


def fresh(model, pk):
    db.expire_all()
    return db.get(model, pk)


# ---- refusals ----
check("Barangay staff can't confirm the identity", verify(M_SILENT, staff).status_code == 403)
check("a resident can't", verify(M_SILENT, neighbour).status_code == 403)
check("a leader not handling the report can't", verify(M_SILENT, other_leader).status_code == 403)
check("refused without a method", verify(M_SILENT, body={"method": "", "reason": GOOD["reason"]}).status_code == 422)
check("refused with a method that doesn't count", verify(M_SILENT, body={"method": "Neighbour statement", "reason": GOOD["reason"]}).status_code == 422)
check("refused without a real reason", verify(M_SILENT, body={"method": GOOD["method"], "reason": "same"}).status_code == 422)
r = verify(M_EARLY)
check("refused before the owner had 24 hours to answer", r.status_code == 409 and "Give the owner until" in r.text, r.text[:200])
check("refused while the match is not confirmed by staff", verify(M_SUGG).status_code == 409)
check("not needed when the owner filed the report", verify(M_OWN).status_code == 400)
check("...nothing was linked by the refusals", all(fresh(Report, x.report_id).pet_id is None
                                                     for x in (R_SILENT, R_EARLY, R_SUGG, R_OWN)))

# ---- the owner did not answer within 24 hours ----
r = verify(M_SILENT)
check("the handling leader confirms after 24 hours without an answer", r.status_code == 200
      and r.json().get("owner_confirmation_status") == "LEADER_VERIFIED", r.text[:200])
check("...the report is linked to the pet", fresh(Report, R_SILENT.report_id).pet_id == pets[0].pet_id)
m = fresh(ReportMatch, M_SILENT.match_id)
check("...the method and reason are on the match", "Photos and markings match" in (m.verification_notes or "")
      and "white blaze" in (m.verification_notes or ""), m.verification_notes)
n = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.related_id == R_SILENT.report_id).all()
check("...the owner is told and can dispute it", any("dispute" in x.message for x in n), [x.message for x in n])
log = db.query(AuditLog).filter(AuditLog.action == "LEADER_VERIFY_PET_IDENTITY", AuditLog.target_id == M_SILENT.match_id).first()
check("...it is in the audit log", log is not None)
check("...a second confirmation is refused", verify(M_SILENT).status_code == 409)
r = client.post(f"/matches/{M_SILENT.match_id}/owner-feedback", json={"owner_confirmation": "OWNER_REJECTED"}, headers=H(owner))
check("...the owner can't undo it alone (told to file a dispute)", r.status_code == 409 and "dispute" in r.text, r.text[:200])
r = client.post("/owner-followups", json={"report_id": R_SILENT.report_id}, headers=H(leader))
check("...the leader can now start an owner follow-up on it", r.status_code == 201, r.text[:200])

# ---- the owner said no ----
r = verify(M_NO)
check("the owner said it is not their pet: the leader may confirm at once", r.status_code == 200, r.text[:200])
check("...linked", fresh(Report, R_NO.report_id).pet_id == pets[2].pet_id)
check("...the note says the owner had said no", "had said it is not their pet" in (fresh(ReportMatch, M_NO.match_id).verification_notes or ""))

print(f"\n{sum(results)}/{len(results)} leader-verified identity checks passed")
db.close()
sys.exit(0 if all(results) else 1)
