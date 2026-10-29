"""
B4 (STRAYSAFE_PERFORMANCE_AUDIT.md): GET /sidebar/badges gives the sidebars the same numbers as the lists they used
to download: the pending claims GET /claims/ shows that user. Staff only. (The adoption count was removed with
the adoption feature.)
Run from the backend folder:  python tests/test_sidebar_badges.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "sidebar_badges_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-sidebar-badges-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims, sidebar  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (claims.router, sidebar.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk("Olive Owner", 1, subdivision_id=1, barangay_id=1)
leader = mk("Leo Leader", 2, subdivision_id=1, barangay_id=1)
head = mk("Hana Head", 3, barangay_id=1, is_head_officer=True)
tanod = mk("Tito Tanod", 3, barangay_id=1)
far_head = mk("Faye FarHead", 3, barangay_id=2, is_head_officer=True)
admin = mk("Ada Admin", 4)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(status=13, subd=1):
    r = Report(user_id=owner.user_id, subdivision_id=subd, category_id=1, latitude=1, longitude=1, current_status_id=status, animal_type="Dog")
    db.add(r)
    db.flush()
    return r


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.flush()
statuses = ["Pending Review", "Evidence Requested", "Potential Owner Match", "Approved", "Rejected", "Merged"]
for st in statuses:
    db.add(PetClaim(pet_id=pet.pet_id, report_id=report().report_id, status=st))
db.commit()
PENDING = {"Pending Review", "Evidence Requested", "Potential Owner Match"}


def old_way(u):
    claims_ = sorted(c["claim_id"] for c in client.get("/claims/", headers=H(u)).json() if c["status"] in PENDING)
    return claims_


for u in (leader, head, tanod, far_head, admin):
    r = client.get("/sidebar/badges", headers=H(u))
    b = r.json()
    oc = old_way(u)
    check(f"{u.name}: same pending claims as the list, and no adoption count",
          r.status_code == 200 and sorted(b["pending_claim_ids"]) == oc and "pending_adoptions" not in b,
          (b, oc))

b = client.get("/sidebar/badges", headers=H(admin)).json()
check("only the three waiting claim statuses are counted (not Approved / Rejected / Merged)", len(b["pending_claim_ids"]) == 3, b)
check("residents are refused", client.get("/sidebar/badges", headers=H(owner)).status_code == 403)
check("sign-in required", client.get("/sidebar/badges").status_code == 401)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
