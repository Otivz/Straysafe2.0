"""
Notification alerts on a lost-pet or found-animal case (docs/01-system/LOST_FOUND_ALERTS.md), for the Subdivision Leader of the case's
subdivision (or the Administrator). Residents receive them as notifications; they have nothing to call here.

    GET  /case-alerts/reports/{report_id}            the case's alerts, newest first, each with its schedule, next sends and history
    GET  /case-alerts/reports/{report_id}/audience   how many residents each choice reaches now
    POST /case-alerts/reports/{report_id}            a new alert (now, later, or repeating)
    PUT  /case-alerts/{alert_id}                     change a live alert (future sends only)
    POST /case-alerts/{alert_id}/pause | /resume | /stop

An alert never creates, publishes or edits the Community notice.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.case_alert import CaseAlert
from app.models.report import Report
from app.models.user import User
from app.schemas.case_alert import AlertIn
from app.services import case_alerts as CA
from app.services import case_lifecycle as L
from app.utils.auth import get_current_user

router = APIRouter(prefix="/case-alerts", tags=["case-alerts"])


def _case(db: Session, report_id: int, user: User, write: bool = False) -> Report:
    report = L.case_for_staff(db, report_id, user, write=write)
    full = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == report.report_id).first()
    return full if full is not None else report


def _alert(db: Session, alert_id: int, user: User):
    a = db.query(CaseAlert).filter(CaseAlert.alert_id == alert_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return a, _case(db, a.report_id, user, write=True)


@router.get("/reports/{report_id}")
def list_alerts(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return CA.alerts_for_report(db, _case(db, report_id, user))


@router.get("/reports/{report_id}/audience")
def audience(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return CA.audience_counts(db, _case(db, report_id, user))


@router.post("/reports/{report_id}", status_code=201)
def create_alert(report_id: int, body: AlertIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    report = _case(db, report_id, user, write=True)
    a = CA.create(db, report, user, body)
    db.commit()
    db.refresh(a)
    return CA.alert_view(db, a)


@router.put("/{alert_id}")
def update_alert(alert_id: int, body: AlertIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    a, report = _alert(db, alert_id, user)
    CA.update(db, a, report, user, body)
    db.commit()
    db.refresh(a)
    return CA.alert_view(db, a)


@router.post("/{alert_id}/pause")
def pause_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    a, report = _alert(db, alert_id, user)
    CA.pause(db, a, report, user)
    db.commit()
    db.refresh(a)
    return CA.alert_view(db, a)


@router.post("/{alert_id}/resume")
def resume_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    a, report = _alert(db, alert_id, user)
    CA.resume(db, a, report, user)
    db.commit()
    db.refresh(a)
    return CA.alert_view(db, a)


@router.post("/{alert_id}/stop")
def stop_alert(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    a, report = _alert(db, alert_id, user)
    CA.stop(db, a, report, user)
    db.commit()
    db.refresh(a)
    return CA.alert_view(db, a)
