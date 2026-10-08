"""
Merged reports share their case's confirmed pet identity (MERGE_PET_CONFIRMATION_AUDIT.md, tests T1-T12).
Run from the backend folder:  python tests/test_merge_pet_identity.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "merge_pet_identity_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-merge-pet-identity-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_history import PetHistory  # noqa: E402
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


def mk_user(name, role):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, leader = mk_user("Res", 1), mk_user("Owner", 1), mk_user("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO = H(LEADER, 2), H(OWNER, 1)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def pet(name, owned=True):
    p = Pet(pet_name=name, pet_type="Dog", owner_id=OWNER if owned else None, status="Active")
    db.add(p)
    db.commit()
    return p.pet_id


def report():
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def suggest(rid, pid):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pid, similarity_score=90, status="AI_SUGGESTED")
    db.add(m)
    db.commit()
    return m.match_id


def confirm(mid, owner_too=True):
    r = client.post(f"/matches/{mid}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
    if owner_too:
        client.post(f"/matches/{mid}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
    return r


def merge(*ids):
    return client.post("/reports/merge-group", json={"report_ids": list(ids), "notes": "same dog, checked photos"}, headers=HL)


def unmerge(rid):
    return client.post(f"/reports/{rid}/unmerge", json={"reason": "different dog after all, separating"}, headers=HL)


def rep(rid):
    db.expire_all()
    return db.get(Report, rid)


def mrow(mid):
    db.expire_all()
    return db.get(ReportMatch, mid)


def owner_asks():
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == OWNER, Notification.title.like("%Please Confirm%")).count()


# --- T1-T3: Report 1 fully confirmed, Report 2 merged in -------------------------------------------------------
A = pet("Kippy")
R1, R2 = report(), report()
m1, m2 = suggest(R1, A), suggest(R2, A)
confirm(m1)
before = mrow(m1)
reviewer, verified_at = before.reviewed_by, before.verified_at
asks_before = owner_asks()
check("setup: Report 1 fully confirmed", rep(R1).pet_id == A and before.owner_confirmation_status == "OWNER_CONFIRMED")
check("merge works", merge(R1, R2).status_code == 200)
check("T1 Report 2 inherits the pet, pointing at the original confirmation",
      rep(R2).pet_id == A and rep(R2).pet_inherited_from_match_id == m1, (rep(R2).pet_id, rep(R2).pet_inherited_from_match_id))
check("T1 Report 2's own suggestion is COVERED (not marked as confirmed)",
      mrow(m2).status == "COVERED_BY_CASE" and mrow(m2).covered_by_match_id == m1 and mrow(m2).owner_confirmation_status == "PENDING",
      (mrow(m2).status, mrow(m2).owner_confirmation_status))
after = mrow(m1)
check("T1 the original confirmation is untouched (same reviewer and time)",
      after.status == "CONFIRMED_MATCH" and after.reviewed_by == reviewer and after.verified_at == verified_at)
check("T2 the owner is not asked again", owner_asks() == asks_before)
r = client.post(f"/matches/{m2}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "confirm again"}, headers=HL)
check("T2 a covered suggestion can't be decided again (409)", r.status_code == 409, r.text[:200])
r = client.post(f"/matches/{m2}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED"}, headers=HO)
check("T2 ...nor answered again by the owner (409)", r.status_code == 409)
rows = client.get(f"/matches/report/{R2}", headers=HL).json()
via = [x for x in rows if x.get("via_case_report_id") == R1]
check("T3 Report 2's page shows the confirmation made on Report 1", len(via) == 1 and via[0]["match_id"] == m1, rows)
check("T3 ...and no 'suggested' row for the same pet",
      not any(x["matched_pet_id"] == A and x["status"] in ("AI_SUGGESTED", "PENDING_VERIFICATION") for x in rows))
rows = client.get("/matches/", params={"report_id": R2}, headers=HL).json()
check("T3 the list endpoint used by the look-alike panel shows it too", any(x.get("via_case_report_id") == R1 for x in rows))
check("T12 the sighting appears in the pet's history",
      db.query(PetHistory).filter(PetHistory.pet_id == A, PetHistory.event_type == "SIGHTING_LINKED_VIA_CASE").count() == 1)

# --- T8: unmerge undoes only what was inherited ------------------------------------------------------------------
check("T8 unmerge works", unmerge(R2).status_code == 200)
check("T8 Report 2's inherited link is removed", rep(R2).pet_id is None and rep(R2).pet_inherited_from_match_id is None)
check("T8 its suggestion is back for a person to decide", mrow(m2).status == "AI_SUGGESTED" and mrow(m2).covered_by_match_id is None)
check("T8 Report 1 keeps its own confirmed pet", rep(R1).pet_id == A)

# --- T4: reverse (the duplicate holds the confirmation) ----------------------------------------------------------
B = pet("Bantay")
M1, D2 = report(), report()
mm, md = suggest(M1, B), suggest(D2, B)
confirm(md)
merge(M1, D2)
check("T4 the main case gets the pet", rep(M1).pet_id == B)
check("T4 the main case's own same-pet suggestion is covered", mrow(mm).status == "COVERED_BY_CASE" and mrow(mm).covered_by_match_id == md)

# --- T9: a report's own confirmation survives unmerge -----------------------------------------------------------
unmerge(D2)
check("T9 the separated report keeps its OWN confirmed pet", rep(D2).pet_id == B and rep(D2).pet_inherited_from_match_id is None)
check("T9 ...and the main case's suggestion is reopened", mrow(mm).status == "AI_SUGGESTED")

# --- T5: staff confirmed, owner still pending --------------------------------------------------------------------
C = pet("Choco")
P1, P2 = report(), report()
p1, p2 = suggest(P1, C), suggest(P2, C)
confirm(p1, owner_too=False)
merge(P1, P2)
check("T5 nothing is inherited while the owner hasn't answered", rep(P2).pet_id is None)
lock = next((x.get("identity_lock_reason") for x in client.get(f"/matches/report/{P2}", headers=HL).json() if x["match_id"] == p2), None)
check("T5 the duplicate's same-pet suggestion waits for the owner (locked)", lock and "waiting" in lock, lock)
asks = owner_asks()
r = client.post(f"/matches/{p2}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same dog"}, headers=HL)
check("T5 ...it can't be confirmed separately, so the owner isn't asked twice", r.status_code == 409 and owner_asks() == asks, r.text[:200])
client.post(f"/matches/{p1}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine"}, headers=HO)
check("T5 once the owner confirms, the duplicate inherits", rep(P2).pet_id == C and mrow(p2).status == "COVERED_BY_CASE")

# --- T6: other pets are untouched --------------------------------------------------------------------------------
D, E = pet("Dash"), pet("Eevee")
Q1, Q2 = report(), report()
q1, qe = suggest(Q1, D), suggest(Q2, E)
confirm(q1)
merge(Q1, Q2)
check("T6 a suggestion for another pet is not covered or confirmed", mrow(qe).status not in ("COVERED_BY_CASE", "CONFIRMED_MATCH"))
check("G5 ...it is closed as superseded by the case's confirmed pet (kept, not deleted)",
      mrow(qe).status == "SUPERSEDED_BY_CASE" and mrow(qe).covered_by_match_id == q1, mrow(qe).status)

r = unmerge(Q2)
check("G5 after unmerge the superseded suggestion is open again", r.status_code == 200 and mrow(qe).status == "AI_SUGGESTED"
      and mrow(qe).covered_by_match_id is None, (r.status_code, mrow(qe).status))

# --- T7: conflicting confirmed pets ------------------------------------------------------------------------------
F, G = pet("Fido", owned=False), pet("Ghost", owned=False)
X1, X2 = report(), report()
confirm(suggest(X1, F), owner_too=False)
confirm(suggest(X2, G), owner_too=False)
r = merge(X1, X2)
check("T7 two different confirmed pets: merge refused for staff review", r.status_code == 409 and "conflict" in r.text.lower(), r.text[:200])
check("T7 ...nothing changed", rep(X2).duplicate_of_report_id is None and rep(X2).pet_id == G)

# --- T10: reversing the case's confirmation undoes the inheritance ----------------------------------------------
H2 = pet("Hachi", owned=False)
Y1, Y2 = report(), report()
y1, y2 = suggest(Y1, H2), suggest(Y2, H2)
confirm(y1, owner_too=False)
merge(Y1, Y2)
check("setup T10: inherited", rep(Y2).pet_id == H2 and mrow(y2).status == "COVERED_BY_CASE")
r = client.post(f"/matches/{y1}/reverse", json={"notes": "wrong dog, the scar is on the other side"}, headers=HL)
check("T10 reversing the confirmation works", r.status_code == 200, r.text[:200])
check("T10 the inherited link is removed from Report 2", rep(Y2).pet_id is None and rep(Y2).pet_inherited_from_match_id is None)
check("T10 the covered suggestion is reopened", mrow(y2).status == "AI_SUGGESTED")

# --- T11: three reports ------------------------------------------------------------------------------------------
K = pet("Kobe", owned=False)
Z1, Z2, Z3 = report(), report(), report()
z1 = suggest(Z1, K)
confirm(z1, owner_too=False)
merge(Z1, Z2, Z3)
check("T11 every report of a 3-report case inherits from the same confirmation",
      all(rep(z).pet_id == K and rep(z).pet_inherited_from_match_id == z1 for z in (Z2, Z3)))

# --- Staff re-confirmed the pet on a duplicate (owner pending) before it was merged ------------------------------
N = pet("Nala")
N1, N2 = report(), report()
n1, n2 = suggest(N1, N), suggest(N2, N)
confirm(n1)
client.post(f"/matches/{n2}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same dog again"}, headers=HL)
reviewer_before = mrow(n2).reviewed_by
merge(N1, N2)
check("a redundant staff confirmation awaiting the owner is covered by the case (owner not asked again)",
      mrow(n2).status == "COVERED_BY_CASE" and mrow(n2).covered_by_match_id == n1 and mrow(n2).reviewed_by == reviewer_before)
r = client.post(f"/matches/{n2}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED"}, headers=HO)
check("...and the owner's answer isn't needed any more (409)", r.status_code == 409)

# --- Idempotent ----------------------------------------------------------------------------------------------------
from app.utils.case_groups import resync_case_pet_identity  # noqa: E402

out = resync_case_pet_identity(db, rep(Z1))
db.commit()
check("running the sync again changes nothing", out == {"inherited": [], "released": [], "covered": [], "reopened": [], "superseded": [],
                                                    "claims": {"merged": [], "reopened": []}}, out)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
