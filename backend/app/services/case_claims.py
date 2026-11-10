"""
Ownership claims on a found animal.

A resident who thinks a found animal is theirs submits a claim on the case's published found-animal notice. The
Subdivision Admin reviews it. The rules that matter:

  - a claim is made against a PUBLISHED notice only (an active found-animal alert): an unpublished case is not visible
    to residents, so it cannot be claimed
  - a claim never establishes ownership, and neither does accepting one. Ownership is its own decision, recorded with
    evidence in the case's ownership review (services/case_lifecycle.save_assessment). Accepting a claim only means the
    claim holds up well enough to go on to that step: the case's ownership reads 'under review', never 'confirmed'
  - several residents may claim the same animal: the case then reads 'disputed' until staff decide
  - the person who reported the animal cannot claim it
  - pet registration is declared by the owner, so it is never enough: it is listed as weak evidence
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.case_records import OwnershipClaim
from app.models.lost_pet_alert import LostPetAlert
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.schemas.case import ClaimIn, ClaimReviewIn
from app.services import case_lifecycle as L
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.warning_rules import report_family

ACTIVE = list(V.ACTIVE_CLAIM_STATUSES)


def _now() -> datetime:
    return datetime.now()


def published_found_notice(db: Session, report_id: int) -> Optional[LostPetAlert]:
    return (db.query(LostPetAlert).filter(LostPetAlert.report_id == report_id, LostPetAlert.alert_type == "found_animal",
                                          LostPetAlert.status == "active").first())


def submit_claim(db: Session, report: Optional[Report], claimant: User, data: ClaimIn) -> OwnershipClaim:
    # Residents only see a case through its published notice; anything else is "not found" to them
    notice = published_found_notice(db, report.report_id) if report is not None else None
    if (report is None or claimant.role_id != 1 or claimant.subdivision_id != report.subdivision_id or notice is None):
        raise HTTPException(status_code=404, detail="Found-animal notice not found.")
    if report_family(report) != V.FOUND_ANIMAL:
        raise HTTPException(status_code=409, detail="Ownership claims are for found-animal cases.")
    if case_state.is_closed(report) or report.duplicate_of_report_id:
        raise HTTPException(status_code=409, detail="This case is closed, so it no longer accepts claims.")
    if report.user_id == claimant.user_id:
        raise HTTPException(status_code=409, detail="You reported this animal, so you cannot claim it.")
    if db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report.report_id,
                                       OwnershipClaim.claimant_user_id == claimant.user_id,
                                       OwnershipClaim.status.in_(ACTIVE)).first() is not None:
        raise HTTPException(status_code=409, detail="You already have a claim on this animal under review.")
    unknown = [e for e in data.evidence if e not in V.OWNERSHIP_EVIDENCE]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown evidence: {', '.join(unknown)}.")
    if data.claimed_pet_id is not None:
        pet = db.query(Pet).filter(Pet.pet_id == data.claimed_pet_id).first()
        if pet is None or pet.owner_id != claimant.user_id:
            raise HTTPException(status_code=422, detail="You can only name a pet registered to your own account.")

    claim = OwnershipClaim(report_id=report.report_id, alert_id=notice.alert_id, subdivision_id=report.subdivision_id,
                           claimant_user_id=claimant.user_id, claimed_pet_id=data.claimed_pet_id,
                           statement=data.statement.strip(), evidence=list(dict.fromkeys(data.evidence)),
                           evidence_urls=list(data.evidence_urls), status="submitted")
    db.add(claim)
    db.flush()
    # Claimed, or Disputed when someone else already has an open claim. A confirmed owner is never changed here.
    current = case_state.ownership_of(report)
    if current in ("unknown", "unconfirmed", "claimed", "under_review"):
        others = db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report.report_id, OwnershipClaim.status.in_(ACTIVE),
                                                 OwnershipClaim.claimant_user_id != claimant.user_id).count()
        report.ownership_status = "disputed" if others else ("claimed" if current in ("unknown", "unconfirmed") else current)
    for leader_id in [u for (u,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == report.subdivision_id,
                                                                   User.status == "Active").all()]:
        db.add(Notification(user_id=leader_id, type="ownership_claim", related_id=report.report_id,
                            title="New ownership claim", message=f"A resident claims the found animal on report #{report.report_id}. Review the claim."))
    L.audit(db, claimant, "OWNERSHIP_CLAIM_SUBMITTED", report, f"{claimant.name} claimed the found animal on report #{report.report_id}.",
            table="ownership_claims", target_id=claim.claim_id, new={"evidence": claim.evidence, "claimed_pet_id": claim.claimed_pet_id})
    return claim


def withdraw_claim(db: Session, claim: OwnershipClaim, user: User) -> OwnershipClaim:
    if claim.claimant_user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Claim not found.")
    if claim.status not in ACTIVE:
        raise HTTPException(status_code=409, detail=f"This claim is already {claim.status.replace('_', ' ')}.")
    claim.status = "withdrawn"
    report = db.query(Report).filter(Report.report_id == claim.report_id).first()
    if report is not None:
        _settle_ownership_after_claims(db, report)
        L.audit(db, user, "OWNERSHIP_CLAIM_WITHDRAWN", report, f"{user.name} withdrew their claim on report #{report.report_id}.",
                table="ownership_claims", target_id=claim.claim_id)
    return claim


def add_claim_info(db: Session, claim: OwnershipClaim, user: User, text: str) -> OwnershipClaim:
    """
    The claimant answers a request for more information. It is added to their statement (dated, so the reviewer sees what was
    said when) and the claim goes back under review. Only a claim an officer asked about can take it.
    """
    if claim.claimant_user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Claim not found.")
    if claim.status != "needs_info":
        raise HTTPException(status_code=409, detail="More information can be added only when the subdivision has asked for it.")
    clean = (text or "").strip()
    if len(clean) < 3:
        raise HTTPException(status_code=422, detail="Write the information you want to add.")
    now = _now()
    claim.statement = f"{claim.statement}\n\nAdded {now.strftime('%b')} {now.day}, {now.year}: {clean}"
    claim.status = "under_review"
    report = db.query(Report).filter(Report.report_id == claim.report_id).first()
    if report is not None:
        for leader_id in [u for (u,) in db.query(User.user_id).filter(User.role_id == 2, User.subdivision_id == report.subdivision_id,
                                                                       User.status == "Active").all()]:
            db.add(Notification(user_id=leader_id, type="ownership_claim", related_id=report.report_id,
                                title="Ownership claim updated", message=f"The claimant added information to the claim on report #{report.report_id}."))
        L.audit(db, user, "OWNERSHIP_CLAIM_INFO_ADDED", report, f"{user.name} added information to their claim on report #{report.report_id}.",
                table="ownership_claims", target_id=claim.claim_id)
    return claim


def _settle_ownership_after_claims(db: Session, report: Report) -> None:
    """
    When no claim is left open, a case that only read 'claimed' / 'under review' / 'disputed' settles: 'under review' if a
    claim was accepted (the ownership decision, with evidence, is still to be made), else 'unconfirmed'.
    """
    if case_state.ownership_of(report) not in ("claimed", "under_review", "disputed"):
        return
    db.flush()
    claims = db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report.report_id).all()
    if not claims or any(c.status in ACTIVE for c in claims):
        return
    if any(c.status == "accepted" for c in claims):
        report.ownership_status = "under_review"
    else:
        report.ownership_status = "unconfirmed"
        report.ownership_note = report.ownership_note or "No claim was substantiated."


REVIEW_FROM = {
    "submitted": {"under_review", "needs_info", "accepted", "rejected"},
    "under_review": {"needs_info", "accepted", "rejected"},
    "needs_info": {"under_review", "accepted", "rejected"},
}


def review_claim(db: Session, report: Report, actor: User, claim: OwnershipClaim, data: ClaimReviewIn) -> OwnershipClaim:
    if claim.report_id != report.report_id:
        raise HTTPException(status_code=404, detail="Claim not found on this case.")
    if data.decision not in REVIEW_FROM.get(claim.status, set()):
        raise HTTPException(status_code=409, detail=f"A claim that is {claim.status.replace('_', ' ')} cannot be moved to {data.decision.replace('_', ' ')}.")
    previous = claim.status
    claim.status, claim.review_note = data.decision, (data.note or "").strip() or None
    claim.reviewed_by, claim.reviewed_at = actor.user_id, _now()
    ownership_before = case_state.ownership_of(report)
    if data.decision in ("under_review", "needs_info", "accepted"):
        # Accepting a claim does NOT confirm ownership. The case reads 'under review' until staff record the ownership
        # decision, with evidence, in the assessment.
        if ownership_before in ("unknown", "claimed", "unconfirmed"):
            report.ownership_status = "under_review"
    else:
        _settle_ownership_after_claims(db, report)
    label = {"accepted": "accepted", "rejected": "not accepted", "needs_info": "needs more information", "under_review": "under review"}[data.decision]
    if claim.claimant_user_id:
        text = f"Your ownership claim on report #{report.report_id} is {label}."
        if data.decision in ("needs_info", "rejected") and claim.review_note:
            text += f" {claim.review_note}"
        db.add(Notification(user_id=claim.claimant_user_id, type="ownership_claim_review", related_id=report.report_id,
                            title="Ownership claim update", message=text[:1000]))
    L.audit(db, actor, "OWNERSHIP_CLAIM_REVIEWED", report, f"{actor.name} reviewed an ownership claim on report #{report.report_id}: {label}.",
            table="ownership_claims", target_id=claim.claim_id, old={"claim_status": previous, "ownership": ownership_before},
            new={"claim_status": data.decision, "ownership": case_state.ownership_of(report), "ownership_confirmed_by_this": False})
    return claim


# --------------------------------------------------------------------------------------------------- reading
def claims_of(db: Session, report: Report, viewer: User) -> List[OwnershipClaim]:
    q = db.query(OwnershipClaim).filter(OwnershipClaim.report_id == report.report_id)
    if viewer.role_id == 1:
        q = q.filter(OwnershipClaim.claimant_user_id == viewer.user_id)
    return q.order_by(OwnershipClaim.claim_id).all()


def claim_view(db: Session, claim: OwnershipClaim, for_staff: bool) -> Dict[str, Any]:
    """The claimant sees their own claim and the decision; staff also see who claimed, the named pet and the evidence links."""
    data: Dict[str, Any] = {
        "claim_id": claim.claim_id, "report_id": claim.report_id, "status": claim.status, "statement": claim.statement,
        "evidence": claim.evidence or [], "submitted_at": claim.submitted_at, "reviewed_at": claim.reviewed_at,
        "review_note": claim.review_note if claim.status in ("needs_info", "rejected", "accepted") else None,
    }
    if for_staff:
        claimant = db.query(User).filter(User.user_id == claim.claimant_user_id).first() if claim.claimant_user_id else None
        data.update({"claimant_user_id": claim.claimant_user_id, "claimant_name": claimant.name if claimant else None,
                     "claimed_pet_id": claim.claimed_pet_id, "evidence_urls": claim.evidence_urls or [],
                     "reviewed_by": claim.reviewed_by, "review_note": claim.review_note})
    return data
