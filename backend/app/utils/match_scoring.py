"""
Multi-attribute animal matching (docs/01-system/MULTI_ATTRIBUTE_MATCHING.md).

One scoring engine for every place StraySafe suggests that two records may be the same animal:
  - a lost-pet report and a found-animal report (services/lost_found_matching.py), and
  - a report and a registered pet in the Pet Registry (routes/matches.py calculate_match_details).

It compares five attributes, each scored 0-100 ONLY when both records say enough about it:

    visual       the stored Gemini Vision comparison of the two photos (utils/ai_matching.py), when one was made
    location     how far apart the two places are (Haversine), or whether they are in the same subdivision
    breed        normalized breed names (Aspin / Puspin / mixed / spelling variants)
    coat         normalized coat colours and coat patterns, partial overlaps counted
    description  distinctive physical characteristics read from the written descriptions

The combined score is the weighted average of the attributes that COULD be compared: the weights of the others are spread over
them (missing information is never a zero). To keep one or two attributes from looking like a full comparison, the score is
reduced in proportion when less than half of the comparison (by weight) was possible, and the classification needs enough of it.
Everything here is a suggestion for a person to review. It never confirms ownership, links, resolves or returns anything.

Pure functions only, plus `load_config(db)`. Nothing is invented: every explanation is built from what the two records say.
"""
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

ALGORITHM = "multi-attribute-v1"
SETTING_KEY = "matching_config"
ATTRIBUTES = ("visual", "location", "breed", "coat", "description")
ATTRIBUTE_LABELS = {"visual": "Visual similarity", "location": "Location", "breed": "Breed", "coat": "Coat colour", "description": "Physical description"}

DEFAULT_CONFIG: Dict[str, Any] = {
    # relative importance; they need not add up to 100 (they are normalized)
    "weights": {"visual": 35, "location": 20, "breed": 15, "coat": 15, "description": 15},
    "thresholds": {
        "strong": 75,             # Strong Possible Match from this combined score ...
        "strong_min_attributes": 3,  # ... with at least this many attributes compared ...
        "strong_min_coverage": 50,   # ... covering at least this share (%) of the total weight
        "potential": 55,          # Potential Match from this combined score
        "min_coverage": 35,       # below this share (%) of the weight: Insufficient Information
        "min_attributes": 2,      # fewer attributes than this: Insufficient Information
        "full_evidence_coverage": 50,  # below this share (%), the score is reduced in proportion (no inflation from one attribute)
    },
    # metres
    "distance": {"very_near": 200, "nearby": 600, "same_area": 2000},
}

CLASS_LABELS = {"strong": "Strong Possible Match", "potential": "Potential Match", "low": "Low Similarity", "insufficient": "Insufficient Information",
                "excluded": "Not a match (different kind of animal)"}


# ---------------------------------------------------------------------------------------------------- configuration
def _merge(base: Dict[str, Any], over: Dict[str, Any]) -> Dict[str, Any]:
    out = json.loads(json.dumps(base))
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update({kk: vv for kk, vv in v.items() if isinstance(vv, (int, float)) and not isinstance(vv, bool)})
    return out


def validate_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """The configuration with every value in range. Raises ValueError with a readable message otherwise."""
    merged = _merge(DEFAULT_CONFIG, cfg)
    w = merged["weights"]
    if any(w[a] < 0 or w[a] > 100 for a in ATTRIBUTES):
        raise ValueError("Each weight must be between 0 and 100.")
    if sum(w[a] for a in ATTRIBUTES) <= 0:
        raise ValueError("At least one weight must be above 0.")
    t = merged["thresholds"]
    for k, v in t.items():
        if v < 0 or v > 100:
            raise ValueError(f"Threshold {k} must be between 0 and 100.")
    if t["potential"] > t["strong"]:
        raise ValueError("The Potential Match threshold cannot be above the Strong Possible Match threshold.")
    d = merged["distance"]
    if not (0 < d["very_near"] <= d["nearby"] <= d["same_area"]):
        raise ValueError("Distances must grow: very near <= nearby <= same area.")
    return merged


def load_config(db: Any = None) -> Dict[str, Any]:
    """Weights and thresholds: the administrator's saved setting (system_settings.matching_config) over the defaults."""
    if db is None:
        return json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        from app.models.system_setting import SystemSetting
        row = db.query(SystemSetting).filter(SystemSetting.setting_key == SETTING_KEY).first()
        if row is not None and row.is_enabled and row.setting_value:
            return validate_config(json.loads(row.setting_value))
    except Exception as exc:  # noqa: BLE001  (a broken setting falls back to the defaults, never breaks matching)
        print(f"[Matching] matching_config ignored: {exc}")
    return json.loads(json.dumps(DEFAULT_CONFIG))


# ---------------------------------------------------------------------------------------------------------- profile
@dataclass
class Profile:
    """What one record says about an animal, read the same way for a report and a registered pet."""
    species: Optional[str] = None            # dog | cat | other | None (not said)
    breed: Optional[str] = None              # as written
    colors: List[str] = field(default_factory=list)   # as written (tags, or words from a colour sentence)
    size: Optional[str] = None               # small | medium | large
    texts: List[str] = field(default_factory=list)    # descriptions, markings, condition, notes
    lat: Optional[float] = None
    lng: Optional[float] = None
    subdivision_id: Optional[int] = None
    place: str = ""


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def valid_point(lat: Any, lng: Any) -> Optional[Tuple[float, float]]:
    a, b = _num(lat), _num(lng)
    if a is None or b is None or not (-90 <= a <= 90 and -180 <= b <= 180) or (a == 0 and b == 0):
        return None
    return a, b


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * 6_371_000 * math.asin(math.sqrt(min(1.0, h))))


def _attr(score: Optional[float], verdict: str, explanation: str, **detail: Any) -> Dict[str, Any]:
    return {"score": None if score is None else int(round(max(0.0, min(100.0, score)))), "verdict": verdict, "explanation": explanation, **detail}


def _unavailable(why: str) -> Dict[str, Any]:
    return _attr(None, "unknown", why)


# --------------------------------------------------------------------------------------------------------- location
def score_location(a: Profile, b: Profile, cfg: Dict[str, Any], b_label: str = "the other record's location") -> Dict[str, Any]:
    """Distance when both places are pinned; otherwise only whether they are in the same subdivision. Never a reason to reject."""
    d = cfg["distance"]
    pa, pb = valid_point(a.lat, a.lng), valid_point(b.lat, b.lng)
    if pa and pb:
        m = haversine_m(pa[0], pa[1], pb[0], pb[1])
        if m <= d["very_near"]:
            cls, score = "Very Near", 100
        elif m <= d["nearby"]:
            cls, score = "Nearby", 85
        elif m <= d["same_area"] or (a.subdivision_id and a.subdivision_id == b.subdivision_id):
            cls, score = "Same Subdivision", 65
        else:
            # Farther away lowers the score gently (animals wander, owners move); it never reaches zero
            cls, score = "Farther Away", max(20, 50 - (m - d["same_area"]) / 200)
        dist = f"{m} m" if m < 1000 else f"{m / 1000:.1f} km"
        return _attr(score, "match" if score >= 85 else "similar" if score >= 60 else "differs",
                     f"{cls}: approximately {dist} from {b_label}.", proximity=cls, distance_m=m)
    if a.subdivision_id and b.subdivision_id:
        if a.subdivision_id == b.subdivision_id:
            return _attr(60, "similar", "Same Subdivision: both records are in the same subdivision (no exact distance: a location pin is missing).",
                         proximity="Same Subdivision", distance_m=None)
        return _attr(35, "differs", "Farther Away: the records are in different subdivisions (no exact distance).", proximity="Farther Away", distance_m=None)
    return dict(_unavailable("Location could not be compared: a location is missing."), proximity="Unknown", distance_m=None)


# ------------------------------------------------------------------------------------------------------------ breed
_UNKNOWN_BREED = {"", "unknown", "not sure", "unsure", "none", "n/a", "na", "-", "not known", "no idea", "undetermined", "unspecified", "other"}
# canonical name <- spellings and local names
_BREED_ALIASES: Dict[str, Tuple[str, ...]] = {
    "aspin": ("aspin", "askal", "asong pinoy", "asong kalye", "philippine native dog", "native dog", "local dog", "street dog"),
    "puspin": ("puspin", "pusang pinoy", "pusakal", "philippine native cat", "native cat", "local cat", "domestic shorthair", "dsh",
               "domestic short hair", "domestic medium hair", "domestic longhair", "domestic long hair"),
    "mixed": ("mixed", "mixed breed", "mix", "mixbreed", "mixed-breed", "crossbreed", "cross breed", "cross", "mongrel", "mutt", "halfbreed", "half breed"),
    "shih tzu": ("shih tzu", "shihtzu", "shi tzu", "shitzu", "shih-tzu", "shih zu"),
    "labrador retriever": ("labrador", "labrador retriever", "lab", "labrador retreiver"),
    "golden retriever": ("golden retriever", "golden", "golden retreiver"),
    "german shepherd": ("german shepherd", "german shepard", "gsd", "alsatian"),
    "siberian husky": ("husky", "siberian husky", "siberian huskie"),
    "chihuahua": ("chihuahua", "chiwawa", "chihuahwa"),
    "pomeranian": ("pomeranian", "pom", "pomeranean"),
    "poodle": ("poodle", "toy poodle", "miniature poodle"),
    "beagle": ("beagle",),
    "dachshund": ("dachshund", "dachsund", "daschund", "wiener dog", "sausage dog"),
    "pug": ("pug",),
    "belgian malinois": ("belgian malinois", "malinois"),
    "rottweiler": ("rottweiler", "rotweiler", "rottie"),
    "japanese spitz": ("japanese spitz", "spitz"),
    "maltese": ("maltese",),
    "persian": ("persian", "persian cat"),
    "siamese": ("siamese", "siamese cat"),
    "british shorthair": ("british shorthair", "british short hair"),
    "maine coon": ("maine coon", "mainecoon"),
}
_ALIAS_TO_BREED = {alias: canon for canon, aliases in _BREED_ALIASES.items() for alias in aliases}
_NATIVE_OR_MIXED = {"aspin", "puspin", "mixed"}


def normalize_breed(raw: Optional[str]) -> Tuple[Optional[str], bool]:
    """Strict breed normalization: trim, collapse spaces, lowercase. Returns (normalized_breed or None, False)."""
    t = re.sub(r"\s+", " ", (raw or "").strip().lower())
    if t in _UNKNOWN_BREED:
        return None, False
    return t, False


def score_breed(a: Profile, b: Profile) -> Dict[str, Any]:
    ba, _ = normalize_breed(a.breed)
    bb, _ = normalize_breed(b.breed)
    if ba is None or bb is None:
        return dict(_unavailable("Insufficient breed information: the breed is not recorded on both records."), a=a.breed or None, b=b.breed or None)
    la, lb = (a.breed or "").strip(), (b.breed or "").strip()
    if ba == bb:
        return _attr(100, "match", f"Exact breed match: both records say {la}.", a=la, b=lb)
    return _attr(0, "differs", f"Breed mismatch: {la} vs {lb}.", a=la, b=lb)


# ------------------------------------------------------------------------------------------------------------- coat
# colour word -> family. Order matters for multi-word names (checked first).
_COLOR_WORDS: List[Tuple[str, str]] = [
    ("light brown", "tan"), ("dark brown", "brown"), ("golden brown", "golden"), ("reddish brown", "brown"), ("off white", "white"), ("off-white", "white"),
    ("black", "black"), ("charcoal", "black"), ("ebony", "black"),
    ("white", "white"), ("ivory", "white"), ("snow", "white"),
    ("cream", "cream"), ("beige", "cream"), ("buff", "cream"), ("sand", "cream"), ("wheaten", "cream"),
    ("grey", "grey"), ("gray", "grey"), ("silver", "grey"), ("slate", "grey"), ("ash", "grey"), ("blue", "grey"),
    ("brown", "brown"), ("chocolate", "brown"), ("chestnut", "brown"), ("mahogany", "brown"), ("liver", "brown"), ("coffee", "brown"),
    ("tan", "tan"), ("fawn", "tan"), ("caramel", "tan"), ("sable", "tan"), ("honey", "tan"),
    ("golden", "golden"), ("gold", "golden"), ("yellow", "golden"), ("blonde", "golden"), ("apricot", "golden"), ("amber", "golden"),
    ("orange", "orange"), ("ginger", "orange"), ("red", "orange"), ("rust", "orange"), ("copper", "orange"), ("cinnamon", "orange"),
]
# families that are close to each other (partial credit)
_NEAR_COLORS = {frozenset(p) for p in [("white", "cream"), ("cream", "tan"), ("tan", "golden"), ("tan", "brown"), ("golden", "orange"), ("black", "grey"),
                                       ("brown", "orange")]}
_PATTERN_WORDS: List[Tuple[str, str]] = [
    ("tortoiseshell", "tortoiseshell"), ("tortie", "tortoiseshell"), ("calico", "calico"), ("tuxedo", "tuxedo"), ("tabby", "tabby"),
    ("striped", "striped"), ("stripes", "striped"), ("brindle", "brindle"), ("merle", "merle"), ("dapple", "merle"), ("tricolor", "tricolor"),
    ("tri-color", "tricolor"), ("tricolour", "tricolor"), ("bicolor", "bicolor"), ("bi-color", "bicolor"), ("bicolour", "bicolor"),
    ("spotted", "spotted"), ("spots", "spotted"), ("speckled", "spotted"), ("roan", "spotted"), ("patched", "patched"), ("patches", "patched"),
    ("patch", "patched"), ("piebald", "patched"), ("markings", "markings"), ("solid", "solid"), ("plain", "solid"),
]
_MARKING_PHRASE = re.compile(r"\b(?:\w+\W+)?(?:chest|bib|breast|paws?|socks?|feet|foot|mittens|tail\W+tip|tip|face|muzzle|snout|nose|ears?|belly|"
                             r"forehead|blaze|eyes?)\b", re.I)
_PATTERN_COMPATIBLE = {frozenset(p) for p in [("patched", "bicolor"), ("tuxedo", "bicolor"), ("patched", "spotted"), ("tabby", "striped"),
                                              ("calico", "tricolor"), ("tortoiseshell", "calico"), ("patched", "markings"), ("spotted", "markings")]}


def coat_of(colors: Iterable[str], color_text: Optional[str] = None, pattern_texts: Iterable[Optional[str]] = ()) -> Tuple[List[str], Set[str]]:
    """
    (colour families in the order first named, coat patterns). Colours come from the colour tags, or from `color_text` when there are no
    tags (a description's "white chest" is a marking, not the coat). Patterns are read from tags and descriptions. "light brown" is not
    also "brown".
    """
    fams: List[str] = []
    pats: Set[str] = set()
    # "a white chest", "white socks", "a white tip on the tail" are markings (compared as the description), not the coat's colours
    color_sources = [_MARKING_PHRASE.sub(" ", c) for c in ([c for c in colors if c] or ([color_text] if color_text else []))]
    for text in [*color_sources, *pattern_texts]:
        t = f" {(text or '').lower()} "
        for word, fam in _PATTERN_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", t):
                pats.add(fam)
    for text in color_sources:
        t = f" {(text or '').lower()} "
        found: List[Tuple[int, str]] = []                 # (position, family): the first colour named is the main one
        for word, fam in _COLOR_WORDS:
            rx = rf"\b{re.escape(word)}\b"
            for mt in re.finditer(rx, t):
                found.append((mt.start(), fam))
            t = re.sub(rx, lambda mt: " " * len(mt.group(0)), t)   # same length: later positions stay true
        fams.extend(fam for _pos, fam in sorted(found))
    if len(dict.fromkeys(fams)) >= 3 and not pats & {"calico", "tortoiseshell"}:
        pats.add("tricolor")
    return list(dict.fromkeys(fams)), pats


def _color_words(fams: List[str]) -> str:
    return " and ".join(fams) if len(fams) <= 2 else ", ".join(fams[:-1]) + " and " + fams[-1]


def normalize_colours(colors: Iterable[str], color_text: Optional[str] = None) -> List[str]:
    """Normalize individual colour tokens by trimming spaces and lowercasing."""
    raw_items: List[str] = []
    for c in colors or ():
        if c:
            raw_items.extend(re.split(r"[,/&+·]+|\band\b|\bwith\b", str(c), flags=re.IGNORECASE))
    if color_text:
        raw_items.extend(re.split(r"[,/&+·]+|\band\b|\bwith\b", str(color_text), flags=re.IGNORECASE))
    out: List[str] = []
    for item in raw_items:
        clean = re.sub(r"\s+", " ", item.strip().lower())
        if clean and clean not in _UNKNOWN_BREED and clean not in out:
            out.append(clean)
    return out


def score_coat(a: Profile, b: Profile, text_a: Optional[str] = None, text_b: Optional[str] = None) -> Dict[str, Any]:
    """
    Colours compared using set intersection (at least one common colour required for compatibility).
    """
    fa = normalize_colours(a.colors, text_a)
    fb = normalize_colours(b.colors, text_b)
    if not fa:
        fa, _ = coat_of(a.colors, text_a, ())
    if not fb:
        fb, _ = coat_of(b.colors, text_b, ())
    if not fa or not fb:
        return dict(_unavailable("Coat colour could not be compared: colours are not recorded on both records."), a=fa, b=fb)
    sa, sb = set(fa), set(fb)
    shared = sa.intersection(sb)
    if not shared:
        return _attr(0, "differs", f"Different coat colours (no common colour): {_color_words(fa)} vs {_color_words(fb)}.", a=fa, b=fb, patterns_a=[], patterns_b=[])
    union = len(sa | sb)
    color_score = 100.0 if sa == sb else min(100.0, 50.0 + 50.0 * (len(shared) / union))
    if shared == sa == sb:
        text = f"Coat colour match: both records describe a {_color_words(fa)} animal."
    else:
        text = f"Partial coat colour match: both mention {_color_words(sorted(shared))} ({_color_words(fa)} vs {_color_words(fb)})."
    verdict = "match" if color_score >= 80 else "similar"
    return _attr(color_score, verdict, text, a=fa, b=fb, patterns_a=[], patterns_b=[])


# ------------------------------------------------------------------------------------------------------ description
# (id, label, weight, regex). Weight 3: distinctive (identifies an individual); 1: generic (many animals share it).
_W = r"(?:\w+\W+){0,3}?"
_DESC_FEATURES: List[Tuple[str, str, int, str]] = [
    ("white-chest", "a white chest marking", 3, rf"white\W+{_W}(?:chest|bib|breast)|(?:chest|bib|breast)\W+{_W}white"),
    ("chest-mark", "a chest marking", 2, rf"(?:patch|mark|marking|spot|blaze)\W+{_W}(?:chest|breast)|(?:chest|breast)\W+{_W}(?:patch|mark|marking|spot)"),
    ("eye-mark", "a mark near an eye", 3, rf"(?:spot|mark|marking|patch|ring|circle|mask)\W+{_W}(?:eye|eyes)|(?:eye|eyes)\W+{_W}(?:spot|mark|marking|patch|ring|circle)"),
    ("left-eye-mark", "a mark near the left eye", 3, rf"(?:spot|mark|marking|patch)\W+{_W}left\W+eye|left\W+eye\W+{_W}(?:spot|mark|marking|patch)"),
    ("right-eye-mark", "a mark near the right eye", 3, rf"(?:spot|mark|marking|patch)\W+{_W}right\W+eye|right\W+eye\W+{_W}(?:spot|mark|marking|patch)"),
    ("face-blaze", "a blaze or stripe on the face", 3, r"\bblaze\b|(?:white|light)\W+(?:\w+\W+){0,2}?(?:stripe|line)\W+(?:\w+\W+){0,2}?(?:face|forehead|nose|muzzle)"),
    ("dark-muzzle", "a dark muzzle or mask", 2, r"(?:black|dark)\W+(?:\w+\W+){0,1}?(?:muzzle|snout|mask|face)"),
    ("white-paw", "white paws or socks", 2, rf"white\W+{_W}(?:paws?|socks?|feet|foot|legs?)|(?:paws?|socks?|feet|foot)\W+{_W}white|\bsocks\b|\bmittens\b"),
    ("odd-eyes", "eyes of different colours", 3, r"odd[- ]?eyed|heterochromia|one\W+blue\W+eye|different\W+colou?red\W+eyes"),
    ("blue-eyes", "blue eyes", 2, r"\bblue\W+eyes?\b"),
    ("green-eyes", "green eyes", 2, r"\bgreen\W+eyes?\b"),
    ("amber-eyes", "amber or yellow eyes", 1, r"\b(?:amber|yellow|golden)\W+eyes?\b"),
    ("brown-eyes", "brown eyes", 1, r"\bbrown\W+eyes?\b"),
    ("one-eye", "a missing or blind eye", 3, r"one\W+eye(?:d)?\b|missing\W+(?:an?\W+)?eye|blind\W+(?:in\W+)?(?:one|left|right)|cloudy\W+eye"),
    ("notched-ear", "a notched or torn ear", 3, rf"(?:notch(?:ed)?|torn|cut|clipped|tipped)\W+{_W}ear|ear\W+{_W}(?:notch|tear|torn|cut|clipped|tip)"),
    ("floppy-ears", "floppy ears", 1, r"(?:floppy|droopy|dropped|folded|hanging)\W+ears?"),
    ("erect-ears", "erect or pointed ears", 1, r"(?:erect|pointed|pointy|upright|standing|prick(?:ed)?)\W+ears?"),
    ("one-ear-up", "one ear up and one down", 3, r"one\W+ear\W+(?:up|down|floppy|erect)"),
    ("short-tail", "a short or stub tail", 2, r"short(?:\W+\w+){0,2}\W+tail|stub(?:by)?\W+tail|bob(?:bed)?\W*tail|\bno\W+tail\b|docked"),
    ("curled-tail", "a curled tail", 1, r"curl(?:ed|y)\W+tail|tail\W+(?:\w+\W+){0,2}?curl"),
    ("kinked-tail", "a kinked or bent tail", 3, r"(?:kink(?:ed)?|bent|crooked|broken)\W+tail|tail\W+(?:\w+\W+){0,2}?(?:kink|bent|crooked)"),
    ("white-tip-tail", "a white tip on the tail", 3, r"white\W+tip|tail\W+(?:\w+\W+){0,2}?white\W+(?:tip|end)"),
    ("scar", "a scar", 3, r"\bscar(?:red|s)?\b"),
    ("limp", "a limp or injured leg", 2, r"\blimp(?:s|ing)?\b|injured\W+(?:\w+\W+){0,1}?leg|three\W+legged|missing\W+(?:a\W+)?leg"),
    ("spots", "spots", 1, r"\bspot(?:s|ted)\b"),
    ("patches", "patches", 1, r"\bpatch(?:es|ed)?\b"),
    ("long-fur", "long fur", 1, r"\blong\W+(?:\w+\W+){0,1}?(?:fur|hair|coat)|long[- ]?haired|fluffy|shaggy"),
    ("short-fur", "short fur", 1, r"\bshort\W+(?:\w+\W+){0,1}?(?:fur|hair|coat)|short[- ]?haired|smooth\W+coat"),
    ("curly-fur", "curly fur", 2, r"\bcurly\b|\bwavy\b"),
    ("thin", "a thin body", 1, r"\b(?:thin|skinny|underweight|bony)\b"),
    ("stocky", "a stocky body", 1, r"\b(?:stocky|chubby|fat|overweight|plump)\b"),
    ("collar", "a collar", 1, r"\bcollar\b|\bharness\b"),
    ("tag", "a tag or microchip", 2, r"\b(?:name\W+)?tag\b|\bmicrochip"),
]
_DESC_RX = [(fid, label, w, re.compile(rx, re.I)) for fid, label, w, rx in _DESC_FEATURES]
DESC_LABELS = {fid: label for fid, label, _, _ in _DESC_FEATURES}
DESC_WEIGHTS = {fid: w for fid, _, w, _ in _DESC_FEATURES}
# characteristics that cannot both be true of one animal
_CONFLICTS = [("floppy-ears", "erect-ears"), ("long-fur", "short-fur"), ("left-eye-mark", "right-eye-mark"), ("thin", "stocky"),
              ("blue-eyes", "brown-eyes"), ("green-eyes", "brown-eyes")]
_SIZE_ORDER = {"small": 0, "medium": 1, "large": 2}
_NO_COLLAR = re.compile(r"\b(?:no|without|missing|not wearing(?: a)?)\s+(?:a\s+)?(?:collar|harness|tag)\b", re.I)
_STOP = set("a an the and or with of on in at near its his her it is was has had very some small medium large big little dog cat animal pet "
            "color colour fur coat body looks like seen found lost white black brown grey gray tan golden cream orange around about".split())


def features_of(*texts: Optional[str]) -> Set[str]:
    blob = " ".join(t for t in texts if t)
    no_collar = bool(_NO_COLLAR.search(blob))
    out = {fid for fid, _l, _w, rx in _DESC_RX if rx.search(blob)}
    if no_collar:
        out -= {"collar", "tag"}
    if out & {"left-eye-mark", "right-eye-mark"}:
        out.discard("eye-mark")                  # "a mark near the left eye" already says it
    if "white-chest" in out:
        out.discard("chest-mark")
    return out


def size_of(raw: Optional[str], *texts: Optional[str]) -> Optional[str]:
    t = (raw or "").strip().lower()
    if t in _SIZE_ORDER:
        return t
    blob = " ".join(x for x in texts if x).lower()
    m = re.search(r"\b(small|medium|large|big|tiny|huge)(?:-sized|\s+sized)?\b", blob)
    if not m:
        return None
    return {"big": "large", "huge": "large", "tiny": "small"}.get(m.group(1), m.group(1))


def _content_words(*texts: Optional[str]) -> Set[str]:
    words = re.findall(r"[a-z]{4,}", " ".join(t for t in texts if t).lower())
    return {w.rstrip("s") for w in words if w not in _STOP}


def score_description(a: Profile, b: Profile) -> Dict[str, Any]:
    """
    Distinctive characteristics both descriptions mention (scars, eye marks, ear notches count more than "floppy ears" or "short fur"),
    against characteristics they disagree on. Only what is written is compared: nothing is inferred from a photo or invented.
    """
    fa, fb = features_of(*a.texts), features_of(*b.texts)
    sa, sb = size_of(a.size, *a.texts), size_of(b.size, *b.texts)
    if sa:
        fa.add(f"size-{sa}")
    if sb:
        fb.add(f"size-{sb}")
    if not fa or not fb:
        # no recognizable characteristic on one side: compare wording only when both wrote enough, and never score it high
        wa, wb = _content_words(*a.texts), _content_words(*b.texts)
        if len(wa) >= 4 and len(wb) >= 4:
            j = len(wa & wb) / len(wa | wb)
            common = sorted(wa & wb)[:4]
            return _attr(min(60, 100 * j * 1.5), "similar" if j >= 0.2 else "differs",
                         ("Descriptions share some wording: " + ", ".join(common) + ".") if common else "The descriptions have no characteristics in common.",
                         shared=[], conflicts=[])
        return dict(_unavailable("Physical description could not be compared: a description of the animal is missing or too short."), shared=[], conflicts=[])

    def w(fid: str) -> int:
        return 1 if fid.startswith("size-") else DESC_WEIGHTS.get(fid, 1)

    def label(fid: str) -> str:
        return f"a {fid[5:]} size" if fid.startswith("size-") else DESC_LABELS.get(fid, fid)

    shared = fa & fb
    conflicts = [(x, y) for x, y in _CONFLICTS if (x in fa and y in fb) or (y in fa and x in fb)]
    if sa and sb and sa != sb:
        conflicts.append((f"size-{sa}", f"size-{sb}"))
        if abs(_SIZE_ORDER[sa] - _SIZE_ORDER[sb]) == 2:
            conflicts.append((f"size-{sa}", f"size-{sb}"))      # small vs large: counts twice
    conflict_w = sum(max(w(x), w(y)) for x, y in conflicts)
    shared_w = sum(w(f) for f in shared)
    # credit: what both share, out of the distinctive weight the smaller description offers (a short description is not punished
    # for what it did not mention), minus contradictions
    base_w = max(1, min(sum(w(f) for f in fa), sum(w(f) for f in fb)))
    score = 100 * shared_w / base_w - 25 * conflict_w / base_w
    distinctive = sorted((f for f in shared if w(f) >= 2), key=lambda f: -w(f))
    generic = sorted(f for f in shared if w(f) < 2)
    if shared:
        text = "Description match: both records mention " + ", ".join(label(f) for f in [*distinctive, *generic][:5]) + "."
        if not distinctive:
            text = "Generic description overlap only: both mention " + ", ".join(label(f) for f in generic[:4]) + " (common to many animals)."
            score = min(score, 55)
    else:
        text = "No physical characteristic is mentioned by both records."
    if conflicts:
        text += " Differences: " + "; ".join(f"{label(x)} vs {label(y)}" for x, y in dict.fromkeys(conflicts)) + "."
    verdict = "match" if score >= 70 else "similar" if score >= 35 else "differs"
    return _attr(score, verdict, text, shared=[label(f) for f in [*distinctive, *generic]],
                 conflicts=[f"{label(x)} vs {label(y)}" for x, y in dict.fromkeys(conflicts)])


# ------------------------------------------------------------------------------------------------------------ visual
def score_visual(vision: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The stored Gemini Vision comparison of the two photos. Without one (no photo, AI turned off, not run yet) it is not compared."""
    if not vision or vision.get("individual_similarity_score") is None:
        return _unavailable("Visual similarity not available: no AI photo comparison was made for this pair.")
    s = max(0, min(100, int(float(vision["individual_similarity_score"]))))
    reason = (vision.get("reason") or "").strip().rstrip(".")
    text = f"Visual similarity {s}% (AI photo comparison" + (f": {reason})." if reason else ").")
    return _attr(s, "match" if s >= 70 else "similar" if s >= 50 else "differs", text,
                 assessment=vision.get("final_assessment"), model=vision.get("_model"),
                 corroborations=list(vision.get("visual_corroborations") or [])[:4], contradictions=list(vision.get("visual_contradictions") or [])[:4])


# ----------------------------------------------------------------------------------------------------------- combine
def combine(attrs: Dict[str, Dict[str, Any]], cfg: Optional[Dict[str, Any]] = None, *, excluded: Optional[str] = None,
            caps: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    The weighted average of the attributes that could be compared, how much of the comparison that was, the classification and the
    explanations. `excluded`: a hard rule failed (a different kind of animal): score 0, nothing suggested. `caps`: reasons that keep the
    candidate at Low Similarity whatever its score (e.g. found before it was last seen).
    """
    cfg = cfg or DEFAULT_CONFIG
    weights, t = cfg["weights"], cfg["thresholds"]
    total_w = sum(weights[a] for a in ATTRIBUTES) or 1
    available = [a for a in ATTRIBUTES if attrs.get(a, {}).get("score") is not None and weights[a] > 0]
    avail_w = sum(weights[a] for a in available)
    coverage = round(100 * avail_w / total_w)
    out_attrs: Dict[str, Dict[str, Any]] = {}
    for a in ATTRIBUTES:
        row = dict(attrs.get(a) or _unavailable("Not compared."))
        row["label"] = ATTRIBUTE_LABELS[a]
        row["weight"] = weights[a]
        row["effective_weight"] = round(100 * weights[a] / avail_w, 1) if a in available and avail_w else 0
        row["available"] = a in available
        out_attrs[a] = row
    raw = sum(weights[a] * out_attrs[a]["score"] for a in available) / avail_w if avail_w else None
    score = 0
    reduced = False
    if raw is not None:
        score = raw
        full = t["full_evidence_coverage"]
        if coverage < full and full > 0:
            score = raw * coverage / full          # one or two attributes are not a full comparison: no inflated percentage
            reduced = True
        score = int(round(score))
    if excluded:
        cls, score = "excluded", 0
    elif len(available) < t["min_attributes"] or coverage < t["min_coverage"]:
        cls = "insufficient"
    elif caps:
        cls = "low"
    elif score >= t["strong"] and len(available) >= t["strong_min_attributes"] and coverage >= t["strong_min_coverage"]:
        cls = "strong"
    elif score >= t["potential"]:
        cls = "potential"
    else:
        cls = "low"
    explanations = [out_attrs[a]["explanation"] for a in sorted(available, key=lambda a: -(out_attrs[a]["score"] or 0) * weights[a])]
    unavailable = [out_attrs[a]["explanation"] for a in ATTRIBUTES if a not in available]
    notes: List[str] = []
    if excluded:
        notes.append(excluded)
    for c in caps or []:
        notes.append(c)
    if reduced:
        notes.append(f"Only {coverage}% of the comparison information was available, so the overall similarity was reduced accordingly.")
    return {
        "algorithm": ALGORITHM, "score": score, "raw_score": None if raw is None else int(round(raw)), "coverage": coverage,
        "attributes_compared": len(available), "attributes_total": len(ATTRIBUTES),
        "classification": cls, "classification_label": CLASS_LABELS[cls],
        "attributes": out_attrs, "explanations": explanations, "unavailable": unavailable, "notes": notes,
        "weights": dict(weights), "thresholds": dict(t),
        "disclaimer": "Similarity is a suggestion for review, not a probability of ownership. Only an authorized person can verify a match.",
    }


def analyze(a: Profile, b: Profile, cfg: Optional[Dict[str, Any]] = None, *, vision: Optional[Dict[str, Any]] = None,
            b_label: str = "the other record's location", caps: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Mandatory validation sequence BEFORE calculating overall similarity:
      1. Animal species/type compatibility.
      2. Strict exact breed compatibility after normalization.
      3. Partial colour compatibility (at least one common colour via set intersection).
    Missing mandatory breed or colour classifies as Insufficient Information (score 0).
    """
    cfg = cfg or DEFAULT_CONFIG
    sa = (a.species or "").strip().lower()
    sb = (b.species or "").strip().lower()
    if not sa or not sb or sa == "unknown" or sb == "unknown":
        res = combine({}, cfg)
        res["classification"] = "insufficient"
        res["classification_label"] = CLASS_LABELS["insufficient"]
        res["score"] = 0
        res["notes"] = ["Insufficient Information: animal species/type is missing on one or both records."]
        return res
    if sa != sb:
        return combine({}, cfg, excluded=f"Different kind of animal: {a.species} and {b.species}.")

    breed_attr = score_breed(a, b)
    if breed_attr["score"] is None:
        res = combine({"breed": breed_attr}, cfg)
        res["classification"] = "insufficient"
        res["classification_label"] = CLASS_LABELS["insufficient"]
        res["score"] = 0
        res["notes"] = ["Insufficient Information: breed is missing on one or both records."]
        return res
    if breed_attr["score"] == 0:
        return combine({"breed": breed_attr}, cfg, excluded=breed_attr["explanation"])

    coat_attr = score_coat(a, b)
    if coat_attr["score"] is None:
        res = combine({"breed": breed_attr, "coat": coat_attr}, cfg)
        res["classification"] = "insufficient"
        res["classification_label"] = CLASS_LABELS["insufficient"]
        res["score"] = 0
        res["notes"] = ["Insufficient Information: coat colour is missing on one or both records."]
        return res
    if coat_attr["score"] == 0:
        return combine({"breed": breed_attr, "coat": coat_attr}, cfg, excluded=coat_attr["explanation"])

    attrs = {
        "visual": score_visual(vision),
        "location": score_location(a, b, cfg, b_label),
        "breed": breed_attr,
        "coat": coat_attr,
        "description": score_description(a, b),
    }
    return combine(attrs, cfg, caps=caps)


def level_of(classification: str) -> str:
    """The stored level of a lost/found suggestion: strong | possible | none (none is never stored)."""
    return {"strong": "strong", "potential": "possible"}.get(classification, "none")
