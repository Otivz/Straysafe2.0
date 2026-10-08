from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiJob(Base):
    """One piece of AI work (photo analysis, report follow-up, suggestions backfill), run by the AI worker."""
    __tablename__ = "ai_jobs"

    job_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # media | follow_up | backfill
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    report_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    media_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # queued | running | done | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    available_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    locked_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_ai_jobs_status_available", "status", "available_at"),
        Index("idx_ai_jobs_report_kind_status", "report_id", "kind", "status"),
    )
