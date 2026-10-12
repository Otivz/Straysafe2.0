"""
Philippine phone number validation, used by every schema that accepts a phone number as input.

Accepted (spaces, dashes, dots and brackets are ignored):
- mobile:   09XX XXX XXXX, +63 9XX XXX XXXX, 63 9XX..., 9XX XXX XXXX  -> stored as 09XXXXXXXXX
- landline: (0XX) XXX-XXXX or 02 XXXX XXXX, +63 area + number      -> stored as 0 + area + number
Response schemas never re-validate: numbers saved before this rule must not break the pages that show them.
"""
import re
from typing import Optional

PHONE_HELP = "Enter a valid Philippine number, e.g. 0917 123 4567 (mobile) or (044) 815 1234 (landline)."

_STRIP = re.compile(r"[\s\-().]")
_MOBILE = re.compile(r"^09\d{9}$")
_LANDLINE = re.compile(r"^0[2-8]\d{7,9}$")  # 0 + area code (1-2 digits, not 9) + 7-8 digit number


def normalize_ph_phone(value: Optional[str], *, required: bool = False, mobile_only: bool = False) -> Optional[str]:
    """The number in its stored form, or None when empty and optional. Raises ValueError with PHONE_HELP otherwise."""
    raw = (value or "").strip()
    if not raw:
        if required:
            raise ValueError("A phone number is required. " + PHONE_HELP)
        return None
    digits = _STRIP.sub("", raw)
    if digits.startswith("+"):
        digits = digits[1:]
    if not digits.isdigit():
        raise ValueError(PHONE_HELP)
    if digits.startswith("63"):
        digits = "0" + digits[2:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    if _MOBILE.match(digits):
        return digits
    if not mobile_only and _LANDLINE.match(digits):
        return digits
    raise ValueError("Enter a valid Philippine mobile number, e.g. 0917 123 4567." if mobile_only else PHONE_HELP)
