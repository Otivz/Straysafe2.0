"""
Unit tests for breed, colour-tag array, and description matching in complaint leads
(services/complaints.py -> leads, utils/complaint_rules.py).

Offline: uses throwaway SQLite via _isolated_db.
"""
import _isolated_db  # noqa: F401
from datetime import datetime

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models.pet import Pet
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.user import Barangay, Subdivision, User
from app.services.complaints import leads


def run_all_tests() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        brgy = Barangay(barangay_name="Cutcut", city="Guiguinto")
        db.add(brgy)
        db.flush()
        sub = Subdivision(barangay_id=brgy.barangay_id, subdivision_name="Selera Homes")
        db.add(sub)
        db.flush()
        cat = ReportCategory(category_name="Animal Nuisance")
        st = ReportStatus(status_name="Pending")
        db.add_all([cat, st])
        db.flush()

        complainant = User(
            name="Mark Anthony Angelo", email="mark@test.local", password="x",
            role_id=1, subdivision_id=sub.subdivision_id, address="Block 3 Lot 4",
        )
        owner_gsd = User(
            name="Eron Dave Geronimo", email="eron@test.local", password="x",
            role_id=1, subdivision_id=sub.subdivision_id, address="Block 6, Bambang",
        )
        owner_aspin = User(
            name="Carlo Celestino", email="carlo@test.local", password="x",
            role_id=1, subdivision_id=sub.subdivision_id, address="Block 5, Narra St.",
        )
        db.add_all([complainant, owner_gsd, owner_aspin])
        db.flush()

        pet_gsd = Pet(
            pet_name="Kane", pet_type="Dog", breed="German Sheperd",
            color_markings="Brown, Black", colors=["Brown", "Black"],
            size_category="Medium", owner_id=owner_gsd.user_id,
        )
        pet_aspin = Pet(
            pet_name="Tagpi", pet_type="Dog", breed="Aspin",
            color_markings="Brindle", colors=["Brindle", "Black"],
            size_category="Medium", owner_id=owner_aspin.user_id,
        )
        db.add_all([pet_gsd, pet_aspin])
        db.flush()

        # 1. SS-2026-0005 style report: "Black, Brown · Medium, Aspin" -> German Sheperd excluded, Aspin included
        rep1 = Report(
            user_id=complainant.user_id, subdivision_id=sub.subdivision_id,
            category_id=cat.category_id, current_status_id=st.status_id,
            animal_type="Dog", animal_color="Black, Brown · Medium, Aspin",
            animal_colors=["Black", "Brown"],
            description="dog always scattering my trash",
            latitude=14.8, longitude=121.0,
            created_at=datetime.now(),
        )
        db.add(rep1)
        db.flush()
        res1 = leads(db, rep1)
        names1 = [x["pet_name"] for x in res1["registry"]]
        assert "Kane" not in names1, f"German Sheperd Kane must not match Aspin complaint: {names1}"
        assert "Tagpi" in names1, f"Aspin Tagpi should match on breed + Black: {names1}"
        print("[PASS] 1. Conflicting breed (German Sheperd) excluded for Aspin complaint")

        # 2. Explicit animal_breed + custom colour tag array ("Brindle") without legacy colour words
        rep2 = Report(
            user_id=complainant.user_id, subdivision_id=sub.subdivision_id,
            category_id=cat.category_id, current_status_id=st.status_id,
            animal_type="Dog", animal_breed="Aspin",
            animal_colors=["Brindle"],
            description="roaming near gate",
            latitude=14.8, longitude=121.0,
            created_at=datetime.now(),
        )
        db.add(rep2)
        db.flush()
        res2 = leads(db, rep2)
        names2 = [x["pet_name"] for x in res2["registry"]]
        assert names2 == ["Tagpi"], f"Expected only Tagpi for Brindle Aspin, got {names2}"
        assert "Aspin" in res2["registry"][0]["why"] and "brindle" in res2["registry"][0]["why"]
        print("[PASS] 2. Explicit animal_breed + custom tag array (Brindle) matched")

        # 3. Minor spelling difference in breed ("German Shepherd" vs "German Sheperd")
        rep3 = Report(
            user_id=complainant.user_id, subdivision_id=sub.subdivision_id,
            category_id=cat.category_id, current_status_id=st.status_id,
            animal_type="Dog", animal_breed="German Shepherd",
            description="large dog roaming",
            latitude=14.8, longitude=121.0,
            created_at=datetime.now(),
        )
        db.add(rep3)
        db.flush()
        res3 = leads(db, rep3)
        names3 = [x["pet_name"] for x in res3["registry"]]
        assert names3 == ["Kane"], f"Expected Kane for German Shepherd (no colours), got {names3}"
        print("[PASS] 3. Breed-only match with minor spelling tolerance works")

        print("\nALL COMPLAINT LEADS TESTS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    run_all_tests()
