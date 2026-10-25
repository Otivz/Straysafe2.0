"""
One-time move of bite / chasing answers that no verified report supports into the declared_* columns.

Before declared_bite_history and declared_chase_behavior existed, an owner's "has bitten before" was stored in the
verified columns (has_bite_history, chase_behavior). This script keeps every such answer as a declaration, then recounts
the verified history from verified incident reports (case_groups.refresh_pet_behavior). No answer is lost: anything
removed from the verified columns is copied to the declared ones first.

Run from the backend folder, after backing up the database:
    ..\\.venv\\Scripts\\python.exe scripts/split_declared_behavior.py            # dry run: prints the changes, saves nothing
    ..\\.venv\\Scripts\\python.exe scripts/split_declared_behavior.py --apply    # saves them
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.utils.case_groups import refresh_pet_behavior, verified_pet_behavior  # noqa: E402


def plan(db, pet):
    """The changes this pet needs, as {field: (old, new)}."""
    bites, chases, aggressive = verified_pet_behavior(db, pet)
    changes = {}
    if (bites or aggressive) and pet.temperament != "Aggressive":
        changes["temperament"] = (pet.temperament, "Aggressive")
    if pet.has_bite_history and bites == 0 and not pet.declared_bite_history:
        changes["declared_bite_history"] = (False, True)
    if pet.chase_behavior and chases == 0 and not pet.declared_chase_behavior:
        changes["declared_chase_behavior"] = (False, True)
    for field, new in (("has_bite_history", bites > 0), ("bite_incident_count", bites),
                       ("chase_behavior", chases > 0), ("chase_incident_count", chases)):
        old = getattr(pet, field)
        if (int(old or 0) if field.endswith("_count") else bool(old)) != new:
            changes[field] = (old, new)
    return changes


def main(apply: bool) -> int:
    db = SessionLocal()
    try:
        pets = db.query(Pet).filter((Pet.has_bite_history == True) | (Pet.chase_behavior == True)  # noqa: E712
                                    | (Pet.bite_incident_count > 0) | (Pet.chase_incident_count > 0)).all()
        changed = 0
        for pet in pets:
            changes = plan(db, pet)
            if not changes:
                continue
            changed += 1
            print(f"Pet #{pet.pet_id} ({pet.pet_name or 'unnamed'}): " +
                  ", ".join(f"{k} {old} -> {new}" for k, (old, new) in changes.items()))
            if apply:
                if "declared_bite_history" in changes:
                    pet.declared_bite_history = True
                if "declared_chase_behavior" in changes:
                    pet.declared_chase_behavior = True
                refresh_pet_behavior(db, pet)
        print(f"\n{len(pets)} pets with bite or chasing data checked; {changed} need changes.")
        if apply:
            db.commit()
            print("Saved.")
        else:
            db.rollback()
            print("Dry run: nothing saved. Back up the database, then run again with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main("--apply" in sys.argv[1:]))
