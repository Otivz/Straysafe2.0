from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey, func, Enum
from sqlalchemy.orm import relationship
from app.database import Base

class ChatThread(Base):
    __tablename__ = "chat_threads"

    thread_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    thread_type = Column(Enum("Report", "Pet_Claim", "Direct", name="chat_thread_type_enum"), default="Report", nullable=False)
    related_id = Column(Integer, nullable=True, index=True)  # report_id or claim_id
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    recipient = relationship("User", foreign_keys=[recipient_id])
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.sent_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    message_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    thread_id = Column(Integer, ForeignKey("chat_threads.thread_id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    message_text = Column(Text, nullable=False)
    media_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    sent_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationships
    thread = relationship("ChatThread", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
