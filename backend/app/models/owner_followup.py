from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

FOLLOWUP_STATUSES = ("Observing", "Owner Complied", "Closed by Leader", "Escalated", "Report Closed")
CONTACT_METHODS = ("Phone", "In person", "In-app", "Owner update", "Repeated incident")


class OwnerFollowUp(Base):
    """
    A complaint about a registered pet with a known owner (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md):
    the Subdivision Leader contacts the owner and checks for a set number of days (default 3) whether the owner acts,
    then the leader resolves the case or escalates it. The pet is not moved or placed anywhere, and the report's status
    is not changed while observing (status 7 means "in a holding facility" to the server).
    Statuses: Observing (shown as "Under Observation"); Owner Complied / Closed by Leader (ended by the leader);
    Escalated (the report went to the Barangay); Report Closed (the report was closed some other way).
    """
    __tablename__ = "owner_followups"

    followup_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)
    # The owner at the start (a snapshot: the pet's owner may change later)
    owner_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    owner_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    owner_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    opened_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(Enum(*FOLLOWUP_STATUSES, name="owner_followup_status"), default="Observing", nullable=False, index=True)

    # The owner knows about the complaint: in the app (owner with an account) or by phone, logged by the leader.
    # Not compliance: the leader decides "Owner complied".
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    acknowledged_via: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)   # App / Phone
    acknowledged_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    acknowledgement_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # One extension at most
    extended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    extended_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    extension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closing_outcome: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    closing_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    report = relationship("Report", foreign_keys=[report_id])
    owner = relationship("User", foreign_keys=[owner_user_id])
    pet = relationship("Pet", foreign_keys=[pet_id])
    opener = relationship("User", foreign_keys=[opened_by])
    closer = relationship("User", foreign_keys=[closed_by])
    contacts = relationship("OwnerFollowUpContact", back_populates="followup", cascade="all, delete-orphan",
                            order_by="OwnerFollowUpContact.contacted_at")


class OwnerFollowUpContact(Base):
    """One entry in a follow-up's log: a contact by the leader, an owner update, or a repeated incident."""
    __tablename__ = "owner_followup_contacts"

    contact_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    followup_id: Mapped[int] = mapped_column(Integer, ForeignKey("owner_followups.followup_id", ondelete="CASCADE"), nullable=False, index=True)
    contacted_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    contacted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    method: Mapped[str] = mapped_column(Enum(*CONTACT_METHODS, name="owner_followup_contact_method"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)                 # an owner update's photo
    related_report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True)  # a repeated incident

    followup = relationship("OwnerFollowUp", back_populates="contacts")
    contacter = relationship("User", foreign_keys=[contacted_by])
