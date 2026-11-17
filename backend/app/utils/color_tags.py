"""
Normalization and legacy-compatibility helpers for structured animal/pet colour tags.

Colours from updated forms arrive as a JSON array (`colors` on pets, `animal_colors` on reports),
are deduplicated case-insensitively with whitespace trimmed, and also populate legacy summary strings
(`color_markings`, `animal_color`) so existing matching, notices, and admin views keep working.
"""
import re
from typing import Any, Dict, Iterable, List, Optional

PREDEFINED_ANIMAL_COLORS = (
    "White",
    "Black",
    "Brown",
    "Tan",
    "Cream",
    "Gray",
    "Golden",
    "Orange",
    "Yellow",
    "Red",
    "Mixed",
    "Beige",
    "Ivory",
    "Buff",
    "Fawn",
    "Apricot",
    "Amber",
    "Caramel",
    "Honey",
    "Sand",
    "Chocolate",
    "Chestnut",
    "Mahogany",
    "Cinnamon",
    "Ginger",
    "Rust",
    "Copper",
    "Liver",
    "Sable",
    "Wheaten",
    "Charcoal",
    "Silver",
    "Slate",
    "Ash",
    "Blue",
    "Green",
    "Teal",
    "Pink",
    "Purple",
    "Brindle",
    "Calico",
    "Tabby",
    "Tortoiseshell",
    "Tuxedo",
    "Merle",
    "Tricolor",
    "Bicolor",
    "Spotted",
    "Striped",
    "Speckled",
    "Patched",
    "Roan",
    "Dapple",
)


def _clean_tag(raw: Any) -> str:
    if raw is None:
        return ""
    return " ".join(str(raw).split()).strip()


def normalize_color_tags(
    colors: Optional[Iterable[Any]] = None,
    fallback_text: Optional[str] = None,
) -> List[str]:
    """Return trimmed, case-insensitively deduplicated colour tags from an array or delimited string."""
    raw_items: List[Any] = []
    if colors is not None:
        raw_items = list(colors)
    elif fallback_text:
        raw_items = [part for part in re.split(r"[,;]+", fallback_text) if part and part.strip()]

    out: List[str] = []
    seen = set()
    for item in raw_items:
        cleaned = _clean_tag(item)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned[:50])
    return out


def parse_pet_colors(pet: Any) -> List[str]:
    """Read structured colour tags from a Pet model/object with fallback to legacy columns."""
    arr = getattr(pet, "colors", None)
    if isinstance(arr, list) and arr:
        return normalize_color_tags(arr)
    user_color = _clean_tag(getattr(pet, "color_markings", None))
    if user_color:
        return normalize_color_tags(fallback_text=user_color)
    legacy = [
        _clean_tag(getattr(pet, attr, None))
        for attr in ("primary_color", "secondary_color", "tertiary_color")
    ]
    return normalize_color_tags([c for c in legacy if c])


def parse_report_colors(report: Any) -> List[str]:
    """Read structured colour tags from a Report model/object with fallback to animal_color."""
    arr = getattr(report, "animal_colors", None)
    if isinstance(arr, list) and arr:
        return normalize_color_tags(arr)
    return normalize_color_tags(fallback_text=getattr(report, "animal_color", None))


def apply_pet_color_payload(payload: Dict[str, Any]) -> None:
    """
    Normalize `colors` array and keep `color_markings` synchronized cleanly on Pet create/update dicts.
    Modifies `payload` in place.
    """
    has_colors = "colors" in payload
    has_markings = "color_markings" in payload
    if has_colors:
        raw_colors = payload.get("colors")
        tags = normalize_color_tags(raw_colors) if raw_colors is not None else []
        payload["colors"] = tags or None
        if not has_markings or not _clean_tag(payload.get("color_markings")):
            payload["color_markings"] = (", ".join(tags)[:255] or None) if tags else None
        elif has_markings and payload["colors"] is not None:
            # Prefer structured tags as canonical string when caller sent colors alongside synced summary
            payload["color_markings"] = ", ".join(tags)[:255] or None
    elif has_markings:
        text = _clean_tag(payload.get("color_markings"))
        if text:
            tags = normalize_color_tags(fallback_text=text)
            payload["colors"] = tags or None
            payload["color_markings"] = text[:255]
        elif payload.get("color_markings") is None:
            payload["colors"] = None


def apply_report_color_payload(payload: Dict[str, Any]) -> None:
    """
    Normalize `animal_colors` array and keep `animal_color` synchronized on Report create/update dicts.
    Modifies `payload` in place.
    """
    has_colors = "animal_colors" in payload
    has_text = "animal_color" in payload
    if has_colors:
        raw_colors = payload.get("animal_colors")
        tags = normalize_color_tags(raw_colors) if raw_colors is not None else []
        payload["animal_colors"] = tags or None
        if not has_text or not _clean_tag(payload.get("animal_color")):
            payload["animal_color"] = (", ".join(tags)[:255] or None) if tags else None
    elif has_text:
        text = _clean_tag(payload.get("animal_color"))
        if text:
            payload["animal_color"] = text[:255]
            payload["animal_colors"] = normalize_color_tags(fallback_text=text) or None
        elif payload.get("animal_color") is None:
            payload["animal_colors"] = None
