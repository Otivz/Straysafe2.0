"""
Adoption case ownership and task assignments.

  Case owner (Head Officer / Admin): claim, transfer, assign / reassign / cancel tasks.
  Assignee (Barangay Staff):         see "My Adoption Tasks", accept or decline, then perform the task
                                      through the existing stage endpoints (which enforce assessor = assignee).

Ids only: the client never supplies names; every target is validated server-side.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.report import (
    ADOPTION_OPEN_ASSIGNMENT_STATUSES,
    Adoption,
    AdoptionAssignment,
    HoldingAnimal,
    Report,
)
from app.models.user import User
from app.schemas.adoption_tasks import (
    AssignmentCreateRequest,
    AssignmentResponse,
    CaseInfoResponse,
    DeclineRequest,
    MyTaskResponse,
    ReasonRequest,
    StaffOption,
    TaskAdoptionSummary,
    TransferRequest,
)
from app.utils.adoption_assignments import (
    TASK_LABELS,
    accept_task,
    assign_task,
    cancel_task,
    decline_task,
    lock_adoption,
    notify,
)
from app.utils.adoption_authority import (
    adoption_barangay_id,
    can_view_adoption,
    ensure_owner,
    in_adoption_barangay,
    is_case_authority,
    is_case_closed,
    record_ownership,
    require_base_access,
)
from app.utils.audit import log_activity
from app.utils.auth import get_current_staff_or_admin

router = APIRouter(tags=["adoption-tasks"])


def _load(adoption_id: int, db: Session) -> Adoption:
    app = (
        db.query(Adoption)
        .options(
            joinedload(Adoption.animal).joinedload(HoldingAnimal.report).selectinload(Report.media),
            joinedload(Adoption.interview),
            joinedload(Adoption.home_visit),
            joinedload(Adoption.case_owner),
        )
        .filter(Adoption.adoption_id == adoption_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    return app


def _assignment_out(a: AdoptionAssignment) -> AssignmentResponse:
    return AssignmentResponse(
        assignment_id=a.assignment_id, adoption_id=a.adoption_id, task_type=a.task_type,
        task_label=TASK_LABELS.get(a.task_type, a.task_type),
        monitoring_log_id=a.monitoring_log_id,
        milestone_name=a.monitoring_log.milestone_name if a.monitoring_log else None,
        assigned_to=a.assigned_to, assigned_to_name=a.assignee.name if a.assignee else a.assigned_to_name,
        assigned_by=a.assigned_by, assigned_by_name=a.assigner.name if a.assigner else None,
        status=a.status, scheduled_at=a.scheduled_at, due_at=a.due_at, assigned_at=a.assigned_at,
        accepted_at=a.accepted_at, declined_at=a.declined_at, decline_reason=a.decline_reason,
        completed_at=a.completed_at, remarks=a.remarks,
    )


def _summary(app: Adoption) -> TaskAdoptionSummary:
    animal = app.animal
    report = animal.report if animal else None
    photo = next((m.file_url for m in report.media if m.media_type == "Image"), None) if report and report.media else None
    iv, hv = app.interview, app.home_visit
    return TaskAdoptionSummary(
        adoption_id=app.adoption_id, holding_id=app.holding_id, applicant_name=app.full_name,
        contact_no=app.contact_no, address=app.address,
        pet_name=animal.animal_name if animal else None, pet_type=animal.animal_type if animal else None, pet_photo=photo,
        status=app.status, current_stage=app.current_stage or "Application", application_stage_status=app.application_stage_status,
        case_owner_id=app.case_owner_id, case_owner_name=app.case_owner.name if app.case_owner else None,
        interview_scheduled_at=iv.scheduled_at if iv else None, interview_mode=iv.interview_mode if iv else None,
        interview_location=iv.meeting_link if iv else None, interview_recommendation=iv.recommendation if iv else None,
        home_visit_scheduled_at=hv.scheduled_date if hv else None, home_visit_type=hv.visit_type if hv else None,
        home_visit_result=hv.inspection_result if hv else None,
    )


def _assignment_query(db: Session):
    return db.query(AdoptionAssignment).options(
        joinedload(AdoptionAssignment.assignee), joinedload(AdoptionAssignment.assigner),
        joinedload(AdoptionAssignment.monitoring_log),
    )


def _can_assign(user: User, app: Adoption) -> bool:
    return user.role_id == 4 or (is_case_authority(user) and app.case_owner_id in (None, user.user_id))


# ── Case (owner + assignments) ───────────────────────────────────────────────

@router.get("/adoptions/{adoption_id}/case", response_model=CaseInfoResponse)
def get_adoption_case(adoption_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    app = _load(adoption_id, db)
    if not can_view_adoption(current_user, app, db):
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    rows = _assignment_query(db).filter(AdoptionAssignment.adoption_id == adoption_id).order_by(AdoptionAssignment.assigned_at.asc()).all()
    closed = is_case_closed(app)
    return CaseInfoResponse(
        adoption_id=app.adoption_id, case_owner_id=app.case_owner_id,
        case_owner_name=app.case_owner.name if app.case_owner else None, case_owner_assigned_at=app.case_owner_assigned_at,
        is_owner=app.case_owner_id == current_user.user_id,
        can_claim=(not closed and app.case_owner_id is None and is_case_authority(current_user) and current_user.role_id == 3
                   and app.applicant_id != current_user.user_id),
        can_assign=not closed and _can_assign(current_user, app) and app.applicant_id != current_user.user_id,
        assignments=[_assignment_out(a) for a in rows],
    )


@router.post("/adoptions/{adoption_id}/claim", response_model=CaseInfoResponse)
def claim_adoption_case(adoption_id: int, request: Request, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_staff_or_admin)):
    """The barangay's Head Officer takes responsibility for the application (atomic; second claimer gets 409)."""
    app = _load(adoption_id, db)
    require_base_access(app, current_user, db)
    if current_user.role_id != 3 or not is_case_authority(current_user):
        raise HTTPException(status_code=403, detail="Only the Barangay Head Officer can claim an adoption case.")
    if is_case_closed(app):
        raise HTTPException(status_code=409, detail="This application is closed.")
    lock_adoption(app, db)
    db.refresh(app)
    if app.case_owner_id == current_user.user_id:
        return get_adoption_case(adoption_id, db, current_user)
    if app.case_owner_id is not None:
        raise HTTPException(status_code=409, detail="This case already has an owner. Use transfer instead.")
    record_ownership(db, app, current_user, "Claimed", current_user)
    db.commit()
    log_activity(db=db, action="ADOPTION_CASE_CLAIMED", target_table="adoptions", target_id=adoption_id,
                 description=f"{current_user.name} claimed adoption case #{adoption_id}.", user_id=current_user.user_id,
                 log_type="operation", request=request)
    return get_adoption_case(adoption_id, db, current_user)


@router.post("/adoptions/{adoption_id}/transfer", response_model=CaseInfoResponse)
def transfer_adoption_case(adoption_id: int, req: TransferRequest, request: Request, db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_staff_or_admin)):
    """Owner or Admin hands the case to another Head Officer of the same barangay (reason required)."""
    app = _load(adoption_id, db)
    require_base_access(app, current_user, db)
    if not (current_user.role_id == 4 or app.case_owner_id == current_user.user_id):
        raise HTTPException(status_code=403, detail="Only the case owner or an Administrator can transfer this case.")
    target = db.query(User).filter(User.user_id == req.to_user_id).first()
    if (not target or target.role_id != 3 or not target.is_head_officer or (target.status or "Active") != "Active"
            or target.barangay_id != adoption_barangay_id(app, db) or target.user_id == app.applicant_id):
        raise HTTPException(status_code=400, detail="A case can only be transferred to an active Head Officer of this barangay.")
    lock_adoption(app, db)
    previous = app.case_owner_id
    record_ownership(db, app, target, "Transferred" if current_user.user_id == previous else "Takeover", current_user, req.reason)
    notify(db, target.user_id, "adoption_case_transferred", adoption_id, "Adoption case transferred to you",
           f"{current_user.name} transferred {app.full_name}'s adoption application to you. Reason: {req.reason}")
    if previous and previous not in (target.user_id, current_user.user_id):
        notify(db, previous, "adoption_case_transferred", adoption_id, "Adoption case transferred",
               f"{current_user.name} transferred {app.full_name}'s adoption application to {target.name}. Reason: {req.reason}")
    db.commit()
    log_activity(db=db, action="ADOPTION_CASE_TRANSFERRED", target_table="adoptions", target_id=adoption_id,
                 description=f"Case #{adoption_id} owner {previous} -> {target.user_id} by {current_user.name}: {req.reason}",
                 user_id=current_user.user_id, log_type="operation", request=request)
    return get_adoption_case(adoption_id, db, current_user)


@router.get("/adoptions/{adoption_id}/assignable-staff", response_model=List[StaffOption])
def list_assignable_staff(adoption_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    """Valid assignment targets for this application (same barangay, active, not the applicant) with open-task load."""
    app = _load(adoption_id, db)
    if not can_view_adoption(current_user, app, db):
        raise HTTPException(status_code=404, detail="Adoption application not found.")
    barangay_id = adoption_barangay_id(app, db)
    if barangay_id is None:
        return []
    staff = (
        db.query(User).options(joinedload(User.position))
        .filter(User.role_id == 3, User.barangay_id == barangay_id, User.status == "Active", User.user_id != app.applicant_id)
        .order_by(User.is_head_officer.desc(), User.name.asc()).all()
    )
    loads = dict(
        db.query(AdoptionAssignment.assigned_to, func.count(AdoptionAssignment.assignment_id))
        .filter(AdoptionAssignment.status.in_(ADOPTION_OPEN_ASSIGNMENT_STATUSES))
        .group_by(AdoptionAssignment.assigned_to).all()
    )
    return [StaffOption(user_id=u.user_id, name=u.name, position_name=u.position.position_name if u.position else None,
                        is_head_officer=bool(u.is_head_officer), open_tasks=int(loads.get(u.user_id, 0))) for u in staff]


@router.post("/adoptions/{adoption_id}/assignments", response_model=AssignmentResponse)
def create_assignment(adoption_id: int, req: AssignmentCreateRequest, request: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_staff_or_admin)):
    """Owner / Admin assigns (or reassigns) a task to a staff member. An unowned case is claimed by the Head Officer."""
    app = _load(adoption_id, db)
    require_base_access(app, current_user, db)
    ensure_owner(app, current_user, db, auto_action="Claimed")
    target = db.query(User).filter(User.user_id == req.assigned_to).first()
    asg = assign_task(db, app, req.task_type, target, current_user, scheduled_at=req.scheduled_at, due_at=req.due_at,
                      monitoring_log_id=req.monitoring_log_id, remarks=req.remarks)
    db.commit()
    log_activity(db=db, action="ADOPTION_TASK_ASSIGNED", target_table="adoption_assignments", target_id=asg.assignment_id,
                 description=f"{current_user.name} assigned {req.task_type} on adoption #{adoption_id} to {target.name}.",
                 user_id=current_user.user_id, log_type="operation", request=request)
    return _assignment_out(_assignment_query(db).filter(AdoptionAssignment.assignment_id == asg.assignment_id).first())


# ── My tasks (assignee) ─────────────────────────────────────────────────────

def _my_assignment(assignment_id: int, user: User, db: Session) -> AdoptionAssignment:
    asg = _assignment_query(db).filter(AdoptionAssignment.assignment_id == assignment_id).first()
    if not asg or asg.assigned_to != user.user_id:
        raise HTTPException(status_code=404, detail="Task not found.")
    return asg


@router.get("/adoption-tasks/mine", response_model=List[MyTaskResponse])
def list_my_tasks(scope: str = "open", db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    """scope: open (Assigned/Accepted/In_Progress) | done (Completed) | all (incl. declined/cancelled/reassigned)."""
    statuses = {"open": ADOPTION_OPEN_ASSIGNMENT_STATUSES, "done": ("Completed",)}.get(scope)
    q = _assignment_query(db).filter(AdoptionAssignment.assigned_to == current_user.user_id)
    if statuses:
        q = q.filter(AdoptionAssignment.status.in_(statuses))
    rows = q.order_by(AdoptionAssignment.assigned_at.desc()).limit(500).all()
    out: List[MyTaskResponse] = []
    for a in rows:
        app = _load(a.adoption_id, db)
        if not in_adoption_barangay(current_user, app, db):
            continue  # moved barangay: never leak another barangay's case
        base = _assignment_out(a).model_dump()
        out.append(MyTaskResponse(**base, adoption=_summary(app),
                                  can_act=a.status in ("Accepted", "In_Progress") and not is_case_closed(app)))
    return out


@router.get("/adoption-tasks/count")
def count_my_new_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_staff_or_admin)):
    """Badge: tasks waiting for acceptance + accepted tasks still open."""
    rows = dict(
        db.query(AdoptionAssignment.status, func.count(AdoptionAssignment.assignment_id))
        .filter(AdoptionAssignment.assigned_to == current_user.user_id,
                AdoptionAssignment.status.in_(ADOPTION_OPEN_ASSIGNMENT_STATUSES))
        .group_by(AdoptionAssignment.status).all()
    )
    return {"new": int(rows.get("Assigned", 0)), "open": int(sum(rows.values()))}


@router.post("/adoption-tasks/{assignment_id}/accept", response_model=AssignmentResponse)
def accept_my_task(assignment_id: int, request: Request, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_staff_or_admin)):
    asg = _my_assignment(assignment_id, current_user, db)
    if is_case_closed(asg.adoption):
        raise HTTPException(status_code=409, detail="This application is closed.")
    lock_adoption(asg.adoption, db)
    accept_task(db, asg, current_user)
    db.commit()
    log_activity(db=db, action="ADOPTION_TASK_ACCEPTED", target_table="adoption_assignments", target_id=assignment_id,
                 description=f"{current_user.name} accepted {asg.task_type} on adoption #{asg.adoption_id}.",
                 user_id=current_user.user_id, log_type="operation", request=request)
    return _assignment_out(asg)


@router.post("/adoption-tasks/{assignment_id}/decline", response_model=AssignmentResponse)
def decline_my_task(assignment_id: int, req: DeclineRequest, request: Request, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_staff_or_admin)):
    asg = _my_assignment(assignment_id, current_user, db)
    lock_adoption(asg.adoption, db)
    decline_task(db, asg, current_user, req.reason)
    db.commit()
    log_activity(db=db, action="ADOPTION_TASK_DECLINED", target_table="adoption_assignments", target_id=assignment_id,
                 description=f"{current_user.name} declined {asg.task_type} on adoption #{asg.adoption_id}: {req.reason}",
                 user_id=current_user.user_id, log_type="operation", request=request)
    return _assignment_out(asg)


@router.post("/adoption-tasks/{assignment_id}/cancel", response_model=AssignmentResponse)
def cancel_assignment(assignment_id: int, req: ReasonRequest, request: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_staff_or_admin)):
    """Owner / Admin withdraws a task."""
    asg = _assignment_query(db).filter(AdoptionAssignment.assignment_id == assignment_id).first()
    if not asg:
        raise HTTPException(status_code=404, detail="Task not found.")
    app = asg.adoption
    require_base_access(app, current_user, db)
    if not _can_assign(current_user, app):
        raise HTTPException(status_code=403, detail="Only the case owner or an Administrator can cancel a task.")
    lock_adoption(app, db)
    cancel_task(db, asg, current_user, req.reason)
    db.commit()
    log_activity(db=db, action="ADOPTION_TASK_CANCELLED", target_table="adoption_assignments", target_id=assignment_id,
                 description=f"{current_user.name} cancelled {asg.task_type} on adoption #{asg.adoption_id}.",
                 user_id=current_user.user_id, log_type="operation", request=request)
    return _assignment_out(asg)
