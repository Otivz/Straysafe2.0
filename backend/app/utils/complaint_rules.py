"""
Complaint management and progressive enforcement: the rules (docs/01-system/COMPLAINT_MANAGEMENT.md).

A complaint is an ordinary case (a nuisance report). The Subdivision Leader records three findings on it: whether it happened (the
report's incident verification), which confirmed rule it broke, and who is responsible (with evidence). Only then can it count:

  offense number = 1 + the person's earlier counted offenses under the SAME rule (by when they happened, inside the rule's optional
  counting window). Unverified complaints, a different rule, a complainant's mere suggestion and a second report of the same
  occurrence never count. StraySafe suggests the number; the Leader confirms it, or records why it does not count.

What each offense requires comes from the subdivision's policy: 1st a warning letter; 2nd a second letter and a summons to the
subdivision office; 3rd a fine and a meeting at the Barangay. Nothing is defined beyond the 3rd (an open question for the
subdivision), so a 4th offense has no steps until the subdivision decides.

Leads and "same occurrence?" are suggestions only: a name, an address or a look-alike is never proof, and the Leader decides.
"""
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.complaint import ComplaintFinding, ComplaintOffense, ComplaintRespondent, EnforcementStep
from app.models.report import Report
from app.utils import case_vocab as V

SUSPECT_FIELDS = ("suspected_owner_name", "suspected_owner_address", "suspected_owner_details")
MAX_FUTURE = timedelta(minutes=10)

# ------------------------------------------------------------------------------------------------ the policy's steps
LETTER_1, LETTER_2, SUMMONS, FINE, MEETING = "letter_1", "letter_2", "summons", "fine", "meeting"
STEP_KINDS = (LETTER_1, LETTER_2, SUMMONS, FINE, MEETING)
STAGE_STEPS: Dict[int, Tuple[str, ...]] = {1: (LETTER_1,), 2: (LETTER_2, SUMMONS), 3: (FINE, MEETING)}
STEP_LABELS = {LETTER_1: "First warning letter", LETTER_2: "Second warning letter", SUMMONS: "Summons to the subdivision office",
               FINE: "Fine", MEETING: "Meeting at the Barangay"}
# Where each step starts
INITIAL_STATE = {LETTER_1: "to_prepare", LETTER_2: "to_prepare", SUMMONS: "waiting", FINE: "to_impose", MEETING: "to_arrange"}
# What a step's state may become, by action (validated in services/complaints.py)
LETTER_STATES = ("to_prepare", "prepared", "issued", "delivered", "not_delivered")
SUMMONS_STATES = ("waiting", "scheduled", "attended", "absent", "asked_new_date")
FINE_STATES = ("to_impose", "imposed", "paid")
MEETING_STATES = ("to_arrange", "arranged", "held", "not_held")
DONE_STATES = {"delivered", "attended", "paid", "held"}

DELIVERY_PROOF = {"signed": "Signed the receiving copy", "refused_to_sign": "Handed over in person; would not sign", "other": "Other"}
NOT_DELIVERED = {"nobody_home": "Nobody home", "refused": "Refused to accept it", "wrong_address": "Address wrong or unclear", "other": "Other"}
ATTENDANCE = {"attended": "Attended", "absent": "Did not attend", "asked_new_date": "Asked for another date"}

# Incident verification, in the complaint's words (the stored values are the case's own, utils/case_vocab.py)
VERIFY_CHOICES = ("verified", "unverified", "not_reviewed")

# "Same occurrence?" is only a suggestion: two animal complaints seen this close in time and place (the Leader decides)
SAME_OCCURRENCE_HOURS = 6
NEARBY_METERS = 150


def now_local() -> datetime:
    """The server's wall clock, as the rest of the case code stores times (naive local time)."""
    return datetime.now()


def clean_seen_at(value: Optional[datetime]) -> Optional[datetime]:
    """When the resident saw it (their local time, as the form sends it). Not in the future."""
    if value is None:
        return None
    naive = value.replace(tzinfo=None)
    local_now = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)
    if naive > local_now + MAX_FUTURE:
        raise HTTPException(status_code=400, detail="When you saw it can't be in the future.")
    return naive


def not_future(value: Optional[datetime], what: str) -> datetime:
    """A time the Leader records for something that already happened (a delivery, a payment): now when not given, never ahead."""
    if value is None:
        return now_local()
    naive = value.replace(tzinfo=None)
    if naive > now_local() + MAX_FUTURE:
        raise HTTPException(status_code=422, detail=f"{what} can't be in the future.")
    return naive


def incident_at(report: Report) -> datetime:
    """When the incident happened: when the resident saw it, else when the report was filed."""
    return report.seen_at or report.created_at or now_local()


def is_complaint(report: Report) -> bool:
    from app.utils.warning_rules import report_family
    return report_family(report) == V.NUISANCE


def require_complaint(report: Report) -> None:
    if not is_complaint(report):
        raise HTTPException(status_code=409, detail="This is not an animal complaint. Complaint management applies to animal complaints only.")


# ------------------------------------------------------------------------------------------------- counting
def active_offense(db: Session, report_id: int) -> Optional[ComplaintOffense]:
    """The Leader's current decision on this complaint (counted or not), or None. Voided decisions are history."""
    return (db.query(ComplaintOffense).filter(ComplaintOffense.report_id == report_id, ComplaintOffense.voided_at.is_(None))
            .order_by(ComplaintOffense.offense_id.desc()).first())


def counted_offenses(db: Session, respondent_id: int, policy_id: str) -> List[ComplaintOffense]:
    """Every counted, not voided offense of this person under this rule, in the order they happened."""
    return (db.query(ComplaintOffense).filter(ComplaintOffense.respondent_id == respondent_id, ComplaintOffense.policy_id == policy_id,
                                              ComplaintOffense.counted.is_(True), ComplaintOffense.voided_at.is_(None))
            .order_by(ComplaintOffense.incident_at, ComplaintOffense.offense_id).all())


def counted_before(db: Session, respondent_id: int, policy_id: str, when: datetime, window_days: Optional[int],
                   exclude_report_id: Optional[int] = None) -> List[ComplaintOffense]:
    """The counted offenses that came before this incident (inside the rule's counting window, when it has one)."""
    out = []
    for o in counted_offenses(db, respondent_id, policy_id):
        if exclude_report_id is not None and o.report_id == exclude_report_id:
            continue
        if o.incident_at >= when:
            continue
        if window_days and o.incident_at < when - timedelta(days=window_days):
            continue
        out.append(o)
    return out


def suggest_number(db: Session, report: Report, respondent_id: int, policy_id: str, window_days: Optional[int]) -> int:
    return len(counted_before(db, respondent_id, policy_id, incident_at(report), window_days, report.report_id)) + 1


def steps_for(number: int) -> Tuple[str, ...]:
    return STAGE_STEPS.get(number, ())


# ------------------------------------------------------------------------------------------- place and text helpers
_STREET = re.compile(r"\b([A-Za-z][A-Za-z\-']+)\s+(?:st\.?|street|ave\.?|avenue|rd\.?|road|dr\.?|drive|lane|ln\.?)(?![A-Za-z])", re.I)
_BLOCK_LOT = re.compile(r"\b(?:block|blk)\.?\s*(\d+)\s*,?\s*(?:lot|lt)\.?\s*(\d+)\b", re.I)
_HONORIFIC = re.compile(r"\b(?:mr|mrs|ms|miss|mx|sir|madam|maam|ma'am|kuya|ate|tito|tita|aling|mang|the|family|of)\b\.?", re.I)
COLOUR_WORDS = ("black", "white", "brown", "grey", "gray", "golden", "gold", "orange", "cream", "tan", "beige", "yellow", "red",
                "spotted", "brindle", "tricolor", "calico", "tabby", "chocolate", "fawn", "silver")
SIZE_WORDS = {"small": "Small", "tiny": "Small", "medium": "Medium", "large": "Large", "big": "Large"}


def street_of(text: Optional[str]) -> Optional[str]:
    m = _STREET.search(text or "")
    return m.group(1).lower() if m else None


def block_lot(text: Optional[str]) -> Optional[str]:
    m = _BLOCK_LOT.search(text or "")
    return f"Block {int(m.group(1))} Lot {int(m.group(2))}" if m else None


def name_tokens(text: Optional[str]) -> List[str]:
    cleaned = _HONORIFIC.sub(" ", re.sub(r"\(.*?\)", " ", text or ""))
    return [t for t in re.findall(r"[A-Za-z][A-Za-z\-']+", cleaned.lower()) if len(t) >= 3]


def colours_in(text: Optional[str]) -> List[str]:
    low = (text or "").lower()
    return [w for w in COLOUR_WORDS if re.search(rf"\b{w}\b", low)]


def size_in(text: Optional[str]) -> Optional[str]:
    low = (text or "").lower()
    for word, size in SIZE_WORDS.items():
        if re.search(rf"\b{word}\b", low):
            return size
    return None


def meters_between(a: Report, b: Report) -> Optional[float]:
    if None in (a.latitude, a.longitude, b.latitude, b.longitude):
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, (float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude)))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6_371_000 * 2 * math.asin(min(1.0, math.sqrt(h)))


def same_place(a: Report, b: Report) -> bool:
    """Within NEARBY_METERS when both are pinned; otherwise the same street named in their place descriptions."""
    d = meters_between(a, b)
    if d is not None:
        return d <= NEARBY_METERS
    sa, sb = street_of(a.landmark), street_of(b.landmark)
    return bool(sa and sa == sb)


# -------------------------------------------------------------------------------------------- same occurrence?
def same_occurrence_candidate(report: Report, others: Sequence[Report], linked_ids: Iterable[int],
                              separate_from: Optional[int]) -> Optional[Report]:
    """
    An earlier animal complaint that may describe the same occurrence as this one: seen within SAME_OCCURRENCE_HOURS and at the same
    place, not already linked to it and not already judged a separate incident. Only the later complaint asks; the Leader decides.
    """
    linked = set(linked_ids)
    when = incident_at(report)
    best: Optional[Tuple[float, Report]] = None
    for other in others:
        if other.report_id == report.report_id or other.report_id in linked or other.report_id == separate_from:
            continue
        if (other.created_at or when) > (report.created_at or when):
            continue                      # the later complaint asks about the earlier one, never the other way
        gap = abs((incident_at(other) - when).total_seconds())
        if gap > SAME_OCCURRENCE_HOURS * 3600 or not same_place(report, other):
            continue
        if best is None or gap < best[0]:
            best = (gap, other)
    return best[1] if best else None


# ---------------------------------------------------------------------------------------------------- respondents
def respondent_view(r: ComplaintRespondent, user: Any = None) -> Dict[str, Any]:
    """A person responsible: the account's current name and address when there is one, else the household as recorded."""
    name = (getattr(user, "name", None) or r.name) if user is not None else r.name
    address = (getattr(user, "address", None) or r.address) if user is not None else r.address
    return {"respondent_id": r.respondent_id, "user_id": r.user_id, "name": name, "address": address, "has_account": r.user_id is not None}


def finding_of(db: Session, report: Report, create: bool = False) -> Optional[ComplaintFinding]:
    row = db.get(ComplaintFinding, report.report_id)
    if row is None and create:
        row = ComplaintFinding(report_id=report.report_id, subdivision_id=report.subdivision_id, no_rule=False)
        db.add(row)
        db.flush()
    return row


def step_rows(db: Session, offense_id: int) -> List[EnforcementStep]:
    order = {k: i for i, k in enumerate(STEP_KINDS)}
    rows = db.query(EnforcementStep).filter(EnforcementStep.offense_id == offense_id).all()
    return sorted(rows, key=lambda s: order.get(s.kind, 99))
