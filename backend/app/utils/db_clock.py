"""
The database's own clock.

Timestamps stored with server_default NOW() use the database server's local time, which can differ from the app
server's clock (UTC vs a database in +8). Anything compared with those columns should use db_now(), not datetime.now().
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def db_now(session: Optional[Session]) -> datetime:
    """The database's own current time (naive), the same clock as columns filled by server_default NOW().
    The app server's clock may be on another time zone (UTC vs the database's local +8), which made durations 8 hours off."""
    if session is not None:
        try:
            value = session.execute(select(func.now())).scalar()
            if isinstance(value, str):          # SQLite returns text
                value = datetime.fromisoformat(value)
            if value is not None:
                return value.replace(tzinfo=None)
        except Exception:
            pass
    return datetime.now()
