from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class EmailLog(Base):
    __tablename__ = "email_logs"

    email_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    template_key: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Delivery status: 'Pending', 'Sent', 'Failed', 'Simulated'
    status: Mapped[str] = mapped_column(
        Enum("Pending", "Sent", "Failed", "Simulated", name="email_status_enum"),
        default="Pending",
        nullable=False,
        index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Idempotency key to strictly prevent duplicate sending of the same notification
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True, index=True)
    
    related_entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g., 'report', 'pet', 'claim', 'warning'
    related_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    user = relationship("User")
