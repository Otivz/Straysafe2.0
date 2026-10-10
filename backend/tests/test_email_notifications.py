import os
import sys
from datetime import datetime

# Ensure backend path is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.user import User
from app.models.notification import Notification
from app.models.notification_preference import UserNotificationPreference
from app.models.email_log import EmailLog
from app.services.email_service import (
    queue_email,
    check_user_email_preference,
    is_valid_email
)
from app.main import ensure_email_notification_tables
from app.services.email_templates import (
    render_report_submitted_email,
    render_report_status_email,
    render_ai_match_alert_email,
    render_claim_decision_email,
    render_rescue_assignment_email,
    render_qr_scanned_email,
    render_unassigned_reminder_email
)
from app.utils.notification_dispatcher import dispatch_notification


def get_db_session():
    ensure_email_notification_tables()
    return SessionLocal()


def get_test_user(db: Session):
    test_email = "test_email_resident@straysafe.local"
    user = db.query(User).filter(User.email == test_email).first()
    if not user:
        user = User(
            name="Test Notification Resident",
            email=test_email,
            phone="09170001111",
            password="mock_hash_for_testing",
            role_id=1,  # Resident
            status='Active'
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def test_email_validation():
    assert is_valid_email("resident@straysafe.ph") is True
    assert is_valid_email("resident+test@subd.gov.ph") is True
    assert is_valid_email("invalid-email") is False
    assert is_valid_email("") is False
    assert is_valid_email("   ") is False


def test_email_templates_render():
    subj, text, html = render_report_submitted_email("Maria", 101, "Dog", "Golden Retriever", "South Gate", "High")
    assert "101" in subj
    assert "Maria" in html
    assert "View Report Status" in html

    subj, text, html = render_report_status_email("Maria", 101, "Under Investigation", "Barangay dispatch dispatched officers", "South Gate")
    assert "Under Investigation" in subj
    assert "Barangay dispatch dispatched officers" in html

    subj, text, html = render_ai_match_alert_email("Juan", "Barnaby", 202, 94, "Phase 2 Clubhouse")
    assert "Barnaby" in subj
    assert "94% Similarity" in html

    subj, text, html = render_claim_decision_email("Ana", "Brownie", 55, "Approved", "Please proceed to Barangay Hall with valid ID.")
    assert "Approved" in subj
    assert "Brownie" in html

    subj, text, html = render_rescue_assignment_email("Officer Santos", 12, 303, "Dog", "Phase 3 Gate", "Alpha Team")
    assert "303" in subj
    assert "Officer Santos" in html

    subj, text, html = render_qr_scanned_email("Carlos", "Max", "Barangay Park Bench", 14.801, 121.002)
    assert "Max" in subj
    assert "Barangay Park Bench" in html

    subj, text, html = render_unassigned_reminder_email("Leader Gomez", 404, "Dog", "Phase 1 Gate", 35)
    assert "404" in subj
    assert "Leader Gomez" in html


def test_user_notification_preferences_crud(db_session: Session, test_user: User):
    pref = db_session.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == test_user.user_id
    ).first()
    if not pref:
        pref = UserNotificationPreference(
            user_id=test_user.user_id,
            email_reports=True,
            email_rescues=True,
            email_pet_matches=True,
            email_claims=True,
            email_reminders=True
        )
        db_session.add(pref)
        db_session.commit()
        db_session.refresh(pref)

    assert pref.email_reports is True
    assert pref.email_pet_matches is True

    # Test preference check function
    assert check_user_email_preference(db_session, test_user.user_id, "reports") is True
    assert check_user_email_preference(db_session, test_user.user_id, "pet_matches") is True

    # Turn off pet_matches
    pref.email_pet_matches = False
    db_session.commit()

    assert check_user_email_preference(db_session, test_user.user_id, "pet_matches") is False
    # Reports should still be True
    assert check_user_email_preference(db_session, test_user.user_id, "reports") is True

    # Re-enable
    pref.email_pet_matches = True
    db_session.commit()
    assert check_user_email_preference(db_session, test_user.user_id, "pet_matches") is True


def test_dispatch_notification_dual_delivery(db_session: Session, test_user: User):
    ts = int(datetime.now().timestamp())
    idempotency_key = f"test_dual_delivery_{test_user.user_id}_{ts}"

    in_app = dispatch_notification(
        db=db_session,
        user_id=test_user.user_id,
        title="Report Verified #999",
        message="Your report has been verified by barangay officials.",
        notification_type="report_status",
        related_id=999,
        email_data={
            "recipient_email": test_user.email,
            "subject": "Report #999 Verified",
            "html_body": "<p>Your report has been verified.</p>",
            "text_body": "Your report has been verified.",
            "category": "reports",
            "template_key": "report_status_update",
            "idempotency_key": idempotency_key,
            "related_entity_type": "report",
            "related_entity_id": 999
        }
    )

    # In-app notification must always be created
    assert in_app is not None
    assert in_app.user_id == test_user.user_id
    assert in_app.title == "Report Verified #999"

    # Email log must be created
    email_log = db_session.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).first()
    assert email_log is not None
    assert email_log.recipient_email == test_user.email
    assert email_log.idempotency_key == idempotency_key
    assert email_log.status in ("Pending", "Sent", "Simulated")


def test_idempotency_deduplication(db_session: Session, test_user: User):
    ts = int(datetime.now().timestamp())
    idempotency_key = f"test_idempotent_key_{test_user.user_id}_{ts}"

    email_payload = {
        "recipient_email": test_user.email,
        "subject": "Idempotent Reminder",
        "html_body": "<p>Reminder text</p>",
        "category": "reminders",
        "template_key": "reminder_unassigned",
        "idempotency_key": idempotency_key
    }

    # First call
    dispatch_notification(
        db=db_session,
        user_id=test_user.user_id,
        title="Idempotent Test",
        message="Testing duplicate prevention",
        notification_type="alert",
        email_data=email_payload
    )
    log1 = db_session.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).first()
    assert log1 is not None

    # Count of email logs with this idempotency key
    count1 = db_session.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).count()
    assert count1 == 1

    # Second call with same idempotency_key
    dispatch_notification(
        db=db_session,
        user_id=test_user.user_id,
        title="Idempotent Test Duplicate",
        message="Duplicate call",
        notification_type="alert",
        email_data=email_payload
    )

    # Must still only have 1 email log record (no duplicate transmission queued)
    count2 = db_session.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).count()
    assert count2 == 1


def test_preference_opt_out_suppression(db_session: Session, test_user: User):
    # Set claims preference to False
    pref = db_session.query(UserNotificationPreference).filter(
        UserNotificationPreference.user_id == test_user.user_id
    ).first()
    pref.email_claims = False
    db_session.commit()

    ts = int(datetime.now().timestamp())
    idempotency_key = f"test_opt_out_{test_user.user_id}_{ts}"

    in_app = dispatch_notification(
        db=db_session,
        user_id=test_user.user_id,
        title="Claim Review Update",
        message="Your claim has been updated.",
        notification_type="claim_decision",
        related_id=77,
        email_data={
            "recipient_email": test_user.email,
            "subject": "Claim #77 Update",
            "html_body": "<p>Claim update email</p>",
            "category": "claims",
            "template_key": "claim_decision",
            "idempotency_key": idempotency_key
        }
    )

    # In-app notification still created
    assert in_app is not None
    # Email suppressed due to user opt-out!
    email_log = db_session.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).first()
    assert email_log is None

    # Reset preference back to True
    pref.email_claims = True
    db_session.commit()


if __name__ == "__main__":
    print("=== RUNNING STRAYSafe EMAIL NOTIFICATION TEST SUITE ===")
    ensure_email_notification_tables()
    db = SessionLocal()
    try:
        # 1. Validation test
        test_email_validation()
        print("[PASS] test_email_validation")

        # 2. Template render test
        test_email_templates_render()
        print("[PASS] test_email_templates_render")

        # 3. Setup test user
        test_email = "test_email_resident@straysafe.local"
        user = db.query(User).filter(User.email == test_email).first()
        if not user:
            user = User(
                name="Test Notification Resident",
                email=test_email,
                phone="09170001111",
                password="mock_hash_for_testing",
                role_id=1,
                status='Active'
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        # 4. Preferences CRUD test
        test_user_notification_preferences_crud(db, user)
        print("[PASS] test_user_notification_preferences_crud")

        # 5. Dual delivery test
        test_dispatch_notification_dual_delivery(db, user)
        print("[PASS] test_dispatch_notification_dual_delivery")

        # 6. Idempotency test
        test_idempotency_deduplication(db, user)
        print("[PASS] test_idempotency_deduplication")

        # 7. Preference suppression test
        test_preference_opt_out_suppression(db, user)
        print("[PASS] test_preference_opt_out_suppression")

        print("\n=== ALL EMAIL NOTIFICATION TESTS PASSED SUCCESSFULLY! ===")
    finally:
        db.close()

