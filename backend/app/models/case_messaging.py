from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CaseMessageThread(Base):
    """
    A conversation on a lost-pet or found-animal report (docs/01-system/LOST_FOUND_MATCHING.md, "Messages and the bridge").

      direct  the Subdivision Leader and ONE resident of the report (its owner, its reporter, or the finder): "Contact the owner".
      bridge  opened the moment a Leader links a lost report to a found report: the owner, the finder and the Leader, in one place.

    It is a conversation, not a record of ownership: nothing said here changes a case status, and a recovery is still only the owner's
    confirmation. A `bridge` ends (status `closed`, with who and why) when the link is removed. The messages are kept.
    """
    __tablename__ = "case_message_threads"

    thread_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)                                     # direct | bridge
    # direct: the report the resident is about. bridge: the lost-pet report (and `related_report_id` is the found-animal report).
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    related_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=True, index=True)
    match_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)             # bridge: the lost_found_matches row it was opened for
    link_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)                           # bridge: the case link it was opened for
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="open", server_default="open", index=True)   # open | closed
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CaseMessageMember(Base):
    """Who is in a thread, in which role, and how far they have read. A Leader of the subdivision who writes in a thread joins it."""
    __tablename__ = "case_message_members"
    __table_args__ = (UniqueConstraint("thread_id", "user_id", name="uq_case_message_member"),)

    member_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(Integer, ForeignKey("case_message_threads.thread_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)                                    # leader | owner | finder | reporter
    report_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)                         # the report this member speaks for
    last_read_message_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CaseMessage(Base):
    """One message. `system` messages (no sender) say what happened to the thread: it was opened, it was closed. Text only."""
    __tablename__ = "case_messages"
    __table_args__ = (Index("uq_case_message_request", "client_request_id", unique=True),)

    message_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(Integer, ForeignKey("case_message_threads.thread_id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(8), nullable=False, default="message", server_default="message")          # message | system
    body: Mapped[str] = mapped_column(Text, nullable=False)
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
