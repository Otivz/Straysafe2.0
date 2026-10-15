"""
Phase 0 of RESCUE_TIMELINE_IMPROVEMENT_PLAN.md:
  0a. Holding facility records need sign-in. The full records (medical notes, staff, the whole care log) are for
      officials; residents get GET /holding/by-report/{id}, only for a report they may open, without private fields.
      The reporter and the pet's owner read the care notes; other residents see titles only.
  0b. Evidence photos (claims, disputes, handover) never reach other residents through the report's timeline entries.
Run from the backend folder:  python tests/test_holding_privacy.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "holding_privacy_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-holding-privacy-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import (FacilityStatus, HoldingAnimal, HoldingTimeline, Report, ReportMedia,  # noqa: E402
                               ReportStatus, StatusHistory)
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import holding, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(holding.router)
api.include_router(reports.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for fid in range(1, 9):
    db.add(FacilityStatus(status_id=fid, status_name=f"F{fid}"))
db.flush()


def mk(name, role, subd=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subd, barangay_id=1)
    db.add(u)
    db.flush()
    return u


reporter = mk("Rita Reporter", 1)
owner = mk("Olga Owner", 1)
neighbour = mk("Nina Neighbour", 1)
leader = mk("Leo Leader", 2)
pet = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Lost")
db.add(pet)
db.flush()


def mk_report(visibility, decided=True):
    r = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
               current_status_id=7, animal_type="Dog", pet_id=pet.pet_id, assigned_leader_id=leader.user_id,
               visibility=visibility, verification_status="verified_true",
               visibility_decided_by=leader.user_id if decided else None)
    db.add(r)
    db.flush()
    return r


PUB = mk_report("Public")
PRIV = mk_report("Private")
animal = HoldingAnimal(report_id=PUB.report_id, animal_type="Dog", animal_name="Bantay", facility_status=2,
                       medical_notes="SECRET-MEDICAL-NOTE", kennel_slot="PEN-7", intake_staff_id=leader.user_id,
                       intake_date=datetime(2026, 10, 1))
db.add(animal)
db.add(HoldingAnimal(report_id=PRIV.report_id, animal_type="Dog", facility_status=2, intake_date=datetime(2026, 10, 1)))
db.flush()
log = HoldingTimeline(holding_id=animal.holding_id, event_type="observation", title="Daily check for Olga Owner's dog",
                      notes="Ate well. Rita Reporter visited.", logged_by=leader.user_id, logged_at=datetime(2026, 10, 2))
db.add(log)
db.flush()
db.add(ReportMedia(report_id=PUB.report_id, file_url="https://cdn.example/care.jpg", media_type="Image",
                   holding_log_id=log.log_id, is_evidence=False))
db.add(ReportMedia(report_id=PUB.report_id, file_url="https://cdn.example/proof.jpg", media_type="Image",
                   holding_log_id=log.log_id, is_evidence=True))
# 0b: an evidence photo attached to a timeline entry of the Public report
hist = StatusHistory(report_id=PUB.report_id, report_status_id=9, remarks="Returned to owner", updated_by=leader.user_id,
                     created_at=datetime(2026, 10, 3))
db.add(hist)
db.flush()
db.add(ReportMedia(report_id=PUB.report_id, history_id=hist.history_id, file_url="https://cdn.example/handover.jpg",
                   media_type="Image", is_evidence=True))
db.add(ReportMedia(report_id=PUB.report_id, history_id=hist.history_id, file_url="https://cdn.example/happy.jpg",
                   media_type="Image", is_evidence=False))
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


# ---- 0a: the full records ----
check("signed out: holding list refused", client.get("/holding/").status_code == 401)
check("signed out: holding record refused", client.get(f"/holding/{animal.holding_id}").status_code == 401)
check("signed out: holding metrics refused", client.get("/holding/metrics").status_code == 401)
check("resident: holding list refused (403)", client.get("/holding/", headers=H(neighbour)).status_code == 403)
check("resident: full holding record refused (403)", client.get(f"/holding/{animal.holding_id}", headers=H(owner)).status_code == 403)
r = client.get(f"/holding/{animal.holding_id}", headers=H(leader))
check("staff still get the full record, medical notes included", r.status_code == 200 and r.json().get("medical_notes") == "SECRET-MEDICAL-NOTE", r.status_code)
check("staff still get the list", client.get("/holding/", headers=H(leader)).status_code == 200)

# ---- 0a: the resident version ----
check("signed out: resident holding view refused", client.get(f"/holding/by-report/{PUB.report_id}").status_code == 401)
r = client.get(f"/holding/by-report/{PRIV.report_id}", headers=H(neighbour))
check("a resident can't see the holding record of a report they can't open (404)", r.status_code == 404, r.status_code)

r = client.get(f"/holding/by-report/{PUB.report_id}", headers=H(neighbour))
body = r.json() if r.status_code == 200 else {}
text = r.text
check("another resident gets the resident version of a Public report", r.status_code == 200 and body.get("holding_id") == animal.holding_id, r.text[:200])
check("...without medical notes, kennel slot or intake staff", "SECRET-MEDICAL-NOTE" not in text and "PEN-7" not in text
      and "medical_notes" not in body and "intake_staff_name" not in body and "Leo Leader" not in text)
tl = body.get("timeline") or [{}]
check("...care log titles only (no notes) for other residents", tl[0].get("notes") is None and tl[0].get("title"), tl)
check("...staff shown as a role, never a name or id", tl[0].get("staff_name") == "Subdivision officer" and tl[0].get("logged_by") is None, tl)
check("...other people's names replaced in the text", "Olga Owner" not in text and "Rita Reporter" not in text, tl)
urls = {m["file_url"] for m in tl[0].get("media", [])}
check("...care photos kept, evidence photos removed", urls == {"https://cdn.example/care.jpg"}, urls)

r = client.get(f"/holding/by-report/{PUB.report_id}", headers=H(reporter))
tl = (r.json() or {}).get("timeline") or [{}]
check("the reporter reads the care notes", r.status_code == 200 and (tl[0].get("notes") or "").startswith("Ate well"), tl)
check("...with the owner's name replaced but their own kept", "Olga Owner" not in r.text and "Rita Reporter" in r.text, tl)
r = client.get(f"/holding/by-report/{PUB.report_id}", headers=H(owner))
tl = (r.json() or {}).get("timeline") or [{}]
check("the pet's owner reads the care notes", r.status_code == 200 and tl[0].get("notes"), tl)

none_rep = mk_report("Public")
db.commit()
r = client.get(f"/holding/by-report/{none_rep.report_id}", headers=H(neighbour))
check("an animal that was never held: null, not an error", r.status_code == 200 and r.json() is None, r.text[:100])

# ---- 0b: evidence photos in the report's timeline entries ----
def history_urls(user):
    b = client.get(f"/reports/{PUB.report_id}", headers=H(user)).json()
    return {m["file_url"] for h in b.get("history", []) for m in (h.get("media") or [])}


got = history_urls(neighbour)
check("other residents don't get evidence photos through the timeline", "https://cdn.example/handover.jpg" not in got
      and "https://cdn.example/happy.jpg" in got, got)
check("the reporter doesn't either (it's the owner's / officials' evidence)", "https://cdn.example/handover.jpg" not in history_urls(reporter))
check("the pet's owner still gets it", "https://cdn.example/handover.jpg" in history_urls(owner))
check("staff still get it", "https://cdn.example/handover.jpg" in history_urls(leader))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
