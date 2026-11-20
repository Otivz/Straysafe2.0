"""
Specialized rules and helpers for the Injured / Sick Animal Reporting Workflow.

Keeps condition parsing, automatic urgent priority evaluation (can_move == "No"),
leader assessment formatting, and welfare closure outcomes in one place without
requiring database schema migrations.
"""
import re
from typing import Any, Dict, List, Optional

INJURED_CONDITIONS = (
    "Injury or bleeding",
    "Visible illness",
    "Weakness or difficulty standing",
    "Difficulty walking or moving",
    "Unable to move",
    "Trapped or stuck",
    "Appears abandoned or neglected",
    "Other observable condition",
)

MOBILITY_OPTIONS = ("Yes", "A little", "No", "Not sure")

WELFARE_OUTCOMES = (
    "Treated and Released",
    "Retrieved by Owner",
    "Transferred to Veterinary Clinic",
    "Transferred to Animal Shelter / Barangay",
    "Under Continued Monitoring",
    "Deceased / Humanely Handled",
    "Other",
)

AUTO_URGENT_REASON = "Automatic urgent priority: Reported injured/sick animal is unable to move."

_CAN_MOVE_RE = re.compile(r"^Can the animal move\?:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_CONDITIONS_RE = re.compile(r"^Conditions:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_OTHER_RE = re.compile(r"^Other condition:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


def format_injured_condition(
    conditions: Optional[List[str]] = None,
    other_detail: Optional[str] = None,
    can_move: Optional[str] = None,
    fallback_condition: Optional[str] = None,
) -> Optional[str]:
    """Format resident-reported injured/sick conditions and mobility into Report.condition."""
    lines: List[str] = []
    cleaned_conditions = [c.strip() for c in (conditions or []) if c and c.strip()]
    if cleaned_conditions:
        lines.append(f"Conditions: {', '.join(cleaned_conditions)}")
    other = (other_detail or "").strip()
    if other:
        lines.append(f"Other condition: {other}")
    move = (can_move or "").strip()
    if move:
        lines.append(f"Can the animal move?: {move}")
    if lines:
        return "\n".join(lines)
    fallback = (fallback_condition or "").strip()
    return fallback or None


def parse_injured_condition(condition_text: Optional[str]) -> Dict[str, Any]:
    """Extract structured condition tags, other detail, and mobility response from Report.condition."""
    text = (condition_text or "").strip()
    if not text:
        return {"conditions": [], "other_detail": None, "can_move": None}

    cond_match = _CONDITIONS_RE.search(text)
    conditions = (
        [part.strip() for part in cond_match.group(1).split(",") if part.strip()]
        if cond_match
        else []
    )
    other_match = _OTHER_RE.search(text)
    other_detail = other_match.group(1).strip() if other_match else None

    move_match = _CAN_MOVE_RE.search(text)
    can_move = move_match.group(1).strip() if move_match else None
    return {
        "conditions": conditions,
        "other_detail": other_detail,
        "can_move": can_move,
    }


def extract_can_move(can_move: Optional[str] = None, condition_text: Optional[str] = None) -> Optional[str]:
    """Return the normalized mobility answer if present."""
    direct = (can_move or "").strip()
    if direct:
        return direct
    return parse_injured_condition(condition_text).get("can_move")


def is_unable_to_move(can_move: Optional[str] = None, condition_text: Optional[str] = None) -> bool:
    """Primary Business Rule: injured animal with mobility response == 'No' triggers automatic urgent priority."""
    val = extract_can_move(can_move=can_move, condition_text=condition_text)
    return bool(val and val.strip().lower() == "no")


def format_injured_assessment_summary(data: Dict[str, Any]) -> str:
    """Format the leader's clinical/welfare assessment fields into readable summary lines."""
    labels = [
        ("injury_severity", "Injury severity"),
        ("bleeding", "Bleeding"),
        ("illness_signs", "Signs of illness"),
        ("weakness", "Physical weakness"),
        ("mobility", "Mobility condition"),
        ("trapped", "Trapped / stuck"),
        ("neglect_suspected", "Neglect / abandonment"),
    ]
    parts = []
    for key, label in labels:
        val = (data.get(key) or "").strip()
        if val:
            parts.append(f"{label}: {val}")
    return "; ".join(parts)
