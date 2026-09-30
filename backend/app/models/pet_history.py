from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PetHistory(Base):
    __tablename__ = "pet_history"

    history_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)  # "QR_TAG_SCANNED", "OWNER_CONFIRMED_RECOVERY", "RECOVERY_REJECTED", "STATUS_CHANGE"
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recovery_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "QR Tag Scan", "Manual", etc.
    scan_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pet_qr_scans.scan_id", ondelete="SET NULL"), nullable=True
    )
    actor_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "Owner", "Finder", "Staff", "Admin"
    previous_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    pet = relationship("Pet")
    actor = relationship("User", foreign_keys=[actor_id])
    scan = relationship("PetQRScan", foreign_keys=[scan_id])
