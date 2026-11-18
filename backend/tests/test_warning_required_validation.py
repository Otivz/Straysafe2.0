"""
Warning letters, Step 2: one placeholder registry, and required-information checks on every issuing path
(docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md: F-02, F-03, D1).

  1. The registry lists every placeholder the system supplies, in three classes (required / conditional / optional) plus the system's own.
  2. A template (typed, imported from DOCX, or edited) that uses a placeholder the system does not supply is refused, by name.
  3. Needed values block issuing: in the owner warning flow, the complaint flow and a direct call to the generator; optional ones do not.
  4. Nothing is invented (no "Subdivision Resident", no "Animal"); the preview shows "[missing: ...]" instead of a silent blank.

Run from the backend folder:
    python tests/test_warning_required_validation.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

import io
import zipfile
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from _case_helpers import make_warning_ready
from app.database import SessionLocal
from app.models.complaint import ComplaintOffense, ComplaintRespondent, EnforcementStep
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.models.warning import OwnerWarning
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate, WarningLetterTemplateVersion
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


def refused(fn, status: int, *contains: str) -> bool:
    try:
        fn()
    except HTTPException as exc:
        text = str(exc.detail).lower()
        return exc.status_code == status and all(c.lower() in text for c in contains)
    return False


def _req():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={}, state=SimpleNamespace())


class _Upload:
    def __init__(self, filename, data):
        self.filename, self.content_type, self._data = filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data

    async def read(self):
        return self._data


def docx_with(text: str) -> bytes:
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    paras = "".join(f"<w:p><w:r><w:t>{t}</w:t></w:r></w:p>" for t in text.split("\n"))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("word/document.xml", f'<?xml version="1.0"?><w:document xmlns:w="{ns}"><w:body>{paras}</w:body></w:document>')
    return out.getvalue()


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])
        resident = db.get(User, seed["resident"])
        resident.address = "Block 4 Lot 9"
        no_address = User(name="No Address Resident", email="noaddr@isolated.test", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
        complainant = User(name="Neighbor", email="neighbor@isolated.test", password="x", role_id=1, is_verified=True, status="Active", subdivision_id=1, barangay_id=1)
        db.add_all([no_address, complainant])
        for cid, name in ((20, "Animal Nuisance"), (21, "Animal Safety Concern")):
            if not db.query(ReportCategory).filter(ReportCategory.category_name == name).first():
                db.add(ReportCategory(category_id=cid, category_name=name))
        db.commit()
        safety = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Safety Concern").first()
        nuisance = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first()
        tpl = {t.warning_level: t for t in db.query(WarningLetterTemplate).filter(WarningLetterTemplate.subdivision_id == 1, WarningLetterTemplate.status == "active")}

        # ---- 1. The registry ------------------------------------------------------------------------------------------------
        ctx = WL.build_letter_context(db=db, subdivision_id=1, report=None, owner=None, recipient_name="A", recipient_address="B", pet=None, issuer=leader,
                                      warning_level="1st Warning", violation_description="v", required_action="r", policy_reference="p")
        check("the registry lists exactly the placeholders the system supplies (nothing missing, nothing extra)", set(ctx) == set(WL.PLACEHOLDER_REQUIREMENT), set(ctx) ^ set(WL.PLACEHOLDER_REQUIREMENT))
        check("each placeholder has a label, an example, a description and one of the four classes",
              all(p["label"] and p["example"] and p["description"] and p["requirement"] in ("required", "conditional", "optional", "system") for p in WL.PLACEHOLDER_DEFINITIONS))
        R = WL.PLACEHOLDER_REQUIREMENT
        check("required: the letter's essentials", all(R[k] == "required" for k in ("resident_name", "policy_reference", "violation_description", "required_action", "warning_level", "issued_by", "case_reference", "issue_date", "subdivision_name")))
        check("conditional: needed when the template uses them", all(R[k] == "conditional" for k in ("summons_date", "summons_place", "observation_days", "resident_address", "pet_type", "incident_date")))
        check("optional: may be blank (pet name, issuer name and role, the office's address, phone and email)", all(R[k] == "optional" for k in ("pet_name", "issuer_name", "issuer_role", "subdivision_address", "subdivision_phone", "subdivision_email")))
        check("the warning reference is the system's own", R["warning_reference"] == "system")
        check("the API still tells the screens what is required", all(p["required"] == (p["requirement"] != "optional") for p in WL.PLACEHOLDER_DEFINITIONS))

        # ---- 2. Unknown placeholders are refused where a template is saved ------------------------------------------------------
        good = dict(subject_template="{{warning_level}} for {{resident_name}}", body_template="Dear {{resident_name}}, {{violation_description}} {{required_action}} {{policy_reference}}")
        check("creating a template with a typo'd placeholder is refused, naming it and listing the valid ones (422)",
              refused(lambda: wl_routes.create_template(body=wl_routes.TemplateCreateIn(name="Typo", subject_template="S {{resident_nme}}", body_template=good["body_template"]),
                                                        req=_req(), db=db, current_user=leader), 422, "{{resident_nme}}", "Resident Name ({{resident_name}})"))
        ok = wl_routes.create_template(body=wl_routes.TemplateCreateIn(name="Valid letter", **good), req=_req(), db=db, current_user=leader)
        check("a template with only supported placeholders is saved", ok["template_id"] > 0)
        check("editing a template to add an unsupported placeholder is refused (422)",
              refused(lambda: wl_routes.update_template(template_id=ok["template_id"], body=wl_routes.TemplateUpdateIn(subject_template="Warning", body_template="Dear {{resident_name}} {{owner_phone}}"),
                                                        req=_req(), db=db, current_user=leader), 422, "{{owner_phone}}"))
        check("...and no new version was made", db.query(WarningLetterTemplateVersion).filter(WarningLetterTemplateVersion.template_id == ok["template_id"]).count() == 1)
        import asyncio
        bad_docx = docx_with("Subject: Warning for {{resident_name}}\nDear {{resident_name}}, you own {{pet_nickname}}.")
        before = db.query(WarningLetterTemplate).count()
        check("importing a DOCX with an unsupported placeholder is refused, naming it, and imports nothing",
              refused(lambda: asyncio.run(wl_routes.import_docx_template(req=_req(), file=_Upload("bad.docx", bad_docx), name="Bad", description=None, warning_level=None,
                                                                         is_default=False, template_id=None, change_note=None, subdivision_id=None, db=db, current_user=leader)),
                      422, "{{pet_nickname}}") and db.query(WarningLetterTemplate).count() == before)
        good_docx = docx_with("Subject: Warning for {{resident_name}}\nDear {{resident_name}}, {{violation_description}} {{required_action}} {{policy_reference}}")
        imported = asyncio.run(wl_routes.import_docx_template(req=_req(), file=_Upload("good.docx", good_docx), name="Good DOCX", description=None, warning_level=None,
                                                              is_default=False, template_id=None, change_note=None, subdivision_id=None, db=db, current_user=leader))
        check("a DOCX with only supported placeholders is imported", imported["template_id"] > 0)

        # ---- 3. What blocks, and what does not (the rules themselves) ----------------------------------------------------------
        full = dict(resident_name="Juan", case_reference="SS-2026-0001", warning_level="1st Warning", violation_description="Roaming", required_action="Keep it leashed",
                    policy_reference="Rule 1", issue_date="November 18, 2026", issued_by="Leader (Subdivision Leader)", subdivision_name="Selera Homes",
                    warning_reference="WARN-PENDING", resident_address="", pet_type="", incident_date="", observation_days="", summons_date="", summons_place="",
                    pet_name="", issuer_name="", issuer_role="", subdivision_address="", subdivision_phone="", subdivision_email="")
        keys = lambda ms: sorted(m["key"] for m in ms)  # noqa: E731
        check("optional values may be blank: an office with no phone does not block", WL.detect_missing_fields("S", "Call {{subdivision_phone}} about {{pet_name}}", full) == [])
        check("a conditional value the template does not use may be blank", WL.detect_missing_fields("S", "Dear {{resident_name}}", full) == [])
        check("a conditional value the template uses blocks when blank", keys(WL.detect_missing_fields("S", "At {{summons_place}} on {{summons_date}}", full)) == ["summons_date", "summons_place"])
        check("a required value blocks even when the template does not use it", keys(WL.detect_missing_fields("S", "Dear {{resident_name}}", {**full, "policy_reference": ""})) == ["policy_reference"])
        unknown = WL.detect_missing_fields("S", "Dear {{resident_nme}}", full)
        check("an unsupported placeholder blocks, flagged as unknown (an old template, say)", len(unknown) == 1 and unknown[0]["unknown"] and unknown[0]["key"] == "resident_nme", unknown)
        out = WL.render_preview("S", "Policy: {{policy_reference}} Phone: {{subdivision_phone}}", {**full, "policy_reference": ""})
        check("the preview shows a needed missing value as [missing: ...], never a silent blank, and cannot be issued",
              "[missing: Policy Reference]" in out["body"] and out["can_issue"] is False, out["body"])
        check("...while an optional blank renders as nothing and the letter can be issued", WL.render_preview("S", "Phone: {{subdivision_phone}}", full)["can_issue"] is True)
        check("hand-entered details can only fill registry keys: an unknown key is refused (422)",
              refused(lambda: WL.build_letter_context(db=db, subdivision_id=1, report=None, owner=None, recipient_name="A", recipient_address="B", pet=None, issuer=leader,
                                                      warning_level="1st Warning", violation_description="v", required_action="r", policy_reference="p",
                                                      overrides={"made_up": "x"}), 422))
        check("...and the system's own warning reference cannot be typed in (422)",
              refused(lambda: WL.build_letter_context(db=db, subdivision_id=1, report=None, owner=None, recipient_name="A", recipient_address="B", pet=None, issuer=leader,
                                                      warning_level="1st Warning", violation_description="v", required_action="r", policy_reference="p",
                                                      overrides={"warning_reference": "WARN-FAKE"}), 422))

        # ---- 4. The generator itself: every caller is covered ----------------------------------------------------------------
        letters = lambda: db.query(GeneratedWarningLetter).count()  # noqa: E731
        base = dict(db=db, subdivision_id=1, report=None, owner=None, recipient_name="Juan", recipient_address="B3 L8", pet=None, issuer=leader, warning_level="1st Warning",
                    policy_id=None, policy_reference="Rule 1", violation_description="Roaming", required_action="Keep it leashed", template_id=tpl["1st Warning"].template_id)
        n = letters()
        check("a direct call with the policy reference blank is refused, and no letter is made",
              refused(lambda: WL.create_generated_letter(**{**base, "policy_reference": ""}), 422, "missing required fields", "Policy Reference") and letters() == n)
        check("a direct call with the violation description blank is refused", refused(lambda: WL.create_generated_letter(**{**base, "violation_description": "  "}), 422, "Violation Description"))
        check("a direct call with no pet and no species is refused: nothing says \"Animal\" for the Leader (the template uses the pet type)",
              refused(lambda: WL.create_generated_letter(**base), 422, "Pet Type / Species") and letters() == n)
        made = WL.create_generated_letter(**{**base, "overrides": {"pet_type": "Dog"}})
        db.commit()
        check("...with the pet type filled in by hand it is issued", made.letter_id and made.pet_type == "Dog")
        check("...and the pet's name, which is optional, reads naturally instead of a blank or an invented word", ("your pet" in made.rendered_body.lower() or "your dog" in made.rendered_body.lower()) and "Animal" not in made.rendered_body and "[missing" not in made.rendered_body, made.rendered_body[:200])
        check("the resident's address is not invented: a letter whose template does not use it keeps it empty", made.recipient_address == "B3 L8")
        no_addr = WL.create_generated_letter(**{**base, "recipient_address": None, "overrides": {"pet_type": "Dog"}})
        check("...no address given, none is made up (no \"Subdivision Resident\")", no_addr.recipient_address is None and "Subdivision Resident" not in no_addr.rendered_body)
        # a stored version that uses an unsupported placeholder (an old template) cannot be used to issue
        old_t = WarningLetterTemplate(subdivision_id=1, name="Old typo template", status="active", source_type="editor", is_default=False)
        db.add(old_t)
        db.flush()
        old_v = WarningLetterTemplateVersion(template_id=old_t.template_id, version_number=1, subject_template="S {{resident_nme}}", body_template="Dear {{resident_nme}}")
        db.add(old_v)
        db.flush()
        old_t.current_version_id = old_v.version_id
        db.commit()
        n = letters()
        check("an old template with an unsupported placeholder cannot issue a letter, with a clear message",
              refused(lambda: WL.create_generated_letter(**{**base, "template_id": old_t.template_id}), 422, "unsupported placeholders", "{{resident_nme}}") and letters() == n)
        db.commit()

        # ---- 5. Owner warning flow ------------------------------------------------------------------------------------------------
        def ready_report(owner=resident):
            rep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=safety.category_id, current_status_id=2, animal_type="Dog",
                         description="Dog roaming near the gate.", landmark="Gate", latitude=Decimal("14.8"), longitude=Decimal("121.0"))
            db.add(rep)
            db.commit()
            make_warning_ready(db, rep.report_id, owner.user_id, observation_days=3, policy_id="leash")
            db.commit()
            return rep

        def issue(rep, level, tid, owner=resident, overrides=None):
            with patch("app.routes.warnings.dispatch_notification"), patch("app.services.email_templates.render_owner_warning_email", return_value=("S", "B", "<b>B</b>")):
                return warning_routes.issue_warning(
                    warning_in=WarningCreate(user_id=owner.user_id, report_id=rep.report_id, warning_level=level, violation_type="Free-Roaming Unleashed",
                                             description="Dog roaming near the gate again.", policy_id="leash", template_id=tid, field_overrides=overrides),
                    req=_req(), db=db, current_user=leader)

        r1 = ready_report()
        warnings_for = lambda rep: db.query(OwnerWarning).filter(OwnerWarning.report_id == rep.report_id).count()  # noqa: E731
        check("a 2nd Warning in the owner flow is refused until the summons is filled in (the template uses it)",
              refused(lambda: issue(r1, "2nd Warning", tpl["2nd Warning"].template_id), 422, "Summons Date", "Summons Location"))
        check("...and no warning was written (nothing is half-made)", warnings_for(r1) == 0, warnings_for(r1))
        done = issue(r1, "2nd Warning", tpl["2nd Warning"].template_id, overrides={"summons_date": "November 25, 2026 at 4:00 PM", "summons_place": "Subdivision Office"})
        db.commit()
        letter = db.get(GeneratedWarningLetter, done["letter_id"])
        check("...with the summons filled in, it is issued and the letter says it", "November 25, 2026 at 4:00 PM" in letter.rendered_body and "Subdivision Office" in letter.rendered_body and "[missing" not in letter.rendered_body)
        r2 = ready_report()
        first = issue(r2, "1st Warning", tpl["1st Warning"].template_id)
        db.commit()
        check("a 1st Warning needs no summons and is issued", first.get("letter_id") is not None)
        r3 = ready_report()
        n = letters()
        check("a typo'd hand-filled key is refused in the owner flow too (422), nothing written",
              refused(lambda: issue(r3, "1st Warning", tpl["1st Warning"].template_id, overrides={"nonsense": "x"}), 422) and warnings_for(r3) == 0 and letters() == n)
        r4 = ready_report(owner=no_address)
        custom = wl_routes.create_template(body=wl_routes.TemplateCreateIn(name="Needs address", warning_level="1st Warning", subject_template="{{warning_level}}",
                                                                           body_template="Dear {{resident_name}} of {{resident_address}}. {{violation_description}} {{required_action}} {{policy_reference}}"),
                                           req=_req(), db=db, current_user=leader)
        check("a template that uses the address blocks an owner with none on file (no invented address)",
              refused(lambda: issue(r4, "1st Warning", custom["template_id"], owner=no_address), 422, "Resident Address") and warnings_for(r4) == 0)
        filled = issue(r4, "1st Warning", custom["template_id"], owner=no_address, overrides={"resident_address": "Block 7 Lot 2"})
        db.commit()
        check("...and it is issued once the Leader types the address", "Block 7 Lot 2" in db.get(GeneratedWarningLetter, filled["letter_id"]).rendered_body)

        # ---- 6. Complaint flow: preparing a letter ---------------------------------------------------------------------------------
        def complaint_step(respondent):
            crep = Report(user_id=complainant.user_id, subdivision_id=1, category_id=nuisance.category_id, current_status_id=2, animal_type="Dog",
                          description="Barking every night on Pine St.", landmark="Pine St.", latitude=Decimal("14.81"), longitude=Decimal("121.01"))
            db.add(crep)
            db.commit()
            db.refresh(crep)
            C.verify(db, crep, leader, VerifyIn(incident="verified", basis="Witnesses and CCTV.", policy_id="leash"))
            C.responsible(db, crep, leader, ResponsibleIn(mode="user", user_id=respondent.user_id, evidence=["registry", "cctv"], note="Matched resident dog on CCTV."))
            C.offense(db, crep, leader, OffenseIn(decision="counted", expected_number=1))
            db.commit()
            return crep, next(s for s in C.detail(db, crep)["steps"] if s["kind"] == "letter_1")["step_id"]

        crep, step_id = complaint_step(no_address)
        prep = lambda tid, overrides=None: C.step_action(db, crep, leader, step_id, StepActionIn(action="prepare", letter_date=date(2026, 11, 18), template_id=tid, field_overrides=overrides))  # noqa: E731
        check("preparing a complaint letter with a template that needs the address is refused for a respondent with none (422)",
              refused(lambda: prep(custom["template_id"]), 422, "Resident Address"))
        check("...even though the complaint record shows such a respondent's address as \"No address recorded\" (that text is never printed as an address)",
              db.get(ComplaintRespondent, db.get(ComplaintOffense, db.get(EnforcementStep, step_id).offense_id).respondent_id).address == "No address recorded")
        db.expire_all()
        check("...the step is still waiting, and no letter was made", db.get(EnforcementStep, step_id).state == "to_prepare" and db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.report_id == crep.report_id).count() == 0)
        prep(tpl["1st Warning"].template_id)
        db.commit()
        db.expire_all()
        check("preparing with the standard 1st Warning template (no address in it) works for the same respondent", db.get(EnforcementStep, step_id).state == "prepared")

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
