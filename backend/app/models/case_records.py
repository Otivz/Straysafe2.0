"""
Small records that hang off a case (a report): general follow-ups, contact logs, reversible links between related
reports, and ownership claims on a found animal.

They are case DETAILS, not statuses. None of them changes a report's status by itself: the lifecycle service
(app/services/case_lifecycle.py) is the only place a case moves.

    case_followups      a thing to do or check, with a due date (a site check, a referral check, a post-closure check)
    case_contact_logs   who was contacted, how, and what came of it (owner, reporter, an organisation)
    case_links          two reports about the same thing, linked WITHOUT hiding or merging either one; reversible
    ownership_claims    a resident says a found animal is theirs; reviewed by the Subdivision Admin; never proves ownership
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CaseFollowUp(Base):
    __tablename__ = "case_followups"

    followup_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    # follow_up, site_check, reporter_update, referral_check, warning_end, post_closure
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="follow_up")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    # pending, done, cancelled
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending", index=True)
    referral_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("barangay_referrals.referral_id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    completion_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Why it ended without being done ("Case closed.", "Cancelled by the case officer.")
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class CaseContactLog(Base):
    __tablename__ = "case_contact_logs"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    # in_person, phone, message, letter
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    with_whom: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # cooperative, denied_ownership, no_response, other
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    contact_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    logged_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class CaseLink(Base):
    """
    Two reports linked as related. Nothing is hidden or merged: both reports stay whole, and unlinking only closes the
    link (the row is kept with who ended it and why). The pair is stored once, lower report id first.
    """
    __tablename__ = "case_links"

    link_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    related_report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    # related, duplicate, same_animal, same_incident
    link_type: Mapped[str] = mapped_column(String(20), nullable=False, default="related")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    unlinked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    unlinked_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    unlink_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class OwnershipClaim(Base):
    """
    A resident's claim that a found animal is theirs. The Subdivision Admin reviews it. Accepting a claim records that
    the claim was accepted for the next step; it never sets the case's owner by itself (ownership is its own decision,
    with evidence, in the case's ownership review).
    """
    __tablename__ = "ownership_claims"

    claim_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    alert_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("lost_pet_alerts.alert_id", ondelete="SET NULL"), nullable=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    claimant_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    claimed_pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    # ids from case_vocab.OWNERSHIP_EVIDENCE the claimant says they can show, and links to what they uploaded
    evidence: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    evidence_urls: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    # submitted, under_review, needs_info, accepted, rejected, withdrawn
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="submitted", index=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
