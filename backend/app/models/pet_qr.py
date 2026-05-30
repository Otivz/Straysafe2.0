from typing import Optional
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PetQRCode(Base):
    __tablename__ = "pet_qr_codes"

    qr_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, unique=True
    )
    qr_token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    qr_image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    scan_count: Mapped[int] = mapped_column(Integer, default=0)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pet = relationship("Pet")


class PetQRScan(Base):
    __tablename__ = "pet_qr_scans"

    scan_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    qr_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pet_qr_codes.qr_id", ondelete="CASCADE"), nullable=False
    )
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False
    )
    scanned_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    finder_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    finder_contact: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    scan_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    scan_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    street_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    barangay: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location_type: Mapped[Optional[str]] = mapped_column(
        Enum("Found Location", "Barangay Hall", "Temporary Shelter", name="location_type"),
        default="Found Location",
    )
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    qr_code = relationship("PetQRCode")
    pet = relationship("Pet")
    user = relationship("User")
