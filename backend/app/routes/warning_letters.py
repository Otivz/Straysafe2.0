from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pet import Pet
from app.models.report import Report
from app.models.user import User
from app.models.warning import OwnerWarning
from app.models.warning_letter import (
    GeneratedWarningLetter,
    WarningLetterTemplate,
    WarningLetterTemplateVersion,
)
from app.services import warning_letters as WL
from app.utils import case_policy
from app.utils.audit import log_activity
from app.utils.auth import get_current_user, verify_subdivision_scope
from app.utils.warning_rules import INSTRUCTIONS

templates_router = APIRouter(prefix="/warning-templates", tags=["warning-templates"])
letters_router = APIRouter(prefix="/warning-letters", tags=["warning-letters"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TemplateCreateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    warning_level: Optional[str] = Field(None, max_length=50)
    subject_template: str = Field(..., min_length=2, max_length=255)
    body_template: str = Field(..., min_length=10)
    html_template: Optional[str] = None
    is_default: bool = False
    change_note: Optional[str] = Field("Initial version", max_length=500)
    subdivision_id: Optional[int] = None


class TemplateUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    warning_level: Optional[str] = Field(None, max_length=50)
    subject_template: str = Field(..., min_length=2, max_length=255)
    body_template: str = Field(..., min_length=10)
    html_template: Optional[str] = None
    is_default: Optional[bool] = None
    change_note: Optional[str] = Field(None, max_length=500)


class TemplateStatusIn(BaseModel):
    status: Literal["active", "archived"]


class TemplatePreviewIn(BaseModel):
    template_id: Optional[int] = None
    version_id: Optional[int] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    report_id: Optional[int] = None
    warning_id: Optional[int] = None
    user_id: Optional[int] = None
    pet_id: Optional[int] = None
    recipient_name: Optional[str] = None
    recipient_address: Optional[str] = None
    warning_level: str = "1st Warning"
    violation_type: str = "Free-Roaming Unleashed"
    violation_description: Optional[str] = None
    required_action: Optional[str] = None
    policy_id: Optional[str] = None
    policy_reference: Optional[str] = None
    issue_date: Optional[datetime] = None
    summons_at: Optional[datetime] = None
    summons_place: Optional[str] = None
    field_overrides: Optional[Dict[str, str]] = None


def _staff_subdivision(user: User, subdivision_id: Optional[int] = None, write: bool = True) -> Optional[int]:
    if user.role_id == 4:
        return subdivision_id
    if user.role_id == 2:
        if not user.subdivision_id:
            raise HTTPException(status_code=403, detail="Your account is not linked to a subdivision.")
        if subdivision_id is not None and subdivision_id != user.subdivision_id:
            raise HTTPException(status_code=403, detail="You can only manage templates in your own subdivision.")
        return user.subdivision_id
    if not write and user.role_id == 3:
        return subdivision_id or user.subdivision_id
    raise HTTPException(status_code=403, detail="Only Subdivision Leaders and Administrators can manage warning letter templates.")


def _check_template_scope(user: User, tpl: WarningLetterTemplate) -> None:
    if user.role_id == 4:
        return
    if user.role_id in (2, 3) and tpl.subdivision_id in (user.subdivision_id, None):
        return
    raise HTTPException(status_code=403, detail="Access denied to this template.")


def _clear_sibling_defaults(db: Session, subdivision_id: Optional[int], warning_level: Optional[str], exclude_id: int) -> None:
    q = db.query(WarningLetterTemplate).filter(
        WarningLetterTemplate.template_id != exclude_id,
        WarningLetterTemplate.is_default.is_(True),
    )
    if subdivision_id is not None:
        q = q.filter(WarningLetterTemplate.subdivision_id == subdivision_id)
    else:
        q = q.filter(WarningLetterTemplate.subdivision_id.is_(None))
    if warning_level:
        q = q.filter(WarningLetterTemplate.warning_level == warning_level)
    else:
        q = q.filter(WarningLetterTemplate.warning_level.is_(None))
    q.update({"is_default": False}, synchronize_session=False)


# ---------------------------------------------------------------------------
# Template Management Routes
# ---------------------------------------------------------------------------
@templates_router.get("/placeholders")
def list_placeholders(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return {"placeholders": WL.PLACEHOLDER_DEFINITIONS}


@templates_router.get("")
def list_templates(
    status: str = Query("all"),
    subdivision_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    sub_id = _staff_subdivision(current_user, subdivision_id, write=False)
    WL.ensure_default_templates(db, sub_id, actor_id=current_user.user_id)
    db.commit()

    q = db.query(WarningLetterTemplate)
    if sub_id is not None:
        q = q.filter(WarningLetterTemplate.subdivision_id == sub_id)
    if status in ("active", "archived"):
        q = q.filter(WarningLetterTemplate.status == status)
    rows = q.order_by(WarningLetterTemplate.is_default.desc(), WarningLetterTemplate.updated_at.desc()).all()
    return {"items": [WL.serialize_template(t, db) for t in rows]}


@templates_router.get("/{template_id}")
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _staff_subdivision(current_user, write=False)
    tpl = db.get(WarningLetterTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Warning letter template not found.")
    _check_template_scope(current_user, tpl)
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.post("", status_code=201)
def create_template(
    body: TemplateCreateIn,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    sub_id = _staff_subdivision(current_user, body.subdivision_id, write=True)
    level = (body.warning_level or "").strip() or None
    tpl = WarningLetterTemplate(
        subdivision_id=sub_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        warning_level=level,
        source_type="editor",
        status="active",
        is_default=body.is_default,
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    db.add(tpl)
    db.flush()

    ver = WarningLetterTemplateVersion(
        template_id=tpl.template_id,
        version_number=1,
        subject_template=body.subject_template.strip(),
        body_template=body.body_template.strip(),
        html_template=body.html_template or WL.render_html_document(
            body.subject_template.strip(), body.body_template.strip(), "{{warning_reference}}", "{{case_reference}}"
        ),
        placeholders_used=WL.extract_placeholders(body.subject_template, body.body_template),
        change_note=(body.change_note or "Initial version").strip(),
        created_by=current_user.user_id,
    )
    db.add(ver)
    db.flush()
    tpl.current_version_id = ver.version_id
    if tpl.is_default:
        _clear_sibling_defaults(db, sub_id, level, tpl.template_id)

    log_activity(
        db=db,
        action="WARNING_TEMPLATE_CREATED",
        target_table="warning_letter_templates",
        target_id=tpl.template_id,
        description=f"{current_user.name} created warning letter template '{tpl.name}' (v1).",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.post("/import-docx", status_code=201)
async def import_docx_template(
    req: Request,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    warning_level: Optional[str] = Form(None),
    is_default: bool = Form(False),
    template_id: Optional[int] = Form(None),
    change_note: Optional[str] = Form(None),
    subdivision_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    sub_id = _staff_subdivision(current_user, subdivision_id, write=True)
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="DOCX file is too large (max 5 MB).")

    parsed = WL.parse_docx_bytes(raw)
    fname = (file.filename or "warning_template.docx").strip()
    level = (warning_level or "").strip() or None

    if template_id is not None:
        tpl = db.get(WarningLetterTemplate, template_id)
        if tpl is None:
            raise HTTPException(status_code=404, detail="Target template not found.")
        _check_template_scope(current_user, tpl)
        latest = (
            db.query(WarningLetterTemplateVersion)
            .filter(WarningLetterTemplateVersion.template_id == tpl.template_id)
            .order_by(WarningLetterTemplateVersion.version_number.desc())
            .first()
        )
        next_ver = (latest.version_number + 1) if latest else 1
        tpl.source_type = "docx_import"
        tpl.updated_by = current_user.user_id
    else:
        base_name = (name or fname.rsplit(".", 1)[0] or "Imported DOCX Template").strip()
        tpl = WarningLetterTemplate(
            subdivision_id=sub_id,
            name=base_name[:150],
            description=(description or f"Imported from {fname}").strip()[:500],
            warning_level=level,
            source_type="docx_import",
            status="active",
            is_default=is_default,
            created_by=current_user.user_id,
            updated_by=current_user.user_id,
        )
        db.add(tpl)
        db.flush()
        next_ver = 1

    ver = WarningLetterTemplateVersion(
        template_id=tpl.template_id,
        version_number=next_ver,
        subject_template=parsed["subject_template"],
        body_template=parsed["body_template"],
        html_template=parsed["html_template"],
        source_filename=fname[:255],
        source_docx_bytes=raw,
        placeholders_used=parsed["placeholders_used"],
        change_note=(change_note or f"Imported from DOCX ({fname})").strip()[:500],
        created_by=current_user.user_id,
    )
    db.add(ver)
    db.flush()
    tpl.current_version_id = ver.version_id
    if tpl.is_default:
        _clear_sibling_defaults(db, tpl.subdivision_id, tpl.warning_level, tpl.template_id)

    log_activity(
        db=db,
        action="WARNING_TEMPLATE_DOCX_IMPORTED",
        target_table="warning_letter_templates",
        target_id=tpl.template_id,
        description=f"{current_user.name} imported DOCX '{fname}' into template '{tpl.name}' (v{next_ver}).",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.put("/{template_id}")
def update_template(
    template_id: int,
    body: TemplateUpdateIn,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _staff_subdivision(current_user, write=True)
    tpl = db.get(WarningLetterTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Warning letter template not found.")
    _check_template_scope(current_user, tpl)

    latest = (
        db.query(WarningLetterTemplateVersion)
        .filter(WarningLetterTemplateVersion.template_id == tpl.template_id)
        .order_by(WarningLetterTemplateVersion.version_number.desc())
        .first()
    )
    next_ver = (latest.version_number + 1) if latest else 1

    if body.name is not None:
        tpl.name = body.name.strip()
    if body.description is not None:
        tpl.description = body.description.strip() or None
    if body.warning_level is not None:
        tpl.warning_level = body.warning_level.strip() or None
    if body.is_default is not None:
        tpl.is_default = body.is_default
    tpl.updated_by = current_user.user_id

    subj = body.subject_template.strip()
    btxt = body.body_template.strip()
    ver = WarningLetterTemplateVersion(
        template_id=tpl.template_id,
        version_number=next_ver,
        subject_template=subj,
        body_template=btxt,
        html_template=body.html_template or WL.render_html_document(subj, btxt, "{{warning_reference}}", "{{case_reference}}"),
        placeholders_used=WL.extract_placeholders(subj, btxt),
        change_note=(body.change_note or f"Edited in template editor (v{next_ver})").strip(),
        created_by=current_user.user_id,
    )
    db.add(ver)
    db.flush()
    tpl.current_version_id = ver.version_id
    if tpl.is_default and tpl.status == "active":
        _clear_sibling_defaults(db, tpl.subdivision_id, tpl.warning_level, tpl.template_id)

    log_activity(
        db=db,
        action="WARNING_TEMPLATE_UPDATED",
        target_table="warning_letter_templates",
        target_id=tpl.template_id,
        description=f"{current_user.name} updated template '{tpl.name}' to v{next_ver}.",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.post("/{template_id}/set-default")
def set_default_template(
    template_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _staff_subdivision(current_user, write=True)
    tpl = db.get(WarningLetterTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Warning letter template not found.")
    _check_template_scope(current_user, tpl)
    if tpl.status != "active":
        raise HTTPException(status_code=409, detail="Activate the template before setting it as default.")

    tpl.is_default = True
    tpl.updated_by = current_user.user_id
    _clear_sibling_defaults(db, tpl.subdivision_id, tpl.warning_level, tpl.template_id)

    log_activity(
        db=db,
        action="WARNING_TEMPLATE_DEFAULT_SET",
        target_table="warning_letter_templates",
        target_id=tpl.template_id,
        description=f"{current_user.name} set '{tpl.name}' as the default warning letter template.",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.post("/{template_id}/status")
def set_template_status(
    template_id: int,
    body: TemplateStatusIn,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _staff_subdivision(current_user, write=True)
    tpl = db.get(WarningLetterTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Warning letter template not found.")
    _check_template_scope(current_user, tpl)

    if body.status == "archived" and tpl.is_default:
        active_general = (
            db.query(WarningLetterTemplate)
            .filter(
                WarningLetterTemplate.subdivision_id == tpl.subdivision_id,
                WarningLetterTemplate.template_id != tpl.template_id,
                WarningLetterTemplate.status == "active",
            )
            .count()
        )
        if active_general == 0:
            raise HTTPException(status_code=409, detail="At least one active warning letter template must remain available.")
        tpl.is_default = False

    tpl.status = body.status
    tpl.updated_by = current_user.user_id
    log_activity(
        db=db,
        action="WARNING_TEMPLATE_ARCHIVED" if body.status == "archived" else "WARNING_TEMPLATE_ACTIVATED",
        target_table="warning_letter_templates",
        target_id=tpl.template_id,
        description=f"{current_user.name} set template '{tpl.name}' status to {body.status}.",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    return WL.serialize_template(tpl, db, include_versions=True)


@templates_router.post("/preview")
def preview_template(
    body: TemplatePreviewIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    sub_id = _staff_subdivision(current_user, write=False)
    rep = db.get(Report, body.report_id) if body.report_id else None
    if rep is not None:
        verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
        sub_id = rep.subdivision_id

    owner = db.get(User, body.user_id) if body.user_id else (
        db.get(User, rep.ownership_owner_id) if (rep and rep.ownership_owner_id) else None
    )
    pet = db.get(Pet, body.pet_id) if body.pet_id else (
        db.get(Pet, rep.pet_id) if (rep and rep.pet_id) else None
    )

    if body.subject_template is not None and body.body_template is not None:
        subj_tpl, body_tpl = body.subject_template, body.body_template
        tpl_meta = None
    else:
        if body.version_id:
            ver = db.get(WarningLetterTemplateVersion, body.version_id)
            if ver is None:
                raise HTTPException(status_code=404, detail="Template version not found.")
            tpl = db.get(WarningLetterTemplate, ver.template_id)
            if tpl is None:
                raise HTTPException(status_code=404, detail="Template not found.")
            _check_template_scope(current_user, tpl)
        else:
            tpl, ver = WL.resolve_template_for_issuance(db, sub_id, body.template_id, body.warning_level, actor_id=current_user.user_id)
            db.commit()
        subj_tpl, body_tpl = ver.subject_template, ver.body_template
        tpl_meta = {"template_id": tpl.template_id, "name": tpl.name, "version_number": ver.version_number}

    policy_ref = (body.policy_reference or "").strip()
    obs_days = None
    if not policy_ref and sub_id:
        settings = case_policy.load_settings(db, sub_id)
        if body.policy_id:
            pol = next((p for p in settings.policies if p.id == body.policy_id), None)
            if pol:
                policy_ref = f"{pol.reference} — {pol.title}" if pol.reference else pol.title
                obs_days = pol.observation_days
        elif len(settings.policies) == 1:
            pol = settings.policies[0]
            policy_ref = f"{pol.reference} — {pol.title}" if pol.reference else pol.title
            obs_days = pol.observation_days

    req_action = (body.required_action or "").strip() or INSTRUCTIONS.get(body.violation_type, "")
    viol_desc = (body.violation_description or "").strip() or (rep.description if rep else "") or ""

    ctx = WL.build_letter_context(
        db=db,
        subdivision_id=sub_id,
        report=rep,
        owner=owner,
        recipient_name=body.recipient_name,
        recipient_address=body.recipient_address,
        pet=pet,
        issuer=current_user,
        warning_level=body.warning_level,
        violation_description=viol_desc,
        required_action=req_action,
        policy_reference=policy_ref,
        warning_reference="WARN-PREVIEW",
        issue_date=body.issue_date or datetime.now(),
        observation_days=obs_days,
        summons_at=body.summons_at,
        summons_place=body.summons_place,
        overrides=body.field_overrides,
    )
    rendered = WL.render_preview(subj_tpl, body_tpl, ctx)
    if tpl_meta:
        rendered["template"] = tpl_meta
    return rendered


# ---------------------------------------------------------------------------
# Generated Warning Letters Routes (Staff & Resident)
# ---------------------------------------------------------------------------
def _authorize_letter_read(db: Session, letter: GeneratedWarningLetter, user: User) -> None:
    if user.role_id == 1:
        if letter.recipient_user_id != user.user_id:
            raise HTTPException(status_code=403, detail="You can only view warning letters issued to your account.")
        return
    if user.role_id == 4:
        return
    if user.role_id in (2, 3):
        if letter.subdivision_id:
            verify_subdivision_scope(user, letter.subdivision_id, db=db)
            return
        if letter.report_id:
            rep = db.get(Report, letter.report_id)
            if rep is not None:
                verify_subdivision_scope(user, rep.subdivision_id, db=db)
                return
        return
    raise HTTPException(status_code=403, detail="Access denied.")


@letters_router.get("/mine")
def my_warning_letters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    rows = (
        db.query(GeneratedWarningLetter)
        .filter(GeneratedWarningLetter.recipient_user_id == current_user.user_id)
        .order_by(GeneratedWarningLetter.issued_at.desc(), GeneratedWarningLetter.letter_id.desc())
        .all()
    )
    return {"items": [WL.serialize_letter(row, db) for row in rows]}


@letters_router.get("/case/{report_id}")
def case_warning_letters(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    rep = db.get(Report, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Case report not found.")
    q = db.query(GeneratedWarningLetter).filter(GeneratedWarningLetter.report_id == report_id)
    if current_user.role_id == 1:
        q = q.filter(GeneratedWarningLetter.recipient_user_id == current_user.user_id)
    elif current_user.role_id in (2, 3):
        verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
    elif current_user.role_id != 4:
        raise HTTPException(status_code=403, detail="Access denied.")
    rows = q.order_by(GeneratedWarningLetter.issued_at.desc(), GeneratedWarningLetter.letter_id.desc()).all()
    return {"items": [WL.serialize_letter(row, db) for row in rows]}


@letters_router.get("/{letter_id}")
def get_warning_letter(
    letter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    letter = db.get(GeneratedWarningLetter, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Warning letter not found.")
    _authorize_letter_read(db, letter, current_user)
    if WL.mark_letter_viewed(db, letter, current_user):
        db.commit()
        db.refresh(letter)
    return WL.serialize_letter(letter, db)


@letters_router.get("/{letter_id}/download")
def download_warning_letter(
    letter_id: int,
    format: Literal["pdf", "docx"] = Query("pdf"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    letter = db.get(GeneratedWarningLetter, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Warning letter not found.")
    _authorize_letter_read(db, letter, current_user)
    if WL.mark_letter_viewed(db, letter, current_user):
        db.commit()

    safe_ref = letter.warning_reference.replace(" ", "_")
    if format == "docx":
        data = WL.render_letter_docx(letter, db)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_ref}.docx"'},
        )
    data = WL.render_letter_pdf(letter, db)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_ref}.pdf"'},
    )


@letters_router.post("/{letter_id}/retry-notification")
def retry_warning_notification(
    letter_id: int,
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _staff_subdivision(current_user, write=True)
    letter = db.get(GeneratedWarningLetter, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Warning letter not found.")
    if letter.subdivision_id:
        verify_subdivision_scope(current_user, letter.subdivision_id, db=db)

    if letter.recipient_user_id is None:
        raise HTTPException(status_code=409, detail="This warning recipient does not have a StraySafe account to notify.")

    owner = db.get(User, letter.recipient_user_id)
    pet = db.get(Pet, letter.pet_id) if letter.pet_id else None
    warn = db.get(OwnerWarning, letter.warning_id) if letter.warning_id else None
    letter.retry_count = (letter.retry_count or 0) + 1
    letter.last_retry_at = datetime.now()

    WL.deliver_warning_notification(
        db=db,
        letter=letter,
        owner=owner,
        pet=pet,
        violation_type=warn.violation_type if warn else "Subdivision Policy Violation",
        description=(letter.placeholders_json or {}).get("violation_description") or letter.rendered_subject,
    )
    log_activity(
        db=db,
        action="WARNING_NOTIFICATION_RETRIED",
        target_table="generated_warning_letters",
        target_id=letter.letter_id,
        description=f"{current_user.name} retried notification for {letter.warning_reference} (status: {letter.notification_status}).",
        user_id=current_user.user_id,
        log_type="operation",
        request=req,
        commit=False,
    )
    db.commit()
    db.refresh(letter)
    return WL.serialize_letter(letter, db)
