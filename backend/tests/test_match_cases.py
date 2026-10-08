"""
Matched / Not a Match on report-to-report suggestions work per case (the first-filed report plus its merged duplicates).
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_match_cases.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "match_cases_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-match-cases-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
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
for sid, name in [(1, "Reported"), (2, "Verified"), (11, "Incident Resolved"), (18, "Merged — Duplicate")]:
    db.add(ReportStatus(status_id=sid, status_name=name))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


res = mk_user("Resident", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
staff = mk_user("Brgy Staff", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


CLOCK = [datetime(2026, 10, 1, 8, 0)]


def mk(breed="Shih Tzu", pet_id=None, filed=None):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed=breed, assigned_leader_id=leader.user_id, pet_id=pet_id,
               created_at=filed or CLOCK[0])
    db.add(r)
    db.commit()
    return r.report_id


def suggest(src, tgt=None, pet=None):
    m = ReportMatch(source_report_id=src, matched_report_id=tgt, matched_pet_id=pet, similarity_score=88,
                    status="AI_SUGGESTED", ai_explanation="looks alike", ai_evidence={"k": 1})
    db.add(m)
    db.commit()
    return m.match_id


def merge(*ids):
    return client.post("/reports/merge-group", json={"report_ids": list(ids), "notes": "same dog, checked photos"}, headers=H(leader))


def preview(mid, who=leader):
    return client.get(f"/matches/{mid}/case-preview", headers=H(who))


def decide(mid, decision, notes="same patches and collar", who=leader):
    return client.post(f"/matches/{mid}/verify", json={"decision": decision, "notes": notes}, headers=H(who))


def get(rid):
    db.expire_all()
    return db.get(Report, rid)


def mstatus(mid):
    db.expire_all()
    return db.get(ReportMatch, mid).status


# --- The scenario: #1 and #2 are one case, then #3 comes in ------------------------------
R1, R2 = mk(), mk()
check("setup: Report #2 is merged into Report #1", merge(R1, R2).status_code == 200 and get(R2).duplicate_of_report_id == R1)
R3 = mk()
m32, m31 = suggest(R3, R2), suggest(R3, R1)

p = preview(m32)
check("preview: #3 vs #2 says #3 will join Case #1",
      p.status_code == 200 and p.json()["effect"] == "join_case" and p.json()["main_report_id"] == R1
      and f"Report #{R2} is already part of Case #{R1}" in p.json()["message"] and f"add Report #{R3} to Case #{R1}" in p.json()["message"],
      p.text[:300])
check("preview: nothing blocks it", p.json().get("blocked_reason") is None, p.text[:300])

r = decide(m32, "CONFIRMED_MATCH")
check("Matched on #3 vs #2 succeeds", r.status_code == 200, r.text[:300])
check("#3 now belongs to Case #1 (not to #2: no chains)", get(R3).duplicate_of_report_id == R1 and get(R3).current_status_id == 18)
check("Case #1 stays the open main case", get(R1).duplicate_of_report_id is None and get(R1).current_status_id == 2)
check("the decision keeps the leader's own notes", db.get(ReportMatch, m32).verification_notes == "same patches and collar")
check("the other open suggestion (#3 vs #1) is closed automatically as the same case",
      mstatus(m31) == "CONFIRMED_MATCH" and f"Case #{R1}" in (db.get(ReportMatch, m31).verification_notes or ""))
check("Case #1's history lists #3 as a linked duplicate",
      db.query(StatusHistory).filter(StatusHistory.report_id == R1, StatusHistory.remarks.like(f"Linked duplicate Report #{R3}%")).count() == 1)

# Already in the same case: only the decision is recorded
m21 = suggest(R2, R1)
p = preview(m21)
check("preview: two reports already in one case says so", p.json()["effect"] == "already_same_case", p.text[:300])
before = db.query(StatusHistory).filter(StatusHistory.remarks.like("Linked duplicate%")).count()
r = decide(m21, "CONFIRMED_MATCH")
check("...confirming it works and merges nothing again",
      r.status_code == 200 and db.query(StatusHistory).filter(StatusHistory.remarks.like("Linked duplicate%")).count() == before, r.text[:300])
r = decide(suggest(R3, R2), "NOT_A_MATCH", notes="actually different")
check("Not a Match on two reports already merged is refused (unmerge first)", r.status_code == 409 and "Unmerge" in r.text, r.text[:300])

# --- The first-filed report stays main, whichever side the AI put it on ----------------------
OLD, NEW = mk(filed=datetime(2026, 9, 1, 7, 0)), mk()
r = decide(suggest(NEW, OLD), "CONFIRMED_MATCH")
check("Matched with the newer report as the source: the older one stays main",
      r.status_code == 200 and get(NEW).duplicate_of_report_id == OLD and get(OLD).duplicate_of_report_id is None, r.text[:300])

# --- Two existing cases combine into the oldest one ------------------------------------------
X1, X2 = mk(filed=datetime(2026, 8, 1, 7, 0)), mk()
Y1, Y2 = mk(filed=datetime(2026, 8, 2, 7, 0)), mk()
merge(X1, X2)
merge(Y1, Y2)
mxy = suggest(Y2, X2)
p = preview(mxy)
check("preview: matching two cases says they will combine into the oldest",
      p.json()["effect"] == "combine_cases" and p.json()["main_report_id"] == X1 and sorted(p.json()["report_ids"]) == sorted([X1, X2, Y1, Y2]),
      p.text[:300])
r = decide(mxy, "CONFIRMED_MATCH")
check("...and confirming combines them, all under the oldest report",
      r.status_code == 200 and all(get(x).duplicate_of_report_id == X1 for x in (X2, Y1, Y2)), r.text[:300])

# --- Refused merges change nothing -----------------------------------------------------------
A, B = mk(), mk(breed="Aspin")
mab = suggest(B, A)
p = preview(mab)
check("preview: a different breed is shown as blocked", p.json()["blocked_reason"] and "breed" in p.json()["blocked_reason"], p.text[:300])
r = decide(mab, "CONFIRMED_MATCH")
check("...and Matched is refused", r.status_code == 400, r.text[:300])
check("...nothing was merged and the suggestion is still open", get(B).duplicate_of_report_id is None and mstatus(mab) == "AI_SUGGESTED")
r = decide(suggest(mk(), mk()), "CONFIRMED_MATCH", notes="same")
check("Matched needs a real reason (same rule as merging)", r.status_code == 400, r.text[:300])

# --- Not a Match covers the whole case -------------------------------------------------------
P1, P2 = mk(), mk()
merge(P1, P2)
Q = mk()
mq2, mq1 = suggest(Q, P2), suggest(Q, P1)
r = decide(mq2, "NOT_A_MATCH", notes="different ear shape")
check("Not a Match on #Q vs #P2 succeeds", r.status_code == 200 and mstatus(mq2) == "NOT_A_MATCH", r.text[:300])
check("...and also closes #Q vs #P1 (same case)", mstatus(mq1) == "NOT_A_MATCH" and f"Match #{mq2}" in db.get(ReportMatch, mq1).verification_notes)
check("...without merging anything", get(Q).duplicate_of_report_id is None)

# The AI does not suggest #Q against Case #P1 again
real_score = matches._score_candidates
matches._score_candidates = lambda report, cands, is_pet=False, db=None: {
    (c.pet_id if is_pet else c.report_id): {"score": 95, "explanation": "x", "evidence": {"k": 1}, "visual_comparison": {"final_assessment": "POTENTIAL MATCH"}}
    for c in cands
}
try:
    matches.scan_and_generate_matches_for_report(Q, db)
finally:
    matches._score_candidates = real_score
db.expire_all()
again = db.query(ReportMatch).filter(
    ReportMatch.status == "AI_SUGGESTED",
    ((ReportMatch.source_report_id == Q) & (ReportMatch.matched_report_id.in_([P1, P2])))
    | ((ReportMatch.matched_report_id == Q) & (ReportMatch.source_report_id.in_([P1, P2])))
).count()
check("a rescan does not suggest #Q against Case #P1 again", again == 0)

# --- Registered-pet conflicts ----------------------------------------------------------------
C1, C2 = mk(pet_id=501), mk()
merge(C1, C2)
r = decide(suggest(C2, pet=502), "CONFIRMED_MATCH", notes="looks like this pet")
check("a case linked to Pet #501 can't be confirmed as Pet #502 (no pet id shown)", r.status_code == 409 and "already confirmed" in r.text and "Pet #" not in r.text, r.text[:300])
D1, D2 = mk(pet_id=601), mk(pet_id=602)
r = decide(suggest(D2, D1), "CONFIRMED_MATCH")
check("two reports linked to different pets can't be matched", r.status_code == 409 and get(D2).duplicate_of_report_id is None, r.text[:300])

# --- Permissions -------------------------------------------------------------------------------
E1, E2 = mk(), mk()
me = suggest(E2, E1)
check("Barangay staff can't preview a case the Subdivision Leader is handling", preview(me, who=staff).status_code == 403)
check("...or confirm it", decide(me, "CONFIRMED_MATCH", who=staff).status_code == 403 and get(E2).duplicate_of_report_id is None)
check("previewing requires signing in", client.get(f"/matches/{me}/case-preview").status_code == 401)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
