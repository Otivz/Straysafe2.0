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
from app.utils.owner_returns import record_owner_return, _report_media_url
from app.utils.notification_dispatcher import (
    dispatch_notification,
    notify_claim_decision,
    notify_pet_reunited,
)

router = APIRouter(prefix="/claims", tags=["claims"])

@router.get("/", response_model=List[PetClaimResponse])
def get_claims(
    owner_id: Optional[int] = None,
    subdivision_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media)
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

    claims = query.order_by(PetClaim.created_at.desc()).all()
    for c in claims:
        _attach_case_reports(db, c)
        if not c.match_score:
            match_rec = db.query(ReportMatch).filter(
                ReportMatch.source_report_id == c.report_id,
                ReportMatch.matched_pet_id == c.pet_id
            ).first()
            if match_rec:
                c.match_score = match_rec.similarity_score

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


@router.get("/{claim_id}", response_model=PetClaimResponse)
def get_claim(claim_id: int, db: Session = Depends(get_db)):
    claim = db.query(PetClaim).options(
        joinedload(PetClaim.pet).joinedload(Pet.owner),
        joinedload(PetClaim.report).joinedload(Report.media)
    ).filter(PetClaim.claim_id == claim_id).first()

    if not claim or (claim.pet and claim.pet.status == "Deceased"):
        raise HTTPException(status_code=404, detail="Claim not found or pet is deceased.")
    claim = live_claim(db, claim)  # a merged claim opens the case's claim
    _attach_case_reports(db, claim)
    
    if not claim.match_score:
        match_rec = db.query(ReportMatch).filter(
            ReportMatch.source_report_id == claim.report_id,
            ReportMatch.matched_pet_id == claim.pet_id
        ).first()
        if match_rec:
            claim.match_score = match_rec.similarity_score

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

    # Ownership checks: Assign ownership if unowned; enforce owner identity for resident claims
    if pet.owner_id is None:
        pet.owner_id = current_user.user_id
        db.commit()
    elif current_user.role_id == 1 and pet.owner_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: You can only submit claims for your own registered pet."
        )

    # Fetch corresponding match score from report_matches if available
    match_rec = db.query(ReportMatch).filter(
        ReportMatch.source_report_id == claim_in.report_id,
        ReportMatch.matched_pet_id == claim_in.pet_id
    ).first()
    match_score_val = match_rec.similarity_score if match_rec else None

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
            db_claim.additional_photos_url = claim_in.additional_photos_url
        if claim_in.evidence_url:
            db_claim.evidence_url = claim_in.evidence_url
        if match_score_val and not db_claim.match_score:
            db_claim.match_score = match_score_val
        if claim_in.reuse_proof_from_claim_id and claim_in.reuse_proof_from_claim_id != db_claim.claim_id:
            _apply_reused_proof(db, db_claim, claim_in.pet_id, claim_in.reuse_proof_from_claim_id)
        db.commit()
        db.refresh(db_claim)
        _attach_case_reports(db, db_claim)
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
        additional_photos_url=claim_in.additional_photos_url,
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
            claim.additional_photos_url = file_url
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

        # Notify leaders of evidence submission
        rep = claim.report or db.query(Report).filter(Report.report_id == claim.report_id).first()
        if rep and rep.subdivision_id:
            try:
                leaders = db.query(User).filter(
                    User.subdivision_id == rep.subdivision_id,
                    User.role_id == 2
                ).all()
                for leader in leaders:
                    subd_notif = Notification(
                        user_id=leader.user_id,
                        title="Pet Claim Evidence Submitted",
                        message=f"Resident {current_user.name} submitted ownership evidence for Report #{claim.report_id} ({claim.pet.display_name if claim.pet else 'Pet'}).",
                        type="claim",
                        related_id=claim.report_id
                    )
                    db.add(subd_notif)
                db.commit()
            except Exception as notif_err:
                print(f"Notice: Failed to create leader evidence notification: {notif_err}")

        return claim
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
    claim = live_claim(db, claim)  # a merged claim's decision applies to the case's claim

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

    claim.status = status_update.status
    if status_update.remarks:
        claim.remarks = status_update.remarks

    # If claim is Approved, update corresponding Report and Pet statuses
    if status_update.status == "Approved":
        # 1. Update report status to 'Claimed by Owner' (ID 9)
        if claim.report:
            claim.report.current_status_id = 9
            # Add to report status history
            history_entry = StatusHistory(
                report_id=claim.report_id,
                report_status_id=9,
                remarks=f"Claim approved. Owner identified: {claim.pet.display_name if claim.pet else 'Pet'}. Coordinate handover with owner."
            )
            db.add(history_entry)

        # 2. Update pet status back to 'Active' since it's claimed
        if claim.pet:
            claim.pet.status = "Active"

    elif status_update.status == "Handover Complete":
        # Authoritative physical handover verification
        root = case_root(db, claim.report) if claim.report else None

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
                # Staff discretion bypass: use existing verified claim proof or pet photo
                photo_url = (
                    claim.additional_photos_url
                    or claim.evidence_url
                    or claim.vaccine_card_url
                    or claim.vet_record_url
                    or claim.registration_record_url
                    or (claim.pet.photo_url if claim.pet else None)
                )
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
