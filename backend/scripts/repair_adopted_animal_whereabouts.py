"""
One-off repair of inconsistent animal whereabouts after adoption.

 A) Animals the adopter already took (staff handed over / handover finalized) but that are still tied to a
    holding facility (kennel slot kept, facility link, facility location, 'For Adoption' status) are released.
 B) Other applications still open (Pending/Approved, not handed over) on an animal that another adopter already
    took are closed as Rejected ("animal already adopted").

  python scripts/repair_adopted_animal_whereabouts.py          # dry run
  python scripts/repair_adopted_animal_whereabouts.py --apply  # make the changes
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

from datetime import datetime, timezone  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.report import Adoption, HoldingAnimal  # noqa: E402
from app.routes.adoptions import _handover_finalized, _release_animal_from_facility  # noqa: E402
from app.utils.adoption_assignments import close_open_tasks  # noqa: E402

APPLY = "--apply" in sys.argv
db = SessionLocal()
changed = 0

# A) taken by the adopter but still shown in a facility
for a in db.query(Adoption).filter(Adoption.staff_handed_over == True).all():  # noqa: E712
    animal = a.animal
    if animal is None:
        continue
    rep = animal.report
    stale = bool(animal.kennel_slot) or animal.facility_status != 7 or bool(rep and rep.facility_id)
    if not stale:
        continue
    print(f"A) animal #{animal.holding_id} (adoption #{a.adoption_id}): kennel={animal.kennel_slot!r} status={animal.facility_status} "
          f"facility_id={rep.facility_id if rep else None} -> release from holding facility")
    changed += 1
    if APPLY:
        _release_animal_from_facility(a, db, a.staff_handover_by, final=_handover_finalized(a))

# B) stale competing applications on an animal that was already taken
taken = {a.holding_id for a in db.query(Adoption).filter(Adoption.staff_handed_over == True).all()}  # noqa: E712
for a in db.query(Adoption).filter(Adoption.status.in_(("Pending", "Approved")), Adoption.holding_id.in_(taken or {-1})).all():
    if a.staff_handed_over:
        continue
    print(f"B) application #{a.adoption_id} ({a.status}/{a.current_stage}) on animal #{a.holding_id} that another adopter already took -> reject")
    changed += 1
    if APPLY:
        a.status = "Rejected"
        a.application_stage_status = "Rejected"
        a.review_notes = "This animal was already adopted by another applicant."
        a.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        close_open_tasks(db, a, "Rejected")

if APPLY:
    db.commit()
print(f"{changed} item(s) {'repaired' if APPLY else 'found (dry run; use --apply)'}")
db.close()
