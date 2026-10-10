import logging
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.user import User
from app.services.email_service import queue_email, is_valid_email
from app.services import email_templates

logger = logging.getLogger("stray_safe.notification_dispatcher")


def dispatch_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "status_update",
    related_id: Optional[int] = None,
    email_data: Optional[Dict[str, Any]] = None,
) -> Notification:
    """
    Unified notification dispatcher for StraySafe 2.0.
    1. Records the in-app Notification in the database.
    2. If email_data is provided, checks preferences, deduplicates via idempotency_key,
       and asynchronously delivers the branded email.
    """
    # 1. In-app Notification
    notif = Notification(
        user_id=user_id,
        title=title[:255],
        message=message[:1000],
        type=notification_type,
        related_id=related_id,
        is_read=False,
    )
    db.add(notif)

    # 2. Operational Email Dispatch
    if email_data:
        try:
            recipient_email = email_data.get("recipient_email")
            if not recipient_email:
                user = db.query(User).filter(User.user_id == user_id).first()
                if user and user.email:
                    recipient_email = user.email

            if recipient_email and is_valid_email(recipient_email):
                subject = email_data.get("subject", title)
                text_body = email_data.get("text_body", message)
                html_body = email_data.get("html_body", f"<p>{message}</p>")
                category = email_data.get("category", "reports")
                template_key = email_data.get("template_key", notification_type)
                idempotency_key = email_data.get("idempotency_key")
                rel_type = email_data.get("related_entity_type")
                rel_id = email_data.get("related_entity_id", related_id)

                queue_email(
                    db=db,
                    recipient_email=recipient_email,
                    subject=subject,
                    text_body=text_body,
                    html_body=html_body,
                    template_key=template_key,
                    category=category,
                    user_id=user_id,
                    idempotency_key=idempotency_key,
                    related_entity_type=rel_type,
                    related_entity_id=rel_id,
                )
        except Exception as email_err:
            logger.warning(f"Failed to queue notification email for user #{user_id}: {email_err}")

    return notif


# =============================================================================
# ROLE-FOCUSED DISPATCH CONVENIENCE HELPERS
# =============================================================================

def notify_report_submitted(
    db: Session,
    resident: User,
    report_id: int,
    animal_type: str,
    animal_breed: Optional[str],
    landmark: Optional[str],
    priority: str,
) -> None:
    """Dispatches submission confirmation to the reporting resident."""
    subject, text_b, html_b = email_templates.render_report_submitted_email(
        user_name=resident.name,
        report_id=report_id,
        animal_type=animal_type,
        animal_breed=animal_breed,
        landmark=landmark,
        priority=priority,
    )
    email_data = {
        "recipient_email": resident.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "reports",
        "template_key": "report_submitted",
        "idempotency_key": f"report_submitted_{report_id}",
        "related_entity_type": "report",
        "related_entity_id": report_id,
    }
    dispatch_notification(
        db=db,
        user_id=resident.user_id,
        title=f"Report #{report_id} Submitted Successfully",
        message=f"Your stray report #{report_id} ({animal_breed or animal_type or 'Animal'}) was received and is pending official review.",
        notification_type="status_update",
        related_id=report_id,
        email_data=email_data,
    )


def notify_report_status_update(
    db: Session,
    recipient: User,
    report_id: int,
    status_id: int,
    status_name: str,
    remarks: Optional[str] = None,
    landmark: Optional[str] = None,
) -> None:
    """Dispatches status milestone update to resident reporter."""
    subject, text_b, html_b = email_templates.render_report_status_email(
        user_name=recipient.name,
        report_id=report_id,
        status_name=status_name,
        remarks=remarks,
        landmark=landmark,
    )
    email_data = {
        "recipient_email": recipient.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "reports",
        "template_key": "report_status_update",
        "idempotency_key": f"report_{report_id}_status_{status_id}",
        "related_entity_type": "report",
        "related_entity_id": report_id,
    }
    notif_msg = f"Your report #{report_id} status has been updated to '{status_name}'."
    if remarks:
        notif_msg += f" Remarks: {remarks}"

    dispatch_notification(
        db=db,
        user_id=recipient.user_id,
        title=f"Report Update: {status_name}",
        message=notif_msg,
        notification_type="status_update",
        related_id=report_id,
        email_data=email_data,
    )


def notify_ai_match_alert(
    db: Session,
    pet_owner: User,
    pet_name: str,
    pet_id: int,
    report_id: int,
    match_score: int,
    landmark: Optional[str] = None,
) -> None:
    """Dispatches look-alike AI sighting alert to pet owner."""
    subject, text_b, html_b = email_templates.render_ai_match_alert_email(
        user_name=pet_owner.name,
        pet_name=pet_name,
        report_id=report_id,
        match_score=match_score,
        landmark=landmark,
    )
    email_data = {
        "recipient_email": pet_owner.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "pet_matches",
        "template_key": "ai_match_alert",
        "idempotency_key": f"match_alert_pet_{pet_id}_report_{report_id}",
        "related_entity_type": "report",
        "related_entity_id": report_id,
    }
    dispatch_notification(
        db=db,
        user_id=pet_owner.user_id,
        title=f"🔍 Look-Alike Pet Sighting Detected (Report #{report_id})",
        message=(
            f"AI identified a {match_score}% look-alike match for your registered pet '{pet_name}' "
            f"in Report #{report_id}. Please review the sighting."
        ),
        notification_type="potential_match",
        related_id=report_id,
        email_data=email_data,
    )


def notify_claim_decision(
    db: Session,
    pet_owner: User,
    pet_name: str,
    claim_id: int,
    report_id: int,
    decision_status: str,
    remarks: Optional[str] = None,
) -> None:
    """Dispatches pet claim approval or rejection notice."""
    subject, text_b, html_b = email_templates.render_claim_decision_email(
        user_name=pet_owner.name,
        pet_name=pet_name,
        report_id=report_id,
        claim_status=decision_status,
        remarks=remarks,
    )
    email_data = {
        "recipient_email": pet_owner.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "claims",
        "template_key": f"claim_{decision_status.lower()}",
        "idempotency_key": f"claim_{claim_id}_{decision_status.lower()}",
        "related_entity_type": "claim",
        "related_entity_id": claim_id,
    }
    if decision_status == "Approved":
        title = "🎉 Pet Claim Approved!"
        msg = f"Your claim for pet '{pet_name}' on report #{report_id} has been approved! You can coordinate pickup directly with your subdivision leader."
    else:
        title = f"Pet Claim {decision_status}"
        msg = f"Your claim for pet '{pet_name}' on report #{report_id} has been {decision_status.lower()}."
    if remarks:
        msg += f" Remarks: {remarks}"

    dispatch_notification(
        db=db,
        user_id=pet_owner.user_id,
        title=title,
        message=msg,
        notification_type="status_update",
        related_id=report_id,
        email_data=email_data,
    )


def notify_pet_reunited(
    db: Session,
    user: User,
    pet_name: str,
    report_id: int,
    reunited_with: str,
) -> None:
    """Dispatches recovery and handover completion notice."""
    subject, text_b, html_b = email_templates.render_pet_reunited_email(
        user_name=user.name,
        pet_name=pet_name,
        report_id=report_id,
        reunited_with=reunited_with,
    )
    email_data = {
        "recipient_email": user.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "claims",
        "template_key": "pet_reunited",
        "idempotency_key": f"pet_reunited_rep_{report_id}",
        "related_entity_type": "report",
        "related_entity_id": report_id,
    }
    dispatch_notification(
        db=db,
        user_id=user.user_id,
        title="🤝 Pet Handover Complete",
        message=f"Pet '{pet_name}' on Report #{report_id} has been physically reunited with {reunited_with}. Case is now resolved.",
        notification_type="status_update",
        related_id=report_id,
        email_data=email_data,
    )


def notify_qr_scanned(
    db: Session,
    pet_owner: User,
    pet_name: str,
    landmark: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> None:
    """Dispatches urgent collar QR scan alert."""
    subject, text_b, html_b = email_templates.render_qr_scanned_email(
        user_name=pet_owner.name,
        pet_name=pet_name,
        landmark=landmark,
        latitude=lat,
        longitude=lng,
    )
    email_data = {
        "recipient_email": pet_owner.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "pet_matches",
        "template_key": "qr_tag_scanned",
        "idempotency_key": None,  # Scan alerts are real-time events
        "related_entity_type": "pet",
    }
    dispatch_notification(
        db=db,
        user_id=pet_owner.user_id,
        title=f"🚨 QR Code Scanned for {pet_name}!",
        message=f"Someone scanned the QR tag for {pet_name} near {landmark or 'a reported location'}.",
        notification_type="alert",
        email_data=email_data,
    )


def notify_leader_new_report(
    db: Session,
    leader: User,
    report_id: int,
    animal_type: str,
    landmark: Optional[str],
    subdivision_name: Optional[str],
    priority: str,
) -> None:
    """Alerts subdivision leader of new report in their area."""
    subject, text_b, html_b = email_templates.render_leader_new_report_email(
        leader_name=leader.name,
        report_id=report_id,
        animal_type=animal_type,
        landmark=landmark,
        subdivision_name=subdivision_name,
        priority=priority,
    )
    email_data = {
        "recipient_email": leader.email,
        "subject": subject,
        "text_body": text_b,
        "html_body": html_b,
        "category": "reports",
        "template_key": "leader_new_report",
        "idempotency_key": f"leader_{leader.user_id}_new_report_{report_id}",
        "related_entity_type": "report",
        "related_entity_id": report_id,
    }
    dispatch_notification(
        db=db,
        user_id=leader.user_id,
        title=f"New Stray Report #{report_id}",
        message=f"A new {animal_type or 'stray'} report was submitted in your subdivision at {landmark or 'designated location'}.",
        notification_type="alert",
        related_id=report_id,
        email_data=email_data,
    )
