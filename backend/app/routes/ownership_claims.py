"""
Ownership claims on a found animal, from the resident's side.

A resident of the subdivision claims the animal on its PUBLISHED found-animal notice; they see only their own claims.
The Subdivision Admin reviews them under /cases/{id}/claims (routes/cases.py). A claim never establishes ownership.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session  # noqa: F401  (Session is used in the route signatures)

from app.database import get_db
from app.models.case_records import OwnershipClaim
from app.models.report import Report
from app.models.user import User
from app.schemas.case import ClaimInfoIn, ClaimIn
from app.services import case_claims
from app.utils.auth import get_current_user

router = APIRouter(tags=["ownership-claims"])


@router.post("/reports/{report_id}/ownership-claims", status_code=201)
def submit_claim(report_id: int, body: ClaimIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Claim the found animal on a published notice. Residents of the report's subdivision only."""
    report = db.query(Report).filter(Report.report_id == report_id).first()
    claim = case_claims.submit_claim(db, report, user, body)
    db.commit()
    db.refresh(claim)
    return case_claims.claim_view(db, claim, False)


@router.get("/reports/{report_id}/ownership-claims/mine")
def my_claims(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> List[dict]:
    """The signed-in resident's own claims on this case (never anyone else's)."""
    rows = (db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report_id, OwnershipClaim.claimant_user_id == user.user_id)
            .order_by(OwnershipClaim.claim_id).all())
    return [case_claims.claim_view(db, c, False) for c in rows]


@router.get("/ownership-claims/mine")
def all_my_claims(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> List[dict]:
    """Every claim the signed-in resident has made, newest first (never anyone else's), for their claims list."""
    rows = db.query(OwnershipClaim).filter(OwnershipClaim.claimant_user_id == user.user_id).order_by(OwnershipClaim.claim_id.desc()).all()
    return [{**case_claims.claim_view(db, c, False), "alert_id": c.alert_id, "claimed_pet_id": c.claimed_pet_id} for c in rows]


@router.post("/ownership-claims/{claim_id}/info")
def add_claim_info(claim_id: int, body: ClaimInfoIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The claimant answers an officer who asked for more information. The claim goes back under review."""
    claim = db.query(OwnershipClaim).filter(OwnershipClaim.claim_id == claim_id).first()
    if claim is None or claim.claimant_user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Claim not found.")
    case_claims.add_claim_info(db, claim, user, body.text)
    db.commit()
    db.refresh(claim)
    return case_claims.claim_view(db, claim, False)


@router.post("/ownership-claims/{claim_id}/withdraw")
def withdraw_claim(claim_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claim = db.query(OwnershipClaim).filter(OwnershipClaim.claim_id == claim_id).first()
    if claim is None or claim.claimant_user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Claim not found.")
    case_claims.withdraw_claim(db, claim, user)
    db.commit()
    db.refresh(claim)
    return case_claims.claim_view(db, claim, False)
