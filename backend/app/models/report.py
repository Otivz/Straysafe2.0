from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey, Numeric, Boolean, Enum
from sqlalchemy.orm import relationship, backref, Mapped, mapped_column
from app.database import Base
from app.models.user import User


class ReportCategory(Base):
    __tablename__ = "report_categories"
    category_id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String(100), unique=True, nullable=False)


# DB table is "report_status" (not "report_statuses")
class ReportStatus(Base):   
    __tablename__ = "report_status"
    status_id = Column(Integer, primary_key=True, index=True)
    status_name = Column(String(50), unique=True, nullable=False)


class Report(Base):
    __tablename__ = "reports"
    __allow_unmapped__ = True

    report_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("report_categories.category_id"), nullable=False)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # FK to pets omitted until pets table is created

    animal_type: Mapped[Optional[str]] = mapped_column(Enum('Dog', 'Cat', 'Unknown'), nullable=True, default='Unknown')
    animal_breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    animal_color: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estimated_size: Mapped[Optional[str]] = mapped_column(Enum('Small', 'Medium', 'Large'), nullable=True)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)

    animal_count: Mapped[int] = mapped_column(Integer, default=1)
    landmark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # DB ENUM: 'Low','Medium','High' only
    priority_level: Mapped[Optional[str]] = mapped_column(Enum('Low', 'Medium', 'High'), nullable=True, default='Medium')
    visibility: Mapped[Optional[str]] = mapped_column(Enum('Public', 'Private'), nullable=True, default='Public')

    is_possible_owned: Mapped[bool] = mapped_column(Boolean, default=False)

    # AI Suggestions
    ai_animal_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_dominant_color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_coat_pattern: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_estimated_size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_possible_breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_suggested_risk_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_suggested_priority: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_suggested_priority_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # DB column is current_status_id (not status_id)
    current_status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report_status.status_id"), nullable=True)

    assigned_leader_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    unassigned_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    reporter: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id], backref="reports")
    assigned_leader: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_leader_id])
    category = relationship("ReportCategory")
    status = relationship("ReportStatus")
    subdivision = relationship("Subdivision")
    media: Mapped[List["ReportMedia"]] = relationship("ReportMedia", back_populates="report", cascade="all, delete-orphan")
    comments: Mapped[List["Comment"]] = relationship("Comment", backref="report", cascade="all, delete-orphan")
    rescues: Mapped[List["Rescue"]] = relationship("Rescue", back_populates="report", cascade="all, delete-orphan")
    verifications: Mapped[List["ReportVerification"]] = relationship("ReportVerification", backref="report", cascade="all, delete-orphan")
    history: Mapped[List["StatusHistory"]] = relationship("StatusHistory", back_populates="report", cascade="all, delete-orphan", order_by="StatusHistory.created_at")
    endorsement_letter: Mapped[Optional["EndorsementLetter"]] = relationship("EndorsementLetter", back_populates="report", uselist=False, cascade="all, delete-orphan")

    # Transient fields populated at runtime (not DB columns)
    reporter_name: Optional[str] = None
    status_id: Optional[int] = None
    assigned_leader_name: Optional[str] = None
    assigned_leader_photo: Optional[str] = None


class LetterStatus(Base):
    __tablename__ = "letter_status"
    status_id = Column(Integer, primary_key=True, index=True)
    status_name = Column(String(50), unique=True, nullable=False)


class EndorsementLetter(Base):
    __tablename__ = "endorsement_letters"
    __allow_unmapped__ = True

    letter_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, unique=True)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    leader_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    letter_content: Mapped[str] = mapped_column(Text, nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("letter_status.status_id"), nullable=True)
    issued_at = Column(DateTime, server_default=func.now())

    # Relationships
    report = relationship("Report", back_populates="endorsement_letter")
    leader = relationship("User")

    # Transient fields
    leader_name: Optional[str] = None
    leader_position: Optional[str] = None


class ReportMedia(Base):
    __tablename__ = "report_media"

    media_id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    history_id = Column(Integer, ForeignKey("status_history.history_id", ondelete="SET NULL"), nullable=True)
    status_id = Column(Integer, ForeignKey("report_status.status_id", ondelete="SET NULL"), nullable=True)
    file_url = Column(String(255), nullable=False)
    # DB ENUM: 'Image','Video','Document'
    media_type = Column(Enum('Image', 'Video', 'Document'), nullable=False)
    animal_type = Column(Enum('Dog', 'Cat', 'Unknown'), nullable=True, default='Unknown')
    dominant_color = Column(String(100), nullable=True)  # e.g., 'Brown', 'Black and White', 'Golden'
    is_evidence = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, server_default=func.now())
    holding_log_id = Column(Integer, ForeignKey("holding_timeline.log_id", ondelete="SET NULL"), nullable=True)

    # Relationships
    report = relationship("Report", back_populates="media")
    history = relationship("StatusHistory", back_populates="media")
    holding_log = relationship("HoldingTimeline", back_populates="media")


class Comment(Base):
    __tablename__ = "comments"

    comment_id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    parent_comment_id = Column(Integer, ForeignKey("comments.comment_id", ondelete="CASCADE"), nullable=True)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user: Mapped[Optional["User"]] = relationship("User")
    replies = relationship("Comment", backref=backref("parent", remote_side=[comment_id]), cascade="all, delete-orphan")


# DB table is "rescue_status" (not "request_statuses")
class RescueStatus(Base):
    __tablename__ = "rescue_status"
    status_id = Column(Integer, primary_key=True, index=True)
    status_name = Column(String(50), unique=True, nullable=False)


# DB table is "rescues" (not "rescue_requests")
class Rescue(Base):
    __tablename__ = "rescues"
    __allow_unmapped__ = True

    rescue_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("rescue_status.status_id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    leader_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)

    # Relationships
    report: Mapped[Optional["Report"]] = relationship("Report", back_populates="rescues")
    staff = relationship("User", foreign_keys=[staff_id])
    leader = relationship("User", foreign_keys=[leader_id])
    status = relationship("RescueStatus")
    assignments: Mapped[List["RescueAssignment"]] = relationship("RescueAssignment", back_populates="rescue", cascade="all, delete-orphan")

    # Transient fields populated at runtime (not DB columns)
    title: Optional[str] = None
    description: Optional[str] = None
    leader_name: Optional[str] = None
    leader_position: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    request_id: Optional[int] = None


class ReportVerification(Base):
    __tablename__ = "report_verifications"
    __allow_unmapped__ = True

    verification_id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    verified_by = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True)
    leader_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True)
    is_valid = Column(Boolean, nullable=True, default=True)
    status_id = Column(Integer, ForeignKey("report_status.status_id"), nullable=True)
    remarks = Column(Text, nullable=True)
    verified_at = Column(DateTime, server_default=func.now())

    leader = relationship("User", foreign_keys=[verified_by])


class StatusHistory(Base):
    __tablename__ = "status_history"
    __allow_unmapped__ = True

    history_id = Column(Integer, primary_key=True, index=True)
    # DB has both report_id and rescue_id (both nullable)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=True)
    rescue_id = Column(Integer, ForeignKey("rescues.rescue_id", ondelete="CASCADE"), nullable=True)
    # DB has separate status IDs for report and rescue
    report_status_id = Column(Integer, ForeignKey("report_status.status_id"), nullable=True)
    rescue_status_id = Column(Integer, ForeignKey("rescue_status.status_id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    report = relationship("Report", back_populates="history")
    updater = relationship("User")
    media = relationship("ReportMedia", back_populates="history")

    # Transient fields
    updater_name: Optional[str] = None


class RescueAssignment(Base):
    __tablename__ = "rescue_assignments"
    __allow_unmapped__ = True

    assignment_id = Column(Integer, primary_key=True, index=True)
    rescue_id = Column(Integer, ForeignKey("rescues.rescue_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    staff_id = Column(Integer, nullable=True)
    assigned_by = Column(Integer, nullable=True)
    assigned_at = Column(DateTime, server_default=func.now())
    
    # DB ENUM: 'Assigned', 'In Transit', 'On Site', 'Completed', 'Cancelled'
    assignment_status = Column(Enum('Assigned', 'In Transit', 'On Site', 'Completed', 'Cancelled'), default='Assigned')
    remarks = Column(Text, nullable=True)

    # Relationships
    rescue = relationship("Rescue", back_populates="assignments")
    staff = relationship("User", foreign_keys=[user_id])

    # Transient fields
    staff_name: Optional[str] = None


# ─── Holding Facility Models ───────────────────────────────────────────────────

class FacilityStatus(Base):
    """Lookup table for holding facility statuses (separate from report_status)."""
    __tablename__ = "facility_status"

    status_id   = Column(Integer, primary_key=True, index=True)
    status_name = Column(String(50), unique=True, nullable=False)


class HoldingAnimal(Base):
    """One record per animal admitted to the holding facility."""
    __tablename__ = "holding_animals"
    __allow_unmapped__ = True

    holding_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False)
    rescue_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("rescues.rescue_id", ondelete="SET NULL"), nullable=True)

    animal_type: Mapped[Optional[str]] = mapped_column(Enum('Dog', 'Cat', 'Unknown'), nullable=True, default='Unknown')
    animal_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    breed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    estimated_size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # facility_status FK: 1=Need Treatment, 2=Healthy, 3=Claimed, 4=Deceased, 5=Transferred
    facility_status: Mapped[int] = mapped_column(Integer, ForeignKey("facility_status.status_id"), default=1, nullable=False)

    kennel_slot: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    medical_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    intake_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    discharge_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    intake_staff_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Transient fields populated at runtime
    intake_staff_name: Optional[str] = None
    report_category: Optional[str] = None

    # Relationships
    report       = relationship("Report")
    intake_staff = relationship("User", foreign_keys=[intake_staff_id])
    status_obj   = relationship("FacilityStatus")
    timeline     = relationship(
        "HoldingTimeline",
        back_populates="animal",
        cascade="all, delete-orphan",
        order_by="HoldingTimeline.logged_at"
    )


class HoldingTimeline(Base):
    """Audit log — every event recorded for an animal in the holding facility."""
    __tablename__ = "holding_timeline"
    __allow_unmapped__ = True

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    holding_id: Mapped[int] = mapped_column(Integer, ForeignKey("holding_animals.holding_id", ondelete="CASCADE"), nullable=False)
    # event_type: 'intake', 'status_change', 'medical', 'treatment', 'observation', 'outcome'
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, default='observation')
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logged_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Transient
    staff_name: Optional[str] = None

    # Relationships
    animal = relationship("HoldingAnimal", back_populates="timeline")
    staff  = relationship("User", foreign_keys=[logged_by])
    media  = relationship("ReportMedia", back_populates="holding_log")
