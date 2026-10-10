from datetime import datetime
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class UserNotificationPreference(Base):
    __tablename__ = "user_notification_preferences"

    preference_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    # Granular email notification preferences (all default to True)
    email_reports: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_rescues: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_pet_matches: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_claims: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    user = relationship("User")
