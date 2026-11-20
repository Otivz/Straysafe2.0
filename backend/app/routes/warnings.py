from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.warning import OwnerWarning
from app.models.user import User
from app.models.pet import Pet
from app.models.report import Report, StatusHistory
from app.models.notification import Notification
from app.models.warning_letter import GeneratedWarningLetter, WarningLetterTemplate
from app.schemas.warning import WarningCreate, WarningResponse
from app.utils.auth import get_current_user, verify_subdivision_scope
from app.utils.audit import log_activity
from app.utils.case_groups import require_case_pet
from app.utils.warning_rules import (check_tier_for_incident, require_can_issue, require_warning_eligible,
                                     observation_days_for, visible_warnings, suggest_tier, followup_incidents,
                                     INSTRUCTIONS)
from app.utils import case_state
from app.utils import case_vocab as V
from app.utils.notification_dispatcher import dispatch_notification
from app.services import email_templates
from app.services import warning_letters as WL

router = APIRouter(
    prefix="/warnings",
    tags=["warnings"]
)

def enrich_warning_dict(warning: OwnerWarning, db: Session) -> dict:
    owner = db.query(User).filter(User.user_id == warning.user_id).first()
    issuer = db.query(User).filter(User.user_id == warning.issued_by).first()
    pet = db.query(Pet).filter(Pet.pet_id == warning.pet_id).first() if warning.pet_id else None
    report = db.query(Report).filter(Report.report_id == warning.report_id).first() if warning.report_id else None

    issuer_role_name = "Community Official"
    if issuer:
        if issuer.role_id == 2:
            issuer_role_name = "Subdivision Leader"
        elif issuer.role_id == 3:
            issuer_role_name = "Barangay Staff"
        elif issuer.role_id == 4:
            issuer_role_name = "Administrator"

    report_photo = None
    if report and hasattr(report, "media") and report.media and len(report.media) > 0:
        report_photo = report.media[0].file_url

    letter = (
        db.query(GeneratedWarningLetter)
        .filter(GeneratedWarningLetter.warning_id == warning.warning_id)
        .order_by(GeneratedWarningLetter.letter_id.desc())
        .first()
    )

    import json
    docs = []
    if warning.supporting_documents:
        try:
            parsed = json.loads(warning.supporting_documents)
            if isinstance(parsed, list):
                docs = parsed
        except Exception:
            docs = []

    return {
        "warning_id": warning.warning_id,
        "user_id": warning.user_id,
        "pet_id": warning.pet_id,
        "report_id": warning.report_id,
        "issued_by": warning.issued_by,
        "warning_level": warning.warning_level,
        "violation_type": warning.violation_type,
        "warning_type": warning.warning_category or warning.violation_type,
        "warning_category": warning.warning_category or warning.violation_type,
        "warning_subject": warning.warning_subject or (letter.rendered_subject if letter else f"{warning.warning_level}: {warning.violation_type}"),
        "description": warning.description,
        "warning_reason": warning.description,
        "additional_details": warning.additional_details,
        "supporting_documents": docs,
        "admin_notes": warning.admin_notes,
        "workflow_status": warning.workflow_status or ("Acknowledged" if warning.status == "Acknowledged" else "Sent"),
        "owner_response": warning.owner_response,
        "owner_responded_at": warning.owner_responded_at,
        "thread_id": warning.thread_id,
        "fine_amount": float(warning.fine_amount) if warning.fine_amount is not None else 0.0,
        "status": warning.status,
        "acknowledged_at": warning.acknowledged_at,
        "created_at": warning.created_at,
        "issued_at": warning.created_at,
        "policy_id": warning.policy_id,
        "policy_title": warning.policy_title,
        "policy_reference": warning.policy_reference,
        "observation_days": warning.observation_days,
        "follow_up_at": warning.follow_up_at,
        "owner_name": owner.name if owner else "Unknown Owner",
        "owner_phone": owner.phone if owner else None,
        "pet_name": pet.display_name if pet else (getattr(report, 'pet_name', None) if report else None),
        "pet_id_display": f"PET-{str(pet.pet_id).zfill(5)}" if pet else (f"PET-{str(warning.pet_id).zfill(5)}" if warning.pet_id else None),
        "report_ref_display": f"#REPORT-{report.created_at.year}-{str(report.report_id).zfill(5)}" if (report and report.created_at) else (f"#REPORT-{str(warning.report_id).zfill(5)}" if warning.report_id else None),
        "issuer_name": issuer.name if issuer else "Community Official",
        "issuer_role": issuer_role_name,
        "report_landmark": report.landmark if report else None,
        "report_animal_type": report.animal_type if report else None,
        "report_photo": report_photo,
        "letter_id": letter.letter_id if letter else None,
        "warning_reference": letter.warning_reference if letter else f"WARN-{warning.warning_id:04d}",
        "template_id": letter.template_id if letter else None,
        "template_name": letter.template_name if letter else None,
        "template_version_number": letter.template_version_number if letter else None,
        "rendered_subject": letter.rendered_subject if letter else warning.warning_subject,
        "rendered_body": letter.rendered_body if letter else warning.description,
        "notification_status": letter.notification_status if letter else "delivered",
        "notification_error": letter.notification_error if letter else None,
        "viewed_at": letter.viewed_at if letter else None,
    }


CATEGORY_TO_VIOLATION = {
    "Pet Roaming Without Supervision": "Free-Roaming Unleashed",
    "Pet Causing Disturbance": "Nuisance / Aggressive Behavior",
    "Aggressive or Dangerous Animal Behavior": "Nuisance / Aggressive Behavior",
    "Pet Involved in an Incident": "Nuisance / Aggressive Behavior",
    "Responsible Pet Ownership Reminder": "Other",
    "Other": "Other",
}


@router.post("/", response_model=WarningResponse)
def issue_warning(
    warning_in: WarningCreate,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import json
    from app.schemas.case import PolicyIn
    from app.utils import case_policy

    if current_user.role_id not in (2, 4):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an authorized Subdivision Admin can issue official warnings."
        )

    if warning_in.client_request_id:
        existing_w = (
            db.query(OwnerWarning)
            .filter(
                OwnerWarning.client_request_id == warning_in.client_request_id,
                OwnerWarning.issued_by == current_user.user_id,
            )
            .first()
        )
        if existing_w is not None:
            return enrich_warning_dict(existing_w, db)

    # Normalize category, violation_type, subject, and message
    raw_cat = (warning_in.warning_category or warning_in.violation_type or "Pet Roaming Without Supervision").strip()
    if warning_in.violation_type:
        resolved_violation = warning_in.violation_type
    else:
        resolved_violation = CATEGORY_TO_VIOLATION.get(raw_cat, "Other")  # type: ignore
    warning_in.violation_type = resolved_violation  # type: ignore

    msg_body = (warning_in.warning_message or warning_in.description or "").strip()
    if len(msg_body) < 5:
        raise HTTPException(status_code=422, detail="Please enter a warning message (at least 5 characters).")
    warning_in.description = msg_body

    # Validate target resident
    owner = db.query(User).filter(User.user_id == warning_in.user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Target pet owner not found")

    rep = None
    if warning_in.report_id:
        rep = db.query(Report).filter(Report.report_id == warning_in.report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Associated incident report not found")

        # A case in the operating statuses of the retired Barangay rescue workflow (rescue in progress, picked up,
        # approved) is no longer the subdivision's to warn on. A referral is NOT that: it is a case detail, so a case
        # referred to the Barangay or anyone else can still be warned (status 4 does not block a warning).
        if rep.current_status_id in [5, 6, 13]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot issue subdivision warning for an animal case that has already been escalated to Barangay."
            )

        # Link pet_id if not already set on report
        if rep.pet_id and not warning_in.pet_id:
            from app.utils.case_groups import pet_link_trusted
            if not pet_link_trusted(rep):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This report's pet identity was inherited from a merged case and hasn't been re-checked. "
                           "Re-check the identity on the report (or choose the pet explicitly) before issuing a warning.",
                )
            warning_in.pet_id = rep.pet_id

    pet = db.query(Pet).filter(Pet.pet_id == warning_in.pet_id).first() if warning_in.pet_id else None
    if warning_in.pet_id and pet is None:
        raise HTTPException(status_code=404, detail="Registered pet not found")
    # Authorized Subdivision Admin, handling the report, warning the registered pet's actual owner
    require_can_issue(db, current_user, owner, rep, pet)
    if case_state.is_closed(rep):
        raise HTTPException(status_code=409, detail="The case is closed. Reopen it before issuing a warning.")

    # When warning a registered pet's owner directly (Send Warning action), resolve policy gracefully
    try:
        policy = require_warning_eligible(db, rep, owner, warning_in.policy_id)
    except HTTPException:
        if pet is not None and pet.owner_id == owner.user_id:
            settings = case_policy.load_settings(db, rep.subdivision_id)
            confirmed_pols = [p for p in settings.policies if p.status == "confirmed"]
            chosen_pol = next((p for p in confirmed_pols if p.id == warning_in.policy_id), None) or (confirmed_pols[0] if confirmed_pols else None)
            if chosen_pol is not None:
                policy = chosen_pol
            else:
                policy = PolicyIn(
                    id="responsible-pet-ownership",
                    title="Responsible Pet Ownership Policy",
                    reference="Subdivision Policy §1",
                    summary="Registered pet owners must supervise and care for their pets responsibly.",
                    applies_to=["nuisance", "safety", "other"],
                    status="confirmed",
                    observation_days=None,
                )
        else:
            raise

    # Resolve a default template if template_id was not explicitly passed
    sub_id_for_tpl = rep.subdivision_id if rep else current_user.subdivision_id
    if not warning_in.template_id:
        active_tpls = (
            db.query(WarningLetterTemplate)
            .filter(
                WarningLetterTemplate.status == "active",
                WarningLetterTemplate.subdivision_id.in_([sub_id_for_tpl, None]),
            )
            .order_by(WarningLetterTemplate.is_default.desc(), WarningLetterTemplate.template_id.asc())
            .all()
        )
        if not active_tpls and sub_id_for_tpl:
            WL.seed_standard_templates(db.connection(), sub_id_for_tpl, actor_id=current_user.user_id)
            active_tpls = (
                db.query(WarningLetterTemplate)
                .filter(
                    WarningLetterTemplate.status == "active",
                    WarningLetterTemplate.subdivision_id.in_([sub_id_for_tpl, None]),
                )
                .order_by(WarningLetterTemplate.is_default.desc(), WarningLetterTemplate.template_id.asc())
                .all()
            )
        chosen_tpl = next(
            (t for t in active_tpls if t.warning_level == warning_in.warning_level),
            next((t for t in active_tpls if WL.template_fits_level(t, warning_in.warning_level)), active_tpls[0] if active_tpls else None),
        )
        if chosen_tpl:
            warning_in.template_id = chosen_tpl.template_id

    merged_overrides = dict(warning_in.field_overrides or {})
    if not owner.address and not merged_overrides.get("resident_address"):
        merged_overrides["resident_address"] = (pet.registered_address if pet and pet.registered_address else (rep.landmark if rep and rep.landmark else "Subdivision Resident"))
    if warning_in.warning_level == "2nd Warning":
        merged_overrides.setdefault("summons_date", "Within 3 business days")
        merged_overrides.setdefault("summons_place", "Subdivision Administration Office")
    warning_in.field_overrides = merged_overrides

    WL.validate_letter_ready(
        db=db,
        subdivision_id=sub_id_for_tpl,
        report=rep,
        owner=owner,
        recipient_name=owner.name,
        recipient_address=owner.address or merged_overrides.get("resident_address"),
        pet=pet,
        issuer=current_user,
        warning_level=warning_in.warning_level,
        policy_reference=f"{policy.reference} — {policy.title}" if policy.reference else policy.title,
        violation_description=warning_in.description,
        required_action=(warning_in.required_action or warning_in.additional_details or "").strip() or INSTRUCTIONS.get(warning_in.violation_type, INSTRUCTIONS["Other"]),
        template_id=warning_in.template_id,
        observation_days=policy.observation_days,
        overrides=warning_in.field_overrides,
        issue_date=warning_in.issue_date,
        enforce_level_match=False,
    )
    # Only enforce strict tier-ladder lock when warning_category is not a custom Send Warning message
    if not warning_in.warning_subject:
        check_tier_for_incident(db, rep.report_id, warning_in.violation_type, warning_in.pet_id, warning_in.warning_level)
    if pet is not None and not rep.pet_id:
        rep.pet_id = pet.pet_id

    # The observation period is the policy's. A policy that defines none means no observation period: none is assumed.
    observation_days = policy.observation_days
    wf_status = (warning_in.workflow_status or "Sent").strip()
    docs_json = json.dumps(warning_in.supporting_documents) if warning_in.supporting_documents else None
    subj_str = (warning_in.warning_subject or "").strip() or f"Official {warning_in.warning_level}: {raw_cat}"

    new_warning = OwnerWarning(
        user_id=warning_in.user_id,
        pet_id=warning_in.pet_id,
        report_id=warning_in.report_id,
        issued_by=current_user.user_id,
        warning_level=warning_in.warning_level,
        violation_type=warning_in.violation_type,
        warning_category=raw_cat,
        warning_subject=subj_str,
        description=warning_in.description,
        additional_details=(warning_in.additional_details or "").strip() or None,
        supporting_documents=docs_json,
        admin_notes=(warning_in.admin_notes or "").strip() or None,
        workflow_status=wf_status,
        client_request_id=(warning_in.client_request_id or "").strip() or None,
        fine_amount=warning_in.fine_amount or 0.0,
        status="Pending",
        policy_id=policy.id,
        policy_title=policy.title,
        policy_reference=policy.reference,
        observation_days=observation_days,
    )
    if warning_in.issue_date:
        new_warning.created_at = warning_in.issue_date.replace(tzinfo=None) if warning_in.issue_date.tzinfo else warning_in.issue_date
    db.add(new_warning)
    db.flush()

    # Add Pet History / Report Activity event to StatusHistory
    issuer_role_title = "Subdivision Leader" if current_user.role_id == 2 else ("Barangay Staff" if current_user.role_id == 3 else "Administrator")
    if warning_in.report_id and rep:
        pet_info = f" for pet '{pet.display_name}'" if pet else ""
        hist_remarks = f"⚠️ WARNING ISSUED: Official {warning_in.warning_level}{pet_info} issued for '{warning_in.violation_type}' by {current_user.name} ({issuer_role_title}). Reason: {warning_in.description}"
        warning_history = StatusHistory(
            report_id=warning_in.report_id,
            report_status_id=rep.current_status_id or 2,
            updated_by=current_user.user_id,
            remarks=hist_remarks,
        )
        db.add(warning_history)

        # Under Observation upon the First Warning, for the period the confirmed policy defines. A policy that defines
        # no period means no observation: nothing is started and no number of days is assumed.
        from app.models.owner_followup import OwnerFollowUp
        from datetime import timedelta
        days_label = (f"{observation_days} day{'s' if observation_days != 1 else ''}") if observation_days else None

        existing_followup = db.query(OwnerFollowUp).filter(
            OwnerFollowUp.report_id == rep.report_id
        ).first()

        prior_warnings_count = db.query(OwnerWarning).filter(
            OwnerWarning.report_id == rep.report_id,
            OwnerWarning.warning_id != new_warning.warning_id
        ).count()
        is_first_warning = (warning_in.warning_level in ("1st Warning", "Notice")) or (prior_warnings_count == 0)

        # The warning's time is on the database clock (local); follow-up due dates are kept in UTC like _now() (F18)
        from app.utils.db_clock import db_now
        from app.utils.owner_followups import db_local_to_utc
        warning_ts = new_warning.created_at or db_now(db)
        warning_ts_utc = db_local_to_utc(db, warning_ts)

        # One open observation per pet (Phase 3): a warning on a logged repeat stays under the observation already open
        pet_for_obs = rep.pet_id or warning_in.pet_id
        open_for_pet = db.query(OwnerFollowUp).filter(
            OwnerFollowUp.pet_id == pet_for_obs, OwnerFollowUp.status == "observing"
        ).first() if pet_for_obs else None

        if observation_days and not existing_followup and is_first_warning and open_for_pet is None:
            followup_due = warning_ts_utc + timedelta(days=observation_days)
            followup_due_local = warning_ts + timedelta(days=observation_days)  # for the message, on the clock the owner reads
            new_warning.follow_up_at = followup_due_local
            auto_followup = OwnerFollowUp(
                report_id=rep.report_id,
                pet_id=rep.pet_id or warning_in.pet_id,
                subdivision_id=rep.subdivision_id or current_user.subdivision_id,
                leader_id=current_user.user_id,
                owner_id=warning_in.user_id,
                owner_name=getattr(owner, 'name', None) or "Identified Owner",
                owner_phone=getattr(owner, 'phone', None),
                owner_address=getattr(owner, 'address', None) or getattr(rep, 'landmark', None),
                status="observing",
                duration_days=observation_days,
                due_at=followup_due,
                notes=f"Automatic {days_label} observation under {policy.reference}, started with the First Warning ({warning_in.violation_type}): {warning_in.description}",
                created_at=warning_ts
            )
            db.add(auto_followup)

            rep.current_status_id = 7
            from app.utils.owner_followups import record_observation_event
            record_observation_event(db, auto_followup, "started", current_user.user_id)

            dispatch_notification(
                db=db,
                user_id=warning_in.user_id,
                related_id=rep.report_id,
                title=f"🐾 {observation_days}-Day Observation Period Started",
                message=(
                    f"Because a First Warning was issued for Report #{rep.report_id}, your animal is now under a {days_label} observation "
                    f"until {followup_due_local.strftime('%b %d, %Y %I:%M %p')}. Please address the reported violation and submit "
                    "observation updates with photo evidence from your account (Observation Updates)."
                ),
                notification_type="followup_started",
            )
        elif observation_days and existing_followup and is_first_warning and existing_followup.status != "observing":
            existing_followup.status = "observing"
            existing_followup.created_at = warning_ts
            existing_followup.duration_days = observation_days
            existing_followup.due_at = warning_ts_utc + timedelta(days=observation_days)
            new_warning.follow_up_at = warning_ts + timedelta(days=observation_days)
            rep.current_status_id = 7
            from app.utils.owner_followups import record_observation_event
            record_observation_event(db, existing_followup, "started", current_user.user_id)
        elif existing_followup and warning_in.warning_level == "2nd Warning":
            existing_followup.notes = (existing_followup.notes or "") + f" | Second Warning issued ({warning_in.violation_type}): {warning_in.description}"
            obs_history = StatusHistory(
                report_id=rep.report_id,
                report_status_id=7,
                updated_by=current_user.user_id,
                remarks=f"⚠️ Second Warning Issued by {current_user.name}: {warning_in.violation_type} - {warning_in.description}. Eligible for Barangay Endorsement.",
            )
            db.add(obs_history)
        # A warning is case work: the case moves to In progress (never backward, never out of Closed)
        case_state.advance_status(rep, V.IN_PROGRESS)

    # Generate immutable warning letter snapshot from template, then dispatch notification with tracking
    policy_ref_str = f"{policy.reference} — {policy.title}" if policy.reference else policy.title
    req_action = (warning_in.required_action or warning_in.additional_details or "").strip() or INSTRUCTIONS.get(warning_in.violation_type, INSTRUCTIONS["Other"])
    first_doc = warning_in.supporting_documents[0] if warning_in.supporting_documents else None
    letter = WL.create_generated_letter(
        db=db,
        subdivision_id=rep.subdivision_id if rep else current_user.subdivision_id,
        report=rep,
        owner=owner,
        recipient_name=owner.name,
        recipient_address=owner.address or (warning_in.field_overrides or {}).get("resident_address"),
        pet=pet,
        issuer=current_user,
        warning_level=warning_in.warning_level,
        policy_id=policy.id,
        policy_reference=policy_ref_str,
        violation_description=warning_in.description,
        required_action=req_action,
        template_id=warning_in.template_id,
        warning=new_warning,
        observation_days=observation_days,
        overrides=warning_in.field_overrides,
        attachment_url=first_doc.get("url") if isinstance(first_doc, dict) else None,
        attachment_name=first_doc.get("name") if isinstance(first_doc, dict) else None,
        letter_date=warning_in.issue_date,
        enforce_level_match=False,
    )
    custom_subj = (warning_in.warning_subject or "").strip()
    custom_msg = (warning_in.warning_message or "").strip()
    if custom_subj:
        custom_subj = custom_subj.replace("WARN-PREVIEW", letter.warning_reference).replace("{{warning_reference}}", letter.warning_reference)
        letter.rendered_subject = custom_subj
        new_warning.warning_subject = custom_subj
    if custom_msg:
        custom_msg = custom_msg.replace("WARN-PREVIEW", letter.warning_reference).replace("{{warning_reference}}", letter.warning_reference)
        extra_block = f"\n\nAdditional Details:\n{warning_in.additional_details.strip()}" if (warning_in.additional_details and warning_in.additional_details.strip()) else ""
        letter.rendered_body = f"{custom_msg}{extra_block}"
        new_warning.description = custom_msg
    if custom_subj or custom_msg:
        sub_name_for_html = str((letter.placeholders_json or {}).get("subdivision_name") or "Subdivision Office")
        letter.rendered_html = WL.render_html_document(
            letter.rendered_subject,
            letter.rendered_body,
            letter.warning_reference,
            letter.case_reference,
            sub_name_for_html,
        )
    db.flush()

    if wf_status != "Draft":
        WL.deliver_warning_notification(
            db=db,
            letter=letter,
            owner=owner,
            pet=pet,
            violation_type=raw_cat,
            description=warning_in.description,
            dispatcher_fn=dispatch_notification,
        )
        # Ensure the notification points directly to this warning letter so clicking opens /resident-app/warnings/{letter_id}
        if letter.notification_id:
            notif_row = db.get(Notification, letter.notification_id)
            if notif_row is not None:
                notif_row.type = "warning_letter"
                notif_row.related_id = letter.letter_id
                notif_row.title = f"Official Warning ({letter.warning_reference}): {letter.rendered_subject}"[:255]
                notif_row.message = (
                    "You have received an official warning from Subdivision Administration. "
                    f"Subject: {letter.rendered_subject}. Open the warning letter to read, download and acknowledge it: "
                    f"/resident-app/warnings/{letter.letter_id}"
                )[:1000]

        # Also deliver the warning into the owner's Resident Inbox conversation so it appears in Messages as well
        if rep is not None:
            try:
                from app.services import case_messaging as CM, owner_verification as OV
                if pet is not None:
                    t = OV._verification_thread(db, rep, pet, owner.user_id, current_user)
                else:
                    from app.models.case_messaging import CaseMessageMember, CaseMessageThread
                    t = (
                        db.query(CaseMessageThread)
                        .join(CaseMessageMember, CaseMessageMember.thread_id == CaseMessageThread.thread_id)
                        .filter(
                            CaseMessageThread.kind == "direct",
                            CaseMessageThread.report_id == rep.report_id,
                            CaseMessageThread.status == "open",
                            CaseMessageMember.user_id == owner.user_id,
                        )
                        .first()
                    )
                    if t is None:
                        t = CaseMessageThread(
                            subdivision_id=rep.subdivision_id,
                            kind="direct",
                            report_id=rep.report_id,
                            subject=f"Official Warning {letter.warning_reference}: Report {CM.report_ref(rep)}"[:CM.MAX_SUBJECT],
                            created_by=current_user.user_id,
                        )
                        db.add(t)
                        db.flush()
                        CM._add_member(db, t, owner.user_id, CM.PET_OWNER, None)
                        CM._add_member(db, t, current_user.user_id, CM.LEADER)
                new_warning.thread_id = t.thread_id
                inbox_body = (
                    f"[OFFICIAL WARNING {letter.warning_reference}]\n"
                    f"Category: {raw_cat}\n"
                    f"Subject: {letter.rendered_subject}\n"
                    f"{f'Pet: {pet.display_name}\n' if pet else ''}"
                    f"Case Reference: {letter.case_reference}\n\n"
                    f"{warning_in.description}"
                    + (f"\n\nAdditional Details: {warning_in.additional_details.strip()}" if (warning_in.additional_details and warning_in.additional_details.strip()) else "")
                )
                letter_link = f"/resident-app/warnings/{letter.letter_id}"
                tail = (f"\n\nOpen the official warning letter (view or download): {letter_link}"
                        "\nYou can acknowledge receipt there, or reply with any clarification here.")
                inbox_body = inbox_body[: max(0, CM.MAX_BODY - len(tail))].rstrip() + tail
                # One message per letter: a retried submission finds the same message instead of sending another
                with db.begin_nested():
                    CM.send(db, t, current_user, inbox_body, client_request_id=f"warning-letter-{letter.letter_id}")
            except Exception as exc:
                # The warning and its letter are kept; a failed inbox delivery is recorded instead of being hidden
                log_activity(
                    db=db, action="WARNING_INBOX_DELIVERY_FAILED", target_table="generated_warning_letters", target_id=letter.letter_id,
                    description=f"Warning letter {letter.warning_reference} could not be posted to the owner's conversation ({type(exc).__name__}).",
                    user_id=current_user.user_id, log_type="operation", request=req, commit=False,
                )

    # Log audit entries
    log_activity(
        db=db,
        action="WARNING_LETTER_GENERATED",
        target_table="generated_warning_letters",
        target_id=letter.letter_id,
        description=f"Generated warning letter {letter.warning_reference} ({letter.template_name} v{letter.template_version_number}) for {owner.name}.",
        user_id=current_user.user_id,
        log_type="enforcement",
        request=req,
        commit=False,
    )
    log_activity(
        db=db,
        action="ISSUE_WARNING",
        target_table="owner_warnings",
        target_id=new_warning.warning_id,
        description=f"Issued {warning_in.warning_level} ({letter.warning_reference}) to {owner.name} ({warning_in.violation_type})",
        user_id=current_user.user_id,
        log_type="enforcement",
        request=req
    )
    db.commit()
    db.refresh(new_warning)

    return enrich_warning_dict(new_warning, db)


@router.get("/my-warnings", response_model=List[WarningResponse])
def get_my_warnings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.user_id == current_user.user_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in warnings]


@router.get("/suggestion")
def get_tier_suggestion(
    violation_type: str,
    report_id: Optional[int] = None,
    pet_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    policy_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The suggested tier for a new warning, from this pet's (or owner's) existing warning history."""
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=403, detail="Access denied")
    observation_days = None
    if report_id:
        rep = db.query(Report).filter(Report.report_id == report_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Report not found")
        verify_subdivision_scope(current_user, rep.subdivision_id, db=db)
        pet_id = pet_id or rep.pet_id
        observation_days = observation_days_for(db, rep, policy_id)
    from datetime import date, timedelta as _td
    from app.utils.warning_rules import INSTRUCTIONS
    # comply_by is the end of the policy's observation period; with no period defined there is no date to suggest
    return {**suggest_tier(db, violation_type, pet_id, owner_id, report_id),
            "instructions": INSTRUCTIONS.get(violation_type, INSTRUCTIONS["Other"]),
            "observation_days": observation_days,
            "comply_by": (date.today() + _td(days=observation_days)).isoformat() if observation_days else None}


@router.get("/followup/{followup_id}/incidents")
def get_followup_incidents(
    followup_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The observed incident and each logged repeat, with their warnings and a prefill for the warning form."""
    from app.models.owner_followup import OwnerFollowUp
    if current_user.role_id not in (2, 3, 4):
        raise HTTPException(status_code=403, detail="Access denied")
    followup = db.query(OwnerFollowUp).filter(OwnerFollowUp.followup_id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    verify_subdivision_scope(current_user, followup.subdivision_id, db=db)
    return {"followup_id": followup_id, "incidents": followup_incidents(db, followup)}


@router.get("/user/{user_id}", response_model=List[WarningResponse])
def get_user_warnings(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents: only their own. Staff: only warnings in their area.
    if current_user.role_id == 1 and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.user_id == user_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/pet/{pet_id}", response_model=List[WarningResponse])
def get_pet_warnings(
    pet_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents see only notices issued to them; staff only those in their area
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.pet_id == pet_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/report/{report_id}", response_model=List[WarningResponse])
def get_report_warnings(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Residents see only notices issued to them; staff only those in their area
    warnings = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == report_id
    ).order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


@router.get("/{warning_id}", response_model=WarningResponse)
def get_warning_by_id(
    warning_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")

    if not visible_warnings(db, current_user, [warning]):
        raise HTTPException(status_code=403, detail="Access denied")

    return enrich_warning_dict(warning, db)


@router.get("/", response_model=List[WarningResponse])
def get_all_warnings(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role_id not in [2, 3, 4]:
        raise HTTPException(status_code=403, detail="Access denied")

    query = db.query(OwnerWarning)
    if status_filter:
        query = query.filter(OwnerWarning.status == status_filter)

    warnings = query.order_by(OwnerWarning.created_at.desc()).all()
    return [enrich_warning_dict(w, db) for w in visible_warnings(db, current_user, warnings)]


class AcknowledgeRequest(BaseModel):
    # The owner ticked "I have read and understood this notice"
    confirmed: bool = True


class WarningOwnerResponseIn(BaseModel):
    response: str
    client_request_id: Optional[str] = None


class WarningAdminUpdateIn(BaseModel):
    workflow_status: Optional[str] = None
    admin_notes: Optional[str] = None
    follow_up_message: Optional[str] = None
    client_request_id: Optional[str] = None


def _notify_subdivision_admins_for_warning(
    db: Session,
    warning: OwnerWarning,
    title: str,
    message: str,
    ntype: str = "warning_update",
) -> None:
    rep = db.get(Report, warning.report_id) if warning.report_id else None
    leader_ids = []
    if rep is not None and rep.subdivision_id:
        from app.services import lost_pet_lifecycle as LP
        leader_ids = list(LP.leader_ids(db, rep.subdivision_id))
    targets = [
        uid
        for uid in dict.fromkeys(
            [warning.issued_by, rep.assigned_leader_id if rep is not None else None, *leader_ids]
        )
        if uid
    ]
    for uid in targets:
        db.add(
            Notification(
                user_id=uid,
                type=ntype,
                related_id=warning.report_id or warning.warning_id,
                title=title[:255],
                message=message[:1000],
            )
        )


@router.patch("/{warning_id}/acknowledge", response_model=WarningResponse)
def acknowledge_warning(
    warning_id: int,
    req: Request,
    payload: Optional[AcknowledgeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Only the warned owner acknowledges receipt. Acknowledging only confirms receipt and never automatically closes the warning."""
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")

    if warning.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only acknowledge warnings issued to your account")
    if payload is not None and not payload.confirmed:
        raise HTTPException(status_code=400, detail="Tick the acknowledgement checkbox to confirm you have read this notice.")
    if warning.status == "Acknowledged":
        return enrich_warning_dict(warning, db)

    prev_status = warning.status
    prev_wf = warning.workflow_status
    warning.status = "Acknowledged"
    if warning.workflow_status not in ("Responded", "Closed"):
        warning.workflow_status = "Acknowledged"
    warning.acknowledged_at = datetime.now(timezone.utc)

    letter = (
        db.query(GeneratedWarningLetter)
        .filter(GeneratedWarningLetter.warning_id == warning.warning_id)
        .order_by(GeneratedWarningLetter.letter_id.desc())
        .first()
    )
    wref = letter.warning_reference if letter else f"WARN-{warning.warning_id:04d}"
    pet = db.get(Pet, warning.pet_id) if warning.pet_id else None
    rep = db.get(Report, warning.report_id) if warning.report_id else None

    if warning.thread_id:
        from app.models.case_messaging import CaseMessage, CaseMessageThread
        t = db.get(CaseMessageThread, warning.thread_id)
        if t is not None:
            db.add(
                CaseMessage(
                    thread_id=t.thread_id,
                    sender_id=current_user.user_id,
                    kind="message",
                    body=f"I acknowledge receipt of Official Warning {wref}{f' regarding {pet.display_name}' if pet else ''}.",
                )
            )

    if rep is not None:
        db.add(
            StatusHistory(
                report_id=rep.report_id,
                report_status_id=rep.current_status_id or 2,
                updated_by=current_user.user_id,
                remarks=f"Owner {current_user.name} acknowledged receipt of official warning {wref}{f' for pet {pet.display_name}' if pet else ''}.",
            )
        )

    _notify_subdivision_admins_for_warning(
        db,
        warning,
        title=f"Official Warning Acknowledged ({wref})",
        message=f"{current_user.name} acknowledged receipt of official warning {wref}{f' for pet {pet.display_name}' if pet else ''}.",
        ntype="warning_acknowledged",
    )

    log_activity(
        db=db,
        action="ACKNOWLEDGE_WARNING",
        target_table="owner_warnings",
        target_id=warning.warning_id,
        description=f"Resident {current_user.name} acknowledged receipt of warning #{warning_id} ({wref})",
        user_id=current_user.user_id,
        log_type="operation",
        old_values={"status": prev_status, "workflow_status": prev_wf},
        new_values={"status": warning.status, "workflow_status": warning.workflow_status, "report_id": warning.report_id, "pet_id": warning.pet_id},
        request=req,
        commit=False,
    )
    db.commit()
    db.refresh(warning)
    return enrich_warning_dict(warning, db)


@router.post("/{warning_id}/respond", response_model=WarningResponse)
def respond_to_warning(
    warning_id: int,
    payload: WarningOwnerResponseIn,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow the warned pet owner to send a response or clarification to an official warning."""
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")
    if warning.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only respond to warnings issued to your account")

    text = (payload.response or "").strip()
    if len(text) < 2:
        raise HTTPException(status_code=422, detail="Please enter your response or clarification.")

    if warning.owner_response == text and warning.owner_responded_at:
        return enrich_warning_dict(warning, db)

    prev_wf = warning.workflow_status
    warning.owner_response = text
    warning.owner_responded_at = datetime.now()
    if warning.workflow_status != "Closed":
        warning.workflow_status = "Responded"

    letter = (
        db.query(GeneratedWarningLetter)
        .filter(GeneratedWarningLetter.warning_id == warning.warning_id)
        .order_by(GeneratedWarningLetter.letter_id.desc())
        .first()
    )
    wref = letter.warning_reference if letter else f"WARN-{warning.warning_id:04d}"
    pet = db.get(Pet, warning.pet_id) if warning.pet_id else None
    rep = db.get(Report, warning.report_id) if warning.report_id else None

    # Deliver the response into the linked conversation so it appears in Subdivision Admin Messages as well
    if rep is not None:
        from app.models.case_messaging import CaseMessage, CaseMessageThread
        from app.services import case_messaging as CM, owner_verification as OV
        t = db.get(CaseMessageThread, warning.thread_id) if warning.thread_id else None
        if t is None and pet is not None:
            issuer_user = db.get(User, warning.issued_by) or current_user
            t = OV._verification_thread(db, rep, pet, current_user.user_id, issuer_user)
            warning.thread_id = t.thread_id
        if t is not None:
            db.add(
                CaseMessage(
                    thread_id=t.thread_id,
                    sender_id=current_user.user_id,
                    kind="message",
                    body=f"[Response to Official Warning {wref}]: {text}"[:CM.MAX_BODY],
                )
            )
        db.add(
            StatusHistory(
                report_id=rep.report_id,
                report_status_id=rep.current_status_id or 2,
                updated_by=current_user.user_id,
                remarks=f"Owner {current_user.name} responded to official warning {wref}: {text[:200]}",
            )
        )

    _notify_subdivision_admins_for_warning(
        db,
        warning,
        title=f"Owner Responded to Warning ({wref})",
        message=f"{current_user.name} submitted a response to official warning {wref}: \"{text[:160]}\"",
        ntype="warning_response",
    )

    log_activity(
        db=db,
        action="OWNER_WARNING_RESPONSE",
        target_table="owner_warnings",
        target_id=warning.warning_id,
        description=f"Owner {current_user.name} responded to warning #{warning_id} ({wref}).",
        user_id=current_user.user_id,
        log_type="operation",
        old_values={"workflow_status": prev_wf},
        new_values={"workflow_status": warning.workflow_status, "owner_response": text, "report_id": warning.report_id, "pet_id": warning.pet_id},
        request=req,
        commit=False,
    )
    db.commit()
    db.refresh(warning)
    return enrich_warning_dict(warning, db)


@router.post("/{warning_id}/admin-update", response_model=WarningResponse)
def admin_update_warning(
    warning_id: int,
    payload: WarningAdminUpdateIn,
    req: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow authorized Subdivision Admins to update warning status, record admin notes, or send a follow-up message."""
    if current_user.role_id not in (2, 4):
        raise HTTPException(status_code=403, detail="Only an authorized Subdivision Admin can update warnings.")
    warning = db.query(OwnerWarning).filter(OwnerWarning.warning_id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning citation not found")
    rep = db.get(Report, warning.report_id) if warning.report_id else None
    if rep is not None:
        verify_subdivision_scope(current_user, rep.subdivision_id, db=db)

    prev_wf = warning.workflow_status
    prev_notes = warning.admin_notes
    if payload.workflow_status:
        warning.workflow_status = payload.workflow_status.strip()
        if warning.workflow_status == "Closed":
            warning.status = "Resolved"
    if payload.admin_notes is not None:
        warning.admin_notes = payload.admin_notes.strip() or None

    letter = (
        db.query(GeneratedWarningLetter)
        .filter(GeneratedWarningLetter.warning_id == warning.warning_id)
        .order_by(GeneratedWarningLetter.letter_id.desc())
        .first()
    )
    wref = letter.warning_reference if letter else f"WARN-{warning.warning_id:04d}"
    pet = db.get(Pet, warning.pet_id) if warning.pet_id else None
    owner = db.get(User, warning.user_id)

    follow_text = (payload.follow_up_message or "").strip()
    if follow_text and owner is not None and rep is not None:
        from app.models.case_messaging import CaseMessageThread
        from app.services import case_messaging as CM, owner_verification as OV
        t = db.get(CaseMessageThread, warning.thread_id) if warning.thread_id else None
        if t is None and pet is not None:
            t = OV._verification_thread(db, rep, pet, owner.user_id, current_user)
            warning.thread_id = t.thread_id
        if t is not None:
            CM.send(db, t, current_user, f"[Follow-up on Official Warning {wref}]: {follow_text}"[:CM.MAX_BODY], payload.client_request_id)
        db.add(
            Notification(
                user_id=owner.user_id,
                type="warning_letter" if letter else "warning",
                related_id=letter.letter_id if letter else warning.warning_id,
                title=f"Follow-up on Official Warning ({wref})",
                message=f"Subdivision Administration sent a follow-up regarding official warning {wref}: \"{follow_text[:160]}\"",
            )
        )

    if rep is not None:
        db.add(
            StatusHistory(
                report_id=rep.report_id,
                report_status_id=rep.current_status_id or 2,
                updated_by=current_user.user_id,
                remarks=(
                    f"Administrator {current_user.name} updated official warning {wref} "
                    f"(Status: {warning.workflow_status or warning.status})"
                    + (f" and sent a follow-up message to {owner.name if owner else 'the owner'}." if follow_text else ".")
                ),
            )
        )

    log_activity(
        db=db,
        action="ADMIN_UPDATE_WARNING",
        target_table="owner_warnings",
        target_id=warning.warning_id,
        description=f"{current_user.name} updated warning #{warning.warning_id} ({wref}).",
        user_id=current_user.user_id,
        log_type="operation",
        old_values={"workflow_status": prev_wf, "admin_notes": prev_notes},
        new_values={
            "workflow_status": warning.workflow_status,
            "admin_notes": warning.admin_notes,
            "follow_up_sent": bool(follow_text),
            "report_id": warning.report_id,
            "pet_id": warning.pet_id,
        },
        request=req,
        commit=False,
    )
    db.commit()
    db.refresh(warning)
    return enrich_warning_dict(warning, db)
