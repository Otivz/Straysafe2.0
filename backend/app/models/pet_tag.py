"""
Pet QR tags (docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md).

- PetTag: one printed QR tag of a registered, owned pet. The QR holds a link with a random token, never the pet id.
  A pet has at most one `active` tag (checked in services/pet_tags.py; MySQL has no partial unique index). Replacing a
  tag marks the old row `replaced`, so its token stops working at once; turning it off marks it `disabled`.
- PetTagScan: one scan of a tag, either a page view or a "tell the owner" message (filled from Phase 2 on).

status and kind are plain strings (not database ENUMs), so a later value needs no ALTER TABLE.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

TAG_STATUSES = ("active", "replaced", "disabled")
SCAN_KINDS = ("view", "found_report")
SCAN_STATUSES = ("new", "seen_by_owner", "resolved")


class PetTag(Base):
    __tablename__ = "pet_tags"

    tag_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    disabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    disabled_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)

    pet = relationship("Pet")


class PetTagScan(Base):
    __tablename__ = "pet_tag_scans"

    scan_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("pet_tags.tag_id", ondelete="CASCADE"), nullable=False, index=True)
    pet_id: Mapped[int] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="view", server_default="view")
    scanner_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8), nullable=True)
    location_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    finder_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # stored only when share_contact is true
    share_contact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    alert_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("lost_pet_alerts.alert_id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new", server_default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
