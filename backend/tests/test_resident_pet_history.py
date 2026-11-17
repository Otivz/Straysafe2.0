"""
Offline SQLite tests for GET /pets/{pet_id}/confirmed-incidents (Resident Pet Profile History).

Verifies:
1. Only the registered owner can access the endpoint (other residents get 403).
2. Unverified incidents, lost-pet reports, and unconfirmed reporter-linked reports are excluded.
3. Explicitly confirmed, verified incidents are returned with sanitized fields only
   (no reporter identity, contact info, raw description PII, or internal staff notes).
4. Incidents from before a later owner took ownership (became_owner_after) are excluded.
"""
import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401  (must be first: arms SQLite isolation before any app import)

import json  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.pet import Pet  # noqa: E402
from app.models.pet_owner_confirmation import PetOwnerConfirmation  # noqa: E402
from app.models.report import Report, ReportCategory  # noqa: E402
from app.models.report_match import ReportMatch  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.warning_letter import GeneratedWarningLetter  # noqa: E402
from app.routes import pets  # noqa: E402
from app.utils import case_vocab as V, identity_decision  # noqa: E402

seed = _isolated_db.create_schema_and_seed()
api = _isolated_db.build_app(pets.router)


def run_tests():
    db = SessionLocal()
    try:
        owner = db.get(User, seed["resident"])
        leader = db.get(User, seed["leader"])
        other_res = User(
            name="Other Resident",
            email="other@example.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=owner.subdivision_id,
            barangay_id=owner.barangay_id,
        )
        reporter = User(
            name="Reporter Secret Name",
            email="reporter@example.test",
            phone="09171234567",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=owner.subdivision_id,
            barangay_id=owner.barangay_id,
        )
        db.add_all([other_res, reporter])
        db.flush()

        # Ensure categories exist (nuisance + lost_pet)
        nuisance_cat = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first()
        if not nuisance_cat:
            nuisance_cat = ReportCategory(category_name="Animal Nuisance")
            db.add(nuisance_cat)
            db.flush()
        lost_cat = db.get(ReportCategory, V.LOST_PET_CATEGORY_ID)
        if not lost_cat:
            lost_cat = ReportCategory(category_id=V.LOST_PET_CATEGORY_ID, category_name="Lost Pet")
            db.add(lost_cat)
            db.flush()

        now = datetime(2026, 11, 17, 12, 0, 0)
        pet = Pet(
            owner_id=owner.user_id,
            registered_by_user_id=owner.user_id,
            pet_name="Bantay",
            pet_type="Dog",
            breed="Aspin",
            primary_color="Brown",
            status="Active",
            created_at=now - timedelta(days=30),
        )
        db.add(pet)
        db.flush()

        def mk_report(category_id: int, incident_verif: str, legacy_verif: str, days_ago: int, **extra):
            r = Report(
                user_id=reporter.user_id,
                subdivision_id=owner.subdivision_id,
                category_id=category_id,
                pet_id=pet.pet_id,
                animal_type="Dog",
                description="Private reporter text naming Reporter Secret Name 09171234567",
                latitude=Decimal("14.8000"),
                longitude=Decimal("121.0000"),
                current_status_id=2,
                verification_status=legacy_verif,
                incident_verification=incident_verif,
                identity_status="identified",
                assessment_notes="Internal leader-only note should never leak",
                verification_notes="Internal verification note should never leak",
                suspected_owner_name="Suspected Neighbor",
                created_at=now - timedelta(days=days_ago),
                seen_at=now - timedelta(days=days_ago),
                **extra,
            )
            db.add(r)
            db.flush()
            return r

        # 1) Unverified report -> MUST BE EXCLUDED
        mk_report(nuisance_cat.category_id, "unverified", "unverified", 5)

        # 2) Verified lost-pet report -> MUST BE EXCLUDED from incidents
        r_lost = mk_report(lost_cat.category_id, "verified", "verified_true", 4)
        db.add(AuditLog(
            user_id=leader.user_id,
            action=identity_decision.ACTION,
            target_table="reports",
            target_id=r_lost.report_id,
            description="decided",
            log_type="operation",
        ))

        # 3) Verified incident linked ONLY by reporter (no Leader decision, no confirmed match) -> MUST BE EXCLUDED
        mk_report(nuisance_cat.category_id, "verified", "verified_true", 3)

        # 4) Verified incident with Leader CASE_IDENTITY_DECIDED + warning letter -> MUST BE INCLUDED
        r_confirmed_leader = mk_report(
            nuisance_cat.category_id,
            "verified",
            "verified_true",
            2,
            verified_chasing=True,
        )
        db.add(AuditLog(
            user_id=leader.user_id,
            action=identity_decision.ACTION,
            target_table="reports",
            target_id=r_confirmed_leader.report_id,
            description="Leader confirmed pet identity",
            log_type="operation",
        ))
        db.add(GeneratedWarningLetter(
            warning_reference=f"WARN-2026-{r_confirmed_leader.report_id:04d}",
            subdivision_id=owner.subdivision_id,
            report_id=r_confirmed_leader.report_id,
            case_reference=f"SS-2026-{r_confirmed_leader.report_id:04d}",
            recipient_user_id=owner.user_id,
            recipient_name=owner.name,
            pet_id=pet.pet_id,
            pet_name=pet.pet_name,
            pet_type=pet.pet_type,
            warning_level="1st Warning",
            template_name="Standard Warning",
            template_version_number=1,
            rendered_subject="Official Warning Notice",
            rendered_body="Warning body",
            rendered_html="<p>Warning body</p>",
            issued_by=leader.user_id,
            issued_by_name=leader.name,
        ))

        # 5) Verified incident confirmed via ReportMatch (OWNER_CONFIRMED) -> MUST BE INCLUDED
        r_confirmed_match = mk_report(nuisance_cat.category_id, "verified", "verified_true", 1)
        db.add(ReportMatch(
            source_report_id=r_confirmed_match.report_id,
            matched_pet_id=pet.pet_id,
            status="CONFIRMED_MATCH",
            owner_confirmation_status="OWNER_CONFIRMED",
        ))

        db.commit()

        # Verify route registration on FastAPI router
        route = next(
            (r for r in api.routes if getattr(r, "path", None) == "/pets/{pet_id}/confirmed-incidents"),
            None,
        )
        assert route is not None and "GET" in (getattr(route, "methods", set()) or set())

        # Check 403 for non-owner resident
        try:
            pets.get_pet_confirmed_incidents(pet.pet_id, db=db, current_user=other_res)
            raise AssertionError("Expected 403 for non-owner resident")
        except HTTPException as exc:
            assert exc.status_code == 403, exc

        # Check 200 payload for pet owner
        res = pets.get_pet_confirmed_incidents(pet.pet_id, db=db, current_user=owner)
        items = res["items"]
        returned_ids = {it["report_id"] for it in items}
        assert returned_ids == {r_confirmed_leader.report_id, r_confirmed_match.report_id}, items

        by_id = {it["report_id"]: it for it in items}
        item1 = by_id[r_confirmed_leader.report_id]
        assert item1["has_warning_letter"] is True
        assert "chasing" in item1["summary"].lower()
        assert item1["reference_code"] == f"SS-2026-{r_confirmed_leader.report_id:04d}"

        # Privacy check: ensure no reporter identity or internal staff notes appear anywhere in payload
        serialized = json.dumps(res)
        for forbidden_text in (
            "Reporter Secret Name",
            "09171234567",
            "Internal leader-only note",
            "Internal verification note",
            "Suspected Neighbor",
            "reporter_id",
            "reporter_name",
        ):
            assert forbidden_text not in serialized, f"Leaked {forbidden_text} in {serialized}"

        # Check ownership transfer guard: if pet was transferred to other_res AFTER those reports,
        # other_res must NOT see older pre-transfer incidents.
        pet.owner_id = other_res.user_id
        db.add(PetOwnerConfirmation(
            pet_id=pet.pet_id,
            proposed_owner_id=other_res.user_id,
            proposed_by=leader.user_id,
            source="assign",
            status="Accepted",
            responded_at=now,
        ))
        db.commit()

        res_transferred = pets.get_pet_confirmed_incidents(pet.pet_id, db=db, current_user=other_res)
        assert res_transferred["items"] == [], res_transferred

        print("[PASS] test_resident_pet_history")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
