"""
Email retries: the message is stored so it can be resent; the worker resends due emails (including ones a restart
interrupted); a mail-account problem (e.g. Gmail's "log in with your web browser") keeps emails waiting without
using up attempts; a recipient problem uses attempts then fails; nothing is sent late (codes after 15 min, others
after 24 h); an email is never sent twice. The mail sender is faked.
Run from the backend folder:  python tests/test_email_retry.py
"""
import os
import smtplib
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "email_retry_test.db")
os.environ["SMTP_USER"] = "sender@test-mail.com"
os.environ["SMTP_PASSWORD"] = "not-a-real-password"
os.environ.pop("RESEND_API_KEY", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.email_log import EmailLog  # noqa: E402
from app.services import email_service as es  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
results = []
SENT = []
OUTCOMES = []  # what the fake mail server does next: None = accept, or an exception to raise


def fake_send(to, subject, text, html):
    effect = OUTCOMES.pop(0) if OUTCOMES else None
    if effect is not None:
        raise effect
    SENT.append((to, subject, text))
    return True


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def email(key="report_status_update", text="Your report was verified.", created=None, status="Pending"):
    e = EmailLog(recipient_email="rita@test-mail.com", template_key=key, subject=f"Subject {len(SENT)}", status=status,
                 attempts=0, max_attempts=3, text_body=text, html_body=f"<p>{text}</p>" if text else None,
                 created_at=created or datetime.now())
    db.add(e)
    db.commit()
    return e.email_id


def row(eid):
    db.expire_all()
    return db.get(EmailLog, eid)


def deliver(eid, at=None):
    return es.deliver_logged_email(eid, sender=fake_send, now=at)


T0 = datetime.now()

# Stored message, sent once
captured = []
real_deliver = es.deliver_logged_email
es.deliver_logged_email = lambda eid, *a, **k: captured.append(eid)  # keep queue_email from really sending
log = es.queue_email(db, "rita@test-mail.com", "Hello", "plain text", "<p>html</p>", "report_status_update", "reports")
es.deliver_logged_email = real_deliver
import time  # noqa: E402
time.sleep(0.3)
check("queue_email saves the message so it can be resent", row(log.email_id).text_body == "plain text" and row(log.email_id).html_body == "<p>html</p>")
check("queue_email still tries right away", captured == [log.email_id])
check("delivering it sends once and marks Sent", deliver(log.email_id) == "Sent" and row(log.email_id).status == "Sent" and len(SENT) == 1)
check("delivering it again does nothing (never sent twice)", deliver(log.email_id) is None and len(SENT) == 1)

# Gmail account problem: keeps waiting, no attempts used, retried later
eid = email()
OUTCOMES.append(smtplib.SMTPAuthenticationError(534, b"5.7.9 Please log in with your web browser and then try again."))
check("a Gmail security hold keeps the email waiting", deliver(eid, T0) == "Pending" and row(eid).status == "Pending")
check("...without using up an attempt", row(eid).attempts == 0 and "account" in row(eid).error_message.lower())
check("...and it isn't retried before its time", es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=5)) == 0)
OUTCOMES.append(smtplib.SMTPServerDisconnected("Connection unexpectedly closed"))
es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=11))
check("a dropped connection is also an account problem (still waiting, 0 attempts)", row(eid).status == "Pending" and row(eid).attempts == 0)
before = len(SENT)
es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=22))
check("once the account works again, the worker sends it", row(eid).status == "Sent" and len(SENT) == before + 1)

# Recipient problem: uses attempts, then Failed
eid = email()
bad = smtplib.SMTPRecipientsRefused({"rita@test-mail.com": (550, b"No such user")})
OUTCOMES.extend([bad, bad, bad])
deliver(eid, T0)
check("a refused recipient uses one attempt and waits 5 minutes", row(eid).attempts == 1 and row(eid).status == "Pending")
es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=6))
es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=40))
check("after 3 refused tries it is Failed for good", row(eid).status == "Failed" and row(eid).attempts == 3)
check("a Failed email is never picked up again", es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(hours=2)) == 0)

# Interrupted by a restart: claimed but never finished
eid = email()
r = row(eid)
r.last_attempt_at = T0  # the sending thread died here
db.commit()
check("an email being sent right now isn't taken twice", es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(seconds=30)) == 0)
before = len(SENT)
es.retry_failed_emails(sender=fake_send, now=T0 + timedelta(minutes=3))
check("one interrupted by a restart is picked up after its claim runs out", row(eid).status == "Sent" and len(SENT) == before + 1)

# Nothing is sent late
eid = email(created=T0 - timedelta(hours=25))
es.retry_failed_emails(sender=fake_send, now=T0)
check("older than 24 hours: Expired, not sent", row(eid).status == "Expired")
eid = email(key="password_reset_otp", created=T0 - timedelta(minutes=20))
es.retry_failed_emails(sender=fake_send, now=T0)
check("a code older than 15 minutes: Expired, not sent", row(eid).status == "Expired")
eid = email(key="password_reset_otp", created=T0 - timedelta(minutes=3))
before = len(SENT)
es.retry_failed_emails(sender=fake_send, now=T0)
check("a fresh code is still sent", row(eid).status == "Sent" and len(SENT) == before + 1)

# Emails queued before this fix (no saved message)
eid = email(text=None)
es.retry_failed_emails(sender=fake_send, now=T0)
check("an old email without a saved message is closed with a clear reason", row(eid).status == "Failed" and "not saved" in row(eid).error_message)

# No mail configured: simulated
os.environ.pop("SMTP_PASSWORD")
eid = email()
check("without mail settings emails are 'Simulated'", deliver(eid) == "Simulated")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
