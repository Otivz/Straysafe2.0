"""
Verify consolidated case management when Injured Animal and Dangerous Animal reports are merged:
  1. Both concerns retain independent CaseConcern statuses (`Injured` Resolved vs `Dangerous` Ongoing Assessment).
  2. Resolving one concern does NOT close the master case and blocks premature closure until all concerns resolve.
  3. Merged reports are preserved with full metadata (ID, type, description, condition, location/GPS, media, reporter, timestamps, original status)
     and labeled `Merged into Case #CASE-ID`, while excluded from active `case_summaries`.
  4. Unmerging restores original report status and detaches the unmerged concern cleanly.
"""
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _isolated_db  # noqa: E402,F401

from _isolated_db import build_app, create_schema_and_seed  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from starlette.requests import Request  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.case_messaging import CaseMessageThread  # noqa: E402
from app.models.report import Report, ReportCategory, ReportMedia  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes import cases, lost_found, reports  # noqa: E402
from app.schemas.case import CloseIn, ConcernUpdateIn  # noqa: E402
from app.schemas.report import ReportMergeGroupRequest, ReportUnmergeRequest  # noqa: E402
from app.services import case_messaging as CM, case_summaries, case_view  # noqa: E402

api = build_app(cases.router, reports.router)
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


def _cat_id(db, name: str) -> int:
    row = db.query(ReportCategory).filter(ReportCategory.category_name == name).first()
    assert row is not None, f"Missing category {name}"
    return row.category_id


def run_tests():
    db = SessionLocal()
    try:
        leader = db.get(User, ids["leader"])
        resident1 = db.get(User, ids["resident"])
        resident1.phone = "09170001111"
        resident1.address = "Blk 2 Lot 3"
        resident2 = User(
            name="Maria Clara",
            email="maria@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=leader.subdivision_id,
            barangay_id=leader.barangay_id,
            phone="09172223333",
            address="Blk 5 Lot 8",
        )
        db.add(resident2)
        db.commit()

        injured_cat = _cat_id(db, "Injured / Distressed Animal")
        safety_cat = _cat_id(db, "Animal Safety Concern")

        injured_rep = Report(
            user_id=resident1.user_id,
            subdivision_id=leader.subdivision_id,
            category_id=injured_cat,
            current_status_id=2,
            animal_type="Dog",
            animal_breed="Aspin",
            description="Dog limping with leg wound near Park",
            condition="Conditions: Injury or bleeding\nCan the animal move?: A little",
            landmark="Selera Community Park",
            latitude=Decimal("14.80100000"),
            longitude=Decimal("121.00300000"),
            priority_level="High",
        )
        safety_rep = Report(
            user_id=resident2.user_id,
            subdivision_id=leader.subdivision_id,
            category_id=safety_cat,
            current_status_id=1,
            animal_type="Dog",
            animal_breed="Aspin",
            description="Same dog snapped at joggers near Park",
            condition="Behaviors: Attempted bite or attack\nCurrently aggressive?: Yes, currently aggressive",
            landmark="Park Basketball Court",
            latitude=Decimal("14.80115000"),
            longitude=Decimal("121.00325000"),
            priority_level="High",
        )
        db.add_all([injured_rep, safety_rep])
        db.flush()
        db.add(ReportMedia(report_id=safety_rep.report_id, file_url="https://example.test/safety-photo.jpg", media_type="Image"))
        db.commit()

        # Merge Dangerous Animal report into Injured Animal primary master case
        reports.merge_report_group(
            ReportMergeGroupRequest(
                report_ids=[injured_rep.report_id, safety_rep.report_id],
                primary_report_id=injured_rep.report_id,
                notes="Confirmed same injured dog exhibiting aggressive defensive behavior",
            ),
            _fake_request("/reports/merge-group"),
            db=db,
            current_user=leader,
        )
        db.expire_all()

        # Active case listing includes master case, excludes merged child report
        summaries = case_summaries.case_summaries(db, leader)["items"]
        summary_ids = {s["report_id"] for s in summaries}
        assert injured_rep.report_id in summary_ids
        assert safety_rep.report_id not in summary_ids

        # Detail view preserves all merged report fields + tracks both independent concerns
        detail = case_view.case_detail(db, db.get(Report, injured_rep.report_id), leader)
        assert len(detail["concerns"]) == 2
        assert detail["open_concerns_count"] == 2
        assert len(detail["merged_reports"]) == 1

        merged = detail["merged_reports"][0]
        assert merged["report_id"] == safety_rep.report_id
        assert merged["category_family"] == "safety"
        assert merged["description"] == "Same dog snapped at joggers near Park"
        assert "Attempted bite" in (merged["condition"] or "")
        assert merged["location_landmark"] == "Park Basketball Court"
        assert abs(merged["latitude"] - 14.80115) < 1e-6
        assert abs(merged["longitude"] - 121.00325) < 1e-6
        assert merged["reporter_name"] == "Maria Clara"
        assert merged["reporter_phone"] == "09172223333"
        assert merged["original_status_id"] == 1
        assert merged["merged_into_label"].startswith("Merged into Case #SS-")
        assert len(merged["media"]) == 1 and merged["media"][0]["file_url"] == "https://example.test/safety-photo.jpg"

        injured_concern = next(c for c in detail["concerns"] if c["concern_family"] == "injured")
        safety_concern = next(c for c in detail["concerns"] if c["concern_family"] == "safety")
        assert injured_concern["status"] == "ongoing_assessment"
        assert safety_concern["status"] == "ongoing_assessment"

        # 1. Resolve Injured Animal Concern ONLY -> Dangerous remains ongoing, master stays open!
        after_injured = cases.put_concern(
            injured_rep.report_id,
            injured_concern["concern_id"],
            ConcernUpdateIn(
                status="resolved",
                outcome="Treated and Released",
                final_animal_condition="Wound dressed and treated",
                resolution_notes="Vet treated leg injury.",
            ),
            _fake_request(f"/cases/{injured_rep.report_id}/concerns/{injured_concern['concern_id']}", "PUT"),
            db=db,
            user=leader,
        )
        assert after_injured["case_status"] != "closed"
        assert after_injured["open_concerns_count"] == 1
        ic_after = next(c for c in after_injured["concerns"] if c["concern_family"] == "injured")
        sc_after = next(c for c in after_injured["concerns"] if c["concern_family"] == "safety")
        assert ic_after["status"] == "resolved"
        assert sc_after["status"] == "ongoing_assessment"

        # 2. Attempting to close master case prematurely MUST fail
        opts = cases.closure_options(injured_rep.report_id, db=db, user=leader)["options"]
        resolved_opt = next(o for o in opts if o["disposition"] == "resolved_intervention")
        assert resolved_opt["available"] is False
        assert "Dangerous Animal Concern" in (resolved_opt["reason"] or "")

        try:
            cases.close(
                injured_rep.report_id,
                CloseIn(disposition="resolved_intervention", reason="Trying early close before safety resolved"),
                _fake_request(f"/cases/{injured_rep.report_id}/close"),
                db=db,
                user=leader,
            )
            raise AssertionError("Expected premature close_case to raise 409")
        except HTTPException as exc:
            assert exc.status_code == 409

        # 3. Attempting to resolve Dangerous Animal Concern while threat_ongoing="Yes" fails (422)
        try:
            cases.put_concern(
                injured_rep.report_id,
                safety_concern["concern_id"],
                ConcernUpdateIn(
                    status="resolved",
                    outcome="Animal Behavior No Longer Threatening",
                    threat_ongoing="Yes",
                    resolution_notes="Still biting",
                ),
                _fake_request(f"/cases/{injured_rep.report_id}/concerns/{safety_concern['concern_id']}", "PUT"),
                db=db,
                user=leader,
            )
            raise AssertionError("Expected threat_ongoing=Yes resolution to fail 422")
        except HTTPException as exc:
            assert exc.status_code == 422

        # 4. Resolve Dangerous Animal Concern cleanly -> now all concerns resolved, close_case succeeds!
        after_safety = cases.put_concern(
            injured_rep.report_id,
            safety_concern["concern_id"],
            ConcernUpdateIn(
                status="resolved",
                outcome="Animal Behavior No Longer Threatening",
                threat_ongoing="No",
                security_actions_performed="Area patrolled and cleared",
                resolution_notes="Dog calm after recovery; no further threat.",
            ),
            _fake_request(f"/cases/{injured_rep.report_id}/concerns/{safety_concern['concern_id']}", "PUT"),
            db=db,
            user=leader,
        )
        assert after_safety["open_concerns_count"] == 0
        assert after_safety["case_status"] != "closed"

        # 3b. Subdivision Leader & merged report's resident can chat while master case is open!
        merged_thread = lost_found.open_report_thread(
            safety_rep.report_id,
            lost_found.PartyIn(party="reporter"),
            db=db,
            user=leader,
        )
        tid = merged_thread["thread_id"]
        assert merged_thread["status"] == "open"
        assert merged_thread["can_reply"] is True
        assert merged_thread["report_id"] == safety_rep.report_id
        assert merged_thread["case_status"] != "Closed"

        CM.send(db, db.get(CaseMessageThread, tid), leader, "Leader checking on dangerous behavior location.")
        db.commit()
        res_thread = CM.open_for_resident(db, safety_rep.report_id, resident2)
        assert res_thread.thread_id == tid
        CM.send(db, res_thread, resident2, "Dog is still near Block 2 gate.")
        db.commit()
        master_threads = CM.threads_for_report(db, db.get(Report, injured_rep.report_id), leader)
        assert any(t["thread_id"] == tid and t["can_reply"] is True for t in master_threads)

        closed = cases.close(
            injured_rep.report_id,
            CloseIn(
                disposition="resolved_intervention",
                reason="Both injured welfare concern and dangerous behavior assessment resolved cleanly.",
            ),
            _fake_request(f"/cases/{injured_rep.report_id}/close"),
            db=db,
            user=leader,
        )
        assert closed["result"]["disposition"] == "resolved_intervention"
        assert closed["result"]["outcome"] == "resolved"
        assert closed["case"]["case_status"] == "closed"
        db.expire_all()
        assert db.get(Report, injured_rep.report_id).case_status == "closed"
        assert db.get(CaseMessageThread, tid).status == "closed"

        # 5. Also verify unmerge restores original status, detaches concern, and preserves pre-existing chat across merge
        rep_a = Report(
            user_id=resident1.user_id,
            subdivision_id=leader.subdivision_id,
            category_id=injured_cat,
            current_status_id=2,
            animal_type="Cat",
            description="Injured cat at Gate 1",
            landmark="Gate 1",
            latitude=Decimal("14.80150000"),
            longitude=Decimal("121.00510000"),
            priority_level="Medium",
        )
        rep_b = Report(
            user_id=resident2.user_id,
            subdivision_id=leader.subdivision_id,
            category_id=safety_cat,
            current_status_id=5,
            animal_type="Cat",
            description="Scratching cat near Gate 1",
            landmark="Gate 1",
            latitude=Decimal("14.80151000"),
            longitude=Decimal("121.00511000"),
            priority_level="High",
        )
        db.add_all([rep_a, rep_b])
        db.commit()
        pre_thread = CM.open_for_resident(db, rep_b.report_id, resident2)
        CM.send(db, pre_thread, resident2, "Cat scratched near the guardhouse.")
        db.commit()
        reports.merge_report_group(
            ReportMergeGroupRequest(report_ids=[rep_a.report_id, rep_b.report_id], notes="Suspected same cat"),
            _fake_request("/reports/merge-group"),
            db=db,
            current_user=leader,
        )
        db.expire_all()
        assert db.get(CaseMessageThread, pre_thread.thread_id).status == "open"
        CM.send(db, db.get(CaseMessageThread, pre_thread.thread_id), leader, "Received, we merged this into the cat welfare case.")
        db.commit()
        reports.unmerge_duplicate_report(
            rep_b.report_id,
            ReportUnmergeRequest(reason="Confirmed two different cats after inspection"),
            _fake_request(f"/reports/{rep_b.report_id}/unmerge"),
            db=db,
            current_user=leader,
        )
        db.expire_all()
        restored_b = db.get(Report, rep_b.report_id)
        assert restored_b.duplicate_of_report_id is None
        assert restored_b.current_status_id == 5  # restored original pre-merge status!

        print("[PASS] test_merged_concerns_case_management")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
