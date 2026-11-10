import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.owner_followup import OwnerFollowUp, FollowUpContactLog, OwnerObservationUpdate
from app.models.report import Report
from app.models.pet import Pet
from app.models.user import User, Subdivision, Barangay
from app.models.barangay_referral import BarangayReferral
from app.models.system_setting import SystemSetting
from app.models.report_match import ReportMatch
from app.utils.case_closure import CLOSED_REPORT_STATUS_IDS
from app.utils.notification_dispatcher import dispatch_notification

logger = logging.getLogger("stray_safe.owner_followup")

DEFAULT_FOLLOWUP_DURATION_DAYS = 3
SETTING_KEY_DURATION = "owner_followup_default_duration_days"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def db_local_to_utc(db: Session, value: Optional[datetime]) -> Optional[datetime]:
    """A time from the database clock (server_default NOW(), local time) as naive UTC, the clock _now() writes.
    The offset is measured, not assumed, and rounded to 15 minutes."""
    if value is None:
        return None
    from app.utils.db_clock import db_now
    offset_seconds = (db_now(db) - _now()).total_seconds()
    return value - timedelta(minutes=round(offset_seconds / 900) * 15)


# Warnings issued before subdivision policies existed (no policy_id) were all observed for 3 days. This is only how
# those historical warnings are read; nothing issued now assumes it (the policy defines the period, or none).
LEGACY_WARNING_OBSERVATION_DAYS = 3


def warning_observation_days(warning) -> Optional[int]:
    """The observation period that applied to a warning: its policy's, none, or the 3 days of the pre-policy era."""
    if getattr(warning, "policy_id", None):
        return warning.observation_days
    return LEGACY_WARNING_OBSERVATION_DAYS


def get_default_duration_days(db: Session) -> int:
    """The administrator-configured default for a manually started observation (PUT /owner-followups/settings/duration); 3 until one is set."""
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == SETTING_KEY_DURATION).first()
    if setting and setting.setting_value:
        try:
            val = int(setting.setting_value)
            if 1 <= val <= 30:
                return val
        except ValueError:
            pass
    return DEFAULT_FOLLOWUP_DURATION_DAYS


def set_default_duration_days(db: Session, days: int, updated_by: int) -> int:
    """Set the administrator default observation duration. Does not change existing follow-up due times."""
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == SETTING_KEY_DURATION).first()
    if not setting:
        setting = SystemSetting(
            setting_key=SETTING_KEY_DURATION,
            setting_value=str(days),
            description="Default owner follow-up observation duration in days",
            is_enabled=True,
            updated_by=updated_by
        )
        db.add(setting)
    else:
        setting.setting_value = str(days)
        setting.updated_by = updated_by
    db.commit()
    db.refresh(setting)
    return days


def evaluate_staff_caution(report: Report) -> Optional[str]:
    """Return caution warning text if the animal/case exhibits aggressive, injury, or high priority signals."""
    caution_signals = []
    if report.priority_level == "High":
        caution_signals.append("High priority case")
    if getattr(report, "verified_aggressive", False) or getattr(report, "ai_behavior_aggressive", False):
        caution_signals.append("Reported/verified aggressive behavior")
    if getattr(report, "verified_injury", False) or getattr(report, "ai_behavior_injury", False):
        caution_signals.append("Reported/verified injury")
    if getattr(report, "verified_actual_bite", False) or getattr(report, "ai_behavior_actual_bite", False):
        caution_signals.append("Bite incident history")

    if caution_signals:
        return (
            f"Staff Caution: Animal has risk factors ({', '.join(caution_signals)}). "
            f"Exercise caution and verify containment before proceeding with owner observation. "
            f"Escalate to Barangay if containment cannot be assured."
        )
    return None


def check_rabies_risk(report: Report) -> None:
    """Refuse observation for rabies-risk reports."""
    text_corpus = f"{report.condition or ''} {report.description or ''} {getattr(report, 'ai_behavior_explanation', '') or ''}".lower()
    risk_level = getattr(report, "ai_suggested_risk_level", "") or ""

    if "rabies" in text_corpus or "rabid" in text_corpus or "foaming" in text_corpus or risk_level.lower() == "rabies risk":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reports with potential rabies risk cannot be placed on owner observation and must be escalated immediately."
        )


def validate_followup_start(
    db: Session,
    report: Report,
    actor: User,
    pet_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    owner_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validate all start constraints for Phase 3:
    - Actor is Leader (role 2) or Admin (role 4)
    - Correct subdivision
    - Report is open, not escalated, not a merged duplicate
    - Animal is not held in a facility/holding place
    - No rabies risk
    - Owned pet identified
    - No concurrent active observation for the same pet or report
    """
    # 1. Role requirement: Subdivision Leader (2) or Administrator (4)
    if actor.role_id not in (2, 4):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Subdivision Leaders or Administrators can initiate an owner follow-up observation."
        )

    # 2. Scope requirement: Must match subdivision for leaders
    if actor.role_id == 2 and actor.subdivision_id != report.subdivision_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subdivision leaders may only start follow-up observations within their assigned subdivision."
        )

    # 3. Report state: Open, individually identified, not closed/resolved
    if report.current_status_id in CLOSED_REPORT_STATUS_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start owner observation on a closed or resolved report."
        )

    # Escalated to Barangay (Status 13: Approved by Barangay / Escalated)
    if report.current_status_id == 13:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start owner observation on an escalated report. Case is handled by Barangay."
        )

    # Merged duplicate check
    if report.duplicate_of_report_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start owner observation on a merged duplicate report. Start observation on the primary case."
        )

    # 4. Custody check: Animal must not be held in a holding place
    if report.facility_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start owner observation: animal is currently recorded in a holding place."
        )

    # 5. Rabies check
    check_rabies_risk(report)

    # 6. Resolve Pet & Owner
    resolved_pet_id = pet_id or report.pet_id
    if not resolved_pet_id:
        # Check for confirmed look-alike match
        confirmed_match = db.query(ReportMatch).filter(
            ReportMatch.source_report_id == report.report_id,
            ReportMatch.matched_pet_id.isnot(None),
            ReportMatch.status == "CONFIRMED_MATCH",
            ReportMatch.owner_confirmation_status != "OWNER_REJECTED"
        ).first()
        if confirmed_match:
            resolved_pet_id = confirmed_match.matched_pet_id

    # If pet is found, verify its owner
    resolved_owner_id = owner_id
    resolved_owner_name = owner_name
    if resolved_pet_id:
        pet = db.query(Pet).filter(Pet.pet_id == resolved_pet_id).first()
        if pet and pet.owner_id:
            resolved_owner_id = resolved_owner_id or pet.owner_id
            owner_user = db.query(User).filter(User.user_id == pet.owner_id).first()
            if owner_user:
                resolved_owner_name = resolved_owner_name or owner_user.name

    if not resolved_pet_id and not report.is_possible_owned and not resolved_owner_name and not resolved_owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start owner observation without an identified owned pet or owner contact information."
        )

    # 7. Concurrency check: prevent simultaneous open observations for the same pet or report
    if resolved_pet_id:
        existing_pet_obs = db.query(OwnerFollowUp).filter(
            OwnerFollowUp.pet_id == resolved_pet_id,
            OwnerFollowUp.status == "observing"
        ).first()
        if existing_pet_obs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This pet is already under an active observation in Follow-Up #{existing_pet_obs.followup_id} (Report #{existing_pet_obs.report_id})."
            )

    existing_report_obs = db.query(OwnerFollowUp).filter(
        OwnerFollowUp.report_id == report.report_id,
        OwnerFollowUp.status == "observing"
    ).first()
    if existing_report_obs:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Report #{report.report_id} already has an active follow-up observation (#{existing_report_obs.followup_id})."
        )

    staff_caution = evaluate_staff_caution(report)

    return {
        "pet_id": resolved_pet_id,
        "owner_id": resolved_owner_id,
        "owner_name": resolved_owner_name,
        "staff_caution": staff_caution
    }


def sort_contact_logs(logs: List[FollowUpContactLog]) -> List[FollowUpContactLog]:
    """Newest first; the primary key breaks ties between logs saved within the same second."""
    return sorted(logs, key=lambda l: (l.created_at or datetime.min, l.contact_log_id), reverse=True)


def serialize_contact_log(log: FollowUpContactLog, db: Session) -> Dict[str, Any]:
    logger_user = db.query(User).filter(User.user_id == log.logged_by).first()
    return {
        "contact_log_id": log.contact_log_id,
        "followup_id": log.followup_id,
        "report_id": log.report_id,
        "pet_id": log.pet_id,
        "logged_by": log.logged_by,
        "logger_name": logger_user.name if logger_user else "Staff",
        "logger_role": "Subdivision Leader" if (logger_user and logger_user.role_id == 2) else "Staff",
        "contact_type": log.contact_type,
        "inspection_method": log.inspection_method,
        "inspection_outcome": log.inspection_outcome,
        "contact_date": log.contact_date,
        "notes": log.notes,
        "created_at": log.created_at
    }


OWNER_COMPLIANCE_LABELS = {
    "issue_resolved": "Issue Resolved",
    "improving": "Action Taken / Improving",
    "still_addressing": "Still Addressing the Issue",
    "unable_to_comply": "Unable to Comply Yet",
}

# Hours after the observation starts before an owner with no updates is reminded once.
OWNER_UPDATE_REMINDER_HOURS = 24


def sort_owner_updates(updates: List[OwnerObservationUpdate]) -> List[OwnerObservationUpdate]:
    """Newest first; the primary key breaks ties between updates saved within the same second."""
    return sorted(updates, key=lambda u: (u.submitted_at or datetime.min, u.update_id), reverse=True)


def serialize_owner_update(update: OwnerObservationUpdate, db: Session, animal_name: Optional[str] = None) -> Dict[str, Any]:
    owner_user = db.query(User).filter(User.user_id == update.owner_user_id).first()
    reviewer = db.query(User).filter(User.user_id == update.reviewed_by).first() if update.reviewed_by else None
    if animal_name is None and update.pet_id:
        pet = db.query(Pet).filter(Pet.pet_id == update.pet_id).first()
        animal_name = getattr(pet, "display_name", None) or getattr(pet, "pet_name", None)
    return {
        "update_id": update.update_id,
        "followup_id": update.followup_id,
        "report_id": update.report_id,
        "pet_id": update.pet_id,
        "animal_name": animal_name,
        "owner_user_id": update.owner_user_id,
        "owner_name": owner_user.name if owner_user else "Pet Owner",
        "compliance_status": update.compliance_status,
        "owner_remarks": update.owner_remarks,
        "submitted_at": update.submitted_at,
        "photos": [{"photo_id": ph.photo_id, "photo_url": ph.photo_url, "created_at": ph.created_at} for ph in update.photos],
        "is_reviewed": update.reviewed_at is not None,
        "reviewed_at": update.reviewed_at,
        "reviewed_by": update.reviewed_by,
        "reviewer_name": reviewer.name if reviewer else None,
        "review_remarks": update.review_remarks,
    }


def enrich_and_redact_followup(followup: OwnerFollowUp, user: Optional[User], db: Session) -> Dict[str, Any]:
    """Serialize and redact fields based on user authorization (staff vs owner vs public)."""
    is_staff = user and user.role_id in (2, 3, 4)
    is_owner = user and followup.owner_id and user.user_id == followup.owner_id

    # Base enrichment
    pet = db.query(Pet).filter(Pet.pet_id == followup.pet_id).first() if followup.pet_id else None
    leader = db.query(User).filter(User.user_id == followup.leader_id).first()
    subdivision = db.query(Subdivision).filter(Subdivision.subdivision_id == followup.subdivision_id).first()
    report = db.query(Report).filter(Report.report_id == followup.report_id).first()

    now_val = _now()
    is_overdue = followup.status == "observing" and now_val > followup.due_at
    remaining_hours = None
    if followup.status == "observing":
        diff = (followup.due_at - now_val).total_seconds() / 3600.0
        remaining_hours = round(diff, 1)

    staff_caution = evaluate_staff_caution(report) if report and is_staff else None

    # Contact logs: only visible to staff
    logs_out = []
    if is_staff:
        logs_out = [serialize_contact_log(log, db) for log in sort_contact_logs(followup.contact_logs)]

    # Redaction rules:
    # owner_phone is private to staff and the owner
    phone_val = followup.owner_phone if (is_staff or is_owner) else None
    # notes: internal staff instructions; hidden from non-staff/non-owner
    notes_val = followup.notes if (is_staff or is_owner) else None

    # First Warning lookup
    from app.models.warning import OwnerWarning
    from app.models.report import ReportCategory

    first_warning = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == followup.report_id
    ).order_by(OwnerWarning.created_at.asc()).first()

    first_warning_issuer = None
    if first_warning:
        first_warning_issuer = db.query(User).filter(User.user_id == first_warning.issued_by).first()

    # Report media & details
    report_photo = None
    category_name = None
    if report:
        if report.media and len(report.media) > 0:
            for m in report.media:
                if m.media_type == "Image" and m.file_url:
                    report_photo = m.file_url
                    break
            if not report_photo and report.media[0].file_url:
                report_photo = report.media[0].file_url
        if not report_photo and pet and pet.photo_url:
            report_photo = pet.photo_url

        if hasattr(report, "category") and report.category:
            category_name = report.category.category_name
        elif report.category_id:
            cat = db.query(ReportCategory).filter(ReportCategory.category_id == report.category_id).first()
            if cat:
                category_name = cat.category_name

    # Observation countdown & progress for this follow-up's own period (starts from the First Warning date)
    start_time = first_warning.created_at if first_warning else followup.created_at
    if start_time and start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    now_tz = now_val if now_val.tzinfo is not None else now_val.replace(tzinfo=timezone.utc)
    due_tz = followup.due_at if followup.due_at.tzinfo is not None else followup.due_at.replace(tzinfo=timezone.utc)

    # The follow-up's own period (set from the policy when it started); never zero, because progress divides by it
    total_days = max(followup.duration_days or 0, 1) + (followup.extension_days or 0 if followup.is_extended else 0)
    total_hours = float(total_days * 24)
    elapsed_seconds = max(0.0, (now_tz - start_time).total_seconds()) if start_time else 0.0
    elapsed_hours = elapsed_seconds / 3600.0

    rem_seconds = (due_tz - now_tz).total_seconds()
    rem_hours = max(0.0, rem_seconds / 3600.0) if rem_seconds > 0 else 0.0

    is_overdue = (now_tz > due_tz) and (followup.status == "observing")

    # Second Warning retrieval
    second_warning = db.query(OwnerWarning).filter(
        OwnerWarning.report_id == followup.report_id,
        OwnerWarning.warning_level == "2nd Warning"
    ).order_by(OwnerWarning.created_at.desc()).first()

    second_warning_issuer = None
    if second_warning and second_warning.issued_by:
        second_warning_issuer = db.query(User).filter(User.user_id == second_warning.issued_by).first()

    has_second_warning = second_warning is not None

    # Workflow Section Classification (Active, For Second Warning, Second Warning Issued, Endorsed, Resolved)
    if followup.status in ("complied", "closed") or (report and report.current_status_id == 11):
        workflow_section = "resolved"
    elif followup.status == "escalated" or (report and report.current_status_id in (4, 13)):
        workflow_section = "endorsed"
    elif has_second_warning:
        workflow_section = "second_warning_issued"
    elif is_overdue:
        workflow_section = "for_second_warning"
    else:
        workflow_section = "active"

    is_eligible_for_second_warning = workflow_section == "for_second_warning"
    is_eligible_for_endorsement = workflow_section == "second_warning_issued"

    # Display only: prefer the recorded referral recipient, with the subdivision's Barangay for older cases.
    referral_label = "Referred to the Barangay"
    if followup.status == "escalated" or (report and report.current_status_id in (4, 13)):
        recipient = (db.query(Barangay.barangay_name)
                     .join(BarangayReferral, BarangayReferral.barangay_id == Barangay.barangay_id)
                     .filter(BarangayReferral.report_id == followup.report_id).first())
        barangay_name = recipient[0] if recipient else None
        if not barangay_name and subdivision and subdivision.barangay:
            barangay_name = subdivision.barangay.barangay_name
        if barangay_name:
            referral_label = f"Referred to Barangay {barangay_name}"

    # The referral recorded for this case (its reason is the text sent to the Barangay)
    referral = (db.query(BarangayReferral).filter(BarangayReferral.report_id == followup.report_id)
                .order_by(BarangayReferral.referral_id.desc()).first())

    # Resolution verifier
    resolved_by_user = None
    if followup.closed_by:
        resolved_by_user = db.query(User).filter(User.user_id == followup.closed_by).first()

    day_idx = int(elapsed_hours // 24) + 1
    current_obs_day = min(day_idx, total_days) if not is_overdue else total_days

    if workflow_section == "resolved":
        day_display = "Case Resolved & Verified"
        rem_display = "Resolved"
        progress_pct = 100.0
    elif workflow_section == "endorsed":
        day_display = referral_label
        rem_display = "Handled by Barangay outside StraySafe"
        progress_pct = 100.0
    elif workflow_section == "second_warning_issued":
        day_display = "Second Warning Issued"
        rem_display = "Eligible for Barangay Endorsement"
        progress_pct = 100.0
    elif workflow_section == "for_second_warning":
        day_display = f"Non-Compliant — Day {total_days} Expired"
        rem_display = "Eligible for Second Warning"
        progress_pct = 100.0
    elif current_obs_day == 1:
        days_left = max(0, total_days - 1)
        day_display = f"Day 1 of {total_days} — {days_left} {'days' if days_left > 1 else 'day'} remaining"
        rem_display = f"{days_left} {'days' if days_left > 1 else 'day'} remaining"
        progress_pct = round(min(100.0, max(5.0, (elapsed_hours / total_hours) * 100.0)), 1)
    elif current_obs_day == 2:
        days_left = max(0, total_days - 2)
        day_display = f"Day 2 of {total_days} — {days_left} {'days' if days_left > 1 else 'day'} remaining"
        rem_display = f"{days_left} {'days' if days_left > 1 else 'day'} remaining"
        progress_pct = round(min(100.0, max(5.0, (elapsed_hours / total_hours) * 100.0)), 1)
    else:
        day_display = f"Day {total_days} of {total_days} — Observation period ending"
        rem_display = f"{int(rem_hours)} hours remaining" if rem_hours > 0 else "Ending today"
        progress_pct = round(min(100.0, max(5.0, (elapsed_hours / total_hours) * 100.0)), 1)

    resolved_animal_name = "Reported Animal"
    if pet:
        resolved_animal_name = getattr(pet, 'display_name', None) or getattr(pet, 'pet_name', None) or "Reported Animal"
    elif report and report.animal_type:
        breed_str = f" ({report.animal_breed})" if getattr(report, 'animal_breed', None) else ""
        resolved_animal_name = f"{report.animal_type}{breed_str}"

    # Owner observation updates: visible to staff and to the identified owner only
    owner_updates_out = []
    if is_staff or is_owner:
        owner_updates_out = [
            serialize_owner_update(u, db, animal_name=resolved_animal_name)
            for u in sort_owner_updates(followup.owner_updates)
        ]

    return {
        "followup_id": followup.followup_id,
        "report_id": followup.report_id,
        "pet_id": followup.pet_id,
        "pet_name": pet.display_name if pet else None,
        "animal_name": resolved_animal_name,
        "animal_photo": pet.photo_url if (pet and pet.photo_url) else report_photo,
        "subdivision_id": followup.subdivision_id,
        "subdivision_name": subdivision.subdivision_name if subdivision else None,
        "leader_id": followup.leader_id,
        "leader_name": leader.name if leader else None,
        "owner_id": followup.owner_id,
        "owner_name": followup.owner_name,
        "owner_phone": phone_val,
        "owner_address": followup.owner_address if (is_staff or is_owner) else None,
        "status": "second_warning_issued" if (has_second_warning and followup.status not in ("complied", "closed", "escalated")) else followup.status,
        "due_at": followup.due_at,
        "duration_days": followup.duration_days,
        "notes": notes_val,
        "is_extended": followup.is_extended,
        "extended_at": followup.extended_at,
        "extended_by": followup.extended_by,
        "extension_reason": followup.extension_reason,
        "extension_days": followup.extension_days,
        "compliance_notes": followup.compliance_notes,
        "closed_at": followup.closed_at,
        "closed_by": followup.closed_by,
        "close_reason": followup.close_reason,
        "owner_acknowledged_at": followup.owner_acknowledged_at,
        "owner_acknowledgement_method": followup.owner_acknowledgement_method,
        "owner_notes": followup.owner_notes,
        "owner_photo_url": followup.owner_photo_url,
        "owner_photo_submitted_at": followup.owner_photo_submitted_at,
        "staff_caution": staff_caution,
        "is_overdue": is_overdue,
        "remaining_hours": remaining_hours,
        "contact_logs": logs_out,
        "owner_updates": owner_updates_out,
        "owner_updates_count": len(owner_updates_out),
        "unreviewed_owner_updates_count": sum(1 for u in owner_updates_out if not u["is_reviewed"]),
        "report_photo": report_photo,
        "report_category_name": str(category_name) if category_name else None,
        "report_landmark": report.landmark if report else None,
        "report_animal_type": report.animal_type if report else (pet.pet_type if pet else None),
        "report_breed": report.animal_breed if report else (pet.breed if pet else None),
        "report_color": report.animal_color if report else (pet.color_markings if pet else None),
        "report_description": report.description if report else None,
        "report_condition": report.condition if report else None,
        "first_warning_id": first_warning.warning_id if first_warning else None,
        "first_warning_date": first_warning.created_at if first_warning else None,
        "first_warning_level": first_warning.warning_level if first_warning else None,
        "first_warning_violation": first_warning.violation_type if first_warning else None,
        "first_warning_description": first_warning.description if first_warning else None,
        "first_warning_issuer_name": first_warning_issuer.name if first_warning_issuer else None,
        "second_warning_id": second_warning.warning_id if second_warning else None,
        "second_warning_date": second_warning.created_at if second_warning else None,
        "second_warning_level": second_warning.warning_level if second_warning else None,
        "second_warning_violation": second_warning.violation_type if second_warning else None,
        "second_warning_description": second_warning.description if second_warning else None,
        "second_warning_issuer_name": second_warning_issuer.name if second_warning_issuer else None,
        "has_second_warning": has_second_warning,
        "is_eligible_for_second_warning": is_eligible_for_second_warning,
        "is_eligible_for_endorsement": is_eligible_for_endorsement,
        "workflow_section": workflow_section,
        "resolved_by_name": resolved_by_user.name if resolved_by_user else None,
        "resolved_at": followup.closed_at,
        "resolved_notes": followup.compliance_notes or followup.close_reason,
        "endorsement_date": referral.referred_at if referral else (followup.closed_at if followup.status == "escalated" else None),
        "referral_reason": referral.reason if referral else None,
        "endorsement_status": referral_label if (followup.status == "escalated" or (report and report.current_status_id in (4, 13))) else None,
        "current_observation_day": current_obs_day,
        "observation_day_display": day_display,
        "remaining_time_display": rem_display,
        "progress_percent": progress_pct,
        "is_escalated": bool(followup.status == "escalated" or (report and report.current_status_id in (4, 13))),
        "created_at": followup.created_at,
        "updated_at": followup.updated_at
    }


def check_and_notify_due_followups(db: Session) -> int:
    """
    Checks active follow-ups for due and reminder milestones.
    - 24h reminder for owners (sent once).
    - Due notice for handling leader (sent once).
    Does NOT close or escalate cases automatically.
    """
    now_val = _now()
    active_followups = db.query(OwnerFollowUp).filter(OwnerFollowUp.status == "observing").all()
    notified_count = 0

    for f in active_followups:
        # 0. Reminder to submit an observation update when the owner has sent none yet
        started_at = f.created_at or (f.due_at - timedelta(days=f.duration_days or 0))
        if (
            f.owner_id
            and f.update_reminder_sent_at is None
            and now_val < f.due_at
            and now_val >= started_at + timedelta(hours=OWNER_UPDATE_REMINDER_HOURS)
            and not f.owner_updates
        ):
            try:
                dispatch_notification(
                    db=db,
                    user_id=f.owner_id,
                    title="Submit Your Observation Update",
                    message=f"Your pet is under a {f.duration_days}-day observation for Report #{f.report_id}. Please submit an observation update with photos showing the steps you have taken before {f.due_at.strftime('%Y-%m-%d %H:%M')}.",
                    notification_type="followup_update_reminder",
                    related_id=f.report_id
                )
            except Exception as e:
                logger.warning(f"Failed to dispatch owner update reminder for followup #{f.followup_id}: {e}")
            f.update_reminder_sent_at = now_val
            notified_count += 1

        # 1. 24-hour reminder to owner
        reminder_threshold = f.due_at - timedelta(hours=24)
        if now_val >= reminder_threshold and f.reminder_sent_at is None:
            if f.owner_id:
                try:
                    dispatch_notification(
                        db=db,
                        user_id=f.owner_id,
                        title="Observation Notice Reminder",
                        message=f"Reminder: Observation period for your pet (Report #{f.report_id}) is due on {f.due_at.strftime('%Y-%m-%d %H:%M')}. Please ensure your pet is kept safely secured.",
                        notification_type="followup_reminder",
                        related_id=f.report_id
                    )
                except Exception as e:
                    logger.warning(f"Failed to dispatch owner reminder for followup #{f.followup_id}: {e}")
            f.reminder_sent_at = now_val
            notified_count += 1

        # 2. Due notice to Subdivision Leader
        if now_val >= f.due_at and f.due_notice_sent_at is None:
            try:
                dispatch_notification(
                    db=db,
                    user_id=f.leader_id,
                    title="Observation Expired: Non-Compliant",
                    message=f"The {f.duration_days}-day observation for Report #{f.report_id} ended without verified resolution. The case is flagged Non-Compliant and is eligible for Second Warning review.",
                    notification_type="followup_due",
                    related_id=f.report_id
                )
            except Exception as e:
                logger.warning(f"Failed to dispatch leader due notice for followup #{f.followup_id}: {e}")
            f.due_notice_sent_at = now_val
            notified_count += 1

        # 3. Another report about the observed pet: alert the leader once per report
        try:
            notified_count += alert_repeat_reports(db, f)
        except Exception as e:
            logger.warning(f"Failed to check repeat reports for followup #{f.followup_id}: {e}")

    if notified_count > 0:
        db.commit()
    return notified_count


# ── Repeated incidents (Phase 6) ────────────────────────────────────────────
REPEAT_ALERT_TYPE = "followup_repeat_report"


def logged_repeat_report_ids(db: Session, followup: OwnerFollowUp) -> set:
    from app.models.owner_followup import FollowUpRepeatedIncident
    return {rid for (rid,) in db.query(FollowUpRepeatedIncident.report_id)
            .filter(FollowUpRepeatedIncident.followup_id == followup.followup_id).all()}


def repeat_report_candidates(db: Session, followup: OwnerFollowUp) -> List[Report]:
    """
    Other reports linked to the pet under observation, filed since the observation started: possible repeat
    incidents. Merged duplicates, reports in the observed case and already logged incidents are left out.
    """
    if not followup.pet_id or followup.status != "observing":
        return []
    from app.utils.case_groups import case_root, trusted_link_filter
    observed = db.get(Report, followup.report_id)
    root_id = case_root(db, observed).report_id if observed else followup.report_id
    excluded = logged_repeat_report_ids(db, followup) | {followup.report_id, root_id}
    q = (db.query(Report).filter(
            Report.pet_id == followup.pet_id,
            Report.duplicate_of_report_id.is_(None),
            Report.report_id.notin_(excluded),
            trusted_link_filter())
         .order_by(Report.created_at))
    if followup.created_at:
        q = q.filter(Report.created_at >= followup.created_at)
    return q.all()


def alert_repeat_reports(db: Session, followup: OwnerFollowUp) -> int:
    """Tell the handling leader about each new possible repeat once (no commit). Returns how many alerts were added."""
    from app.models.notification import Notification
    sent = 0
    for rep in repeat_report_candidates(db, followup):
        title = f"Possible Repeat Incident: Report #{rep.report_id}"
        already = db.query(Notification.notification_id).filter(
            Notification.user_id == followup.leader_id, Notification.type == REPEAT_ALERT_TYPE,
            Notification.related_id == followup.report_id, Notification.title == title).first()
        if already:
            continue
        db.add(Notification(
            user_id=followup.leader_id, type=REPEAT_ALERT_TYPE, related_id=followup.report_id, title=title,
            message=(f"Report #{rep.report_id} is about the pet under observation in Report #{followup.report_id}. "
                     f"Review it and log it as a repeat incident if it is one."),
        ))
        sent += 1
    return sent


def alert_repeat_reports_for_pet(db: Session, pet_id: Optional[int]) -> int:
    """After a report is linked to a pet: alert the leader of any open observation of that pet (no commit)."""
    if not pet_id:
        return 0
    return sum(alert_repeat_reports(db, f) for f in db.query(OwnerFollowUp).filter(
        OwnerFollowUp.pet_id == pet_id, OwnerFollowUp.status == "observing").all())


# ── Activity timeline (Phase 8) ─────────────────────────────────────────────
# Observation events go on the report's own history, so every timeline (resident, leader, Barangay) shows them with the
# date they happened. The text never names the owner or gives contact details: the timeline can be public.
OBS_STARTED, OBS_EXTENDED, OBS_ENDED = "Observation started", "Observation extended", "Observation ended"
OBS_OUTCOME_TEXT = {
    "complied": "the owner complied",
    "closed": "closed by the subdivision",
    "escalated": "endorsed to the Barangay",
    "cancelled": "cancelled",
}


def _fmt_due(value: Optional[datetime]) -> str:
    """Follow-up times are UTC (naive, _now()); the timeline shows local wall-clock time like the rest of the app."""
    if not value:
        return "the deadline"
    return value.replace(tzinfo=timezone.utc).astimezone().strftime("%b %d, %Y %I:%M %p")


def _utc_iso(value: Optional[datetime]) -> Optional[str]:
    """Follow-up times as UTC ISO strings, so the browser shows them in the viewer's local time."""
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def record_observation_event(db: Session, followup: OwnerFollowUp, kind: str, actor_id: Optional[int] = None) -> None:
    """Add 'Observation started / extended / ended' to the report's history (no commit). Dated by the database clock,
    like every other history entry, so the timeline stays in order."""
    from app.models.report import StatusHistory
    report = db.get(Report, followup.report_id)
    if kind == "started":
        text = f"{OBS_STARTED}: the owner has until {_fmt_due(followup.due_at)} to address the report."
    elif kind == "extended":
        days = followup.extension_days or 0
        text = f"{OBS_EXTENDED} by {days} day{'s' if days != 1 else ''}: new deadline {_fmt_due(followup.due_at)}."
    else:
        text = f"{OBS_ENDED}: {OBS_OUTCOME_TEXT.get(followup.status, followup.status)}."
    db.add(StatusHistory(report_id=followup.report_id, report_status_id=report.current_status_id if report else None,
                         updated_by=actor_id, remarks=text))


def observation_summary(db: Session, report: Report, staff_details: bool = False) -> Optional[Dict[str, Any]]:
    """The case's latest owner observation, without any owner detail (safe for every viewer of the report).
    staff_details adds the extension reason and who closed it, for officials only (the reason may describe the owner)."""
    from app.utils.case_groups import case_members, case_root
    ids = [m.report_id for m in case_members(db, case_root(db, report))]
    f = (db.query(OwnerFollowUp).filter(OwnerFollowUp.report_id.in_(ids))
         .order_by(OwnerFollowUp.created_at.desc(), OwnerFollowUp.followup_id.desc()).first()) if ids else None
    if f is None:
        return None
    summary = {
        "open": f.status == "observing",
        "status": f.status,
        "due_at": _utc_iso(f.due_at),
        "extended": bool(f.is_extended),
        "ended_at": _utc_iso(f.closed_at),
        "outcome": None if f.status == "observing" else OBS_OUTCOME_TEXT.get(f.status, f.status),
        # created_at comes from the database clock (local time); the other times are written in UTC
        "started_at": _utc_iso(db_local_to_utc(db, f.created_at)),
    }
    if staff_details:
        closer = db.get(User, f.closed_by) if f.closed_by else None
        summary.update({
            "extension_days": f.extension_days if f.is_extended else None,
            "extension_reason": f.extension_reason if f.is_extended else None,
            "closed_by_name": closer.name if closer else None,
        })
    return summary
