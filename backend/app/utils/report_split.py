"""
Multi-animal reports (MULTI_ANIMAL_REPORT_PLAN.md).

A resident may report several animals in one report. The report stays as the *group incident*; the Subdivision Leader
adds one *animal record* (a child report, `split_from_report_id` = the group) per animal, each with its own cropped
photo. Every animal record then goes through holding, AI matching, claims, returns and adoption exactly like a normal
one-animal report.

- A split is atomic (one transaction, the group row locked) and idempotent per `client_token`, so a double click or a
  retried request never creates duplicate animal records.
- Up to MAX_PER_SPLIT animals per request. More animals are added in further batches to the same group; the group report
  is never replaced or deleted.
- The group report steps aside once split: no AI matching, no merging, open AI suggestions are closed as superseded.
- Nothing is deleted: the group's photos stay as evidence; a replaced animal photo is kept on the timeline.
- The group report is resolved automatically when all its animal records are closed.
"""
from typing import Dict, List, Optional

from sqlalchemy import and_, exists, not_, or_
from sqlalchemy.orm import Session

from app.models.report import Report, ReportMedia, StatusHistory

MAX_PER_SPLIT = 10
MAX_ANIMALS_PER_GROUP = 50
SPLIT_ACTION = "REPORT_SPLIT"
UNSPLIT_ACTION = "REPORT_UNSPLIT"
PHOTO_REPLACED_ACTION = "ANIMAL_PHOTO_REPLACED"
UNSPLIT_STATUS_ID = 18          # "Merged — Duplicate": an undone animal record is folded back into its group
GROUP_RESOLVED_STATUS_ID = 11   # "Incident Resolved"
SUPERSEDED_NOTE = "Replaced by the per-animal records after the group report was split."


def _active_child_clause(parent_id_col):
    """An animal record that still counts (not folded back into its group by an undo)."""
    return and_(
        Report.split_from_report_id == parent_id_col,
        not_(and_(Report.current_status_id == UNSPLIT_STATUS_ID, Report.duplicate_of_report_id == parent_id_col)),
    )


def active_children(db: Session, parent: Report) -> List[Report]:
    return (db.query(Report).filter(_active_child_clause(parent.report_id))
            .order_by(Report.report_id).all())


def is_split_group(db: Session, report: Report) -> bool:
    return db.query(exists().where(_active_child_clause(report.report_id))).scalar()


def require_not_split_group(db: Session, report: Report) -> None:
    """A group report stands for several animals, so one pet record can't belong to it. Each animal record gets its own."""
    kids = active_children(db, report)
    if kids:
        from fastapi import HTTPException
        ids = ", ".join(f"#{k.report_id}" for k in kids)
        raise HTTPException(status_code=409, detail=(
            f"Report #{report.report_id} is a group of {len(kids)} animals, so it can't have one animal record. "
            f"Add the record from each animal's own record ({ids})."))


def split_group_ids(db: Session, report_ids: Optional[List[int]] = None) -> set:
    """Group reports (with active animal records) among `report_ids`, or all of them."""
    q = db.query(Report.split_from_report_id).filter(
        Report.split_from_report_id.isnot(None),
        not_(and_(Report.current_status_id == UNSPLIT_STATUS_ID,
                  Report.duplicate_of_report_id == Report.split_from_report_id)),
    )
    if report_ids is not None:
        if not report_ids:
            return set()
        q = q.filter(Report.split_from_report_id.in_(report_ids))
    return {rid for (rid,) in q.distinct().all()}


def child_counts(db: Session, report_ids: List[int]) -> Dict[int, int]:
    from sqlalchemy import func
    if not report_ids:
        return {}
    rows = db.query(Report.split_from_report_id, func.count(Report.report_id)).filter(
        Report.split_from_report_id.in_(report_ids),
        not_(and_(Report.current_status_id == UNSPLIT_STATUS_ID,
                  Report.duplicate_of_report_id == Report.split_from_report_id)),
    ).group_by(Report.split_from_report_id).all()
    return {pid: n for pid, n in rows}


def not_split_group_filter():
    """SQL filter: the report is not a group report with active animal records (for matching candidates)."""
    child = Report.__table__.alias("split_child")
    return ~exists().where(and_(
        child.c.split_from_report_id == Report.report_id,
        not_(and_(child.c.current_status_id == UNSPLIT_STATUS_ID,
                  child.c.duplicate_of_report_id == Report.report_id)),
    ))


def same_split_family(a: Optional[Report], b: Optional[Report]) -> bool:
    """A group report and its animal records (or two animal records of one group): split apart on purpose by the
    Subdivision Leader, so they are never suggested as duplicates of each other. A cropped photo scores ~100%."""
    if a is None or b is None or not (a.split_from_report_id or b.split_from_report_id):
        return False
    return (a.split_from_report_id or a.report_id) == (b.split_from_report_id or b.report_id)


def not_same_family_filter(report: Report):
    """SQL filter for matching candidates: leave out `report`'s own group, its sibling animal records, and its children."""
    family = report.split_from_report_id
    if family:
        return and_(Report.report_id != family,
                    or_(Report.split_from_report_id.is_(None), Report.split_from_report_id != family))
    return or_(Report.split_from_report_id.is_(None), Report.split_from_report_id != report.report_id)


def held_scan_allowed(db: Session, report: Report) -> bool:
    """A held animal may still be matched when it is an animal record from a split group or its photo was replaced."""
    if report.split_from_report_id:
        return True
    from app.models.audit_log import AuditLog
    return db.query(AuditLog.log_id).filter(AuditLog.action == PHOTO_REPLACED_ACTION,
                                             AuditLog.target_table == "reports",
                                             AuditLog.target_id == report.report_id).first() is not None


def primary_images(report: Report) -> List[ReportMedia]:
    """The report's main photos: submission images, not attached to a timeline step or care log, not evidence."""
    out = []
    for m in (report.media or []):
        url = (m.file_url or "").lower()
        if m.history_id or m.holding_log_id or m.is_evidence:
            continue
        if (m.media_type or "Image") != "Image" or url.endswith((".mp4", ".mov", ".webm", ".avi", ".pdf")):
            continue
        out.append(m)
    return out


def animal_label(db: Session, child: Report) -> Optional[str]:
    """'Animal 2 of 3 from Report #45' for an animal record; None for any other report."""
    if not child.split_from_report_id:
        return None
    parent = db.get(Report, child.split_from_report_id)
    if parent is None:
        return None
    ids = [r.report_id for r in active_children(db, parent)]
    if child.report_id not in ids:
        return f"Animal record from Report #{parent.report_id} (undone)"
    return f"Animal {ids.index(child.report_id) + 1} of {len(ids)} from Report #{parent.report_id}"


# --- group auto-resolve ----------------------------------------------------------------------------------------
from sqlalchemy import event as _sa_event, inspect as _sa_inspect  # noqa: E402


IMPOUNDED_STATUS_ID = 8


def group_ending_ids() -> tuple:
    """Endings that close an animal record for its group: the case's final outcomes plus Impounded. (Elsewhere Impounded
    isn't final, since an owner can still claim the pet; for the group, the incident is over once the animal is
    impounded. If the owner claims it later, the group's timeline still records that.)"""
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS
    return tuple(CASE_CLOSED_STATUS_IDS) + (IMPOUNDED_STATUS_ID,)


@_sa_event.listens_for(Session, "before_flush")
def _group_closes_only_when_its_animals_are_closed(session: Session, flush_context, instances) -> None:
    """A group report can't be closed by hand (resolved, dismissed, not found ...) while one of its animal records is
    still open: each animal's case is closed on its own record, and the group then closes itself (SYSTEM_AUDIT.md 4.4).
    Covers every route at once (status update, false alarm, cancel, disputes, rescue). Impounded (8) isn't a closing
    for the group itself: that's the Barangay taking all its animals into the impound together."""
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS
    closing = CASE_CLOSED_STATUS_IDS
    endings = group_ending_ids()   # an animal record impounded on its own counts as finished
    for obj in list(session.dirty):
        if not isinstance(obj, Report) or obj.split_from_report_id:
            continue
        hist = _sa_inspect(obj).attrs.current_status_id.history
        if not hist.has_changes() or obj.current_status_id not in closing:
            continue
        before = hist.deleted[0] if hist.deleted else None
        if before in closing:
            continue   # already closed (e.g. resolved -> claimed wording), nothing new
        with session.no_autoflush:
            still_open = [c for c in active_children(session, obj) if c.current_status_id not in endings]
        if still_open:
            from fastapi import HTTPException
            ids = ", ".join(f"#{c.report_id}" for c in still_open)
            raise HTTPException(status_code=409, detail=(
                f"Report #{obj.report_id} is a group report and {len(still_open)} of its animal record"
                f"{'s are' if len(still_open) != 1 else ' is'} still open ({ids}). Close each animal on its own record; "
                f"the group report closes by itself when the last one is closed."))


@_sa_event.listens_for(Session, "before_flush")
def _resolve_group_when_all_animals_closed(session: Session, flush_context, instances) -> None:
    endings = group_ending_ids()   # Impounded also ends an animal record for its group
    for obj in list(session.dirty):
        if not isinstance(obj, Report) or not obj.split_from_report_id:
            continue
        hist = _sa_inspect(obj).attrs.current_status_id.history
        if not hist.has_changes() or obj.current_status_id not in endings:
            continue
        if obj.current_status_id == UNSPLIT_STATUS_ID and obj.duplicate_of_report_id == obj.split_from_report_id:
            continue  # an undo, not a closed animal record
        with session.no_autoflush:
            parent = session.get(Report, obj.split_from_report_id)
            if parent is None:
                continue
            # The group's own timeline tells how each animal's case ended
            from app.models.report import ReportStatus
            kids = active_children(session, parent)
            pos = next((i + 1 for i, c in enumerate(kids) if c.report_id == obj.report_id), None)
            status_row = session.get(ReportStatus, obj.current_status_id)
            kind = f" ({obj.animal_type})" if obj.animal_type and obj.animal_type != "Unknown" else ""
            session.add(StatusHistory(
                report_id=parent.report_id, report_status_id=parent.current_status_id,
                remarks=(f"Animal {pos or '?'}{kind} from this report (record #{obj.report_id}): "
                         f"{status_row.status_name if status_row else 'case closed'}."),
            ))
            if parent.current_status_id in endings:
                continue
            siblings = [c for c in kids if c.report_id != obj.report_id]
            if all(c.current_status_id in endings for c in siblings):
                parent.current_status_id = GROUP_RESOLVED_STATUS_ID
                session.add(StatusHistory(
                    report_id=parent.report_id, report_status_id=GROUP_RESOLVED_STATUS_ID,
                    remarks=f"All {len(siblings) + 1} animal records from this report are closed, so the group report is resolved.",
                ))


# --- the animal records follow the group until they are taken into holding -------------------------------------
# While the animals are still out there (sighted, verified, escalated, rescue on the way, picked up), the rescue is run
# on the group report. Each animal record follows the group's status, custody and facility until it has its own
# holding record. Closing statuses (claimed, released, false alarm ...) are never copied: one dog going home must not
# close the others.
SYNC_STATUS_IDS = (2, 4, 5, 6, 7, 8, 13, 16)   # Verified, Escalated, Rescue In Progress, Picked Up,
                                               # Under Observation, Impounded, Approved, Under Investigation
_STATUS_NAMES = {2: "Verified", 4: "Escalated to Barangay", 5: "Rescue In Progress", 6: "Picked Up",
                 7: "Under Observation", 8: "Impounded", 13: "Approved", 16: "Under Investigation"}


def _persisted_holding_ids(session: Session, report_ids: List[int]) -> set:
    """Animal records that already HAVE a holding record (one being created right now still follows the group)."""
    from app.models.report import HoldingAnimal
    if not report_ids:
        return set()
    return {rid for (rid,) in session.query(HoldingAnimal.report_id).filter(HoldingAnimal.report_id.in_(report_ids)).all()}


@_sa_event.listens_for(Session, "before_flush")
def _animal_records_follow_group(session: Session, flush_context, instances) -> None:
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS
    for obj in list(session.dirty):
        if not isinstance(obj, Report) or obj.split_from_report_id:
            continue
        state = _sa_inspect(obj).attrs
        status_moved = state.current_status_id.history.has_changes() and obj.current_status_id in SYNC_STATUS_IDS
        place_moved = (state.custody_status.history.has_changes() or state.facility_id.history.has_changes()) \
            and obj.current_status_id in SYNC_STATUS_IDS
        if not (status_moved or place_moved):
            continue
        with session.no_autoflush:
            children = active_children(session, obj)
            if not children:
                continue
            held = _persisted_holding_ids(session, [c.report_id for c in children])
            for c in children:
                if c.report_id in held or c.current_status_id in CASE_CLOSED_STATUS_IDS:
                    continue   # has its own holding record now, or its case is over: it goes its own way
                if not status_moved and c.current_status_id != obj.current_status_id:
                    continue   # a custody / facility change only reaches records that still follow the group
                changed = c.current_status_id != obj.current_status_id
                c.current_status_id = obj.current_status_id
                c.custody_status = obj.custody_status
                c.facility_id = obj.facility_id
                if changed:
                    session.add(StatusHistory(
                        report_id=c.report_id, report_status_id=obj.current_status_id, facility_id=obj.facility_id,
                        remarks=(f"Status follows group Report #{obj.report_id}: "
                                 f"{_STATUS_NAMES.get(obj.current_status_id, 'updated')}."),
                    ))


def intake_group_animals(db: Session, group: Report, intake_staff_id: Optional[int], rescue_id: Optional[int],
                         extra_condition: str = "") -> List[int]:
    """
    The group report reached the holding facility: give each animal record (still following the group, not closed)
    its own holding record and intake log, instead of one holding record for the whole group. Returns the holding ids.
    """
    from app.models.landmark import Landmark
    from app.models.report import HoldingAnimal, HoldingTimeline
    from app.utils.case_groups import CASE_CLOSED_STATUS_IDS
    children = active_children(db, group)
    held = _persisted_holding_ids(db, [c.report_id for c in children])
    loc_name = None
    if group.facility_id:
        fac = db.get(Landmark, group.facility_id)
        loc_name = fac.name if fac else None
    loc_name = loc_name or group.landmark or "Holding Place"
    created = []
    for pos, c in enumerate(children, 1):
        if c.report_id in held or c.current_status_id in CASE_CLOSED_STATUS_IDS:
            continue
        text = f"{c.condition or ''} {extra_condition or ''} {c.description or ''}".lower()
        if "deceased" in text or "dead" in text:
            fac_status = 4
        elif any(k in text for k in ("injured", "bleeding", "limping", "weak", "sick", "treatment", "wound", "trapped",
                                      "fracture", "broken", "infection", "rabid")):
            fac_status = 1
        else:
            fac_status = 2
        h = HoldingAnimal(report_id=c.report_id, rescue_id=rescue_id,
                          animal_type=c.animal_type if c.animal_type in ("Dog", "Cat") else "Unknown",
                          breed=c.animal_breed, color=c.animal_color, estimated_size=c.estimated_size,
                          facility_status=fac_status, intake_staff_id=intake_staff_id)
        db.add(h)
        db.flush()
        db.add(HoldingTimeline(
            holding_id=h.holding_id, event_type="intake",
            title=f"Animal Admitted to Holding Place ({loc_name})",
            notes=f"Admitted into custody at {loc_name}. Animal {pos} of {len(children)} from group Report #{group.report_id} (record #{c.report_id}).",
            logged_by=intake_staff_id,
        ))
        created.append(h.holding_id)
    return created


# --- who can see the animal records follows the group ---------------------------------------------------------------
# The leader decides Public / Private on the group report (the incident). The decision (visibility, who decided, when,
# why) is copied to every animal record, so the incident and its animals are never shown differently. Verification
# that makes a report count as checked ("verified_true") is copied too, because Public depends on it; a false-alarm
# verdict is never copied.
VISIBILITY_FIELDS = ("visibility", "visibility_decided_by", "visibility_decided_at", "visibility_reason")
VERIFIED_FIELDS = ("verification_status", "verified_by_user_id", "verified_at")


@_sa_event.listens_for(Session, "before_flush")
def _animal_records_share_group_visibility(session: Session, flush_context, instances) -> None:
    for obj in list(session.dirty):
        if not isinstance(obj, Report) or obj.split_from_report_id:
            continue
        state = _sa_inspect(obj).attrs
        vis_moved = any(getattr(state, f).history.has_changes() for f in VISIBILITY_FIELDS)
        verified_now = state.verification_status.history.has_changes() and obj.verification_status == "verified_true"
        if not (vis_moved or verified_now):
            continue
        with session.no_autoflush:
            for c in active_children(session, obj):
                if vis_moved:
                    for f in VISIBILITY_FIELDS:
                        setattr(c, f, getattr(obj, f))
                if verified_now and c.verification_status != "false_alarm":
                    for f in VERIFIED_FIELDS:
                        setattr(c, f, getattr(obj, f))


# --- the reporter hears about the group's animals in ONE notification ------------------------------------------------
# After a split, staff act on each animal record separately (intake outcome, released, claimed, verified ...). Instead
# of one notification per animal, the reporter gets one per group: it is updated in place while still unread (latest
# status of every animal) and opens the group report. Once read, the next update starts a new one. Updating does not
# send another push (push goes out for new notifications only).
GROUP_NOTE_PREFIX = "🐾 Update on the animals from your Report #"


def notify_reporter_for_animal(db: Session, report: Report, what: str) -> bool:
    """`report` is an animal record: create or update the group's one notification. False if it isn't one."""
    from sqlalchemy import func
    from app.models.notification import Notification
    from app.models.report import ReportStatus
    if not report.split_from_report_id or not report.user_id:
        return False
    group = db.get(Report, report.split_from_report_id)
    if group is None:
        return False
    with db.no_autoflush:
        children = active_children(db, group)
        names = {sid: name for sid, name in db.query(ReportStatus.status_id, ReportStatus.status_name).all()}
        existing = (db.query(Notification)
                    .filter(Notification.user_id == report.user_id, Notification.related_id == group.report_id,
                            Notification.title == f"{GROUP_NOTE_PREFIX}{group.report_id}",
                            Notification.is_read.is_(False))
                    .order_by(Notification.notification_id.desc()).first())
    ids = [c.report_id for c in children]
    pos = ids.index(report.report_id) + 1 if report.report_id in ids else None
    who = f"Animal {pos}" + (f" ({report.animal_type})" if report.animal_type and report.animal_type != "Unknown" else "") if pos else "An animal"
    summary = "; ".join(f"Animal {i + 1}: {names.get(c.current_status_id, 'Reported')}" for i, c in enumerate(children))
    message = f"{who} {what} {summary}."[:1000]
    if existing is not None:
        existing.message = message
        existing.created_at = func.now()      # moves it back to the top of the list
    else:
        db.add(Notification(user_id=report.user_id, title=f"{GROUP_NOTE_PREFIX}{group.report_id}", message=message,
                            type="status_update", related_id=group.report_id, is_read=False))
    return True


# --- priority is the incident's: animal records show the group's priority ----------------------------------------
# Pages show the "effective" priority (the AI's suggested priority, then its risk level, then the stored value). Each
# animal record gets the group's effective priority as its suggested priority, and follows it when it changes. An
# animal record's own AI analysis no longer overwrites it (utils/ai_pipeline.py); its risk and behaviour stay its own.
PRIORITY_FIELDS = ("ai_suggested_priority", "ai_suggested_risk_level", "priority_level")


def give_group_priority(group: Report, child: Report) -> None:
    from app.schemas.report import effective_priority
    eff = effective_priority(group.ai_suggested_priority, group.ai_suggested_risk_level, group.priority_level)
    child.priority_level = eff
    child.ai_suggested_priority = f"{eff} Priority"
    child.ai_suggested_priority_reason = f"Same priority as the incident (group Report #{group.report_id})."


@_sa_event.listens_for(Session, "before_flush")
def _animal_records_share_group_priority(session: Session, flush_context, instances) -> None:
    for obj in list(session.dirty):
        if not isinstance(obj, Report) or obj.split_from_report_id:
            continue
        state = _sa_inspect(obj).attrs
        if not any(getattr(state, f).history.has_changes() for f in PRIORITY_FIELDS):
            continue
        with session.no_autoflush:
            for c in active_children(session, obj):
                give_group_priority(obj, c)
