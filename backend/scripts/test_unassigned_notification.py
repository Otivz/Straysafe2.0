import os
import sys
from datetime import datetime, timedelta

# Ensure backend root is on sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.report import Report
from app.models.user import User
from app.models.notification import Notification
from app.tasks.unassigned_checker import check_and_notify_unassigned_reports

def run_tests():
    db = SessionLocal()
    try:
        # Pre-cleanup lingering test records
        db.query(Notification).filter(Notification.type == "unassigned_report_alert").delete()
        db.query(Report).filter(Report.animal_breed == "Golden Retriever", Report.description == "Test Unassigned Report").delete()
        db.commit()

        print("=== 1. Setting up test report for unassigned notification test ===")
        # Find or use a subdivision leader (role_id == 2)
        leader = db.query(User).filter(User.role_id == 2).first()
        if not leader:
            print("No leader found in database to test with.")
            return

        print(f"Found Subdivision Leader #{leader.user_id} ({leader.name}) in subdivision #{leader.subdivision_id}")

        # Find a resident user to create a report
        resident = db.query(User).filter(User.role_id == 1).first() or leader

        # Create a test report created 45 minutes ago, unassigned and un-notified
        old_time = datetime.now() - timedelta(minutes=45)
        test_report = Report(
            user_id=resident.user_id,
            subdivision_id=leader.subdivision_id,
            category_id=1,
            animal_type="Dog",
            animal_breed="Golden Retriever",
            animal_color="Golden",
            description="Test Unassigned Report",
            latitude=14.5995,
            longitude=120.9842,
            current_status_id=1,
            assigned_leader_id=None,
            unassigned_notified=False,
            created_at=old_time
        )
        db.add(test_report)
        db.commit()
        db.refresh(test_report)
        
        # Explicitly backdate created_at in database if server_default overwrote it
        db.query(Report).filter(Report.report_id == test_report.report_id).update({
            "created_at": old_time,
            "unassigned_notified": False,
            "assigned_leader_id": None
        })
        db.commit()
        print(f"Created test report #{test_report.report_id} with backdated created_at = {old_time}")

        # Count notifications before
        notif_count_before = db.query(Notification).filter(
            Notification.user_id == leader.user_id,
            Notification.related_id == test_report.report_id
        ).count()
        print(f"Notifications for Leader #{leader.user_id} on report #{test_report.report_id} before test: {notif_count_before}")

        print("\n=== 2. Running check_and_notify_unassigned_reports(threshold_minutes=30) ===")
        processed = check_and_notify_unassigned_reports(threshold_minutes=30)
        print(f"Processed {processed} unassigned report(s)")

        # End test transaction snapshot to read committed changes from checker
        db.commit()

        notifs = db.query(Notification).filter(
            Notification.user_id == leader.user_id,
            Notification.related_id == test_report.report_id
        ).all()
        print(f"Notifications after running checker for report #{test_report.report_id}: {len(notifs)}")
        assert len(notifs) > notif_count_before, "Notification was not created for leader!"
        latest_notif = notifs[-1]
        print(f"Created Notification: ID={latest_notif.notification_id}, Type='{latest_notif.type}'")

        # Verify report.unassigned_notified is now True
        updated_report = db.query(Report).filter(Report.report_id == test_report.report_id).first()
        print(f"Report #{updated_report.report_id} unassigned_notified = {updated_report.unassigned_notified}")
        assert updated_report.unassigned_notified is True, "Report was not marked as notified!"

        print("\n=== 3. Running second check to ensure idempotency (no duplicate spam) ===")
        processed_second = check_and_notify_unassigned_reports(threshold_minutes=30)
        print(f"Second run processed: {processed_second} reports")
        
        notifs_second = db.query(Notification).filter(
            Notification.user_id == leader.user_id,
            Notification.related_id == test_report.report_id
        ).all()
        assert len(notifs_second) == len(notifs), "Duplicate notification was erroneously created!"
        print("Idempotency verified: No duplicate notification sent.")

        print("\n=== 4. Cleaning up test record ===")
        db.query(Notification).filter(Notification.related_id == test_report.report_id).delete()
        db.query(Report).filter(Report.report_id == test_report.report_id).delete()
        db.commit()
        print("Cleaned up test report and notifications.")

        print("\nALL UNASSIGNED NOTIFICATION TESTS PASSED SUCCESSFULLY!")

    except Exception as e:
        db.rollback()
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
