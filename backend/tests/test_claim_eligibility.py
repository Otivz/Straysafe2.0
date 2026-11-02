"""
Phase 7 (docs/01-system/CLAIM_ELIGIBILITY_RULES.md): a pet claim is for an animal someone holds. Held / unheld across
merged cases, stale facility data, adoption, approved-claim continuation, the owner's Home / Still missing answer,
closing a claim as Not Needed (undoing an erroneous approval, never a completed return), and Pet Recovered only on
actual lost-pet reports.
Run from the backend folder:  python tests/test_claim_eligibility.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "claim_eligibility_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-claim-eligibility-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, Report, ReportCategory, ReportReturn, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import claims, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.claim_custody import case_custody  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (claims.router, reports.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for cid, name in ((1, "Injured"), (4, "Roaming Animal"), (6, "Lost Pet")):
    db.add(ReportCategory(category_id=cid, category_name=name))


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subd, barangay_id=1, phone="09170000000")
    db.add(u)
    db.flush()
    return u


owner, other, reporter = mk("Owner", 1), mk("Other", 1), mk("Reporter", 1)
leader, leader2, staff = mk("Leader", 2), mk("LeaderTwo", 2, subd=2), mk("Staff", 3)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HO, HX, HR, HL, HL2, HS = (H(u) for u in (owner, other, reporter, leader, leader2, staff))
CLOCK = [datetime(2026, 10, 1)]
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def pet(name="Bantay", owner_user=owner):
    p = Pet(owner_id=owner_user.user_id if owner_user else None, pet_name=name, pet_type="Dog", status="Lost",
            photo_front_url="https://img.test/p.jpg")
    db.add(p)
    db.commit()
    return p.pet_id


def report(cat=1, status=2, custody="Sighting", pet_id=None, user=reporter, **kw):
    CLOCK[0] += timedelta(hours=1)
    r = Report(user_id=user.user_id, subdivision_id=1, category_id=cat, latitude=14.8, longitude=121.0,
               current_status_id=status, custody_status=custody, pet_id=pet_id, animal_type="Dog",
               assigned_leader_id=leader.user_id, created_at=CLOCK[0], **kw)
    db.add(r)
    db.commit()
    return r.report_id


def holding(rid, status=2, discharged=False):
    h = HoldingAnimal(report_id=rid, facility_status=status, animal_type="Dog",
                      discharge_date=datetime.now() if discharged else None)
    db.add(h)
    db.commit()
    return h.holding_id


def legacy_claim(rid, pid, status="Pending Review", before=None):
    c = PetClaim(report_id=rid, pet_id=pid, status=status, status_before_approval=before, remarks="old claim")
    db.add(c)
    db.commit()
    return c.claim_id


file_claim = lambda rid, pid, h=HO: client.post("/claims/", headers=h, json={"report_id": rid, "pet_id": pid, "remarks": "Mine"})  # noqa: E731
set_status = lambda cid, st, h=HL, **kw: client.patch(f"/claims/{cid}/status", headers=h, json={"status": st, **kw})  # noqa: E731
custody = lambda rid: case_custody(db, db.get(Report, rid))  # noqa: E731

# ── 1. Who holds the animal ──
p1 = pet()
r_sight = report()
check("held: a plain sighting is not held", custody(r_sight)["held"] is False)
r_fac = report(custody="Secured in Facility")
holding(r_fac)
check("held: an open holding record is held", custody(r_fac)["held"] and custody(r_fac)["holder"] == "holding place")
r_pick = report(status=6)
check("held: Picked Up is held (rescue team)", custody(r_pick)["held"] and custody(r_pick)["holder"] == "rescue team")
r_res = report(custody="Secured by Resident")
check("held: Secured by Resident is held (resident)", custody(r_res)["held"] and custody(r_res)["holder"] == "resident")
r_stale = report(status=8, custody="In Barangay Facility")
holding(r_stale, status=3, discharged=True)
check("stale: facility custody with every holding record discharged is not held", custody(r_stale)["held"] is False)
r_adopt = report(status=8, custody="In Barangay Facility")
hid = holding(r_adopt, status=7)
check("adoption: an adopted animal is never held", custody(r_adopt)["held"] is False and custody(r_adopt)["adopted"])
r_adopt2 = report(custody="Secured in Facility")
hid2 = holding(r_adopt2)
db.add(Adoption(holding_id=hid2, applicant_id=other.user_id, status="Approved", full_name="A", address="X", contact_no="1",
                reason="r", is_handed_over=True))
db.commit()
check("adoption: a handed-over adoption overrides stale open holding data", custody(r_adopt2)["adopted"])
r_root = report()
r_child = report(duplicate_of_report_id=r_root, status=18)
holding(r_root)
check("merged: the case is held when its main report's animal is held", custody(r_child)["held"])
r_closed = report(status=11, custody="Secured by Resident")
check("closed: a resolved case is not held", custody(r_closed)["held"] is False)

# ── 2. New claims need a held animal ──
r = file_claim(r_sight, p1)
check("claim: refused for an animal nobody holds", r.status_code == 409 and "Nobody" in r.text, r.text[:200])
check("claim: nothing was saved", db.query(PetClaim).filter(PetClaim.report_id == r_sight).count() == 0)
p_free = pet("Ligaw", owner_user=None)
r = file_claim(r_sight, p_free)
db.expire_all()
check("claim: refused before an unowned pet is assigned to the filer", r.status_code == 409 and db.get(Pet, p_free).owner_id is None)
r = file_claim(r_stale, p1)
check("claim: refused on stale facility data", r.status_code == 409, r.text[:200])
r = file_claim(r_adopt, p1)
check("claim: refused for an adopted animal", r.status_code == 409 and "adopted" in r.text, r.text[:200])
r = file_claim(r_fac, p1)
check("claim: allowed for a held animal, with the custody explanation", r.status_code == 200 and r.json()["custody"]["held"], r.text[:300])
c_fac = r.json()["claim_id"]
check("claim: wrong owner still refused", file_claim(r_res, p1, HX).status_code == 403)
r = file_claim(r_child, p1)
check("claim: allowed on a merged report whose case animal is held", r.status_code == 200, r.text[:200])

# ── 3. Approval keeps the earlier status; an approved claim can complete ──
p2 = pet("Brownie")
r_pick2 = report(status=6)
c_pick = file_claim(r_pick2, p2).json()["claim_id"]
r = set_status(c_pick, "Approved", remarks="Owner proof is good")
db.expire_all()
cl = db.get(PetClaim, c_pick)
check("approve: the report's earlier status is remembered", r.status_code == 200 and cl.status_before_approval == 6
      and db.get(Report, r_pick2).current_status_id == 9, r.text[:200])
check("approve: an approved claim's animal still counts as held (status before approval)",
      r.json()["custody"]["held"] and r.json()["custody"]["not_needed"] is False)
r = client.post(f"/claims/{c_pick}/evidence", headers=HO, json={"file_url": "https://res.cloudinary.com/x/image/upload/a.jpg", "document_type": "additional_photo"})
check("approve: the owner can still add documents to an approved claim", r.status_code != 409, r.text[:200])

# ── 4. Unheld legacy claims: no forward decisions, rejection allowed ──
p3 = pet("Tagpi")
r_legacy = report()
c_old = legacy_claim(r_legacy, p3)
for st in ("Approved", "Evidence Requested", "Pending Review"):
    r = set_status(c_old, st)
    check(f"decision: {st} refused when nobody holds the animal", r.status_code == 409, r.text[:200])
r = client.post(f"/claims/{c_old}/evidence", headers=HO, json={"file_url": "https://res.cloudinary.com/x/image/upload/b.jpg"})
check("evidence: refused when nobody holds the animal", r.status_code == 409, r.text[:200])
check("decision: Not Needed only through its own action", set_status(c_old, "Not Needed").status_code == 400)
g = client.get(f"/claims/{c_old}", headers=HO).json()
check("view: the owner sees why the claim isn't needed", g["custody"]["not_needed"] and g["custody"]["reason"], g.get("custody"))

# ── 5. Owner: Home / Still missing ──
wh = lambda cid, a, h=HO, **kw: client.post(f"/claims/{cid}/whereabouts", headers=h, json={"answer": a, **kw})  # noqa: E731
check("whereabouts: only the owner", wh(c_old, "home", HX).status_code == 403)
check("whereabouts: only home or still_missing", wh(c_old, "garage").status_code == 422)
check("whereabouts: not offered while the animal is held", wh(c_fac, "home").status_code == 409)
r = wh(c_old, "still_missing", note="Still looking near the creek")
check("whereabouts: saved", r.status_code == 200 and r.json()["owner_whereabouts"] == "still_missing", r.text[:200])
r = wh(c_old, "home", note="He came back last night")
check("whereabouts: the latest answer replaces the earlier one", r.json()["owner_whereabouts"] == "home"
      and r.json()["owner_whereabouts_note"] == "He came back last night")
check("whereabouts: the handling leader is told", db.query(Notification).filter(
    Notification.user_id == leader.user_id, Notification.type == "claim", Notification.title.like("Owner:%")).count() == 2)

# ── 6. Close as Not Needed ──
close = lambda cid, h=HL, reason="Nobody is holding the animal; owner says it's home.": client.post(  # noqa: E731
    f"/claims/{cid}/close-not-needed", headers=h, json={"reason": reason})
check("close: residents can't close claims", close(c_old, HO).status_code == 403)
check("close: a reason is required", close(c_old, reason="no").status_code == 422)
check("close: a leader of another subdivision can't", close(c_old, HL2).status_code == 404)
check("close: a claim whose animal is held can't be closed as not needed", close(c_fac).status_code == 409)
r = close(c_old)
check("close: the handling leader closes it as Not Needed", r.status_code == 200 and r.json()["status"] == "Not Needed"
      and r.json()["closed_reason"], r.text[:200])
check("close: the owner is notified", db.query(Notification).filter(Notification.user_id == owner.user_id,
      Notification.title == "Pet Claim Closed: Not Needed").count() == 1)
check("close: a closed claim takes no more decisions", set_status(c_old, "Rejected").status_code == 409)

p4 = pet("Mali")
r_wrong = report(status=9)  # an approval wrongly set Claimed by Owner on an animal nobody holds
c_wrong = legacy_claim(r_wrong, p4, status="Approved", before=2)
r = close(c_wrong, reason="Approved by mistake: the dog was never picked up.")
db.expire_all()
check("recover: an erroneous approval's status is undone", r.status_code == 200 and db.get(Report, r_wrong).current_status_id == 2, r.text[:200])
check("recover: with a history entry", db.query(StatusHistory).filter(StatusHistory.report_id == r_wrong,
      StatusHistory.remarks.like("%undone%")).count() == 1)

p5 = pet("Uwi")
r_done = report(status=9, custody="Claimed by Owner")
db.add(ReportReturn(report_id=r_done, pet_id=p5, has_account=True, owner_user_id=owner.user_id, owner_name="Owner",
                    relationship_to_animal="Owner", returned_by=leader.user_id))
db.commit()
c_done = legacy_claim(r_done, p5, status="Approved", before=2)
r = close(c_done, reason="Already returned to the owner; claim left open.")
db.expire_all()
check("recover: a completed return is never undone", r.status_code == 200 and db.get(Report, r_done).current_status_id == 9, r.text[:200])
c_hand = legacy_claim(report(status=9, custody="Claimed by Owner"), p5, status="Handover Complete")
check("close: a completed claim can't be closed as not needed", close(c_hand).status_code == 409)

r_adopt3 = report(status=9, custody="In Barangay Facility")
holding(r_adopt3, status=7)
c_adopt = legacy_claim(r_adopt3, p5, status="Approved", before=8)
r = set_status(c_adopt, "Handover Complete", bypass_handover_photo=True, merged_sightings_reviewed=True)
check("adoption: an approved claim can't be completed for an adopted animal", r.status_code == 409 and "adopted" in r.text, r.text[:200])

# ── 7. Pet Recovered only on lost-pet reports ──
p6 = pet("Gala")
reunite = lambda rid, h: client.post(f"/reports/{rid}/confirm-reunited", headers=h, json={"notes": "Back home"})  # noqa: E731
r_roam = report(cat=4, pet_id=p6)
r = reunite(r_roam, HO)
check("recovered: the owner can't close a roaming-pet complaint as reunited", r.status_code == 409 and "lost-pet report" in r.text, r.text[:200])
r_stray = report(cat=1)
check("recovered: the reporter of a stray report can't either", reunite(r_stray, HR).status_code == 409)
check("recovered: the complaint stays open", db.get(Report, r_roam).current_status_id == 2)
r_lost = report(cat=6, pet_id=p6, user=owner)
r = reunite(r_lost, HO)
check("recovered: the owner confirms on their lost-pet report", r.status_code == 200, r.text[:200])
r_lost2 = report(cat=1, pet_id=p6, user=owner, description="[LOST PET REPORT] Gala is missing")
check("recovered: a report filed through the lost-pet form counts", reunite(r_lost2, HO).status_code == 200)
check("recovered: the existing open-case check still applies", reunite(report(cat=6, pet_id=p6, user=owner, status=11), HO).status_code == 400)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
