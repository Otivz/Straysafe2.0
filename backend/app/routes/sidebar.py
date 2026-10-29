"""
Sidebar badge numbers without downloading whole lists (STRAYSAFE_PERFORMANCE_AUDIT.md B4). The sidebars used to fetch
the full claims list every 15 s just to count it.

Same rules as the lists they count:
  pending_claim_ids  the claims GET /claims/ shows this user (claim_visible_to) that are waiting for staff:
                     Pending Review / Evidence Requested / Potential Owner Match. IDs, so the sidebar can still leave
                     out the ones this browser has already viewed.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.user import User
from app.utils.auth import get_current_staff_or_admin

router = APIRouter(prefix="/sidebar", tags=["sidebar"])

PENDING_CLAIM_STATUSES = ("Pending Review", "Evidence Requested", "Potential Owner Match")


@router.get("/badges")
def sidebar_badges(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    from app.routes.claims import claim_visible_to

    claims = (db.query(PetClaim).options(joinedload(PetClaim.pet), joinedload(PetClaim.report))
              .join(Pet, PetClaim.pet_id == Pet.pet_id)
              .filter(Pet.status != "Deceased", PetClaim.status != "Merged",  # same base filters as GET /claims/
                      PetClaim.status.in_(PENDING_CLAIM_STATUSES))
              .all())
    pending_claim_ids = [c.claim_id for c in claims if claim_visible_to(db, current_user, c)]
    return {"pending_claim_ids": pending_claim_ids}
