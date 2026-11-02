from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LeaderIdentityVerification(Base):
    """
    The handling Subdivision Leader verified that a staff-confirmed sighting is the registered pet, because the owner
    rejected the match or didn't answer within 24 hours. It links the report to the pet so the case can proceed
    (e.g. owner warnings), but it is never the owner's ownership proof at handover and never replaces the owner's
    answer: the owner is notified and keeps formal dispute access. Rules: app/utils/leader_identity.py.
    """
    __tablename__ = "leader_identity_verifications"

    verification_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    match_id: Mapped[int] = mapped_column(Integer, ForeignKey("report_matches.match_id", ondelete="CASCADE"), nullable=False, unique=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    leader_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    # In-Person Inspection | Microchip / Tag Check | Owner Interview | Photo Comparison with Documents
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # OWNER_REJECTED | NO_RESPONSE_24H: why the owner's answer couldn't settle it
    trigger: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    leader = relationship("User", foreign_keys=[leader_id])
