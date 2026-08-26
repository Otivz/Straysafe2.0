from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func, JSON, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base


class ReportMatch(Base):
    __tablename__ = "report_matches"
    __allow_unmapped__ = True

    match_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    matched_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=True)
    matched_pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)

    # 0 to 100
    similarity_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)

    # Match Statuses
    # AI_SUGGESTED, PENDING_VERIFICATION, CONFIRMED_MATCH, NOT_A_MATCH, UNABLE_TO_VERIFY
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="AI_SUGGESTED"
    )

    ai_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_evidence: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Owner Feedback Status (Supporting Evidence)
    # PENDING, OWNER_CONFIRMED, OWNER_REJECTED, NO_RESPONSE
    owner_confirmation_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="PENDING"
    )
    owner_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Human Verification Details
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    reviewer_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    verification_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    source_report = relationship("Report", foreign_keys=[source_report_id], backref="source_matches")
    matched_report = relationship("Report", foreign_keys=[matched_report_id], backref="target_matches")
    matched_pet = relationship("Pet", foreign_keys=[matched_pet_id], backref="report_matches")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
