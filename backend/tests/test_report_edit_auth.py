"""
Report editing + media authorization (resident self-edit while 'Reported'; staff within scope; no anonymous access).
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_report_edit_auth.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "report_edit_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-report-edit-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Report, ReportMedia, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
for sid, name in [(1, "Reported"), (2, "Verified")]:
    db.add(ReportStatus(status_id=sid, status_name=name))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Owner", 1, subdivision_id=1, barangay_id=1)
other = mk_user("Other Resident", 1, subdivision_id=1, barangay_id=1)
staff1 = mk_user("Staff One", 3, barangay_id=1)
staff2 = mk_user("Staff Two", 3, barangay_id=2)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731


def mk_report(status=1):
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=status,
               animal_type="Dog", landmark="Gate")
    db.add(r)
    db.flush()
    m = ReportMedia(report_id=r.report_id, file_url="https://example.com/a.jpg", media_type="Image")
    db.add(m)
    db.commit()
    return r.report_id, m.media_id


results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


R, M = mk_report()
edit = {"landmark": "Near the chapel", "animal_breed": "Aspin", "status_id": 2, "user_id": other.user_id, "subdivision_id": 2, "pet_id": 99}
r = client.patch(f"/reports/{R}", json=edit, headers=H(owner))
db.expire_all()
rep = db.get(Report, R)
check("reporter can edit their own 'Reported' report (was 403)", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
check("descriptive fields updated", rep.landmark == "Near the chapel" and rep.animal_breed == "Aspin")
check("resident CANNOT change status / owner / subdivision / pet", rep.current_status_id == 1 and rep.user_id == owner.user_id
      and rep.subdivision_id == 1 and rep.pet_id is None, (rep.current_status_id, rep.user_id, rep.subdivision_id, rep.pet_id))
check("another resident cannot edit it", client.patch(f"/reports/{R}", json={"landmark": "x"}, headers=H(other)).status_code == 403)
check("anonymous cannot edit", client.patch(f"/reports/{R}", json={"landmark": "x"}).status_code == 401)
V, VM = mk_report(status=2)
check("reporter cannot edit once it is being handled (409)", client.patch(f"/reports/{V}", json={"landmark": "x"}, headers=H(owner)).status_code == 409)
r = client.patch(f"/reports/{V}", json={"status_id": 1}, headers=H(staff1))
check("staff of the barangay can still update status", r.status_code == 200 and db.get(Report, V).current_status_id is not None, r.text[:160])
check("staff of another barangay cannot", client.patch(f"/reports/{V}", json={"landmark": "x"}, headers=H(staff2)).status_code == 403)

# Media delete (previously unauthenticated)
check("anonymous media delete -> 401 (was allowed)", client.delete(f"/reports/media/{M}").status_code == 401)
check("other resident cannot delete my photo", client.delete(f"/reports/media/{M}", headers=H(other)).status_code == 403)
check("other-barangay staff cannot delete", client.delete(f"/reports/media/{M}", headers=H(staff2)).status_code == 403)
check("reporter can remove a photo while editing", client.delete(f"/reports/media/{M}", headers=H(owner)).status_code == 200)
W, WM = mk_report(status=2)
check("reporter cannot remove photos once handled (409)", client.delete(f"/reports/media/{WM}", headers=H(owner)).status_code == 409)

# Media upload (previously unauthenticated)
form = {"file_url": "https://res.cloudinary.com/demo/image/upload/b.jpg", "media_type": "Image"}
check("anonymous upload -> 401", client.post(f"/reports/{R}/media", data=form).status_code == 401)
check("other resident cannot upload to my report", client.post(f"/reports/{R}/media", data=form, headers=H(other)).status_code == 403)
r = client.post(f"/reports/{R}/media", data=form, headers=H(owner))
check("reporter is authorized to upload to their report (only URL validation remains)", r.status_code not in (401, 403), f"{r.status_code} {r.text[:160]}")
r = client.post(f"/reports/{V}/media", data=form, headers=H(staff1))
check("barangay staff are authorized to upload evidence", r.status_code not in (401, 403), f"{r.status_code} {r.text[:160]}")
check("other-barangay staff cannot upload", client.post(f"/reports/{V}/media", data=form, headers=H(staff2)).status_code == 403)

from app.models.pet import Pet  # noqa: E402
pet = Pet(owner_id=owner.user_id, pet_name="Bantay", pet_type="Dog")
db.add(pet)
db.commit()
L, _ = mk_report()
check("anonymous link-pet -> 401 (was allowed)", client.post(f"/reports/{L}/link-pet?pet_id={pet.pet_id}").status_code == 401)
check("resident cannot link a pet to a report", client.post(f"/reports/{L}/link-pet?pet_id={pet.pet_id}", headers=H(owner)).status_code == 403)
check("other-barangay staff cannot link", client.post(f"/reports/{L}/link-pet?pet_id={pet.pet_id}", headers=H(staff2)).status_code == 403)
r = client.post(f"/reports/{L}/link-pet?pet_id={pet.pet_id}", headers=H(staff1))
check("barangay staff can link (Add Record flow)", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

# ── Community animals registered by Barangay staff are visible to the Subdivision Leaders concerned ──
from app.routes import pets as pets_routes  # noqa: E402
api.include_router(pets_routes.router)
leader1 = mk_user("Leader One", 2, subdivision_id=1, barangay_id=1)
leader2 = mk_user("Leader Two", 2, subdivision_id=2, barangay_id=2)
db.commit()
ownerless = Pet(owner_id=None, pet_name="Community Dog", pet_type="Dog", registered_by_user_id=staff1.user_id, status="Active")
other_brgy_pet = Pet(owner_id=None, pet_name="Elsewhere Dog", pet_type="Dog", registered_by_user_id=staff2.user_id, status="Active")
db.add_all([ownerless, other_brgy_pet])
db.commit()
names = lambda u: {p["pet_name"] for p in client.get("/pets/", headers=H(u)).json()}  # noqa: E731
check("Barangay staff see the community animal they registered", "Community Dog" in names(staff1))
check("Subdivision Leader of the same barangay sees it in Pet Records (was missing)", "Community Dog" in names(leader1), names(leader1))
check("Leader of another barangay does NOT see it", "Community Dog" not in names(leader2), names(leader2))
check("Leader does not see another barangay's community animal", "Elsewhere Dog" not in names(leader1), names(leader1))
check("Leader can open it", client.get(f"/pets/{ownerless.pet_id}", headers=H(leader1)).status_code == 200)
check("...but cannot edit a record they did not register",
      client.put(f"/pets/{ownerless.pet_id}", json={"pet_name": "Hacked"}, headers=H(leader1)).status_code == 403)

passed = sum(results)
print(f"\n{passed}/{len(results)} report edit/media checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
