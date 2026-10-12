"""
Open suggestions of a closed or impounded case don't belong in the potential-match lists:
- an impounded animal is in the facility: it isn't suggested for new sightings, and its old suggestions leave the queue
- a resolved / closed case's open suggestions leave the lists, including the report pages
- confirming or answering them is refused with that reason (instead of a confusing error)
Run from the backend folder:  python tests/test_closed_case_suggestions.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "closed_case_suggestions_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-closed-case-suggestions-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (matches.router, reports.router):
    api.include_router(r)
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
matches._score_candidates = lambda report, cands, is_pet=False, db=None: {
    (c.pet_id if is_pet else c.report_id): {"score": 92, "explanation": "looks alike", "evidence": {"key_evidence_bullets": ["x"]},
                                            "visual_comparison": {"final_assessment": "POTENTIAL MATCH"}}
    for c in cands
}


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(status=2, custody=None, pet_id=None):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=status,
               custody_status=custody, pet_id=pet_id, animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER,
               created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def suggest(rid, pid=None, other=None):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pid, matched_report_id=other, similarity_score=90, status="AI_SUGGESTED")
    db.add(m)
    db.commit()
    return m.match_id


def queue_ids():
    return {x["match_id"] for x in client.get("/matches/", headers=HL).json()}


def report_rows(rid):
    return {x["match_id"]: x for x in client.get(f"/matches/report/{rid}", headers=HL).json()}


def pet(name, owner_id=None):
    p = Pet(pet_name=name, pet_type="Dog", owner_id=owner_id, status="Active", breed="Aspin", photo_url="https://cdn.example/p.jpg")
    db.add(p)
    db.commit()
    return p.pet_id


boyet = pet("Boyet", OWNER)
stray = pet("No Name")  # the animal record of an impounded report (still "Active": pets have no Impounded status)
R_IMP = report(status=11, custody="Impounded", pet_id=stray)
R_NEW = report()
m_imp_pet = suggest(R_NEW, stray)       # a new sighting suggested as the impounded animal
m_imp_src = suggest(R_IMP, boyet)       # the impounded report's own open suggestion
R_DONE = report(status=11, custody="Reunited")
m_done = suggest(R_DONE, boyet)         # an open suggestion left on a resolved case (like match #30 on Report #28)
R_OPEN = report()
m_open = suggest(R_OPEN, boyet)         # a normal open suggestion
d_imp = suggest(R_NEW, other=R_IMP)     # duplicate pair with the impounded report

q = queue_ids()
check("the impounded animal isn't in the potential-match queue as a new sighting", m_imp_pet not in q)
check("the impounded report's own open suggestion leaves the queue", m_imp_src not in q)
check("an open suggestion on a resolved case leaves the queue", m_done not in q)
check("a normal open suggestion is still listed", m_open in q, q)
dq = {x["match_id"] for x in client.get("/matches/duplicates", headers=HL).json()}
check("a duplicate pair with an impounded report leaves the duplicates queue", d_imp not in dq, dq)

check("it's not on the new report's page either", m_imp_pet not in report_rows(R_NEW))
check("...nor on the impounded report's page", m_imp_src not in report_rows(R_IMP))
check("...nor on the resolved case's page", m_done not in report_rows(R_DONE))

r = client.post(f"/matches/{m_imp_pet}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "looks like it"}, headers=HL)
check("confirming the impounded animal as a new sighting is refused, with the reason", r.status_code == 409 and "impounded" in r.text, r.text[:200])
r = client.post(f"/matches/{m_done}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "looks like it"}, headers=HL)
check("confirming a suggestion of a closed case is refused, with the reason", r.status_code == 409 and "already closed" in r.text, r.text[:200])
r = client.post(f"/matches/{m_done}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
check("the owner can't answer it either", r.status_code == 409, r.text[:200])
check("the owner doesn't see it on their side", m_done not in {x["match_id"] for x in client.get(f"/matches/report/{R_DONE}", headers=HO).json()})
r = client.post(f"/matches/{m_open}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
check("a normal open suggestion can still be confirmed", r.status_code == 200, r.text[:200])

# The scan never suggests an impounded animal
R_SCAN = report()
s = SessionLocal()
matches.scan_and_generate_matches_for_report(R_SCAN, s)
s.close()
db.expire_all()
suggested = {m.matched_pet_id for m in db.query(ReportMatch).filter(ReportMatch.source_report_id == R_SCAN, ReportMatch.matched_pet_id.isnot(None)).all()}
check("a new scan doesn't suggest the impounded animal", stray not in suggested, suggested)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
