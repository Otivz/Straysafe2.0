"""
Lost and found possible matches (docs/01-system/LOST_FOUND_MATCHING.md).

A lost-pet report and a found-animal report of the same subdivision may describe the same animal. The background check looks at what the
two reports SAY (kind of animal, colours, size, distinguishing features, collar, how far apart the places are, how long after it was last
seen the animal was found) and never at a photo. It runs the moment either report is filed, whichever comes first, and it only SUGGESTS:

  suggested (pending)  -> nobody is told except the Leaders, nothing is linked, no status changes
  Leader confirms      -> the two reports are linked (case_links, nothing merged or hidden), BOTH residents are told, and the owner and the
                          finder get the existing way to get in touch (a possible-recovery conversation: private messages when both agree,
                          or the Leader's help when either asks). A link is never ownership and never a recovery: only the owner's
                          confirmation recovers a pet (services/lost_pet_lifecycle.confirm_recovery).
  Leader rules it out  -> kept, so the pair is never suggested again, and it can be reviewed again; nobody is told

A lost report can have several confirmed found reports, each confirmed on its own. A found report links to ONE lost report only; its other
suggestions become `moot`. Nothing here changes a case status.
"""
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, Request
from sqlalchemy import case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.models.case_messaging import CaseMessageThread
from app.models.case_records import CaseLink
from app.models.lost_found_match import LostFoundMatch
from app.models.lost_pet_alert import LostPetAlert, LostPetCoordination, LostPetSighting
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.schemas.case import LinkIn
from app.services import case_lifecycle as L
from app.services import case_messaging
from app.services import case_work
from app.services import lost_pet_lifecycle as LP
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.auth import verify_subdivision_scope
from app.utils.db_clock import db_now

STRONG_FROM = 70
POSSIBLE_FROM = 40
PENDING, CONFIRMED, REJECTED, MOOT = "pending", "confirmed", "rejected", "moot"
STATUSES = (PENDING, CONFIRMED, REJECTED, MOOT)
DECISIONS = ("confirm", "reject", "reopen")
NOTE_ACTION = "CASE_NOTE"        # internal, staff-only notes live in the audit log (services/case_notes.py)
NOTIFIED = ("They can message each other in the app once both agree, or ask the Subdivision Leader to help. "
            "Phone numbers and addresses stay private.")

# --------------------------------------------------------------------------------------------------- vocabulary
# What a report's free text can say about an animal. Deliberately small: a word that is not here is simply not compared.
_COLOR_WORDS: List[Tuple[str, str]] = [
    ("light brown", "tan"), ("dark brown", "brown"), ("golden brown", "tan"),
    ("black", "black"), ("white", "white"), ("cream", "white"), ("ivory", "white"), ("grey", "grey"), ("gray", "grey"), ("silver", "grey"),
    ("brown", "brown"), ("chocolate", "brown"), ("tan", "tan"), ("beige", "tan"), ("fawn", "tan"), ("buff", "tan"),
    ("golden", "golden"), ("gold", "golden"), ("yellow", "golden"), ("blonde", "golden"),
    ("orange", "orange"), ("ginger", "orange"), ("red", "orange"), ("green", "green"),
]
COLOR_LABELS = {"black": "black", "white": "white", "grey": "grey", "brown": "brown", "tan": "tan", "golden": "golden", "orange": "orange", "green": "green"}

_FEATURES: List[Tuple[str, str, "re.Pattern[str]"]] = [(fid, label, re.compile(rx, re.I)) for fid, label, rx in [
    ("white-chest", "a white chest", r"white\W+(?:\w+\W+){0,3}?(?:chest|bib)|(?:chest|bib)\W+(?:\w+\W+){0,3}?white"),
    ("odd-eyes", "one blue eye and one green eye", r"odd[- ]?eyed|heterochromia|one blue eye|different\W+colou?red\W+eyes"),
    ("notched-ear", "a notch in an ear", r"notch(?:ed)?\W+(?:\w+\W+){0,3}?ear|ear\W+(?:\w+\W+){0,3}?notch|torn\W+ear|cut\W+ear|cropped\W+ears?"),
    ("white-paw", "a white paw", r"white\W+(?:\w+\W+){0,2}?(?:paws?|socks?|foot|feet)|(?:paws?|foot|feet)\W+(?:\w+\W+){0,2}?white"),
    ("short-tail", "a short tail", r"short(?:\W+\w+){0,2}\W+tail|stub(?:by)?\W+tail|bob(?:bed)?\W*tail|\bno tail\b"),
    ("white-tip-tail", "a white tip on the tail", r"white\W+tip|tail\W+(?:\w+\W+){0,2}?white\W+tip"),
    ("floppy-ears", "floppy ears", r"floppy\W+ears?|droopy\W+ears?"),
    ("tabby", "tabby stripes", r"\btabby\b|\bstriped\b|\bstripes\b"),
    ("scar", "a scar", r"\bscar(?:red|s)?\b"),
]]
FEATURE_LABELS = {fid: label for fid, label, _ in _FEATURES}
_NO_COLLAR = re.compile(r"\b(?:no|without|missing|not wearing(?: a)?)\s+(?:a\s+)?(?:collar|harness)\b", re.I)
_COLLAR = re.compile(r"\b(?:(\w+)\s+)?(collar|harness)\b", re.I)
_NOT_A_COLOR = {"a", "the", "his", "her", "its", "with", "wearing", "and", "no", "had", "has", "old", "new", "red-and"}
_SIZE_ORDER = {"small": 0, "medium": 1, "large": 2}
_SKEW_HOURS = 12      # report times come from two clocks (the resident's, and the server's); a smaller negative gap is not evidence


def family_of(report: Optional[Report]) -> Optional[str]:
    """lost_pet or found_animal; any other report is not part of lost and found."""
    if report is None:
        return None
    if V.is_lost_pet_report(report):
        return V.LOST_PET
    name = report.category.category_name if report.category is not None else None
    return V.FOUND_ANIMAL if V.category_family(name) == V.FOUND_ANIMAL else None


def is_open(report: Report) -> bool:
    return not case_state.is_closed(report) and report.duplicate_of_report_id is None


# ------------------------------------------------------------------------------------------------------- facts
@dataclass
class Facts:
    species: Optional[str] = None            # dog | cat | other, or None when the report does not say
    breed: Optional[str] = None
    colors: List[str] = field(default_factory=list)
    size: Optional[str] = None
    features: List[str] = field(default_factory=list)
    collar: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    place: str = ""
    at: Optional[datetime] = None


def _colors(*texts: Optional[str]) -> List[str]:
    found: List[str] = []
    for text in texts:
        t = (text or "").lower()
        for word, canon in _COLOR_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", t):
                found.append(canon)
                t = re.sub(rf"\b{re.escape(word)}\b", " ", t)     # "light brown" must not also read as "brown"
    return list(dict.fromkeys(found))


def _features(*texts: Optional[str]) -> List[str]:
    blob = " ".join(t for t in texts if t)
    return [fid for fid, _label, rx in _FEATURES if rx.search(blob)]


def _collar(*texts: Optional[str]) -> Optional[str]:
    blob = " ".join(t for t in texts if t)
    if not blob or _NO_COLLAR.search(blob):
        return None
    for m in _COLLAR.finditer(blob):
        word = (m.group(1) or "").lower()
        return f"{word} {m.group(2).lower()}" if word and word not in _NOT_A_COLOR else m.group(2).lower()
    return None


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float, Decimal)) else None


def facts_of(db: Session, report: Report) -> Facts:
    """What a report says about the animal, the place and the time, read the same way for a lost and a found report."""
    snap_pet: Dict[str, Any] = ((report.pet_snapshot or {}).get("pet") or {}) if isinstance(report.pet_snapshot, dict) else {}
    kind = (report.animal_type or "").strip().lower()
    species = "dog" if kind == "dog" else "cat" if kind == "cat" else None if kind in ("", "unknown") else "other"
    f = Facts(species=species, breed=(report.animal_breed or snap_pet.get("breed") or None),
              colors=_colors(report.animal_color, snap_pet.get("color")),
              size=(report.estimated_size or "").lower() if (report.estimated_size or "").lower() in _SIZE_ORDER else None,
              features=_features(report.description, report.condition, report.animal_color, snap_pet.get("markings"), snap_pet.get("color")),
              collar=_collar(report.description, report.condition, snap_pet.get("markings")),
              lat=_num(report.latitude), lng=_num(report.longitude), place=(report.landmark or "").strip(), at=report.created_at)
    if family_of(report) == V.LOST_PET:
        alert = db.query(LostPetAlert).filter(LostPetAlert.report_id == report.report_id).first()
        if alert is not None:
            f.at = alert.last_seen_at or f.at
            f.lat = _num(alert.last_seen_lat) if alert.last_seen_lat is not None else f.lat
            f.lng = _num(alert.last_seen_lng) if alert.last_seen_lng is not None else f.lng
            f.place = (alert.last_seen_location or f.place or "").strip()
    return f


def _meters(a: Facts, b: Facts) -> Optional[int]:
    if None in (a.lat, a.lng, b.lat, b.lng):
        return None
    p1, p2 = math.radians(a.lat), math.radians(b.lat)           # type: ignore[arg-type]
    dp, dl = p2 - p1, math.radians(b.lng - a.lng)                # type: ignore[operator]
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * 6_371_000 * math.asin(math.sqrt(h)))


def _upper_first(text: str) -> str:
    """The first letter in capitals and the rest as written (str.capitalize() would turn "Gate 2" into "gate 2")."""
    return text[:1].upper() + text[1:]


def _list(words: List[str]) -> str:
    return ", ".join(words[:-1]) + " and " + words[-1] if len(words) > 1 else (words[0] if words else "")


def _labels(ids: List[str], table: Dict[str, str]) -> str:
    return _list([table.get(i, i) for i in ids])


# --------------------------------------------------------------------------------------------------- comparison
def compare(lost: Facts, found: Facts) -> Dict[str, Any]:
    """
    The score (0 to 100) and the side-by-side rows the Leader reads. Each row has a verdict (match, similar, differs, unknown), its points
    and, when it speaks in favour, a sentence for "why they may match". Kind of animal is a hard rule. Weights are defaults, not policy.
    """
    rows: List[Dict[str, Any]] = []

    def add(key: str, label: str, lv: str, fv: str, verdict: str, note: str, points: int = 0, reason: Optional[str] = None) -> None:
        rows.append({"key": key, "label": label, "lost": lv, "found": fv, "verdict": verdict, "note": note, "points": points, "reason": reason})

    word = {"dog": "dogs", "cat": "cats", "other": "animals"}
    kind = lambda f: (f.species or "not known").capitalize() + (f" · {f.breed}" if f.breed and f.species in ("dog", "cat") else "")   # noqa: E731
    if lost.species and found.species and lost.species != found.species:
        add("species", "Animal", kind(lost), kind(found), "differs", "Different kinds of animal")
        return {"score": 0, "level": "none", "rows": rows, "reasons": [], "excluded": "Different kinds of animal"}
    if lost.species and found.species:
        add("species", "Animal", kind(lost), kind(found), "match", f"Both are {word[lost.species]}", 15, f"Both are {word[lost.species]}")
    else:
        add("species", "Animal", kind(lost), kind(found), "unknown", "Kind of animal not given on one report")

    sa, sb = set(lost.colors), set(found.colors)
    cl, cf = _labels(lost.colors, COLOR_LABELS).capitalize() or "Not noted", _labels(found.colors, COLOR_LABELS).capitalize() or "Not noted"
    if sa and sb:
        j = len(sa & sb) / len(sa | sb)
        if j == 1:
            add("colors", "Coat", cl, cf, "match", "Same colours", 25, f"Same colours: {_labels(lost.colors, COLOR_LABELS)}")
        elif j >= 0.5:
            add("colors", "Coat", cl, cf, "similar", "Similar colours", 15, f"Similar colours: {_labels(lost.colors, COLOR_LABELS)} and {_labels(found.colors, COLOR_LABELS)}")
        elif j > 0:
            add("colors", "Coat", cl, cf, "similar", "Some colours in common", 6)
        else:
            add("colors", "Coat", cl, cf, "differs", "Different colours", -20)
    else:
        add("colors", "Coat", cl, cf, "unknown", "Not enough noted")

    if lost.size and found.size:
        gap = abs(_SIZE_ORDER[lost.size] - _SIZE_ORDER[found.size])
        add("size", "Size", lost.size.capitalize(), found.size.capitalize(), "match" if gap == 0 else "similar" if gap == 1 else "differs",
            "Same size" if gap == 0 else "Close in size" if gap == 1 else "Very different sizes", 5 if gap == 0 else 2 if gap == 1 else -10,
            "Same size" if gap == 0 else None)
    else:
        add("size", "Size", (lost.size or "Not noted").capitalize(), (found.size or "Not noted").capitalize(), "unknown", "Not enough noted")

    shared = [x for x in lost.features if x in found.features]
    fl = _labels(lost.features, FEATURE_LABELS).capitalize() or "None noted"
    ff = _labels(found.features, FEATURE_LABELS).capitalize() or "None noted"
    if shared:
        text = f"Both have {_labels(shared, FEATURE_LABELS)}"
        add("features", "Distinguishing features", fl, ff, "match", text, min(30, 12 * len(shared)), text)
    elif lost.features and found.features:
        add("features", "Distinguishing features", fl, ff, "differs", "No feature in common", -5)
    else:
        add("features", "Distinguishing features", fl, ff, "unknown", "Not enough noted")

    col_l, col_f = _upper_first(lost.collar or "None noted"), _upper_first(found.collar or "None noted")
    if lost.collar and found.collar:
        same = lost.collar == found.collar
        add("collar", "Collar or tag", col_l, col_f, "match" if same else "differs", "Same collar" if same else "Different collars (collars come off)",
            8 if same else -4, f"Same collar: {lost.collar}" if same else None)
    else:
        add("collar", "Collar or tag", col_l, col_f, "unknown", "Only one report mentions a collar" if (lost.collar or found.collar) else "Not enough noted")

    d = _meters(lost, found)
    if d is None:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "unknown", "Distance not known")
    elif d <= 150:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "match", "The same place" if d == 0 else f"Very close: about {d} m apart", 15,
            "The same place" if d == 0 else f"Very close: about {d} m apart")
    elif d <= 400:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "match", f"Close: about {d} m apart", 10, f"Close: about {d} m apart")
    elif d <= 800:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "similar", f"About {d} m apart", 5)
    elif d > 1500:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "differs", f"Far apart: about {d} m", -10)
    else:
        add("where", "Where", lost.place or "Pinned location", found.place or "Pinned location", "unknown", f"About {d} m apart")

    li, fi = lost.at.isoformat() if lost.at else "", found.at.isoformat() if found.at else ""
    if lost.at and found.at:
        g = (found.at - lost.at).total_seconds() / 3600
        hours = max(1, round(abs(g)))
        if g < -_SKEW_HOURS:
            add("when", "When", li, fi, "differs", "Found before it was last seen", -40)
        elif g < 0:
            add("when", "When", li, fi, "unknown", "About the same time")
        elif g <= 72:
            add("when", "When", li, fi, "match", f"Found {hours} h after it was last seen", 12, f"Found {hours} h after it was last seen")
        elif g <= 168:
            add("when", "When", li, fi, "similar", f"Found {round(g / 24)} days after it was last seen", 6)
        elif g > 504:
            add("when", "When", li, fi, "differs", "Weeks apart", -5)
        else:
            add("when", "When", li, fi, "unknown", f"Found {round(g / 24)} days after it was last seen")
    else:
        add("when", "When", li, fi, "unknown", "Time not known")

    score = max(0, min(100, sum(r["points"] for r in rows)))
    level = "strong" if score >= STRONG_FROM else "possible" if score >= POSSIBLE_FROM else "none"
    reasons = [r["reason"] for r in sorted((r for r in rows if r["reason"] and r["points"] > 0), key=lambda r: -r["points"])][:5]
    return {"score": score, "level": level, "rows": rows, "reasons": reasons}


# ------------------------------------------------------------------------------------------------ suggestions
def _category_ids(db: Session, family: str) -> List[int]:
    return [c.category_id for c in db.query(ReportCategory).all() if V.category_family(c.category_name) == family]


def _linked_found_ids(db: Session, subdivision_id: int) -> Set[int]:
    return {fid for (fid,) in db.query(LostFoundMatch.found_report_id).filter(LostFoundMatch.subdivision_id == subdivision_id,
                                                                            LostFoundMatch.status == CONFIRMED).all()}


def suggest_for_report(db: Session, report: Report, now: Optional[datetime] = None) -> List[LostFoundMatch]:
    """
    Check ONE report (just filed, or older) against the open reports of the other kind in its subdivision, in either direction. Writes the
    possible matches as `pending` and tells the Leaders once; nobody else is told and nothing is linked. A pair already looked at (in any way)
    is never suggested again, and a found report that is already linked is never suggested for another lost report. Commits nothing.
    """
    fam = family_of(report)
    if fam is None or not is_open(report) or not report.subdivision_id:
        return []
    other_family = V.FOUND_ANIMAL if fam == V.LOST_PET else V.LOST_PET
    ids = _category_ids(db, other_family)
    if not ids:
        return []
    linked = _linked_found_ids(db, report.subdivision_id)
    seen_pairs = {(m.lost_report_id, m.found_report_id) for m in db.query(LostFoundMatch).filter(
        (LostFoundMatch.lost_report_id == report.report_id) | (LostFoundMatch.found_report_id == report.report_id)).all()}
    candidates = db.query(Report).options(joinedload(Report.category)).filter(
        Report.subdivision_id == report.subdivision_id, Report.category_id.in_(ids), Report.report_id != report.report_id,
        Report.duplicate_of_report_id.is_(None)).all()
    mine = facts_of(db, report)
    created: List[LostFoundMatch] = []
    for other in candidates:
        if not is_open(other):
            continue
        lost, found = (report, other) if fam == V.LOST_PET else (other, report)
        if (lost.report_id, found.report_id) in seen_pairs or found.report_id in linked:
            continue
        theirs = facts_of(db, other)
        result = compare(mine, theirs) if fam == V.LOST_PET else compare(theirs, mine)
        if result["level"] == "none":
            continue
        m = LostFoundMatch(subdivision_id=report.subdivision_id, lost_report_id=lost.report_id, found_report_id=found.report_id,
                           score=result["score"], level=result["level"], reasons=result["reasons"], status=PENDING)
        db.add(m)
        db.flush()
        created.append(m)
        for target, partner in ((lost, found), (found, lost)):
            _note(db, target, None, f"A possible match was suggested: report #{partner.report_id} ({_describe(db, partner)}). "
                  f"{'Strong' if m.level == 'strong' else 'Possible'} match, waiting for a Leader to review it.")
    if created:
        best = max(created, key=lambda m: m.score)
        other_id = best.found_report_id if fam == V.LOST_PET else best.lost_report_id
        extra = f" and {len(created) - 1} more" if len(created) > 1 else ""
        LP.notify(db, LP.leader_ids(db, report.subdivision_id), "lost_found_review", report.report_id,
                  "Possible lost and found match to review",
                  f"Report #{report.report_id} may be the same animal as report #{other_id}{extra}. Nothing is linked until you review it.")
    return created


def suggest_after_filing(db: Session, report_id: int) -> int:
    """The background check for a report that was just committed. Never raises: filing a report must not depend on it."""
    try:
        report = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == report_id).first()
        made = suggest_for_report(db, report) if report is not None else []
        db.commit()
        return len(made)
    except Exception as exc:  # noqa: BLE001  (a failure here only means no suggestion was made)
        db.rollback()
        print(f"Notice: lost and found matching skipped for report {report_id}: {exc}")
        return 0


def scan_subdivision(db: Session, subdivision_id: int) -> int:
    """Check every open lost report of a subdivision against the open found reports (older reports have no suggestions yet). Commits."""
    count = 0
    lost_ids = _category_ids(db, V.LOST_PET)
    reports = db.query(Report).options(joinedload(Report.category)).filter(Report.subdivision_id == subdivision_id, Report.category_id.in_(lost_ids),
                                                                         Report.duplicate_of_report_id.is_(None)).all() if lost_ids else []
    for r in reports:
        count += len(suggest_for_report(db, r))
    db.commit()
    return count


# ------------------------------------------------------------------------------------------------------ notes
def _note(db: Session, report: Report, actor: Optional[User], text: str) -> None:
    """A staff-only line on the case (never on the timeline residents read). `actor` None: written by the system."""
    db.add(AuditLog(user_id=actor.user_id if actor else None, action=NOTE_ACTION, target_table="reports", target_id=report.report_id,
                    description=text[:2000], log_type="case_note"))


def _describe(db: Session, report: Report) -> str:
    """A short name for a report in a sentence."""
    f = facts_of(db, report)
    if family_of(report) == V.LOST_PET:
        name = ((report.pet_snapshot or {}).get("pet") or {}).get("name") if isinstance(report.pet_snapshot, dict) else None
        return f"lost pet {name}" if name else "lost pet"
    base = " ".join(x for x in [_labels(f.colors, COLOR_LABELS), f.species or "animal"] if x)
    return f"found {base}" + (f" near {f.place}" if f.place else "")


# ----------------------------------------------------------------------------------------------------- decisions
def match_for_leader(db: Session, match_id: int, user: User) -> LostFoundMatch:
    m = db.query(LostFoundMatch).filter(LostFoundMatch.match_id == match_id).first()
    if m is None:
        raise HTTPException(status_code=404, detail="Possible match not found.")
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can review a possible match.")
    verify_subdivision_scope(user, m.subdivision_id, db=db)
    return m


def _pair(db: Session, m: LostFoundMatch) -> Tuple[Report, Report]:
    lost = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == m.lost_report_id).first()
    found = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == m.found_report_id).first()
    if lost is None or found is None:
        raise HTTPException(status_code=404, detail="One of the reports no longer exists.")
    return lost, found


def decide(db: Session, m: LostFoundMatch, actor: User, decision: str, req: Optional[Request] = None) -> LostFoundMatch:
    """Confirm (link and tell both residents), rule out (kept, nobody told) or review a ruled-out pair again. Commits nothing."""
    if decision not in DECISIONS:
        raise HTTPException(status_code=422, detail="Choose confirm, reject or reopen.")
    lost, found = _pair(db, m)
    for r in sorted((lost, found), key=lambda x: x.report_id):          # lock in one order: two Leaders can never deadlock on the same pair
        LP.lock_case(db, r.report_id)
    m = db.query(LostFoundMatch).filter(LostFoundMatch.match_id == m.match_id).populate_existing().with_for_update().one()
    for r in (lost, found):
        verify_subdivision_scope(actor, r.subdivision_id, db=db)
        L.require_case_handler(r, actor)
        L.require_not_merged(r)
    now = db_now(db)

    if decision == "confirm":
        if m.status != PENDING:
            raise HTTPException(status_code=409, detail="This possible match was already decided.")
        if not is_open(lost) or not is_open(found):
            raise HTTPException(status_code=409, detail="One of the reports is closed, so it can no longer be linked.")
        if db.query(LostFoundMatch.match_id).filter(LostFoundMatch.found_report_id == found.report_id, LostFoundMatch.status == CONFIRMED).first():
            raise HTTPException(status_code=409, detail="This found report is already linked to another lost report.")
        links = case_work.link_reports(db, lost, actor, LinkIn(report_ids=[found.report_id], link_type="same_animal",
                                                               note="Confirmed as the same animal from a possible match."), synchronize_lost_found=False)
        m.status, m.decided_by, m.decided_at = CONFIRMED, actor.user_id, now
        m.link_id = links[0].link_id if links else None
        # a found report links to one lost report only: its other suggestions no longer apply
        for other in db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == found.report_id, LostFoundMatch.match_id != m.match_id,
                                                     LostFoundMatch.status == PENDING).all():
            other.status, other.decided_at = MOOT, now
            other_lost = db.get(Report, other.lost_report_id)
            if other_lost is not None:
                _note(db, other_lost, None, f"Report #{found.report_id} was linked to another lost report, so it is no longer suggested here.")
        bridge = _open_conversation(db, m, lost, found, actor, now, req)
        for target, partner in ((lost, found), (found, lost)):
            LP.history_line(db, target, actor, f"This report was linked to a {'found-animal' if family_of(partner) == V.FOUND_ANIMAL else 'lost-pet'} "
                            "report by the Subdivision Leader. Both reports stay as they are.")
            _note(db, target, actor, f"Confirmed as the same animal as report #{partner.report_id} ({_describe(db, partner)}). Both residents were notified"
                  + (" and a direct conversation between the owner and the finder was opened." if bridge is not None else "."))
        L.audit(db, actor, "LOST_FOUND_MATCH_CONFIRMED", lost, f"{actor.name} confirmed that report #{lost.report_id} and #{found.report_id} are the same animal.",
                table="lost_found_matches", target_id=m.match_id, new={"lost_report_id": lost.report_id, "found_report_id": found.report_id, "score": m.score})
        return m

    if decision == "reject":
        if m.status != PENDING:
            raise HTTPException(status_code=409, detail="This possible match was already decided.")
        m.status, m.decided_by, m.decided_at = REJECTED, actor.user_id, now
        for target, partner in ((lost, found), (found, lost)):
            _note(db, target, actor, f"Decided that report #{partner.report_id} ({_describe(db, partner)}) is not the same animal. Nobody was notified.")
        L.audit(db, actor, "LOST_FOUND_MATCH_REJECTED", lost, f"{actor.name} ruled out a possible match between report #{lost.report_id} and #{found.report_id}.",
                table="lost_found_matches", target_id=m.match_id)
        return m

    # reopen
    if m.status != REJECTED:
        raise HTTPException(status_code=409, detail="Only a match that was ruled out can be reviewed again.")
    if not is_open(lost) or not is_open(found):
        raise HTTPException(status_code=409, detail="One of the reports is closed.")
    if db.query(LostFoundMatch.match_id).filter(LostFoundMatch.found_report_id == found.report_id, LostFoundMatch.status == CONFIRMED).first():
        raise HTTPException(status_code=409, detail="This found report is already linked to another lost report.")
    m.status, m.decided_by, m.decided_at = PENDING, None, None
    for target, partner in ((lost, found), (found, lost)):
        _note(db, target, actor, f"Reopened the review of report #{partner.report_id}.")
    return m


def _open_conversation(db: Session, m: LostFoundMatch, lost: Report, found: Report, actor: User, now: datetime, req: Optional[Request]) -> Optional[CaseMessageThread]:
    """
    The moment two reports are linked, open the communication bridge between the people involved: the owner, the finder and the Leader in one
    conversation (services/case_messaging.py), which shows on both residents' Home screens under "Needs your attention". When one person filed
    both reports there is nobody to bridge, and the Leader is simply told in the notification text below.

    The bridge is the one conversation for a Leader-linked pair. Do not also manufacture a secured-pet observation and a competing private
    invitation. Independently submitted secured-pet observations retain their separate mutual-consent workflow.
    """
    pet_name = ((lost.pet_snapshot or {}).get("pet") or {}).get("name") if isinstance(lost.pet_snapshot, dict) else None
    pet = pet_name or "your pet"
    bridge = case_messaging.open_bridge(db, m.match_id, m.link_id, lost, found, actor)
    owner_id, finder_id = lost.user_id, found.user_id
    if bridge is not None:
        return bridge
    # One person may have filed both reports, or an old report may no longer have an account. No empty/fake bridge is made.
    LP.notify(db, [owner_id], "lost_found_linked", lost.report_id, "A found animal report may be your pet",
              f"The Subdivision Leader linked a found-animal report to your lost report for {pet}. Nothing is marked recovered until you confirm it.")
    if finder_id != owner_id:
        LP.notify(db, [finder_id], "lost_found_linked", found.report_id, "Your found animal report was linked",
                  "The Subdivision Leader linked your found-animal report to a lost-pet report. The Leader will help you get in touch.")
    return None


# ------------------------------------------------------------------------------------------- linking and unlinking by hand
def _report_for(db: Session, report_id: int) -> Report:
    r = db.query(Report).options(joinedload(Report.category)).filter(Report.report_id == report_id).first()
    if r is None:
        raise HTTPException(status_code=404, detail=f"Report #{report_id} not found.")
    return r


def link_by_leader(db: Session, actor: User, report_id: int, other_id: int, req: Optional[Request] = None) -> LostFoundMatch:
    """
    A Leader links a missing-pet report to a found-animal report themselves, from either report's page: no suggestion is needed. It is the same
    act as confirming a suggestion (the two reports are linked, both residents are told, the conversation between them opens), and it overrides an
    earlier ruling-out of the pair, because the Leader is now saying the opposite on purpose. A found report links to one lost report only. Commits nothing.
    """
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can link reports.")
    if report_id == other_id:
        raise HTTPException(status_code=422, detail="A report cannot be linked to itself.")
    a, b = _report_for(db, report_id), _report_for(db, other_id)
    for r in (a, b):
        verify_subdivision_scope(actor, r.subdivision_id, db=db)
    if a.subdivision_id != b.subdivision_id:
        raise HTTPException(status_code=422, detail="Reports from different subdivisions cannot be linked.")
    if {family_of(a), family_of(b)} != {V.LOST_PET, V.FOUND_ANIMAL}:
        raise HTTPException(status_code=422, detail="Only a missing-pet report and a found-animal report can be linked to each other.")
    lost, found = (a, b) if family_of(a) == V.LOST_PET else (b, a)
    # Take both case locks before reading/creating the unique pair. Concurrent manual links cannot both insert it.
    for r in sorted((lost, found), key=lambda x: x.report_id):
        LP.lock_case(db, r.report_id)
    for r in (lost, found):
        L.require_case_handler(r, actor)
        L.require_not_merged(r)
    if not is_open(lost) or not is_open(found):
        raise HTTPException(status_code=409, detail="One of the reports is closed, so it can no longer be linked.")
    m = db.query(LostFoundMatch).filter(LostFoundMatch.lost_report_id == lost.report_id, LostFoundMatch.found_report_id == found.report_id).first()
    if m is None:
        result = compare(facts_of(db, lost), facts_of(db, found))
        m = LostFoundMatch(subdivision_id=lost.subdivision_id, lost_report_id=lost.report_id, found_report_id=found.report_id, score=result["score"],
                           level=result["level"] if result["level"] != "none" else "manual", reasons=result["reasons"], status=PENDING)
        try:
            with db.begin_nested():
                db.add(m)
                db.flush()
        except IntegrityError:
            m = db.query(LostFoundMatch).filter(LostFoundMatch.lost_report_id == lost.report_id,
                                               LostFoundMatch.found_report_id == found.report_id).populate_existing().with_for_update().first()
            if m is None:
                raise HTTPException(status_code=409, detail="This pair changed while it was being linked. Refresh and try again.")
    elif m.status == CONFIRMED:
        raise HTTPException(status_code=409, detail="These two reports are already linked.")
    elif m.status in (REJECTED, MOOT):
        m.status, m.decided_by, m.decided_at = PENDING, None, None        # (a found report linked elsewhere is refused by the confirmation below)
        db.flush()                                                        # (the confirmation re-reads the row after taking its locks)
    return decide(db, m, actor, "confirm", req)


def _end_coordination(db: Session, m: LostFoundMatch, actor: User, now: datetime) -> None:
    """The notice-based way to get in touch ends with the link: it was about a possible recovery that the Leader has now said is not one."""
    if not m.coordination_id:
        return
    c = db.get(LostPetCoordination, m.coordination_id)
    if c is None:
        return
    if c.status == "open":
        c.status, c.resolved_at, c.resolved_by = "resolved", now, actor.user_id
        c.resolution_note = "The Subdivision Leader removed the link between the two reports."
    s = db.get(LostPetSighting, c.sighting_id)
    if s is not None and s.status == "unverified":
        s.status, s.reviewed_by, s.reviewed_at, s.review_note = "dismissed", actor.user_id, now, "The link between the two reports was removed."


def unlink(db: Session, m: LostFoundMatch, actor: User, req: Optional[Request] = None) -> LostFoundMatch:
    """
    Remove a link a Leader made (from a suggestion, or by hand). Nothing is merged, so nothing is un-merged: the case link ends (kept, with who ended it),
    the pair is ruled out (kept, so it is not suggested again, and it can be reviewed again), the conversation between the owner and the finder is
    closed with a line saying so, the notice-based possible recovery ends, and both residents are told. A found report that was linked here and had other
    suggestions waiting is open to them again. Commits nothing.
    """
    lost, found = _pair(db, m)
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can unlink reports.")
    for r in (lost, found):
        verify_subdivision_scope(actor, r.subdivision_id, db=db)
    for r in sorted((lost, found), key=lambda x: x.report_id):
        LP.lock_case(db, r.report_id)
    m = db.query(LostFoundMatch).filter(LostFoundMatch.match_id == m.match_id).populate_existing().with_for_update().one()
    if m.status != CONFIRMED:
        raise HTTPException(status_code=409, detail="These two reports are not linked.")
    if not is_open(lost) or not is_open(found):
        raise HTTPException(status_code=409, detail="One of the reports is closed. Reopen it to remove the link.")
    for r in (lost, found):
        L.require_case_handler(r, actor)
        L.require_not_merged(r)
    now = db_now(db)
    link = db.get(CaseLink, m.link_id) if m.link_id else None
    if link is not None and link.unlinked_at is None:
        case_work.unlink_reports(db, lost, actor, link.link_id, "Removed by the Subdivision Leader.", synchronize_lost_found=False)
    m.status, m.decided_by, m.decided_at = REJECTED, actor.user_id, now
    for other in db.query(LostFoundMatch).filter(LostFoundMatch.found_report_id == found.report_id, LostFoundMatch.match_id != m.match_id,
                                                 LostFoundMatch.status == MOOT).all():
        other_lost = db.get(Report, other.lost_report_id)
        if other_lost is not None and is_open(other_lost):
            other.status, other.decided_by, other.decided_at = PENDING, None, None
            _note(db, other_lost, None, f"Report #{found.report_id} is no longer linked to another lost report, so it is suggested here again.")
    _end_coordination(db, m, actor, now)
    closed = case_messaging.close_bridges(db, m.match_id, actor, "The Subdivision Leader removed the link between these reports, so this conversation is closed.")
    if not closed:
        # no conversation carried the news (a link made before conversations opened, or one person filed both): tell them directly
        LP.notify(db, [lost.user_id], "lost_found_linked", lost.report_id, "A link between two reports was removed",
                  "The Subdivision Leader removed the link between your report and a found-animal report. Nothing was marked recovered.")
        LP.notify(db, [found.user_id], "lost_found_linked", found.report_id, "A link between two reports was removed",
                  "The Subdivision Leader removed the link between your found-animal report and a lost-pet report. Nothing was marked recovered.")
    for target, partner in ((lost, found), (found, lost)):
        LP.history_line(db, target, actor, f"The link between this report and a {'found-animal' if family_of(partner) == V.FOUND_ANIMAL else 'lost-pet'} "
                        "report was removed by the Subdivision Leader.")
        _note(db, target, actor, f"Removed the link to report #{partner.report_id} ({_describe(db, partner)})"
              + (". Its conversation was closed and both residents were told." if closed else ". Both residents were told."))
    L.audit(db, actor, "LOST_FOUND_MATCH_UNLINKED", lost, f"{actor.name} removed the link between report #{lost.report_id} and #{found.report_id}.",
            table="lost_found_matches", target_id=m.match_id, new={"lost_report_id": lost.report_id, "found_report_id": found.report_id})
    return m


def open_thread(db: Session, m: LostFoundMatch, actor: User) -> CaseMessageThread:
    """The conversation of a linked pair, opened again when it is asked for (a link made before conversations existed has none). Commits nothing."""
    if actor.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can open a conversation.")
    verify_subdivision_scope(actor, m.subdivision_id, db=db)
    if m.status != CONFIRMED:
        raise HTTPException(status_code=409, detail="Link the two reports first.")
    lost, found = _pair(db, m)
    for r in sorted((lost, found), key=lambda x: x.report_id):
        LP.lock_case(db, r.report_id)
        L.require_case_handler(r, actor)
        L.require_not_merged(r)
    if not is_open(lost) or not is_open(found):
        raise HTTPException(status_code=409, detail="One of the reports is closed, so there is no conversation to open.")
    t = case_messaging.open_bridge(db, m.match_id, m.link_id, lost, found, actor)
    if t is None:
        raise HTTPException(status_code=409, detail="The same person filed both reports, so there is nobody to open a conversation with.")
    return t


# --------------------------------------------------------------------------------------------------------- views
def _photo(report: Report) -> Optional[str]:
    snap = ((report.pet_snapshot or {}).get("pet") or {}) if isinstance(report.pet_snapshot, dict) else {}
    photos = snap.get("photos") or []
    if photos:
        return photos[0]
    return next((m.file_url for m in (report.media or []) if m.file_url and m.media_type in ("Image", None)), None)


def report_brief(db: Session, report: Report) -> Dict[str, Any]:
    """One side of a possible match, for the Leader: who reported it, what it says, where and when."""
    f = facts_of(db, report)
    reporter = db.get(User, report.user_id) if report.user_id else None
    snap = ((report.pet_snapshot or {}).get("pet") or {}) if isinstance(report.pet_snapshot, dict) else {}
    lost = family_of(report) == V.LOST_PET
    return {
        "report_id": report.report_id, "kind": "lost" if lost else "found",
        "title": (snap.get("name") or "Missing pet") if lost else _upper_first(_describe(db, report)),
        "photo_url": _photo(report), "species": f.species, "breed": f.breed, "colors": [COLOR_LABELS.get(c, c) for c in f.colors],
        "size": f.size, "features": [FEATURE_LABELS.get(x, x) for x in f.features], "collar": f.collar,
        "place": f.place, "at": f.at.isoformat() if f.at else None, "reported_at": report.created_at.isoformat() if report.created_at else None,
        "words": (report.description or "").strip() or None, "open": is_open(report),
        "reporter": {"user_id": reporter.user_id, "name": reporter.name, "phone": reporter.phone} if reporter else None,
    }


def match_view(db: Session, m: LostFoundMatch, detail: bool = False) -> Dict[str, Any]:
    lost, found = _pair(db, m)
    out: Dict[str, Any] = {
        "match_id": m.match_id, "subdivision_id": m.subdivision_id, "lost_report_id": m.lost_report_id, "found_report_id": m.found_report_id,
        "score": m.score, "level": m.level, "status": m.status, "reasons": m.reasons or [], "created_at": m.created_at.isoformat() if m.created_at else None,
        "decided_at": m.decided_at.isoformat() if m.decided_at else None, "decided_by": m.decided_by, "link_id": m.link_id,
        "coordination_id": m.coordination_id, "lost": report_brief(db, lost), "found": report_brief(db, found),
    }
    if m.coordination_id:
        c = db.get(LostPetCoordination, m.coordination_id)
        out["coordination"] = {"coordination_id": c.coordination_id, "mode": c.mode, "status": c.status} if c is not None else None
    if detail:
        result = compare(facts_of(db, lost), facts_of(db, found))
        out["rows"] = [{k: v for k, v in r.items() if k != "points"} for r in result["rows"]]
        out["comparison_reasons"] = result["reasons"]
    return out


def list_matches(db: Session, user: User, *, subdivision_id: Optional[int] = None, status: Optional[str] = None,
                 report_id: Optional[int] = None, limit: int = 200) -> List[LostFoundMatch]:
    if user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only a Subdivision Leader can see possible matches.")
    scope = user.subdivision_id if user.role_id == 2 else subdivision_id
    if user.role_id == 2 and not scope:
        return []
    q = db.query(LostFoundMatch)
    if scope:
        q = q.filter(LostFoundMatch.subdivision_id == scope)
    if status:
        if status not in STATUSES:
            raise HTTPException(status_code=422, detail="Unknown status.")
        q = q.filter(LostFoundMatch.status == status)
    if report_id is not None:
        q = q.filter((LostFoundMatch.lost_report_id == report_id) | (LostFoundMatch.found_report_id == report_id))
    # the ones waiting for a decision first (strongest first), then the decided ones, newest first
    waiting_first = case((LostFoundMatch.status == PENDING, 0), else_=1)
    return q.order_by(waiting_first, LostFoundMatch.score.desc(), LostFoundMatch.match_id.desc()).limit(limit).all()


def queue_rows(db: Session, subdivision_id: Optional[int], report_ids: List[int]) -> List[Dict[str, Any]]:
    """The possible matches waiting for a Leader (both reports open), for the dashboard's work queue."""
    if not report_ids:
        return []
    open_ids = set(report_ids)
    q = db.query(LostFoundMatch).filter(LostFoundMatch.status == PENDING)
    if subdivision_id:
        q = q.filter(LostFoundMatch.subdivision_id == subdivision_id)
    rows = [m for m in q.order_by(LostFoundMatch.score.desc(), LostFoundMatch.match_id).limit(200).all()
            if m.lost_report_id in open_ids and m.found_report_id in open_ids]
    return [{"match_id": m.match_id, "lost_report_id": m.lost_report_id, "found_report_id": m.found_report_id, "level": m.level, "score": m.score,
             "reasons": m.reasons or [], "created_at": m.created_at} for m in rows]
