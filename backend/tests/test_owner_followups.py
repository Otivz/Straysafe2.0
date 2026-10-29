"""
Owner follow-up (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, Phase 1, complaint about a registered pet):
  - only the leader handling an open, not-escalated report linked to a pet with an owner starts one; status unchanged
  - the owner (account) is notified and told to keep the pet confined; an owner without an account is not
  - the owner acknowledges in the app; for an owner without an account the leader logs the phone acknowledgement
  - the owner sends updates (with a photo); the leader logs contacts and repeated incidents
  - one extension with a reason; the leader ends it through the existing status route (11 or 14)
  - escalating or closing the report any other way ends it by itself; nothing ends on its own when due
  - scope: leaders their subdivision, Barangay staff only escalated ones of their barangay, the owner their own view
Throwaway SQLite DB, real JWT auth, fake photo upload.  Run from the backend folder:  python tests/test_owner_followups.py
"""
import base64
import os
import sys
import tempfile
from datetime import timedelta

_DB = os.path.join(tempfile.mkdtemp(), "owner_followups_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-followups-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Report, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import owner_followups, reports  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.holding_stay import db_now  # noqa: E402
from app.utils.owner_followups import check_and_notify_due_followups  # noqa: E402

owner_followups.upload_to_cloudinary = lambda *a, **k: "https://cdn.example/owner-update.png"  # no network
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==")

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(reports.router)
api.include_router(owner_followups.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add_all([Barangay(barangay_id=1, barangay_name="B1", city="C"), Barangay(barangay_id=2, barangay_name="B2", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status="Active", **kw)
    db.add(u)
    db.flush()
    return u


owner = mk_user("Olga Owner", 1, subdivision_id=1, barangay_id=1, phone="09170000001")
neighbour = mk_user("Nina Neighbour", 1, subdivision_id=1, barangay_id=1)
leader = mk_user("Leo Leader", 2, subdivision_id=1, barangay_id=1)
leader_b = mk_user("Lia Other", 2, subdivision_id=1, barangay_id=1)
leader_s2 = mk_user("Lou Second", 2, subdivision_id=2, barangay_id=1)
staff_b1 = mk_user("Ben Barangay", 3, barangay_id=1)
staff_b2 = mk_user("Bea Elsewhere", 3, barangay_id=2)
admin = mk_user("Ada Admin", 4)

pet = Pet(pet_name="Bantay", pet_type="Dog", owner_id=owner.user_id, status="Active")
offline_pet = Pet(pet_name="Brownie", pet_type="Dog", owner_id=None, status="Active",
                  emergency_contact_name="Mr Santos", emergency_contact_phone="09177654321")
ownerless_pet = Pet(pet_name="Community dog", pet_type="Dog", owner_id=None, status="Active")
fac = Landmark(name="Impound", latitude=14.8, longitude=121.0, is_holding_facility=True, barangay_id=1)
db.add_all([pet, offline_pet, ownerless_pet, fac])
# one Observing follow-up per pet: the later follow-ups observe other pets of the same owner
more_pets = [Pet(pet_name=f"Dog {i}", pet_type="Dog", owner_id=owner.user_id, status="Active") for i in range(4)]
db.add_all(more_pets)
db.flush()


def mk_report(status=2, assigned=True, pet_obj=pet, subd=1, facility=None):
    r = Report(user_id=neighbour.user_id, subdivision_id=subd, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=status, animal_type="Dog", pet_id=pet_obj.pet_id if pet_obj else None,
               assigned_leader_id=leader.user_id if assigned else None, facility_id=facility)
    db.add(r)
    db.flush()
    return r


R_MAIN = mk_report()
R_OFFLINE = mk_report(pet_obj=offline_pet)
R_THIRD = mk_report(pet_obj=more_pets[0])
R_REJECT = mk_report(pet_obj=more_pets[1])
R_WATCH = mk_report(pet_obj=more_pets[2])
R_LATER = mk_report(pet_obj=more_pets[3])
R_REPEAT = mk_report()
R_UNCLAIMED = mk_report(assigned=False)
R_CLOSED = mk_report(status=11)
R_ESC = mk_report(status=4)
R_HELD = mk_report(status=7, facility=fac.landmark_id)
R_NO_PET = mk_report(pet_obj=None)
R_OWNERLESS = mk_report(pet_obj=ownerless_pet)
db.commit()

H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def start(who, report):
    return client.post("/owner-followups", json={"report_id": report.report_id}, headers=H(who))


def notes_for(user, title_part):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == user.user_id, Notification.title.contains(title_part)).count()


def fresh(fid):
    db.expire_all()
    return db.get(OwnerFollowUp, fid)


# ---- who may start, and on which report ----
check("a resident can't start a follow-up", start(owner, R_MAIN).status_code == 403)
check("a leader not handling the report can't start one", start(leader_b, R_MAIN).status_code == 403)
check("a leader of another subdivision can't start one", start(leader_s2, R_MAIN).status_code == 403)
check("Barangay staff can't start one", start(staff_b1, R_MAIN).status_code == 403)
check("an unclaimed report can't get one", start(leader, R_UNCLAIMED).status_code == 403)
check("a closed report can't get one", start(leader, R_CLOSED).status_code == 400)
check("a report already with the Barangay can't get one", start(leader, R_ESC).status_code == 400)
check("a report whose animal is held in a facility can't get one", start(leader, R_HELD).status_code == 400)
check("a report with no registered pet can't get one", start(leader, R_NO_PET).status_code == 400)
check("a registered pet with no owner can't get one", start(leader, R_OWNERLESS).status_code == 400)
check("an owner can't be typed in", client.post("/owner-followups", json={"report_id": R_NO_PET.report_id,
      "suspected_owner_name": "Mr X", "suspected_owner_phone": "09171234567"}, headers=H(leader)).status_code == 400)
check("nobody was notified by the refused attempts", notes_for(owner, "Complaint about your pet") == 0)

# ---- start: owner with an account ----
r = start(leader, R_MAIN)
body = r.json() if r.status_code == 201 else {}
F_MAIN = body.get("followup_id")
check("started on a report linked to a pet with an owner", r.status_code == 201 and body.get("status") == "Observing"
      and body.get("label") == "Under Observation", r.text[:200])
check("...owner taken from the pet's owner account", body.get("owner_user_id") == owner.user_id and body.get("pet_id") == pet.pet_id
      and body.get("owner_name") == "Olga Owner" and body.get("owner_phone") == "09170000001", body)
f = fresh(F_MAIN) if F_MAIN else None
check("...due 3 days after it started", f is not None and abs((f.due_at - f.opened_at) - timedelta(days=3)) < timedelta(seconds=2))
db.expire_all()
rep = db.get(Report, R_MAIN.report_id)
check("...the report's status and facility are unchanged (never 7)", rep.current_status_id == 2 and rep.facility_id is None)
n = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.title.contains("Complaint about your pet")).all()
check("...the owner was notified once, told to keep the pet confined", len(n) == 1 and "confined" in n[0].message
      and n[0].related_id == R_MAIN.report_id and "scan" not in n[0].title.lower() and "pet found" not in n[0].title.lower())
check("a second open follow-up on the same report is refused", start(leader, R_MAIN).status_code == 409)

# ---- start: owner without an account (on the pet record) ----
r = start(leader, R_OFFLINE)
F_OFFLINE = r.json().get("followup_id") if r.status_code == 201 else None
check("started for an owner without an account", r.status_code == 201 and r.json().get("owner_has_account") is False
      and r.json().get("owner_name") == "Mr Santos" and r.json().get("owner_phone") == "09177654321", r.text[:200])

# ---- log entries by the leader ----
c = client.post(f"/owner-followups/{F_MAIN}/contacts", json={"method": "Phone", "note": "Called Olga, will keep Bantay inside"}, headers=H(leader))
check("the handling leader logs a contact", c.status_code == 201 and len(c.json().get("contacts", [])) == 1, c.text[:200])
c = client.post(f"/owner-followups/{F_MAIN}/contacts", json={"method": "Repeated incident", "note": "Seen roaming again",
                                                             "related_report_id": R_REPEAT.report_id}, headers=H(leader))
check("...a repeated incident with its report number", c.status_code == 201 and c.json()["contacts"][-1]["related_report_id"] == R_REPEAT.report_id, c.text[:200])
check("...the leader can't write an 'Owner update'", client.post(f"/owner-followups/{F_MAIN}/contacts",
      json={"method": "Owner update", "note": "pretend owner"}, headers=H(leader)).status_code == 422)
check("...a resident can't log a contact", client.post(f"/owner-followups/{F_MAIN}/contacts", json={"method": "Phone", "note": "hello there"}, headers=H(neighbour)).status_code == 403)
check("...a leader of another subdivision can't", client.post(f"/owner-followups/{F_MAIN}/contacts", json={"method": "Phone", "note": "hello there"}, headers=H(leader_s2)).status_code == 403)
check("...an unknown method is refused", client.post(f"/owner-followups/{F_MAIN}/contacts", json={"method": "Fax", "note": "hello there"}, headers=H(leader)).status_code == 422)

# ---- owner update (with a photo) ----
check("another resident can't send an owner update", client.post(f"/owner-followups/{F_MAIN}/owner-update",
      data={"note": "not mine"}, headers=H(neighbour)).status_code == 403)
r = client.post(f"/owner-followups/{F_MAIN}/owner-update", data={"note": "Bantay is in the yard now, gate fixed"},
                files={"file": ("yard.png", PNG, "image/png")}, headers=H(owner))
check("the owner sends an update with a photo", r.status_code == 201 and r.json().get("my_updates")
      and r.json()["my_updates"][0]["photo_url"] == "https://cdn.example/owner-update.png", r.text[:300])
check("...the leader is told", notes_for(leader, "Owner update") == 1)
r = client.post(f"/owner-followups/{F_MAIN}/owner-update", data={"note": "ok"}, headers=H(owner))
check("...an update needs some text", r.status_code == 422)

# ---- acknowledgement ----
check("the leader can't acknowledge for an owner who has an account (they do it in the app)",
      client.post(f"/owner-followups/{F_MAIN}/acknowledge", json={"note": "said ok"}, headers=H(leader)).status_code == 403)
check("another resident can't acknowledge", client.post(f"/owner-followups/{F_MAIN}/acknowledge", json={}, headers=H(neighbour)).status_code == 403)
r = client.post(f"/owner-followups/{F_MAIN}/acknowledge", json={}, headers=H(owner))
check("the owner acknowledges in the app", r.status_code == 200 and r.json().get("acknowledged_via") == "App", r.text[:200])
check("...the owner's view leaves out the leader's notes and contacts", "contacts" not in r.json() and "owner_phone" not in r.json())
check("...the leader is told", notes_for(leader, "Owner acknowledged") == 1)
check("...acknowledging twice is refused", client.post(f"/owner-followups/{F_MAIN}/acknowledge", json={}, headers=H(owner)).status_code == 409)
check("a phone acknowledgement needs a note", client.post(f"/owner-followups/{F_OFFLINE}/acknowledge", json={}, headers=H(leader)).status_code == 422)
r = client.post(f"/owner-followups/{F_OFFLINE}/acknowledge", json={"note": "Mr Santos will tie the dog"}, headers=H(leader))
check("for an owner without an account the leader logs the phone acknowledgement", r.status_code == 200 and r.json().get("acknowledged_via") == "Phone", r.text[:200])

# ---- extension ----
before = fresh(F_MAIN).due_at
check("extending needs a reason", client.post(f"/owner-followups/{F_MAIN}/extend", json={"reason": "no"}, headers=H(leader)).status_code == 422)
check("a resident can't extend", client.post(f"/owner-followups/{F_MAIN}/extend", json={"reason": "please more time"}, headers=H(owner)).status_code == 403)
r = client.post(f"/owner-followups/{F_MAIN}/extend", json={"reason": "Owner is fixing the fence"}, headers=H(leader))
check("the leader extends once", r.status_code == 200 and r.json().get("extended") is True
      and abs((fresh(F_MAIN).due_at - before) - timedelta(days=3)) < timedelta(seconds=2), r.text[:200])
check("...the owner is told the new date", notes_for(owner, "Observation extended") == 1)
check("...a second extension is refused", client.post(f"/owner-followups/{F_MAIN}/extend", json={"reason": "again more time"}, headers=H(leader)).status_code == 409)
db.expire_all()
ext = db.query(StatusHistory).filter(StatusHistory.report_id == R_MAIN.report_id, StatusHistory.remarks.like("Owner follow-up extended:%")).all()
check("...the extension is in the report timeline once, with the new date and no owner name", len(ext) == 1 and "until" in ext[0].remarks
      and "Olga" not in ext[0].remarks, [h.remarks for h in ext])

# ---- who sees what ----
lst = client.get("/owner-followups", headers=H(leader))
check("the leader lists the follow-ups of their subdivision", lst.status_code == 200 and {x["followup_id"] for x in lst.json()} == {F_MAIN, F_OFFLINE}, lst.text[:200])
check("a leader of another subdivision sees none", client.get("/owner-followups", headers=H(leader_s2)).json() == [])
check("Barangay staff see none while they are still observing", client.get("/owner-followups", headers=H(staff_b1)).json() == [])
check("the administrator sees all", len(client.get("/owner-followups", headers=H(admin)).json()) == 2)
# Phase 5F: one pet's follow-ups, for its record's history
by_pet = client.get(f"/owner-followups?pet_id={pet.pet_id}", headers=H(leader))
check("the leader lists one pet's follow-ups", by_pet.status_code == 200 and [x["followup_id"] for x in by_pet.json()] == [F_MAIN], by_pet.text[:200])
check("...another subdivision's leader sees none for it", client.get(f"/owner-followups?pet_id={pet.pet_id}", headers=H(leader_s2)).json() == [])
check("...a resident (even the owner) gets no list", client.get(f"/owner-followups?pet_id={pet.pet_id}", headers=H(owner)).status_code == 403)
check("residents get no list", client.get("/owner-followups", headers=H(owner)).status_code == 403)
br = client.get(f"/owner-followups/by-report/{R_MAIN.report_id}", headers=H(owner)).json()
check("the owner sees their follow-up without the leader's notes", br and br.get("followup_id") == F_MAIN and "contacts" not in br
      and len(br.get("my_updates", [])) == 1, br)
check("another resident sees nothing for that report", client.get(f"/owner-followups/by-report/{R_MAIN.report_id}", headers=H(neighbour)).json() is None)

# ---- closing ----
r = start(leader, R_THIRD)
F_THIRD = r.json().get("followup_id") if r.status_code == 201 else None
check("closing needs a reason", client.post(f"/owner-followups/{F_THIRD}/close", json={"outcome": "false_alarm", "reason": "no"}, headers=H(leader)).status_code == 422)
check("an unknown outcome is refused", client.post(f"/owner-followups/{F_THIRD}/close", json={"outcome": "cannot_be_found", "reason": "gone for days"}, headers=H(leader)).status_code == 422)
r = client.post(f"/owner-followups/{F_THIRD}/close", json={"outcome": "false_alarm", "reason": "Not this owner's dog after all"}, headers=H(leader))
db.expire_all()
check("the leader closes the case as a false alarm", r.status_code == 200 and r.json().get("status") == "Closed by Leader"
      and r.json().get("closing_outcome") == "False Alarm", r.text[:300])
check("...through the existing status route: the report is now 14", db.get(Report, R_THIRD.report_id).current_status_id == 14)
check("an ended follow-up can't be closed again",
      client.post(f"/owner-followups/{F_THIRD}/close", json={"outcome": "false_alarm", "reason": "second try here"}, headers=H(leader)).status_code == 409)
r = client.post(f"/owner-followups/{F_OFFLINE}/close", json={"outcome": "owner_complied", "reason": "Dog tied at home, checked on site"}, headers=H(leader))
db.expire_all()
check("'Owner complied' resolves the report (11) through the existing route", r.status_code == 200 and r.json().get("status") == "Owner Complied"
      and db.get(Report, R_OFFLINE.report_id).current_status_id == 11, r.text[:300])

# ---- ended by the report itself ----
r = client.patch(f"/reports/{R_MAIN.report_id}/status", json={"status_id": 4, "remarks": "Forwarded to the Barangay"}, headers=H(leader))
f = fresh(F_MAIN)
check("escalating the report the usual way ends the follow-up as Escalated", r.status_code == 200 and f.status == "Escalated", f"{r.status_code} {r.text[:200]} {f.status}")
lst = client.get("/owner-followups", headers=H(staff_b1)).json()
check("...Barangay staff of that barangay now see it, with its history",
      [x["followup_id"] for x in lst] == [F_MAIN] and len(lst[0]["contacts"]) == 3, lst)
check("...Barangay staff of another barangay don't", client.get("/owner-followups", headers=H(staff_b2)).json() == [])

r = start(leader, R_REJECT)
F_REJECT = r.json().get("followup_id") if r.status_code == 201 else None
r = client.patch(f"/reports/{R_REJECT.report_id}/status", json={"status_id": 3, "remarks": "Not a real complaint"}, headers=H(leader))
check("rejecting the report ends the follow-up as Report Closed", r.status_code == 200 and fresh(F_REJECT).status == "Report Closed", r.text[:200])

# ---- reminders and due notices (nothing ends by itself) ----
r = start(leader, R_WATCH)
F_WATCH = r.json().get("followup_id") if r.status_code == 201 else None
f = fresh(F_WATCH)
now = db_now(db)
f.due_at = now + timedelta(hours=12)
db.commit()
check_and_notify_due_followups()
f = fresh(F_WATCH)
check("a day before the due time the owner gets one reminder", f.reminder_sent_at is not None and notes_for(owner, "Reminder") == 1)
check("...and the leader no due notice yet", f.due_notified_at is None and notes_for(leader, "Observation due") == 0)
f.due_at = now - timedelta(minutes=5)
db.commit()
check_and_notify_due_followups()
check_and_notify_due_followups()
f = fresh(F_WATCH)
check("when due the leader is told once", notes_for(leader, "Observation due") == 1 and f.due_notified_at is not None)
check("...the follow-up stays open: the leader decides", f.status == "Observing")
check("...and lists as due", [x["followup_id"] for x in client.get("/owner-followups?due=true", headers=H(leader)).json()] == [F_WATCH])

# ---- observation length ----
check("a leader can't change the observation length", client.put("/owner-followups/settings", json={"days": 5}, headers=H(leader)).status_code == 403)
check("...out-of-range values are refused", client.put("/owner-followups/settings", json={"days": 30}, headers=H(admin)).status_code == 422)
check("the administrator sets it to 5 days", client.put("/owner-followups/settings", json={"days": 5}, headers=H(admin)).status_code == 200
      and client.get("/owner-followups/settings", headers=H(leader)).json() == {"days": 5})
r = start(leader, R_LATER)
f = fresh(r.json().get("followup_id")) if r.status_code == 201 else None
check("...a new follow-up is due 5 days after it started", f is not None and abs((f.due_at - f.opened_at) - timedelta(days=5)) < timedelta(seconds=2))
check("...the open one keeps its own due time", abs(fresh(F_WATCH).due_at - (now - timedelta(minutes=5))) < timedelta(seconds=2))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
