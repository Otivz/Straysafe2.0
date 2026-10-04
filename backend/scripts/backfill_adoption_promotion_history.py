"""
One-off: add the missing case-timeline entry ("promoted to adoption catalog") for animals that were promoted
before promotions were recorded in the report's status history.

  python scripts/backfill_adoption_promotion_history.py          # dry run
  python scripts/backfill_adoption_promotion_history.py --apply  # insert the entries
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

import app.models  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models.report import HoldingAnimal, StatusHistory  # noqa: E402

APPLY = "--apply" in sys.argv
db = SessionLocal()
added = 0
for animal in db.query(HoldingAnimal).filter(HoldingAnimal.promoted_at.isnot(None)).all():
    rep = animal.report
    if rep is None:
        continue
    exists = db.query(StatusHistory.history_id).filter(
        StatusHistory.report_id == rep.report_id,
        StatusHistory.remarks.like("%promoted to adoption%"),
    ).first()
    if exists:
        continue
    # Use the holding log's time: promoted_at is stored in UTC while the timelines use local time
    promoted_log = next((l for l in animal.timeline if (l.title or '').startswith('Promoted to Adoption')), None)
    promoted_log_time = promoted_log.logged_at if promoted_log else None
    who = animal.promoted_by_user.name if animal.promoted_by_user else "Barangay staff"
    print(f"report #{rep.report_id} (animal #{animal.holding_id}): promoted {animal.promoted_at} by {who} -> add timeline entry")
    added += 1
    if APPLY:
        db.add(StatusHistory(
            report_id=rep.report_id,
            report_status_id=rep.current_status_id,
            updated_by=animal.promoted_by,
            facility_id=rep.facility_id,
            remarks=f"Animal promoted to adoption catalog by {who}. It is now available for adoption applications.",
            created_at=promoted_log_time or animal.promoted_at,
        ))
if APPLY:
    db.commit()
print(f"{added} entr{'y' if added == 1 else 'ies'} {'added' if APPLY else 'found (dry run; use --apply)'}")
db.close()
