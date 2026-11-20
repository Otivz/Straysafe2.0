"""
Possible Pet Owner Verification (docs/01-system/POSSIBLE_OWNER_VERIFICATION.md), for the Subdivision Leader of the case (or the Administrator):

    GET  /owner-verification/reports/{report_id}                 the Possible Pet Owners section: candidates, what matched, status, history
    POST /owner-verification/reports/{report_id}/contact         {"pet_id", "message", "client_request_id"}  Contact Possible Owner
    POST /owner-verification/requests/{request_id}/follow-up     {"message", "client_request_id"}  another message while no answer came
    POST /owner-verification/requests/{request_id}/unable-to-contact  {"note"}  the owner could not be reached (decides nothing)

The possible owner answers with POST /pet-match-confirmations/{id}/respond (or writes in the conversation); the final verification is
POST /manual-matching/decisions with pet_id, which is refused until the owner said YES. Residents get 403 here.
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.services import owner_verification as OV
from app.utils.auth import get_current_user

router = APIRouter(prefix="/owner-verification", tags=["owner-verification"])


class ContactIn(BaseModel):
    pet_id: int
    message: str = Field(..., min_length=1, max_length=OV.MAX_BODY)
    client_request_id: Optional[str] = Field(None, max_length=64)


class MessageOwnerIn(BaseModel):
    pet_id: int
    message_type: str = Field("ownership_verification", pattern="^(ownership_verification|direct_message)$")
    message: str = Field(..., min_length=1, max_length=OV.MAX_BODY)
    contact_method: Optional[str] = Field(None, max_length=50)
    contact_detail: Optional[str] = Field(None, max_length=255)
    client_request_id: Optional[str] = Field(None, max_length=64)


class FollowUpIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=OV.MAX_BODY)
    client_request_id: Optional[str] = Field(None, max_length=64)


class UnableIn(BaseModel):
    note: str = Field(..., min_length=5, max_length=1000)


def _staff(user: User) -> None:
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only the Subdivision Administration can verify possible owners.")


def _result(db: Session, report_id: int, user: User, request_id: int) -> Dict[str, Any]:
    out = OV.possible_owners(db, report_id, user)
    out["request_id"] = request_id
    return out


@router.get("/reports/{report_id}")
def possible_owners(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _staff(user)
    return OV.possible_owners(db, report_id, user)


@router.post("/reports/{report_id}/contact", status_code=201)
@limiter.limit("20/minute")
def contact_possible_owner(request: Request, report_id: int, body: ContactIn, db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _staff(user)
    req = OV.contact(db, report_id, body.pet_id, user, body.message, body.client_request_id)
    db.commit()
    return _result(db, report_id, user, req.request_id)


@router.post("/reports/{report_id}/message", status_code=201)
@limiter.limit("20/minute")
def message_pet_owner(request: Request, report_id: int, body: MessageOwnerIn, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _staff(user)
    info = OV.message_owner(
        db,
        report_id,
        body.pet_id,
        user,
        body.message,
        body.message_type,
        body.client_request_id,
        contact_method=body.contact_method,
        contact_detail=body.contact_detail,
    )
    db.commit()
    out = OV.possible_owners(db, report_id, user)
    out["request_id"] = info.get("request_id")
    out["thread_id"] = info.get("thread_id")
    out["mode"] = info.get("mode")
    return out


@router.post("/requests/{request_id}/follow-up")
@limiter.limit("20/minute")
def follow_up(request: Request, request_id: int, body: FollowUpIn, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _staff(user)
    req = OV.follow_up(db, request_id, user, body.message, body.client_request_id)
    db.commit()
    return _result(db, req.report_id, user, req.request_id)


@router.post("/requests/{request_id}/unable-to-contact")
def unable_to_contact(request_id: int, body: UnableIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _staff(user)
    req = OV.mark_unable_to_contact(db, request_id, user, body.note)
    db.commit()
    return _result(db, req.report_id, user, req.request_id)
