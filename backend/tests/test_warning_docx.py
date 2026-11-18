"""
Warning letters, Step 5: the Word (DOCX) output and import (docs/03-development/audits/WARNING_TEMPLATE_AUDIT_2026-11-18.md: F-05, E1, E2).

  1. Filling placeholders edits ONLY the text inside <w:t>: every other byte of the Word file is kept (namespaces, mc:Ignorable,
     styles, tables, pictures), so Word opens it cleanly. Each run keeps its formatting; split placeholders, line breaks and & are right.
  2. Tables, headers and footers are filled too; nothing is swallowed: a part that cannot be filled gives an error, and a file that
     would still contain an unfilled {{placeholder}} is refused (422) instead of downloaded.
  3. Import is safe: DOCTYPE/ENTITY declarations, too many parts and oversized parts are refused.
  4. Import reads the structure: header/footer kept apart, tables as "cell | cell" lines, plain notes on what the preview cannot show,
     and an unsupported placeholder anywhere (header included) is refused by name.

Run from the backend folder:
    python tests/test_warning_docx.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

import asyncio
import io
import re
import zipfile
from types import SimpleNamespace
from xml.etree import ElementTree as ET

from fastapi import HTTPException

from app.database import SessionLocal
from app.models.user import User
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate, WarningLetterTemplateVersion
from app.routes import warning_letters as wl_routes
from app.services import warning_letters as WL

PASSED = 0
NS = ('xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14 wp14"')


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


def skeleton(xml: str) -> str:
    """The markup without the text of <w:t> elements (and the line breaks the fill adds): what must stay byte-for-byte the same."""
    xml = re.sub(r'</w:t><w:br/><w:t xml:space="preserve">', "", xml)
    xml = re.sub(r'<w:t( xml:space="preserve")?>[^<]*</w:t>', "<w:t/>", xml)
    return xml


def part(body: str, root: str = "w:document", inner: str = "w:body") -> bytes:
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><{root} {NS}><{inner}>{body}</{inner}></{root}>'.encode()


def docx(document: bytes, extra: dict = None) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        z.writestr("word/document.xml", document)
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return out.getvalue()


def _req():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={}, state=SimpleNamespace())


class _Upload:
    def __init__(self, filename, data):
        self.filename, self.content_type, self._data = filename, "application/octet-stream", data

    async def read(self):
        return self._data


def main() -> None:
    seed = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed["leader"])

        # ---- 1. In-place filling ----------------------------------------------------------------------------------------------
        src = part('<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Dear </w:t></w:r>'
                   '<w:r><w:t>{{resi</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>dent_name}},</w:t></w:r><w:r><w:tab/></w:r></w:p>'
                   '<w:p><w:r><w:t>Details: {{violation_description}} &amp; more</w:t></w:r></w:p><w:p/>'
                   '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>')
        out, left = WL._replace_placeholders_in_xml_bytes(src, {"resident_name": "Juan & Ana <Cruz>", "violation_description": "Line one\nLine two"})
        text = out.decode()
        check("everything outside the text is byte-for-byte the same (namespaces, mc:Ignorable, styles, tab, page size)", skeleton(text) == skeleton(src.decode()),
              (skeleton(text)[:300], skeleton(src.decode())[:300]))
        check("the Word namespace declarations and mc:Ignorable are kept (no 'unreadable content')", 'xmlns:w14=' in text and 'mc:Ignorable="w14 wp14"' in text and "ns0:" not in text and "ns1:" not in text)
        check("the bold 'Dear ' stays bold and alone; the name goes into its own run", '<w:b/></w:rPr><w:t xml:space="preserve">Dear </w:t>' in text and "Juan &amp; Ana &lt;Cruz&gt;</w:t>" in text)
        check("a placeholder Word split over runs is filled, the rest of the last run is kept", re.search(r"<w:i/></w:rPr><w:t xml:space=\"preserve\">,</w:t>", text) is not None, text)
        check("a value with line breaks becomes real Word line breaks", 'Details: Line one</w:t><w:br/><w:t xml:space="preserve">Line two &amp; more</w:t>' in text)
        check("nothing was left unfilled", left == [])
        check("the result is well-formed XML", ET.fromstring(out) is not None)
        out2, left2 = WL._replace_placeholders_in_xml_bytes(part("<w:p><w:r><w:t>See {{owner_phone}}</w:t></w:r></w:p>"), {"resident_name": "x"})
        check("a placeholder with no value is left as it is and reported", "{{owner_phone}}" in out2.decode() and left2 == ["owner_phone"])

        # ---- 2. The letter's Word file: tables, header, footer; errors are not swallowed --------------------------------------------
        doc = part('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Notice to {{resident_name}}</w:t></w:r></w:p>'
                   '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Pet</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{pet_name}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
                   '<w:p><w:r><w:t>{{violation_description}}</w:t></w:r></w:p>')
        header = part('<w:p><w:r><w:t>{{subdivision_name}} Office</w:t></w:r></w:p>', root="w:hdr", inner="w:sdtContent").replace(b"<w:sdtContent>", b"").replace(b"</w:sdtContent>", b"")
        footer = part('<w:p><w:r><w:t>Ref {{warning_reference}}</w:t></w:r></w:p>', root="w:ftr", inner="w:sdtContent").replace(b"<w:sdtContent>", b"").replace(b"</w:sdtContent>", b"")
        logo = b"\x89PNG\r\n\x1a\nLOGO-BYTES"
        styles = b'<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Normal"/></w:styles>'
        package = docx(doc, {"word/header1.xml": header, "word/footer1.xml": footer, "word/media/image1.png": logo, "word/styles.xml": styles})

        tpl = WarningLetterTemplate(subdivision_id=1, name="Word letter", status="active", source_type="docx_import", is_default=False)
        db.add(tpl)
        db.flush()
        ver = WarningLetterTemplateVersion(template_id=tpl.template_id, version_number=1, subject_template="Notice", body_template="x", source_docx_bytes=package)
        db.add(ver)
        db.flush()
        values = {"resident_name": "Juan", "pet_name": "Bantay", "violation_description": "Roaming\nat night", "subdivision_name": "Selera Homes", "warning_reference": "WARN-2026-0101"}
        letter = GeneratedWarningLetter(warning_reference="WARN-2026-0101", subdivision_id=1, case_reference="SS-2026-0001", recipient_name="Juan", warning_level="1st Warning",
                                        template_id=tpl.template_id, template_name=tpl.name, template_version_id=ver.version_id, template_version_number=1,
                                        rendered_subject="Notice", rendered_body="Dear Juan", rendered_html="<p/>", issued_by_name="Leilah", placeholders_json=values)
        db.add(letter)
        db.commit()
        made = WL.render_letter_docx(letter, db)
        with zipfile.ZipFile(io.BytesIO(made)) as z:
            names = z.namelist()
            d, h, f = (z.read(n).decode() for n in ("word/document.xml", "word/header1.xml", "word/footer1.xml"))
            check("the table cell is filled", "<w:t xml:space=\"preserve\">Bantay</w:t>" in d)
            check("the header and footer are filled", "Selera Homes Office" in h and "Ref WARN-2026-0101" in f)
            check("the picture and the styles are kept byte-for-byte", z.read("word/media/image1.png") == logo and z.read("word/styles.xml") == styles)
            check("every part of the original is still there", sorted(names) == sorted(zipfile.ZipFile(io.BytesIO(package)).namelist()))
            check("every XML part is still well-formed", all(ET.fromstring(z.read(n)) is not None for n in names if n.endswith(".xml")))
        check("the bold heading run keeps its bold", "<w:b/></w:rPr><w:t xml:space=\"preserve\">Notice to Juan</w:t>" in d)

        values_missing = {k: v for k, v in values.items() if k != "pet_name"}
        letter.placeholders_json = values_missing
        db.commit()
        check("a Word file that would still contain an unfilled {{placeholder}} is refused (422), naming it", refused(lambda: WL.render_letter_docx(letter, db), 422, "{{pet_name}}", "pdf"))
        broken = docx(b'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{resident_name}}</w:r></w:p></w:body></w:document>')
        ver2 = WarningLetterTemplateVersion(template_id=tpl.template_id, version_number=2, subject_template="N", body_template="x", source_docx_bytes=broken)
        db.add(ver2)
        db.flush()
        letter.template_version_id, letter.placeholders_json = ver2.version_id, values
        db.commit()
        check("a part that cannot be filled gives an error (500) with the reason, never a silent half-filled file", refused(lambda: WL.render_letter_docx(letter, db), 500, "could not be made"))

        # ---- 3. Import safety ---------------------------------------------------------------------------------------------------------
        doctype = docx(b'<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "AAAA">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&a;</w:t></w:r></w:p></w:body></w:document>')
        check("a Word file with a DOCTYPE/ENTITY declaration is refused (400)", refused(lambda: WL.parse_docx_bytes(doctype), 400, "DOCTYPE"))
        entity_rels = docx(part("<w:p><w:r><w:t>Hi</w:t></w:r></w:p>"), {"word/_rels/document.xml.rels": b'<?xml version="1.0"?><!ENTITY x "y"><Relationships/>'})
        check("...also when it hides in another part", refused(lambda: WL.parse_docx_bytes(entity_rels), 400))
        old_part, old_entries = WL.DOCX_MAX_PART_BYTES, WL.DOCX_MAX_ENTRIES
        try:
            WL.DOCX_MAX_PART_BYTES = 2000
            big = docx(part("<w:p><w:r><w:t>" + "A" * 5000 + "</w:t></w:r></w:p>"))
            check("a part that is too large once unpacked is refused (413), read with a hard limit", refused(lambda: WL.parse_docx_bytes(big), 413, "too large"))
            WL.DOCX_MAX_PART_BYTES = old_part
            WL.DOCX_MAX_ENTRIES = 3
            many = docx(part("<w:p><w:r><w:t>Hi</w:t></w:r></w:p>"), {f"word/x{i}.xml": b"<x/>" for i in range(5)})
            check("a file with too many parts is refused (413)", refused(lambda: WL.parse_docx_bytes(many), 413))
        finally:
            WL.DOCX_MAX_PART_BYTES, WL.DOCX_MAX_ENTRIES = old_part, old_entries
        check("a file that is not a ZIP is refused (400)", refused(lambda: WL.parse_docx_bytes(b"not a docx"), 400))

        # ---- 4. Import reads the structure ------------------------------------------------------------------------------------------
        imported_doc = part('<w:p><w:r><w:t>Notice of Warning</w:t></w:r></w:p><w:p><w:r><w:t>Dear {{resident_name}},</w:t></w:r></w:p>'
                            '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Pet</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{pet_name}}</w:t></w:r></w:p></w:tc></w:tr>'
                            '<w:tr><w:tc><w:p><w:r><w:t>Policy</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{policy_reference}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
                            '<w:p><w:r><w:t>{{violation_description}} {{required_action}}</w:t></w:r></w:p>')
        good = docx(imported_doc, {"word/header1.xml": header, "word/footer1.xml": footer, "word/media/image1.png": logo})
        parsed = WL.parse_docx_bytes(good)
        check("the header and footer are not mixed into the letter body", "Office" not in parsed["body_template"] and "Ref " not in parsed["body_template"], parsed["body_template"])
        check("...but their placeholders are known", {"subdivision_name", "warning_reference"} <= set(parsed["placeholders_used"]), parsed["placeholders_used"])
        check("a table becomes one line per row ('cell | cell')", "Pet | {{pet_name}}\nPolicy | {{policy_reference}}" in parsed["body_template"], parsed["body_template"])
        notes = " ".join(parsed["notes"])
        check("the import notes say where the subject came from and what the preview cannot show",
              "Notice of Warning" in notes and "table" in notes and "picture" in notes and "header and footer" in notes, parsed["notes"])
        res = asyncio.run(wl_routes.import_docx_template(req=_req(), file=_Upload("letter.docx", good), name="Imported letter", description=None, warning_level=None,
                                                         is_default=False, template_id=None, change_note=None, subdivision_id=None, db=db, current_user=leader))
        check("the import answer carries the notes for the screen", res.get("import_notes") == parsed["notes"])
        check("the original Word file is stored as uploaded", db.get(WarningLetterTemplateVersion, res["current_version_id"]).source_docx_bytes == good)
        bad_header = docx(imported_doc, {"word/header1.xml": part('<w:p><w:r><w:t>{{office_hours}}</w:t></w:r></w:p>', root="w:hdr", inner="w:sdtContent").replace(b"<w:sdtContent>", b"").replace(b"</w:sdtContent>", b"")})
        n = db.query(WarningLetterTemplate).count()
        check("an unsupported placeholder in the header is refused by name (422), nothing imported",
              refused(lambda: asyncio.run(wl_routes.import_docx_template(req=_req(), file=_Upload("bad.docx", bad_header), name="Bad", description=None, warning_level=None,
                                                                         is_default=False, template_id=None, change_note=None, subdivision_id=None, db=db, current_user=leader)),
                      422, "{{office_hours}}") and db.query(WarningLetterTemplate).count() == n)

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
