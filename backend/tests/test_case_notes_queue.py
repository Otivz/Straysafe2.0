"""
The three reads and one write the approved Admin screens added on top of the case workflow (routes/cases.py):

  GET/POST /cases/{id}/notes   internal staff notes: staff only, scoped like the case, never in the resident-visible timeline
  GET /cases/work-queue        the open follow-ups, claims, referrals and warnings of OPEN cases, in the caller's scope
  GET /cases/summaries         one short row per case, paged and filterable by status, in the caller's scope

and that the SQL status filter reads an old row (no case_status yet) the way utils/case_state reads it.

Offline: a throwaway SQLite file through tests/_isolated_db.py, a tiny FastAPI app, never app.main and never the configured
database. Run from the backend folder:
    python tests/test_case_notes_queue.py
"""
import _isolated_db  # noqa: F401  (FIRST: a throwaway SQLite file, offline, the MySQL driver disabled)

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.routes import cases, lost_pet_alerts  # noqa: E402

api = _isolated_db.build_app(cases.router, lost_pet_alerts.router)
ids = _isolated_db.create_schema_and_seed()

from app.database import SessionLocal  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.barangay_referral import BarangayReferral  # noqa: E402
from app.models.case_records import CaseFollowUp, OwnershipClaim  # noqa: E402
from app.models.report import Report, ReportCategory, ReportMedia, StatusHistory  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.utils import case_state  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
PASSED = 0


def check(label, condition, info=""):
    global PASSED
    assert condition, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def H(u):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id, "is_verified": True})}


def user(name, role, subdivision):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@notes.test", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subdivision, barangay_id=1)
    db.add(u)
    db.commit()
    return u


resident = db.get(User, ids["resident"])
leader = db.get(User, ids["leader"])
staff = db.get(User, ids["staff"])
admin = db.get(User, ids["admin"])
leader_b = user("Leader Bee", 2, 1)
other_leader = user("Leader Far", 2, 2)
leader_nowhere = user("Leader Nowhere", 2, None)
owner = user("Owner Olive", 1, 1)
category = db.query(ReportCategory).order_by(ReportCategory.category_id).first().category_id


def mk(subdivision=1, status=1, **extra):
    r = Report(user_id=resident.user_id, subdivision_id=subdivision, category_id=category, current_status_id=status, animal_type="Dog",
               latitude=Decimal("14.80000000"), longitude=Decimal("121.00000000"), landmark="Gate 2", description="A dog", **extra)
    db.add(r)
    db.commit()
    return r.report_id


def legacy_row(report_id):
    """Make a row look older than the case_status column: no stored case_status, only the legacy status (raw SQL skips the sync hook)."""
    db.execute(text("UPDATE reports SET case_status = NULL WHERE report_id = :i"), {"i": report_id})
    db.commit()
    db.expire_all()


R_OPEN = ids["report"]                                                   # sub 1, Reported
R_CLOSED = mk(status=11, closure_disposition="resolved_intervention", closure_reason="Owner took the dog home.")
R_LEGACY = mk(status=7)                                                  # sub 1, "Under Observation" -> in progress; no case_status
legacy_row(R_LEGACY)
R_MERGED = mk(status=18, duplicate_of_report_id=R_OPEN)
R_OTHER = mk(subdivision=2)                                              # sub 2
check("the seed reads as expected", case_state.case_status_of(db.get(Report, R_LEGACY)) == "in_progress"
      and case_state.case_status_of(db.get(Report, R_CLOSED)) == "closed" and db.get(Report, R_LEGACY).case_status is None)

# ====================================================================================================== NOTES
before_history = db.query(StatusHistory).count()
r = client.post(f"/cases/{R_OPEN}/notes", json={"text": "  Called the owner; no answer.  "}, headers=H(leader))
check("a Leader of the subdivision adds a note (201, trimmed)", r.status_code == 201 and r.json()["text"] == "Called the owner; no answer.", r.text)
note = r.json()
check("the note says who wrote it and when", note["by"] == leader.user_id and note["by_name"] == leader.name and note["at"] and note["report_id"] == R_OPEN and note["note_id"])
r = client.post(f"/cases/{R_OPEN}/notes", json={"text": "Second note."}, headers=H(admin))
check("the Administrator can add a note too", r.status_code == 201, r.text)

r = client.get(f"/cases/{R_OPEN}/notes", headers=H(leader))
texts = [n["text"] for n in r.json()["notes"]]
check("notes list newest first", r.status_code == 200 and texts == ["Second note.", "Called the owner; no answer."], str(r.json()))

check("a note is NOT written to the resident-visible timeline", db.query(StatusHistory).count() == before_history
      and db.query(StatusHistory).filter(StatusHistory.remarks.like("%Called the owner%")).count() == 0)
log = db.query(AuditLog).filter(AuditLog.action == "CASE_NOTE", AuditLog.target_id == R_OPEN).order_by(AuditLog.log_id).first()
check("it is kept in the audit log, as a case_note on the report", log is not None and log.log_type == "case_note" and log.target_table == "reports" and log.user_id == leader.user_id)
check("the case record itself does not carry the notes", "notes" not in client.get(f"/cases/{R_OPEN}", headers=H(leader)).json())

for label, body in (("an empty note", {"text": ""}), ("a blank note", {"text": "    "}), ("a note over 2000 characters", {"text": "x" * 2001}), ("no text at all", {})):
    r = client.post(f"/cases/{R_OPEN}/notes", json=body, headers=H(leader))
    check(f"{label} is refused (422)", r.status_code == 422, r.text)
r = client.post(f"/cases/{R_OPEN}/notes", json={"text": "y" * 2000}, headers=H(leader))
check("a note of exactly 2000 characters is accepted", r.status_code == 201, r.text)

check("a resident cannot read notes", client.get(f"/cases/{R_OPEN}/notes", headers=H(resident)).status_code == 403)
check("a resident cannot write notes", client.post(f"/cases/{R_OPEN}/notes", json={"text": "hi"}, headers=H(resident)).status_code == 403)
check("Barangay staff cannot read notes", client.get(f"/cases/{R_OPEN}/notes", headers=H(staff)).status_code == 403)
check("a Leader of another subdivision cannot read notes", client.get(f"/cases/{R_OPEN}/notes", headers=H(other_leader)).status_code == 403)
check("a Leader of another subdivision cannot write notes", client.post(f"/cases/{R_OPEN}/notes", json={"text": "hi"}, headers=H(other_leader)).status_code == 403)
check("no token, no notes", client.get(f"/cases/{R_OPEN}/notes").status_code in (401, 403))
check("an unknown case is 404", client.get("/cases/999999/notes", headers=H(leader)).status_code == 404
      and client.post("/cases/999999/notes", json={"text": "hi"}, headers=H(leader)).status_code == 404)

r = client.post(f"/cases/{R_CLOSED}/notes", json={"text": "Checked on them after closing."}, headers=H(leader))
check("a note can be added to a closed case", r.status_code == 201, r.text)
r = client.post(f"/cases/{R_MERGED}/notes", json={"text": "hi"}, headers=H(leader))
check("a merged duplicate takes no notes (409: work on the primary case)", r.status_code == 409, r.text)

assigned = mk()
db.get(Report, assigned).assigned_leader_id = leader.user_id
db.commit()
check("another officer's case can be read but not written by a different Leader",
      client.get(f"/cases/{assigned}/notes", headers=H(leader_b)).status_code == 200
      and client.post(f"/cases/{assigned}/notes", json={"text": "hi"}, headers=H(leader_b)).status_code == 403)
check("the assigned officer can write", client.post(f"/cases/{assigned}/notes", json={"text": "Mine."}, headers=H(leader)).status_code == 201)
db.get(Report, assigned).assigned_leader_id = None
db.commit()

# =================================================================================================== WORK QUEUE
soon = datetime.now() + timedelta(days=1)


def add_items(report_id, subdivision, tag):
    f_open = CaseFollowUp(report_id=report_id, subdivision_id=subdivision, kind="site_check", title=f"{tag} site check", status="pending", due_at=soon, created_by=leader.user_id)
    f_done = CaseFollowUp(report_id=report_id, subdivision_id=subdivision, kind="follow_up", title=f"{tag} done", status="done", created_by=leader.user_id)
    f_cancelled = CaseFollowUp(report_id=report_id, subdivision_id=subdivision, kind="follow_up", title=f"{tag} cancelled", status="cancelled", created_by=leader.user_id)
    c_open = OwnershipClaim(report_id=report_id, subdivision_id=subdivision, claimant_user_id=owner.user_id, statement=f"{tag}: that is my dog", status="submitted")
    c_rejected = OwnershipClaim(report_id=report_id, subdivision_id=subdivision, claimant_user_id=owner.user_id, statement=f"{tag}: rejected claim", status="rejected")
    rf_open = BarangayReferral(report_id=report_id, reason=f"{tag} referral", contact_method="call", org_type="veterinary", org_name="Vet", referral_status="sent")
    rf_done = BarangayReferral(report_id=report_id, reason=f"{tag} finished referral", contact_method="call", org_type="veterinary", referral_status="completed")
    w_open = OwnerWarning(user_id=owner.user_id, report_id=report_id, issued_by=leader.user_id, warning_level="1st Warning", violation_type="Other",
                          description=f"{tag} warning", policy_id="p1", policy_title="P", policy_reference="Ord. 1", observation_days=7, follow_up_at=soon)
    w_none = OwnerWarning(user_id=owner.user_id, report_id=report_id, issued_by=leader.user_id, warning_level="Notice", violation_type="Other",
                          description=f"{tag} warning without a follow-up date")
    db.add_all([f_open, f_done, f_cancelled, c_open, c_rejected, rf_open, rf_done, w_open, w_none])
    db.commit()
    return {"followup": f_open.followup_id, "claim": c_open.claim_id, "referral": rf_open.referral_id, "warning": w_open.warning_id}


open_items = add_items(R_OPEN, 1, "open")
closed_items = add_items(R_CLOSED, 1, "closed")
merged_items = add_items(R_MERGED, 1, "merged")
other_items = add_items(R_OTHER, 2, "other")


def queue(u, **params):
    return client.get("/cases/work-queue", params=params, headers=H(u))


r = queue(leader)
q = r.json()
check("the work queue is readable (the route is not shadowed by /{report_id})", r.status_code == 200 and q["subdivision_id"] == 1, r.text)
check("it lists only the OPEN follow-up of the open case", [f["followup_id"] for f in q["followups"]] == [open_items["followup"]] and q["followups"][0]["report_id"] == R_OPEN, str(q["followups"]))
check("it lists only the active claim", [c["claim_id"] for c in q["claims"]] == [open_items["claim"]] and q["claims"][0]["claimant_name"] == owner.name)
check("it lists only the open referral (with when it last changed)", [x["referral_id"] for x in q["referrals"]] == [open_items["referral"]] and q["referrals"][0]["updated_at"])
check("it lists only the warning that has a follow-up date", [w["warning_id"] for w in q["warnings"]] == [open_items["warning"]] and q["warnings"][0]["owner_name"] == owner.name)
check("nothing from the closed case, the merged duplicate or another subdivision",
      not ({closed_items["followup"], merged_items["followup"], other_items["followup"]} & {f["followup_id"] for f in q["followups"]})
      and not ({closed_items["claim"], other_items["claim"]} & {c["claim_id"] for c in q["claims"]})
      and not ({closed_items["referral"], other_items["referral"]} & {x["referral_id"] for x in q["referrals"]})
      and not ({closed_items["warning"], other_items["warning"]} & {w["warning_id"] for w in q["warnings"]}))

q = queue(admin).json()
check("the Administrator sees open work in every subdivision", q["subdivision_id"] is None and other_items["followup"] in {f["followup_id"] for f in q["followups"]}
      and open_items["followup"] in {f["followup_id"] for f in q["followups"]} and closed_items["followup"] not in {f["followup_id"] for f in q["followups"]})
q = queue(admin, subdivision_id=2).json()
check("the Administrator can narrow it to one subdivision", [f["followup_id"] for f in q["followups"]] == [other_items["followup"]] and q["subdivision_id"] == 2)
check("a Leader cannot ask for another subdivision's work", queue(leader, subdivision_id=2).status_code == 403)
check("a resident cannot read the work queue", queue(resident).status_code == 403)
check("Barangay staff cannot read the work queue", queue(staff).status_code == 403)
check("a Leader without a subdivision is refused", queue(leader_nowhere).status_code == 403)
check("no token, no work queue", client.get("/cases/work-queue").status_code in (401, 403))

# the case closes -> its open items leave the queue
db.query(CaseFollowUp).filter(CaseFollowUp.followup_id == open_items["followup"]).update({"status": "done"})
db.commit()
check("a completed follow-up leaves the queue", queue(leader).json()["followups"] == [])

# =================================================================================================== SUMMARIES
r = client.get("/cases/summaries", headers=H(leader))
s = r.json()
mine = {R_OPEN, R_CLOSED, R_LEGACY, R_MERGED, assigned}
check("the list is readable and scoped to the Leader's subdivision", r.status_code == 200 and {i["report_id"] for i in s["items"]} == mine and s["total"] == len(mine), r.text)
check("newest first", [i["report_id"] for i in s["items"]] == sorted(mine, reverse=True))
by_id = {i["report_id"]: i for i in s["items"]}
check("each row says the case status the way the case record does",
      by_id[R_OPEN]["case_status"] == "reported" and by_id[R_CLOSED]["case_status"] == "closed" and by_id[R_LEGACY]["case_status"] == "in_progress"
      and by_id[R_LEGACY]["status_label"] == "In progress" and by_id[R_MERGED]["case_status"] == "closed")
check("a closed case carries its closure", by_id[R_CLOSED]["closure"]["disposition"] == "resolved_intervention" and by_id[R_CLOSED]["closure"]["outcome"] == "resolved"
      and by_id[R_OPEN]["closure"] is None)
check("a merged duplicate says where it went", by_id[R_MERGED]["merged_into_report_id"] == R_OPEN and by_id[R_OPEN]["merged_into_report_id"] is None)
row = by_id[R_OPEN]
check("a row has what a list, the dashboard and a map need",
      row["priority"] in ("urgent", "high", "normal", "low") and row["category"]["family"] and row["animal"]["type"] == "Dog" and row["location"]["latitude"] == 14.8
      and row["reporter"]["name"] == resident.name and row["assessment"]["incident"] and row["identity_status"] and row["ownership_status"] and row["reported_at"]
      and "ownership_owner_id" in row and row["ownership_owner_id"] is None)

db.add(StatusHistory(report_id=R_OPEN, report_status_id=1, updated_by=leader.user_id, remarks="Case status changed to Under review."))
db.commit()
row = {i["report_id"]: i for i in client.get("/cases/summaries", headers=H(leader)).json()["items"]}[R_OPEN]
check("a row carries the newest timeline line (for last activity and the recent-activity feed)",
      row["last_event"]["text"] == "Case status changed to Under review." and row["last_event"]["by_name"] == leader.name and row["updated_at"] == row["last_event"]["at"])
check("a case with no timeline line has no last event and is last updated when it was reported",
      by_id[R_LEGACY]["last_event"] is None and by_id[R_LEGACY]["updated_at"] == by_id[R_LEGACY]["reported_at"])
db.add_all([ReportMedia(report_id=R_OPEN, file_url="https://example.test/paper.pdf", media_type="Document"),
            ReportMedia(report_id=R_OPEN, file_url="https://example.test/first.jpg", media_type="Image"),
            ReportMedia(report_id=R_OPEN, file_url="https://example.test/second.jpg", media_type="Image")])
db.commit()
row = {i["report_id"]: i for i in client.get("/cases/summaries", headers=H(leader)).json()["items"]}[R_OPEN]
check("the thumbnail is the first photo (a document is not one) and the count covers all media", row["thumbnail_url"] == "https://example.test/first.jpg" and row["photo_count"] == 3, str(row["thumbnail_url"]))

page1 = client.get("/cases/summaries", params={"limit": 2}, headers=H(leader)).json()
page2 = client.get("/cases/summaries", params={"limit": 2, "offset": 2}, headers=H(leader)).json()
page3 = client.get("/cases/summaries", params={"limit": 2, "offset": 4}, headers=H(leader)).json()
check("it pages (limit, offset, has_more, total)", len(page1["items"]) == 2 and page1["has_more"] and len(page2["items"]) == 2 and page2["has_more"]
      and len(page3["items"]) == 1 and not page3["has_more"] and page1["total"] == len(mine)
      and [i["report_id"] for i in page1["items"] + page2["items"] + page3["items"]] == sorted(mine, reverse=True))
check("a page is capped at 200", client.get("/cases/summaries", params={"limit": 5000}, headers=H(leader)).json()["limit"] == 200)

def ids_of(**params):
    return {i["report_id"] for i in client.get("/cases/summaries", params=params, headers=H(leader)).json()["items"]}

check("status=open leaves out closed cases", ids_of(status="open") == {R_OPEN, R_LEGACY, assigned})
check("status=closed", ids_of(status="closed") == {R_CLOSED, R_MERGED})
check("status=reported", ids_of(status="reported") == {R_OPEN, assigned})
check("status=in_progress reads an old row from its legacy status", ids_of(status="in_progress") == {R_LEGACY})
check("status=under_review", ids_of(status="under_review") == set())
check("an unknown status is refused", client.get("/cases/summaries", params={"status": "bogus"}, headers=H(leader)).status_code == 422)

check("the Administrator reads every subdivision", {R_OTHER} <= {i["report_id"] for i in client.get("/cases/summaries", params={"limit": 200}, headers=H(admin)).json()["items"]})
check("or just one", {i["report_id"] for i in client.get("/cases/summaries", params={"subdivision_id": 2}, headers=H(admin)).json()["items"]} == {R_OTHER})
check("a Leader cannot ask for another subdivision's list", client.get("/cases/summaries", params={"subdivision_id": 2}, headers=H(leader)).status_code == 403)
check("a resident cannot read the case list", client.get("/cases/summaries", headers=H(resident)).status_code == 403)
check("Barangay staff cannot read the case list", client.get("/cases/summaries", headers=H(staff)).status_code == 403)
check("a Leader without a subdivision is refused", client.get("/cases/summaries", headers=H(leader_nowhere)).status_code == 403)
check("no token, no list", client.get("/cases/summaries").status_code in (401, 403))

# ---- the SQL status filter and case_state.case_status_of must agree on every legacy status and on conflicting rows
parity = []
for legacy_id in range(1, 19):
    rid = mk(subdivision=2, status=legacy_id)
    legacy_row(rid)
    parity.append(rid)
parity.append(mk(subdivision=2, status=1, case_status="under_review"))      # stored status wins over the legacy one
parity.append(mk(subdivision=2, status=11, case_status="bogus"))            # an unknown stored value is not a status: the legacy one reads
parity.append(mk(subdivision=2, status=None, case_status="bogus"))          # nothing readable at all: Reported
db.execute(text("UPDATE reports SET current_status_id = NULL WHERE report_id = :i"), {"i": parity[-1]})
db.commit()
db.expire_all()
everything = db.query(Report).filter(Report.subdivision_id == 2).all()
for status in ("reported", "under_review", "in_progress", "closed"):
    expected = {r.report_id for r in everything if case_state.case_status_of(r) == status}
    got = {i["report_id"] for i in client.get("/cases/summaries", params={"subdivision_id": 2, "status": status, "limit": 200}, headers=H(admin)).json()["items"]}
    check(f"SQL filter == case_state for status={status} ({len(expected)} rows)", got == expected, f"{sorted(got ^ expected)}")
expected_open = {r.report_id for r in everything if case_state.case_status_of(r) != "closed"}
got_open = {i["report_id"] for i in client.get("/cases/summaries", params={"subdivision_id": 2, "status": "open", "limit": 200}, headers=H(admin)).json()["items"]}
check("SQL filter == case_state for status=open", got_open == expected_open and parity[-1] in got_open)
listed = {i["report_id"]: i["case_status"] for i in client.get("/cases/summaries", params={"subdivision_id": 2, "limit": 200}, headers=H(admin)).json()["items"]}
check("every row's own case_status equals case_state's", all(listed[r.report_id] == case_state.case_status_of(r) for r in everything))

# ============================================================================================= COMPLIANCE
from app.models.owner_followup import OwnerFollowUp  # noqa: E402

def warned_case(subdivision=1):
    """An open case with an issued warning, the end-of-observation follow-up and the legacy observation it started."""
    rid = mk(subdivision=subdivision, status=7)
    w = OwnerWarning(user_id=owner.user_id, report_id=rid, issued_by=leader.user_id, warning_level="1st Warning", violation_type="Other",
                     description="Keep the dog on a leash.", policy_id="p1", policy_title="P", policy_reference="Ord. 1", observation_days=3,
                     follow_up_at=soon, status="Pending")
    end = CaseFollowUp(report_id=rid, subdivision_id=subdivision, kind="warning_end", title="End of observation", status="pending", due_at=soon, created_by=leader.user_id)
    obs = OwnerFollowUp(report_id=rid, subdivision_id=subdivision, leader_id=leader.user_id, owner_id=owner.user_id, owner_name=owner.name,
                        status="observing", duration_days=3, due_at=soon)
    db.add_all([w, end, obs])
    db.commit()
    return rid, w.warning_id, end.followup_id, obs.followup_id


rid, wid, end_id, obs_id = warned_case()
url = f"/cases/{rid}/warnings/{wid}/observations"
r = client.post(url, json={"result": "partial", "notes": "The dog was on a leash twice this week."}, headers=H(leader))
check("a compliance observation is recorded (201)", r.status_code == 201 and r.json()["concluded"] is None and r.json()["observations"][0]["result"] == "partial", r.text)
db.expire_all()
check("recording one changes nothing else", db.get(OwnerWarning, wid).status == "Pending" and db.get(CaseFollowUp, end_id).status == "pending"
      and db.get(OwnerFollowUp, obs_id).status == "observing" and case_state.case_status_of(db.get(Report, rid)) == "in_progress")
w = client.get(f"/cases/{rid}", headers=H(leader)).json()["warnings"][0]
check("the case shows the observation on the warning", len(w["observations"]) == 1 and w["observations"][0]["by_name"] == leader.name and w["concluded"] is None
      and w["owner_name"] == owner.name and w["description"] == "Keep the dog on a leash.")

for label, body in (("an unknown result", {"result": "great", "notes": "ok ok"}), ("no notes", {"result": "partial", "notes": ""}),
                    ("a conclusion that is not an outcome", {"result": "partial", "notes": "ok ok", "conclude": "other"})):
    check(f"{label} is refused (422)", client.post(url, json=body, headers=H(leader)).status_code == 422)
check("a warning that is not on this case is 404", client.post(f"/cases/{R_OPEN}/warnings/{wid}/observations", json={"result": "partial", "notes": "ok ok"}, headers=H(leader)).status_code == 404)
check("a resident cannot record one", client.post(url, json={"result": "partial", "notes": "ok ok"}, headers=H(resident)).status_code == 403)
check("a Leader of another subdivision cannot", client.post(url, json={"result": "partial", "notes": "ok ok"}, headers=H(other_leader)).status_code == 403)

before = db.query(StatusHistory).filter(StatusHistory.report_id == rid).count()
r = client.post(url, json={"result": "compliant", "notes": "Fenced the yard; no roaming for 3 days.", "conclude": "compliant"}, headers=H(leader))
check("concluding as compliant works", r.status_code == 201 and r.json()["concluded"] == "compliant" and r.json()["warning_status"] == "Resolved", r.text)
db.expire_all()
check("the warning is Resolved, the end-of-observation follow-up is done, the legacy observation complied",
      db.get(OwnerWarning, wid).status == "Resolved" and db.get(CaseFollowUp, end_id).status == "done"
      and db.get(CaseFollowUp, end_id).completion_note == "Observation concluded." and db.get(OwnerFollowUp, obs_id).status == "complied")
check("the CASE is not closed or resolved by it", case_state.case_status_of(db.get(Report, rid)) == "in_progress" and db.get(Report, rid).current_status_id == 7)
check("one neutral line is added to the timeline, without the officer's notes",
      db.query(StatusHistory).filter(StatusHistory.report_id == rid).count() == before + 1
      and not db.query(StatusHistory).filter(StatusHistory.report_id == rid, StatusHistory.remarks.like("%Fenced the yard%")).count())
options = {o["disposition"]: o for o in client.get(f"/cases/{rid}/closure-options", headers=H(leader)).json()["options"]}
check("closing as 'owner compliance' is now available", options["owner_compliance"]["available"])
w = client.get(f"/cases/{rid}", headers=H(leader)).json()["warnings"][0]
check("the case shows the warning as concluded", w["concluded"] == "compliant" and w["concluded_at"] and len(w["observations"]) == 2)
check("a concluded observation takes no more", client.post(url, json={"result": "compliant", "notes": "again again"}, headers=H(leader)).status_code == 409)

rid2, wid2, end2, obs2 = warned_case()
r = client.post(f"/cases/{rid2}/warnings/{wid2}/observations", json={"result": "non_compliant", "notes": "Roaming again on Friday.", "conclude": "non_compliant"}, headers=H(leader))
db.expire_all()
check("concluding as non-compliant ends the observation but leaves the warning", r.status_code == 201 and db.get(OwnerWarning, wid2).status == "Pending"
      and db.get(OwnerFollowUp, obs2).status == "closed" and db.get(CaseFollowUp, end2).status == "done" and case_state.case_status_of(db.get(Report, rid2)) == "in_progress")
options = {o["disposition"]: o for o in client.get(f"/cases/{rid2}/closure-options", headers=H(leader)).json()["options"]}
check("non-compliance does not unlock 'owner compliance'", not options["owner_compliance"]["available"])

closed_rid, closed_w, _, _ = warned_case()
client.post(f"/cases/{closed_rid}/close", json={"disposition": "unresolved_other", "reason": "Closed for the test."}, headers=H(leader))
check("a closed case takes no observation (409)", client.post(f"/cases/{closed_rid}/warnings/{closed_w}/observations", json={"result": "partial", "notes": "ok ok"}, headers=H(leader)).status_code == 409)

# ================================================================================================= NOTICES
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402


def alert(report_id, subdivision, status, requested_by, alert_type="lost_pet", requested_at=None, close_outcome=None):
    a = LostPetAlert(report_id=report_id, subdivision_id=subdivision, status=status, alert_type=alert_type, owner_id=resident.user_id,
                     requested_by=requested_by, last_seen_location="Gate 2", close_outcome=close_outcome,
                     requested_at=requested_at or datetime.now())
    db.add(a)
    db.commit()
    return a.alert_id


a_requested = alert(mk(), 1, "requested", resident.user_id, requested_at=datetime.now() - timedelta(days=3))
a_active = alert(mk(), 1, "active", leader.user_id, requested_at=datetime.now() - timedelta(days=2))
a_closed = alert(mk(), 1, "closed", leader.user_id, alert_type="found_animal", requested_at=datetime.now() - timedelta(days=1), close_outcome="not_found")
a_other = alert(mk(subdivision=2), 2, "active", other_leader.user_id)

r = client.get("/lost-pet-alerts/all", headers=H(leader))
got = r.json()
check("the Leader's notice list has every state, newest request first, and not another subdivision's",
      r.status_code == 200 and [x["alert_id"] for x in got["results"]] == [a_closed, a_active, a_requested] and got["total"] == 3, r.text)
by_id = {x["alert_id"]: x for x in got["results"]}
check("it says which is a found-animal notice and which state each is in",
      by_id[a_closed]["alert_type"] == "found_animal" and by_id[a_closed]["status"] == "closed" and by_id[a_requested]["status"] == "requested" and by_id[a_active]["status"] == "active")
check("it says who asked (a resident's request vs the Leader's own)", by_id[a_requested]["requested_by"] == resident.user_id and by_id[a_active]["requested_by"] == leader.user_id)
check("the Administrator sees every subdivision's notices", {x["alert_id"] for x in client.get("/lost-pet-alerts/all", headers=H(admin)).json()["results"]} >= {a_other, a_active})
check("a resident cannot read the notice list", client.get("/lost-pet-alerts/all", headers=H(resident)).status_code == 403)
check("Barangay staff cannot", client.get("/lost-pet-alerts/all", headers=H(staff)).status_code == 403)
check("a Leader without a subdivision cannot", client.get("/lost-pet-alerts/all", headers=H(leader_nowhere)).status_code == 403)
check("paging works", len(client.get("/lost-pet-alerts/all", params={"limit": 1, "offset": 1}, headers=H(leader)).json()["results"]) == 1)
nell = user("Neighbour Nell", 1, 1)          # a resident who is not the owner of any notice
neighbour = client.get("/lost-pet-alerts/active", headers=H(nell)).json()["results"]
check("neighbours never get who asked for a notice", neighbour and all(x["requested_by"] is None for x in neighbour), str(neighbour))
check("the owner of a notice does", any(x["requested_by"] is not None for x in client.get("/lost-pet-alerts/active", headers=H(resident)).json()["results"]))

# ===================================================================================== OFFICE PROFILE
cats = client.get("/cases/categories", headers=H(leader)).json()
check("the categories answer names the subdivision and has an (empty) office profile", cats["subdivision"]["name"] == "Selera Homes" and cats["subdivision"]["city"] == "Test City"
      and cats["subdivision"]["office"] == {"address": "", "phone": "", "email": "", "hours": ""} and len(cats["categories"]) == 6)
settings = client.get("/cases/settings/1", headers=H(leader)).json()
settings["office"] = {"address": " Clubhouse, Phase 1 ", "phone": "02 8123 4567", "email": "office@selera.example", "hours": "Mon-Fri 9-5"}
r = client.put("/cases/settings/1", json=settings, headers=H(leader))
check("the Leader saves the office profile with the settings (trimmed)", r.status_code == 200 and r.json()["office"]["address"] == "Clubhouse, Phase 1", r.text)
check("a resident of that subdivision reads it through the categories answer", client.get("/cases/categories", headers=H(resident)).json()["subdivision"]["office"]["phone"] == "02 8123 4567")
check("a resident of ANOTHER subdivision does not get it", client.get("/cases/categories", headers=H(user("Far Fran", 1, 2))).json()["subdivision"]["office"]["phone"] == "")
settings["office"]["email"] = "not an email"
check("a bad office email is refused (422)", client.put("/cases/settings/1", json=settings, headers=H(leader)).status_code == 422)
check("a resident cannot change the settings", client.put("/cases/settings/1", json=client.get("/cases/settings/1", headers=H(leader)).json(), headers=H(resident)).status_code == 403)

print(f"\n{PASSED} checks passed.")
