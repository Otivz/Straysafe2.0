"""
Adoption eligibility after an owner handover (docs/01-system/ADOPTION_ELIGIBILITY_RULES.md).

An animal that went back to its owner is never adopted out. That is decided from the records, not only from the
current status, across every report of the merged case:

- the holding record is Claimed by Owner (facility status 3);
- an owner-return record exists for the case (or for this holding record);
- a pet claim of the case is completed (Handover Complete / Pet Received);
- a report of the case has custody Claimed by Owner / Reunited with Owner.

A claim that is only submitted or approved does not count: the animal is still where it was until the handover.
"""
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException, Request
from sqlalchemy import false, or_
from sqlalchemy.orm import Session

from app.models.pet_claim import PetClaim
from app.models.report import Adoption, HoldingAnimal, HoldingTimeline, Report, ReportReturn
from app.models.notification import Notification
from app.models.user import User
from app.utils.audit import log_activity

INELIGIBLE_DETAIL = ("This animal is no longer eligible for adoption because it has already been claimed and handed "
                     "over to its owner.")
RETURNED_CUSTODY = {"Claimed by Owner", "Reunited with Owner"}
COMPLETED_CLAIM = ("Handover Complete", "Pet Received")
CLAIMED_BY_OWNER_HOLDING = 3
FOR_ADOPTION = 6
OPEN_APPLICATION = ("Pending", "Approved")


def _case_report_ids(db: Session, report: Optional[Report]) -> List[int]:
    if report is None:
        return []
    from app.utils.case_groups import case_members, case_root
    return [m.report_id for m in case_members(db, case_root(db, report))]


def owner_handover_evidence(db: Session, animal: HoldingAnimal) -> Optional[str]:
    """Why this animal counts as returned to its owner (None: it doesn't)."""
    if animal.facility_status == CLAIMED_BY_OWNER_HOLDING:
        return "its holding record is Claimed by Owner"
    report = animal.report or (db.get(Report, animal.report_id) if animal.report_id else None)
    ids = _case_report_ids(db, report)
    q = db.query(ReportReturn.return_id)
    ret = (q.filter(ReportReturn.holding_id == animal.holding_id).first()
           or (q.filter(ReportReturn.report_id.in_(ids)).first() if ids else None))
    if ret:
        return f"an owner return is on record (return #{ret[0]})"
    if ids:
        claim = (db.query(PetClaim.claim_id, PetClaim.status)
                 .filter(PetClaim.report_id.in_(ids), PetClaim.status.in_(COMPLETED_CLAIM)).first())
        if claim:
            return f"pet claim #{claim[0]} was completed ({claim[1]})"
        custody = (db.query(Report.report_id, Report.custody_status)
                   .filter(Report.report_id.in_(ids), Report.custody_status.in_(RETURNED_CUSTODY)).first())
        if custody:
            return f"Report #{custody[0]} is {custody[1]}"
    return None


def owner_handover_evidence_map(db: Session, animals: Iterable[HoldingAnimal]) -> Dict[int, Optional[str]]:
    """
    owner_handover_evidence() for many animals at once, in a fixed number of queries (lists): holding_id -> reason or
    None. Same rules and order of checks; where several records qualify, the one with the lowest id is cited.
    """
    animals = [a for a in animals if a is not None and a.holding_id is not None]
    out: Dict[int, Optional[str]] = {}
    pending = []
    for a in animals:
        if a.facility_status == CLAIMED_BY_OWNER_HOLDING:
            out[a.holding_id] = "its holding record is Claimed by Owner"
        else:
            pending.append(a)
    if not pending:
        return out
    # Each animal's case: its report, or the main report it was merged into, plus that main report's duplicates
    reports = {a.report_id: a.report for a in pending if a.report is not None}
    missing = [a.report_id for a in pending if a.report_id and a.report_id not in reports]
    if missing:
        reports.update({r.report_id: r for r in db.query(Report).filter(Report.report_id.in_(missing)).all()})
    parent_ids = {r.duplicate_of_report_id for r in reports.values() if r.duplicate_of_report_id}
    existing_parents = {rid for (rid,) in db.query(Report.report_id).filter(Report.report_id.in_(parent_ids)).all()} if parent_ids else set()
    root_of = {rid: (r.duplicate_of_report_id if r.duplicate_of_report_id in existing_parents else rid) for rid, r in reports.items()}
    roots = set(root_of.values())
    members: Dict[int, set] = {root: {root} for root in roots}
    if roots:
        for rid, parent in db.query(Report.report_id, Report.duplicate_of_report_id).filter(Report.duplicate_of_report_id.in_(roots)).all():
            members.setdefault(parent, {parent}).add(rid)
    case_ids = {a.holding_id: members.get(root_of.get(a.report_id), set()) for a in pending}
    all_ids = set().union(*case_ids.values()) if case_ids else set()
    holding_ids = [a.holding_id for a in pending]

    returns = (db.query(ReportReturn.return_id, ReportReturn.holding_id, ReportReturn.report_id)
               .filter(or_(ReportReturn.holding_id.in_(holding_ids), ReportReturn.report_id.in_(all_ids) if all_ids else false()))
               .order_by(ReportReturn.return_id).all())
    claims = (db.query(PetClaim.claim_id, PetClaim.status, PetClaim.report_id)
              .filter(PetClaim.report_id.in_(all_ids), PetClaim.status.in_(COMPLETED_CLAIM))
              .order_by(PetClaim.claim_id).all()) if all_ids else []
    custody = (db.query(Report.report_id, Report.custody_status)
               .filter(Report.report_id.in_(all_ids), Report.custody_status.in_(RETURNED_CUSTODY))
               .order_by(Report.report_id).all()) if all_ids else []
    for a in pending:
        ids = case_ids.get(a.holding_id, set())
        ret = next((r for r in returns if r.holding_id == a.holding_id), None) or next((r for r in returns if r.report_id in ids), None)
        if ret:
            out[a.holding_id] = f"an owner return is on record (return #{ret.return_id})"
            continue
        claim = next((c for c in claims if c.report_id in ids), None)
        if claim:
            out[a.holding_id] = f"pet claim #{claim.claim_id} was completed ({claim.status})"
            continue
        cust = next((c for c in custody if c.report_id in ids), None)
        out[a.holding_id] = f"Report #{cust.report_id} is {cust.custody_status}" if cust else None
    return out


def returned_holding_ids(db: Session, holding_ids: Iterable[int]) -> set:
    """The animals among these that went back to their owner."""
    ids = [i for i in holding_ids if i]
    if not ids:
        return set()
    return {a.holding_id for a in db.query(HoldingAnimal).filter(HoldingAnimal.holding_id.in_(ids)).all()
            if owner_handover_evidence(db, a)}


def require_adoption_eligible(db: Session, animal: HoldingAnimal, actor: Optional[User], action: str,
                              request: Optional[Request] = None) -> None:
    """Refuse an adoption action for an animal returned to its owner. The blocked attempt is audited through its own
    session, so the caller's unsaved changes are never committed by the refusal (the caller's request fails)."""
    reason = owner_handover_evidence(db, animal)
    if not reason:
        return
    from app.database import SessionLocal
    try:
        with SessionLocal() as audit_db:
            log_activity(
                db=audit_db, action="ADOPTION_BLOCKED_OWNER_RETURNED", target_table="holding_animals",
                target_id=animal.holding_id,
                description=f"Blocked '{action}' for animal #{animal.holding_id}: returned to its owner ({reason}).",
                user_id=actor.user_id if actor else None, log_type="security",
                new_values={"action": action, "reason": reason}, request=request, commit=True,
            )
    except Exception:
        pass  # the refusal stands even if the audit entry can't be written
    raise HTTPException(status_code=409, detail=INELIGIBLE_DETAIL)


def retire_from_adoption(db: Session, report: Report, actor: Optional[User], extra_holding_ids: Iterable[int] = (),
                         request: Optional[Request] = None) -> dict:
    """
    After an owner handover (no commit): take the case's animals out of the catalog and close open adoption
    applications that weren't completed, with a reason, notices and audit entries. History is kept.
    """
    from app.utils.adoption_assignments import close_open_tasks
    ids = _case_report_ids(db, report)
    q = db.query(HoldingAnimal)
    animals = q.filter(HoldingAnimal.report_id.in_(ids)).all() if ids else []
    extra = [i for i in extra_holding_ids if i and i not in {a.holding_id for a in animals}]
    if extra:
        animals += q.filter(HoldingAnimal.holding_id.in_(extra)).all()
    actor_id = actor.user_id if actor else None
    reason = "The animal was claimed and handed over to its owner, so it is no longer available for adoption."
    removed, closed = [], []
    for animal in animals:
        was_listed = animal.facility_status == FOR_ADOPTION or animal.promoted_at is not None
        if was_listed:
            animal.adoption_catalog_notes = None
            animal.promoted_at = None
            animal.promoted_by = None
            removed.append(animal.holding_id)
            db.add(HoldingTimeline(holding_id=animal.holding_id, event_type="status_change",
                                   title="Removed from Adoption Catalog", notes=reason, logged_by=actor_id))
        apps = (db.query(Adoption)
                .filter(Adoption.holding_id == animal.holding_id, Adoption.status.in_(OPEN_APPLICATION),
                        Adoption.is_handed_over.is_(False), Adoption.staff_handed_over.is_(False)).all())
        for app in apps:
            app.status = "Cancelled"
            app.cancellation_reason = reason
            from app.utils.holding_stay import db_now
            app.cancelled_at = db_now(db)
            close_open_tasks(db, app, "Cancelled")
            closed.append(app.adoption_id)
            db.add(Notification(
                user_id=app.applicant_id, type="adoption_cancelled", related_id=app.adoption_id,
                title="Adoption Application Closed",
                message=(f"Your adoption application #{app.adoption_id} for {animal.animal_name or 'this animal'} was closed: "
                         f"the animal was returned to its owner."),
            ))
            db.add(HoldingTimeline(holding_id=animal.holding_id, event_type="status_change",
                                   title=f"Adoption Closed -- {app.full_name}",
                                   notes=f"Application #{app.adoption_id} closed. {reason}", logged_by=actor_id))
        if was_listed or apps:
            try:
                from app.routes.adoptions import _barangay_staff
                staff = _barangay_staff(animal, db)
            except Exception:
                staff = []
            for s in staff:
                if s.user_id == actor_id:
                    continue
                db.add(Notification(
                    user_id=s.user_id, type="adoption_cancelled", related_id=animal.holding_id,
                    title="Adoption Closed: Returned to Owner",
                    message=(f"{animal.animal_name or 'An animal'} (holding #{animal.holding_id}) went back to its owner. "
                             f"It was removed from adoption" + (f" and {len(apps)} application(s) were closed." if apps else ".")),
                ))
        log_activity(
            db=db, action="ADOPTION_ELIGIBILITY_REVOKED", target_table="holding_animals", target_id=animal.holding_id,
            description=(f"Animal #{animal.holding_id} is no longer eligible for adoption: handed over to its owner."
                         + (" Removed from the adoption catalog." if was_listed else "")
                         + (f" Closed applications: {', '.join('#' + str(a.adoption_id) for a in apps)}." if apps else "")),
            user_id=actor_id, log_type="operation",
            new_values={"adoption_eligible": False, "listing_removed": was_listed, "applications_closed": [a.adoption_id for a in apps]},
            request=request, commit=False,
        )
    return {"removed_from_catalog": removed, "applications_closed": closed}


def reconcile_returned_listings(db: Session) -> dict:
    """Existing data: animals returned to their owner but still listed or with open applications get retired. Commits."""
    listed = db.query(HoldingAnimal).filter(HoldingAnimal.facility_status == FOR_ADOPTION).all()
    with_apps = (db.query(HoldingAnimal).join(Adoption, Adoption.holding_id == HoldingAnimal.holding_id)
                 .filter(Adoption.status.in_(OPEN_APPLICATION), Adoption.is_handed_over.is_(False)).all())
    seen, out = set(), {"removed_from_catalog": [], "applications_closed": []}
    for animal in listed + with_apps:
        if animal.holding_id in seen:
            continue
        seen.add(animal.holding_id)
        if not owner_handover_evidence(db, animal):
            continue
        report = animal.report or db.get(Report, animal.report_id)
        if report is None:
            continue
        # Retire first (it sees the listing), then record the animal as back with its owner
        r = retire_from_adoption(db, report, None, [animal.holding_id])
        if animal.facility_status == FOR_ADOPTION:
            if animal.holding_id not in r["removed_from_catalog"]:
                r["removed_from_catalog"].append(animal.holding_id)
            animal.facility_status = CLAIMED_BY_OWNER_HOLDING
            if animal.discharge_date is None:
                from app.utils.holding_stay import db_now
                animal.discharge_date = db_now(db)
        out["removed_from_catalog"] += [i for i in r["removed_from_catalog"] if i not in out["removed_from_catalog"]]
        out["applications_closed"] += [i for i in r["applications_closed"] if i not in out["applications_closed"]]
    if out["removed_from_catalog"] or out["applications_closed"]:
        db.commit()
    return out
