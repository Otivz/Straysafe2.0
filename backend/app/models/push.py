from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PushSubscription(Base):
    """One device/browser that may receive push notifications for one account (PUSH_NOTIFICATION_IMPLEMENTATION.md)."""
    __tablename__ = "push_subscriptions"

    subscription_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="webpush")  # webpush (fcm in phase 2)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    # sha256 of the endpoint: endpoints are long, so uniqueness is on the hash
    endpoint_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    p256dh: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    auth: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class PushDelivery(Base):
    """The outbox: one notification to one device. Sent by the push worker, retried, never twice."""
    __tablename__ = "push_deliveries"
    __table_args__ = (UniqueConstraint("notification_id", "subscription_id", name="uq_push_delivery"),)

    delivery_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    notification_id: Mapped[int] = mapped_column(Integer, ForeignKey("notifications.notification_id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id: Mapped[int] = mapped_column(Integer, ForeignKey("push_subscriptions.subscription_id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)  # queued / sent / failed / skipped
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
