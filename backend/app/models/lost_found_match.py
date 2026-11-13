from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LostFoundMatch(Base):
    """
    A POSSIBLE match between ONE lost-pet report and ONE found-animal report of the same subdivision (docs/01-system/LOST_FOUND_MATCHING.md).

    The background check writes it as `pending` the moment either report is filed, whichever comes first, and tells nobody but the
    Leaders. Only a Leader's decision changes it: `confirmed` links the two reports (a row in case_links, nothing is merged or hidden) and
    tells both residents; `rejected` is kept so the pair is never suggested again and can be reviewed again; `moot` means the found report
    was linked to another lost report, so this suggestion no longer applies. A link is NEVER ownership and NEVER a recovery: only the
    owner's confirmation recovers a pet.

    A lost report can have several confirmed found reports. A found report has at most one confirmed lost report. The pair is stored once.
    """
    __tablename__ = "lost_found_matches"
    __table_args__ = (UniqueConstraint("lost_report_id", "found_report_id", name="uq_lost_found_pair"),)

    match_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subdivision_id: Mapped[int] = mapped_column(Integer, ForeignKey("subdivisions.subdivision_id"), nullable=False, index=True)
    lost_report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    found_report_id: Mapped[int] = mapped_column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    # 0 to 100 and the level it earned, frozen when the suggestion was made (the comparison the Leader reads is recomputed from the reports)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False)               # strong | possible
    reasons: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)           # the sentences that spoke in favour, strongest first
    # pending -> confirmed | rejected (rejected -> pending again on "review again") | moot
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending", server_default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    decided_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # What a confirmation created: the case link, and (when the lost report has an open notice) the possible-recovery conversation
    link_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    coordination_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
