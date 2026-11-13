"""
Lost and found possible matches (docs/01-system/LOST_FOUND_MATCHING.md), for the Subdivision Leader of the reports' subdivision (or the
Administrator). Residents and Barangay staff get nothing from here: a resident learns about a match only when a Leader confirms it.

    GET  /lost-found/matches                          the possible matches of the subdivision (?status=pending|confirmed|rejected|moot, ?report_id=)
    GET  /lost-found/matches/{id}                     one match with the side-by-side comparison the Leader reviews
    POST /lost-found/matches/{id}/decision            {"decision": "confirm" | "reject" | "reopen"}
    POST /lost-found/scan                             check the subdivision's open reports for matches (older reports have none yet)
    POST /lost-found/links                            {"report_id", "other_report_id"}  link a missing-pet report and a found-animal report by hand
    POST /lost-found/matches/{id}/unlink              remove a link (the pair is ruled out; its conversation closes; both residents are told)
    POST /lost-found/matches/{id}/thread              open (or find) the conversation of a linked pair
    POST /lost-found/reports/{id}/threads             {"party": "owner" | "reporter"}  open (or find) the Leader's conversation with that person

The matches themselves are written by the background check when a lost or found report is filed (services/lost_found_matching.py).
"""
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services import case_lifecycle as L
from app.services import case_messaging as CM
from app.services import lost_found_matching as LFM
from app.utils.auth import get_current_user, verify_subdivision_scope

router = APIRouter(prefix="/lost-found", tags=["lost-found"])


class DecisionIn(BaseModel):
    decision: Literal["confirm", "reject", "reopen"]


class LinkIn(BaseModel):
    report_id: int
    other_report_id: int


class PartyIn(BaseModel):
    party: Literal["owner", "reporter"]


@router.get("/matches")
def list_matches(status: Optional[str] = None, report_id: Optional[int] = None, subdivision_id: Optional[int] = None,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = LFM.list_matches(db, user, subdivision_id=subdivision_id, status=status, report_id=report_id)
    return [LFM.match_view(db, m) for m in rows]


@router.get("/matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return LFM.match_view(db, LFM.match_for_leader(db, match_id, user), detail=True)


@router.post("/matches/{match_id}/decision")
def decide_match(match_id: int, body: DecisionIn, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> Dict[str, Any]:
    m = LFM.match_for_leader(db, match_id, user)
    LFM.decide(db, m, user, body.decision, req=request)
    db.commit()
    db.refresh(m)
    return LFM.match_view(db, m, detail=True)


@router.post("/scan")
def scan(subdivision_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can check for possible matches.")
    scope = user.subdivision_id if user.role_id == 2 else subdivision_id
    if not scope:
        raise HTTPException(status_code=422, detail="Choose a subdivision.")
    verify_subdivision_scope(user, scope, db=db)
    return {"subdivision_id": scope, "suggested": LFM.scan_subdivision(db, scope)}


@router.post("/links", status_code=201)
def link_reports(body: LinkIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    m = LFM.link_by_leader(db, user, body.report_id, body.other_report_id, req=request)
    db.commit()
    db.refresh(m)
    return LFM.match_view(db, m, detail=True)


@router.post("/matches/{match_id}/unlink")
def unlink_match(match_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    m = LFM.match_for_leader(db, match_id, user)
    LFM.unlink(db, m, user, req=request)
    db.commit()
    db.refresh(m)
    return LFM.match_view(db, m, detail=True)


@router.post("/matches/{match_id}/thread")
def open_match_thread(match_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    m = LFM.match_for_leader(db, match_id, user)
    t = LFM.open_thread(db, m, user)
    db.commit()
    return CM.summary(db, t, user, "staff")


@router.post("/reports/{report_id}/threads")
def open_report_thread(report_id: int, body: PartyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    report = L.case_for_staff(db, report_id, user, write=True)
    t = CM.open_direct(db, report, user, body.party)
    db.commit()
    return CM.view(db, t, user, "staff")
