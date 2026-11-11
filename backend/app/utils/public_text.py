"""
Text that neighbours will read must not carry anyone's contact details or exact address.

A Community notice (what the owner wrote, the Leader's message, a sighting's words and place name, a Leader's review
note) is read by every resident of the subdivision. The Resident and Leader screens check this while the person types
(frontend/src/resident/lib/publicText.ts), but a screen is a courtesy: the SERVER applies the same rule to everything
that is stored for neighbours to read, and masks what older rows still carry when it is shown.

  public_text_problem(text)   the reason the text breaks the rule, or None
  require_public_text(...)    the cleaned text, or a 400 with that reason (use on everything a person submits)
  redact_public_text(text)    the text with phone numbers, e-mail addresses and house/lot numbers masked (use when showing)

Private fields (the care note of a possible-recovery report, which only the owner and the Leader read) are not public text.
"""
import re
from typing import Optional

from fastapi import HTTPException

# The same patterns as frontend/src/preview/lib/format.ts, plus a landline written with separators (02 8123 4567).
PHONE_PATTERN = re.compile(r"(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}")
LANDLINE_PATTERN = re.compile(r"(?<!\d)0?\d{1,2}[\s-]\d{3,4}[\s-]\d{4}(?!\d)")
EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
EXACT_ADDRESS_PATTERN = re.compile(r"\b(?:lot|lt\.?)\s*\d+|\bblk\.?\s*\d+\s*(?:,|\s)\s*(?:lot|lt)", re.IGNORECASE)

MASK = "[removed]"


def public_text_problem(text: Optional[str]) -> Optional[str]:
    """A plain-language reason when the text breaks the rule, else None."""
    if not text:
        return None
    if PHONE_PATTERN.search(text) or LANDLINE_PATTERN.search(text):
        return "Please remove phone numbers. Neighbours reach the owner through the subdivision."
    if EMAIL_PATTERN.search(text):
        return "Please remove email addresses. Neighbours reach the owner through the subdivision."
    if EXACT_ADDRESS_PATTERN.search(text):
        return "Please remove house or lot numbers. Describe the general area instead, such as \"near the clubhouse\"."
    return None


def require_public_text(text: Optional[str], what: str, limit: Optional[int] = None) -> Optional[str]:
    """The stripped text (None when empty), or a 400 naming the field and the reason."""
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    if limit is not None and len(cleaned) > limit:
        raise HTTPException(status_code=400, detail=f"{what} is too long (at most {limit} characters).")
    problem = public_text_problem(cleaned)
    if problem:
        raise HTTPException(status_code=400, detail=f"{what}: {problem}")
    return cleaned


def redact_public_text(text: Optional[str]) -> Optional[str]:
    """What neighbours may be shown of a stored text: contact details and exact addresses masked (older rows may carry them)."""
    if not text:
        return text
    out = PHONE_PATTERN.sub(MASK, text)
    out = LANDLINE_PATTERN.sub(MASK, out)
    out = EMAIL_PATTERN.sub(MASK, out)
    return EXACT_ADDRESS_PATTERN.sub(MASK, out)
