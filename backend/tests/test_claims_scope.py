"""
Who sees which pet claims:
- Barangay staff: only claims on cases escalated to the Barangay (now or before, e.g. resolved after a rescue), in their barangay
- Subdivision Leaders: their subdivision's claims. Residents: their own pets' claims. Admin: all
- the list and the single claim both need a sign-in
Run from the backend folder:  python tests/test_claims_scope.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "claims_scope_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claims-scope-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(claims.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subd=None, brgy=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subd, barangay_id=brgy)
    db.add(u)
    db.flush()
    return u


owner, other_owner = mk("Owner", 1, subd=1), mk("Other", 1, subd=1)
leader1, leader2 = mk("Leader1", 2, subd=1), mk("Leader2", 2, subd=2)
brgy, far_brgy, admin = mk("Brgy", 3), mk("FarBrgy", 3, brgy=2), mk("Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def claim_on(status, subd=1, pet_owner=owner, history_status=None):
    r = Report(user_id=other_owner.user_id, subdivision_id=subd, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", ai_suggested_risk_level="Low")
    db.add(r)
    db.flush()
    if history_status:
        db.add(StatusHistory(report_id=r.report_id, report_status_id=history_status, remarks="escalated earlier"))
    p = Pet(pet_name=f"P{r.report_id}", pet_type="Dog", owner_id=pet_owner.user_id, status="Active")
    db.add(p)
    db.flush()
    c = PetClaim(report_id=r.report_id, pet_id=p.pet_id, status="Pending Review")
    db.add(c)
    db.commit()
    return c.claim_id


C_LOCAL = claim_on(2)                       # handled by the subdivision only
C_ESC = claim_on(4)                         # escalated to the Barangay now
C_DONE_AFTER_ESC = claim_on(11, history_status=4)   # resolved, but it went through the Barangay
C_OTHER_SUBD_ESC = claim_on(5, subd=2, pet_owner=other_owner)  # escalated, other subdivision of the same barangay
C_FAR = claim_on(4, subd=3, pet_owner=other_owner)  # escalated, in another barangay


def seen(u, q=""):
    r = client.get(f"/claims/{q}", headers=H(u))
    return {c["claim_id"] for c in r.json()} if r.status_code == 200 else r.status_code


check("the claims list needs a sign-in", client.get("/claims/").status_code == 401)
check("a single claim needs a sign-in", client.get(f"/claims/{C_LOCAL}").status_code == 401)
b = seen(brgy)
check("Barangay staff see claims on escalated cases (now or before) in their barangay",
      b == {C_ESC, C_DONE_AFTER_ESC, C_OTHER_SUBD_ESC}, b)
check("...not a claim on a case the subdivision handled alone", C_LOCAL not in b)
check("...not one in another barangay", C_FAR not in b and seen(far_brgy) == {C_FAR}, seen(far_brgy))
check("Barangay staff can't open a non-escalated claim directly", client.get(f"/claims/{C_LOCAL}", headers=H(brgy)).status_code == 404)
check("...but can open an escalated one", client.get(f"/claims/{C_ESC}", headers=H(brgy)).status_code == 200)
check("a Subdivision Leader sees claims on their subdivision's reports, escalated or not, plus claims by their residents",
      seen(leader1) == {C_LOCAL, C_ESC, C_DONE_AFTER_ESC, C_OTHER_SUBD_ESC, C_FAR}, seen(leader1))  # other_owner lives in S1
check("...not another subdivision's", seen(leader2) == {C_OTHER_SUBD_ESC}, seen(leader2))
check("a resident sees only their own pets' claims", seen(owner) == {C_LOCAL, C_ESC, C_DONE_AFTER_ESC}, seen(owner))
check("...even when asking for someone else's", seen(owner, f"?owner_id={other_owner.user_id}") == set(), seen(owner, f"?owner_id={other_owner.user_id}"))
check("an Admin sees all", seen(admin) == {C_LOCAL, C_ESC, C_DONE_AFTER_ESC, C_OTHER_SUBD_ESC, C_FAR}, seen(admin))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
