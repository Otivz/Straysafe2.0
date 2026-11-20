"""
Verify that `seed_demo_residents_and_pets.py` seeds 50 Selera Homes resident accounts
with at least one registered pet each (65 pets total), active QR tags, hashed passwords,
and full visibility in both Resident and Subdivision Admin endpoints, and is idempotent.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_tag import PetTag  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import pets, users  # noqa: E402
from app.utils.auth import verify_password  # noqa: E402
from seed_demo_residents_and_pets import (  # noqa: E402
    DEMO_EMAIL_DOMAIN,
    DEMO_PASSWORD_PLAIN,
    seed_demo_residents_and_pets,
)

api = build_app(users.router, pets.router)
ids = create_schema_and_seed()


def run_tests() -> None:
    db = SessionLocal()
    try:
        # 1. First run creates 50 demo residents and 65 registered pets
        res1 = seed_demo_residents_and_pets(db)
        assert res1["total_demo_residents"] == 50
        assert res1["residents_created"] == 50
        assert res1["residents_existing"] == 0
        assert res1["total_demo_pets"] == 65
        assert res1["pets_created"] == 65
        assert res1["pets_existing"] == 0
        assert res1["tags_ensured"] == 65

        # 2. Second run is completely idempotent (0 duplicates created)
        res2 = seed_demo_residents_and_pets(db)
        assert res2["total_demo_residents"] == 50
        assert res2["residents_created"] == 0
        assert res2["residents_existing"] == 50
        assert res2["total_demo_pets"] == 65
        assert res2["pets_created"] == 0
        assert res2["pets_existing"] == 65
        assert res2["tags_ensured"] == 65

        # 3. Verify every single demo resident has >= 1 registered pet, valid hashed password, and Selera Homes address
        demo_users = (
            db.query(User)
            .filter(User.email.like(f"%@{DEMO_EMAIL_DOMAIN}"))
            .order_by(User.user_id.asc())
            .all()
        )
        assert len(demo_users) == 50

        # Check password hash on sample residents (never stored as plain text)
        for sample_user in (demo_users[0], demo_users[24], demo_users[49]):
            assert sample_user.password != DEMO_PASSWORD_PLAIN
            assert verify_password(DEMO_PASSWORD_PLAIN, sample_user.password)

        for u in demo_users:
            assert u.role_id == 1
            assert u.is_verified is True
            assert u.status == "Active"
            assert u.subdivision_id == res1["subdivision_id"]
            assert u.address and "," in u.address
            assert u.phone and u.phone.startswith("09") and len(u.phone) == 11
            user_pets = db.query(Pet).filter(Pet.owner_id == u.user_id).all()
            assert len(user_pets) >= 1, f"Resident {u.email} has no registered pets!"
            for p in user_pets:
                assert p.reference_code and p.reference_code.startswith("SS-")
                assert p.pet_type in ("Dog", "Cat")
                assert p.breed
                assert p.gender in ("Male", "Female")
                assert p.birth_date is not None
                assert p.estimated_age
                assert p.color_markings and p.colors
                assert p.distinctive_markings
                assert p.is_vaccinated is True
                assert p.vaccination_date is not None and p.vaccine_expiry is not None
                assert p.photo_url and p.photo_url.startswith("https://")
                tag = db.query(PetTag).filter(PetTag.pet_id == p.pet_id, PetTag.status == "active").first()
                assert tag is not None and len(tag.token) >= 16

        # 4. Verify visibility through Admin/Subdivision Leader and Resident endpoints
        leader = db.get(User, ids["leader"])
        visible_users = users.get_users(
            role_id=1,
            position_id=None,
            subdivision_id=leader.subdivision_id,
            barangay_id=None,
            is_head_officer=None,
            current_user=leader,
            db=db,
        )
        visible_user_ids = {u.user_id for u in visible_users}
        assert set(res1["seeded_user_ids"]).issubset(visible_user_ids)

        subd_pets = pets.get_subdivision_pets(leader.subdivision_id, include_archived=False, db=db, current_user=leader)
        visible_pet_ids = {p.pet_id for p in subd_pets}
        assert set(res1["seeded_pet_ids"]).issubset(visible_pet_ids)

        # Resident views their own pets
        first_resident = demo_users[0]
        own_pets = pets.get_pets(include_archived=False, db=db, current_user=first_resident)
        assert len(own_pets) == 2

        print("[PASS] test_seed_demo_residents_and_pets")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
