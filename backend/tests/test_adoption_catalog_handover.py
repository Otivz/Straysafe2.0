"""
ADO-T0: catalog visibility of reserved animals + monitoring/success require a finalized two-way handover.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_adoption_catalog_handover.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "adoption_catalog_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-catalog-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, HoldingTimeline, Report  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="Brgy One", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


res_a = mk_user("Resident A", 1, subdivision_id=1, barangay_id=1)
res_b = mk_user("Resident B", 1, subdivision_id=1, barangay_id=1)
head = mk_user("Head", 3, barangay_id=1, is_head_officer=True)
db.commit()
TOK = {u.user_id: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}
       for u in (res_a, res_b, head)}


def mk_animal(name):
    rep = Report(user_id=res_a.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    a = HoldingAnimal(report_id=rep.report_id, animal_name=name, animal_type="Dog", facility_status=6)
    db.add(a)
    db.flush()
    return a


def mk_adoption(animal, applicant, status, stage, **kw):
    ad = Adoption(holding_id=animal.holding_id, applicant_id=applicant.user_id, status=status, full_name=applicant.name,
                  address="a", contact_no="0900", reason="r" * 25, current_stage=stage, **kw)
    db.add(ad)
    db.flush()
    return ad


results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


free = mk_animal("Free")
pending_only = mk_animal("PendingOnly")
reserved = mk_animal("Reserved")
mk_adoption(pending_only, res_a, "Pending", "Application")
reserved_app = mk_adoption(reserved, res_a, "Approved", "Certificate")
db.commit()

ids = lambda r: {a["holding_id"] for a in r.json()}  # noqa: E731
r = client.get("/adoptions/catalog")
check("public catalog lists a free animal", free.holding_id in ids(r), r.text[:200])
check("public catalog keeps an animal that only has PENDING applications", pending_only.holding_id in ids(r))
check("public catalog HIDES an animal with an APPROVED application", reserved.holding_id not in ids(r))
r = client.get("/adoptions/catalog", params={"include_reserved": True})
row = next((a for a in r.json() if a["holding_id"] == reserved.holding_id), None)
check("staff view (include_reserved) still lists it, flagged is_reserved", row is not None and row["is_reserved"] is True, row)
check("free animal is_reserved = false", next(a for a in r.json() if a["holding_id"] == free.holding_id)["is_reserved"] is False)

check("catalog detail of a reserved animal -> 404 (apply form shows 'no longer available')",
      client.get(f"/adoptions/catalog/{reserved.holding_id}").status_code == 404)
check("catalog detail of a free animal -> 200", client.get(f"/adoptions/catalog/{free.holding_id}").status_code == 200)

body = {"holding_id": reserved.holding_id, "full_name": "Resident B", "address": "x", "contact_no": "0900",
        "reason": "I would love to adopt this dog and care for it.", "living_space": "House with yard"}
r = client.post("/adoptions/apply", json=body, headers=TOK[res_b.user_id])
check("another resident cannot apply for the reserved animal", r.status_code == 400, f"{r.status_code} {r.text[:160]}")

# Approval cancelled -> animal returns to the public catalog automatically
reserved_app.status = "Cancelled"
db.commit()
check("cancelled approval -> animal visible again", reserved.holding_id in ids(client.get("/adoptions/catalog")))

# ── Handover gates ───────────────────────────────────────────────────────────
H = TOK[head.user_id]
cases = {
    "no handover": dict(staff_handed_over=False, is_handed_over=False),
    "staff only (adopter never confirmed)": dict(staff_handed_over=True, is_handed_over=False),
}
for label, flags in cases.items():
    ad = mk_adoption(mk_animal("H"), res_a, "Approved", "Handover", **flags)
    db.commit()
    r = client.post(f"/adoptions/{ad.adoption_id}/monitoring/proceed", headers=H)
    check(f"monitoring/proceed blocked when {label} (409)", r.status_code == 409, f"{r.status_code} {r.text[:160]}")
    ad.current_stage = "Monitoring"
    db.commit()
    r = client.post(f"/adoptions/{ad.adoption_id}/successful/proceed", headers=H)
    check(f"successful/proceed blocked when {label} (409)", r.status_code == 409, f"{r.status_code} {r.text[:160]}")
    db.expire_all()
    check(f"stage unchanged after refused success ({label})", db.get(Adoption, ad.adoption_id).current_stage == "Monitoring")

ok = mk_adoption(mk_animal("Done"), res_a, "Approved", "Handover", staff_handed_over=True, is_handed_over=True)
db.commit()
r = client.post(f"/adoptions/{ok.adoption_id}/monitoring/proceed", headers=H)
check("monitoring/proceed allowed after two-way handover", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
r = client.post(f"/adoptions/{ok.adoption_id}/successful/proceed", headers=H)
check("successful/proceed allowed after two-way handover", r.status_code == 200, f"{r.status_code} {r.text[:160]}")

# ── Whereabouts: the animal leaves the holding facility when the adopter takes it ──
from decimal import Decimal  # noqa: E402
from app.models.report import Report as _Report  # noqa: E402
def mk_in_facility():
    animal = mk_animal("InCage")
    animal.kennel_slot = "Cage 7"
    rep = db.get(_Report, animal.report_id)
    rep.facility_id = None
    rep.initial_latitude, rep.initial_longitude, rep.initial_landmark = Decimal("14.8"), Decimal("121.0"), "Selera Homes"
    rep.latitude, rep.longitude, rep.landmark = Decimal("14.9"), Decimal("121.1"), "Barangay Impound Facility"
    rep.custody_status = "In Barangay Facility"
    ad = mk_adoption(animal, res_a, "Approved", "Handover", staff_handed_over=False, is_handed_over=False)
    db.commit()
    return animal.holding_id, rep.report_id, ad.adoption_id

hid, rid, aid = mk_in_facility()
r = client.post(f"/adoptions/{aid}/staff-confirm-handover", json={}, headers=H)
db.expire_all()
an, rp = db.get(HoldingAnimal, hid), db.get(_Report, rid)
check("staff hands the animal over -> request succeeds", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
check("animal no longer in a kennel / facility (status 7, slot cleared)", an.kennel_slot is None and an.facility_status == 7 and an.discharge_date is not None,
      (an.kennel_slot, an.facility_status))
check("report location restored from the holding facility to the original sighting",
      rp.landmark == "Selera Homes" and float(rp.latitude) == 14.8 and rp.facility_id is None, (rp.landmark, rp.latitude, rp.facility_id))
check("custody shows it is with the adopter (awaiting confirmation)", "Adopter" in (rp.custody_status or ""), rp.custody_status)
check("holding timeline records the release", any("Released from holding facility" in (t.title or "") for t in db.query(HoldingTimeline).filter_by(holding_id=hid)))
check("two-way handover is still NOT final until the adopter confirms", db.get(Adoption, aid).is_handed_over is False)

# ── Catalog shows the pet record's photo first ───────────────────────────────
from app.models.pet import Pet as _Pet  # noqa: E402
from app.models.report import ReportMedia as _Media  # noqa: E402
pa = mk_animal("WithRecord")
rp = db.get(_Report, pa.report_id)
db.add(_Media(report_id=rp.report_id, file_url="https://res.cloudinary.com/demo/image/upload/report_sighting.jpg", media_type="Image"))
rec = _Pet(owner_id=None, pet_name="WithRecord", pet_type="Dog", photo_url="https://res.cloudinary.com/demo/image/upload/pet_record_main.jpg",
           photo_front_url="https://res.cloudinary.com/demo/image/upload/pet_record_front.jpg", status="Active")
db.add(rec)
db.flush()
rp.pet_id = rec.pet_id
db.commit()
row = next(a for a in client.get("/adoptions/catalog").json() if a["holding_id"] == pa.holding_id)
check("catalog card photo = the Pet Record's photo (not the original sighting)", row["photos"][0].endswith("pet_record_main.jpg"), row["photos"])
check("pet record's other photos follow, then the report photo", row["photos"][1].endswith("pet_record_front.jpg") and row["photos"][-1].endswith("report_sighting.jpg"), row["photos"])
detail = client.get(f"/adoptions/catalog/{pa.holding_id}").json()
check("detail page uses the pet record photo too", detail["photos"][0].endswith("pet_record_main.jpg"), detail["photos"])
plain = next(a for a in client.get("/adoptions/catalog").json() if a["holding_id"] == free.holding_id)
check("an animal with no pet record still works (no photos is fine)", isinstance(plain["photos"], list))

passed = sum(results)
print(f"\n{passed}/{len(results)} catalog/handover checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
