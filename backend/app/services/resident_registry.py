"""
Official resident records: file reading, validation and bulk import (docs/01-system/RESIDENT_RECORD_REGISTRATION.md).

Reading uses only the standard library (csv, zipfile, ElementTree), so .xlsx support adds no dependency. Uploaded files are
untrusted: size, row, entry-size and zip-ratio limits apply before anything is parsed, and macros/external links in a workbook are
never read (only cell values are).
"""
import csv
import hashlib
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set, Tuple
from xml.etree import ElementTree as ET

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import insert, update
from sqlalchemy.orm import Session

from app.models.resident_registry import (
    ACTIVE, DEACTIVATED, PENDING_ACTIVATION, PENDING_DELIVERY,
    OfficialResidentRecord, ResidentImportBatch, ResidentImportRow, ResidentInvitation,
)
from app.models.user import User
from app.utils.phone import normalize_ph_phone

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
MAX_SHEET_XML_BYTES = 60 * 1024 * 1024        # what one worksheet may expand to (guards against zip bombs)
CHUNK = 1000                                   # rows per bulk insert

TEMPLATE_HEADERS = ["Full Name", "Email Address", "Block Number", "Lot Number", "Contact Number"]
TEMPLATE_EXAMPLE = ["Maria Santos", "maria.santos@example.com", "4", "21", "0917 123 4567"]

_HEADER_ALIASES = {
    "full_name": {"fullname", "name", "residentname", "fullnameofresident"},
    "email": {"email", "emailaddress", "eemail", "emailadd"},
    "block": {"block", "blocknumber", "blockno", "blocknum", "blk"},
    "lot": {"lot", "lotnumber", "lotno", "lotnum"},
    "contact": {"contact", "contactnumber", "contactno", "phone", "phonenumber", "mobile", "mobilenumber", "cellphone"},
}
_REQUIRED = ("full_name", "email", "block", "lot")
_LABELS = {"full_name": "Full Name", "email": "Email Address", "block": "Block Number", "lot": "Lot Number", "contact": "Contact Number"}


class FileProblem(Exception):
    """The whole file cannot be used (wrong format, too big, missing columns...). The message is shown to the Leader as is."""


# ------------------------------------------------------------------------------------------------ normalization
def norm_text(value: Optional[str]) -> str:
    """Trim, collapse inner whitespace, drop control characters."""
    text = unicodedata.normalize("NFKC", value or "")
    text = "".join(ch for ch in text if ch.isprintable() or ch in " \t")
    return re.sub(r"\s+", " ", text).strip()


def norm_email(value: Optional[str]) -> str:
    """Letter case and surrounding spaces never matter in an e-mail address; nothing else is altered."""
    return norm_text(value).replace(" ", "").lower()


def name_key(value: Optional[str]) -> str:
    """Case-insensitive, accent-insensitive, punctuation-insensitive; word order and every word are kept (no first/last guessing)."""
    text = unicodedata.normalize("NFKD", norm_text(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    text = re.sub(r"[.,]", " ", text)
    text = text.replace("ñ", "n")
    return re.sub(r"\s+", " ", text).strip()


_PLACE_PREFIX = re.compile(r"^(?:block|blk|lot|b|l)\.?\s*(?=\d)", re.IGNORECASE)


def place_key(value: Optional[str]) -> str:
    """Block/lot comparison form: 'Block 04', 'blk 4', '4' and '04' are the same block; '4A' stays different from '4'."""
    text = norm_text(value).casefold()
    text = _PLACE_PREFIX.sub("", text).replace(" ", "")
    text = re.sub(r"^0+(?=\d)", "", text)
    return text


# ------------------------------------------------------------------------------------------------ reading files
def _cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _read_csv(data: bytes) -> List[List[str]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252", errors="replace")
    sample = text[:4096]
    delimiter = max([",", ";", "\t"], key=sample.count) if sample else ","
    rows = []
    for row in csv.reader(io.StringIO(text), delimiter=delimiter):
        rows.append([c.strip() for c in row])
        if len(rows) > MAX_ROWS + 50:
            break
    return rows


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref or "")
    n = 0
    for ch in (letters.group(0) if letters else "A"):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _read_xlsx(data: bytes) -> List[List[str]]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise FileProblem("This is not a valid .xlsx file. Download the template, fill it in, and upload it again.")
    names = {i.filename: i for i in zf.infolist()}
    if "xl/workbook.xml" not in names:
        raise FileProblem("This is not a valid .xlsx workbook. Download the template, fill it in, and upload it again.")

    def read(name: str, limit: int) -> bytes:
        info = names.get(name)
        if info is None:
            raise FileProblem("The workbook is missing its first worksheet.")
        if info.file_size > limit or (info.compress_size and info.file_size / info.compress_size > 200):
            raise FileProblem("The workbook is too large or unusual to read safely. Save it as a plain .xlsx or .csv and try again.")
        return zf.read(info)

    # first worksheet, through the workbook's own relationship list
    try:
        wb = ET.fromstring(read("xl/workbook.xml", 5_000_000))
        rid = None
        for el in wb.iter():
            if _local(el.tag) == "sheet":
                rid = next((v for k, v in el.attrib.items() if _local(k) == "id"), None)
                break
        target = "worksheets/sheet1.xml"
        if rid and "xl/_rels/workbook.xml.rels" in names:
            for rel in ET.fromstring(read("xl/_rels/workbook.xml.rels", 5_000_000)):
                if rel.attrib.get("Id") == rid:
                    target = rel.attrib.get("Target", target).lstrip("/")
                    break
        sheet_name = target if target.startswith("xl/") else "xl/" + target
        shared: List[str] = []
        if "xl/sharedStrings.xml" in names:
            for si in ET.fromstring(read("xl/sharedStrings.xml", MAX_SHEET_XML_BYTES)):
                shared.append("".join(t.text or "" for t in si.iter() if _local(t.tag) == "t"))
        sheet = ET.fromstring(read(sheet_name, MAX_SHEET_XML_BYTES))
    except ET.ParseError:
        raise FileProblem("The workbook could not be read. Save it again as .xlsx (or .csv) and try again.")

    rows: List[List[str]] = []
    for row in sheet.iter():
        if _local(row.tag) != "row":
            continue
        cells: Dict[int, str] = {}
        for c in row:
            if _local(c.tag) != "c":
                continue
            kind = c.attrib.get("t")
            text = ""
            if kind == "inlineStr":
                text = "".join(t.text or "" for t in c.iter() if _local(t.tag) == "t")
            else:
                v = next((x for x in c if _local(x.tag) == "v"), None)
                raw = (v.text or "") if v is not None else ""
                if kind == "s":
                    text = shared[int(raw)] if raw.isdigit() and int(raw) < len(shared) else ""
                elif kind == "b":
                    text = "TRUE" if raw == "1" else "FALSE"
                elif kind in ("str", "e"):
                    text = raw
                else:
                    try:
                        text = _cell_text(float(raw)) if raw else ""
                    except ValueError:
                        text = raw
            cells[_col_index(c.attrib.get("r", ""))] = text.strip()
        width = (max(cells) + 1) if cells else 0
        rows.append([cells.get(i, "") for i in range(width)])
        if len(rows) > MAX_ROWS + 50:
            break
    return rows


def read_table(filename: str, data: bytes) -> Tuple[List[List[str]], str]:
    """The sheet's rows (header included) and the file kind. Raises FileProblem for anything that is not a usable .xlsx/.csv."""
    if not data:
        raise FileProblem("The file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise FileProblem(f"The file is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB. Split it into smaller files.")
    lower = (filename or "").lower()
    if lower.endswith(".xlsx"):
        if not data.startswith(b"PK"):
            raise FileProblem("This file is named .xlsx but is not an Excel workbook.")
        return _read_xlsx(data), "xlsx"
    if lower.endswith(".csv"):
        if data.startswith(b"PK") or b"\x00" in data[:2048]:
            raise FileProblem("This file is named .csv but is not a text file. Save it as CSV (comma delimited) and try again.")
        return _read_csv(data), "csv"
    raise FileProblem("Unsupported file type. Upload an Excel (.xlsx) or CSV (.csv) file. Older .xls files must be saved as .xlsx first.")


def map_columns(header: List[str]) -> Dict[str, int]:
    found: Dict[str, int] = {}
    for idx, cell in enumerate(header):
        key = re.sub(r"[^a-z]", "", cell.casefold())
        for field_name, aliases in _HEADER_ALIASES.items():
            if key in aliases and field_name not in found:
                found[field_name] = idx
    missing = [_LABELS[f] for f in _REQUIRED if f not in found]
    if missing:
        raise FileProblem("The file is missing required column(s): " + ", ".join(missing) + ". Use the downloadable template for the exact headings.")
    return found


# ------------------------------------------------------------------------------------------------ validation
@dataclass
class ParsedRow:
    row_number: int
    full_name: str = ""
    email: str = ""
    block: str = ""
    lot: str = ""
    contact: str = ""
    result: str = "valid"
    reason: Optional[str] = None
    existing_user_id: Optional[int] = None
    nkey: str = field(default="", repr=False)
    bkey: str = field(default="", repr=False)
    lkey: str = field(default="", repr=False)


def _check_fields(r: ParsedRow) -> None:
    missing = [label for label, v in (("Full Name", r.full_name), ("Email Address", r.email), ("Block Number", r.block), ("Lot Number", r.lot)) if not v]
    if missing:
        r.result, r.reason = "missing", "Missing required information: " + ", ".join(missing) + "."
        return
    problems = []
    if len(r.full_name) < 2 or len(r.full_name) > 100 or not any(ch.isalpha() for ch in r.full_name):
        problems.append("Full Name must be 2 to 100 characters and contain letters")
    try:
        r.email = validate_email(r.email, check_deliverability=False).normalized.lower()
        if len(r.email) > 100:
            problems.append("Email Address is longer than 100 characters")
    except EmailNotValidError:
        problems.append("Email Address is not a valid e-mail address")
    r.bkey, r.lkey = place_key(r.block), place_key(r.lot)
    if len(r.block) > 30 or not r.bkey:
        problems.append("Block Number is invalid (30 characters at most)")
    if len(r.lot) > 30 or not r.lkey:
        problems.append("Lot Number is invalid (30 characters at most)")
    if r.contact:
        try:
            r.contact = normalize_ph_phone(r.contact) or ""
        except ValueError:
            problems.append("Contact Number is not a valid Philippine number")
    if problems:
        r.result, r.reason = "invalid", "; ".join(problems) + "."
    r.nkey = name_key(r.full_name)


def parse_and_validate(db: Session, subdivision_id: int, table: List[List[str]]) -> List[ParsedRow]:
    """Every data row of the file with its verdict. Blank rows are skipped; nothing is silently accepted or dropped."""
    header_at = next((i for i, row in enumerate(table) if any(c for c in row)), None)
    if header_at is None:
        raise FileProblem("The file has no data.")
    cols = map_columns(table[header_at])

    def cell(row: List[str], key: str) -> str:
        i = cols.get(key)
        return norm_text(row[i]) if i is not None and i < len(row) else ""

    parsed: List[ParsedRow] = []
    for offset, row in enumerate(table[header_at + 1:], start=header_at + 2):     # the row number Excel shows
        if not any(c for c in row):
            continue
        parsed.append(ParsedRow(row_number=offset, full_name=cell(row, "full_name"), email=norm_email(cell(row, "email")),
                                block=cell(row, "block"), lot=cell(row, "lot"), contact=cell(row, "contact")))
        if len(parsed) > MAX_ROWS:
            raise FileProblem(f"The file has more than {MAX_ROWS:,} resident rows. Split it into smaller files.")
    if not parsed:
        raise FileProblem("The file has a header but no resident rows.")

    for r in parsed:
        _check_fields(r)

    # what is already stored for this subdivision
    existing_email: Set[str] = set()
    existing_identity: Set[Tuple[str, str, str]] = set()
    for email, nk, bk, lk in db.query(OfficialResidentRecord.email, OfficialResidentRecord.name_key,
                                      OfficialResidentRecord.block_key, OfficialResidentRecord.lot_key).filter(
            OfficialResidentRecord.subdivision_id == subdivision_id):
        existing_email.add(email)
        existing_identity.add((nk, bk, lk))

    seen_email: Dict[str, int] = {}
    seen_identity: Dict[Tuple[str, str, str], int] = {}
    for r in parsed:
        if r.result != "valid":
            continue
        ident = (r.nkey, r.bkey, r.lkey)
        if r.email in existing_email:
            r.result, r.reason = "duplicate", "This email is already in the resident records."
        elif ident in existing_identity:
            r.result, r.reason = "duplicate", "This resident (same name, block and lot) is already in the resident records."
        elif r.email in seen_email:
            r.result, r.reason = "duplicate", f"Duplicate email: same as row {seen_email[r.email]} of this file."
        elif ident in seen_identity:
            r.result, r.reason = "duplicate", f"Duplicate resident: same name, block and lot as row {seen_identity[ident]} of this file."
        else:
            seen_email[r.email] = r.row_number
            seen_identity[ident] = r.row_number

    # e-mails that already have a StraySafe account
    candidates = [r for r in parsed if r.result == "valid"]
    if candidates:
        accounts: Dict[str, User] = {}
        emails = [r.email for r in candidates]
        for i in range(0, len(emails), 500):
            for u in db.query(User).filter(User.email.in_(emails[i:i + 500])):
                accounts[u.email.lower()] = u
        linked = {uid for (uid,) in db.query(OfficialResidentRecord.user_id).filter(OfficialResidentRecord.user_id.isnot(None))}
        for r in candidates:
            u = accounts.get(r.email)
            if u is None:
                continue
            if u.role_id != 1:
                r.result, r.reason = "invalid", "This email belongs to a staff or administrator account, not a resident."
            elif u.user_id in linked:
                r.result, r.reason = "duplicate", "This email already has a StraySafe account linked to another resident record."
            else:
                r.existing_user_id = u.user_id
                r.reason = "Valid. This email already has a StraySafe account; it will be linked and treated as an active resident."
    return parsed


def summarize(parsed: Iterable[ParsedRow]) -> Dict[str, int]:
    counts = {"valid": 0, "duplicate": 0, "invalid": 0, "missing": 0}
    total = 0
    for r in parsed:
        counts[r.result] += 1
        total += 1
    counts["total"] = total
    return counts


def store_validation(db: Session, subdivision_id: int, uploaded_by: int, filename: str, data: bytes,
                     parsed: List[ParsedRow]) -> ResidentImportBatch:
    """Save the batch and one validation row per spreadsheet row (bulk, in chunks). Nothing becomes a resident record yet."""
    counts = summarize(parsed)
    batch = ResidentImportBatch(
        subdivision_id=subdivision_id, uploaded_by=uploaded_by, filename=(filename or "upload")[:255],
        file_sha256=hashlib.sha256(data).hexdigest(), status="Validated", total_rows=counts["total"], valid_rows=counts["valid"],
        duplicate_rows=counts["duplicate"], invalid_rows=counts["invalid"], missing_rows=counts["missing"])
    db.add(batch)
    db.flush()
    rows = [{"batch_id": batch.batch_id, "row_number": r.row_number, "full_name": r.full_name[:150] or None,
             "email": r.email[:100] or None, "block_number": r.block[:30] or None, "lot_number": r.lot[:30] or None,
             "contact_number": r.contact[:20] or None, "result": r.result, "reason": (r.reason or "")[:255] or None,
             "existing_user_id": r.existing_user_id} for r in parsed]
    for i in range(0, len(rows), CHUNK):
        db.execute(insert(ResidentImportRow), rows[i:i + CHUNK])
    return batch


# ------------------------------------------------------------------------------------------------ importing
class ImportConflict(Exception):
    """The batch was already imported or discarded (an import is applied exactly once)."""


def confirm_import(db: Session, batch_id: int, subdivision_id: int, leader_id: int) -> Dict[str, int]:
    """
    Turn a batch's valid rows into resident records in one transaction. The claim (Validated -> Imported) is a conditional UPDATE,
    so a double click or two tabs import the batch once. Rows that became duplicates since validation are skipped and reported.
    The caller commits on success and rolls back on any error, leaving the batch Validated and safe to retry.
    """
    from datetime import datetime
    claimed = db.execute(update(ResidentImportBatch).where(
        ResidentImportBatch.batch_id == batch_id, ResidentImportBatch.subdivision_id == subdivision_id,
        ResidentImportBatch.status == "Validated").values(status="Imported", confirmed_at=datetime.now(), confirmed_by=leader_id)).rowcount
    if claimed != 1:
        raise ImportConflict("This import was already confirmed or discarded.")

    existing_email: Set[str] = set()
    existing_identity: Set[Tuple[str, str, str]] = set()
    for email, nk, bk, lk in db.query(OfficialResidentRecord.email, OfficialResidentRecord.name_key,
                                      OfficialResidentRecord.block_key, OfficialResidentRecord.lot_key).filter(
            OfficialResidentRecord.subdivision_id == subdivision_id):
        existing_email.add(email)
        existing_identity.add((nk, bk, lk))
    linked = {uid for (uid,) in db.query(OfficialResidentRecord.user_id).filter(OfficialResidentRecord.user_id.isnot(None))}

    from app.services.resident_invitations import barangay_of, new_resident_user

    now = datetime.now()
    barangay_id = barangay_of(db, subdivision_id)
    todo: List[Tuple[ResidentImportRow, Tuple[str, str, str], Optional[User]]] = []
    skipped_rows: List[int] = []
    q = db.query(ResidentImportRow).filter(ResidentImportRow.batch_id == batch_id, ResidentImportRow.result == "valid").order_by(ResidentImportRow.row_number)
    for row in q.all():
        ident = (name_key(row.full_name), place_key(row.block_number), place_key(row.lot_number))
        if row.email in existing_email or ident in existing_identity:
            skipped_rows.append(row.row_id)
            continue
        account = None
        if row.existing_user_id is not None:
            account = db.get(User, row.existing_user_id)
            if account is None or account.role_id != 1 or account.user_id in linked:
                account = None
        existing_email.add(row.email)
        existing_identity.add(ident)
        if account is not None:
            linked.add(account.user_id)
        todo.append((row, ident, account))

    created = linked_existing = 0
    for i in range(0, len(todo), CHUNK):
        chunk = todo[i:i + CHUNK]
        new_users = {}
        for row, ident, account in chunk:
            if account is None:
                new_users[row.row_id] = new_resident_user(subdivision_id, barangay_id, row.full_name, row.email, row.contact_number,
                                                          row.block_number, row.lot_number)
        db.add_all(new_users.values())
        db.flush()                                                     # the new accounts get their ids
        records = []
        for row, ident, account in chunk:
            user = account or new_users[row.row_id]
            if account is not None:
                state = ACTIVE if account.status == "Active" else DEACTIVATED   # an existing resident account is treated as active
                linked_existing += 1
            else:
                state = PENDING_ACTIVATION
                created += 1
            records.append(OfficialResidentRecord(
                subdivision_id=subdivision_id, full_name=row.full_name, name_key=ident[0], email=row.email,
                block_number=row.block_number, block_key=ident[1], lot_number=row.lot_number, lot_key=ident[2],
                contact_number=row.contact_number, registration_status=state, user_id=user.user_id, imported_batch_id=batch_id,
                registered_at=now if state == ACTIVE else None, deactivated_at=now if state == DEACTIVATED else None))
        db.add_all(records)
        db.flush()
        db.add_all([ResidentInvitation(record_id=r.record_id, user_id=r.user_id, delivery_status=PENDING_DELIVERY)
                    for r in records if r.registration_status == PENDING_ACTIVATION])
        db.flush()
    for i in range(0, len(skipped_rows), CHUNK):
        db.execute(update(ResidentImportRow).where(ResidentImportRow.row_id.in_(skipped_rows[i:i + CHUNK])).values(
            result="duplicate", reason="Skipped: this resident was added by another import after this file was checked."))
    db.execute(update(ResidentImportBatch).where(ResidentImportBatch.batch_id == batch_id).values(
        imported_rows=len(todo), linked_existing_rows=linked_existing,
        valid_rows=len(todo), duplicate_rows=ResidentImportBatch.duplicate_rows + len(skipped_rows)))
    return {"imported": len(todo), "accounts_created": created, "skipped": len(skipped_rows), "linked_existing": linked_existing}


# ------------------------------------------------------------------------------------------------ templates
def template_csv() -> bytes:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(TEMPLATE_HEADERS)
    w.writerow(TEMPLATE_EXAMPLE)
    return ("﻿" + out.getvalue()).encode("utf-8")


def template_xlsx() -> bytes:
    return build_xlsx([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE])


def build_xlsx(table: List[List[str]]) -> bytes:
    """A minimal valid one-sheet workbook (first row bold) written with the standard library."""
    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def row(n: int, values: List[str], bold: bool) -> str:
        style = ' s="1"' if bold else ""
        cells = "".join(f'<c r="{chr(65 + i)}{n}" t="inlineStr"{style}><is><t>{esc(v)}</t></is></c>' for i, v in enumerate(values))
        return f'<row r="{n}">{cells}</row>'

    body = "".join(row(n, values, n == 1) for n, values in enumerate(table, start=1))
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             '<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/>'
             '<col min="3" max="5" width="18" customWidth="1"/></cols>'
             '<sheetData>' + body + '</sheetData></worksheet>')
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
              '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
              '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
              '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
              '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
              '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>')
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Residents" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "xl/styles.xml": styles,
        "xl/worksheets/sheet1.xml": sheet,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()
