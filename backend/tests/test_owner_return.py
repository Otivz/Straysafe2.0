"""
Returned to Owner / Reunited: owner with a StraySafe account (linked user_id) or without one (manual details),
for the report status flow (Subdivision Leader / Barangay) and the holding-facility 'Claimed by Owner' flow.
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_owner_return.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "owner_return_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-return-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import ReportMedia, FacilityStatus, HoldingAnimal, Rescue, RescueStatus, Report, ReportReturn, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import holding, pet_ownership, report_returns, reports, rescue  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for r in (reports.router, holding.router, report_returns.router, rescue.router, pet_ownership.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
for sid in (1, 2, 3, 4, 7, 9, 11, 13):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for sid in (1, 2, 3, 4, 5, 6):
    db.add(RescueStatus(status_id=sid, status_name=f"R{sid}"))
for sid, nm in ((1, "Need Treatment"), (2, "Healthy"), (3, "Claimed"), (4, "Deceased")):
    db.add(FacilityStatus(status_id=sid, status_name=nm))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", phone=kw.pop("phone", None), **kw)
    db.add(u)
    db.flush()
    return u


reporter = mk_user("Reporter", 1, subdivision_id=1, barangay_id=1)
owner = mk_user("Maria Owner", 1, subdivision_id=1, barangay_id=1, phone="09170000001")
far_owner = mk_user("Maria Faraway", 1, subdivision_id=2, barangay_id=1, phone="09170000002")
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
head = mk_user("Head", 3, barangay_id=1, is_head_officer=True)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731

results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def mk_report(status=2):
    # A report can only be resolved once its animal has a record, so each test report starts with a stray record.
    stray = Pet(pet_name="Unnamed stray", pet_type="Dog", status="Rescued")
    db.add(stray)
    db.flush()
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1, current_status_id=status,
               animal_type="Unknown", assigned_leader_id=leader.user_id, pet_id=stray.pet_id)
    db.add(r)
    db.commit()
    return r.report_id


def photo(rid):
    m = ReportMedia(report_id=rid, file_url=f"https://img.test/{rid}-{os.urandom(3).hex()}.jpg", media_type="Image", is_evidence=True)
    db.add(m)
    db.commit()
    return m.media_id


def proof(rid, d, with_id=True):
    """Attach the required proof (handover photo + ID type/last 4) to an owner_return payload."""
    d = dict(d)
    d.setdefault("handover_media_id", photo(rid))
    if with_id:
        d.setdefault("id_type", "Driver's License")
        d.setdefault("id_last4", "4821")
    return d


def resolve(rid, who, owner_return, sid=9, add_proof=True):
    body = {"status_id": sid, "remarks": "Animal handed back to its owner."}
    if owner_return is not None:
        body["owner_return"] = proof(rid, owner_return) if add_proof and owner_return.get("has_account") is not None and (owner_return.get("owner_user_id") or owner_return.get("owner_name")) else owner_return
    return client.patch(f"/reports/{rid}/status", json=body, headers=H(who))


users_before = db.query(User).count()

# ── Owner search (scoped) ────────────────────────────────────────────────────
res = client.get("/report-returns/owner-search", params={"q": "Maria"}, headers=H(leader))
names = [u["name"] for u in res.json()] if res.status_code == 200 else []
check("leader search finds the owner in own subdivision only", res.status_code == 200 and names == ["Maria Owner"], str(names))
res = client.get("/report-returns/owner-search", params={"q": "Maria"}, headers=H(head))
check("barangay staff search finds owners across the barangay", sorted(u["name"] for u in res.json()) == ["Maria Faraway", "Maria Owner"])
check("search is closed to residents", client.get("/report-returns/owner-search", params={"q": "Maria"}, headers=H(reporter)).status_code in (401, 403))
check("search needs 2+ characters", client.get("/report-returns/owner-search", params={"q": "M"}, headers=H(leader)).status_code == 422)

# ── Validation ───────────────────────────────────────────────────────────────
R = mk_report()
check("status 9 without owner info is rejected", resolve(R, leader, None).status_code == 400)
check("account mode without a selected account is rejected", resolve(R, leader, {"has_account": True}).status_code == 400)
check("account mode: out-of-scope account is rejected", resolve(R, leader, {"has_account": True, "owner_user_id": far_owner.user_id}).status_code == 400)
check("account mode: staff account cannot be the owner", resolve(R, leader, {"has_account": True, "owner_user_id": head.user_id}).status_code == 400)
check("manual mode without a name is rejected", resolve(R, leader, {"has_account": False, "owner_phone": "0917"}).status_code == 400)
check("manual mode without contact or address is rejected", resolve(R, leader, {"has_account": False, "owner_name": "Pedro Cruz"}).status_code == 400)
check("nothing was saved by the failed attempts", db.query(ReportReturn).count() == 0 and db.query(Report).get(R).current_status_id == 2)

# ── Owner WITH a StraySafe account ──────────────────────────────────────────
res = resolve(R, leader, {"has_account": True, "owner_user_id": owner.user_id, "id_presented": "Driver's license", "owner_name": "IGNORED"})
check("account mode succeeds", res.status_code == 200, res.text[:200])
db.expire_all()
rec = db.query(ReportReturn).filter_by(report_id=R).first()
check("record links the selected user_id and snapshots the account details",
      rec and rec.has_account and rec.owner_user_id == owner.user_id and rec.owner_name == "Maria Owner" and rec.owner_phone == "09170000001"
      and rec.returned_by == leader.user_id and rec.id_presented == "Driver's license")
check("report status is 9 and history mentions the owner",
      db.query(Report).get(R).current_status_id == 9
      and any("Maria Owner" in (h.remarks or "") for h in db.query(StatusHistory).filter_by(report_id=R)))
check("the owner was notified", any("Returned to You" in n.title for n in db.execute(
    __import__("sqlalchemy").text("select title from notifications where user_id=:u"), {"u": owner.user_id}).all() for n in [type("N", (), {"title": n[0]})]))

# ── Owner WITHOUT an account (manual) ───────────────────────────────────────
R2 = mk_report()
res = resolve(R2, leader, {"has_account": False, "owner_name": "  Pedro Cruz ", "owner_phone": "09180000000",
                           "owner_address": "Block 2 Lot 5", "relationship_to_animal": "Neighbor"})
check("manual mode succeeds", res.status_code == 200, res.text[:200])
db.expire_all()
rec2 = db.query(ReportReturn).filter_by(report_id=R2).first()
check("manual record stores the details with no linked account",
      rec2 and not rec2.has_account and rec2.owner_user_id is None and rec2.owner_name == "Pedro Cruz"
      and rec2.owner_phone == "09180000000" and rec2.relationship_to_animal == "Neighbor")
check("no user accounts were created", db.query(User).count() == users_before)
check("history says the owner has no StraySafe account",
      any("no StraySafe account" in (h.remarks or "") for h in db.query(StatusHistory).filter_by(report_id=R2)))

# ── Reading the record ──────────────────────────────────────────────────────
g = client.get(f"/report-returns/by-report/{R2}", headers=H(leader))
check("staff can read the record", g.status_code == 200 and g.json()["owner_name"] == "Pedro Cruz")
g = client.get(f"/report-returns/by-report/{R2}", headers=H(reporter))
check("reporter sees the outcome without the owner's contact details", g.status_code == 200 and g.json()["owner_name"] == "Pedro Cruz" and g.json()["owner_phone"] is None)
check("an unrelated resident is refused", client.get(f"/report-returns/by-report/{R2}", headers=H(far_owner)).status_code == 403)

# ── Other outcomes are unaffected ───────────────────────────────────────────
R3 = mk_report()
check("resolving (11) needs no owner info", resolve(R3, leader, None, sid=11).status_code == 200)

# ── Holding facility: Claimed by Owner ──────────────────────────────────────
R4 = mk_report(status=7)
h = HoldingAnimal(report_id=R4, animal_type="Dog", facility_status=2)
db.add(h)
db.commit()
hid = h.holding_id
check("holding: Claimed by Owner without owner info is rejected",
      client.patch(f"/holding/{hid}", json={"facility_status": 3}, headers=H(head)).status_code == 400)
check("holding: other status changes need no owner info",
      client.patch(f"/holding/{hid}", json={"facility_status": 1}, headers=H(head)).status_code == 200)
res = client.patch(f"/holding/{hid}", json={"facility_status": 3, "owner_return": proof(R4, {"has_account": True, "owner_user_id": owner.user_id})}, headers=H(head))
check("holding: Claimed by Owner with an account succeeds", res.status_code == 200, res.text[:200])
db.expire_all()
rec4 = db.query(ReportReturn).filter_by(report_id=R4).first()
check("holding: record linked to the report, holding animal and account",
      rec4 and rec4.owner_user_id == owner.user_id and rec4.holding_id == hid and db.query(Report).get(R4).current_status_id == 11)
check("holding: history mentions the owner", any("Maria Owner" in (x.remarks or "") for x in db.query(StatusHistory).filter_by(report_id=R4)))

R5 = mk_report(status=7)
h5 = HoldingAnimal(report_id=R5, animal_type="Cat", facility_status=2)
db.add(h5)
db.commit()
res = client.patch(f"/holding/{h5.holding_id}", json={"facility_status": 3, "owner_return": proof(R5, {"has_account": False, "owner_name": "Juan Manual", "owner_phone": "0999"})}, headers=H(head))
check("holding: Claimed by Owner with manual details succeeds", res.status_code == 200, res.text[:200])
db.expire_all()
rec5 = db.query(ReportReturn).filter_by(report_id=R5).first()
check("holding: manual record has no account and no user was created", rec5 and rec5.owner_user_id is None and db.query(User).count() == users_before)

# ── Barangay rescue-request flow ────────────────────────────────────────────
R6 = mk_report(status=6)
resc = Rescue(report_id=R6, leader_id=head.user_id, staff_id=head.user_id, status_id=5, title="t")
db.add(resc)
db.commit()
rid6 = resc.rescue_id
check("rescue: status 9 without owner info is rejected",
      client.patch(f"/rescue-requests/{rid6}", json={"status_id": 9, "remarks": "returned"}, headers=H(head)).status_code == 400)
res = client.patch(f"/rescue-requests/{rid6}", json={"status_id": 9, "remarks": "Returned at the barangay hall.",
                    "owner_return": proof(R6, {"has_account": False, "owner_name": "Ana Walkin", "owner_address": "Purok 3"})}, headers=H(head))
check("rescue: status 9 with manual owner succeeds", res.status_code == 200, res.text[:300])
db.expire_all()
rec6 = db.query(ReportReturn).filter_by(report_id=R6).first()
check("rescue: record saved, report closed as 9, history names the owner",
      rec6 and rec6.owner_name == "Ana Walkin" and rec6.owner_user_id is None and db.query(Report).get(R6).current_status_id == 9
      and any("Ana Walkin" in (x.remarks or "") for x in db.query(StatusHistory).filter_by(report_id=R6)))
R7 = mk_report(status=7)
h7 = HoldingAnimal(report_id=R7, animal_type="Dog", facility_status=2, kennel_slot="K1")
db.add(h7)
db.commit()
res = resolve(R7, head, {"has_account": True, "owner_user_id": owner.user_id})
db.expire_all()
h7 = db.query(HoldingAnimal).get(h7.holding_id)
check("report status 9 on a held animal discharges it from the facility",
      res.status_code == 200 and h7.facility_status == 3 and h7.discharge_date is not None and h7.kennel_slot is None, res.text[:200])
check("rescue: still no user accounts created", db.query(User).count() == users_before)

# ── Proof requirements ──────────────────────────────────────────────────────
P = mk_report()
base = {"has_account": False, "owner_name": "Proof Person", "owner_phone": "0917"}
check("proof: handover photo is required", resolve(P, leader, dict(base, id_type="Passport", id_last4="1234"), add_proof=False).status_code == 400)
check("proof: ID type is required", resolve(P, leader, dict(base, handover_media_id=photo(P), id_last4="1234"), add_proof=False).status_code == 400)
check("proof: last 4 digits must be 4 numbers", resolve(P, leader, dict(base, handover_media_id=photo(P), id_type="Passport", id_last4="12a4"), add_proof=False).status_code == 400)
other = mk_report()
check("proof: a photo from another report is refused",
      resolve(P, leader, dict(base, handover_media_id=photo(other), id_type="Passport", id_last4="1234"), add_proof=False).status_code == 400)
res = resolve(P, leader, dict(base, handover_media_id=photo(P), id_type="Passport", id_last4="1234", ownership_proof_media_ids=[photo(P)]), add_proof=False)
db.expire_all()
rp = db.query(ReportReturn).filter_by(report_id=P).first()
check("proof: saved with photo, ID type, last 4 and ownership proof",
      res.status_code == 200 and rp.handover_photo_url and rp.id_type == "Passport" and rp.id_last4 == "1234"
      and len(rp.ownership_proof_urls or []) == 1 and not rp.ownership_verified_by_record, res.text[:200])

# Owner already registered as the pet's owner -> ID not required, still needs the handover photo
pet = Pet(pet_name="Bantay", owner_id=owner.user_id, pet_type="Dog")
db.add(pet)
db.commit()
V = mk_report()
db.query(Report).filter_by(report_id=V).update({"pet_id": pet.pet_id})
db.commit()
check("verified owner: handover photo still required",
      resolve(V, leader, {"has_account": True, "owner_user_id": owner.user_id}, add_proof=False).status_code == 400)
res = resolve(V, leader, {"has_account": True, "owner_user_id": owner.user_id, "handover_media_id": photo(V)}, add_proof=False)
db.expire_all()
rv = db.query(ReportReturn).filter_by(report_id=V).first()
check("verified owner: ID can be skipped and the record notes ownership was verified by the pet record",
      res.status_code == 200 and rv.ownership_verified_by_record and rv.id_type is None, res.text[:200])

# ── Pet record reflects the return ──────────────────────────────────────────
def community_pet_report(owner_id=None):
    p = Pet(pet_name="Community Dog", owner_id=owner_id, pet_type="Dog", status="Rescued")
    db.add(p)
    db.commit()
    r = mk_report()
    db.query(Report).filter_by(report_id=r).update({"pet_id": p.pet_id})
    db.commit()
    return r, p.pet_id


C1, pid1 = community_pet_report()
res = resolve(C1, leader, {"has_account": True, "owner_user_id": owner.user_id})
db.expire_all()
p1 = db.query(Pet).get(pid1)
check("pet record: unowned pet is NOT assigned until the owner confirms (still Active)",
      res.status_code == 200 and p1.owner_id is None and p1.status == "Active", res.text[:200])
mine = client.get("/pet-ownership/mine", headers=H(owner)).json()
conf1 = next((c for c in mine if c["pet_id"] == pid1), None)
check("owner sees a pending confirmation for the returned pet", conf1 is not None and conf1["source"] == "returned_to_owner")
check("another resident cannot answer it", client.post(f"/pet-ownership/{conf1['confirmation_id']}/accept", headers=H(reporter)).status_code == 403)
check("staff see it as pending", client.get(f"/pet-ownership/by-pet/{pid1}", headers=H(leader)).json()["status"] == "Pending")
check("owner accepts", client.post(f"/pet-ownership/{conf1['confirmation_id']}/accept", headers=H(owner)).status_code == 200)
db.expire_all()
check("after accepting, the pet is owned by them", db.query(Pet).get(pid1).owner_id == owner.user_id)
check("a request cannot be answered twice", client.post(f"/pet-ownership/{conf1['confirmation_id']}/reject", json={}, headers=H(owner)).status_code == 400)

C2, pid2 = community_pet_report()
res = resolve(C2, leader, {"has_account": False, "owner_name": "Lola Manual", "owner_phone": "0917111"})
db.expire_all()
p2 = db.query(Pet).get(pid2)
check("pet record: manual owner keeps it unowned but stores the owner as contact",
      res.status_code == 200 and p2.owner_id is None and p2.emergency_contact_name == "Lola Manual" and p2.emergency_contact_phone == "0917111")

C3, pid3 = community_pet_report(owner_id=far_owner.user_id)
res = resolve(C3, leader, {"has_account": True, "owner_user_id": owner.user_id})
db.expire_all()
check("pet record: a pet registered to someone else is never reassigned",
      res.status_code == 200 and db.query(Pet).get(pid3).owner_id == far_owner.user_id)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
