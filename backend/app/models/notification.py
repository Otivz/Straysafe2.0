from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base

class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    type = Column(String(50), default="status_update") # 'status_update', 'system', 'alert'
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    related_id = Column(Integer, nullable=True) # e.g., report_id or rescue_id

    # Relationship
    user = relationship("User")
