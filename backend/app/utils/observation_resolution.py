"""
Resolving an observation case resolves its report (docs/01-system/REPORT_STATUS_SYNC_RULES.md).

The report row (reports.current_status_id) is the single source of truth for a case's status: every page, dashboard,
count and timeline reads it. The observation record (owner_followups.status) only tracks the observation itself:
  observation "complied" (Resolved)  ->  case report 11 Incident Resolved, its open warnings Resolved.
Both observation endpoints (/resolve and /close with outcome "complied") go through resolve_observation_case(), in one
transaction with the observation change, so the two can never disagree.

Scope: the observation's case (its report, or the main report it was merged into, and any still-open report merged
into that case). Repeat reports logged against the observation are separate incidents and keep their own status.
Statuses set by another workflow (rejected, claimed, released, deceased, dismissed, not found, Barangay handling)
are never overwritten: the resolution is refused instead.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.owner_followup import OwnerFollowUp
from app.models.report import Report, StatusHistory
from app.models.user import User

RESOLVED_STATUS_ID = 11
RESOLVED_STATUS_NAME = "Incident Resolved"
# A case already ended by another workflow, or handled by the Barangay (escalated, rescue, picked up, impounded,
# approved): the Subdivision observation can't resolve it.
CLOSED_ELSEWHERE = {3, 9, 10, 12, 14, 17, 18}
BARANGAY_HANDLING = {4, 5, 6, 8, 13}
STATUS_NAMES = {
    1: "Reported", 2: "Verified", 3: "Rejected", 4: "Escalated to Barangay", 5: "Rescue In Progress", 6: "Picked Up",
    7: "Under Observation", 8: "Impounded", 9: "Claimed by Owner", 10: "Released", 11: "Incident Resolved",
    12: "Deceased", 13: "Approved by Barangay", 14: "False Alarm / Dismissed", 15: "Disputed", 16: "Under Investigation",
    17: "Animal Cannot Be Found", 18: "Merged — Duplicate",
}
OPEN_WARNING_STATUSES = ("Pending", "Acknowledged")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def status_name(status_id: Optional[int]) -> str:
    return STATUS_NAMES.get(status_id or 0, "Updated")


def observation_case_reports(db: Session, followup: OwnerFollowUp) -> tuple:
    """(main report, other reports of the same case that are still open). Merged duplicates (18) follow the main one."""
    from app.utils.case_groups import case_members, case_root
    report = db.get(Report, followup.report_id) if followup.report_id else None
    if report is None:
        return None, []
    root = case_root(db, report)
    others = [m for m in case_members(db, root)
              if m.report_id != root.report_id and m.current_status_id not in CLOSED_ELSEWHERE | {RESOLVED_STATUS_ID}]
    return root, others


def require_resolvable(db: Session, followup: OwnerFollowUp) -> None:
    """Validate before anything changes: the observation is open and its case can be resolved."""
    if followup.status != "observing":
        raise HTTPException(status_code=409, detail="This observation has already been concluded; nothing was changed.")
    root, _ = observation_case_reports(db, followup)
    if root is None:
        return
    if root.current_status_id in CLOSED_ELSEWHERE:
        raise HTTPException(status_code=409, detail=(
            f"Report #{root.report_id} is already closed as '{status_name(root.current_status_id)}'. "
            "The observation can't change that outcome."))
    if root.current_status_id in BARANGAY_HANDLING:
        raise HTTPException(status_code=409, detail=(
            f"Report #{root.report_id} is being handled by the Barangay ('{status_name(root.current_status_id)}'). "
            "The Barangay closes it through its own workflow."))


def resolve_observation_case(db: Session, followup: OwnerFollowUp, actor: User, remarks: str, req=None) -> dict:
    """
    Resolve the observation's case report(s) in the caller's transaction (the caller commits). Call after
    require_resolvable() and after the observation itself was marked complied. Returns what changed, for the response
    and for notify_case_resolved() after the commit.
    """
    from app.models.warning import OwnerWarning
    from app.utils.audit import log_activity

    root, others = observation_case_reports(db, followup)
    changed: List[dict] = []
    if root is None:
        return {"report_id": None, "changed": changed, "warnings_resolved": 0}
    now = _now()
    for rep in [root, *others]:
        previous = rep.current_status_id
        if previous == RESOLVED_STATUS_ID:
            continue  # already resolved: no second history row, audit entry or notification
        rep.current_status_id = RESOLVED_STATUS_ID  # the time is on the history row and the audit entry
        via = "" if rep is root else f" (part of case #{root.report_id})"
        db.add(StatusHistory(
            report_id=rep.report_id, report_status_id=RESOLVED_STATUS_ID, updated_by=actor.user_id,
            remarks=(f"✅ Case Resolved{via}: observation #{followup.followup_id} verified by {actor.name}. "
                     f"Previous status: {status_name(previous)}. Remarks: {remarks}"),
        ))
        log_activity(
            db=db, action="RESOLVE_OBSERVATION_CASE", target_table="reports", target_id=rep.report_id,
            description=(f"{actor.name} resolved Report #{rep.report_id}{via} through observation #{followup.followup_id}: "
                         f"{status_name(previous)} -> {RESOLVED_STATUS_NAME}."),
            user_id=actor.user_id, log_type="operation",
            old_values={"status_id": previous, "status_name": status_name(previous)},
            new_values={"status_id": RESOLVED_STATUS_ID, "status_name": RESOLVED_STATUS_NAME,
                        "observation_id": followup.followup_id, "case_report_id": root.report_id,
                        "remarks": remarks, "resolved_at": now.isoformat()},
            request=req, commit=False,
        )
        changed.append({"report_id": rep.report_id, "previous_status_id": previous, "reporter_id": rep.user_id})

    # Warnings on the case end with it (appealed ones keep their appeal)
    case_ids = [root.report_id, *[o.report_id for o in others]]
    warnings = (db.query(OwnerWarning).filter(OwnerWarning.report_id.in_(case_ids),
                                              OwnerWarning.status.in_(OPEN_WARNING_STATUSES)).all())
    for w in warnings:
        w.status = "Resolved"
    return {"report_id": root.report_id, "changed": changed, "warnings_resolved": len(warnings),
            "landmark": root.landmark}


def notify_case_resolved(db: Session, followup: OwnerFollowUp, outcome: dict, remarks: str, actor: User) -> None:
    """
    After the commit: tell each resident who filed a now-resolved report. One notification per reporter; the pet owner
    already gets the observation notification, so an owner who is also the reporter isn't told twice.
    """
    from app.utils.notification_dispatcher import notify_report_status_update
    told = {actor.user_id}
    if followup.owner_id:
        told.add(followup.owner_id)
    for item in outcome.get("changed", []):
        uid = item.get("reporter_id")
        if not uid or uid in told:
            continue
        reporter = db.get(User, uid)
        if reporter is None:
            continue
        notify_report_status_update(db=db, recipient=reporter, report_id=item["report_id"], status_id=RESOLVED_STATUS_ID,
                                    status_name=RESOLVED_STATUS_NAME, remarks=remarks, landmark=outcome.get("landmark"))
        told.add(uid)
