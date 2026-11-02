from datetime import datetime
from typing import Optional, List
from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey, func, Enum, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.database import Base


class OwnerFollowUp(Base):
    __tablename__ = "owner_followups"

    followup_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    leader_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)

    # Owner details (registered or offline)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    owner_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    owner_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    owner_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Observation State
    # observing: active observation period
    # complied: owner complied and case marked resolved
    # closed: ended/dismissed by leader or case closure
    # escalated: escalated to barangay/higher authority
    # cancelled: invalidated or replaced
    status: Mapped[str] = mapped_column(
        Enum("observing", "complied", "closed", "escalated", "cancelled", name="owner_followup_status_enum"),
        default="observing",
        nullable=False,
        index=True
    )
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    duration_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Single Reasoned Extension
    is_extended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    extended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    extended_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    extension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extension_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Compliance / Closure
    compliance_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Owner Interaction
    owner_acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    owner_acknowledgement_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # account, verbal, phone
    owner_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_photo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    owner_photo_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Notification tracking (deduplication)
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_notice_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    update_reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    # Relationships
    report = relationship("Report", foreign_keys=[report_id])
    pet = relationship("Pet", foreign_keys=[pet_id])
    subdivision = relationship("Subdivision", foreign_keys=[subdivision_id])
    leader = relationship("User", foreign_keys=[leader_id])
    owner = relationship("User", foreign_keys=[owner_id])
    contact_logs = relationship("FollowUpContactLog", back_populates="followup", cascade="all, delete-orphan", order_by="desc(FollowUpContactLog.created_at)")
    owner_updates = relationship("OwnerObservationUpdate", back_populates="followup", cascade="all, delete-orphan")


class FollowUpContactLog(Base):
    __tablename__ = "followup_contact_logs"

    contact_log_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    followup_id: Mapped[int] = mapped_column(Integer, ForeignKey("owner_followups.followup_id", ondelete="CASCADE"), nullable=False, index=True)
    logged_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    contact_type: Mapped[str] = mapped_column(
        Enum("Phone Call", "In-Person Visit", "SMS", "Verbal Warning", "Other", name="followup_contact_type_enum"),
        default="Phone Call",
        nullable=False
    )
    contact_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp(), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp())

    # Under Observation monitoring log fields. Nullable so contact logs written
    # before these columns existed stay valid; monitoring logs always fill them.
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=True, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    inspection_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    inspection_outcome: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Idempotency key from the submitting form, so a repeated click or retry cannot create a second row.
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)

    # Relationships
    followup = relationship("OwnerFollowUp", back_populates="contact_logs")
    logger = relationship("User", foreign_keys=[logged_by])


class OwnerObservationUpdate(Base):
    """A compliance update submitted by the identified pet owner during an observation.

    Owner fields are written once and never changed; staff review is recorded in
    the separate reviewed_* columns so the original submission is preserved.
    """
    __tablename__ = "owner_observation_updates"

    update_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    followup_id: Mapped[int] = mapped_column(Integer, ForeignKey("owner_followups.followup_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    owner_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    # issue_resolved, improving, still_addressing, unable_to_comply
    compliance_status: Mapped[str] = mapped_column(String(30), nullable=False)
    owner_remarks: Mapped[str] = mapped_column(Text, nullable=False)
    # Idempotency key from the owner's form, so a repeated click or retry cannot create a second update.
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp(), nullable=False)

    # Staff review (not the same as verifying the case resolved)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    review_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    followup = relationship("OwnerFollowUp", back_populates="owner_updates")
    owner = relationship("User", foreign_keys=[owner_user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    photos = relationship("OwnerObservationUpdatePhoto", back_populates="update", cascade="all, delete-orphan", order_by="OwnerObservationUpdatePhoto.photo_id")


class OwnerObservationUpdatePhoto(Base):
    """Photo evidence for an owner update; the file lives in Cloudinary, uploaded by the backend."""
    __tablename__ = "owner_observation_update_photos"

    photo_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    update_id: Mapped[int] = mapped_column(Integer, ForeignKey("owner_observation_updates.update_id", ondelete="CASCADE"), nullable=False, index=True)
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp())

    update = relationship("OwnerObservationUpdate", back_populates="photos")


class FollowUpRepeatedIncident(Base):
    """
    Another report about the pet under observation, logged by the handling leader as a repeat incident.
    It must be a different, related report (not the observed one, not a merged duplicate) and is logged once.
    A logged repeat is its own incident, so it can receive its own warning.
    """
    __tablename__ = "followup_repeated_incidents"
    __table_args__ = (UniqueConstraint("followup_id", "report_id", name="uq_followup_repeat_report"),)

    incident_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    followup_id: Mapped[int] = mapped_column(Integer, ForeignKey("owner_followups.followup_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    logged_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    incident_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.current_timestamp())

    followup = relationship("OwnerFollowUp", foreign_keys=[followup_id])
    report = relationship("Report", foreign_keys=[report_id])
    logger = relationship("User", foreign_keys=[logged_by])
