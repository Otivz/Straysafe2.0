from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ManualMatchDecision(Base):
    """
    One staff decision on a pair of reports made in Manual Matching. Append-only: a later decision on the same pair
    adds a row, so rejected and superseded decisions stay on record for audit. The pair's current state lives on its
    single report_matches row (match_id).
    """
    __tablename__ = "manual_match_decisions"

    decision_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    match_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_matches.match_id", ondelete="SET NULL"), nullable=True, index=True)
    # Plain ids (no FK) so the record survives even if a report is later removed
    report_a_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # The other side of the pair: another report, or a registered pet (exactly one is set)
    report_b_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    # CONFIRMED_MATCH | NOT_A_MATCH | UNABLE_TO_VERIFY (shown as "Needs Further Verification")
    decision: Mapped[str] = mapped_column(String(30), nullable=False)
    previous_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    staff_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Set when the staff member also chose to link both reports into one case
    linked_case_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Gemini's state when the decision was made (disabled / not_configured / error / operational)
    ai_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    staff = relationship("User", foreign_keys=[staff_id])
