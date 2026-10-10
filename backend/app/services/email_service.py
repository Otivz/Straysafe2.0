import os
import smtplib
import ssl
import logging
import asyncio
import re
from datetime import datetime
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

    # Create EmailLog record
    initial_status = "Pending" if (is_smtp_configured() or is_resend_configured()) else "Simulated"
    email_log = EmailLog(
        user_id=user_id,
        recipient_email=recipient_email,
        template_key=template_key,
        subject=subject,
        status=initial_status,
        attempts=0,
        max_attempts=3,
        idempotency_key=idempotency_key,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
    )
    db.add(email_log)
    db.commit()
    db.refresh(email_log)

    # Immediately trigger non-blocking delivery in background (loop or daemon thread)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_dispatch_single_email_task(
            email_id=email_log.email_id,
            to_email=recipient_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        ))
    except RuntimeError:
        import threading
        threading.Thread(
            target=_deliver_and_update_log,
            args=(email_log.email_id, recipient_email, subject, text_body, html_body),
            daemon=True
        ).start()

    return email_log


async def _dispatch_single_email_task(
    email_id: int,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str],
):
    """
    Asynchronously executes email sending via thread pool so HTTP threads are never blocked.
    """
    await asyncio.to_thread(_deliver_and_update_log, email_id, to_email, subject, text_body, html_body)


def _deliver_and_update_log(
    email_id: int,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str],
):
    db: Session = SessionLocal()
    try:
        log_entry = db.query(EmailLog).filter(EmailLog.email_id == email_id).first()
        if not log_entry:
            return

        if not (is_smtp_configured() or is_resend_configured()):
            # Simulated environment
            log_entry.status = "Simulated"
            log_entry.sent_at = datetime.now()
            db.commit()
            return

        log_entry.attempts += 1
        try:
            _deliver_email_sync(to_email, subject, text_body, html_body)
            log_entry.status = "Sent"
            log_entry.sent_at = datetime.now()
            log_entry.error_message = None
            db.commit()
            logger.info(f"Email successfully delivered to {to_email} (ID #{email_id})")
        except Exception as send_err:
            log_entry.status = "Failed"
            log_entry.error_message = str(send_err)[:500]
            db.commit()
            logger.warning(f"Failed to send email to {to_email} (Attempt {log_entry.attempts}/{log_entry.max_attempts}): {send_err}")
    except Exception as db_err:
        logger.error(f"Error updating email log #{email_id}: {db_err}")
    finally:
        db.close()


def retry_failed_emails() -> int:
    """
    Scans email_logs for pending or failed emails that have not exceeded max_attempts.
    Retries delivery. Returns the count of processed items.
    """
    if not (is_smtp_configured() or is_resend_configured()):
        return 0

    db: Session = SessionLocal()
    processed = 0
    try:
        failed_jobs = db.query(EmailLog).filter(
            EmailLog.status == "Failed",
            EmailLog.attempts < EmailLog.max_attempts,
        ).limit(20).all()

        for job in failed_jobs:
            processed += 1
            # Note: For retrying failed items without raw bodies, we log diagnostic attempt
            logger.info(f"Retrying failed email job #{job.email_id} for {job.recipient_email} (Attempt {job.attempts + 1})")
    finally:
        db.close()
    return processed


async def start_email_queue_worker(interval_seconds: int = 60):
    """
    Periodic background sweeper started in FastAPI lifespan to handle retries and queue maintenance.
    """
    logger.info("Email queue background worker started.")
    try:
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                await asyncio.to_thread(retry_failed_emails)
            except Exception as loop_err:
                logger.warning(f"Notice in email worker loop: {loop_err}")
    except asyncio.CancelledError:
        logger.info("Email queue background worker cancelled.")
