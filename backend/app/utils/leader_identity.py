"""
Leader identity verification (Phase 6, docs/01-system/OWNER_WARNING_RULES.md).

When staff confirmed a sighting as a registered, owned pet and the owner either rejected it or did not answer within
24 hours, the handling Subdivision Leader may verify the identity themselves, with a documented method and reason.

It links the report to the pet so the case can proceed, but:
- it never changes the owner's answer on the match;
- it is never ownership proof at handover (owner_returns.owner_already_on_record ignores it);
- it never touches adoption ownership or consent;
- the owner is notified and keeps formal dispute access;
- owner-first pairs (Manual Matching, app/utils/pet_match_confirmation.py) are excluded: there, the owner's answer is final.
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.leader_identity import LeaderIdentityVerification
from app.models.pet import Pet
from app.models.report import Report
from app.models.report_dispute import ReportDispute
from app.models.report_match import ReportMatch
from app.models.user import User

NO_RESPONSE_HOURS = 24
METHODS = ("In-Person Inspection", "Microchip / Tag Check", "Owner Interview", "Photo Comparison with Documents")
MIN_REASON = 15


def eligibility(db: Session, match: ReportMatch, actor: User, now: Optional[datetime] = None) -> Tuple[Optional[str], Optional[str]]:
    """(trigger, None) when the actor may verify this match now; (None, reason) otherwise."""
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS, case_root, pet_conflict_for_case
    from app.utils.pet_match_confirmation import CANCELLED, latest_request
    from app.utils.report_split import is_split_group

    now = now or datetime.now()
    if actor.role_id != 2:
        return None, "Only the handling Subdivision Leader can verify an identity."
    if not match.matched_pet_id or not match.source_report_id:
        return None, "Only a registered-pet match can be verified."
    report: Optional[Report] = db.get(Report, match.source_report_id)
    pet: Optional[Pet] = db.get(Pet, match.matched_pet_id)
    if report is None or pet is None:
        return None, "The report or the pet record no longer exists."
    if not actor.subdivision_id or report.subdivision_id != actor.subdivision_id:
        return None, "This report is outside your subdivision."
    root = case_root(db, report)
    if root.assigned_leader_id != actor.user_id:
        return None, "Only the leader handling this case can verify its identity."
    if (root.current_status_id or 0) in CASE_CLOSED_STATUS_IDS:
        return None, "This case is closed."
    if not pet.owner_id:
        return None, "This pet has no registered owner; staff confirmation alone already links it."
    if match.status != "CONFIRMED_MATCH":
        return None, "Staff must confirm the match first."
    if report.pet_id == pet.pet_id:
        return None, "The report is already linked to this pet."
    if db.query(LeaderIdentityVerification.verification_id).filter(LeaderIdentityVerification.match_id == match.match_id).first():
        return None, "This identity was already verified."
    req = latest_request(db, report.report_id, pet.pet_id)
    if req is not None and req.status != CANCELLED:
        return None, "This pair follows owner confirmation first; the owner's answer decides it."
    if db.query(ReportDispute.dispute_id).filter(ReportDispute.report_id == report.report_id,
                                                ReportDispute.status == "Pending").first():
        return None, "The owner has a pending dispute on this report. Decide the dispute first."
    if pet_conflict_for_case(db, report, pet.pet_id):
        return None, pet_conflict_for_case(db, report, pet.pet_id)
    if is_split_group(db, report):
        return None, "This report stands for several animals; verify the individual animal record instead."

    if match.owner_confirmation_status == "OWNER_REJECTED":
        return "OWNER_REJECTED", None
    if match.owner_confirmation_status in ("PENDING", "NO_RESPONSE"):
        asked = match.verified_at
        if asked is None:
            return None, "The owner hasn't been asked yet."
        if now - asked < timedelta(hours=NO_RESPONSE_HOURS):
            left = timedelta(hours=NO_RESPONSE_HOURS) - (now - asked)
            hours = max(1, int(left.total_seconds() // 3600))
            return None, f"The owner still has about {hours} hour{'s' if hours != 1 else ''} to answer."
        return "NO_RESPONSE_24H", None
    return None, "The owner already confirmed; no leader verification is needed."


def is_leader_verified_only(db: Session, report: Report) -> bool:
    """Is this report's pet link based on a leader verification alone (no owner confirmation)?"""
    if not report.pet_id:
        return False
    if not db.query(LeaderIdentityVerification.verification_id).filter(
            LeaderIdentityVerification.report_id == report.report_id,
            LeaderIdentityVerification.pet_id == report.pet_id).first():
        return False
    owner_confirmed = db.query(ReportMatch.match_id).filter(
        ReportMatch.source_report_id == report.report_id, ReportMatch.matched_pet_id == report.pet_id,
        ReportMatch.owner_confirmation_status == "OWNER_CONFIRMED").first()
    return owner_confirmed is None
