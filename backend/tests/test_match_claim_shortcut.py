"""
Shortcut from a confirmed pet match to its pet claim: staff see the case's claim id and status on the match once the
owner has filed the claim with proof; before that, and for residents, there is none. A claim filed on the case's
first report is found from a merged report's match.
Run from the backend folder:  python tests/test_match_claim_shortcut.py
"""
import os
import sys
from datetime import datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-match-claim-shortcut-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
SessionLocal = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)
api = FastAPI()

def isolated_db():
    with SessionLocal() as session:
        yield session

api.dependency_overrides[get_db] = isolated_db
api.include_router(matches.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for uid, name, role in [(20, "Reporter", 1), (21, "Owner", 1), (23, "Leader", 2)]:
    db.add(User(user_id=uid, name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
                status="Active", subdivision_id=1, barangay_id=1))
db.commit()
H = lambda uid, role=1: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
LEADER, OWNER = H(23, 2), H(21, 1)
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


earlier = datetime.now() - timedelta(days=2)
db.add(Report(report_id=1, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=earlier))
db.add(Pet(pet_id=5, pet_name="Boyet", pet_type="Dog", owner_id=21, status="Active", created_at=earlier))
db.flush()
db.add(ReportMatch(match_id=1, source_report_id=1, matched_pet_id=5, status="CONFIRMED_MATCH",
                   owner_confirmation_status="OWNER_CONFIRMED", similarity_score=88))
db.commit()


def staff_match(report_id=1):
    r = client.get(f"/matches/report/{report_id}", headers=LEADER)
    return r, next((m for m in (r.json() if r.status_code == 200 else []) if m["matched_pet_id"] == 5), None)


r, m = staff_match()
check("the confirmed match is listed for the leader", r.status_code == 200 and m is not None, r.text[:200])
check("no claim yet: no shortcut", m and m.get("claim_id") is None, m)

claim = PetClaim(report_id=1, pet_id=5, status="Potential Owner Match", created_at=earlier)
db.add(claim)
db.commit()
r, m = staff_match()
check("a claim the owner has not filed yet: still no shortcut", m and m.get("claim_id") is None, m)

claim.status = "Pending Review"
claim.vaccine_card_url = "https://res.cloudinary.com/demo/image/upload/v1/card.jpg"
db.commit()
r, m = staff_match()
check("the owner filed the claim with proof: the leader gets its id and status",
      m and m.get("claim_id") == claim.claim_id and m.get("claim_status") == "Pending Review", m)

r = client.get("/matches/report/1", headers=OWNER)
own = next((x for x in (r.json() if r.status_code == 200 else []) if x["matched_pet_id"] == 5), None)
check("the resident's view carries no claim shortcut", own is None or own.get("claim_id") is None, own)

# a later report merged into the case, confirmed as the same pet: the case's claim (on the first report) is found
db.add(Report(report_id=2, user_id=20, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
              animal_type="Dog", created_at=earlier + timedelta(hours=3), duplicate_of_report_id=1))
db.flush()
db.add(ReportMatch(match_id=2, source_report_id=2, matched_pet_id=5, status="CONFIRMED_MATCH",
                   owner_confirmation_status="OWNER_CONFIRMED", similarity_score=80))
db.commit()
r, m = staff_match(2)
check("on a merged report the shortcut leads to the case's claim", m and m.get("claim_id") == claim.claim_id, m or r.text[:200])

# A merged claim is followed only while it remains inside this case and for this pet.
alias = PetClaim(report_id=2, pet_id=5, status="Merged", merged_into_claim_id=claim.claim_id)
db.add(alias)
db.commit()
r, m = staff_match(2)
check("merged claim aliases resolve to one live claim", m and m.get("claim_id") == claim.claim_id, m)
claim.status = "Rejected"
db.commit()
r, m = staff_match(2)
check("rejected claims have no shortcut", m and m.get("claim_id") is None, m)
claim.status = "Possible Match Found"
db.commit()
r, m = staff_match(2)
check("unfiled possible matches have no shortcut", m and m.get("claim_id") is None, m)
claim.status = "Pending Review"
db.add(Report(report_id=3, user_id=20, subdivision_id=1, category_id=1, current_status_id=2, animal_type="Dog", latitude=14.8, longitude=121.0))
db.flush()
foreign = PetClaim(report_id=3, pet_id=5, status="Approved")
db.add(foreign)
db.flush()
claim.status = "Merged"
claim.merged_into_claim_id = foreign.claim_id
db.commit()
r, m = staff_match(2)
check("a merged alias leading outside the current case exposes no claim metadata", m and m.get("claim_id") is None, m)
claim.status = "Pending Review"
claim.merged_into_claim_id = None
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other synthetic subdivision"))
db.flush()
db.add(User(user_id=24, name="Other Leader", email="other-leader@example.test", password="x", role_id=2,
            is_verified=True, status="Active", subdivision_id=2, barangay_id=1))
db.commit()
r = client.get("/matches/report/1", headers=H(24, 2))
check("an unrelated leader cannot obtain the match or shortcut", (r.status_code in (403, 404) or (r.status_code == 200 and r.json() == [])), r.text[:150])
r = client.get("/matches/report/1", headers=OWNER)
check("owner read remains authorized without staff claim metadata", r.status_code == 200
      and all(x.get("claim_id") is None and x.get("claim_status") is None for x in r.json()), r.text[:150])

passed = sum(results)
print(f"\n{passed}/{len(results)} match claim shortcut checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
