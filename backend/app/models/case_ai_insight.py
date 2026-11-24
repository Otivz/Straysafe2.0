from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Comes from backend/migrations/2026-11-24_case_ai_insights.sql (+ ..._evidence.sql for evidence_check), applied by the developer. The start-up code skips tables marked
# with a migration (main.py) and only checks that it exists (app/db_migrations/case_ai_insights.py).
MIGRATION = "2026-11-24_case_ai_insights.sql"


class CaseAiInsight(Base):
    """
    The cached "AI Insights (Suggested)" for ONE report's content (services/case_ai_insights.py). One row per (report, content hash):
    when the report's content changes the hash changes and the old row simply stops matching. It only SUGGESTS: nothing here is
    ever copied onto the report's status, priority or category. Holds no personal data: the text it was made from was redacted first.
    """
    __tablename__ = "case_ai_insights"
    __table_args__ = (
        UniqueConstraint("report_id", "content_hash", name="uq_case_ai_insight_content"),
        {"info": {"migration": MIGRATION}},
    )

    insight_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_priority: Mapped[str] = mapped_column(String(10), nullable=False)          # Urgent | High | Normal
    priority_confidence: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # high | medium | low
    priority_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_mismatch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    suggested_category: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # a category family id
    category_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # The advisory evidence check as JSON {status, flags, summary, confidence} (2026-11-24_case_ai_insights_evidence.sql); NULL = none made
    evidence_check: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    generated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
