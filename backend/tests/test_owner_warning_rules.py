"""
Phase 6 (docs/01-system/OWNER_WARNING_RULES.md): leader-only warnings for the pet's actual owner, one warning per
incident/tier, tier suggestions, scoped warning reads, checkbox acknowledgement, verbal warnings for owners without
accounts, repeated incidents with a once-only leader alert, pet history summary, and leader identity verification.
Run from the backend folder:  python tests/test_owner_warning_rules.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "owner_warning_rules_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-owner-warning-rules-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402
from unittest.mock import patch  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from _case_helpers import make_warning_ready  # noqa: E402  (what an owner warning now requires)
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.leader_identity import LeaderIdentityVerification  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.owner_followup import FollowUpContactLog, OwnerFollowUp  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_match_confirmation import PetMatchConfirmationRequest  # noqa: E402
from app.models.report import Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.report_dispute import ReportDispute  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.models.warning import OwnerWarning  # noqa: E402
from app.routes import leader_identity, owner_followups, warnings  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.owner_followups import check_and_notify_due_followups  # noqa: E402
from app.utils.owner_returns import owner_already_on_record  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (warnings.router, owner_followups.router, leader_identity.router):
    api.include_router(r)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.add(Barangay(barangay_id=2, barangay_name="B2", city="C"))
db.flush()
db.add_all([Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"),
            Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="S2"),
            Subdivision(subdivision_id=3, barangay_id=2, subdivision_name="S3")])
for sid, name in ((1, "Reported"), (2, "Verified"), (4, "Escalated"), (7, "Under Observation"), (11, "Resolved"), (18, "Merged")):
    db.add(ReportStatus(status_id=sid, status_name=name))
db.add(ReportCategory(category_id=4, category_name="Roaming Animal"))


def mk(name, role, subd=1, brgy=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=subd, barangay_id=brgy, phone="09170000000")
    db.add(u)
    db.flush()
    return u


leader, leader_b, leader2 = mk("Leader", 2), mk("LeaderB", 2), mk("LeaderTwo", 2, subd=2)
staff, staff_far, admin = mk("Staff", 3), mk("StaffFar", 3, subd=3, brgy=2), mk("Admin", 4)
owner, other = mk("Owner", 1), mk("Other", 1)
bantay = Pet(owner_id=owner.user_id, pet_name="Bantay", pet_type="Dog", status="Active", photo_front_url="https://img.test/b.jpg")
ligaw = Pet(owner_id=None, pet_name="Ligaw", pet_type="Dog", status="Active", photo_front_url="https://img.test/l.jpg")
db.add_all([bantay, ligaw])
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
HL, HLB, HL2, HS, HSF, HA, HO, HX = (H(u) for u in (leader, leader_b, leader2, staff, staff_far, admin, owner, other))
CLOCK = [datetime.now() - timedelta(days=10)]
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(pet_id=None, subd=1, assigned=None, **kw):
    CLOCK[0] += timedelta(hours=1)
    r = Report(user_id=other.user_id, subdivision_id=subd, category_id=4, latitude=14.8, longitude=121.0,
               current_status_id=kw.pop("status", 2), pet_id=pet_id, animal_type="Dog",
               assigned_leader_id=assigned if assigned is not None else leader.user_id,
               created_at=kw.pop("created_at", CLOCK[0]), landmark="Gate 1", **kw)
    db.add(r)
    db.commit()
    # An owner warning needs a verified incident, a confirmed owner and a confirmed policy (utils/warning_rules.py)
    make_warning_ready(db, r.report_id, owner.user_id, observation_days=3)
    return r.report_id


def warn(h, rid, level="1st Warning", user=None, pet=None, violation="Free-Roaming Unleashed"):
    body = {"user_id": (user or owner).user_id, "report_id": rid, "warning_level": level, "violation_type": violation,
            "description": "Seen roaming outside without a leash."}
    if pet:
        body["pet_id"] = pet
    with patch("app.routes.warnings.dispatch_notification"), \
         patch("app.services.email_templates.render_owner_warning_email", return_value=("S", "B", "<b>B</b>")):
        return client.post("/warnings/", json=body, headers=h)


r1 = report(pet_id=bantay.pet_id)

# ── 1. Leader-only issuance, own subdivision, handling leader, actual owner ──
check("issue: Barangay staff can't issue warnings", warn(HS, r1).status_code == 403)
check("issue: Admin can't issue warnings", warn(HA, r1).status_code == 403)
check("issue: residents can't issue warnings", warn(HO, r1).status_code == 403)
check("issue: a leader of another subdivision can't", warn(HL2, r1).status_code == 403)
check("issue: a leader not handling the report can't", warn(HLB, r1).status_code == 403)
r = warn(HL, r1, user=other)
check("issue: must go to the registered pet's actual owner", r.status_code == 400 and "registered owner" in r.text, r.text[:200])
r = warn(HL, r1, user=staff)
check("issue: must go to a resident account", r.status_code == 400, r.text[:200])
r_lig = report(pet_id=ligaw.pet_id)
r = warn(HL, r_lig)
check("issue: a pet with no owner account gets no account warning", r.status_code == 400 and "verbal warning" in r.text, r.text[:200])
r = warn(HL, r1)
check("issue: the handling leader warns the actual owner", r.status_code == 200 and r.json()["pet_id"] == bantay.pet_id, r.text[:300])
w1 = r.json()["warning_id"]

# ── 2. One warning per incident/tier, no going back, suggestions ──
r = warn(HL, r1)
check("tier: the same tier twice on one incident is refused", r.status_code == 400 and "already exists" in r.text, r.text[:200])
r = warn(HL, r1, level="Notice")
check("tier: a lower tier after a higher one is refused", r.status_code == 400 and "lower tier" in r.text, r.text[:200])
s = client.get(f"/warnings/suggestion?violation_type=Free-Roaming%20Unleashed&report_id={r1}", headers=HL).json()
check("suggest: next tier for this incident is the 2nd Warning", s["suggested_tier"] == "2nd Warning", s)
s = client.get(f"/warnings/suggestion?violation_type=Overdue%20Vaccination&report_id={r1}", headers=HL).json()
check("suggest: another violation starts at 1st Warning", s["suggested_tier"] == "1st Warning", s)
check("suggest: residents can't read suggestions", client.get("/warnings/suggestion?violation_type=Other", headers=HO).status_code == 403)
r = warn(HL, r1, level="2nd Warning")
check("tier: a higher tier on the same incident is allowed", r.status_code == 200, r.text[:200])

# ── 9. Scoped reads ──
pet_list = lambda h: client.get(f"/warnings/pet/{bantay.pet_id}", headers=h)  # noqa: E731
check("read: the owner sees their own notices for the pet", len(pet_list(HO).json()) == 2)
check("read: another resident sees none of them (pet endpoint)", pet_list(HX).json() == [])
check("read: another resident sees none of them (report endpoint)", client.get(f"/warnings/report/{r1}", headers=HX).json() == [])
check("read: another resident can't open one directly", client.get(f"/warnings/{w1}", headers=HX).status_code == 403)
check("read: another resident can't list the owner's warnings", client.get(f"/warnings/user/{owner.user_id}", headers=HX).status_code == 403)
check("read: a leader of another subdivision sees none", pet_list(HL2).json() == [])
check("read: Barangay staff of the same barangay see them", len(pet_list(HS).json()) == 2)
check("read: Barangay staff of another barangay see none", pet_list(HSF).json() == [])
check("read: the staff list is scoped too", all(w["warning_id"] != w1 for w in client.get("/warnings/", headers=HL2).json()))
check("read: Admin sees all", len(pet_list(HA).json()) == 2)

# ── 10. Acknowledgement needs the owner and the checkbox ──
ack = lambda h, body=None: client.patch(f"/warnings/{w1}/acknowledge", headers=h, json=body)  # noqa: E731
check("ack: staff can't acknowledge for the owner", ack(HL, {"confirmed": True}).status_code == 403)
check("ack: refused without the checkbox", ack(HO).status_code == 400 and ack(HO, {"confirmed": False}).status_code == 400)
r = ack(HO, {"confirmed": True})
check("ack: the owner acknowledges after ticking the checkbox", r.status_code == 200 and r.json()["status"] == "Acknowledged", r.text[:200])
first_at = r.json()["acknowledged_at"]
check("ack: acknowledging again changes nothing", ack(HO, {"confirmed": True}).json()["acknowledged_at"] == first_at)

# ── 5–6. Repeated incidents ──
fu = db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id == r1).first()
check("observation started with the first warning", fu is not None and fu.status == "observing")
fu_id = fu.followup_id
db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == fu_id).update({"created_at": datetime.now() - timedelta(hours=2)})
db.commit()
r_rep = report(pet_id=bantay.pet_id, created_at=datetime.now() - timedelta(minutes=30))
r_dup = report(pet_id=bantay.pet_id, created_at=datetime.now() - timedelta(minutes=20), duplicate_of_report_id=r1, status=18)
r_old = report(pet_id=bantay.pet_id, created_at=datetime.now() - timedelta(days=5))
r_unrel = report(pet_id=None, created_at=datetime.now() - timedelta(minutes=10), subd=2, assigned=leader2.user_id)
rr = client.get(f"/owner-followups/{fu_id}/repeated-reports", headers=HL).json()
check("banner: a new report about the observed pet is a possible repeat", [c["report_id"] for c in rr["candidates"]] == [r_rep], rr)
check("banner: merged duplicates and reports from before the observation are left out",
      r_dup not in [c["report_id"] for c in rr["candidates"]] and r_old not in [c["report_id"] for c in rr["candidates"]])
alerts = lambda: db.query(Notification).filter(Notification.user_id == leader.user_id, Notification.type == "followup_repeat_report").count()  # noqa: E731
check("alert: the handling leader is alerted", alerts() == 1)
client.get(f"/owner-followups/{fu_id}/repeated-reports", headers=HL)
check_and_notify_due_followups(db)
check("alert: only once, whether opened again or checked by the scheduler", alerts() == 1)
rr_s = client.get(f"/owner-followups/{fu_id}/repeated-reports", headers=HS).json()
check("banner: Barangay staff can read it but can't log", rr_s["candidates"] and rr_s["can_log"] is False)
check("banner: residents can't read it", client.get(f"/owner-followups/{fu_id}/repeated-reports", headers=HO).status_code == 403)

log = lambda rid, h=HL: client.post(f"/owner-followups/{fu_id}/repeated-incidents", headers=h,  # noqa: E731
                                    json={"report_id": rid, "notes": "Seen roaming again near the gate."})
check("repeat: a related report is required (missing report)", log(999999).status_code == 404)
check("repeat: the observed report itself is refused", log(r1).status_code == 400)
check("repeat: a merged duplicate is refused", log(r_dup).status_code == 400)
check("repeat: an unrelated report is refused", log(r_unrel).status_code == 400)
check("repeat: Barangay staff can't log", log(r_rep, HS).status_code == 403)
r = log(r_rep)
check("repeat: the handling leader logs the repeat", r.status_code == 201 and r.json()["report_id"] == r_rep, r.text[:200])
check("repeat: logging it twice is refused", log(r_rep).status_code == 409)
rr = client.get(f"/owner-followups/{fu_id}/repeated-reports", headers=HL).json()
check("repeat: a logged repeat leaves the banner and is listed", rr["candidates"] == [] and [x["report_id"] for x in rr["logged"]] == [r_rep])

# ── 3. Warnings per incident, with prefill ──
inc = client.get(f"/warnings/followup/{fu_id}/incidents", headers=HL).json()["incidents"]
check("incidents: the observed incident and the logged repeat", [(i["report_id"], i["kind"]) for i in inc] == [(r1, "observed"), (r_rep, "repeat")], inc)
check("incidents: the observed one lists its warnings", [w["warning_level"] for w in inc[0]["warnings"]] == ["1st Warning", "2nd Warning"])
pf = inc[1]["prefill"]
check("incidents: prefill has date, comply-by date, instructions and a tier",
      pf["incident_date"] and pf["comply_by"] and "leash" in pf["instructions"] and pf["suggested_tier"] == "Final Notice / Escalation", pf)
r = warn(HL, r_rep, level="1st Warning")
check("repeat: a distinct logged repeat can receive its own warning", r.status_code == 200, r.text[:200])
check("repeat: its warning doesn't open a second observation for the same pet",
      db.query(OwnerFollowUp).filter(OwnerFollowUp.pet_id == bantay.pet_id, OwnerFollowUp.status == "observing").count() == 1)

# ── 4. Verbal warnings for owners without an account ──
r_off = report(pet_id=None)
off = OwnerFollowUp(report_id=r_off, subdivision_id=1, leader_id=leader.user_id, owner_id=None, owner_name="Mang Juan",
                    owner_phone="09171112222", status="observing", due_at=datetime.now() - timedelta(days=2), duration_days=3,
                    created_at=datetime.now() - timedelta(days=3))
db.add(off)
db.commit()
verbal = lambda fid, **kw: client.post(f"/owner-followups/{fid}/verbal-warning", headers=kw.pop("h", HL), json={  # noqa: E731
    "method": kw.pop("method", "phone"), "tier": kw.pop("tier", "1st Warning"), "notes": "Called and warned about roaming.", **kw})
r = verbal(off.followup_id)
check("verbal: logged as a Verbal Warning contact entry", r.status_code == 201 and r.json()["contact_type"] == "Verbal Warning", r.text[:300])
check("verbal: no account warning was created for anyone", db.query(OwnerWarning).filter(OwnerWarning.report_id == r_off).count() == 0)
check("verbal: the same tier twice is refused", verbal(off.followup_id).status_code == 409)
check("verbal: in person is accepted too", verbal(off.followup_id, method="in_person", tier="2nd Warning").status_code == 201)
check("verbal: an unknown method is refused", verbal(off.followup_id, method="email", tier="Notice").status_code == 422)
check("verbal: an owner with an account gets an official warning instead", verbal(fu_id).status_code == 409)
check("verbal: only the handling leader", verbal(off.followup_id, h=HS, tier="Notice").status_code == 403)
r = client.post(f"/owner-followups/{off.followup_id}/issue-second-warning", headers=HL,
                json={"violation_type": "Free-Roaming Unleashed", "description": "Still roaming after the deadline."})
check("second warning: no account warning invented for an owner without an account", r.status_code == 409, r.text[:200])
check("second warning: nothing was given to user #1", db.query(OwnerWarning).filter(OwnerWarning.user_id == 1, OwnerWarning.report_id == r_off).count() == 0)

# ── 11. Pet history summary (staff only) ──
s = client.get(f"/owner-followups/pet/{bantay.pet_id}/summary", headers=HL)
c = s.json().get("counts", {})
check("summary: observations, repeats and warnings for the pet", s.status_code == 200 and c["observations"] == 1
      and c["repeated_incidents"] == 1 and c["account_warnings"] == 3, s.text[:300])
check("summary: residents can't read it", client.get(f"/owner-followups/pet/{bantay.pet_id}/summary", headers=HO).status_code == 403)
check("summary: verbal warnings counted on the observation", db.query(FollowUpContactLog).filter(
    FollowUpContactLog.followup_id == off.followup_id, FollowUpContactLog.contact_type == "Verbal Warning").count() == 2)

# ── 7–8. Leader identity verification ──
rex = Pet(owner_id=owner.user_id, pet_name="Rex", pet_type="Dog", status="Active", photo_front_url="https://img.test/r.jpg")
db.add(rex)
db.commit()


def staff_confirmed(rid, pet, owner_status="PENDING", hours_ago=1):
    m = ReportMatch(source_report_id=rid, matched_pet_id=pet.pet_id, similarity_score=70, status="CONFIRMED_MATCH",
                    owner_confirmation_status=owner_status, reviewed_by=leader.user_id,
                    verified_at=datetime.now() - timedelta(hours=hours_ago))
    db.add(m)
    db.commit()
    return m.match_id


r5 = report()
m5 = staff_confirmed(r5, rex)
lv = lambda mid, h=HL, **kw: client.post(f"/leader-identity/matches/{mid}", headers=h, json={  # noqa: E731
    "method": kw.pop("method", "In-Person Inspection"), "reason": kw.pop("reason", "Same scar on the left ear, checked at the gate.")})
opts = client.get(f"/leader-identity/reports/{r5}", headers=HL).json()["matches"][0]
check("identity: not yet while the owner still has time to answer", not opts["eligible"] and "hour" in opts["blocked_reason"], opts)
check("identity: refused through the API too", lv(m5).status_code == 409)
db.query(ReportMatch).filter(ReportMatch.match_id == m5).update({"verified_at": datetime.now() - timedelta(hours=25)})
db.commit()
opts = client.get(f"/leader-identity/reports/{r5}", headers=HL).json()["matches"][0]
check("identity: eligible after 24 hours without an answer", opts["eligible"] and opts["trigger"] == "NO_RESPONSE_24H", opts)
check("identity: Barangay staff can't verify", lv(m5, HS).status_code == 403)
check("identity: a leader not handling the case can't", lv(m5, HLB).status_code == 409)
check("identity: a documented method is required", lv(m5, method="Gut feeling").status_code == 400)
check("identity: a real reason is required", lv(m5, reason="same dog").status_code == 400)
r = lv(m5)
check("identity: the handling leader verifies it", r.status_code == 200 and r.json()["trigger"] == "NO_RESPONSE_24H", r.text[:300])
db.expire_all()
rep5 = db.get(Report, r5)
check("identity: the report is linked to the pet", rep5.pet_id == rex.pet_id)
check("identity: the owner's answer on the match is unchanged", db.get(ReportMatch, m5).owner_confirmation_status == "PENDING")
n = db.query(Notification).filter(Notification.user_id == owner.user_id, Notification.type == "leader_identity_verified").first()
check("identity: the owner is notified and told they can dispute", n is not None and "dispute" in n.message)
check("identity: never the owner's ownership proof at handover", owner_already_on_record(rep5, owner.user_id, db) is False)
check("identity: verifying twice is refused", lv(m5).status_code == 409)
v = db.query(LeaderIdentityVerification).filter(LeaderIdentityVerification.match_id == m5).first()
check("identity: method, reason, trigger and leader are stored", v.method == "In-Person Inspection" and v.leader_id == leader.user_id
      and v.trigger == "NO_RESPONSE_24H" and "scar" in v.reason)

r6 = report()
m6 = staff_confirmed(r6, rex, owner_status="OWNER_REJECTED")
r = lv(m6)
check("identity: allowed after the owner rejected", r.status_code == 200 and r.json()["trigger"] == "OWNER_REJECTED", r.text[:200])
r7 = report()
m7 = staff_confirmed(r7, rex, owner_status="OWNER_REJECTED")
db.add(PetMatchConfirmationRequest(report_id=r7, pet_id=rex.pet_id, owner_id=owner.user_id, requested_by=leader.user_id,
                                   status="OWNER_REJECTED", owner_response="NO"))
db.commit()
r = lv(m7)
check("identity: owner-first pairs are excluded (the owner's NO stands)", r.status_code == 409 and "owner confirmation first" in r.text, r.text[:200])
r8 = report()
m8 = staff_confirmed(r8, rex, owner_status="OWNER_REJECTED")
db.add(ReportDispute(report_id=r8, resident_user_id=owner.user_id, pet_id=rex.pet_id, dispute_reason="Not my dog", status="Pending"))
db.commit()
check("identity: a pending dispute blocks it", lv(m8).status_code == 409)
r9 = report()
m9 = staff_confirmed(r9, rex, owner_status="OWNER_CONFIRMED", hours_ago=30)
check("identity: not needed when the owner confirmed", lv(m9).status_code == 409)
r10 = report(subd=2, assigned=leader2.user_id)
m10 = staff_confirmed(r10, rex, owner_status="OWNER_REJECTED")
check("identity: a leader outside the subdivision can't", lv(m10).status_code == 403)

from app.utils.push_categories import category_for  # noqa: E402
check("push: leader verification uses the pet-match category", category_for("leader_identity_verified") == category_for("potential_match"))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
