from decimal import Decimal
from typing import Optional
from datetime import datetime
from sqlalchemy import Integer, String, Text, DECIMAL, TIMESTAMP, ForeignKey, func, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class OwnerWarning(Base):
    __tablename__ = "owner_warnings"

    warning_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True, index=True)
    issued_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    warning_level: Mapped[str] = mapped_column(
        Enum("Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation", name="warning_level_enum"),
        default="1st Warning",
        nullable=False
    )
    violation_type: Mapped[str] = mapped_column(
        Enum(
            "Free-Roaming Unleashed",
            "Nuisance / Aggressive Behavior",
            "Overdue Vaccination",
            "Repeated Impoundment Retrieval",
            "Other",
            name="warning_violation_enum"
        ),
        default="Free-Roaming Unleashed",
        nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    fine_amount: Mapped[Optional[Decimal]] = mapped_column(DECIMAL(10, 2), default=0.00, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("Pending", "Acknowledged", "Appealed", "Resolved", name="warning_status_enum"),
        default="Pending",
        nullable=False
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    owner = relationship("User", foreign_keys=[user_id])
    issuer = relationship("User", foreign_keys=[issued_by])
    pet = relationship("Pet", foreign_keys=[pet_id])
    report = relationship("Report", foreign_keys=[report_id])
