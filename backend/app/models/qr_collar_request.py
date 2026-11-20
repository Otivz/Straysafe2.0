from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QrCollarRequest(Base):
    """Resident request for a physical QR collar for a registered pet, managed by Subdivision Administration."""
    __tablename__ = "qr_collar_requests"

    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    resident_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", index=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    admin_notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thread_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("case_message_threads.thread_id"), nullable=True)
    history: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)

    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    accepted_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=True)
    ready_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ready_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    pet = relationship("Pet", foreign_keys=[pet_id])
    resident = relationship("User", foreign_keys=[resident_id])
    accepted_admin = relationship("User", foreign_keys=[accepted_by])
    ready_admin = relationship("User", foreign_keys=[ready_by])
    completed_admin = relationship("User", foreign_keys=[completed_by])
