"""
Messages on a lost-pet or found-animal report (docs/01-system/LOST_FOUND_MATCHING.md, "Messages and the bridge").

  direct  1-to-1 between the Subdivision Leader and ONE resident of the report: its owner, its reporter, or the finder ("Contact the owner").
  bridge  1-to-1 between the two residents involved (the owner and the finder), opened the moment a Leader links a lost report to a found report.
          It ends automatically when the link is removed or when either report is closed. Nothing said in it changes a case status or recovers a pet.

What the Leader writes in a direct conversation writes itself into the case's contact log (method "message"), so it appears in the Leader's Activity
without anyone typing it again. A resident sees the Leader as "Subdivision Leader" and the other resident by first name and role only; phone numbers
and addresses are never added by the system (a resident may write their own). The lock screen never shows contact details (utils/push_categories).

Resident-to-Administration messaging (2026-11-19, docs/01-system/RESIDENT_MESSAGING.md):
  - a resident opens a `direct` conversation from their own report ("Message Subdivision Administration"); one OPEN conversation per resident and
    report, so asking again returns the same one
  - a resident opens a `general` conversation (no report) with a subject and a first message
  - the Subdivision Leaders of the subdivision (and the Administrator) read and answer them from the Messages inbox
  - a conversation tied to a report closes by itself, in the same transaction, when the report is resolved or closed (close_for_report, called by
    the before_flush hook in utils/case_closure.py and by the closing services). The closure is audited once, with what triggered it. A closed
    conversation is never reopened (not even when its case is reopened): the resident starts a new one. Staff may close a conversation by hand.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.case_messaging import CaseMessage, CaseMessageMember, CaseMessageThread
from app.models.audit_log import AuditLog
from app.models.case_records import CaseContactLog
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, ReportMedia
from app.models.user import User
from app.services import case_lifecycle as L
from app.services import lost_pet_lifecycle as LP
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils import report_visibility
from app.utils.db_clock import db_now

MAX_BODY = 2000
MAX_SUBJECT = 160
MAX_OPEN_GENERAL = 5          # open general conversations one resident may have at a time
LEADER, OWNER, FINDER, REPORTER, RESIDENT = "leader", "owner", "finder", "reporter", "resident"
# A registered pet's owner asked whether a reported animal is theirs (Possible Pet Owner Verification, services/owner_verification.py).
# Not a party of the report: the conversation never gives them the report, its reporter or its exact place.
PET_OWNER = "pet_owner"
ROLE_LABEL = {LEADER: "Subdivision Leader", OWNER: "Owner", FINDER: "Finder", REPORTER: "Reporter", RESIDENT: "Resident",
              PET_OWNER: "Possible owner"}
PARTIES = ("owner", "reporter")
STAFF_KINDS = ("direct", "general")       # the conversations a Leader of the subdivision reads and answers
RESIDENT_MESSAGE = "resident_message"     # the Leader's notification: its related id is the THREAD's (opens the Messages inbox)
CLOSED_BY_CASE = "case_closed"
CLOSED_BY_UNLINK = "link_removed"
CLOSED_BY_STAFF = "manual"


# ------------------------------------------------------------------------------------------------------------ small things
def _first(user: Optional[User]) -> str:
    return ((user.name or "").split(" ")[0] if user is not None else "") or "A resident"


def _is_lost(report: Report) -> bool:
    return V.is_lost_pet_report(report)


def _pet_name(report: Report) -> Optional[str]:
    snap = report.pet_snapshot if isinstance(report.pet_snapshot, dict) else {}
    return ((snap.get("pet") or {}).get("name") or "").strip() or None


def _preview(text: str, n: int = 140) -> str:
    one = " ".join((text or "").split())
    return one if len(one) <= n else one[: n - 1].rstrip() + "…"


def reports_of(db: Session, t: CaseMessageThread) -> List[Report]:
    ids = [i for i in (t.report_id, t.related_report_id) if i]
    return [r for r in (db.get(Report, i) for i in ids) if r is not None]


def _governing_report(db: Session, report: Report) -> Report:
    """When a report is merged into a primary master case, follow the merge link to its governing case."""
    if report.duplicate_of_report_id:
        master = db.get(Report, report.duplicate_of_report_id)
        if master is not None:
            return master
    return report


def report_ref(report: Optional[Report]) -> Optional[str]:
    """The reference residents and staff see (frontend live/refs.ts caseRef): SS-<year>-<report id padded to 4>."""
    if report is None:
        return None
    year = report.created_at.year if report.created_at is not None else datetime.now().year
    return f"SS-{year}-{report.report_id:04d}"


def _category(report: Optional[Report]) -> Optional[str]:
    cat = getattr(report, "category", None) if report is not None else None
    return getattr(cat, "category_name", None)


def case_status_label(report: Optional[Report]) -> Optional[str]:
    """The case's status in words. A closed case says how it ended: Resolved, or Closed."""
    if report is None:
        return None
    status = case_state.case_status_of(report)
    if status != V.CLOSED:
        return V.STATUS_LABELS.get(status, status.replace("_", " ").capitalize())
    disposition, _ = V.effective_disposition(report.closure_disposition, report.current_status_id)
    return "Resolved" if V.disposition_group(disposition) == "resolved" else "Closed"


def case_closed_reason(report: Optional[Report]) -> str:
    """What a resident reads when a conversation closed with its case. Never the Leader's private closure notes."""
    word = "resolved" if case_status_label(report) == "Resolved" else "closed"
    return f"This conversation has been closed because the associated case has been {word}. You can still view your previous messages."


def _audit(db: Session, actor_id: Optional[int], action: str, t: CaseMessageThread, description: str,
           old: Optional[Dict[str, Any]] = None, new: Optional[Dict[str, Any]] = None, table: str = "case_message_threads",
           target_id: Optional[int] = None) -> None:
    """An audit row for a conversation event. Never the message text: the audit log is read more widely than the conversation."""
    db.add(AuditLog(user_id=actor_id, action=action, target_table=table, target_id=target_id if target_id is not None else t.thread_id,
                    description=description, log_type="operation", old_values=old,
                    new_values={"thread_id": t.thread_id, "report_id": t.report_id, **(new or {})}))


def ended_reason(db: Session, t: CaseMessageThread) -> Optional[str]:
    """Why nobody can write in this thread any more, or None while it is open. A thread ends when it is closed or when a report of it is."""
    if t.status == "closed":
        return t.close_reason or "This conversation is closed."
    closed = [gov for gov in (_governing_report(db, r) for r in reports_of(db, t)) if case_state.is_closed(gov)]
    if closed:
        return case_closed_reason(closed[0])
    return None


def _member(db: Session, t: CaseMessageThread, user_id: Optional[int]) -> Optional[CaseMessageMember]:
    if user_id is None:
        return None
    return db.query(CaseMessageMember).filter(CaseMessageMember.thread_id == t.thread_id, CaseMessageMember.user_id == user_id).first()


def _add_member(db: Session, t: CaseMessageThread, user_id: int, role: str, report_id: Optional[int] = None) -> CaseMessageMember:
    m = _member(db, t, user_id)
    if m is None:
        m = CaseMessageMember(thread_id=t.thread_id, user_id=user_id, role=role, report_id=report_id)
        db.add(m)
        db.flush()
    return m


def _members(db: Session, t: CaseMessageThread) -> List[CaseMessageMember]:
    return db.query(CaseMessageMember).filter(CaseMessageMember.thread_id == t.thread_id).order_by(CaseMessageMember.member_id).all()


def _system(db: Session, t: CaseMessageThread, text: str) -> CaseMessage:
    msg = CaseMessage(thread_id=t.thread_id, sender_id=None, kind="system", body=text)
    db.add(msg)
    db.flush()
    return msg


# ---------------------------------------------------------------------------------------------------------------- access
def access(db: Session, t: CaseMessageThread, user: User) -> str:
    """
    'staff' (a Leader of the thread's subdivision, or the Administrator, on a Leader-to-resident direct thread)
    or 'member' (a resident participant in a direct or resident-to-resident bridge thread). Anybody else is told it does not exist.
    """
    if t.kind in STAFF_KINDS and LP.is_leader_of(user, t.subdivision_id):
        return "staff"
    member = _member(db, t, user.user_id)
    if member is not None and member.role != LEADER and user.role_id == 1:
        return "member"
    raise HTTPException(status_code=404, detail="Conversation not found.")


def thread_for(db: Session, thread_id: int, user: User, write: bool = False) -> Tuple[CaseMessageThread, str]:
    t = db.query(CaseMessageThread).filter(CaseMessageThread.thread_id == thread_id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    mode = access(db, t, user)
    if write:
        # Same order as linking/closure: case rows first, then the conversation. Refresh stale ORM state after a lock wait.
        for report in sorted(reports_of(db, t), key=lambda r: r.report_id):
            LP.lock_case(db, report.report_id)
        t = db.query(CaseMessageThread).filter(CaseMessageThread.thread_id == thread_id).populate_existing().with_for_update().one()
        mode = access(db, t, user)
    return t, mode


# ---------------------------------------------------------------------------------------------------------- who is who
def resident_of(db: Session, report: Report, party: str) -> Tuple[User, str]:
    """
    The resident a Leader contacts about a report. `owner`: the owner of the missing pet (the registered pet's owner, else whoever filed
    the report). `reporter`: whoever filed it, shown as the finder on a found-animal report. When the owner filed the report themselves
    the two are the same person and the role stays `owner`.
    """
    if party not in PARTIES:
        raise HTTPException(status_code=422, detail="Choose the owner or the reporter.")
    lost = _is_lost(report)
    if party == "owner" and not lost:
        raise HTTPException(status_code=422, detail="A found animal has no owner on its report yet. Contact the finder, or link it to the owner's report.")
    # Contact the owner of THIS incident, not a later owner of the registry record. Registration-first cases are filed by
    # their owner; an older report may instead have the original owner bound to its notice.
    owner_id: Optional[int] = report.user_id if lost else None
    if lost:
        from app.models.lost_pet_alert import LostPetAlert
        notice = db.query(LostPetAlert.owner_id).filter(LostPetAlert.report_id == report.report_id).first()
        owner_id = (notice.owner_id if notice is not None else None) or owner_id
    user_id = owner_id if party == "owner" else report.user_id
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=422, detail="That person has no account here, so they cannot be messaged.")
    if not lost:
        return user, FINDER if V.category_family(_category(report)) == V.FOUND_ANIMAL else REPORTER
    return user, OWNER if (party == "owner" or user.user_id == owner_id) else REPORTER


# ------------------------------------------------------------------------------------------------------------- opening
def open_direct(db: Session, report: Report, actor: User, party: str) -> CaseMessageThread:
    """The Leader's conversation with one resident of a report. One per resident and report: opening it again returns the same one."""
    target_id = report.report_id
    gov_id = report.duplicate_of_report_id or target_id
    locked = {rid: LP.lock_case(db, rid) for rid in sorted({target_id, gov_id})}
    report = locked[target_id]
    gov = locked.get(report.duplicate_of_report_id or target_id) or _governing_report(db, report)
    L.case_for_staff(db, gov.report_id, actor, write=True)
    L.require_open(gov, "message the people on it")
    resident, role = resident_of(db, report, party)
    t = (db.query(CaseMessageThread).join(CaseMessageMember, CaseMessageMember.thread_id == CaseMessageThread.thread_id)
         .filter(CaseMessageThread.kind == "direct", CaseMessageThread.report_id == report.report_id, CaseMessageThread.status == "open",
                 CaseMessageMember.user_id == resident.user_id).first())
    if t is None:
        t = CaseMessageThread(subdivision_id=report.subdivision_id, kind="direct", report_id=report.report_id,
                              subject=_report_subject(report), created_by=actor.user_id)
        db.add(t)
        db.flush()
        _add_member(db, t, resident.user_id, role, report.report_id)
        if gov.report_id != report.report_id:
            L.history(db, gov, actor, f"The Subdivision Leader opened a conversation with the {ROLE_LABEL[role].lower()} of merged report {report_ref(report)}.")
        else:
            L.history(db, report, actor, f"The Subdivision Leader opened a conversation with the {ROLE_LABEL[role].lower()}.")
    elif not t.subject:
        t.subject = _report_subject(report)
    _add_member(db, t, actor.user_id, LEADER)
    return t


def _resident_role(db: Session, report: Report, resident: User) -> Optional[str]:
    """The resident's part in their own report (owner, reporter or finder), or None when the report is not theirs."""
    lost = _is_lost(report)
    if lost:
        try:
            owner, _ = resident_of(db, report, "owner")
            if owner.user_id == resident.user_id:
                return OWNER
        except HTTPException:
            pass
    if report.user_id == resident.user_id:
        return REPORTER if lost else (FINDER if V.category_family(_category(report)) == V.FOUND_ANIMAL else REPORTER)
    return None


def _report_subject(report: Report) -> str:
    cat = _category(report)
    return (f"Report {report_ref(report)}" + (f": {cat}" if cat else ""))[:MAX_SUBJECT]


def open_for_resident(db: Session, report_id: int, resident: User) -> CaseMessageThread:
    """
    "Message Subdivision Administration" from the resident's own report. One OPEN conversation per resident and report: asking again
    (or after the Leader already opened one with them) returns the same one. Refused for a closed report, whose conversations are
    read-only; the resident starts a general conversation or a new report instead.
    """
    if resident.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents start a conversation from their report.")
    report = db.query(Report).filter(Report.report_id == report_id).first()
    role = _resident_role(db, report, resident) if report is not None else None
    if report is None or role is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if not report.subdivision_id:
        raise HTTPException(status_code=422, detail="This report has no subdivision, so there is no Subdivision Administration to message.")
    target_id = report.report_id
    gov_id = report.duplicate_of_report_id or target_id
    locked = {rid: LP.lock_case(db, rid) for rid in sorted({target_id, gov_id})}
    report = locked[target_id]
    gov = locked.get(report.duplicate_of_report_id or target_id) or _governing_report(db, report)
    if gov.duplicate_of_report_id:
        raise HTTPException(status_code=409, detail="This report was merged into another report. Message the administration from that report instead.")
    if case_state.is_closed(gov):
        raise HTTPException(status_code=409, detail="This report is closed, so its conversation is read-only. "
                                                    "If you have a new concern, start a new conversation or file a new report.")
    t = (db.query(CaseMessageThread).join(CaseMessageMember, CaseMessageMember.thread_id == CaseMessageThread.thread_id)
         .filter(CaseMessageThread.kind == "direct", CaseMessageThread.report_id == report.report_id, CaseMessageThread.status == "open",
                 CaseMessageMember.user_id == resident.user_id).order_by(CaseMessageThread.thread_id).first())
    if t is not None:
        if not t.subject:
            t.subject = _report_subject(report)
        return t
    t = CaseMessageThread(subdivision_id=report.subdivision_id, kind="direct", report_id=report.report_id, subject=_report_subject(report),
                          created_by=resident.user_id)
    db.add(t)
    db.flush()
    _add_member(db, t, resident.user_id, role, report.report_id)
    if gov.report_id != report.report_id:
        L.history(db, gov, None, f"The resident of merged report {report_ref(report)} started a conversation with the Subdivision Administration.")
    else:
        L.history(db, report, None, "The resident started a conversation with the Subdivision Administration.")
    _audit(db, resident.user_id, "CONVERSATION_CREATED", t, f"Resident started a conversation about report #{report.report_id}.",
           new={"kind": "direct", "status": "open", "associated_report": report_ref(report)})
    return t


def open_general(db: Session, resident: User, subject: str, body: str, client_request_id: Optional[str] = None) -> CaseMessageThread:
    """A resident's conversation with the Subdivision Administration about no particular report. It opens with its first message."""
    if resident.role_id != 1:
        raise HTTPException(status_code=403, detail="Only residents start a conversation with the Subdivision Administration.")
    if not resident.subdivision_id:
        raise HTTPException(status_code=422, detail="Your account is not linked to a subdivision yet, so there is no administration to message.")
    title = " ".join((subject or "").split())
    if not title:
        raise HTTPException(status_code=422, detail="Add a subject for the conversation.")
    if len(title) > MAX_SUBJECT:
        raise HTTPException(status_code=422, detail=f"A subject can be at most {MAX_SUBJECT} characters.")
    if not (body or "").strip():
        raise HTTPException(status_code=422, detail="Write a message first.")
    if client_request_id:
        existing = db.query(CaseMessage).filter(CaseMessage.client_request_id == client_request_id).first()
        if existing is not None:
            t = db.get(CaseMessageThread, existing.thread_id)
            if t is None or existing.sender_id != resident.user_id or t.kind != "general":
                raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
            return t
    open_count = (db.query(func.count(CaseMessageThread.thread_id))
                  .join(CaseMessageMember, CaseMessageMember.thread_id == CaseMessageThread.thread_id)
                  .filter(CaseMessageThread.kind == "general", CaseMessageThread.status == "open", CaseMessageMember.user_id == resident.user_id)
                  .scalar() or 0)
    if open_count >= MAX_OPEN_GENERAL:
        raise HTTPException(status_code=409, detail=f"You already have {MAX_OPEN_GENERAL} open general conversations. "
                                                    "Continue one of them, or wait until the administration closes one.")
    t = CaseMessageThread(subdivision_id=resident.subdivision_id, kind="general", report_id=None, subject=title, created_by=resident.user_id)
    db.add(t)
    db.flush()
    _add_member(db, t, resident.user_id, RESIDENT)
    _audit(db, resident.user_id, "CONVERSATION_CREATED", t, "Resident started a general conversation with the Subdivision Administration.",
           new={"kind": "general", "status": "open"})
    send(db, t, resident, body, client_request_id)
    return t


def _bridge_text(owner: User, finder: User, pet: Optional[str]) -> str:
    return (f"The Subdivision Leader linked two reports that may be the same animal: {_first(owner)}'s missing pet{f' ({pet})' if pet else ''} and {_first(finder)}'s "
            f"found animal. {_first(owner)} and {_first(finder)} can message each other directly here. Phone numbers and addresses stay private unless you choose to share them. "
            "Nothing is marked recovered until the owner confirms it.")


def open_bridge(db: Session, match_id: int, link_id: Optional[int], lost: Report, found: Report, actor: User, announce: bool = True) -> Optional[CaseMessageThread]:
    """
    The 1-to-1 conversation between the owner and the finder of two linked reports. Opened at the moment of the link, and opened again (the
    same one) when it is asked for later. None when one person filed both reports: there is nobody to bridge to.
    """
    try:
        owner, _ = resident_of(db, lost, "owner")
    except HTTPException:
        owner = db.get(User, lost.user_id) if lost.user_id else None
    finder = db.get(User, found.user_id) if found.user_id else None
    if owner is None or finder is None or owner.user_id == finder.user_id:
        return None
    t = db.query(CaseMessageThread).filter(CaseMessageThread.kind == "bridge", CaseMessageThread.match_id == match_id, CaseMessageThread.status == "open").first()
    created = t is None
    if t is None:
        t = CaseMessageThread(subdivision_id=lost.subdivision_id, kind="bridge", report_id=lost.report_id, related_report_id=found.report_id,
                              match_id=match_id, link_id=link_id, created_by=actor.user_id)
        db.add(t)
        db.flush()
    _add_member(db, t, owner.user_id, OWNER, lost.report_id)
    _add_member(db, t, finder.user_id, FINDER, found.report_id)
    if created:
        _system(db, t, _bridge_text(owner, finder, _pet_name(lost)))
        if announce:
            pet = _pet_name(lost)
            LP.notify(db, [owner.user_id], "lost_found_bridge", t.thread_id, "A found animal report may be your pet",
                      f"Your Subdivision Leader linked a found-animal report to your report{f' for {pet}' if pet else ''}. A direct conversation with the finder is open. "
                      "Nothing is marked recovered until you confirm it.")
            LP.notify(db, [finder.user_id], "lost_found_bridge", t.thread_id, "Your found animal report was linked",
                      "Your Subdivision Leader linked your report to a missing-pet report. A direct conversation with the owner is open. "
                      "Nothing is marked recovered until the owner confirms it.")
    return t


def close_bridges(db: Session, match_id: int, actor: User, text: str, announce: bool = True) -> int:
    """Close the conversation(s) opened for a link that was removed. The messages stay; the residents are told."""
    closed = 0
    for t in db.query(CaseMessageThread).filter(CaseMessageThread.kind == "bridge", CaseMessageThread.match_id == match_id,
                                               CaseMessageThread.status == "open").populate_existing().with_for_update().all():
        t.status, t.closed_at, t.closed_by, t.close_reason, t.close_trigger = "closed", db_now(db), actor.user_id, text, CLOSED_BY_UNLINK
        _system(db, t, text)
        _audit(db, actor.user_id, "CONVERSATION_CLOSED", t, "A lost/found conversation closed because the link between its reports was removed.",
               old={"status": "open"}, new={"status": "closed", "trigger": CLOSED_BY_UNLINK, "reason": text})
        closed += 1
        if announce:
            residents = [m.user_id for m in _members(db, t) if m.role != LEADER]
            LP.notify(db, residents, "lost_found_unlinked", t.thread_id, "A link between two reports was removed", f"{text} Nothing was marked recovered.")
    return closed


def close_for_report(db: Session, report_id: int, actor_id: Optional[int] = None, reason: Optional[str] = None) -> int:
    """
    Automatically close every open conversation (Leader/Administration-to-resident direct conversations, including those a resident started
    from the report, and resident-to-resident bridges) involving a report when that report/case is resolved or closed. General conversations
    have no report and are never touched. Runs inside the transaction that closes the case, so both commit together or not at all.

    Idempotent: only OPEN rows change, so a repeated status update (Resolved, then Closed) records no second closure. Each closure leaves a
    system line in the conversation (what both sides read) and one audit row (previous and new status, reason, trigger, who).
    """
    report = db.get(Report, report_id)
    text = (reason or "").strip() or case_closed_reason(report)
    now = db_now(db)
    closed = 0
    with db.no_autoflush:
        child_ids = [cid for (cid,) in db.query(Report.report_id).filter(Report.duplicate_of_report_id == report_id).all()]
        all_ids = [report_id, *child_ids]
        rows = (db.query(CaseMessageThread)
                .filter(or_(CaseMessageThread.report_id.in_(all_ids), CaseMessageThread.related_report_id.in_(all_ids)),
                        CaseMessageThread.status == "open")
                .all())
        for t in rows:
            if t.status != "open":
                continue
            t.status = "closed"
            t.closed_at = t.closed_at or now
            t.closed_by = t.closed_by or actor_id
            t.close_reason = t.close_reason or text
            t.close_trigger = t.close_trigger or CLOSED_BY_CASE
            db.add(CaseMessage(thread_id=t.thread_id, sender_id=None, kind="system", body=t.close_reason, created_at=now))
            label = case_status_label(report) or "Closed"
            db.add(AuditLog(user_id=actor_id, action="CONVERSATION_AUTO_CLOSED", target_table="case_message_threads", target_id=t.thread_id,
                            description=f"Conversation closed automatically because report #{report_id} was {label.lower()}.",
                            log_type="operation", old_values={"status": "open"},
                            new_values={"thread_id": t.thread_id, "report_id": report_id, "status": "closed", "reason": t.close_reason,
                                        "trigger": CLOSED_BY_CASE, "triggering_event": f"report status changed to {label}",
                                        "closed_by": actor_id if actor_id else "system"}))
            closed += 1
    return closed


def close_by_staff(db: Session, t: CaseMessageThread, actor: User, reason: Optional[str] = None) -> CaseMessageThread:
    """A Leader (or the Administrator) ends a conversation by hand: it becomes read-only for everyone, the messages stay. Residents cannot."""
    t, mode = thread_for(db, t.thread_id, actor, write=True)
    if mode != "staff":
        raise HTTPException(status_code=403, detail="Only the Subdivision Administration can close a conversation.")
    if t.status == "closed":
        return t
    if t.kind == "direct":
        for r in reports_of(db, t):
            L.require_case_handler(r, actor)
    note = " ".join((reason or "").split())[:300]
    text = "The Subdivision Administration closed this conversation." + (f" {note}" if note else "") + " You can still view your previous messages."
    t.status, t.closed_at, t.closed_by, t.close_reason, t.close_trigger = "closed", db_now(db), actor.user_id, text, CLOSED_BY_STAFF
    _system(db, t, text)
    _audit(db, actor.user_id, "CONVERSATION_CLOSED", t, "The Subdivision Administration closed a conversation by hand.",
           old={"status": "open"}, new={"status": "closed", "trigger": CLOSED_BY_STAFF, "reason": text})
    for m in _members(db, t):
        if m.role != LEADER:
            _notify_once(db, m.user_id, "case_message", t.thread_id, "Your conversation was closed",
                         "The Subdivision Administration closed the conversation. You can still read it.")
    return t


# ----------------------------------------------------------------------------------------------------------- sending
def _log_contact(db: Session, t: CaseMessageThread, leader: User, text: str) -> None:
    """What the Leader wrote is the contact: it goes to the Activity of each report of the thread by itself, with who it was written to."""
    people = []
    roles = []
    for m in _members(db, t):
        if m.role == LEADER:
            continue
        u = db.get(User, m.user_id)
        people.append(f"{u.name if u is not None else 'A resident'} ({ROLE_LABEL[m.role].lower()})")
        roles.append(ROLE_LABEL[m.role].lower())
    with_whom = (" and ".join(people) or "A resident")[:200]
    who_label = roles[0] if len(roles) == 1 else "people involved"
    now = db_now(db)
    for r in reports_of(db, t):
        db.add(CaseContactLog(report_id=r.report_id, subdivision_id=r.subdivision_id, method="message", with_whom=with_whom, summary=text,
                              outcome="other", contact_at=now, logged_by=leader.user_id))
        gov = _governing_report(db, r)
        if gov.report_id != r.report_id:
            L.history(db, gov, leader, f"The Subdivision Leader sent a message to the {who_label} of merged report {report_ref(r)}.")
        else:
            L.history(db, r, leader, f"The Subdivision Leader sent a message to the {who_label}.")


def _notify_once(db: Session, user_id: int, ntype: str, related_id: int, title: str, message: str) -> None:
    """
    One unread notification per person and conversation: a second message before the first notification is read refreshes it (newest
    title, back on top) instead of stacking another. A read notification is left alone, and the next message makes a new one.
    """
    with db.no_autoflush:
        pending = (db.query(Notification).filter(Notification.user_id == user_id, Notification.type == ntype, Notification.related_id == related_id,
                                                 Notification.is_read.is_(False)).order_by(Notification.notification_id.desc()).first())
    if pending is not None:
        pending.title, pending.message, pending.created_at = title[:255], message[:1000], db_now(db)
        return
    db.add(Notification(user_id=user_id, type=ntype, related_id=related_id, title=title[:255], message=message[:1000]))


def _notify_after(db: Session, t: CaseMessageThread, sender: User, text: str) -> None:
    staff = LP.is_leader_of(sender, t.subdivision_id)
    members = _members(db, t)
    # Notifications may appear outside the authenticated conversation (including device previews). A sender may choose to
    # write their own contact/care address, but it must stay in the participant-scoped message and summary endpoints.
    preview = "Open the conversation to read the new message."
    report = db.get(Report, t.report_id) if t.report_id else None
    regarding = f" regarding Report {report_ref(report)}" if report is not None else ""
    if t.kind in STAFF_KINDS and not staff:
        leaders = [m.user_id for m in members if m.role == LEADER and m.user_id != sender.user_id]
        assigned = _governing_report(db, report).assigned_leader_id if report is not None else None
        if assigned and assigned != sender.user_id:
            leaders = [assigned]             # an assigned case is the assigned officer's to answer
        elif not leaders:
            leaders = [u for u in LP.leader_ids(db, t.subdivision_id) if u != sender.user_id]
        for uid in dict.fromkeys(leaders):
            # opens the conversation in the Messages inbox (its related id is the thread's), which links to the case
            _notify_once(db, uid, RESIDENT_MESSAGE, t.thread_id, f"New message received from a resident{regarding}.", preview)
    for m in members:
        if m.role == LEADER or m.user_id == sender.user_id:
            continue
        if staff and t.created_by == m.user_id:
            title = f"Subdivision Administration has replied to your message{regarding}."
        elif staff:
            title = "Message from your Subdivision Leader"
        else:
            title = f"{_first(sender)} wrote in your conversation"
        _notify_once(db, m.user_id, "case_message", t.thread_id, title, preview)


def _append_report_link(db: Session, t: CaseMessageThread, text: str) -> str:
    """
    When Subdivision Administration sends a message in a report-linked thread, include a direct link
    to the corresponding report (only when the recipient is authorized to view it) or to the pending
    ownership verification page, unless a link is already present.
    """
    if not t.report_id or t.kind == "general":
        return text
    if "/resident-app/reports/" in text or "/resident-app/ownership/" in text:
        return text
    report = db.get(Report, t.report_id)
    if report is None:
        return text

    members = [m for m in _members(db, t) if m.role != LEADER]
    link: Optional[str] = None
    label = "View report details"

    for m in members:
        u = db.get(User, m.user_id)
        if u is None:
            continue
        if report_visibility.viewer_access(db, u, report) != report_visibility.NONE:
            ref = report_ref(report)
            if ref:
                link = f"/resident-app/reports/{ref}"
                break
        if m.report_id and m.report_id != report.report_id:
            own = db.get(Report, m.report_id)
            if own is not None and report_visibility.viewer_access(db, u, own) != report_visibility.NONE:
                ref = report_ref(own)
                if ref:
                    link = f"/resident-app/reports/{ref}"
                    break

    if link is None:
        from app.models.pet_match_confirmation import PetMatchConfirmationRequest
        req = (
            db.query(PetMatchConfirmationRequest)
            .filter(PetMatchConfirmationRequest.thread_id == t.thread_id)
            .order_by(PetMatchConfirmationRequest.request_id.desc())
            .first()
        )
        if req is not None:
            link = f"/resident-app/ownership/{req.request_id}"
            label = "Review and respond"

    if not link or link in text:
        return text
    tail = f"\n\n{label}: {link}"
    return text[: max(0, MAX_BODY - len(tail))].rstrip() + tail


def _thread_animal_photos(db: Session, t: CaseMessageThread) -> List[str]:
    """Return up to 2 image URLs for the animal(s) associated with a report-linked thread."""
    if not t.report_id or t.kind == "general":
        return []
    photos: List[str] = []
    report_ids = [t.report_id]
    if t.related_report_id and t.related_report_id != t.report_id:
        report_ids.append(t.related_report_id)
        per_report = 1
    else:
        per_report = 2
    for rid in report_ids:
        rows = (
            db.query(ReportMedia.file_url)
            .filter(ReportMedia.report_id == rid, ReportMedia.media_type == "Image")
            .order_by(ReportMedia.media_id.asc())
            .limit(per_report)
            .all()
        )
        for (url,) in rows:
            if url and url not in photos:
                photos.append(url)
    return photos[:2]


def send(db: Session, t: CaseMessageThread, sender: User, body: str, client_request_id: Optional[str] = None) -> CaseMessage:
    t, mode = thread_for(db, t.thread_id, sender, write=True)
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write a message first.")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=422, detail=f"A message can be at most {MAX_BODY} characters.")
    if mode == "staff":
        for r in reports_of(db, t):
            gov = _governing_report(db, r)
            L.require_case_handler(gov, sender)
            L.require_not_merged(gov)
        text = _append_report_link(db, t, text)
    if client_request_id:
        existing = db.query(CaseMessage).filter(CaseMessage.client_request_id == client_request_id).with_for_update().first()
        if existing is not None:
            if existing.thread_id != t.thread_id or existing.sender_id != sender.user_id:
                raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
            return existing
    why = ended_reason(db, t)
    if why:
        raise HTTPException(status_code=409, detail=why)
    member = _add_member(db, t, sender.user_id, LEADER) if mode == "staff" else _member(db, t, sender.user_id)
    msg = CaseMessage(thread_id=t.thread_id, sender_id=sender.user_id, kind="message", body=text, client_request_id=client_request_id)
    try:
        with db.begin_nested():
            db.add(msg)
            db.flush()
    except IntegrityError:
        existing = db.query(CaseMessage).filter(CaseMessage.client_request_id == client_request_id).first()
        if existing is not None and existing.thread_id == t.thread_id and existing.sender_id == sender.user_id:
            return existing
        raise HTTPException(status_code=409, detail="This submission id was already used for another message.")
    if member is not None:
        member.last_delivered_message_id = msg.message_id
        member.last_read_message_id = msg.message_id
    if mode == "staff":
        _log_contact(db, t, sender, text)
        _audit(db, sender.user_id, "CASE_MESSAGE_SENT", t, "The Subdivision Administration sent a message.", table="case_messages",
               target_id=msg.message_id, new={"message_id": msg.message_id, "delivery_status": "sent"})
    else:
        _audit(db, sender.user_id, "CASE_MESSAGE_SENT", t, "A resident sent a message.", table="case_messages",
               target_id=msg.message_id, new={"message_id": msg.message_id, "delivery_status": "sent"})
    _notify_after(db, t, sender, text)
    return msg


def mark_read(db: Session, t: CaseMessageThread, viewer: User, through_message_id: Optional[int] = None) -> None:
    t, mode = thread_for(db, t.thread_id, viewer, write=True)
    last = db.query(func.max(CaseMessage.message_id)).filter(CaseMessage.thread_id == t.thread_id).scalar() or 0
    if through_message_id is not None:
        if through_message_id != 0 and not db.query(CaseMessage.message_id).filter(CaseMessage.thread_id == t.thread_id,
                                                                                CaseMessage.message_id == through_message_id).first():
            raise HTTPException(status_code=422, detail="That message is not part of this conversation.")
        last = min(last, through_message_id)
    member = db.query(CaseMessageMember).filter(CaseMessageMember.thread_id == t.thread_id,
                                              CaseMessageMember.user_id == viewer.user_id).populate_existing().with_for_update().first()
    if member is None and mode == "staff":
        member = _add_member(db, t, viewer.user_id, LEADER)
    if member is not None:
        if (member.last_delivered_message_id or 0) < last:
            member.last_delivered_message_id = last
        if member.last_read_message_id < last:
            prev_read = member.last_read_message_id
            member.last_read_message_id = last
            _audit(db, viewer.user_id, "CASE_MESSAGE_READ", t, "Recipient opened and read conversation messages.",
                   old={"last_read_message_id": prev_read}, new={"last_read_message_id": last, "delivery_status": "read"})


# ---------------------------------------------------------------------------------------------------------------- views
def _unread(db: Session, t: CaseMessageThread, viewer: User, members: List[CaseMessageMember]) -> int:
    mine = next((m for m in members if m.user_id == viewer.user_id), None)
    since = mine.last_read_message_id if mine is not None else max([m.last_read_message_id for m in members if m.role == LEADER] or [0])
    return (db.query(func.count(CaseMessage.message_id)).filter(CaseMessage.thread_id == t.thread_id, CaseMessage.message_id > since,
                                                               or_(CaseMessage.sender_id.is_(None), CaseMessage.sender_id != viewer.user_id)).scalar() or 0)


def _people(db: Session, t: CaseMessageThread, viewer: User, staff: bool) -> List[Dict[str, Any]]:
    out = []
    for m in _members(db, t):
        u = db.get(User, m.user_id)
        if m.role == LEADER and not staff:
            name = "Subdivision Leader"
        else:
            name = (u.name if u is not None else "A resident") if staff else _first(u)
        out.append({"user_id": m.user_id, "role": m.role, "label": ROLE_LABEL[m.role], "name": name, "me": m.user_id == viewer.user_id,
                    "report_id": m.report_id})
    return out


def _titles(db: Session, t: CaseMessageThread, viewer: User) -> Tuple[str, str]:
    """What a resident reads as the name of a conversation: about THEIR report, never about the other resident's."""
    mine = _member(db, t, viewer.user_id)
    role = mine.role if mine is not None else REPORTER
    lost = db.get(Report, t.report_id) if t.report_id else None
    pet = _pet_name(lost) if lost is not None else None
    if t.kind == "general":
        return t.subject or "Conversation with the Subdivision Administration", "General conversation with the Subdivision Administration"
    if role == PET_OWNER:
        return t.subject or "Ownership verification", "Ownership verification with the Subdivision Administration"
    if t.kind == "direct" and lost is not None and not _is_lost(lost) and V.category_family(_category(lost)) != V.FOUND_ANIMAL:
        return t.subject or _report_subject(lost), "Conversation with the Subdivision Administration"
    if t.kind == "direct":
        about = (f"About {pet}" if pet else "About your missing pet") if role in (OWNER, REPORTER) and lost is not None and _is_lost(lost) else "About the animal you found"
        return "Message from your Subdivision Leader", about
    if role == OWNER:
        return (f"A found animal may be {pet}" if pet else "A found animal may be your pet"), "Direct conversation with the finder"
    return "The animal you found may have an owner", "Direct conversation with the owner"


def summary(db: Session, t: CaseMessageThread, viewer: User, mode: Optional[str] = None) -> Dict[str, Any]:
    mode = mode or access(db, t, viewer)
    staff = mode == "staff"
    members = _members(db, t)
    last = db.query(CaseMessage).filter(CaseMessage.thread_id == t.thread_id).order_by(CaseMessage.message_id.desc()).first()
    count = db.query(func.count(CaseMessage.message_id)).filter(CaseMessage.thread_id == t.thread_id, CaseMessage.kind == "message").scalar() or 0
    why = ended_reason(db, t)
    can_reply = why is None
    if staff:
        can_reply = (t.kind in STAFF_KINDS
                     and can_reply
                     and all((viewer.role_id != 2 or not gov.assigned_leader_id or gov.assigned_leader_id == viewer.user_id)
                             and not gov.duplicate_of_report_id
                             for gov in (_governing_report(db, r) for r in reports_of(db, t))))
    mine = next((m for m in members if m.user_id == viewer.user_id), None)
    if mine is not None and last is not None and (getattr(mine, "last_delivered_message_id", 0) or 0) < last.message_id:
        mine.last_delivered_message_id = last.message_id
        db.flush()
    report = db.get(Report, t.report_id) if t.report_id else None
    if staff:
        residents = [m for m in members if m.role != LEADER]
        names = [(u.name if u is not None else "A resident") for u in (db.get(User, m.user_id) for m in residents)]
        title = ("Owner and finder" if t.kind == "bridge"
                 else t.subject or (_report_subject(report) if report is not None else "Message"))
        subtitle = ", ".join(f"{n} ({ROLE_LABEL[m.role].lower()})" for n, m in zip(names, residents)) if t.kind != "bridge" else ""
    else:
        title, subtitle = _titles(db, t, viewer)
    is_private_bridge = staff and t.kind == "bridge"
    return {
        "thread_id": t.thread_id, "kind": t.kind, "status": "closed" if why else "open", "can_reply": can_reply, "ended_reason": why,
        "subject": t.subject, "report_ref": report_ref(report), "report_category": _category(report),
        "case_status": case_status_label(_governing_report(db, report) if report is not None else None), "closed_at": (t.closed_at or (report.closed_at if report is not None else None)) if why else None,
        "close_trigger": (t.close_trigger or CLOSED_BY_CASE) if why else None,
        "started_by_resident": bool(t.created_by and any(m.user_id == t.created_by and m.role != LEADER for m in members)),
        "report_id": t.report_id, "related_report_id": t.related_report_id, "match_id": t.match_id, "link_id": t.link_id,
        "my_report_id": mine.report_id if mine is not None else None,
        "title": title, "subtitle": why if (why and not staff and t.kind == "bridge") else subtitle,
        "unread": 0 if is_private_bridge else _unread(db, t, viewer, members), "message_count": count,
        "last_at": last.created_at if last is not None else t.created_at,
        "last_text": "" if is_private_bridge else (_preview(last.body, 90) if last is not None else ""),
        "created_at": t.created_at, "people": _people(db, t, viewer, staff),
    }


def view(db: Session, t: CaseMessageThread, viewer: User, mode: Optional[str] = None, limit: int = 300) -> Dict[str, Any]:
    mode = mode or access(db, t, viewer)
    staff = mode == "staff"
    out = summary(db, t, viewer, mode)
    all_members = _members(db, t)
    roles = {m.user_id: m for m in all_members}
    rows = db.query(CaseMessage).filter(CaseMessage.thread_id == t.thread_id).order_by(CaseMessage.message_id.desc()).limit(limit).all()[::-1]
    senders = {u.user_id: u for u in db.query(User).filter(User.user_id.in_({r.sender_id for r in rows if r.sender_id})).all()} if rows else {}
    messages = []
    for r in rows:
        member = roles.get(r.sender_id) if r.sender_id else None
        u = senders.get(r.sender_id) if r.sender_id else None
        role = member.role if member is not None else ("system" if r.sender_id is None else "staff")
        if r.kind == "system" or r.sender_id is None:
            name = None
        elif role in (LEADER, "staff") and not staff:
            name = "Subdivision Leader"
        else:
            name = (u.name if u is not None else "A resident") if staff else _first(u)
        # Delivery status (Sent -> Delivered -> Read) based on recipient members' actual retrieval & read watermarks
        recipients = [
            m for m in all_members
            if m.user_id != r.sender_id and ((m.role != LEADER) if role in (LEADER, "staff") else (m.role == LEADER or t.kind == "bridge"))
        ]
        if not recipients:
            recipients = [m for m in all_members if m.user_id != r.sender_id]
        if any((m.last_read_message_id or 0) >= r.message_id for m in recipients):
            delivery_status = "read"
        elif any((getattr(m, "last_delivered_message_id", 0) or 0) >= r.message_id for m in recipients):
            delivery_status = "delivered"
        else:
            delivery_status = "sent"
        messages.append({"message_id": r.message_id, "kind": r.kind, "sender_id": r.sender_id, "sender_name": name, "sender_role": role,
                         "label": ROLE_LABEL.get(role, ""), "mine": r.sender_id == viewer.user_id, "body": r.body, "at": r.created_at,
                         "delivery_status": delivery_status})
    out["messages"] = messages
    out["report_photos"] = _thread_animal_photos(db, t)
    from app.services import owner_verification
    out["verification"] = owner_verification.for_thread(db, t, viewer, staff)
    return out


def threads_for_report(db: Session, report: Report, viewer: User) -> List[Dict[str, Any]]:
    """The conversations of a case, for the Leader's case screen (staff only): who is in each, how many messages, how many are unread."""
    child_ids = [cid for (cid,) in db.query(Report.report_id).filter(Report.duplicate_of_report_id == report.report_id).all()]
    all_ids = [report.report_id, *child_ids]
    rows = (db.query(CaseMessageThread)
            .filter(or_(CaseMessageThread.report_id.in_(all_ids), CaseMessageThread.related_report_id.in_(all_ids)))
            .order_by(CaseMessageThread.thread_id).all())
    return [summary(db, t, viewer, "staff") for t in rows]


def threads_of_user(db: Session, user: User, limit: int = 50) -> List[Dict[str, Any]]:
    """A resident's conversations, the most recent first (for the Home screen and the report screens)."""
    ids = [i for (i,) in db.query(CaseMessageMember.thread_id).filter(CaseMessageMember.user_id == user.user_id).all()]
    if not ids:
        return []
    rows = db.query(CaseMessageThread).filter(CaseMessageThread.thread_id.in_(ids)).all()
    out = []
    for t in rows:
        try:
            mode = access(db, t, user)
        except HTTPException:
            continue
        out.append(summary(db, t, user, mode))
    out.sort(key=lambda s: (str(s["last_at"]), s["thread_id"]), reverse=True)
    return out[:limit]


# ------------------------------------------------------------------------------------------------- the staff inbox
INBOX_FILTERS = ("all", "unread", "open", "closed")


def _staff_scope(db: Session, viewer: User):
    """The conversations a Leader answers: direct and general ones of their own subdivision (the Administrator: every subdivision)."""
    if viewer.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only the Subdivision Administration can open the Messages inbox.")
    q = db.query(CaseMessageThread).filter(CaseMessageThread.kind.in_(STAFF_KINDS))
    if viewer.role_id == 2:
        if not viewer.subdivision_id:
            return q.filter(CaseMessageThread.thread_id.is_(None))
        q = q.filter(CaseMessageThread.subdivision_id == viewer.subdivision_id)
    return q


def inbox(db: Session, viewer: User, status: str = "all", search: Optional[str] = None, limit: int = 200) -> Dict[str, Any]:
    """
    The Messages inbox: every resident conversation of the Leader's subdivision, the most recent first, with counts for the filter chips.
    `status` is all | unread | open | closed. `search` matches the subject, the report reference (SS-2026-0017 or 17) and the resident's name.
    """
    if status not in INBOX_FILTERS:
        raise HTTPException(status_code=422, detail="Filter by all, unread, open or closed.")
    rows = _staff_scope(db, viewer).order_by(CaseMessageThread.thread_id.desc()).limit(1000).all()
    items = [summary(db, t, viewer, "staff") for t in rows]
    counts = {"all": len(items), "unread": sum(1 for i in items if i["unread"] > 0),
              "open": sum(1 for i in items if i["status"] == "open"), "closed": sum(1 for i in items if i["status"] == "closed")}
    needle = " ".join((search or "").lower().split())
    if needle:
        digits = needle.rsplit("-", 1)[-1].lstrip("0") if needle.replace("-", "").replace("ss", "").isdigit() else None

        def hit(i: Dict[str, Any]) -> bool:
            hay = " ".join(str(x or "") for x in (i["title"], i["subject"], i["report_ref"], i["report_category"],
                                                  *[p["name"] for p in i["people"]])).lower()
            return needle in hay or (digits is not None and i["report_id"] is not None and str(i["report_id"]) == digits)
        items = [i for i in items if hit(i)]
    if status == "unread":
        items = [i for i in items if i["unread"] > 0]
    elif status in ("open", "closed"):
        items = [i for i in items if i["status"] == status]
    items.sort(key=lambda i: (str(i["last_at"]), i["thread_id"]), reverse=True)
    return {"items": items[:limit], "counts": counts}


def unread_total(db: Session, viewer: User) -> Dict[str, int]:
    """How many conversations have unread messages, for the Messages badge (a resident: their own; staff: the inbox)."""
    if viewer.role_id in (2, 4):
        rows = _staff_scope(db, viewer).filter(CaseMessageThread.status == "open").all()
        convs = [summary(db, t, viewer, "staff") for t in rows]
    else:
        convs = threads_of_user(db, viewer, limit=500)
    return {"conversations": sum(1 for c in convs if c["unread"] > 0), "messages": sum(int(c["unread"]) for c in convs)}
