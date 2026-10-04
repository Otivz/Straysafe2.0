from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PetOwnerConfirmation(Base):
    """
    Staff proposed a resident account as a pet's owner (Assign Owner, or Returned to Owner with an account).
    Ownership only changes when that resident accepts; a reject means staff picked the wrong account.
    """
    __tablename__ = "pet_owner_confirmations"

    confirmation_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    proposed_owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    proposed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    previous_owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="assign")  # assign / returned_to_owner
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(Enum("Pending", "Accepted", "Rejected", "Cancelled"), default="Pending", nullable=False)
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    pet = relationship("Pet", foreign_keys=[pet_id])
    proposed_owner = relationship("User", foreign_keys=[proposed_owner_id])
    proposer = relationship("User", foreign_keys=[proposed_by])
