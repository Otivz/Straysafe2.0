"""
Phase 1: a new report of a pet already confirmed in an ACTIVE case doesn't ask the owner again; staff are pointed to
the case, and confirming the pet outside it is refused (merge instead). Resolved cases start a new incident.
Run from the backend folder:  python tests/test_active_case_requests.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "active_case_requests_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-active-case-requests-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
api.include_router(matches.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, leader = mk("Res", 1), mk("Owner", 1), mk("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO = H(LEADER, 2), H(OWNER, 1)
results = []
CLOCK = [datetime(2026, 10, 1)]

# The scan uses the real code path; only the image/AI scoring is fixed so the test is deterministic
matches._score_candidates = lambda report, cands, is_pet=False, db=None: {
    (c.pet_id if is_pet else c.report_id): {"score": 92, "explanation": "looks alike", "evidence": {"key_evidence_bullets": ["x"]},
                                            "visual_comparison": {"final_assessment": "POTENTIAL MATCH"}}
    for c in cands
}


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(lat=14.8):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=lat, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def scan(rid):
    s = SessionLocal()
    try:
        matches.scan_and_generate_matches_for_report(rid, s)
    finally:
        s.close()


def asks(rid):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == OWNER, Notification.related_id == rid,
                                         Notification.title.like("%Look-Alike%")).count()


def pet_match(rid, pid):
    db.expire_all()
    return db.query(ReportMatch).filter(ReportMatch.source_report_id == rid, ReportMatch.matched_pet_id == pid).first()


def lock(rid, mid):
    rows = client.get(f"/matches/report/{rid}", headers=HL).json()
    return next((x.get("identity_lock_reason") for x in rows if x["match_id"] == mid), None)


boyet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active", breed="Aspin", photo_url="https://cdn.example/pet.jpg")
db.add(boyet)
db.commit()
B = boyet.pet_id

# First report: normal flow, the owner is asked once
R1 = report()
scan(R1)
check("Scenario 1: the first report asks the owner (normal flow)", asks(R1) == 1)
m1 = pet_match(R1, B).match_id
client.post(f"/matches/{m1}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
client.post(f"/matches/{m1}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)

# T1: a new report of Boyet while Case #R1 is active
R20 = report()
scan(R20)
m20 = pet_match(R20, B)
check("T1 the suggestion is still created (staff can see it)", m20 is not None and m20.status == "AI_SUGGESTED")
check("T1 the owner is NOT asked again", asks(R20) == 0)
db.expire_all()
pair = db.query(ReportMatch).filter(ReportMatch.source_report_id == R20, ReportMatch.matched_report_id == R1).first()
check("T1 a 'same animal as Case #1' duplicate suggestion exists for a one-step merge", pair is not None and pair.status == "AI_SUGGESTED")
check("T1 the case's leader is told", db.query(Notification).filter(Notification.user_id == LEADER, Notification.related_id == R20,
                                                                      Notification.title.like("%Possible New Sighting%")).count() == 1)
lk = lock(R20, m20.match_id)
check("T1 the look-alike shows 'already confirmed in active Case #N, merge'", lk and f"Case #{R1}" in lk and "merge" in lk, lk)

# T2: confirming outside the case is refused
r = client.post(f"/matches/{m20.match_id}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same dog"}, headers=HL)
check("T2 confirming Boyet on the new report is refused (409, merge into the case)", r.status_code == 409 and "merge" in r.text, r.text[:200])
check("T2 ...and still no owner request", asks(R20) == 0 and db.query(Notification).filter(
    Notification.user_id == OWNER, Notification.title.like("%Please Confirm%"), Notification.related_id == R20).count() == 0)

# T3/T4: merging applies the identity and notifies, never asks
r = client.post(f"/matches/{pair.match_id}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same dog, checked photos"}, headers=HL)
db.expire_all()
check("T3 staff confirm the duplicate: Report #20 joins Case #1 and inherits Boyet",
      r.status_code == 200 and db.get(Report, R20).duplicate_of_report_id == R1 and db.get(Report, R20).pet_id == B, r.text[:200])
check("T3 the owner gets one 'new verified sighting' notice and no confirmation request",
      db.query(Notification).filter(Notification.user_id == OWNER, Notification.related_id == R20, Notification.title.like("%New Sighting%")).count() == 1
      and asks(R20) == 0)
scan(R20)
check("T4 a rescan of a merged report sends nothing more", asks(R20) == 0)

# Owner still pending on the active case
choco = Pet(pet_name="Choco", pet_type="Dog", owner_id=OWNER, status="Active", breed="Aspin", photo_url="https://cdn.example/pet.jpg")
db.add(choco)
db.commit()
C = choco.pet_id
P1 = report(lat=14.9)
db.add(ReportMatch(source_report_id=P1, matched_pet_id=C, similarity_score=95, status="AI_SUGGESTED"))
db.commit()
pm = pet_match(P1, C).match_id
client.post(f"/matches/{pm}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same patches"}, headers=HL)
P2 = report(lat=14.9)
scan(P2)
check("T15 owner still pending on the active case: a new report doesn't ask again", asks(P2) == 0)
lk = lock(P2, pet_match(P2, C).match_id)
check("T15 ...and its suggestion waits for the owner's answer on that case", lk and "waiting for the owner" in lk, lk)

# T9: Lost pet -> unverified notice, no confirmation request
kobe = Pet(pet_name="Kobe", pet_type="Dog", owner_id=OWNER, status="Lost", breed="Aspin", photo_url="https://cdn.example/pet.jpg")
db.add(kobe)
db.commit()
K = kobe.pet_id
K1 = report(lat=15.0)
db.add(ReportMatch(source_report_id=K1, matched_pet_id=K, similarity_score=95, status="AI_SUGGESTED"))
db.commit()
km = pet_match(K1, K).match_id
client.post(f"/matches/{km}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same tag"}, headers=HL)
client.post(f"/matches/{km}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED"}, headers=HO)
K2 = report(lat=15.0)
scan(K2)
db.expire_all()
check("T9 a Lost pet's owner is told about the possible sighting, marked unverified",
      db.query(Notification).filter(Notification.user_id == OWNER, Notification.related_id == K2, Notification.title.like("%Possible New Sighting%"),
                                    Notification.message.like("%not yet verified%")).count() == 1)
check("T9 ...but not asked to confirm", asks(K2) == 0)

# T10: the case is resolved -> a new report is a new incident (normal flow)
db.query(Report).filter(Report.report_id == R1).update({"current_status_id": 11})
db.commit()
R30 = report()
scan(R30)
check("T10 after the case is resolved, a new report follows the normal flow (owner asked once)", asks(R30) == 1)
check("T10 ...and its suggestion is not locked", lock(R30, pet_match(R30, B).match_id) is None)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
