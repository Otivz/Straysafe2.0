from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.database import Base
from app.models.user import User

class Notification(Base):
    __tablename__ = "notifications"
    __allow_unmapped__ = True

    notification_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    type: Mapped[Optional[str]] = mapped_column(String(50), default="status_update") # 'status_update', 'system', 'alert'
    notification_type = synonym("type")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())
    related_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # e.g., report_id or rescue_id

    # Relationship
    user: Mapped[Optional["User"]] = relationship("User")
