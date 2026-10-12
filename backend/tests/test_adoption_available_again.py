"""
Several people applied for one animal; the Barangay approved one, which closed the others. If that approved
application then ends before the handover (cancelled / rejected), the animal is back in the catalog and the earlier
applicants are told once that it's available again. Their old applications stay closed (they can apply again).
Run from the backend folder:  python tests/test_adoption_available_again.py
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "adoption_available_again_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-available-again-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoptions  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402

Base.metadata.create_all(bind=engine)
api = FastAPI()
api.include_router(adoptions.router)
client = TestClient(api, raise_server_exceptions=False)
db = SessionLocal()
db.add(Barangay(barangay_id=1, barangay_name="B1", city="C"))
db.flush()
db.add(Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="S1"))
for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"S{sid}"))
try:
    from app.models.report import FacilityStatus
    for fid in range(1, 9):
        db.add(FacilityStatus(status_id=fid, status_name=f"F{fid}"))
except ImportError:
    pass
db.flush()


def mk(name):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=1, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


a, b, c = mk("Ana"), mk("Ben"), mk("Cara")
rep = Report(user_id=a.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0, current_status_id=7, animal_type="Dog")
db.add(rep)
db.flush()
dog = HoldingAnimal(report_id=rep.report_id, animal_name="Choco", facility_status=6)
db.add(dog)
db.commit()
H = lambda u: {"Authorization": "Bearer " + create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})}  # noqa: E731
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def application(user, status="Pending", notes=None, reviewed_at=None):
    x = Adoption(holding_id=dog.holding_id, applicant_id=user.user_id, status=status, full_name=user.name, address="x",
                 contact_no="09171234567", reason="I love dogs", review_notes=notes, reviewed_at=reviewed_at)
    db.add(x)
    db.commit()
    return x.adoption_id


def told(user):
    db.expire_all()
    return db.query(Notification).filter(Notification.user_id == user.user_id, Notification.type == "adoption_available_again").count()


# Ana was approved; Ben and Cara were closed automatically when that happened
now = datetime.now()
A = application(a, "Approved", reviewed_at=now - timedelta(hours=1))
B = application(b, "Rejected", notes=adoptions.AUTO_CLOSED_NOTE, reviewed_at=now - timedelta(hours=1))
C = application(c, "Rejected", notes="Home visit: not suitable")  # rejected on its own merits, not because of Ana

r = client.post(f"/adoptions/{A}/cancel", json={"reason": "Moving to another city"}, headers=H(a))
check("the approved adopter can cancel before the handover", r.status_code == 200, r.text[:200])
check("the applicant who was closed because Ana was chosen is told Choco is available again", told(b) == 1)
db.expire_all()
n = db.query(Notification).filter(Notification.user_id == b.user_id, Notification.type == "adoption_available_again").first()
check("...the notice opens Choco's adoption page (it carries the animal's holding id)", n is not None and n.related_id == dog.holding_id
      and "apply again" in n.message, n and (n.related_id, n.message))
check("an applicant rejected for their own reasons isn't told", told(c) == 0)
check("the person who cancelled isn't told", told(a) == 0)
db.expire_all()
check("the earlier applications stay closed (not reopened)", db.get(Adoption, B).status == "Rejected")

# Approved again (Ben this time), then rejected before the handover: told again for this new round, once
B2 = application(b, "Approved", reviewed_at=datetime.now())
D = application(mk("Dan"), "Rejected", notes=adoptions.AUTO_CLOSED_NOTE, reviewed_at=datetime.now())
db.expire_all()
adoptions.notify_available_again(db, db.get(Adoption, B2))
db.commit()
adoptions.notify_available_again(db, db.get(Adoption, B2))
db.commit()
dan = db.query(User).filter(User.name == "Dan").first()
check("a later round tells that round's closed applicants, once", told(dan) == 1)

# Not back in the catalog: nobody is told
dog.facility_status = 8  # impounded
db.commit()
E = application(mk("Eve"), "Rejected", notes=adoptions.AUTO_CLOSED_NOTE, reviewed_at=datetime.now() - timedelta(minutes=1))
F_ = application(mk("Finn"), "Approved", reviewed_at=datetime.now() - timedelta(minutes=2))
db.expire_all()
adoptions.notify_available_again(db, db.get(Adoption, F_))
db.commit()
eve = db.query(User).filter(User.name == "Eve").first()
check("an animal that isn't back in the catalog (impounded) triggers no notice", told(eve) == 0)

db.close()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
