"""
A case is one animal: the report filed first (the main case) plus every report merged into it as a duplicate.
Decisions on report-to-report matches apply to whole cases, not just the two reports in the suggestion:

- Matched: the two cases become one (same merge rules as Merge Duplicates; the first-filed report stays main).
  If both reports are already in the same case, the decision is only recorded.
- Not a Match: every open suggestion between the two cases is rejected too, and the AI stops pairing them.
"""
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException, Request
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.models.user import User

PENDING_MATCH_STATUSES = ("AI_SUGGESTED", "PENDING_VERIFICATION")


def case_root(db: Session, report: Report) -> Report:
    """The main case a report belongs to (itself if it is not a merged duplicate)."""
    if report.duplicate_of_report_id:
        parent = db.get(Report, report.duplicate_of_report_id)
        if parent:
            return parent
    return report


def case_members(db: Session, root: Report) -> List[Report]:
    """Every report in the case, in the order they were filed."""
    children = db.query(Report).filter(Report.duplicate_of_report_id == root.report_id).all()
    return sorted([root] + children, key=lambda r: (r.created_at or datetime.max, r.report_id))


def root_ids(db: Session, report_ids: Iterable[int]) -> Dict[int, int]:
    """report_id -> its main case's report_id."""
    ids = list({i for i in report_ids if i})
    if not ids:
        return {}
    rows = db.query(Report.report_id, Report.duplicate_of_report_id).filter(Report.report_id.in_(ids)).all()
    return {rid: (parent or rid) for rid, parent in rows}


def _describe(members: List[Report], root_id: int) -> str:
    if len(members) == 1:
        return f"Report #{members[0].report_id}"
    return f"Case #{root_id} (Reports {', '.join('#' + str(m.report_id) for m in members)})"


def case_pet_claims(db: Session, members: List[Report]) -> Dict[int, int]:
    """
    pet_id -> the report that ties this case to it. A case is tied to a registered pet once a report in it is linked
    to the pet, or staff confirmed a look-alike match for it that the owner has not rejected (owner may still be pending).
    """
    claims: Dict[int, int] = {}
    for m in members:
        if m.pet_id:
            claims.setdefault(m.pet_id, m.report_id)
    ids = [m.report_id for m in members]
    if ids:
        rows = db.query(ReportMatch.matched_pet_id, ReportMatch.source_report_id).filter(
            ReportMatch.source_report_id.in_(ids),
            ReportMatch.matched_pet_id.isnot(None),
            ReportMatch.status == "CONFIRMED_MATCH",
            ReportMatch.owner_confirmation_status != "OWNER_REJECTED",
        ).order_by(ReportMatch.verified_at, ReportMatch.match_id).all()
        for pet_id, rid in rows:
            claims.setdefault(pet_id, rid)
    return claims


def pet_name(db: Session, pet_id: int) -> str:
    pet = db.get(Pet, pet_id)
    return f"'{pet.display_name}'" if pet else "another registered pet"


def _pet_conflict(db: Session, members: List[Report]) -> Optional[str]:
    claims = case_pet_claims(db, members)
    if len(claims) > 1:
        listed = ", ".join(f"{pet_name(db, p)} (Report #{r})" for p, r in sorted(claims.items()))
        return (
            f"Pet identity conflict: these reports are tied to different registered pets ({listed}). "
            f"They can't be merged automatically. Review the pet matches and unlink the wrong one first."
        )
    return None


def group_pet_conflict(db: Session, reports: List[Report]) -> Optional[str]:
    """Pet identity conflict across the whole cases of the given reports (used before any merge)."""
    everyone: Dict[int, Report] = {}
    for r in reports:
        for m in case_members(db, case_root(db, r)):
            everyone[m.report_id] = m
    return _pet_conflict(db, list(everyone.values()))


def preview_report_match(db: Session, actor: User, match: ReportMatch) -> dict:
    """What confirming this report-to-report match would do, and why it would be refused (if it would)."""
    from app.routes.reports import _check_merge_primary, _check_mergeable, _first_reported

    src, tgt = match.source_report, match.matched_report
    src_root, tgt_root = case_root(db, src), case_root(db, tgt)
    a, b = case_members(db, src_root), case_members(db, tgt_root)

    if src_root.report_id == tgt_root.report_id:
        return {
            "effect": "already_same_case",
            "main_report_id": src_root.report_id,
            "report_ids": [m.report_id for m in a],
            "message": f"Report #{src.report_id} and Report #{tgt.report_id} are already in Case #{src_root.report_id}. Confirming only records your decision; nothing is merged again.",
            "blocked_reason": None,
        }

    main = _first_reported([src_root, tgt_root])
    other = tgt_root if main is src_root else src_root
    everyone = sorted(a + b, key=lambda r: (r.created_at or datetime.max, r.report_id))
    listed = ", ".join("#" + str(m.report_id) for m in everyone)

    if len(a) == 1 and len(b) == 1:
        effect = "new_case"
        message = f"Report #{other.report_id} will be merged into Report #{main.report_id}, which was filed first and stays the main case."
    elif min(len(a), len(b)) == 1 and (src_root if len(a) > 1 else tgt_root).report_id == main.report_id:
        # One standalone report joins an existing case whose main report was filed earlier.
        effect = "join_case"
        case_side, in_case, single = (a, src, b[0]) if len(a) > 1 else (b, tgt, a[0])
        message = (
            f"Report #{in_case.report_id} is already part of {_describe(case_side, main.report_id)}. "
            f"Confirming will add Report #{single.report_id} to Case #{main.report_id}."
        )
    else:
        effect = "combine_cases"
        message = f"This combines {_describe(a, src_root.report_id)} and {_describe(b, tgt_root.report_id)} into Case #{main.report_id} (filed first): Reports {listed}."

    blocked = _pet_conflict(db, everyone)
    if not blocked:
        try:
            _check_merge_primary(db, actor, main)
            _check_mergeable(db, actor, other, main)
        except HTTPException as e:
            blocked = str(e.detail)

    return {
        "effect": effect,
        "main_report_id": main.report_id,
        "report_ids": [m.report_id for m in everyone],
        "message": message,
        "blocked_reason": blocked,
    }


def settle_case_suggestions(db: Session, actor: User, main_report_id: int, actor_role: str) -> int:
    """Open suggestions between reports that are now in the same case are closed as confirmed. Returns how many."""
    root = db.get(Report, main_report_id)
    ids = [m.report_id for m in case_members(db, root)]
    rows = db.query(ReportMatch).filter(
        ReportMatch.status.in_(PENDING_MATCH_STATUSES),
        ReportMatch.source_report_id.in_(ids),
        ReportMatch.matched_report_id.in_(ids),
    ).all()
    for m in rows:
        m.status = "CONFIRMED_MATCH"
        m.reviewed_by = actor.user_id
        m.reviewer_role = actor_role
        m.verification_notes = f"Same case: both reports are in Case #{main_report_id}."
        m.verified_at = datetime.now()
    return len(rows)


def confirm_report_match(db: Session, actor: User, match: ReportMatch, notes: str, req: Request, actor_role: str) -> int:
    """Apply a Matched decision. Returns the main case's report_id. Raises a clear 4xx if it can't be done. No commit."""
    from app.routes.reports import _merge_group

    src_root, tgt_root = case_root(db, match.source_report), case_root(db, match.matched_report)
    if src_root.report_id == tgt_root.report_id:
        main_id = src_root.report_id
    else:
        conflict = _pet_conflict(db, case_members(db, src_root) + case_members(db, tgt_root))
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)
        # The merge checks both main cases (closed, other officer, subdivision, animal type, breed); children follow.
        main_id = _merge_group(db, actor, [src_root.report_id, tgt_root.report_id], notes, req, commit=False).report_id
        db.flush()
    settle_case_suggestions(db, actor, main_id, actor_role)
    return main_id


def reject_report_match(db: Session, actor: User, match: ReportMatch, notes: str, actor_role: str) -> int:
    """Apply a Not a Match decision to both whole cases. Returns how many other suggestions it closed. No commit."""
    src_root, tgt_root = case_root(db, match.source_report), case_root(db, match.matched_report)
    if src_root.report_id == tgt_root.report_id:
        raise HTTPException(
            status_code=409,
            detail=f"Report #{match.source_report_id} and Report #{match.matched_report_id} are already merged in Case #{src_root.report_id}. Unmerge the report first if they are different animals."
        )
    a = [m.report_id for m in case_members(db, src_root)]
    b = [m.report_id for m in case_members(db, tgt_root)]
    rows = db.query(ReportMatch).filter(
        ReportMatch.match_id != match.match_id,
        ReportMatch.status.in_(PENDING_MATCH_STATUSES),
        or_(
            and_(ReportMatch.source_report_id.in_(a), ReportMatch.matched_report_id.in_(b)),
            and_(ReportMatch.source_report_id.in_(b), ReportMatch.matched_report_id.in_(a)),
        ),
    ).all()
    for m in rows:
        m.status = "NOT_A_MATCH"
        m.reviewed_by = actor.user_id
        m.reviewer_role = actor_role
        m.verification_notes = f"Covered by the decision on Match #{match.match_id}: {notes}"
        m.verified_at = datetime.now()
    return len(rows)


def pet_conflict_for_case(db: Session, report: Report, pet_id: int) -> Optional[str]:
    """One active animal case has one registered pet identity: refuse tying this case to a different pet."""
    root = case_root(db, report)
    for other_pet, rid in case_pet_claims(db, case_members(db, root)).items():
        if other_pet != pet_id:
            where = f"Report #{rid}" if rid == report.report_id else f"Report #{rid} in Case #{root.report_id}"
            return (
                f"This animal case is already confirmed as {pet_name(db, other_pet)} (through {where}). "
                f"A case can only be confirmed as one registered pet. Unlink that match first if it was wrong."
            )
    return None


def require_case_pet(db: Session, report: Report, pet_id: Optional[int]) -> None:
    if pet_id:
        conflict = pet_conflict_for_case(db, report, pet_id)
        if conflict:
            raise HTTPException(status_code=409, detail=conflict)


def require_direct_pet_link(db: Session, report: Report, pet: Pet, actor: User) -> None:
    """
    Linking a report to a pet without the look-alike flow skips the owner's confirmation, so it is only allowed when no
    owner needs to confirm: a community animal, the owner's own report, or a pet record this officer just created from it.
    """
    if not pet.owner_id or (report.user_id and report.user_id == pet.owner_id):
        return
    if pet.registered_by_user_id == actor.user_id:
        other = db.query(Report.report_id).filter(Report.pet_id == pet.pet_id, Report.report_id != report.report_id).first()
        if other is None:
            return
    raise HTTPException(
        status_code=409,
        detail=(
            f"'{pet.display_name}' has a registered owner who must confirm the sighting. "
            f"Confirm it through the AI look-alike match instead of linking it directly."
        ),
    )


def release_inherited_pet(db: Session, root: Report, pet_id: int) -> bool:
    """
    After a duplicate leaves a case, drop the case's pet identity if only that duplicate supported it (the main report
    took it over at merge time). Kept when the remaining reports support it on their own. Returns True if dropped.
    """
    if root.pet_id != pet_id:
        return False
    members = case_members(db, root)
    if any(m.pet_id == pet_id for m in members if m.report_id != root.report_id):
        return False
    pet = db.get(Pet, pet_id)
    if pet and pet.owner_id and root.user_id == pet.owner_id:
        return False
    supported = db.query(ReportMatch.match_id).filter(
        ReportMatch.source_report_id.in_([m.report_id for m in members]),
        ReportMatch.matched_pet_id == pet_id,
        ReportMatch.status == "CONFIRMED_MATCH",
        ReportMatch.owner_confirmation_status != "OWNER_REJECTED",
    ).first()
    if supported:
        return False
    root.pet_id = None
    root.is_possible_owned = False
    return True


# --- One claim per pet and case ------------------------------------------------------------------------------------
CLAIM_PROOF_FIELDS = ("vaccine_card_url", "vet_record_url", "registration_record_url", "additional_photos_url", "evidence_url")
_CLAIM_RANK = {"Pet Received": 6, "Handover Complete": 5, "Approved": 4, "Evidence Requested": 3, "Pending Review": 2,
               "Possible Match Found": 1, "Potential Owner Match": 1}


def pick_case_claim(claims: list):
    """The claim that represents the case: the furthest along, then the earliest filed."""
    live = [c for c in claims if c.status not in ("Merged", "Rejected")]
    if not live:
        return None
    return sorted(live, key=lambda c: (-_CLAIM_RANK.get(c.status, 0), c.created_at or datetime.max, c.claim_id))[0]


def live_claim(db: Session, claim):
    """Follow a merged claim to the case's claim it was merged into."""
    from app.models.pet_claim import PetClaim
    seen = set()
    while claim is not None and claim.status == "Merged" and claim.merged_into_claim_id and claim.claim_id not in seen:
        seen.add(claim.claim_id)
        nxt = db.get(PetClaim, claim.merged_into_claim_id)
        if nxt is None:
            break
        claim = nxt
    return claim


def consolidate_case_claims(db: Session, root: Report, actor: Optional[User] = None, req: Optional[Request] = None) -> dict:
    """
    One claim per pet per case. Redundant claims for the same pet on the case's reports are marked Merged and point at
    the case's claim (proof and markings copied over, nothing deleted). A merged claim whose case claim is no longer in
    the same case (reports unmerged) is reopened with its earlier status. No commit.
    """
    from app.models.pet_claim import PetClaim
    from app.utils.audit import log_activity

    members = case_members(db, root)
    ids = [m.report_id for m in members]
    out = {"merged": [], "reopened": []}
    if not ids:
        return out
    claims = db.query(PetClaim).filter(PetClaim.report_id.in_(ids)).order_by(PetClaim.claim_id).all()
    by_id = {c.claim_id: c for c in claims}

    for c in claims:
        if c.status == "Merged" and (c.merged_into_claim_id not in by_id):
            c.status = c.status_before_merge or "Pending Review"
            c.merged_into_claim_id = c.status_before_merge = None
            note = f"Reopened: the reports are no longer in the same case (Case #{root.report_id})."
            c.remarks = f"{c.remarks}\n{note}" if c.remarks else note
            out["reopened"].append(c.claim_id)
            log_activity(db=db, action="REOPEN_CASE_CLAIM", target_table="pet_claims", target_id=c.claim_id,
                         description=f"Claim #{c.claim_id} (Report #{c.report_id}) reopened as {c.status}: its reports were unmerged.",
                         user_id=actor.user_id if actor else None, log_type="operation",
                         old_values={"status": "Merged"}, new_values={"status": c.status}, request=req, commit=False)

    for pet_id in sorted({c.pet_id for c in claims}):
        same = [c for c in claims if c.pet_id == pet_id]
        keep = pick_case_claim(same)
        if keep is None:
            continue
        for c in same:
            if c.claim_id == keep.claim_id or c.status in ("Merged", "Rejected"):
                continue
            for f in CLAIM_PROOF_FIELDS:
                if getattr(c, f) and not getattr(keep, f):
                    setattr(keep, f, getattr(c, f))
            if c.distinctive_markings and not keep.distinctive_markings:
                keep.distinctive_markings = c.distinctive_markings
            if c.match_score and (not keep.match_score or c.match_score > keep.match_score):
                keep.match_score = c.match_score
            note_keep = (f"Claim #{c.claim_id} (Report #{c.report_id}) was combined into this claim: the reports are one "
                         f"case (Case #{root.report_id}).")
            keep.remarks = f"{keep.remarks}\n{note_keep}" if keep.remarks else note_keep
            c.status_before_merge, c.status, c.merged_into_claim_id = c.status, "Merged", keep.claim_id
            note = (f"Combined into claim #{keep.claim_id} (Report #{keep.report_id}): one claim per pet for Case "
                    f"#{root.report_id}. Kept for the record.")
            c.remarks = f"{c.remarks}\n{note}" if c.remarks else note
            out["merged"].append((c.claim_id, keep.claim_id))
            log_activity(db=db, action="MERGE_CASE_CLAIM", target_table="pet_claims", target_id=c.claim_id,
                         description=f"Claim #{c.claim_id} (Report #{c.report_id}) combined into claim #{keep.claim_id} "
                                     f"(Report #{keep.report_id}) for Case #{root.report_id}.",
                         user_id=actor.user_id if actor else None, log_type="operation",
                         old_values={"status": c.status_before_merge}, new_values={"status": "Merged", "merged_into_claim_id": keep.claim_id},
                         request=req, commit=False)
    db.flush()
    return out


# --- One owner conversation per pet and case -----------------------------------------------------------------------
def case_conversation(db: Session, root: Report, pet_id: Optional[int]):
    """The case's primary look-alike conversation about this pet: the earliest one among the case's reports."""
    from app.models.chat import ChatThread
    if not pet_id:
        return None
    ids = [m.report_id for m in case_members(db, root)]
    match_ids = [mid for (mid,) in db.query(ReportMatch.match_id).filter(
        ReportMatch.source_report_id.in_(ids), ReportMatch.matched_pet_id == pet_id).all()]
    if not match_ids:
        return None
    return (db.query(ChatThread).filter(ChatThread.thread_type == "Direct", ChatThread.related_id.in_(match_ids))
            .order_by(ChatThread.created_at, ChatThread.thread_id).first())


def post_case_message(db: Session, thread, text: str, sender_id: Optional[int]) -> bool:
    """Add a system message to a conversation once (the same text is never posted twice)."""
    from app.models.chat import ChatMessage
    if thread is None or not sender_id:
        return False
    if db.query(ChatMessage.message_id).filter(ChatMessage.thread_id == thread.thread_id, ChatMessage.message_text == text).first():
        return False
    db.add(ChatMessage(thread_id=thread.thread_id, sender_id=sender_id, message_text=text, is_system=True, is_read=False))
    return True


# --- Trust rule ----------------------------------------------------------------------------------------------------
def pet_link_trusted(report: Report) -> bool:
    """
    May this report's pet link be used for consequential actions (bite/chase history, owner warnings, ownership proof
    at handover)? Its own confirmation: yes. Inherited from the case: only after a staff re-check.
    """
    if not report.pet_id:
        return False
    if report.pet_inherited_from_match_id is None:
        return True
    if report.identity_rechecked_at is None:
        return False
    # An owner's open "this isn't my pet" dispute suspends a re-checked inherited identity until staff decide
    return not any(d.dispute_type == "wrong_identity" and d.status == "Pending" for d in (report.disputes or []))


def trusted_link_filter():
    """SQL filter: reports whose pet link may count toward the pet's record."""
    from app.models.report_dispute import ReportDispute
    pending = (Report.disputes.any(and_(ReportDispute.dispute_type == "wrong_identity", ReportDispute.status == "Pending")))
    return or_(Report.pet_inherited_from_match_id.is_(None),
               and_(Report.identity_rechecked_at.isnot(None), ~pending))


def refresh_pet_behavior(db: Session, pet: Pet) -> None:
    """Bite / chase / aggression profile from verified incident reports with a trusted link to this pet."""
    base = db.query(Report).filter(Report.pet_id == pet.pet_id, Report.verification_status == 'verified_true', trusted_link_filter())
    bite_count = base.filter(Report.verified_actual_bite == True).count()  # noqa: E712
    chase_count = base.filter(Report.verified_chasing == True).count()  # noqa: E712
    aggressive = base.filter(Report.verified_aggressive == True).count() > 0  # noqa: E712
    pet.has_bite_history = bite_count > 0
    pet.bite_incident_count = bite_count
    pet.chase_behavior = chase_count > 0
    pet.chase_incident_count = chase_count
    pet.temperament = 'Aggressive' if (aggressive or bite_count > 0) else 'Friendly'


# --- One confirmed pet identity shared by every report of a case -------------------------------------------------
COVERED_STATUS = "COVERED_BY_CASE"
# A suggestion for a different pet on a case confirmed as another pet: closed, reopened if that confirmation goes
SUPERSEDED_STATUS = "SUPERSEDED_BY_CASE"


def _fully_confirmed(m: ReportMatch, pet: Optional[Pet]) -> bool:
    """Staff confirmed it, and the owner did too (or the pet has no owner to ask)."""
    if m.status != "CONFIRMED_MATCH" or not m.matched_pet_id or pet is None:
        return False
    return (not pet.owner_id) or m.owner_confirmation_status == "OWNER_CONFIRMED"


def case_confirmed_match(db: Session, members: List[Report]) -> Optional[ReportMatch]:
    """The earliest fully confirmed pet match made on a report of this case (the case's evidence of identity)."""
    ids = [m.report_id for m in members]
    if not ids:
        return None
    rows = (db.query(ReportMatch)
            .filter(ReportMatch.source_report_id.in_(ids), ReportMatch.matched_pet_id.isnot(None),
                    ReportMatch.status == "CONFIRMED_MATCH")
            .order_by(ReportMatch.verified_at, ReportMatch.match_id).all())
    for m in rows:
        if _fully_confirmed(m, db.get(Pet, m.matched_pet_id)):
            return m
    return None


def _case_note(db: Session, report_id: int, actor: Optional[User], text: str) -> None:
    from app.models.report import StatusHistory
    db.add(StatusHistory(report_id=report_id, updated_by=actor.user_id if actor else None, remarks=text))


def resync_case_pet_identity(db: Session, report: Report, actor: Optional[User] = None, req: Optional[Request] = None) -> dict:
    """
    Make every report of the case agree with the case's confirmed pet. Safe to run any number of times. No commit.
    - Reports without a pet link inherit the confirmed pet (pet_inherited_from_match_id points at the confirmation).
    - Pending suggestions for that same pet are closed as COVERED_BY_CASE (never marked as confirmed: the original
      confirmation keeps who confirmed it and when).
    - Inherited links / covered suggestions whose confirmation no longer applies to this case are undone.
    - Open suggestions for other pets on the case are SUPERSEDED_BY_CASE (reopened if the confirmation goes).
    """
    from app.models.pet_history import PetHistory
    from app.utils.audit import log_activity

    root = case_root(db, report)
    members = case_members(db, root)
    ids = {m.report_id for m in members}
    conf = case_confirmed_match(db, members)
    conf_id = conf.match_id if conf else None
    pet = db.get(Pet, conf.matched_pet_id) if conf else None
    out = {"inherited": [], "released": [], "covered": [], "reopened": [], "superseded": []}

    # Undo what no longer applies
    for m in members:
        if m.pet_inherited_from_match_id and m.pet_inherited_from_match_id != conf_id:
            old = db.get(ReportMatch, m.pet_inherited_from_match_id)
            if m.pet_id and (old is None or m.pet_id == old.matched_pet_id):
                _case_note(db, m.report_id, actor, f"Pet link to {pet_name(db, m.pet_id)} removed: it came from a case "
                                                   f"confirmation that no longer applies to this report.")
                out["released"].append((m.report_id, m.pet_id))
                m.pet_id = None
                m.is_possible_owned = False
            m.pet_inherited_from_match_id = None
            m.identity_rechecked_by = m.identity_rechecked_at = m.identity_recheck_note = None
    stale = db.query(ReportMatch).filter(ReportMatch.status.in_((COVERED_STATUS, SUPERSEDED_STATUS)),
                                         ReportMatch.source_report_id.in_(ids)).all()
    for r in stale:
        same_pet = bool(conf) and r.matched_pet_id == conf.matched_pet_id
        if r.covered_by_match_id != conf_id or (same_pet != (r.status == COVERED_STATUS)):
            r.status, r.covered_by_match_id = "AI_SUGGESTED", None
            r.verification_notes = "Reopened: the case confirmation that covered this suggestion no longer applies."
            out["reopened"].append(r.match_id)

    out["claims"] = consolidate_case_claims(db, root, actor, req)
    if conf is None:
        db.flush()
        _refresh_released(db, out)
        return out

    # Inherit the confirmed pet on the other reports of the case
    who = conf.reviewer.name if getattr(conf, "reviewer", None) else "the reviewing official"
    when = conf.verified_at.strftime("%b %d, %Y") if conf.verified_at else "earlier"
    for m in members:
        if m.report_id == conf.source_report_id or m.pet_id:
            continue
        m.pet_id = conf.matched_pet_id
        m.is_possible_owned = bool(pet.owner_id)
        m.pet_inherited_from_match_id = conf.match_id
        _case_note(db, m.report_id, actor,
                   f"Linked to {pet_name(db, conf.matched_pet_id)} through Case #{root.report_id}: confirmed on Report "
                   f"#{conf.source_report_id} (Match #{conf.match_id}) by {who}"
                   + ("" if not pet.owner_id else " and the owner") + f" on {when}. No new confirmation was needed.")
        db.add(PetHistory(
            pet_id=pet.pet_id, event_type="SIGHTING_LINKED_VIA_CASE",
            title=f"Sighting Linked — Report #{m.report_id}",
            description=f"Report #{m.report_id} is part of Case #{root.report_id}, already confirmed as {pet.display_name} "
                        f"in Match #{conf.match_id} (Report #{conf.source_report_id}).",
            recovery_method="Merged Case", actor_id=actor.user_id if actor else None,
            actor_name=actor.name if actor else "System", actor_role="Staff" if actor else "System",
            previous_status=pet.status, new_status=pet.status,
            location_name=m.landmark, latitude=m.latitude, longitude=m.longitude,
        ))
        log_activity(db=db, action="INHERIT_CASE_PET_IDENTITY", target_table="reports", target_id=m.report_id,
                     description=f"Report #{m.report_id} linked to Pet #{conf.matched_pet_id} through Case #{root.report_id} "
                                 f"(confirmation Match #{conf.match_id}).",
                     user_id=actor.user_id if actor else None, log_type="operation",
                     old_values={"pet_id": None}, new_values={"pet_id": conf.matched_pet_id, "inherited_from_match_id": conf.match_id},
                     request=req, commit=False)
        out["inherited"].append(m.report_id)
        conversation = case_conversation(db, root, pet.pet_id)
        if conversation is not None:
            post_case_message(db, conversation,
                              f"New verified sighting: Report #{m.report_id} was added to this case (Case #{root.report_id}). "
                              f"No additional confirmation is required.",
                              sender_id=(actor.user_id if actor else conversation.created_by))
        if pet.owner_id:
            title = f"🐾 New Verified Sighting of {pet.display_name} (Report #{m.report_id})"
            already = db.query(Notification.notification_id).filter(
                Notification.user_id == pet.owner_id, Notification.related_id == m.report_id, Notification.title == title).first()
            if not already:
                db.add(Notification(
                    user_id=pet.owner_id, title=title, type="potential_match", related_id=m.report_id,
                    message=(f"A new verified sighting of {pet.display_name} (Report #{m.report_id}) has been added to the "
                             f"existing case. No additional confirmation is required. If this isn't {pet.display_name}, "
                             f"open the sighting and flag it as incorrect."),
                ))

    # Same-pet suggestions on any report of the case are covered by the confirmation (not re-confirmed)
    pending = db.query(ReportMatch).filter(
        ReportMatch.source_report_id.in_(ids), ReportMatch.matched_pet_id == conf.matched_pet_id,
        ReportMatch.match_id != conf.match_id,
        or_(ReportMatch.status.in_(PENDING_MATCH_STATUSES),
            # staff confirmed it again on this report, still waiting for the owner: redundant, don't ask the owner twice
            and_(ReportMatch.status == "CONFIRMED_MATCH", ReportMatch.owner_confirmation_status == "PENDING")),
    ).all()
    for r in pending:
        was = r.status
        r.status, r.covered_by_match_id = COVERED_STATUS, conf.match_id
        r.verification_notes = (f"Covered by the confirmed Match #{conf.match_id} on Report #{conf.source_report_id} "
                                f"(Case #{root.report_id}); no separate confirmation needed."
                                + (f" Earlier staff confirmation on this report kept on record (reviewer and time unchanged); "
                                   f"the owner is not asked again." if was == "CONFIRMED_MATCH" else ""))
        out["covered"].append(r.match_id)

    # Open suggestions for a different pet on this case are superseded by the confirmation (not deleted)
    others = db.query(ReportMatch).filter(
        ReportMatch.source_report_id.in_(ids), ReportMatch.matched_pet_id.isnot(None),
        ReportMatch.matched_pet_id != conf.matched_pet_id, ReportMatch.status.in_(PENDING_MATCH_STATUSES),
    ).all()
    for r in others:
        r.status, r.covered_by_match_id = SUPERSEDED_STATUS, conf.match_id
        r.verification_notes = (f"Superseded by Pet #{conf.matched_pet_id} ({pet.display_name}): Case #{root.report_id} is "
                                f"confirmed as that pet in Match #{conf.match_id}. Reopens automatically if that changes.")
        out["superseded"].append(r.match_id)
    db.flush()
    _refresh_released(db, out)
    return out


def _refresh_released(db: Session, out: dict) -> None:
    """A re-checked report that left the pet may have counted toward its bite/chase history: recompute it."""
    for pet_id in {p for _, p in out["released"]}:
        pet = db.get(Pet, pet_id)
        if pet is not None:
            refresh_pet_behavior(db, pet)


# Statuses of a finished case (resolved, returned, dismissed, impounded...): a new report then starts a new case
CLOSED_CASE_STATUS_IDS = (3, 8, 9, 10, 11, 12, 14, 17, 18)


def active_case_for_pet(db: Session, pet_id: int, exclude_report: Optional[Report] = None) -> Optional[dict]:
    """
    The open case whose identity is (or is being) confirmed as this pet, other than the given report's own case.
    Returns {"root": Report, "match": ReportMatch, "owner_pending": bool}: owner_pending means staff confirmed and the
    owner hasn't answered yet. None when the pet has no such active case.
    """
    exclude_root = case_root(db, exclude_report).report_id if exclude_report is not None else None
    rows = (db.query(ReportMatch).filter(ReportMatch.matched_pet_id == pet_id, ReportMatch.status == "CONFIRMED_MATCH",
                                         ReportMatch.owner_confirmation_status != "OWNER_REJECTED")
            .order_by(ReportMatch.verified_at, ReportMatch.match_id).all())
    pet = db.get(Pet, pet_id)
    best = None
    for m in rows:
        src = db.get(Report, m.source_report_id)
        if src is None:
            continue
        root = case_root(db, src)
        if root.report_id == exclude_root or root.current_status_id in CLOSED_CASE_STATUS_IDS:
            continue
        full = _fully_confirmed(m, pet)
        if full:
            return {"root": root, "match": m, "owner_pending": False}
        if best is None:
            best = {"root": root, "match": m, "owner_pending": True}
    return best


def _owner_pending_elsewhere(db: Session, match: ReportMatch) -> Optional[ReportMatch]:
    """Another report of the case already has staff confirmation for this pet, waiting for the owner's answer."""
    root = case_root(db, match.source_report)
    ids = [m.report_id for m in case_members(db, root)]
    return db.query(ReportMatch).filter(
        ReportMatch.source_report_id.in_(ids), ReportMatch.match_id != match.match_id,
        ReportMatch.matched_pet_id == match.matched_pet_id, ReportMatch.status == "CONFIRMED_MATCH",
        ReportMatch.owner_confirmation_status == "PENDING",
    ).first()


def active_case_lock(db: Session, match: ReportMatch) -> Optional[dict]:
    """The other active case this pet suggestion is locked by (None if the report was marked a separate incident)."""
    if not match.matched_pet_id or not match.source_report or match.status not in PENDING_MATCH_STATUSES:
        return None
    if getattr(case_root(db, match.source_report), "separate_incident_reason", None):
        return None
    return active_case_for_pet(db, match.matched_pet_id, exclude_report=match.source_report)


def match_identity_lock(db: Session, match: ReportMatch) -> Optional[str]:
    """Why an open suggestion can no longer be confirmed because of the case's pet identity (None if it can)."""
    if match.status not in PENDING_MATCH_STATUSES or not match.source_report:
        return None
    if match.matched_pet_id:
        conflict = pet_conflict_for_case(db, match.source_report, match.matched_pet_id)
        if conflict:
            return conflict
        other = _owner_pending_elsewhere(db, match)
        if other is not None:
            return (f"Already confirmed by staff on Report #{other.source_report_id} (Match #{other.match_id}) and waiting "
                    f"for the owner's answer there. The owner is not asked twice; this report follows that decision.")
        active = active_case_lock(db, match)
        if active is not None:
            pet = db.get(Pet, match.matched_pet_id)
            label = pet.display_name if pet else "This pet"
            waiting = " (waiting for the owner's answer there)" if active["owner_pending"] else ""
            return (f"{label} is already confirmed in active Case #{active['root'].report_id}{waiting}. If this is the same "
                    f"animal, merge this report into Case #{active['root'].report_id}; the owner won't be asked again. If it's "
                    f"a separate incident, mark it as one first.")
        return None
    if match.matched_report:
        src_root, tgt_root = case_root(db, match.source_report), case_root(db, match.matched_report)
        if src_root.report_id != tgt_root.report_id:
            return _pet_conflict(db, case_members(db, src_root) + case_members(db, tgt_root))
    return None
