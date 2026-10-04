"""
Adoption case ownership + task assignments (claim, assign, accept/decline, assessor = assignee, monitoring).
Throwaway SQLite DB, real JWT auth.  Run from the backend folder:  python tests/test_adoption_tasks.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "adoption_tasks_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-tasks-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import (  # noqa: E402
    Adoption, AdoptionAssignment, AdoptionHomeVisit, AdoptionInterview, AdoptionMonitoringLog,
    AdoptionOwnershipHistory, HoldingAnimal, Report,
)
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoption_tasks, adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api.include_router(adoption_tasks.router)
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

db.add_all([Barangay(barangay_id=1, barangay_name="Brgy One", city="C"), Barangay(barangay_id=2, barangay_name="Brgy Two", city="C")])
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"), Subdivision(subdivision_id=2, barangay_id=2, subdivision_name="S2")])
db.flush()


def mk_user(name, role_id, **kw):
    u = User(name=name, email=f"{name.lower().replace(' ', '.')}@test-mail.com", password="x", role_id=role_id,
             is_verified=True, status=kw.pop("status", "Active"), **kw)
    db.add(u)
    db.flush()
    return u


applicant = mk_user("Applicant", 1, subdivision_id=1, barangay_id=1)
head = mk_user("Head One", 3, barangay_id=1, is_head_officer=True)
tanod1 = mk_user("Tanod One", 3, barangay_id=1)
tanod2 = mk_user("Tanod Two", 3, barangay_id=1)
inactive = mk_user("Tanod Inactive", 3, barangay_id=1, status="Inactive")
outsider = mk_user("Tanod Other Brgy", 3, barangay_id=2)
leader = mk_user("Leader", 2, subdivision_id=1, barangay_id=1)
admin = mk_user("Admin", 4)
db.commit()
T = {u.user_id: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}
     for u in (applicant, head, tanod1, tanod2, inactive, outsider, leader, admin)}
WHEN, LATER = "2026-10-20T10:00:00", "2026-10-22T14:30:00"


def mk_adoption(stage="Interview", status="Approved", **kw):
    rep = Report(user_id=applicant.user_id, subdivision_id=1, category_id=1, latitude=1, longitude=1)
    db.add(rep)
    db.flush()
    animal = HoldingAnimal(report_id=rep.report_id, animal_name="Bantay", animal_type="Dog", facility_status=6)
    db.add(animal)
    db.flush()
    ad = Adoption(holding_id=animal.holding_id, applicant_id=applicant.user_id, status=status, full_name="Applicant",
                  address="Blk 1", contact_no="0900", reason="r" * 25, current_stage=stage, **kw)
    db.add(ad)
    db.commit()
    return ad.adoption_id


results = []


def check(label, ok, extra=""):
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def fresh(model, **filters):
    db.expire_all()
    return db.query(model).filter_by(**filters).first()


def notifs(user, kind):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == user.user_id, Notification.type == kind).all()


# ── 1. Claim / ownership ─────────────────────────────────────────────────────
A = mk_adoption()
check("Tanod cannot claim a case", client.post(f"/adoptions/{A}/claim", headers=T[tanod1.user_id]).status_code == 403)
check("Subdivision Leader cannot claim", client.post(f"/adoptions/{A}/claim", headers=T[leader.user_id]).status_code == 403)
r = client.post(f"/adoptions/{A}/claim", headers=T[head.user_id])
check("Head Officer claims the case", r.status_code == 200 and r.json()["case_owner_id"] == head.user_id and r.json()["is_owner"], r.text[:200])
check("claim is idempotent for the owner", client.post(f"/adoptions/{A}/claim", headers=T[head.user_id]).status_code == 200)
check("ownership history row written", fresh(AdoptionOwnershipHistory, adoption_id=A, action="Claimed") is not None)

# ── 2. Assigning: target validation ─────────────────────────────────────────
def assign(who_token, target_id, task="Interview", ad=A, **extra):
    return client.post(f"/adoptions/{ad}/assignments", json={"task_type": task, "assigned_to": target_id, **extra}, headers=T[who_token])


check("Tanod cannot assign tasks", assign(tanod1.user_id, tanod2.user_id).status_code == 403)
check("cannot assign staff of another barangay", assign(head.user_id, outsider.user_id).status_code == 400)
check("cannot assign an inactive staff member", assign(head.user_id, inactive.user_id).status_code == 400)
check("cannot assign a Subdivision Leader", assign(head.user_id, leader.user_id).status_code == 400)
check("cannot assign the applicant", assign(head.user_id, applicant.user_id).status_code == 400)
r = client.get(f"/adoptions/{A}/assignable-staff", headers=T[head.user_id])
ids = {s["user_id"] for s in r.json()}
check("assignable-staff lists only active same-barangay staff", r.status_code == 200 and {head.user_id, tanod1.user_id, tanod2.user_id} == ids, ids)

# ── 3. Issue #1 regression: the picked interviewer is stored (not the scheduler) ──
r = client.post(f"/adoptions/{A}/interview/schedule", json={"scheduled_at": WHEN, "interview_mode": "In-Person", "interviewer_id": tanod1.user_id},
                headers=T[head.user_id])
check("owner schedules the interview and assigns Tanod One", r.status_code == 200, r.text[:200])
check("interviewer_id is the ASSIGNED staff, not the Head Officer who scheduled",
      r.status_code == 200 and r.json()["interviewer_id"] == tanod1.user_id and r.json()["interviewer_name"] == "Tanod One", r.text[:200])
asg = fresh(AdoptionAssignment, adoption_id=A, task_type="Interview")
check("assignment created as Assigned with the schedule", asg and asg.status == "Assigned" and asg.assigned_to == tanod1.user_id and asg.scheduled_at is not None)
check("Tanod One notified of the new task", len(notifs(tanod1, "adoption_task_assigned")) == 1)

# ── 4. My tasks: accept / decline ───────────────────────────────────────────
r = client.get("/adoption-tasks/mine", headers=T[tanod1.user_id])
mine = r.json()
check("Tanod One sees the task with schedule + applicant", r.status_code == 200 and len(mine) == 1 and mine[0]["adoption"]["applicant_name"] == "Applicant"
      and mine[0]["can_act"] is False, r.text[:300])
check("task count badge = 1 new", client.get("/adoption-tasks/count", headers=T[tanod1.user_id]).json() == {"new": 1, "open": 1})
check("Tanod Two cannot see or accept Tanod One's task",
      client.post(f"/adoption-tasks/{asg.assignment_id}/accept", headers=T[tanod2.user_id]).status_code == 404)
r = client.post(f"/adoptions/{A}/interview/evaluate", json={"interview_result": "Successful"}, headers=T[tanod1.user_id])
check("assignee must accept before recording (409)", r.status_code == 409, r.text[:160])
r = client.post(f"/adoption-tasks/{asg.assignment_id}/accept", headers=T[tanod1.user_id])
check("Tanod One accepts", r.status_code == 200 and r.json()["status"] == "Accepted", r.text[:160])
check("owner notified of acceptance", len(notifs(head, "adoption_task_accepted")) == 1)
check("accepting twice -> 409", client.post(f"/adoption-tasks/{asg.assignment_id}/accept", headers=T[tanod1.user_id]).status_code == 409)

# Tanod One can now view the case (assigned); Tanod Two cannot
check("assignee can open the dossier", client.get(f"/adoptions/{A}/dossier", headers=T[tanod1.user_id]).status_code == 200)
check("unassigned Tanod Two cannot open the dossier", client.get(f"/adoptions/{A}/dossier", headers=T[tanod2.user_id]).status_code == 403)
apps1 = {a["adoption_id"] for a in client.get("/adoptions/applications", headers=T[tanod1.user_id]).json()}
apps2 = {a["adoption_id"] for a in client.get("/adoptions/applications", headers=T[tanod2.user_id]).json()}
check("Barangay list: Tanod One sees the assigned case, Tanod Two does not", A in apps1 and A not in apps2, (apps1, apps2))
check("Head Officer still sees every barangay case", A in {a["adoption_id"] for a in client.get("/adoptions/applications", headers=T[head.user_id]).json()})

# Assignee reschedules their own interview (cannot change the interviewer)
r = client.post(f"/adoptions/{A}/interview/schedule", json={"scheduled_at": LATER, "interviewer_id": tanod1.user_id}, headers=T[tanod1.user_id])
check("assignee can reschedule their interview", r.status_code == 200 and r.json()["scheduled_at"].startswith("2026-10-22"), r.text[:160])
r = client.post(f"/adoptions/{A}/interview/schedule", json={"scheduled_at": LATER, "interviewer_id": tanod2.user_id}, headers=T[tanod1.user_id])
check("assignee cannot hand the interview to someone else", r.status_code == 403, r.status_code)

# ── 5. Assessor = assignee; unsuccessful result is only a recommendation ─────
check("Tanod Two cannot record the interview", client.post(f"/adoptions/{A}/interview/evaluate", json={}, headers=T[tanod2.user_id]).status_code == 403)
r = client.post(f"/adoptions/{A}/interview/evaluate", json={"interview_result": "Unsuccessful", "questions_discussed": "Care plan",
                "applicant_responses": "Vague", "additional_observations": "No fence"}, headers=T[tanod1.user_id])
ad = fresh(Adoption, adoption_id=A)
iv = fresh(AdoptionInterview, adoption_id=A)
check("assignee records the interview", r.status_code == 200, r.text[:200])
check("UNSUCCESSFUL by an assignee does NOT reject the application", ad.status == "Approved" and ad.application_stage_status == "Interview_Unsuccessful_Pending_Decision", (ad.status, ad.application_stage_status))
check("owner notified: decision needed", len(notifs(head, "adoption_decision_needed")) == 1)
check("structured assessment stored + evaluated_by = assignee",
      iv.questions_discussed == "Care plan" and iv.applicant_responses == "Vague" and iv.evaluated_by == tanod1.user_id and iv.interviewer_id == tanod1.user_id)
check("interview task completed", fresh(AdoptionAssignment, assignment_id=asg.assignment_id).status == "Completed")
check("owner notified of completion", len(notifs(head, "adoption_task_completed")) == 1)
r = client.post(f"/adoptions/{A}/interview/evaluate", json={"interview_result": "Successful"}, headers=T[tanod1.user_id])
check("assignee may correct their completed record (now Successful -> Home Visit)", r.status_code == 200 and fresh(Adoption, adoption_id=A).current_stage == "Home_Visit", r.text[:160])

# ── 6. Decline + reassign ───────────────────────────────────────────────────
r = assign(head.user_id, tanod2.user_id, task="Home_Visit")
hv_asg_id = r.json()["assignment_id"]
check("decline needs a reason", client.post(f"/adoption-tasks/{hv_asg_id}/decline", json={"reason": ""}, headers=T[tanod2.user_id]).status_code == 422)
r = client.post(f"/adoption-tasks/{hv_asg_id}/decline", json={"reason": "On leave that week"}, headers=T[tanod2.user_id])
check("Tanod Two declines with a reason", r.status_code == 200 and r.json()["status"] == "Declined")
check("owner notified of the decline", len(notifs(head, "adoption_task_declined")) == 1)
r = client.post(f"/adoptions/{A}/home-visit/schedule", json={"scheduled_date": WHEN, "visit_type": "Physical", "inspector_id": tanod1.user_id},
                headers=T[head.user_id])
check("owner reassigns the home visit to Tanod One via the schedule form", r.status_code == 200 and r.json()["inspector_id"] == tanod1.user_id, r.text[:200])
hv_asg = fresh(AdoptionAssignment, adoption_id=A, task_type="Home_Visit", status="Assigned")
client.post(f"/adoption-tasks/{hv_asg.assignment_id}/accept", headers=T[tanod1.user_id])
r = client.post(f"/adoptions/{A}/home-visit/schedule", json={"scheduled_date": LATER, "visit_type": "Physical", "reschedule_reason": "Adopter request"},
                headers=T[tanod1.user_id])
hv = fresh(AdoptionHomeVisit, adoption_id=A)
check("assignee reschedules the home visit (count + reason tracked)", r.status_code == 200 and hv.reschedule_count == 1 and hv.reschedule_reason == "Adopter request", r.text[:200])
r = client.post(f"/adoptions/{A}/home-visit/evaluate", json={"inspection_result": "Suitable", "overall_suitability": "Suitable",
                "residence_condition": "Good", "presence_of_hazards": "None", "existing_pets": "1 cat"}, headers=T[tanod1.user_id])
hv = fresh(AdoptionHomeVisit, adoption_id=A)
check("assignee records the home-visit assessment (structured)", r.status_code == 200 and hv.residence_condition == "Good"
      and hv.existing_pets == "1 cat" and hv.evaluated_by == tanod1.user_id, r.text[:200])
check("View Assessment: response returns the structured fields", r.json().get("residence_condition") == "Good" and r.json().get("evaluated_by_name") == "Tanod One")
check("home-visit task completed", fresh(AdoptionAssignment, assignment_id=hv_asg.assignment_id).status == "Completed")

r = assign(head.user_id, tanod2.user_id, task="Interview")
check("a COMPLETED task cannot be assigned again (409)", r.status_code == 409 and "already completed" in r.text, f"{r.status_code} {r.text[:120]}")

# ── 7. Reassignment marks the old assignment Reassigned ─────────────────────
B = mk_adoption()
assign(head.user_id, tanod1.user_id, task="Verification", ad=B)
r = assign(head.user_id, tanod2.user_id, task="Verification", ad=B)
db.expire_all()
rows = db.query(AdoptionAssignment).filter(AdoptionAssignment.adoption_id == B, AdoptionAssignment.task_type == "Verification").all()
check("reassigning: old -> Reassigned, new -> Assigned (one active)", sorted(a.status for a in rows) == ["Assigned", "Reassigned"], [a.status for a in rows])
check("previous assignee notified of the reassignment", len(notifs(tanod1, "adoption_task_reassigned")) == 1)
check("case auto-claimed by the Head Officer on first assignment", fresh(Adoption, adoption_id=B).case_owner_id == head.user_id)

# ── 8. Rejection closes open tasks ──────────────────────────────────────────
r = client.put(f"/adoptions/review/{B}", json={"decision": "Rejected", "review_notes": "Not eligible"}, headers=T[head.user_id])
db.expire_all()
check("rejecting the application cancels open tasks", r.status_code == 200 and all(
    a.status in ("Cancelled", "Reassigned") for a in db.query(AdoptionAssignment).filter(AdoptionAssignment.adoption_id == B)), r.text[:160])
check("cannot assign on a closed case", assign(head.user_id, tanod1.user_id, task="Interview", ad=B).status_code == 409)

# ── 9. Monitoring: assigned staff must assess before success ─────────────────
M = mk_adoption(stage="Monitoring", staff_handed_over=True, is_handed_over=True)
db.add(AdoptionMonitoringLog(adoption_id=M, milestone_name="Day_7", due_date=date.today(), status="Submitted"))
db.commit()
mon = assign(head.user_id, tanod2.user_id, task="Monitoring", ad=M).json()
r = client.post(f"/adoptions/{M}/successful/proceed", headers=T[head.user_id])
check("cannot mark successful before the assigned monitor's assessment (409)", r.status_code == 409, r.text[:160])
client.post(f"/adoption-tasks/{mon['assignment_id']}/accept", headers=T[tanod2.user_id])
check("other staff cannot record the monitoring visit",
      client.post(f"/adoptions/{M}/monitoring/record", json={}, headers=T[tanod1.user_id]).status_code == 403)
r = client.post(f"/adoptions/{M}/monitoring/record", json={"animal_condition": "Healthy", "living_condition": "Good",
                "assessment_result": "Satisfactory", "remarks": "Pet thriving"}, headers=T[tanod2.user_id])
log = fresh(AdoptionMonitoringLog, adoption_id=M, entry_type="Staff_Visit")
check("assigned monitor records a structured assessment", r.status_code == 200 and log and log.assessed_by == tanod2.user_id
      and log.assessment_result == "Satisfactory" and log.animal_condition == "Healthy", r.text[:200])
check("monitoring task in progress (spans the whole period)", fresh(AdoptionAssignment, assignment_id=mon["assignment_id"]).status == "In_Progress")
r = client.post(f"/adoptions/{M}/successful/proceed", headers=T[head.user_id])
check("successful allowed after the assessment", r.status_code == 200, r.text[:160])
check("closing the case completes the monitoring task", fresh(AdoptionAssignment, assignment_id=mon["assignment_id"]).status == "Completed")

# ── 10. Owner cancels a task ────────────────────────────────────────────────
C = mk_adoption()
c_asg = assign(head.user_id, tanod1.user_id, task="Interview", ad=C).json()
check("assignee cannot cancel", client.post(f"/adoption-tasks/{c_asg['assignment_id']}/cancel", json={}, headers=T[tanod1.user_id]).status_code == 403)
r = client.post(f"/adoption-tasks/{c_asg['assignment_id']}/cancel", json={"reason": "Wrong person"}, headers=T[head.user_id])
check("owner cancels the task", r.status_code == 200 and r.json()["status"] == "Cancelled")
check("case info shows owner + assignment history",
      client.get(f"/adoptions/{C}/case", headers=T[head.user_id]).json()["assignments"][0]["status"] == "Cancelled")

passed = sum(results)
print(f"\n{passed}/{len(results)} adoption task checks passed")
db.close()
sys.exit(0 if passed == len(results) else 1)
