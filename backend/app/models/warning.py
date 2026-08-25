from sqlalchemy import Column, Integer, String, Text, DECIMAL, TIMESTAMP, ForeignKey, func, Enum
from sqlalchemy.orm import relationship
from app.database import Base

class OwnerWarning(Base):
    __tablename__ = "owner_warnings"

    warning_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id = Column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True, index=True)
    issued_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    warning_level = Column(
        Enum("Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation", name="warning_level_enum"),
        default="1st Warning",
        nullable=False
    )
    violation_type = Column(
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
    description = Column(Text, nullable=False)
    fine_amount = Column(DECIMAL(10, 2), default=0.00, nullable=True)
    status = Column(
        Enum("Pending", "Acknowledged", "Appealed", "Resolved", name="warning_status_enum"),
        default="Pending",
        nullable=False
    )
    acknowledged_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    owner = relationship("User", foreign_keys=[user_id])
    issuer = relationship("User", foreign_keys=[issued_by])
    pet = relationship("Pet", foreign_keys=[pet_id])
    report = relationship("Report", foreign_keys=[report_id])
