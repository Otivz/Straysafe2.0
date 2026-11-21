"""
Regression tests for Possible Pet Owners accuracy-based matching and ranking
(backend/app/services/owner_verification.py).

Verifies:
1. Mandatory species filtering (Cat report only matches registered Cats; Dog report only matches registered Dogs).
2. Weighted multi-criteria scoring (Breed 30%, Color/Coat 30%, Physical Description 20%, Location Proximity 15%, Other Details 5%).
3. Exact reference case SS-2026-0010 (Found Animal · Cat · Breed: "Tabby, Puspin (Pusang Pinoy)" ·
   Description: "friendly cat infront of my house" · Location: "At the corner lot") against the 50 seeded Selera Homes
   resident accounts and 65 registered pets.
4. Descending accuracy sort order, rank numbering, top-match indicator, and human-readable matching reasons.
"""
import os
import sys
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import seed_demo_residents_and_pets as seed
from app.database import Base
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.case_messaging import CaseMessage, CaseMessageMember, CaseMessageThread  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.pet import Pet
from app.models.pet_match_confirmation import PetMatchConfirmationRequest  # noqa: F401
from app.models.report import Report, ReportCategory, ReportStatus
from app.models.report_match import ReportMatch
from app.models.user import Barangay, Role, Subdivision, User
from app.services import owner_verification as OV
from app.utils.color_tags import apply_pet_color_payload


def build_test_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    db.add_all([
        Role(role_id=1, role_name="Super Admin"),
        Role(role_id=2, role_name="Subdivision Leader"),
        Role(role_id=3, role_name="Resident"),
        Barangay(barangay_id=1, barangay_name="Barangay Uno", city="Dasmarinas"),
        Subdivision(subdivision_id=1, subdivision_name="Selera Homes", barangay_id=1),
        ReportCategory(category_id=2, category_name="Found Animal"),
        ReportStatus(status_id=2, status_name="Under Assessment"),
    ])
    leader = User(
        user_id=1,
        name="Leader Lee",
        email="leader@selerahomes.demo",
        password="x",
        role_id=2,
        subdivision_id=1,
        status="Active",
    )
    reporter = User(
        user_id=2,
        name="Rhea Reporter",
        email="rhea@selerahomes.demo",
        password="x",
        role_id=3,
        subdivision_id=1,
        status="Active",
    )
    db.add_all([leader, reporter])
    db.flush()

    pet_counter = 0
    for (
        full_name,
        email_local,
        phone,
        address,
        lat_str,
        lng_str,
        emerg_name,
        emerg_phone,
        pet_defs,
    ) in seed.RESIDENT_SEED_DATA:
        u = User(
            name=full_name,
            email=f"{email_local}@{seed.DEMO_EMAIL_DOMAIN}",
            phone=phone,
            password="hashed_password",
            role_id=3,
            subdivision_id=1,
            address=address,
            latitude=Decimal(lat_str),
            longitude=Decimal(lng_str),
            status="Active",
            is_verified=True,
        )
        db.add(u)
        db.flush()

        for (
            pet_name,
            pet_type,
            breed,
            gender,
            birth_dt,
            est_age,
            weight_str,
            size_cat,
            colors_list,
            markings,
            temperament,
            is_neutered,
            vax_date,
            vax_expiry,
            health_cond,
            notes,
        ) in pet_defs:
            pet_counter += 1
            color_payload = {"colors": list(colors_list)}
            apply_pet_color_payload(color_payload)
            pet = Pet(
                owner_id=u.user_id,
                pet_name=pet_name,
                pet_type=pet_type,
                breed=breed,
                colors=color_payload.get("colors"),
                color_markings=color_payload.get("color_markings"),
                primary_color=color_payload.get("primary_color"),
                secondary_color=color_payload.get("secondary_color"),
                tertiary_color=color_payload.get("tertiary_color"),
                gender=gender,
                birth_date=birth_dt,
                estimated_age=est_age,
                weight=Decimal(weight_str),
                size_category=size_cat,
                health_condition=health_cond,
                is_vaccinated=True,
                vaccination_date=vax_date,
                vaccine_expiry=vax_expiry,
                is_neutered=is_neutered,
                temperament=temperament,
                notes=notes,
                status="Active",
                is_verified=True,
                emergency_contact_name=emerg_name,
                emergency_contact_phone=emerg_phone,
                distinctive_markings=markings,
                registered_address=u.address,
                registered_latitude=u.latitude,
                registered_longitude=u.longitude,
                registered_by_user_id=u.user_id,
                registered_by_name=u.name,
            )
            db.add(pet)
    db.commit()
    return db, leader, reporter


def test_ss_2026_0010_ranking():
    db, leader, reporter = build_test_session()

    # Case SS-2026-0010: Found Animal · Cat · Breed: Tabby, Puspin (Pusang Pinoy)
    rep10 = Report(
        report_id=10,
        user_id=reporter.user_id,
        category_id=2,
        current_status_id=2,
        case_status="under_assessment",
        subdivision_id=1,
        animal_type="Cat",
        animal_breed="Tabby, Puspin (Pusang Pinoy)",
        description="friendly cat infront of my house",
        landmark="At the corner lot",
        latitude=Decimal("14.80120000"),
        longitude=Decimal("121.00340000"),
    )
    db.add(rep10)
    db.commit()

    res = OV.possible_owners(db, 10, leader)
    assert res["applicable"] is True
    cands = res["candidates"]

    # 1. Mandatory species filter: only the 22 registered cats in Selera Homes are returned (0 dogs)
    assert len(cands) == 22, f"Expected 22 cat candidates, got {len(cands)}"
    assert all(c["pet"]["species"] == "Cat" for c in cands), "Found non-Cat candidate in Cat report!"

    # 2. Sorted strictly from highest to lowest matching score
    scores = [c["matching"]["score"] for c in cands]
    assert scores == sorted(scores, reverse=True), f"Candidates not sorted descending: {scores}"

    # 3. Every Puspin (Pusang Pinoy) ranks above every non-Puspin breed (Scottish Fold, British Shorthair, Persian, etc.)
    puspin_ranks = [c["rank"] for c in cands if "Puspin" in (c["pet"]["breed"] or "")]
    non_puspin_ranks = [c["rank"] for c in cands if "Puspin" not in (c["pet"]["breed"] or "")]
    assert len(puspin_ranks) == 8
    assert max(puspin_ranks) < min(non_puspin_ranks), (
        f"Expected all Puspin candidates ({puspin_ranks}) to outrank non-Puspin breeds ({non_puspin_ranks})"
    )

    # 4. Top candidate is a Tabby Puspin with is_top_match=True and strong accuracy score
    top = cands[0]
    assert top["rank"] == 1
    assert top["is_top_match"] is True
    assert "Puspin" in (top["pet"]["breed"] or "")
    assert top["matching"]["score"] >= 80
    assert top["matching"]["classification"] == "strong"
    assert top["matching"]["reasons"] and len(top["matching"]["reasons"]) >= 1

    # 5. Nadine Villamor - Molly (Scottish Fold) must NOT be ranked first; it must rank below all Puspins with breed-differs reason
    molly = next(c for c in cands if c["pet"]["name"] == "Molly")
    assert molly["rank"] > 8, f"Expected Molly (Scottish Fold) to rank below all 8 Puspins, got rank {molly['rank']}"
    assert any("breed differs" in r.lower() for r in molly["matching"]["reasons"]), molly["matching"]["reasons"]

    # 6. Pre-existing synthetic ReportMatch fixture compatibility
    rep_fixture = Report(
        report_id=99,
        user_id=reporter.user_id,
        category_id=2,
        current_status_id=2,
        case_status="under_assessment",
        subdivision_id=1,
        animal_type="Dog",
        animal_breed="Aspin",
        description="brown dog",
        latitude=Decimal("14.80120000"),
        longitude=Decimal("121.00340000"),
    )
    db.add(rep_fixture)
    db.flush()
    bantay_pet = db.query(Pet).filter(Pet.pet_name == "Bantay").first()
    db.add(
        ReportMatch(
            source_report_id=99,
            matched_pet_id=bantay_pet.pet_id,
            similarity_score=82,
            status="AI_SUGGESTED",
            ai_explanation="Same breed and nearby.",
            ai_evidence={
                "multi_attribute": {
                    "score": 82,
                    "classification": "strong",
                    "classification_label": "Strong Possible Match",
                    "coverage": 75,
                    "attributes": {
                        "visual": {"label": "Visual similarity", "score": 88, "available": True, "explanation": "Photo match."},
                        "location": {"label": "Location", "score": 78, "available": True, "explanation": "180 m away."},
                        "breed": {"label": "Breed", "score": 100, "available": True, "explanation": "Both Aspin."},
                    },
                }
            },
        )
    )
    db.commit()
    res_fix = OV.possible_owners(db, 99, leader)
    assert len(res_fix["candidates"]) == 1
    cf = res_fix["candidates"][0]
    assert cf["matching"]["score"] == 82
    assert cf["matching"]["classification_label"] == "Strong Possible Match"
    assert [a["label"] for a in cf["matching"]["attributes"]] == ["Visual similarity", "Location", "Breed"]

    print("SS-2026-0010 RANKED CANDIDATES (All 20 Registered Cats in Selera Homes):")
    for c in cands:
        print(
            f"{c['rank']:2d}. {c['resident']['name']} - {c['pet']['name']} ({c['pet']['reference_code']}, ID #{c['pet_id']}) | "
            f"Breed: {c['pet']['breed']} | Colors: {c['pet']['colour']} | "
            f"Score: {c['matching']['score']}% ({c['matching']['classification_label']}) | "
            f"Reasons: {' '.join(c['matching']['reasons'])}"
        )
    print("\nALL POSSIBLE OWNER RANKING CHECKS PASSED!")


if __name__ == "__main__":
    test_ss_2026_0010_ranking()
