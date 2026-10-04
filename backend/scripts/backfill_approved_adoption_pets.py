"""
One-off: create the adopter's Pet record for adoptions that were approved BEFORE pets were created at approval.
Only touches Approved applications past the approval stage that have no pet yet and are not closed/unconfirmed.

  python scripts/backfill_approved_adoption_pets.py          # dry run (lists what would change)
  python scripts/backfill_approved_adoption_pets.py --apply  # creates the records
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.report import Adoption  # noqa: E402
from app.routes.adoptions import _ensure_adopted_pet_record  # noqa: E402

APPLY = "--apply" in sys.argv
db = SessionLocal()
rows = db.query(Adoption).filter(
    Adoption.status == "Approved",
    Adoption.created_pet_id.is_(None),
    Adoption.current_stage.in_(("Approval", "Certificate", "Handover", "Monitoring")),
).all()
for a in rows:
    print(f"adoption #{a.adoption_id} (stage {a.current_stage}, applicant {a.applicant_id}) -> would create a pet record")
    if APPLY:
        pet = _ensure_adopted_pet_record(a, db)
        print(f"   created pet #{pet.pet_id if pet else None}")
if APPLY:
    db.commit()
print(f"{len(rows)} application(s) {'updated' if APPLY else 'found (dry run; use --apply)'}")
db.close()
