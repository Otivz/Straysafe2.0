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
from sqlalchemy import event, func, or_
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
from app.utils.warning_rules import TIERS as WARNING_LEVELS

PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")

# THE official registry of placeholders (the one list the editor, the DOCX import, the preview and issuing all use).
# `requirement` says what issuing needs:
#   required     the letter cannot be issued without a value, whether or not the template uses it
#   conditional  a value is needed when the template uses it (for example the summons of a 2nd Warning)
#   optional     may be blank
#   system       supplied by the system when the letter is issued (the warning reference)
# `required` (kept for the screens) is true for everything that must have a value.
_REGISTRY: List[Tuple[str, str, str, str, str]] = [
    # key, label, requirement, example, description
    ("resident_name", "Resident Name", "required", "Juan Dela Cruz", "Full name of the responsible resident or pet owner."),
    ("case_reference", "Case Reference", "required", "SS-2026-0023", "Official case reference number."),
    ("warning_level", "Warning Level", "required", "1st Warning", "Notice, 1st Warning, 2nd Warning, or Final Notice / Escalation."),
    ("violation_description", "Violation Description", "required", "Pet was seen roaming unleashed in common areas.", "Factual description of the verified violation."),
    ("required_action", "Required Action", "required", "Keep your pet inside your property or on a leash when outside.", "Corrective action required from the resident."),
    ("policy_reference", "Policy Reference", "required", "House Rules §6.3 — Free-Roaming Pets", "The confirmed subdivision rule or policy that applies."),
    ("issue_date", "Date Issued", "required", "November 17, 2026", "Date when the warning letter is issued."),
    ("issued_by", "Issued By", "required", "Maria Santos (Subdivision Leader)", "Name and role of the issuing Subdivision Leader."),
    ("subdivision_name", "Subdivision Name", "required", "Selera Homes", "Name of the subdivision."),
    ("warning_reference", "Warning Reference", "system", "WARN-2026-0001", "Unique reference number of this issued warning (assigned when it is issued)."),
    ("resident_address", "Resident Address", "conditional", "Block 3 Lot 8, Narra St.", "House address or unit of the resident. Needed when the template uses it."),
    ("pet_type", "Pet Type / Species", "conditional", "Dog", "Species of the animal (Dog, Cat, etc.). Needed when the template uses it."),
    ("incident_date", "Incident Date", "conditional", "November 17, 2026 at 2:13 PM", "Date and time when the incident occurred. Needed when the template uses it."),
    ("observation_days", "Observation Period", "conditional", "3 days", "Monitoring period defined by the policy. Needed when the template uses it."),
    ("summons_date", "Summons Date & Time", "conditional", "November 22, 2026 at 4:00 PM", "Scheduled meeting at the subdivision office (2nd Warning). Needed when the template uses it."),
    ("summons_place", "Summons Location", "conditional", "Subdivision Office", "Venue for the office summons. Needed when the template uses it."),
    ("pet_name", "Pet Name", "optional", "Bantay", "Name of the registered pet involved. When there is none, the letter says \"your dog\", \"your cat\" or \"your pet\"."),
    ("issuer_name", "Issuer Name", "optional", "Maria Santos", "Name of the issuing Subdivision Leader."),
    ("issuer_role", "Issuer Role", "optional", "Subdivision Leader", "Role of the issuer."),
    ("subdivision_address", "Office Address", "optional", "Narra St., Selera Homes", "The subdivision office's address, when it has recorded one."),
    ("subdivision_phone", "Office Phone", "optional", "0917 000 0000", "The subdivision office's phone, when it has recorded one."),
    ("subdivision_email", "Office Email", "optional", "office@selera.example", "The subdivision office's email, when it has recorded one."),
]

PLACEHOLDER_DEFINITIONS: List[Dict[str, Any]] = [
    {"key": k, "label": label, "requirement": req, "required": req != "optional", "example": ex, "description": desc}
    for (k, label, req, ex, desc) in _REGISTRY
]
PLACEHOLDER_LABELS: Dict[str, str] = {p["key"]: p["label"] for p in PLACEHOLDER_DEFINITIONS}
PLACEHOLDER_REQUIREMENT: Dict[str, str] = {p["key"]: p["requirement"] for p in PLACEHOLDER_DEFINITIONS}
ALWAYS_REQUIRED: List[str] = [k for k, _l, req, _e, _d in _REGISTRY if req == "required"]


def case_ref_for(report: Optional[Report], report_id: Optional[int] = None) -> str:
    rid = report.report_id if report is not None else report_id
    if not rid:
        return "Unlinked Case"
    year = report.created_at.year if (report is not None and report.created_at) else datetime.now().year
    return f"SS-{year}-{int(rid):04d}"


def warning_ref_for(letter_id: int, issued_at: Optional[datetime] = None) -> str:
    year = (issued_at or datetime.now()).year
    return f"WARN-{year}-{int(letter_id):04d}"


def unknown_placeholders(subject: str, body: str) -> List[str]:
    """The `{{keys}}` in this text that are not in the official registry (a typo, or a field this system does not have)."""
    return [k for k in extract_placeholders(subject, body) if k not in PLACEHOLDER_REQUIREMENT]


def validate_template_text(subject: str, body: str) -> None:
    """Refuse a template that uses a placeholder the system does not supply, naming each one and listing the valid ones (422)."""
    bad = unknown_placeholders(subject, body)
    if bad:
        shown = ", ".join("{{" + k + "}}" for k in bad)
        raise HTTPException(
            status_code=422,
            detail=f"These placeholders are not supported: {shown}. Use only: " + ", ".join(PLACEHOLDER_LABELS[k] + " ({{" + k + "}})" for k in PLACEHOLDER_REQUIREMENT) + ".",
        )


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
    # the standard templates' headings (seed_data/warning_templates.json)
    "what was reported",
    "subdivision policy",
    "what we ask you to do",
    "office summons",
}

# Letters issued from this version on carry this marker in their snapshot (placeholders_json). A letter WITHOUT it was issued earlier,
# from templates that wrote the header, "Date Issued", "TO:" and "Issued by:" into the text; only those letters have those lines hidden
# (the letter prints its own), so they look exactly as they always did. Everything else is shown exactly as written.
RENDER_LAYOUT_KEY = "render_layout"
RENDER_LAYOUT = "2"


def is_legacy_layout(letter: "GeneratedWarningLetter") -> bool:
    """A letter issued before the layout marker existed (its own header/recipient/signature lines are hidden when shown)."""
    return not (letter.placeholders_json or {}).get(RENDER_LAYOUT_KEY)


_HEADING_WORDS = re.compile(r"^[A-Z][A-Za-z/&()' -]*$")


def is_heading(first: str, line_count: int) -> bool:
    """
    The heading rule every view uses (screen, PDF, DOCX; the screen's copy is in frontend/src/components/warningLetterBlocks.ts):
    a known section title; or, when more lines follow, a short line ending in ":"; or a short title-like line (letters only, at most
    six words, no closing punctuation), such as "Office Summons".
    """
    if first.rstrip(":").strip().lower() in _SECTION_TITLES:
        return True
    if line_count < 2 or len(first) > 48:
        return False
    if first.endswith(":"):
        return True
    return bool(_HEADING_WORDS.match(first)) and len(first) <= 40 and len(first.split()) <= 6


def _paragraphs(body: str) -> List[str]:
    out: List[str] = []
    for p in (body or "").replace("\r\n", "\n").split("\n\n"):
        lines = [ln.strip() for ln in p.split("\n") if ln.strip()]
        if lines:
            out.append("\n".join(lines))
    return out


def body_blocks(body: str, legacy: bool = False) -> List[Dict[str, Any]]:
    """
    The letter text as blocks, the same for every view: {"kind": "subject", "text"}, {"kind": "section", "heading", "lines"} or
    {"kind": "para", "lines"}. Every line the author wrote is kept, line breaks included; only a `legacy` letter has its old
    header/recipient/signature lines hidden (see is_legacy_layout).
    """
    blocks: List[Dict[str, Any]] = []
    for para in (_strip_legacy_chrome(body) if legacy else _paragraphs(body)):
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if not lines:
            continue
        if lines[0].upper().startswith("SUBJECT:"):
            blocks.append({"kind": "subject", "text": lines[0].split(":", 1)[1].strip()})
            lines = lines[1:]
            if not lines:
                continue
        if is_heading(lines[0], len(lines)):
            blocks.append({"kind": "section", "heading": lines[0].rstrip(":").strip(), "lines": lines[1:]})
        else:
            blocks.append({"kind": "para", "lines": lines})
    return blocks


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
        # An issued letter keeps the office details it was issued with (blank stays blank). Only a very old letter that never stored
        # them falls back to the office's current details.
        if not any(k in ph for k in ("subdivision_address", "subdivision_phone", "subdivision_email")):
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
    legacy: bool = False,
) -> str:
    safe_sub = html.escape(subdivision_name or "StraySafe Subdivision")
    safe_subj = html.escape(subject or "Official Warning Letter")
    safe_wref = html.escape(warning_reference)
    safe_cref = html.escape(case_reference)
    out = []
    for b in body_blocks(body, legacy=legacy):
        if b["kind"] == "subject":
            out.append(f"<p class=\"ss-warning-letter__subject-line\"><strong>SUBJECT:</strong> {html.escape(b['text'])}</p>")
        elif b["kind"] == "section":
            lines = "<br/>".join(html.escape(ln) for ln in b["lines"])
            out.append(f"<h3>{html.escape(b['heading'])}</h3>" + (f"<p>{lines}</p>" if lines else ""))
        else:
            out.append(f"<p>{'<br/>'.join(html.escape(ln) for ln in b['lines'])}</p>")
    body_html = "\n".join(out)
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


# Limits for an uploaded Word file (it is also re-checked before a letter is made from a stored one).
DOCX_MAX_ENTRIES = 2000
DOCX_MAX_PART_BYTES = 20 * 1024 * 1024          # one decompressed part
DOCX_MAX_TOTAL_BYTES = 60 * 1024 * 1024         # everything, decompressed
_UNSAFE_XML = re.compile(rb"<!\s*(DOCTYPE|ENTITY)", re.I)


def _read_docx_parts(raw: bytes) -> Dict[str, bytes]:
    """
    The XML parts of a .docx, read safely: a real ZIP, a bounded number of entries, every part read with a hard size limit (so a
    "zip bomb" cannot exhaust memory), and no DOCTYPE or ENTITY declarations anywhere (they have no place in a Word file and are how
    XML expansion attacks work). Refuses with 400/413 and a plain message.
    """
    if not raw or not raw.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Invalid DOCX file. Please upload a valid Microsoft Word (.docx) document.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Could not read DOCX archive. Ensure the file is a valid .docx.") from exc
    parts: Dict[str, bytes] = {}
    with zf:
        infos = zf.infolist()
        if len(infos) > DOCX_MAX_ENTRIES:
            raise HTTPException(status_code=413, detail="This Word file has too many parts to be a letter template.")
        total = 0
        for info in infos:
            if not info.filename.endswith((".xml", ".rels")):
                continue
            with zf.open(info) as fh:
                data = fh.read(DOCX_MAX_PART_BYTES + 1)
            if len(data) > DOCX_MAX_PART_BYTES:
                raise HTTPException(status_code=413, detail="This Word file is too large once unpacked to be a letter template.")
            total += len(data)
            if total > DOCX_MAX_TOTAL_BYTES:
                raise HTTPException(status_code=413, detail="This Word file is too large once unpacked to be a letter template.")
            if _UNSAFE_XML.search(data):
                raise HTTPException(status_code=400, detail="This Word file contains XML declarations (DOCTYPE/ENTITY) that a Word document never needs, so it was refused. Save it again from Word and upload that copy.")
            parts[info.filename] = data
        media = [i.filename for i in infos if i.filename.startswith("word/media/")]
    if "word/document.xml" not in parts:
        raise HTTPException(status_code=400, detail="The uploaded DOCX file does not contain word/document.xml.")
    parts["__media__"] = "\n".join(media).encode()
    return parts


def _xml_root(data: bytes, name: str) -> ET.Element:
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"The Word file has a damaged part ({name}).") from exc


def _para_text(p: ET.Element) -> str:
    buf: List[str] = []
    for node in p.iter():
        lt = _local_tag(node.tag)
        if lt == "t" and node.text:
            buf.append(node.text)
        elif lt == "tab":
            buf.append("    ")
        elif lt in ("br", "cr"):
            buf.append("\n")
    return "".join(buf).strip()


def _blocks_of(container: ET.Element, notes: Dict[str, int]) -> List[str]:
    """The text of a body (or header/footer) in reading order: one entry per paragraph; a table as one line per row ("cell | cell")."""
    out: List[str] = []
    for child in container:
        lt = _local_tag(child.tag)
        if lt == "p":
            text = _para_text(child)
            if text:
                out.append(text)
        elif lt == "tbl":
            notes["tables"] = notes.get("tables", 0) + 1
            rows: List[str] = []
            for tr in child.iter():
                if _local_tag(tr.tag) != "tr":
                    continue
                cells = [" ".join(t for t in (_para_text(p) for p in tc.iter() if _local_tag(p.tag) == "p") if t)
                         for tc in tr if _local_tag(tc.tag) == "tc"]
                line = " | ".join(c for c in cells if c)
                if line:
                    rows.append(line)
            if rows:
                out.append("\n".join(rows))
        elif lt in ("sdt", "sdtContent", "customXml", "smartTag"):
            out.extend(_blocks_of(child, notes))
    return out


def parse_docx_bytes(raw: bytes) -> Dict[str, Any]:
    """
    Read an uploaded .docx as a template: the body text in reading order (tables as "cell | cell" lines), the header and footer
    kept apart (the Word download keeps them where they are; the screen and PDF use the standard letterhead), the placeholders it
    uses, and plain notes about what the preview cannot show. The original file is stored as is for the Word download.
    """
    parts = _read_docx_parts(raw)
    notes_count: Dict[str, int] = {}
    doc = _xml_root(parts["word/document.xml"], "document")
    body = next((c for c in doc if _local_tag(c.tag) == "body"), doc)
    paragraphs = _blocks_of(body, notes_count)
    header_footer: List[str] = []
    for name in sorted(parts):
        if name.startswith(("word/header", "word/footer")) and name.endswith(".xml"):
            header_footer.extend(_blocks_of(_xml_root(parts[name], name), notes_count))
    if not paragraphs:
        raise HTTPException(status_code=400, detail="The uploaded DOCX file appears to be empty.")

    subject_guess = paragraphs[0][:255]
    for cand in paragraphs[:5]:
        if "subject" in cand.lower() or "warning" in cand.lower() or "notice" in cand.lower():
            subject_guess = cand.split("\n")[0][:255]
            break
    body_text = "\n\n".join(paragraphs)
    other_text = "\n\n".join(header_footer)

    notes: List[str] = [f"The subject was taken from the line \u201c{subject_guess[:80]}\u201d. Change it in the editor if it is not right."]
    if notes_count.get("tables"):
        notes.append(f"It has {notes_count['tables']} table(s). The on-screen preview and the PDF show each row as a line of text; the Word download keeps the table.")
    media = [m for m in parts["__media__"].decode().split("\n") if m]
    if media:
        notes.append(f"It has {len(media)} picture(s), such as a logo or a signature. They are kept in the Word download but not shown in the on-screen preview or the PDF.")
    if header_footer:
        notes.append("Its header and footer text is kept in the Word download. The on-screen preview and the PDF use the standard letterhead instead.")
    return {
        "subject_template": subject_guess,
        "body_template": body_text,
        "other_text": other_text,
        "html_template": render_html_document(subject_guess, body_text, "{{warning_reference}}", "{{case_reference}}"),
        "placeholders_used": extract_placeholders(subject_guess, body_text + "\n\n" + other_text),
        "notes": notes,
    }


_DOCX_TAG = re.compile(r"<(/?)w:(p|t)\b([^>]*)>")


def _xml_text_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _replace_placeholders_in_xml_bytes(xml_bytes: bytes, values: Dict[str, str]) -> Tuple[bytes, List[str]]:
    """
    Fill the {{placeholders}} of one Word XML part (body, header or footer) by editing ONLY the text inside its <w:t> elements, in
    place; every other byte of the file stays exactly as Word wrote it (namespaces, styles, tables, pictures). The XML is never
    re-serialised, which is what used to make Word report "unreadable content".
      * A placeholder Word split over several runs is joined; its value goes into the run where it starts, so that run's formatting
        is kept and the formatting of the text around it (a bold "Dear ", say) is untouched.
      * A value with line breaks becomes real Word line breaks.
      * A key with no value is left as it is, and reported.
    Returns (the new part, the placeholders still in it).
    """
    xml = xml_bytes.decode("utf-8")
    paras: List[List[Dict[str, Any]]] = []
    stack: List[int] = []
    for m in _DOCX_TAG.finditer(xml):
        closing, name, rest = m.group(1), m.group(2), m.group(3)
        if rest.rstrip().endswith("/"):
            continue                                           # <w:p/> or <w:t/>: nothing inside
        if name == "p":
            if closing:
                if stack:
                    stack.pop()
            else:
                paras.append([])
                stack.append(len(paras) - 1)
        elif not closing and stack:
            end = xml.find("</w:t>", m.end())
            if end < 0:
                raise ValueError("unterminated <w:t>")
            paras[stack[-1]].append({"tag_start": m.start(), "tag": m.group(0), "text_start": m.end(), "text_end": end,
                                     "text": html.unescape(xml[m.end():end]), "changed": False})

    leftovers: List[str] = []
    for nodes in paras:
        if not nodes:
            continue
        joined = "".join(n["text"] for n in nodes)
        if "{{" not in joined:
            continue
        starts, lengths, pos = [], [], 0                       # where each node's ORIGINAL text sits in `joined`
        for n in nodes:
            starts.append(pos)
            lengths.append(len(n["text"]))
            pos += len(n["text"])

        def holder(char_index: int) -> int:
            """The node whose original text contains this character of `joined`."""
            return next(k for k in range(len(nodes)) if starts[k] <= char_index < starts[k] + lengths[k])

        # Right to left: an edit only ever changes text to the right of the matches still to come, so their offsets stay valid.
        for match in reversed(list(PLACEHOLDER_PATTERN.finditer(joined))):
            key = match.group(1)
            if values.get(key) is None:
                continue
            i = holder(match.start())
            j = holder(match.end() - 1)
            off_i = match.start() - starts[i]
            off_j = match.end() - starts[j]
            if i == j:
                t = nodes[i]["text"]
                nodes[i]["text"] = t[:off_i] + values[key] + t[off_j:]
            else:
                nodes[i]["text"] = nodes[i]["text"][:off_i] + values[key]
                for k in range(i + 1, j):
                    nodes[k]["text"] = ""
                    nodes[k]["changed"] = True
                nodes[j]["text"] = nodes[j]["text"][off_j:]
                nodes[j]["changed"] = True
            nodes[i]["changed"] = True
        leftovers.extend(PLACEHOLDER_PATTERN.findall("".join(n["text"] for n in nodes)))

    edits = []
    for nodes in paras:
        for n in nodes:
            if not n["changed"]:
                continue
            tag = n["tag"] if "xml:space" in n["tag"] else n["tag"][:-1] + ' xml:space="preserve">'
            text = '</w:t><w:br/><w:t xml:space="preserve">'.join(_xml_text_escape(seg) for seg in n["text"].split("\n"))
            edits.append((n["tag_start"], n["text_end"], tag + text))
    for start, end, new in sorted(edits, reverse=True):
        xml = xml[:start] + new + xml[end:]
    return xml.encode("utf-8"), leftovers


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

    blocks = body_blocks(letter.rendered_body, legacy=is_legacy_layout(letter))
    if not any(b["kind"] == "subject" for b in blocks[:2]) and letter.rendered_subject:
        paras.append(_label_p("SUBJECT:", letter.rendered_subject, space_after=160))
    for b in blocks:
        if b["kind"] == "subject":
            paras.append(_label_p("SUBJECT:", b["text"], space_after=160))
        elif b["kind"] == "section":
            paras.append(_p_xml(b["heading"], bold=True, size_half_pt=21, space_before=100, space_after=60, color="0F172A"))
            if b["lines"]:
                paras.append(_p_xml("\n".join(b["lines"]), space_after=140))
        else:
            paras.append(_p_xml("\n".join(b["lines"]), space_after=140))

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


_DOCX_TEXT_PARTS = ("word/document.xml", "word/footnotes.xml", "word/endnotes.xml")


def render_letter_docx(letter: GeneratedWarningLetter, db: Session) -> bytes:
    """
    The letter as a Word file. A letter whose template version was imported from Word is that file with its placeholders filled in
    (see _replace_placeholders_in_xml_bytes); any other letter gets the standard generated layout. Nothing is hidden: a part that
    cannot be filled gives an error, and a file that would still contain an unfilled {{placeholder}} is refused (422).
    """
    values: Dict[str, str] = {k: str(v or "") for k, v in (letter.placeholders_json or {}).items()}
    if letter.template_version_id:
        ver = db.get(WarningLetterTemplateVersion, letter.template_version_id)
        if ver is not None and ver.source_docx_bytes:
            _read_docx_parts(ver.source_docx_bytes)                # the stored file is checked again (older uploads predate the checks)
            leftovers: List[str] = []
            dst = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(ver.source_docx_bytes), "r") as zin, zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename in _DOCX_TEXT_PARTS or (item.filename.startswith(("word/header", "word/footer")) and item.filename.endswith(".xml")):
                        try:
                            data, left = _replace_placeholders_in_xml_bytes(data, values)
                        except Exception as exc:  # noqa: BLE001
                            raise HTTPException(status_code=500, detail=f"The Word file for {letter.warning_reference} could not be made ({item.filename}: {exc}). Download the PDF instead.") from exc
                        leftovers.extend(left)
                    zout.writestr(item, data)
            if leftovers:
                shown = ", ".join(sorted({"{{" + k + "}}" for k in leftovers}))
                raise HTTPException(status_code=422, detail=f"The Word file for {letter.warning_reference} would still contain unfilled placeholders ({shown}), so it was not made. Download the PDF instead.")
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

    # Letter body sections (the same blocks as the screen and the DOCX; every line kept, line breaks included)
    blocks = body_blocks(letter.rendered_body, legacy=is_legacy_layout(letter))
    if not any(b["kind"] == "subject" for b in blocks[:2]) and letter.rendered_subject:
        for wline in textwrap.wrap(f"SUBJECT: {letter.rendered_subject}", width=max_chars - 4) or [""]:
            ops.append(("text", "/F2", wline, 10, 15, "left"))
        ops.append(("gap", "", "", 0, 8, ""))

    for b in blocks:
        if b["kind"] == "subject":
            for wline in textwrap.wrap(f"SUBJECT: {b['text']}", width=max_chars - 4) or [""]:
                ops.append(("text", "/F2", wline, 10, 15, "left"))
            ops.append(("gap", "", "", 0, 6, ""))
            continue
        if b["kind"] == "section":
            ops.append(("gap", "", "", 0, 4, ""))
            ops.append(("text", "/F2", b["heading"], 10, 15, "left"))
        for body_ln in b["lines"]:
            for wline in textwrap.wrap(body_ln, width=max_chars) or [""]:
                ops.append(("text", "/F1", wline, 10, 15, "left"))
        ops.append(("gap", "", "", 0, 6 if b["kind"] == "section" else 7, ""))

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
SEED_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed_data", "warning_templates.json")


def load_standard_templates() -> List[Dict[str, Any]]:
    """The four standard templates (one per level) from the seed data file. The letter wording lives in that file, not in code."""
    import json
    with open(SEED_FILE, encoding="utf-8") as fh:
        items = json.load(fh)["templates"]
    for item in items:
        normalize_warning_level(item["warning_level"])
        unknown = unknown_placeholders(item["subject_template"], item["body_template"])
        if unknown:
            raise ValueError(f"Seed template '{item['name']}' uses unknown placeholders: {', '.join(unknown)}")
    return items


def seed_standard_templates(connection, subdivision_id: int, actor_id: Optional[int] = None) -> List[int]:
    """
    Give one subdivision its own copy of the four standard templates, as ordinary editable rows (template + version 1). A level the
    subdivision already has an active template for is skipped, so this is safe to run more than once. Works on a Core connection
    (`session.connection()`, or the connection of a mapper event), so it can also run while a subdivision is being inserted.
    Returns the ids of the templates it created. Never touches an existing template, version or issued letter.
    """
    T = WarningLetterTemplate.__table__
    V = WarningLetterTemplateVersion.__table__
    created: List[int] = []
    for item in load_standard_templates():
        level = item["warning_level"]
        has_active = connection.execute(
            T.select().with_only_columns(T.c.template_id).where(
                T.c.subdivision_id == subdivision_id, T.c.warning_level == level, T.c.status == "active").limit(1)
        ).first()
        if has_active:
            continue
        template_id = connection.execute(T.insert().values(
            subdivision_id=subdivision_id, name=item["name"], description=item["description"], warning_level=level,
            source_type="editor", status="active", is_default=True, created_by=actor_id, updated_by=actor_id,
        )).inserted_primary_key[0]
        subject, body = item["subject_template"], item["body_template"]
        version_id = connection.execute(V.insert().values(
            template_id=template_id, version_number=1, subject_template=subject, body_template=body,
            html_template=render_html_document(subject, body, "{{warning_reference}}", "{{case_reference}}"),
            placeholders_used=extract_placeholders(subject, body), change_note=item.get("change_note") or "Initial standard template",
            created_by=actor_id,
        )).inserted_primary_key[0]
        connection.execute(T.update().where(T.c.template_id == template_id).values(current_version_id=version_id))
        created.append(template_id)
    return created


def seed_new_subdivisions(connection) -> List[int]:
    """Safety net for subdivisions created outside the app (raw SQL): one that has no template rows at all gets the four standard ones."""
    T = WarningLetterTemplate.__table__
    S = Subdivision.__table__
    seeded: List[int] = []
    for (sub_id,) in connection.execute(S.select().with_only_columns(S.c.subdivision_id)).all():
        if connection.execute(T.select().with_only_columns(T.c.template_id).where(T.c.subdivision_id == sub_id).limit(1)).first() is None:
            if seed_standard_templates(connection, sub_id):
                seeded.append(sub_id)
    return seeded


@event.listens_for(Subdivision, "after_insert")
def _seed_templates_for_new_subdivision(mapper, connection, target) -> None:
    """
    A new subdivision automatically gets its own, independent set of the four standard templates. Creating a subdivision must never
    fail because of this: it runs in a savepoint, and if it cannot (the tables are missing, say), the subdivision is still created and
    the startup safety net (`seed_new_subdivisions`) gives it its templates later.
    """
    try:
        with connection.begin_nested():
            seed_standard_templates(connection, target.subdivision_id)
    except Exception as exc:  # noqa: BLE001
        print(f"Notice: the standard warning letter templates were not added to subdivision {target.subdivision_id} yet: {exc}")


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


def normalize_warning_level(value: Optional[str]) -> Optional[str]:
    """
    A template's level as stored: None means universal (usable for every level); otherwise one of the four tiers exactly.
    An empty value is universal. Anything else is refused, so a typo can never quietly disable a template.
    """
    level = (value or "").strip()
    if not level:
        return None
    if level not in WARNING_LEVELS:
        raise HTTPException(status_code=422, detail=f"Unknown warning level '{level}'. Use one of: {', '.join(WARNING_LEVELS)}, or leave it empty for all levels.")
    return level


def template_fits_level(tpl: WarningLetterTemplate, warning_level: Optional[str]) -> bool:
    """A universal template fits every level; a level-specific one fits only its own level."""
    return tpl.warning_level is None or tpl.warning_level == warning_level


def resolve_template_for_issuance(
    db: Session,
    subdivision_id: Optional[int],
    template_id: Optional[int],
    warning_level: Optional[str],
    actor_id: Optional[int] = None,
) -> Tuple[WarningLetterTemplate, WarningLetterTemplateVersion]:
    """
    The template the Leader chose, checked. There is no automatic choice: the Leader must pick one, it must be active, in their
    subdivision (or platform-wide), and compatible with the letter's level. `is_default` only marks a suggestion in the picker.
    """
    if template_id is None:
        raise HTTPException(status_code=422, detail="Choose a warning letter template for this letter.")
    tpl = db.get(WarningLetterTemplate, template_id)
    if tpl is None or (subdivision_id is not None and tpl.subdivision_id not in (subdivision_id, None)):
        raise HTTPException(status_code=404, detail="Selected warning letter template was not found.")
    if tpl.status != "active":
        raise HTTPException(status_code=409, detail=f"Template '{tpl.name}' is archived and cannot be used.")
    if not template_fits_level(tpl, warning_level):
        raise HTTPException(
            status_code=409,
            detail=f"Template '{tpl.name}' is for {tpl.warning_level} letters. Choose a template for {warning_level or 'this level'}, or one for all levels.",
        )
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
        bad = [k for k in overrides if k not in PLACEHOLDER_REQUIREMENT or PLACEHOLDER_REQUIREMENT[k] == "system"]
        if bad:
            raise HTTPException(status_code=422, detail=f"These details cannot be filled in by hand: {', '.join(bad)}.")
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
    """
    What blocks this letter: a placeholder the system does not supply (an `unknown` entry), or a value that is needed and blank.
    Needed = every "required" placeholder (whether or not the template uses it) plus the "conditional" ones the template uses.
    "optional" ones may be blank; "system" ones (the warning reference) are assigned at issue.
    """
    used = extract_placeholders(subject_template, body_template)
    missing: List[Dict[str, Any]] = []
    for key in used:
        if key not in PLACEHOLDER_REQUIREMENT:
            missing.append({"key": key, "label": key, "required": True, "unknown": True,
                            "message": f"This template uses {{{{{key}}}}}, which is not a supported placeholder. Edit the template to fix it."})
    check_keys: List[str] = []
    for k in [*ALWAYS_REQUIRED, *[u for u in used if u in PLACEHOLDER_REQUIREMENT]]:
        if k not in check_keys:
            check_keys.append(k)
    for key in check_keys:
        requirement = PLACEHOLDER_REQUIREMENT[key]
        if requirement == "system":
            continue
        if (context.get(key) or "").strip():
            continue
        if requirement == "optional" and not (key == "pet_name" and strict_pet_name):
            continue
        label = PLACEHOLDER_LABELS[key]
        missing.append({"key": key, "label": label, "required": True, "unknown": False, "message": f"Missing {label} for this letter."})
    return missing


def render_preview(
    subject_template: str,
    body_template: str,
    context: Dict[str, str],
) -> Dict[str, Any]:
    missing = detect_missing_fields(subject_template, body_template, context)
    # A needed value that is missing is shown as "[missing: Label]" so nobody reads a letter with a silent gap in it.
    shown = {**context, **{m["key"]: f"[missing: {m['label']}]" for m in missing if not m.get("unknown")}}
    rendered_subject = substitute_placeholders(subject_template, shown)
    rendered_body = substitute_placeholders(body_template, shown)
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
        "can_issue": not missing,
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


def validate_letter_ready(
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
    policy_reference: str,
    violation_description: str,
    required_action: str,
    template_id: Optional[int],
    observation_days: Optional[int] = None,
    summons_at: Optional[datetime] = None,
    summons_place: Optional[str] = None,
    overrides: Optional[Dict[str, str]] = None,
    issue_date: Optional[datetime] = None,
) -> Tuple[WarningLetterTemplate, WarningLetterTemplateVersion, Optional[Pet], Dict[str, str]]:
    """
    Everything that must be true before a warning letter is made, and nothing is written: the chosen template exists, is active and fits
    the level; the template uses only placeholders the system supplies; every needed value is present. Raises 422/409/404 with a plain
    message. Callers run it BEFORE they write anything (so a refusal leaves no half-made warning), and `create_generated_letter` runs it
    again, so no issuing path can skip it. Returns (template, version, the pet used, the values to fill in).
    """
    tpl, ver = resolve_template_for_issuance(db, subdivision_id, template_id, warning_level, actor_id=issuer.user_id)
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
        issue_date=issue_date or datetime.now(),
        observation_days=observation_days,
        summons_at=summons_at,
        summons_place=summons_place,
        overrides=overrides,
    )
    # No letter is made with a needed value missing or with a placeholder the system does not supply. Nothing is filled in on the
    # Leader's behalf.
    missing = detect_missing_fields(ver.subject_template, ver.body_template, ctx)
    if missing:
        unknown = [m for m in missing if m.get("unknown")]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Template '{tpl.name}' uses unsupported placeholders ({', '.join('{{' + m['key'] + '}}' for m in unknown)}). Edit the template, then try again.")
        names = ", ".join(m["label"] for m in missing)
        raise HTTPException(status_code=422, detail=f"Cannot issue this warning letter; missing required fields: {names}.")
    return tpl, ver, resolved_pet, ctx


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
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
    letter_date: Optional[datetime] = None,
) -> GeneratedWarningLetter:
    now = datetime.now()
    # Every issuing path goes through this check, whichever service called it (a caller may also run it earlier, before it writes).
    tpl, ver, resolved_pet, ctx = validate_letter_ready(
        db=db, subdivision_id=subdivision_id, report=report, owner=owner, recipient_name=recipient_name, recipient_address=recipient_address,
        pet=pet, issuer=issuer, warning_level=warning_level, policy_reference=policy_reference, violation_description=violation_description,
        required_action=required_action, template_id=template_id, observation_days=observation_days, summons_at=summons_at,
        summons_place=summons_place, overrides=overrides, issue_date=letter_date or now,   # "Date issued": the date the Leader put on the letter
    )
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
        recipient_address=ctx["resident_address"] or None,
        pet_id=resolved_pet.pet_id if resolved_pet else None,
        pet_name=ctx["pet_name"],
        pet_type=ctx["pet_type"] or None,
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
    letter.placeholders_json = {**ctx, RENDER_LAYOUT_KEY: RENDER_LAYOUT}   # shown exactly as written (see is_legacy_layout)
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


def _office_part(db: Session, letter: GeneratedWarningLetter, part: str) -> Optional[str]:
    """For a very old letter that never stored its office details: the office's current one."""
    if not letter.subdivision_id:
        return None
    return (getattr(case_policy.load_settings(db, letter.subdivision_id).office, part, "") or "").strip() or None


def serialize_letter(letter: GeneratedWarningLetter, db: Session) -> Dict[str, Any]:
    notif = db.get(Notification, letter.notification_id) if letter.notification_id else None
    warn = db.get(OwnerWarning, letter.warning_id) if letter.warning_id else None
    ph = letter.placeholders_json or {}
    sub_name, sub_addr, _ = _office_contact_lines(db, letter.subdivision_id, ph)
    issuer_name, issuer_role, _ = _issuer_lines(letter, sub_name)
    return {
        "letter_id": letter.letter_id,
        "warning_reference": letter.warning_reference,
        "subdivision_id": letter.subdivision_id,
        "subdivision_name": sub_name,
        # the office details the letter was issued with (a later change to the office's details never alters an issued letter)
        "subdivision_address": sub_addr,
        "subdivision_phone": (str(ph.get("subdivision_phone") or "").strip() or None) if "subdivision_phone" in ph else _office_part(db, letter, "phone"),
        "subdivision_email": (str(ph.get("subdivision_email") or "").strip() or None) if "subdivision_email" in ph else _office_part(db, letter, "email"),
        "legacy_layout": is_legacy_layout(letter),
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
