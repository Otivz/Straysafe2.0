"""
Report visibility (REPORT_VISIBILITY_IMPLEMENTATION.md): who besides the reporter and staff may see a report.

Three separate systems, kept apart on purpose:
  - status      what is happening to the animal          (current_status_id, the rescue workflow)
  - visibility  which OTHER residents may see the report  (this module; only set_visibility() writes it)
  - messaging   who may talk privately about it           (routes/chat.py; never reads visibility)
Status can only ever hide a report (false / rejected / merged), never publish it.
"""
import re
from datetime import datetime
from typing import Iterable, Optional, Set

from fastapi import HTTPException
from sqlalchemy import and_, event, inspect, or_
from sqlalchemy.orm import Session, object_session

from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report
from app.models.report_match import ReportMatch
from app.models.user import User

PUBLIC = "Public"
PRIVATE = "Private"
PENDING = "Pending Review"
VISIBILITY_VALUES = (PUBLIC, PRIVATE, PENDING)

FALSE_STATUS_IDS = (3, 14)            # Rejected, False Alarm / Dismissed
HIDDEN_STATUS_IDS = (3, 14, 18)       # ...and Merged duplicate: residents see the main case instead
STAFF_ROLE_IDS = (2, 3, 4)
COMMUNITY_REPORTER = "Community Reporter"
REGISTERED_OWNER = "Registered Owner"

# A staff-confirmed (or case-covered) identity the owner hasn't rejected
CONFIRMED_MATCH_STATUSES = ("CONFIRMED_MATCH", "COVERED_BY_CASE")
OPEN_MATCH_STATUSES = ("AI_SUGGESTED", "PENDING_VERIFICATION")

# viewer_access() levels
STAFF, REPORTER, OWNER, CASE_REPORTER, PUBLIC_VIEW, MATCH_OWNER, NONE = (
    "staff", "reporter", "owner", "case_reporter", "public", "match_owner", "none")


def is_verified(report: Report) -> bool:
    return (getattr(report, "verification_status", None) or "") == "verified_true"


def is_publicly_visible(report: Report) -> bool:
    """
    Other residents may see it: it is Public and isn't false, rejected or merged. A leader may make a report Public
    before verifying it (it is visible at once). An old report the RESIDENT marked Public before leaders decided
    (no leader decision recorded) still needs verification first.
    """
    return (
        (report.visibility or "") == PUBLIC
        and (getattr(report, "visibility_decided_by", None) is not None or is_verified(report))
        and report.current_status_id not in HIDDEN_STATUS_IDS
    )


def public_block_reason(report: Report) -> Optional[str]:
    """Why the leader can't choose Public right now (None when they can)."""
    if getattr(report, "is_sensitive", False):
        return "A private complaint about a neighbour is never made public. Publish a community notice instead."
    if report.current_status_id in FALSE_STATUS_IDS:
        return "A false or rejected report can't be made public."
    if report.current_status_id == 18 or report.duplicate_of_report_id:
        return "A merged duplicate can't be made public. Residents see the main case instead."
    return None


def _owned_pet_ids(db: Session, user_id: int) -> Set[int]:
    return {pid for (pid,) in db.query(Pet.pet_id).filter(Pet.owner_id == user_id).all()}


class ResidentScope:
    """A resident's reports and the cases they may see, worked out once per request (cheap per-report checks)."""

    def __init__(self, db: Session, user: User):
        self.user = user
        uid = user.user_id
        self.pet_ids: Set[int] = _owned_pet_ids(db, uid)
        own = {rid for (rid,) in db.query(Report.report_id).filter(Report.user_id == uid).all()}
        owner: Set[int] = set()
        if self.pet_ids:
            owner = {rid for (rid,) in db.query(Report.report_id).filter(Report.pet_id.in_(self.pet_ids)).all()}
            owner.update(rid for (rid,) in db.query(ReportMatch.source_report_id).filter(
                ReportMatch.matched_pet_id.in_(self.pet_ids), ReportMatch.status.in_(CONFIRMED_MATCH_STATUSES),
                ReportMatch.owner_confirmation_status != "OWNER_REJECTED").all())
        self.owner_case_ids: Set[int] = _expand_cases(db, owner)
        self.own_case_ids: Set[int] = _expand_cases(db, own)

    def access(self, report: Report) -> str:
        if report.user_id == self.user.user_id:
            return REPORTER
        if report.report_id in self.owner_case_ids:
            return OWNER
        if report.report_id in self.own_case_ids:
            return CASE_REPORTER
        if is_publicly_visible(report):
            return PUBLIC_VIEW
        return NONE

    def sql_filter(self):
        """The same rule for list queries (match cards are never listed)."""
        public = and_(
            Report.visibility == PUBLIC,
            # same as is_publicly_visible(): a leader's Public decision, or (old resident-chosen Public) verified
            or_(Report.visibility_decided_by.isnot(None), Report.verification_status == "verified_true"),
            or_(Report.current_status_id.is_(None), Report.current_status_id.notin_(HIDDEN_STATUS_IDS)),
        )
        allowed = self.owner_case_ids | self.own_case_ids
        return or_(Report.user_id == self.user.user_id, Report.report_id.in_(allowed or {-1}), public)


def resident_scope(db: Session, user: Optional[User]) -> Optional[ResidentScope]:
    """None for staff (and anonymous): they aren't limited by visibility."""
    if user is None or user.role_id in STAFF_ROLE_IDS:
        return None
    return ResidentScope(db, user)


def viewer_access(db: Session, user: Optional[User], report: Report, scope: Optional[ResidentScope] = None) -> str:
    """
    How much of a report this viewer may see:
      staff         officials (their own scope checks still apply in each route)
      reporter      the resident who filed it
      owner         owner of the pet the case is linked to, or confirmed by staff (not rejected by the owner)
      case_reporter filed another report of the same case
      public        anyone signed in, because the report is publicly visible
      match_owner   only an AI suggestion against the owner's pet: the minimum match card
      none          nothing (the routes answer 404)
    """
    if user is None:
        return NONE
    if user.role_id in STAFF_ROLE_IDS:
        return STAFF
    scope = scope or ResidentScope(db, user)
    level = scope.access(report)
    if level == NONE and scope.pet_ids and db.query(ReportMatch.match_id).filter(
            ReportMatch.source_report_id == report.report_id, ReportMatch.matched_pet_id.in_(scope.pet_ids),
            ReportMatch.status.in_(OPEN_MATCH_STATUSES),
            ReportMatch.owner_confirmation_status != "OWNER_REJECTED").first():
        return MATCH_OWNER
    return level


def can_view(db: Session, user: Optional[User], report: Report) -> bool:
    """May open the report itself (a match owner gets only the match card)."""
    return viewer_access(db, user, report) not in (NONE, MATCH_OWNER)


def _expand_cases(db: Session, ids: Set[int]) -> Set[int]:
    """The reports plus their main cases and every report merged into those cases."""
    if not ids:
        return set()
    out = set(ids)
    rows = db.query(Report.report_id, Report.duplicate_of_report_id).filter(Report.report_id.in_(ids)).all()
    roots = {parent or rid for rid, parent in rows}
    out |= roots
    out.update(rid for (rid,) in db.query(Report.report_id).filter(Report.duplicate_of_report_id.in_(roots)).all())
    return out


def set_visibility(db: Session, report: Report, value: str, actor: Optional[User], reason: str,
                   ip: Optional[str] = None, user_agent: Optional[str] = None, notify: bool = True) -> bool:
    """
    The only writer of a report's visibility. Records who decided, when and why, and logs old -> new in the audit
    log. actor None means a system reset (e.g. a false decision reversed). No commit. Returns True if it changed.
    """
    if value not in VISIBILITY_VALUES:
        raise ValueError(f"Unknown visibility '{value}'")
    if value == PUBLIC and getattr(report, "is_sensitive", False):
        # Enforced at the only writer, so no route can publish a private complaint (whatever it sends)
        raise HTTPException(status_code=409, detail=public_block_reason(report))
    old = report.visibility
    now = datetime.now()
    report.visibility = value
    report.visibility_decided_by = actor.user_id if (actor is not None and value != PENDING) else None
    report.visibility_decided_at = now if value != PENDING else None
    report.visibility_reason = reason
    who = actor.name if actor is not None else "System"
    db.add(AuditLog(
        user_id=actor.user_id if actor is not None else None,
        action="SET_REPORT_VISIBILITY", target_table="reports", target_id=report.report_id,
        description=f"{who} set report #{report.report_id} visibility {old or 'none'} -> {value}. Reason: {reason}",
        ip_address=ip, user_agent=user_agent, log_type="operation",
        old_values={"visibility": old}, new_values={"visibility": value, "reason": reason},
    ))
    if notify and actor is not None and old != value and report.user_id and value in (PUBLIC, PRIVATE):
        msg = (f"Your report #{report.report_id} was reviewed by your Subdivision Leader and is now visible to other "
               f"residents. Your name and contact details are not shown to them."
               if value == PUBLIC else
               f"Your report #{report.report_id} was reviewed by your Subdivision Leader and will stay private: only "
               f"you and the officials handling it can see it.")
        db.add(Notification(user_id=report.user_id, title="👁️ Report Visibility Decided", message=msg,
                            type="report_visibility", related_id=report.report_id))
    return old != value


def reset_to_pending(db: Session, report: Report, reason: str) -> bool:
    """System reset: a person must decide again (unmerge, a false decision reversed). Only if it was decided."""
    if (report.visibility or PENDING) == PENDING:
        return False
    return set_visibility(db, report, PENDING, None, reason, notify=False)


def visibility_needs_review(report: Report) -> bool:
    """An old Public report the resident chose before leaders decided (no leader decision recorded)."""
    return (report.visibility or "") == PUBLIC and not getattr(report, "visibility_decided_by", None)


# ---- rule 9: a false decision reversed must be decided again before it is public again --------------------------
@event.listens_for(Session, "before_flush")
def _false_decision_reversed(session: Session, flush_context, instances) -> None:
    for obj in list(session.dirty):
        if not isinstance(obj, Report):
            continue
        state = inspect(obj)
        hist = state.attrs.current_status_id.history
        if not hist.has_changes() or not hist.deleted:
            continue
        if state.attrs.visibility.history.has_changes():
            continue  # a person decided visibility in this same change (e.g. verifying the report again)
        old, new = hist.deleted[0], obj.current_status_id
        if old in FALSE_STATUS_IDS and new not in FALSE_STATUS_IDS and (obj.visibility or "") == PUBLIC:
            reset_to_pending(session, obj, f"Status changed from {old} to {new}: the false/rejected decision was "
                                           f"reversed, so visibility must be decided again.")


def scrub(text: Optional[str], names: Iterable[str], replacement: str = "a resident") -> Optional[str]:
    if not text:
        return text
    out = text
    for n in names:
        out = out.replace(n, replacement)
    return out


# ---- what each viewer gets (rules 3, 6, 7) ------------------------------------------------------------------------
_OWNER_PRIVATE = ("owner_phone", "owner_email", "owner_address")
# Kept for an owner who only has an AI-suggested match: enough to recognise the animal, nothing about people
_MATCH_CARD_FIELDS = (
    "report_id", "created_at", "category_id", "animal_type", "animal_breed", "animal_color", "estimated_size",
    "animal_count", "landmark", "ai_animal_type", "ai_dominant_color", "ai_coat_pattern", "ai_estimated_size",
    "ai_possible_breed", "status_id", "current_status_id", "subdivision_id", "subdivision_name", "barangay_name",
    "custody_status",
)


# Other residents get the AREA of a report or a sighting, never the pin: 3 decimals of a degree is ~110 m, enough to
# say "near the clubhouse", not which house. Staff, the reporter and the pet's owner keep the exact pin.
GENERALIZED_DECIMALS = 3


def generalize_coord(value, default=None):
    """A coordinate rounded to the area (~110 m). None stays None (or `default`)."""
    return round(float(value), GENERALIZED_DECIMALS) if value is not None else default


def _match_card(rep_data):
    """The minimum for an owner to say "that may be my pet": photos, looks, rough area and date (rule 6)."""
    from app.schemas.report import ReportResponse
    data = {k: getattr(rep_data, k, None) for k in _MATCH_CARD_FIELDS if hasattr(rep_data, k)}
    # ~100 m: the area, not the house
    data["latitude"] = generalize_coord(rep_data.latitude, 0.0)
    data["longitude"] = generalize_coord(rep_data.longitude, 0.0)
    data["media"] = [m for m in (rep_data.media or []) if not m.is_evidence and not m.history_id]
    data["visibility"] = None
    data["reporter_name"] = COMMUNITY_REPORTER
    data["history"], data["disputes"], data["merged_reports"] = [], [], []
    card = ReportResponse.model_validate(data)
    card.priority_level = rep_data.priority_level
    card.viewer_access = MATCH_OWNER
    return card


_LOST_PET_CONTACT = re.compile(r"Contact Person:\s*(.+?)\s*\(([^()\n]*)\)\s*$", re.M)
_NO_PHONE = "Available in StraySafe"


def published_lost_pet_contact(rep_data, report: Report) -> Optional[tuple]:
    """
    The contact an owner chose to publish on their OWN lost-pet report (the "Contact Person: name (phone)" line the
    lost-pet form writes into the description), while the pet is still Lost. Other residents may see just this name
    and phone, so a finder can call; everything else about the owner stays private (rule 6). Returns
    (name, phone or None), or None when it doesn't apply: a sighting linked to someone's pet, a found pet, no such line.
    """
    if not (rep_data.is_owner_report and report.pet_id and report.category_id == 6):
        return None
    desc = report.description or ""
    if not desc.startswith("[LOST PET REPORT]"):
        return None
    session = object_session(report)
    pet = session.get(Pet, report.pet_id) if session is not None else None
    if pet is None or (pet.status or "") != "Lost":
        return None
    m = _LOST_PET_CONTACT.search(desc)
    if not m or not m.group(1).strip():
        return None
    phone = m.group(2).strip()
    return m.group(1).strip(), (phone if phone and phone != _NO_PHONE else None)


def _observation_owner_names(report: Report, viewer_id: Optional[int]) -> list:
    """Names of owners observed on this case (other than the viewer), to take out of the timeline text."""
    from sqlalchemy.orm import object_session
    from app.models.owner_followup import OwnerFollowUp
    db = object_session(report)
    if db is None:
        return []
    root_id = report.duplicate_of_report_id or report.report_id
    rows = db.query(OwnerFollowUp.owner_name, OwnerFollowUp.owner_id).filter(
        OwnerFollowUp.report_id.in_({report.report_id, root_id})).all()
    return [name for name, oid in rows if name and len(name) >= 3 and (viewer_id is None or oid != viewer_id)]


def owner_notification_activity(db: Session, report_id: int) -> list:
    """Anonymous activity from persisted notifications to the matched pet's owner, never a suggestion alone."""
    rows = (db.query(ReportMatch.match_id, ReportMatch.owner_confirmation_status, Notification.created_at)
            .join(Pet, Pet.pet_id == ReportMatch.matched_pet_id)
            .join(Notification, and_(Notification.user_id == Pet.owner_id,
                                     Notification.related_id == ReportMatch.source_report_id,
                                     Notification.type == 'potential_match'))
            .filter(ReportMatch.source_report_id == report_id)
            .order_by(Notification.created_at, ReportMatch.match_id).all())
    seen, activity = set(), []
    responses = {'OWNER_CONFIRMED': 'confirmed', 'OWNER_REJECTED': 'declined', 'UNSURE': 'unsure'}
    for row in rows:
        if row.match_id in seen or not row.created_at:
            continue
        seen.add(row.match_id)
        activity.append({'notified_at': row.created_at, 'response': responses.get(row.owner_confirmation_status, 'pending')})
    return activity


def redact_response(rep_data, viewer: Optional[User], access: str, report: Report):
    """
    Fill the visibility fields and remove what this viewer may not see. Staff get everything. Other residents never
    get the reporter's identity (rule 3) or the registered owner's details (rule 6); a viewer who is the owner keeps
    their own. Returns the (possibly replaced) response.
    """
    from app.utils.case_state import case_status_of, closure_of
    rep_data.case_status = case_status_of(report)   # one of the four, even for a row written before the column existed
    closure = closure_of(report)
    rep_data.case_outcome = ({"label": closure["label"], "outcome": closure["outcome"], "closed_at": closure["closed_at"]}
                             if closure and closure.get("label") else None)
    rep_data.visibility_decided_by = report.visibility_decided_by
    decider = getattr(report, "visibility_decider", None)
    rep_data.visibility_decided_by_name = decider.name if decider is not None else None
    rep_data.visibility_decided_at = report.visibility_decided_at
    rep_data.visible_to_residents = is_publicly_visible(report)
    rep_data.viewer_access = access
    rep_data.can_view_owner_details = access == STAFF or bool(
        viewer and rep_data.owner_id and rep_data.owner_id == viewer.user_id)
    if access == STAFF:
        rep_data.visibility_reason = report.visibility_reason
        rep_data.visibility_needs_review = visibility_needs_review(report)
        rep_data.public_block_reason = public_block_reason(report)
        return rep_data
    if access == MATCH_OWNER:
        return _match_card(rep_data)

    uid = viewer.user_id if viewer is not None else None
    is_reporter = access == REPORTER
    is_owner = bool(rep_data.owner_id and rep_data.owner_id == uid)
    # Other people's names are taken out of the timeline text (never the viewer's own)
    # A leader or officer who filed the report themselves acts as an official on its timeline ("Report claimed",
    # "Incident verified"): their name stays on those entries. Only a resident reporter is anonymous (rule 3).
    reporter_is_official = bool(report.reporter and report.reporter.role_id in STAFF_ROLE_IDS)
    names = [n for n in (report.reporter.name if (report.reporter and not is_reporter and not reporter_is_official) else None,
                         rep_data.owner_name if not is_owner else None) if n and len(n) >= 3]
    # Phase 8: the observed owner's name (an owner without an account exists only on the follow-up) stays out too
    names += [n for n in _observation_owner_names(report, uid) if n not in names]
    reporter_full = report.reporter.name if report.reporter else None
    if not is_reporter:
        rep_data.user_id = None
        rep_data.reporter_name = COMMUNITY_REPORTER
        rep_data.reporter_photo = None
    if not is_owner:
        published = published_lost_pet_contact(rep_data, report)
        if not rep_data.is_owner_report:
            # A suggested/linked pet's identity is not an ownership confirmation for other residents.
            rep_data.pet_name = None
            rep_data.case_pet_name = None
        if rep_data.owner_name:
            rep_data.owner_name = REGISTERED_OWNER
        rep_data.owner_id = None
        for k in _OWNER_PRIVATE:
            setattr(rep_data, k, None)
        if published:
            # The owner's own lost-pet alert: the contact they typed for finders, nothing else
            rep_data.owner_name, rep_data.owner_phone = published
        rep_data.owner_return = None
        rep_data.identity_dispute = None
        rep_data.matched_pet_record = None
        rep_data.matched_report_record = None
        rep_data.issued_warnings = []
        rep_data.latest_warning = None
        rep_data.has_issued_warning = False
        # Claim / dispute evidence an owner uploaded is for officials, on the report and on its timeline entries
        rep_data.media = [m for m in (rep_data.media or []) if not m.is_evidence]
        for h in rep_data.history or []:
            h.media = [m for m in (getattr(h, "media", None) or []) if not getattr(m, "is_evidence", False)]
    # A resident sees only the disputes they filed (reasons and documents are private)
    rep_data.disputes = [d for d in (rep_data.disputes or []) if uid is not None and d.resident_user_id == uid]
    for d in rep_data.disputes:
        d.match_history = None
    rep_data.merged_by = None
    rep_data.merged_by_name = None
    rep_data.merge_notes = None
    rep_data.pending_transfer_notes = None
    rep_data.review_notes = None
    if access == PUBLIC_VIEW:
        # Other residents see only the main case, not the reports merged into it (rule 7)
        rep_data.merged_reports = []
        rep_data.verification_notes = None
        rep_data.false_alarm_reason = None
    else:
        rep_data.merged_reports = [
            {
                k: r.get(k)
                for k in (
                    "report_id",
                    "animal_type",
                    "animal_breed",
                    "animal_color",
                    "estimated_size",
                    "landmark",
                    "current_status_id",
                    "created_at",
                    "reporter_name",
                    "description",
                    "media",
                    "merged_at",
                    "merge_notes",
                )
            }
            for r in (rep_data.merged_reports or [])
            if isinstance(r, dict)
        ]
    from app.utils.push_categories import scrub_contact
    for h in rep_data.history or []:
        h.remarks = scrub(h.remarks, names)
        if h.remarks:
            h.remarks = scrub_contact(h.remarks)  # no phone numbers or emails on a resident's timeline
        if h.updater_name and h.updater_name in names:
            h.updater_name = COMMUNITY_REPORTER if h.updater_name == reporter_full else REGISTERED_OWNER
            h.updater_photo = None
    # Another resident gets the area, not the pin (the reporter, the pet's owner and staff keep the exact one)
    if access in (PUBLIC_VIEW, CASE_REPORTER):
        _generalize_location(rep_data)
    if access == PUBLIC_VIEW:
        # An allow-list, not a deny-list: only what is named below reaches a resident who is not involved in the
        # report. A field added to the report later stays private until it is added here on purpose.
        return _resident_safe(rep_data)
    return rep_data


# What a resident who is NOT the reporter, the pet's owner or a case reporter may see of a public report.
# Nothing about the reporter, the owner, the people handling it, the internal assessment, referrals, warnings,
# observations, follow-ups, claims or AI findings about risk. Photos and comments are filtered above.
RESIDENT_SAFE_FIELDS = (
    "report_id", "created_at", "category_id", "animal_type", "animal_breed", "animal_color", "estimated_size", "animal_count",
    "description", "condition", "custody_status", "landmark", "latitude", "longitude",
    # Where it was first seen (the pin is already rounded to the area by _generalize_location), whether the reporter
    # thinks it is owned, and how many animal records a group report was split into: none of these identify anyone
    "initial_latitude", "initial_longitude", "initial_landmark", "is_possible_owned", "split_children_count",
    "subdivision_id", "subdivision_name", "barangay_name", "municipality_city", "province",
    "current_status_id", "status_id", "case_status", "priority_level",
    # What the leader found on site (the leader chose to make the report public, findings included)
    "verification_status", "verified_actual_bite", "verified_chasing", "verified_attempted_bite", "verified_injury",
    "verified_aggressive", "behavior_finding",
    "ai_animal_type", "ai_dominant_color", "ai_estimated_size", "ai_possible_breed",
    # owner_name / owner_phone are already sanitized by the redaction above by the time they are read: the label
    # 'Registered Owner', or (only on an owner's own lost-pet report) the contact the owner chose to publish for finders.
    # owner_email, owner_address and owner_id stay out.
    "owner_name", "owner_phone",
    "media", "history", "reporter_name", "reunion_confirmed_by",
    # Anonymous activity only (when an owner was notified of a possible match, and how they answered): no names, no pet
    "owner_notification_events",
    "visibility", "visible_to_residents", "viewer_access", "can_view_owner_details",
)


def _generalize_location(rep_data) -> None:
    """Round every pin on the response to the area: the report's, its original pin and the timeline's."""
    for attr in ("latitude", "longitude", "initial_latitude", "initial_longitude"):
        value = getattr(rep_data, attr, None)
        if value is not None:
            setattr(rep_data, attr, generalize_coord(value))
    for h in rep_data.history or []:
        for attr in ("latitude", "longitude"):
            if getattr(h, attr, None) is not None:
                setattr(h, attr, generalize_coord(getattr(h, attr)))


def _resident_safe(rep_data):
    from app.schemas.report import ReportResponse
    kept = {name: getattr(rep_data, name) for name in RESIDENT_SAFE_FIELDS if hasattr(rep_data, name)}
    safe = ReportResponse.model_validate(kept)
    safe.can_view_owner_details = False
    return safe
