"""
D6: reading reports requires sign-in, and a registered pet owner's phone / email / home address / QR token are only
shown to staff and to that owner. Other residents still see the report and the owner's name.
Run from the backend folder:  python tests/test_report_privacy.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "report_privacy_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-report-privacy-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_qr import PetQRCode  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
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
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", phone="09171234567", address="12 Private St.", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Pet Owner", 1, subdivision_id=1, barangay_id=1)
neighbour = mk_user("Neighbour", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
pet = Pet(pet_name="Kippy", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.flush()
db.add(PetQRCode(pet_id=pet.pet_id, qr_token="secret-qr-token-123456", qr_image_url="https://cdn.example/qr.png", is_active=True))
rep = Report(user_id=neighbour.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
             animal_type="Dog", pet_id=pet.pet_id, ai_suggested_risk_level="Low")
db.add(rep)
db.commit()
RID, OWNER_ID = rep.report_id, owner.user_id
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def contact(body):
    return {k: body.get(k) for k in ("owner_phone", "owner_email", "owner_address", "pet_qr_token")}


check("report list requires sign-in", client.get("/reports/").status_code == 401)
check("a single report requires sign-in", client.get(f"/reports/{RID}").status_code == 401)

body = client.get(f"/reports/{RID}", headers=H(neighbour)).json()
check("another resident sees the report and the owner's name", body.get("report_id") == RID and body.get("owner_name") == "Pet Owner", body.get("owner_name"))
check("...but not the owner's phone, email, home address or QR token", all(v is None for v in contact(body).values()), contact(body))
lst = client.get("/reports/", headers=H(neighbour)).json()
row = next(r for r in lst if r["report_id"] == RID)
check("same in the report list", all(v is None for v in contact(row).values()), contact(row))

body = client.get(f"/reports/{RID}", headers=H(owner)).json()
check("the pet's owner sees their own contact details", body.get("owner_phone") == "09171234567" and body.get("owner_address") == "12 Private St.", contact(body))
body = client.get(f"/reports/{RID}", headers=H(leader)).json()
check("staff see the owner's contact for the handover", body.get("owner_phone") == "09171234567" and body.get("pet_qr_token"), contact(body))
row = next(r for r in client.get("/reports/", headers=H(leader)).json() if r["report_id"] == RID)
check("...in the list too", row.get("owner_email") == "pet.owner@test-mail.com", contact(row))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
