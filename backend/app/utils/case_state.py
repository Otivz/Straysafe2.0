"""
Read a report's case state, whichever way it was written.

A report carries two generations of state side by side: the legacy status ladder and verification_status, and the case
columns added for the Subdivision Admin workflow. Every column of the new generation may be empty (an older row, or a
row written by an older code path); these functions give the answer either way, so no caller has to know which.
Pure functions over a report-like object: no database access.
"""
from typing import Any, Dict, Optional

from app.utils import case_vocab as V


def case_status_of(report: Any) -> str:
    stored = getattr(report, "case_status", None)
    return stored if stored in V.CASE_STATUSES else V.case_status_from_legacy(getattr(report, "current_status_id", None))


def is_closed(report: Any) -> bool:
    return case_status_of(report) == V.CLOSED


def advance_status(report: Any, minimum: str) -> bool:
    """
    Recording work on a case moves it forward to at least `minimum`: never backward, never out of Closed. Writing
    case_status is enough, the status sync hook writes the matching legacy status. Returns True if it moved.
    """
    current = case_status_of(report)
    if current == V.CLOSED or V.STATUS_RANK[current] >= V.STATUS_RANK[minimum]:
        return False
    report.case_status = minimum
    return True


def incident_of(report: Any) -> str:
    stored = getattr(report, "incident_verification", None)
    return stored if stored in V.INCIDENT_VERIFICATION else V.incident_from_legacy(getattr(report, "verification_status", None))


def incident_is_verified(report: Any) -> bool:
    return incident_of(report) == "verified"


def identity_of(report: Any) -> str:
    stored = getattr(report, "identity_status", None)
    if stored in V.IDENTITY_STATUSES:
        return stored
    return identity_from_links(report)


def identity_from_links(report: Any) -> str:
    """What the pet link on the report says: a link nobody has re-checked is a possible match, not an identification."""
    if getattr(report, "pet_id", None) is None:
        return "unidentified"
    inherited = getattr(report, "pet_inherited_from_match_id", None) is not None
    return "possible_match" if inherited and getattr(report, "identity_rechecked_at", None) is None else "identified"


def ownership_of(report: Any) -> str:
    stored = getattr(report, "ownership_status", None)
    return stored if stored in V.OWNERSHIP_STATUSES else "unknown"


def urgency_of(report: Any) -> str:
    stored = getattr(report, "urgency_level", None)
    return stored if stored in V.URGENCY_LEVELS else "not_assessed"


def sufficiency_of(report: Any) -> str:
    stored = getattr(report, "evidence_sufficiency", None)
    return stored if stored in V.EVIDENCE_SUFFICIENCY else "not_assessed"


def priority_of(report: Any) -> str:
    return V.priority_of(getattr(report, "priority_level", None), getattr(report, "urgency_level", None))


def closure_of(report: Any) -> Optional[Dict[str, Any]]:
    """The closure as the Admin UI shows it, or None while the case is open. A legacy closure is read, not invented."""
    if not is_closed(report):
        return None
    disposition, derived = V.effective_disposition(getattr(report, "closure_disposition", None),
                                                   getattr(report, "current_status_id", None))
    return {
        "disposition": disposition,
        "outcome": V.disposition_group(disposition),
        "label": V.DISPOSITIONS[disposition][2] if disposition in V.DISPOSITIONS else None,
        "reason": getattr(report, "closure_reason", None),
        "closed_at": getattr(report, "closed_at", None),
        "closed_by": getattr(report, "closed_by", None),
        "derived_from_legacy_status": derived,
    }
