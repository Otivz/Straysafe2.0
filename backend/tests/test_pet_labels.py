"""
Animal Reference Codes: unnamed animals are shown as "Animal SS-0042" with a description, never by their pet_id.
Throwaway SQLite DB.  Run from the backend folder:  python tests/test_pet_labels.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "pet_labels_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pet-labels-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.system_setting import SystemSetting  # noqa: E402
from app.schemas.pet import PetResponse  # noqa: E402
from app.utils.pet_labels import SEQ_KEY, is_unnamed, pet_display_name  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def mk(**kw):
    kw.setdefault("pet_type", "Dog")
    p = Pet(**kw)
    db.add(p)
    db.commit()
    return p


named = mk(pet_name="Bruno", breed="Aspin", primary_color="Brown", gender="Male", size_category="Medium")
check("every new animal gets a code", named.reference_code == "SS-0001", named.reference_code)
check("a named animal keeps its real name", named.display_name == "Bruno")
check("...with the description below", named.description_line == "Brown Aspin • Male • Medium", named.description_line)

a = mk(pet_name="No Name", breed="Aspin", primary_color="Brown", gender="Male", size_category="Medium")
check("an unnamed animal is 'Animal SS-0002'", a.display_name == "Animal SS-0002", a.display_name)
check("...not its pet_id", f"#{a.pet_id}" not in a.display_name)
b = mk(pet_name="Unknown", breed="Aspin", primary_color="Brown", gender="Male", size_category="Medium")
check("two look-alike animals get different codes", b.display_name == "Animal SS-0003" and a.display_name != b.display_name)

# Permanent: editing the animal does not change its code
a.breed, a.primary_color, a.size_category = "Shih Tzu", "White", "Small"
db.commit()
db.refresh(a)
check("the code stays the same after an edit", a.reference_code == "SS-0002" and a.description_line == "White Shih Tzu • Male • Small", f"{a.reference_code} {a.description_line}")
a.pet_name = "Choco"
db.commit()
check("naming it later shows the name (code kept)", a.display_name == "Choco" and a.reference_code == "SS-0002")

# Codes are never reused, even after the newest animal is deleted
db.delete(b)
db.commit()
c = mk(pet_name="", breed="Aspin", primary_color="Black", size_category="Large")
check("a deleted animal's code is not reused", c.reference_code == "SS-0004", c.reference_code)
check("the counter is stored", db.query(SystemSetting).filter(SystemSetting.setting_key == SEQ_KEY).first().setting_value == "4")

d = mk(pet_name="No Name", reference_code="SS-0099", primary_color="Gray")
check("a restored animal can keep its old code", d.reference_code == "SS-0099")
e = mk(pet_name="No Name", primary_color="golden", size_category="Large")
check("description skips unknowns and uses the species", e.description_line == "Golden Dog • Large", e.description_line)
check("an explicit code doesn't collide with the counter", e.reference_code == "SS-0005", e.reference_code)

check("placeholder names are recognised", all(is_unnamed(x) for x in ["No Name", "unknown", "", None, "Adopted Pet", "Restored Pet"]) and not is_unnamed("Bruno"))
resp = PetResponse.model_validate(c)
check("API responses carry the code, name and description",
      resp.reference_code == "SS-0004" and resp.display_name == "Animal SS-0004" and resp.description_line == "Black Aspin • Large")
check("no animal object -> generic text", pet_display_name(None) == "Registered Pet")
check("the stored name is unchanged", db.get(Pet, c.pet_id).pet_name == "")

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
