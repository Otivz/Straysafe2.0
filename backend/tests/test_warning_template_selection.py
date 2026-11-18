"""
Warning letter templates, Step 1: explicit, compatible template selection (docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md, F-01, F-04, D2).

  1. A template's level is one of the four tiers, or empty for "all levels" (universal); anything else is refused.
  2. The editor can set a template back to "all levels" and clear its description (null / "" sent = cleared; not sent = unchanged).
  3. There is no automatic choice: issuing without a template is refused; an archived template, another subdivision's template,
     or a template for a different level is refused; a universal template fits every level.
  4. Both issuing paths check it before writing anything: an owner warning, and preparing a complaint letter.

Run from the backend folder:
    python tests/test_warning_template_selection.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from _case_helpers import make_warning_ready
from app.database import SessionLocal
from app.models.complaint import EnforcementStep
from app.models.report import Report, ReportCategory
from app.models.user import Subdivision, User
from app.models.warning import OwnerWarning
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate
from app.routes import warning_letters as wl_routes
from app.routes import warnings as warning_routes
from app.schemas.complaint import OffenseIn, ResponsibleIn, StepActionIn, VerifyIn
from app.schemas.warning import WarningCreate
from app.services import complaints as C
from app.services import warning_letters as WL

PASSED = 0


def check(label: str, cond: bool, info: object = "") -> None:
    global PASSED
    if not cond:
        raise AssertionError(f"[FAIL] {label} {info}")
    PASSED += 1
    print(f"[PASS] {label}")


def refused(fn, status: int, contains: str = "") -> bool:
    try:
        fn()
    except HTTPException as exc:
        return exc.status_code == status and contains.lower() in str(exc.detail).lower()
    return False


def _req():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={}, state=SimpleNamespace())


def make_template(db, leader, name, level, **extra):
    return wl_routes.create_template(
        body=wl_routes.TemplateCreateIn(
            name=name, warning_level=level, description=extra.get("description"),
            subject_template="{{warning_level}} for {{resident_name}}",
            body_template="Dear {{resident_name}}, see {{policy_reference}}: {{violation_description}}. {{required_action}} {{issued_by}}",
        ),
        req=_req(), db=db, current_user=leader,
    )


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])
        resident = db.get(User, seed["resident"])
        resident.address = "Block 4 Lot 9"
        for cid, name in ((20, "Animal Nuisance"), (21, "Animal Safety Concern")):
            if not db.query(ReportCategory).filter(ReportCategory.category_name == name).first():
                db.add(ReportCategory(category_id=cid, category_name=name))
        db.flush()
        safety = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Safety Concern").first()
        nuisance = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first()
        complainant = User(name="Neighbor", email="n@isolated.test", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
        db.add(complainant)
        db.commit()

        # ---- 1. Levels ----------------------------------------------------------------------------------------------
        check("each of the four tiers is a valid level", all(WL.normalize_warning_level(t) == t for t in WL.WARNING_LEVELS))
        check("empty level means all levels (universal)", WL.normalize_warning_level("") is None and WL.normalize_warning_level(None) is None)
        check("an unknown level is refused (422)", refused(lambda: WL.normalize_warning_level("Final Warning"), 422, "unknown warning level"))
        check("creating a template with an unknown level is refused",
              refused(lambda: make_template(db, leader, "Typo level", "1st warning"), 422))

        WL.seed_standard_templates(db.connection(), 1)   # the standard templates a subdivision starts with
        db.commit()
        universal = make_template(db, leader, "Universal letter", None, description="General")
        first_only = make_template(db, leader, "First warning letter", "1st Warning")
        second_only = make_template(db, leader, "Second warning letter", "2nd Warning")
        check("a template with no level is universal", universal["warning_level"] is None)

        # ---- 2. Editor: clear level and description ------------------------------------------------------------------
        body = dict(subject_template="{{warning_level}} for {{resident_name}}",
                    body_template="Dear {{resident_name}}, {{violation_description}} {{required_action}} {{policy_reference}}")
        upd = wl_routes.update_template(template_id=first_only["template_id"],
                                        body=wl_routes.TemplateUpdateIn(warning_level=None, description=None, **body),
                                        req=_req(), db=db, current_user=leader)
        check("sending no level (null) sets the template to all levels", upd["warning_level"] is None, upd["warning_level"])
        upd = wl_routes.update_template(template_id=universal["template_id"],
                                        body=wl_routes.TemplateUpdateIn(description="", **body), req=_req(), db=db, current_user=leader)
        check("sending an empty description clears it", upd["description"] is None, upd["description"])
        upd = wl_routes.update_template(template_id=second_only["template_id"],
                                        body=wl_routes.TemplateUpdateIn(**body), req=_req(), db=db, current_user=leader)
        check("not sending the level leaves it as it is", upd["warning_level"] == "2nd Warning", upd["warning_level"])
        upd = wl_routes.update_template(template_id=first_only["template_id"],
                                        body=wl_routes.TemplateUpdateIn(warning_level="1st Warning", **body), req=_req(), db=db, current_user=leader)
        check("a level can be set again", upd["warning_level"] == "1st Warning")
        check("updating with an unknown level is refused",
              refused(lambda: wl_routes.update_template(template_id=first_only["template_id"],
                                                        body=wl_routes.TemplateUpdateIn(warning_level="Second", **body),
                                                        req=_req(), db=db, current_user=leader), 422))
        db.commit()

        # ---- 3. Resolution rules -------------------------------------------------------------------------------------
        resolve = lambda tid, level: WL.resolve_template_for_issuance(db, 1, tid, level, actor_id=leader.user_id)  # noqa: E731
        check("no template chosen is refused (422), nothing is picked automatically", refused(lambda: resolve(None, "1st Warning"), 422, "choose a warning letter template"))
        check("a universal template fits every level", all(resolve(universal["template_id"], lvl)[0].template_id == universal["template_id"] for lvl in WL.WARNING_LEVELS))
        check("a level template fits its own level", resolve(second_only["template_id"], "2nd Warning")[0].template_id == second_only["template_id"])
        check("a 2nd Warning template is refused for a 1st Warning (409)", refused(lambda: resolve(second_only["template_id"], "1st Warning"), 409, "is for 2nd warning letters"))
        check("a 1st Warning template is refused for a Notice", refused(lambda: resolve(first_only["template_id"], "Notice"), 409))
        # a template belonging to another subdivision
        other_sub = Subdivision(subdivision_name="Other Homes", barangay_id=1)
        db.add(other_sub)
        db.flush()
        foreign = WarningLetterTemplate(subdivision_id=other_sub.subdivision_id, name="Foreign", status="active", source_type="editor")
        db.add(foreign)
        db.flush()
        check("another subdivision's template is refused (404)", refused(lambda: resolve(foreign.template_id, "1st Warning"), 404))
        wl_routes.set_template_status(template_id=first_only["template_id"], body=wl_routes.TemplateStatusIn(status="archived"),
                                      req=_req(), db=db, current_user=leader)
        check("an archived template is refused (409)", refused(lambda: resolve(first_only["template_id"], "1st Warning"), 409, "archived"))
        wl_routes.set_template_status(template_id=first_only["template_id"], body=wl_routes.TemplateStatusIn(status="active"),
                                      req=_req(), db=db, current_user=leader)
        db.commit()

        # ---- 4a. Owner warning path ----------------------------------------------------------------------------------
        rep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=safety.category_id, current_status_id=2, animal_type="Dog",
                     description="Dog roaming near the gate.", landmark="Gate", latitude=Decimal("14.8"), longitude=Decimal("121.0"))
        db.add(rep)
        db.commit()
        make_warning_ready(db, rep.report_id, resident.user_id, observation_days=3, policy_id="leash")
        db.commit()

        def issue(tid, level="1st Warning"):
            with patch("app.routes.warnings.dispatch_notification"), \
                 patch("app.services.email_templates.render_owner_warning_email", return_value=("S", "B", "<b>B</b>")):
                return warning_routes.issue_warning(
                    warning_in=WarningCreate(user_id=resident.user_id, report_id=rep.report_id, warning_level=level,
                                             violation_type="Free-Roaming Unleashed", description="Dog roaming near the gate again.",
                                             policy_id="leash", template_id=tid),
                    req=_req(), db=db, current_user=leader)

        count = lambda: db.query(OwnerWarning).filter(OwnerWarning.report_id == rep.report_id).count()  # noqa: E731
        check("owner warning without a template is refused (422)", refused(lambda: issue(None), 422, "choose a warning letter template"))
        check("...and no warning was written", count() == 0, count())
        check("owner warning with a 2nd Warning template for a 1st Warning is refused (409)", refused(lambda: issue(second_only["template_id"]), 409))
        check("...and no warning was written", count() == 0, count())
        issued = issue(universal["template_id"])
        db.commit()
        check("owner warning with a universal template is issued", issued.get("letter_id") and count() == 1, issued)
        letter = db.get(GeneratedWarningLetter, issued["letter_id"])
        check("the letter records the template the Leader chose", letter.template_id == universal["template_id"])

        # ---- 4b. Complaint letter path (prepare) ------------------------------------------------------------------------
        crep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=nuisance.category_id, current_status_id=2, animal_type="Dog",
                      description="Barking every night on Pine St.", landmark="Pine St.", latitude=Decimal("14.81"), longitude=Decimal("121.01"))
        db.add(crep)
        db.commit()
        db.refresh(crep)
        C.verify(db, crep, leader, VerifyIn(incident="verified", basis="Witnesses and CCTV.", policy_id="leash"))
        C.responsible(db, crep, leader, ResponsibleIn(mode="user", user_id=resident.user_id, evidence=["registry", "cctv"], note="Matched resident dog on CCTV."))
        C.offense(db, crep, leader, OffenseIn(decision="counted", expected_number=1))
        db.commit()
        step_id = next(s for s in C.detail(db, crep)["steps"] if s["kind"] == "letter_1")["step_id"]

        def prepare(tid):
            return C.step_action(db, crep, leader, step_id, StepActionIn(action="prepare", letter_date=date(2026, 11, 18), template_id=tid))

        check("preparing a complaint letter without a template is refused (422)", refused(lambda: prepare(None), 422, "choose a warning letter template"))
        check("preparing letter 1 with a 2nd Warning template is refused (409)", refused(lambda: prepare(second_only["template_id"]), 409))
        db.expire_all()
        check("...and the step is still waiting to be prepared", db.get(EnforcementStep, step_id).state == "to_prepare", db.get(EnforcementStep, step_id).state)
        check("...and no letter was created", db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.report_id == crep.report_id).count() == 0)
        prepare(universal["template_id"])
        db.commit()
        db.expire_all()
        check("preparing with a universal template works", db.get(EnforcementStep, step_id).state == "prepared")

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
