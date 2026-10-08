"""
B0: the existing report dispute endpoints require sign-in; the filer and the reviewer are always the signed-in account.
(Before: anyone could file in another resident's name, or accept a dispute and dismiss a report, without signing in.)
Run from the backend folder:  python tests/test_dispute_security.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "dispute_security_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-dispute-security-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_dispute import ReportDispute  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner, other, reporter = mk("Owner", 1), mk("Other Resident", 1), mk("Reporter", 1)
leader, leader2, far_leader = mk("Leader", 2), mk("Leader Two", 2), mk("Far Leader", 2, subd=2)
pet = Pet(pet_name="Kippy", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.flush()
rep = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
             animal_type="Dog", assigned_leader_id=leader.user_id, ai_suggested_risk_level="Low")
db.add(rep)
db.commit()
RID, PET = rep.report_id, pet.pet_id
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


form = {"dispute_reason": "This is my vaccinated pet, not a stray", "pet_id": str(PET), "resident_user_id": str(other.user_id)}

check("D1 filing a dispute without signing in is refused", client.post(f"/reports/{RID}/disputes", data=form).status_code == 401)
r = client.post(f"/reports/{RID}/disputes", data=form, headers=H(owner))
db.expire_all()
d = db.query(ReportDispute).first()
check("D1 the filer is the signed-in owner, not the resident_user_id sent in the form",
      r.status_code == 200 and d and d.resident_user_id == owner.user_id, (r.status_code, r.text[:200]))
DID = d.dispute_id
r = client.post(f"/reports/{RID}/disputes", data=form, headers=H(other))
check("D1 a resident can't file a dispute about someone else's pet", r.status_code == 403, r.text[:200])
check("D1 staff can't file as a resident", client.post(f"/reports/{RID}/disputes", data=form, headers=H(leader)).status_code == 403)

check("reading disputes requires sign-in", client.get(f"/reports/{RID}/disputes").status_code == 401)
check("the owner sees their dispute", len(client.get(f"/reports/{RID}/disputes", headers=H(owner)).json()) == 1)
check("another resident sees none of it", client.get(f"/reports/{RID}/disputes", headers=H(other)).json() == [])
check("staff outside the subdivision can't read them", client.get(f"/reports/{RID}/disputes", headers=H(far_leader)).status_code == 403)
body = client.get(f"/reports/{RID}", headers=H(other)).json()
check("the report detail doesn't show other residents' disputes", body.get("disputes") == [], body.get("disputes"))
body = client.get(f"/reports/{RID}", headers=H(leader)).json()
check("...staff still see them in the report detail", len(body.get("disputes") or []) == 1)

review = {"reviewer_id": leader.user_id, "status": "Accepted", "reviewer_notes": "checked"}
check("D2 reviewing without signing in is refused", client.patch(f"/reports/{RID}/disputes/{DID}/review", json=review).status_code == 401)
check("D2 a resident can't review (even sending a leader's reviewer_id)",
      client.patch(f"/reports/{RID}/disputes/{DID}/review", json=review, headers=H(owner)).status_code == 403)
r = client.patch(f"/reports/{RID}/disputes/{DID}/review", json=review, headers=H(leader2))
check("D2 another leader (not handling the case) can't decide it", r.status_code == 403, r.text[:200])
db.expire_all()
check("...and the report was NOT dismissed as a False Alarm", db.get(Report, RID).current_status_id != 14)
r = client.patch(f"/reports/{RID}/disputes/{DID}/review", json={"status": "Rejected", "reviewer_notes": "photos show a different dog"}, headers=H(leader))
db.expire_all()
d = db.get(ReportDispute, DID)
check("the handling leader can decide (no reviewer_id needed)", r.status_code == 200 and d.status == "Rejected" and d.reviewer_id == leader.user_id,
      (r.status_code, r.text[:200]))
r = client.patch(f"/reports/{RID}/disputes/{DID}/review", json={"status": "Accepted", "reviewer_notes": "changed mind"}, headers=H(leader))
check("a decided dispute can't be decided again", r.status_code == 409, r.text[:200])

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
