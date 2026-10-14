"""
Batch-loading for endpoints that embed whole reports (ReportResponse) in each item of a list: matches, claims...
One query per relation for the whole list instead of one per report / per history entry. Only how rows are loaded
changes, never which rows (STRAYSAFE_PERFORMANCE_AUDIT.md, H1).
"""
from sqlalchemy.orm import joinedload, selectinload

from app.models.report import Report, StatusHistory


def embedded_report_loads(rel):
    """Everything ReportResponse reads from an embedded report. `rel` is the (already joined) relationship to it."""
    return [
        joinedload(rel).selectinload(Report.history).selectinload(StatusHistory.media),
        joinedload(rel).selectinload(Report.comments),
        joinedload(rel).selectinload(Report.endorsement_letter),
        joinedload(rel).selectinload(Report.disputes),
        joinedload(rel).selectinload(Report.merged_reports),
    ]
