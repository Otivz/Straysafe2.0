from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey, func, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base

class ChatThread(Base):
    __tablename__ = "chat_threads"

    thread_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    thread_type: Mapped[str] = mapped_column(Enum("Report", "Pet_Claim", "Direct", name="chat_thread_type_enum"), default="Report", nullable=False)
    related_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)  # report_id or claim_id
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    recipient = relationship("User", foreign_keys=[recipient_id])
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.sent_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    message_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat_threads.thread_id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    media_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sent_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationships
    thread = relationship("ChatThread", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
