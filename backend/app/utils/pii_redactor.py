"""
PII redaction for text that leaves the server (today: the report text sent to Gemini for the case AI insights).

redact_text() masks, in this order:
  1. email addresses and phone numbers (Philippine mobile, landline and international forms);
  2. the names we KNOW belong to this report (the reporter, the person a staff member filed it for, the suspected owner, the
     registered pet owner): the whole name and each word of it of 3+ letters;
  3. block / lot / unit / house references ("Blk 5 Lot 3", "B5 L3", "Unit 12B", "House #14");
  4. a title or honorific followed by a name ("Mang Tony", "Mrs. Reyes", "Kuya Jun", "Ms. Ana Cruz").

It is a safety net on top of never SELECTING identity fields in the first place (services/case_ai_insights.py sends none).
It cannot find a bare name nobody told it about; that is why the free text of private neighbour complaints is also
skipped there. Pure functions, no database.
"""
import re
from typing import Iterable, List, Optional

MASK_NAME = "[name]"
MASK_PHONE = "[phone]"
MASK_EMAIL = "[email]"
MASK_UNIT = "[address]"

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# +63 917 123 4567, 0917-123-4567, 09171234567, (02) 8123 4567, 8123-4567, 0917 123 4567 ext
_PHONE = re.compile(r"(?<![\w])(?:\+?\d{1,3}[\s\-.]?)?(?:\(?0?\d{1,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{4}(?![\w])")
_UNIT_WORD = r"(?:blk|block|lot|lt|unit|house|bldg|building|apt|apartment|rm|room|phase|ph)"
# "Blk 5 Lot 3", "Block 5, Lot 3", "Unit 12B", "House #14", "Lot 7"
_UNIT = re.compile(rf"\b{_UNIT_WORD}\.?\s*(?:no\.?|#)?\s*\d+[A-Za-z]?\b(?:\s*[,/&\-]?\s*(?:and\s+)?{_UNIT_WORD}\.?\s*(?:no\.?|#)?\s*\d+[A-Za-z]?\b)*", re.I)
# "B5 L3", "B-5/L-3"
_BL_SHORT = re.compile(r"\bB\s?-?\d{1,3}\s*[,/\-]?\s*L\s?-?\d{1,3}\b", re.I)
# "123 Rizal St", "45 Mabini Street"
_STREET = re.compile(r"\b\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Drive|Dr|Lane|Ln)\b\.?")
_TITLES = (r"mr|mrs|ms|miss|sir|ma'am|maam|madam|mang|aling|tita|tito|ate|kuya|manong|manang|lola|lolo|nanay|tatay|aling|"
           r"engr|atty|dr|capt|kap|kagawad|brgy\.? captain")
_TITLED_NAME = re.compile(rf"\b(?:{_TITLES})\.?\s+[A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?", re.I)


def _name_variants(names: Iterable[Optional[str]]) -> List[str]:
    """Each known name whole, plus each word of it with 3+ letters (so "Maria Santos" also masks "Santos")."""
    out: List[str] = []
    for raw in names:
        name = " ".join((raw or "").split())
        if len(name) < 3:
            continue
        out.append(name)
        out.extend(w for w in re.split(r"[\s,.]+", name) if len(w) >= 3 and w.isalpha())
    # longest first so a whole name is masked before its parts
    return sorted({v for v in out}, key=len, reverse=True)


def redact_text(text: Optional[str], known_names: Iterable[Optional[str]] = ()) -> str:
    """The text with names, emails, phone numbers and block / lot / unit references masked."""
    if not text:
        return ""
    out = str(text)
    # emails and phones first: a known name inside an address ("maria.santos@...") must not break the address into pieces
    out = _EMAIL.sub(MASK_EMAIL, out)
    out = _PHONE.sub(lambda m: MASK_PHONE if sum(ch.isdigit() for ch in m.group(0)) >= 7 else m.group(0), out)
    for name in _name_variants(known_names):
        out = re.sub(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", MASK_NAME, out, flags=re.I)
    out = _UNIT.sub(MASK_UNIT, out)
    out = _BL_SHORT.sub(MASK_UNIT, out)
    out = _STREET.sub(MASK_UNIT, out)
    out = _TITLED_NAME.sub(MASK_NAME, out)
    return out


def leaks(text: Optional[str], known_names: Iterable[Optional[str]] = ()) -> bool:
    """True when `text` still holds something redact_text would mask (used to check what is about to be sent)."""
    return redact_text(text, known_names) != (text or "")
