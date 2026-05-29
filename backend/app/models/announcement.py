from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean, func
from sqlalchemy.orm import relationship, backref
from app.database import Base


class AnnouncementCategory(Base):
    __tablename__ = "announcement_categories"

    category_id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Announcement(Base):
    __tablename__ = "announcements"

    announcement_id = Column(Integer, primary_key=True, index=True)
    barangay_id = Column(Integer, ForeignKey("barangays.barangay_id", ondelete="SET NULL"), nullable=True)
    subdivision_id = Column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("announcement_categories.category_id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    cover_image = Column(String(255), nullable=True)
    visibility = Column(Enum("Public", "Subdivision Only", "Barangay Only"), default="Public")
    priority_level = Column(Enum("Low", "Normal", "High", "Emergency"), default="Normal")
    status = Column(Enum("Draft", "Published", "Archived"), default="Published")
    allow_comments = Column(Boolean, default=True)
    published_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    creator = relationship("User")
    category = relationship("AnnouncementCategory")
    subdivision = relationship("Subdivision")
    media = relationship("AnnouncementMedia", back_populates="announcement", cascade="all, delete-orphan")
    comments = relationship("AnnouncementComment", back_populates="announcement", cascade="all, delete-orphan")
    reactions = relationship("AnnouncementReaction", back_populates="announcement", cascade="all, delete-orphan")


class AnnouncementMedia(Base):
    __tablename__ = "announcement_media"

    media_id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.announcement_id", ondelete="CASCADE"), nullable=False)
    file_url = Column(String(255), nullable=False)
    media_type = Column(Enum("Image", "Video", "Document"), nullable=False)
    caption = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())

    announcement = relationship("Announcement", back_populates="media")


class AnnouncementComment(Base):
    __tablename__ = "announcement_comments"

    comment_id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.announcement_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    parent_comment_id = Column(Integer, ForeignKey("announcement_comments.comment_id", ondelete="CASCADE"), nullable=True)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    replies = relationship("AnnouncementComment", backref=backref("parent", remote_side=[comment_id]), cascade="all, delete-orphan")
    announcement = relationship("Announcement", back_populates="comments")


class AnnouncementReaction(Base):
    __tablename__ = "announcement_reactions"

    reaction_id = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.announcement_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    reaction_type = Column(Enum("Like", "Heart", "Care"), default="Like")
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    announcement = relationship("Announcement", back_populates="reactions")
