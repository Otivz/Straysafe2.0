"""
Who decided a case's animal identity: the reporter's link, or a Leader.

`reports.identity_status` is written for every report: the status hook derives "identified" the moment a report names a pet
(utils/case_status_sync.py), so a stored value does not say that anyone decided it. A Subdivision Leader's own decision is
recorded as an audit line (CASE_IDENTITY_DECIDED, written by services/case_lifecycle.save_assessment). The screens use this to
keep "linked by the reporter" apart from "identity confirmed by the Leader".

Cases decided before that audit line existed are recognised by what they left behind: a written identity note, or a stored
status that differs from what the pet link alone would give.
"""
from typing import Iterable, Set

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.report import Report
from app.utils import case_vocab as V
from app.utils.case_state import identity_from_links

ACTION = "CASE_IDENTITY_DECIDED"


def _left_a_mark(report: Report) -> bool:
    if (report.identity_note or "").strip():
        return True
    return report.identity_status in V.IDENTITY_STATUSES and report.identity_status != identity_from_links(report)


def decided_ids(db: Session, reports: Iterable[Report]) -> Set[int]:
    """The report ids, among these reports, whose animal identity a Leader decided."""
    reports = list(reports)
    ids = [r.report_id for r in reports]
    audited = ({tid for (tid,) in db.query(AuditLog.target_id).filter(
        AuditLog.target_table == "reports", AuditLog.action == ACTION, AuditLog.target_id.in_(ids)).all()} if ids else set())
    return {r.report_id for r in reports if r.report_id in audited or _left_a_mark(r)}


def is_decided(db: Session, report: Report) -> bool:
    return report.report_id in decided_ids(db, [report])
