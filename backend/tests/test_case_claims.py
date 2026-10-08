"""
One pet claim per merged case: merging reports combines their claims for the same pet (nothing deleted), filing a
claim from any report of the case reuses the case's claim, and unmerging reopens the separated claim.
Run from the backend folder:  python tests/test_case_claims.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "case_claims_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-case-claims-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims, matches, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.case_groups import resync_case_pet_identity  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (claims.router, matches.router, reports.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, owner, leader = mk("Res", 1), mk("Owner", 1), mk("Leader", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO = H(LEADER, 2), H(OWNER, 1)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report():
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=LEADER, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def claim(rid, pid, **kw):
    CLOCK[0] += timedelta(minutes=1)
    c = PetClaim(report_id=rid, pet_id=pid, status=kw.pop("status", "Pending Review"), created_at=CLOCK[0], **kw)
    db.add(c)
    db.commit()
    return c.claim_id


def row(cid):
    db.expire_all()
    return db.get(PetClaim, cid)


def owner_list():
    return client.get(f"/claims/?owner_id={OWNER}", headers=HO).json()


pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
other = Pet(pet_name="Bantay", pet_type="Dog", owner_id=OWNER, status="Active")
db.add_all([pet, other])
db.commit()
PET, OTHER = pet.pet_id, other.pet_id
R1, R13, R15 = report(), report(), report()

# Like the live data: a claim on Report #1, then a second claim for the same pet on Report #13 (proof reused)
C1 = claim(R1, PET, additional_photos_url="https://cdn.example/p1.jpg", remarks="I confirm this is my pet.")
C2 = claim(R13, PET, vet_record_url="https://cdn.example/vet.pdf", distinctive_markings="scar on the nose", remarks="mine")
C3 = claim(R15, OTHER)  # another pet on the case: not combined with Boyet's claim
check("before the merge the owner sees two claims for Boyet", sum(1 for c in owner_list() if c["pet_id"] == PET) == 2)

r = client.post("/reports/merge-group", json={"report_ids": [R1, R13, R15], "notes": "same dog, checked photos"}, headers=HL)
check("the reports are merged", r.status_code == 200, r.text[:200])
c1, c2 = row(C1), row(C2)
check("after the merge Boyet's second claim is combined into the case's claim", c2.status == "Merged" and c2.merged_into_claim_id == C1)
check("...the case's claim is the earliest one and stays as it was", c1.status == "Pending Review" and c1.merged_into_claim_id is None)
check("...the second claim's proof and markings are copied over, not lost",
      c1.vet_record_url == "https://cdn.example/vet.pdf" and c1.additional_photos_url == "https://cdn.example/p1.jpg"
      and c1.distinctive_markings == "scar on the nose")
check("...the second claim is kept for the record (not deleted) with a note", c2 is not None and "Combined into claim #%d" % C1 in (c2.remarks or ""))
check("a claim for a different pet on the case is left alone", row(C3).status == "Pending Review")
lst = owner_list()
boyet = [c for c in lst if c["pet_id"] == PET]
check("the owner's claim list now has one claim for Boyet", len(boyet) == 1 and boyet[0]["claim_id"] == C1, [c["claim_id"] for c in boyet])
check("...and it lists every report of the case", sorted(boyet[0]["case_report_ids"]) == sorted([R1, R13, R15]), boyet[0].get("case_report_ids"))
r = client.get(f"/claims/{C2}", headers=HO)
check("opening the old claim shows the case's claim", r.status_code == 200 and r.json()["claim_id"] == C1, r.text[:200])

resync_case_pet_identity(db, db.get(Report, R1))
db.commit()
check("re-syncing changes nothing (idempotent)", row(C2).status == "Merged" and (row(C1).remarks or "").count("Claim #%d" % C2) == 1)

# Filing a claim from another report of the case reuses the case's claim
r = client.post("/claims/", json={"report_id": R15, "pet_id": PET, "remarks": "it's Boyet"}, headers=HO)
check("filing from Report #15 updates the case's claim instead of creating another",
      r.status_code == 200 and r.json()["claim_id"] == C1, r.text[:200])
db.expire_all()
check("...still one live claim for Boyet in the case",
      db.query(PetClaim).filter(PetClaim.pet_id == PET, PetClaim.status != "Merged").count() == 1)

# A merged claim can't be set by hand; a decision on the old claim applies to the case's claim
check("'Merged' can't be set by hand", client.patch(f"/claims/{C1}/status", json={"status": "Merged"}, headers=HL).status_code == 400)

# A new case: the first claim is filed on the case's first report, even when filed from a merged report
R30, R31 = report(), report()
client.post("/reports/merge-group", json={"report_ids": [R30, R31], "notes": "same dog, same collar"}, headers=HL)
r = client.post("/claims/", json={"report_id": R31, "pet_id": OTHER, "remarks": "Bantay"}, headers=HO)
check("a new claim from a merged report is filed on the case's first report", r.status_code == 200 and r.json()["report_id"] == R30, r.text[:200])

# Unmerge: the separated report's claim is reopened with its earlier status
r = client.post(f"/reports/{R13}/unmerge", json={"reason": "different dog after all, separating"}, headers=HL)
check("Report #13 is unmerged", r.status_code == 200, r.text[:200])
c2 = row(C2)
check("after unmerge its claim is reopened as it was", c2.status == "Pending Review" and c2.merged_into_claim_id is None
      and "Reopened" in (c2.remarks or ""), (c2.status, c2.merged_into_claim_id))
check("...and the owner sees it again", any(c["claim_id"] == C2 for c in owner_list()))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
