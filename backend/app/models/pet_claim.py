from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class PetClaim(Base):
    __tablename__ = "pet_claims"
    __allow_unmapped__ = True

    claim_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False
    )
    pet_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum("Potential Owner Match", "Possible Match Found", "Pending Review", "Approved", "Rejected", "Evidence Requested", name="claim_status"),
        default="Potential Owner Match",
        nullable=False
    )
    evidence_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    vaccine_card_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    vet_record_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registration_record_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    additional_photos_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    distinctive_markings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    match_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    report = relationship("Report")
    pet = relationship("Pet")
