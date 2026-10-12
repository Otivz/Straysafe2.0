"""
One animal, one pet record: when an adoption is final, the rescued animal's ownerless community record (e.g.
"Animal SS-0005") is merged into the adopter's new record, so AI matching doesn't suggest the same dog twice.
Someone's own pet is never moved. Run from the backend folder:  python tests/test_adoption_single_record.py
"""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "adoption_single_record_test.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-adoption-single-record-0123456789")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models  # noqa: E402,F401
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.report import Adoption, HoldingAnimal, Report, ReportStatus  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import Barangay, Subdivision, User  # noqa: E402
from app.routes import adoptions  # noqa: E402

Base.metadata.create_all(bind=engine)
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


def mk(name, role=1):
    u = User(name=name, email=f"{name.lower()}@test-mail.com", password="x", role_id=role, is_verified=True, status="Active",
             subdivision_id=1, barangay_id=1)
    db.add(u)
    db.flush()
    return u


reporter, adopter, staff, neighbour = mk("Rita"), mk("Adam"), mk("Bea", 3), mk("Nora")
results = []


def check(label, ok, extra=""):
    ok = bool(ok)
    results.append(ok)
    print(("[PASS] " if ok else "[FAIL] ") + label + (f"  -> {extra}" if (extra and not ok) else ""))


def setup(community_owner=None):
    community = Pet(pet_name="No Name", pet_type="Dog", owner_id=community_owner, status="Active", breed="German Shepherd")
    db.add(community)
    db.flush()
    rescue = Report(user_id=reporter.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
                    current_status_id=8, animal_type="Dog", pet_id=community.pet_id)
    db.add(rescue)
    db.flush()
    dog = HoldingAnimal(report_id=rescue.report_id, animal_name=None, animal_type="Dog", breed="German Shepherd", facility_status=6)
    db.add(dog)
    db.flush()
    app_ = Adoption(holding_id=dog.holding_id, applicant_id=adopter.user_id, status="Approved", full_name="Adam", address="x",
                    contact_no="09171234567", reason="I love dogs", staff_handed_over=True, is_handed_over=True)
    db.add(app_)
    db.flush()
    adoptions._ensure_adopted_pet_record(app_, db)
    db.flush()
    # A new sighting the AI matched to both records of the same dog
    sighting = Report(user_id=neighbour.user_id, subdivision_id=1, category_id=1, latitude=14.8, longitude=121.0,
                      current_status_id=1, animal_type="Dog")
    db.add(sighting)
    db.flush()
    db.add_all([ReportMatch(source_report_id=sighting.report_id, matched_pet_id=community.pet_id, similarity_score=90, status="AI_SUGGESTED"),
                ReportMatch(source_report_id=sighting.report_id, matched_pet_id=app_.created_pet_id, similarity_score=75, status="AI_SUGGESTED")])
    db.commit()
    return community, rescue, app_, sighting


community, rescue, app_, sighting = setup()
done = adoptions._finalize_adoption_if_ready(app_, db, staff)
db.commit()
db.expire_all()
adopted = db.get(Pet, app_.created_pet_id)
old = db.get(Pet, community.pet_id)
check("the adoption finalizes", done)
check("the community record is archived and points to the adopter's record",
      old.status == "Archived" and old.merged_into_pet_id == adopted.pet_id, (old.status, old.merged_into_pet_id))
check("the rescue report now belongs to the adopter's record", db.get(Report, rescue.report_id).pet_id == adopted.pet_id)
open_for_sighting = db.query(ReportMatch).filter(ReportMatch.source_report_id == sighting.report_id,
                                                 ReportMatch.status.in_(("AI_SUGGESTED", "PENDING_VERIFICATION"))).all()
check("the new sighting has one open suggestion for the dog, not two",
      len(open_for_sighting) == 1 and open_for_sighting[0].matched_pet_id == adopted.pet_id,
      [(m.matched_pet_id, m.status) for m in open_for_sighting])
check("nothing is deleted: the old suggestion is kept, closed",
      db.query(ReportMatch).filter(ReportMatch.source_report_id == sighting.report_id).count() == 2)
check("the adopter's record is the one still active and owned", adopted.status == "Active" and adopted.owner_id == adopter.user_id)

# Someone's own pet linked to the rescue report is never moved to the adopter
owned, rescue2, app2, _ = setup(community_owner=neighbour.user_id)
adoptions._finalize_adoption_if_ready(app2, db, staff)
db.commit()
db.expire_all()
owned = db.get(Pet, owned.pet_id)
check("a pet that has an owner is never merged by an adoption", owned.status == "Active" and owned.merged_into_pet_id is None
      and owned.owner_id == neighbour.user_id)

# Finalizing twice changes nothing more
again = adoptions._merge_community_record_into_adopted(app_, db, staff)
check("running it again does nothing", again == [])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
