"""
Case workflow, end to end over HTTP (routes/cases.py, routes/warnings.py, routes/barangay_referrals.py):
access, transitions, assessment, closure and reopening, referrals that never close a case, follow-ups, contact logs,
reversible links, subdivision settings and server-side warning eligibility.

Offline: throwaway SQLite, a tiny FastAPI app per router set, never app.main. Run from the backend folder:
    python tests/test_case_lifecycle.py
"""
import os
import sys
import tempfile

import _offline_env  # noqa: F401  (blanks every credential that could reach an outside service)
from datetime import datetime, timedelta
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "case_lifecycle.db")
os.environ.setdefault("JWT_SECRET_KEY", "case-lifecycle-test-secret-key-0123456789-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.barangay_referral import BarangayReferral  # noqa: E402
from app.models.case_records import CaseFollowUp, CaseLink  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.owner_followup import OwnerFollowUp  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus, StatusHistory  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.routes import barangay_referrals, cases, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
check_run = run_case_alignment(engine)          # seeds the six categories on a fresh database
assert check_run["errors"] == [], check_run

api = FastAPI()
for router in (cases.router, warnings.router, barangay_referrals.router):
    api.include_router(router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()

PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


for rid, name in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=name))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Homes")])
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
db.commit()


def user(name, role, subdivision=1):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@lifecycle.test", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


resident = user("Resident One", 1)
resident2 = user("Resident Two", 1)
owner = user("Owner Olive", 1)
other_sub_resident = user("Far Resident", 1, subdivision=2)
leader = user("Leader One", 2)
leader_b = user("Leader Bee", 2)
other_leader = user("Leader Two", 2, subdivision=2)
admin = user("Admin One", 4)
brgy = user("Head Reyes", 3)


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


def cat(name):
    return db.query(ReportCategory).filter(ReportCategory.category_name == name).one().category_id


NUISANCE, FOUND, LOST, INJURED, SAFETY = (cat("Animal Nuisance"), cat("Found / Unidentified Animal"), cat("Lost Pet"),
                                          cat("Injured / Distressed Animal"), cat("Animal Safety Concern"))


def mk(category=NUISANCE, subdivision=1, status=1, **extra):
    r = Report(user_id=resident.user_id, subdivision_id=subdivision, category_id=category, current_status_id=status,
               animal_type="Dog", latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2", **extra)
    db.add(r)
    db.commit()
    return r.report_id


def fresh(model, key):
    db.expire_all()
    return db.get(model, key)


def get_case(rid, u=leader):
    return client.get(f"/cases/{rid}", headers=H(u))


def case_status(rid):
    return fresh(Report, rid).case_status


def audit_actions(rid):
    db.expire_all()
    return [a.action for a in db.query(AuditLog).filter(AuditLog.target_id == rid, AuditLog.target_table == "reports").order_by(AuditLog.log_id).all()]


# ============================================================================================================
# A. Access
# ============================================================================================================
r1 = mk()
check("not signed in: refused", client.get(f"/cases/{r1}").status_code in (401, 403))
check("a resident can't open a case", get_case(r1, resident).status_code == 403)
check("a Subdivision Leader of ANOTHER subdivision can't", get_case(r1, other_leader).status_code == 403)
check("Barangay staff (retired) can't", get_case(r1, brgy).status_code == 403)
check("the leader of the subdivision can", get_case(r1, leader).status_code == 200)
check("the Administrator can", get_case(r1, admin).status_code == 200)
check("a missing report is 404", get_case(99999).status_code == 404)
body = get_case(r1).json()
check("a new case reads: reported, normal priority, no animal record needed, no closure",
      body["case_status"] == "reported" and body["priority"] == "normal" and body["identity"]["pet_id"] is None and body["closure"] is None and body["identity"]["status"] == "unidentified", body)
check("the category is read as one of the six", body["category"]["family"] == "nuisance" and body["category"]["label"] == "Animal Nuisance")
check("allowed moves from reported: under_review, in_progress", body["allowed_moves"] == ["in_progress", "under_review"] and body["can_reopen"] is False)
check("a resident gets nothing from the writes either", client.post(f"/cases/{r1}/status", json={"to": "under_review"}, headers=H(resident)).status_code == 403
      and client.put(f"/cases/{r1}/assessment", json={"incident": "verified"}, headers=H(resident)).status_code == 403)

# ============================================================================================================
# B. Transitions (enforced on the server)
# ============================================================================================================
rt = mk()
res = client.post(f"/cases/{rt}/status", json={"to": "in_progress", "note": "urgent coordination"}, headers=H(leader))
check("reported -> in_progress is allowed (an urgent case can be coordinated first)", res.status_code == 200 and res.json()["case_status"] == "in_progress", res.text)
check("...and the legacy status follows (Under Observation = 7 reads as in progress)", fresh(Report, rt).current_status_id == 7)
check("in_progress -> reported is refused (409: a legal status, an illegal move)", client.post(f"/cases/{rt}/status", json={"to": "reported"}, headers=H(leader)).status_code == 409)
res = client.post(f"/cases/{rt}/status", json={"to": "in_progress"}, headers=H(leader))
check("a move to the status it already has is refused", res.status_code == 409, res.text)
check("closing is not a manual move (it needs a disposition)", client.post(f"/cases/{rt}/status", json={"to": "closed"}, headers=H(leader)).status_code == 422)
res = client.post(f"/cases/{rt}/status", json={"to": "under_review"}, headers=H(leader))
check("in_progress -> under_review is allowed", res.status_code == 200 and fresh(Report, rt).current_status_id == 2)
hist = [h.remarks for h in db.query(StatusHistory).filter(StatusHistory.report_id == rt).order_by(StatusHistory.history_id).all()]
check("the timeline gets neutral lines only (residents can read them)", hist == ["Case status changed to In progress.", "Case status changed to Under review."], hist)
check("the audit log records who moved it", audit_actions(rt) == ["CASE_STATUS_CHANGED", "CASE_STATUS_CHANGED"])

# an assigned case is the assigned officer's to update
ra = mk(assigned_leader_id=leader.user_id)
check("another leader of the same subdivision can read an assigned case", get_case(ra, leader_b).status_code == 200)
check("...but not update it", client.post(f"/cases/{ra}/status", json={"to": "under_review"}, headers=H(leader_b)).status_code == 403)
check("the assigned leader can", client.post(f"/cases/{ra}/status", json={"to": "under_review"}, headers=H(leader)).status_code == 200)
check("the Administrator can update any case", client.post(f"/cases/{ra}/status", json={"to": "in_progress"}, headers=H(admin)).status_code == 200)

# ============================================================================================================
# C. Assessment
# ============================================================================================================
rs = mk()
res = client.put(f"/cases/{rs}/assessment", json={
    "incident": "verified", "incident_basis": "Seen on site by the guard and the officer.", "evidence_sufficiency": "sufficient",
    "evidence_reviewed": ["photo-1", "photo-2"], "urgency": "immediate", "urgency_note": "Dog lunged at a child", "notes": "Internal note",
    "identity": {"status": "possible_match", "note": "Looks like a registered dog"}}, headers=H(leader))
body = res.json()
check("saving the assessment works and moves a Reported case to Under review", res.status_code == 200 and body["case_status"] == "under_review", res.text)
check("it records incident, evidence, urgency and identity",
      body["assessment"]["incident"] == "verified" and body["assessment"]["evidence_sufficiency"] == "sufficient"
      and body["assessment"]["urgency"] == "immediate" and body["identity"]["status"] == "possible_match" and body["assessment"]["saved_by"] == leader.user_id, body["assessment"])
check("immediate risk reads as an Urgent priority, stored as High for legacy screens", body["priority"] == "urgent" and fresh(Report, rs).priority_level == "High")
check("the legacy verification column matches (legacy screens keep working)", fresh(Report, rs).verification_status == "verified_true" and fresh(Report, rs).verified_by_user_id == leader.user_id)
check("no registered animal was needed for any of this", fresh(Report, rs).pet_id is None)
res = client.put(f"/cases/{rs}/assessment", json={"urgency": "none"}, headers=H(leader))
check("a later save changes only what is sent (incident stays verified)", res.json()["assessment"]["incident"] == "verified" and res.json()["assessment"]["urgency"] == "none" and res.json()["priority"] == "high")

def own(status, **kw):
    return {"ownership": {"status": status, **kw}}

check("confirming ownership needs an owner", client.put(f"/cases/{rs}/assessment", json=own("confirmed", evidence=["photos"]), headers=H(leader)).status_code == 422)
check("pet registration alone can't confirm ownership (it is owner-declared)", client.put(f"/cases/{rs}/assessment", json=own("confirmed", owner_user_id=owner.user_id, evidence=["registry"]), headers=H(leader)).status_code == 422)
check("...nor can no evidence at all", client.put(f"/cases/{rs}/assessment", json=own("confirmed", owner_user_id=owner.user_id), headers=H(leader)).status_code == 422)
check("unknown evidence is refused", client.put(f"/cases/{rs}/assessment", json=own("confirmed", owner_user_id=owner.user_id, evidence=["vibes"]), headers=H(leader)).status_code == 422)
check("the owner must be a resident account", client.put(f"/cases/{rs}/assessment", json=own("confirmed", owner_user_id=leader.user_id, evidence=["photos"]), headers=H(leader)).status_code == 422)
res = client.put(f"/cases/{rs}/assessment", json=own("confirmed", owner_user_id=owner.user_id, evidence=["registry", "markings"], note="Markings match."), headers=H(leader))
check("registry plus one other piece of evidence confirms ownership", res.status_code == 200 and res.json()["ownership"]["status"] == "confirmed" and res.json()["ownership"]["owner_user_id"] == owner.user_id, res.text)
check("a case can be assessed with an unverifiable incident too", client.put(f"/cases/{mk()}/assessment", json={"incident": "unverified", "evidence_sufficiency": "needs_more"}, headers=H(leader)).status_code == 200)

# a sensitive flag takes a public report private
rp = mk(visibility="Public", visibility_decided_by=leader.user_id)
client.put(f"/cases/{rp}/assessment", json={"is_sensitive": True}, headers=H(leader))
check("marking a case sensitive makes a public report private again", fresh(Report, rp).is_sensitive is True and fresh(Report, rp).visibility == "Private")

# priority
rpri = mk()
res = client.put(f"/cases/{rpri}/priority", json={"priority": "urgent", "reason": "bite reported"}, headers=H(leader))
check("priority urgent = immediate risk on a High case", res.json()["priority"] == "urgent" and fresh(Report, rpri).urgency_level == "immediate")
res = client.put(f"/cases/{rpri}/priority", json={"priority": "low", "reason": "resolved on site"}, headers=H(leader))
check("lowering it lifts the immediate risk (to 'possible'), and keeps the reason in the audit log",
      res.json()["priority"] == "low" and fresh(Report, rpri).urgency_level == "possible" and "CASE_PRIORITY_CHANGED" in audit_actions(rpri))

# ============================================================================================================
# D. Settings, policies and warning eligibility (server side)
# ============================================================================================================
check("settings default: no policies, six categories on, 7-day follow-ups, review before publishing",
      client.get("/cases/settings/1", headers=H(leader)).json() == {
          "categories": {k: True for k in ("lost_pet", "found_animal", "nuisance", "safety", "injured", "other")}, "policies": [],
          "followups": {"default_days": 7, "min_days": 0, "max_days": 90}, "publication": {"lost_pet": "review", "found_animal": "review"},
          "office": {"address": "", "phone": "", "email": "", "hours": ""}})
check("a resident can't read the settings", client.get("/cases/settings/1", headers=H(resident)).status_code == 403)
check("another subdivision's leader can't", client.get("/cases/settings/1", headers=H(other_leader)).status_code == 403)
check("duplicate policy ids are refused", client.put("/cases/settings/1", json={"policies": [
    {"id": "p1", "title": "A", "reference": "R1", "applies_to": ["nuisance"], "status": "confirmed"},
    {"id": "p1", "title": "B", "reference": "R2", "applies_to": ["nuisance"], "status": "confirmed"}]}, headers=H(leader)).status_code == 422)
check("follow-up days must be ordered (min <= default <= max)", client.put("/cases/settings/1", json={"followups": {"default_days": 2, "min_days": 5, "max_days": 10}}, headers=H(leader)).status_code == 422)
check("an unknown category id is refused", client.put("/cases/settings/1", json={"categories": {"dragons": True}}, headers=H(leader)).status_code == 422)


def warn(report_id, owner_user=owner, **extra):
    payload = {"user_id": owner_user.user_id, "report_id": report_id, "warning_level": "1st Warning",
               "violation_type": "Free-Roaming Unleashed", "description": "Keep your dog inside the property."}
    payload.update(extra)
    return client.post("/warnings/", json=payload, headers=H(extra.pop("by", None) or leader) if False else H(leader))


def eligible_case(category=NUISANCE, **kw):
    """A case that has everything but a policy: open, a verified incident, a confirmed owner."""
    rid = mk(category=category, **kw)
    res = client.put(f"/cases/{rid}/assessment", json={"incident": "verified", **own("confirmed", owner_user_id=owner.user_id, evidence=["photos"])}, headers=H(leader))
    assert res.status_code == 200, res.text
    return rid


plain = mk()
res = warn(plain)
check("a warning on a case with no verified incident and no confirmed owner is refused (409), whatever the screen shows", res.status_code == 409 and "confirmed owner" in res.text, res.text)
no_incident = mk()
client.put(f"/cases/{no_incident}/assessment", json=own("confirmed", owner_user_id=owner.user_id, evidence=["photos"]), headers=H(leader))
res = warn(no_incident)
check("...a confirmed owner without a verified incident is refused too", res.status_code == 409 and "verified incident" in res.text, res.text)
no_owner = mk()
client.put(f"/cases/{no_owner}/assessment", json={"incident": "verified"}, headers=H(leader))
res = warn(no_owner)
check("...and a verified incident without a confirmed owner", res.status_code == 409 and "confirmed owner" in res.text, res.text)
ready = eligible_case()
res = warn(ready)
check("with owner and incident but NO policy: refused, and it says what to configure", res.status_code == 409 and "No confirmed policy" in res.text, res.text)
check("the eligibility endpoint says the same", client.get(f"/cases/{ready}/warning-eligibility", headers=H(leader)).json() == {"ok": False, "reason": "No confirmed policy applies to this concern."})

client.put("/cases/settings/1", json={"policies": [
    {"id": "pending", "title": "Roaming rule", "reference": "Ord. 5", "applies_to": ["nuisance"], "observation_days": 3, "status": "pending_confirmation"}]}, headers=H(leader))
res = warn(ready)
check("a policy still pending confirmation does not count", res.status_code == 409 and "No confirmed policy" in res.text, res.text)
client.put("/cases/settings/1", json={"policies": [
    {"id": "other", "title": "Safety rule", "reference": "Ord. 9", "applies_to": ["safety"], "observation_days": 3, "status": "confirmed"}]}, headers=H(leader))
check("a confirmed policy for a DIFFERENT concern does not count", warn(ready).status_code == 409)

lost = mk(category=LOST)
client.put(f"/cases/{lost}/assessment", json={"incident": "verified", **own("confirmed", owner_user_id=owner.user_id, evidence=["photos"])}, headers=H(leader))
res = warn(lost)
check("a lost-pet case can never carry an owner warning", res.status_code == 409 and "do not apply" in res.text, res.text)

# a confirmed policy with NO observation period: nothing is assumed
client.put("/cases/settings/1", json={"policies": [
    {"id": "roam", "title": "Roaming animals", "reference": "Ord. 5 s.2", "applies_to": ["nuisance", "safety"], "observation_days": None, "status": "confirmed"}]}, headers=H(leader))
res = warn(ready, fine_amount=0)
check("with a confirmed policy that applies: the warning is issued", res.status_code == 200, res.text)
w = db.query(OwnerWarning).filter(OwnerWarning.report_id == ready).one()
check("it records the policy it was issued under", (w.policy_id, w.policy_title, w.policy_reference) == ("roam", "Roaming animals", "Ord. 5 s.2"))
check("the policy defines no observation period, so NONE is started and none is assumed (no 3 days)",
      w.observation_days is None and w.follow_up_at is None and db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == ready).count() == 0)
check("a warning is case work: the case is In progress", case_status(ready) == "in_progress" and fresh(Report, ready).current_status_id == 7)
check("no fine is ever worked out by the system", float(w.fine_amount) == 0.0)

# a policy WITH a period: the observation runs for the policy's days
client.put("/cases/settings/1", json={"policies": [
    {"id": "roam", "title": "Roaming animals", "reference": "Ord. 5 s.2", "applies_to": ["nuisance"], "observation_days": 5, "status": "confirmed"}]}, headers=H(leader))
ready2 = eligible_case()
res = warn(ready2)
check("with a 5-day policy the warning is issued", res.status_code == 200, res.text)
fu = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == ready2).one()
w2 = db.query(OwnerWarning).filter(OwnerWarning.report_id == ready2).one()
check("the observation runs for the policy's days, not for 3", fu.duration_days == 5 and w2.observation_days == 5 and "5 day" in (fu.notes or ""), (fu.duration_days, fu.notes))
check("the warning's follow-up date is exactly 5 days after the warning (on the database clock)", w2.follow_up_at is not None and abs((w2.follow_up_at - w2.created_at).total_seconds() - 5 * 86400) < 5, (w2.created_at, w2.follow_up_at))

# several confirmed policies: the issuer must choose
client.put("/cases/settings/1", json={"policies": [
    {"id": "a", "title": "Rule A", "reference": "A", "applies_to": ["nuisance"], "observation_days": 2, "status": "confirmed"},
    {"id": "b", "title": "Rule B", "reference": "B", "applies_to": ["nuisance"], "observation_days": 7, "status": "confirmed"}]}, headers=H(leader))
ready3 = eligible_case()
res = warn(ready3)
check("two policies apply: the issuer must choose one (422)", res.status_code == 422 and "policy_id" in res.text, res.text)
check("an unknown policy is 404", warn(ready3, policy_id="zzz").status_code == 404)
res = warn(ready3, policy_id="b")
check("choosing a policy issues the warning under it", res.status_code == 200 and db.query(OwnerWarning).filter(OwnerWarning.report_id == ready3).one().observation_days == 7, res.text)

# the confirmed owner is the one who is warned; a closed case can't be warned
wrong = eligible_case()
res = warn(wrong, owner_user=resident2, policy_id="a")
check("the warning must go to the confirmed owner", res.status_code == 409 and "confirmed for this case" in res.text, res.text)
closed_case = eligible_case()
client.post(f"/cases/{closed_case}/close", json={"disposition": "unresolved_other", "reason": "Closed for the test."}, headers=H(leader))
res = warn(closed_case, policy_id="a")
check("a closed case can't be warned", res.status_code == 409 and "closed" in res.text, res.text)
check("only the Subdivision Leader issues warnings (an Administrator is refused, as before)", client.post("/warnings/", json={
    "user_id": owner.user_id, "report_id": wrong, "warning_level": "1st Warning", "violation_type": "Other", "description": "x"}, headers=H(admin)).status_code == 403)
old = OwnerWarning(user_id=owner.user_id, report_id=plain, issued_by=leader.user_id, warning_level="Notice", violation_type="Other", description="old", status="Acknowledged")
db.add(old)
db.commit()
old_view = client.get(f"/warnings/{old.warning_id}", headers=H(leader)).json()
check("...an old warning reads with empty policy fields and its own status", old_view["policy_id"] is None and old_view["observation_days"] is None and old_view["status"] == "Acknowledged", old_view)

# reset to a simple policy for what follows
client.put("/cases/settings/1", json={"policies": [{"id": "roam", "title": "Roaming animals", "reference": "Ord. 5 s.2", "applies_to": ["nuisance", "safety"], "observation_days": None, "status": "confirmed"}]}, headers=H(leader))

# ============================================================================================================
# E. Closure
# ============================================================================================================
rc = mk()
client.put(f"/cases/{rc}/assessment", json={"incident": "verified"}, headers=H(leader))
opts = client.get(f"/cases/{rc}/closure-options", headers=H(leader)).json()["options"]
avail = {o["disposition"]: o["available"] for o in opts}
check("closure options: the simple ones are available, the ones that need proof are not",
      avail["resolved_intervention"] and avail["unresolved_other"] and avail["invalid_report"] and not avail["pet_recovered"]
      and not avail["owner_compliance"] and not avail["handed_off"] and not avail["duplicate_report"], avail)
for d, why in (("pet_recovered", "lost-pet"), ("owner_compliance", "compliant"), ("handed_off", "referral"), ("duplicate_report", "Link")):
    res = client.post(f"/cases/{rc}/close", json={"disposition": d, "reason": "trying it out"}, headers=H(leader))
    check(f"closing as '{d}' without its proof is refused", res.status_code == 409 and why in res.text, res.text)
check("a reason is required", client.post(f"/cases/{rc}/close", json={"disposition": "resolved_intervention", "reason": "no"}, headers=H(leader)).status_code == 422)
check("an unknown disposition is refused", client.post(f"/cases/{rc}/close", json={"disposition": "vibes", "reason": "because"}, headers=H(leader)).status_code == 422)
check("a resident can't close", client.post(f"/cases/{rc}/close", json={"disposition": "resolved_intervention", "reason": "because"}, headers=H(resident)).status_code == 403)

# open items at closure: a pending follow-up, an open referral, an owner observation
client.post(f"/cases/{rc}/followups", json={"title": "Check the gate again", "due_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(leader))
ref = client.post(f"/cases/{rc}/referrals", json={"org_type": "veterinary", "org_name": "City Vet Office", "reason": "Needs a check-up", "contact_method": "phone"}, headers=H(leader))
fu_obs = OwnerFollowUp(report_id=rc, subdivision_id=1, leader_id=leader.user_id, owner_id=owner.user_id, status="observing", due_at=datetime.now() + timedelta(days=3), duration_days=3)
db.add(fu_obs)
db.commit()
res = client.post(f"/cases/{rc}/close", json={"disposition": "resolved_intervention", "reason": "The owner secured the gate; the dog no longer roams.",
                                              "post_closure_check_at": (datetime.now() + timedelta(days=14)).isoformat()}, headers=H(leader))
check("closing with a disposition and a reason works", res.status_code == 200 and res.json()["case"]["case_status"] == "closed", res.text)
case = res.json()["case"]
check("the closure says what happened, and that it was a resolution",
      case["closure"]["disposition"] == "resolved_intervention" and case["closure"]["outcome"] == "resolved" and case["closure"]["reason"].startswith("The owner secured")
      and case["closure"]["closed_by"] == leader.user_id and case["closure"]["closed_at"] is not None and case["closure"]["derived_from_legacy_status"] is False, case["closure"])
check("the legacy status is the disposition's (Incident Resolved = 11)", fresh(Report, rc).current_status_id == 11)
check("pending follow-ups ended with the case; the post-closure check is scheduled",
      [f["status"] for f in case["followups"] if f["kind"] == "follow_up"] == ["cancelled"] and [f["status"] for f in case["followups"] if f["kind"] == "post_closure"] == ["pending"], case["followups"])
check("the owner observation was closed by the central closure hook", fresh(OwnerFollowUp, fu_obs.followup_id).status == "closed")
check("the referral is NOT changed by closing (it is the case's own history)", case["referrals"][0]["status"] == "sent" and case["referrals"][0]["is_open"] is True)
remarks_rc = [h.remarks for h in db.query(StatusHistory).filter(StatusHistory.report_id == rc).order_by(StatusHistory.history_id).all()]
check("the timeline line is neutral: the label, never the reason (residents can read the timeline)",
      "Case closed: Concern resolved through intervention." in remarks_rc and not any("secured the gate" in (x or "") for x in remarks_rc), remarks_rc)
audit_row = db.query(AuditLog).filter(AuditLog.action == "CASE_CLOSED", AuditLog.target_id == rc).one()
check("the audit entry keeps the reason and what was left open",
      audit_row.new_values["reason"].startswith("The owner secured") and audit_row.new_values["open_items_left_behind"]["referrals"] == 1 and audit_row.new_values["followups_ended"] == 1, audit_row.new_values)
check("the reporter is told it was closed", db.query(Notification).filter(Notification.user_id == resident.user_id, Notification.related_id == rc, Notification.title.like("%closed%")).count() == 1)
check("a closed case can't be closed again", client.post(f"/cases/{rc}/close", json={"disposition": "unresolved_other", "reason": "again please"}, headers=H(leader)).status_code == 409)
check("...nor assessed, referred, followed up or moved",
      client.put(f"/cases/{rc}/assessment", json={"urgency": "none"}, headers=H(leader)).status_code == 409
      and client.post(f"/cases/{rc}/referrals", json={"org_type": "other", "org_name": "Somebody", "reason": "abc"}, headers=H(leader)).status_code == 409
      and client.post(f"/cases/{rc}/followups", json={"title": "Another one"}, headers=H(leader)).status_code == 409
      and client.post(f"/cases/{rc}/status", json={"to": "under_review"}, headers=H(leader)).status_code == 409)
# an unresolved closure is a normal, documented outcome
ru = mk()
client.post(f"/cases/{ru}/referrals", json={"org_type": "animal_control", "org_name": "Animal Control", "reason": "Needs trapping", "contact_method": "phone"}, headers=H(leader))
res = client.post(f"/cases/{ru}/close", json={"disposition": "handed_off", "reason": "Animal Control took over; nothing left for us."}, headers=H(leader))
check("a case can be closed as handed off (unresolved), once a referral is on record", res.status_code == 200 and res.json()["case"]["closure"]["outcome"] == "unresolved" and fresh(Report, ru).current_status_id == 17, res.text)
ri = mk()
res = client.post(f"/cases/{ri}/close", json={"disposition": "invalid_report", "reason": "Nothing was there when we checked."}, headers=H(leader))
check("an invalid report closes straight from Reported", res.status_code == 200 and res.json()["case"]["closure"]["outcome"] == "invalid" and fresh(Report, ri).current_status_id == 14, res.text)
rl = mk(category=LOST)
res = client.post(f"/cases/{rl}/close", json={"disposition": "pet_recovered", "reason": "Back home safely."}, headers=H(leader))
check("a lost pet can be closed as recovered (Claimed by Owner = 9)", res.status_code == 200 and fresh(Report, rl).current_status_id == 9, res.text)
check("keep the follow-ups: end_open_items=false leaves them pending", (lambda rid: (
    client.post(f"/cases/{rid}/followups", json={"title": "Keep me going", "due_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(leader)),
    client.post(f"/cases/{rid}/close", json={"disposition": "unresolved_other", "reason": "Closing but keeping the check.", "end_open_items": False}, headers=H(leader)),
    db.query(CaseFollowUp).filter(CaseFollowUp.report_id == rid, CaseFollowUp.kind == "follow_up").one().status)[2] == "pending")(mk()))
check("a post-closure check must be in the future", client.post(f"/cases/{mk()}/close", json={"disposition": "unresolved_other", "reason": "Closing it now.", "post_closure_check_at": (datetime.now() - timedelta(days=1)).isoformat()}, headers=H(leader)).status_code == 422)

# the merged duplicate can't be closed or reopened here
merged = mk(status=18, duplicate_of_report_id=rc)
check("a merged duplicate can't be worked on here", client.post(f"/cases/{merged}/close", json={"disposition": "duplicate_report", "reason": "It is merged."}, headers=H(leader)).status_code == 409)

# ---- reopening ----------------------------------------------------------------------------------------
check("a resident can't reopen", client.post(f"/cases/{rc}/reopen", json={"reason": "I want it back"}, headers=H(resident)).status_code == 403)
check("another subdivision's leader can't", client.post(f"/cases/{rc}/reopen", json={"reason": "Not my case at all"}, headers=H(other_leader)).status_code == 403)
check("a reason is required", client.post(f"/cases/{rc}/reopen", json={"reason": "no"}, headers=H(leader)).status_code == 422)
check("only a closed case can be reopened", client.post(f"/cases/{rt}/reopen", json={"reason": "it is not closed"}, headers=H(leader)).status_code == 409)
res = client.post(f"/cases/{rc}/reopen", json={"reason": "The dog is roaming again; a neighbour sent a photo."}, headers=H(leader_b))
check("authorized staff of the subdivision can reopen (any leader of it)", res.status_code == 200 and res.json()["case_status"] == "under_review", res.text)
reopened = res.json()
check("the case is open again: no closure, reopened once, legacy status Verified (2)", reopened["closure"] is None and reopened["reopened_count"] == 1
      and reopened["last_reopen_reason"].startswith("The dog is roaming") and fresh(Report, rc).current_status_id == 2 and fresh(Report, rc).closed_at is None)
audit_row = db.query(AuditLog).filter(AuditLog.action == "CASE_REOPENED", AuditLog.target_id == rc).one()
check("the audit log keeps the closure that was undone", audit_row.old_values["disposition"] == "resolved_intervention" and audit_row.old_values["closure_reason"].startswith("The owner secured"), audit_row.old_values)
check("the earlier referral and the post-closure check are still there", len(reopened["referrals"]) == 1 and any(f["kind"] == "post_closure" for f in reopened["followups"]))
res = client.post(f"/cases/{rc}/close", json={"disposition": "unresolved_other", "reason": "Closed once more."}, headers=H(leader))
check("it can be closed again, and the count of reopenings stays", res.status_code == 200 and fresh(Report, rc).reopened_count == 1)
client.post(f"/cases/{rc}/reopen", json={"reason": "Second reopening for the test."}, headers=H(admin))
check("the Administrator can reopen too; the count goes to 2", fresh(Report, rc).reopened_count == 2)

# ============================================================================================================
# F. Referrals: any organisation, several per case, never closing it
# ============================================================================================================
rr = mk()
res = client.post(f"/cases/{rr}/referrals", json={"org_type": "animal_control", "org_name": "Animal Control Personnel", "reason": "Aggressive dog loose near the school",
                                                  "contact_method": "phone", "contact_person": "Officer Cruz", "contact_detail": "0917 000 0000", "is_urgent": True,
                                                  "notes": "Called at 9am"}, headers=H(leader))
check("an urgent safety referral goes first: no assessment, no animal record, case still 'reported'", res.status_code == 201 and res.json()["is_urgent"] is True and res.json()["status"] == "sent", res.text)
check("...and the case moves to In progress, not to Closed", case_status(rr) == "in_progress")
res = client.post(f"/cases/{rr}/referrals", json={"org_type": "veterinary", "org_name": "City Veterinary Office", "reason": "Vaccination status unknown", "contact_method": "message"}, headers=H(leader))
check("a second referral to another organisation is allowed", res.status_code == 201)
check("an open referral to the same organisation is not duplicated", client.post(f"/cases/{rr}/referrals", json={"org_type": "animal_control", "org_name": "animal control personnel", "reason": "again, please"}, headers=H(leader)).status_code == 409)
check("a barangay referral without a name uses the subdivision's barangay",
      client.post(f"/cases/{rr}/referrals", json={"org_type": "barangay", "reason": "Peace and order complaint", "contact_method": "in_person"}, headers=H(leader)).json()["org_name"] == "Barangay San Vicente")
check("an organisation needs a name", client.post(f"/cases/{rr}/referrals", json={"org_type": "wildlife", "reason": "A hawk in the yard"}, headers=H(leader)).status_code == 422)
refs = client.get(f"/cases/{rr}/referrals", headers=H(leader)).json()
check("a case lists all its referrals, newest first", [r["org_type"] for r in refs] == ["barangay", "veterinary", "animal_control"] and refs[2]["updates"][0]["note"] == "Called at 9am")
vet = next(r for r in refs if r["org_type"] == "veterinary")
res = client.post(f"/cases/{rr}/referrals/{vet['referral_id']}/updates", json={
    "status": "completed", "note": "Vet confirmed the dog is vaccinated.", "external_outcome": "Vaccinated, owner known to the vet.",
    "remaining_follow_up": "Confirm the owner keeps the dog fenced", "follow_up_at": (datetime.now() + timedelta(days=10)).isoformat()}, headers=H(leader))
check("the organisation finishing its part completes THE REFERRAL", res.status_code == 200 and res.json()["status"] == "completed" and res.json()["external_outcome"].startswith("Vaccinated"), res.text)
check("...and does NOT close or change the case", case_status(rr) == "in_progress" and fresh(Report, rr).closure_disposition is None and fresh(Report, rr).closed_at is None)
check("what is left becomes a follow-up linked to the referral", db.query(CaseFollowUp).filter(CaseFollowUp.report_id == rr, CaseFollowUp.kind == "referral_check", CaseFollowUp.referral_id == vet["referral_id"]).count() == 1)
check("a completed referral no longer counts as open; the others still do", client.get(f"/cases/{rr}", headers=H(leader)).json()["open_items"]["referrals"] == 2)
check("another case's referral can't be updated through this one", client.post(f"/cases/{r1}/referrals/{vet['referral_id']}/updates", json={"status": "declined", "note": "wrong case"}, headers=H(leader)).status_code == 404)
res = client.post(f"/cases/{rr}/referrals", json={"org_type": "veterinary", "org_name": "City Veterinary Office", "reason": "A second look next month"}, headers=H(leader))
check("after one is completed, a new referral to the same organisation is allowed (history is kept)", res.status_code == 201 and db.query(BarangayReferral).filter(BarangayReferral.report_id == rr).count() == 4)

# the legacy Barangay URLs keep working on the same records
rb = mk(status=2)
res = client.post(f"/reports/{rb}/referral", json={"reason": "Stray needs pickup", "contact_method": "call"}, headers=H(leader))
check("legacy: a Barangay referral on a Verified case works with no animal record", res.status_code == 201 and res.json()["org_type"] == "barangay" and res.json()["referral_status"] == "sent" and res.json()["org_name"] == "Barangay San Vicente", res.text)
check("legacy: it still marks the case 'Referred to Barangay' (4), which reads as In progress", fresh(Report, rb).current_status_id == 4 and case_status(rb) == "in_progress")
check("legacy: a second OPEN Barangay referral is refused", client.post(f"/reports/{rb}/referral", json={"reason": "again", "contact_method": "call"}, headers=H(leader)).status_code == 409)
rid_b = res.json()["referral_id"]
res = client.post(f"/referrals/{rid_b}/outcome", json={"final_outcome": "resolved", "outcome_date": datetime.now().date().isoformat(), "note": "Barangay says it is sorted"}, headers=H(leader))
check("legacy: a reported outcome is recorded and completes the referral", res.status_code == 200 and res.json()["final_outcome"] == "resolved" and res.json()["referral_status"] == "completed", res.text)
check("legacy: ...but the CASE keeps its status and stays open (no automatic closure)", fresh(Report, rb).current_status_id == 4 and case_status(rb) == "in_progress" and fresh(Report, rb).closed_at is None)
res = client.post(f"/reports/{rb}/referral", json={"reason": "Second attempt after the first was completed", "contact_method": "visit"}, headers=H(leader))
check("legacy: once the earlier one is completed, another can be made (the one-per-report limit is gone)", res.status_code == 201 and db.query(BarangayReferral).filter(BarangayReferral.report_id == rb).count() == 2)
check("legacy: the latest Barangay referral is the one returned", client.get(f"/reports/{rb}/referral", headers=H(leader)).json()["reason"].startswith("Second attempt"))
check("legacy: open_only lists only open referrals", all(r["referral_status"] != "completed" for r in client.get("/referrals/?open_only=true", headers=H(leader)).json()))

# ============================================================================================================
# G. Follow-ups and contact logs
# ============================================================================================================
rf = mk()
res = client.post(f"/cases/{rf}/followups", json={"title": "Check on the gate"}, headers=H(leader))
check("a follow-up without a date uses the subdivision's default period (7 days)", res.status_code == 201 and abs((datetime.fromisoformat(res.json()["due_at"]) - datetime.now()).total_seconds() - 7 * 86400) < 3600, res.text)
check("recording a follow-up moves a Reported case to Under review", case_status(rf) == "under_review")
check("a due date in the past is refused", client.post(f"/cases/{rf}/followups", json={"title": "Too late", "due_at": (datetime.now() - timedelta(days=1)).isoformat()}, headers=H(leader)).status_code == 400)
check("beyond the configured maximum is refused", client.post(f"/cases/{rf}/followups", json={"title": "Far away", "due_at": (datetime.now() + timedelta(days=120)).isoformat()}, headers=H(leader)).status_code == 400)
client.put("/cases/settings/1", json={"policies": [], "followups": {"default_days": 3, "min_days": 1, "max_days": 10}}, headers=H(leader))
res = client.post(f"/cases/{rf}/followups", json={"title": "Under the new default"}, headers=H(leader))
check("the period is configurable: a new default applies", abs((datetime.fromisoformat(res.json()["due_at"]) - datetime.now()).total_seconds() - 3 * 86400) < 3600)
check("...and so are the bounds (min 1 day, max 10 days)", client.post(f"/cases/{rf}/followups", json={"title": "Too soon", "due_at": (datetime.now() + timedelta(hours=2)).isoformat()}, headers=H(leader)).status_code == 400
      and client.post(f"/cases/{rf}/followups", json={"title": "Too far", "due_at": (datetime.now() + timedelta(days=11)).isoformat()}, headers=H(leader)).status_code == 400)
done = client.post(f"/cases/{rf}/followups", json={"kind": "site_check", "title": "Visited the street", "notes": "No dog seen", "done_now": True}, headers=H(leader)).json()
check("something already done can be recorded as done", done["status"] == "done" and done["due_at"] is None and done["completion_note"] == "No dog seen")
fid = res.json()["followup_id"]
check("completing a follow-up", client.post(f"/cases/{rf}/followups/{fid}/complete", json={"note": "Spoke to the guard"}, headers=H(leader)).json()["status"] == "done")
check("...twice is refused", client.post(f"/cases/{rf}/followups/{fid}/complete", json={}, headers=H(leader)).status_code == 409)
fid2 = client.post(f"/cases/{rf}/followups", json={"title": "Will not be needed", "due_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(leader)).json()["followup_id"]
check("cancelling one keeps the reason", client.post(f"/cases/{rf}/followups/{fid2}/cancel", json={"reason": "Owner moved away"}, headers=H(leader)).json()["cancel_reason"] == "Owner moved away")
check("another leader's subdivision can't touch it", client.post(f"/cases/{rf}/followups/{fid2}/cancel", json={}, headers=H(other_leader)).status_code == 403)
client.put("/cases/settings/1", json={"policies": [{"id": "roam", "title": "Roaming animals", "reference": "Ord. 5 s.2", "applies_to": ["nuisance", "safety"], "observation_days": None, "status": "confirmed"}]}, headers=H(leader))

rk = mk()
res = client.post(f"/cases/{rk}/contacts", json={"method": "phone", "with_whom": "Mr. Santos (the owner)", "summary": "Said the dog is not his.", "outcome": "denied_ownership",
                                                 "next_step_at": (datetime.now() + timedelta(days=3)).isoformat()}, headers=H(leader))
check("a contact log is recorded", res.status_code == 201 and res.json()["outcome"] == "denied_ownership")
check("a denial of ownership is recorded as a DISPUTE, not as anything harsher; the case stays open", fresh(Report, rk).ownership_status == "disputed" and case_status(rk) == "under_review")
check("a next step becomes a follow-up", db.query(CaseFollowUp).filter(CaseFollowUp.report_id == rk, CaseFollowUp.title.like("Follow up with Mr. Santos%")).count() == 1)
check("a contact in the future is refused", client.post(f"/cases/{rk}/contacts", json={"method": "phone", "with_whom": "Someone", "summary": "Will call later", "contact_at": (datetime.now() + timedelta(days=2)).isoformat()}, headers=H(leader)).status_code == 422)
rk2 = eligible_case()
client.post(f"/cases/{rk2}/contacts", json={"method": "in_person", "with_whom": "Olive Owner", "summary": "Denied it was hers", "outcome": "denied_ownership"}, headers=H(leader))
check("a denial never overturns an ownership that was confirmed with evidence", fresh(Report, rk2).ownership_status == "confirmed")
check("contacts are listed, newest first", len(client.get(f"/cases/{rk}/contacts", headers=H(leader)).json()) == 1)

# ============================================================================================================
# H. Links between related reports: reversible, nothing hidden or merged
# ============================================================================================================
la, lb, lc = mk(), mk(), mk()
other_sub_report = mk(subdivision=2)
res = client.post(f"/cases/{la}/links", json={"report_ids": [lb, lc], "link_type": "same_incident", "note": "Same dog, same morning"}, headers=H(leader))
check("two reports about the same thing can be linked", res.status_code == 201 and len(res.json()) == 2, res.text)
check("linking again changes nothing (no duplicate rows)", len(client.post(f"/cases/{la}/links", json={"report_ids": [lb]}, headers=H(leader)).json()) == 1 and db.query(CaseLink).count() == 2)
check("the link shows from both sides", [x["report_id"] for x in client.get(f"/cases/{lb}/links", headers=H(leader)).json()] == [la])
check("nothing is hidden or merged: both reports keep their status, visibility and no duplicate pointer",
      all(fresh(Report, x).duplicate_of_report_id is None and fresh(Report, x).current_status_id == 1 and fresh(Report, x).visibility != "Hidden" for x in (la, lb, lc)))
check("a report can't be linked to itself", client.post(f"/cases/{la}/links", json={"report_ids": [la]}, headers=H(leader)).status_code == 422)
check("a missing report is 404", client.post(f"/cases/{la}/links", json={"report_ids": [99999]}, headers=H(leader)).status_code == 404)
check("a report of another subdivision can't be linked (the leader has no access to it)", client.post(f"/cases/{la}/links", json={"report_ids": [other_sub_report]}, headers=H(leader)).status_code == 403)
check("...even the Administrator can't link across subdivisions", client.post(f"/cases/{la}/links", json={"report_ids": [other_sub_report]}, headers=H(admin)).status_code == 422)
link_id = client.get(f"/cases/{la}/links", headers=H(leader)).json()[0]["link_id"]
check("unlinking needs a reason", client.post(f"/cases/{la}/links/{link_id}/unlink", json={"reason": ""}, headers=H(leader)).status_code == 422)
res = client.post(f"/cases/{la}/links/{link_id}/unlink", json={"reason": "Turned out to be two different dogs"}, headers=H(leader))
check("a link can be undone, with its reason", res.status_code == 200 and res.json()["reason"].startswith("Turned out"))
check("...the row is kept (history), the reports are untouched", db.query(CaseLink).count() == 2 and fresh(CaseLink, link_id).unlinked_by == leader.user_id and fresh(Report, lb).current_status_id == 1)
check("...and it no longer shows as an active link", len(client.get(f"/cases/{la}/links", headers=H(leader)).json()) == 1)
check("unlinking twice is refused", client.post(f"/cases/{la}/links/{link_id}/unlink", json={"reason": "again please"}, headers=H(leader)).status_code == 409)
check("the same pair can be linked again later (a new row)", client.post(f"/cases/{la}/links", json={"report_ids": [lb]}, headers=H(leader)).status_code == 201 and db.query(CaseLink).count() == 3)
res = client.post(f"/cases/{la}/close", json={"disposition": "duplicate_report", "reason": "Covered by the linked report."}, headers=H(leader))
check("once linked, a case can be closed as a duplicate (it is closed, not merged or hidden)", res.status_code == 200 and fresh(Report, la).duplicate_of_report_id is None and fresh(Report, la).current_status_id == 14, res.text)

# ============================================================================================================
# I. Categories
# ============================================================================================================
res = client.get("/cases/categories", headers=H(resident))
check("any resident can read the six categories their subdivision accepts", res.status_code == 200 and [c["id"] for c in res.json()["categories"]] == ["lost_pet", "found_animal", "nuisance", "safety", "injured", "other"] and all(c["enabled"] for c in res.json()["categories"]))
client.put("/cases/settings/1", json={"categories": {"nuisance": False}}, headers=H(leader))
check("a category the subdivision turned off shows as off", [c["enabled"] for c in client.get("/cases/categories", headers=H(resident)).json()["categories"] if c["id"] == "nuisance"] == [False])
check("a resident can't read another subdivision's", client.get("/cases/categories?subdivision_id=2", headers=H(resident)).status_code == 403)
client.put("/cases/settings/1", json={"categories": {"nuisance": True}}, headers=H(leader))

print(f"\n{PASSED} checks passed")
