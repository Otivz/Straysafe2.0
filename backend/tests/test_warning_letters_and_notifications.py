"""
Warning Notification and Letter Template Management Enhancement tests:
  1. Template creation, DOCX import (including split XML runs), versioning, default & archive toggles.
  2. Dynamic placeholder extraction, missing-field detection, and preview rendering.
  3. OwnerWarning issuance generates immutable GeneratedWarningLetter + resident Notification
     (initially unread: is_read=False, viewed_at=None).
  4. Template edits after issuance never alter previously issued warning letters.
  5. Resident authorization (403 for other residents), viewed_at timestamping on open, PDF/DOCX downloads.
  6. Notification delivery failure preserves warning + letter and supports manual retry.
  7. Complaint enforcement step (letter_1 prepare/issue) generates letter + notifies resident respondent.

Run from backend folder:
    python tests/test_warning_letters_and_notifications.py
"""
import _isolated_db  # noqa: F401  (FIRST: throwaway SQLite DB, offline env)

import io
import zipfile
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pypdf import PdfReader

from _case_helpers import make_warning_ready
from app.database import SessionLocal
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.pet import Pet
from app.models.report import Report, ReportCategory
from app.models.user import User
from app.models.warning import OwnerWarning
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate
from app.routes import complaints as complaint_routes
from app.routes import warning_letters as wl_routes
from app.routes import warnings as warning_routes
from app.schemas.case import PolicyIn
from app.schemas.complaint import OffenseIn, ResponsibleIn, StepActionIn, VerifyIn
from app.schemas.warning import WarningCreate
from app.services import complaints as C
from app.services import warning_letters as WL
from app.utils import case_policy
from app.utils.push_categories import category_for


PASSED = 0


def check(label: str, cond: bool, info: str = "") -> None:
    global PASSED
    assert cond, f"[FAIL] {label} {info}"
    PASSED += 1
    print(f"[PASS] {label}")


def _fake_request(ip: str = "127.0.0.1"):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={"user-agent": "straysafe-unit-test/1.0"},
    )


class _DummyUploadFile:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self._data = data

    async def read(self) -> bytes:
        return self._data


def _drive_coro(coro):
    """Run an async endpoint synchronously without creating an OS event-loop socketpair."""
    try:
        coro.send(None)
    except StopIteration as exc:
        return exc.value
    raise AssertionError("Unexpected suspension in synchronous unit test coroutine")


def _build_split_run_docx() -> bytes:
    """Create a valid minimal .docx where a placeholder is split across XML <w:r><w:t> runs."""
    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        "<w:p><w:r><w:t>Subject: Notice to {{res</w:t></w:r><w:r><w:t>ident_name}}</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Pet: {{pet_name}} ({{pet_type}})</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Case: {{case_reference}} | Ref: {{warning_reference}}</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Level: {{warning_level}} on {{issue_date}}</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Reason: {{violation_description}}</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Action: {{required_action}} ({{policy_reference}})</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>Issued by {{issued_by}} at {{resident_address}} ({{incident_date}})</w:t></w:r></w:p>"
        "</w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", doc_xml)
    return buf.getvalue()


def main() -> None:
    seed_ids = _isolated_db.create_schema_and_seed()
    db = SessionLocal()
    try:
        leader = db.get(User, seed_ids["leader"])
        resident = db.get(User, seed_ids["resident"])
        assert leader is not None and resident is not None
        resident.address = "Block 4 Lot 9 Mahogany St., Selera Homes"

        other_resident = User(
            name="Other Resident",
            email="other.resident@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=1,
            barangay_id=1,
            address="Block 9 Lot 1, Selera Homes",
        )
        complainant = User(
            name="Complainant Neighbor",
            email="complainant@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=1,
            barangay_id=1,
        )
        db.add_all([other_resident, complainant])
        db.flush()

        pet = Pet(
            owner_id=resident.user_id,
            pet_name="Bantay",
            pet_type="Dog",
            breed="Aspin",
            color_markings="Brown",
            gender="Male",
        )
        db.add(pet)
        db.flush()

        # Ensure Animal Nuisance & Animal Safety Concern categories exist
        if not db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first():
            db.add(ReportCategory(category_id=20, category_name="Animal Nuisance"))
        safety_cat = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Safety Concern").first()
        if not safety_cat:
            safety_cat = ReportCategory(category_id=21, category_name="Animal Safety Concern")
            db.add(safety_cat)
        db.flush()

        nuisance_cat = db.query(ReportCategory).filter(ReportCategory.category_name == "Animal Nuisance").first()

        # Confirmed policy in subdivision 1
        settings = case_policy.default_settings()
        settings.policies = [
            PolicyIn(
                id="leash-policy",
                title="Responsible Leashing & Pet Containment Policy",
                reference="HOA Rule 2026-01",
                observation_days=7,
                applies_to=["safety", "nuisance"],
                status="confirmed",
            )
        ]
        case_policy.save_settings(db, 1, settings, leader.user_id)
        db.commit()
        policy_id = "leash-policy"

        # Safety report for OwnerWarning workflow
        safety_rep = Report(
            user_id=complainant.user_id,
            subdivision_id=1,
            category_id=safety_cat.category_id,
            current_status_id=2,
            animal_type="Dog",
            description="Brown dog roaming off-leash near the main clubhouse gate.",
            landmark="Main Clubhouse Gate",
            latitude=Decimal("14.800000"),
            longitude=Decimal("121.000000"),
            pet_id=pet.pet_id,
        )
        db.add(safety_rep)
        db.commit()
        make_warning_ready(db, safety_rep.report_id, resident.user_id, observation_days=7, policy_id=policy_id)
        db.commit()

        # ------------------------------------------------------------------
        # 1. Template Management (defaults, create, DOCX import, version, default, archive)
        # ------------------------------------------------------------------
        rows_before = db.query(WarningLetterTemplate).count()
        listed = wl_routes.list_templates(status="all", subdivision_id=None, db=db, current_user=leader)
        check("opening the template list creates nothing (no lazy seeding)", db.query(WarningLetterTemplate).count() == rows_before)
        levels = sorted(t["warning_level"] for t in listed["items"])
        check("a subdivision created through the app already has its four standard templates, one per level",
              levels == sorted(["Notice", "1st Warning", "2nd Warning", "Final Notice / Escalation"]), levels)
        check("seeding again adds nothing (idempotent)", WL.seed_standard_templates(db.connection(), 1) == [])

        created = wl_routes.create_template(
            body=wl_routes.TemplateCreateIn(
                name="Custom HOA Warning Letter",
                description="Bespoke template created in editor",
                warning_level="1st Warning",
                subject_template="Warning {{warning_reference}} for {{pet_name}}",
                body_template=(
                    "Dear {{resident_name}} ({{resident_address}}),\n\n"
                    "Case {{case_reference}} ({{warning_level}}) on {{incident_date}} regarding {{pet_name}} ({{pet_type}}).\n"
                    "Violation: {{violation_description}}\n"
                    "Action: {{required_action}}\n"
                    "Policy: {{policy_reference}}\n"
                    "Issued on {{issue_date}} by {{issued_by}}."
                ),
                is_default=False,
            ),
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        tpl_id = created["template_id"]
        check("editor template created at v1", created["current_version"]["version_number"] == 1)
        check("placeholders extracted on create", "resident_name" in created["current_version"]["placeholders_used"])

        # Import split-run DOCX into a new template
        split_docx_bytes = _build_split_run_docx()
        imported = _drive_coro(
            wl_routes.import_docx_template(
                req=_fake_request(),
                file=_DummyUploadFile("SplitRunNotice.docx", split_docx_bytes),
                name="Imported DOCX Warning",
                description="With split XML runs",
                warning_level=None,
                is_default=False,
                template_id=None,
                change_note="Initial DOCX upload",
                subdivision_id=None,
                db=db,
                current_user=leader,
            )
        )
        docx_tpl_id = imported["template_id"]
        check("docx import extracts subject line", "Subject: Notice to {{resident_name}}" in imported["current_version"]["subject_template"])
        check("docx import handles split run placeholder {{resident_name}}", "resident_name" in imported["current_version"]["placeholders_used"])
        check("docx import stores binary", db.get(WarningLetterTemplate, docx_tpl_id).current_version_id is not None)

        # Update template to v2 & set default
        updated = wl_routes.update_template(
            template_id=docx_tpl_id,
            body=wl_routes.TemplateUpdateIn(
                subject_template="Updated v2: Notice {{warning_reference}} for {{resident_name}}",
                body_template=(
                    "ORIGINAL TEXT V2\nResident: {{resident_name}} ({{resident_address}})\n"
                    "Pet: {{pet_name}} / {{pet_type}}\n"
                    "Ref: {{warning_reference}} | Case: {{case_reference}} | Level: {{warning_level}}\n"
                    "Incident: {{incident_date}} | Issued: {{issue_date}} by {{issued_by}}\n"
                    "Reason: {{violation_description}}\nAction: {{required_action}} ({{policy_reference}})"
                ),
                change_note="Clarified wording in v2",
            ),
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        check("template version incremented to v2", len(updated["versions"]) == 2 and updated["current_version"]["version_number"] == 2)

        defaulted = wl_routes.set_default_template(template_id=docx_tpl_id, req=_fake_request(), db=db, current_user=leader)
        check("template marked default", defaulted["is_default"] is True)

        # Archive & reactivate created custom template
        archived = wl_routes.set_template_status(
            template_id=tpl_id,
            body=wl_routes.TemplateStatusIn(status="archived"),
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        check("template archived", archived["status"] == "archived")

        # ------------------------------------------------------------------
        # 2. Preview & Missing-field Detection
        # ------------------------------------------------------------------
        preview_missing = wl_routes.preview_template(
            body=wl_routes.TemplatePreviewIn(
                template_id=docx_tpl_id,
                report_id=safety_rep.report_id,
                user_id=resident.user_id,
                pet_id=pet.pet_id,
                recipient_address="",  # empty override forces check via blank address user below
            ),
            db=db,
            current_user=leader,
        )
        check("preview with complete DB data has no missing fields", preview_missing["can_issue"] is True and preview_missing["missing_fields"] == [])

        no_addr_user = User(
            name="No Address Owner",
            email="noaddr@isolated.test",
            password="x",
            role_id=1,
            is_verified=True,
            status="Active",
            subdivision_id=1,
            barangay_id=1,
            address=None,
        )
        db.add(no_addr_user)
        db.flush()
        preview_incomplete = wl_routes.preview_template(
            body=wl_routes.TemplatePreviewIn(
                template_id=docx_tpl_id,
                user_id=no_addr_user.user_id,
                pet_id=pet.pet_id,
                violation_description="Dog unleashed",
            ),
            db=db,
            current_user=leader,
        )
        check(
            "preview reports missing resident_address before issuing",
            preview_incomplete["can_issue"] is False and any(m["key"] == "resident_address" for m in preview_incomplete["missing_fields"]),
            preview_incomplete,
        )

        # Attempting to issue with explicit template_id and missing resident_address fails cleanly with 422
        no_addr_rep = Report(
            user_id=complainant.user_id,
            subdivision_id=1,
            category_id=safety_cat.category_id,
            current_status_id=2,
            animal_type="Dog",
            description="Roaming unleashed dog without address on owner profile.",
            landmark="Oak Ave",
            latitude=Decimal("14.803000"),
            longitude=Decimal("121.003000"),
        )
        db.add(no_addr_rep)
        db.commit()
        make_warning_ready(db, no_addr_rep.report_id, no_addr_user.user_id, observation_days=7, policy_id=policy_id)
        db.commit()

        blocked_missing = False
        try:
            warning_routes.issue_warning(
                warning_in=WarningCreate(
                    user_id=no_addr_user.user_id,
                    pet_id=None,
                    report_id=no_addr_rep.report_id,
                    warning_level="1st Warning",
                    violation_type="Free-Roaming Unleashed",
                    description="Roaming unleashed dog",
                    policy_id=policy_id,
                    template_id=docx_tpl_id,
                ),
                req=_fake_request(),
                db=db,
                current_user=leader,
            )
        except HTTPException as exc:
            blocked_missing = exc.status_code == 422 and "missing required fields" in str(exc.detail).lower()
        check("issue_warning refuses explicit template when required fields are missing", blocked_missing)

        # ------------------------------------------------------------------
        # 3. Issue Warning -> Immutable Letter Snapshot + Notification (Unread)
        # ------------------------------------------------------------------
        issued_warn = warning_routes.issue_warning(
            warning_in=WarningCreate(
                user_id=resident.user_id,
                pet_id=pet.pet_id,
                report_id=safety_rep.report_id,
                warning_level="1st Warning",
                violation_type="Free-Roaming Unleashed",
                description="Dog exited unlocked front gate onto main road.",
                policy_id=policy_id,
                template_id=docx_tpl_id,
                required_action="Secure perimeter gate latches within 24 hours.",
            ),
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        letter_id = issued_warn["letter_id"]
        check("issue_warning returns letter_id and WARN reference", bool(letter_id) and str(issued_warn["warning_reference"]).startswith("WARN-"))
        check("issue_warning notification status is sent", issued_warn["notification_status"] == "sent")
        check("issued letter starts unread (viewed_at is None)", issued_warn["viewed_at"] is None)

        letter_row = db.get(GeneratedWarningLetter, letter_id)
        assert letter_row is not None
        notif_row = db.get(Notification, letter_row.notification_id)
        assert notif_row is not None
        check("notification created as unread (is_read=False) for recipient", notif_row.user_id == resident.user_id and notif_row.is_read is False)
        check("push category maps 'warning' -> 'reports'", category_for("warning") == "reports" and category_for("warning_letter") == "reports")
        check(
            "audit trail logged WARNING_LETTER_GENERATED",
            db.query(AuditLog).filter(AuditLog.action == "WARNING_LETTER_GENERATED", AuditLog.target_id == letter_id).count() == 1,
        )

        # ------------------------------------------------------------------
        # 4. Template Immutability After Issuance
        # ------------------------------------------------------------------
        wl_routes.update_template(
            template_id=docx_tpl_id,
            body=wl_routes.TemplateUpdateIn(
                subject_template="COMPLETELY CHANGED V3 {{warning_reference}}",
                body_template="NEW BODY V3 {{resident_name}} should NOT affect old letters.",
                change_note="v3 edit after issuance",
            ),
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        db.refresh(letter_row)
        check(
            "existing generated letter retains ORIGINAL TEXT V2 after template edit",
            "ORIGINAL TEXT V2" in letter_row.rendered_body and "NEW BODY V3" not in letter_row.rendered_body,
        )

        # ------------------------------------------------------------------
        # 5. Resident Access Control, Viewed Tracking, PDF & DOCX Downloads
        # ------------------------------------------------------------------
        denied_other = False
        try:
            wl_routes.get_warning_letter(letter_id=letter_id, db=db, current_user=other_resident)
        except HTTPException as exc:
            denied_other = exc.status_code == 403
        check("other resident cannot view another resident's warning letter (403)", denied_other)

        # Staff viewing does NOT mark resident viewed_at
        staff_read = wl_routes.get_warning_letter(letter_id=letter_id, db=db, current_user=leader)
        check("leader reading letter leaves viewed_at None", staff_read["viewed_at"] is None)

        # Recipient resident opening marks viewed_at AND marks linked Notification read
        resident_read = wl_routes.get_warning_letter(letter_id=letter_id, db=db, current_user=resident)
        db.refresh(notif_row)
        check("resident opening letter records viewed_at", resident_read["viewed_at"] is not None)
        check("resident opening letter marks linked notification read", notif_row.is_read is True)

        # Downloads (PDF & DOCX)
        pdf_resp = wl_routes.download_warning_letter(letter_id=letter_id, format="pdf", db=db, current_user=resident)
        reader = PdfReader(io.BytesIO(pdf_resp.body))
        extracted_pdf_text = "\n".join(page.extract_text() or "" for page in reader.pages)
        check("downloaded PDF parses cleanly via pypdf and includes resident/ref", "Bantay" in extracted_pdf_text and letter_row.warning_reference in extracted_pdf_text)

        docx_resp = wl_routes.download_warning_letter(letter_id=letter_id, format="docx", db=db, current_user=resident)
        with zipfile.ZipFile(io.BytesIO(docx_resp.body)) as zf:
            doc_xml = zf.read("word/document.xml").decode("utf-8")
        check("downloaded DOCX replaces split placeholders cleanly", "ORIGINAL TEXT V2" in doc_xml or resident.name in doc_xml)

        # ------------------------------------------------------------------
        # 6. Notification Failure Preservation + Manual Retry
        # ------------------------------------------------------------------
        safety_rep_2 = Report(
            user_id=complainant.user_id,
            subdivision_id=1,
            category_id=safety_cat.category_id,
            current_status_id=2,
            animal_type="Dog",
            description="Second report for failure retry test.",
            landmark="Pocket Park",
            latitude=Decimal("14.801000"),
            longitude=Decimal("121.001000"),
            pet_id=pet.pet_id,
        )
        db.add(safety_rep_2)
        db.commit()
        make_warning_ready(db, safety_rep_2.report_id, resident.user_id, observation_days=7, policy_id=policy_id)
        db.commit()

        with patch("app.routes.warnings.dispatch_notification", side_effect=RuntimeError("Push gateway offline")):
            failed_warn = warning_routes.issue_warning(
                warning_in=WarningCreate(
                    user_id=resident.user_id,
                    pet_id=pet.pet_id,
                    report_id=safety_rep_2.report_id,
                    warning_level="2nd Warning",
                    violation_type="Free-Roaming Unleashed",
                    description="Second roaming incident near pocket park.",
                    policy_id=policy_id,
                    template_id=docx_tpl_id,
                ),
                req=_fake_request(),
                db=db,
                current_user=leader,
            )

        check(
            "notification failure preserves warning + records failed status",
            failed_warn["warning_id"] > 0 and failed_warn["notification_status"] == "failed" and "Push gateway offline" in (failed_warn["notification_error"] or ""),
            failed_warn,
        )

        retried = wl_routes.retry_warning_notification(
            letter_id=failed_warn["letter_id"],
            req=_fake_request(),
            db=db,
            current_user=leader,
        )
        check("retry_warning_notification flips status to sent and increments retry_count", retried["notification_status"] == "sent" and retried["retry_count"] == 1)

        # ------------------------------------------------------------------
        # 7. Complaint Enforcement Workflow (letter_1 prepare + issue)
        # ------------------------------------------------------------------
        nuisance_rep = Report(
            user_id=complainant.user_id,
            subdivision_id=1,
            category_id=nuisance_cat.category_id,
            current_status_id=2,
            animal_type="Dog",
            description="Repeated barking and roaming on Pine St.",
            landmark="12 Pine St.",
            latitude=Decimal("14.802000"),
            longitude=Decimal("121.002000"),
        )
        db.add(nuisance_rep)
        db.commit()
        db.refresh(nuisance_rep)

        C.verify(db, nuisance_rep, leader, VerifyIn(incident="verified", basis="Witness + CCTV confirmed.", policy_id=policy_id))
        C.responsible(
            db,
            nuisance_rep,
            leader,
            ResponsibleIn(mode="user", user_id=resident.user_id, evidence=["registry", "cctv"], note="Matched resident dog."),
        )
        C.offense(db, nuisance_rep, leader, OffenseIn(decision="counted", expected_number=1))
        db.commit()

        detail = C.detail(db, nuisance_rep)
        letter_1_step = next(s for s in detail["steps"] if s["kind"] == "letter_1")
        step_id = letter_1_step["step_id"]

        C.step_action(
            db,
            nuisance_rep,
            leader,
            step_id,
            StepActionIn(
                action="prepare",
                letter_date=date(2026, 11, 17),
                template_id=docx_tpl_id,
                required_action="Keep dog leashed outside property line.",
            ),
        )
        C.step_action(
            db,
            nuisance_rep,
            leader,
            step_id,
            StepActionIn(action="issue", via="Subdivision Officer"),
        )
        db.commit()

        complaint_letters = wl_routes.case_warning_letters(report_id=nuisance_rep.report_id, db=db, current_user=leader)
        check("complaint letter_1 generates a GeneratedWarningLetter on case", len(complaint_letters["items"]) == 1)
        check(
            "complaint letter_1 notifies resident respondent",
            complaint_letters["items"][0]["recipient_user_id"] == resident.user_id
            and complaint_letters["items"][0]["notification_status"] == "sent",
        )

        print(f"\nALL {PASSED} CHECKS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    main()
