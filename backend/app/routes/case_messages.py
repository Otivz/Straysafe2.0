"""
Conversations on a lost-pet or found-animal report (docs/01-system/LOST_FOUND_MATCHING.md, "Messages and the bridge"), for the people in them:
the Subdivision Leader of the subdivision (or the Administrator) and the residents of the reports. A stranger is told a conversation does not exist.

    GET  /case-messages                       my conversations, the most recent first (a resident's Home screen and report screens)
    GET  /case-messages/{id}                  one conversation with its messages (a resident sees the Leader as "Subdivision Leader" and the other resident by first name)
    POST /case-messages/{id}/messages         {"body": "...", "client_request_id": "..."}  write in it (refused once it has ended)
    POST /case-messages/{id}/read             mark it read up to the latest message

A Leader opens a conversation from the case screen (routes/lost_found.py: POST /lost-found/reports/{id}/threads and /lost-found/matches/{id}/thread).
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services import case_messaging as CM
from app.utils.auth import get_current_user

router = APIRouter(prefix="/case-messages", tags=["case-messages"])


class MessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=CM.MAX_BODY)
    client_request_id: Optional[str] = Field(None, max_length=64)


class ReadIn(BaseModel):
    through_message_id: int = Field(..., ge=0)


@router.get("")
def my_conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return CM.threads_of_user(db, user)


@router.get("/{thread_id}")
def get_conversation(thread_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    t, mode = CM.thread_for(db, thread_id, user)
    return CM.view(db, t, user, mode)


@router.post("/{thread_id}/messages", status_code=201)
def send_message(thread_id: int, body: MessageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    t, mode = CM.thread_for(db, thread_id, user)
    CM.send(db, t, user, body.body, body.client_request_id)
    db.commit()
    db.refresh(t)
    return CM.view(db, t, user, mode)


@router.post("/{thread_id}/read")
def read_conversation(thread_id: int, body: Optional[ReadIn] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dict[str, Any]:
    t, mode = CM.thread_for(db, thread_id, user)
    CM.mark_read(db, t, user, body.through_message_id if body else None)
    db.commit()
    return CM.summary(db, t, user, mode)
