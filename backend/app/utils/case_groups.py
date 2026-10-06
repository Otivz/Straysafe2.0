"""
A case is one animal: the report filed first (the main case) plus every report merged into it as a duplicate.
Decisions on report-to-report matches apply to whole cases, not just the two reports in the suggestion:

- Matched: the two cases become one (same merge rules as Merge Duplicates; the first-filed report stays main).
  If both reports are already in the same case, the decision is only recorded.
- Not a Match: every open suggestion between the two cases is rejected too, and the AI stops pairing them.
"""
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException, Request
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.report import Report
from app.models.report_match import ReportMatch
from app.models.user import User

PENDING_MATCH_STATUSES = ("AI_SUGGESTED", "PENDING_VERIFICATION")


def case_root(db: Session, report: Report) -> Report:
    """The main case a report belongs to (itself if it is not a merged duplicate)."""
    if report.duplicate_of_report_id:
        parent = db.get(Report, report.duplicate_of_report_id)
        if parent:
            return parent
    return report


def case_members(db: Session, root: Report) -> List[Report]:
    """Every report in the case, in the order they were filed."""
    children = db.query(Report).filter(Report.duplicate_of_report_id == root.report_id).all()
    return sorted([root] + children, key=lambda r: (r.created_at or datetime.max, r.report_id))


def root_ids(db: Session, report_ids: Iterable[int]) -> Dict[int, int]:
    """report_id -> its main case's report_id."""
    ids = list({i for i in report_ids if i})
    if not ids:
        return {}
    rows = db.query(Report.report_id, Report.duplicate_of_report_id).filter(Report.report_id.in_(ids)).all()
    return {rid: (parent or rid) for rid, parent in rows}


def _describe(members: List[Report], root_id: int) -> str:
    if len(members) == 1:
        return f"Report #{members[0].report_id}"
    return f"Case #{root_id} (Reports {', '.join('#' + str(m.report_id) for m in members)})"


def _pet_conflict(members: List[Report]) -> Optional[str]:
    pets = {m.pet_id for m in members if m.pet_id}
    if len(pets) > 1:
        return "These reports are linked to different registered animals (" + ", ".join(f"Pet #{p}" for p in sorted(pets)) + "), so they can't be the same animal."
    return None


def preview_report_match(db: Session, actor: User, match: ReportMatch) -> dict:
    """What confirming this report-to-report match would do, and why it would be refused (if it would)."""
    from app.routes.reports import _check_merge_primary, _check_mergeable, _first_reported

    src, tgt = match.source_report, match.matched_report
    src_root, tgt_root = case_root(db, src), case_root(db, tgt)
    a, b = case_members(db, src_root), case_members(db, tgt_root)

    if src_root.report_id == tgt_root.report_id:
        return {
            "effect": "already_same_case",
            "main_report_id": src_root.report_id,
            "report_ids": [m.report_id for m in a],
            "message": f"Report #{src.report_id} and Report #{tgt.report_id} are already in Case #{src_root.report_id}. Confirming only records your decision; nothing is merged again.",
            "blocked_reason": None,
        }

    main = _first_reported([src_root, tgt_root])
    other = tgt_root if main is src_root else src_root
    everyone = sorted(a + b, key=lambda r: (r.created_at or datetime.max, r.report_id))
    listed = ", ".join("#" + str(m.report_id) for m in everyone)

    if len(a) == 1 and len(b) == 1:
        effect = "new_case"
        message = f"Report #{other.report_id} will be merged into Report #{main.report_id}, which was filed first and stays the main case."
    elif min(len(a), len(b)) == 1 and (src_root if len(a) > 1 else tgt_root).report_id == main.report_id:
        # One standalone report joins an existing case whose main report was filed earlier.
        effect = "join_case"
        case_side, in_case, single = (a, src, b[0]) if len(a) > 1 else (b, tgt, a[0])
        message = (
            f"Report #{in_case.report_id} is already part of {_describe(case_side, main.report_id)}. "
            f"Confirming will add Report #{single.report_id} to Case #{main.report_id}."
        )
    else:
        effect = "combine_cases"
        message = f"This combines {_describe(a, src_root.report_id)} and {_describe(b, tgt_root.report_id)} into Case #{main.report_id} (filed first): Reports {listed}."

    blocked = _pet_conflict(everyone)
    if not blocked:
        try:
            _check_merge_primary(db, actor, main)
            _check_mergeable(db, actor, other, main)
        except HTTPException as e:
            blocked = str(e.detail)

    return {
        "effect": effect,
        "main_report_id": main.report_id,
        "report_ids": [m.report_id for m in everyone],
        "message": message,
        "blocked_reason": blocked,
    }


def settle_case_suggestions(db: Session, actor: User, main_report_id: int, actor_role: str) -> int:
    """Open suggestions between reports that are now in the same case are closed as confirmed. Returns how many."""
    root = db.get(Report, main_report_id)
    ids = [m.report_id for m in case_members(db, root)]
    rows = db.query(ReportMatch).filter(
        ReportMatch.status.in_(PENDING_MATCH_STATUSES),
        ReportMatch.source_report_id.in_(ids),
        ReportMatch.matched_report_id.in_(ids),
    ).all()
    for m in rows:
        m.status = "CONFIRMED_MATCH"
        m.reviewed_by = actor.user_id
        m.reviewer_role = actor_role
        m.verification_notes = f"Same case: both reports are in Case #{main_report_id}."
        m.verified_at = datetime.now()
    return len(rows)


def confirm_report_match(db: Session, actor: User, match: ReportMatch, notes: str, req: Request, actor_role: str) -> int:
    """Apply a Matched decision. Returns the main case's report_id. Raises a clear 4xx if it can't be done. No commit."""
    from app.routes.reports import _merge_group

    src_root, tgt_root = case_root(db, match.source_report), case_root(db, match.matched_report)
    if src_root.report_id == tgt_root.report_id:
        main_id = src_root.report_id
    else:
        conflict = _pet_conflict(case_members(db, src_root) + case_members(db, tgt_root))
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)
        # The merge checks both main cases (closed, other officer, subdivision, animal type, breed); children follow.
        main_id = _merge_group(db, actor, [src_root.report_id, tgt_root.report_id], notes, req, commit=False).report_id
        db.flush()
    settle_case_suggestions(db, actor, main_id, actor_role)
    return main_id


def reject_report_match(db: Session, actor: User, match: ReportMatch, notes: str, actor_role: str) -> int:
    """Apply a Not a Match decision to both whole cases. Returns how many other suggestions it closed. No commit."""
    src_root, tgt_root = case_root(db, match.source_report), case_root(db, match.matched_report)
    if src_root.report_id == tgt_root.report_id:
        raise HTTPException(
            status_code=409,
            detail=f"Report #{match.source_report_id} and Report #{match.matched_report_id} are already merged in Case #{src_root.report_id}. Unmerge the report first if they are different animals."
        )
    a = [m.report_id for m in case_members(db, src_root)]
    b = [m.report_id for m in case_members(db, tgt_root)]
    rows = db.query(ReportMatch).filter(
        ReportMatch.match_id != match.match_id,
        ReportMatch.status.in_(PENDING_MATCH_STATUSES),
        or_(
            and_(ReportMatch.source_report_id.in_(a), ReportMatch.matched_report_id.in_(b)),
            and_(ReportMatch.source_report_id.in_(b), ReportMatch.matched_report_id.in_(a)),
        ),
    ).all()
    for m in rows:
        m.status = "NOT_A_MATCH"
        m.reviewed_by = actor.user_id
        m.reviewer_role = actor_role
        m.verification_notes = f"Covered by the decision on Match #{match.match_id}: {notes}"
        m.verified_at = datetime.now()
    return len(rows)


def pet_conflict_for_case(db: Session, report: Report, pet_id: int) -> Optional[str]:
    """A case already tied to a different registered animal can't be confirmed as this pet."""
    root = case_root(db, report)
    for m in case_members(db, root):
        if m.pet_id and m.pet_id != pet_id:
            return (
                f"Case #{root.report_id} is already linked to Pet #{m.pet_id} (through Report #{m.report_id}). "
                f"Unlink it first if this is a different animal."
            )
    return None
