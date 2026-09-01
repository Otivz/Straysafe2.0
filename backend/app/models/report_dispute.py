from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class ReportDispute(Base):
    __tablename__ = "report_disputes"
    __allow_unmapped__ = True

    dispute_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False
    )
    resident_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    pet_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True
    )
    dispute_reason: Mapped[str] = mapped_column(Text, nullable=False)
    vaccination_card_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supporting_photo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("Pending", "Accepted", "Rejected", name="dispute_status_enum"),
        default="Pending",
        nullable=False
    )
    reviewer_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    report = relationship("Report", back_populates="disputes")
    resident = relationship("User", foreign_keys=[resident_user_id])
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    pet = relationship("Pet")
