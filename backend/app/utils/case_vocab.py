"""
Case vocabulary: the words, groups and rules the Subdivision Admin case workflow shares.

No database access here. The models, the lifecycle service, the routes and the migrations import these so that the
identifiers match the approved Admin UI (frontend/src/admin/data/constants.ts) one for one.

Workflow:  REPORT -> ASSESS -> COORDINATE -> MONITOR -> DOCUMENT OUTCOME -> CLOSE

Only four global statuses exist. Warnings, referrals, follow-ups, ownership claims and recovery are case DETAILS kept
in their own records, never extra statuses. The legacy 18-step status ladder (reports.current_status_id) is kept as is;
`case_status_from_legacy` is how every legacy value is read as one of the four.
"""
from typing import Dict, FrozenSet, Optional, Tuple

# --------------------------------------------------------------------------------------------- the four statuses
REPORTED, UNDER_REVIEW, IN_PROGRESS, CLOSED = "reported", "under_review", "in_progress", "closed"
CASE_STATUSES: Tuple[str, ...] = (REPORTED, UNDER_REVIEW, IN_PROGRESS, CLOSED)
STATUS_LABELS: Dict[str, str] = {
    REPORTED: "Reported", UNDER_REVIEW: "Under review", IN_PROGRESS: "In progress", CLOSED: "Closed",
}
STATUS_RANK: Dict[str, int] = {s: i for i, s in enumerate(CASE_STATUSES)}

# Lost-pet reports: the "Lost Pet" category (id 6 in the reference data) or a report filed through the lost-pet form
LOST_PET_CATEGORY_ID = 6
LOST_PET_MARKER = "[LOST PET REPORT]"


def is_lost_pet_report(report) -> bool:
    """An actual lost-pet report (category Lost Pet, or filed through the lost-pet form). A report merely linked to a
    registered pet, e.g. a roaming owned-pet complaint, is not one."""
    if report is None:
        return False
    return report.category_id == LOST_PET_CATEGORY_ID or LOST_PET_MARKER in (report.description or "")


# Legacy status ladder (report_status): 1 Reported, 2 Verified, 3 Rejected, 4 Referred to Barangay, 5 Rescue In
# Progress, 6 Picked Up, 7 Under Observation, 8 Impounded, 9 Claimed by Owner, 10 Released, 11 Incident Resolved,
# 12 Deceased, 13 Approved, 14 False Alarm / Dismissed, 15 Disputed, 16 Under Investigation, 17 Animal Cannot Be
# Found, 18 Merged - Duplicate.  (Same closed set as utils/case_closure.CLOSED_REPORT_STATUS_IDS; a test keeps both equal.)
CLOSED_LEGACY_IDS: FrozenSet[int] = frozenset({3, 9, 10, 11, 12, 14, 17, 18})
_UNDER_REVIEW_LEGACY: FrozenSet[int] = frozenset({2, 15, 16})
_IN_PROGRESS_LEGACY: FrozenSet[int] = frozenset({4, 5, 6, 7, 8, 13})
UNDER_REVIEW_LEGACY_IDS: FrozenSet[int] = _UNDER_REVIEW_LEGACY      # public names, for the SQL twin of case_status_from_legacy
IN_PROGRESS_LEGACY_IDS: FrozenSet[int] = _IN_PROGRESS_LEGACY
MERGED_LEGACY_ID = 18

# The legacy status written when the new workflow moves a case, so legacy screens and the central closure hook keep
# working. Closed cases use the disposition (below). A move that already reads as the target keeps its legacy status.
LEGACY_FOR_OPEN_STATUS: Dict[str, int] = {REPORTED: 1, UNDER_REVIEW: 2, IN_PROGRESS: 7}


def case_status_from_legacy(status_id: Optional[int]) -> str:
    if status_id is None:
        return REPORTED
    if status_id in CLOSED_LEGACY_IDS:
        return CLOSED
    if status_id in _IN_PROGRESS_LEGACY:
        return IN_PROGRESS
    if status_id in _UNDER_REVIEW_LEGACY:
        return UNDER_REVIEW
    return REPORTED


# Moves a person may make by hand. Closing and reopening have their own endpoints (a disposition / a reason is needed).
MANUAL_MOVES: Dict[str, FrozenSet[str]] = {
    REPORTED: frozenset({UNDER_REVIEW, IN_PROGRESS}),
    UNDER_REVIEW: frozenset({IN_PROGRESS}),
    IN_PROGRESS: frozenset({UNDER_REVIEW}),
    CLOSED: frozenset(),
}

# ------------------------------------------------------------------------------------------------ closure outcomes
# disposition -> (outcome group, legacy status written on closure, label)
DISPOSITIONS: Dict[str, Tuple[str, int, str]] = {
    "resolved_intervention": ("resolved", 11, "Concern resolved through intervention"),
    "owner_compliance": ("resolved", 11, "Owner compliance verified"),
    "pet_recovered": ("resolved", 9, "Missing pet recovered"),
    "handed_off": ("unresolved", 17, "Handed off, no remaining subdivision action"),
    "no_further_sightings": ("unresolved", 17, "No further sightings; monitoring ended"),
    "unresolved_other": ("unresolved", 17, "Closed without confirmed resolution"),
    "invalid_report": ("invalid", 14, "Report determined invalid"),
    "duplicate_report": ("invalid", 14, "Duplicate of another report"),
}
OUTCOME_GROUPS = ("resolved", "unresolved", "invalid")

# What a legacy closure (made before dispositions existed) is read as. Shown as derived, never written back.
LEGACY_DISPOSITION: Dict[int, str] = {
    3: "invalid_report", 9: "pet_recovered", 10: "resolved_intervention", 11: "resolved_intervention",
    12: "unresolved_other", 14: "invalid_report", 17: "no_further_sightings", 18: "duplicate_report",
}


def disposition_group(disposition: Optional[str]) -> Optional[str]:
    return DISPOSITIONS[disposition][0] if disposition in DISPOSITIONS else None


def effective_disposition(stored: Optional[str], legacy_status_id: Optional[int]) -> Tuple[Optional[str], bool]:
    """(disposition, derived). A stored disposition wins; a legacy closure is read from its legacy status."""
    if stored in DISPOSITIONS:
        return stored, False
    if legacy_status_id in CLOSED_LEGACY_IDS:
        return LEGACY_DISPOSITION.get(legacy_status_id), True
    return None, False


# --------------------------------------------------------------------------------------------------- categories
LOST_PET, FOUND_ANIMAL, NUISANCE, SAFETY, INJURED, OTHER_CONCERN = (
    "lost_pet", "found_animal", "nuisance", "safety", "injured", "other")
CATEGORY_FAMILIES: Dict[str, str] = {
    LOST_PET: "Lost Pet",
    FOUND_ANIMAL: "Found / Unidentified Animal",
    NUISANCE: "Animal Nuisance",
    SAFETY: "Animal Safety Concern",
    INJURED: "Injured / Distressed Animal",
    OTHER_CONCERN: "Other Animal Concern",
}
CATEGORY_DESCRIPTIONS: Dict[str, str] = {
    LOST_PET: "A resident's pet is missing.",
    FOUND_ANIMAL: "An animal with no known owner was found or sighted.",
    NUISANCE: "Repeated disturbance, roaming or noise from an animal.",
    SAFETY: "Aggressive animal, bite or another risk to residents.",
    INJURED: "An animal that appears hurt, trapped or in distress.",
    OTHER_CONCERN: "Any other animal-related concern.",
}
# Concerns that can involve an owner violation (the only ones an owner warning can be issued for)
VIOLATION_FAMILIES: FrozenSet[str] = frozenset({NUISANCE, SAFETY})
# Concerns about a neighbour: never published on their own, whatever the publication setting says
PRIVATE_BY_DEFAULT_FAMILIES: FrozenSet[str] = frozenset({NUISANCE, SAFETY})
# Older category rows keep working: each is read as one of the six
_LEGACY_CATEGORY_FAMILY: Dict[str, str] = {
    "injured": INJURED, "aggressive": SAFETY, "rabies risk": SAFETY, "roaming animal": NUISANCE,
    "rescue needed": INJURED, "lost pet": LOST_PET,
}
_FAMILY_BY_LOWER_NAME: Dict[str, str] = {v.lower(): k for k, v in CATEGORY_FAMILIES.items()}


def category_family(category_name: Optional[str]) -> str:
    key = (category_name or "").strip().lower()
    return _FAMILY_BY_LOWER_NAME.get(key) or _LEGACY_CATEGORY_FAMILY.get(key) or OTHER_CONCERN


# --------------------------------------------------------------------------------------------------- animal types
# Stored as these labels (reports.animal_type). 'Unknown' is the older value for "not known"; it reads as Other.
ANIMAL_TYPE_LABELS: Tuple[str, ...] = (
    "Dog", "Cat", "Unknown", "Bird", "Small mammal", "Reptile", "Livestock", "Wildlife", "Other")
_ANIMAL_ALIASES: Dict[str, str] = {
    "dog": "Dog", "canine": "Dog", "puppy": "Dog", "cat": "Cat", "feline": "Cat", "kitten": "Cat",
    "bird": "Bird", "small_mammal": "Small mammal", "small mammal": "Small mammal", "rabbit": "Small mammal",
    "reptile": "Reptile", "livestock": "Livestock", "wildlife": "Wildlife", "other": "Other", "unknown": "Unknown",
    "other / unknown": "Other",
}


def normalize_animal_type(value: Optional[str]) -> Optional[str]:
    """The stored label for an animal type given as an id ('small_mammal') or a label ('Small mammal'), else None."""
    key = (value or "").strip().lower()
    return _ANIMAL_ALIASES.get(key)


# ----------------------------------------------------------------------------------------------------- assessment
INCIDENT_VERIFICATION = ("not_reviewed", "verified", "partial", "unverified", "invalid")
EVIDENCE_SUFFICIENCY = ("not_assessed", "sufficient", "needs_more")
URGENCY_LEVELS = ("not_assessed", "immediate", "possible", "none")
IDENTITY_STATUSES = ("unidentified", "possible_match", "identified")
OWNERSHIP_STATUSES = ("unknown", "claimed", "under_review", "confirmed", "disputed", "unconfirmed")
# Evidence an administrator may rely on. Pet registration is owner-declared, so it can never be the only basis.
OWNERSHIP_EVIDENCE: Dict[str, bool] = {   # id -> weak
    "registry": True, "photos": False, "markings": False, "cctv": False, "firsthand": False,
    "interactions": False, "statement": False, "vet": False,
}
# legacy reports.verification_status -> incident verification
_LEGACY_VERIFICATION = {"verified_true": "verified", "false_alarm": "invalid"}


def incident_from_legacy(verification_status: Optional[str]) -> str:
    return _LEGACY_VERIFICATION.get(verification_status or "", "not_reviewed")


def legacy_verification_for(incident: str) -> str:
    """The legacy reports.verification_status that matches a new incident decision (legacy screens keep working)."""
    return {"verified": "verified_true", "invalid": "false_alarm"}.get(incident, "unverified")


# --------------------------------------------------------------------------------------------------------- priority
PRIORITIES = ("urgent", "high", "normal", "low")
_PRIORITY_FROM_LEVEL = {"High": "high", "Medium": "normal", "Low": "low"}
_LEVEL_FROM_PRIORITY = {"urgent": "High", "high": "High", "normal": "Medium", "low": "Low"}


def priority_of(priority_level: Optional[str], urgency_level: Optional[str]) -> str:
    """The UI priority. 'Urgent' is not a stored level: it is an assessed immediate risk on a High priority case."""
    if urgency_level == "immediate":
        return "urgent"
    return _PRIORITY_FROM_LEVEL.get(priority_level or "", "normal")


def level_for_priority(priority: str) -> str:
    return _LEVEL_FROM_PRIORITY[priority]


# ------------------------------------------------------------------------------------------------------ referrals
ORG_TYPES = ("barangay", "animal_control", "veterinary", "animal_welfare", "wildlife", "other")
REFERRAL_STATUSES = ("sent", "acknowledged", "in_progress", "completed", "declined", "no_response")
OPEN_REFERRAL_STATUSES: FrozenSet[str] = frozenset({"sent", "acknowledged", "in_progress", "no_response"})
REFERRAL_CONTACT_METHODS = ("call", "visit", "message", "letter", "other")
# approved-UI contact method -> stored contact_method
UI_CONTACT_TO_STORED = {"in_person": "visit", "phone": "call", "message": "message", "letter": "letter"}

# --------------------------------------------------------------------------------------- follow-ups, contacts, links
FOLLOWUP_KINDS = ("follow_up", "site_check", "reporter_update", "referral_check", "warning_end", "post_closure")
FOLLOWUP_STATUSES = ("pending", "done", "cancelled")
CONTACT_METHODS = ("in_person", "phone", "message", "letter")
CONTACT_OUTCOMES = ("cooperative", "denied_ownership", "no_response", "other")
LINK_TYPES = ("related", "duplicate", "same_animal", "same_incident")

# ------------------------------------------------------------------------------------ notices, sightings and claims
ALERT_TYPES = ("lost_pet", "found_animal")
CLAIM_STATUSES = ("submitted", "under_review", "needs_info", "accepted", "rejected", "withdrawn")
ACTIVE_CLAIM_STATUSES: FrozenSet[str] = frozenset({"submitted", "under_review", "needs_info"})
CLAIM_DECISIONS = ("under_review", "needs_info", "accepted", "rejected")
PUBLICATION_MODES = ("immediate", "review")
