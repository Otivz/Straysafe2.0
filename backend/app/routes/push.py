"""
Push notification devices (PUSH_NOTIFICATION_IMPLEMENTATION.md P8). A device belongs to the account that turned push
on in it; signing out removes it; another account turning push on in the same browser takes it over (never shared).
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.notification import Notification
from app.models.push import PushDelivery, PushSubscription
from app.models.user import User
from app.services import push_service
from app.utils.auth import get_current_user

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/public-key")
def get_public_key():
    """The VAPID public key the browser subscribes with. enabled=false: push isn't set up on this server."""
    key = push_service.vapid_public_key()
    return {"enabled": push_service.push_configured(), "public_key": key if push_service.push_configured() else None}


@router.post("/subscribe")
def subscribe(body: PushSubscribeRequest, request: Request, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    if not push_service.push_configured():
        raise HTTPException(status_code=503, detail="Push notifications aren't set up on this server yet.")
    endpoint = (body.endpoint or "").strip()
    if len(endpoint) > 2000 or not push_service.endpoint_allowed(endpoint):
        raise HTTPException(status_code=422, detail="This browser's push address isn't supported.")
    if not body.keys.p256dh or not body.keys.auth or len(body.keys.p256dh) > 255 or len(body.keys.auth) > 255:
        raise HTTPException(status_code=422, detail="Missing push keys.")
    h = push_service.endpoint_hash(endpoint)
    sub = db.query(PushSubscription).filter(PushSubscription.endpoint_hash == h).first()
    if sub is None:
        sub = PushSubscription(endpoint=endpoint, endpoint_hash=h, channel="webpush", user_id=current_user.user_id)
        db.add(sub)
    elif sub.user_id != current_user.user_id:
        # Another account turned push on in this browser: it takes the device over; queued pushes for the old
        # account are dropped (they'd be skipped anyway)
        db.query(PushDelivery).filter(PushDelivery.subscription_id == sub.subscription_id,
                                      PushDelivery.status == "queued").update(
            {"status": "skipped", "last_error": "device now belongs to another account"}, synchronize_session=False)
        sub.user_id = current_user.user_id
    sub.p256dh, sub.auth = body.keys.p256dh, body.keys.auth
    sub.user_agent = (request.headers.get("user-agent") or "")[:255]
    sub.revoked_at = None
    db.commit()
    return {"subscribed": True, "subscription_id": sub.subscription_id}


@router.post("/unsubscribe")
def unsubscribe(body: PushUnsubscribeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(PushSubscription).filter(PushSubscription.endpoint_hash == push_service.endpoint_hash(body.endpoint)).first()
    if sub is not None and sub.user_id == current_user.user_id and sub.revoked_at is None:
        sub.revoked_at = datetime.now()
        db.query(PushDelivery).filter(PushDelivery.subscription_id == sub.subscription_id,
                                      PushDelivery.status == "queued").update(
            {"status": "skipped", "last_error": "device signed out"}, synchronize_session=False)
        db.commit()
    return {"subscribed": False}


@router.get("/status")
def status(endpoint: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Is this browser (endpoint) receiving this account's pushes?"""
    active = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.user_id,
                                               PushSubscription.revoked_at.is_(None))
    this = None
    if endpoint:
        this = active.filter(PushSubscription.endpoint_hash == push_service.endpoint_hash(endpoint)).first()
    return {"enabled": push_service.push_configured(), "devices": active.count(), "this_device": this is not None}


@router.post("/test")
def send_test(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sends "push is working" to the user's own devices (once a minute at most)."""
    if not push_service.push_configured():
        raise HTTPException(status_code=503, detail="Push notifications aren't set up on this server yet.")
    if not db.query(PushSubscription.subscription_id).filter(PushSubscription.user_id == current_user.user_id,
                                                             PushSubscription.revoked_at.is_(None)).first():
        raise HTTPException(status_code=409, detail="Turn on push notifications on this device first.")
    recent = db.query(Notification.notification_id).filter(
        Notification.user_id == current_user.user_id, Notification.type == "push_test",
        Notification.created_at >= datetime.now() - timedelta(minutes=1)).first()
    if recent:
        raise HTTPException(status_code=429, detail="A test was just sent. Try again in a minute.")
    n = Notification(user_id=current_user.user_id, title="🔔 Push notifications are working",
                     message="You'll get StraySafe updates on this device even when the app is closed.",
                     type="push_test", is_read=True, created_at=datetime.now())  # same clock as the check above
    db.add(n)
    db.commit()  # the hook queues it; the worker sends it within a few seconds
    return {"queued": True}
