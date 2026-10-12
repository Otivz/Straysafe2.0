"""
Web Push delivery (PUSH_NOTIFICATION_IMPLEMENTATION.md).

  1. Hook: every committed `notifications` row of a pushable type becomes one queued `push_deliveries` row per active
     device of that user (rolled-back changes queue nothing). No change to the ~95 places that add notifications.
  2. Worker: sends queued deliveries, re-checking everything just before sending (account active, preferences,
     report access: a report that became private never reaches a lock screen), retries 5xx/timeouts after 1, 5 and
     15 minutes, revokes devices the push service says are gone (404/410), drops what is older than 24 hours.
Push is off (and nothing else changes) while the VAPID keys aren't configured.
"""
import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Callable, List, Optional
from urllib.parse import urlparse

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.push import PushDelivery, PushSubscription
from app.utils import push_categories as pc

logger = logging.getLogger("stray_safe.push")

RETRY_DELAYS_MIN = (1, 5, 15)
MAX_ATTEMPTS = len(RETRY_DELAYS_MIN)
CHAT_THROTTLE_SECONDS = 60
BATCH = 50
# Only the browsers' push services may be stored as endpoints (never an arbitrary URL the server would call)
ALLOWED_PUSH_HOSTS = (
    "fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
    "notify.windows.com", "push.apple.com",
)


def vapid_public_key() -> Optional[str]:
    return (os.getenv("VAPID_PUBLIC_KEY") or "").strip() or None


def push_configured() -> bool:
    return bool(vapid_public_key() and (os.getenv("VAPID_PRIVATE_KEY") or "").strip())


def endpoint_allowed(endpoint: str) -> bool:
    try:
        u = urlparse(endpoint or "")
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == h or host.endswith("." + h) for h in ALLOWED_PUSH_HOSTS)


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256((endpoint or "").encode()).hexdigest()


def now() -> datetime:
    return datetime.now()


# ---- 1. the hook ---------------------------------------------------------------------------------------------------
@event.listens_for(Session, "after_flush")
def _collect_new_notifications(session: Session, flush_context) -> None:
    if not push_configured():
        return
    for obj in session.new:
        if isinstance(obj, Notification) and obj.notification_id and pc.category_for(obj.type):
            session.info.setdefault("push_pending", []).append((obj.notification_id, obj.user_id))


@event.listens_for(Session, "after_rollback")
def _forget_on_rollback(session: Session) -> None:
    session.info.pop("push_pending", None)


@event.listens_for(Session, "after_commit")
def _queue_after_commit(session: Session) -> None:
    pending = session.info.pop("push_pending", None)
    if not pending:
        return
    try:
        # The committed session can't run SQL any more: queue in a separate, short session
        with Session(bind=session.get_bind()) as s:
            queue_deliveries(s, pending)
            s.commit()
    except Exception as e:  # pushing must never break the action that made the notification
        logger.warning(f"Could not queue push notifications: {e}")


def queue_deliveries(db: Session, pending: List[tuple]) -> int:
    """One queued delivery per (notification, active device). Returns how many were queued."""
    user_ids = {uid for _, uid in pending}
    subs = db.query(PushSubscription).filter(PushSubscription.user_id.in_(user_ids),
                                             PushSubscription.revoked_at.is_(None)).all()
    by_user: dict = {}
    for sub in subs:
        by_user.setdefault(sub.user_id, []).append(sub)
    n = 0
    for nid, uid in pending:
        for sub in by_user.get(uid, []):
            db.add(PushDelivery(notification_id=nid, subscription_id=sub.subscription_id, status="queued"))
            n += 1
    return n


# ---- 2. sending ----------------------------------------------------------------------------------------------------
class PushResult:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


def webpush_send(sub: PushSubscription, data: str, ttl: int) -> PushResult:
    """Send one encrypted Web Push message. Raises on network errors (retried)."""
    from pywebpush import WebPushException, webpush
    try:
        resp = webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=data,
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY", "").strip(),
            vapid_claims={"sub": os.getenv("VAPID_SUBJECT", "mailto:straysafe-admin@example.com").strip()},
            ttl=ttl,
            timeout=10,
        )
        return PushResult(getattr(resp, "status_code", 201) or 201)
    except WebPushException as e:
        resp = getattr(e, "response", None)
        if resp is not None:
            return PushResult(resp.status_code, (resp.text or "")[:200])
        raise


def _preferences(db: Session, user_id: int):
    from app.models.notification_preference import UserNotificationPreference
    return db.query(UserNotificationPreference).filter(UserNotificationPreference.user_id == user_id).first()


def skip_reason(db: Session, delivery: PushDelivery, sub: PushSubscription, notif: Optional[Notification], user,
                at: Optional[datetime] = None, sent_now: Optional[set] = None) -> Optional[str]:
    """Why this push must not be sent now (None = send). Checked just before sending."""
    if notif is None:
        return "notification deleted"
    if sub is None or sub.revoked_at is not None:
        return "device signed out or blocked"
    if sub.user_id != notif.user_id:
        return "device now belongs to another account"
    if user is None or (getattr(user, "status", "Active") or "Active") != "Active":
        return "account not active"
    cat = pc.category_for(notif.type)
    if cat is None:
        return "type not pushed"
    prefs = _preferences(db, user.user_id)
    if prefs is not None and (not prefs.push_enabled or (cat in pc.PREF_COLUMN and not getattr(prefs, pc.PREF_COLUMN[cat], True))):
        return "turned off in settings"
    # Rule 11 of report visibility: nothing about a report the person can no longer see
    from app.routes.notifications import redact_report_notifications
    if redact_report_notifications([notif], user, db)[0].related_id is None and notif.related_id is not None:
        return "report no longer available to this person"
    if cat == pc.MESSAGES:
        key = (sub.subscription_id, notif.type, notif.related_id)
        if sent_now is not None and key in sent_now:
            return "throttled (a push for this conversation was just sent)"
        recent = db.query(PushDelivery.delivery_id).join(Notification, Notification.notification_id == PushDelivery.notification_id).filter(
            PushDelivery.subscription_id == sub.subscription_id, PushDelivery.status == "sent",
            PushDelivery.sent_at >= (at or now()) - timedelta(seconds=CHAT_THROTTLE_SECONDS),
            Notification.type == notif.type, Notification.related_id == notif.related_id,
        ).first()
        if recent:
            return "throttled (a push for this conversation was just sent)"
    return None


def payload_for(db: Session, notif: Notification, user) -> dict:
    prefs = _preferences(db, user.user_id)
    show = True if prefs is None else bool(prefs.push_show_preview)
    title, body = pc.push_text(notif.title, notif.message, show)
    return {
        "title": title, "body": body,
        "url": pc.notification_link(user.role_id, notif.type, notif.related_id, notif.title or ""),
        "tag": pc.push_tag(notif.type, notif.related_id),
        "notification_id": notif.notification_id,
    }


def send_due(db: Session, sender: Callable[[PushSubscription, str, int], PushResult] = webpush_send,
             at: Optional[datetime] = None) -> dict:
    """Send the queued deliveries that are due. No commit. Returns counts by outcome."""
    from app.models.user import User
    t = at or now()
    counts = {"sent": 0, "skipped": 0, "retry": 0, "failed": 0, "revoked": 0}
    sent_now: set = set()  # sent in this run (not flushed yet): for the chat throttle
    due = db.query(PushDelivery).filter(
        PushDelivery.status == "queued",
        (PushDelivery.next_attempt_at.is_(None)) | (PushDelivery.next_attempt_at <= t),
    ).order_by(PushDelivery.delivery_id).limit(BATCH).all()
    for d in due:
        sub = db.get(PushSubscription, d.subscription_id)
        notif = db.get(Notification, d.notification_id)
        user = db.get(User, notif.user_id) if notif is not None else None
        created = (notif.created_at if notif is not None else None) or d.created_at or t
        if (t - created).total_seconds() > pc.TTL_SECONDS:
            d.status, d.last_error = "failed", "expired (older than 24 hours)"
            counts["failed"] += 1
            continue
        reason = skip_reason(db, d, sub, notif, user, t, sent_now)
        if reason:
            d.status, d.last_error = "skipped", reason
            counts["skipped"] += 1
            continue
        data = json.dumps(payload_for(db, notif, user))
        d.attempts += 1
        try:
            res = sender(sub, data, pc.TTL_SECONDS)
            code, err = res.status_code, res.text
        except Exception as e:
            code, err = 0, str(e)[:200]
        if 200 <= code < 300:
            d.status, d.sent_at, d.last_error = "sent", t, None
            sub.last_success_at = t
            sent_now.add((sub.subscription_id, notif.type, notif.related_id))
            counts["sent"] += 1
        elif code in (404, 410):
            d.status, d.last_error = "failed", f"device gone ({code})"
            sub.revoked_at = t
            counts["revoked"] += 1
        elif code in (400, 401, 403, 413):
            d.status, d.last_error = "failed", f"rejected ({code}) {err}"[:500]
            counts["failed"] += 1
        elif d.attempts >= MAX_ATTEMPTS:
            d.status, d.last_error = "failed", f"gave up after {d.attempts} tries ({code or 'network'}) {err}"[:500]
            counts["failed"] += 1
        else:
            d.next_attempt_at = t + timedelta(minutes=RETRY_DELAYS_MIN[d.attempts - 1])
            d.last_error = f"retrying ({code or 'network'}) {err}"[:500]
            counts["retry"] += 1
    return counts


# ---- 3. the worker -------------------------------------------------------------------------------------------------
def run_once() -> dict:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        counts = send_due(db)
        db.commit()
        return counts
    except Exception as e:
        db.rollback()
        logger.warning(f"Push worker run failed: {e}")
        return {}
    finally:
        db.close()


async def start_push_queue_worker(interval_seconds: int = 5):
    """Started in the FastAPI lifespan. Does nothing while push isn't configured."""
    if not push_configured():
        logger.info("Push notifications are off (VAPID keys not set).")
        return
    logger.info("Push notification worker started.")
    try:
        while True:
            counts = await asyncio.to_thread(run_once)
            if counts and any(counts.values()):
                logger.info(f"Push worker: {counts}")
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        logger.info("Push notification worker stopped.")
