"""
Firebase Cloud Messaging for the Android app (services/push_service.py, routes/push.py, docs/05-operations/push/FIREBASE_PUSH_SETUP.md):

  - FCM is on only when FCM_SERVICE_ACCOUNT_FILE names an existing file; the Android app registers its token as channel "fcm"
  - a token moves to the account that registered it last; signing out removes it
  - each delivery is claimed (queued -> sending) before the network call, so two workers never send it twice; a claim left by a crash is
    marked failed, never sent again
  - Google's answers: sent; token gone (unregistered, invalid, another project) -> the device is revoked; busy -> tried again later
Offline: a throwaway SQLite file, a fake Google endpoint, no real credentials anywhere.
Run from the backend folder:  python tests/test_push_fcm.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

import json
import os
import tempfile
from datetime import datetime, timedelta

for key in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"):
    os.environ.pop(key, None)
fake_credentials = os.path.join(tempfile.mkdtemp(), "service-account.json")
with open(fake_credentials, "w", encoding="utf-8") as fh:
    fh.write("{}")                       # never read: the session below is faked

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.push import PushDelivery, PushSubscription  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import push  # noqa: E402
from app.services import push_service as PS  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(push.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


db.add(Barangay(barangay_id=1, barangay_name="B", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S"))
db.commit()


def user(name):
    u = User(name=name, email=f"{name.lower()}@fcm.test", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.commit()
    return u


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


ana, ben = user("Ana"), user("Ben")
TOKEN = "fcm-token-" + "x" * 140

# ============================================================================ 1. on and off
for key in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"):      # (an application import may have read a local .env: this test is FCM only)
    os.environ.pop(key, None)
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = ""
check("without the service-account file FCM is off, and the app is told so (503)", not PS.fcm_configured()
      and client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ana)).status_code == 503)
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = os.path.join(tempfile.mkdtemp(), "missing.json")
check("a path to a file that does not exist is still off", not PS.fcm_configured())
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = fake_credentials
check("with the file, FCM is on (and push as a whole), Web Push stays off", PS.fcm_configured() and PS.push_configured() and not PS.vapid_configured())
# with no variable at all, the key in the default place (outside the repository) is used; an empty variable never falls back
_default = PS.DEFAULT_FCM_KEY
PS.DEFAULT_FCM_KEY = fake_credentials
os.environ.pop("FCM_SERVICE_ACCOUNT_FILE", None)
check("with no variable, the key in the default place is found (~/.straysafe/firebase-service-account.json)", PS.fcm_configured() and PS.fcm_service_account_file() == fake_credentials)
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = ""
check("...but an empty variable means FCM off, whatever is in the default place (the tests rely on it)", not PS.fcm_configured())
PS.DEFAULT_FCM_KEY = _default
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = fake_credentials

# ============================================================================ 2. the Android app registers its token
r = client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ana))
sub = db.query(PushSubscription).one()
check("the app registers its token (stored as an FCM device of this account, nothing else kept)", r.status_code == 200
      and (sub.channel, sub.endpoint, sub.user_id, sub.p256dh, sub.auth) == ("fcm", TOKEN, ana.user_id, None, None))
check("a malformed token is refused (422)", client.post("/push/subscribe", json={"channel": "fcm", "token": "bad token"}, headers=H(ana)).status_code == 422
      and client.post("/push/subscribe", json={"channel": "fcm"}, headers=H(ana)).status_code == 422)
check("a Web Push subscription is still refused while VAPID is off (503)",
      client.post("/push/subscribe", json={"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": {"p256dh": "a", "auth": "b"}}, headers=H(ana)).status_code == 503)
client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ben))
db.expire_all()
check("the same phone signed in as another resident moves to that account (never shared)", db.query(PushSubscription).count() == 1
      and db.query(PushSubscription).one().user_id == ben.user_id)
client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ana))


# ============================================================================ 3. sending through a fake Google endpoint
class FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code, self.text = status_code, text


class FakeSession:
    def __init__(self):
        self.calls, self.answers = [], []

    def post(self, url, json=None, timeout=None):
        self.calls.append((url, json))
        return self.answers.pop(0) if self.answers else FakeResponse(200, '{"name": "projects/p/messages/1"}')


fake = FakeSession()
PS._fcm_session = lambda: (fake, "straysafe-test")


def notify(uid, title="Still looking for Mochi"):
    n = Notification(user_id=uid, type="case_alert", related_id=None, title=title, message="Please report any sightings.")
    db.add(n)
    db.commit()           # the commit hook queues one delivery per active device
    return n


n1 = notify(ana.user_id)
check("a committed notification of a pushed type queues one delivery for the device", db.query(PushDelivery).filter(PushDelivery.notification_id == n1.notification_id).count() == 1)
out = PS.send_due(db)
db.commit()
url, msg = fake.calls[-1]
check("it is sent through FCM HTTP v1 to that token, with the text and where a tap goes", out["sent"] == 1 and url.endswith("/v1/projects/straysafe-test/messages:send")
      and msg["message"]["token"] == TOKEN and msg["message"]["notification"]["title"] == "Still looking for Mochi" and msg["message"]["data"]["url"] == "/resident-app/notifications")
d1 = db.query(PushDelivery).filter(PushDelivery.notification_id == n1.notification_id).one()
check("the delivery is marked sent, once", d1.status == "sent" and d1.attempts == 1 and len(fake.calls) == 1)
android = msg["message"]["android"]
check("it rings and vibrates even with the app closed and the screen off: high priority, default sound and vibration, top notification priority",
      android["priority"] == "high" and android["notification"]["default_sound"] is True and android["notification"]["default_vibrate_timings"] is True
      and android["notification"]["notification_priority"] == "PRIORITY_MAX" and android["notification"]["channel_id"] == "straysafe_alerts")
other = PS.fcm_message("t", {"title": "Someone saw Mochi", "body": "b", "url": "/x", "tag": "t1"}, 60)["message"]["android"]["notification"]
check("any other notification uses the updates channel and stays private on a locked screen", other["channel_id"] == "straysafe_notifications" and other["visibility"] == "PRIVATE" and other["default_vibrate_timings"] is True)
alert_msg = PS.fcm_message("t", {"title": "Still looking for Mochi", "body": "b", "url": "/x", "tag": "alerts-1", "channel": PS.ALERT_CHANNEL}, 60)["message"]["android"]["notification"]
check("a lost & found alert uses its own channel and may show in full on a locked screen", alert_msg["channel_id"] == "straysafe_alerts" and alert_msg["visibility"] == "PUBLIC")
check("running again sends nothing more", PS.send_due(db)["sent"] == 0 and len(fake.calls) == 1)

# two workers: a delivery already claimed by another worker is not sent here
n2 = notify(ana.user_id)
d2 = db.query(PushDelivery).filter(PushDelivery.notification_id == n2.notification_id).one()
db.query(PushDelivery).filter(PushDelivery.delivery_id == d2.delivery_id).update({"status": "sending", "next_attempt_at": PS.now()})
db.commit()
calls_before = len(fake.calls)
PS.send_due(db)
db.commit()
check("EXACTLY ONCE: a delivery another worker claimed is not sent again", len(fake.calls) == calls_before)
db.query(PushDelivery).filter(PushDelivery.delivery_id == d2.delivery_id).update({"next_attempt_at": PS.now() - timedelta(minutes=11)})
db.commit()
PS.send_due(db)
db.commit()
db.expire_all()
check("a claim left behind by a crash is marked failed after 10 minutes, never sent twice", db.get(PushDelivery, d2.delivery_id).status == "failed"
      and "interrupted" in (db.get(PushDelivery, d2.delivery_id).last_error or "") and len(fake.calls) == calls_before)

# Google is busy: try again later
n3 = notify(ana.user_id)
fake.answers.append(FakeResponse(503, '{"error": {"status": "UNAVAILABLE"}}'))
out = PS.send_due(db)
db.commit()
db.expire_all()
d3 = db.query(PushDelivery).filter(PushDelivery.notification_id == n3.notification_id).one()
check("Google busy (503): the delivery waits and is tried again later", out["retry"] == 1 and d3.status == "queued" and d3.next_attempt_at is not None and d3.attempts == 1)
out = PS.send_due(db, at=PS.now() + timedelta(minutes=2))
db.commit()
db.expire_all()
check("...and is sent on the next try", out["sent"] == 1 and db.get(PushDelivery, d3.delivery_id).status == "sent")

# the phone is gone
n4 = notify(ana.user_id)
fake.answers.append(FakeResponse(404, '{"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}}'))
out = PS.send_due(db)
db.commit()
db.expire_all()
check("a token Google says is unregistered: the device is revoked", out["revoked"] == 1 and db.query(PushSubscription).one().revoked_at is not None)
client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ana))
db.expire_all()
check("signing in again on the phone registers it again", db.query(PushSubscription).one().revoked_at is None)
notify(ana.user_id)
fake.answers.append(FakeResponse(400, '{"error": {"status": "INVALID_ARGUMENT", "message": "The registration token is not a valid FCM registration token"}}'))
check("an invalid token is revoked too", PS.send_due(db)["revoked"] == 1)
db.commit()

# ============================================================================ 4. signing out
client.post("/push/subscribe", json={"channel": "fcm", "token": TOKEN}, headers=H(ana))
r = client.post("/push/unsubscribe", json={"token": TOKEN}, headers=H(ana))
db.expire_all()
check("signing out removes the phone (by its token)", r.status_code == 200 and db.query(PushSubscription).one().revoked_at is not None)
check("status says how many devices this account has", client.get("/push/status", headers=H(ana)).json()["devices"] == 0)

print(f"\n{PASSED} checks passed")
