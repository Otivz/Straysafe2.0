"""
Dynamic Warning Letter Template Management, DOCX import/export, PDF generation,
placeholder validation, immutable letter snapshots, and resident notification tracking.
"""
from __future__ import annotations

import html
import io
import os
import re
import textwrap
import zipfile
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple
from xml.etree import ElementTree as ET

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import Subdivision, User
from app.models.warning import OwnerWarning
from app.models.warning_letter import (
    GeneratedWarningLetter,
    WarningLetterTemplate,
    WarningLetterTemplateVersion,
)
from app.services import email_templates
from app.utils import case_policy
from app.utils.audit import log_activity
from app.utils.notification_dispatcher import dispatch_notification

PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")

# Canonical placeholders required by Module 3 + helpful case extras
PLACEHOLDER_DEFINITIONS: List[Dict[str, Any]] = [
    {"key": "resident_name", "label": "Resident Name", "required": True, "example": "Juan Dela Cruz", "description": "Full name of the responsible resident or pet owner."},
    {"key": "resident_address", "label": "Resident Address", "required": True, "example": "Block 3 Lot 8, Narra St.", "description": "House address or unit of the resident."},
    {"key": "pet_name", "label": "Pet Name", "required": False, "example": "Bantay", "description": "Name of the registered pet involved (if registered)."},
    {"key": "pet_type", "label": "Pet Type / Species", "required": True, "example": "Dog", "description": "Species of the animal (Dog, Cat, etc.)."},
    {"key": "case_reference", "label": "Case Reference", "required": True, "example": "SS-2026-0023", "description": "Official case reference number."},
    {"key": "warning_reference", "label": "Warning Reference", "required": True, "example": "WARN-2026-0001", "description": "Unique reference number of this issued warning."},
    {"key": "warning_level", "label": "Warning Level", "required": True, "example": "1st Warning", "description": "Notice, 1st Warning, 2nd Warning, or Final Notice / Escalation."},
    {"key": "violation_description", "label": "Violation Description", "required": True, "example": "Pet was seen roaming unleashed in common areas.", "description": "Factual description of the verified violation."},
    {"key": "incident_date", "label": "Incident Date", "required": True, "example": "November 17, 2026 at 2:13 PM", "description": "Date and time when the incident occurred."},
    {"key": "issue_date", "label": "Date Issued", "required": True, "example": "November 17, 2026", "description": "Date when the warning letter is issued."},
    {"key": "required_action", "label": "Required Action", "required": True, "example": "Keep your pet inside your property or on a leash when outside.", "description": "Corrective action required from the resident."},
    {"key": "policy_reference", "label": "Policy Reference", "required": True, "example": "House Rules §6.3 — Free-Roaming Pets", "description": "Subdivision rule or policy reference broken."},
    {"key": "issued_by", "label": "Issued By", "required": True, "example": "Maria Santos (Subdivision Leader)", "description": "Name and role of the issuing Subdivision Leader."},
    {"key": "subdivision_name", "label": "Subdivision Name", "required": False, "example": "Selera Homes", "description": "Name of the subdivision."},
    {"key": "observation_days", "label": "Observation Period", "required": False, "example": "3 days", "description": "Monitoring period defined by the policy (if applicable)."},
    {"key": "summons_date", "label": "Summons Date & Time", "required": False, "example": "November 22, 2026 at 4:00 PM", "description": "Scheduled subdivision office meeting date (for 2nd Warning)."},
    {"key": "summons_place", "label": "Summons Location", "required": False, "example": "Subdivision Office", "description": "Venue for the office summons."},
]

PLACEHOLDER_LABELS: Dict[str, str] = {p["key"]: p["label"] for p in PLACEHOLDER_DEFINITIONS}
PLACEHOLDER_REQUIRED: Dict[str, bool] = {p["key"]: bool(p["required"]) for p in PLACEHOLDER_DEFINITIONS}

DEFAULT_STANDARD_SUBJECT = "Official {{warning_level}} Regarding {{policy_reference}}"
DEFAULT_STANDARD_BODY = """SUBJECT: Official {{warning_level}} Regarding {{policy_reference}}

Dear {{resident_name}},

This official {{warning_level}} is issued regarding an animal incident recorded under {{case_reference}} on {{incident_date}} involving {{pet_name}} ({{pet_type}}).

Violation Details
{{violation_description}}

Applicable Subdivision Policy
{{policy_reference}}

Required Corrective Action
{{required_action}}

Please address this matter promptly. Failure to comply or repeated violations may result in further escalation in accordance with subdivision rules and local ordinances."""

DEFAULT_SUMMONS_SUBJECT = "Official {{warning_level}} and Notice of Office Summons — {{policy_reference}}"
DEFAULT_SUMMONS_BODY = """SUBJECT: Official {{warning_level}} and Notice of Office Summons — {{policy_reference}}

Dear {{resident_name}},

Following our previous notice, this {{warning_level}} is issued in connection with {{case_reference}} on {{incident_date}} involving {{pet_name}} ({{pet_type}}).

Violation Details
{{violation_description}}

Applicable Subdivision Policy
{{policy_reference}}

Required Corrective Action
{{required_action}}

You are requested to appear at {{summons_place}} on {{summons_date}} to discuss compliance and prevent further escalation to the Barangay."""


def case_ref_for(report: Optional[Report], report_id: Optional[int] = None) -> str:
    rid = report.report_id if report is not None else report_id
    if not rid:
        return "Unlinked Case"
    year = report.created_at.year if (report is not None and report.created_at) else datetime.now().year
    return f"SS-{year}-{int(rid):04d}"


def warning_ref_for(letter_id: int, issued_at: Optional[datetime] = None) -> str:
    year = (issued_at or datetime.now()).year
    return f"WARN-{year}-{int(letter_id):04d}"


def extract_placeholders(subject: str, body: str) -> List[str]:
    seen: List[str] = []
    for text in (subject or "", body or ""):
        for match in PLACEHOLDER_PATTERN.findall(text):
            if match not in seen:
                seen.append(match)
    return seen


_SECTION_TITLES = {
    "violation details",
    "applicable subdivision policy",
    "applicable policy",
    "required corrective action",
    "required action & summons schedule",
}


def _strip_legacy_chrome(body: str) -> List[str]:
    """Normalize letter body paragraphs, stripping legacy top/bottom boilerplate if present."""
    raw_paras = [p.strip() for p in (body or "").replace("\r\n", "\n").split("\n\n") if p.strip()]
    cleaned: List[str] = []
    for p in raw_paras:
        lines = [ln.strip() for ln in p.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0]
        if first.endswith("Office of the Subdivision Leader"):
            continue
        if all(
            ln.startswith(("Date Issued:", "Warning Reference:", "Case Reference:", "TO:", "Address:"))
            for ln in lines
        ):
            continue
        if first == "Issued by:" and len(lines) <= 4:
            continue
        cleaned.append("\n".join(lines))
    return cleaned


def _office_contact_lines(db: Optional[Session], subdivision_id: Optional[int], ph: Dict[str, Any]) -> Tuple[str, Optional[str], Optional[str]]:
    sub_name = str(ph.get("subdivision_name") or "").strip()
    sub_addr = str(ph.get("subdivision_address") or "").strip()
    sub_phone = str(ph.get("subdivision_phone") or "").strip()
    sub_email = str(ph.get("subdivision_email") or "").strip()
    if db is not None and subdivision_id:
        if not sub_name:
            sub = db.get(Subdivision, subdivision_id)
            if sub:
                sub_name = sub.subdivision_name
        if not (sub_addr or sub_phone or sub_email):
            office = case_policy.load_settings(db, subdivision_id).office
            sub_addr = (office.address or "").strip()
            sub_phone = (office.phone or "").strip()
            sub_email = (office.email or "").strip()
    contact_parts = [x for x in (sub_phone, sub_email) if x]
    return (sub_name or "StraySafe Subdivision"), (sub_addr or None), (" · ".join(contact_parts) if contact_parts else None)


def render_html_document(
    subject: str,
    body: str,
    warning_reference: str,
    case_reference: str,
    subdivision_name: str = "StraySafe Subdivision",
) -> str:
    safe_sub = html.escape(subdivision_name or "StraySafe Subdivision")
    safe_subj = html.escape(subject or "Official Warning Letter")
    safe_wref = html.escape(warning_reference)
    safe_cref = html.escape(case_reference)
    blocks = []
    for para in _strip_legacy_chrome(body):
        lines = [html.escape(line.rstrip()) for line in para.split("\n") if line.strip() != ""]
        if lines:
            blocks.append(f"<p>{'<br/>'.join(lines)}</p>")
    body_html = "\n".join(blocks)
    return f"""<div class="ss-warning-letter">
  <div class="ss-warning-letter__header">
    <div>
      <div class="ss-warning-letter__org">{safe_sub}</div>
      <div class="ss-warning-letter__sub">Office of the Subdivision Leader</div>
    </div>
    <div class="ss-warning-letter__refs">
      <span><strong>Warning Reference:</strong> {safe_wref}</span>
      <span><strong>Case Reference:</strong> {safe_cref}</span>
    </div>
  </div>
  <h2 class="ss-warning-letter__subject">{safe_subj}</h2>
  <div class="ss-warning-letter__body">{body_html}</div>
</div>"""


def substitute_placeholders(template_text: str, values: Dict[str, str]) -> str:
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        val = values.get(key)
        return val if val is not None else ""
    return PLACEHOLDER_PATTERN.sub(_replace, template_text or "")


# ---------------------------------------------------------------------------
# DOCX import & export (pure stdlib zipfile + ElementTree — zero new deps)
# ---------------------------------------------------------------------------
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"


def _local_tag(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def parse_docx_bytes(raw: bytes) -> Dict[str, Any]:
    """Extract readable paragraphs, basic HTML, and {{placeholders}} from an uploaded .docx file."""
    if not raw or not raw.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Invalid DOCX file. Please upload a valid Microsoft Word (.docx) document.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Could not read DOCX archive. Ensure the file is a valid .docx.") from exc

    with zf:
        if "word/document.xml" not in zf.namelist():
            raise HTTPException(status_code=400, detail="The uploaded DOCX file does not contain word/document.xml.")
        xml_parts: List[bytes] = []
        for name in sorted(zf.namelist()):
            if name.startswith("word/header") and name.endswith(".xml"):
                xml_parts.append(zf.read(name))
        xml_parts.append(zf.read("word/document.xml"))
        for name in sorted(zf.namelist()):
            if name.startswith("word/footer") and name.endswith(".xml"):
                xml_parts.append(zf.read(name))

    paragraphs: List[str] = []
    html_parts: List[str] = []
    for part in xml_parts:
        try:
            root = ET.fromstring(part)
        except ET.ParseError as exc:
            raise HTTPException(status_code=400, detail="Malformed XML inside the uploaded DOCX file.") from exc
        for p in root.iter():
            if _local_tag(p.tag) != "p":
                continue
            buf: List[str] = []
            is_bold = False
            for node in p.iter():
                lt = _local_tag(node.tag)
                if lt == "t" and node.text:
                    buf.append(node.text)
                elif lt == "tab":
                    buf.append("    ")
                elif lt in ("br", "cr"):
                    buf.append("\n")
                elif lt == "b":
                    val = node.attrib.get(f"{{{W_NS}}}val", "true").lower()
                    if val not in ("0", "false", "off"):
                        is_bold = True
            line = "".join(buf).strip()
            if not line:
                continue
            paragraphs.append(line)
            escaped = html.escape(line).replace("\n", "<br/>")
            html_parts.append(f"<p><strong>{escaped}</strong></p>" if is_bold and len(line) < 120 else f"<p>{escaped}</p>")

    if not paragraphs:
        raise HTTPException(status_code=400, detail="The uploaded DOCX file appears to be empty.")

    body_text = "\n\n".join(paragraphs)
    subject_guess = paragraphs[0][:255] if paragraphs else "{{warning_level}} ({{warning_reference}})"
    if len(paragraphs) > 1:
        for cand in paragraphs[:5]:
            if "subject" in cand.lower() or "warning" in cand.lower() or "notice" in cand.lower():
                subject_guess = cand[:255]
                break
    placeholders = extract_placeholders(subject_guess, body_text)
    return {
        "subject_template": subject_guess,
        "body_template": body_text,
        "html_template": "\n".join(html_parts),
        "placeholders_used": placeholders,
    }


def _replace_placeholders_in_xml_bytes(xml_bytes: bytes, values: Dict[str, str]) -> bytes:
    """
    Replace {{placeholder}} tokens inside a DOCX XML part, handling cases where Microsoft Word
    splits a single {{placeholder}} across multiple consecutive <w:r><w:t> runs.
    """
    ET.register_namespace("w", W_NS)
    root = ET.fromstring(xml_bytes)
    for p in root.iter():
        if _local_tag(p.tag) != "p":
            continue
        t_nodes = [n for n in p.iter() if _local_tag(n.tag) == "t"]
        if not t_nodes:
            continue
        joined = "".join(n.text or "" for n in t_nodes)
        if "{{" not in joined:
            continue
        replaced = substitute_placeholders(joined, values)
        if replaced != joined:
            t_nodes[0].text = replaced
            t_nodes[0].set(f"{{{XML_NS}}}space", "preserve")
            for extra in t_nodes[1:]:
                extra.text = ""
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _issuer_lines(letter: GeneratedWarningLetter, sub_name: str) -> Tuple[str, str, str]:
    ph = letter.placeholders_json or {}
    raw_name = str(ph.get("issuer_name") or "").strip()
    raw_role = str(ph.get("issuer_role") or "").strip()
    if raw_name:
        return raw_name, raw_role or "Subdivision Leader", sub_name
    issued_str = (letter.issued_by_name or "Subdivision Leader").strip()
    if "(" in issued_str and issued_str.endswith(")"):
        name_part, role_part = issued_str.rsplit("(", 1)
        return name_part.strip() or issued_str, role_part[:-1].strip() or "Subdivision Leader", sub_name
    return issued_str, raw_role or "Subdivision Leader", sub_name


def _build_minimal_docx(letter: GeneratedWarningLetter, db: Optional[Session] = None) -> bytes:
    """Create a formal A4 portrait .docx archive with letterhead, warning header, recipient, body, and signature."""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    def _p_xml(
        text: str,
        *,
        bold: bool = False,
        size_half_pt: int = 21,
        align: str = "left",
        space_before: int = 0,
        space_after: int = 120,
        bottom_border: bool = False,
        color: str = "1E293B",
    ) -> str:
        lines = (text or "").replace("\r\n", "\n").split("\n")
        runs = []
        rpr = f"<w:rPr>{'<w:b/>' if bold else ''}<w:color w:val=\"{color}\"/><w:sz w:val=\"{size_half_pt}\"/></w:rPr>"
        for idx, line in enumerate(lines):
            if idx > 0:
                runs.append("<w:r><w:br/></w:r>")
            runs.append(f"<w:r>{rpr}<w:t xml:space=\"preserve\">{html.escape(line)}</w:t></w:r>")
        jc = f"<w:jc w:val=\"{align}\"/>" if align != "left" else ""
        pbdr = '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="D6D0C4"/></w:pBdr>' if bottom_border else ""
        return f"<w:p><w:pPr>{jc}{pbdr}<w:spacing w:before=\"{space_before}\" w:after=\"{space_after}\" w:line=\"276\" w:lineRule=\"auto\"/></w:pPr>{''.join(runs)}</w:p>"

    def _label_p(label: str, value: str, *, space_after: int = 100) -> str:
        rpr_b = '<w:rPr><w:b/><w:color w:val="1E293B"/><w:sz w:val="21"/></w:rPr>'
        rpr_n = '<w:rPr><w:color w:val="1E293B"/><w:sz w:val="21"/></w:rPr>'
        return (
            f'<w:p><w:pPr><w:spacing w:after="{space_after}" w:line="276" w:lineRule="auto"/></w:pPr>'
            f'<w:r>{rpr_b}<w:t xml:space="preserve">{html.escape(label)} </w:t></w:r>'
            f'<w:r>{rpr_n}<w:t xml:space="preserve">{html.escape(value)}</w:t></w:r></w:p>'
        )

    ph = letter.placeholders_json or {}
    sub_name, sub_addr, sub_contact = _office_contact_lines(db, letter.subdivision_id, ph)
    issue_date_str = str(ph.get("issue_date") or "").strip() or _fmt_date(letter.issued_at or datetime.now(), with_time=False)
    issuer_name, issuer_role, _ = _issuer_lines(letter, sub_name)

    paras: List[str] = [
        _p_xml(sub_name, bold=True, size_half_pt=28, align="center", space_after=40, color="0F172A"),
        _p_xml("Office of the Subdivision Leader", bold=False, size_half_pt=21, align="center", space_after=40 if (sub_addr or sub_contact) else 140, bottom_border=not (sub_addr or sub_contact), color="475569"),
    ]
    if sub_addr or sub_contact:
        contact_text = "\n".join(x for x in (sub_addr, sub_contact) if x)
        paras.append(_p_xml(contact_text, bold=False, size_half_pt=18, align="center", space_after=140, bottom_border=True, color="64748B"))

    paras.append(_p_xml("PET POLICY VIOLATION NOTICE", bold=True, size_half_pt=26, align="center", space_before=100, space_after=40, color="0F172A"))
    paras.append(_p_xml(letter.warning_level, bold=True, size_half_pt=22, align="center", space_after=140, color="B45309"))
    paras.append(_p_xml(
        f"Warning Reference: {letter.warning_reference}   |   Case Reference: {letter.case_reference}   |   Date Issued: {issue_date_str}",
        bold=False, size_half_pt=19, align="center", space_after=180, bottom_border=True, color="334155",
    ))

    paras.append(_label_p("TO:", letter.recipient_name, space_after=60))
    if letter.recipient_address:
        paras.append(_label_p("Address:", letter.recipient_address, space_after=180))

    body_paras = _strip_legacy_chrome(letter.rendered_body)
    has_subject_in_body = any(p.upper().startswith("SUBJECT:") for p in body_paras[:2])
    if not has_subject_in_body and letter.rendered_subject:
        paras.append(_label_p("SUBJECT:", letter.rendered_subject, space_after=160))

    for block in body_paras:
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0]
        if first.upper().startswith("SUBJECT:"):
            subj_val = first.split(":", 1)[1].strip()
            paras.append(_label_p("SUBJECT:", subj_val, space_after=160))
            if len(lines) > 1:
                paras.append(_p_xml("\n".join(lines[1:]), space_after=140))
            continue
        heading_key = first.rstrip(":").strip().lower()
        if heading_key in _SECTION_TITLES or (first.endswith(":") and len(first) <= 48 and len(lines) > 1):
            paras.append(_p_xml(first.rstrip(":"), bold=True, size_half_pt=21, space_before=100, space_after=60, color="0F172A"))
            if len(lines) > 1:
                paras.append(_p_xml("\n".join(lines[1:]), space_after=140))
        elif heading_key in _SECTION_TITLES or (len(lines) == 1 and first.endswith(":") and len(first) <= 48):
            paras.append(_p_xml(first.rstrip(":"), bold=True, size_half_pt=21, space_before=100, space_after=60, color="0F172A"))
        else:
            paras.append(_p_xml("\n".join(lines), space_after=140))

    paras.append(_p_xml("Issued by:", bold=True, size_half_pt=20, space_before=240, space_after=480, color="334155"))
    paras.append(_p_xml(f"{issuer_name}\n{issuer_role}\n{sub_name}", bold=False, size_half_pt=21, space_after=120, color="0F172A"))

    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(paras)}"
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247"/></w:sectPr>'
        "</w:body></w:document>"
    )
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types.encode("utf-8"))
        zf.writestr("_rels/.rels", rels.encode("utf-8"))
        zf.writestr("word/document.xml", doc_xml.encode("utf-8"))
    return out.getvalue()


def render_letter_docx(letter: GeneratedWarningLetter, db: Session) -> bytes:
    values: Dict[str, str] = {k: str(v or "") for k, v in (letter.placeholders_json or {}).items()}
    if letter.template_version_id:
        ver = db.get(WarningLetterTemplateVersion, letter.template_version_id)
        if ver is not None and ver.source_docx_bytes:
            src = io.BytesIO(ver.source_docx_bytes)
            dst = io.BytesIO()
            with zipfile.ZipFile(src, "r") as zin, zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename == "word/document.xml" or (
                        item.filename.startswith(("word/header", "word/footer")) and item.filename.endswith(".xml")
                    ):
                        try:
                            data = _replace_placeholders_in_xml_bytes(data, values)
                        except Exception:
                            pass
                    zout.writestr(item, data)
            return dst.getvalue()
    return _build_minimal_docx(letter, db)


# ---------------------------------------------------------------------------
# Pure-Python multi-page A4 PDF Generator (selectable Helvetica Type1 text)
# ---------------------------------------------------------------------------
def _pdf_escape(text: str) -> str:
    # Normalize common Unicode punctuation to WinAnsi Latin-1 safely
    replacements = {
        "\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2022": "*", "\u2026": "...", "\u00a0": " ",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    safe = text.encode("latin-1", "replace").decode("latin-1")
    return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _est_text_w(text: str, size: int, bold: bool = False) -> float:
    narrow = set("iIljtf.,;:'\"!| ")
    wide = set("MWmwGOQD@")
    units = sum(0.32 if ch in narrow else (0.78 if ch in wide else 0.54) for ch in text)
    return units * size * (1.05 if bold else 1.0)


def render_letter_pdf(letter: GeneratedWarningLetter, db: Optional[Session] = None) -> bytes:
    """Render an immutable GeneratedWarningLetter into a formal A4 portrait PDF document."""
    page_w, page_h = 595, 842
    margin_x = 62  # ~22mm A4 margins
    content_w = page_w - 2 * margin_x
    top_y = 780
    bottom_y = 64
    max_chars = 84

    ph = letter.placeholders_json or {}
    sub_name, sub_addr, sub_contact = _office_contact_lines(db, letter.subdivision_id, ph)
    issue_date_str = str(ph.get("issue_date") or "").strip() or _fmt_date(letter.issued_at or datetime.now(), with_time=False)
    issuer_name, issuer_role, _ = _issuer_lines(letter, sub_name)

    # Operations: ("text", font, text, size, leading, align) or ("rule", "", "", 0, leading, "") or ("gap", "", "", 0, leading, "")
    ops: List[Tuple[str, str, str, int, int, str]] = []

    # Letterhead
    ops.append(("text", "/F2", sub_name, 14, 18, "center"))
    ops.append(("text", "/F1", "Office of the Subdivision Leader", 10, 14, "center"))
    if sub_addr:
        for wline in textwrap.wrap(sub_addr, width=76) or [""]:
            ops.append(("text", "/F1", wline, 9, 12, "center"))
    if sub_contact:
        ops.append(("text", "/F1", sub_contact, 9, 12, "center"))
    ops.append(("gap", "", "", 0, 6, ""))
    ops.append(("rule", "", "", 0, 14, ""))

    # Warning Document Header
    ops.append(("text", "/F2", "PET POLICY VIOLATION NOTICE", 13, 18, "center"))
    ops.append(("text", "/F2", letter.warning_level, 11, 16, "center"))
    ops.append(("gap", "", "", 0, 4, ""))
    ops.append(("text", "/F1", f"Warning Reference: {letter.warning_reference}   |   Case Reference: {letter.case_reference}   |   Date Issued: {issue_date_str}", 9, 14, "center"))
    ops.append(("rule", "", "", 0, 14, ""))

    # Recipient block
    ops.append(("text", "/F2", f"TO: {letter.recipient_name}", 10, 15, "left"))
    if letter.recipient_address:
        addr_lines = textwrap.wrap(f"Address: {letter.recipient_address}", width=max_chars) or [""]
        for idx, al in enumerate(addr_lines):
            ops.append(("text", "/F1", al, 10, 14 if idx < len(addr_lines) - 1 else 18, "left"))
    else:
        ops.append(("gap", "", "", 0, 8, ""))

    # Letter body sections
    body_paras = _strip_legacy_chrome(letter.rendered_body)
    has_subject_in_body = any(p.upper().startswith("SUBJECT:") for p in body_paras[:2])
    if not has_subject_in_body and letter.rendered_subject:
        for wline in textwrap.wrap(f"SUBJECT: {letter.rendered_subject}", width=max_chars - 4) or [""]:
            ops.append(("text", "/F2", wline, 10, 15, "left"))
        ops.append(("gap", "", "", 0, 8, ""))

    for para in body_paras:
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0]
        if first.upper().startswith("SUBJECT:"):
            for wline in textwrap.wrap(first, width=max_chars - 4) or [""]:
                ops.append(("text", "/F2", wline, 10, 15, "left"))
            ops.append(("gap", "", "", 0, 6, ""))
            lines = lines[1:]
            if not lines:
                continue
        heading_key = first.rstrip(":").strip().lower()
        if heading_key in _SECTION_TITLES or (first.endswith(":") and len(first) <= 48 and len(lines) > 1):
            ops.append(("gap", "", "", 0, 4, ""))
            ops.append(("text", "/F2", first.rstrip(":"), 10, 15, "left"))
            for body_ln in lines[1:]:
                for wline in textwrap.wrap(body_ln, width=max_chars) or [""]:
                    ops.append(("text", "/F1", wline, 10, 15, "left"))
            ops.append(("gap", "", "", 0, 6, ""))
        elif len(lines) == 1 and first.endswith(":") and len(first) <= 48:
            ops.append(("gap", "", "", 0, 4, ""))
            ops.append(("text", "/F2", first.rstrip(":"), 10, 15, "left"))
        else:
            joined = " ".join(lines)
            for wline in textwrap.wrap(joined, width=max_chars) or [""]:
                ops.append(("text", "/F1", wline, 10, 15, "left"))
            ops.append(("gap", "", "", 0, 7, ""))

    # Issuing Authority / Signature block (kept together)
    sig_ops: List[Tuple[str, str, str, int, int, str]] = [
        ("gap", "", "", 0, 16, ""),
        ("text", "/F2", "Issued by:", 10, 14, "left"),
        ("gap", "", "", 0, 26, ""),
        ("text", "/F1", "_______________________________", 10, 14, "left"),
        ("text", "/F2", issuer_name, 10, 14, "left"),
        ("text", "/F1", issuer_role, 10, 13, "left"),
        ("text", "/F1", sub_name, 10, 13, "left"),
    ]
    sig_height = sum(x[4] for x in sig_ops)

    # Paginate into A4 pages
    # Each page holds ("text", font, text, size, x, y) or ("rule", "", "", 0, margin_x, y)
    pages: List[List[Tuple[str, str, str, int, float, float]]] = [[]]
    y = float(top_y)

    def _emit_op(op: Tuple[str, str, str, int, int, str]) -> None:
        nonlocal y
        kind_op, font, text, size, leading, align = op
        if y - leading < bottom_y:
            pages.append([])
            y = float(top_y)
        if kind_op == "text" and text:
            if align == "center":
                w = _est_text_w(text, size, bold=(font == "/F2"))
                px = max(float(margin_x), (page_w - w) / 2.0)
            else:
                px = float(margin_x)
            pages[-1].append(("text", font, text, size, px, y))
        elif kind_op == "rule":
            pages[-1].append(("rule", "", "", 0, float(margin_x), y + 4))
        y -= leading

    for op in ops:
        _emit_op(op)

    if y - sig_height < bottom_y:
        pages.append([])
        y = float(top_y)
    for op in sig_ops:
        _emit_op(op)

    # Build PDF objects
    objects: List[bytes] = []

    def add_obj(payload: bytes) -> int:
        objects.append(payload)
        return len(objects)

    catalog_id = add_obj(b"")  # placeholder 1
    pages_id = add_obj(b"")    # placeholder 2
    font_regular_id = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    font_bold_id = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

    page_ids: List[int] = []
    total_pages = len(pages)
    for page_num, p_items in enumerate(pages, start=1):
        cmds: List[str] = []
        for kind_op, font, text, size, px, py in p_items:
            if kind_op == "rule":
                cmds.append(f"q 0.80 0.78 0.74 RG 0.75 w {margin_x} {py:.1f} m {margin_x + content_w} {py:.1f} l S Q")
            elif kind_op == "text" and text:
                cmds.append(f"BT {font} {size} Tf 1 0 0 1 {px:.1f} {py:.1f} Tm ({_pdf_escape(text)}) Tj ET")
        if total_pages > 1:
            footer_txt = f"{letter.warning_reference}  -  Page {page_num} of {total_pages}"
            cmds.append(f"BT /F1 8 Tf 1 0 0 1 {margin_x} 36 Tm ({_pdf_escape(footer_txt)}) Tj ET")
        stream_bytes = "\n".join(cmds).encode("latin-1", "replace")
        content_id = add_obj(
            f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii") + stream_bytes + b"\nendstream"
        )
        page_id = add_obj(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {page_w} {page_h}] "
            f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>".encode("ascii")
        )
        page_ids.append(page_id)

    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")

    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: List[int] = []
    for idx, obj_bytes in enumerate(objects, start=1):
        offsets.append(buf.tell())
        buf.write(f"{idx} 0 obj\n".encode("ascii"))
        buf.write(obj_bytes)
        buf.write(b"\nendobj\n")

    xref_pos = buf.tell()
    buf.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buf.write(b"0000000000 65535 f \n")
    for off in offsets:
        buf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    buf.write(f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Template CRUD & Versioning
# ---------------------------------------------------------------------------
def ensure_default_templates(db: Session, subdivision_id: Optional[int], actor_id: Optional[int] = None) -> List[WarningLetterTemplate]:
    """Lazily seed editable default warning letter templates for a subdivision if none exist yet."""
    q = db.query(WarningLetterTemplate)
    if subdivision_id is not None:
        q = q.filter(WarningLetterTemplate.subdivision_id == subdivision_id)
    else:
        q = q.filter(WarningLetterTemplate.subdivision_id.is_(None))
    existing = q.order_by(WarningLetterTemplate.is_default.desc(), WarningLetterTemplate.template_id.asc()).all()
    if existing:
        return existing

    seeds = [
        (
            "Standard Subdivision Warning Letter",
            "Customizable general warning letter for Notice, 1st Warning, and Final Warning notifications.",
            None,
            True,
            DEFAULT_STANDARD_SUBJECT,
            DEFAULT_STANDARD_BODY,
        ),
        (
            "Second Warning & Office Summons Notice",
            "Template for 2nd Warning citations that include a Subdivision Office summons date and venue.",
            "2nd Warning",
            False,
            DEFAULT_SUMMONS_SUBJECT,
            DEFAULT_SUMMONS_BODY,
        ),
    ]
    created: List[WarningLetterTemplate] = []
    for name, desc, level, is_def, subj, body in seeds:
        tpl = WarningLetterTemplate(
            subdivision_id=subdivision_id,
            name=name,
            description=desc,
            warning_level=level,
            source_type="editor",
            status="active",
            is_default=is_def,
            created_by=actor_id,
            updated_by=actor_id,
        )
        db.add(tpl)
        db.flush()
        ver = WarningLetterTemplateVersion(
            template_id=tpl.template_id,
            version_number=1,
            subject_template=subj,
            body_template=body,
            html_template=render_html_document(subj, body, "{{warning_reference}}", "{{case_reference}}"),
            placeholders_used=extract_placeholders(subj, body),
            change_note="Initial default template",
            created_by=actor_id,
        )
        db.add(ver)
        db.flush()
        tpl.current_version_id = ver.version_id
        created.append(tpl)
    db.flush()
    return created


def serialize_version(v: WarningLetterTemplateVersion, names: Optional[Dict[int, str]] = None) -> Dict[str, Any]:
    return {
        "version_id": v.version_id,
        "template_id": v.template_id,
        "version_number": v.version_number,
        "subject_template": v.subject_template,
        "body_template": v.body_template,
        "html_template": v.html_template,
        "source_filename": v.source_filename,
        "has_docx": bool(v.source_docx_bytes),
        "placeholders_used": v.placeholders_used or extract_placeholders(v.subject_template, v.body_template),
        "change_note": v.change_note,
        "created_by": v.created_by,
        "created_by_name": (names or {}).get(v.created_by) if v.created_by else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def serialize_template(t: WarningLetterTemplate, db: Session, include_versions: bool = False) -> Dict[str, Any]:
    versions = (
        db.query(WarningLetterTemplateVersion)
        .filter(WarningLetterTemplateVersion.template_id == t.template_id)
        .order_by(WarningLetterTemplateVersion.version_number.desc())
        .all()
    )
    current = next((v for v in versions if v.version_id == t.current_version_id), versions[0] if versions else None)
    user_ids = {u for u in [t.created_by, t.updated_by, *(v.created_by for v in versions)] if u}
    names = {u.user_id: u.name for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}
    return {
        "template_id": t.template_id,
        "subdivision_id": t.subdivision_id,
        "name": t.name,
        "description": t.description,
        "warning_level": t.warning_level,
        "source_type": t.source_type,
        "status": t.status,
        "is_default": bool(t.is_default),
        "current_version_id": current.version_id if current else t.current_version_id,
        "current_version_number": current.version_number if current else 1,
        "version_count": len(versions),
        "current_version": serialize_version(current, names) if current else None,
        "created_by": t.created_by,
        "created_by_name": names.get(t.created_by) if t.created_by else None,
        "updated_by": t.updated_by,
        "updated_by_name": names.get(t.updated_by) if t.updated_by else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        **({"versions": [serialize_version(v, names) for v in versions]} if include_versions else {}),
    }


def resolve_template_for_issuance(
    db: Session,
    subdivision_id: Optional[int],
    template_id: Optional[int],
    warning_level: Optional[str],
    actor_id: Optional[int] = None,
) -> Tuple[WarningLetterTemplate, WarningLetterTemplateVersion]:
    ensure_default_templates(db, subdivision_id, actor_id=actor_id)
    tpl: Optional[WarningLetterTemplate] = None
    if template_id is not None:
        tpl = db.get(WarningLetterTemplate, template_id)
        if tpl is None or (subdivision_id is not None and tpl.subdivision_id not in (subdivision_id, None)):
            raise HTTPException(status_code=404, detail="Selected warning letter template was not found.")
        if tpl.status != "active":
            raise HTTPException(status_code=409, detail=f"Template '{tpl.name}' is archived and cannot be used.")
    else:
        q = db.query(WarningLetterTemplate).filter(WarningLetterTemplate.status == "active")
        if subdivision_id is not None:
            q = q.filter(WarningLetterTemplate.subdivision_id == subdivision_id)
        candidates = q.order_by(WarningLetterTemplate.is_default.desc(), WarningLetterTemplate.template_id.asc()).all()
        if warning_level:
            tpl = (
                next((c for c in candidates if c.is_default and c.warning_level == warning_level), None)
                or next((c for c in candidates if c.is_default and c.warning_level is None), None)
                or next((c for c in candidates if c.warning_level == warning_level), None)
                or (candidates[0] if candidates else None)
            )
        else:
            tpl = next((c for c in candidates if c.is_default), None) or (candidates[0] if candidates else None)
    if tpl is None:
        raise HTTPException(status_code=409, detail="No active warning letter template is configured for this subdivision.")
    ver = (
        db.get(WarningLetterTemplateVersion, tpl.current_version_id)
        if tpl.current_version_id
        else None
    ) or (
        db.query(WarningLetterTemplateVersion)
        .filter(WarningLetterTemplateVersion.template_id == tpl.template_id)
        .order_by(WarningLetterTemplateVersion.version_number.desc())
        .first()
    )
    if ver is None:
        raise HTTPException(status_code=409, detail=f"Template '{tpl.name}' has no saved version.")
    return tpl, ver


# ---------------------------------------------------------------------------
# Context Population, Validation, Generation & Notification Tracking
# ---------------------------------------------------------------------------
def _fmt_date(dt: Optional[datetime], with_time: bool = False) -> str:
    if dt is None:
        return ""
    if with_time:
        return dt.strftime("%B %d, %Y at %I:%M %p").replace(" 0", " ")
    return dt.strftime("%B %d, %Y").replace(" 0", " ")


def _resolve_pet(db: Session, pet: Optional[Pet], owner: Optional[User], report: Optional[Report]) -> Optional[Pet]:
    """Return the explicit pet, or auto-match the owner's sole active pet of the reported species."""
    if pet is not None or owner is None:
        return pet
    q_pets = db.query(Pet).filter(
        Pet.owner_id == owner.user_id,
        or_(Pet.status.is_(None), Pet.status.notin_(["Deceased", "Merged"])),
    )
    species = (getattr(report, "animal_type", None) or "").strip()
    if species and species.lower() != "other":
        q_pets = q_pets.filter(func.lower(Pet.pet_type) == species.lower())
    candidates = q_pets.limit(2).all()
    return candidates[0] if len(candidates) == 1 else None


def build_letter_context(
    *,
    db: Session,
    subdivision_id: Optional[int],
    report: Optional[Report],
    owner: Optional[User],
    recipient_name: Optional[str],
    recipient_address: Optional[str],
    pet: Optional[Pet],
    issuer: Optional[User],
    warning_level: str,
    violation_description: str,
    required_action: str,
    policy_reference: str,
    warning_reference: str = "WARN-PREVIEW",
    issue_date: Optional[datetime] = None,
    incident_date: Optional[datetime] = None,
    observation_days: Optional[int] = None,
    summons_at: Optional[datetime] = None,
    summons_place: Optional[str] = None,
    overrides: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    sub = db.get(Subdivision, subdivision_id) if subdivision_id else None
    sub_name = sub.subdivision_name if sub else "Subdivision Office"
    office = case_policy.load_settings(db, subdivision_id).office if subdivision_id else None
    inc_dt = incident_date or (getattr(report, "seen_at", None) or getattr(report, "created_at", None) if report else None) or datetime.now()
    iss_dt = issue_date or datetime.now()
    resolved_pet = _resolve_pet(db, pet, owner, report)
    pet_name = (resolved_pet.display_name if resolved_pet else None) or (getattr(report, "pet_name", None) if report else None) or ""
    pet_type = (resolved_pet.pet_type if resolved_pet else None) or (report.animal_type if report else None) or ""
    if not pet_name:
        pet_name = f"your {pet_type.lower()}" if pet_type else "your pet"
    res_name = (recipient_name or (owner.name if owner else "") or "").strip()
    res_addr = (recipient_address or (owner.address if owner else "") or "").strip()
    issuer_role = "Subdivision Leader" if (issuer and issuer.role_id == 2) else ("Administrator" if (issuer and issuer.role_id == 4) else "Subdivision Officer")
    issuer_name = (issuer.name if issuer else "") or issuer_role
    issued_by = f"{issuer.name} ({issuer_role})" if issuer else issuer_role

    ctx: Dict[str, str] = {
        "resident_name": res_name,
        "resident_address": res_addr,
        "pet_name": pet_name,
        "pet_type": pet_type,
        "case_reference": case_ref_for(report),
        "warning_reference": warning_reference,
        "warning_level": warning_level or "",
        "violation_description": (violation_description or "").strip(),
        "incident_date": _fmt_date(inc_dt, with_time=True),
        "issue_date": _fmt_date(iss_dt, with_time=False),
        "required_action": (required_action or "").strip(),
        "policy_reference": (policy_reference or "").strip(),
        "issued_by": issued_by,
        "issuer_name": issuer_name,
        "issuer_role": issuer_role,
        "subdivision_name": sub_name,
        "subdivision_address": (office.address or "").strip() if office else "",
        "subdivision_phone": (office.phone or "").strip() if office else "",
        "subdivision_email": (office.email or "").strip() if office else "",
        "observation_days": f"{observation_days} day{'s' if observation_days != 1 else ''}" if observation_days else "",
        "summons_date": _fmt_date(summons_at, with_time=True) if summons_at else "",
        "summons_place": (summons_place or "").strip(),
    }
    if overrides:
        for k, v in overrides.items():
            if v is not None and str(v).strip():
                ctx[k] = str(v).strip()
    return ctx


def detect_missing_fields(
    subject_template: str,
    body_template: str,
    context: Dict[str, str],
    *,
    strict_pet_name: bool = False,
) -> List[Dict[str, Any]]:
    used = extract_placeholders(subject_template, body_template)
    missing: List[Dict[str, Any]] = []
    # Core required fields must always be verified even if a custom template omits one, plus any placeholder in template
    check_keys: List[str] = []
    for k in [*used, "resident_name", "warning_level", "violation_description", "required_action", "policy_reference", "issued_by"]:
        if k not in check_keys:
            check_keys.append(k)
    for key in check_keys:
        if key == "warning_reference":
            continue  # auto-assigned at generation time
        val = (context.get(key) or "").strip()
        if not val:
            is_req = PLACEHOLDER_REQUIRED.get(key, True)
            if key == "pet_name" and strict_pet_name:
                is_req = True
            missing.append({
                "key": key,
                "label": PLACEHOLDER_LABELS.get(key, key.replace("_", " ").title()),
                "required": is_req,
                "message": f"Missing {PLACEHOLDER_LABELS.get(key, key)} for this template.",
            })
    return missing


def render_preview(
    subject_template: str,
    body_template: str,
    context: Dict[str, str],
) -> Dict[str, Any]:
    missing = detect_missing_fields(subject_template, body_template, context)
    rendered_subject = substitute_placeholders(subject_template, context)
    rendered_body = substitute_placeholders(body_template, context)
    rendered_html = render_html_document(
        rendered_subject,
        rendered_body,
        context.get("warning_reference") or "WARN-PREVIEW",
        context.get("case_reference") or "Unlinked Case",
        context.get("subdivision_name") or "Subdivision Office",
    )
    return {
        "subject": rendered_subject,
        "body": rendered_body,
        "html": rendered_html,
        "placeholders": context,
        "missing_fields": missing,
        "can_issue": not any(m["required"] for m in missing),
    }


def _sync_notification_delivery_status(letter: GeneratedWarningLetter, notif_ok: bool, err: Optional[str] = None) -> None:
    now = datetime.now()
    if letter.notification_created_at is None:
        letter.notification_created_at = now
    if notif_ok:
        letter.notification_status = "sent"
        letter.notification_sent_at = now
        letter.notification_error = None
    else:
        letter.notification_status = "failed"
        letter.notification_error = (err or "Notification dispatch failed")[:500]


def deliver_warning_notification(
    db: Session,
    letter: GeneratedWarningLetter,
    owner: Optional[User],
    pet: Optional[Pet],
    violation_type: str,
    description: str,
    dispatcher_fn=dispatch_notification,
) -> None:
    """
    Create an in-app notification + email/push for the generated warning letter.
    Preserves the warning & letter record even if notification delivery fails.
    """
    if owner is None:
        letter.notification_status = "not_applicable"
        letter.notification_error = "Resident does not have a StraySafe account."
        return

    try:
        pet_info = f" for pet '{pet.display_name}'" if pet else ""
        notif_title = f"⚠️ {letter.warning_level} ({letter.warning_reference}) — {letter.case_reference}"
        notif_msg = (
            f"Official Notice ({letter.warning_reference}) for {letter.case_reference}: "
            f"You received a {letter.warning_level}{pet_info} regarding '{violation_type}' "
            f"issued on {_fmt_date(letter.issued_at)}. Tap to view and download the warning letter."
        )
        subj, txt_b, html_b = email_templates.render_owner_warning_email(
            user_name=owner.name,
            pet_name=pet.display_name if pet else letter.pet_name,
            warning_level=letter.warning_level,
            violation_type=violation_type,
            description=description,
        )
        email_payload: Optional[Dict[str, Any]] = None
        if owner.email:
            email_payload = {
                "recipient_email": owner.email,
                "subject": f"{letter.warning_reference}: {subj}",
                "text_body": f"{txt_b}\n\nWarning Reference: {letter.warning_reference}\nCase Reference: {letter.case_reference}\n\n--- Official Letter ---\n{letter.rendered_body}",
                "html_body": html_b,
                "category": "warning",
                "template_key": "owner_warning_issued",
                "idempotency_key": f"warning_letter_{letter.letter_id}_attempt_{letter.retry_count}",
                "related_entity_type": "warning",
                "related_entity_id": letter.warning_id or letter.letter_id,
            }
        notif = dispatcher_fn(
            db=db,
            user_id=owner.user_id,
            related_id=letter.report_id or letter.letter_id,
            title=notif_title,
            message=notif_msg,
            notification_type="Warning",
            email_data=email_payload,
        )
        db.flush()
        nid = getattr(notif, "notification_id", None)
        if isinstance(nid, int):
            letter.notification_id = nid
        _sync_notification_delivery_status(letter, True)
    except Exception as exc:
        _sync_notification_delivery_status(letter, False, str(exc))


def create_generated_letter(
    *,
    db: Session,
    subdivision_id: Optional[int],
    report: Optional[Report],
    owner: Optional[User],
    recipient_name: Optional[str],
    recipient_address: Optional[str],
    pet: Optional[Pet],
    issuer: User,
    warning_level: str,
    policy_id: Optional[str],
    policy_reference: str,
    violation_description: str,
    required_action: str,
    template_id: Optional[int] = None,
    warning: Optional[OwnerWarning] = None,
    complaint_step_id: Optional[int] = None,
    observation_days: Optional[int] = None,
    summons_at: Optional[datetime] = None,
    summons_place: Optional[str] = None,
    overrides: Optional[Dict[str, str]] = None,
    strict_required: bool = False,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
) -> GeneratedWarningLetter:
    tpl, ver = resolve_template_for_issuance(db, subdivision_id, template_id, warning_level, actor_id=issuer.user_id)
    now = datetime.now()
    resolved_pet = _resolve_pet(db, pet, owner, report)
    ctx = build_letter_context(
        db=db,
        subdivision_id=subdivision_id,
        report=report,
        owner=owner,
        recipient_name=recipient_name,
        recipient_address=recipient_address,
        pet=resolved_pet,
        issuer=issuer,
        warning_level=warning_level,
        violation_description=violation_description,
        required_action=required_action,
        policy_reference=policy_reference,
        warning_reference="WARN-PENDING",
        issue_date=now,
        observation_days=observation_days,
        summons_at=summons_at,
        summons_place=summons_place,
        overrides=overrides,
    )
    if strict_required:
        missing = [m for m in detect_missing_fields(ver.subject_template, ver.body_template, ctx) if m["required"]]
        if missing:
            names = ", ".join(m["label"] for m in missing)
            raise HTTPException(status_code=422, detail=f"Cannot generate warning letter; missing required fields: {names}.")

    # Fallbacks for optional/legacy API calls so generated letters never render dangling empty blanks
    if not ctx["resident_address"]:
        ctx["resident_address"] = (report.landmark if report else None) or "Subdivision Resident"
    if not ctx["pet_name"]:
        ctx["pet_name"] = ctx["pet_type"] or "Animal"
    if not ctx["pet_type"]:
        ctx["pet_type"] = "Animal"
    if attachment_url:
        ctx["attachment_url"] = attachment_url
        ctx["attachment_name"] = attachment_name or "Warning letter attachment"

    temp_ref = f"WARN-TMP-{os.urandom(4).hex()}"
    letter = GeneratedWarningLetter(
        warning_reference=temp_ref,
        subdivision_id=subdivision_id,
        warning_id=warning.warning_id if warning else None,
        complaint_step_id=complaint_step_id,
        report_id=report.report_id if report else None,
        case_reference=ctx["case_reference"],
        recipient_user_id=owner.user_id if owner else None,
        recipient_name=ctx["resident_name"] or "Resident",
        recipient_address=ctx["resident_address"],
        pet_id=resolved_pet.pet_id if resolved_pet else None,
        pet_name=ctx["pet_name"],
        pet_type=ctx["pet_type"],
        warning_level=warning_level,
        policy_id=policy_id,
        policy_reference=policy_reference,
        template_id=tpl.template_id,
        template_name=tpl.name,
        template_version_id=ver.version_id,
        template_version_number=ver.version_number,
        rendered_subject="",
        rendered_body="",
        rendered_html="",
        placeholders_json=ctx,
        issued_by=issuer.user_id,
        issued_by_name=ctx["issued_by"],
        issued_at=now,
        notification_status="pending",
    )
    db.add(letter)
    db.flush()

    wref = warning_ref_for(letter.letter_id, now)
    ctx["warning_reference"] = wref
    rendered_subject = substitute_placeholders(ver.subject_template, ctx)
    rendered_body = substitute_placeholders(ver.body_template, ctx)
    rendered_html = render_html_document(
        rendered_subject,
        rendered_body,
        wref,
        ctx["case_reference"],
        ctx["subdivision_name"],
    )
    letter.warning_reference = wref
    letter.rendered_subject = rendered_subject
    letter.rendered_body = rendered_body
    letter.rendered_html = rendered_html
    letter.placeholders_json = ctx
    db.flush()
    return letter


def mark_letter_viewed(db: Session, letter: GeneratedWarningLetter, viewer: User) -> bool:
    """Mark warning letter + linked notification viewed only when opened by the recipient resident."""
    if letter.recipient_user_id != viewer.user_id:
        return False
    changed = False
    now = datetime.now()
    if letter.viewed_at is None:
        letter.viewed_at = now
        changed = True
    if letter.notification_id:
        notif = db.get(Notification, letter.notification_id)
        if notif is not None and not notif.is_read:
            notif.is_read = True  # type: ignore
            changed = True
    if changed:
        log_activity(
            db=db,
            action="WARNING_LETTER_VIEWED",
            target_table="generated_warning_letters",
            target_id=letter.letter_id,
            description=f"Resident {viewer.name} viewed warning letter {letter.warning_reference}.",
            user_id=viewer.user_id,
            log_type="operation",
            commit=False,
        )
    return changed


def serialize_letter(letter: GeneratedWarningLetter, db: Session) -> Dict[str, Any]:
    notif = db.get(Notification, letter.notification_id) if letter.notification_id else None
    warn = db.get(OwnerWarning, letter.warning_id) if letter.warning_id else None
    ph = letter.placeholders_json or {}
    sub_name, sub_addr, _ = _office_contact_lines(db, letter.subdivision_id, ph)
    office = case_policy.load_settings(db, letter.subdivision_id).office if letter.subdivision_id else None
    issuer_name, issuer_role, _ = _issuer_lines(letter, sub_name)
    return {
        "letter_id": letter.letter_id,
        "warning_reference": letter.warning_reference,
        "subdivision_id": letter.subdivision_id,
        "subdivision_name": sub_name,
        "subdivision_address": sub_addr or ((office.address or "").strip() if office else "") or None,
        "subdivision_phone": (str(ph.get("subdivision_phone") or "").strip() or ((office.phone or "").strip() if office else "")) or None,
        "subdivision_email": (str(ph.get("subdivision_email") or "").strip() or ((office.email or "").strip() if office else "")) or None,
        "warning_id": letter.warning_id,
        "complaint_step_id": letter.complaint_step_id,
        "report_id": letter.report_id,
        "case_reference": letter.case_reference,
        "recipient_user_id": letter.recipient_user_id,
        "recipient_name": letter.recipient_name,
        "recipient_address": letter.recipient_address,
        "pet_id": letter.pet_id,
        "pet_name": letter.pet_name,
        "pet_type": letter.pet_type,
        "warning_level": letter.warning_level,
        "policy_id": letter.policy_id,
        "policy_reference": letter.policy_reference,
        "template_id": letter.template_id,
        "template_name": letter.template_name,
        "template_version_id": letter.template_version_id,
        "template_version_number": letter.template_version_number,
        "rendered_subject": letter.rendered_subject,
        "rendered_body": letter.rendered_body,
        "rendered_html": letter.rendered_html,
        "placeholders": ph,
        "attachment_url": ph.get("attachment_url"),
        "attachment_name": ph.get("attachment_name"),
        "issued_by": letter.issued_by,
        "issued_by_name": letter.issued_by_name,
        "issuer_name": issuer_name,
        "issuer_role": issuer_role,
        "issued_at": letter.issued_at.isoformat() if letter.issued_at else None,
        "warning_status": warn.status if warn else None,
        "acknowledged_at": warn.acknowledged_at.isoformat() if (warn and warn.acknowledged_at) else None,
        "notification_id": letter.notification_id,
        "notification_status": letter.notification_status,
        "notification_error": letter.notification_error,
        "notification_created_at": letter.notification_created_at.isoformat() if letter.notification_created_at else None,
        "notification_sent_at": letter.notification_sent_at.isoformat() if letter.notification_sent_at else None,
        "is_read": bool(notif.is_read) if notif is not None else bool(letter.viewed_at),
        "viewed_at": letter.viewed_at.isoformat() if letter.viewed_at else None,
        "retry_count": letter.retry_count,
        "last_retry_at": letter.last_retry_at.isoformat() if letter.last_retry_at else None,
    }
