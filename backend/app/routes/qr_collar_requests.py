from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services import qr_collar_requests as S
from app.utils.auth import get_current_user

router = APIRouter(prefix="/qr-collar-requests", tags=["qr-collar-requests"])


class CreateCollarRequestIn(BaseModel):
    pet_id: int
    notes: Optional[str] = Field(None, max_length=500)


class AcceptCollarRequestIn(BaseModel):
    admin_notes: Optional[str] = Field(None, max_length=500)


class ReadyCollarRequestIn(BaseModel):
    message: Optional[str] = Field(None, max_length=2000)
    admin_notes: Optional[str] = Field(None, max_length=500)


@router.get("/mine")
def list_my_collar_requests(
    pet_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, List[Dict[str, Any]]]:
    return {"items": S.list_resident_requests(db, user, pet_id=pet_id)}


@router.post("", status_code=201)
def create_collar_request(
    body: CreateCollarRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    out = S.create_request(db, user, body.pet_id, notes=body.notes)
    db.commit()
    return out


@router.get("/admin")
def list_admin_collar_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    return S.list_admin_requests(db, user)


@router.post("/{request_id}/accept")
def accept_collar_request(
    request_id: int,
    body: Optional[AcceptCollarRequestIn] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    out = S.accept_request(db, user, request_id, admin_notes=body.admin_notes if body else None)
    db.commit()
    return out


@router.post("/{request_id}/ready")
def ready_collar_request(
    request_id: int,
    body: Optional[ReadyCollarRequestIn] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    out = S.mark_ready_for_pickup(
        db,
        user,
        request_id,
        message=body.message if body else None,
        admin_notes=body.admin_notes if body else None,
    )
    db.commit()
    return out


@router.post("/{request_id}/complete")
def complete_collar_request(
    request_id: int,
    body: Optional[AcceptCollarRequestIn] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    out = S.mark_completed(db, user, request_id, admin_notes=body.admin_notes if body else None)
    db.commit()
    return out
