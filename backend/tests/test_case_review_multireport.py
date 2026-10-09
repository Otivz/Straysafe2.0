"""
Automated Test Suite: Multi-Report Tab System for Pet Match Review
Validates:
1. Canonical claim report identification (claim on merged report placed as Tab 1)
2. Strict endpoint authorization (owner & in-scope staff allowed; third-party citizen & out-of-scope staff 403)
3. Incomplete ownership claim status (confirmed without proof)
4. Decoupled independent statuses (owner Yes != official verification)
5. Sighting rejection isolation (rejecting sighting does not invalidate initial claim)
6. Unmerge graceful handling (unmerged report removed from case, loads as standalone on direct URL)
7. Notification deep-linking per-tab representation

Run from backend folder: python tests/test_case_review_multireport.py
"""
import os
import sys
import tempfile
from datetime import datetime, timezone

_DB = os.path.join(tempfile.mkdtemp(), "case_review_multireport_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-case-review-multireport-998877")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.pet_claim import PetClaim
from app.models.report import Report, ReportCategory, ReportMedia, ReportStatus, StatusHistory
from app.models.report_match import ReportMatch
from app.models.user import Barangay, Subdivision, User
from app.routes import claims, matches, reports
from app.utils.auth import create_access_token

Base.metadata.create_all(bind=engine)
api = FastAPI()
for r in (claims.router, matches.router, reports.router):
    api.include_router(r)

client = TestClient(api, raise_server_exceptions=True)
db = SessionLocal()

# Setup jurisdiction
b1 = Barangay(barangay_id=1, barangay_name="Barangay San Vicente", city="Santa Maria")
db.add(b1)
db.flush()

sub1 = Subdivision(subdivision_id=1, barangay_id=1, subdivision_name="Selera Homes")
sub2 = Subdivision(subdivision_id=2, barangay_id=1, subdivision_name="Other Subd")
db.add_all([sub1, sub2])

cat1 = ReportCategory(category_id=1, category_name="Stray Animal")
db.add(cat1)

for sid in range(1, 19):
    db.add(ReportStatus(status_id=sid, status_name=f"Status_{sid}"))
db.commit()

# Setup users
db.add(Barangay(barangay_id=2, barangay_name="Other Barangay", city="Other City"))
db.commit()

def create_user(name: str, role_id: int, subd_id: int = 1, brgy_id: int = 1) -> User:
    u = User(
        name=name,
        email=f"{name.lower()}@testcase.com",
        password="hashed_pwd",
        role_id=role_id,
        is_verified=True,
        status="Active",
        subdivision_id=subd_id,
        barangay_id=brgy_id
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u

pet_owner = create_user("PetOwner", 1, subd_id=1, brgy_id=1)
other_citizen = create_user("OtherCitizen", 1, subd_id=1, brgy_id=1)
subd_leader = create_user("SubdLeader", 2, subd_id=1, brgy_id=1)
other_leader = create_user("OtherLeader", 2, subd_id=2, brgy_id=1)
brgy_staff = create_user("BrgyStaff", 3, subd_id=1, brgy_id=1)
other_brgy_staff = create_user("OtherBrgyStaff", 3, subd_id=2, brgy_id=2)

def auth_header(u: User):
    token = create_access_token({"sub": str(u.user_id), "user_id": u.user_id, "role_id": u.role_id})
    return {"Authorization": f"Bearer {token}"}

H_OWNER = auth_header(pet_owner)
H_OTHER_CITIZEN = auth_header(other_citizen)
H_LEADER = auth_header(subd_leader)
H_OTHER_LEADER = auth_header(other_leader)
H_STAFF = auth_header(brgy_staff)
H_OTHER_STAFF = auth_header(other_brgy_staff)

# Setup Pet for owner
pet_yeye = Pet(
    pet_id=101,
    pet_name="Yeye",
    owner_id=pet_owner.user_id,
    registered_by_user_id=pet_owner.user_id,
    pet_type="Dog",
    breed="Shih Tzu",
    gender="Female",
    primary_color="White",
    secondary_color="Brown",
    status="Lost",
    registered_address="Block 5 Lot 12 Selera Homes",
    registered_latitude=14.805,
    registered_longitude=121.004
)
db.add(pet_yeye)
db.commit()

results = []

def record(test_name: str, passed: bool, details: str = ""):
    results.append((test_name, passed, details))
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {test_name}" + (f" - {details}" if details else ""))


# -------------------------------------------------------------------------------------
# Test 1: RBAC Authorization & Jurisdiction Scoping
# -------------------------------------------------------------------------------------
def test_authorization():
    rep = Report(
        report_id=201,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        animal_type="Dog",
        animal_breed="Shih Tzu",
        landmark="Near Gate 1",
        latitude=14.806,
        longitude=121.005,
        description="Found roaming small white/brown dog"
    )
    db.add(rep)
    db.commit()

    # Match with Yeye
    m = ReportMatch(
        match_id=301,
        source_report_id=201,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=92,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    db.add(m)
    db.commit()

    # 1.1 Owner should be authorized (200 OK)
    res_owner = client.get(f"/matches/case-review/201", headers=H_OWNER)
    if res_owner.status_code != 200:
        print("ERROR res_owner:", res_owner.text)
    record("Owner Authorization (200 OK)", res_owner.status_code == 200, f"Code: {res_owner.status_code}")

    # 1.2 Unrelated citizen should be denied (403 Forbidden)
    res_other = client.get(f"/matches/case-review/201", headers=H_OTHER_CITIZEN)
    record("Unrelated Citizen Forbidden (403)", res_other.status_code == 403, f"Code: {res_other.status_code}")

    # 1.3 In-scope Subdivision Leader authorized (200 OK)
    res_leader = client.get(f"/matches/case-review/201", headers=H_LEADER)
    record("In-Scope Leader Authorized (200 OK)", res_leader.status_code == 200, f"Code: {res_leader.status_code}")

    # 1.4 Out-of-scope Subdivision Leader forbidden (403)
    res_other_leader = client.get(f"/matches/case-review/201", headers=H_OTHER_LEADER)
    record("Out-of-Scope Leader Forbidden (403)", res_other_leader.status_code == 403, f"Code: {res_other_leader.status_code}")

    # 1.5 In-scope Barangay Staff authorized (200 OK)
    res_staff = client.get(f"/matches/case-review/201", headers=H_STAFF)
    record("In-Scope Barangay Staff Authorized (200 OK)", res_staff.status_code == 200, f"Code: {res_staff.status_code}")

    # 1.6 Out-of-scope Barangay Staff forbidden (403)
    res_other_staff = client.get(f"/matches/case-review/201", headers=H_OTHER_STAFF)
    record("Out-of-Scope Barangay Staff Forbidden (403)", res_other_staff.status_code == 403, f"Code: {res_other_staff.status_code}")


# -------------------------------------------------------------------------------------
# Test 2: Incomplete Ownership Claim Status vs Subsequent Sightings
# -------------------------------------------------------------------------------------
def test_incomplete_claim_status():
    # Owner confirms pet on report 201 without uploading proof yet
    res_confirm = client.post(
        "/matches/301/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Looks exactly like Yeye"},
        headers=H_OWNER
    )
    record("Owner Confirms Match", res_confirm.status_code == 200)

    # Check case review: should indicate "Ownership Claim Incomplete"
    res_review = client.get("/matches/case-review/201", headers=H_OWNER)
    data = res_review.json()
    first_tab = data["reports"][0]
    tab_status = first_tab.get("tab_status")
    record(
        "Tab 1 Marked as 'Ownership Claim Incomplete'",
        tab_status == "Ownership Claim Incomplete",
        f"Got: {tab_status}"
    )


# -------------------------------------------------------------------------------------
# Test 3: Multiple Merged Sightings & Chronological Ordering
# -------------------------------------------------------------------------------------
def test_merged_sightings_and_canonical_claim():
    # Create two additional sightings
    rep2 = Report(
        report_id=202,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,  # Merged
        duplicate_of_report_id=201,
        created_at=datetime(2026, 10, 5, 10, 0, 0),
        animal_type="Dog",
        animal_breed="Shih Tzu",
        landmark="Near Park",
        latitude=14.807,
        longitude=121.006,
        description="Second sighting near basketball court"
    )
    rep3 = Report(
        report_id=203,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,  # Merged
        duplicate_of_report_id=201,
        created_at=datetime(2026, 10, 6, 14, 0, 0),
        animal_type="Dog",
        animal_breed="Shih Tzu",
        landmark="Near Clubhouse",
        latitude=14.808,
        longitude=121.007,
        description="Third sighting near clubhouse"
    )
    db.add_all([rep2, rep3])
    db.commit()

    # Matches for 202 and 203
    m2 = ReportMatch(
        match_id=302,
        source_report_id=202,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=88,
        status="COVERED_BY_CASE",
        covered_by_match_id=301,
        owner_confirmation_status="PENDING"
    )
    m3 = ReportMatch(
        match_id=303,
        source_report_id=203,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=85,
        status="COVERED_BY_CASE",
        covered_by_match_id=301,
        owner_confirmation_status="PENDING"
    )
    db.add_all([m2, m3])
    db.commit()

    # Query case-review for primary report
    res = client.get("/matches/case-review/201", headers=H_OWNER)
    data = res.json()
    tabs = data.get("reports", [])
    record("Merged Case Returns 3 Tabs", len(tabs) == 3, f"Count: {len(tabs)}")

    tab_labels = [t["tab_label"] for t in tabs]
    record(
        "Tab Labels Chronologically Formatted",
        tab_labels == ["Initial Claim", "Sighting 2", "Sighting 3"],
        f"Got: {tab_labels}"
    )

    report_ids = [t["report_id"] for t in tabs]
    record(
        "Reports Ordered Correctly",
        report_ids == [201, 202, 203],
        f"Got: {report_ids}"
    )


# -------------------------------------------------------------------------------------
# Test 4: Decoupled Statuses & Sighting Confirmation Independence
# -------------------------------------------------------------------------------------
def test_decoupled_statuses_and_rejection():
    # Attempting to confirm Sighting 2 (Report 202) before initial claim proof MUST be rejected
    res_s2_premature = client.post(
        "/matches/302/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Trying to confirm prematurely"},
        headers=H_OWNER
    )
    record(
        "Sighting 2 Locked Before Initial Claim Proof (400 Bad Request)",
        res_s2_premature.status_code == 400
    )

    # Submit ownership claim for Yeye on Report 201 (Initial Claim)
    claim = PetClaim(
        claim_id=501,
        report_id=201,
        pet_id=pet_yeye.pet_id,
        status="Pending Review",
        vaccine_card_url="https://res.cloudinary.com/test/vaccine.jpg",
        vet_record_url="https://res.cloudinary.com/test/vet.pdf",
        remarks="Submitted vaccination card and vet record"
    )
    db.add(claim)
    db.commit()

    # Now that initial claim has proof, owner confirms Sighting 2 (Report 202)
    res_s2 = client.post(
        "/matches/302/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Still Yeye"},
        headers=H_OWNER
    )
    record("Owner Confirms Sighting 2", res_s2.status_code == 200)

    # Owner rejects Sighting 3 (Report 203) - animal looks different
    res_s3 = client.post(
        "/matches/303/owner-feedback",
        json={"owner_confirmation": "OWNER_REJECTED", "remarks": "Different dog, tail is docked"},
        headers=H_OWNER
    )
    record("Owner Rejects Sighting 3", res_s3.status_code == 200)

    # Re-fetch case review
    res_review = client.get("/matches/case-review/201", headers=H_OWNER)
    tabs = res_review.json().get("reports", [])

    t1, t2, t3 = tabs[0], tabs[1], tabs[2]

    # Tab 2: Owner confirmed, but official review still pending (decoupled!)
    record(
        "Sighting 2 Owner Status Confirmed",
        t2["owner_confirmation_status"] == "OWNER_CONFIRMED"
    )
    record(
        "Sighting 2 Official Review Is Not Auto-Verified",
        t2["official_review_status"] != "CONFIRMED_MATCH",
        f"Status: {t2['official_review_status']}"
    )
    record(
        "Sighting 2 Tab Status Shows Confirmed by Owner",
        t2["tab_status"] == "Confirmed by Owner"
    )

    # Tab 3: Owner rejected, but Tab 1 and Tab 2 remain intact
    record(
        "Sighting 3 Owner Status Rejected",
        t3["owner_confirmation_status"] == "OWNER_REJECTED"
    )
    record(
        "Sighting 3 Tab Status Shows Rejected",
        t3["tab_status"] == "Rejected"
    )
    record(
        "Tab 1 Claim Remains Unaffected by Sighting 3 Rejection",
        t1["owner_confirmation_status"] == "OWNER_CONFIRMED"
    )


# -------------------------------------------------------------------------------------
# Test 5: Proof Submission on Initial Claim
# -------------------------------------------------------------------------------------
def test_claim_proof_submission():
    # Re-fetch case review and verify Tab 1 status after claim proof
    res = client.get("/matches/case-review/201", headers=H_OWNER)
    data = res.json()
    t1 = data["reports"][0]
    record(
        "Tab 1 Updates to 'Claim Pending Review' After Proof Upload",
        t1["tab_status"] == "Claim Pending Review",
        f"Got: {t1['tab_status']}"
    )
    record(
        "Claim Details Returned in Payload",
        data.get("claim") is not None and data["claim"]["claim_id"] == 501
    )
    record(
        "Initial Claim Completed Flag True in Payload",
        data.get("initial_claim_completed") is True
    )


# -------------------------------------------------------------------------------------
# Test 6: Deep-Linking & Accessing from Merged Report ID
# -------------------------------------------------------------------------------------
def test_deep_linking_from_merged_report():
    # When an owner clicks notification for Sighting 2 (Report 202), the URL is /reports/202/match-review
    res = client.get("/matches/case-review/202", headers=H_OWNER)
    data = res.json()
    record(
        "Accessing via Merged Report 202 Resolves Whole Case",
        data["case_root_id"] == 201 and len(data["reports"]) == 3
    )
    record(
        "Canonical Claim Report Remains Tab 1 (Report 201)",
        data["canonical_claim_report_id"] == 201 and data["reports"][0]["report_id"] == 201
    )


# -------------------------------------------------------------------------------------
# Test 7: Unmerge Handling
# -------------------------------------------------------------------------------------
def test_unmerge_handling():
    # Leader unmerges Report 203 from Case 201
    rep3 = db.get(Report, 203)
    rep3.duplicate_of_report_id = None
    rep3.current_status_id = 2  # Verified standalone
    db.commit()

    # 7.1 Case 201 now only contains 201 and 202
    res_case = client.get("/matches/case-review/201", headers=H_OWNER)
    tabs_case = res_case.json().get("reports", [])
    case_report_ids = [t["report_id"] for t in tabs_case]
    record(
        "Unmerged Report 203 Removed from Parent Case Tabs",
        case_report_ids == [201, 202],
        f"Got: {case_report_ids}"
    )

    # 7.2 Accessing unmerged Report 203 directly via old notification link
    res_unmerged = client.get("/matches/case-review/203", headers=H_OWNER)
    record(
        "Direct Link to Unmerged Report 203 Succeeds Gracefully (200 OK)",
        res_unmerged.status_code == 200
    )
    data_unmerged = res_unmerged.json()
    record(
        "Unmerged Report 203 Renders as Standalone Single Tab",
        len(data_unmerged["reports"]) == 1 and data_unmerged["reports"][0]["report_id"] == 203
    )
    record(
        "Unmerged Report Preserves Prior Owner Rejection Response",
        data_unmerged["reports"][0]["owner_confirmation_status"] == "OWNER_REJECTED"
    )
    record(
        "Unmerged Report Does Not Auto-Create Duplicate Claim",
        data_unmerged.get("claim") is None
    )


# -------------------------------------------------------------------------------------
# Test 8: Multiple Pet Disambiguation & Evidence Isolation (Requirement 2)
# -------------------------------------------------------------------------------------
def test_multiple_pet_disambiguation_and_isolation():
    # 8.1 Create second pet for the owner
    pet_coco = Pet(
        pet_id=102,
        pet_name="Coco",
        owner_id=pet_owner.user_id,
        registered_by_user_id=pet_owner.user_id,
        pet_type="Dog",
        breed="Shih Tzu Mix",
        gender="Male",
        primary_color="White",
        secondary_color="Black",
        status="Lost",
        registered_address="Block 5 Lot 12 Selera Homes",
        registered_latitude=14.805,
        registered_longitude=121.004
    )
    db.add(pet_coco)
    db.commit()

    # 8.2 Create a new report where BOTH pets match
    rep_multi = Report(
        report_id=205,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        animal_type="Dog",
        animal_breed="Shih Tzu",
        landmark="Near Clubhouse Gate",
        latitude=14.806,
        longitude=121.005,
        description="White small dog found"
    )
    db.add(rep_multi)
    db.commit()

    # Match 1 for Yeye (Score 88)
    m_yeye = ReportMatch(
        match_id=305,
        source_report_id=205,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=88,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    # Match 2 for Coco (Score 82)
    m_coco = ReportMatch(
        match_id=306,
        source_report_id=205,
        matched_pet_id=pet_coco.pet_id,
        similarity_score=82,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    db.add_all([m_yeye, m_coco])
    db.commit()

    # Calling without pet_id or match_id must NOT arbitrarily select Yeye (even with higher score)
    res_ambiguous = client.get("/matches/case-review/205", headers=H_OWNER)
    record(
        "Ambiguous Multiple Pets Returns 400 Bad Request Without Arbitrary Selection",
        res_ambiguous.status_code == 400,
        f"Status: {res_ambiguous.status_code}, Detail: {res_ambiguous.text}"
    )

    # Calling with pet_id=101 resolves Yeye
    res_yeye = client.get("/matches/case-review/205?pet_id=101", headers=H_OWNER)
    record(
        "Explicit pet_id=101 Resolves Yeye",
        res_yeye.status_code == 200 and res_yeye.json()["pet"]["pet_name"] == "Yeye"
    )

    # Calling with pet_id=102 resolves Coco
    res_coco = client.get("/matches/case-review/205?pet_id=102", headers=H_OWNER)
    record(
        "Explicit pet_id=102 Resolves Coco",
        res_coco.status_code == 200 and res_coco.json()["pet"]["pet_name"] == "Coco"
    )

    # Case data and ownership evidence isolated per pet
    data_coco = res_coco.json()
    record(
        "Evidence and Matches Isolated Per Pet (Coco Has No Leaked Yeye Claims)",
        data_coco.get("claim") is None and data_coco["reports"][0]["match"]["match_id"] == 306
    )

    # Calling with match_id=306 resolves Coco
    res_by_match = client.get("/matches/case-review/205?match_id=306", headers=H_OWNER)
    record(
        "Resolving via match_id Explicitly Resolves Corresponding Pet",
        res_by_match.status_code == 200 and res_by_match.json()["pet"]["pet_name"] == "Coco"
    )


# -------------------------------------------------------------------------------------
# Test 9: Direct Notification Links & Unmerged Scenarios (Requirement 3)
# -------------------------------------------------------------------------------------
def test_direct_notification_links_and_reloads():
    # 9.1 Direct notification link to Sighting 2 (Report 202)
    res_deep = client.get("/matches/case-review/202?pet_id=101", headers=H_OWNER)
    record(
        "Notification Deep-Link to Merged Sighting 202 Returns Case With Sighting 2",
        res_deep.status_code == 200 and any(r["report_id"] == 202 for r in res_deep.json()["reports"])
    )

    # 9.2 Direct link to unmerged Report 203 preserves standalone state and prior rejection
    res_unmerged = client.get("/matches/case-review/203?pet_id=101", headers=H_OWNER)
    record(
        "Direct Notification Link to Unmerged Sighting 203 Resolves Standalone Gracefully",
        res_unmerged.status_code == 200 and len(res_unmerged.json()["reports"]) == 1
    )
    record(
        "Unmerged Standalone Sighting Preserves Owner Response Without Duplicate Claim",
        res_unmerged.json()["reports"][0]["owner_confirmation_status"] == "OWNER_REJECTED" and res_unmerged.json().get("claim") is None
    )

    # 9.3 Standalone report with no match to this owner denies access
    rep_no_match = Report(
        report_id=209,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        latitude=14.809,
        longitude=121.009,
        animal_type="Cat",
        landmark="Near Market",
        description="Black cat"
    )
    db.add(rep_no_match)
    db.commit()

    res_no_match = client.get("/matches/case-review/209", headers=H_OWNER)
    record(
        "Unmerged Report With No Pet Match Denies Access (403 Forbidden)",
        res_no_match.status_code == 403
    )


# -------------------------------------------------------------------------------------
# Test 10: Sighting Confirmation Isolation & Protection (Section 7 Requirements)
# -------------------------------------------------------------------------------------
def test_section_7_confirmation_isolation():
    # Setup Reports 430, 435, 442 representing the exact scenario from user requirements
    rep430 = Report(
        report_id=430,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        animal_type="Dog",
        animal_breed="Chihuahua",
        landmark="Near Gate 1",
        latitude=14.810,
        longitude=121.010,
        description="White Chihuahua seen at 10:00 AM",
        created_at=datetime(2026, 10, 7, 10, 0, 0)
    )
    rep435 = Report(
        report_id=435,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,
        duplicate_of_report_id=430,
        animal_type="Dog",
        animal_breed="Chihuahua",
        landmark="Near Park",
        latitude=14.811,
        longitude=121.011,
        description="White Chihuahua seen at 10:02 AM",
        created_at=datetime(2026, 10, 7, 10, 2, 0)
    )
    rep442 = Report(
        report_id=442,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,
        duplicate_of_report_id=430,
        animal_type="Dog",
        animal_breed="Chihuahua",
        landmark="Near Clubhouse",
        latitude=14.812,
        longitude=121.012,
        description="White Chihuahua seen at 10:04 AM",
        created_at=datetime(2026, 10, 7, 10, 4, 0)
    )
    db.add_all([rep430, rep435, rep442])
    db.commit()

    # Initial AI match on report 430 for Yeye
    m430 = ReportMatch(
        match_id=530,
        source_report_id=430,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=94,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    db.add(m430)
    db.commit()

    # 1. Fetch case-review for 430: verify it auto-provisions isolated ReportMatch records for 435 and 442
    res_init = client.get("/matches/case-review/430?pet_id=101", headers=H_OWNER)
    assert res_init.status_code == 200
    tabs_init = res_init.json()["reports"]
    assert len(tabs_init) == 3

    m_id_430 = tabs_init[0]["match"]["match_id"]
    m_id_435 = tabs_init[1]["match"]["match_id"]
    m_id_442 = tabs_init[2]["match"]["match_id"]

    # Test 7 Verification 1: Distinct match IDs
    record(
        "Test 7a: Shared match ID protection - distinct match IDs per merged tab",
        m_id_430 != m_id_435 and m_id_435 != m_id_442 and m_id_430 != m_id_442,
        f"IDs: {m_id_430}, {m_id_435}, {m_id_442}"
    )

    # Test 4: Submit ownership proof for Report 430
    client.post(
        f"/matches/{m_id_430}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Confirmed my pet Yeye", "report_id": 430},
        headers=H_OWNER
    )
    claim430 = PetClaim(
        claim_id=502,
        report_id=430,
        pet_id=pet_yeye.pet_id,
        status="Pending Review",
        evidence_url="https://cloudinary.com/proof_yeye.jpg",
        remarks="Owner proof for Yeye"
    )
    db.add(claim430)
    db.commit()

    # Test 8 Pre-check: Database state snapshot before Sighting 2 rejection
    db.expire_all()
    db_m430_before = db.get(ReportMatch, m_id_430)
    db_m442_before = db.get(ReportMatch, m_id_442)
    m430_owner_conf_before = db_m430_before.owner_confirmation_status
    m442_owner_conf_before = db_m442_before.owner_confirmation_status

    # Test 2: Reject ONLY the second sighting (Report 435)
    res_reject_435 = client.post(
        f"/matches/{m_id_435}/owner-feedback",
        json={"owner_confirmation": "OWNER_REJECTED", "remarks": "No, this is not my Chihuahua (different color tail)", "report_id": 435},
        headers=H_OWNER
    )
    record("Test 2a: Reject Sighting 2 succeeds (200 OK)", res_reject_435.status_code == 200)

    # Test 8: Database isolation verification
    db.expire_all()
    db_m430_after = db.get(ReportMatch, m_id_430)
    db_m435_after = db.get(ReportMatch, m_id_435)
    db_m442_after = db.get(ReportMatch, m_id_442)

    record(
        "Test 8: Database isolation - only Sighting 2 changed in DB",
        db_m435_after.owner_confirmation_status == "OWNER_REJECTED"
        and db_m430_after.owner_confirmation_status == m430_owner_conf_before
        and db_m442_after.owner_confirmation_status == m442_owner_conf_before
    )

    # Verify Report 430 remains OWNER_CONFIRMED and Report 442 remains PENDING
    record(
        "Test 2b: Sighting 2 rejected, Tab 1 remains OWNER_CONFIRMED",
        db_m430_after.owner_confirmation_status == "OWNER_CONFIRMED"
    )
    record(
        "Test 2c: Sighting 2 rejected, Tab 3 remains unchanged (PENDING)",
        db_m442_after.owner_confirmation_status == "PENDING"
    )

    # Test 4: Initial claim preservation
    res_case_after_s2 = client.get("/matches/case-review/430?pet_id=101", headers=H_OWNER)
    case_data_s2 = res_case_after_s2.json()
    record(
        "Test 4: Initial claim and evidence preserved after rejecting Sighting 2",
        case_data_s2.get("claim") is not None
        and case_data_s2["claim"]["evidence_url"] == "https://cloudinary.com/proof_yeye.jpg"
        and case_data_s2["reports"][0]["tab_status"] == "Claim Pending Review"
    )

    # Test 3: Confirm the third sighting (Report 442)
    res_confirm_442 = client.post(
        f"/matches/{m_id_442}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Yes, saw Yeye near clubhouse", "report_id": 442},
        headers=H_OWNER
    )
    record("Test 3a: Confirm Sighting 3 succeeds (200 OK)", res_confirm_442.status_code == 200)

    # Test 1: Three merged reports with different responses
    res_case_final = client.get("/matches/case-review/430?pet_id=101", headers=H_OWNER)
    tabs_final = res_case_final.json()["reports"]
    t430, t435, t442 = tabs_final[0], tabs_final[1], tabs_final[2]

    record(
        "Test 1: Three different responses coexist independently (#430=CONFIRMED, #435=REJECTED, #442=CONFIRMED)",
        t430["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and t435["owner_confirmation_status"] == "OWNER_REJECTED"
        and t442["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and t430["tab_status"] == "Claim Pending Review"
        and t435["tab_status"] == "Rejected"
        and t442["tab_status"] == "Confirmed by Owner"
    )

    # Test 5: Page refresh consistency
    res_case_reload1 = client.get("/matches/case-review/430?pet_id=101", headers=H_OWNER)
    res_case_reload2 = client.get("/matches/case-review/430?pet_id=101", headers=H_OWNER)
    tabs_reload = res_case_reload2.json()["reports"]
    record(
        "Test 5: Page reload preserves independent responses",
        tabs_reload[0]["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and tabs_reload[1]["owner_confirmation_status"] == "OWNER_REJECTED"
        and tabs_reload[2]["owner_confirmation_status"] == "OWNER_CONFIRMED"
    )

    # Test 6: Staff review workflow & notification
    leader_notifs = db.query(Notification).filter(
        Notification.user_id == subd_leader.user_id,
        Notification.related_id == 435
    ).all()
    sighting_hist = db.query(StatusHistory).filter(
        StatusHistory.report_id == 435,
        StatusHistory.remarks.like("%Owner reported merged sighting is NOT their pet%")
    ).first()
    record(
        "Test 6: Staff notified and sighting flagged for review without mutating case",
        len(leader_notifs) > 0 and sighting_hist is not None
    )

    # Test 7b: Shared match ID protection - sending report_id=435 with match_id=530 (root match) does NOT mutate root match
    res_redirect = client.post(
        f"/matches/{m_id_430}/owner-feedback",
        json={"owner_confirmation": "UNSURE", "remarks": "Testing redirect protection", "report_id": 435},
        headers=H_OWNER
    )
    db.expire_all()
    db_m430_check = db.get(ReportMatch, m_id_430)
    db_m435_check = db.get(ReportMatch, m_id_435)
    record(
        "Test 7b: Shared match ID protection - root match preserved when payload specifies sibling report_id",
        db_m430_check.owner_confirmation_status == "OWNER_CONFIRMED"
        and db_m435_check.owner_confirmation_status == "UNSURE"
    )


# -------------------------------------------------------------------------------------
# Test Section 7: Enforce Initial Claim Prerequisite Scenarios A through F
# -------------------------------------------------------------------------------------
def test_section_7_scenarios_a_through_f():
    # Setup 3 merged reports for Scenario A-D & F: Reports 630, 635, 642
    rep630 = Report(
        report_id=630,
        user_id=pet_owner.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        created_at=datetime(2026, 10, 8, 10, 0, 0),
        animal_type="Dog",
        animal_breed="Chihuahua",
        animal_color="White",
        latitude=14.805,
        longitude=121.005,
        landmark="Near Gate 1",
        description="White Chihuahua initial report"
    )
    rep635 = Report(
        report_id=635,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,
        duplicate_of_report_id=630,
        created_at=datetime(2026, 10, 8, 10, 2, 0),
        animal_type="Dog",
        animal_breed="Chihuahua",
        animal_color="White",
        latitude=14.806,
        longitude=121.006,
        landmark="Near Gate 2",
        description="Second sighting of White Chihuahua"
    )
    rep642 = Report(
        report_id=642,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,
        duplicate_of_report_id=630,
        created_at=datetime(2026, 10, 8, 10, 4, 0),
        animal_type="Dog",
        animal_breed="Chihuahua",
        animal_color="White",
        latitude=14.807,
        longitude=121.007,
        landmark="Near Clubhouse",
        description="Third sighting of White Chihuahua"
    )
    db.add_all([rep630, rep635, rep642])

    m630 = ReportMatch(
        match_id=730,
        source_report_id=630,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=92,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    db.add(m630)
    db.commit()

    # Provision case review
    res_case = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    assert res_case.status_code == 200
    tabs = res_case.json()["reports"]
    m_id_630 = tabs[0]["match"]["match_id"]
    m_id_635 = tabs[1]["match"]["match_id"]
    m_id_642 = tabs[2]["match"]["match_id"]

    # --- Scenario A — Initial claim incomplete ---
    # Owner selects Yes on Report 630, but no proof submitted
    res_confirm_630 = client.post(
        f"/matches/{m_id_630}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Yes this is Yeye", "report_id": 630},
        headers=H_OWNER
    )
    record("Scenario A1: Owner selects Yes on Report 630", res_confirm_630.status_code == 200)

    # Check case review shows initial_claim_completed == False, Tab 1 is 'Ownership Claim Incomplete'
    res_rev_a = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    data_a = res_rev_a.json()
    record(
        "Scenario A2: Case review shows initial_claim_completed is False and Tab 1 is Ownership Claim Incomplete",
        data_a.get("initial_claim_completed") is False
        and data_a["reports"][0]["tab_status"] == "Ownership Claim Incomplete"
    )

    # Attempt to confirm Report 635 and Report 642 while initial claim is incomplete -> MUST fail with 400
    res_s2_locked = client.post(
        f"/matches/{m_id_635}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Should be locked", "report_id": 635},
        headers=H_OWNER
    )
    res_s3_locked = client.post(
        f"/matches/{m_id_642}/owner-feedback",
        json={"owner_confirmation": "OWNER_REJECTED", "remarks": "Should be locked", "report_id": 642},
        headers=H_OWNER
    )
    record(
        "Scenario A3: Report 635 confirmation actions locked on backend (400 Bad Request)",
        res_s2_locked.status_code == 400
        and "Before confirming additional sightings, please complete your initial pet ownership claim" in res_s2_locked.json().get("detail", "")
    )
    record(
        "Scenario A4: Report 642 confirmation actions locked on backend (400 Bad Request)",
        res_s3_locked.status_code == 400
    )

    # --- Scenario F — Direct URL access before completing initial claim ---
    # Owner accesses Report 642 directly before initial claim is completed
    res_direct_642 = client.get("/matches/case-review/642?pet_id=101", headers=H_OWNER)
    data_f = res_direct_642.json()
    record(
        "Scenario F: Direct URL access to Report 642 indicates canonical initial claim is Report 630 and claim is incomplete",
        res_direct_642.status_code == 200
        and data_f.get("canonical_claim_report_id") == 630
        and data_f.get("initial_claim_completed") is False
    )

    # --- Scenario B — Initial claim submitted ---
    # Submit ownership proof for Report 630
    claim_630 = PetClaim(
        claim_id=601,
        report_id=630,
        pet_id=pet_yeye.pet_id,
        status="Pending Review",
        vaccine_card_url="https://res.cloudinary.com/test/yeye_vax.jpg",
        vet_record_url="https://res.cloudinary.com/test/yeye_vet.pdf",
        remarks="Valid proof uploaded for Yeye"
    )
    db.add(claim_630)
    db.commit()

    # Verify initial_claim_completed becomes True
    res_rev_b = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    data_b = res_rev_b.json()
    record(
        "Scenario B1: Initial claim marked completed after proof submitted",
        data_b.get("initial_claim_completed") is True
        and data_b["reports"][0]["tab_status"] == "Claim Pending Review"
    )

    # Reports 635 and 642 are now UNLOCKED!
    res_s2_unlocked = client.post(
        f"/matches/{m_id_635}/owner-feedback",
        json={"owner_confirmation": "OWNER_REJECTED", "remarks": "No, tail different", "report_id": 635},
        headers=H_OWNER
    )
    record("Scenario B2: Sighting 2 confirmation succeeds after initial claim submitted (200 OK)", res_s2_unlocked.status_code == 200)

    # --- Scenario C — Independent responses ---
    # Report 630 = OWNER_CONFIRMED + Proof
    # Report 635 = OWNER_REJECTED
    # Report 642 = OWNER_CONFIRMED
    res_s3_confirm = client.post(
        f"/matches/{m_id_642}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Yes, Yeye spotted here", "report_id": 642},
        headers=H_OWNER
    )
    record("Scenario C1: Sighting 3 confirmed independently (200 OK)", res_s3_confirm.status_code == 200)

    res_rev_c = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    tabs_c = res_rev_c.json()["reports"]
    record(
        "Scenario C2: All three responses coexist independently (#630=CONFIRMED, #635=REJECTED, #642=CONFIRMED)",
        tabs_c[0]["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and tabs_c[1]["owner_confirmation_status"] == "OWNER_REJECTED"
        and tabs_c[2]["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and tabs_c[0]["tab_status"] == "Claim Pending Review"
        and tabs_c[1]["tab_status"] == "Rejected"
        and tabs_c[2]["tab_status"] == "Confirmed by Owner"
    )

    # --- Scenario D — Page refresh ---
    res_reload1 = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    res_reload2 = client.get("/matches/case-review/630?pet_id=101", headers=H_OWNER)
    data_d = res_reload2.json()
    tabs_d = data_d["reports"]
    record(
        "Scenario D: Page reload preserves initial claim evidence and independent Yes/No responses",
        data_d.get("initial_claim_completed") is True
        and data_d.get("claim") is not None
        and data_d["claim"]["vaccine_card_url"] == "https://res.cloudinary.com/test/yeye_vax.jpg"
        and tabs_d[0]["owner_confirmation_status"] == "OWNER_CONFIRMED"
        and tabs_d[1]["owner_confirmation_status"] == "OWNER_REJECTED"
        and tabs_d[2]["owner_confirmation_status"] == "OWNER_CONFIRMED"
    )

    # --- Scenario E — Initial report rejected ---
    # Create a separate case with Reports 701 and 702
    rep701 = Report(
        report_id=701,
        user_id=pet_owner.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=1,
        animal_type="Dog",
        latitude=14.808,
        longitude=121.008,
        landmark="Near Plaza",
        description="Case where initial report is not Yeye"
    )
    rep702 = Report(
        report_id=702,
        user_id=other_citizen.user_id,
        subdivision_id=1,
        category_id=1,
        current_status_id=18,
        duplicate_of_report_id=701,
        animal_type="Dog",
        latitude=14.809,
        longitude=121.009,
        landmark="Near Clinic",
        description="Second sighting in same case"
    )
    db.add_all([rep701, rep702])
    m701 = ReportMatch(
        match_id=801,
        source_report_id=701,
        matched_pet_id=pet_yeye.pet_id,
        similarity_score=80,
        status="AI_SUGGESTED",
        owner_confirmation_status="PENDING"
    )
    db.add(m701)
    db.commit()

    # Provision case review for 701
    res_case_700 = client.get("/matches/case-review/701?pet_id=101", headers=H_OWNER)
    tabs_700 = res_case_700.json()["reports"]
    m_id_701 = tabs_700[0]["match"]["match_id"]
    m_id_702 = tabs_700[1]["match"]["match_id"]

    # Owner rejects initial report 701
    res_reject_701 = client.post(
        f"/matches/{m_id_701}/owner-feedback",
        json={"owner_confirmation": "OWNER_REJECTED", "remarks": "Definitely not Yeye", "report_id": 701},
        headers=H_OWNER
    )
    record("Scenario E1: Owner rejects initial report 701", res_reject_701.status_code == 200)

    # Attempting to confirm Sighting 2 (702) must be locked (400 Bad Request)
    res_confirm_702 = client.post(
        f"/matches/{m_id_702}/owner-feedback",
        json={"owner_confirmation": "OWNER_CONFIRMED", "remarks": "Trying to confirm 702", "report_id": 702},
        headers=H_OWNER
    )
    record(
        "Scenario E2: Subsequent confirmations locked when initial report rejected (400 Bad Request)",
        res_confirm_702.status_code == 400
    )

    # Verify Report 702's match record is preserved in database (not rejected)
    db.expire_all()
    db_m702 = db.get(ReportMatch, m_id_702)
    record(
        "Scenario E3: Other report matches are preserved and not automatically rejected",
        db_m702 is not None and db_m702.owner_confirmation_status != "OWNER_REJECTED"
    )


# -------------------------------------------------------------------------------------
# Run All Tests
# -------------------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 70)
    print("RUNNING MULTI-REPORT CASE REVIEW AUTOMATED TESTS")
    print("=" * 70)
    try:
        test_authorization()
        test_incomplete_claim_status()
        test_merged_sightings_and_canonical_claim()
        test_decoupled_statuses_and_rejection()
        test_claim_proof_submission()
        test_deep_linking_from_merged_report()
        test_unmerge_handling()
        test_multiple_pet_disambiguation_and_isolation()
        test_direct_notification_links_and_reloads()
        test_section_7_confirmation_isolation()
        test_section_7_scenarios_a_through_f()
    except Exception as e:
        import traceback
        traceback.print_exc()
        record("Test Execution Failed with Exception", False, str(e))

    print("=" * 70)
    total = len(results)
    passed = sum(1 for _, p, _ in results if p)
    print(f"RESULTS: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    print("=" * 70)

    if passed != total:
        sys.exit(1)
