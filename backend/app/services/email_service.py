import os
import smtplib
import ssl
import logging
import asyncio
import re
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import SessionLocal
from app.models.email_log import EmailLog
from app.models.notification_preference import UserNotificationPreference
from app.models.user import User

logger = logging.getLogger("stray_safe.email_service")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(email: Optional[str]) -> bool:
    if not email or not isinstance(email, str):
        return False
    return bool(EMAIL_REGEX.match(email.strip()))


def is_smtp_configured() -> bool:
    return bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def is_resend_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


def check_user_email_preference(
    db: Session,
    user_id: Optional[int],
    category: str
) -> bool:
    """
    Checks if the user has opted in for the given notification category.
    Mandatory categories (security, auth, invite, warning) always return True.
    If no preference row exists yet, defaults to True.
    """
    if not user_id:
        return True
        
    # Mandatory security and compliance categories bypass preference checks
    if category in ("security", "auth", "account_invite", "password_reset", "warning"):
        return True

    pref = db.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == user_id
    ).first()

    if not pref:
        # Default all categories to True if not explicitly saved
        return True

    category_map = {
        "reports": pref.email_reports,
        "rescues": pref.email_rescues,
        "pet_matches": pref.email_pet_matches,
        "claims": pref.email_claims,
        "reminders": pref.email_reminders,
    }

    return category_map.get(category, True)


def _deliver_email_sync(to_email: str, subject: str, text_body: str, html_body: Optional[str] = None) -> bool:
    """
    Synchronously transmits one email over SMTP or Resend API.
    Returns True on success, raises Exception on delivery failure.
    """
    if not is_valid_email(to_email):
        raise ValueError(f"Invalid recipient email address format: {to_email}")

    # 1. Resend API if configured
    if is_resend_configured():
        import urllib.request
        import json

        resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
        from_email = os.getenv("SMTP_FROM_EMAIL", "onboarding@resend.dev")
        from_name = os.getenv("SMTP_FROM_NAME", "StraySafe")

        payload = {
            "from": f"{from_name} <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "text": text_body,
        }
        if html_body:
            payload["html"] = html_body

        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                return True
            raise RuntimeError(f"Resend returned HTTP status {resp.status}")

    # 2. Standard SMTP (Gmail, Brevo, SES, etc.)
    if is_smtp_configured():
        host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        port = int(os.getenv("SMTP_PORT", "587"))
        user = os.getenv("SMTP_USER", "").strip()
        password = os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip()
        from_name = os.getenv("SMTP_FROM_NAME", "StraySafe")

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = formataddr((from_name, user))
        msg["To"] = to_email
        msg.set_content(text_body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")

        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls(context=context)
            smtp.login(user, password)
            smtp.send_message(msg)
        return True

    # 3. Development Simulation (when no SMTP credentials configured)
    logger.info(f"[SIMULATED EMAIL] To: {to_email} | Subject: '{subject}' (No SMTP configured)")
    return True


def queue_email(
    db: Session,
    recipient_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    template_key: str,
    category: str,
    user_id: Optional[int] = None,
    idempotency_key: Optional[str] = None,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[int] = None,
) -> Optional[EmailLog]:
    """
    Enqueues an email in email_logs and immediately initiates background transmission.
    Prevents duplicates via idempotency_key and respects user preferences.
    """
    recipient_email = (recipient_email or "").strip()
    if not is_valid_email(recipient_email):
        logger.warning(f"Skipping email queue: invalid recipient email '{recipient_email}'")
        return None

    # Check user preferences
    if not check_user_email_preference(db, user_id, category):
        logger.info(f"User {user_id} has opted out of category '{category}'. Email suppressed.")
        return None

    # Check idempotency deduplication
    if idempotency_key:
        existing = db.query(EmailLog).filter(
            EmailLog.idempotency_key == idempotency_key
        ).first()
        if existing:
            logger.info(f"Duplicate email prevented by idempotency key '{idempotency_key}' (Status: {existing.status})")
            return existing

    # Create EmailLog record (with the message, so a failed or interrupted send can be retried)
    initial_status = "Pending" if (is_smtp_configured() or is_resend_configured()) else "Simulated"
    email_log = EmailLog(
        user_id=user_id,
        recipient_email=recipient_email,
        template_key=template_key,
        subject=subject,
        status=initial_status,
        attempts=0,
        max_attempts=MAX_ATTEMPTS,
        idempotency_key=idempotency_key,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        text_body=text_body,
        html_body=html_body,
        created_at=datetime.now(),  # the same clock the expiry check uses
    )
    db.add(email_log)
    db.commit()
    db.refresh(email_log)

    # Try right away in the background (the worker picks it up later if this is interrupted or fails)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(deliver_logged_email, email_log.email_id))
    except RuntimeError:
        import threading
        threading.Thread(target=deliver_logged_email, args=(email_log.email_id,), daemon=True).start()

    return email_log


# ---- delivery and retries -----------------------------------------------------------------------------------------
# A recipient problem (bad address...) uses up one of MAX_ATTEMPTS, retried after 5 then 30 minutes.
# A problem with our mail account or the connection (e.g. Gmail asking for a security check) is not the email's
# fault: it keeps the email waiting, checked every ACCOUNT_RETRY_MINUTES, without using up its attempts.
# Nothing is sent late: older than MAX_AGE (or the short limit for codes and links) it becomes 'Expired'.
MAX_ATTEMPTS = 3
RETRY_DELAYS_MIN = (5, 30)
ACCOUNT_RETRY_MINUTES = 10
CLAIM_SECONDS = 120
MAX_AGE = timedelta(hours=24)
TIME_SENSITIVE_MAX_AGE = timedelta(minutes=15)
TIME_SENSITIVE_KEYS = ("otp", "verification", "password", "reset", "login")
WORKER_BATCH = 20


def _max_age(template_key: Optional[str]) -> timedelta:
    key = (template_key or "").lower()
    return TIME_SENSITIVE_MAX_AGE if any(k in key for k in TIME_SENSITIVE_KEYS) else MAX_AGE


def is_account_problem(err: Exception) -> bool:
    """Our side (mail account, login, connection), not this recipient."""
    if isinstance(err, smtplib.SMTPRecipientsRefused):
        return False
    if isinstance(err, (smtplib.SMTPAuthenticationError, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError,
                        smtplib.SMTPHeloError, smtplib.SMTPSenderRefused, ssl.SSLError, ConnectionError,
                        TimeoutError, OSError)):
        return True
    return isinstance(err, smtplib.SMTPResponseException) and 400 <= err.smtp_code < 500


def _claim(db: Session, email_id: int, now: datetime) -> bool:
    """Atomically take this email for sending (so the immediate send and the worker never both send it)."""
    n = db.query(EmailLog).filter(
        EmailLog.email_id == email_id,
        EmailLog.status == "Pending",
        or_(EmailLog.next_attempt_at.is_(None), EmailLog.next_attempt_at <= now),
        or_(EmailLog.last_attempt_at.is_(None), EmailLog.last_attempt_at < now - timedelta(seconds=CLAIM_SECONDS)),
    ).update({EmailLog.last_attempt_at: now}, synchronize_session=False)
    db.commit()
    return n == 1


def deliver_logged_email(email_id: int, sender=None, now: Optional[datetime] = None) -> Optional[str]:
    """
    Send one queued email and record the outcome. Safe to call from anywhere, any number of times.
    Returns the new status ('Sent', 'Pending' = retry later, 'Failed', 'Expired', 'Simulated'), or None if not taken.
    """
    send = sender or _deliver_email_sync
    t = now or datetime.now()
    db: Session = SessionLocal()
    try:
        log_entry = db.query(EmailLog).filter(EmailLog.email_id == email_id).first()
        if not log_entry or log_entry.status != "Pending":
            return None
        if not (is_smtp_configured() or is_resend_configured()):
            log_entry.status, log_entry.sent_at = "Simulated", t
            db.commit()
            return "Simulated"
        if log_entry.created_at and t - log_entry.created_at > _max_age(log_entry.template_key):
            log_entry.status = "Expired"
            log_entry.error_message = ((log_entry.error_message or "") + " | Expired: too old to send now.").strip(" |")[:500]
            db.commit()
            return "Expired"
        if not log_entry.text_body and not log_entry.html_body:
            log_entry.status = "Failed"
            log_entry.error_message = ("The message text was not saved (queued before email retries existed), "
                                       "so it can not be resent.")
            db.commit()
            return "Failed"
        if not _claim(db, email_id, t):
            return None
        db.refresh(log_entry)
        try:
            send(log_entry.recipient_email, log_entry.subject, log_entry.text_body or "", log_entry.html_body)
        except Exception as send_err:
            if is_account_problem(send_err):
                log_entry.next_attempt_at = t + timedelta(minutes=ACCOUNT_RETRY_MINUTES)
                log_entry.error_message = f"Mail account or connection problem (will retry): {send_err}"[:500]
                outcome = "Pending"
            else:
                log_entry.attempts += 1
                if log_entry.attempts >= (log_entry.max_attempts or MAX_ATTEMPTS):
                    log_entry.status = "Failed"
                    outcome = "Failed"
                else:
                    delay = RETRY_DELAYS_MIN[min(log_entry.attempts - 1, len(RETRY_DELAYS_MIN) - 1)]
                    log_entry.next_attempt_at = t + timedelta(minutes=delay)
                    outcome = "Pending"
                log_entry.error_message = str(send_err)[:500]
            log_entry.last_attempt_at = None
            db.commit()
            logger.warning(f"Email #{email_id} not sent ({outcome}): {send_err}")
            return outcome
        log_entry.attempts += 1
        log_entry.status, log_entry.sent_at, log_entry.error_message = "Sent", t, None
        log_entry.next_attempt_at = None
        log_entry.last_attempt_at = None
        db.commit()
        logger.info(f"Email #{email_id} delivered.")
        return "Sent"
    except Exception as db_err:
        logger.error(f"Error delivering email #{email_id}: {db_err}")
        return None
    finally:
        db.close()


def retry_failed_emails(sender=None, now: Optional[datetime] = None) -> int:
    """
    The worker's sweep: every waiting email whose retry time has come (including ones interrupted by a restart,
    whose claim has run out) is sent again; old ones expire. Returns how many were handled.
    """
    if not (is_smtp_configured() or is_resend_configured()):
        return 0
    t = now or datetime.now()
    db: Session = SessionLocal()
    try:
        due = [e for (e,) in db.query(EmailLog.email_id).filter(
            EmailLog.status == "Pending",
            or_(EmailLog.next_attempt_at.is_(None), EmailLog.next_attempt_at <= t),
            or_(EmailLog.last_attempt_at.is_(None), EmailLog.last_attempt_at < t - timedelta(seconds=CLAIM_SECONDS)),
        ).order_by(EmailLog.email_id).limit(WORKER_BATCH).all()]
    finally:
        db.close()
    return sum(1 for email_id in due if deliver_logged_email(email_id, sender=sender, now=t) is not None)


async def start_email_queue_worker(interval_seconds: int = 60):
    """Periodic background sweeper started in FastAPI lifespan: resends waiting emails when their retry time comes."""
    logger.info("Email queue background worker started.")
    try:
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                handled = await asyncio.to_thread(retry_failed_emails)
                if handled:
                    logger.info(f"Email worker handled {handled} waiting email(s).")
            except Exception as loop_err:
                logger.warning(f"Notice in email worker loop: {loop_err}")
    except asyncio.CancelledError:
        logger.info("Email queue background worker cancelled.")
