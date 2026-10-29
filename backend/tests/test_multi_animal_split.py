"""
MULTI_ANIMAL_REPORT_PLAN.md: a group report is split into per-animal records by the Subdivision Leader.
Covers permissions, atomic/idempotent splits, batches above 10, carry-over, photos kept as evidence, AI re-matching,
holding per animal, claims and returns per animal, group auto-resolve, adoption, merging and dashboard counts.
Run from the backend folder:  python tests/test_multi_animal_split.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "multi_animal_split_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-multi-animal-split-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.ai_job import AiJob  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_claim import PetClaim  # noqa: E402
from app.models.report import (FacilityStatus, HoldingAnimal, Report, ReportCategory, ReportMedia,  # noqa: E402
                               ReportStatus, StatusHistory)
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import admin, audit_logs, claims, holding, report_split, reports  # noqa: E402
from app.utils import report_split as rs  # noqa: E402
from app.utils.ai_matching import image_url_for_entity  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.uploads import CLOUDINARY_CLOUD_NAME  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (reports, report_split, claims, holding, admin, audit_logs):
    api.include_router(r.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

CN = CLOUDINARY_CLOUD_NAME or "demo"
URL = lambda name: f"https://res.cloudinary.com/{CN}/image/upload/v1/{name}.jpg"  # noqa: E731

for rid, rn in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=rn))
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.add(Barangay(barangay_id=2, barangay_name="B2", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2"))
db.add(ReportCategory(category_id=4, category_name="Roaming"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for sid in range(1, 9):
    db.add(FacilityStatus(status_id=sid, status_name=f"F{sid}"))
db.flush()


def mk(name, role, subd=1, brgy=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd if role in (1, 2) else None, barangay_id=brgy,
             phone="09170000000")
    db.add(u)
    db.flush()
    return u


reporter = mk("Rita Reporter", 1)
owner_a = mk("Olga Owner", 1)
owner_b = mk("Omar Owner", 1)
leader = mk("Leo Leader", 2)
other_leader = mk("Lara Leader", 2, subd=2, brgy=2)
staff = mk("Sam Staff", 3)
other_staff = mk("Sid Staff", 3, brgy=2)
admin_u = mk("Ada Admin", 4)
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok  " if ok else "  FAIL") + f" {label}" + ("" if ok else f"  -> {str(extra)[:300]}"))


def group_report(count=3, status=1, subd=1):
    r = Report(user_id=reporter.user_id, subdivision_id=subd, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", animal_count=count, description="Three dogs by the gate",
               visibility="Public", visibility_decided_by=leader.user_id, verification_status="verified_true",
               assigned_leader_id=leader.user_id)
    db.add(r)
    db.flush()
    db.add(ReportMedia(report_id=r.report_id, file_url=URL(f"group{r.report_id}"), media_type="Image"))
    db.commit()
    return r.report_id


def animals(n, tag="dog"):
    return [{"photo_url": URL(f"{tag}{i}"), "animal_type": "Dog", "animal_color": f"Color {i}", "estimated_size": "Medium",
             "sex": "Male" if i % 2 else "Female", "notes": f"dog {i}"} for i in range(1, n + 1)]


def split(rid, n, user=leader, token="tok-default-1", carry=None, tag="dog"):
    return client.post(f"/reports/{rid}/split", headers=H(user),
                       json={"client_token": token, "animals": animals(n, tag), "carry": carry or {}})


# ------------------------------------------------------------------ permissions
G = group_report()
check("a resident can't split (403)", split(G, 3, user=reporter, token="tok-res-1").status_code == 403)
check("barangay staff can't split (403)", split(G, 3, user=staff, token="tok-stf-1").status_code == 403)
check("an admin can't split (403)", split(G, 3, user=admin_u, token="tok-adm-1").status_code == 403)
check("another subdivision's leader can't split (403)", split(G, 3, user=other_leader, token="tok-oth-1").status_code == 403)
check("a split needs at least 2 animals", split(G, 1, token="tok-one-1").status_code == 400)
check("more than 10 animals at once is refused, with guidance", split(G, 11, token="tok-eleven").status_code == 400
      and "at a time" in split(G, 11, token="tok-eleven").text)
db.expire_all()
check("...and nothing was created by refused requests", db.query(Report).filter(Report.split_from_report_id == G).count() == 0)

bad = client.post(f"/reports/{G}/split", headers=H(leader), json={"client_token": "tok-bad-url", "animals": [
    {"photo_url": "https://evil.example/x.jpg"}, {"photo_url": URL("ok")}]})
check("a photo that isn't our Cloudinary image is refused", bad.status_code == 400, bad.text)
db.expire_all()
check("...and the split is all-or-nothing (no partial records)", db.query(Report).filter(Report.split_from_report_id == G).count() == 0)

# ------------------------------------------------------------------ split, atomic and idempotent
r = split(G, 3, token="tok-main-1")
check("the leader splits a 3-dog report", r.status_code == 200 and len(r.json()["created"]) == 3, r.text)
kids = r.json()["created"]
again = split(G, 3, token="tok-main-1")
db.expire_all()
check("the same request sent twice returns the first result (no duplicates)",
      again.status_code == 200 and again.json()["reused"] is True and again.json()["created"] == kids, again.text)
check("...still exactly 3 animal records", len(rs.active_children(db, db.get(Report, G))) == 3)
c1 = db.get(Report, kids[0])
check("each record links to the group and holds one animal",
      all(db.get(Report, k).split_from_report_id == G and db.get(Report, k).animal_count == 1 for k in kids))
check("details are copied from the group (reporter, subdivision, status)",
      c1.user_id == reporter.user_id and c1.subdivision_id == 1 and c1.current_status_id == 1)
check("each record has its own cropped photo as its main photo", image_url_for_entity(c1) == URL("dog1"), image_url_for_entity(c1))
group = db.get(Report, G)
check("the group report keeps its original photo (evidence)", image_url_for_entity(group) == URL(f"group{G}"))
check("the group report is not changed or deleted (count still 3)", group.animal_count == 3)
check("timeline entries on the group and the records",
      db.query(StatusHistory).filter(StatusHistory.report_id == G, StatusHistory.remarks.like("Split into%")).count() == 1
      and db.query(StatusHistory).filter(StatusHistory.report_id == kids[1], StatusHistory.remarks.like("Animal record created%")).count() == 1)
check("an audit entry records the split", db.query(AuditLog).filter(AuditLog.action == rs.SPLIT_ACTION, AuditLog.target_id == G).count() == 1)
check("AI analysis and matching are queued for each animal",
      all(db.query(AiJob).filter(AiJob.report_id == k).count() >= 2 for k in kids))
grp = client.get(f"/reports/{kids[1]}/split-group", headers=H(reporter)).json()
check("the reporter sees 'Animal 2 of 3 from Report #G'", grp.get("label") == f"Animal 2 of 3 from Report #{G}", grp)
check("a record can't be split again", split(kids[0], 2, token="tok-child-1").status_code == 400)

# batches: more than 10 animals in total, group kept
G2 = group_report(count=13)
check("first batch of 10", split(G2, 10, token="tok-g2-a").status_code == 200)
r = split(G2, 3, token="tok-g2-b", tag="more")
db.expire_all()
check("the remaining 3 are added to the same group (13 in total)", r.status_code == 200
      and len(rs.active_children(db, db.get(Report, G2))) == 13, r.text)

# ------------------------------------------------------------------ matching and merging
check("the group report is skipped by AI matching", rs.is_split_group(db, db.get(Report, G))
      and db.query(Report).filter(Report.report_id == G, rs.not_split_group_filter()).count() == 0)
check("an animal record is still a matching candidate",
      db.query(Report).filter(Report.report_id == kids[0], rs.not_split_group_filter()).count() == 1)
m = client.post("/reports/merge-group", headers=H(leader), json={"report_ids": [G, kids[0]], "notes": "same dog really"})
check("a split group report can't be merged (409)", m.status_code == 409, m.text)

# ------------------------------------------------------------------ carry-over of what the group already had
G3 = group_report(count=2, status=8)
pet_a = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner_a.user_id, status="Active")
db.add(pet_a)
db.flush()
held = HoldingAnimal(report_id=G3, facility_status=2, animal_type="Dog")
db.add(held)
db.add(PetClaim(report_id=G3, pet_id=pet_a.pet_id, status="Pending Review"))
open_sug = ReportMatch(source_report_id=G3, matched_pet_id=pet_a.pet_id, similarity_score=70, status="AI_SUGGESTED",
                       owner_confirmation_status="PENDING")
db.add(open_sug)
db.commit()
check("the leader must say which animal is the one already in holding",
      split(G3, 2, token="tok-g3-a").status_code == 400)
r = split(G3, 2, token="tok-g3-b", carry={"holding": 1, "claims": 1})
db.expire_all()
g3k = r.json().get("created", [])
check("carry-over: the holding record and claims move to the chosen animal", r.status_code == 200
      and db.get(HoldingAnimal, held.holding_id).report_id == g3k[1]
      and db.query(PetClaim).filter(PetClaim.report_id == g3k[1]).count() == 1, r.text)
check("the group's open AI suggestions are closed as superseded",
      db.get(ReportMatch, open_sug.match_id).status == "SUPERSEDED_BY_CASE")

# ------------------------------------------------------------------ holding per animal
a1 = client.post("/holding/", headers=H(staff), json={"report_id": kids[0], "animal_type": "Dog", "facility_status": 2})
a2 = client.post("/holding/", headers=H(staff), json={"report_id": kids[1], "animal_type": "Dog", "facility_status": 2})
check("each animal record gets its own holding record", a1.status_code == 200 and a2.status_code == 200, a1.text + a2.text)
check("...a second intake for the same animal is still refused",
      client.post("/holding/", headers=H(staff), json={"report_id": kids[0], "facility_status": 2}).status_code in (400, 409))

# ------------------------------------------------------------------ replace photo (kept as evidence, AI re-run)
db.expire_all()
jobs_before = db.query(AiJob).filter(AiJob.report_id == kids[0]).count()
check("a resident can't replace a photo (403)", client.post(f"/reports/{kids[0]}/replace-photo", headers=H(reporter),
      json={"photo_url": URL("close1")}).status_code == 403)
check("staff of another barangay can't (403)", client.post(f"/reports/{kids[0]}/replace-photo", headers=H(other_staff),
      json={"photo_url": URL("close1")}).status_code == 403)
check("the group report's photo can't be replaced (it's per animal)",
      client.post(f"/reports/{G}/replace-photo", headers=H(leader), json={"photo_url": URL("x")}).status_code == 400)
r = client.post(f"/reports/{kids[0]}/replace-photo", headers=H(staff), json={"photo_url": URL("close1"), "note": "at intake"})
db.expire_all()
c1 = db.get(Report, kids[0])
check("barangay staff replace the photo at intake", r.status_code == 200 and r.json()["kept_as_evidence"] == 1, r.text)
check("the close-up becomes the main photo used for matching", image_url_for_entity(c1) == URL("close1"), image_url_for_entity(c1))
old = db.query(ReportMedia).filter(ReportMedia.report_id == kids[0], ReportMedia.file_url == URL("dog1")).first()
check("the earlier photo is kept as evidence on the timeline", old is not None and old.is_evidence and old.history_id)
check("AI matching is re-queued", db.query(AiJob).filter(AiJob.report_id == kids[0]).count() > jobs_before)
r = client.post(f"/reports/{kids[1]}/replace-photo", headers=H(leader), json={"photo_url": URL("close2")})
check("the subdivision leader can replace a photo too", r.status_code == 200, r.text)
c1.current_status_id = 8
c1.custody_status = "Impounded"
db.commit()
check("a held animal record can still be matched (owner search)", rs.held_scan_allowed(db, c1))

# ------------------------------------------------------------------ claims, returns, group auto-resolve
pet_b = Pet(pet_name="Brownie", pet_type="Dog", owner_id=owner_b.user_id, status="Active")
pet_c = Pet(pet_name="Choco", pet_type="Dog", owner_id=owner_a.user_id, status="Active")
db.add_all([pet_b, pet_c])
db.commit()
for kid in (kids[1], kids[2]):   # a claim is only for a held animal (Phase 6)
    db.get(Report, kid).custody_status = "In Barangay Facility"
db.commit()
ca = client.post("/claims/", headers=H(owner_b), json={"report_id": kids[1], "pet_id": pet_b.pet_id})
cb = client.post("/claims/", headers=H(owner_a), json={"report_id": kids[2], "pet_id": pet_c.pet_id})
check("two different owners claim two different animals from one group", ca.status_code == 200 and cb.status_code == 200,
      ca.text[:200] + cb.text[:200])
db.expire_all()
kid1 = db.get(Report, kids[1])
kid1.current_status_id = 9  # returned to its owner
db.commit()
db.expire_all()
check("one animal going home closes only its own record", db.get(Report, kids[1]).current_status_id == 9
      and db.get(Report, kids[2]).current_status_id != 9 and db.get(Report, G).current_status_id not in (9, 11))
for k in (kids[0], kids[2]):
    db.get(Report, k).current_status_id = 9 if k == kids[2] else 10
db.commit()
db.expire_all()
check("when every animal record is closed, the group report is resolved", db.get(Report, G).current_status_id == 11)
_endings = [h.remarks for h in db.query(StatusHistory).filter(
    StatusHistory.report_id == G, StatusHistory.remarks.like("Animal % from this report (record #%")).all()]
# every animal's ending is recorded (animal 1 has two: impounded, then released)
check("the group timeline says how each animal's case ended",
      all(any(f"(record #{k})" in t for t in _endings) for k in kids) and len(_endings) == 4, _endings)
check("...with a timeline note", db.query(StatusHistory).filter(StatusHistory.report_id == G,
                                                                 StatusHistory.remarks.like("All 3 animal records%")).count() == 1)

# ------------------------------------------------------------------ an animal record in holding
G4 = group_report(count=2, status=6)
_r4 = split(G4, 2, token="tok-g4-split")
k4 = _r4.json()["created"]
h4 = client.post("/holding/", headers=H(staff), json={"report_id": k4[0], "animal_type": "Dog", "facility_status": 2})
check("an animal record can be admitted to holding", h4.status_code == 200, h4.text[:200])

# ------------------------------------------------------------------ undo
G5 = group_report(count=2)
k5 = split(G5, 2, token="tok-g5-split").json()["created"]
check("undo is refused for another subdivision's leader", client.post(f"/reports/{G5}/unsplit", headers=H(other_leader)).status_code == 403)
r = client.post(f"/reports/{G5}/unsplit", headers=H(leader))
db.expire_all()
check("undo works while the records are empty", r.status_code == 200 and not rs.is_split_group(db, db.get(Report, G5)), r.text)
check("...the records are kept (folded back, not deleted)", all(db.get(Report, k) is not None and db.get(Report, k).duplicate_of_report_id == G5 for k in k5))
check("undo is refused once an animal is in holding", client.post(f"/reports/{G4}/unsplit", headers=H(leader)).status_code == 409)

# ------------------------------------------------------------------ dashboard counts
stats = client.get("/admin/dashboard-stats", headers=H(admin_u))
incidents = db.query(Report).filter(Report.split_from_report_id.is_(None)).count()
active_records = db.query(Report).filter(Report.split_from_report_id.isnot(None)).count() - len(k5)
check("admin dashboard counts incidents only", stats.status_code == 200 and stats.json()["total_reports"] == incidents,
      (stats.status_code, stats.text[:200]))
check("...and shows animal records separately", stats.json().get("animal_records_count") == active_records, stats.json().get("animal_records_count"))
pins = stats.json().get("active_map_reports", [])
pin_ids = {p["report_id"] for p in pins}
check("admin map shows one pin per incident (no animal-record pins under a listed group)",
      not any(db.get(Report, p["report_id"]).split_from_report_id in pin_ids for p in pins), len(pins))

# ------------------------------------------------------------------ admin oversight: audit log preset
logs = client.get("/audit-logs/", params={"action_group": "multi_animal", "limit": 100}, headers=H(admin_u))
acts = {x["action"] for x in logs.json().get("items", logs.json().get("logs", []))} if logs.status_code == 200 else set()
check("admin can filter the audit log to multi-animal actions", logs.status_code == 200 and "REPORT_SPLIT" in acts
      and acts <= set(audit_logs.ACTION_GROUPS["multi_animal"]), (logs.status_code, sorted(acts), logs.text[:200]))
check("...an unknown preset is refused (400)",
      client.get("/audit-logs/", params={"action_group": "nope"}, headers=H(admin_u)).status_code == 400)
check("...and leaders can't read the audit log",
      client.get("/audit-logs/", params={"action_group": "multi_animal"}, headers=H(leader)).status_code == 403)
lst = client.get("/reports/", headers=H(leader)).json()
grow = next((x for x in lst if x["report_id"] == G2), {})
check("report lists carry the group link and record count",
      grow.get("split_children_count") == 13 and any(x.get("split_from_report_id") == G for x in lst), grow)

# ------------------------------------------------------------------ status sync: records follow the group until held
from app.models.landmark import Landmark  # noqa: E402
fac = Landmark(name="Impound", category="facility", barangay_id=1, latitude=14.8, longitude=121.0, is_holding_facility=True)
db.add(fac)
db.commit()
G6 = group_report(count=3, status=2)
k6 = split(G6, 3, token="tok-g6-sync").json()["created"]
db.expire_all()
g6 = db.get(Report, G6)
g6.current_status_id = 5          # rescue in progress, set on the group
db.commit()
db.expire_all()
check("a group status update reaches its animal records", all(db.get(Report, k).current_status_id == 5 for k in k6))
check("...with a timeline entry on each record", all(
    db.query(StatusHistory).filter(StatusHistory.report_id == k, StatusHistory.remarks.like("Status follows group%")).count() == 1 for k in k6))
g6 = db.get(Report, G6)
g6.current_status_id = 6
g6.custody_status = "Animal Picked Up"
db.commit()
db.expire_all()
check("custody follows too (picked up)", all(db.get(Report, k).current_status_id == 6
                                                and db.get(Report, k).custody_status == "Animal Picked Up" for k in k6))

# one animal is taken into holding on its own first
own = client.post("/holding/", headers=H(staff), json={"report_id": k6[0], "animal_type": "Dog", "facility_status": 2})
check("one animal record is taken into holding on its own", own.status_code == 200, own.text[:200])
db.expire_all()
before_own = db.get(Report, k6[0]).current_status_id
check("the group report itself can't be taken into holding (per animal instead)",
      client.post("/holding/", headers=H(staff), json={"report_id": G6, "facility_status": 2}).status_code == 400)

# the group reaches the facility through the normal status update, by the staff assigned to its rescue
from app.models.report import Rescue  # noqa: E402
db.add(Rescue(report_id=G6, staff_id=staff.user_id))
db.commit()
r = client.put(f"/reports/{G6}/status", headers=H(staff), json={"status_id": 8, "facility_id": fac.landmark_id,
                                                                    "custody_status": "In Barangay Facility",
                                                                    "remarks": "All dogs brought in"})
db.expire_all()
holds = {k: db.query(HoldingAnimal).filter(HoldingAnimal.report_id == k).count() for k in k6}
check("the group intake gives each remaining animal its own holding record", r.status_code == 200
      and holds[k6[1]] == 1 and holds[k6[2]] == 1, (r.status_code, r.text[:200], holds))
check("...no extra holding record for the animal that was already in", holds[k6[0]] == 1)
check("...and none for the group report itself", db.query(HoldingAnimal).filter(HoldingAnimal.report_id == G6).count() == 0)
check("the animals taken in with the group are Impounded at the group's facility",
      all(db.get(Report, k).current_status_id == 8 and db.get(Report, k).facility_id == fac.landmark_id for k in k6[1:]))
check("the animal that already had its own holding record no longer follows the group",
      db.get(Report, k6[0]).current_status_id == before_own)

# closing statuses never spread
G7 = group_report(count=2, status=2)
k7 = split(G7, 2, token="tok-g7-close").json()["created"]
db.expire_all()
from fastapi import HTTPException as _HE7  # noqa: E402
db.get(Report, G7).current_status_id = 14   # false alarm on the group, while its animals are open
try:
    db.commit()
    g7_refused = False
except _HE7:
    g7_refused = True
    db.rollback()
db.expire_all()
check("a closing status on the group is refused while animals are open (SYSTEM_AUDIT 4.4)", g7_refused)
check("...and never copied to its animal records", all(db.get(Report, k).current_status_id == 2 for k in k7))

# ------------------------------------------------------------------ visibility sync: the incident decides
from app.utils.report_visibility import is_publicly_visible  # noqa: E402
G8 = group_report(count=2, status=2)
db.expire_all()
g8 = db.get(Report, G8)
g8.visibility, g8.visibility_decided_by, g8.verification_status = "Private", None, "unverified"
db.commit()
k8 = split(G8, 2, token="tok-g8-visibility").json()["created"]
db.expire_all()
check("animal records start with the group's visibility (Private)", all(db.get(Report, k).visibility == "Private" for k in k8))
r = client.patch(f"/reports/{G8}/visibility", headers=H(leader), json={"visibility": "Public", "reason": "Warn neighbours"})
db.expire_all()
check("the leader makes the group Public", r.status_code == 200 and db.get(Report, G8).visibility == "Public", (r.status_code, r.text[:200]))
check("...its animal records become Public too, with the same decision",
      all(db.get(Report, k).visibility == "Public" and db.get(Report, k).visibility_decided_by == leader.user_id for k in k8))
check("...so residents can see the animal records", all(is_publicly_visible(db.get(Report, k)) for k in k8))
r = client.patch(f"/reports/{G8}/visibility", headers=H(leader), json={"visibility": "Private", "reason": "Owner asked"})
db.expire_all()
check("making the group Private hides its animal records again", r.status_code == 200
      and all(db.get(Report, k).visibility == "Private" and not is_publicly_visible(db.get(Report, k)) for k in k8), r.text[:200])
db.get(Report, k8[1]).verification_status = "false_alarm"
db.commit()
g8 = db.get(Report, G8)
g8.verification_status, g8.verified_by_user_id = "verified_true", leader.user_id
db.commit()
db.expire_all()
check("verifying the group verifies its animal records", db.get(Report, k8[0]).verification_status == "verified_true")
check("...but never overrides an animal found to be a false alarm", db.get(Report, k8[1]).verification_status == "false_alarm")

# ------------------------------------------------------------------ reporter notifications: one per group
from app.models.notification import Notification  # noqa: E402
from app.utils.notification_dispatcher import notify_report_status_update  # noqa: E402
G9 = group_report(count=3, status=2)
k9 = split(G9, 3, token="tok-g9-notify").json()["created"]
db.expire_all()
title = f"{rs.GROUP_NOTE_PREFIX}{G9}"
note_count = lambda: db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.title == title).count()  # noqa: E731
per_animal = lambda: db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.related_id.in_(k9)).count()  # noqa: E731
for k, st in ((k9[0], 8), (k9[1], 8), (k9[2], 6)):
    rec = db.get(Report, k)
    rec.current_status_id = st
    db.flush()
    notify_report_status_update(db, reporter, k, st, {8: "Impounded", 6: "Picked Up"}[st])
    db.commit()
db.expire_all()
check("three animal updates give the reporter ONE notification for the group", note_count() == 1, note_count())
check("...and no separate per-animal notifications", per_animal() == 0, per_animal())
n = db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.title == title).first()
check("...it shows every animal's latest status and opens the group report",
      n.related_id == G9 and "Animal 1: S8" in n.message and "Animal 3: S6" in n.message, n.message)
n.is_read = True
db.commit()
rec = db.get(Report, k9[2])
rec.current_status_id = 10
db.flush()
notify_report_status_update(db, reporter, k9[2], 10, "Released")
db.commit()
db.expire_all()
check("after the reporter reads it, the next update starts a new notification", note_count() == 2, note_count())
G10 = group_report(count=1, status=2)
db.expire_all()
notify_report_status_update(db, reporter, G10, 5, "Rescue In Progress")
db.commit()
check("an ordinary report still gets its usual notification",
      db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.related_id == G10,
                                    Notification.title == "Report Update: Rescue In Progress").count() == 1)

# ------------------------------------------------------------------ reported vs recorded count
G11 = group_report(count=3, status=2)
split(G11, 2, token="tok-g11-count")
info = client.get(f"/reports/{G11}/split-group", headers=H(leader)).json()
check("the group shows 2 of 3 reported animals recorded", info["reported_count"] == 3 and info["recorded_count"] == 2
      and info["count_note"] is None, info)
check("only the subdivision leader can say fewer were found", client.post(f"/reports/{G11}/count-note", headers=H(staff),
      json={"reason": "Only two dogs on site"}).status_code == 403)
check("a reason is required", client.post(f"/reports/{G11}/count-note", headers=H(leader), json={"reason": "no"}).status_code == 422)
r = client.post(f"/reports/{G11}/count-note", headers=H(leader), json={"reason": "Only two dogs were on site"})
check("the leader records why fewer were found", r.status_code == 200 and r.json()["count_note"]["reason"] == "Only two dogs were on site"
      and r.json()["count_note"]["by"] == leader.name, r.text[:300])
db.expire_all()
check("...the reported count stays as the resident reported it", db.get(Report, G11).animal_count == 3)
check("...and the group timeline says so", db.query(StatusHistory).filter(StatusHistory.report_id == G11,
      StatusHistory.remarks.like("2 of 3 reported animals recorded%")).count() == 1)
split(G11, 1, token="tok-g11-more", tag="late")
info = client.get(f"/reports/{G11}/split-group", headers=H(reporter)).json()
check("adding the missing animal later replaces the note (3 of 3)", info["recorded_count"] == 3 and info["count_note"] is None, info)
check("a note isn't needed once every reported animal has a record",
      client.post(f"/reports/{G11}/count-note", headers=H(leader), json={"reason": "Only two dogs were on site"}).status_code == 400)

# ------------------------------------------------------------------ priority: the incident's
from app.schemas.report import effective_priority  # noqa: E402
from app.utils import ai_pipeline  # noqa: E402
G12 = group_report(count=2, status=2)
db.expire_all()
g12 = db.get(Report, G12)
g12.ai_suggested_priority, g12.priority_level = "Low Priority", "Medium"
db.commit()
k12 = split(G12, 2, token="tok-g12-priority").json()["created"]
db.expire_all()
eff = lambda r: effective_priority(r.ai_suggested_priority, r.ai_suggested_risk_level, r.priority_level)  # noqa: E731
check("animal records show the group's priority (Low, not the stored Medium)",
      all(eff(db.get(Report, k)) == "Low" for k in k12), [eff(db.get(Report, k)) for k in k12])
g12 = db.get(Report, G12)
g12.ai_suggested_priority = "High Priority"
db.commit()
db.expire_all()
check("when the group's priority changes, its animal records follow", all(eff(db.get(Report, k)) == "High" for k in k12))
orig = ai_pipeline.__dict__.get("generate_ai_suggestions")
import app.utils.ai_suggestions as _sugg  # noqa: E402
_real = _sugg.generate_ai_suggestions
_sugg.generate_ai_suggestions = lambda **kw: {"ai_suggested_priority": "Medium Priority", "ai_suggested_priority_reason": "own guess",
                                              "ai_suggested_risk_level": "Aggressive", "ai_possible_breed": "Aspin"}
try:
    rec = db.get(Report, k12[0])
    ai_pipeline._refresh_suggestions(rec, {"animal_type": "Dog"})
    db.commit()
finally:
    _sugg.generate_ai_suggestions = _real
db.expire_all()
rec = db.get(Report, k12[0])
check("an animal record's own AI analysis keeps the incident's priority", eff(rec) == "High" and rec.ai_suggested_priority == "High Priority")
check("...but still fills in that animal's own risk and details", rec.ai_suggested_risk_level == "Aggressive" and rec.ai_possible_breed == "Aspin")

# ------------------------------------------------------------------ one animal record per animal, never one for the group
from fastapi import HTTPException as _HTTPExc  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.utils.case_groups import require_case_pet  # noqa: E402
from app.utils.case_review import report_has_animal_record, require_animal_record  # noqa: E402
G13 = group_report(count=2, status=2)
k13 = split(G13, 2, token="tok-g13-records").json()["created"]
db.expire_all()
g13 = db.get(Report, G13)
pet13 = Pet(pet_name="Brownie", pet_type="Dog")
db.add(pet13)
db.commit()
try:
    require_case_pet(db, g13, pet13.pet_id)
    refused = None
except _HTTPExc as e:
    refused = e
check("a pet record can't be linked to a group report (409, names the animal records)",
      refused is not None and refused.status_code == 409 and all(f"#{k}" in refused.detail for k in k13),
      getattr(refused, "detail", None))
check("...the group needs every animal recorded before it can be escalated", not report_has_animal_record(g13, db))
try:
    require_animal_record(g13, db, "escalated to the Barangay")
    msg = ""
except _HTTPExc as e:
    msg = e.detail
check("...and the message lists the animals still missing a record", all(f"#{k}" in msg for k in k13), msg)
db.get(Report, k13[0]).pet_id = pet13.pet_id
db.commit()
check("...one recorded animal isn't enough", not report_has_animal_record(db.get(Report, G13), db))
db.get(Report, k13[1]).current_status_id = 14
db.commit()
check("...an animal dismissed as a false alarm needs no record, so the group can now move on",
      report_has_animal_record(db.get(Report, G13), db))
check("...a single-animal report still needs its own record", not report_has_animal_record(db.get(Report, group_report(count=1)), db))

# ------------------------------------------------------------------ a group and its animals are never "duplicates"
from app.routes import matches as _matches_routes  # noqa: E402
api.include_router(_matches_routes.router)
G14 = group_report(count=2, status=2)
k14 = split(G14, 2, token="tok-g14-family").json()["created"]
db.expire_all()
g14, a14, b14 = db.get(Report, G14), db.get(Report, k14[0]), db.get(Report, k14[1])
check("an animal record and its group are one family", rs.same_split_family(a14, g14) and rs.same_split_family(a14, b14))
check("...a report from another incident is not", not rs.same_split_family(a14, db.get(Report, G13)))
fam_ids = {r.report_id for r in db.query(Report).filter(rs.not_same_family_filter(a14)).all()}
check("...the matching candidates leave out the animal's group and siblings",
      G14 not in fam_ids and k14[1] not in fam_ids and G13 in fam_ids)
db.add(ReportMatch(source_report_id=k14[0], matched_report_id=G14, similarity_score=100, status="AI_SUGGESTED"))
db.commit()
dup = client.get(f"/matches/duplicates/report/{G14}", headers=H(leader))
check("...an old group-vs-animal suggestion is hidden from the duplicate banner",
      dup.status_code == 200 and not any({x.get("source_report_id"), x.get("matched_report_id")} == {k14[0], G14} for x in dup.json()),
      (dup.status_code, dup.text[:200]))

# ------------------------------------------------------------------ group page: each animal's own AI analysis
a14 = db.get(Report, k14[0])
a14.ai_possible_breed, a14.ai_suggested_risk_level = "Aspin", "Low Risk"
db.commit()
sg = client.get(f"/reports/{G14}/split-group", headers=H(leader)).json()
mine = next((c for c in sg.get("children", []) if c["report_id"] == k14[0]), {})
check("officials see each animal's own AI analysis on the group", (mine.get("ai") or {}).get("breed") == "Aspin"
      and mine["ai"].get("risk_level") == "Low Risk", mine)
sg_res = client.get(f"/reports/{G14}/split-group", headers=H(reporter))
check("...residents don't get AI suggestions", sg_res.status_code != 200 or all("ai" not in c for c in sg_res.json().get("children", [])))

# ------------------------------------------------------------------ an impounded animal ends its record for the group
G15 = group_report(count=2, status=2)
k15 = split(G15, 2, token="tok-g15-impound").json()["created"]
db.expire_all()
db.get(Report, k15[0]).current_status_id = 9    # claimed by owner
db.commit()
check("one animal claimed, the other still open: the group stays open", db.get(Report, G15).current_status_id != 11)
db.get(Report, k15[1]).current_status_id = 8    # impounded
db.commit()
db.expire_all()
check("one claimed + one impounded: the group report is resolved", db.get(Report, G15).current_status_id == 11,
      db.get(Report, G15).current_status_id)
tl15 = [h.remarks or "" for h in db.query(StatusHistory).filter(StatusHistory.report_id == G15).all()]
check("...and the group's timeline records the impounded animal", any(f"record #{k15[1]}" in t for t in tl15), tl15)

# ------------------------------------------------------------------ a group can't be closed by hand while an animal is open
G16 = group_report(count=2, status=2)
k16 = split(G16, 2, token="tok-g16-guard").json()["created"]
db.expire_all()
r = client.post(f"/reports/{G16}/mark-false-alarm", headers=H(leader), json={"reason": "No Animal Found"})
db.expire_all()
check("dismissing a group report while its animals are open is refused (409)", r.status_code == 409
      and all(f"#{k}" in r.text for k in k16), (r.status_code, r.text[:200]))
check("...and nothing changed", db.get(Report, G16).current_status_id == 2
      and all(db.get(Report, k).current_status_id != 14 for k in k16))
from fastapi import HTTPException as _HE  # noqa: E402
g16 = db.get(Report, G16)
g16.current_status_id = 11
try:
    db.commit()
    blocked = False
except _HE as e:
    blocked = e.status_code == 409
    db.rollback()
check("resolving it by any other route is refused too", blocked)
db.expire_all()
db.get(Report, k16[0]).current_status_id = 9
db.commit()
g16 = db.get(Report, G16)
g16.current_status_id = 14
try:
    db.commit()
    blocked = False
except _HE:
    blocked = True
    db.rollback()
check("...still refused while one animal is open", blocked)
db.expire_all()
db.get(Report, k16[1]).current_status_id = 17   # the last animal: cannot be found
db.commit()
db.expire_all()
check("closing the last animal closes the group by itself", db.get(Report, G16).current_status_id == 11,
      db.get(Report, G16).current_status_id)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
