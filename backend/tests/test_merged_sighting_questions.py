"""
Merged sightings of a case and the owner's optional "Is this still <pet>?" question (case #66 gaps):
  1. A confirmation on a report that was already linked to the pet (the owner's own lost-pet report) still shares
     the case's identity with its merged sightings: their open suggestions are covered by the case.
  2. Closing the case (e.g. returned to the owner) closes the still-open questions as NO_RESPONSE; reopening it
     puts them back.
  3. The owner's match-review page shows "Covered by Case" / "Closed with Case", never "Awaiting Response" for those.
  4. On a closed case the owner can still say a sighting was not their pet: recorded and sent to the leader as a
     note, the closed case's records unchanged. Other answers are refused (nothing left to decide).
  5. Staff returning a pet can list the unanswered sightings (information only); residents can't.
Run from the backend folder:  python tests/test_merged_sighting_questions.py
"""
import os
import sys
import tempfile
from datetime import datetime

_DB = os.path.join(tempfile.mkdtemp(), "merged_sighting_questions_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-merged-sightings-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches  # noqa: E402
from app.routes.matches import link_confirmed_pet_match  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(matches.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


owner = mk("Emma Owner", 1)
neighbour = mk("Nina Neighbour", 1)
leader = mk("Leo Leader", 2)
pet = Pet(pet_name="Rocky", pet_type="Dog", owner_id=owner.user_id, status="Lost")
db.add(pet)
db.flush()


def rep(t, **kw):
    r = Report(user_id=owner.user_id, subdivision_id=1, category_id=6, latitude=14.8, longitude=121.0,
               current_status_id=2, animal_type="Dog", assigned_leader_id=leader.user_id, created_at=datetime(2026, 10, t), **kw)
    db.add(r)
    db.flush()
    return r


root = rep(1, pet_id=pet.pet_id)                       # the owner's own lost-pet report: linked from the start
s2 = rep(2, duplicate_of_report_id=None)
s3 = rep(3)
db.flush()
s2.duplicate_of_report_id = root.report_id
s3.duplicate_of_report_id = root.report_id
s2.current_status_id = s3.current_status_id = 18
conf = ReportMatch(source_report_id=root.report_id, matched_pet_id=pet.pet_id, similarity_score=95, status="CONFIRMED_MATCH",
                   owner_confirmation_status="OWNER_CONFIRMED", verified_at=datetime(2026, 10, 4), reviewed_by=leader.user_id)
sug2 = ReportMatch(source_report_id=s2.report_id, matched_pet_id=pet.pet_id, similarity_score=90, status="AI_SUGGESTED",
                   owner_confirmation_status="PENDING")
db.add_all([conf, sug2])
db.add(PetClaim(pet_id=pet.pet_id, report_id=root.report_id, status="Approved", evidence_url="https://cdn.example/proof.jpg"))
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def m(match_id):
    db.expire_all()
    return db.get(ReportMatch, match_id)


# 1. confirmation on an already-linked report still covers the merged sightings
linked = link_confirmed_pet_match(db.get(ReportMatch, conf.match_id), db, leader)
db.commit()
check("1 the report was already linked: nothing new to link", linked is False)
check("1 ...but the merged sighting's open suggestion is now covered by the case", m(sug2.match_id).status == "COVERED_BY_CASE", m(sug2.match_id).status)
db.expire_all()
check("1 ...and the merged sighting inherits the pet", db.get(Report, s2.report_id).pet_id == pet.pet_id)
cov3 = db.query(ReportMatch).filter(ReportMatch.source_report_id == s3.report_id, ReportMatch.matched_pet_id == pet.pet_id).first()
check("1 ...the other merged sighting gets its own covered question", cov3 is not None and cov3.status == "COVERED_BY_CASE" and cov3.owner_confirmation_status == "PENDING")

# 3 (open case). the owner's page: covered sightings are optional, not "Awaiting Response"
def tabs():
    b = client.get(f"/matches/case-review/{root.report_id}", headers=H(owner)).json()
    return b, {t["report_id"]: t.get("tab_status") for t in b.get("reports", [])}


body, st = tabs()
check("3 open case: merged sightings read 'Covered by Case'", st.get(s2.report_id) == "Covered by Case" and st.get(s3.report_id) == "Covered by Case", st)
check("3 open case: case_closed is false", body.get("case_closed") is False, body.get("case_closed"))

# 5. staff list of the merged sightings (for their review before returning the pet)
r = client.get(f"/matches/case/{root.report_id}/merged-sightings", headers=H(leader))
check("5 staff see the 2 merged sightings with the owner's (empty) answer", r.status_code == 200
      and sorted(x["report_id"] for x in r.json()["sightings"]) == sorted([s2.report_id, s3.report_id])
      and all(x["owner_answer"] == "PENDING" and not x["disputed"] for x in r.json()["sightings"]), r.text[:300])
check("5 residents can't use it (403)", client.get(f"/matches/case/{root.report_id}/merged-sightings", headers=H(owner)).status_code == 403)

# 2. closing the case closes the questions
db.expire_all()
rt = db.get(Report, root.report_id)
rt.current_status_id = 9
db.commit()
check("2 returned to the owner: the open questions close as NO_RESPONSE",
      m(sug2.match_id).owner_confirmation_status == "NO_RESPONSE" and m(cov3.match_id).owner_confirmation_status == "NO_RESPONSE")
check("2 ...the staff/case status of those sightings is unchanged", m(sug2.match_id).status == "COVERED_BY_CASE")
check("2 ...the case's own confirmation is untouched", m(conf.match_id).owner_confirmation_status == "OWNER_CONFIRMED")
r = client.get(f"/matches/case/{root.report_id}/merged-sightings", headers=H(leader))
check("5 after closing, the sightings show 'no answer needed'", r.status_code == 200
      and all(x["owner_answer"] == "NO_RESPONSE" for x in r.json()["sightings"]), r.text[:300])

body, st = tabs()
check("3 closed case: merged sightings read 'Closed with Case'", st.get(s2.report_id) == "Closed with Case" and st.get(s3.report_id) == "Closed with Case", st)
check("3 closed case: case_closed is true with the case status", body.get("case_closed") is True and body.get("case_status_id") == 9, body.get("case_status_id"))

# 4. answering on a closed case
r = client.post(f"/matches/{cov3.match_id}/owner-feedback", headers=H(owner), json={"owner_confirmation": "OWNER_CONFIRMED", "report_id": s3.report_id})
check("4 closed case: 'yes' is refused (nothing left to decide)", r.status_code == 409, r.status_code)
before_notes = db.query(Notification).filter(Notification.user_id == leader.user_id).count()
r = client.post(f"/matches/{cov3.match_id}/owner-feedback", headers=H(owner),
                json={"owner_confirmation": "OWNER_REJECTED", "remarks": "Different collar", "report_id": s3.report_id})
check("4 closed case: 'this wasn't my pet' is accepted", r.status_code == 200, r.text[:200])
check("4 ...recorded as the owner's answer", m(cov3.match_id).owner_confirmation_status == "OWNER_REJECTED")
check("4 ...without changing the closed case (still covered, still linked)", m(cov3.match_id).status == "COVERED_BY_CASE"
      and db.get(Report, s3.report_id).pet_id == pet.pet_id)
check("4 ...and the leader gets a note", db.query(Notification).filter(Notification.user_id == leader.user_id).count() == before_notes + 1)

# 4. an open suggestion left on a closed case (like Match #86 before its repair): the note still goes through
s4 = rep(5)
s4.duplicate_of_report_id, s4.current_status_id = root.report_id, 18
left_open = ReportMatch(source_report_id=s4.report_id, matched_pet_id=pet.pet_id, similarity_score=88, status="AI_SUGGESTED",
                        owner_confirmation_status="PENDING")
db.add(left_open)
db.commit()
r = client.post(f"/matches/{left_open.match_id}/owner-feedback", headers=H(owner),
                json={"owner_confirmation": "OWNER_REJECTED", "report_id": s4.report_id})
check("4 open suggestion on a closed case: 'this wasn't my pet' is accepted (not 409)", r.status_code == 200, r.text[:200])
check("4 ...and the suggestion itself is left as it was", m(left_open.match_id).status == "AI_SUGGESTED")

# 2. reopening the case puts the closed questions back
db.expire_all()
rt = db.get(Report, root.report_id)
rt.current_status_id = 7
db.commit()
check("2 reopened: the question closed with the case is open again", m(sug2.match_id).owner_confirmation_status == "PENDING")
check("2 ...and its note no longer says it was closed", "[Closed with the case]" not in (m(sug2.match_id).verification_notes or ""))
check("2 ...the owner's real answer is kept", m(cov3.match_id).owner_confirmation_status == "OWNER_REJECTED")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
