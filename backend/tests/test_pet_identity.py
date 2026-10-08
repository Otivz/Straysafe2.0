"""
One active animal case can have only one confirmed registered pet identity.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_pet_identity.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "pet_identity_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pet-identity-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(reports.router)
api.include_router(matches.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid, name in [(1, "Reported"), (2, "Verified"), (11, "Incident Resolved"), (18, "Merged - Duplicate")]:
    db.add(ReportStatus(status_id=sid, status_name=name))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


res = mk_user("Resident", 1, subdivision_id=1, barangay_id=1)
owner = mk_user("Owner", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def mk_pet(name, owned=True):
    p = Pet(pet_name=name, pet_type="Dog", status="Active", owner_id=owner.user_id if owned else None)
    db.add(p)
    db.commit()
    return p.pet_id


CLOCK = [datetime(2026, 10, 1, 8, 0)]


def mk(pet_id=None):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=leader.user_id, pet_id=pet_id, created_at=CLOCK[0])
    db.add(r)
    db.commit()
    return r.report_id


def suggest(src, tgt=None, pet=None):
    m = ReportMatch(source_report_id=src, matched_report_id=tgt, matched_pet_id=pet, similarity_score=88,
                    status="AI_SUGGESTED", ai_explanation="looks alike", ai_evidence={"k": 1})
    db.add(m)
    db.commit()
    return m.match_id


def decide(mid, decision="CONFIRMED_MATCH", notes="same patches and collar"):
    return client.post(f"/matches/{mid}/verify", json={"decision": decision, "notes": notes}, headers=H(leader))


def merge(*ids):
    return client.post("/reports/merge-group", json={"report_ids": list(ids), "notes": "same dog, checked photos"}, headers=H(leader))


def lock(rid, mid):
    rows = client.get(f"/matches/report/{rid}", headers=H(leader)).json() + \
        client.get(f"/matches/duplicates/report/{rid}", headers=H(leader)).json()
    return next((m.get("identity_lock_reason") for m in rows if m["match_id"] == mid), "missing")


def nm(pid):
    db.expire_all()
    return f"'{db.get(Pet, pid).display_name}'"


def get(rid):
    db.expire_all()
    return db.get(Report, rid)


# --- Look-alikes: confirming Pet A locks Pet B and C (owner still pending) ----------------------
PA, PB, PC = mk_pet("A"), mk_pet("B"), mk_pet("C")
R = mk()
ma, mb, mc = suggest(R, pet=PA), suggest(R, pet=PB), suggest(R, pet=PC)
check("nothing is locked before a decision", lock(R, mb) is None)
r = decide(ma)
check("leader confirms Pet A", r.status_code == 200, r.text[:300])
check("report not linked yet: owner hasn't confirmed", get(R).pet_id is None)
check("Pet B is shown as locked", lock(R, mb) and nm(PA) in lock(R, mb), lock(R, mb))
check("Pet C is shown as locked", lock(R, mc) and nm(PA) in lock(R, mc))
check("Pet A's own card is not locked", lock(R, ma) is None)
r = decide(mb)
check("the API refuses confirming Pet B", r.status_code == 409 and nm(PA) in r.text, r.text[:300])
db.expire_all()
check("...and Pet B's suggestion stays open", db.get(ReportMatch, mb).status == "AI_SUGGESTED")
r = decide(mc, "NOT_A_MATCH", notes="different markings")
check("rejecting another look-alike is still allowed", r.status_code == 200, r.text[:300])

# Owner rejects Pet A: the identity is released and Pet B can be confirmed
r = client.post(f"/matches/{ma}/owner-feedback", json={"owner_confirmation": "OWNER_REJECTED", "remarks": "not mine"}, headers=H(owner))
check("owner rejects Pet A", r.status_code == 200, r.text[:300])
check("Pet B unlocks after the owner rejection", lock(R, mb) is None)
check("Pet B can now be confirmed", decide(mb).status_code == 200)

# Community animal (no owner): staff confirmation links immediately and locks the rest
PD, PE = mk_pet("D", owned=False), mk_pet("E")
R2 = mk()
md, me = suggest(R2, pet=PD), suggest(R2, pet=PE)
decide(md)
check("community animal is linked on staff confirmation", get(R2).pet_id == PD)
check("another pet can't be confirmed afterwards", decide(me).status_code == 409)

# --- Duplicates: Report B joins Report A's case, A is Pet X ------------------------------------
PX, PY = mk_pet("X", owned=False), mk_pet("Y")
A, B = mk(), mk()
decide(suggest(A, pet=PX))
check("setup: Report A is confirmed as Pet X", get(A).pet_id == PX)
r = decide(suggest(B, A))
check("Report B is confirmed as a duplicate of A", r.status_code == 200 and get(B).duplicate_of_report_id == A, r.text[:300])
mby = suggest(B, pet=PY)
check("B's look-alike for Pet Y is locked", lock(B, mby) and nm(PX) in lock(B, mby), lock(B, mby))
r = decide(mby)
check("B can't be confirmed as Pet Y", r.status_code == 409 and nm(PX) in r.text, r.text[:300])
r = client.post(f"/reports/{B}/link-pet", params={"pet_id": PY}, headers=H(leader))
check("B can't be linked to Pet Y directly either", r.status_code == 409, r.text[:300])

# --- Two reports already confirmed as different pets: no automatic merge ------------------------
PM, PN = mk_pet("M", owned=False), mk_pet("N")
C, D = mk(), mk()
decide(suggest(C, pet=PM))
decide(suggest(D, pet=PN))  # staff-confirmed, owner pending
mcd = suggest(D, C)
check("duplicate suggestion between them is flagged as a pet identity conflict", lock(D, mcd) and "conflict" in lock(D, mcd), lock(D, mcd))
r = decide(mcd)
check("Matched is refused", r.status_code == 409 and "conflict" in r.text, r.text[:300])
r = merge(C, D)
check("Merge Duplicates is refused too", r.status_code == 409 and "conflict" in r.text, r.text[:300])
check("...nothing was merged", get(D).duplicate_of_report_id is None and get(C).duplicate_of_report_id is None)
p = client.get(f"/matches/{mcd}/case-preview", headers=H(leader)).json()
check("case preview shows the conflict", p.get("blocked_reason") and "conflict" in p["blocked_reason"], str(p)[:300])

# --- Reverse: the duplicate already has the pet, the main case doesn't -------------------------
PQ, PR = mk_pet("Q", owned=False), mk_pet("R")
MAIN, DUP = mk(), mk()
decide(suggest(DUP, pet=PQ))
check("setup: the later report is Pet Q", get(DUP).pet_id == PQ)
mmain = suggest(MAIN, pet=PR)
r = merge(MAIN, DUP)
check("merging them works", r.status_code == 200 and get(DUP).duplicate_of_report_id == MAIN, r.text[:300])
check("the consolidated case uses Pet Q", get(MAIN).pet_id == PQ)
db.expire_all()
_mm = db.get(ReportMatch, mmain)
check("the main report's look-alike for Pet R is closed: superseded by Pet Q, or locked",
      _mm.status == "SUPERSEDED_BY_CASE" or (lock(MAIN, mmain) and nm(PQ) in lock(MAIN, mmain)), _mm.status)
check("...and can't be confirmed", decide(mmain).status_code == 409)

# --- Unmerge: the main case drops a pet it only inherited from the separated duplicate ---------
r = client.post(f"/reports/{DUP}/unmerge", json={"reason": "different dog after checking photos"}, headers=H(leader))
check("unmerging the duplicate works", r.status_code == 200, r.text[:300])
check("the main report no longer carries Pet Q", get(MAIN).pet_id is None)
check("the separated duplicate keeps Pet Q", get(DUP).pet_id == PQ)
check("the main report's look-alike for Pet R unlocks", lock(MAIN, mmain) is None)

# A main case that has its own confirmation keeps the pet after an unmerge
PK = mk_pet("K", owned=False)
K1, K2 = mk(), mk(pet_id=PK)
decide(suggest(K1, pet=PK))
check("setup: both reports are Pet K", get(K1).pet_id == PK and merge(K1, K2).status_code == 200)
client.post(f"/reports/{K2}/unmerge", json={"reason": "separating for independent handling"}, headers=H(leader))
check("a main case with its own confirmed match keeps Pet K", get(K1).pet_id == PK)

# --- Direct linking can't skip the owner's confirmation ------------------------------------------
other_officer = mk_user("Officer Two", 2, subdivision_id=1, barangay_id=1)
db.commit()
owned = Pet(pet_name="Owned", pet_type="Dog", status="Active", owner_id=owner.user_id, registered_by_user_id=other_officer.user_id)
db.add(owned)
db.commit()
L = mk()
r = client.post(f"/reports/{L}/link-pet", params={"pet_id": owned.pet_id}, headers=H(leader))
check("a pet with an owner can't be linked directly", r.status_code == 409 and "look-alike" in r.text, r.text[:300])
fresh = Pet(pet_name="Fresh", pet_type="Dog", status="Active", owner_id=owner.user_id, registered_by_user_id=leader.user_id)
db.add(fresh)
db.commit()
r = client.post(f"/reports/{L}/link-pet", params={"pet_id": fresh.pet_id}, headers=H(leader))
check("a pet record the officer just created from the report can be linked", r.status_code == 200 and get(L).pet_id == fresh.pet_id, r.text[:300])
community = mk_pet("Community", owned=False)
L2 = mk()
check("a community animal can be linked directly", client.post(f"/reports/{L2}/link-pet", params={"pet_id": community}, headers=H(leader)).status_code == 200)

# --- The main case shares the pet linked through a duplicate; reports expose the case's pet -----
PG = mk_pet("G", owned=False)
G1, G2 = mk(), mk()
merge(G1, G2)
decide(suggest(G2, pet=PG))
check("linking the duplicate also links the main case", get(G2).pet_id == PG and get(G1).pet_id == PG)
PH = mk_pet("H")
H1 = mk()
decide(suggest(H1, pet=PH))  # owner pending: nothing linked yet
db.get(Report, H1).ai_suggested_risk_level = "Low"  # skip the live AI backfill on GET
db.commit()
body = client.get(f"/reports/{H1}", headers=H(leader)).json()
check("a staff-confirmed report exposes its case pet (hides Add Record)", body.get("pet_id") is None and body.get("case_pet_id") == PH, str({k: body.get(k) for k in ("pet_id", "case_pet_id")}))

# --- Owner disputes a staff "Not a Match" ----------------------------------------------------
def feedback(mid, answer="OWNER_CONFIRMED", remarks="that is my dog, it has a scar on the left ear"):
    return client.post(f"/matches/{mid}/owner-feedback", json={"owner_confirmation": answer, "remarks": remarks,
                                                               "second_review_reason": remarks}, headers=H(owner))


def mrow(mid):
    db.expire_all()
    return db.get(ReportMatch, mid)


PZ = mk_pet("Z")
Z = mk()
mz = suggest(Z, pet=PZ)
decide(mz, "NOT_A_MATCH", notes="different ear shape")
r = client.post(f"/matches/{mz}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Owner confirmed this sighting is their pet."}, headers=H(owner))
check("G4 a plain 'Yes' can't reopen a staff Not a Match without the owner's reason", r.status_code == 400 and mrow(mz).status == "NOT_A_MATCH", r.text[:200])
r = feedback(mz)
check("owner saying 'my pet' after Not a Match reopens it", r.status_code == 200 and mrow(mz).status == "PENDING_VERIFICATION", r.text[:300])
check("...nothing is linked yet", get(Z).pet_id is None)
check("...the dispute is counted once", mrow(mz).owner_dispute_count == 1)
check("...the leader is notified", db.query(Notification).filter(
    Notification.user_id == leader.user_id, Notification.title.like("%Owner Disputes%")).count() >= 1)
check("...and the reopened match can be confirmed", lock(Z, mz) is None)
r = decide(mz, "NOT_A_MATCH", notes="checked vet card, still a different dog")
check("leader rejects again", r.status_code == 200 and mrow(mz).status == "NOT_A_MATCH", r.text[:300])
r = feedback(mz)
check("a second dispute is refused and points to the formal dispute", r.status_code == 409 and "formal dispute" in r.text, r.text[:300])
check("...and the match stays Not a Match", mrow(mz).status == "NOT_A_MATCH")

# Owner had already confirmed before staff rejected it: same path
PW = mk_pet("W")
W = mk()
mw = suggest(W, pet=PW)
feedback(mw)
decide(mw, "NOT_A_MATCH", notes="different collar colour")
r = feedback(mw, remarks="please check again, here is the vaccination card")
check("owner who confirmed first can request a second review", r.status_code == 200 and mrow(mw).status == "PENDING_VERIFICATION", r.text[:300])
r = decide(mw)
check("leader confirms on re-review and the sighting is linked", r.status_code == 200 and get(W).pet_id == PW, r.text[:300])

# Owner's own rejection is not reopened this way
PV = mk_pet("V")
V = mk()
mv = suggest(V, pet=PV)
feedback(mv, "OWNER_REJECTED", remarks="not mine")
r = feedback(mv)
check("an owner who said 'not my pet' can't reopen it here", r.status_code == 409 and mrow(mv).status == "NOT_A_MATCH", r.text[:300])

# A dispute can't break the one-pet-per-case rule
PU, PT = mk_pet("U", owned=False), mk_pet("T")
U = mk()
mt = suggest(U, pet=PT)
decide(mt, "NOT_A_MATCH", notes="different markings")
decide(suggest(U, pet=PU))
r = client.post(f"/matches/{mt}/owner-feedback", json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "mine", "second_review_reason": "it has my collar on"}, headers=H(owner))
check("a dispute on a case already confirmed as another pet is refused", r.status_code == 409 and nm(PU) in r.text, r.text[:300])

# --- Reverse Decision ------------------------------------------------------------------------
def reverse(mid, notes="wrong pet, the collar and scar do not match"):
    return client.post(f"/matches/{mid}/reverse", json={"notes": notes}, headers=H(leader))


# Report #27-style mistake: duplicate linked to a community pet, main case inherited it
P27a, P27b = mk_pet("NoName", owned=False), mk_pet("Kippy2")
C9, C27 = mk(), mk()
merge(C9, C27)
m_wrong = suggest(C27, pet=P27a)
decide(m_wrong)
check("setup: the case is tied to the wrong pet", get(C27).pet_id == P27a and get(C9).pet_id == P27a)
check("reversing needs a real reason", reverse(m_wrong, notes="no").status_code == 400)
r = reverse(m_wrong)
check("reverse a confirmed match", r.status_code == 200 and mrow(m_wrong).status == "NOT_A_MATCH", r.text[:300])
check("...unlinks the report and the main case", get(C27).pet_id is None and get(C9).pet_id is None)
m_right = suggest(C27, pet=P27b)
check("...and the right pet can now be confirmed", lock(C27, m_right) is None and decide(m_right).status_code == 200)

# Reverse a staff Not a Match: reopened for review
PO = mk_pet("O")
O = mk()
mo = suggest(O, pet=PO)
decide(mo, "NOT_A_MATCH", notes="different ears")
r = reverse(mo, notes="looked again, ears were folded in the photo")
check("reverse a staff Not a Match reopens it", r.status_code == 200 and mrow(mo).status == "PENDING_VERIFICATION", r.text[:300])

# Not allowed: owner's own rejection, report pairs, closed cases
r = reverse(mv)
check("an owner's 'not my pet' can't be reversed by staff", r.status_code == 409, r.text[:300])
R1d, R2d = mk(), mk()
mdup = suggest(R2d, R1d)
decide(mdup)
check("duplicate decisions point to Unmerge", reverse(mdup).status_code == 400 and "Unmerge" in reverse(mdup).text)
PC2 = mk_pet("Closed", owned=False)
CL = mk()
mcl = suggest(CL, pet=PC2)
decide(mcl)
db.get(Report, CL).current_status_id = 11
db.commit()
r = reverse(mcl)
check("a closed case can't be reversed", r.status_code == 409 and "closed" in r.text, r.text[:300])
check("only the case handler can reverse", client.post(f"/matches/{mo}/reverse", json={"notes": "trying to reverse it"}, headers=H(other_officer)).status_code == 403)

# --- AI scans stop suggesting other pets once the case has an identity --------------------------
real_score = matches._score_candidates
matches._score_candidates = lambda report, cands, is_pet=False, db=None: {
    (c.pet_id if is_pet else c.report_id): {"score": 95, "explanation": "x", "evidence": {"k": 1}, "visual_comparison": {"final_assessment": "POTENTIAL MATCH"}}
    for c in cands
}
try:
    S = mk()
    decide(suggest(S, pet=mk_pet("S")))  # staff-confirmed, owner pending
    matches.scan_and_generate_matches_for_report(S, db)
finally:
    matches._score_candidates = real_score
db.expire_all()
new_pet_suggestions = db.query(ReportMatch).filter(ReportMatch.source_report_id == S, ReportMatch.matched_pet_id.isnot(None), ReportMatch.status == "AI_SUGGESTED").count()
check("a rescan adds no new pet look-alikes to a case with a confirmed pet", new_pet_suggestions == 0)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
