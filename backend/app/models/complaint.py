from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# These tables come from backend/migrations/2026-11-13_complaint_management.sql. The start-up code skips tables marked with a
# migration (main.py) and only checks that they exist (app/db_migrations/complaint_management.py).
MIGRATION = "2026-11-13_complaint_management.sql"
_INFO = {"info": {"migration": MIGRATION}}


class ComplaintRespondent(Base):
    """
    A person responsible for an animal, as the Subdivision Leader confirmed it on a complaint (docs/01-system/COMPLAINT_MANAGEMENT.md):
    a resident with a StraySafe account, or a household recorded by name and house address. Never deleted; when an account is removed
    the user link becomes NULL and the name and address stay, so the person's history survives.
    """
    __tablename__ = "complaint_respondents"
    __table_args__ = (UniqueConstraint("subdivision_id", "user_id", name="uq_complaint_respondent_user"), _INFO)

    respondent_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class ComplaintFinding(Base):
    """
    The Leader's findings on one complaint (a nuisance report), kept apart from the complainant's own words: the rule that was broken
    (a copy of the confirmed policy), who is responsible and on what evidence, what is still being checked, the leads that were ruled
    out, and a decision that a similar complaint is a separate incident. Whether the incident happened is the report's own
    incident verification.
    """
    __tablename__ = "complaint_findings"
    __table_args__ = (_INFO,)

    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), primary_key=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    policy_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    policy_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    policy_reference: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    no_rule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    respondent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("complaint_respondents.respondent_id"), nullable=True, index=True)
    respondent_evidence: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    respondent_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    respondent_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    respondent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    check_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    check_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    check_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ruled_out: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    separate_from_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True)
    separate_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    separate_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ComplaintOffense(Base):
    """
    The Leader's decision on one complaint: counted as the Nth offense of this person under this rule (the number as confirmed,
    never renumbered), or not counted, with the reason. A correction voids the row (who, when, why); nothing is deleted.
    """
    __tablename__ = "complaint_offenses"
    __table_args__ = (Index("ix_complaint_offenses_history", "respondent_id", "policy_id", "voided_at"), _INFO)

    offense_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False)
    respondent_id: Mapped[int] = mapped_column(Integer, ForeignKey("complaint_respondents.respondent_id"), nullable=False)
    policy_id: Mapped[str] = mapped_column(String(60), nullable=False)
    policy_title: Mapped[str] = mapped_column(String(200), nullable=False)
    policy_reference: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    counted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    offense_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    incident_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confirmed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    voided_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EnforcementStep(Base):
    """
    One thing the rule asks for a counted offense: the first or second warning letter, the summons to the subdivision office, the
    fine, the meeting at the Barangay. `state` is where it stands; `details` the current facts; each change is also an event.
    """
    __tablename__ = "enforcement_steps"
    __table_args__ = (UniqueConstraint("offense_id", "kind", name="uq_enforcement_step"), _INFO)

    step_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    offense_id: Mapped[int] = mapped_column(Integer, ForeignKey("complaint_offenses.offense_id", ondelete="CASCADE"), nullable=False)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    referral_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("barangay_referrals.referral_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class EnforcementStepEvent(Base):
    """Append-only: one thing that happened on a step, when it happened (as recorded) and who recorded it."""
    __tablename__ = "enforcement_step_events"
    __table_args__ = (UniqueConstraint("client_request_id", name="uq_enforcement_event_request"), _INFO)

    event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    step_id: Mapped[int] = mapped_column(Integer, ForeignKey("enforcement_steps.step_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

