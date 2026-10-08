"""
Matches audit gaps: G3 (merge duplicate pet records, nothing deleted), G7 (a duplicate pair across subdivisions is reviewed by the Barangay), G8 (a formal dispute is linked to the match it disputes and shows its history to reviewers), G6 (Add Record from a report creates and links the pet in one step, never an orphan record) and
G9 (the match verification audit log records which record changed: pet link, case and owner status, old and new).
Run from the backend folder:  python tests/test_matches_gaps.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "matches_gaps_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-matches-gaps-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, pets, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (matches.router, pets.router, reports.router):
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


res, owner, leader, other_leader = mk("Res", 1), mk("Owner", 1), mk("Leader", 2), mk("Other", 2)
db.commit()
OWNER, LEADER = owner.user_id, leader.user_id
H = lambda uid, role: {"Authorization": "Bearer " + create_access_token({"sub": str(uid), "user_id": uid, "role_id": role})}  # noqa: E731
HL, HO, HX = H(LEADER, 2), H(OWNER, 1), H(other_leader.user_id, 2)
results = []
CLOCK = [datetime(2026, 9, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(leader_id=LEADER):
    CLOCK[0] += timedelta(minutes=5)
    r = Report(user_id=res.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
               animal_type="Dog", animal_breed="Aspin", assigned_leader_id=leader_id, created_at=CLOCK[0], ai_suggested_risk_level="Low")
    db.add(r)
    db.commit()
    return r.report_id


def pets_named(name):
    db.expire_all()
    return db.query(Pet).filter(Pet.pet_name == name).count()


def new_pet(name, rid, h=HL):
    return client.post("/pets/", params={"for_report_id": rid}, headers=h,
                       json={"pet_name": name, "pet_type": "Dog", "breed": "Aspin", "status": "Active"})


# G6: created and linked together
R1 = report()
r = new_pet("Brownie", R1)
db.expire_all()
check("G6 Add Record from a report creates the pet and links it in one step",
      r.status_code == 200 and db.get(Report, R1).pet_id == r.json().get("pet_id"), r.text[:200])

# Report already identified: refused before anything is created
r = new_pet("Brownie Two", R1)
check("G6 a report already identified is refused...", r.status_code == 409, r.text[:200])
check("...and no orphan record is left behind", pets_named("Brownie Two") == 0)

# Case confirmed as a registered pet through a look-alike: refused, no orphan
boyet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=OWNER, status="Active")
db.add(boyet)
db.commit()
R2 = report()
m2 = ReportMatch(source_report_id=R2, matched_pet_id=boyet.pet_id, similarity_score=93, status="AI_SUGGESTED")
db.add(m2)
db.commit()
client.post(f"/matches/{m2.match_id}/verify", json={"decision": "CONFIRMED_MATCH", "notes": "same scar and collar"}, headers=HL)
r = new_pet("Look Alike", R2)
check("G6 a case already confirmed as a registered pet is refused without an orphan record",
      r.status_code == 409 and pets_named("Look Alike") == 0, r.text[:200])

# An officer who doesn't handle the report: refused, no orphan
R3 = report(leader_id=other_leader.user_id)
r = new_pet("Stray Three", R3)
check("G6 an officer who isn't handling the report is refused without an orphan record",
      r.status_code in (400, 403) and pets_named("Stray Three") == 0, r.text[:200])

# G9: the verification audit log says which record changed
db.expire_all()
log = db.query(AuditLog).filter(AuditLog.action == "VERIFY_AI_MATCH", AuditLog.target_id == m2.match_id).first()
old, new = (log.old_values or {}), (log.new_values or {}) if log else ({}, {})
check("G9 the audit log has the old and new status", log is not None and old.get("status") == "AI_SUGGESTED"
      and new.get("status") == "CONFIRMED_MATCH", (old, new))
check("G9 ...the report, its case and the matched pet", old.get("report_id") == R2 and old.get("case_id") == R2
      and new.get("matched_pet_id") == boyet.pet_id, new)
check("G9 ...the report's pet link before and after", "report_pet_id" in old and "report_pet_id" in new, (old, new))
check("G9 ...and the owner's confirmation status", old.get("owner_confirmation_status") == "PENDING"
      and "owner_confirmation_status" in new, new)

# G8: the formal dispute is linked to the match it disputes; reviewers see its history, the resident doesn't
other_pet = Pet(pet_name="Other", pet_type="Dog", owner_id=res.user_id, status="Active")
db.add(other_pet)
db.commit()
bad = ReportMatch(source_report_id=R1, matched_pet_id=other_pet.pet_id, similarity_score=60, status="AI_SUGGESTED")
db.add(bad)
db.commit()
r = client.post(f"/reports/{R2}/disputes", data={"dispute_reason": "Not my dog", "match_id": str(bad.match_id)}, headers=HO)
check("G8 a match that isn't about the owner's pet on this report is refused", r.status_code == 400, r.text[:200])
r = client.post(f"/reports/{R2}/disputes", data={"dispute_reason": "Boyet was home all day, he is vaccinated",
                                                  "match_id": str(m2.match_id)}, headers=HO)
check("G8 filing from the match links it and pre-fills the pet", r.status_code == 200 and r.json().get("match_id") == m2.match_id
      and r.json().get("pet_id") == boyet.pet_id, r.text[:300])
check("G8 ...the resident doesn't get the staff decision trail", r.status_code == 200 and r.json().get("match_history") is None)
staff_view = client.get(f"/reports/{R2}/disputes", headers=HL).json()
hist = (staff_view[0].get("match_history") or {}) if staff_view else {}
check("G8 the reviewer sees the disputed match's history", hist.get("match_id") == m2.match_id and hist.get("status") == "CONFIRMED_MATCH"
      and hist.get("reviewer_name") == "Leader" and hist.get("verification_notes") == "same scar and collar", hist)
check("G8 ...including the decision trail from the audit log", any(e.get("action") == "VERIFY_AI_MATCH" for e in hist.get("events", [])))
check("G8 the resident's own list has no decision trail", all(d.get("match_history") is None for d in client.get(f"/reports/{R2}/disputes", headers=HO).json()))
R5 = report()
m5 = ReportMatch(source_report_id=R5, matched_pet_id=boyet.pet_id, similarity_score=80, status="AI_SUGGESTED")
db.add(m5)
db.commit()
r = client.post(f"/reports/{R5}/disputes", data={"dispute_reason": "Not Boyet", "pet_id": str(boyet.pet_id)}, headers=HO)
check("G8 filing with just the pet links that pet's match on the report", r.status_code == 200 and r.json().get("match_id") == m5.match_id, r.text[:200])

# G7: a suspected duplicate across a subdivision border is the Barangay's to review
from app.models.notification import Notification  # noqa: E402
db.add(Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"))
db.commit()
leader2 = User(name="Leader2", email="leader2@test-mail.com", password="x", role_id=2, is_verified=True, status="Active",
               subdivision_id=2, barangay_id=1)
brgy = User(name="Brgy", email="brgy@test-mail.com", password="x", role_id=3, is_verified=True, status="Active", barangay_id=1)
db.add_all([leader2, brgy])
db.commit()
HB = H(brgy.user_id, 3)


def report_in(subd, leader_id):
    rid = report(leader_id)
    db.get(Report, rid).subdivision_id = subd
    db.commit()
    return rid


A1, B1 = report_in(1, LEADER), report_in(2, leader2.user_id)
A2, B2 = report_in(1, LEADER), report_in(2, leader2.user_id)
S1, S2 = report_in(1, LEADER), report_in(1, LEADER)
pair1 = ReportMatch(source_report_id=B1, matched_report_id=A1, similarity_score=88, status="AI_SUGGESTED")
pair2 = ReportMatch(source_report_id=B2, matched_report_id=A2, similarity_score=88, status="AI_SUGGESTED")
same = ReportMatch(source_report_id=S2, matched_report_id=S1, similarity_score=88, status="AI_SUGGESTED")
db.add_all([pair1, pair2, same])
db.commit()
merge_body = {"report_ids": [A1, B1], "notes": "same dog seen across the street"}
lock = client.get(f"/matches/{pair1.match_id}", headers=HL).json().get("identity_lock_reason") or ""
check("G7 a leader sees that the Barangay reviews a cross-subdivision pair", "different subdivisions" in lock, lock)
r = client.post("/reports/merge-group", json=merge_body, headers=HL)
check("G7 ...and can't merge it", r.status_code == 403 and "different subdivisions" in r.text, r.text[:200])
r = client.post(f"/matches/{pair2.match_id}/verify", json={"decision": "NOT_A_MATCH", "notes": "different collar colour"}, headers=HL)
check("G7 ...or decide it", r.status_code == 403, r.text[:200])
r = client.post("/reports/merge-group", json=merge_body, headers=HB)
db.expire_all()
check("G7 Barangay staff can merge a cross-subdivision pair without an escalation", r.status_code == 200
      and db.get(Report, B1).duplicate_of_report_id == A1, r.text[:300])
r = client.post(f"/matches/{pair2.match_id}/verify", json={"decision": "NOT_A_MATCH", "notes": "different collar colour"}, headers=HB)
check("G7 ...and decide one", r.status_code == 200, r.text[:300])
r = client.post("/reports/merge-group", json={"report_ids": [S1, S2], "notes": "same dog, same street"}, headers=HB)
check("G7 a same-subdivision pair is still the leader's (no change)", r.status_code == 403, r.text[:200])
matches._notify_cross_subdivision_pair(db, db.get(Report, A2), db.get(Report, B2))
matches._notify_cross_subdivision_pair(db, db.get(Report, B2), db.get(Report, A2))
db.commit()
cnt = lambda uid: db.query(Notification).filter(Notification.user_id == uid, Notification.title.like("%Cross-Subdivision Duplicate%")).count()  # noqa: E731
check("G7 Barangay staff and both leaders are told, once each", cnt(brgy.user_id) == 1 and cnt(LEADER) == 1 and cnt(leader2.user_id) == 1,
      (cnt(brgy.user_id), cnt(LEADER), cnt(leader2.user_id)))

# G3: merge a duplicate pet record ("No Name" is really Kippy)
from app.models.pet_history import PetHistory  # noqa: E402
admin = mk("Admin", 4)
db.commit()
HA = H(admin.user_id, 4)
kippy = Pet(pet_name="Kippy", pet_type="Dog", owner_id=OWNER, status="Active", photo_url=None)
noname = Pet(pet_name="No Name", pet_type="Dog", owner_id=None, status="Active", photo_url="https://cdn.example/noname.jpg")
cat = Pet(pet_name="Mingming", pet_type="Cat", owner_id=None, status="Active")
stranger = Pet(pet_name="Rex", pet_type="Dog", owner_id=res.user_id, status="Active")
db.add_all([kippy, noname, cat, stranger])
db.commit()
R7, R8 = report(), report()
db.get(Report, R7).pet_id = noname.pet_id
s_dup = ReportMatch(source_report_id=R8, matched_pet_id=noname.pet_id, similarity_score=82, status="AI_SUGGESTED")
s_keep = ReportMatch(source_report_id=R8, matched_pet_id=kippy.pet_id, similarity_score=90, status="AI_SUGGESTED")
db.add_all([s_dup, s_keep, PetHistory(pet_id=noname.pet_id, event_type="NOTE", title="Seen near the market")])
db.commit()
body = {"keep_pet_id": kippy.pet_id, "reason": "Same white patch and torn left ear, owner confirmed by phone"}
check("G3 a reason is required", client.post(f"/pets/{noname.pet_id}/merge-into", json={**body, "reason": "same"}, headers=HA).status_code == 400)
check("G3 residents can't merge records", client.post(f"/pets/{noname.pet_id}/merge-into", json=body, headers=HO).status_code == 403)
check("G3 a dog can't be merged into a cat", client.post(f"/pets/{cat.pet_id}/merge-into", json=body, headers=HA).status_code == 400)
check("G3 records with different owners can't be merged",
      client.post(f"/pets/{stranger.pet_id}/merge-into", json=body, headers=HA).status_code == 409)
r = client.post(f"/pets/{noname.pet_id}/merge-into", json=body, headers=HA)
check("G3 staff merge the duplicate into the kept record", r.status_code == 200, r.text[:300])
db.expire_all()
nn, kp = db.get(Pet, noname.pet_id), db.get(Pet, kippy.pet_id)
check("G3 ...the duplicate is archived with a pointer (not deleted), so the AI stops suggesting it",
      nn is not None and nn.status == "Archived" and nn.merged_into_pet_id == kippy.pet_id)
check("G3 ...its report now points at the kept record", db.get(Report, R7).pet_id == kippy.pet_id)
check("G3 ...its history moved over, with a merge entry", db.query(PetHistory).filter(PetHistory.pet_id == kippy.pet_id,
      PetHistory.title.in_(["Seen near the market"])).count() == 1 and db.query(PetHistory).filter(
      PetHistory.pet_id == kippy.pet_id, PetHistory.event_type == "RECORD_MERGED").count() == 1)
check("G3 ...a duplicate suggestion on a report that already has one for the kept record is closed",
      db.get(ReportMatch, s_dup.match_id).status == "SUPERSEDED_BY_CASE" and db.get(ReportMatch, s_keep.match_id).status == "AI_SUGGESTED")
check("G3 ...the kept record's empty photo is filled from the duplicate, nothing overwritten", kp.photo_url == "https://cdn.example/noname.jpg"
      and kp.pet_name == "Kippy" and kp.owner_id == OWNER)
check("G3 ...the merge is logged", db.query(AuditLog).filter(AuditLog.action == "MERGE_PET_RECORD").count() == 1)
check("G3 merging the archived record again is refused", client.post(f"/pets/{noname.pet_id}/merge-into", json=body, headers=HA).status_code == 409)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
