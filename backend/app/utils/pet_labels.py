"""
What to call a registered animal on screen.
- Real name:  "Bruno"            with the description "Brown Aspin • Male • Medium" below it.
- No name:    "Animal SS-0042"   (its permanent Animal Reference Code), same description below.
The database pet_id is never used as the visible identifier.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.engine import Connection

UNNAMED = {"", "no name", "noname", "unknown", "unnamed", "unnamed pet", "unnamed animal", "adopted pet", "restored pet",
           "n/a", "na", "none", "-"}
CODE_PREFIX = "SS-"
SEQ_KEY = "pet_reference_seq"


def is_unnamed(name: Optional[str]) -> bool:
    return (name or "").strip().lower() in UNNAMED


def _clean(v: Optional[str]) -> str:
    v = (v or "").strip()
    return "" if v.lower() in UNNAMED else v


def format_code(n: int) -> str:
    return f"{CODE_PREFIX}{n:04d}"


def code_number(code: Optional[str]) -> int:
    try:
        return int((code or "").replace(CODE_PREFIX, "", 1))
    except ValueError:
        return 0


def pet_display_name(pet) -> str:
    if pet is None:
        return "Registered Pet"
    if not is_unnamed(getattr(pet, "pet_name", None)):
        return pet.pet_name.strip()
    code = getattr(pet, "reference_code", None)
    return f"Animal {code}" if code else "Unnamed animal"


def pet_description(pet) -> str:
    """Color Breed • Sex • Size, skipping anything unknown."""
    if pet is None:
        return ""
    colors = []
    for c in (getattr(pet, "primary_color", None), getattr(pet, "secondary_color", None)):
        c = _clean(c)
        if c and c.lower() not in (x.lower() for x in colors):
            colors.append(c.title())
    if not colors and _clean(getattr(pet, "color_markings", None)):
        colors.append(_clean(pet.color_markings).split(",")[0].strip().title())
    breed = _clean(getattr(pet, "breed", None)) or _clean(getattr(pet, "pet_type", None))
    head = " ".join(p for p in (" & ".join(colors), breed) if p)
    parts = [head, _clean(getattr(pet, "gender", None)), _clean(getattr(pet, "size_category", None))]
    return " • ".join(p for p in parts if p)


def next_reference_code(conn: Connection) -> str:
    """Take the next Animal Reference Code. The counter only moves forward, so a deleted animal's code is never reused."""
    from app.models.pet import Pet
    from app.models.system_setting import SystemSetting

    st = SystemSetting.__table__
    row = conn.execute(select(st.c.id, st.c.setting_value).where(st.c.setting_key == SEQ_KEY).with_for_update()).first()
    if row is None:
        codes = conn.execute(select(Pet.__table__.c.reference_code).where(Pet.__table__.c.reference_code.isnot(None))).scalars().all()
        current = max((code_number(c) for c in codes), default=0)
        conn.execute(st.insert().values(setting_key=SEQ_KEY, setting_value=str(current), is_enabled=True,
                                        description="Last issued Animal Reference Code number (SS-0001, SS-0002, ...)"))
        row_id = conn.execute(select(st.c.id).where(st.c.setting_key == SEQ_KEY)).scalar()
    else:
        row_id, current = row[0], int(row[1] or 0)
    n = current + 1
    taken = Pet.__table__.c.reference_code
    while conn.execute(select(taken).where(taken == format_code(n))).first() is not None:
        n += 1
    conn.execute(st.update().where(st.c.id == row_id).values(setting_value=str(n)))
    return format_code(n)
