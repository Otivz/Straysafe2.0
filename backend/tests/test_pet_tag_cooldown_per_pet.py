"""
Verify that scanning QR tags has no time-limit cooldown lockout:
Repeated scans of the same pet (Yumiii) and another pet (Mochii) always return 200 OK
without 429 QR_SCAN_COOLDOWN errors.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from starlette.requests import Request  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import pet_tags  # noqa: E402

api = build_app(pet_tags.router, pet_tags.public_router)
ids = create_schema_and_seed()


def _fake_request(path: str) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "app": api,
    })


def run_tests():
    db = SessionLocal()
    try:
        owner = db.get(User, ids["resident"])
        scanner = User(
            name="Scanner Resident",
            email="scanner@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=owner.subdivision_id,
            barangay_id=owner.barangay_id,
        )
        db.add(scanner)
        db.flush()

        yumiii = Pet(pet_name="Yumiii", pet_type="Cat", owner_id=owner.user_id, status="Active")
        mochii = Pet(pet_name="Mochii", pet_type="Cat", owner_id=owner.user_id, status="Active")
        db.add_all([yumiii, mochii])
        db.commit()

        token_y = pet_tags.create_tag(yumiii.pet_id, _fake_request(f"/pets/{yumiii.pet_id}/tag"), db=db, current_user=owner).token
        token_m = pet_tags.create_tag(mochii.pet_id, _fake_request(f"/pets/{mochii.pet_id}/tag"), db=db, current_user=owner).token
        assert token_y and token_m and token_y != token_m

        # Repeated immediate scans of Yumiii and Mochii must all succeed without cooldown lockout
        assert pet_tags.public_tag(token_y, _fake_request(f"/t/{token_y}"), db=db, viewer=scanner)["pet_name"] == "Yumiii"
        assert pet_tags.public_tag(token_y, _fake_request(f"/t/{token_y}"), db=db, viewer=scanner)["pet_name"] == "Yumiii"
        assert pet_tags.public_tag(token_m, _fake_request(f"/t/{token_m}"), db=db, viewer=scanner)["pet_name"] == "Mochii"
        assert pet_tags.public_tag(token_m, _fake_request(f"/t/{token_m}"), db=db, viewer=scanner)["pet_name"] == "Mochii"

        # Cooldown remaining is always 0
        tag_info = pet_tags.get_tag(yumiii.pet_id, db=db, current_user=owner)
        assert tag_info.cooldown_remaining_seconds == 0

        print("[PASS] test_pet_tag_cooldown_per_pet")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
