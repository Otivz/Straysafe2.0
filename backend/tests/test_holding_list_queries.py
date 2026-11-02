"""
Holding list performance: the adoption-eligibility evidence is computed in one batch (same answers as the per-animal
owner_handover_evidence()), and GET /holding/ uses a constant number of queries however many animals there are.
Run from the backend folder:  python tests/test_holding_list_queries.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "holding_list_queries_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-holding-queries-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import HoldingAnimal, Report, ReportReturn, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import holding  # noqa: E402
from app.utils.adoption_eligibility import owner_handover_evidence, owner_handover_evidence_map  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(holding.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
owner = User(name="Owner", email="owner@test-mail.com", password="x", role_id=1, subdivision_id=1, barangay_id=1, status="Active", is_verified=True)
staff = User(name="Staff", email="staff@test-mail.com", password="x", role_id=3, barangay_id=1, status="Active", is_verified=True)
db.add_all([owner, staff])
db.commit()
H = {"Authorization": "Bearer " + create_access_token({"sub": str(staff.user_id), "user_id": staff.user_id, "role_id": 3})}
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def animal(status=2, custody="In Barangay Facility", duplicate_of=None, with_pet=True):
    pet_id = None
    if with_pet:
        p = Pet(owner_id=owner.user_id, pet_name="P", pet_type="Dog", status="Active", photo_url="https://img.test/p.jpg")
        db.add(p)
        db.flush()
        pet_id = p.pet_id
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=4, latitude=1, longitude=1, current_status_id=8,
               custody_status=custody, duplicate_of_report_id=duplicate_of, pet_id=pet_id)
    db.add(r)
    db.flush()
    h = HoldingAnimal(report_id=r.report_id, animal_type="Dog", facility_status=status, intake_date=datetime.now())
    db.add(h)
    db.flush()
    return h, r


# Every kind of evidence, and none
plain, _ = animal()
claimed, _ = animal(status=3)
by_holding, _ = animal()
db.add(ReportReturn(report_id=by_holding.report_id, holding_id=by_holding.holding_id, has_account=True, owner_name="Owner",
                    relationship_to_animal="Owner"))
root_h, root_r = animal()
merged_h, merged_r = animal(duplicate_of=root_r.report_id)
db.add(ReportReturn(report_id=root_r.report_id, has_account=True, owner_name="Owner", relationship_to_animal="Owner"))
claim_h, claim_r = animal()
db.add(PetClaim(report_id=claim_r.report_id, pet_id=claim_r.pet_id, status="Handover Complete"))
pending_h, pending_r = animal()
db.add(PetClaim(report_id=pending_r.report_id, pet_id=pending_r.pet_id, status="Approved"))   # not a handover
custody_h, _ = animal(custody="Reunited with Owner")
nopet_h, _ = animal(with_pet=False)
db.commit()

all_animals = db.query(HoldingAnimal).all()
batch = owner_handover_evidence_map(db, all_animals)
single = {a.holding_id: owner_handover_evidence(db, a) for a in all_animals}
check("batch: same eligible / returned answer as the per-animal check for every animal",
      {k: v is None for k, v in batch.items()} == {k: v is None for k, v in single.items()}, (batch, single))
check("batch: not returned -> eligible (plain, approved-only claim, no pet)",
      batch[plain.holding_id] is None and batch[pending_h.holding_id] is None and batch[nopet_h.holding_id] is None)
check("batch: Claimed by Owner holding status", "Claimed by Owner" in (batch[claimed.holding_id] or ""))
check("batch: owner return on the holding record", "owner return" in (batch[by_holding.holding_id] or ""))
check("batch: owner return on the merged case's main report covers the merged report's animal",
      "owner return" in (batch[merged_h.holding_id] or "") and "owner return" in (batch[root_h.holding_id] or ""))
check("batch: completed claim", "Handover Complete" in (batch[claim_h.holding_id] or ""))
check("batch: returned custody", "Reunited with Owner" in (batch[custody_h.holding_id] or ""))
check("batch: same reason text as the per-animal check", batch == single, {k: (batch[k], single[k]) for k in batch if batch[k] != single[k]})

# The list endpoint: same fields, constant queries
count = [0]
event.listen(engine, "before_cursor_execute", lambda *a, **k: count.__setitem__(0, count[0] + 1))
r = client.get("/holding/", headers=H)
first = count[0]
rows = {x["holding_id"]: x for x in r.json()} if r.status_code == 200 else {}
check("list: adoption eligibility per animal as before", r.status_code == 200
      and rows[claim_h.holding_id]["adoption_eligible"] is False and rows[plain.holding_id]["adoption_eligible"] is True
      and rows[merged_h.holding_id]["adoption_eligible"] is False, r.text[:200])
check("list: the pet photo is still filled from the pet record", rows[plain.holding_id].get("pet_photo_url") == "https://img.test/p.jpg")
for _ in range(15):
    animal()
db.commit()
count[0] = 0
r = client.get("/holding/", headers=H)
check("list: the query count doesn't grow with the number of animals", r.status_code == 200 and len(r.json()) == len(rows) + 15
      and count[0] <= first, (first, count[0]))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
