"""
Web Push (PUSH_NOTIFICATION_IMPLEMENTATION.md): committed notifications are queued per device; the worker re-checks
preferences, account and report access before sending; safe lock-screen text; retries; dead devices revoked; one
device per account; chat throttled; nothing at all while the keys aren't set. The push service is faked.
Run from the backend folder:  python tests/test_push_notifications.py
"""
import os
import re
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "push_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-push-notifications-0123456789")
os.environ["VAPID_PUBLIC_KEY"] = "BTestPublicKey"
os.environ["VAPID_PRIVATE_KEY"] = "test-private-key"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.notification_preference import UserNotificationPreference  # noqa: E402
from app.models.push import PushDelivery, PushSubscription  # noqa: E402
from app.models.report import Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import push as push_routes  # noqa: E402
from app.services import push_service as ps  # noqa: E402
from app.utils import push_categories as pc  # noqa: E402
from app.utils import report_visibility as rv  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(push_routes.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


res, other, leader = mk("Rita"), mk("Olga"), mk("Leo", 2)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []
SENT = []
REPLIES = []  # status codes the fake push service answers with (default 201)


def fake_sender(sub, data, ttl):
    SENT.append((sub.subscription_id, json.loads(data), ttl))
    code = REPLIES.pop(0) if REPLIES else 201
    if code == 0:
        raise ConnectionError("timeout")
    return ps.PushResult(code)


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def endpoint(n):
    return f"https://fcm.googleapis.com/fcm/send/device-{n}"


def subscribe(user, n):
    return client.post("/push/subscribe", headers=H(user), json={"endpoint": endpoint(n), "keys": {"p256dh": "pk", "auth": "ak"}})


def notify(user, title="Report Update", message="Your report #1 was verified.", ntype="status_update", related_id=None):
    n = Notification(user_id=user.user_id, title=title, message=message, type=ntype, related_id=related_id)
    db.add(n)
    db.commit()
    return n.notification_id


def deliveries(nid):
    db.expire_all()
    return db.query(PushDelivery).filter(PushDelivery.notification_id == nid).all()


def run(at=None):
    out = ps.send_due(db, sender=fake_sender, at=at)
    db.commit()
    return out


# 12. Subscribing
check("12 subscribing needs sign-in", client.post("/push/subscribe", json={"endpoint": endpoint(1), "keys": {"p256dh": "a", "auth": "b"}}).status_code == 401)
check("12 only browser push services are accepted (no arbitrary URLs)",
      client.post("/push/subscribe", headers=H(res), json={"endpoint": "https://evil.example.com/x", "keys": {"p256dh": "a", "auth": "b"}}).status_code == 422)
check("12 a resident turns push on for a device", subscribe(res, 1).status_code == 200)
check("public key is served", client.get("/push/public-key").json() == {"enabled": True, "public_key": "BTestPublicKey"})

# 1-3. The hook
nid = notify(res)
check("1 a committed notification queues one delivery per device", len(deliveries(nid)) == 1 and deliveries(nid)[0].status == "queued")
n2 = Notification(user_id=res.user_id, title="x", message="y", type="status_update")
db.add(n2)
db.flush()
rolled_id = n2.notification_id
db.rollback()
check("2 a rolled-back notification queues nothing", db.query(PushDelivery).filter(PushDelivery.notification_id == rolled_id).count() == 0)
check("3 security / operation / unknown types are never queued",
      all(len(deliveries(notify(res, ntype=t))) == 0 for t in ("security", "operation", "some_new_type")))

# Send it (6, 8)
run()
check("send: the queued push is delivered", deliveries(nid)[0].status == "sent" and len(SENT) == 1)
payload = SENT[-1][1]
check("6 the payload has only title, body, url, tag, notification_id", set(payload) == {"title", "body", "url", "tag", "notification_id"})
check("6 ttl is 24 hours", SENT[-1][2] == 24 * 3600)
check("8 a resident's tap opens the resident page", payload["url"] == "/resident-home")

# 6. Safe text
nid = notify(res, title="Owner contact", message="Call 0917 123 4567 or mail ana.cruz@gmail.com about Brownie, who was seen near the chapel gate this morning and looked hungry and scared")
run()
body = SENT[-1][1]["body"]
check("6 no phone number or email address on the lock screen", "0917" not in body and "@" not in body and len(body) <= 120, body)

# 7. Hide details
pref = UserNotificationPreference(user_id=res.user_id, email_reports=True, email_rescues=True, email_pet_matches=True,
                                  email_claims=True, email_reminders=True, push_show_preview=False)
db.add(pref)
db.commit()
notify(res, title="Secret title", message="secret body")
run()
check("7 'hide details' shows only the generic text", SENT[-1][1]["title"] == pc.GENERIC_TITLE and SENT[-1][1]["body"] == pc.GENERIC_BODY)
pref.push_show_preview = True

# 4. Preferences
pref.push_reports = False
db.commit()
nid = notify(res)
run()
check("4 a category switched off is skipped", deliveries(nid)[0].status == "skipped" and "settings" in deliveries(nid)[0].last_error)
pref.push_reports, pref.push_enabled = True, False
db.commit()
nid = notify(res)
run()
check("4 push_enabled off skips everything", deliveries(nid)[0].status == "skipped")
pref.push_enabled = True
db.commit()

# 5. Report access re-checked before sending (rule 11)
rep = Report(user_id=other.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=2,
             animal_type="Dog", visibility=rv.PRIVATE, verification_status="verified_true")
db.add(rep)
db.commit()
nid = notify(res, title="Dog near you", message="A dog was seen", related_id=rep.report_id)
run()
check("5 nothing is pushed about a report the person can't see", deliveries(nid)[0].status == "skipped"
      and "no longer available" in deliveries(nid)[0].last_error, deliveries(nid)[0].last_error)

# 8. Links per role
check("8 leader links go to /subd/...", pc.notification_link(2, "status_update", 52) == "/subd/reports/52")
check("8 resident links go to /resident/...", pc.notification_link(1, "status_update", 52) == "/resident/reports/52")
check("8 barangay adoption chat opens the conversation", pc.notification_link(3, "adoption_chat", 7) == "/brgy/messages?adoptionId=7")

# 10-11. Retries and expiry
REPLIES[:] = [500]
nid = notify(res)
c = run()
d = deliveries(nid)[0]
check("10 a 500 is retried later, not lost", d.status == "queued" and d.attempts == 1 and d.next_attempt_at is not None)
before = len(SENT)
run()
check("10 ...not before its retry time", len(SENT) == before)
run(at=datetime.now() + timedelta(minutes=2))
check("10 ...then sent once", deliveries(nid)[0].status == "sent" and len(SENT) == before + 1)
REPLIES[:] = [0, 0, 0]
nid = notify(res)
for k in range(4):
    run(at=datetime.now() + timedelta(minutes=30 * k))
check("10 three network failures: gives up (failed), never sent twice", deliveries(nid)[0].status == "failed" and deliveries(nid)[0].attempts == 3)
nid = notify(res)
run(at=datetime.now() + timedelta(hours=25))
check("11 older than 24 hours: dropped", deliveries(nid)[0].status == "failed" and "expired" in deliveries(nid)[0].last_error)

# 14. Chat throttle
subscribe(leader, 9)
ids = [notify(leader, title="New message", message=f"msg {i}", ntype="message", related_id=77) for i in range(5)]
run()
sent_chat = [x for x in ids if deliveries(x)[0].status == "sent"]
check("14 five chat messages in a minute: one push", len(sent_chat) == 1, [deliveries(x)[0].status for x in ids])

# 9. Device gone
REPLIES[:] = [410]
nid = notify(leader)
run()
db.expire_all()
sub9 = db.query(PushSubscription).filter(PushSubscription.endpoint_hash == ps.endpoint_hash(endpoint(9))).first()
check("9 410 from the push service revokes the device", sub9.revoked_at is not None)
nid = notify(leader)
check("9 ...and it gets nothing more", len(deliveries(nid)) == 0)

# 12. Another account on the same browser takes it over
subscribe(other, 1)
db.expire_all()
sub1 = db.query(PushSubscription).filter(PushSubscription.endpoint_hash == ps.endpoint_hash(endpoint(1))).first()
check("12 another account on the same browser takes the device over", sub1.user_id == other.user_id)
check("12 the first account's notifications no longer go to it", len(deliveries(notify(res))) == 0)

# 13. Unsubscribe (sign-out)
client.post("/push/unsubscribe", headers=H(other), json={"endpoint": endpoint(1)})
check("13 after signing out the device gets nothing", len(deliveries(notify(other))) == 0)
check("13 someone else can't unsubscribe your device", client.post("/push/unsubscribe", headers=H(res), json={"endpoint": endpoint(1)}).status_code == 200)

# Test notification
subscribe(res, 2)
r1 = client.post("/push/test", headers=H(res))
r2 = client.post("/push/test", headers=H(res))
run()
check("test push is queued and sent, rate-limited", r1.status_code == 200 and r2.status_code == 429 and SENT[-1][1]["title"].startswith("🔔"))

# 16. Notification texts in the code never carry contact details
src_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
bad = []
for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".py"):
            text = open(os.path.join(root, f), encoding="utf-8").read()
            for m in re.finditer(r"Notification\((.{0,600}?)\)\s*\)?", text, re.S):
                if re.search(r"message=f?['\"][^'\"]*\{[^}]*(email|phone|contact_no|address)[^}]*\}", m.group(1)):
                    bad.append(f"{f}: {m.group(1)[:80]}")
check("16 no notification message puts an email, phone or address into the text", not bad, bad)

# 15. No keys: nothing at all
os.environ.pop("VAPID_PRIVATE_KEY")
check("15 without keys nothing is queued", len(deliveries(notify(res))) == 0)
check("15 ...and subscribing says push isn't set up (503)", subscribe(res, 3).status_code == 503)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
