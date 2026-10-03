"""
One-time repair: before two-way match confirmation, a staff confirmation linked a report to a
registered pet immediately. Where the pet owner has since said "not my pet", close the match as
NOT_A_MATCH and remove that link so the report can be recorded as a new animal
('Add Record for this Animal' becomes available again).

Safe to re-run: only touches owner-rejected matches that are not yet NOT_A_MATCH or are still linked.
Run from the backend folder:  python scripts/unlink_owner_rejected_matches.py [--dry-run]
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import joinedload  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.pet_history import PetHistory  # noqa: F401,E402 — registers mapper
from app.models.pet_qr import PetQRScan  # noqa: F401,E402 — registers mapper
from app.routes.matches import unlink_pet_match  # noqa: E402


def main(dry_run: bool) -> None:
    db = SessionLocal()
    try:
        matches = (
            db.query(ReportMatch)
            .options(joinedload(ReportMatch.source_report), joinedload(ReportMatch.matched_pet))
            .filter(
                ReportMatch.matched_pet_id.isnot(None),
                ReportMatch.owner_confirmation_status == "OWNER_REJECTED",
            )
            .all()
        )
        fixed = 0
        for m in matches:
            is_linked = bool(m.source_report and m.source_report.pet_id == m.matched_pet_id)
            needs_status = m.status != "NOT_A_MATCH"
            if not (is_linked or needs_status):
                continue
            owner = db.query(User).filter(User.user_id == m.matched_pet.owner_id).first() if m.matched_pet else None
            print(
                f"Report #{m.source_report_id} / Pet #{m.matched_pet_id} (match #{m.match_id}): "
                f"status {m.status} -> NOT_A_MATCH{', unlink pet' if is_linked else ''}"
            )
            if dry_run:
                continue
            if needs_status:
                m.status = "NOT_A_MATCH"
                m.verification_notes = m.verification_notes or "Owner confirmed this is not their pet."
            if is_linked and owner:
                unlink_pet_match(
                    m, db, owner,
                    reason=f"Owner {owner.name} reported this is not their pet.",
                    actor_role="Owner"
                )
            fixed += 1
        if dry_run:
            print("Dry run — no changes written.")
        else:
            db.commit()
            print(f"Repaired {fixed} match(es).")
    finally:
        db.close()


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
