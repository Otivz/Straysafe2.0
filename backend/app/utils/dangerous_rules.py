"""
Specialized rules and helpers for the Dangerous Animal Reporting Workflow (category family: 'safety').

Handles behavior classification formatting/parsing, backend-authoritative safety risk
prioritization, clinical/safety assessment summaries, and dangerous incident closure outcomes.
"""
import re
from typing import Any, Dict, List, Optional, Tuple

DANGEROUS_BEHAVIORS = (
    "Aggressive or threatening behavior",
    "Attempted bite or attack",
    "Actual bite incident",
    "Chasing or attacking people",
    "Attacking other animals",
    "Suspected rabies symptoms",
    "Dangerous roaming animal",
    "Repeated aggressive behavior",
    "Other dangerous behavior",
)

CURRENT_DANGER_OPTIONS = (
    "Yes, currently aggressive",
    "Previously aggressive but currently calm",
    "Not sure",
)

STILL_IN_LOCATION_OPTIONS = ("Yes", "No", "Not sure")

RABIES_SYMPTOMS = (
    "Unusual aggression",
    "Excessive drooling or foaming",
    "Unusual or disoriented behavior",
    "Difficulty swallowing",
    "Unprovoked biting or attacking",
    "Other unusual behavior",
)

DANGEROUS_CLOSURE_OUTCOMES = (
    "Animal No Longer Present",
    "Animal Behavior No Longer Threatening",
    "Retrieved or Handled by Authorized Personnel",
    "Referred to Appropriate Authorities",
    "Owner Identified and Contacted",
    "Under Continued Monitoring",
    "Other",
)

_BEHAVIORS_RE = re.compile(r"^Behaviors:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_CURRENT_DANGER_RE = re.compile(r"^Currently aggressive\?:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_STILL_THERE_RE = re.compile(r"^Still in location\?:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


def format_dangerous_condition(
    behaviors: Optional[List[str]] = None,
    other_detail: Optional[str] = None,
    current_danger: Optional[str] = None,
    still_in_location: Optional[str] = None,
    bite_details: Optional[Dict[str, Any]] = None,
    rabies_symptoms: Optional[List[str]] = None,
    movement_direction: Optional[str] = None,
    fallback_condition: Optional[str] = None,
) -> Optional[str]:
    """Format resident-reported dangerous animal details into Report.condition."""
    lines: List[str] = []
    cleaned_behaviors = [b.strip() for b in (behaviors or []) if b and b.strip()]
    if cleaned_behaviors:
        lines.append(f"Behaviors: {', '.join(cleaned_behaviors)}")
    if (other_detail or "").strip():
        lines.append(f"Other behavior: {(other_detail or '').strip()}")
    if (current_danger or "").strip():
        lines.append(f"Currently aggressive?: {(current_danger or '').strip()}")
    if (still_in_location or "").strip():
        lines.append(f"Still in location?: {(still_in_location or '').strip()}")
    if (movement_direction or "").strip():
        lines.append(f"Movement / last direction: {(movement_direction or '').strip()}")

    if bite_details and isinstance(bite_details, dict):
        b_parts: List[str] = []
        if bite_details.get("person_bitten"):
            b_parts.append(f"Person bitten={bite_details['person_bitten']}")
        if bite_details.get("animal_bitten"):
            b_parts.append(f"Animal bitten={bite_details['animal_bitten']}")
        if bite_details.get("affected_count"):
            b_parts.append(f"Affected={bite_details['affected_count']}")
        if bite_details.get("incident_time"):
            b_parts.append(f"Time={bite_details['incident_time']}")
        if bite_details.get("incident_location"):
            b_parts.append(f"Location={bite_details['incident_location']}")
        if bite_details.get("still_nearby"):
            b_parts.append(f"Animal nearby={bite_details['still_nearby']}")
        if bite_details.get("what_happened"):
            b_parts.append(f"Details={str(bite_details['what_happened']).strip()}")
        if b_parts:
            lines.append(f"Bite incident: {'; '.join(b_parts)}")

    cleaned_rabies = [s.strip() for s in (rabies_symptoms or []) if s and s.strip()]
    if cleaned_rabies:
        lines.append(f"Suspected rabies signs: {', '.join(cleaned_rabies)}")

    if lines:
        return "\n".join(lines)
    fallback = (fallback_condition or "").strip()
    return fallback or None


def evaluate_dangerous_priority(
    behaviors: Optional[List[str]] = None,
    current_danger: Optional[str] = None,
    rabies_symptoms: Optional[List[str]] = None,
    condition_text: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Backend-authoritative safety risk prioritization for Dangerous Animal reports.
    Returns (priority: 'urgent' | 'high' | 'normal', reason: str).
    """
    b_list = [b.strip().lower() for b in (behaviors or []) if b and b.strip()]
    if not b_list and condition_text:
        m = _BEHAVIORS_RE.search(condition_text)
        if m:
            b_list = [x.strip().lower() for x in m.group(1).split(",") if x.strip()]

    danger_val = (current_danger or "").strip().lower()
    if not danger_val and condition_text:
        m = _CURRENT_DANGER_RE.search(condition_text)
        if m:
            danger_val = m.group(1).strip().lower()

    r_list = [r.strip().lower() for r in (rabies_symptoms or []) if r and r.strip()]

    has_actual_bite = any("actual bite" in b for b in b_list)
    has_attempted_bite = any("attempted bite" in b or "attempted attack" in b for b in b_list)
    has_chasing_people = any("chasing or attacking people" in b for b in b_list)
    has_rabies = any("suspected rabies" in b for b in b_list)
    is_currently_active = danger_val == "yes, currently aggressive"
    has_active_rabies_signs = any(
        "unprovoked biting" in r or "unusual aggression" in r for r in r_list
    )

    if has_actual_bite:
        return "urgent", "Automatic safety priority (Urgent): Actual bite incident reported."
    if has_attempted_bite:
        return "urgent", "Automatic safety priority (Urgent): Attempted bite or attack reported."
    if has_chasing_people:
        return "urgent", "Automatic safety priority (Urgent): Animal chasing or attacking people."
    if has_rabies and (is_currently_active or has_active_rabies_signs):
        return "urgent", "Automatic safety priority (Urgent): Suspected rabies symptoms with active dangerous behavior."

    has_aggressive = any("aggressive or threatening" in b for b in b_list)
    has_roaming = any("dangerous roaming" in b for b in b_list)
    has_repeated = any("repeated aggressive" in b for b in b_list)
    has_attacking_animals = any("attacking other animals" in b for b in b_list)

    if has_aggressive or has_roaming or has_repeated or has_attacking_animals or has_rabies:
        if danger_val == "previously aggressive but currently calm" and not (has_roaming or has_repeated or has_attacking_animals):
            return "normal", "Automatic safety priority (Moderate): Previously aggressive, currently calm."
        return "high", "Automatic safety priority (High): Aggressive, repeated threatening, or dangerous roaming behavior reported."

    return "normal", "Standard safety review priority based on reported details."


def format_dangerous_assessment_summary(data: Dict[str, Any]) -> str:
    """Format the leader's dangerous animal safety assessment fields into readable summary lines."""
    labels = [
        ("aggressive_severity", "Aggressive severity"),
        ("attack_or_bite_occurred", "Attack/bite occurred"),
        ("people_threatened", "People threatened"),
        ("animals_threatened", "Animals threatened"),
        ("still_in_area", "Still in area"),
        ("threat_ongoing", "Threat ongoing"),
        ("rabies_signs_reported", "Suspected rabies signs"),
        ("security_required", "Security assistance required"),
    ]
    parts = []
    for key, label in labels:
        val = (data.get(key) or "").strip()
        if val:
            parts.append(f"{label}: {val}")
    return "; ".join(parts)
