from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PetMatchConfirmationRequest(Base):
    """
    Owner-first pet matching (Manual Matching): staff ask a registered pet's owner whether a reported animal is their
    pet. Staff can make the final decision only after the owner answers YES; a NO blocks that pet for the report.
    One row per request; rows are never deleted, so the full confirmation history stays on record.
    Rules: app/utils/pet_match_confirmation.py, docs/01-system/MANUAL_REPORT_MATCHING.md.
    """
    __tablename__ = "pet_match_confirmation_requests"

    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    # The registered owner asked (the pet's owner when the request was sent)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    requested_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    staff_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # AWAITING_OWNER_CONFIRMATION | OWNER_CONFIRMED | OWNER_REJECTED | CANCELLED |
    # NEEDS_FURTHER_VERIFICATION | VERIFIED_MATCH | REJECTED_MATCH
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="AWAITING_OWNER_CONFIRMATION", index=True)
    owner_response: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # YES | NO
    owner_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_response_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Staff's final verification (only after an owner YES): CONFIRMED_MATCH | NOT_A_MATCH | UNABLE_TO_VERIFY
    final_decision: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    final_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    final_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    match_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_matches.match_id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    report = relationship("Report", foreign_keys=[report_id])
    pet = relationship("Pet", foreign_keys=[pet_id])
    owner = relationship("User", foreign_keys=[owner_id])
    requester = relationship("User", foreign_keys=[requested_by])
    finalizer = relationship("User", foreign_keys=[final_by])
