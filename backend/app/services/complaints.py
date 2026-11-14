"""
Complaint management and progressive enforcement: what the Subdivision Leader records, and what the Complaints workspace reads
(routes/complaints.py, rules in utils/complaint_rules.py, docs/01-system/COMPLAINT_MANAGEMENT.md).

Every write is the Leader's (role 2) on a complaint of their own subdivision that they handle. The complainant's timeline (the
case's status history, which the reporter can read) gets only neutral lines: "Complaint verified", "Action is being taken under the
subdivision's rules". Letters, the summons, the fine and the meeting are recorded for staff only (audit log and the step events).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.barangay_referral import BarangayReferral
from app.models.case_records import CaseLink
from app.models.complaint import ComplaintFinding, ComplaintOffense, ComplaintRespondent, EnforcementStep, EnforcementStepEvent
from app.models.pet import Pet
from app.models.report import Report, ReportCategory
from app.models.user import Subdivision, User
from app.schemas.case import LinkIn, PolicyIn, ReferralIn
from app.schemas.complaint import OffenseIn, ResponsibleIn, SameOccurrenceIn, StepActionIn, VerifyIn
from app.services import case_lifecycle as L
from app.services import case_work as W
from app.utils import case_policy, case_state
from app.utils import case_vocab as V
from app.utils import complaint_rules as R


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


# ------------------------------------------------------------------------------------------------------- access
def complaint_for(db: Session, report_id: int, user: User, write: bool = False) -> Report:
    """An animal complaint this staff member may see; for a write, the Subdivision Leader handling it."""
    if write and user.role_id != 2:
        raise HTTPException(status_code=403, detail="Only the Subdivision Leader records complaint findings and enforcement.")
    report = L.case_for_staff(db, report_id, user, write=write)
    R.require_complaint(report)
    return report


def _nuisance_category_ids(db: Session) -> List[int]:
    return [c.category_id for c in db.query(ReportCategory).all() if V.category_family(c.category_name) == V.NUISANCE]


def _scope_subdivision(user: User, subdivision_id: Optional[int]) -> Optional[int]:
    """A Leader works in their own subdivision; the Administrator may name one (or see all)."""
    if user.role_id == 2:
        if not user.subdivision_id:
            raise HTTPException(status_code=403, detail="Your account is not linked to a subdivision.")
        return user.subdivision_id
    if user.role_id == 4:
        return subdivision_id
    raise HTTPException(status_code=403, detail="Only the Subdivision Leader or the Administrator can open complaint management.")


def _complaints_in(db: Session, subdivision_id: Optional[int]) -> List[Report]:
    q = db.query(Report).filter(Report.category_id.in_(_nuisance_category_ids(db) or [-1]),
                                Report.duplicate_of_report_id.is_(None), Report.current_status_id != V.MERGED_LEGACY_ID)
    if subdivision_id is not None:
        q = q.filter(Report.subdivision_id == subdivision_id)
    return q.order_by(Report.created_at.desc()).limit(2000).all()


# ------------------------------------------------------------------------------------------------- small reads
def _names(db: Session, ids) -> Dict[int, str]:
    ids = {i for i in ids if i}
    return {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(ids)).all()} if ids else {}


def _respondents(db: Session, ids) -> Dict[int, Dict[str, Any]]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = db.query(ComplaintRespondent).filter(ComplaintRespondent.respondent_id.in_(ids)).all()
    users = {u.user_id: u for u in db.query(User).filter(User.user_id.in_({r.user_id for r in rows if r.user_id})).all()} if rows else {}
    return {r.respondent_id: R.respondent_view(r, users.get(r.user_id)) for r in rows}


def _policy(db: Session, subdivision_id: int, policy_id: Optional[str]) -> Optional[PolicyIn]:
    if not policy_id:
        return None
    return next((p for p in case_policy.load_settings(db, subdivision_id).policies if p.id == policy_id), None)


def _confirmed_rule(db: Session, subdivision_id: int, policy_id: str) -> PolicyIn:
    settings = case_policy.load_settings(db, subdivision_id)
    rule = next((p for p in case_policy.applicable_policies(settings, V.NUISANCE) if p.id == policy_id), None)
    if rule is None:
        raise HTTPException(status_code=409, detail="Choose a confirmed rule that covers animal complaints (Settings, Policies).")
    return rule


def _links(db: Session, report_id: int) -> List[CaseLink]:
    return db.query(CaseLink).filter(((CaseLink.report_id == report_id) | (CaseLink.related_report_id == report_id)),
                                     CaseLink.unlinked_at.is_(None)).all()


def _other(link: CaseLink, report_id: int) -> int:
    return link.related_report_id if link.report_id == report_id else link.report_id


def _same_occurrence(db: Session, report: Report, reports_by_id: Optional[Dict[int, Report]] = None) -> Dict[str, Any]:
    """Which complaint this one was linked to as the same occurrence (it was closed as a duplicate), and which were linked to it."""
    same_as, also = None, []
    for link in _links(db, report.report_id):
        if link.link_type != "same_incident":
            continue
        other_id = _other(link, report.report_id)
        other = (reports_by_id or {}).get(other_id) or db.get(Report, other_id)
        if report.closure_disposition == "duplicate_report":
            same_as = {"report_id": other_id, "linked_at": link.linked_at, "note": link.note}
        elif other is not None and other.closure_disposition == "duplicate_report":
            also.append({"report_id": other_id, "linked_at": link.linked_at})
    return {"same_as": same_as, "also_reported": also}


def _candidate(db: Session, report: Report, finding: Optional[ComplaintFinding], pool: Optional[Sequence[Report]] = None) -> Optional[Report]:
    """An earlier complaint that may be the same occurrence, while this one is open and nothing has been decided on it."""
    if case_state.is_closed(report) or R.active_offense(db, report.report_id) is not None:
        return None
    if pool is None:
        pool = _complaints_in(db, report.subdivision_id)
    linked = [_other(link, report.report_id) for link in _links(db, report.report_id)]
    return R.same_occurrence_candidate(report, pool, linked, finding.separate_from_report_id if finding else None)


def _event_view(e: EnforcementStepEvent, names: Dict[int, str]) -> Dict[str, Any]:
    return {"event_id": e.event_id, "kind": e.kind, "occurred_at": e.occurred_at, "details": e.details or {},
            "recorded_by": names.get(e.recorded_by) if e.recorded_by else None, "recorded_at": e.recorded_at}


def _steps_view(db: Session, offense_id: int, with_events: bool = True) -> List[Dict[str, Any]]:
    steps = R.step_rows(db, offense_id)
    events: Dict[int, List[EnforcementStepEvent]] = {}
    if with_events and steps:
        for e in (db.query(EnforcementStepEvent).filter(EnforcementStepEvent.step_id.in_([s.step_id for s in steps]))
                  .order_by(EnforcementStepEvent.event_id).all()):
            events.setdefault(e.step_id, []).append(e)
    names = _names(db, [e.recorded_by for es in events.values() for e in es])
    return [{"step_id": s.step_id, "kind": s.kind, "label": R.STEP_LABELS.get(s.kind, s.kind), "state": s.state, "due_at": s.due_at,
             "details": s.details or {}, "referral_id": s.referral_id,
             "events": [_event_view(e, names) for e in events.get(s.step_id, [])] if with_events else []} for s in steps]


def _offense_view(o: ComplaintOffense, names: Dict[int, str]) -> Dict[str, Any]:
    return {"offense_id": o.offense_id, "report_id": o.report_id, "respondent_id": o.respondent_id, "policy_id": o.policy_id,
            "policy_title": o.policy_title, "policy_reference": o.policy_reference, "counted": bool(o.counted), "number": o.offense_number,
            "incident_at": o.incident_at, "note": o.note, "confirmed_at": o.confirmed_at, "confirmed_by": names.get(o.confirmed_by),
            "voided_at": o.voided_at, "voided_by": names.get(o.voided_by) if o.voided_by else None, "void_reason": o.void_reason}


def _rule_view(f: Optional[ComplaintFinding], db: Session, subdivision_id: int) -> Optional[Dict[str, Any]]:
    if f is None or not f.policy_id:
        return None
    current = _policy(db, subdivision_id, f.policy_id)
    return {"policy_id": f.policy_id, "title": f.policy_title, "reference": f.policy_reference, "summary": current.summary if current else None,
            "confirmed": bool(current and current.status == "confirmed"), "fine_amount": current.fine_amount if current else None,
            "count_window_days": current.count_window_days if current else None}


def _suspect(report: Report) -> Optional[Dict[str, Optional[str]]]:
    s = {"name": report.suspected_owner_name, "address": report.suspected_owner_address, "details": report.suspected_owner_details}
    return s if any(s.values()) else None


# --------------------------------------------------------------------------------------------- one person's history
def history_for(db: Session, respondent_id: int, policy_id: str, current: Optional[Report] = None) -> Dict[str, Any]:
    """
    One person's history under one rule: the counted offenses in the order they happened, the complaints waiting for the Leader's
    decision, and what does NOT count here and why (a different rule, the same occurrence reported twice, a correction, a decision
    not to count it, outside the rule's counting window).
    """
    offenses = db.query(ComplaintOffense).filter(ComplaintOffense.respondent_id == respondent_id).order_by(ComplaintOffense.incident_at).all()
    names = _names(db, [o.confirmed_by for o in offenses] + [o.voided_by for o in offenses])
    sub = current.subdivision_id if current is not None else (offenses[0].subdivision_id if offenses else None)
    rule = _policy(db, sub, policy_id) if sub else None
    window = rule.count_window_days if rule else None
    counted, not_counted = [], []
    for o in offenses:
        if o.policy_id == policy_id and o.counted and o.voided_at is None:
            counted.append({**_offense_view(o, names), "steps": [{"kind": s["kind"], "label": s["label"], "state": s["state"]}
                                                                  for s in _steps_view(db, o.offense_id, with_events=False)]})
        elif o.voided_at is not None and o.policy_id == policy_id:
            person = _respondents(db, [respondent_id]).get(respondent_id, {}).get("name", "this person")
            not_counted.append({"report_id": o.report_id, "why": f"Corrected: it was not {person} after all. {o.void_reason or ''}".strip(),
                                "kind": "corrected", "at": o.voided_at})
        elif o.voided_at is None and o.policy_id == policy_id and not o.counted:
            not_counted.append({"report_id": o.report_id, "why": f"Not counted: {o.note or ''}".strip(), "kind": "not_counted", "at": o.confirmed_at})
        elif o.voided_at is None and o.counted and o.policy_id != policy_id:
            not_counted.append({"report_id": o.report_id, "why": f"{o.policy_title}: a different rule, counted on its own ({_ordinal(o.offense_number or 1)} offense)",
                                "kind": "other_rule", "at": o.incident_at})
    # A second report of a counted occurrence
    for c in list(counted):
        for link in _links(db, c["report_id"]):
            if link.link_type != "same_incident":
                continue
            other = db.get(Report, _other(link, c["report_id"]))
            if other is not None and other.closure_disposition == "duplicate_report":
                not_counted.append({"report_id": other.report_id, "why": f"Same occurrence as #{c['report_id']}", "kind": "same_occurrence",
                                    "at": link.linked_at})
    # Outside the counting window of the complaint being looked at
    if current is not None and window:
        when = R.incident_at(current)
        for c in counted:
            if c["report_id"] != current.report_id and c["incident_at"] < when and (when - c["incident_at"]).days > window:
                not_counted.append({"report_id": c["report_id"], "kind": "outside_window", "at": c["incident_at"],
                                    "why": f"More than {window} days before this complaint: no longer counts towards it"})
    # Complaints about this person under this rule, waiting for the Leader's decision
    pending = []
    for f in db.query(ComplaintFinding).filter(ComplaintFinding.respondent_id == respondent_id, ComplaintFinding.policy_id == policy_id).all():
        rep = db.get(Report, f.report_id)
        if rep is None or case_state.is_closed(rep) or not case_state.incident_is_verified(rep) or R.active_offense(db, rep.report_id):
            continue
        pending.append({"report_id": rep.report_id, "incident_at": R.incident_at(rep), "suggestion": R.suggest_number(db, rep, respondent_id, policy_id, window)})
    return {"respondent": _respondents(db, [respondent_id]).get(respondent_id), "policy_id": policy_id,
            "policy_title": (rule.title if rule else (counted[0]["policy_title"] if counted else None)),
            "count_window_days": window, "counted": counted, "pending": pending, "not_counted": not_counted}


# ----------------------------------------------------------------------------------------------- one complaint
def detail(db: Session, report: Report) -> Dict[str, Any]:
    f = R.finding_of(db, report)
    offenses = db.query(ComplaintOffense).filter(ComplaintOffense.report_id == report.report_id).order_by(ComplaintOffense.offense_id).all()
    names = _names(db, [o.confirmed_by for o in offenses] + [o.voided_by for o in offenses]
                   + ([f.respondent_by, f.check_by, f.separate_by] if f else []) + [report.assessed_by])
    active = next((o for o in reversed(offenses) if o.voided_at is None), None)
    respondents = _respondents(db, [o.respondent_id for o in offenses] + ([f.respondent_id] if f else []))
    rule = _rule_view(f, db, report.subdivision_id)
    suggestion = None
    if (f and f.respondent_id and f.policy_id and active is None and case_state.incident_is_verified(report)):
        suggestion = R.suggest_number(db, report, f.respondent_id, f.policy_id, rule["count_window_days"] if rule else None)
    candidate = _candidate(db, report, f)
    subdivision = db.get(Subdivision, report.subdivision_id)
    return {
        "report_id": report.report_id,
        "seen_at": report.seen_at, "incident_at": R.incident_at(report),
        "suspect": _suspect(report),
        "incident": {"status": case_state.incident_of(report), "basis": report.incident_basis, "at": report.assessed_at,
                     "by": names.get(report.assessed_by) if report.assessed_by else None},
        "rule": rule, "no_rule": bool(f and f.no_rule),
        "respondent": ({**respondents.get(f.respondent_id, {}), "evidence": f.respondent_evidence or [], "note": f.respondent_note,
                        "at": f.respondent_at, "by": names.get(f.respondent_by)} if f and f.respondent_id else None),
        "check": ({"note": f.check_note, "at": f.check_at, "by": names.get(f.check_by)} if f and f.check_note else None),
        "ruled_out": (f.ruled_out or []) if f else [],
        "offense": _offense_view(active, names) if active else None,
        "steps": _steps_view(db, active.offense_id) if active is not None and active.counted else [],
        "corrections": [{**_offense_view(o, names), "respondent": respondents.get(o.respondent_id),
                         "steps": _steps_view(db, o.offense_id, with_events=False)} for o in offenses if o.voided_at is not None],
        "suggestion": suggestion,
        "stage_steps": [{"kind": k, "label": R.STEP_LABELS[k]} for k in R.steps_for(suggestion or (active.offense_number if active and active.counted else 0) or 0)],
        "history": (history_for(db, f.respondent_id, f.policy_id, report) if f and f.respondent_id and f.policy_id else None),
        "maybe_same": ({"report_id": candidate.report_id, "created_at": candidate.created_at, "seen_at": candidate.seen_at,
                        "incident_at": R.incident_at(candidate), "landmark": candidate.landmark, "description": candidate.description,
                        "reporter": candidate.reporter.name if candidate.reporter else None} if candidate else None),
        **_same_occurrence(db, report),
        "separate_from": ({"report_id": f.separate_from_report_id, "at": f.separate_at, "by": names.get(f.separate_by)}
                          if f and f.separate_from_report_id else None),
        "subdivision_name": subdivision.subdivision_name if subdivision else None,
    }


# ----------------------------------------------------------------------------------------------- the workspace
def workspace(db: Session, user: User, subdivision_id: Optional[int]) -> Dict[str, Any]:
    """Every complaint's findings, decision and steps (the screens join them with the case list), and the people responsible."""
    scope = _scope_subdivision(user, subdivision_id)
    reports = _complaints_in(db, scope)
    ids = [r.report_id for r in reports]
    findings = {f.report_id: f for f in db.query(ComplaintFinding).filter(ComplaintFinding.report_id.in_(ids or [-1])).all()}
    offenses = db.query(ComplaintOffense).filter(ComplaintOffense.report_id.in_(ids or [-1])).all()
    active = {o.report_id: o for o in sorted(offenses, key=lambda o: o.offense_id) if o.voided_at is None}
    steps: Dict[int, List[EnforcementStep]] = {}
    for s in db.query(EnforcementStep).filter(EnforcementStep.offense_id.in_([o.offense_id for o in active.values()] or [-1])).all():
        steps.setdefault(s.offense_id, []).append(s)
    respondents = _respondents(db, [f.respondent_id for f in findings.values()] + [o.respondent_id for o in offenses])
    rules = {p.id: p for p in case_policy.load_settings(db, scope).policies} if scope else {}
    by_id = {r.report_id: r for r in reports}
    rows = []
    for rep in reports:
        f = findings.get(rep.report_id)
        o = active.get(rep.report_id)
        suggestion = None
        if f and f.respondent_id and f.policy_id and o is None and case_state.incident_is_verified(rep) and not case_state.is_closed(rep):
            rule = rules.get(f.policy_id) or _policy(db, rep.subdivision_id, f.policy_id)
            suggestion = R.suggest_number(db, rep, f.respondent_id, f.policy_id, rule.count_window_days if rule else None)
        candidate = None
        if not case_state.is_closed(rep) and o is None:
            linked = [_other(link, rep.report_id) for link in _links(db, rep.report_id)]
            candidate = R.same_occurrence_candidate(rep, reports, linked, f.separate_from_report_id if f else None)
        same = _same_occurrence(db, rep, by_id)
        order = {k: i for i, k in enumerate(R.STEP_KINDS)}
        rows.append({
            "report_id": rep.report_id, "incident": case_state.incident_of(rep), "incident_at": R.incident_at(rep),
            "rule": ({"policy_id": f.policy_id, "title": f.policy_title} if f and f.policy_id else None), "no_rule": bool(f and f.no_rule),
            "respondent": respondents.get(f.respondent_id) if f and f.respondent_id else None,
            "suspect": _suspect(rep), "checking": bool(f and f.check_note and not f.respondent_id),
            "offense": ({"counted": bool(o.counted), "number": o.offense_number, "confirmed_at": o.confirmed_at} if o else None),
            "suggestion": suggestion,
            "steps": [{"step_id": s.step_id, "kind": s.kind, "state": s.state, "due_at": s.due_at}
                      for s in sorted(steps.get(o.offense_id, []) if o else [], key=lambda s: order.get(s.kind, 99))],
            "maybe_same": candidate.report_id if candidate else None,
            "same_as": same["same_as"]["report_id"] if same["same_as"] else None,
            "closed": case_state.is_closed(rep),
        })
    people: Dict[int, Dict[str, Any]] = {}
    for o in offenses:
        p = people.setdefault(o.respondent_id, {**respondents.get(o.respondent_id, {}), "rules": {}})
        r = p["rules"].setdefault(o.policy_id, {"policy_id": o.policy_id, "title": o.policy_title, "counted": 0, "pending": 0, "corrected": 0, "not_counted": 0})
        if o.voided_at is not None:
            r["corrected"] += 1
        elif o.counted:
            r["counted"] += 1
        else:
            r["not_counted"] += 1
    for rep_id, f in findings.items():
        if not f.respondent_id:
            continue
        p = people.setdefault(f.respondent_id, {**respondents.get(f.respondent_id, {}), "rules": {}})
        if f.policy_id and rep_id not in active and not case_state.is_closed(by_id[rep_id]) and case_state.incident_is_verified(by_id[rep_id]):
            p["rules"].setdefault(f.policy_id, {"policy_id": f.policy_id, "title": f.policy_title, "counted": 0, "pending": 0, "corrected": 0, "not_counted": 0})["pending"] += 1
    return {"items": rows, "people": [{**p, "rules": list(p["rules"].values())} for p in people.values() if p.get("respondent_id")]}


def person(db: Session, user: User, respondent_id: int) -> Dict[str, Any]:
    r = db.get(ComplaintRespondent, respondent_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    scope = _scope_subdivision(user, r.subdivision_id)
    if scope is not None and r.subdivision_id != scope:
        raise HTTPException(status_code=404, detail="Person not found.")
    policies = {o.policy_id for o in db.query(ComplaintOffense).filter(ComplaintOffense.respondent_id == respondent_id).all()}
    policies |= {f.policy_id for f in db.query(ComplaintFinding).filter(ComplaintFinding.respondent_id == respondent_id).all() if f.policy_id}
    first = db.query(func.min(ComplaintFinding.respondent_at)).filter(ComplaintFinding.respondent_id == respondent_id).scalar()
    return {"respondent": _respondents(db, [respondent_id]).get(respondent_id), "first_confirmed_at": first or r.created_at,
            "rules": [history_for(db, respondent_id, pid) for pid in sorted(policies)]}


# ------------------------------------------------------------------------------------------------------- leads
def leads(db: Session, report: Report, skip_respondent_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Where the owner may be found, from what StraySafe already holds. Leads only, never proof (docs/01-system/COMPLAINT_MANAGEMENT.md):
      suggestion  residents and recorded households whose name or Block/Lot matches what the complainant wrote
      registry    registered pets of the same kind whose colour (and size) fits the description; owners on the same street first
      earlier     earlier complaints at the same place about the same kind of animal, and who was confirmed responsible then
    The complainant, the leads already ruled out on this complaint and (when correcting) the current person are left out.
    """
    f = R.finding_of(db, report)
    ruled = {r.get("key") for r in ((f.ruled_out or []) if f else [])}
    sub = report.subdivision_id
    street = R.street_of(report.landmark)
    complainant = report.user_id
    households = db.query(ComplaintRespondent).filter(ComplaintRespondent.subdivision_id == sub).all()
    account_respondent = {h.user_id: h for h in households if h.user_id}
    skip_user = next((h.user_id for h in households if h.respondent_id == skip_respondent_id), None)

    def person_key(user_id: Optional[int], respondent_id: Optional[int]) -> str:
        return f"user:{user_id}" if user_id else f"household:{respondent_id}"

    def excluded(user_id: Optional[int], respondent_id: Optional[int]) -> bool:
        if user_id and (user_id == complainant or user_id == skip_user):
            return True
        if respondent_id and respondent_id == skip_respondent_id:
            return True
        if user_id and user_id in account_respondent and account_respondent[user_id].respondent_id == skip_respondent_id:
            return True
        return person_key(user_id, respondent_id) in ruled

    residents = db.query(User).filter(User.subdivision_id == sub, User.role_id == 1).all()
    suggestion = []
    if report.suspected_owner_name or report.suspected_owner_address:
        said = set(R.name_tokens(report.suspected_owner_name))
        bl = R.block_lot(report.suspected_owner_address)
        people = [(u.user_id, None, u.name, u.address or "") for u in residents]
        people += [(None, h.respondent_id, h.name, h.address) for h in households if not h.user_id]
        for uid, rid, name, address in people:
            if excluded(uid, rid):
                continue
            why = []
            if said & set(R.name_tokens(name)):
                why.append("name matches")
            if bl and bl == R.block_lot(address):
                why.append(f"lives at {bl}")
            if why:
                suggestion.append({"key": person_key(uid, rid), "user_id": uid, "respondent_id": rid, "name": name, "address": address, "why": why})

    registry = []
    text = " ".join(filter(None, [report.animal_color, report.description, report.suspected_owner_details]))
    colours, size = set(R.colours_in(text)), R.size_in(text)
    kind = (report.animal_type or "").strip().lower()
    if colours and kind in ("dog", "cat"):
        owners = {u.user_id: u for u in residents}
        for pet in db.query(Pet).filter(Pet.owner_id.in_(list(owners) or [-1])).all():
            owner = owners.get(pet.owner_id)
            if owner is None or (pet.status or "").lower() == "deceased" or (pet.pet_type or "").lower() != kind:
                continue
            if f"pet:{pet.pet_id}" in ruled or excluded(owner.user_id, None):
                continue
            pet_colours = set(R.colours_in(" ".join(filter(None, [pet.color_markings, pet.primary_color]))))
            shared = sorted(colours & pet_colours)
            if not shared:
                continue
            why = [pet.pet_type.lower(), *shared]
            if size and pet.size_category and pet.size_category.lower() == size.lower():
                why.append(size.lower())
            same_street = bool(street and R.street_of(owner.address) == street)
            if same_street:
                why.append(f"owner lives on {street.title()} St.")
            registry.append({"key": f"pet:{pet.pet_id}", "pet_id": pet.pet_id, "pet_name": pet.pet_name, "pet_type": pet.pet_type,
                             "breed": pet.breed, "colour": pet.color_markings or pet.primary_color, "size": pet.size_category,
                             "photo_url": pet.photo_url, "owner_user_id": owner.user_id, "owner_name": owner.name,
                             "owner_address": owner.address or "", "why": why, "_rank": (same_street, len(why))})
        registry.sort(key=lambda x: x["_rank"], reverse=True)
        for x in registry:
            x.pop("_rank", None)
        registry = registry[:6]

    earlier = []
    by_person: Dict[int, List[int]] = {}
    for other in _complaints_in(db, sub):
        if other.report_id == report.report_id or (other.animal_type or "").lower() != kind or not R.same_place(report, other):
            continue
        of = R.finding_of(db, other)
        if of and of.respondent_id:
            by_person.setdefault(of.respondent_id, []).append(other.report_id)
    views = _respondents(db, list(by_person))
    for rid, report_ids in by_person.items():
        v = views.get(rid)
        if v is None or excluded(v.get("user_id"), rid):
            continue
        earlier.append({"key": person_key(v.get("user_id"), rid), "user_id": v.get("user_id"), "respondent_id": None if v.get("user_id") else rid,
                        "name": v["name"], "address": v["address"], "report_ids": sorted(report_ids),
                        "why": [f"{kind or 'animal'} at the same place", f"{len(report_ids)} earlier complaint{'s' if len(report_ids) != 1 else ''}"]})
    return {"suggestion": suggestion, "registry": registry, "earlier": earlier, "ruled_out": (f.ruled_out or []) if f else []}


# ------------------------------------------------------------------------------------------------------- writes
def verify(db: Session, report: Report, actor: User, data: VerifyIn) -> None:
    L.require_open(report, "verify it")
    active = R.active_offense(db, report.report_id)
    f = R.finding_of(db, report, create=True)
    basis = data.basis.strip()
    if data.incident == "verified":
        if data.no_rule:
            if active is not None:
                raise HTTPException(status_code=409, detail="This complaint already has your decision on the offense. Correct that first.")
            f.policy_id = f.policy_title = f.policy_reference = None
            f.no_rule = True
        else:
            if not data.policy_id:
                raise HTTPException(status_code=422, detail="Choose the rule that was broken, or say that none of the rules applies.")
            rule = _confirmed_rule(db, report.subdivision_id, data.policy_id)
            if active is not None and active.policy_id != rule.id:
                raise HTTPException(status_code=409, detail="This complaint already counts under another rule. Correct the decision first.")
            f.policy_id, f.policy_title, f.policy_reference, f.no_rule = rule.id, rule.title, rule.reference, False
    else:
        if active is not None and active.counted:
            raise HTTPException(status_code=409, detail="This complaint counts as an offense. Correct the person responsible first.")
        f.policy_id = f.policy_title = f.policy_reference = None
        f.no_rule = False
    before = case_state.incident_of(report)
    report.incident_verification, report.incident_basis = data.incident, basis
    report.assessed_at, report.assessed_by = R.now_local(), actor.user_id
    L.advance_case(db, report, actor, V.UNDER_REVIEW, "complaint checked")
    if data.incident == "verified" and before != "verified":
        L.history(db, report, actor, "Complaint verified.")
        L._notify_reporter(db, report, actor, f"Complaint #{report.report_id} verified",
                           f"Your Subdivision Leader checked your complaint #{report.report_id} and verified it.")
    elif data.incident == "unverified" and before != "unverified":
        L.history(db, report, actor, "Complaint could not be verified.")
    L.audit(db, actor, "COMPLAINT_VERIFIED", report, f"{actor.name} recorded on complaint #{report.report_id}: {data.incident}.",
            old={"incident": before}, new={"incident": data.incident, "basis": basis, "policy_id": f.policy_id, "no_rule": f.no_rule})


def _merge_ruled_out(f: ComplaintFinding, items, actor: User) -> None:
    if not items:
        return
    current = {r.get("key"): r for r in (f.ruled_out or [])}
    stamp = R.now_local().isoformat(timespec="seconds")
    for item in items:
        current[item.key] = {"key": item.key, "label": item.label.strip(), "reason": (item.reason or "").strip() or None,
                             "at": stamp, "by": actor.name}
    f.ruled_out = list(current.values())


def _resolve_person(db: Session, report: Report, actor: User, data: ResponsibleIn) -> ComplaintRespondent:
    sub = report.subdivision_id
    if data.mode == "user":
        u = db.get(User, data.user_id) if data.user_id else None
        if u is None or u.role_id != 1 or u.subdivision_id != sub:
            raise HTTPException(status_code=404, detail="Choose a resident of this subdivision.")
        if u.user_id == report.user_id:
            raise HTTPException(status_code=409, detail="The person who filed the complaint can't be the person responsible for it.")
        r = db.query(ComplaintRespondent).filter(ComplaintRespondent.subdivision_id == sub, ComplaintRespondent.user_id == u.user_id).first()
        if r is None:
            r = ComplaintRespondent(subdivision_id=sub, user_id=u.user_id, name=u.name, address=(u.address or "").strip() or "No address recorded",
                                    created_by=actor.user_id)
            db.add(r)
            db.flush()
        return r
    if data.mode == "household":
        r = db.get(ComplaintRespondent, data.respondent_id) if data.respondent_id else None
        if r is None or r.subdivision_id != sub:
            raise HTTPException(status_code=404, detail="Choose a household recorded in this subdivision.")
        return r
    name, address = (data.name or "").strip(), (data.address or "").strip()
    if len(name) < 2 or len(address) < 3:
        raise HTTPException(status_code=422, detail="Enter their name and house address.")
    r = db.query(ComplaintRespondent).filter(ComplaintRespondent.subdivision_id == sub, ComplaintRespondent.user_id.is_(None),
                                             func.lower(ComplaintRespondent.name) == name.lower(),
                                             func.lower(ComplaintRespondent.address) == address.lower()).first()
    if r is None:
        r = ComplaintRespondent(subdivision_id=sub, user_id=None, name=name, address=address, created_by=actor.user_id)
        db.add(r)
        db.flush()
    return r


def responsible(db: Session, report: Report, actor: User, data: ResponsibleIn, ip: Optional[str] = None, user_agent: Optional[str] = None) -> None:
    f = R.finding_of(db, report, create=True)
    active = R.active_offense(db, report.report_id)
    closed = case_state.is_closed(report)
    if data.mode == "none":
        if closed:
            raise HTTPException(status_code=409, detail="The complaint is closed. Reopen it to change this.")
        check = (data.check_note or "").strip()
        if len(check) < 5:
            raise HTTPException(status_code=422, detail="Write what you checked so far.")
        _merge_ruled_out(f, data.ruled_out, actor)
        f.check_note, f.check_by, f.check_at = check, actor.user_id, R.now_local()
        L.audit(db, actor, "COMPLAINT_STILL_CHECKING", report, f"{actor.name} is still checking who is responsible for complaint #{report.report_id}.",
                new={"check_note": check, "ruled_out": [r.key for r in data.ruled_out]})
        return
    evidence = list(dict.fromkeys(data.evidence))
    if not evidence:
        raise HTTPException(status_code=422, detail="Choose at least one kind of evidence.")
    if evidence == ["registry"]:
        raise HTTPException(status_code=422, detail="A registered pet profile is not enough on its own.")
    note = (data.note or "").strip()
    if len(note) < 10:
        raise HTTPException(status_code=422, detail="Say how you established it.")
    target = _resolve_person(db, report, actor, data)
    target_key = f"user:{target.user_id}" if target.user_id else f"household:{target.respondent_id}"
    if any(r.key == target_key for r in data.ruled_out) or any(r.get("key") == target_key for r in (f.ruled_out or [])):
        raise HTTPException(status_code=409, detail="You ruled this person out. Undo that first.")
    correcting = active is not None and f.respondent_id is not None and f.respondent_id != target.respondent_id
    reason = (data.correction_reason or "").strip()
    if correcting:
        if len(reason) < 5:
            raise HTTPException(status_code=422, detail="Say why you are correcting it.")
        active.voided_at, active.voided_by, active.void_reason = R.now_local(), actor.user_id, reason
        if closed:
            L.reopen_case(db, report, actor, f"Reopened to correct the person responsible: {reason}", ip=ip, user_agent=user_agent)
    elif closed:
        raise HTTPException(status_code=409, detail="The complaint is closed. Reopen it to change this.")
    elif active is not None and f.respondent_id != target.respondent_id:
        raise HTTPException(status_code=409, detail="This complaint already has your decision on the offense. Correct it instead.")
    before = f.respondent_id
    _merge_ruled_out(f, data.ruled_out, actor)
    f.respondent_id, f.respondent_evidence, f.respondent_note = target.respondent_id, evidence, note
    f.respondent_by, f.respondent_at = actor.user_id, R.now_local()
    f.check_note = None
    L.advance_case(db, report, actor, V.UNDER_REVIEW, "person responsible identified")
    L.audit(db, actor, "COMPLAINT_RESPONSIBLE_CORRECTED" if correcting else "COMPLAINT_RESPONSIBLE_CONFIRMED", report,
            f"{actor.name} {'corrected' if correcting else 'confirmed'} the person responsible for complaint #{report.report_id}: {target.name}.",
            table="complaint_findings", old={"respondent_id": before},
            new={"respondent_id": target.respondent_id, "evidence": evidence, "note": note, "correction_reason": reason or None,
                 "voided_offense_id": active.offense_id if correcting else None})


def offense(db: Session, report: Report, actor: User, data: OffenseIn) -> Optional[ComplaintOffense]:
    L.require_open(report, "decide on it")
    f = R.finding_of(db, report)
    if not case_state.incident_is_verified(report):
        raise HTTPException(status_code=409, detail="Verify what happened first. An unverified complaint never counts.")
    if f is None or not f.policy_id:
        raise HTTPException(status_code=409, detail="Choose the rule that was broken first.")
    if not f.respondent_id:
        raise HTTPException(status_code=409, detail="Confirm who is responsible first. A complainant's suggestion never counts on its own.")
    if R.active_offense(db, report.report_id) is not None:
        raise HTTPException(status_code=409, detail="You already decided on this complaint. Correct it instead.")
    candidate = _candidate(db, report, f)
    if candidate is not None:
        raise HTTPException(status_code=409, detail=f"Decide first whether this is the same occurrence as complaint #{candidate.report_id}.")
    rule = _confirmed_rule(db, report.subdivision_id, f.policy_id)
    number = R.suggest_number(db, report, f.respondent_id, rule.id, rule.count_window_days)
    now = R.now_local()
    common = dict(report_id=report.report_id, subdivision_id=report.subdivision_id, respondent_id=f.respondent_id, policy_id=rule.id,
                  policy_title=rule.title, policy_reference=rule.reference, incident_at=R.incident_at(report), confirmed_by=actor.user_id,
                  confirmed_at=now)
    if data.decision == "not_counted":
        reason = (data.reason or "").strip()
        if len(reason) < 5:
            raise HTTPException(status_code=422, detail="Say why it should not count.")
        row = ComplaintOffense(counted=False, offense_number=None, note=reason, **common)
        db.add(row)
        L.audit(db, actor, "COMPLAINT_NOT_COUNTED", report, f"{actor.name} decided complaint #{report.report_id} does not count as an offense.",
                table="complaint_offenses", new={"reason": reason, "suggested": number})
        return row
    if data.expected_number is not None and data.expected_number != number:
        raise HTTPException(status_code=409, detail=f"The history changed: StraySafe now suggests the {_ordinal(number)} offense. Review it again.")
    row = ComplaintOffense(counted=True, offense_number=number, **common)
    db.add(row)
    db.flush()
    for kind in R.steps_for(number):
        db.add(EnforcementStep(offense_id=row.offense_id, report_id=report.report_id, kind=kind, state=R.INITIAL_STATE[kind], details={}))
    L.advance_case(db, report, actor, V.IN_PROGRESS, "offense confirmed")
    L.history(db, report, actor, "Action is being taken under the subdivision's rules.")
    L.audit(db, actor, "COMPLAINT_OFFENSE_CONFIRMED", report,
            f"{actor.name} confirmed complaint #{report.report_id} as the {_ordinal(number)} offense under {rule.title}.",
            table="complaint_offenses", target_id=row.offense_id,
            new={"respondent_id": f.respondent_id, "policy_id": rule.id, "offense_number": number, "steps": list(R.steps_for(number))})
    return row


def same_occurrence(db: Session, report: Report, actor: User, data: SameOccurrenceIn) -> None:
    L.require_open(report, "decide this")
    other = db.get(Report, data.other_report_id)
    if other is None or other.report_id == report.report_id or other.subdivision_id != report.subdivision_id or not R.is_complaint(other):
        raise HTTPException(status_code=404, detail="Choose another animal complaint of this subdivision.")
    note = (data.note or "").strip()
    if data.decision == "same":
        active = R.active_offense(db, report.report_id)
        if active is not None and active.counted:
            raise HTTPException(status_code=409, detail="This complaint already counts as an offense. Correct that first.")
        _close_as_same_occurrence(db, report, other, actor, note)
        return
    f = R.finding_of(db, report, create=True)
    f.separate_from_report_id, f.separate_by, f.separate_at = other.report_id, actor.user_id, R.now_local()
    L.audit(db, actor, "COMPLAINT_SEPARATE_INCIDENT", report,
            f"{actor.name} kept complaint #{report.report_id} separate from #{other.report_id}.", new={"other": other.report_id, "note": note or None})


def _close_as_same_occurrence(db: Session, report: Report, other: Report, actor: User, note: str) -> None:
    """
    Close this complaint as a duplicate of the earlier one, THEN link the two. The order matters: the closing hook
    (utils/case_closure.py, close_linked_reports) closes every report linked to one that closes, so linking first would also
    close the earlier complaint, which must stay open to be handled (and counted once).
    """
    group, _legacy, label = V.DISPOSITIONS["duplicate_report"]
    reason = f"Same occurrence as complaint #{other.report_id}." + (f" {note}" if note else "")
    previous = case_state.case_status_of(report)
    now = R.now_local()
    report.closure_disposition, report.closure_reason = "duplicate_report", reason
    report.closed_at, report.closed_by = now, actor.user_id
    L._apply_status(report, V.CLOSED)
    from app.services import case_messaging
    case_messaging.close_for_report(db, report.report_id, actor.user_id, f"The report is closed ({label}).")
    L.history(db, report, actor, f"Case closed: {label}.")
    L.audit(db, actor, "CASE_CLOSED", report, f"{actor.name} closed report #{report.report_id}: {label} (same occurrence as #{other.report_id}).",
            old={"case_status": previous}, new={"case_status": V.CLOSED, "disposition": "duplicate_report", "outcome": group, "reason": reason})
    L._notify_reporter(db, report, actor, f"Complaint #{report.report_id}: same occurrence",
                       f"Your complaint #{report.report_id} describes the same occurrence as another complaint, which your Subdivision Leader "
                       f"is handling. It is counted once. You will hear the outcome.")
    db.flush()                      # the closing hook runs now, while the two are not linked yet
    W.link_reports(db, report, actor, LinkIn(report_ids=[other.report_id], link_type="same_incident", note=note or None))


# ------------------------------------------------------------------------------------------------- enforcement steps
def _event(db: Session, step: EnforcementStep, actor: User, kind: str, occurred_at: datetime, details: Dict[str, Any],
           request_id: Optional[str] = None) -> None:
    db.add(EnforcementStepEvent(step_id=step.step_id, report_id=step.report_id, kind=kind, occurred_at=occurred_at, details=details,
                                recorded_by=actor.user_id, client_request_id=request_id))


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _open_barangay_referral(db: Session, report_id: int) -> Optional[BarangayReferral]:
    return (db.query(BarangayReferral).filter(BarangayReferral.report_id == report_id, BarangayReferral.org_type == "barangay",
                                              BarangayReferral.referral_status.in_(tuple(V.OPEN_REFERRAL_STATUSES)))
            .order_by(BarangayReferral.referral_id.desc()).first())


def step_action(db: Session, report: Report, actor: User, step_id: int, data: StepActionIn) -> EnforcementStep:
    L.require_open(report, "record this")
    step = db.get(EnforcementStep, step_id)
    if step is None or step.report_id != report.report_id:
        raise HTTPException(status_code=404, detail="Step not found on this complaint.")
    off = db.get(ComplaintOffense, step.offense_id)
    if off is None or off.voided_at is not None:
        raise HTTPException(status_code=409, detail="This step belongs to a decision that was corrected. It is kept as history.")
    if data.client_request_id and db.query(EnforcementStepEvent).filter(EnforcementStepEvent.client_request_id == data.client_request_id).first():
        return step                                  # a retried save: it was recorded the first time
    rid = data.client_request_id
    now = R.now_local()
    details = dict(step.details or {})
    a, kind = data.action, step.kind
    letter = kind in (R.LETTER_1, R.LETTER_2)

    def need(value, message: str):
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(status_code=422, detail=message)
        return value

    def wrong(message: str):
        raise HTTPException(status_code=409, detail=message)

    if a == "prepare" and letter:
        if step.state not in ("to_prepare", "prepared"):
            wrong("This letter was already issued for delivery. Print it again from the step if you need a copy.")
        letter_date = need(data.letter_date, "Choose the date on the letter.")
        info: Dict[str, Any] = {"letter_date": letter_date.isoformat()}
        if kind == R.LETTER_2:
            summons_at = need(data.summons_at, "Choose the date and time of the summons.").replace(tzinfo=None)
            place = (data.place or "").strip() or "Subdivision office"
            info.update(summons_at=summons_at.isoformat(), place=place)
            summons = next((s for s in R.step_rows(db, off.offense_id) if s.kind == R.SUMMONS), None)
            if summons is not None and summons.state in ("waiting", "scheduled"):
                summons.state, summons.due_at = "scheduled", summons_at
                summons.details = {**(summons.details or {}), "place": place}
                _event(db, summons, actor, "scheduled", now, {"at": summons_at.isoformat(), "place": place})
        details.update(letter_date=letter_date.isoformat(), prepared_at=now.isoformat(timespec="seconds"))
        step.state = "prepared"
        _event(db, step, actor, "prepared", now, info, rid)
    elif a == "issue" and letter:
        if step.state != "prepared":
            wrong("Prepare the letter first." if step.state == "to_prepare" else "This letter was already issued.")
        via = need(data.via, "Say who delivers it.")
        details.update(issued_at=now.isoformat(timespec="seconds"), issued_via=via)
        step.state = "issued"
        _event(db, step, actor, "issued", now, {"via": via}, rid)
    elif a == "deliver" and letter:
        if step.state not in ("issued", "not_delivered"):
            wrong("Issue the letter for delivery first.")
        if data.delivered is None:
            raise HTTPException(status_code=422, detail="Say whether it was delivered.")
        when = R.not_future(data.occurred_at, "The delivery time")
        if data.delivered:
            received = need(data.received_by, "Say who received it.")
            proof = need(data.proof, "Say how you know it was received.")
            details.update(delivered_at=when.isoformat(timespec="seconds"), received_by=received, proof=proof)
            step.state = "delivered"
            _event(db, step, actor, "delivered", when, {"received_by": received, "proof": proof, "note": data.note or None}, rid)
        else:
            reason = need(data.reason, "Say what happened.")
            details["attempts"] = int(details.get("attempts", 0)) + 1
            step.state = "not_delivered"
            _event(db, step, actor, "not_delivered", when, {"reason": reason, "note": data.note or None}, rid)
    elif a == "attendance" and kind == R.SUMMONS:
        if step.state != "scheduled":
            wrong("The summons has no date yet." if step.state == "waiting" else "Attendance was already recorded. Set a new date first.")
        letter2 = next((s for s in R.step_rows(db, off.offense_id) if s.kind == R.LETTER_2), None)
        if letter2 is None or letter2.state != "delivered":
            wrong("Record the delivery of the second warning letter first: it tells them the date.")
        result = need(data.result, "Say whether they came.")
        note = need(data.note, "Write what was agreed, or what happened.")
        if len(note) < 5:
            raise HTTPException(status_code=422, detail="Write what was agreed, or what happened.")
        details.update(result=result, result_note=note)
        step.state = result
        _event(db, step, actor, result, now, {"note": note}, rid)
    elif a == "reschedule" and kind == R.SUMMONS:
        if step.state not in ("absent", "asked_new_date"):
            wrong("Only a missed or moved summons gets a new date.")
        at = need(data.at, "Choose the new date and time.").replace(tzinfo=None)
        told = need(data.told, "Say how you told them.")
        place = (data.place or "").strip() or details.get("place") or "Subdivision office"
        details.update(place=place)
        details.pop("result", None)
        details.pop("result_note", None)
        step.state, step.due_at = "scheduled", at
        _event(db, step, actor, "rescheduled", now, {"at": at.isoformat(), "place": place, "told": told}, rid)
    elif a == "impose" and kind == R.FINE:
        if step.state != "to_impose":
            wrong("The fine was already imposed.")
        rule = _policy(db, report.subdivision_id, off.policy_id)
        if rule is None or rule.status != "confirmed" or rule.fine_amount is None:
            wrong("This rule has no fine amount yet. Add it to the rule in Settings once the subdivision has confirmed it.")
        imposed_on = need(data.imposed_on, "Choose the date the fine was imposed.")
        if imposed_on > now.date():
            raise HTTPException(status_code=422, detail="The date the fine was imposed can't be in the future.")
        told = need(data.told, "Say how the person is told.")
        details.update(amount=rule.fine_amount, imposed_on=imposed_on.isoformat(), told=told, note=data.note or None)
        step.state = "imposed"
        _event(db, step, actor, "imposed", now, {"amount": rule.fine_amount, "imposed_on": imposed_on.isoformat(), "told": told,
                                                "note": data.note or None}, rid)
    elif a == "pay" and kind == R.FINE:
        if step.state != "imposed":
            wrong("Impose the fine first." if step.state == "to_impose" else "The payment was already recorded.")
        paid_on = need(data.paid_on, "Choose the date it was paid.")
        if paid_on > now.date():
            raise HTTPException(status_code=422, detail="The payment date can't be in the future.")
        received = need(data.received_by, "Say who received it.")
        details.update(paid_on=paid_on.isoformat(), paid_received_by=received)
        step.state = "paid"
        _event(db, step, actor, "paid", now, {"paid_on": paid_on.isoformat(), "received_by": received, "note": data.note or None}, rid)
    elif a == "arrange" and kind == R.MEETING:
        if step.state not in ("to_arrange", "not_held"):
            wrong("The meeting is already arranged. Record how it went first.")
        contact = need(data.contact, "Say who you spoke with at the Barangay.")
        at = need(data.at, "Choose the date and time of the meeting.").replace(tzinfo=None)
        place = (data.place or "").strip() or "Barangay hall"
        referral = _open_barangay_referral(db, report.report_id)
        if referral is None:
            referral = W.create_referral(db, report, actor, ReferralIn(
                org_type="barangay", reason="Meeting at the Barangay about a third offense: the complainant, the person responsible and the Subdivision Leader.",
                contact_method="in_person", contact_person=contact, contacted=True,
                notes=f"Meeting at {place} on {at.strftime('%d %b %Y, %I:%M %p')}."))
        step.referral_id = referral.referral_id
        details.update(contact=contact, place=place, complainant_agreed=bool(data.complainant_agreed))
        details.pop("held", None)
        step.state, step.due_at = "arranged", at
        _event(db, step, actor, "arranged", now, {"contact": contact, "at": at.isoformat(), "place": place,
                                                 "complainant_agreed": bool(data.complainant_agreed), "referral_id": referral.referral_id}, rid)
    elif a == "meeting" and kind == R.MEETING:
        if step.state != "arranged":
            wrong("Arrange the meeting first.")
        if data.held is None:
            raise HTTPException(status_code=422, detail="Say whether the meeting took place.")
        outcome = need(data.outcome, "Write the outcome.")
        if len(outcome) < 5:
            raise HTTPException(status_code=422, detail="Write the outcome.")
        attendance = (data.attendance.model_dump() if data.attendance else {"complainant": False, "respondent": False, "leader": False}) if data.held else None
        details.update(held=bool(data.held), outcome=outcome, attendance=attendance)
        step.state = "held" if data.held else "not_held"
        _event(db, step, actor, step.state, now, {"outcome": outcome, "attendance": attendance, "at": _iso(step.due_at)}, rid)
    else:
        raise HTTPException(status_code=422, detail=f"'{a}' does not apply to the {R.STEP_LABELS.get(kind, kind).lower()}.")
    step.details = details
    L.audit(db, actor, "ENFORCEMENT_STEP_RECORDED", report, f"{actor.name} recorded '{a}' on the {R.STEP_LABELS.get(kind, kind).lower()} of complaint #{report.report_id}.",
            table="enforcement_steps", target_id=step.step_id, new={"action": a, "state": step.state})
    return step
