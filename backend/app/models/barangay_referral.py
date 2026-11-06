"""
Barangay Referral log (Subdivision-only plan, Phase 2).

The Barangay is an external party: it has no account in StraySafe. When a Subdivision Leader refers a case to the
Barangay, the leader records the referral here, then records what the Barangay later reports (with its date and any
evidence), and finally the outcome. Nothing here is something StraySafe itself did: every update says who reported it
and who recorded it. An update never changes custody, the holding place or the facility of the report.
"""
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

CONTACT_METHODS = ("call", "visit", "message", "letter", "other")
UPDATE_TYPES = ("acknowledged", "dispatched", "picked_up", "held", "impounded", "claimed", "adopted", "not_found", "other")
UPDATE_SOURCES = ("barangay_reported", "straysafe_user")

# Final outcome -> the report status that closes the case
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
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, unique=True)
    barangay_id: Mapped[int] = mapped_column(Integer, ForeignKey("barangays.barangay_id"), nullable=False)
    referred_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    referred_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reference_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_method: Mapped[str] = mapped_column(String(20), nullable=False)
    final_outcome: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    outcome_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    outcome_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outcome_recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    outcome_recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

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
    recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    referral: Mapped["BarangayReferral"] = relationship("BarangayReferral", back_populates="updates")
