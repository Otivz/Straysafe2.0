"""
Independent concern tracking and merged-report preservation for consolidated cases.

When multiple reports (such as an Injured Animal report and a Dangerous Animal report) are
merged into one master case, each report's concern keeps its own independent resolution
status, outcome documentation, and preserved original metadata. Resolving one concern
never closes the master case while other concerns remain unresolved.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database import Base
from app.models.case_concern import CaseConcern
from app.models.report import Report, ReportStatus, StatusHistory
from app.models.user import User
from app.schemas.case import ConcernUpdateIn
from app.utils import case_state, case_vocab as V
from app.utils.warning_rules import report_family

CONCERN_LABELS: Dict[str, str] = {
    V.INJURED: "Injured Animal Concern",
    V.SAFETY: "Dangerous Animal Concern",
    V.LOST_PET: "Lost Pet Concern",
    V.FOUND_ANIMAL: "Found Animal Concern",
    V.NUISANCE: "Animal Nuisance Concern",
    V.OTHER_CONCERN: "Other Animal Concern",
}

CONCERN_STATUS_LABELS: Dict[str, str] = {
    "ongoing_assessment": "Ongoing Assessment",
    "in_progress": "In Progress",
    "resolved": "Resolved",
    "not_applicable": "Dismissed / N/A",
}

RESOLVED_CONCERN_STATUSES = ("resolved", "not_applicable")


def ensure_case_concerns_table(bind_engine) -> None:
    """Create `case_concerns` idempotently when not yet present."""
    Base.metadata.create_all(bind=bind_engine, tables=[CaseConcern.__table__], checkfirst=True)


def concern_label_for(family: str) -> str:
    return CONCERN_LABELS.get(family, "Animal Concern")


def capture_original_status(db: Session, report: Report) -> Tuple[Optional[int], str]:
    """Return the report's pre-merge (status_id, human_label), recovering from StatusHistory if already status 18."""
    sid = report.current_status_id
    if sid == V.MERGED_LEGACY_ID:
        prev = (
            db.query(StatusHistory)
            .filter(
                StatusHistory.report_id == report.report_id,
                StatusHistory.report_status_id.isnot(None),
                StatusHistory.report_status_id != V.MERGED_LEGACY_ID,
            )
            .order_by(StatusHistory.history_id.desc())
            .first()
        )
        sid = prev.report_status_id if prev is not None else 1
    row = db.get(ReportStatus, sid) if sid is not None else None
    if row is not None and row.status_name:
        return sid, row.status_name
    if sid is not None:
        return sid, V.STATUS_LABELS.get(V.case_status_from_legacy(sid), f"Status {sid}")
    return 1, "Reported"


def _initial_status_for(report: Report) -> str:
    if case_state.is_closed(report) and report.current_status_id != V.MERGED_LEGACY_ID:
        return "resolved"
    if case_state.case_status_of(report) == V.IN_PROGRESS:
        return "in_progress"
    return "ongoing_assessment"


def _ensure_one_concern(db: Session, master_id: int, report: Report) -> CaseConcern:
    existing = (
        db.query(CaseConcern)
        .filter(CaseConcern.master_report_id == master_id, CaseConcern.source_report_id == report.report_id)
        .first()
    )
    if existing is not None:
        return existing
    family = report_family(report)
    orig_id, orig_label = capture_original_status(db, report)
    concern = CaseConcern(
        master_report_id=master_id,
        source_report_id=report.report_id,
        concern_family=family,
        concern_label=concern_label_for(family),
        original_status_id=orig_id,
        original_status_label=orig_label,
        status=_initial_status_for(report),
    )
    db.add(concern)
    db.flush()
    return concern


def sync_concerns_on_merge(db: Session, primary_report: Report, merged_reports: List[Report]) -> List[CaseConcern]:
    """
    Create/preserve independent CaseConcern entries for the primary report and every merged report.
    Any pre-existing CaseConcern records owned by a secondary report are re-parented to `primary_report`.
    """
    _ensure_one_concern(db, primary_report.report_id, primary_report)
    for rep in merged_reports:
        child_concerns = db.query(CaseConcern).filter(CaseConcern.master_report_id == rep.report_id).all()
        for cc in child_concerns:
            dup = (
                db.query(CaseConcern)
                .filter(
                    CaseConcern.master_report_id == primary_report.report_id,
                    CaseConcern.source_report_id == cc.source_report_id,
                )
                .first()
            )
            if dup is None:
                cc.master_report_id = primary_report.report_id
            elif dup.concern_id != cc.concern_id:
                db.delete(cc)
        _ensure_one_concern(db, primary_report.report_id, rep)
    db.flush()
    return _ordered_concerns(db, primary_report.report_id)


def detach_concern_on_unmerge(db: Session, unmerged_report: Report, prev_primary_id: Optional[int]) -> Optional[int]:
    """Remove the unmerged report's concern from `prev_primary_id` and return its original status id if recorded."""
    if not prev_primary_id:
        return None
    row = (
        db.query(CaseConcern)
        .filter(
            CaseConcern.master_report_id == prev_primary_id,
            CaseConcern.source_report_id == unmerged_report.report_id,
        )
        .first()
    )
    orig_status = row.original_status_id if row is not None else None
    if row is not None:
        db.delete(row)
        db.flush()
    remaining_children = (
        db.query(Report).filter(Report.duplicate_of_report_id == prev_primary_id).count()
    )
    if remaining_children == 0:
        for leftover in db.query(CaseConcern).filter(CaseConcern.master_report_id == prev_primary_id).all():
            if leftover.status not in RESOLVED_CONCERN_STATUSES:
                db.delete(leftover)
        db.flush()
    return orig_status


def _ordered_concerns(db: Session, master_report_id: int) -> List[CaseConcern]:
    rows = db.query(CaseConcern).filter(CaseConcern.master_report_id == master_report_id).all()
    return sorted(rows, key=lambda c: (0 if c.source_report_id == master_report_id else 1, c.source_report_id, c.concern_id))


def concerns_for_case(db: Session, master_report: Report) -> List[CaseConcern]:
    """Return all independent concerns for a consolidated case (auto-backfilling merged legacy cases)."""
    merged_rows = db.query(Report).filter(Report.duplicate_of_report_id == master_report.report_id).all()
    if merged_rows:
        return sync_concerns_on_merge(db, master_report, merged_rows)
    return _ordered_concerns(db, master_report.report_id)


def unresolved_concerns(db: Session, master_report: Report) -> List[CaseConcern]:
    """Unresolved concerns blocking premature closure of a consolidated multi-report case."""
    concerns = concerns_for_case(db, master_report)
    if len(concerns) <= 1:
        return []
    return [c for c in concerns if c.status not in RESOLVED_CONCERN_STATUSES]


def concerns_view(db: Session, master_report: Report, names: Dict[int, str]) -> List[Dict[str, Any]]:
    concerns = concerns_for_case(db, master_report)
    if len(concerns) <= 1:
        return []
    src_ids = [c.source_report_id for c in concerns]
    src_reports = {r.report_id: r for r in db.query(Report).filter(Report.report_id.in_(src_ids)).all()} if src_ids else {}
    out: List[Dict[str, Any]] = []
    for c in concerns:
        src = src_reports.get(c.source_report_id)
        ref_year = (src.created_at if src and src.created_at else master_report.created_at).year
        out.append({
            "concern_id": c.concern_id,
            "master_report_id": c.master_report_id,
            "source_report_id": c.source_report_id,
            "source_reference": f"SS-{ref_year}-{c.source_report_id:04d}",
            "is_primary": c.source_report_id == master_report.report_id,
            "concern_family": c.concern_family,
            "concern_label": c.concern_label,
            "original_status_id": c.original_status_id,
            "original_status_label": c.original_status_label,
            "status": c.status,
            "status_label": CONCERN_STATUS_LABELS.get(c.status, c.status),
            "outcome": c.outcome,
            "threat_ongoing": c.threat_ongoing,
            "details": c.details or {},
            "resolution_notes": c.resolution_notes,
            "resolved_at": c.resolved_at,
            "resolved_by": c.resolved_by,
            "resolved_by_name": names.get(c.resolved_by) if c.resolved_by else None,
            "updated_at": c.updated_at,
            "updated_by_name": names.get(c.updated_by) if c.updated_by else None,
        })
    return out


def update_concern(
    db: Session,
    master_report: Report,
    concern_id: int,
    actor: User,
    data: ConcernUpdateIn,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> CaseConcern:
    """Update the independent status/resolution of one concern within a consolidated master case."""
    from app.services import case_lifecycle as L

    L.require_open(master_report, "update its concerns")
    concerns_for_case(db, master_report)
    concern = db.query(CaseConcern).filter(
        CaseConcern.concern_id == concern_id,
        CaseConcern.master_report_id == master_report.report_id,
    ).first()
    if concern is None:
        raise HTTPException(status_code=404, detail="Concern not found on this case.")

    outcome = (data.outcome or "").strip() or None
    threat_ongoing = (data.threat_ongoing or "").strip() or None
    notes = (data.resolution_notes or "").strip() or None

    if data.status == "resolved":
        if concern.concern_family == V.INJURED and not outcome:
            raise HTTPException(
                status_code=422,
                detail="Document the Animal Welfare Outcome before marking the Injured Animal concern as Resolved.",
            )
        if concern.concern_family == V.SAFETY:
            if not outcome:
                raise HTTPException(
                    status_code=422,
                    detail="Document the Dangerous Animal Incident Outcome before marking the Dangerous Animal concern as Resolved.",
                )
            if (threat_ongoing or "").lower() == "yes":
                raise HTTPException(
                    status_code=422,
                    detail="Cannot mark the Dangerous Animal concern as Resolved while the safety threat is still ongoing.",
                )
        if not notes and not outcome:
            raise HTTPException(
                status_code=422,
                detail="Provide a resolution outcome or summary note (at least 5 characters).",
            )
    elif data.status == "not_applicable" and (not notes or len(notes) < 5):
        raise HTTPException(
            status_code=422,
            detail="Explain why this concern is dismissed or not applicable (at least 5 characters).",
        )

    old = {"status": concern.status, "outcome": concern.outcome, "threat_ongoing": concern.threat_ongoing}
    now = datetime.now()

    details: Dict[str, str] = {}
    for key, val in (
        ("final_animal_condition", data.final_animal_condition),
        ("assistance_provided", data.assistance_provided),
        ("security_actions_performed", data.security_actions_performed),
        ("advisory_status", data.advisory_status),
        ("referral_outcome", data.referral_outcome),
    ):
        cleaned = (val or "").strip()
        if cleaned:
            details[key] = cleaned

    concern.status = data.status
    concern.outcome = outcome
    concern.threat_ongoing = threat_ongoing if concern.concern_family == V.SAFETY else None
    concern.details = details or None
    concern.resolution_notes = notes
    concern.updated_by = actor.user_id
    concern.updated_at = now
    if data.status in RESOLVED_CONCERN_STATUSES:
        concern.resolved_at = now
        concern.resolved_by = actor.user_id
    else:
        concern.resolved_at = None
        concern.resolved_by = None

    db.flush()

    # Keep the master case open/active whenever any other concern remains active.
    remaining_open = unresolved_concerns(db, master_report)
    if case_state.case_status_of(master_report) == V.REPORTED:
        L.advance_case(db, master_report, actor, V.UNDER_REVIEW, "concern assessment started")
    if data.status in ("in_progress", "resolved", "not_applicable") and remaining_open:
        L.advance_case(db, master_report, actor, V.IN_PROGRESS, "concern progress recorded")

    status_label = CONCERN_STATUS_LABELS.get(data.status, data.status)
    src_ref = f"Report #{concern.source_report_id}"
    rem_summary = (
        f" Remaining active concerns: {', '.join(r.concern_label for r in remaining_open)}."
        if remaining_open
        else " All consolidated concerns are now resolved; the master case may be closed."
    )
    L.history(
        db,
        master_report,
        actor,
        f"{concern.concern_label} ({src_ref}) marked {status_label}."
        + (f" Outcome: {outcome}." if outcome else "")
        + rem_summary,
    )
    L.audit(
        db,
        actor,
        "CASE_CONCERN_UPDATED",
        master_report,
        f"{actor.name} updated {concern.concern_label} (#{concern.source_report_id}) on Case #{master_report.report_id} to {status_label}.",
        old=old,
        new={
            "concern_id": concern.concern_id,
            "source_report_id": concern.source_report_id,
            "status": concern.status,
            "outcome": concern.outcome,
            "threat_ongoing": concern.threat_ongoing,
            "remaining_open_concerns": len(remaining_open),
        },
        ip=ip,
        user_agent=user_agent,
    )
    return concern
