"""
Warning letters, Step 4: rendering consistency (docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md: F-08, F-09).

  1. The text layout rules are shared: the backend gives the same blocks as the screen for the cases in tests/fixtures/
     warning_letter_blocks.json (frontend/tests/warningLetterBlocks.test.mjs runs the same file).
  2. A new letter is shown exactly as written: the author's "TO:", "Address:" and "Issued by:" lines and every line break are kept in
     the HTML, the PDF and the DOCX.
  3. A letter issued before this change looks exactly as it did: only its old header/recipient/signature lines stay hidden.
  4. An issued letter keeps the office details it was issued with, even after the office's details change.

Run from the backend folder:
    python tests/test_warning_rendering.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

import io
import json
import os
import zipfile

from pypdf import PdfReader

from app.database import SessionLocal
from app.models.user import User
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate, WarningLetterTemplateVersion
from app.services import warning_letters as WL
from app.utils import case_policy

PASSED = 0


def check(label: str, cond: bool, info: object = "") -> None:
    global PASSED
    if not cond:
        raise AssertionError(f"[FAIL] {label} {info}")
    PASSED += 1
    print(f"[PASS] {label}")


def pdf_text(letter, db) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(WL.render_letter_pdf(letter, db))).pages)


def as_text(markup: str) -> str:
    """Paragraph ends and line breaks as newlines, tags removed (for the HTML and the DOCX XML)."""
    import html as _html
    import re
    markup = re.sub(r"</w:p>|</p>|</h3>|<w:br\s*/>|<br\s*/?>", "\n", markup)
    return _html.unescape(re.sub(r"<[^>]+>", "", markup))


def docx_text(letter, db) -> str:
    with zipfile.ZipFile(io.BytesIO(WL.render_letter_docx(letter, db))) as z:
        return as_text(z.read("word/document.xml").decode("utf-8"))


def set_office(db, **office) -> None:
    settings = case_policy.load_settings(db, 1)
    for k, v in office.items():
        setattr(settings.office, k, v)
    case_policy.save_settings(db, 1, settings, None)
    db.commit()


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])

        # ---- 1. Shared layout rules -----------------------------------------------------------------------------------------
        fixture = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "warning_letter_blocks.json")
        for case in json.load(open(fixture, encoding="utf-8"))["cases"]:
            got = [{"kind": b["kind"], **({"heading": b["heading"]} if b["kind"] == "section" else {}),
                    "text": b["text"] if b["kind"] == "subject" else "\n".join(b["lines"])} for b in WL.body_blocks(case["body"], legacy=case["legacy"])]
            check(f"same layout as the screen: {case['name']}", got == case["expected"], got)

        # ---- 2. A new letter keeps everything the author wrote ------------------------------------------------------------------
        set_office(db, address="Narra St., Selera Homes", phone="0917 111 1111", email="")
        body = ("Dear {{resident_name}},\n\nTO: The Household of {{resident_name}}\nAddress: Please reply to the office\n\n"
                "Violation Details\n{{violation_description}}\n\nOffice Summons\nPlease come to the office.\nDate and time: {{summons_date}}\nPlace: {{summons_place}}\n\n"
                "{{required_action}} {{policy_reference}}\n\nIssued by:\nThe Pet Committee")
        tpl = WarningLetterTemplate(subdivision_id=1, name="Author's own lines", warning_level=None, status="active", source_type="editor", is_default=False)
        db.add(tpl)
        db.flush()
        ver = WarningLetterTemplateVersion(template_id=tpl.template_id, version_number=1, subject_template="{{warning_level}}: {{policy_reference}}", body_template=body)
        db.add(ver)
        db.flush()
        tpl.current_version_id = ver.version_id
        db.commit()
        letter = WL.create_generated_letter(
            db=db, subdivision_id=1, report=None, owner=None, recipient_name="Juan Dela Cruz", recipient_address="Block 4 Lot 9", pet=None, issuer=leader,
            warning_level="2nd Warning", policy_id=None, policy_reference="Rule 6.3", violation_description="Roaming at night.", required_action="Keep it leashed.",
            template_id=tpl.template_id, overrides={"summons_date": "November 25, 2026 at 4:00 PM", "summons_place": "Subdivision Office"})
        db.commit()
        check("a new letter carries the layout marker (shown exactly as written)", not WL.is_legacy_layout(letter) and WL.serialize_letter(letter, db)["legacy_layout"] is False)
        pdf, docx, html = pdf_text(letter, db), docx_text(letter, db), as_text(letter.rendered_html)
        for label, text in (("HTML", html), ("PDF", pdf), ("DOCX", docx)):
            check(f"{label}: the author's own TO:/Address: lines are kept", "TO: The Household of Juan Dela Cruz" in text and "Address: Please reply to the office" in text)
            check(f"{label}: the author's own signature block is kept", "The Pet Committee" in text)
            lines = [ln.strip() for ln in text.splitlines()]
            check(f"{label}: the summons lines are separate lines, not run together",
                  "Date and time: November 25, 2026 at 4:00 PM" in lines and "Place: Subdivision Office" in lines,
                  [ln for ln in lines if "Place" in ln or "Date and time" in ln])
        check("the preview keeps them too", "TO: The Household" in WL.render_preview("S", "TO: The Household\n\nDear Juan", {})["html"])

        # ---- 3. A letter issued before this change looks as it did ------------------------------------------------------------------
        old_body = ("Selera Homes — Office of the Subdivision Leader\n\nDate Issued: November 17, 2026\nWarning Reference: WARN-2026-0099\n"
                    "Case Reference: SS-2026-0001\n\nTO: Old Resident\nAddress: Block 1 Lot 1\n\nDear Old Resident,\n\nViolation Details:\nRoaming.\n\n"
                    "Issued by:\nLeilah (Subdivision Leader)")
        old = GeneratedWarningLetter(
            warning_reference="WARN-2026-0099", subdivision_id=1, case_reference="SS-2026-0001", recipient_name="Old Resident", recipient_address="Block 1 Lot 1",
            warning_level="1st Warning", template_name="Standard Subdivision Warning Letter", template_version_number=1, rendered_subject="Old letter",
            rendered_body=old_body, rendered_html="<p>stored</p>", issued_by_name="Leilah (Subdivision Leader)",
            placeholders_json={"issue_date": "November 17, 2026", "subdivision_name": "Selera Homes", "subdivision_address": "", "subdivision_phone": "", "subdivision_email": ""})
        db.add(old)
        db.commit()
        old_pdf, old_docx = pdf_text(old, db), docx_text(old, db)
        check("an old letter is recognised as such", WL.is_legacy_layout(old) and WL.serialize_letter(old, db)["legacy_layout"] is True)
        check("old letter PDF: its old 'TO:' line is not printed a second time (the letter prints its own once)", old_pdf.count("Old Resident") >= 1 and old_pdf.count("TO:") == 1, old_pdf.count("TO:"))
        check("old letter PDF: its old header and 'Issued by:' block stay hidden", "Office of the Subdivision Leader" in old_pdf and old_pdf.count("Issued by") == 1)
        check("old letter DOCX: the same", old_docx.count("TO:") == 1 and old_docx.count("Issued by") == 1, (old_docx.count("TO:"), old_docx.count("Issued by")))
        check("old letter: its stored text itself is untouched", db.get(GeneratedWarningLetter, old.letter_id).rendered_body == old_body)

        # ---- 4. The office details are the ones the letter was issued with --------------------------------------------------------
        set_office(db, address="New Office Building", phone="0999 999 9999", email="office@new.example")
        db.expire_all()
        letter = db.get(GeneratedWarningLetter, letter.letter_id)
        ser = WL.serialize_letter(letter, db)
        check("after the office details change, the issued letter still shows the old phone and address",
              ser["subdivision_phone"] == "0917 111 1111" and ser["subdivision_address"] == "Narra St., Selera Homes", (ser["subdivision_phone"], ser["subdivision_address"]))
        check("...and an email that was blank when it was issued stays blank", ser["subdivision_email"] is None, ser["subdivision_email"])
        new_pdf = pdf_text(letter, db)
        check("...in the PDF too", "0917 111 1111" in new_pdf and "0999 999 9999" not in new_pdf and "New Office Building" not in new_pdf)
        old = db.get(GeneratedWarningLetter, old.letter_id)
        old_ser = WL.serialize_letter(old, db)
        check("an old letter issued with no office details does not pick up today's", old_ser["subdivision_phone"] is None and old_ser["subdivision_address"] is None, old_ser)
        very_old = GeneratedWarningLetter(
            warning_reference="WARN-2026-0098", subdivision_id=1, case_reference="SS-2026-0002", recipient_name="Very Old", warning_level="Notice",
            template_name="x", template_version_number=1, rendered_subject="s", rendered_body="Dear Very Old,", rendered_html="<p></p>", issued_by_name="Leilah",
            placeholders_json={"issue_date": "November 1, 2026"})
        db.add(very_old)
        db.commit()
        check("only a very old letter that never stored office details falls back to the current ones",
              WL.serialize_letter(very_old, db)["subdivision_phone"] == "0999 999 9999")

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
