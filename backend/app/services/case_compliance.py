"""
Compliance observations on a warning: what the Admin screen calls "Record compliance observation". No schema change.

An observation is staff-only. It is kept in the audit log (action WARNING_OBSERVATION, target = the warning), so there is no
new table and nothing is written to the case timeline residents can read, except one neutral line when an observation ends.

Concluding an observation (the officer decides the owner complied, or did not) does NOT close the case. The case closes only
through its own documented disposition (services/case_lifecycle.close_case). What concluding does:
  - a compliant conclusion marks the warning Resolved (the server's `owner_compliance` closure rule reads exactly that) and
    the legacy owner observation `complied`, WITHOUT the "resolve the report" side effect of /owner-followups/{id}/close
  - a non-compliant conclusion ends the legacy observation as `closed` and leaves the warning as it was
  - the warning's pending end-of-observation follow-up is completed either way
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.case_records import CaseFollowUp
from app.models.owner_followup import OwnerFollowUp
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.services import case_lifecycle as L

OBSERVATION_ACTION = "WARNING_OBSERVATION"
LOG_TYPE = "enforcement"
RESULTS = ("compliant", "partial", "non_compliant", "unable_to_observe")


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def observations_of(db: Session, warning_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
    """Every recorded observation of these warnings, newest first, grouped by warning."""
    if not warning_ids:
        return {}
    rows = (db.query(AuditLog).filter(AuditLog.action == OBSERVATION_ACTION, AuditLog.target_table == "owner_warnings",
                                      AuditLog.target_id.in_(warning_ids)).order_by(AuditLog.log_id.desc()).all())
    names = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_({r.user_id for r in rows if r.user_id})).all()} if rows else {}
    out: Dict[int, List[Dict[str, Any]]] = {}
    for r in rows:
        data = r.new_values or {}
        out.setdefault(r.target_id, []).append({
            "observation_id": r.log_id, "warning_id": r.target_id, "result": data.get("result"), "observed_at": data.get("observed_at"),
            "notes": r.description or "", "concluded": data.get("conclude"), "by": r.user_id, "by_name": names.get(r.user_id),
            "recorded_at": r.created_at})
    return out


def record_observation(db: Session, report: Report, warning_id: int, actor: User, result: str, notes: str,
                       observed_at: Optional[datetime], conclude: Optional[str],
                       ip: Optional[str] = None, user_agent: Optional[str] = None) -> Dict[str, Any]:
    L.require_open(report, "record an observation")
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id, OwnerWarning.report_id == report.report_id).first()
    if warning is None:
        raise HTTPException(status_code=404, detail="That warning is not on this case.")
    already = observations_of(db, [warning_id]).get(warning_id, [])
    if any(o["concluded"] for o in already):
        raise HTTPException(status_code=409, detail="This observation has already been concluded.")
    if result not in RESULTS:
        raise HTTPException(status_code=422, detail="Choose what was observed.")
    clean = (notes or "").strip()
    if len(clean) < 3:
        raise HTTPException(status_code=422, detail="Write what was observed.")
    if conclude not in (None, "compliant", "non_compliant"):
        raise HTTPException(status_code=422, detail="An observation concludes as compliant or non-compliant.")
    when = (observed_at.replace(tzinfo=None) if observed_at and observed_at.tzinfo else observed_at) or datetime.now()

    db.add(AuditLog(user_id=actor.user_id, action=OBSERVATION_ACTION, target_table="owner_warnings", target_id=warning.warning_id,
                    description=clean, log_type=LOG_TYPE, ip_address=ip, user_agent=user_agent,
                    new_values={"result": result, "observed_at": when.isoformat(), "conclude": conclude, "report_id": report.report_id}))
    if conclude:
        now = datetime.now()
        if conclude == "compliant":
            warning.status = "Resolved"
        for f in db.query(CaseFollowUp).filter(CaseFollowUp.report_id == report.report_id, CaseFollowUp.kind == "warning_end",
                                               CaseFollowUp.status == "pending").all():
            f.status, f.completed_at, f.completed_by, f.completion_note = "done", now, actor.user_id, "Observation concluded."
        observing = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == report.report_id, OwnerFollowUp.status == "observing").all()
        if observing:
            from app.utils.owner_followups import record_observation_event
            for fu in observing:
                fu.status = "complied" if conclude == "compliant" else "closed"
                fu.closed_at, fu.closed_by, fu.close_reason, fu.compliance_notes = now, actor.user_id, "Concluded by the case officer.", clean
                record_observation_event(db, fu, "ended", actor.user_id)
        L.audit(db, actor, "WARNING_OBSERVATION_CONCLUDED", report,
                f"{actor.name} concluded the observation on warning #{warning.warning_id} as {conclude.replace('_', '-')}.",
                new={"warning_id": warning.warning_id, "outcome": conclude}, table="owner_warnings", target_id=warning.warning_id,
                ip=ip, user_agent=user_agent)
    db.flush()
    return {"warning_id": warning.warning_id, "result": result, "concluded": conclude, "warning_status": warning.status,
            "observations": observations_of(db, [warning.warning_id]).get(warning.warning_id, [])}
