"""What the Subdivision Leader sends to record complaint findings, offenses and enforcement steps (routes/complaints.py)."""
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

EvidenceId = Literal["registry", "photos", "markings", "cctv", "firsthand", "interactions", "statement", "vet"]


class VerifyIn(BaseModel):
    """Did it happen (the case's incident verification), and which confirmed rule it broke (or that none applies)."""
    incident: Literal["verified", "unverified", "not_reviewed"]
    basis: str = Field(..., min_length=5, max_length=2000)
    policy_id: Optional[str] = Field(None, max_length=60)
    no_rule: bool = False


class RuledOutIn(BaseModel):
    """A lead the Leader checked and ruled out, with an optional reason. Kept, and not suggested again for this complaint."""
    key: str = Field(..., pattern=r"^(user|household|pet):\d+$")
    label: str = Field(..., min_length=1, max_length=150)
    reason: Optional[str] = Field(None, max_length=300)


class ResponsibleIn(BaseModel):
    """
    Who is responsible, as the Leader confirmed it with evidence:
      user       a resident with a StraySafe account (user_id)
      household  a household already on record (respondent_id)
      new        a household not in StraySafe yet (name and house address)
      none       not identified yet: what was checked so far (check_note) and the leads ruled out are saved, nothing counts
    A change after an offense was confirmed is a correction: correction_reason is required, the offense is voided (kept, no longer
    counted) and a closed complaint reopens.
    """
    mode: Literal["user", "household", "new", "none"]
    user_id: Optional[int] = None
    respondent_id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=150)
    address: Optional[str] = Field(None, max_length=255)
    evidence: List[EvidenceId] = Field(default_factory=list, max_length=8)
    note: Optional[str] = Field(None, max_length=2000)
    check_note: Optional[str] = Field(None, max_length=2000)
    ruled_out: List[RuledOutIn] = Field(default_factory=list, max_length=20)
    correction_reason: Optional[str] = Field(None, max_length=2000)


class OffenseIn(BaseModel):
    """Confirm the suggested offense number (expected_number must still be StraySafe's suggestion), or record why it does not count."""
    decision: Literal["counted", "not_counted"]
    expected_number: Optional[int] = Field(None, ge=1, le=99)
    reason: Optional[str] = Field(None, max_length=2000)


class SameOccurrenceIn(BaseModel):
    """Is this complaint the same occurrence as an earlier one (linked and counted once), or a separate incident?"""
    other_report_id: int
    decision: Literal["same", "separate"]
    note: Optional[str] = Field(None, max_length=1000)


class Attendance(BaseModel):
    complainant: bool = False
    respondent: bool = False
    leader: bool = False


class StepActionIn(BaseModel):
    """
    One thing that happened on an enforcement step. Which fields are needed depends on the action:
      prepare    letter_date (and, for the second letter, summons_at and place)          a letter
      issue      via (who delivers it)                                                  a letter
      deliver    delivered, occurred_at, received_by + proof, or reason (+ note)        a letter
      attendance result (attended / absent / asked_new_date), note                     the summons
      reschedule at, place, told (how they were told)                                   the summons
      impose     imposed_on, told, note                                                 the fine (the amount comes from the rule)
      pay        paid_on, received_by, note                                             the fine
      arrange    contact, at, place, complainant_agreed                                 the Barangay meeting
      meeting    held, attendance, outcome                                              the Barangay meeting
    """
    action: Literal["prepare", "issue", "deliver", "attendance", "reschedule", "impose", "pay", "arrange", "meeting"]
    letter_date: Optional[date] = None
    summons_at: Optional[datetime] = None
    place: Optional[str] = Field(None, max_length=255)
    via: Optional[str] = Field(None, max_length=150)
    delivered: Optional[bool] = None
    occurred_at: Optional[datetime] = None
    received_by: Optional[str] = Field(None, max_length=150)
    proof: Optional[Literal["signed", "refused_to_sign", "other"]] = None
    reason: Optional[Literal["nobody_home", "refused", "wrong_address", "other"]] = None
    note: Optional[str] = Field(None, max_length=2000)
    result: Optional[Literal["attended", "absent", "asked_new_date"]] = None
    at: Optional[datetime] = None
    told: Optional[str] = Field(None, max_length=200)
    imposed_on: Optional[date] = None
    paid_on: Optional[date] = None
    contact: Optional[str] = Field(None, max_length=150)
    complainant_agreed: Optional[bool] = None
    held: Optional[bool] = None
    attendance: Optional[Attendance] = None
    outcome: Optional[str] = Field(None, max_length=2000)
    client_request_id: Optional[str] = Field(None, max_length=64)

    @field_validator("place", "via", "received_by", "note", "told", "contact", "outcome")
    @classmethod
    def _trimmed(cls, v):
        return v.strip() if isinstance(v, str) else v
