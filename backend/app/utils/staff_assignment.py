"""Validate assignment targets before changing a case, team or adoption record."""
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User


def require_active_assignee(user: Optional[User]) -> User:
    if user is None:
        raise HTTPException(status_code=404, detail="Assigned staff member not found.")
    if (user.status or "").strip().lower() != "active":
        raise HTTPException(status_code=400, detail=f"{user.name} is inactive or off duty and cannot be assigned. Choose active personnel.")
    return user


def load_active_assignees(db: Session, user_ids: Iterable[int]) -> list[User]:
    """Validate the complete team before any previous assignments are replaced."""
    ids = list(dict.fromkeys(user_ids))
    users = {user.user_id: user for user in db.query(User).filter(User.user_id.in_(ids)).all()}
    return [require_active_assignee(users.get(user_id)) for user_id in ids]
