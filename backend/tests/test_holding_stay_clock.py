"""
Each holding facility has its own stay clock (app/utils/holding_stay.py): when an animal in holding moves to another
facility (Subdivision pen -> Barangay shelter), the stay-limit progress restarts there. Intake date and total custody
time are kept. Run from the backend folder:  python tests/test_holding_stay_clock.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

_DB = os.path.join(tempfile.mkdtemp(), "holding_stay_clock_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-holding-stay-clock-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.landmark import Landmark  # noqa: E402
from app.models.report import FacilityStatus, HoldingAnimal, HoldingTimeline, Report, ReportCategory, ReportStatus  # noqa: E402
from app.models.user import Barangay, Role, Subdivision, User  # noqa: E402
from app.routes import holding  # noqa: E402  (registers the listener, like the app)
from app.utils.holding_stay import ARRIVAL_EVENT, facility_stay_start  # noqa: E402

Base.metadata.create_all(bind=engine)
db = SessionLocal()
results = []


def check(label, ok, extra=""):
    results.append(bool(ok))
    print(("  ok   " if ok else "  FAIL ") + label + ("" if ok else f"  -> {extra}"))


for rid, rn in ((1, "Citizen"), (2, "Subdivision Leader"), (3, "Barangay Staff"), (4, "Admin")):
    db.add(Role(role_id=rid, role_name=rn))
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
db.add(ReportCategory(category_id=4, category_name="Roaming"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
for sid in range(1, 9):
    db.add(FacilityStatus(status_id=sid, status_name=f"F{sid}"))
db.flush()
subd_pen = Landmark(name="Selera Pen", barangay_id=1, subdivision_id=1, latitude=14.8, longitude=121.0, is_holding_facility=True)
brgy_shelter = Landmark(name="Barangay Shelter", barangay_id=1, subdivision_id=None, latitude=14.8, longitude=121.0, is_holding_facility=True)
db.add_all([subd_pen, brgy_shelter])
db.commit()
rep_user = User(name="Rita Reporter", email="rita@test-mail.com", password="x", role_id=1, is_verified=True,
                status="Active", subdivision_id=1, barangay_id=1, phone="09170000000")
db.add(rep_user)
db.commit()


def held_animal(days_ago=1.0, facility=None):
    r = Report(user_id=rep_user.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0, current_status_id=7, animal_type="Dog",
               facility_id=(facility or subd_pen).landmark_id)
    db.add(r)
    db.flush()
    a = HoldingAnimal(report_id=r.report_id, animal_type="Dog", facility_status=2, overdue_notified=True,
                      intake_date=datetime.utcnow() - timedelta(days=days_ago))
    db.add(a)
    db.commit()
    return r, a


def arrivals(a):
    return db.query(HoldingTimeline).filter(HoldingTimeline.holding_id == a.holding_id,
                                            HoldingTimeline.event_type == ARRIVAL_EVENT).all()


# 1 day in the Subdivision pen, then moved to the Barangay shelter
r, a = held_animal(days_ago=1.0)
first_intake = a.intake_date
check("before the move, the stay clock counts from the intake", facility_stay_start(a) == first_intake)
r.facility_id = brgy_shelter.landmark_id
db.commit()
db.expire_all()
a = db.get(HoldingAnimal, a.holding_id)
logs = arrivals(a)
check("moving to another facility records the arrival", len(logs) == 1 and logs[0].title == "Arrived at Barangay Shelter"
      and "(Barangay facility)" in (logs[0].notes or ""), [(l.title, l.notes) for l in logs])
start = facility_stay_start(a)
check("...and the stay clock restarts there (not 1 day in)", start is not None and start > first_intake + timedelta(hours=23),
      (start, first_intake))
check("...the first intake date is kept", a.intake_date == first_intake)
check("...and the overdue notice can fire again for the new stay", a.overdue_notified is False)

pop = holding._populate(a)
check("the holding API returns the current facility's clock start", getattr(pop, "facility_intake_date", None) == start)
check("...total custody still counts from the first intake (about 1 day)", (pop.total_duration_days or 0) >= 0.9, pop.total_duration_days)

# in transit (no facility) and back to the same shelter: no second restart
r = db.get(Report, r.report_id)
r.facility_id = None
db.commit()
r.facility_id = brgy_shelter.landmark_id
db.commit()
check("in transit and back to the same facility doesn't restart the clock again", len(arrivals(a)) == 1)

# a report not in holding: nothing recorded
r2 = Report(user_id=rep_user.user_id, subdivision_id=1, category_id=4, latitude=14.8, longitude=121.0, current_status_id=2, animal_type="Dog")
db.add(r2)
db.commit()
r2.facility_id = subd_pen.landmark_id
db.commit()
check("no arrival is recorded for a report that isn't in holding", db.query(HoldingTimeline).count() == 1)

# a discharged animal (claimed) isn't tracked
r3, a3 = held_animal(days_ago=2.0)
a3.facility_status = 3
db.commit()
r3.facility_id = brgy_shelter.landmark_id
db.commit()
check("no arrival is recorded for a discharged animal", len(arrivals(a3)) == 0)

# metrics: an animal 4 days in custody but just moved is not "needs impoundment"
r4, a4 = held_animal(days_ago=40.0)
r4.facility_id = brgy_shelter.landmark_id
db.commit()
db.expire_all()
check("a long custody that just moved facility starts a fresh stay", facility_stay_start(db.get(HoldingAnimal, a4.holding_id))
      > datetime.utcnow() - timedelta(days=1))

# a move made before arrival entries existed: read from the report history (facility recorded on each entry)
from app.models.report import StatusHistory  # noqa: E402
r5, a5 = held_animal(days_ago=3.0)
t0 = datetime.utcnow()
db.add(StatusHistory(report_id=r5.report_id, report_status_id=7, facility_id=subd_pen.landmark_id, remarks="held at pen",
                     created_at=t0 - timedelta(days=3)))
db.add(StatusHistory(report_id=r5.report_id, report_status_id=6, facility_id=None, remarks="picked up",
                     created_at=t0 - timedelta(hours=2, minutes=1)))
db.add(StatusHistory(report_id=r5.report_id, report_status_id=7, facility_id=brgy_shelter.landmark_id, remarks="at shelter",
                     created_at=t0 - timedelta(hours=2)))
db.commit()
# change the facility without the listener (as old code did): a direct UPDATE
from sqlalchemy import update  # noqa: E402
db.execute(update(Report).where(Report.report_id == r5.report_id).values(facility_id=brgy_shelter.landmark_id))
db.commit()
db.expire_all()
a5 = db.get(HoldingAnimal, a5.holding_id)
st5 = facility_stay_start(a5)
check("an older move is read from history: the shelter stay began 2 hours ago, not 3 days",
      st5 is not None and abs((st5 - (t0 - timedelta(hours=2))).total_seconds()) < 5, st5)
p5 = holding._populate(a5)
check("...the API says the animal is at a Barangay facility", p5.current_facility_level == "Barangay", p5.current_facility_level)

# impounded today at the Barangay shelter: the report's facility is cleared, yet it still counts for that shelter
from app.utils.holding_stay import db_now  # noqa: E402
r6, a6 = held_animal(days_ago=4.0, facility=brgy_shelter)
db.add(StatusHistory(report_id=r6.report_id, report_status_id=7, facility_id=brgy_shelter.landmark_id, remarks="at shelter"))
db.commit()
a6.facility_status = 8
a6.discharge_date = db_now(db)
r6 = db.get(Report, r6.report_id)
r6.facility_id = None
r6.custody_status = "Impounded"
db.commit()
m = holding.get_metrics(barangay_id=1, barangay_only=True, impound_days=3, db=db, current_user=None)
check("an animal impounded today counts in the shelter's Discharged Today", m.resolved_today >= 1, m.resolved_today)
ids = [x.holding_id for x in holding.list_animals(barangay_id=1, barangay_only=True, db=db, current_user=None)]
check("...and stays in the shelter's list (history)", a6.holding_id in ids, ids)
ids_f = [x.holding_id for x in holding.list_animals(facility_id=brgy_shelter.landmark_id, db=db, current_user=None)]
check("...also when filtering by that facility", a6.holding_id in ids_f, ids_f)
ids_s = [x.holding_id for x in holding.list_animals(facility_id=subd_pen.landmark_id, db=db, current_user=None)]
check("...but not under another facility", a6.holding_id not in ids_s, ids_s)

print(f"\n{sum(results)}/{len(results)} checks passed")
db.close()
sys.exit(0 if all(results) else 1)
