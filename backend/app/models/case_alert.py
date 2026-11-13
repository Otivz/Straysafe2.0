from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# These tables come from backend/migrations/2026-11-12_lost_found_alerts.sql, applied by the developer. The start-up code skips
# tables marked with a migration (main.py) and only checks that they exist (app/db_migrations/lost_found_alerts.py).
MIGRATION = "2026-11-12_lost_found_alerts.sql"


class CaseAlert(Base):
    """
    A notification alert the Subdivision Leader sends about ONE lost-pet or found-animal case (docs/01-system/LOST_FOUND_ALERTS.md):
    its own title and message, the animal's photo or not, where a tap goes, who receives it, and when (now, at a time, or on a
    repeating schedule with an end). It is not the Community notice and never creates, republishes or edits one.

    status: scheduled (nothing sent yet) -> active (a repeating alert that has sent) -> finished (its schedule ended);
            paused (no sends until resumed); stopped (by the Leader, or by itself when the case was resolved); cancelled (stopped
            before anything was sent).
    """
    __tablename__ = "case_alerts"
    __table_args__ = (
        UniqueConstraint("client_request_id", name="uq_case_alert_request"),
        Index("ix_case_alerts_due", "status", "next_send_at"),
        {"info": {"migration": MIGRATION}},
    )

    alert_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(String(300), nullable=False)
    include_photo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    destination: Mapped[str] = mapped_column(String(12), nullable=False, default="notice")      # notice | sighting | claim | inbox
    audience: Mapped[str] = mapped_column(String(10), nullable=False, default="all")            # all | helpers
    mode: Mapped[str] = mapped_column(String(8), nullable=False)                                 # now | later | repeat
    repeat_kind: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)                 # every | times
    every_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    times_of_day: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)              # "07:00,12:00,18:00"
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_kind: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)                   # resolved | date | count
    end_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)                  # the end, or the latest end of "until resolved"
    max_sends: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="scheduled")
    next_send_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sends_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stop_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stopped_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)


class CaseAlertSend(Base):
    """
    One planned send of an alert. The unique key (alert, planned time) is what makes a send happen once: a second worker, a retry or a
    restart that tries the same occurrence is refused by the database. `skipped_before` counts planned sends missed while the server was
    down: only the latest one is sent, never a burst.
    """
    __tablename__ = "case_alert_sends"
    __table_args__ = (UniqueConstraint("alert_id", "slot_at", name="uq_case_alert_slot"), {"info": {"migration": MIGRATION}})

    send_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    alert_id: Mapped[int] = mapped_column(Integer, ForeignKey("case_alerts.alert_id", ondelete="CASCADE"), nullable=False)
    slot_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="sent")
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
