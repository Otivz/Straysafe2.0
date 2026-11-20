"""
Owner-first pet matching rules (docs/01-system/MANUAL_REPORT_MATCHING.md, "Owner confirmation first").

Once staff send a confirmation request for a report and a registered pet, that pair follows this order:
    Awaiting Owner Confirmation -> owner YES (Owner Confirmed) -> staff final verification
                                -> owner NO  (Owner Declined)  -> staff final verification (the owner's answer is evidence only)
verify_match calls enforce_owner_first / record_final_decision for every pet decision, so no endpoint can skip the owner.
Pairs with no request keep the existing AI flow unchanged.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pet_match_confirmation import PetMatchConfirmationRequest
from app.models.report_match import ReportMatch
from app.models.user import User

AWAITING = "AWAITING_OWNER_CONFIRMATION"
OWNER_CONFIRMED = "OWNER_CONFIRMED"
OWNER_REJECTED = "OWNER_REJECTED"
CANCELLED = "CANCELLED"
NEEDS_FURTHER_VERIFICATION = "NEEDS_FURTHER_VERIFICATION"
VERIFIED_MATCH = "VERIFIED_MATCH"
REJECTED_MATCH = "REJECTED_MATCH"
# The Leader could not reach the possible owner (Possible Pet Owner Verification). Ends the request without an answer: it never counts
# as a YES or a NO, and a new request may be sent later.
UNABLE_TO_CONTACT = "UNABLE_TO_CONTACT"

STATUS_LABELS = {
    AWAITING: "Awaiting Owner Confirmation",
    OWNER_CONFIRMED: "Owner Confirmed – Pending Admin Review",
    OWNER_REJECTED: "Owner Declined – Pending Admin Review",
    CANCELLED: "Cancelled",
    NEEDS_FURTHER_VERIFICATION: "Needs Further Verification",
    VERIFIED_MATCH: "Verified Match",
    REJECTED_MATCH: "Rejected Match",
    UNABLE_TO_CONTACT: "Unable to Contact",
}
# Requests that ended without the owner answering: the pair is back to "no request" for the owner-first rule
ENDED_WITHOUT_ANSWER = (CANCELLED, UNABLE_TO_CONTACT)
# The owner answered (YES or NO): the answer is only evidence, so the Subdivision Administration may make (or revisit) the final decision
FINALIZABLE = (OWNER_CONFIRMED, OWNER_REJECTED, NEEDS_FURTHER_VERIFICATION)
# A new request for the same pair is refused while the latest one is in any of these
BLOCKS_NEW_REQUEST = (AWAITING, OWNER_CONFIRMED, NEEDS_FURTHER_VERIFICATION, OWNER_REJECTED, VERIFIED_MATCH, REJECTED_MATCH)
FINAL_STATUS = {"CONFIRMED_MATCH": VERIFIED_MATCH, "NOT_A_MATCH": REJECTED_MATCH, "UNABLE_TO_VERIFY": NEEDS_FURTHER_VERIFICATION}


def latest_request(db: Session, report_id: int, pet_id: int) -> Optional[PetMatchConfirmationRequest]:
    return (db.query(PetMatchConfirmationRequest)
            .filter(PetMatchConfirmationRequest.report_id == report_id, PetMatchConfirmationRequest.pet_id == pet_id)
            .order_by(PetMatchConfirmationRequest.request_id.desc()).first())


def new_request_block_reason(latest: Optional[PetMatchConfirmationRequest]) -> Optional[str]:
    if latest is None or latest.status not in BLOCKS_NEW_REQUEST:
        return None
    if latest.status == AWAITING:
        return f"A confirmation request (#{latest.request_id}) is already waiting for the owner's answer."
    if latest.status == OWNER_REJECTED:
        return "The owner declined ownership. Review the response and make the final verification decision."
    if latest.status in FINALIZABLE:
        return "The owner already answered. Make the final verification instead."
    return f"This pair already has a final decision ({STATUS_LABELS[latest.status]})."


def enforce_owner_first(db: Session, match: ReportMatch, decision: str) -> Optional[PetMatchConfirmationRequest]:
    """
    Before a staff decision on a report-to-pet match. Raises 409 when the owner hasn't said YES. When the owner did,
    the match carries the owner's confirmation, so a staff Confirm links the report to the pet right away.
    """
    if not (match.matched_pet_id and match.source_report_id):
        return None
    req = latest_request(db, match.source_report_id, match.matched_pet_id)
    if req is None or req.status in ENDED_WITHOUT_ANSWER:
        return None
    if req.status == AWAITING:
        raise HTTPException(status_code=409, detail=(
            "The owner hasn't answered the confirmation request yet. The final decision unlocks after the owner "
            "confirms this is their pet."))
    if req.status in FINALIZABLE or (req.status == VERIFIED_MATCH and decision == "CONFIRMED_MATCH"):
        # The owner's answer (YES or NO) stays recorded as evidence on the match; the administrator's decision is what counts
        match.owner_confirmation_status = "OWNER_REJECTED" if req.status == OWNER_REJECTED else "OWNER_CONFIRMED"
        if req.owner_note:
            match.owner_notes = req.owner_note
        return req
    raise HTTPException(status_code=409, detail=(
        f"This pair already has a final decision ({STATUS_LABELS.get(req.status, req.status)})."))


def record_final_decision(db: Session, match: ReportMatch, decision: str, actor: User,
                          req: Optional[PetMatchConfirmationRequest]) -> None:
    """Store the staff's final verification on the owner-confirmed request (same transaction as the match decision)."""
    if req is None or req.status not in FINALIZABLE:
        return
    previous = req.status
    req.final_decision = decision
    req.final_by = actor.user_id
    req.final_at = datetime.now()
    req.match_id = match.match_id
    req.status = FINAL_STATUS[decision]
    add_event(req, "final_decision", actor, note=match.verification_notes, previous=previous, decision=decision)
    # The possible owner's conversation and notification (only for requests made through Possible Pet Owner Verification)
    from app.services import owner_verification
    owner_verification.after_final_decision(db, req, actor, decision)


def add_event(req: PetMatchConfirmationRequest, kind: str, actor: Optional[User] = None, note: Optional[str] = None,
              at: Optional[datetime] = None, **extra) -> None:
    """
    Append one entry to the request's status history (`events`): what happened, the status after it, who and when. Entries are
    never edited or removed; the list is reassigned so SQLAlchemy writes the JSON column.
    """
    entry = {"kind": kind, "status": req.status, "at": (at or datetime.now()).isoformat(timespec="seconds"),
             "by": actor.user_id if actor is not None else None, "by_name": actor.name if actor is not None else None}
    if note:
        entry["note"] = str(note)[:1000]
    entry.update({k: v for k, v in extra.items() if v is not None})
    req.events = list(req.events or []) + [entry]
