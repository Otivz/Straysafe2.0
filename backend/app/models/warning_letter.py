from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, JSON, func
from sqlalchemy.dialects.mysql import LONGBLOB, LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WarningLetterTemplate(Base):
    """
    Customizable warning letter template managed per subdivision.
    Content lives in immutable WarningLetterTemplateVersion rows so previously issued letters
    and historical versions stay intact when a template is edited.
    """
    __tablename__ = "warning_letter_templates"

    template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    subdivision_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Optional scope: None applies to any warning level; otherwise Notice / 1st Warning / 2nd Warning / Final Notice / Escalation
    warning_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="editor")  # editor | docx_import
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)  # active | archived
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    current_version_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    versions = relationship(
        "WarningLetterTemplateVersion",
        back_populates="template",
        order_by="WarningLetterTemplateVersion.version_number.desc()",
        cascade="all, delete-orphan",
    )


class WarningLetterTemplateVersion(Base):
    """Immutable revision of a WarningLetterTemplate."""
    __tablename__ = "warning_letter_template_versions"

    version_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("warning_letter_templates.template_id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_template: Mapped[str] = mapped_column(String(255), nullable=False)
    body_template: Mapped[str] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    html_template: Mapped[Optional[str]] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=True)
    source_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_docx_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary().with_variant(LONGBLOB(), "mysql"), nullable=True)
    placeholders_used: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    change_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    template = relationship("WarningLetterTemplate", back_populates="versions")


class GeneratedWarningLetter(Base):
    """
    Immutable generated warning letter snapshot issued to a resident/owner, linked to
    an OwnerWarning and/or Complaint EnforcementStep, with full notification & read tracking.
    """
    __tablename__ = "generated_warning_letters"

    letter_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    warning_reference: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    subdivision_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="SET NULL"), nullable=True, index=True)

    warning_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("owner_warnings.warning_id", ondelete="SET NULL"), nullable=True, index=True)
    complaint_step_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("enforcement_steps.step_id", ondelete="SET NULL"), nullable=True, index=True)
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="SET NULL"), nullable=True, index=True)
    case_reference: Mapped[str] = mapped_column(String(40), nullable=False)

    recipient_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_name: Mapped[str] = mapped_column(String(150), nullable=False)
    recipient_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    pet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pets.pet_id", ondelete="SET NULL"), nullable=True)
    pet_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    pet_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    warning_level: Mapped[str] = mapped_column(String(50), nullable=False)
    policy_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    policy_reference: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("warning_letter_templates.template_id", ondelete="SET NULL"), nullable=True)
    template_name: Mapped[str] = mapped_column(String(150), nullable=False)
    template_version_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("warning_letter_template_versions.version_id", ondelete="SET NULL"), nullable=True)
    template_version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    rendered_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    rendered_body: Mapped[str] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    rendered_html: Mapped[str] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    placeholders_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    issued_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    issued_by_name: Mapped[str] = mapped_column(String(150), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    # Notification & read/view tracking (viewed_at stays NULL until the resident actually opens/downloads it)
    notification_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("notifications.notification_id", ondelete="SET NULL"), nullable=True, index=True)
    notification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")  # pending | sent | delivered | failed | not_applicable
    notification_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notification_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
