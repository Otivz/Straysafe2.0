"""
Times sent by the browser are converted to local wall-clock time before they are saved.

The database stores local time (its NOW() is UTC+8 here) and the pages show stored times as local. The browser sends
picked times in UTC ("2026-10-20T13:11:00Z" for 9:11 PM), which were saved as 13:11 and shown as 1:11 PM, 8 hours
early (SYSTEM_AUDIT.md 4.3). Use LocalDateTime for any request field holding a time a person picked.
"""
from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator


def to_local_naive(value: Optional[datetime]) -> Optional[datetime]:
    """A time with a timezone (e.g. "...Z") -> the same moment in local time, without the timezone. Times sent without
    a timezone are already local and are kept as they are."""
    if value is not None and value.tzinfo is not None:
        return value.astimezone().replace(tzinfo=None)
    return value


LocalDateTime = Annotated[datetime, AfterValidator(to_local_naive)]
