"""
B2-B4: the owner flags a sighting wrongly merged into their pet's confirmed case; staff uphold or reverse it.
Run from the backend folder:  python tests/test_identity_dispute.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "identity_dispute_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-identity-dispute-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.report_dispute import ReportDispute  # noqa: E402
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
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, other, leader, leader2 = mk("Res", 1), mk("Owner", 1), mk("Other", 1), mk("Leader", 2), mk("Leader Two", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO, HX, HL2 = H(LEADER, 2), H(OWNER, 1), H(other.user_id, 1), H(leader2.user_id, 2)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report():
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def get(rid):
    db.expire_all()
    return db.get(Report, rid)


def notes_for(uid, like):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == uid, Notification.title.like(like)).count()


def setup_case():
    pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
    db.add(pet)
    db.commit()
    r1, r15 = report(), report()
    m = ReportMatch(source_report_id=r1, matched_pet_id=pet.pet_id, similarity_score=95, status="AI_SUGGESTED")
    db.add(m)
    db.commit()
    client.post(f"/matches/{m.match_id}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
    client.post(f"/matches/{m.match_id}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
    client.post("/reports/merge-group", json={"report_ids": [r1, r15], "notes": "same dog, checked photos"}, headers=HL)
    return pet.pet_id, r1, r15, m.match_id


PET, R1, R15, M1 = setup_case()
check("setup: Report #15 merged and inherited Boyet", get(R15).duplicate_of_report_id == R1 and get(R15).pet_id == PET)
check("the owner is told about the new verified sighting (no confirmation asked)", notes_for(OWNER, "%New Verified Sighting%") == 1)

# --- B2: owner flags it --------------------------------------------------------------------------------------------
flag = {"reason": "Boyet has a black spot on the left ear, this dog doesn't"}
check("flagging needs sign-in", client.post(f"/reports/{R15}/identity-dispute", json=flag).status_code == 401)
check("D8 only the pet's owner can flag it", client.post(f"/reports/{R15}/identity-dispute", json=flag, headers=HX).status_code == 403)
check("a reason is required", client.post(f"/reports/{R15}/identity-dispute", json={"reason": "no"}, headers=HO).status_code == 400)
check("the original report itself can't be flagged here", client.post(f"/reports/{R1}/identity-dispute", json=flag, headers=HO).status_code == 400)
r = client.post(f"/reports/{R15}/identity-dispute", json=flag, headers=HO)
DID = r.json().get("dispute_id")
db.expire_all()
d = db.get(ReportDispute, DID) if DID else None
check("D6 the owner flags it: Pending wrong_identity dispute", r.status_code == 200 and d and d.status == "Pending" and d.dispute_type == "wrong_identity"
      and d.merged_into_report_id == R1 and d.contested_pet_id == PET, r.text[:200])
check("D6 the report stays merged and keeps its status (no automatic unmerge)", get(R15).duplicate_of_report_id == R1 and get(R15).current_status_id == 18)
check("D6 the original confirmation is untouched", db.get(ReportMatch, M1).status == "CONFIRMED_MATCH")
check("D6 the handling leader is notified once", notes_for(LEADER, "%Identity Disputed%") == 1)
r = client.post(f"/reports/{R15}/identity-dispute", json=flag, headers=HO)
check("D7 flagging again returns the same open dispute (no duplicate)", r.json().get("dispute_id") == DID and r.json().get("already_open") is True
      and db.query(ReportDispute).filter(ReportDispute.report_id == R15).count() == 1)
check("re-checking is refused while it's disputed", client.post(f"/reports/{R15}/recheck-identity", json={"note": "same scar seen in person"}, headers=HL).status_code == 409)
rows = client.get(f"/matches/report/{R15}", headers=HL).json()
check("the look-alike panel marks the case identity as disputed", any(x.get("via_case_report_id") == R1 and x.get("case_identity_disputed") for x in rows))

# --- B4: evidence for staff ------------------------------------------------------------------------------------------
info = client.get(f"/reports/{R15}", headers=HL).json().get("identity_dispute") or {}
check("B4 staff see the owner's reason, the original report and confirmation, and the merge reason",
      info.get("reason") == flag["reason"] and info.get("original_report_id") == R1 and info.get("original_confirmation", {}).get("match_id") == M1
      and info.get("original_confirmation", {}).get("owner_confirmed") is True and info.get("merge", {}).get("notes"), info)

# --- B3: decisions -------------------------------------------------------------------------------------------------------
dec = {"decision": "reverse", "reason": "different ear markings, confirmed in person"}
check("D12 the old false-report review can't decide it",
      client.patch(f"/reports/{R15}/disputes/{DID}/review", json={"status": "Accepted"}, headers=HL).status_code == 400)
check("D12 a decision needs a reason", client.post(f"/reports/{R15}/identity-dispute/{DID}/decide", json={"decision": "reverse", "reason": "no"}, headers=HL).status_code == 400)
check("D12 only the case handler (or Admin) decides", client.post(f"/reports/{R15}/identity-dispute/{DID}/decide", json=dec, headers=HL2).status_code == 403)
check("D12 a resident can't decide", client.post(f"/reports/{R15}/identity-dispute/{DID}/decide", json=dec, headers=HO).status_code == 403)
r = client.post(f"/reports/{R15}/identity-dispute/{DID}/decide", json=dec, headers=HL)
db.expire_all()
check("D10 reverse: dispute Reversed and the report is unmerged", r.status_code == 200 and db.get(ReportDispute, DID).status == "Reversed"
      and get(R15).duplicate_of_report_id is None, r.text[:300])
check("D10 the inherited Boyet identity is removed", get(R15).pet_id is None and get(R15).pet_inherited_from_match_id is None)
check("D10 Report #1 keeps Boyet and its confirmation", get(R1).pet_id == PET and db.get(ReportMatch, M1).status == "CONFIRMED_MATCH")
db.expire_all()
msg = db.query(Notification).filter(Notification.user_id == OWNER, Notification.title.like("%Incorrect Sighting Removed%")).first()
check("D10 the owner gets the exact outcome message", msg and "has been removed from Boyet's case following verification. Boyet's original confirmed identity remains unchanged. No further action is required." in msg.message,
      msg.message if msg else None)
check("D14 deciding again is refused (one outcome, one notification)",
      client.post(f"/reports/{R15}/identity-dispute/{DID}/decide", json=dec, headers=HL).status_code == 409
      and notes_for(OWNER, "%Incorrect Sighting Removed%") == 1)
db.expire_all()
check("D15 history and audit are kept", db.query(StatusHistory).filter(StatusHistory.report_id == R15, StatusHistory.remarks.like("Identity Disputed%")).count() == 1
      and db.query(AuditLog).filter(AuditLog.action.in_(["DISPUTE_WRONG_IDENTITY_FILED", "DISPUTE_WRONG_IDENTITY_UNMERGED"])).count() == 2)

# --- Upheld --------------------------------------------------------------------------------------------------------------
PET2, Q1, Q15, _ = setup_case()
r = client.post(f"/reports/{Q15}/identity-dispute", json=flag, headers=HO)
D2 = r.json()["dispute_id"]
asks_before = notes_for(OWNER, "%Please Confirm%")
r = client.post(f"/reports/{Q15}/identity-dispute/{D2}/decide",
                json={"decision": "uphold", "reason": "same scar and red collar, seen in person by me"}, headers=HL)
db.expire_all()
check("D9 uphold: dispute Upheld, report stays in the case with its identity", r.status_code == 200 and db.get(ReportDispute, D2).status == "Upheld"
      and get(Q15).duplicate_of_report_id == Q1 and get(Q15).pet_id == PET2, r.text[:200])
check("D9 the owner is told the outcome, and NOT asked to confirm again",
      notes_for(OWNER, "%Sighting Review%") == 1 and notes_for(OWNER, "%Please Confirm%") == asks_before)
check("D9 the owner's disagreement is kept", db.get(ReportDispute, D2).dispute_reason == flag["reason"])

# --- D13: the old false-report dispute still dismisses as before ----------------------------------------------------------
R9 = report()
db.add(ReportDispute(report_id=R9, resident_user_id=OWNER, dispute_reason="my pet, vaccinated", status="Pending"))
db.commit()
D9 = db.query(ReportDispute).filter(ReportDispute.report_id == R9).first().dispute_id
r = client.patch(f"/reports/{R9}/disputes/{D9}/review", json={"status": "Accepted", "reviewer_notes": "vaccination verified"}, headers=HL)
check("D13 a false-report dispute still dismisses the report as before", r.status_code == 200 and get(R9).current_status_id == 14, r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
