from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class AlertScheduleIn(BaseModel):
    """When an alert goes out. Any interval and any times of day; every repeating alert must end (services/case_alerts.py)."""
    mode: Literal["now", "later", "repeat"]
    at: Optional[datetime] = None                                   # later: the one send
    repeat: Optional[Literal["every", "times"]] = None              # repeat: at an interval, or at set times each day
    every: Optional[int] = Field(None, ge=1, le=100000)
    unit: Optional[Literal["minutes", "hours", "days"]] = None
    times: Optional[List[str]] = Field(None, max_length=24)         # "HH:MM"
    start_at: Optional[datetime] = None                             # repeat: none = now
    until: Optional[Literal["resolved", "date", "count"]] = None
    until_at: Optional[datetime] = None
    count: Optional[int] = Field(None, ge=1, le=500)
    latest_end: Optional[datetime] = None                           # "until resolved": the latest end (default 14 days)


class AlertIn(BaseModel):
    # what a phone shows without cutting it short (the columns hold a little more)
    title: str = Field(..., min_length=1, max_length=60)
    message: str = Field(..., min_length=1, max_length=180)
    include_photo: bool = True
    destination: Literal["notice", "sighting", "claim", "inbox"] = "notice"
    audience: Literal["all", "helpers"] = "all"
    schedule: AlertScheduleIn
    client_request_id: Optional[str] = Field(None, max_length=64)
