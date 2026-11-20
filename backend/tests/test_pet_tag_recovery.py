"""
Verify that QR tag scan resolution lets the owner choose whether the pet is recovered:
  1. `recovered=False` resolves the scan (and clears finder_phone) while keeping the pet `Lost` and its alert active.
  2. `recovered=True` resolves all open QR scans, closes the LostPetAlert + Report via `confirm_recovery`, and sets `Pet.status = "Active"`.
  3. Direct `LP.confirm_recovery` (from the Lost Pet report flow) also marks open QR tag scans resolved.
  4. Fallback when `Pet.status == "Lost"` without an active LostPetAlert restores `Pet.status = "Active"`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401

from decimal import Decimal  # noqa: E402
from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from starlette.requests import Request  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.lost_pet_alert import LostPetAlert  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_tag import PetTagScan  # noqa: E402
from app.models.report import Report, ReportCategory  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import pet_tags  # noqa: E402
from app.services import lost_pet_lifecycle as LP  # noqa: E402

api = build_app(pet_tags.router, pet_tags.public_router)
ids = create_schema_and_seed()


def _fake_request(path: str, method: str = "POST") -> Request:
    return Request({
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "app": api,
    })


def _make_lost_pet_case(db, owner: User, name: str):
    pet = Pet(pet_name=name, pet_type="Dog", owner_id=owner.user_id, status="Lost")
    db.add(pet)
    db.flush()

    lost_cat = db.query(ReportCategory).filter(ReportCategory.category_name == "Lost Pet").first()
    assert lost_cat is not None

    report = Report(
        user_id=owner.user_id,
        pet_id=pet.pet_id,
        category_id=lost_cat.category_id,
        subdivision_id=owner.subdivision_id,
        current_status_id=1,
        animal_type="Dog",
        description=f"[LOST PET REPORT] {name} went missing near Gate 1",
        landmark="Gate 1",
        latitude=Decimal("14.80000000"),
        longitude=Decimal("120.90000000"),
        priority_level="Medium",
    )
    db.add(report)
    db.flush()

    alert = LP.publish_lost_pet_notice(
        db,
        report,
        owner,
        last_seen_at=None,
        last_seen_location="Gate 1",
        last_seen_lat=14.8,
        last_seen_lng=120.9,
        owner_note="Lost near gate",
    )
    db.commit()
    return pet, report, alert


def run_tests():
    db = SessionLocal()
    try:
        owner = db.get(User, ids["resident"])
        scanner = User(
            name="Finder Neighbor",
            email="finder@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=owner.subdivision_id,
            barangay_id=owner.barangay_id,
        )
        db.add(scanner)
        db.commit()

        # 1 + 2: Ruru starts Lost with an active alert + two QR tag found reports
        ruru, report_r, alert_r = _make_lost_pet_case(db, owner, "Ruru")
        token_r = pet_tags.create_tag(ruru.pet_id, _fake_request(f"/pets/{ruru.pet_id}/tag"), db=db, current_user=owner).token

        pet_tags.public_found(
            token_r,
            pet_tags.FoundReport(location_label="Gate 2", note="Seen here", finder_phone="09171234567", share_contact=True),
            _fake_request(f"/t/{token_r}/found"),
            db=db,
            viewer=scanner,
        )
        pet_tags.public_found(
            token_r,
            pet_tags.FoundReport(location_label="Clubhouse", note="With me now", finder_phone="09179998888", share_contact=True),
            _fake_request(f"/t/{token_r}/found"),
            db=db,
            viewer=scanner,
        )
        scans_r = db.query(PetTagScan).filter(PetTagScan.pet_id == ruru.pet_id, PetTagScan.kind == "found_report").order_by(PetTagScan.scan_id.asc()).all()
        assert len(scans_r) == 2

        # Choose "still missing" (recovered=False) on first scan -> scan resolved, pet stays Lost
        res_not_home = pet_tags.resolve_one_scan(
            ruru.pet_id,
            scans_r[0].scan_id,
            _fake_request(f"/pets/{ruru.pet_id}/tag/scans/{scans_r[0].scan_id}/resolve"),
            payload=pet_tags.ResolveScanBody(recovered=False),
            db=db,
            current_user=owner,
        )
        db.expire_all()
        assert res_not_home["recovered"] is False
        assert res_not_home["pet_status"] == "Lost"
        assert db.get(PetTagScan, scans_r[0].scan_id).status == "resolved"
        assert db.get(PetTagScan, scans_r[0].scan_id).finder_phone is None
        assert db.get(Pet, ruru.pet_id).status == "Lost"
        assert db.get(LostPetAlert, alert_r.alert_id).status == "active"

        # Choose "back home" (recovered=True) on second scan -> pet becomes Active, alert/report close
        res_home = pet_tags.resolve_one_scan(
            ruru.pet_id,
            scans_r[1].scan_id,
            _fake_request(f"/pets/{ruru.pet_id}/tag/scans/{scans_r[1].scan_id}/resolve"),
            payload=pet_tags.ResolveScanBody(recovered=True),
            db=db,
            current_user=owner,
        )
        db.expire_all()
        assert res_home["recovered"] is True
        assert res_home["pet_status"] == "Active"
        assert res_home["report_id"] == report_r.report_id
        assert db.get(Pet, ruru.pet_id).status == "Active"
        assert db.get(LostPetAlert, alert_r.alert_id).status == "closed"
        assert db.get(LostPetAlert, alert_r.alert_id).close_outcome == "recovered"
        assert db.get(Report, report_r.report_id).closure_disposition == "pet_recovered"
        assert db.get(PetTagScan, scans_r[1].scan_id).status == "resolved"

        # 3: Direct confirm_recovery also resolves open QR scans
        milo, report_m, alert_m = _make_lost_pet_case(db, owner, "Milo")
        token_m = pet_tags.create_tag(milo.pet_id, _fake_request(f"/pets/{milo.pet_id}/tag"), db=db, current_user=owner).token
        pet_tags.public_found(
            token_m,
            pet_tags.FoundReport(location_label="Park", note="Safe with me", finder_phone="09171112222", share_contact=True),
            _fake_request(f"/t/{token_m}/found"),
            db=db,
            viewer=scanner,
        )
        LP.confirm_recovery(db, alert_m, source="owner_app", actor=owner)
        db.commit()
        db.expire_all()
        scan_m = db.query(PetTagScan).filter(PetTagScan.pet_id == milo.pet_id, PetTagScan.kind == "found_report").first()
        assert scan_m is not None and scan_m.status == "resolved" and scan_m.finder_phone is None
        assert db.get(Pet, milo.pet_id).status == "Active"

        # 4: Pet marked Lost with no open LostPetAlert falls back to Active when recovered=True
        biscuit = Pet(pet_name="Biscuit", pet_type="Cat", owner_id=owner.user_id, status="Lost")
        db.add(biscuit)
        db.commit()
        res_fallback = pet_tags.resolve_all_scans(
            biscuit.pet_id,
            _fake_request(f"/pets/{biscuit.pet_id}/tag/scans/resolve"),
            payload=pet_tags.ResolveScanBody(recovered=True),
            db=db,
            current_user=owner,
        )
        db.expire_all()
        assert res_fallback["recovered"] is True
        assert res_fallback["pet_status"] == "Active"
        assert db.get(Pet, biscuit.pet_id).status == "Active"

        print("[PASS] test_pet_tag_recovery")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
