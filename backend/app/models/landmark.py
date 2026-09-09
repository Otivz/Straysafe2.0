from typing import Optional
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, ForeignKey, Enum, Numeric, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base
from app.models.user import Barangay, Subdivision

class Landmark(Base):
    __tablename__ = "landmarks"

    landmark_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="general", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subdivision_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="CASCADE"), nullable=True)
    barangay_id: Mapped[int] = mapped_column(Integer, ForeignKey("barangays.barangay_id", ondelete="CASCADE"), nullable=False, default=1)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    is_holding_facility: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    facility_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(Enum('Active', 'Inactive', name='landmark_status'), default='Active', nullable=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    subdivision: Mapped[Optional[Subdivision]] = relationship("Subdivision")
    barangay: Mapped[Optional[Barangay]] = relationship("Barangay")
