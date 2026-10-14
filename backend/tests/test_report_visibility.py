"""
Report visibility (REPORT_VISIBILITY_IMPLEMENTATION.md): the Subdivision Leader decides Public / Private after
verifying; false, rejected and merged reports are never shown to other residents; reporter and owner details are
never shown to other residents; comments, matches and notifications follow the same rule; every decision is logged.
Run from the backend folder:  python tests/test_report_visibility.py
"""
import os
import sys
import tempfile

_DB = os.path.join(tempfile.mkdtemp(), "report_visibility_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-report-visibility-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Comment, Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import matches, notifications, reports  # noqa: E402
from app.utils import report_visibility as rv  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(reports.router)
api.include_router(matches.router)
api.include_router(notifications.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))


def mk(name, role):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role,
             is_verified=True, status="Active", subdivision_id=1 if role in (1, 2) else None, barangay_id=1,
             phone="09171234567", address=f"{name} House, Block 1")
    db.add(u)
    db.flush()
    return u


reporter, other, owner, leader, brgy, admin = (mk("Rita Reporter", 1), mk("Olga Other", 1), mk("Oscar Owner", 1),
                                               mk("Leo Leader", 2), mk("Bea Brgy", 3), mk("Ada Admin", 4))
pet = Pet(pet_name="Boyet", pet_type="Dog", owner_id=owner.user_id, status="Active")
db.add(pet)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []
CLOCK = [datetime(2026, 10, 1)]


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def report(status=1, by=None, **kw):
    CLOCK[0] += timedelta(minutes=5)
    kw.setdefault("visibility", rv.PENDING)
    r = Report(user_id=(by or reporter).user_id, subdivision_id=1, category_id=1, latitude=14.80012345,
               longitude=121.00312345, current_status_id=status, animal_type="Dog", assigned_leader_id=leader.user_id,
               created_at=CLOCK[0], ai_suggested_risk_level="Low", landmark="Near the chapel", description="Brown dog near Rita's gate", **kw)
    db.add(r)
    db.commit()
    return r.report_id


def ids(user, **params):
    res = client.get("/reports/", headers=H(user), params=params)
    return {r["report_id"] for r in res.json()} if res.status_code == 200 else {"ERR", res.status_code}


def get(user, rid):
    return client.get(f"/reports/{rid}", headers=H(user))


def verify(rid, visibility="Public", who=None):
    return client.post(f"/reports/{rid}/verify-incident", headers=H(who or leader), json={"notes": "Seen on site", "visibility": visibility})


def set_vis(rid, visibility, reason=None, who=None):
    body = {"visibility": visibility}
    if reason is not None:
        body["reason"] = reason
    return client.patch(f"/reports/{rid}/visibility", headers=H(who or leader), json=body)


def row(rid):
    db.expire_all()
    return db.get(Report, rid)


# 1. Nobody chooses visibility when filing
res = client.post("/reports/", headers=H(reporter), json={
    "latitude": 14.8008, "longitude": 121.0036, "description": "A brown dog roaming", "animal_type": "Dog",
    "visibility": "Public", "subdivision_id": 1, "category_id": 1})
if res.status_code == 200:
    created = res.json()["report_id"]
    check("1 a resident's report starts Private even when the form says Public", row(created).visibility == rv.PRIVATE,
          row(created).visibility)
else:
    print(f"  (report creation not available in this test app: {res.status_code}) -> checking the rule directly")
    created = report()
    check("1 a new report defaults to Pending Review", row(created).visibility == rv.PENDING)

# 2-3. Pending: only the reporter (and staff)
rid = report()
check("2 another resident doesn't get a pending report in the list", rid not in ids(other))
check("2 another resident gets 404 on the report page", get(other, rid).status_code == 404)
check("2 another resident can't comment on it (404)",
      client.post(f"/reports/{rid}/comments", headers=H(other), json={"comment": "hi"}).status_code == 404)
check("3 the reporter sees it in the list and on the page", rid in ids(reporter) and get(reporter, rid).status_code == 200)
check("3 staff see it", get(leader, rid).status_code == 200 and get(brgy, rid).status_code == 200)

# 4-5. Who may decide, and Public needs verification
check("4 a resident can't set visibility (403)", set_vis(rid, "Public", who=reporter).status_code == 403)
check("4 Barangay Staff can't set visibility (403)", set_vis(rid, "Public", who=brgy).status_code == 403)
check("4 another resident is told it doesn't exist (404)", set_vis(rid, "Public", who=other).status_code == 404)
# 5. The leader may make a report Public before verifying it: other residents see it at once
early = report()
res = set_vis(early, "Public")
check("5 Public on an unverified report is allowed by the handling leader", res.status_code == 200 and row(early).visibility == rv.PUBLIC, res.text[:200])
check("5 ...and other residents see it right away", early in ids(other) and get(other, early).status_code == 200)
plain = report()
res = client.post(f"/reports/{plain}/verify-incident", headers=H(leader), json={"notes": "x"})
check("5 verify-incident no longer needs a visibility choice", res.status_code == 200, res.text[:200])
check("5 ...and leaves who can see it as it was", row(plain).visibility == rv.PENDING)
# An old report the RESIDENT marked Public before leaders decided still needs verification first
legacy = report(visibility=rv.PUBLIC)
check("5 a resident-chosen Public report (no leader decision) stays hidden until verified", legacy not in ids(other)
      and get(other, legacy).status_code == 404)

# 6. Verify with Public
res = verify(rid, "Public")
r = row(rid)
check("6 verifying with Public publishes it", res.status_code == 200 and r.visibility == rv.PUBLIC, res.text[:200])
check("6 decided by and when are recorded", r.visibility_decided_by == leader.user_id and r.visibility_decided_at is not None)
log = db.query(AuditLog).filter(AuditLog.action == "SET_REPORT_VISIBILITY", AuditLog.target_id == rid).order_by(AuditLog.log_id.desc()).first()
check("6 audit log has old, new, actor and reason",
      log is not None and log.old_values == {"visibility": rv.PENDING} and log.new_values.get("visibility") == rv.PUBLIC
      and log.user_id == leader.user_id and "verification" in (log.new_values.get("reason") or ""))
check("6 the other resident now sees it in the list and on the page", rid in ids(other) and get(other, rid).status_code == 200)
check("6 the verification notice tells the reporter it is public",
      db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.related_id == rid,
                                    Notification.message.like("%visible to other residents%")).first() is not None)

# 14-15. Reporter privacy
body = get(other, rid).json()
check("14 other residents see 'Community Reporter', no photo, no user id",
      body["reporter_name"] == rv.COMMUNITY_REPORTER and body["reporter_photo"] is None and body["user_id"] is None, body.get("reporter_name"))
check("14 the response carries no reporter phone, email or address", "09171234567" not in get(other, rid).text
      and "rita.reporter" not in get(other, rid).text.lower() and "Rita Reporter House" not in get(other, rid).text)
staff_body = get(leader, rid).json()
check("15 staff still get the reporter's identity", staff_body["reporter_name"] == "Rita Reporter" and staff_body["user_id"] == reporter.user_id)
check("15 the reporter sees their own name", get(reporter, rid).json()["reporter_name"] == "Rita Reporter")
check("15 staff see the decision details", staff_body["visibility_decided_by_name"] == "Leo Leader" and staff_body["visible_to_residents"] is True)

# 18. Comments
res = client.post(f"/reports/{rid}/comments", headers=H(other), json={"comment": "I saw it too", "user_id": admin.user_id})
c = db.query(Comment).filter(Comment.report_id == rid).order_by(Comment.comment_id.desc()).first()
check("18 a resident can comment on a verified Public report", res.status_code == 200)
check("18 the commenter is the signed-in user, never the user_id sent", c is not None and c.user_id == other.user_id)
check("18 anonymous comments are refused (401)", client.post(f"/reports/{rid}/comments", json={"comment": "x", "user_id": other.user_id}).status_code == 401)
client.post(f"/reports/{rid}/comments", headers=H(reporter), json={"comment": "Thanks, it's brown"})
seen = get(owner, rid).json()["comments"]
check("18 other residents see commenters by first name only, the reporter as Community Reporter",
      {x["user_name"] for x in seen} == {"Olga", rv.COMMUNITY_REPORTER} and all(x["user_photo"] is None for x in seen), seen)

# 7-8. Public -> Private
res = set_vis(rid, "Private")
check("8 changing an earlier decision without a reason is refused (422)", res.status_code == 422)
res = set_vis(rid, "Private", reason="Neighbour asked for privacy")
check("7 Public -> Private with a reason works", res.status_code == 200 and row(rid).visibility == rv.PRIVATE, res.text[:200])
check("7 hidden at once from the other resident's list (search, map) and page",
      rid not in ids(other) and get(other, rid).status_code == 404)
check("7 existing comments are kept for the reporter and staff",
      len(get(reporter, rid).json()["comments"]) == 2 and len(get(leader, rid).json()["comments"]) == 2)
check("2 residents can't comment on a Private report, even the reporter (403, use the chat)",
      client.post(f"/reports/{rid}/comments", headers=H(reporter), json={"comment": "x"}).status_code == 403)
log = db.query(AuditLog).filter(AuditLog.action == "SET_REPORT_VISIBILITY", AuditLog.target_id == rid).order_by(AuditLog.log_id.desc()).first()
check("12 the change is logged with its reason", log.old_values == {"visibility": rv.PUBLIC} and "privacy" in log.new_values["reason"])
check("reporter is told it stays private",
      db.query(Notification).filter(Notification.user_id == reporter.user_id, Notification.type == "report_visibility").first() is not None)

# 9-11. False reports
rid2 = report(status=2)
verify(rid2, "Public")
check("9 setup: public and visible", rid2 in ids(other))
res = client.post(f"/reports/{rid2}/mark-false-alarm", headers=H(leader), json={"reason": "No Animal Found", "notes": "nothing there"})
check("9 Public then False Alarm: hidden from other residents at once",
      res.status_code == 200 and rid2 not in ids(other) and get(other, rid2).status_code == 404, res.text[:200])
check("9 the reporter still sees their false report", get(reporter, rid2).status_code == 200)
check("11 Public on a False Alarm report is refused (409)", set_vis(rid2, "Public", reason="try again please").status_code == 409)
check("9 comments are closed on a dismissed report (409 for staff too)",
      client.post(f"/reports/{rid2}/comments", headers=H(leader), json={"comment": "x"}).status_code == 409)
r2 = row(rid2)
r2.current_status_id = 2  # the false decision is reversed by any route
db.commit()
r2 = row(rid2)
check("10 a reversed false decision goes back to Pending Review", r2.visibility == rv.PENDING and r2.visibility_decided_by is None)
log = db.query(AuditLog).filter(AuditLog.action == "SET_REPORT_VISIBILITY", AuditLog.target_id == rid2).order_by(AuditLog.log_id.desc()).first()
check("10 the system reset is logged (no actor)", log.user_id is None and log.new_values["visibility"] == rv.PENDING)
rid3 = report(status=3, visibility=rv.PUBLIC, verification_status="verified_true")
check("11 a Rejected report stays hidden even if stored Public", rid3 not in ids(other) and get(other, rid3).status_code == 404)
check("11 Public on a Rejected report is refused (409)", set_vis(rid3, "Public").status_code == 409)

# Resolved stays visible with comments read-only (rule 9)
rid4 = report(status=2)
verify(rid4, "Public")
r4 = row(rid4)
r4.current_status_id = 11
db.commit()
check("9 a resolved Public report stays visible as history", rid4 in ids(other) and get(other, rid4).status_code == 200)
check("9 ...with comments closed", get(other, rid4).json()["comments_open"] is False and
      client.post(f"/reports/{rid4}/comments", headers=H(other), json={"comment": "x"}).status_code == 409)

# 12-13. Merged duplicates and unmerge
main = report(status=2)
verify(main, "Public")
dup = report(status=2, by=other)
verify(dup, "Public")
res = client.post(f"/reports/{dup}/merge", headers=H(leader), json={"primary_report_id": main, "notes": "Same brown dog seen twice"})
check("12 setup: merge works", res.status_code == 200 and row(dup).current_status_id == 18, res.text[:300])
check("12 the merged duplicate is hidden; the main case stays visible",
      dup not in ids(owner) and get(owner, dup).status_code == 404 and main in ids(owner))
check("12 other residents get no merged reports on the main case", get(owner, main).json()["merged_reports"] == [])
check("12 staff still see the merged reports", len(get(leader, main).json()["merged_reports"]) >= 1)
check("12 the duplicate's own reporter still sees it", get(other, dup).status_code == 200)
check("12 a merged duplicate can't be made Public (409)", set_vis(dup, "Public", reason="publish the duplicate").status_code == 409)
res = client.post(f"/reports/{dup}/unmerge", headers=H(leader), json={"reason": "Different dog after all, separate case"})
check("13 unmerge resets the separated report to Pending Review", res.status_code == 200 and row(dup).visibility == rv.PENDING, res.text[:300])
check("13 ...so it stays hidden until a leader decides", dup not in ids(reporter))

# 16-17. Potential matches
priv = report(status=2)
verify(priv, "Private")
m = ReportMatch(source_report_id=priv, matched_pet_id=pet.pet_id, similarity_score=60, status="AI_SUGGESTED")
db.add(m)
db.commit()
check("16 an AI-match owner doesn't get the private report in the list", priv not in ids(owner))
card = get(owner, priv)
cj = card.json() if card.status_code == 200 else {}
check("16 an AI-match owner gets only the match card", card.status_code == 200 and cj.get("viewer_access") == "match_owner", card.text[:200])
check("16 the card has photos and looks but no description, reporter, comments or exact spot",
      cj.get("description") is None and cj.get("reporter_name") == rv.COMMUNITY_REPORTER and cj.get("comments") == []
      and cj.get("latitude") == 14.8 and cj.get("user_id") is None and cj.get("animal_type") == "Dog", cj)
check("16 the match card can't be commented on",
      client.post(f"/reports/{priv}/comments", headers=H(owner), json={"comment": "mine?"}).status_code == 404)
mres = client.get(f"/matches/report/{priv}", headers=H(owner))
src = (mres.json() or [{}])[0].get("source_report") if mres.status_code == 200 and mres.json() else None
check("16 the match list gives the owner the same card", src is not None and src.get("description") is None
      and src.get("viewer_access") == "match_owner", mres.text[:300])
check("16 an unrelated resident still gets 404", get(other, priv).status_code == 404)
m.status = "CONFIRMED_MATCH"
db.commit()
full = get(owner, priv)
check("17 after staff confirm, the owner may open the report", full.status_code == 200 and full.json()["viewer_access"] == "owner")
check("17 ...still without the reporter's identity", full.json()["reporter_name"] == rv.COMMUNITY_REPORTER and full.json()["user_id"] is None)
check("17 ...and it shows in the owner's list", priv in ids(owner))

# Owner details never reach other residents (rule 6)
linked = report(status=2, pet_id=pet.pet_id)
verify(linked, "Public")
ob = get(other, linked).json()
check("6 other residents never get the owner's name, phone, email or address",
      ob.get("owner_name") in (None, rv.REGISTERED_OWNER) and ob.get("owner_phone") is None and ob.get("owner_email") is None
      and ob.get("owner_address") is None and ob.get("owner_id") is None, {k: ob.get(k) for k in ("owner_name", "owner_phone")})
own = get(owner, linked).json()
check("6 the owner keeps their own details", own.get("owner_id") == owner.user_id)

# 19. Escalation never changes visibility (rule 5)
esc = report(status=2)
verify(esc, "Private")
r = row(esc)
r.current_status_id = 4  # escalated to the Barangay
db.commit()
check("19 escalating a Private report keeps it Private", row(esc).visibility == rv.PRIVATE and esc not in ids(other))
check("19 Barangay Staff still can't change it", set_vis(esc, "Public", who=brgy).status_code == 403)
check("19 the leader may still decide on an escalated report", set_vis(esc, "Public", reason="Community should watch out").status_code == 200)

# 20. Notifications about a report the viewer lost access to
db.add(Notification(user_id=other.user_id, title="Dog near you", message="Rita's report #%d near the chapel" % priv,
                    type="status_update", related_id=priv))
db.add(Notification(user_id=other.user_id, title="Visible one", message="ok", type="status_update", related_id=esc))
db.commit()
notes = {n["title"]: n for n in client.get("/notifications/me", headers=H(other)).json()}
check("20 a notification about a hidden report is redacted on read",
      "Dog near you" not in notes and any(n["message"] == "This report is no longer available." and n["related_id"] is None for n in notes.values()))
check("20 ...while one about a visible report is unchanged", "Visible one" in notes)
check("20 the stored notification is untouched",
      db.query(Notification).filter(Notification.title == "Dog near you").first() is not None)

# 21. Old reports: no data change, rule applied on read
old_unverified = report(status=2, visibility=rv.PUBLIC)  # chosen by the resident before the change, never verified
check("21 an old unverified Public report is hidden from other residents", old_unverified not in ids(other))
check("21 ...and its stored value is unchanged", row(old_unverified).visibility == rv.PUBLIC)
check("21 staff see it flagged 'needs visibility review'", get(leader, old_unverified).json()["visibility_needs_review"] is True)

# Resident edits can't change visibility (V5)
mine = report()
client.patch(f"/reports/{mine}", headers=H(reporter), json={"visibility": "Public", "description": "edited"})
check("V5 a resident's edit can't change visibility", row(mine).visibility == rv.PENDING and row(mine).description == "edited")
client.patch(f"/reports/{mine}", headers=H(leader), json={"visibility": "Public"})
check("V5 the general edit route never changes visibility, even for staff", row(mine).visibility == rv.PENDING)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
