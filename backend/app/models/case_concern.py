"""
Independent concern tracking for consolidated/merged cases (`case_concerns`).

When multiple reports of different concern types (for example, an Injured Animal report
and a Dangerous Animal report involving the same animal) are merged into one master case,
each concern keeps its own independent assessment/resolution status and documentation
so resolving one concern never prematurely closes the others.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CaseConcern(Base):
    __tablename__ = "case_concerns"

    concern_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    master_report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True
    )
    concern_family: Mapped[str] = mapped_column(String(30), nullable=False)
    concern_label: Mapped[str] = mapped_column(String(120), nullable=False)
    original_status_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    original_status_label: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # ongoing_assessment | in_progress | resolved | not_applicable
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ongoing_assessment", index=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    threat_ongoing: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
