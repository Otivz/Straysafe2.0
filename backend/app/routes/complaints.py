"""
Complaint management and progressive enforcement (docs/01-system/COMPLAINT_MANAGEMENT.md):

  GET  /complaints                              every complaint's findings, decision and steps, and the people responsible
  GET  /complaints/people/{respondent_id}       one person's history, rule by rule
  GET  /complaints/{report_id}                  one complaint: findings, decision, steps, the person's history under the rule
  GET  /complaints/{report_id}/leads            where the owner may be found (leads only, never proof)
  POST /complaints/{report_id}/verify           did it happen, and which rule it broke
  POST /complaints/{report_id}/responsible      who is responsible (or: still checking; or a correction)
  POST /complaints/{report_id}/offense          confirm the suggested offense number, or record why it does not count
  POST /complaints/{report_id}/same-occurrence  the same occurrence as an earlier complaint (counted once), or a separate incident
  POST /complaints/{report_id}/steps/{step_id}  something that happened on a letter, the summons, the fine or the Barangay meeting

Reading: the Subdivision Leader (their subdivision) and the Administrator. Every write: the Subdivision Leader handling the case.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.complaint import OffenseIn, ResponsibleIn, SameOccurrenceIn, StepActionIn, VerifyIn
from app.services import complaints as C
from app.utils.auth import get_current_user

router = APIRouter(prefix="/complaints", tags=["complaints"])


def _done(db: Session, report_id: int, user: User) -> Dict[str, Any]:
    db.commit()
    report = C.complaint_for(db, report_id, user)
    db.refresh(report)
    return C.detail(db, report)


@router.get("")
def list_complaints(subdivision_id: Optional[int] = Query(None), db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return C.workspace(db, user, subdivision_id)


@router.get("/people/{respondent_id}")
def person_history(respondent_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return C.person(db, user, respondent_id)


@router.get("/{report_id}")
def complaint_detail(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return C.detail(db, C.complaint_for(db, report_id, user))


@router.get("/{report_id}/leads")
def complaint_leads(report_id: int, skip_respondent_id: Optional[int] = Query(None), db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return C.leads(db, C.complaint_for(db, report_id, user), skip_respondent_id)


@router.post("/{report_id}/verify")
def verify(report_id: int, body: VerifyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    C.verify(db, C.complaint_for(db, report_id, user, write=True), user, body)
    return _done(db, report_id, user)


@router.post("/{report_id}/responsible")
def responsible(report_id: int, body: ResponsibleIn, request: Request, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> Dict[str, Any]:
    C.responsible(db, C.complaint_for(db, report_id, user, write=True), user, body,
                  ip=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"))
    return _done(db, report_id, user)


@router.post("/{report_id}/offense")
def offense(report_id: int, body: OffenseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    C.offense(db, C.complaint_for(db, report_id, user, write=True), user, body)
    return _done(db, report_id, user)


@router.post("/{report_id}/same-occurrence")
def same_occurrence(report_id: int, body: SameOccurrenceIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Dict[str, Any]:
    C.same_occurrence(db, C.complaint_for(db, report_id, user, write=True), user, body)
    return _done(db, report_id, user)


@router.post("/{report_id}/steps/{step_id}")
def step_action(report_id: int, step_id: int, body: StepActionIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> Dict[str, Any]:
    C.step_action(db, C.complaint_for(db, report_id, user, write=True), user, step_id, body)
    return _done(db, report_id, user)
