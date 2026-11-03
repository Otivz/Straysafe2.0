"""
Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md).

- LostPetAlert: the Subdivision Neighborhood Alert of one Lost Pet Report. The owner requests it, an authorized
  Subdivision Leader activates (broadcasts), updates and closes it. Closing the report closes the alert.
- LostPetSighting: one "Spotted Here" submission by a resident. The time the resident says they saw the animal
  (seen_at) is kept apart from the server's submission time (submitted_at). A sighting is never auto-verified.
Both are kept after resolution (history and analytics).
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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
    # reunited | not_found | declined | report_closed | other
    close_outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
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

    alert = relationship("LostPetAlert", foreign_keys=[alert_id])
    reporter = relationship("User", foreign_keys=[reporter_id])
