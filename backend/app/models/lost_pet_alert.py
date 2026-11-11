"""
Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md).

- LostPetAlert: the Subdivision Neighborhood Alert of one Lost Pet Report. The owner requests it, an authorized
  Subdivision Leader activates (broadcasts), updates and closes it. Closing the report closes the alert.
- LostPetCoordination / LostPetCoordinationMessage (2026-11-11): how the owner and the person who may have the pet get in touch.
- LostPetSighting: one "Spotted Here" submission by a resident. The time the resident says they saw the animal
  (seen_at) is kept apart from the server's submission time (submitted_at). A sighting is never auto-verified.
Both are kept after resolution (history and analytics).
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LostPetAlert(Base):
    __tablename__ = "lost_pet_alerts"

    alert_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, unique=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True, index=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    # requested -> active -> closed (requested can also be declined -> closed)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="requested", index=True)
    # lost_pet (the original, and every older row) or found_animal: a notice that an animal with no known owner was
    # found, so its owner can come forward. A found-animal alert has no owner and no registered pet.
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False, default="lost_pet", server_default="lost_pet")
    # Last known location and time (from the owner's report; the leader may correct them)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_seen_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    last_seen_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    # How neighbors should reach the owner (no phone number is ever shown): app_message | through_leader
    contact_preference: Mapped[str] = mapped_column(String(30), nullable=False, default="app_message")
    owner_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    leader_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    activated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    residents_notified: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # reunited (older rows) | recovered | not_found | declined | withdrawn | merged | report_closed | other
    close_outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Recovery (2026-11-11): the owner's confirmation that the pet is safely home. ONE operation fills these (services/lost_pet_lifecycle.py),
    # whether the owner confirms in the app or the Leader records a confirmation the owner gave by phone or in person.
    recovered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)           # when the owner confirmed it (their time)
    recovery_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)           # owner_app | phone | in_person
    recovery_confirmed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)   # the owner
    recovery_recorded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)    # who recorded it
    recovery_recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)   # when the server recorded it
    recovery_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    report = relationship("Report", foreign_keys=[report_id])
    pet = relationship("Pet", foreign_keys=[pet_id])


class LostPetSighting(Base):
    __tablename__ = "lost_pet_sightings"

    sighting_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    alert_id: Mapped[int] = mapped_column(Integer, ForeignKey("lost_pet_alerts.alert_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    # map_pin | device (the resident chose; device location only with their permission)
    location_source: Mapped[str] = mapped_column(String(20), nullable=False, default="map_pin")
    location_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # When the resident says they saw the animal (may be earlier than the submission)
    seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    # When the server received the submission
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    accuracy_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # unverified | verified | dismissed (only a leader changes it)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unverified", index=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Same submission sent twice (double tap, retry) returns the first record
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    # seen: "I saw this pet". secured: "I may have this pet safely with me" (a possible recovery lead, never a recovery by itself)
    sighting_type: Mapped[str] = mapped_column(String(20), nullable=False, default="seen", server_default="seen")
    # A resident may record an ordinary sighting somebody told them about. Never presented as first-hand after a refresh.
    on_behalf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    # Private to the owner and the Leader: where or how a secured pet is being kept. Never shown to neighbors.
    care_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    alert = relationship("LostPetAlert", foreign_keys=[alert_id])
    reporter = relationship("User", foreign_keys=[reporter_id])


class LostPetCoordination(Base):
    """
    How the owner and the person who may have the pet get in touch, for ONE possible-recovery report (a "secured" sighting).
    Nothing here exists for an ordinary sighting. mode: none (nobody has asked for anything yet), direct (BOTH agreed to
    message each other in the app) or leader (either one asked the Leader to help; direct messaging is then over).
    Neither party has to say why. Kept after resolution.
    """
    __tablename__ = "lost_pet_coordinations"

    coordination_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    alert_id: Mapped[int] = mapped_column(Integer, ForeignKey("lost_pet_alerts.alert_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    sighting_id: Mapped[int] = mapped_column(Integer, ForeignKey("lost_pet_sightings.sighting_id", ondelete="CASCADE"), nullable=False, unique=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    finder_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="none", server_default="none")
    owner_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    finder_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    mediation_requested_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    mediation_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # open: still to be worked out. resolved: the Leader finished mediating, or the pet was recovered / the case closed.
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="open", server_default="open", index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    alert = relationship("LostPetAlert", foreign_keys=[alert_id])
    sighting = relationship("LostPetSighting", foreign_keys=[sighting_id])
    owner = relationship("User", foreign_keys=[owner_id])
    finder = relationship("User", foreign_keys=[finder_id])


class LostPetCoordinationMessage(Base):
    """A private message between the owner and the finder of ONE coordination. Text only, and only while both agreed (mode direct)."""
    __tablename__ = "lost_pet_coordination_messages"
    __table_args__ = (Index("uq_lost_pet_coordination_message_request", "client_request_id", unique=True),)

    message_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    coordination_id: Mapped[int] = mapped_column(Integer, ForeignKey("lost_pet_coordinations.coordination_id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    client_request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
