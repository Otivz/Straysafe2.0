"""
Barangay Referral log (Subdivision-only plan, Phase 2).

The Subdivision Leader refers a case to the Barangay (an external party with no StraySafe account), then records what
the Barangay reports back and the final outcome. Only the leader of the report's subdivision and the Administrator may
use these routes. Every write is audited.

Rules:
- A referral replaces the old rescue request: it sets the report to status 4 (Referred to Barangay) and keeps the
  endorsement letter, but creates no Rescue row and notifies no Barangay account.
- An update never changes facility_id, custody_status, the pin, or any holding record. "Held" or "impounded" here is
  only what the Barangay said; the animal is never shown as held in StraySafe (location rule).
- A final outcome closes the report once, with a history entry marked as reported by the Barangay.
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.barangay_referral import OUTCOME_STATUS, BarangayReferral, BarangayReferralUpdate
from app.models.report import EndorsementLetter, Report, ReportMedia, ReportStatus, StatusHistory
from app.models.user import Barangay, Subdivision, User
from app.schemas.barangay_referral import (
    ReferralCreate, ReferralOutcomeCreate, ReferralResponse, ReferralUpdateCreate, ReferralUpdateResponse,
)
from app.utils.audit import log_activity
from app.utils.auth import get_current_user, verify_subdivision_scope

router = APIRouter(tags=["barangay-referrals"])

REFERRED_STATUS_ID = 4
REFERABLE_STATUS_IDS = (1, 2, 4)   # 1 Reported, 2 Verified; 4 = an older escalation with no referral record yet
MERGED_STATUS_ID = 18

SOURCE_LABELS = {"barangay_reported": "Reported by Barangay", "straysafe_user": "Recorded by StraySafe user"}
CONTACT_LABELS = {"call": "phone call", "visit": "visit", "message": "message", "letter": "letter", "other": "other means"}
OUTCOME_LABELS = {"claimed": "claimed by the owner", "released": "released", "resolved": "resolved",
                  "deceased": "deceased", "not_found": "the animal could not be found"}


def leader_or_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the Subdivision Leader or the Administrator can manage Barangay referrals.")
    return current_user


def _report_in_scope(db: Session, report_id: int, user: User) -> Report:
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    verify_subdivision_scope(user, report.subdivision_id, db=db)
    return report


def _referral_in_scope(db: Session, referral_id: int, user: User) -> BarangayReferral:
    referral = db.query(BarangayReferral).filter(BarangayReferral.referral_id == referral_id).first()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found.")
    _report_in_scope(db, referral.report_id, user)
    return referral


def _status_name(db: Session, status_id: int) -> str:
    row = db.query(ReportStatus).filter(ReportStatus.status_id == status_id).first()
    return row.status_name if row else f"Status {status_id}"


def _check_reported_date(value: date, referral: BarangayReferral, what: str) -> None:
    if value > date.today() + timedelta(days=1):
        raise HTTPException(status_code=400, detail=f"The {what} date cannot be in the future.")
    if referral.referred_at and value < referral.referred_at.date():
        raise HTTPException(status_code=400, detail=f"The {what} date cannot be before the referral date.")


def _names(db: Session, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(ids)).all()}


def _to_response(db: Session, referral: BarangayReferral) -> ReferralResponse:
    names = _names(db, [referral.referred_by, referral.outcome_recorded_by] + [u.recorded_by for u in referral.updates])
    barangay = db.query(Barangay).filter(Barangay.barangay_id == referral.barangay_id).first()
    report = db.query(Report).filter(Report.report_id == referral.report_id).first()
    letter = db.query(EndorsementLetter).filter(EndorsementLetter.report_id == referral.report_id).first()
    return ReferralResponse(
        referral_id=referral.referral_id, report_id=referral.report_id, barangay_id=referral.barangay_id,
        barangay_name=barangay.barangay_name if barangay else None,
        referred_by=referral.referred_by, referred_by_name=names.get(referral.referred_by),
        referred_at=referral.referred_at, reason=referral.reason, reference_no=referral.reference_no,
        contact_method=referral.contact_method, final_outcome=referral.final_outcome,
        outcome_date=referral.outcome_date, outcome_note=referral.outcome_note,
        outcome_recorded_by=referral.outcome_recorded_by, outcome_recorded_by_name=names.get(referral.outcome_recorded_by),
        outcome_recorded_at=referral.outcome_recorded_at,
        report_status_id=report.current_status_id if report else None,
        letter_title=letter.title if letter else None, letter_file_url=letter.file_url if letter else None,
        updates=[ReferralUpdateResponse(
            update_id=u.update_id, update_type=u.update_type, source=u.source,
            source_label=SOURCE_LABELS.get(u.source, u.source), update_date=u.update_date, note=u.note,
            evidence_url=u.evidence_url, recorded_by=u.recorded_by, recorded_by_name=names.get(u.recorded_by),
            recorded_at=u.recorded_at,
        ) for u in referral.updates],
    )


def _notify_reporter(db: Session, report: Report, status_id: int, remarks: str) -> None:
    reporter = db.query(User).filter(User.user_id == report.user_id).first()
    if not reporter:
        return
    try:
        from app.utils.notification_dispatcher import notify_report_status_update
        notify_report_status_update(db=db, recipient=reporter, report_id=report.report_id, status_id=status_id,
                                    status_name=_status_name(db, status_id), remarks=remarks, landmark=report.landmark)
    except Exception as err:  # a notification problem must not undo the record
        print(f"Notice: referral notification to the reporter failed: {err}")


@router.get("/referrals/", response_model=List[ReferralResponse])
def list_referrals(open_only: bool = False, db: Session = Depends(get_db), user: User = Depends(leader_or_admin)):
    """Referrals the user may see: the leader's own subdivision, or all for the Administrator. Newest first."""
    query = db.query(BarangayReferral).join(Report, Report.report_id == BarangayReferral.report_id)
    if user.role_id == 2:
        query = query.filter(Report.subdivision_id == user.subdivision_id)
    if open_only:
        query = query.filter(BarangayReferral.final_outcome.is_(None))
    return [_to_response(db, r) for r in query.order_by(BarangayReferral.referral_id.desc()).all()]


@router.get("/reports/{report_id}/referral", response_model=ReferralResponse)
def get_referral(report_id: int, db: Session = Depends(get_db), user: User = Depends(leader_or_admin)):
    _report_in_scope(db, report_id, user)
    referral = db.query(BarangayReferral).filter(BarangayReferral.report_id == report_id).first()
    if not referral:
        raise HTTPException(status_code=404, detail="This report has not been referred to the Barangay.")
    return _to_response(db, referral)


@router.post("/reports/{report_id}/referral", response_model=ReferralResponse, status_code=201)
def create_referral(report_id: int, body: ReferralCreate, db: Session = Depends(get_db),
                    user: User = Depends(leader_or_admin)):
    report = _report_in_scope(db, report_id, user)
    if report.current_status_id == MERGED_STATUS_ID or report.duplicate_of_report_id:
        raise HTTPException(status_code=400, detail="This report was merged into another case. Refer the primary case instead.")
    if db.query(BarangayReferral).filter(BarangayReferral.report_id == report_id).first():
        raise HTTPException(status_code=409, detail="This report has already been referred to the Barangay.")
    if report.current_status_id not in REFERABLE_STATUS_IDS:
        raise HTTPException(status_code=400, detail=f"A case that is '{_status_name(db, report.current_status_id)}' cannot be referred.")
    if report.current_status_id in (1, 2):
        from app.utils.case_review import require_animal_record
        require_animal_record(report, db, "referred to the Barangay")

    subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == report.subdivision_id).first()
    if not subdivision or not subdivision.barangay_id:
        raise HTTPException(status_code=400, detail="This subdivision has no Barangay on record.")
    barangay = db.query(Barangay).filter(Barangay.barangay_id == subdivision.barangay_id).first()
    barangay_name = barangay.barangay_name if barangay else "the Barangay"

    referral = BarangayReferral(report_id=report_id, barangay_id=subdivision.barangay_id, referred_by=user.user_id,
                                reason=body.reason.strip(), reference_no=(body.reference_no or "").strip() or None,
                                contact_method=body.contact_method)
    db.add(referral)

    # Endorsement letter: kept as before (one per report), now written by the referring user
    evidence = db.query(ReportMedia).filter(ReportMedia.report_id == report_id, ReportMedia.is_evidence == True)  # noqa: E712
    evidence = evidence.order_by(ReportMedia.media_id.desc()).first()
    letter = db.query(EndorsementLetter).filter(EndorsementLetter.report_id == report_id).first()
    title = (body.letter_title or "").strip() or f"Endorsement for Report #{report_id}"
    if letter:
        letter.leader_id, letter.title, letter.letter_content, letter.status_id = user.user_id, title, referral.reason, 2
        if evidence:
            letter.file_url = evidence.file_url
    else:
        db.add(EndorsementLetter(report_id=report_id, leader_id=user.user_id, title=title, letter_content=referral.reason,
                                 file_url=evidence.file_url if evidence else None, status_id=2))

    remarks = (f"Referred to Barangay {barangay_name} by {user.name} ({CONTACT_LABELS[body.contact_method]}). "
               f"Reason: {referral.reason}")
    old_status = report.current_status_id
    if old_status in (1, 2):
        report.current_status_id = REFERRED_STATUS_ID
        # Pin and facility are copied unchanged: a referral does not move the animal
        db.add(StatusHistory(report_id=report_id, report_status_id=REFERRED_STATUS_ID, updated_by=user.user_id,
                             latitude=report.latitude, longitude=report.longitude, landmark=report.landmark,
                             remarks=remarks))
    db.flush()
    log_activity(db=db, action="Create Barangay Referral", target_table="barangay_referrals",
                 target_id=referral.referral_id, user_id=user.user_id, log_type="operation",
                 description=f"Report #{report_id} referred to Barangay {barangay_name} by {user.name}.",
                 old_values={"report_status_id": old_status},
                 new_values={"report_status_id": report.current_status_id, "contact_method": body.contact_method,
                             "reference_no": referral.reference_no},
                 commit=False)
    if old_status in (1, 2):
        _notify_reporter(db, report, REFERRED_STATUS_ID, f"Your report was referred to Barangay {barangay_name}.")
    db.commit()
    db.refresh(referral)
    return _to_response(db, referral)


@router.post("/referrals/{referral_id}/updates", response_model=ReferralResponse, status_code=201)
def add_referral_update(referral_id: int, body: ReferralUpdateCreate, db: Session = Depends(get_db),
                        user: User = Depends(leader_or_admin)):
    referral = _referral_in_scope(db, referral_id, user)
    if referral.final_outcome:
        raise HTTPException(status_code=409, detail="This referral already has a final outcome. No more updates can be added.")
    _check_reported_date(body.update_date, referral, "update")
    update = BarangayReferralUpdate(referral_id=referral_id, update_type=body.update_type, source=body.source,
                                    update_date=body.update_date, note=(body.note or "").strip() or None,
                                    evidence_url=body.evidence_url, recorded_by=user.user_id)
    db.add(update)
    db.flush()
    log_activity(db=db, action="Record Barangay Update", target_table="barangay_referral_updates",
                 target_id=update.update_id, user_id=user.user_id, log_type="operation",
                 description=(f"{SOURCE_LABELS[body.source]} on {body.update_date.isoformat()}: {body.update_type} "
                              f"(Report #{referral.report_id}), recorded by {user.name}."),
                 new_values={"update_type": body.update_type, "source": body.source,
                             "update_date": body.update_date.isoformat(), "has_evidence": bool(body.evidence_url)},
                 commit=False)
    db.commit()
    db.refresh(referral)
    return _to_response(db, referral)


@router.post("/referrals/{referral_id}/outcome", response_model=ReferralResponse)
def record_referral_outcome(referral_id: int, body: ReferralOutcomeCreate, db: Session = Depends(get_db),
                            user: User = Depends(leader_or_admin)):
    referral = _referral_in_scope(db, referral_id, user)
    if referral.final_outcome:
        raise HTTPException(status_code=409, detail="The final outcome of this referral was already recorded.")
    report = db.query(Report).filter(Report.report_id == referral.report_id).first()
    if report.current_status_id != REFERRED_STATUS_ID:
        raise HTTPException(status_code=409, detail=(
            f"This case is now '{_status_name(db, report.current_status_id)}', not 'Referred to Barangay'. "
            "Its outcome cannot be recorded here."))
    _check_reported_date(body.outcome_date, referral, "outcome")

    from app.utils.holding_stay import db_now
    new_status = OUTCOME_STATUS[body.final_outcome]
    barangay = db.query(Barangay).filter(Barangay.barangay_id == referral.barangay_id).first()
    barangay_name = barangay.barangay_name if barangay else "the Barangay"
    note = (body.note or "").strip() or None
    referral.final_outcome, referral.outcome_date, referral.outcome_note = body.final_outcome, body.outcome_date, note
    referral.outcome_recorded_by, referral.outcome_recorded_at = user.user_id, db_now(db)

    old_status = report.current_status_id
    report.current_status_id = new_status   # status only: custody, facility and pin are not touched
    remarks = (f"Reported by Barangay {barangay_name} on {body.outcome_date.isoformat()}, recorded by {user.name}: "
               f"{OUTCOME_LABELS[body.final_outcome]}." + (f" {note}" if note else ""))
    db.add(StatusHistory(report_id=report.report_id, report_status_id=new_status, updated_by=user.user_id,
                         latitude=report.latitude, longitude=report.longitude, landmark=report.landmark, remarks=remarks))
    log_activity(db=db, action="Record Barangay Outcome", target_table="barangay_referrals",
                 target_id=referral.referral_id, user_id=user.user_id, log_type="operation",
                 description=f"Outcome for Report #{report.report_id} reported by Barangay {barangay_name}: {body.final_outcome}.",
                 old_values={"report_status_id": old_status},
                 new_values={"report_status_id": new_status, "final_outcome": body.final_outcome,
                             "outcome_date": body.outcome_date.isoformat()},
                 commit=False)
    _notify_reporter(db, report, new_status, f"Barangay {barangay_name} reported: {OUTCOME_LABELS[body.final_outcome]}.")
    db.commit()
    db.refresh(referral)
    return _to_response(db, referral)
