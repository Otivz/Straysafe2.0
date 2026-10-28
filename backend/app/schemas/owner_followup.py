from typing import Literal, Optional

from pydantic import BaseModel, Field


class OwnerFollowUpStart(BaseModel):
    """Start observing a report. The owner is the report's registered pet's owner (no owner typed in)."""
    report_id: int


class OwnerFollowUpContactCreate(BaseModel):
    """A log entry by the leader. "Owner update" entries come from the owner's own endpoint."""
    method: Literal["Phone", "In person", "In-app", "Repeated incident"]
    note: str = Field(min_length=3, max_length=1000)
    related_report_id: Optional[int] = None   # for a repeated incident


class OwnerFollowUpAcknowledge(BaseModel):
    """The owner acknowledges in the app; the leader logs a phone acknowledgement (note required then)."""
    note: Optional[str] = Field(default=None, max_length=1000)


class OwnerFollowUpExtend(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


class OwnerFollowUpClose(BaseModel):
    """
    owner_complied    -> report 11 (Incident Resolved), follow-up "Owner Complied"
    incident_resolved -> report 11, follow-up "Closed by Leader"
    false_alarm       -> report 14, follow-up "Closed by Leader"
    Escalation is not here: it uses the existing escalation on the report page, and the follow-up ends by itself.
    """
    outcome: Literal["owner_complied", "incident_resolved", "false_alarm"]
    reason: str = Field(min_length=5, max_length=1000)


class OwnerFollowUpDays(BaseModel):
    days: int = Field(ge=1, le=14)
