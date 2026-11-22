from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# These tables come from backend/migrations/2026-11-22_resident_registry.sql, applied by the developer. The start-up code skips
# tables marked with a migration (main.py) and only checks that they exist (app/db_migrations/resident_registry.py).
MIGRATION = "2026-11-22_resident_registry.sql"
_INFO = {"info": {"migration": MIGRATION}}
_INVITE_INFO = {"info": {"migration": "2026-11-22_resident_invitations.sql"}}

# Account states of an official resident record. The StraySafe account is created when the Leader confirms the import and stays
# unusable (users.status 'Inactive', no password) until the resident claims it through the e-mailed invitation.
PENDING_ACTIVATION = "Pending Activation"
ACTIVE = "Active"
DEACTIVATED = "Deactivated"
STATUSES = (PENDING_ACTIVATION, ACTIVE, DEACTIVATED)

# Delivery states of an invitation
PENDING_DELIVERY = "Pending Delivery"
SENDING = "Sending"
SENT = "Sent"
DELIVERY_FAILED = "Delivery Failed"
CLAIMED = "Claimed"


class ResidentImportBatch(Base):
    """One uploaded Excel/CSV file of official resident records: what was in it, and whether the Leader confirmed the import."""
    __tablename__ = "resident_import_batches"
    __table_args__ = (_INFO,)

    batch_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    uploaded_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # Validated (awaiting the Leader's confirmation) | Imported | Discarded
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Validated", index=True)
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valid_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    invalid_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    linked_existing_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    confirmed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)


class ResidentImportRow(Base):
    """The validation result of one spreadsheet row (the row number is the one the Leader sees in Excel)."""
    __tablename__ = "resident_import_rows"
    __table_args__ = (Index("ix_resident_import_rows_batch_result", "batch_id", "result", "row_number"), _INFO)

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("resident_import_batches.batch_id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    block_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    lot_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    contact_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # valid | duplicate | invalid | missing
    result: Mapped[str] = mapped_column(String(12), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # A valid row whose e-mail already belongs to a resident account: it is imported as Registered and linked to it.
    existing_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class OfficialResidentRecord(Base):
    """
    One person on the subdivision's official resident list. Each record has one StraySafe account (created at import, claimed by the resident through an e-mailed invitation).
    The *_key columns are the normalized forms used to match and to keep records unique (app/services/resident_registry.py).
    """
    __tablename__ = "official_resident_records"
    __table_args__ = (
        UniqueConstraint("subdivision_id", "email", name="uq_official_resident_email"),
        UniqueConstraint("subdivision_id", "name_key", "block_key", "lot_key", name="uq_official_resident_identity"),
        UniqueConstraint("user_id", name="uq_official_resident_user"),
        Index("ix_official_resident_lookup", "subdivision_id", "block_key", "lot_key"),
        _INFO,
    )

    record_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_key: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    block_number: Mapped[str] = mapped_column(String(30), nullable=False)
    block_key: Mapped[str] = mapped_column(String(30), nullable=False)
    lot_number: Mapped[str] = mapped_column(String(30), nullable=False)
    lot_key: Mapped[str] = mapped_column(String(30), nullable=False)
    contact_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    registration_status: Mapped[str] = mapped_column(String(30), nullable=False, default=PENDING_ACTIVATION, index=True)
    # The StraySafe account made from this record. Unique: one record, one account. SET NULL keeps the record if an account is removed.
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    imported_batch_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("resident_import_batches.batch_id", ondelete="SET NULL"), nullable=True, index=True)
    registered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ResidentInvitation(Base):
    """
    The account-activation invitation of one resident record (one row per record; sending again replaces the link). Only a hash of
    the link token is stored, and it is cleared when the invitation is claimed, replaced or cancelled, so a link works once.
    """
    __tablename__ = "resident_invitations"
    __table_args__ = (_INVITE_INFO,)

    invitation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_id: Mapped[int] = mapped_column(Integer, ForeignKey("official_resident_records.record_id", ondelete="CASCADE"), nullable=False, unique=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivery_status: Mapped[str] = mapped_column(String(20), nullable=False, default=PENDING_DELIVERY, index=True)
    send_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


# Individual self-registration (2026-11-22_resident_applications.sql)
APP_PENDING_EMAIL = "PENDING_EMAIL_VERIFICATION"
APP_PENDING_RESIDENCY = "PENDING_RESIDENCY_VERIFICATION"
APP_ACTIVE = "ACTIVE"
APP_REJECTED = "REJECTED"
APP_STATUSES = (APP_PENDING_EMAIL, APP_PENDING_RESIDENCY, APP_ACTIVE, APP_REJECTED)


class ResidentApplication(Base):
    """
    A person who registered on their own. The account (users row) exists from the start but stays unusable until the e-mail is
    verified AND a Subdivision Leader or Admin approves the residency. One application per account; a rejected applicant corrects
    the same application instead of creating another account.
    """
    __tablename__ = "resident_applications"
    __table_args__ = (Index("ix_resident_applications_subdivision_status", "subdivision_id", "status"),
                      {"info": {"migration": "2026-11-22_resident_applications.sql"}})

    application_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, unique=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    contact_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    block_number: Mapped[str] = mapped_column(String(30), nullable=False)
    lot_number: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default=APP_PENDING_EMAIL)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resubmit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resubmitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
