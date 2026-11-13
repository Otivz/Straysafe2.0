"""
Messages on a lost-pet or found-animal report (docs/01-system/LOST_FOUND_MATCHING.md, "Messages and the bridge").

  direct  1-to-1 between the Subdivision Leader and ONE resident of the report: its owner, its reporter, or the finder ("Contact the owner").
  bridge  1-to-1 between the two residents involved (the owner and the finder), opened the moment a Leader links a lost report to a found report.
          It ends automatically when the link is removed or when either report is closed. Nothing said in it changes a case status or recovers a pet.

What the Leader writes in a direct conversation writes itself into the case's contact log (method "message"), so it appears in the Leader's Activity
without anyone typing it again. A resident sees the Leader as "Subdivision Leader" and the other resident by first name and role only; phone numbers
and addresses are never added by the system (a resident may write their own). The lock screen never shows contact details (utils/push_categories).
"""
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.case_messaging import CaseMessage, CaseMessageMember, CaseMessageThread
from app.models.case_records import CaseContactLog
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.services import case_lifecycle as L
from app.services import lost_pet_lifecycle as LP
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.db_clock import db_now

MAX_BODY = 2000
LEADER, OWNER, FINDER, REPORTER = "leader", "owner", "finder", "reporter"
ROLE_LABEL = {LEADER: "Subdivision Leader", OWNER: "Owner", FINDER: "Finder", REPORTER: "Reporter"}
PARTIES = ("owner", "reporter")


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
    ids = [t.report_id] + ([t.related_report_id] if t.related_report_id else [])
    return [r for r in (db.get(Report, i) for i in ids) if r is not None]


def ended_reason(db: Session, t: CaseMessageThread) -> Optional[str]:
    """Why nobody can write in this thread any more, or None while it is open. A thread ends when it is closed or when a report of it is."""
    if t.status == "closed":
        return t.close_reason or "This conversation is closed."
    if any(case_state.is_closed(r) for r in reports_of(db, t)):
        return "The report is closed, so this conversation has ended."
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
    if t.kind == "direct" and LP.is_leader_of(user, t.subdivision_id):
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
        return user, FINDER
    return user, OWNER if (party == "owner" or user.user_id == owner_id) else REPORTER


# ------------------------------------------------------------------------------------------------------------- opening
def open_direct(db: Session, report: Report, actor: User, party: str) -> CaseMessageThread:
    """The Leader's conversation with one resident of a report. One per resident and report: opening it again returns the same one."""
    report = L.case_for_staff(db, report.report_id, actor, write=True)
    report = LP.lock_case(db, report.report_id)
    L.require_open(report, "message the people on it")
    resident, role = resident_of(db, report, party)
    t = (db.query(CaseMessageThread).join(CaseMessageMember, CaseMessageMember.thread_id == CaseMessageThread.thread_id)
         .filter(CaseMessageThread.kind == "direct", CaseMessageThread.report_id == report.report_id, CaseMessageThread.status == "open",
                 CaseMessageMember.user_id == resident.user_id).first())
    if t is None:
        t = CaseMessageThread(subdivision_id=report.subdivision_id, kind="direct", report_id=report.report_id, created_by=actor.user_id)
        db.add(t)
        db.flush()
        _add_member(db, t, resident.user_id, role, report.report_id)
        L.history(db, report, actor, f"The Subdivision Leader opened a conversation with the {ROLE_LABEL[role].lower()}.")
    _add_member(db, t, actor.user_id, LEADER)
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
        t.status, t.closed_at, t.closed_by, t.close_reason = "closed", db_now(db), actor.user_id, text
        _system(db, t, text)
        closed += 1
        if announce:
            residents = [m.user_id for m in _members(db, t) if m.role != LEADER]
            LP.notify(db, residents, "lost_found_unlinked", t.thread_id, "A link between two reports was removed", f"{text} Nothing was marked recovered.")
    return closed


def close_for_report(db: Session, report_id: int, actor_id: Optional[int] = None, reason: Optional[str] = None) -> int:
    """
    Automatically close every open conversation (both Subdivision Leader-to-resident direct chats and resident-to-resident bridges)
    involving a report when that report/case is closed.
    """
    text = (reason or "").strip() or "The report is closed, so this conversation has ended."
    now = db_now(db)
    closed = 0
    with db.no_autoflush:
        rows = (db.query(CaseMessageThread)
                .filter(or_(CaseMessageThread.report_id == report_id, CaseMessageThread.related_report_id == report_id),
                        CaseMessageThread.status == "open")
                .all())
        for t in rows:
            if t.status != "open":
                continue
            t.status = "closed"
            t.closed_at = t.closed_at or now
            t.closed_by = t.closed_by or actor_id
            t.close_reason = t.close_reason or text
            db.add(CaseMessage(thread_id=t.thread_id, sender_id=None, kind="system", body=t.close_reason, created_at=now))
            closed += 1
    return closed


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
        L.history(db, r, leader, f"The Subdivision Leader sent a message to the {who_label}.")


def _notify_after(db: Session, t: CaseMessageThread, sender: User, text: str) -> None:
    staff = LP.is_leader_of(sender, t.subdivision_id)
    members = _members(db, t)
    # Notifications may appear outside the authenticated conversation (including device previews). A sender may choose to
    # write their own contact/care address, but it must stay in the participant-scoped message and summary endpoints.
    preview = "Open the conversation to read the new message."
    if t.kind == "direct" and not staff:
        leaders = [m.user_id for m in members if m.role == LEADER and m.user_id != sender.user_id]
        if not leaders:
            leaders = [u for u in LP.leader_ids(db, t.subdivision_id) if u != sender.user_id]
        for uid in leaders:
            # a Leader opens the case by its report id
            db.add(Notification(user_id=uid, type="case_message", related_id=t.report_id, title=f"{_first(sender)} replied"[:255],
                                message=preview))
    for m in members:
        if m.role == LEADER or m.user_id == sender.user_id:
            continue
        title = "Message from your Subdivision Leader" if staff else f"{_first(sender)} wrote in your conversation"
        db.add(Notification(user_id=m.user_id, type="case_message", related_id=t.thread_id, title=title[:255], message=preview[:1000]))


def send(db: Session, t: CaseMessageThread, sender: User, body: str, client_request_id: Optional[str] = None) -> CaseMessage:
    t, mode = thread_for(db, t.thread_id, sender, write=True)
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write a message first.")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=422, detail=f"A message can be at most {MAX_BODY} characters.")
    if mode == "staff":
        for r in reports_of(db, t):
            L.require_case_handler(r, sender)
            L.require_not_merged(r)
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
        member.last_read_message_id = msg.message_id
    if mode == "staff":
        _log_contact(db, t, sender, text)
        L.audit(db, sender, "CASE_MESSAGE_SENT", reports_of(db, t)[0], "The Subdivision Leader sent a case message.",
                table="case_messages", target_id=msg.message_id, new={"thread_id": t.thread_id})
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
    if member is not None and member.last_read_message_id < last:
        member.last_read_message_id = last


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
    lost = db.get(Report, t.report_id)
    pet = _pet_name(lost) if lost is not None else None
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
        can_reply = (t.kind == "direct"
                     and can_reply
                     and all((viewer.role_id != 2 or not r.assigned_leader_id or r.assigned_leader_id == viewer.user_id)
                             and not r.duplicate_of_report_id for r in reports_of(db, t)))
    mine = next((m for m in members if m.user_id == viewer.user_id), None)
    title, subtitle = _titles(db, t, viewer) if not staff else ("Owner and finder" if t.kind == "bridge" else "Message", "")
    is_private_bridge = staff and t.kind == "bridge"
    return {
        "thread_id": t.thread_id, "kind": t.kind, "status": "closed" if why else "open", "can_reply": can_reply, "ended_reason": why,
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
    roles = {m.user_id: m for m in _members(db, t)}
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
        messages.append({"message_id": r.message_id, "kind": r.kind, "sender_id": r.sender_id, "sender_name": name, "sender_role": role,
                         "label": ROLE_LABEL.get(role, ""), "mine": r.sender_id == viewer.user_id, "body": r.body, "at": r.created_at})
    out["messages"] = messages
    return out


def threads_for_report(db: Session, report: Report, viewer: User) -> List[Dict[str, Any]]:
    """The conversations of a case, for the Leader's case screen (staff only): who is in each, how many messages, how many are unread."""
    rows = (db.query(CaseMessageThread).filter(or_(CaseMessageThread.report_id == report.report_id, CaseMessageThread.related_report_id == report.report_id))
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
