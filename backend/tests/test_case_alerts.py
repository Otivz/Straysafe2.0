"""
Lost & found notification alerts (services/case_alerts.py, routes/case_alerts.py, docs/01-system/LOST_FOUND_ALERTS.md):

  - an alert is NOT the Community notice: sending, scheduling or repeating one never creates, publishes or edits a notice
  - send now / at a time / repeating (any interval, set times of day) with an end; safeguards (5-minute floor, every repeat ends)
  - exactly once: a planned send is claimed by a unique row; a second worker, a retry or a restart cannot send it again
  - after downtime only the latest missed send goes out; pause / resume (no catch-up) / edit (future only) / stop / cancel
  - recipients: residents of the subdivision who allow lost & found alerts (or the residents who reported a sighting), never the
    case's reporter or owner; one in-app row per alert; where a tap goes; the photo on the phone only when chosen
  - the case closing stops every alert; the owner sees how many went out; only the case's Leader (or the Administrator) acts
  - the schema comes from the SQL migration: the start-up check names what is missing
Offline: a throwaway SQLite file through tests/_isolated_db.py, never app.main and never the configured database.
Run from the backend folder:  python tests/test_case_alerts.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

import os
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.db_migrations import lost_found_alerts as MIG
from app.db_migrations.case_alignment import run_case_alignment
from app.limiter import limiter
from app.models.audit_log import AuditLog
from app.models.case_alert import CaseAlert, CaseAlertSend
from app.models.lost_pet_alert import LostPetAlert
from app.models.notification import Notification
from app.models.notification_preference import UserNotificationPreference
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.routes import case_alerts, cases, lost_pet_alerts, notifications, reports
from app.schemas.case_alert import AlertIn, AlertScheduleIn
from app.services import case_alerts as CA
from app.services import push_service as PS
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
for router in (reports.router, cases.router, lost_pet_alerts.router, case_alerts.router, notifications.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


CATEGORY_NAMES = ["Injured", "Aggressive", "Rabies Risk", "Roaming Animal", "Rescue Needed", "Lost Pet", "Found / Unidentified Animal",
                  "Animal Nuisance", "Animal Safety Concern", "Injured / Distressed Animal", "Other Animal Concern"]
for i, name in enumerate(CATEGORY_NAMES, start=1):
    db.add(ReportCategory(category_id=i, category_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Test City"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"), Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for status_id in range(1, 19):
    db.add(ReportStatus(status_id=status_id, status_name=f"Status {status_id}"))
db.commit()
assert run_case_alignment(engine)["errors"] == []
LOST, FOUND = 6, 7


def user(name, role=1, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@alerts.test", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=subdivision, barangay_id=1, phone="09170001111", address="Blk 9 Lot 15")
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


ana, ben, cara, dino, ella, olga = (user("Ana Reyes"), user("Ben Santos"), user("Cara Lim"), user("Dino Cruz"), user("Ella Tan"), user("Olga Dela", subdivision=2))
leader, leader2, admin = user("Leader Lee", 2), user("Leader Two", 2, subdivision=2), user("Admin Ada", 4, subdivision=None)
db.add(UserNotificationPreference(user_id=ella.user_id, push_lost_found_alerts=False))    # Ella turned lost & found alerts off
db.commit()

mochi = Pet(owner_id=ana.user_id, pet_name="Mochi", pet_type="Dog", breed="Shih Tzu", color_markings="White and golden", gender="Female",
            registered_by_user_id=ana.user_id, registered_by_name=ana.name, photo_url="https://res.cloudinary.com/x/mochi.jpg")
db.add(mochi)
db.commit()
SEEN = (datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None) - timedelta(hours=1)).replace(microsecond=0).isoformat()
lost_id = client.post("/reports/", json={"latitude": 14.8008, "longitude": 121.0036, "landmark": "Gate 2", "subdivision_id": 1, "category_id": LOST,
                                         "description": "She slipped out of the gate.", "pet_id": mochi.pet_id, "last_seen_at": SEEN}, headers=H(ana)).json()["report_id"]
found_id = client.post("/reports/", json={"latitude": 14.8010, "longitude": 121.0040, "landmark": "Clubhouse", "subdivision_id": 1, "category_id": FOUND,
                                          "animal_type": "Dog", "animal_color": "Brown", "description": "A brown dog near the clubhouse."}, headers=H(ben)).json()["report_id"]
notice = db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one()
NOTICE_BEFORE = (notice.status, notice.residents_notified, notice.leader_message, notice.owner_note, notice.activated_at)
T0 = datetime(2030, 1, 7, 15, 0, 0)            # a fixed "now" for the schedule (a Monday, 3:00 PM)


def body(**kw):
    sch = kw.pop("schedule", {"mode": "now"})
    base = {"title": "Still looking for Mochi", "message": "Mochi, a white and golden Shih Tzu, was last seen near Gate 2. Please report any sightings.",
            "include_photo": True, "destination": "notice", "audience": "all", "schedule": sch}
    base.update(kw)
    return base


def make(report_id, now=T0, actor=None, **kw):
    """Through the service (a fixed clock); the routes are exercised separately."""
    report = db.get(Report, report_id)
    a = CA.create(db, report, actor or leader, AlertIn(**body(**kw)), now=now)
    db.commit()
    db.refresh(a)
    return a


def notes_for(uid, alert_id=None):
    db.expire_all()
    q = db.query(Notification).filter(Notification.user_id == uid, Notification.type == "case_alert")
    if alert_id is not None:
        q = q.filter(Notification.related_id == alert_id)
    return q.all()


def staff_notes(report_id):
    db.expire_all()
    return [a.description for a in db.query(AuditLog).filter(AuditLog.action == "CASE_NOTE", AuditLog.target_id == report_id).order_by(AuditLog.log_id).all()]


# ============================================================================ 1. the schedule on its own
probe = CaseAlert(mode="repeat", repeat_kind="every", every_minutes=30, start_at=T0, end_at=T0 + timedelta(hours=2), sends_done=0)
check("every 30 minutes: the first send is the start, then every 30 minutes, within its end",
      CA.plan(probe, T0, limit=10) == [T0 + timedelta(minutes=30 * k) for k in range(5)])
check("the next send after a moment is the following slot, never the same one", CA.next_slot(probe, T0) == T0 + timedelta(minutes=30)
      and CA.next_slot(probe, T0 + timedelta(minutes=31)) == T0 + timedelta(minutes=60) and CA.next_slot(probe, T0 + timedelta(hours=2)) is None)
times = CaseAlert(mode="repeat", repeat_kind="times", times_of_day="07:00,12:00,18:00", start_at=T0, end_at=T0 + timedelta(days=2), sends_done=0)
check("at set times: each day at those times, from the start", CA.plan(times, T0, limit=4) == [T0.replace(hour=18), T0.replace(hour=7) + timedelta(days=1),
                                                                                                T0.replace(hour=12) + timedelta(days=1), T0.replace(hour=18) + timedelta(days=1)])
counted = CaseAlert(mode="repeat", repeat_kind="every", every_minutes=60, start_at=T0, end_at=T0 + timedelta(days=60), max_sends=3, sends_done=3)
check("after its number of sends, nothing is left", CA.next_slot(counted, T0) is None)
check("a description the Activity can show", CA.describe(probe, "Mochi is home") == "every 30 minutes, until Jan 7, 5:00 PM"
      or "every 30 minutes" in CA.describe(probe, "Mochi is home"))

# ============================================================================ 2. who may act, and what is refused
check("a resident cannot send an alert (403)", client.post(f"/case-alerts/reports/{lost_id}", json=body(), headers=H(ana)).status_code == 403)
check("the Leader of another subdivision cannot (403)", client.post(f"/case-alerts/reports/{lost_id}", json=body(), headers=H(leader2)).status_code == 403)
r = client.post(f"/case-alerts/reports/{lost_id}", json=body(schedule={"mode": "repeat", "repeat": "every", "every": 2, "unit": "minutes", "until": "resolved"}), headers=H(leader))
check("sends closer than 5 minutes apart are refused (a typo guard), with the reason", r.status_code == 422 and "5 minutes" in r.text, r.text[:200])
check("a repeating alert without an end is refused", client.post(f"/case-alerts/reports/{lost_id}", json=body(schedule={"mode": "repeat", "repeat": "every", "every": 15, "unit": "minutes"}), headers=H(leader)).status_code == 422)
check("a time in the past is refused", client.post(f"/case-alerts/reports/{lost_id}", json=body(schedule={"mode": "later", "at": "2020-01-01T07:00:00"}), headers=H(leader)).status_code == 422)
check("a time of day that is not one is refused", client.post(f"/case-alerts/reports/{lost_id}", json=body(schedule={"mode": "repeat", "repeat": "times", "times": ["25:00"], "until": "resolved"}), headers=H(leader)).status_code == 422)
r = client.post(f"/case-alerts/reports/{lost_id}", json=body(message="Seen near Gate 2? Call Ana at 0917 123 4567."), headers=H(leader))
check("an alert reaches every resident, so a phone number in it is refused like in a public notice", r.status_code == 400 and "message" in r.text.lower(), r.text[:200])
check("a title longer than a phone shows (60) or a message longer than 180 is refused",
      client.post(f"/case-alerts/reports/{lost_id}", json=body(title="x" * 61), headers=H(leader)).status_code == 422
      and client.post(f"/case-alerts/reports/{lost_id}", json=body(message="x" * 181), headers=H(leader)).status_code == 422)
check("a title of spaces only is refused", client.post(f"/case-alerts/reports/{lost_id}", json=body(title="   "), headers=H(leader)).status_code == 422)
check("an alert cannot run for more than 60 days at once", client.post(f"/case-alerts/reports/{lost_id}", json=body(schedule={
    "mode": "repeat", "repeat": "every", "every": 1, "unit": "days", "until": "resolved", "latest_end": (datetime.now() + timedelta(days=90)).isoformat()}), headers=H(leader)).status_code == 422)
check("a found animal with no published notice cannot send residents to it (409): the alert itself is the destination",
      client.post(f"/case-alerts/reports/{found_id}", json=body(), headers=H(leader)).status_code == 409)
check("only a missing pet has a sighting form, only a found animal a claim form, and 'residents who reported a sighting' is for a missing pet",
      client.post(f"/case-alerts/reports/{found_id}", json=body(destination="sighting"), headers=H(leader)).status_code in (409, 422)
      and client.post(f"/case-alerts/reports/{lost_id}", json=body(destination="claim"), headers=H(leader)).status_code == 422
      and client.post(f"/case-alerts/reports/{found_id}", json=body(destination="inbox", audience="helpers"), headers=H(leader)).status_code == 422)

# ============================================================================ 3. send now
before_notices = db.query(LostPetAlert).count()
res = client.post(f"/case-alerts/reports/{lost_id}", json=body(client_request_id="now-1"), headers=H(leader))
check("the Leader sends an alert now (201): it is sent once and has ended", res.status_code == 201 and res.json()["status"] == "finished" and res.json()["sends_done"] == 1
      and len(res.json()["sends"]) == 1, res.text[:300])
now_id = res.json()["alert_id"]
check("sending again with the same submission id does not send twice", client.post(f"/case-alerts/reports/{lost_id}", json=body(client_request_id="now-1"), headers=H(leader)).json()["alert_id"] == now_id
      and db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == now_id).count() == 1)
check("it reached the residents of the subdivision who allow alerts: Ben, Cara and Dino",
      sorted(n.user_id for n in db.query(Notification).filter(Notification.type == "case_alert", Notification.related_id == now_id).all()) == sorted([ben.user_id, cara.user_id, dino.user_id]))
check("never the owner who reported it, never a resident who turned alerts off, never another subdivision, never the Leader",
      notes_for(ana.user_id) == [] and notes_for(ella.user_id) == [] and notes_for(olga.user_id) == [] and notes_for(leader.user_id) == [])
n = notes_for(ben.user_id, now_id)[0]
check("the notification carries the Leader's own title and message", n.title == "Still looking for Mochi" and n.message.startswith("Mochi, a white and golden"))
db.expire_all()
nb = db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one()
check("THE COMMUNITY NOTICE IS UNTOUCHED: no new notice, same status, same text, same count, not republished",
      db.query(LostPetAlert).count() == before_notices and (nb.status, nb.residents_notified, nb.leader_message, nb.owner_note, nb.activated_at) == NOTICE_BEFORE)
mine = client.get("/notifications/me", headers=H(ben)).json()
check("in the resident's list a tap opens Mochi's notice (navigation only)", any(x["type"] == "case_alert" and x["link"] == f"/resident-app/community/alert-{notice.alert_id}" for x in mine), str(mine)[:400])
check("the Leader's Activity says it (a staff note)", any("You sent the alert" in t and "3 residents" in t for t in staff_notes(lost_id)), str(staff_notes(lost_id)[-3:]))

# the phone: link, photo and channel
payload = PS.payload_for(db, n, db.get(User, ben.user_id))
check("on a phone it opens the notice, uses the lost & found channel, and shows the photo", payload["url"] == f"/resident-app/community/alert-{notice.alert_id}"
      and payload["channel"] == "lost_found_alerts" and payload["image"] == "https://res.cloudinary.com/x/mochi.jpg" and payload["tag"].endswith(str(now_id)), str(payload))
db.add(UserNotificationPreference(user_id=cara.user_id, push_show_preview=False))
db.commit()
p2 = PS.payload_for(db, notes_for(cara.user_id, now_id)[0], db.get(User, cara.user_id))
check("a resident who hides previews gets the generic text and no photo", "image" not in p2 and p2["title"] == "StraySafe", str(p2))
msg = PS.fcm_message("tok", payload, 86400)["message"]
check("the FCM message: the token, title, body, photo, where a tap goes, and a tag so a newer send replaces it",
      msg["token"] == "tok" and msg["notification"]["image"] == payload["image"] and msg["data"]["url"] == payload["url"]
      and msg["android"]["notification"]["tag"] == payload["tag"] and msg["android"]["collapse_key"] == payload["tag"] and msg["android"]["notification"]["channel_id"] == "lost_found_alerts")

# ============================================================================ 4. scheduled for later
later = make(lost_id, schedule={"mode": "later", "at": (T0 + timedelta(hours=16)).isoformat()})
check("a scheduled alert waits: nothing is sent before its time", later.status == "scheduled" and later.next_send_at == T0 + timedelta(hours=16)
      and CA.run_due(db, now=T0 + timedelta(hours=15))["sent"] == 0 and notes_for(ben.user_id, later.alert_id) == [])
out = CA.run_due(db, now=T0 + timedelta(hours=16, minutes=1))
db.expire_all()
check("at its time it goes out once, and ends", out["sent"] == 1 and db.get(CaseAlert, later.alert_id).status == "finished" and len(notes_for(ben.user_id, later.alert_id)) == 1)
check("running the loop again sends nothing more", CA.run_due(db, now=T0 + timedelta(hours=17))["sent"] == 0
      and db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == later.alert_id).count() == 1)
check("the Activity says the scheduled alert went out", any("scheduled alert" in t and "was sent" in t for t in staff_notes(lost_id)))

# ============================================================================ 5. repeating: exactly once, one row per alert, catch-up
rep = make(lost_id, schedule={"mode": "repeat", "repeat": "every", "every": 30, "unit": "minutes", "until": "resolved"})
db.expire_all()
rep = db.get(CaseAlert, rep.alert_id)
check("a repeating alert that starts now sends its first at once, then waits 30 minutes", rep.status == "active" and rep.sends_done == 1
      and rep.next_send_at == T0 + timedelta(minutes=30) and rep.end_at == T0 + timedelta(days=14))
check("its end date is shown even 'until resolved' (14 days by default)", "until Mochi is home" in CA.describe(rep, "Mochi is home"))
# another worker already claimed the next occurrence: this one must not send it
db.add(CaseAlertSend(alert_id=rep.alert_id, slot_at=T0 + timedelta(minutes=30), status="sent", recipients=3))
db.commit()
before = len(db.query(Notification).filter(Notification.related_id == rep.alert_id, Notification.type == "case_alert").all())
out = CA.run_due(db, now=T0 + timedelta(minutes=30, seconds=5))
db.expire_all()
check("EXACTLY ONCE: an occurrence another worker claimed is refused by the database and not sent again", out["raced"] == 1 and out["sent"] == 0
      and db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == rep.alert_id).count() == 2
      and len(db.query(Notification).filter(Notification.related_id == rep.alert_id, Notification.type == "case_alert").all()) == before)
db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == rep.alert_id, CaseAlertSend.slot_at == T0 + timedelta(minutes=30)).delete()
db.commit()
out = CA.run_due(db, now=T0 + timedelta(minutes=30, seconds=5))
db.expire_all()
check("the due occurrence is sent once", out["sent"] == 1 and db.get(CaseAlert, rep.alert_id).sends_done == 2 and db.get(CaseAlert, rep.alert_id).next_send_at == T0 + timedelta(minutes=60))
check("each resident keeps ONE row for the alert (the newer send replaced the older)", len(notes_for(ben.user_id, rep.alert_id)) == 1)
out = CA.run_due(db, now=T0 + timedelta(hours=2, minutes=5))
db.expire_all()
last = db.query(CaseAlertSend).filter(CaseAlertSend.alert_id == rep.alert_id).order_by(CaseAlertSend.send_id.desc()).first()
check("after downtime only the LATEST missed send goes out (no burst), and the skipped ones are counted", out["sent"] == 1 and last.slot_at == T0 + timedelta(hours=2)
      and last.skipped_before == 2 and db.get(CaseAlert, rep.alert_id).next_send_at == T0 + timedelta(hours=2, minutes=30))
check("the Activity says sends were skipped while the server was down", any("skipped 2 planned sends" in t for t in staff_notes(lost_id)))

# ============================================================================ 6. pause, resume, edit, stop
r = client.post(f"/case-alerts/{rep.alert_id}/pause", headers=H(leader))
check("pause: nothing is due", r.status_code == 200 and r.json()["status"] == "paused" and r.json()["next_send_at"] is None
      and CA.run_due(db, now=T0 + timedelta(hours=5))["sent"] == 0)
db.expire_all()
CA.resume(db, db.get(CaseAlert, rep.alert_id), db.get(Report, lost_id), leader, now=T0 + timedelta(hours=5, minutes=10))
db.commit()
db.expire_all()
check("resume continues from now: the sends missed while paused are not caught up", db.get(CaseAlert, rep.alert_id).status == "active"
      and db.get(CaseAlert, rep.alert_id).next_send_at == T0 + timedelta(hours=5, minutes=30))
sends_before = db.get(CaseAlert, rep.alert_id).sends_done
CA.update(db, db.get(CaseAlert, rep.alert_id), db.get(Report, lost_id), leader, AlertIn(**body(title="Have you seen Mochi?",
          schedule={"mode": "repeat", "repeat": "every", "every": 1, "unit": "hours", "until": "resolved"})), now=T0 + timedelta(hours=5, minutes=20))
db.commit()
db.expire_all()
e = db.get(CaseAlert, rep.alert_id)
check("edit: only future sends change (nothing is sent at once, the history stays)", e.sends_done == sends_before and e.every_minutes == 60
      and e.next_send_at == T0 + timedelta(hours=6, minutes=20) and e.title == "Have you seen Mochi?")
CA.run_due(db, now=T0 + timedelta(hours=6, minutes=21))
check("the next send uses the new words", notes_for(ben.user_id, rep.alert_id)[0].title == "Have you seen Mochi?")
r = client.post(f"/case-alerts/{rep.alert_id}/stop", headers=H(leader))
check("stop: it ends, with who and why, and nothing more goes out", r.status_code == 200 and r.json()["status"] == "stopped" and r.json()["stop_reason"]
      and CA.run_due(db, now=T0 + timedelta(days=1))["sent"] == 0)
check("stopping twice is refused (409)", client.post(f"/case-alerts/{rep.alert_id}/stop", headers=H(leader)).status_code == 409)
sched = make(lost_id, schedule={"mode": "later", "at": (T0 + timedelta(days=2)).isoformat()})
check("a scheduled alert stopped before its time is CANCELLED (nothing was sent)", client.post(f"/case-alerts/{sched.alert_id}/stop", headers=H(leader)).json()["status"] == "cancelled")
check("a one-time alert is cancelled, not paused (409)", client.post(f"/case-alerts/{make(lost_id, schedule={'mode': 'later', 'at': (T0 + timedelta(days=3)).isoformat()}).alert_id}/pause", headers=H(leader)).status_code == 409)

# ============================================================================ 7. set times, a number of sends, who helped
cnt = make(lost_id, schedule={"mode": "repeat", "repeat": "times", "times": ["07:00", "18:00"], "until": "count", "count": 2})
db.expire_all()
cnt = db.get(CaseAlert, cnt.alert_id)
check("at set times: the first is the next of those times (6:00 PM today)", cnt.next_send_at == T0.replace(hour=18) and cnt.sends_done == 0)
CA.run_due(db, now=T0.replace(hour=18, minute=1))
CA.run_due(db, now=T0.replace(hour=7, minute=1) + timedelta(days=1))
db.expire_all()
check("after its number of sends it has finished", db.get(CaseAlert, cnt.alert_id).sends_done == 2 and db.get(CaseAlert, cnt.alert_id).status == "finished")
fd = db.query(LostPetAlert).filter(LostPetAlert.report_id == lost_id).one()
r = client.post(f"/lost-pet-alerts/{fd.alert_id}/sightings", headers=H(dino), data={"latitude": "14.8011", "longitude": "121.0038", "accuracy_confirmed": "true",
                                                                                      "location_source": "map_pin", "location_label": "Near the court", "description": "Saw her."})
helpers = make(lost_id, audience="helpers")
check("'residents who reported a sighting' reaches only them", r.status_code == 200
      and sorted(n.user_id for n in db.query(Notification).filter(Notification.type == "case_alert", Notification.related_id == helpers.alert_id).all()) == [dino.user_id])
for key in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "FCM_SERVICE_ACCOUNT_FILE"):      # (a local .env may have set push up: this check is about it being off)
    os.environ.pop(key, None)
aud = client.get(f"/case-alerts/reports/{lost_id}/audience", headers=H(leader)).json()
check("the screen can say how many each choice reaches, and how many turned alerts off", aud == {"all": 3, "helpers": 1, "residents": 5, "turned_off": 1, "push_ready": False}, str(aud))
check("...and that phones cannot be reached while neither Web Push nor Firebase is set up (alerts still reach the in-app list)", aud["push_ready"] is False)

# ============================================================================ 8. the owner, the case record, the case closing
owner_view = client.get(f"/lost-pet-alerts/{fd.alert_id}", headers=H(ana)).json()
neighbour_view = client.get(f"/lost-pet-alerts/{fd.alert_id}", headers=H(ben)).json()
check("the owner sees how many alerts went to neighbours about their pet; a neighbour does not", owner_view["leader_alerts"]["sent"] >= 6
      and owner_view["leader_alerts"]["last_at"] and neighbour_view.get("leader_alerts") is None, str(owner_view.get("leader_alerts")))
case = client.get(f"/cases/{lost_id}", headers=H(leader)).json()
check("the Leader's case record lists the alerts, newest first, each with its history", [a["alert_id"] for a in case["alerts"]][:1] == [helpers.alert_id]
      and any(a["alert_id"] == rep.alert_id and len(a["sends"]) >= 4 for a in case["alerts"]))
live = make(lost_id, schedule={"mode": "repeat", "repeat": "every", "every": 1, "unit": "hours", "until": "resolved"})
waiting = make(lost_id, schedule={"mode": "later", "at": (T0 + timedelta(days=5)).isoformat()})
report = db.get(Report, lost_id)
report.case_status = "closed"
report.current_status_id = 11
db.commit()
db.expire_all()
check("THE CASE IS RESOLVED: every live alert stops by itself, with the reason", db.get(CaseAlert, live.alert_id).status == "stopped"
      and db.get(CaseAlert, waiting.alert_id).status == "cancelled" and "resolved" in (db.get(CaseAlert, live.alert_id).stop_reason or ""))
check("...and nothing more is sent", CA.run_due(db, now=T0 + timedelta(days=6))["sent"] == 0)
check("...and no new alert can be sent on a closed case (409)", client.post(f"/case-alerts/reports/{lost_id}", json=body(), headers=H(leader)).status_code == 409)
# an alert of a case closed some other way is stopped by the loop before it sends
report.case_status, report.current_status_id = "reported", 1
db.commit()
sneaky = make(lost_id, destination="inbox", schedule={"mode": "later", "at": (T0 + timedelta(days=7)).isoformat()})
db.query(Report).filter(Report.report_id == lost_id).update({"case_status": "closed", "current_status_id": 11}, synchronize_session=False)
db.commit()
db.expire_all()
out = CA.run_due(db, now=T0 + timedelta(days=8))
db.expire_all()
check("the loop checks the case is still open before each send", out["stopped"] == 1 and out["sent"] == 0 and db.get(CaseAlert, sneaky.alert_id).status == "cancelled")

# ============================================================================ 9. the residents' switch
r = client.put("/notifications/preferences", json={"push_lost_found_alerts": False}, headers=H(ben))
check("a resident can turn lost & found alerts off, and read it back", r.status_code == 200 and r.json()["push_lost_found_alerts"] is False
      and client.get("/notifications/preferences", headers=H(ben)).json()["push_lost_found_alerts"] is False)

# ============================================================================ 10. the schema comes from the SQL migration
check("with the migration applied nothing is missing", MIG.missing(engine) == [])
bare = create_engine("sqlite://")
Base.metadata.create_all(bind=bare, tables=[t for t in Base.metadata.sorted_tables if not t.info.get("migration")])
with bare.begin() as con:
    con.exec_driver_sql("ALTER TABLE user_notification_preferences DROP COLUMN push_lost_found_alerts")
gone = MIG.missing(bare)
check("start-up never creates the alert tables, and the check names everything missing", gone == ["table case_alerts", "table case_alert_sends", "column user_notification_preferences.push_lost_found_alerts"], str(gone))
try:
    MIG.require(bare)
    refused = False
except MIG.LostFoundAlertSchemaMissing as e:
    refused = "2026-11-12_lost_found_alerts.sql" in str(e)
check("...and the backend refuses to start, naming the file to run", refused)

print(f"\n{PASSED} checks passed")
