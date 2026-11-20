"""
Possible Pet Owner Verification (2026-11-20, docs/01-system/POSSIBLE_OWNER_VERIFICATION.md).

When the Pet Registry matching (report_matches rows for registered pets, scored by utils/match_scoring.py) points at a registered pet, the
Subdivision Administration may contact that pet's owner to ask whether the reported animal is theirs. Nothing here is new machinery:

  - the verification record is the existing owner-first request (pet_match_confirmation_requests, utils/pet_match_confirmation.py), created
    with the same checks as Manual Matching's Send Confirmation (routes/manual_matching.create_confirmation_request);
  - the conversation is an existing case conversation (case_message_threads, kind `direct`, services/case_messaging.py), tied to the report,
    with the possible owner as a member in the role `pet_owner`; it closes with the case like every other report conversation;
  - the owner answers YES / NO with the existing endpoint (POST /pet-match-confirmations/{id}/respond), or simply writes in the conversation;
  - the final verification is the existing staff decision (POST /manual-matching/decisions with pet_id -> verify_match), which is refused
    until the owner said YES (enforce_owner_first). Ownership is never assumed: not from a score, not from a silence.

Statuses shown on the case screen (from the request's status):
  Possible Owner Identified (no request yet, or the last one was cancelled) -> Awaiting Owner Response -> Owner Confirmed / Owner Declined
  – Pending Admin Review (the owner's answer is evidence only) -> Ownership Verified | Ownership Not Verified (the administrator's decision);  Unable to Contact (the Leader could not reach them; a new request may be sent later).
Every change is appended to the request's `events` and written to the audit log. The reporter is never named to the possible owner.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.models.case_messaging import CaseMessage, CaseMessageThread
from app.models.pet import Pet
from app.models.pet_match_confirmation import PetMatchConfirmationRequest
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.models.user import User
from app.services import case_lifecycle as L
from app.services import case_messaging as CM
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils import pet_match_confirmation as OF

PET_OWNER = CM.PET_OWNER
MAX_BODY = CM.MAX_BODY
# The suggestions that can name a possible owner: still open, or decided with the owner involved
CANDIDATE_MATCH_STATUSES = ("AI_SUGGESTED", "PENDING_VERIFICATION", "CONFIRMED_MATCH", "UNABLE_TO_VERIFY")

IDENTIFIED, AWAITING, OWNER_CONFIRMED, OWNER_DECLINED, VERIFIED, NOT_CONFIRMED, UNABLE = (
    "identified", "awaiting", "owner_confirmed", "owner_declined", "verified", "not_confirmed", "unable_to_contact")
STATUS_LABELS = {
    IDENTIFIED: "Possible Owner Identified",
    AWAITING: "Awaiting Owner Response",
    OWNER_CONFIRMED: "Owner Confirmed – Pending Admin Review",
    OWNER_DECLINED: "Owner Declined – Pending Admin Review",
    VERIFIED: "Ownership Verified",
    NOT_CONFIRMED: "Ownership Not Verified",
    UNABLE: "Unable to Contact",
}
EVENT_LABELS = {
    "identified": "Possible owner identified",
    "requested": "Verification request created",
    "contacted": "Possible owner contacted",
    "follow_up": "Follow-up sent",
    "owner_confirmed": "Owner confirmed ownership",
    "owner_denied": "Owner denied ownership",
    "unable_to_contact": "Marked as unable to contact",
    "cancelled": "Request cancelled",
    "final_decision": "Final verification decision",
}
FINAL_LABELS = {"CONFIRMED_MATCH": "Ownership verified", "NOT_A_MATCH": "Ownership not verified",
                "UNABLE_TO_VERIFY": "Needs further verification"}


def _is_lost(report: Report) -> bool:
    """A lost-pet report names its own owner: by the fixed category id or marker, or by the category's name."""
    cat = getattr(getattr(report, "category", None), "category_name", None)
    return V.is_lost_pet_report(report) or V.category_family(cat) == V.LOST_PET


def display_status(req: Optional[PetMatchConfirmationRequest]) -> str:
    if req is None or req.status == OF.CANCELLED:
        return IDENTIFIED
    return {
        OF.AWAITING: AWAITING,
        OF.OWNER_CONFIRMED: OWNER_CONFIRMED, OF.NEEDS_FURTHER_VERIFICATION: OWNER_CONFIRMED,
        OF.VERIFIED_MATCH: VERIFIED,
        OF.OWNER_REJECTED: OWNER_DECLINED, OF.REJECTED_MATCH: NOT_CONFIRMED,
        OF.UNABLE_TO_CONTACT: UNABLE,
    }.get(req.status, IDENTIFIED)


# ----------------------------------------------------------------------------------------------------------- wording
def administration_name(report: Optional[Report]) -> str:
    """"Selera Homes Subdivision Administration" from the report's subdivision ("Subdivision Administration" when it has none)."""
    sub = getattr(report, "subdivision", None) if report is not None else None
    name = " ".join(((getattr(sub, "subdivision_name", None) or "")).split())
    if not name:
        return "Subdivision Administration"
    return f"{name} Administration" if "subdivision" in name.lower() else f"{name} Subdivision Administration"


def message_template(report: Optional[Report] = None) -> str:
    """The editable default Ownership Verification message (the Leader may change every word before sending)."""
    return (
        "Hello! The Subdivision Administration received a report involving an animal that may match your registered pet. "
        "We would like to verify whether this animal belongs to you. Please review the details and select Confirm Ownership "
        "or Decline Ownership."
    )


def _known(v: Optional[str]) -> Optional[str]:
    t = " ".join((v or "").split())
    return t if t and t.lower() not in ("unknown", "not sure", "n/a", "none", "-") else None


def animal_summary(report: Report) -> Dict[str, Any]:
    """
    What the possible owner may learn about the reported animal: what it looks like, roughly where and when. Never who reported it, their
    contact details or the exact pin.
    """
    sub = getattr(report, "subdivision", None)
    return {
        "reference": CM.report_ref(report),
        "animal_type": _known(report.animal_type),
        "breed": _known(report.animal_breed),
        "colour": _known(report.animal_color),
        "size": _known(report.estimated_size),
        "subdivision": getattr(sub, "subdivision_name", None),
        "reported_at": report.created_at.isoformat() if report.created_at else None,
        "photo_count": sum(1 for m in (report.media or []) if m.file_url and m.media_type in ("Image", None)),
    }


def _animal_line(report: Report) -> str:
    a = animal_summary(report)
    looks = " · ".join(x for x in (a["animal_type"], a["breed"], a["colour"], a["size"] and f"{a['size']} size") if x) or "no description given"
    when = report.created_at.strftime("%d %b %Y") if report.created_at else None
    where = f" in {a['subdivision']}" if a["subdivision"] else ""
    return f"{looks}. Reported{f' on {when}' if when else ''}{where}."


def _opening_text(report: Report, pet: Pet) -> str:
    return (f"Ownership verification for Report {CM.report_ref(report)}. The reported animal: {_animal_line(report)} "
            f"The Subdivision Administration asks whether it is your registered pet {pet.display_name}. "
            "Answer below with “Yes, this is my pet” or “No, this is not my pet”, or write here. Nothing about ownership changes until the "
            "Subdivision Administration verifies it. The reporter’s details are not shared.")


def owner_link(request_id: int) -> str:
    """Where the possible owner reviews the reported animal next to their pet and answers (Resident app route)."""
    return f"/resident-app/ownership/{request_id}"


def _with_link(text: str, req: PetMatchConfirmationRequest) -> str:
    """The Leader's message plus the direct link, once (a repeated send never doubles it)."""
    link = owner_link(req.request_id)
    if link in text:
        return text
    tail = f"\n\nReview the reported animal's photos and details, then Confirm or Decline Ownership here: {link}"
    return text[: max(0, MAX_BODY - len(tail))].rstrip() + tail


def _preview(text: Optional[str], n: int = 300) -> Optional[str]:
    one = " ".join((text or "").split())
    if not one:
        return None
    return one if len(one) <= n else one[: n - 1].rstrip() + "…"


def _audit(db: Session, actor_id: Optional[int], action: str, req: PetMatchConfirmationRequest, description: str,
           old: Optional[Dict[str, Any]] = None, new: Optional[Dict[str, Any]] = None) -> None:
    """One audit row per verification event, with the ids and statuses. The message text stays in the conversation."""
    db.add(AuditLog(user_id=actor_id, action=action, target_table="pet_match_confirmation_requests", target_id=req.request_id,
                    description=description, log_type="operation", old_values=old,
                    new_values={"request_id": req.request_id, "report_id": req.report_id, "pet_id": req.pet_id, "owner_id": req.owner_id,
                                "thread_id": req.thread_id, "status": req.status, **(new or {})}))


def _notify(db: Session, user_id: Optional[int], ntype: str, related_id: int, title: str, message: str) -> None:
    """The conversation's one unread notification for this person, with a verification title (replacing the plain "new message" one)."""
    if not user_id:
        return
    db.flush()              # the notification send() just added is pending: let _notify_once find and refresh it instead of stacking
    CM._notify_once(db, user_id, ntype, related_id, title, message)


def _notify_request(db: Session, req: PetMatchConfirmationRequest, title: str, message: str) -> None:
    """
    The owner's one unread verification notification; a tap opens the verification page (photos side by side, Confirm / Decline). It replaces
    the plain "new message" notification the conversation message just added, so the owner is not notified twice.
    """
    if not req.owner_id:
        return
    from app.models.notification import Notification
    db.flush()
    with db.no_autoflush:
        stale = (db.query(Notification).filter(Notification.user_id == req.owner_id, Notification.type == "case_message",
                                               Notification.related_id == req.thread_id, Notification.is_read.is_(False)).all())
    for n in stale:
        db.delete(n)
    CM._notify_once(db, req.owner_id, "ownership_verification", req.request_id, title, message)


def _now() -> datetime:
    return datetime.now()


# ------------------------------------------------------------------------------------------------------- the list
def _matching(m: Optional[ReportMatch]) -> Optional[Dict[str, Any]]:
    """The existing matcher's result for this pet: score and classification only when that matcher produced them (a manual one has none)."""
    if m is None:
        return None
    ev = m.ai_evidence if isinstance(m.ai_evidence, dict) else {}
    if ev.get("engine") == "manual":
        return {"method": "manual", "label": "Staff-identified match", "score": None, "classification": None, "classification_label": None,
                "coverage": None, "attributes": [], "explanation": None}
    analysis = ev.get("multi_attribute") if isinstance(ev.get("multi_attribute"), dict) else None
    if analysis:
        attrs = analysis.get("attributes") or {}
        rows = []
        for key in ("visual", "location", "breed", "coat", "description"):
            a = attrs.get(key) if isinstance(attrs, dict) else None
            if not isinstance(a, dict):
                continue
            rows.append({"key": key, "label": a.get("label") or key.title(), "score": a.get("score"), "available": bool(a.get("available")),
                         "explanation": a.get("explanation")})
        return {"method": "multi_attribute", "label": "Pet Registry matching", "score": analysis.get("score"),
                "classification": analysis.get("classification"), "classification_label": analysis.get("classification_label"),
                "coverage": analysis.get("coverage"), "attributes": rows, "explanation": m.ai_explanation}
    return {"method": "registry", "label": "Pet Registry matching", "score": m.similarity_score if m.similarity_score else None,
            "classification": None, "classification_label": None, "coverage": None, "attributes": [], "explanation": m.ai_explanation}


def _pet_colour(pet: Pet) -> Optional[str]:
    parts: List[str] = []
    for p in (pet.color_markings, pet.primary_color, pet.secondary_color, pet.tertiary_color):
        if p and p.strip() and p.strip() not in parts:
            parts.append(p.strip())
    return ", ".join(parts) or None


def _pet_photo(pet: Pet) -> Optional[str]:
    for url in (pet.photo_front_url, pet.photo_url, pet.photo_left_url, pet.photo_right_url):
        if url and url.strip():
            return url
    return None


def _event_rows(req: PetMatchConfirmationRequest) -> List[Dict[str, Any]]:
    out = []
    for e in (req.events or []):
        if not isinstance(e, dict):
            continue
        row = dict(e)
        row["label"] = EVENT_LABELS.get(e.get("kind"), e.get("kind"))
        if e.get("kind") == "final_decision" and e.get("decision"):
            row["label"] = f"{EVENT_LABELS['final_decision']}: {FINAL_LABELS.get(e['decision'], e['decision'])}"
        out.append(row)
    return out


def _request_view(db: Session, req: PetMatchConfirmationRequest, viewer: User) -> Dict[str, Any]:
    thread = db.get(CaseMessageThread, req.thread_id) if req.thread_id else None
    t_summary = CM.summary(db, thread, viewer, "staff") if thread is not None else None
    requester = db.get(User, req.requested_by) if req.requested_by else None
    finalizer = db.get(User, req.final_by) if req.final_by else None
    return {
        "request_id": req.request_id, "raw_status": req.status, "raw_status_label": OF.STATUS_LABELS.get(req.status, req.status),
        "requested_at": req.requested_at.isoformat() if req.requested_at else None,
        "requested_by_name": requester.name if requester else None,
        "message": req.staff_message,
        "follow_up_count": int(req.follow_up_count or 0),
        "last_follow_up_at": req.last_follow_up_at.isoformat() if req.last_follow_up_at else None,
        "owner_response": req.owner_response, "owner_note": req.owner_note,
        "owner_response_at": req.owner_response_at.isoformat() if req.owner_response_at else None,
        "final_decision": req.final_decision, "final_label": FINAL_LABELS.get(req.final_decision or "") if req.final_decision else None,
        "final_by_name": finalizer.name if finalizer else None, "final_at": req.final_at.isoformat() if req.final_at else None,
        "cancel_reason": req.cancel_reason,
        "thread_id": req.thread_id,
        "thread_status": t_summary["status"] if t_summary else None,
        "unread": t_summary["unread"] if t_summary else 0,
        "events": _event_rows(req),
    }


def _report_block(db: Session, report: Report) -> Optional[str]:
    """Why no possible owner can be contacted for this report right now (None: they can)."""
    if case_state.is_closed(report):
        return "The case is closed. Reopen it to contact a possible owner."
    if report.duplicate_of_report_id:
        return "This report was merged into another case. Work on the primary case instead."
    from app.routes.manual_matching import _report_pet_block
    return _report_pet_block(db, report)


def possible_owners(db: Session, report_id: int, viewer: User) -> Dict[str, Any]:
    """
    The Possible Pet Owners section of a case: the registered pets the matching (or a staff member) linked to this report whose owner has an
    account, each with its owner, what matched, the verification status and its history. Pets outside the viewer's data scope are left
    out entirely (utils/matching_scope.py), so a Leader never sees another subdivision's registry.
    """
    from app.utils.matching_scope import pet_in_scope
    report = L.case_for_staff(db, report_id, viewer)
    blocked = _report_block(db, report)
    if not blocked and viewer.role_id == 2 and report.assigned_leader_id and report.assigned_leader_id != viewer.user_id:
        blocked = "This case is being handled by another officer. Only the assigned case officer can contact a possible owner."

    matches = (db.query(ReportMatch).filter(ReportMatch.source_report_id == report.report_id, ReportMatch.matched_pet_id.isnot(None))
               .order_by(ReportMatch.match_id.desc()).all())
    requests = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.report_id == report.report_id)
                .order_by(PetMatchConfirmationRequest.request_id.desc()).all())
    by_pet_match: Dict[int, ReportMatch] = {}
    for m in matches:
        by_pet_match.setdefault(m.matched_pet_id, m)
    by_pet_requests: Dict[int, List[PetMatchConfirmationRequest]] = {}
    for r in requests:
        by_pet_requests.setdefault(r.pet_id, []).append(r)

    pet_ids = [pid for pid, m in by_pet_match.items() if m.status in CANDIDATE_MATCH_STATUSES or pid in by_pet_requests]
    pet_ids += [pid for pid in by_pet_requests if pid not in pet_ids]
    if report.pet_id and report.pet_id not in pet_ids:
        pet_ids.insert(0, report.pet_id)

    # Also include active registered pets in the report's subdivision that match the reported species if no match rows exist yet
    if not pet_ids and report.subdivision_id:
        q_sub = (
            db.query(Pet.pet_id)
            .join(User, Pet.owner_id == User.user_id)
            .filter(
                User.subdivision_id == report.subdivision_id,
                Pet.owner_id.isnot(None),
                Pet.merged_into_pet_id.is_(None),
                Pet.status != "Deceased",
            )
        )
        rep_species = (report.animal_type or "").strip()
        if rep_species.lower() in ("dog", "cat"):
            q_sub = q_sub.filter(Pet.pet_type == rep_species.capitalize())
        for (sub_pid,) in q_sub.order_by(Pet.pet_id.desc()).limit(10).all():
            if sub_pid not in pet_ids:
                pet_ids.append(sub_pid)

    pets = {p.pet_id: p for p in db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id.in_(pet_ids)).all()} if pet_ids else {}

    out: List[Dict[str, Any]] = []
    for pid in pet_ids:
        pet = pets.get(pid)
        if pet is None or not pet_in_scope(db, viewer, pet):
            continue
        reqs = by_pet_requests.get(pid, [])
        latest = reqs[0] if reqs else None
        owner = db.get(User, latest.owner_id) if latest is not None and latest.owner_id else pet.owner
        if owner is None:
            continue                                   # nobody to contact: an ownerless community record is not a possible owner
        status = display_status(latest)
        if status == IDENTIFIED and report.pet_id == pet.pet_id and case_state.ownership_of(report) == "confirmed":
            status = VERIFIED
        match = by_pet_match.get(pid)
        owner_sub = getattr(owner, "subdivision", None)
        active = latest is not None and latest.status == OF.AWAITING
        can_new = not blocked and (latest is None or latest.status in OF.ENDED_WITHOUT_ANSWER) and pet.owner_id == owner.user_id and status != VERIFIED
        out.append({
            "pet_id": pet.pet_id, "match_id": match.match_id if match is not None else None,
            "resident": {
                "user_id": owner.user_id,
                "name": owner.name,
                "phone": owner.phone,
                "email": owner.email,
                "address": owner.address or pet.registered_address,
                "subdivision": getattr(owner_sub, "subdivision_name", None),
            },
            "pet": {"name": pet.pet_name, "reference_code": pet.reference_code, "species": pet.pet_type, "breed": _known(pet.breed),
                    "colour": _pet_colour(pet), "size": pet.size_category, "markings": pet.distinctive_markings, "photo_url": _pet_photo(pet),
                    "status": pet.status},
            "registered_address": pet.registered_address,
            "matching": _matching(match),
            "status": status, "status_label": STATUS_LABELS[status],
            "request": _request_view(db, latest, viewer) if latest is not None else None,
            "earlier_requests": [_request_view(db, r, viewer) for r in reqs[1:]],
            "actions": {
                "contact": can_new,
                "follow_up": not blocked and active and latest.thread_id is not None,
                "mark_unable": not blocked and active,
                "finalize": not blocked and latest is not None and latest.status in OF.FINALIZABLE,
                "message_owner": not case_state.is_closed(report) and pet.owner_id == owner.user_id,
                "send_warning": not case_state.is_closed(report) and pet.owner_id == owner.user_id,
            },
        })
    order = {OWNER_CONFIRMED: 0, AWAITING: 1, IDENTIFIED: 2, UNABLE: 3, VERIFIED: 4, NOT_CONFIRMED: 5}
    out.sort(key=lambda c: (order.get(c["status"], 9), -((c["matching"] or {}).get("score") or 0)))
    return {
        "applicable": True, "reason": None, "can_contact": blocked is None, "blocked_reason": blocked,
        "template": message_template(report), "animal": animal_summary(report), "candidates": out,
    }


# ------------------------------------------------------------------------------------------------------- contact
def _verification_thread(db: Session, report: Report, pet: Pet, owner_id: int, actor: User) -> CaseMessageThread:
    """The conversation for this report and possible owner: an earlier one that is still open (after Unable to Contact), else a new one."""
    earlier = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.report_id == report.report_id,
                                                           PetMatchConfirmationRequest.pet_id == pet.pet_id,
                                                           PetMatchConfirmationRequest.owner_id == owner_id,
                                                           PetMatchConfirmationRequest.thread_id.isnot(None))
               .order_by(PetMatchConfirmationRequest.request_id.desc()).all())
    for r in earlier:
        t = db.get(CaseMessageThread, r.thread_id)
        if t is not None and t.status == "open" and CM.ended_reason(db, t) is None:
            return t
    t = CaseMessageThread(subdivision_id=report.subdivision_id, kind="direct", report_id=report.report_id,
                          subject=f"Ownership verification: Report {CM.report_ref(report)}"[:CM.MAX_SUBJECT], created_by=actor.user_id)
    db.add(t)
    db.flush()
    CM._add_member(db, t, owner_id, PET_OWNER, None)          # no report of their own: the conversation never opens the report for them
    CM._add_member(db, t, actor.user_id, CM.LEADER)
    return t


def _clean_message(message: Optional[str]) -> str:
    text = (message or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write the message to the possible owner first.")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=422, detail=f"A message can be at most {MAX_BODY} characters.")
    return text


def _lock_request(db: Session, request_id: int) -> PetMatchConfirmationRequest:
    req = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.request_id == request_id)
           .populate_existing().with_for_update().first())
    if req is None:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    return req


def _staff_report(db: Session, report_id: int, actor: User, what: str) -> Report:
    report = L.case_for_staff(db, report_id, actor, write=True)       # Leader of the subdivision or Administrator; the assigned officer
    L.require_open(report, what)
    return report


def message_owner(
    db: Session,
    report_id: int,
    pet_id: int,
    actor: User,
    message: str,
    message_type: str = "ownership_verification",
    client_request_id: Optional[str] = None,
    contact_method: Optional[str] = None,
    contact_detail: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send either an Ownership Verification request or a direct/follow-up message to the registered pet's owner.
    Associates the message with the owner's account, the case report, and the registered pet, delivers it to the
    owner's Resident Inbox conversation, and creates an in-app notification.
    """
    from app.utils.matching_scope import require_pet_in_scope
    text = _clean_message(message)
    report = _staff_report(db, report_id, actor, "message the pet owner")
    pet = db.query(Pet).options(joinedload(Pet.owner)).filter(Pet.pet_id == pet_id).first()
    if pet is None:
        raise HTTPException(status_code=404, detail=f"Registered pet #{pet_id} not found.")
    require_pet_in_scope(db, actor, pet)
    if not pet.owner_id or pet.owner is None:
        raise HTTPException(status_code=422, detail="This registered pet does not have an associated resident owner account.")

    latest = OF.latest_request(db, report.report_id, pet.pet_id)
    if message_type == "ownership_verification":
        if latest is not None and latest.status == OF.AWAITING and latest.thread_id is not None:
            req = follow_up(db, latest.request_id, actor, text, client_request_id)
            return {"request_id": req.request_id, "thread_id": req.thread_id, "mode": "ownership_verification"}
        if latest is None or latest.status in OF.ENDED_WITHOUT_ANSWER:
            req = contact(db, report.report_id, pet.pet_id, actor, text, client_request_id)
            return {"request_id": req.request_id, "thread_id": req.thread_id, "mode": "ownership_verification"}
        # Already answered/verified: send in the existing verification thread
        message_type = "direct_message"

    # Direct or follow-up message in the owner's conversation for this case & pet
    t = _verification_thread(db, report, pet, pet.owner_id, actor)
    if latest is not None and not latest.thread_id:
        latest.thread_id = t.thread_id
    msg = CM.send(db, t, actor, text, client_request_id)
    _notify(
        db,
        pet.owner_id,
        "case_message",
        t.thread_id,
        f"New message from {administration_name(report)}",
        "You received a new message from Subdivision Administration. Open your inbox to view and respond.",
    )
    method_suffix = f" ({contact_method}: {contact_detail})" if contact_method and contact_detail else (f" ({contact_method})" if contact_method else "")
    L.history(db, report, actor, f"Subdivision Administration sent a message to {pet.owner.name} regarding registered pet {pet.display_name}{method_suffix}.")
    db.add(AuditLog(
        user_id=actor.user_id,
        action="OWNER_DIRECT_MESSAGE_SENT",
        target_table="case_messages",
        target_id=msg.message_id,
        description=f"{actor.name} sent a message to owner {pet.owner.name} (pet #{pet.pet_id}) on report #{report.report_id}.",
        log_type="operation",
        new_values={
            "report_id": report.report_id,
            "pet_id": pet.pet_id,
            "owner_id": pet.owner_id,
            "thread_id": t.thread_id,
            "message_id": msg.message_id,
            "contact_method": contact_method,
            "contact_detail": contact_detail,
            "delivery_status": "sent",
        },
    ))
    return {"request_id": latest.request_id if latest else None, "thread_id": t.thread_id, "mode": "direct_message"}


def contact(db: Session, report_id: int, pet_id: int, actor: User, message: str, client_request_id: Optional[str] = None) -> PetMatchConfirmationRequest:
    """
    "Contact Possible Owner": create the verification request (Awaiting Owner Response), open the conversation with the possible owner tied
    to the report, send the Leader's (edited) message there, and tell the owner. A repeated submission returns the same request.
    """
    text = _clean_message(message)
    if client_request_id:
        sent = db.query(CaseMessage).filter(CaseMessage.client_request_id == client_request_id).first()
        if sent is not None:
            done = db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.thread_id == sent.thread_id,
                                                                PetMatchConfirmationRequest.pet_id == pet_id).order_by(
                PetMatchConfirmationRequest.request_id.desc()).first()
            if done is not None and sent.sender_id == actor.user_id:
                return done
            raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
    report = _staff_report(db, report_id, actor, "contact a possible owner")
    from app.routes.manual_matching import create_confirmation_request
    report, pet, req, match = create_confirmation_request(db, actor, report.report_id, pet_id, text)
    # The match came first: put "identified" (when the matcher found the pet) ahead of "requested"
    identified = {"kind": "identified", "status": None, "at": (match.created_at or _now()).isoformat(timespec="seconds"),
                  "by": None, "by_name": None, "match_id": match.match_id,
                  "note": (f"{(_matching(match) or {}).get('label', 'Pet Registry matching')}"
                           + (f": {match.similarity_score}%" if match.similarity_score else ""))}
    req.events = [identified] + list(req.events or [])
    if not db.query(AuditLog.log_id).filter(AuditLog.action == "POSSIBLE_OWNER_IDENTIFIED", AuditLog.target_table == "report_matches",
                                            AuditLog.target_id == match.match_id).first():
        db.add(AuditLog(user_id=None, action="POSSIBLE_OWNER_IDENTIFIED", target_table="report_matches", target_id=match.match_id,
                        description=f"Registered pet #{pet.pet_id} was identified as a possible match for report #{report.report_id}.",
                        log_type="operation",
                        new_values={"report_id": report.report_id, "pet_id": pet.pet_id, "owner_id": pet.owner_id,
                                    "score": match.similarity_score, "identified_at": identified["at"]}))

    db.flush()
    t = _verification_thread(db, report, pet, pet.owner_id, actor)
    req.thread_id = t.thread_id
    CM._system(db, t, _opening_text(report, pet))
    msg = CM.send(db, t, actor, _with_link(text, req), client_request_id)
    OF.add_event(req, "contacted", actor, note=_preview(text), thread_id=t.thread_id, message_id=msg.message_id)
    _notify_request(db, req, f"Ownership verification request: {pet.display_name}",
                    "Subdivision Administration sent you an ownership verification request regarding a reported animal. "
                    "Open it to compare the photos and Confirm or Decline Ownership.")
    L.history(db, report, actor, f"Ownership verification request sent to {pet.owner.name if pet.owner else 'registered pet owner'} for pet {pet.display_name}.")
    _audit(db, actor.user_id, "POSSIBLE_OWNER_CONTACTED", req,
           f"{actor.name} contacted the possible owner of pet #{pet.pet_id} about report #{report.report_id}.",
           old={"status": None}, new={"message_id": msg.message_id, "match_id": match.match_id, "sent_at": _now().isoformat(timespec="seconds")})
    return req


def follow_up(db: Session, request_id: int, actor: User, message: str, client_request_id: Optional[str] = None) -> PetMatchConfirmationRequest:
    """Another message to a possible owner who has not answered yet. Counted and dated; a silence never decides anything."""
    text = _clean_message(message)
    req = _lock_request(db, request_id)
    report = _staff_report(db, req.report_id, actor, "follow up with a possible owner")
    req = _lock_request(db, request_id)
    if client_request_id:
        sent = db.query(CaseMessage).filter(CaseMessage.client_request_id == client_request_id).first()
        if sent is not None and sent.thread_id == req.thread_id and sent.sender_id == actor.user_id:
            return req
    if req.status != OF.AWAITING:
        raise HTTPException(status_code=409, detail=f"This request is no longer waiting for the owner ({STATUS_LABELS[display_status(req)]}).")
    t = db.get(CaseMessageThread, req.thread_id) if req.thread_id else None
    if t is None:
        raise HTTPException(status_code=409, detail="This request has no conversation to follow up in.")
    why = CM.ended_reason(db, t)
    if why:
        raise HTTPException(status_code=409, detail=why)
    msg = CM.send(db, t, actor, _with_link(text, req), client_request_id)
    req.follow_up_count = int(req.follow_up_count or 0) + 1
    req.last_follow_up_at = _now()
    OF.add_event(req, "follow_up", actor, note=_preview(text), attempt=req.follow_up_count, message_id=msg.message_id)
    pet = db.get(Pet, req.pet_id)
    _notify_request(db, req, "Follow-up: ownership verification",
                    f"The {administration_name(report)} is still waiting for your answer about an animal that may be your pet"
                    f"{f' {pet.display_name}' if pet is not None else ''}. Open it to review the photos and answer.")
    L.history(db, report, actor, "The Subdivision Administration followed up with a possible owner.")
    _audit(db, actor.user_id, "OWNER_VERIFICATION_FOLLOW_UP", req,
           f"{actor.name} sent follow-up #{req.follow_up_count} to the possible owner about report #{report.report_id}.",
           new={"attempt": req.follow_up_count, "message_id": msg.message_id, "sent_at": req.last_follow_up_at.isoformat(timespec="seconds")})
    return req


def mark_unable_to_contact(db: Session, request_id: int, actor: User, note: str) -> PetMatchConfirmationRequest:
    """The Leader could not reach the possible owner. The request ends without an answer (never a YES or a NO); a new one may be sent later."""
    why = " ".join((note or "").split())
    if len(why) < 5:
        raise HTTPException(status_code=422, detail="Say what was tried (at least 5 characters).")
    req = _lock_request(db, request_id)
    report = _staff_report(db, req.report_id, actor, "update the verification")
    req = _lock_request(db, request_id)
    if req.status != OF.AWAITING:
        raise HTTPException(status_code=409, detail=f"Only a request waiting for the owner can be marked (this one is {STATUS_LABELS[display_status(req)]}).")
    previous = req.status
    req.status = OF.UNABLE_TO_CONTACT
    OF.add_event(req, "unable_to_contact", actor, note=why[:1000], previous=previous)
    t = db.get(CaseMessageThread, req.thread_id) if req.thread_id else None
    if t is not None and CM.ended_reason(db, t) is None:
        CM._system(db, t, "The Subdivision Administration recorded that they could not reach you about this. Ownership was not decided; "
                          "you can still reply here.")
    L.history(db, report, actor, "The Subdivision Administration could not reach a possible owner.")
    _audit(db, actor.user_id, "OWNER_VERIFICATION_UNABLE_TO_CONTACT", req, f"{actor.name} recorded that the possible owner could not be reached.",
           old={"status": previous}, new={"note": why[:1000], "follow_ups": int(req.follow_up_count or 0)})
    return req


# ------------------------------------------------------------------------------------- hooks of the existing flows
def after_owner_answer(db: Session, req: PetMatchConfirmationRequest, owner: User, yes: bool) -> bool:
    """
    Called by POST /pet-match-confirmations/{id}/respond (inside its transaction). For a request made from the case screen: the answer is
    written into the conversation, recorded in the history, and the Leader who asked (or the assigned officer) is told. Returns False for
    an older request with no conversation, which keeps its own notifications.
    """
    if not req.thread_id:
        return False
    t = db.get(CaseMessageThread, req.thread_id)
    pet = db.get(Pet, req.pet_id)
    report = db.get(Report, req.report_id)
    name = pet.display_name if pet is not None else "my pet"
    text = (f"Yes, this is my pet {name}." if yes else f"No, this is not my pet {name}.") + (f" {req.owner_note}" if req.owner_note else "")
    if t is not None:
        msg = CaseMessage(thread_id=t.thread_id, sender_id=owner.user_id, kind="message", body=text[:CM.MAX_BODY])
        db.add(msg)
        db.flush()
        member = CM._member(db, t, owner.user_id)
        if member is not None:
            member.last_read_message_id = msg.message_id
    OF.add_event(req, "owner_confirmed" if yes else "owner_denied", owner, note=req.owner_note, previous=OF.AWAITING)
    ref = CM.report_ref(report) if report is not None else f"#{req.report_id}"
    leader_ids = []
    if report is not None and report.subdivision_id:
        from app.services import lost_pet_lifecycle as LP
        leader_ids = list(LP.leader_ids(db, report.subdivision_id))
    staff = [i for i in dict.fromkeys([report.assigned_leader_id if report is not None else None, req.requested_by, *leader_ids]) if i]
    title = (f"Owner confirmed ownership: Report {ref}" if yes else f"Owner declined ownership: Report {ref}")
    body = (f"{owner.name} confirmed that the reported animal is their registered pet {name} (Owner Confirmed – Pending Admin Review). "
            "This is supporting evidence only: review the photos and details, then make the final ownership decision on the case."
            if yes else f"{owner.name} declined ownership of the reported animal for registered pet {name} (Owner Declined – Pending Admin Review). "
            "This is supporting evidence only: you can still make the final ownership decision on the case.")
    from app.models.notification import Notification
    for uid in staff:
        db.add(Notification(user_id=uid, type="owner_verification", related_id=req.report_id, title=title[:255], message=body[:1000]))
    if report is not None:
        if case_state.ownership_of(report) != "confirmed":
            report.ownership_status = "under_review"          # either answer: only the administrator's decision settles ownership
        L.history(
            db,
            report,
            None,
            f"Owner {owner.name} {'confirmed' if yes else 'declined'} ownership for registered pet {name} "
            f"({'Owner Confirmed' if yes else 'Owner Declined'} – Pending Admin Review).",
        )
    _audit(db, owner.user_id, "OWNER_VERIFICATION_RESPONSE", req, f"The possible owner answered {'YES' if yes else 'NO'} for report #{req.report_id}.",
           old={"status": OF.AWAITING}, new={"answer": "YES" if yes else "NO", "status": req.status})
    return True


def after_final_decision(db: Session, req: PetMatchConfirmationRequest, actor: User, decision: str) -> None:
    """Called by record_final_decision (verify_match's transaction): tell the possible owner in their conversation and by notification."""
    report = db.get(Report, req.report_id)
    pet = db.get(Pet, req.pet_id)
    name = pet.display_name if pet is not None else "your pet"
    if report is not None:
        if decision == "CONFIRMED_MATCH":
            from app.utils import identity_decision
            report.pet_id = req.pet_id
            report.identity_status = "identified"
            report.ownership_status = "confirmed"
            report.ownership_owner_id = req.owner_id
            report.ownership_decided_by = actor.user_id
            report.ownership_decided_at = _now()
            L.audit(db, actor, identity_decision.ACTION, report,
                    f"{actor.name} finalized ownership and animal identity verification on report #{report.report_id}: identified as pet #{req.pet_id}.",
                    new={"identity": "identified", "ownership": "confirmed", "linked_pet_id": req.pet_id, "owner_id": req.owner_id})
            L.history(db, report, actor, f"Administrator {actor.name} finalized ownership verification for registered pet {name}: Ownership Verified.")
        elif decision == "NOT_A_MATCH" and case_state.ownership_of(report) != "confirmed":
            report.ownership_status = "unconfirmed"
            L.history(db, report, actor, f"Administrator {actor.name} recorded ownership verification decision for {name}: Ownership Not Confirmed.")
    if not req.thread_id:
        return
    t = db.get(CaseMessageThread, req.thread_id)
    text = {
        "CONFIRMED_MATCH": f"The Subdivision Administration verified that the reported animal is your registered pet {name}.",
        "NOT_A_MATCH": f"After review, the Subdivision Administration determined that the reported animal is not {name}. Thank you for your help.",
        "UNABLE_TO_VERIFY": "The Subdivision Administration needs more information before deciding. They may ask you for further details here.",
    }.get(decision)
    if text is None:
        return
    if t is not None:
        CM._system(db, t, text)
        _notify(db, req.owner_id, "case_message", t.thread_id, "Update on your ownership verification", text)
    _audit(db, actor.user_id, "OWNER_VERIFICATION_DECIDED", req, f"{actor.name} recorded the final verification: {FINAL_LABELS[decision]}.",
           new={"decision": decision, "decided_at": _now().isoformat(timespec="seconds")})


def for_thread(db: Session, t: CaseMessageThread, viewer: User, staff: bool) -> Optional[Dict[str, Any]]:
    """
    The verification a conversation is about, for the conversation screen: the possible owner gets the question, the reported animal (no
    reporter details, no exact pin), their own pet and the Yes/No answer while it is waiting. Staff get the status. Anyone else: nothing.
    """
    req = (db.query(PetMatchConfirmationRequest).filter(PetMatchConfirmationRequest.thread_id == t.thread_id)
           .order_by(PetMatchConfirmationRequest.request_id.desc()).first())
    if req is None:
        return None
    status = display_status(req)
    base = {"request_id": req.request_id, "status": status, "status_label": STATUS_LABELS[status],
            "owner_response": req.owner_response, "owner_response_at": req.owner_response_at.isoformat() if req.owner_response_at else None,
            "final_label": FINAL_LABELS.get(req.final_decision or "") if req.final_decision else None}
    if staff:
        return {**base, "report_id": req.report_id, "pet_id": req.pet_id}
    return owner_payload(db, req, viewer, t)


def owner_payload(db: Session, req: PetMatchConfirmationRequest, viewer: User,
                  t: Optional[CaseMessageThread] = None) -> Optional[Dict[str, Any]]:
    """
    The possible owner's verification view (conversation card and the verification page): the reported animal (no reporter details, no exact
    pin), their own registered pet, the status, their answer with its date and time, and the history. None for anyone but that owner.
    """
    pet = db.get(Pet, req.pet_id)
    if req.owner_id != viewer.user_id or pet is None or pet.owner_id != viewer.user_id:
        return None
    if t is None and req.thread_id:
        t = db.get(CaseMessageThread, req.thread_id)
    status = display_status(req)
    from app.routes.pet_match_confirmations import QUESTION, owner_view
    full = (db.query(PetMatchConfirmationRequest).options(joinedload(PetMatchConfirmationRequest.report))
            .filter(PetMatchConfirmationRequest.request_id == req.request_id).first())
    view = owner_view(full)
    animal = dict(view.get("reported_animal") or {})
    animal.pop("description", None)          # free text written by the reporter may name them: the Leader quotes what is needed
    animal.pop("condition", None)
    animal["reference"] = CM.report_ref(full.report) if full.report is not None else None
    history = [{"label": e["label"], "at": e.get("at")} for e in _event_rows(req)
               if e.get("kind") in ("contacted", "follow_up", "owner_confirmed", "owner_denied", "final_decision", "unable_to_contact", "cancelled")]
    return {"request_id": req.request_id, "status": status, "status_label": STATUS_LABELS[status],
            "owner_response": req.owner_response, "owner_note": req.owner_note,
            "owner_response_at": req.owner_response_at.isoformat() if req.owner_response_at else None,
            "final_label": FINAL_LABELS.get(req.final_decision or "") if req.final_decision else None,
            "final_at": req.final_at.isoformat() if req.final_at else None,
            "requested_at": req.requested_at.isoformat() if req.requested_at else None,
            "staff_message": req.staff_message,
            "question": QUESTION,
            "can_answer": req.status == OF.AWAITING and (t is None or CM.ended_reason(db, t) is None),
            "thread_id": req.thread_id, "reported_animal": animal, "your_pet": view.get("your_pet"), "history": history}
