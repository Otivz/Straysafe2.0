"""
Dynamic Colour or Coat tag storage and API tests:
  1. Whitespace trimming and case-insensitive duplicate removal in normalize_color_tags.
  2. Pet registration & update stores structured JSON array in `pets.colors` while syncing `color_markings`.
  3. Report creation & update stores structured JSON array in `reports.animal_colors` while syncing `animal_color`.
  4. Lost-pet report generation inherits `colors` array into `reports.animal_colors` and Lost & Found matching uses it.
  5. Resident redaction preserves `animal_colors` on public reports.

Run from backend folder:
    python -u tests/test_animal_color_tags.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB)

from decimal import Decimal

from fastapi import BackgroundTasks
from starlette.requests import Request

from app.database import SessionLocal
from app.models.pet import Pet
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.routes import pets as pet_routes
from app.routes import reports as report_routes
from app.schemas.pet import PetCreate, PetUpdate
from app.schemas.report import ReportCreate, ReportUpdate
from app.services import lost_found_matching as LFM
from app.utils import color_tags
from app.utils import report_visibility


PASSED = 0


def check(label: str, cond: bool, info="") -> None:
    global PASSED
    assert cond, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def _fake_req():
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/reports/",
            "headers": [(b"user-agent", b"straysafe-color-test/1.0")],
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
            "server": ("127.0.0.1", 8000),
        }
    )


def main() -> None:
    seed_ids = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        resident = db.get(User, seed_ids["resident"])
        assert resident is not None

        # 1. Normalization helper
        norm = color_tags.normalize_color_tags(["  White  ", "Tan", "white", "  tan  ", "", "Black  Patch", "black   patch"])
        check("normalize_color_tags trims and deduplicates case-insensitively", norm == ["White", "Tan", "Black Patch"], norm)
        check("parse fallback comma-separated string", color_tags.normalize_color_tags(fallback_text="Brown, White, brown; Cream") == ["Brown", "White", "Cream"])

        # 2. Pet registration + update stores JSON array
        created_pet = pet_routes.create_pet(
            pet=PetCreate(
                pet_name="Kobe",
                pet_type="Dog",
                breed="Aspin",
                colors=["  White ", "Tan", "WHITE", "Black"],
                gender="Male",
                confirm_new_pet=True,
            ),
            req=_fake_req(),
            background_tasks=BackgroundTasks(),
            db=db,
            current_user=resident,
        )
        check("pet stored with JSON array colors", created_pet.colors == ["White", "Tan", "Black"], created_pet.colors)
        check("pet legacy color_markings synced cleanly", created_pet.color_markings == "White, Tan, Black", created_pet.color_markings)

        db_pet = db.get(Pet, created_pet.pet_id)
        assert db_pet is not None
        check("ORM Pet.colors persisted as list", isinstance(db_pet.colors, list) and db_pet.colors == ["White", "Tan", "Black"], db_pet.colors)

        updated_pet = pet_routes.update_pet(
            pet_id=created_pet.pet_id,
            pet_update=PetUpdate(colors=["Golden", "White", "golden"]),
            req=_fake_req(),
            background_tasks=BackgroundTasks(),
            db=db,
            current_user=resident,
        )
        check("pet update replaces colors JSON array and deduplicates", updated_pet.colors == ["Golden", "White"], updated_pet.colors)
        check("pet update resyncs color_markings", updated_pet.color_markings == "Golden, White", updated_pet.color_markings)

        # 3. Found animal report stores JSON array in reports.animal_colors
        found_cat = db.query(ReportCategory).filter(ReportCategory.category_name == "Found / Unidentified Animal").first()
        assert found_cat is not None
        rep_out = report_routes.create_report(
            report_in=ReportCreate(
                category_id=found_cat.category_id,
                animal_type="Dog",
                animal_colors=[" White", "Brown ", "white", "Mixed"],
                description="Friendly stray dog near the main gate.",
                latitude=14.8005,
                longitude=121.0035,
                landmark="Gate 1",
            ),
            request=_fake_req(),
            background_tasks=BackgroundTasks(),
            db=db,
            current_user=resident,
        )
        check("report stored with JSON array animal_colors", rep_out.animal_colors == ["White", "Brown", "Mixed"], rep_out.animal_colors)
        check("report legacy animal_color synced cleanly", rep_out.animal_color == "White, Brown, Mixed", rep_out.animal_color)
        check("RESIDENT_SAFE_FIELDS includes animal_colors", "animal_colors" in report_visibility.RESIDENT_SAFE_FIELDS)

        db_rep = db.get(Report, rep_out.report_id)
        assert db_rep is not None
        facts = LFM.facts_of(db, db_rep)
        check("lost_found_matching extracts array colors", {"white", "brown"}.issubset(facts.colors), facts.colors)

        # 4. Update report updates animal_colors JSON array
        patched = report_routes.update_report(
            report_id=rep_out.report_id,
            report_update=ReportUpdate(animal_colors=["Cream", "Tan", "CREAM"]),
            db=db,
            current_user=resident,
        )
        check("report patch updates animal_colors JSON array", patched.animal_colors == ["Cream", "Tan"], patched.animal_colors)
        check("report patch resyncs animal_color", patched.animal_color == "Cream, Tan", patched.animal_color)

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
