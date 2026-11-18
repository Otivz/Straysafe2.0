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


def template_id_for(client, headers, level: str = "1st Warning", subdivision_id: int = 1, session_factory=None) -> int:
    """
    A warning letter must name the template the Leader chose (the server never picks one), and templates are no longer created
    lazily when a page is opened. Tests that issue warnings as a setup step therefore give the subdivision its standard templates
    (the same call a new subdivision gets; safe to repeat) and choose the one for this level, as a Leader would.
    `session_factory` is for a test that builds its own database instead of using the shared one.
    """
    from app.database import SessionLocal
    from app.services import warning_letters as WL
    with (session_factory or SessionLocal)() as db:
        WL.seed_standard_templates(db.connection(), subdivision_id)
        db.commit()
    res = client.get("/warning-templates", params={"status": "active"}, headers=headers)
    assert res.status_code == 200, res.text
    fitting = [t for t in res.json()["items"] if t["warning_level"] in (None, level) and t["subdivision_id"] == subdivision_id]
    assert fitting, f"no active warning letter template for {level} in subdivision {subdivision_id}"
    return next((t for t in fitting if t["warning_level"] == level), fitting[0])["template_id"]
