"""
Test helper (import it AFTER the test has set its throwaway DATABASE_URL and imported app.models).

An owner warning now needs a case that is open, about a concern an owner can be warned for (nuisance or safety), has a
VERIFIED incident, a CONFIRMED owner (confirmed with evidence) and a CONFIRMED subdivision policy that covers it
(utils/warning_rules.require_warning_eligible). Tests written before that rule issue warnings as a setup step, so they
call make_warning_ready() first: it gives the case exactly those things, directly in the database.
"""
from typing import Optional


def make_warning_ready(db, report_id: int, owner_user_id: int, observation_days: Optional[int] = 3,
                       subdivision_id: Optional[int] = None, policy_id: str = "test-policy") -> None:
    from app.models.report import Report, ReportCategory
    from app.schemas.case import PolicyIn
    from app.utils import case_policy
    from app.utils import case_vocab as V

    report = db.get(Report, report_id)
    sub = subdivision_id or report.subdivision_id
    category = db.get(ReportCategory, report.category_id)
    if V.category_family(category.category_name if category else None) not in V.VIOLATION_FAMILIES:
        safety = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Safety Concern").first()
        if safety is None:
            safety = ReportCategory(category_name="Animal Safety Concern")
            db.add(safety)
            db.flush()
        report.category_id = safety.category_id
    report.incident_verification, report.verification_status = "verified", "verified_true"
    report.ownership_status, report.ownership_owner_id, report.ownership_evidence = "confirmed", owner_user_id, ["photos"]
    settings = case_policy.load_settings(db, sub)
    settings.policies = [p for p in settings.policies if p.id != policy_id] + [PolicyIn(
        id=policy_id, title="Test policy", reference="Test ordinance", applies_to=["nuisance", "safety"],
        observation_days=observation_days, status="confirmed")]
    case_policy.save_settings(db, sub, settings, None)
    db.commit()
