"""
External referral log.

Originally this was the Barangay referral log (Subdivision-only plan, Phase 2). The table keeps its name and its
rows, and now records a referral to ANY external organisation (the Barangay, animal control, a veterinary office, an
animal welfare group, a wildlife unit): a case can have several, each with its own status.

The organisation is an external party: it has no account in StraySafe. The Subdivision Admin records the referral,
then what the organisation reports back (with its date and any evidence). Nothing here is something StraySafe itself
did: every update says who reported it and who recorded it. A referral never changes custody, the holding place or the
facility of the report, and it NEVER closes the case: closing is the Subdivision Admin's own documented decision
(app/services/case_lifecycle.py). A referral needs no registered animal: an urgent safety referral can go first.
"""
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

CONTACT_METHODS = ("call", "visit", "message", "letter", "other")
UPDATE_TYPES = ("acknowledged", "dispatched", "picked_up", "held", "impounded", "claimed", "adopted", "not_found", "other")
UPDATE_SOURCES = ("barangay_reported", "org_reported", "straysafe_user")
# What the Barangay said happened (older records and the Barangay outcome form). Recorded as what was reported;
# it does not change the case's status.
REPORTED_OUTCOMES = ("claimed", "released", "resolved", "deceased", "not_found")

# Historical reference only. Until the referral rework a reported outcome closed the report with these legacy
# statuses. It no longer does: recording an outcome never changes the case (closing is its own documented decision).
# Kept because the analytics service lists the outcomes from it and older reports were closed this way.
OUTCOME_STATUS = {
    "claimed": 9,      # Claimed by Owner
    "released": 10,    # Released
    "resolved": 11,    # Incident Resolved
    "deceased": 12,    # Deceased
    "not_found": 17,   # Animal Cannot Be Found
}


class BarangayReferral(Base):
    __tablename__ = "barangay_referrals"

    referral_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Several referrals per case are allowed (a Barangay referral and a veterinary referral, a second attempt, ...)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    # Set for a Barangay referral; NULL for the other organisations
    barangay_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("barangays.barangay_id"), nullable=True)
    referred_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    referred_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reference_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_method: Mapped[str] = mapped_column(String(20), nullable=False)
    # Reported outcome of a Barangay referral (the older single outcome). Informational: it never closes the case.
    final_outcome: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    outcome_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    outcome_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outcome_recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    outcome_recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Who it was referred to
    org_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    org_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    contact_detail: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # An urgent safety referral does not wait for an assessment or an animal record
    is_urgent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    # Its own status: sent, acknowledged, in_progress, completed, declined, no_response (app/utils/case_vocab.py)
    referral_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="sent")
    status_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status_updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    # What the organisation reports it did, and what (if anything) is left for the subdivision
    external_outcome: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    remaining_follow_up: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    updates: Mapped[List["BarangayReferralUpdate"]] = relationship(
        "BarangayReferralUpdate", back_populates="referral", cascade="all, delete-orphan",
        order_by="BarangayReferralUpdate.update_id",
    )


class BarangayReferralUpdate(Base):
    __tablename__ = "barangay_referral_updates"

    update_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    referral_id: Mapped[int] = mapped_column(Integer, ForeignKey("barangay_referrals.referral_id", ondelete="CASCADE"), nullable=False, index=True)
    update_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="barangay_reported")
    update_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # The referral's status once this note was recorded (NULL on notes that did not change it)
    status_after: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    referral: Mapped["BarangayReferral"] = relationship("BarangayReferral", back_populates="updates")
