"""
Warning letters, Step 3: Draft -> Preview -> Validate -> Issue -> Notify -> Track (complaint flow).

  1. PREPARE keeps a draft on the step only: no warning letter record, no official reference, no notice, nothing in the warning history.
  2. The draft can be read (and printed) any time before issuing; reading it writes nothing. It has no warning reference.
  3. Preparing again replaces the draft entirely (nothing stale is carried over).
  4. ISSUE makes the one official letter from the latest draft: official reference, frozen snapshot, the letter date the Leader chose,
     then one notice to the resident. A refusal (template archived since) leaves the step prepared and nothing made.
  5. A step prepared under the earlier rules (it already has a letter record) is issued with that record, never a second one.

Run from the backend folder:
    python tests/test_warning_draft_issue.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException

from _case_helpers import make_warning_ready
from app.database import SessionLocal
from app.models.complaint import EnforcementStep
from app.models.notification import Notification
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate
from app.routes import warning_letters as wl_routes
from app.schemas.complaint import OffenseIn, ResponsibleIn, SameOccurrenceIn, StepActionIn, VerifyIn
from app.services import complaints as C
from app.services import warning_letters as WL

PASSED = 0


def check(label: str, cond: bool, info: object = "") -> None:
    global PASSED
    if not cond:
        raise AssertionError(f"[FAIL] {label} {info}")
    PASSED += 1
    print(f"[PASS] {label}")


def refused(fn, status: int, *contains: str) -> bool:
    try:
        fn()
    except HTTPException as exc:
        return exc.status_code == status and all(c.lower() in str(exc.detail).lower() for c in contains)
    return False


def _req():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={}, state=SimpleNamespace())


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])
        resident = db.get(User, seed["resident"])
        resident.address = "Block 4 Lot 9"
        complainant = User(name="Neighbor", email="neighbor@isolated.test", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
        db.add(complainant)
        for cid, name in ((20, "Animal Nuisance"), (21, "Animal Safety Concern")):
            if not db.query(ReportCategory).filter(ReportCategory.category_name == name).first():
                db.add(ReportCategory(category_id=cid, category_name=name))
        db.commit()
        nuisance = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first()
        safety = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Safety Concern").first()
        tpl = {t.warning_level: t for t in db.query(WarningLetterTemplate).filter(WarningLetterTemplate.subdivision_id == 1, WarningLetterTemplate.status == "active")}
        # a confirmed policy (the complaint flow uses it)
        seed_rep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=safety.category_id, current_status_id=2, animal_type="Dog",
                          description="Setup.", landmark="Gate", latitude=Decimal("14.8"), longitude=Decimal("121.0"))
        db.add(seed_rep)
        db.commit()
        make_warning_ready(db, seed_rep.report_id, resident.user_id, observation_days=3, policy_id="leash")

        people = []
        made_complaints: list = []

        def person(n: int) -> User:
            u = User(name=f"Respondent {n}", email=f"respondent{n}@isolated.test", password="x", role_id=1, is_verified=True, status="Active",
                     subdivision_id=1, barangay_id=1, address=f"Block {n} Lot 1")
            db.add(u)
            db.commit()
            people.append(u)
            return u

        def complaint(who: User, number: int = 1):
            """A verified complaint against `who`, counted as their offense `number` (a repeat is a separate occurrence, as the Leader decides)."""
            k = len(made_complaints)
            made_complaints.append(k)
            street = ["Pine", "Oak", "Narra", "Molave", "Acacia", "Mahogany", "Ipil", "Yakal"][k % 8]
            # each complaint at its own street and spot, so none looks like the same occurrence as another
            rep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=nuisance.category_id, current_status_id=2, animal_type="Dog",
                         description=f"Barking every night on {street} St. ({who.name}, offense {number})", landmark=f"{street} St.",
                         latitude=Decimal("14.81") + Decimal(k) / 100, longitude=Decimal("121.01") + Decimal(k) / 100,
                         seen_at=datetime(2026, 11, 1, 8, 0) + timedelta(hours=6 * k))   # a fixed, increasing incident time: offenses count in order
            db.add(rep)
            db.commit()
            db.refresh(rep)
            C.verify(db, rep, leader, VerifyIn(incident="verified", basis="Witnesses and CCTV.", policy_id="leash"))
            C.responsible(db, rep, leader, ResponsibleIn(mode="user", user_id=who.user_id, evidence=["registry", "cctv"], note="Matched the dog on CCTV."))
            import re as _re
            for _ in range(20):                       # each earlier complaint at the same place is answered "a separate incident"
                try:
                    C.offense(db, rep, leader, OffenseIn(decision="counted", expected_number=number))
                    break
                except HTTPException as exc:
                    other = _re.search(r"complaint #(\d+)", str(exc.detail))
                    assert other, exc.detail
                    C.same_occurrence(db, rep, leader, SameOccurrenceIn(other_report_id=int(other.group(1)), decision="separate", note="A different night."))
                    db.commit()
            db.commit()
            steps = {s["kind"]: s["step_id"] for s in C.detail(db, rep)["steps"]}
            return rep, steps

        letters = lambda rep: db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.report_id == rep.report_id).count()  # noqa: E731
        notices_of = lambda u: db.query(Notification).filter(Notification.user_id == u.user_id).count()  # noqa: E731
        history = lambda rep: wl_routes.case_warning_letters(report_id=rep.report_id, db=db, current_user=leader)["items"]  # noqa: E731

        # ---- 1. Prepare = draft only --------------------------------------------------------------------------------------------
        r1 = person(1)
        notices = lambda: notices_of(r1)  # noqa: E731
        rep, steps = complaint(r1)
        s1 = steps["letter_1"]
        n_before = notices()
        C.step_action(db, rep, leader, s1, StepActionIn(action="prepare", letter_date=date(2026, 11, 10), template_id=tpl["1st Warning"].template_id,
                                                        required_action="Keep the dog inside at night."))
        db.commit()
        db.expire_all()
        step = db.get(EnforcementStep, s1)
        check("prepare: the step is prepared", step.state == "prepared")
        check("prepare: NO warning letter record is made", letters(rep) == 0)
        check("prepare: no official reference anywhere on the step", "warning_reference" not in (step.details or {}) and "letter_id" not in (step.details or {}), step.details)
        check("prepare: the resident is not notified", notices() == n_before)
        check("prepare: nothing appears in the official warning history", history(rep) == [])
        check("prepare: the draft (template, action, letter date) is kept on the step",
              step.details.get("template_id") == tpl["1st Warning"].template_id and step.details.get("letter_date") == "2026-11-10"
              and step.details.get("required_action") == "Keep the dog inside at night.", step.details)

        # ---- 2. The draft can be read; reading writes nothing ------------------------------------------------------------------
        d = C.draft_letter(db, rep, leader, s1)
        check("draft: it is marked a draft and has no warning reference", d["is_draft"] is True and "WARN-" not in d["placeholders"]["warning_reference"] and "WARN-" not in d["body"], d["placeholders"]["warning_reference"])
        check("draft: it is dated with the letter date the Leader chose", d["placeholders"]["issue_date"] == "November 10, 2026", d["placeholders"]["issue_date"])
        check("draft: it shows the Leader's text from the saved draft and can be issued", "Keep the dog inside at night." in d["body"] and d["can_issue"] is True)
        check("draft: reading it made no letter and sent nothing", letters(rep) == 0 and notices() == n_before)
        rep2, steps2 = complaint(person(2))
        check("draft: a letter that is not prepared has no draft (409)", refused(lambda: C.draft_letter(db, rep2, leader, steps2["letter_1"]), 409))

        # ---- 3. Preparing again replaces the draft ---------------------------------------------------------------------------------
        C.step_action(db, rep, leader, s1, StepActionIn(action="prepare", letter_date=date(2026, 11, 12), template_id=tpl["1st Warning"].template_id,
                                                        field_overrides={"pet_name": "Bantay"}))
        db.commit()
        db.expire_all()
        step = db.get(EnforcementStep, s1)
        check("re-prepare: the new letter date and hand-filled detail replace the old ones",
              step.details.get("letter_date") == "2026-11-12" and step.details.get("field_overrides") == {"pet_name": "Bantay"})
        check("re-prepare: the old required action is not carried over", "required_action" not in step.details, step.details)
        check("re-prepare: still no letter record and no notice", letters(rep) == 0 and notices() == n_before)

        # ---- 4. Issue = the one official letter -------------------------------------------------------------------------------------
        C.step_action(db, rep, leader, s1, StepActionIn(action="issue", via="Subdivision Officer"))
        db.commit()
        db.expire_all()
        step = db.get(EnforcementStep, s1)
        made = db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.report_id == rep.report_id).all()
        check("issue: exactly one official letter is made", len(made) == 1)
        letter = made[0]
        check("issue: it has its official warning reference, also kept on the step",
              letter.warning_reference.startswith("WARN-") and step.details.get("warning_reference") == letter.warning_reference and step.details.get("letter_id") == letter.letter_id)
        check("issue: it is dated with the letter date the Leader chose (the latest draft)", letter.placeholders_json.get("issue_date") == "November 12, 2026", letter.placeholders_json.get("issue_date"))
        check("issue: it uses the latest draft (Bantay), not the earlier one", "Bantay" in letter.rendered_body and "Keep the dog inside at night." not in letter.rendered_body)
        check("issue: its issued time is the real time it was issued", letter.issued_at.date() == datetime.now().date())
        check("issue: the resident is notified once", notices() == n_before + 1 and letter.notification_status == "sent", (notices(), letter.notification_status))
        check("issue: it is now in the official warning history", [x["letter_id"] for x in history(rep)] == [letter.letter_id])
        check("issue: the step is issued", step.state == "issued")
        check("an issued letter has no draft any more (it is opened by its reference)", refused(lambda: C.draft_letter(db, rep, leader, s1), 409))

        # ---- 4b. A refusal at issue leaves everything as it was ------------------------------------------------------------------------
        r3 = person(3)
        rep3, steps3 = complaint(r3)
        s3 = steps3["letter_1"]
        extra = wl_routes.create_template(body=wl_routes.TemplateCreateIn(name="Temporary first warning", warning_level="1st Warning", subject_template="{{warning_level}}",
                                                                          body_template="Dear {{resident_name}}. {{violation_description}} {{required_action}} {{policy_reference}}"),
                                          req=_req(), db=db, current_user=leader)
        C.step_action(db, rep3, leader, s3, StepActionIn(action="prepare", letter_date=date(2026, 11, 14), template_id=extra["template_id"]))
        db.commit()
        wl_routes.set_template_status(template_id=extra["template_id"], body=wl_routes.TemplateStatusIn(status="archived"), req=_req(), db=db, current_user=leader)
        n3 = notices_of(r3)
        check("issue after the chosen template was archived is refused (409)", refused(lambda: C.step_action(db, rep3, leader, s3, StepActionIn(action="issue", via="Officer")), 409, "archived"))
        db.rollback()
        db.expire_all()
        check("...the step is still prepared, no letter was made and no notice sent", db.get(EnforcementStep, s3).state == "prepared" and letters(rep3) == 0 and notices_of(r3) == n3)
        d3 = None
        try:
            d3 = C.draft_letter(db, rep3, leader, s3)
        except HTTPException as exc:
            d3 = exc
        check("...and its draft says why (the template is archived), so the Leader prepares it again", isinstance(d3, HTTPException) and d3.status_code == 409)

        # ---- 4c. Second letter: the summons in the draft is in the letter -----------------------------------------------------------
        rep_b, steps_b = complaint(r1, number=2)
        s2 = steps_b.get("letter_2")
        check("a second offense has a second letter", s2 is not None, steps_b)
        C.step_action(db, rep_b, leader, s2, StepActionIn(action="prepare", letter_date=date(2026, 11, 20), template_id=tpl["2nd Warning"].template_id,
                                                          summons_at=datetime(2026, 11, 27, 16, 0), place="Subdivision Office"))
        db.commit()
        check("letter 2 prepared: still no letter record", letters(rep_b) == 0)
        d2 = C.draft_letter(db, rep_b, leader, s2)
        check("letter 2 draft: shows the summons from the draft", "November 27, 2026 at 4:00 PM" in d2["body"] and "Subdivision Office" in d2["body"])
        C.step_action(db, rep_b, leader, s2, StepActionIn(action="issue", via="Subdivision Officer"))
        db.commit()
        second = db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.complaint_step_id == s2).one()
        check("letter 2 issued: the summons is in the official letter", "November 27, 2026 at 4:00 PM" in second.rendered_body and "Subdivision Office" in second.rendered_body)
        check("letter 2 issued: dated with its own letter date", second.placeholders_json.get("issue_date") == "November 20, 2026")

        # ---- 5. A step prepared under the earlier rules ---------------------------------------------------------------------------------
        rep4, steps4 = complaint(person(4))
        s4 = steps4["letter_1"]
        C.step_action(db, rep4, leader, s4, StepActionIn(action="prepare", letter_date=date(2026, 11, 15), template_id=tpl["1st Warning"].template_id))
        db.commit()
        legacy = WL.create_generated_letter(**C._letter_args(db, rep4, leader, db.get(C.ComplaintOffense, db.get(EnforcementStep, s4).offense_id), "letter_1",
                                                             C._draft_of(db.get(EnforcementStep, s4).details)),
                                            policy_id="leash", complaint_step_id=s4)   # what the old Prepare used to make
        db.commit()
        C.step_action(db, rep4, leader, s4, StepActionIn(action="issue", via="Subdivision Officer"))
        db.commit()
        rows = db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.complaint_step_id == s4).all()
        check("an old prepared step that already has a letter record is issued with it, never a second one",
              len(rows) == 1 and rows[0].letter_id == legacy.letter_id and db.get(EnforcementStep, s4).details.get("letter_id") == legacy.letter_id)

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
