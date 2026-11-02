from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.utils.auth import get_current_user, get_current_staff_or_admin

from app.database import get_db
from app.models.pet_claim import PetClaim
from app.models.pet import Pet
from app.models.user import User
from app.models.report import HoldingAnimal, Report, ReportMedia, ReportReturn, StatusHistory
from app.models.report_match import ReportMatch
from app.models.notification import Notification
from app.schemas.pet_claim import PetClaimCreate, PetClaimResponse, PetClaimStatusUpdate, ClaimEvidenceSubmit, PetClaimUpdate
from app.utils.uploads import validate_cloudinary_url
from app.utils.audit import log_activity
from app.utils.case_groups import case_members, case_root, live_claim, pick_case_claim
from app.utils import claim_custody
from app.utils.owner_returns import record_owner_return, _report_media_url
from app.utils.report_loading import embedded_report_loads
from app.utils.notification_dispatcher import (
    dispatch_notification,
    notify_claim_decision,
    notify_pet_reunited,
)

router = APIRouter(prefix="/claims", tags=["claims"])

def _barangay_of_subdivision(db: Session, subdivision_id: Optional[int]) -> Optional[int]:
    from app.models.user import Subdivision
    if not subdivision_id:
        return None
    sub = db.query(Subdivision).filter(Subdivision.subdivision_id == subdivision_id).first()
    return sub.barangay_id if sub else None


def _match_method(match_rec) -> str:
    """The saved method of a match record: "manual" (staff-identified) or "ai"."""
    ev = match_rec.ai_evidence if isinstance(match_rec.ai_evidence, dict) else {}
    return "manual" if ev.get("engine") == "manual" else "ai"


def _apply_match_method(db: Session, claim: PetClaim) -> None:
    """
    Response-only: the claim's matching method, and a match score only for AI matches. A manual match's placeholder
    score (0 / 50) is never shown as an AI similarity, also on claims saved before this rule. Nothing is written.
    """
    match_rec = (db.query(ReportMatch).filter(ReportMatch.source_report_id == claim.report_id,
                                              ReportMatch.matched_pet_id == claim.pet_id)
                 .order_by(ReportMatch.match_id.desc()).first())
    method = _match_method(match_rec) if match_rec else None
    claim.matching_mode = method  # type: ignore[attr-defined]
    if method == "manual":
        claim.__dict__["match_score"] = None
    elif not claim.match_score and match_rec is not None:
        claim.__dict__["match_score"] = match_rec.similarity_score


def claim_visible_to(db: Session, user: User, claim: PetClaim) -> bool:
    """
    Residents: claims for their own pets. Subdivision Leaders: claims in their subdivision. Barangay staff: claims on
    cases escalated to the Barangay, in their barangay. Admin: all.
    """
    from app.utils.case_review import escalated_to_barangay
    if user.role_id == 4:
        return True
    pet = claim.pet
    report = claim.report
    if user.role_id == 1:
        return bool(pet and pet.owner_id == user.user_id)
    if user.role_id == 2:
        owner_subd = pet.owner.subdivision_id if (pet and pet.owner) else None
        return bool(user.subdivision_id) and user.subdivision_id in (report.subdivision_id if report else None, owner_subd)
    if user.role_id == 3:
        if report is None or not escalated_to_barangay(report, db):
            return False
        return bool(user.barangay_id) and _barangay_of_subdivision(db, report.subdivision_id) == user.barangay_id
    return False


@router.get("/", response_model=List[PetClaimResponse])
def get_claims(
    owner_id: Optional[int] = None,
    subdivision_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claims the signed-in user may see (see claim_visible_to); owner_id / subdivision_id only narrow that further."""
    query = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media),
        *embedded_report_loads(PetClaim.report),  # one query per relation for all claims
    ).join(Pet, PetClaim.pet_id == Pet.pet_id).filter(
        Pet.status != "Deceased",
        PetClaim.status != "Merged",  # one claim per pet per merged case
    )

    if owner_id is not None:
        query = query.filter(Pet.owner_id == owner_id)
        
    if subdivision_id is not None:
        from app.models.user import User
        from sqlalchemy import or_
        query = query.outerjoin(Report, PetClaim.report_id == Report.report_id).outerjoin(User, Pet.owner_id == User.user_id).filter(
            or_(Report.subdivision_id == subdivision_id, User.subdivision_id == subdivision_id)
        )

    claims = [c for c in query.order_by(PetClaim.created_at.desc()).all() if claim_visible_to(db, current_user, c)]
    for c in claims:
        _attach_case_reports(db, c)
        _apply_match_method(db, c)

        if c.pet and c.pet.owner:
            if not c.pet.registered_address and c.pet.owner.address:
                c.pet.registered_address = c.pet.owner.address
            if not c.pet.registered_latitude and c.pet.owner.latitude:
                c.pet.registered_latitude = c.pet.owner.latitude
            if not c.pet.registered_longitude and c.pet.owner.longitude:
                c.pet.registered_longitude = c.pet.owner.longitude
    return claims

def _attach_case_reports(db: Session, claim: PetClaim) -> None:
    report = claim.report or db.query(Report).filter(Report.report_id == claim.report_id).first()
    claim.case_report_ids = [m.report_id for m in case_members(db, case_root(db, report))] if report else [claim.report_id]
    ret = db.query(ReportReturn).filter(ReportReturn.report_id.in_(claim.case_report_ids)).first()
    if ret and ret.handover_photo_url:
        claim.handover_photo_url = ret.handover_photo_url
    claim_custody.attach_custody(db, claim)


MAX_CLAIM_PHOTOS = 5  # the owner's additional pet photos / videos per claim


def claim_photo_list(value: Optional[str]) -> List[str]:
    return [u.strip() for u in (value or "").split(",") if u.strip()]


def add_claim_photos(existing: Optional[str], new: List[str]) -> str:
    """Append new photo/video links (no duplicates). Refuses going over MAX_CLAIM_PHOTOS."""
    merged = claim_photo_list(existing)
    for u in new:
        validate_cloudinary_url(u, allowed={'Image', 'Video'})
        if u not in merged:
            merged.append(u)
    if len(merged) > MAX_CLAIM_PHOTOS:
        raise HTTPException(status_code=400, detail=f"You can add up to {MAX_CLAIM_PHOTOS} pet photos or videos to a claim.")
    return ",".join(merged)


PROOF_FIELDS = ("vaccine_card_url", "vet_record_url", "registration_record_url", "additional_photos_url", "evidence_url")
PROOF_LABELS = {"vaccine_card_url": "Vaccination card", "vet_record_url": "Veterinary records",
                "registration_record_url": "Registration certificate", "additional_photos_url": "Additional photos",
                "evidence_url": "Supporting evidence"}


def proof_on_file(db: Session, pet_id: Optional[int] = None, report_id: Optional[int] = None) -> Optional[PetClaim]:
    """The latest claim for this pet or report that has proof of ownership and wasn't rejected."""
    query = db.query(PetClaim).filter(PetClaim.status != "Rejected")
    if pet_id:
        query = query.filter(PetClaim.pet_id == pet_id)
    elif report_id:
        query = query.filter(PetClaim.report_id == report_id)
    else:
        return None
    rows = query.order_by(PetClaim.updated_at.desc(), PetClaim.claim_id.desc()).all()
    return next((c for c in rows if any(getattr(c, f) for f in PROOF_FIELDS)), None)


@router.get("/proof-on-file")
def get_proof_on_file(
    pet_id: Optional[int] = None,
    report_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """For the pet's owner or authorized staff: proof of ownership already submitted, so it needn't be uploaded again."""
    if not pet_id and not report_id:
        return {"has_proof": False}

    is_staff = current_user.role_id in (2, 3, 4)
    if pet_id:
        pet = db.query(Pet).filter(Pet.pet_id == pet_id).first()
        if not pet:
            return {"has_proof": False}
        if not is_staff and pet.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Only the pet's owner or staff can see its proof of ownership.")
    elif report_id:
        rep = db.query(Report).filter(Report.report_id == report_id).first()
        if not rep:
            return {"has_proof": False}
        if not is_staff and rep.user_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to see proof of ownership for this report.")

    src = proof_on_file(db, pet_id=pet_id, report_id=report_id)
    if src is None and report_id and not pet_id:
        rep = db.query(Report).filter(Report.report_id == report_id).first()
        if rep and rep.pet_id:
            src = proof_on_file(db, pet_id=rep.pet_id)

    if src is None:
        return {"has_proof": False}
    return {
        "has_proof": True,
        "claim_id": src.claim_id,
        "report_id": src.report_id,
        "pet_id": src.pet_id,
        "status": src.status,
        "submitted_at": src.updated_at or src.created_at,
        "documents": [PROOF_LABELS[f] for f in PROOF_FIELDS if getattr(src, f)],
        "vaccine_card_url": src.vaccine_card_url,
        "vet_record_url": src.vet_record_url,
        "registration_record_url": src.registration_record_url,
        "additional_photos_url": src.additional_photos_url,
        "evidence_url": src.evidence_url,
        "distinctive_markings": src.distinctive_markings,
        "remarks": src.remarks,
    }


def _apply_reused_proof(db: Session, claim: PetClaim, pet_id: int, source_claim_id: int) -> None:
    src = db.query(PetClaim).filter(PetClaim.claim_id == source_claim_id).first()
    if src is None or src.pet_id != pet_id or src.status == "Rejected" or not any(getattr(src, f) for f in PROOF_FIELDS):
        raise HTTPException(status_code=400, detail="That proof of ownership can't be reused for this pet.")
    for f in PROOF_FIELDS:
        if getattr(src, f) and not getattr(claim, f):
            setattr(claim, f, getattr(src, f))
    note = f"Proof of ownership reused from claim #{src.claim_id} (Report #{src.report_id})."
    claim.remarks = f"{claim.remarks}\n{note}" if claim.remarks else note


def _notify_claim_evidence(db: Session, claim: PetClaim, actor: User) -> None:
    """Keep leader evidence alerts consistent for single-file and report/pet saves."""
    rep = claim.report or db.query(Report).filter(Report.report_id == claim.report_id).first()
    if not rep or not rep.subdivision_id:
        return
    try:
        leaders = db.query(User).filter(User.subdivision_id == rep.subdivision_id, User.role_id == 2).all()
        for leader in leaders:
            db.add(Notification(
                user_id=leader.user_id,
                title="Pet Claim Evidence Submitted",
                message=f"Resident {actor.name} submitted ownership evidence for Report #{claim.report_id} ({claim.pet.display_name if claim.pet else 'Pet'}).",
                type="claim", related_id=claim.report_id,
            ))
        db.commit()
    except Exception as error:
        db.rollback()
        print(f"Notice: Failed to create leader evidence notification: {error}")


@router.get("/{claim_id}", response_model=PetClaimResponse)
def get_claim(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim or (claim.pet and claim.pet.status == "Deceased"):
        raise HTTPException(status_code=404, detail="Claim not found or pet is deceased.")
    if not claim_visible_to(db, current_user, claim):
        raise HTTPException(status_code=404, detail="Claim not found or pet is deceased.")
    claim = live_claim(db, claim)  # a merged claim opens the case's claim
    _attach_case_reports(db, claim)
    
    _apply_match_method(db, claim)

    if claim.pet and claim.pet.owner:
        if not claim.pet.registered_address and claim.pet.owner.address:
            claim.pet.registered_address = claim.pet.owner.address
        if not claim.pet.registered_latitude and claim.pet.owner.latitude:
            claim.pet.registered_latitude = claim.pet.owner.latitude
        if not claim.pet.registered_longitude and claim.pet.owner.longitude:
            claim.pet.registered_longitude = claim.pet.owner.longitude

    return claim

@router.post("/", response_model=PetClaimResponse)
def create_or_update_claim(
    claim_in: PetClaimCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify report and pet exist
    report = db.query(Report).filter(Report.report_id == claim_in.report_id).first()
    pet = db.query(Pet).filter(Pet.pet_id == claim_in.pet_id).first()
    
    if not report or not pet:
        raise HTTPException(status_code=404, detail="Report or Pet not found")

    if pet.status and pet.status.lower() == "deceased":
        raise HTTPException(
            status_code=400,
            detail="This pet is marked as deceased and cannot be claimed or matched."
        )

    # Phase 7: a claim is for an animal someone holds. Checked before anything is saved (incl. owner assignment).
    _case_ids = [m.report_id for m in case_members(db, case_root(db, report))]
    _approved = db.query(PetClaim).filter(PetClaim.report_id.in_(_case_ids), PetClaim.pet_id == claim_in.pet_id,
                                          PetClaim.status.in_(claim_custody.CONTINUATION)).first()
    if _approved is not None:
        claim_custody.require_completion_allowed(db, report, _approved, "Updating this claim")
    else:
        claim_custody.require_held(db, report, "Filing a claim")

    # Ownership checks: Assign ownership if unowned; enforce owner identity for resident claims
    if pet.owner_id is None:
        pet.owner_id = current_user.user_id
        db.commit()
    elif current_user.role_id == 1 and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You can only submit claims for your own registered pet."
        )

    # The report/pet save path accepts the same proof files as the evidence route.
    # Validate every supplied document before changing an existing claim.
    for field in PROOF_FIELDS:
        file_url = getattr(claim_in, field, None)
        if file_url and field != 'additional_photos_url':
            validate_cloudinary_url(file_url, allowed={'Image', 'Video', 'Document'})

    # Fetch corresponding match score from report_matches if available
    match_rec = db.query(ReportMatch).filter(
        ReportMatch.source_report_id == claim_in.report_id,
        ReportMatch.matched_pet_id == claim_in.pet_id
    ).first()
    # Only an AI match has a similarity score; a staff-identified (manual) match has none
    match_score_val = match_rec.similarity_score if (match_rec and _match_method(match_rec) == "ai") else None

    # One claim per pet per case: reuse the claim already filed on any report of the merged case
    root = case_root(db, report)
    case_ids = [m.report_id for m in case_members(db, root)]
    case_claims = db.query(PetClaim).filter(PetClaim.report_id.in_(case_ids), PetClaim.pet_id == claim_in.pet_id).all()
    db_claim = pick_case_claim(case_claims)
    if db_claim is None:
        # e.g. a rejected claim being submitted again (this report's own first)
        db_claim = next((c for c in case_claims if c.report_id == claim_in.report_id and c.status != "Merged"), None) \
            or next((c for c in case_claims if c.status != "Merged"), None)

    if db_claim:
        evidence_fields = (*PROOF_FIELDS, 'distinctive_markings', 'remarks')
        previous_evidence = tuple(getattr(db_claim, field) for field in evidence_fields)
        # Update the existing match claim to a submitted state
        db_claim.status = "Pending Review"
        db_claim.remarks = claim_in.remarks or db_claim.remarks
        db_claim.distinctive_markings = claim_in.distinctive_markings or db_claim.distinctive_markings
        if claim_in.vaccine_card_url:
            db_claim.vaccine_card_url = claim_in.vaccine_card_url
        if claim_in.vet_record_url:
            db_claim.vet_record_url = claim_in.vet_record_url
        if claim_in.registration_record_url:
            db_claim.registration_record_url = claim_in.registration_record_url
        if claim_in.additional_photos_url:
            db_claim.additional_photos_url = add_claim_photos(db_claim.additional_photos_url, claim_photo_list(claim_in.additional_photos_url))
        if claim_in.evidence_url:
            db_claim.evidence_url = claim_in.evidence_url
        if match_score_val and not db_claim.match_score:
            db_claim.match_score = match_score_val
        if claim_in.reuse_proof_from_claim_id and claim_in.reuse_proof_from_claim_id != db_claim.claim_id:
            _apply_reused_proof(db, db_claim, claim_in.pet_id, claim_in.reuse_proof_from_claim_id)
        evidence_changed = previous_evidence != tuple(getattr(db_claim, field) for field in evidence_fields)
        db.commit()
        db.refresh(db_claim)
        _attach_case_reports(db, db_claim)
        if evidence_changed:
            _notify_claim_evidence(db, db_claim, current_user)
        return db_claim

    # Otherwise, create a new claim (on the case's first report, so it represents the whole case)
    new_claim = PetClaim(
        report_id=root.report_id,
        pet_id=claim_in.pet_id,
        remarks=claim_in.remarks,
        distinctive_markings=claim_in.distinctive_markings,
        vaccine_card_url=claim_in.vaccine_card_url,
        vet_record_url=claim_in.vet_record_url,
        registration_record_url=claim_in.registration_record_url,
        additional_photos_url=(add_claim_photos(None, claim_photo_list(claim_in.additional_photos_url)) or None) if claim_in.additional_photos_url else None,
        evidence_url=claim_in.evidence_url,
        match_score=match_score_val,
        status="Pending Review"
    )
    if claim_in.reuse_proof_from_claim_id:
        _apply_reused_proof(db, new_claim, claim_in.pet_id, claim_in.reuse_proof_from_claim_id)
    db.add(new_claim)

    # Notify subdivision leaders if report belongs to a subdivision
    if report and report.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()
            for leader in leaders:
                subd_notif = Notification(
                    user_id=leader.user_id,
                    title="New Pet Claim Filed",
                    message=f"A resident submitted a pet claim with ownership proof for report #{report.report_id} ({pet.display_name if pet else 'Pet'}).",
                    type="claim",
                    related_id=report.report_id
                )
                db.add(subd_notif)
        except Exception as notif_err:
            print(f"Notice: Failed to create leader claim notification: {notif_err}")

    db.commit()
    db.refresh(new_claim)
    _attach_case_reports(db, new_claim)
    return new_claim

@router.post("/{claim_id}/evidence", response_model=PetClaimResponse)
def upload_claim_evidence(
    claim_id: int,
    payload: ClaimEvidenceSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet),
        joinedload(PetClaim.report)
    ).filter(PetClaim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim = live_claim(db, claim)  # evidence for a merged claim goes to the case's claim

    is_owner = (claim.pet and claim.pet.owner_id == current_user.user_id)
    is_staff_or_admin = (current_user.role_id in [2, 3, 4])
    if not (is_owner or is_staff_or_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You can only upload evidence for your own pet claim."
        )

    # File already lives in Cloudinary (browser uploaded directly via the
    # unsigned preset); just verify the URL is genuinely ours before trusting it.
    if claim.status in ("Handover Complete", "Pet Received", "Not Needed"):
        raise HTTPException(status_code=409, detail=f"This claim is closed ({claim.status}); no more evidence is needed.")
    if claim.report is not None:
        claim_custody.require_completion_allowed(db, claim.report, claim, "Adding evidence")

    validate_cloudinary_url(payload.file_url, allowed={'Image', 'Video', 'Document'})
    file_url = payload.file_url
    document_type = payload.document_type

    try:
        if document_type == "vaccine_card":
            claim.vaccine_card_url = file_url
        elif document_type == "vet_record":
            claim.vet_record_url = file_url
        elif document_type == "registration_record":
            claim.registration_record_url = file_url
        elif document_type == "additional_photo":
            claim.additional_photos_url = add_claim_photos(claim.additional_photos_url, [file_url])
        else:
            claim.evidence_url = file_url

        if payload.distinctive_markings:
            claim.distinctive_markings = payload.distinctive_markings
        if payload.remarks:
            claim.remarks = payload.remarks

        claim.status = "Pending Review"
        db.commit()
        db.refresh(claim)
        _attach_case_reports(db, claim)

        _notify_claim_evidence(db, claim, current_user)

        return claim
    except HTTPException:
        db.rollback()
        raise  # e.g. too many photos: keep the clear 400 message
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Evidence upload failed: {str(e)}")

@router.patch("/{claim_id}/status", response_model=PetClaimResponse)
def update_claim_status(
    claim_id: int,
    status_update: PetClaimStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet),
        joinedload(PetClaim.report)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if status_update.status == "Merged":
        raise HTTPException(status_code=400, detail="Claims are combined automatically when reports are merged.")
    if status_update.status == "Not Needed":
        raise HTTPException(status_code=400, detail="Close a claim that isn't needed with its own action and a reason.")
    claim = live_claim(db, claim)  # a merged claim's decision applies to the case's claim
    if claim.status == "Not Needed":
        raise HTTPException(status_code=409, detail="This claim was closed as not needed.")

    is_owner = (claim.pet and claim.pet.owner_id == current_user.user_id)
    is_staff_or_admin = (current_user.role_id in [2, 3, 4])

    # Administrative transitions (Approved, Rejected, Handover Complete, etc.) strictly require Staff or Admin
    if status_update.status in ["Approved", "Rejected", "Evidence Requested", "Handover Complete"]:
        if not is_staff_or_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: Staff or Administrator privileges required to change claim status to " + status_update.status + "."
            )
    elif status_update.status in ["Pet Received", "Pending Review"]:
        if not (is_owner or is_staff_or_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You are not authorized to update this claim."
            )
    else:
        if not is_staff_or_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: Staff or Administrator privileges required."
            )

    # Phase 7: decisions that move a claim forward need a held animal; completing an approved claim stays allowed
    # (never for an adopted animal). Rejecting is always allowed.
    if claim.report is not None:
        if status_update.status in ("Approved", "Evidence Requested", "Pending Review"):
            claim_custody.require_held(db, claim.report, f"Setting the claim to {status_update.status}", claim)
        elif status_update.status in ("Handover Complete", "Pet Received"):
            claim_custody.require_completion_allowed(db, claim.report, claim)
            # Claiming charges (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md): settle (payment + receipt) or waive first.
            # Payment never completes the handover by itself; this is the handover step.
            from app.routes.claim_assessments import unsettled_assessment
            owed = unsettled_assessment(db, claim.claim_id)
            if owed is not None:
                raise HTTPException(status_code=409, detail=(
                    f"The claiming charges (PHP {owed.total_due:,.2f}) aren't settled yet. "
                    f"Record the payment and official receipt, or an authorized waiver, before the handover."))

    # A rejected claim's unpaid assessment is cancelled (kept on record)
    if status_update.status == "Rejected":
        from app.models.claim_assessment import ClaimAssessment, ClaimAssessmentChange
        for open_a in db.query(ClaimAssessment).filter(ClaimAssessment.claim_id == claim.claim_id,
                                                        ClaimAssessment.status == "Assessed").all():
            open_a.status = "Cancelled"
            db.add(ClaimAssessmentChange(assessment_id=open_a.assessment_id, action="cancelled", field="status",
                                         previous_value="Assessed", new_value="Cancelled",
                                         reason="The claim was rejected.", changed_by=current_user.user_id))

    claim.status = status_update.status
    if status_update.remarks:
        claim.remarks = status_update.remarks

    # If claim is Approved, update corresponding Report and Pet statuses
    if status_update.status == "Approved":
        # 1. Update report status to 'Claimed by Owner' (ID 9)
        if claim.report:
            # Remember where the case was, so an erroneous approval can be undone (and the animal stays "held")
            if claim.report.current_status_id != 9:
                claim.status_before_approval = claim.report.current_status_id
            claim.report.current_status_id = 9
            # Add to report status history
            history_entry = StatusHistory(
                report_id=claim.report_id,
                report_status_id=9,
                updated_by=current_user.user_id,
                remarks=f"Claim approved. Owner identified: {claim.pet.display_name if claim.pet else 'Pet'}. Coordinate handover with owner."
            )
            db.add(history_entry)

        # 2. Update pet status back to 'Active' since it's claimed
        if claim.pet:
            claim.pet.status = "Active"

    elif status_update.status == "Handover Complete":
        # Authoritative physical handover verification
        root = case_root(db, claim.report) if claim.report else None
        # Closing the case closes the reports merged into it: the leader reviews them first
        from app.utils.case_groups import require_merged_sightings_review
        require_merged_sightings_review(db, claim.report, status_update.merged_sightings_reviewed)

        # 1. Resolve handover photo
        photo_url = None
        if status_update.handover_photo_url:
            try:
                validate_cloudinary_url(status_update.handover_photo_url, allowed={'Image'})
            except Exception:
                pass  # Allow existing claim proof photo URLs
            photo_url = status_update.handover_photo_url
        elif status_update.handover_media_id and claim.report:
            photo_url = _report_media_url(db, claim.report.report_id, status_update.handover_media_id)
        else:
            # Check if an existing return already has the handover photo
            existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == claim.report_id).first()
            if not existing_ret and root:
                existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == root.report_id).first()
            if existing_ret and existing_ret.handover_photo_url:
                photo_url = existing_ret.handover_photo_url
            elif status_update.bypass_handover_photo:
                # Staff discretion bypass: no reunion photo was taken. The owner's proof stays as ownership proof
                # (below); it is not shown as a reunion photo.
                photo_url = None
            else:
                raise HTTPException(
                    status_code=400,
                    detail="A handover photo (owner with the animal) is required to complete physical handover."
                )

        # 2. Resolve ID verification
        id_type = (status_update.id_type or "").strip() or None
        id_last4 = (status_update.id_last4 or "").strip() or None
        if not id_type:
            existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == claim.report_id).first()
            if not existing_ret and root:
                existing_ret = db.query(ReportReturn).filter(ReportReturn.report_id == root.report_id).first()
            if existing_ret and existing_ret.id_type:
                id_type = existing_ret.id_type
                id_last4 = existing_ret.id_last4
            elif status_update.bypass_handover_photo:
                id_type = "Verified Ownership on File"
                id_last4 = (id_last4 if (id_last4 and id_last4.isdigit() and len(id_last4) == 4) else (str(claim.pet.owner_id).zfill(4)[-4:] if (claim.pet and claim.pet.owner_id) else "0000"))
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Select the type of ID presented during physical handover."
                )

        if not id_last4 or not id_last4.isdigit() or len(id_last4) != 4:
            if status_update.bypass_handover_photo:
                id_last4 = str(claim.pet.owner_id).zfill(4)[-4:] if (claim.pet and claim.pet.owner_id) else "0000"
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Enter the last 4 digits of the owner's ID number (must be exactly 4 digits)."
                )

        # 3. Assemble verified owner snapshot
        owner = claim.pet.owner if claim.pet else None
        owner_snap = {
            "has_account": bool(owner is not None),
            "owner_user_id": owner.user_id if owner else None,
            "owner_name": owner.name if owner else "Owner",
            "owner_phone": owner.phone if owner else None,
            "owner_email": owner.email if owner else None,
            "owner_address": owner.address if owner else None,
            "relationship_to_animal": status_update.relationship_to_animal or "Owner",
            "id_type": id_type,
            "id_last4": id_last4,
            "id_presented": status_update.id_presented or f"{id_type} (ending {id_last4})",
            "ownership_verified_by_record": bool(owner and claim.pet and claim.pet.owner_id == owner.user_id),
            "handover_photo_url": photo_url,
            "ownership_proof_urls": [u for u in [claim.evidence_url, claim.vaccine_card_url, claim.vet_record_url, claim.registration_record_url, claim.additional_photos_url] if u][:5],
            "notes": status_update.notes or status_update.remarks or "Physical handover completed via Pet Claims.",
        }

        # 4. Record owner return and discharge holding animal
        holding_id = None
        if claim.report:
            holding_id = db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == claim.report.report_id).scalar()
            if not holding_id and root:
                holding_id = db.query(HoldingAnimal.holding_id).filter(HoldingAnimal.report_id == root.report_id).scalar()
            record_owner_return(db, claim.report, owner_snap, current_user, pet_id=claim.pet_id, holding_id=holding_id)

        # 5. Synchronize Report: Status 9 ("Claimed by Owner") & custody_status
        if claim.report:
            claim.report.current_status_id = 9
            claim.report.custody_status = "Claimed by Owner"
            history_entry = StatusHistory(
                report_id=claim.report_id,
                report_status_id=9,
                updated_by=current_user.user_id,
                remarks=f"Pet handover verified and completed by {current_user.name}. Animal safely reunited with {owner_snap['owner_name']}."
            )
            db.add(history_entry)

            # Synchronize case members if merged
            if root:
                members = case_members(db, root)
                for m in members:
                    m.custody_status = "Claimed by Owner"
                    if m.report_id != claim.report.report_id and m.current_status_id not in (9, 11):
                        m.current_status_id = 9
                        db.add(StatusHistory(
                            report_id=m.report_id,
                            report_status_id=9,
                            updated_by=current_user.user_id,
                            remarks=f"Case resolved: Pet safely reunited with owner ({owner_snap['owner_name']}) via Report #{claim.report.report_id}."
                        ))

        if claim.pet:
            claim.pet.status = "Active"

        # 6. Close inquiry chat threads across this report/case
        try:
            from app.models.chat import ChatThread
            case_rep_ids = [claim.report_id]
            if root:
                case_rep_ids = [m.report_id for m in case_members(db, root)]
            matches = db.query(ReportMatch).filter(ReportMatch.source_report_id.in_(case_rep_ids)).all()
            match_ids = [m.match_id for m in matches]
            if match_ids:
                db.query(ChatThread).filter(
                    ChatThread.thread_type == "Direct",
                    ChatThread.related_id.in_(match_ids)
                ).update({"is_closed": True}, synchronize_session=False)
            db.query(ChatThread).filter(
                ChatThread.thread_type == "Report",
                ChatThread.related_id.in_(case_rep_ids)
            ).update({"is_closed": True}, synchronize_session=False)
        except Exception as chat_err:
            print(f"Notice: Failed to close chat thread on handover complete: {chat_err}")

        # 7. Notify leaders
        try:
            leader_ids = []
            if claim.report and claim.report.assigned_leader_id:
                leader_ids.append(claim.report.assigned_leader_id)
            elif claim.report and claim.report.subdivision_id:
                leaders = db.query(User).filter(User.subdivision_id == claim.report.subdivision_id, User.role_id == 2).all()
                leader_ids.extend([l.user_id for l in leaders])

            for lid in set(leader_ids):
                db.add(Notification(
                    user_id=lid,
                    title="🤝 Pet Handover Complete",
                    message=f"Pet '{claim.pet.display_name if claim.pet else 'Pet'}' on Report #{claim.report_id} has been physically reunited with {owner_snap['owner_name']}. Case is now resolved.",
                    type="status_update",
                    related_id=claim.report_id
                ))
        except Exception as l_err:
            print(f"Notice: Failed to notify leader on handover: {l_err}")

    elif status_update.status == "Pet Received":
        # Owner confirmed pet received
        photo_url = status_update.handover_photo_url
        if photo_url:
            validate_cloudinary_url(photo_url, allowed={'Image'})
            ret = db.query(ReportReturn).filter(ReportReturn.report_id == claim.report_id).first()
            owner = claim.pet.owner if claim.pet else current_user
            if not ret:
                ret = ReportReturn(
                    report_id=claim.report_id,
                    pet_id=claim.pet_id,
                    has_account=True,
                    owner_user_id=owner.user_id if owner else current_user.user_id,
                    owner_name=owner.name if owner else current_user.name,
                    owner_phone=owner.phone if owner else current_user.phone,
                    owner_email=owner.email if owner else current_user.email,
                    owner_address=owner.address if owner else current_user.address,
                    relationship_to_animal="Owner",
                    id_presented="Verified StraySafe Account",
                    ownership_verified_by_record=True,
                    handover_photo_url=photo_url,
                    ownership_proof_urls=[u for u in [claim.evidence_url, claim.vaccine_card_url, claim.vet_record_url, claim.registration_record_url, claim.additional_photos_url] if u][:5],
                    notes=status_update.notes or status_update.remarks or "Direct owner recovery confirmed via Match Review.",
                    returned_by=current_user.user_id
                )
                db.add(ret)
            else:
                ret.handover_photo_url = photo_url
                if status_update.notes or status_update.remarks:
                    ret.notes = status_update.notes or status_update.remarks
            claim.handover_photo_url = photo_url

        if claim.report:
            # The owner has the animal: discharge it from holding and take it out of adoption (same as a staff handover)
            from app.utils.owner_returns import finalize_owner_handover
            finalize_owner_handover(db, claim.report, current_user,
                                    f"Owner {current_user.name} confirmed receiving the animal (claim #{claim.claim_id}).")
            claim.report.current_status_id = 9
            claim.report.custody_status = "Claimed by Owner"
            history_entry = StatusHistory(
                report_id=claim.report_id,
                report_status_id=9,
                updated_by=current_user.user_id,
                remarks=f"Pet receipt confirmed by owner {current_user.name}{' with reunion photo' if photo_url else ''}. Case #{claim.report_id} officially resolved."
            )
            db.add(history_entry)
            db.flush()
            if photo_url:
                rep_media = ReportMedia(
                    report_id=claim.report_id,
                    history_id=history_entry.history_id,
                    file_url=photo_url,
                    media_type="Image",
                    is_evidence=True,
                    status_id=9
                )
                db.add(rep_media)

        if claim.pet:
            claim.pet.status = "Active"

        # Notify leaders of safe pet recovery
        try:
            leaders = []
            if claim.report and claim.report.assigned_leader_id:
                leaders.append(claim.report.assigned_leader_id)
            elif claim.report and claim.report.subdivision_id:
                leaders = [u.user_id for u in db.query(User.user_id).filter(User.subdivision_id == claim.report.subdivision_id, User.role_id == 2).all()]
            for lid in set(leaders):
                db.add(Notification(
                    user_id=lid,
                    title="🐾 Owner Confirmed Pet Received",
                    message=f"Resident {current_user.name} confirmed safe recovery of '{claim.pet.display_name if claim.pet else 'Pet'}' for Report #{claim.report_id} and submitted reunion proof.",
                    type="status_update",
                    related_id=claim.report_id
                ))
        except Exception as l_notif_err:
            print(f"Notice: Failed to notify leader on pet received: {l_notif_err}")

    # The claim decision itself verifies ownership; a second approval in the
    # report's Potential Matches panel must not be necessary for pet records.
    # Do this before notifications (which may commit), in the same transaction.
    if is_staff_or_admin and status_update.status in ('Approved', 'Handover Complete', 'Pet Received'):
        from app.utils.claim_identity import sync_approved_claim_identity
        sync_approved_claim_identity(db, claim, current_user)

    # Create a notification for the pet owner
    if claim.pet and claim.pet.owner_id:
        owner_obj = claim.pet.owner or db.query(User).filter(User.user_id == claim.pet.owner_id).first()
        if status_update.status in ["Approved", "Rejected"]:
            if owner_obj:
                notify_claim_decision(
                    db=db,
                    pet_owner=owner_obj,
                    pet_name=claim.pet.display_name,
                    claim_id=claim.claim_id,
                    report_id=claim.report_id,
                    decision_status=status_update.status,
                    remarks=status_update.remarks,
                )
            else:
                db.add(Notification(
                    user_id=claim.pet.owner_id,
                    title=f"Pet Claim {status_update.status}",
                    message=f"Your claim for pet '{claim.pet.display_name}' on report #{claim.report_id} has been {status_update.status.lower()}.",
                    type="status_update",
                    related_id=claim.report_id
                ))
        elif status_update.status in ["Handover Complete", "Pet Received"]:
            reunited_name = owner_obj.name if owner_obj and owner_obj.name else "Owner"
            if owner_obj:
                notify_pet_reunited(
                    db=db,
                    user=owner_obj,
                    pet_name=claim.pet.display_name,
                    report_id=claim.report_id,
                    reunited_with=reunited_name,
                )
            else:
                db.add(Notification(
                    user_id=claim.pet.owner_id,
                    title="✅ Pet Safely Reunited",
                    message=f"Pet handover/receipt has been completed for '{claim.pet.display_name}'. Case #{claim.report_id} is now officially closed. Thank you!",
                    type="status_update",
                    related_id=claim.report_id
                ))
        else:
            notif_title = f"Pet Claim {status_update.status}"
            notif_msg = f"Your claim for pet '{claim.pet.display_name}' on report #{claim.report_id} has been {status_update.status.lower()}."
            if status_update.remarks:
                notif_msg += f" Remarks: {status_update.remarks}"
            db.add(Notification(
                user_id=claim.pet.owner_id,
                title=notif_title,
                message=notif_msg,
                type="status_update",
                related_id=claim.report_id
            ))

    db.commit()
    db.refresh(claim)
    _attach_case_reports(db, claim)
    return claim


@router.patch("/{claim_id}", response_model=PetClaimResponse)
def update_claim_documents(
    claim_id: int,
    claim_update: PetClaimUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet),
        joinedload(PetClaim.report)
    ).filter(PetClaim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim = live_claim(db, claim)

    is_owner = (claim.pet and claim.pet.owner_id == current_user.user_id)
    is_staff_or_admin = (current_user.role_id in [2, 3, 4])
    if not (is_owner or is_staff_or_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You can only update your own pet claim."
        )

    if claim_update.vaccine_card_url is not None:
        validate_cloudinary_url(claim_update.vaccine_card_url, allowed={'Image', 'Video', 'Document'})
        claim.vaccine_card_url = claim_update.vaccine_card_url
    if claim_update.vet_record_url is not None:
        validate_cloudinary_url(claim_update.vet_record_url, allowed={'Image', 'Video', 'Document'})
        claim.vet_record_url = claim_update.vet_record_url
    if claim_update.registration_record_url is not None:
        validate_cloudinary_url(claim_update.registration_record_url, allowed={'Image', 'Video', 'Document'})
        claim.registration_record_url = claim_update.registration_record_url
    if claim_update.additional_photos_url is not None:
        validate_cloudinary_url(claim_update.additional_photos_url, allowed={'Image', 'Video', 'Document'})
        claim.additional_photos_url = claim_update.additional_photos_url
    if claim_update.evidence_url is not None:
        validate_cloudinary_url(claim_update.evidence_url, allowed={'Image', 'Video', 'Document'})
        claim.evidence_url = claim_update.evidence_url
    if claim_update.distinctive_markings is not None:
        claim.distinctive_markings = claim_update.distinctive_markings
    if claim_update.remarks is not None:
        claim.remarks = claim_update.remarks
    if claim_update.status is not None:
        if is_staff_or_admin:
            claim.status = claim_update.status
        elif claim_update.status in ["Pending Review", "Evidence Requested"]:
            claim.status = claim_update.status
    elif claim.status in ["Evidence Requested", "Potential Owner Match"]:
        claim.status = "Pending Review"

    db.commit()
    db.refresh(claim)
    _attach_case_reports(db, claim)

    # Notify leaders
    rep = claim.report or db.query(Report).filter(Report.report_id == claim.report_id).first()
    if rep and rep.subdivision_id:
        try:
            leaders = db.query(User).filter(
                User.subdivision_id == rep.subdivision_id,
                User.role_id == 2
            ).all()
            for leader in leaders:
                db.add(Notification(
                    user_id=leader.user_id,
                    title="Pet Claim Documents Updated",
                    message=f"Resident {current_user.name} updated ownership proof for Report #{claim.report_id} ({claim.pet.display_name if claim.pet else 'Pet'}).",
                    type="claim",
                    related_id=claim.report_id
                ))
            db.commit()
        except Exception as notif_err:
            print(f"Notice: Failed to create leader update notification: {notif_err}")

    return claim


@router.delete("/{claim_id}")
def delete_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancel or delete a pet claim.
    Requires pet owner or Staff/Admin.
    """
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    is_owner = (claim.pet and claim.pet.owner_id == current_user.user_id)
    is_staff_or_admin = (current_user.role_id in [2, 3, 4])

    if not (is_owner or is_staff_or_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You can only delete your own claims or require staff/admin privileges."
        )

    pet_id = claim.pet_id
    db.delete(claim)
    db.commit()

    log_activity(
        db=db,
        action="DELETE_CLAIM",
        target_table="pet_claims",
        target_id=claim_id,
        description=f"User {current_user.name} (Role {current_user.role_id}) deleted claim #{claim_id} for pet #{pet_id}",
        log_type="operation",
        user_id=current_user.user_id
    )

    return {"message": f"Claim #{claim_id} deleted successfully", "claim_id": claim_id}


# ── Phase 7: claims for animals nobody holds ────────────────────────────────
from pydantic import BaseModel, Field  # noqa: E402
from datetime import datetime  # noqa: E402


class WhereaboutsAnswer(BaseModel):
    answer: str = Field(..., pattern="^(home|still_missing)$")
    note: Optional[str] = Field(None, max_length=1000)


def _handling_leader_ids(db: Session, report: Optional[Report]) -> List[int]:
    if report is None:
        return []
    root = case_root(db, report)
    if root.assigned_leader_id:
        return [root.assigned_leader_id]
    return [u.user_id for u in db.query(User).filter(User.subdivision_id == report.subdivision_id, User.role_id == 2).all()]


@router.post("/{claim_id}/whereabouts", response_model=PetClaimResponse)
def answer_whereabouts(claim_id: int, payload: WhereaboutsAnswer, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """
    The owner's answer when nobody holds the animal: Home or Still missing (with an optional note). The latest answer
    is kept on the claim and shown to the handling leader.
    """
    claim = db.query(PetClaim).options(joinedload(PetClaim.pet), joinedload(PetClaim.report)).filter(PetClaim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim = live_claim(db, claim)
    if not (claim.pet and claim.pet.owner_id == current_user.user_id):
        raise HTTPException(status_code=403, detail="Only the pet's owner can answer this.")
    if not claim_custody.claim_not_needed(db, claim):
        raise HTTPException(status_code=409, detail="The animal is being held, so the claim continues as usual.")
    claim.owner_whereabouts = payload.answer
    claim.owner_whereabouts_note = (payload.note or "").strip() or None
    claim.owner_whereabouts_at = datetime.now()
    label = "is home" if payload.answer == "home" else "is still missing"
    pet_label = claim.pet.display_name if claim.pet else "The pet"
    for lid in set(_handling_leader_ids(db, claim.report)):
        db.add(Notification(
            user_id=lid, type="claim", related_id=claim.report_id,
            title=f"Owner: {pet_label} {label}",
            message=(f"The owner answered on claim #{claim.claim_id} (Report #{claim.report_id}) that {pet_label} {label}."
                     + (f" Note: {claim.owner_whereabouts_note}" if claim.owner_whereabouts_note else "")),
        ))
    db.commit()
    db.refresh(claim)
    _attach_case_reports(db, claim)
    return claim


class CloseNotNeeded(BaseModel):
    reason: str = Field(..., min_length=10, max_length=2000)


@router.post("/{claim_id}/close-not-needed", response_model=PetClaimResponse)
def close_claim_not_needed(claim_id: int, payload: CloseNotNeeded, db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_staff_or_admin)):
    """
    Staff close an open claim whose animal nobody holds, with a reason. If its approval had moved the report to
    Claimed by Owner, the report goes back to its earlier status (with history). A completed return or adoption is
    never undone.
    """
    claim = db.query(PetClaim).options(joinedload(PetClaim.pet), joinedload(PetClaim.report)).filter(PetClaim.claim_id == claim_id).first()
    if not claim or not claim_visible_to(db, current_user, claim):
        raise HTTPException(status_code=404, detail="Claim not found")
    claim = live_claim(db, claim)
    if not claim_custody.claim_not_needed(db, claim):
        raise HTTPException(status_code=409, detail=(
            "This claim is still needed: the animal is being held, or the claim is already closed."))
    reason = payload.reason.strip()
    previous = claim.status
    restored = None
    report = claim.report
    if previous == "Approved" and report is not None and report.current_status_id == 9 and claim.status_before_approval:
        c = claim_custody.case_custody(db, report, claim)
        if not (c["returned"] or c["adopted"]):
            restored = claim.status_before_approval
            report.current_status_id = restored
            db.add(StatusHistory(report_id=report.report_id, report_status_id=restored, updated_by=current_user.user_id,
                                 remarks=(f"Claim #{claim.claim_id} closed as not needed by {current_user.name}: {reason} "
                                          f"The approval's 'Claimed by Owner' status was undone.")))
    if restored is None and report is not None:
        db.add(StatusHistory(report_id=report.report_id, report_status_id=report.current_status_id, updated_by=current_user.user_id,
                             remarks=f"Claim #{claim.claim_id} closed as not needed by {current_user.name}: {reason}"))
    claim.status = "Not Needed"
    claim.closed_reason = reason
    claim.closed_by = current_user.user_id
    claim.closed_at = datetime.now()
    if claim.pet and claim.pet.owner_id:
        db.add(Notification(
            user_id=claim.pet.owner_id, type="status_update", related_id=claim.report_id,
            title="Pet Claim Closed: Not Needed",
            message=(f"Your claim #{claim.claim_id} for {claim.pet.display_name} was closed because nobody is holding the animal. "
                     f"Reason: {reason}"),
        ))
    log_activity(db=db, action="CLOSE_CLAIM_NOT_NEEDED", target_table="pet_claims", target_id=claim.claim_id,
                 description=f"{current_user.name} closed claim #{claim.claim_id} as not needed: {reason}",
                 user_id=current_user.user_id, log_type="operation",
                 old_values={"status": previous}, new_values={"status": "Not Needed", "restored_report_status": restored},
                 commit=False)
    db.commit()
    db.refresh(claim)
    _attach_case_reports(db, claim)
    return claim
