"""
The Barangay's holding stay limit is one value stored on the server (Head Officer / Administrator set it, default 7).
Before it is reached an animal can't be listed for adoption, adopted or impounded; the Head Officer or an
Administrator may act early with a written reason, which is audited. A number sent by the browser is ignored.
Run from the backend folder:  python tests/test_holding_stay_limit.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch

_DB = os.path.join(tempfile.mkdtemp(), "holding_stay_limit_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-holding-stay-limit-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.report import FacilityStatus, HoldingAnimal, HoldingTimeline, Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import adoptions, holding  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(holding.router)
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("[PASS] " if ok else "[FAIL] ") + label + ("" if ok else f"  -> {extra}"))


for rid, rn in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=rn))
db.add(Barangay(barangay_id=1, barangay_name="San Vicente", city="Santa Maria"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(ReportCategory(category_id=4, category_name="Roaming"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for sid in range(1, 9):
    db.add(FacilityStatus(status_id=sid, status_name=f"F{sid}"))
db.flush()
shelter = Landmark(name="Barangay Shelter", barangay_id=1, subdivision_id=None, latitude=14.8, longitude=121.0, is_holding_facility=True)
db.add(shelter)
db.commit()


def mk(name, role, head=False):
    u = User(name=name, email=f"{name.lower().replace(' ', '')}@test-mail.com", password="x", role_id=role, is_verified=True,
             status="Active", subdivision_id=1, barangay_id=1, is_head_officer=head)
    db.add(u)
    db.commit()
    return u


resident, leader, staff, head, admin = mk("Res One", 1), mk("Leader Santos", 2), mk("Staff Cruz", 3), mk("Head Reyes", 3, True), mk("Admin User", 4)
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731


def animal(days_ago, status=2):
    r = Report(user_id=resident.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0, current_status_id=7,
               animal_type="Dog", facility_id=shelter.landmark_id, initial_latitude=14.8, initial_longitude=121.0)
    db.add(r)
    db.flush()
    a = HoldingAnimal(report_id=r.report_id, animal_type="Dog", facility_status=status, overdue_notified=True,
                      intake_date=datetime.utcnow() - timedelta(days=days_ago))
    db.add(a)
    db.commit()
    return a.holding_id


def audits(action):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == action).all()


def status_of(hid):
    db.expire_all()
    return db.get(HoldingAnimal, hid).facility_status


def notes_of(hid):
    db.expire_all()
    return " ".join((t.notes or "") for t in db.query(HoldingTimeline).filter(HoldingTimeline.holding_id == hid).all())


# 1. The limit: one stored value, default 7; readable by staff, editable only by the Head Officer / Admin
r = client.get("/holding/stay-limit", headers=H(staff))
d = r.json() if r.status_code == 200 else {}
check("default stay limit is 7 days", r.status_code == 200 and d.get("days") == 7 and d.get("is_default") is True, (r.status_code, d))
check("regular staff can read but not edit", d.get("can_edit") is False)
check("Head Officer can edit", client.get("/holding/stay-limit", headers=H(head)).json().get("can_edit") is True)
check("leader can read it (view-only holding)", client.get("/holding/stay-limit", headers=H(leader)).status_code == 200)
check("regular staff can't change it (403)", client.put("/holding/stay-limit", json={"days": 2}, headers=H(staff)).status_code == 403)
check("leader can't change it (403)", client.put("/holding/stay-limit", json={"days": 2}, headers=H(leader)).status_code == 403)
check("over 90 days refused (422)", client.put("/holding/stay-limit", json={"days": 91}, headers=H(head)).status_code == 422)
r = client.put("/holding/stay-limit", json={"days": 5}, headers=H(head))
check("Head Officer sets 5 days", r.status_code == 200 and r.json().get("days") == 5 and r.json().get("updated_by_name") == "Head Reyes", (r.status_code, r.text[:200]))
a = audits("UPDATE_HOLDING_STAY_LIMIT")
check("the change is audited (from 7 to 5, by whom)", len(a) == 1 and a[0].user_id == head.user_id and "from 7 to 5" in (a[0].description or ""),
      [(x.user_id, x.description) for x in a])
check("everyone now reads 5", client.get("/holding/stay-limit", headers=H(staff)).json().get("days") == 5)

# 2. Before the limit (2 of 5 days): regular staff are refused, whatever the browser sends
early = animal(2)
r = client.patch(f"/holding/{early}", json={"facility_status": 8}, headers=H(staff))
check("staff: impound before the limit refused (409)", r.status_code == 409 and "2.0 of 5 days" in r.text, (r.status_code, r.text[:200]))
r = client.patch(f"/holding/{early}", json={"facility_status": 6}, headers=H(staff))
check("staff: set For Adoption directly before the limit refused (409)", r.status_code == 409, r.status_code)
r = client.patch(f"/holding/{early}", json={"facility_status": 7}, headers=H(staff))
check("staff: set Adopted directly before the limit refused (409)", r.status_code == 409, r.status_code)
r = client.post(f"/adoptions/promote/{early}", json={"notes": "x", "min_stay_days": 0}, headers=H(staff))
check("staff: promote before the limit refused even when the browser sends 0 days", r.status_code in (403, 409), (r.status_code, r.text[:200]))
check("...and the animal is still in holding", status_of(early) == 2)
r = client.patch(f"/holding/{early}", json={"facility_status": 8, "early_reason": "Owner surrendered the dog in writing."}, headers=H(staff))
check("staff: a reason doesn't help regular staff (409)", r.status_code == 409, r.status_code)

# 3. Early override: Head Officer / Admin only, with a reason that is audited
r = client.patch(f"/holding/{early}", json={"facility_status": 8}, headers=H(head))
check("Head Officer: early impound without a reason refused (400)", r.status_code == 400, (r.status_code, r.text[:200]))
r = client.patch(f"/holding/{early}", json={"facility_status": 8, "early_reason": "  "}, headers=H(head))
check("Head Officer: a blank reason is refused (400)", r.status_code == 400, r.status_code)
with patch("app.utils.notification_dispatcher.dispatch_notification"):
    r = client.patch(f"/holding/{early}", json={"facility_status": 8, "early_reason": "Owner surrendered the dog in writing."}, headers=H(head))
check("Head Officer: early impound with a reason allowed", r.status_code == 200 and status_of(early) == 8, (r.status_code, r.text[:200]))
a = audits("EARLY_STAY_LIMIT_OVERRIDE")
check("the early override is audited (who, days, reason)", len(a) == 1 and a[0].user_id == head.user_id and a[0].target_id == early
      and "Owner surrendered" in (a[0].description or "") and "2.0 of 5 days" in (a[0].description or ""), [(x.user_id, x.description) for x in a])
check("the reason is on the animal's timeline", "Owner surrendered the dog in writing." in notes_of(early), notes_of(early))

early2 = animal(1)
r = client.post(f"/adoptions/promote/{early2}", json={"notes": "Friendly dog"}, headers=H(admin))
check("Admin: early promote without a reason refused (400)", r.status_code == 400, (r.status_code, r.text[:200]))
r = client.post(f"/adoptions/promote/{early2}", json={"notes": "Friendly dog", "early_reason": "Needs a home before the typhoon."}, headers=H(admin))
check("Admin: early promote with a reason allowed", r.status_code == 200 and status_of(early2) == 6, (r.status_code, r.text[:200]))
check("...audited too", len(audits("EARLY_STAY_LIMIT_OVERRIDE")) == 2)
check("...and the reason is kept with the catalog notes on the timeline", "Needs a home before the typhoon." in notes_of(early2), notes_of(early2))

# 4. After the limit (6 of 5 days): regular staff can act, no override is recorded
late = animal(6)
with patch("app.utils.notification_dispatcher.dispatch_notification"):
    r = client.patch(f"/holding/{late}", json={"facility_status": 8}, headers=H(staff))
check("staff: impound after the limit allowed", r.status_code == 200 and status_of(late) == 8, (r.status_code, r.text[:200]))
late2 = animal(6)
r = client.post(f"/adoptions/promote/{late2}", json={"notes": "ok"}, headers=H(staff))
check("staff: promote after the limit allowed", r.status_code == 200 and status_of(late2) == 6, (r.status_code, r.text[:200]))
check("no override recorded for actions after the limit", len(audits("EARLY_STAY_LIMIT_OVERRIDE")) == 2)

# 5. An animal already listed for adoption passed the check when it was listed
listed = animal(1, status=6)
with patch("app.utils.notification_dispatcher.dispatch_notification"):
    r = client.patch(f"/holding/{listed}", json={"facility_status": 8}, headers=H(staff))
check("For Adoption -> Impounded isn't blocked again", r.status_code == 200 and status_of(listed) == 8, (r.status_code, r.text[:200]))

# 6. Leaders still can't adopt or impound (unchanged rule)
r = client.patch(f"/holding/{animal(9)}", json={"facility_status": 8}, headers=H(leader))
check("leader: impound refused (403)", r.status_code == 403, r.status_code)

# 7. The overdue counts use the stored limit, not a number from the page
animal(4)   # 4 of 5 days: not yet due
r = client.get("/holding/metrics?impound_days=0", headers=H(staff))
m = r.json() if r.status_code == 200 else {}
check("metrics: needs-impoundment uses the stored 5 days (page's 0 ignored)", r.status_code == 200 and m.get("needs_impoundment") == 1, (r.status_code, m))

# 8. A limit of 0 means no waiting
client.put("/holding/stay-limit", json={"days": 0}, headers=H(admin))
fresh = animal(0.01)
with patch("app.utils.notification_dispatcher.dispatch_notification"):
    r = client.patch(f"/holding/{fresh}", json={"facility_status": 8}, headers=H(staff))
check("limit 0: staff can impound immediately", r.status_code == 200, (r.status_code, r.text[:200]))

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
