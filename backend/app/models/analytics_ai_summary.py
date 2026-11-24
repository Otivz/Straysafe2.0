from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Comes from backend/migrations/2026-11-24_analytics_ai_summary.sql, applied by the developer. The start-up code skips tables marked
# with a migration (main.py) and only checks that it exists (app/db_migrations/analytics_ai_summary.py).
MIGRATION = "2026-11-24_analytics_ai_summary.sql"


class AnalyticsAiSummary(Base):
    """
    The cached "AI Trend & Hotspot Summary" of the Analytics page (services/analytics_ai_summary.py): one row per subdivision, date range
    and hash of the aggregated statistics the summary was made from. A change in the numbers is a new hash, so a stale summary never
    matches. Holds no personal data: only aggregated, anonymised statistics were sent, and the answer was redacted again before storing.
    Only the AI's own answers are cached (never the rule-based fallback).
    """
    __tablename__ = "analytics_ai_summaries"
    __table_args__ = (
        UniqueConstraint("subdivision_id", "range_start", "range_end", "stats_hash", name="uq_analytics_ai_summary"),
        {"info": {"migration": MIGRATION}},
    )

    summary_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id", ondelete="CASCADE"), nullable=False, index=True)
    range_start: Mapped[date] = mapped_column(Date, nullable=False)
    range_end: Mapped[date] = mapped_column(Date, nullable=False)
    stats_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    trend_summary: Mapped[str] = mapped_column(Text, nullable=False)
    hotspot_explanation: Mapped[str] = mapped_column(Text, nullable=False)
    repeat_patterns: Mapped[str] = mapped_column(Text, nullable=False)        # JSON list of strings
    monthly_digest: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    generated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
