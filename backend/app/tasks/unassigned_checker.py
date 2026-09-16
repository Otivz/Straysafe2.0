import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.report import Report, HoldingAnimal, HoldingTimeline
from app.models.user import User
from app.models.notification import Notification
from app.models.audit_log import AuditLog

logger = logging.getLogger("stray_safe.unassigned_checker")

def check_and_notify_unassigned_reports(threshold_minutes: int = 30) -> int:
    """
    Checks for reports that:
    1. Have no assigned leader (assigned_leader_id IS NULL)
    2. Have not been notified yet (unassigned_notified == False)
    3. Are in an active/pending status (e.g. status_id = 1 or active)
    4. Were created at least `threshold_minutes` ago

    Sends a notification to all active Subdivision Leaders in the matching subdivision,
    then marks `unassigned_notified = True`.

    Returns the number of reports processed.
    """
    db: Session = SessionLocal()
    processed_count = 0
    try:
        cutoff_time = datetime.now() - timedelta(minutes=threshold_minutes)
        
        # Query unassigned, un-notified active reports created before cutoff
        # Exclude completed/terminal statuses (3: Rejected, 6: Resolved, 9: Claimed, 10: Released, 11: Incident Resolved, 12: Deceased, 14: False Alarm / Dismissed, 18: Merged / Duplicate)
        terminal_statuses = [3, 6, 7, 8, 9, 10, 11, 12, 14, 18]
        
        unassigned_reports = db.query(Report).filter(
            Report.assigned_leader_id.is_(None),
            Report.duplicate_of_report_id.is_(None),
            Report.unassigned_notified.is_(False),
            ~Report.current_status_id.in_(terminal_statuses),
            Report.created_at <= cutoff_time
        ).all()

        if not unassigned_reports:
            return 0

        for report in unassigned_reports:
            # Find all active Subdivision Leaders in this subdivision (role_id == 2)
            leaders = db.query(User).filter(
                User.subdivision_id == report.subdivision_id,
                User.role_id == 2
            ).all()

            if leaders:
                animal_desc = report.animal_breed or report.animal_type or "Animal"
                for leader in leaders:
                    notif = Notification(
                        user_id=leader.user_id,
                        title=f"⚠️ Unassigned Report #{report.report_id}",
                        message=(
                            f"Report #{report.report_id} ({animal_desc}) in your subdivision "
                            f"has remained unassigned for over {threshold_minutes} minutes. "
                            f"Please review and claim this report."
                        ),
                        type="unassigned_report_alert",
                        related_id=report.report_id
                    )
                    db.add(notif)

                # Record an audit log for traceability
                try:
                    audit = AuditLog(
                        action="UNASSIGNED_REPORT_ALERT",
                        target_table="reports",
                        target_id=report.report_id,
                        description=f"Unassigned report alert triggered after {threshold_minutes}m for Subdivision #{report.subdivision_id}.",
                        new_values={
                            "report_id": report.report_id,
                            "subdivision_id": report.subdivision_id,
                            "threshold_minutes": threshold_minutes,
                            "notified_leader_ids": [l.user_id for l in leaders]
                        }
                    )
                    db.add(audit)
                except Exception as audit_err:
                    logger.warning(f"Failed to create audit log for unassigned report #{report.report_id}: {audit_err}")

            # Mark as notified so we do not notify multiple times
            report.unassigned_notified = True
            processed_count += 1

        db.commit()
        if processed_count > 0:
            logger.info(f"Sent unassigned report notifications for {processed_count} report(s).")
    except Exception as e:
        db.rollback()
        logger.error(f"Error checking unassigned reports: {e}")
    finally:
        db.close()

    return processed_count


def check_and_notify_overdue_holding_animals(default_stay_days: int = 3) -> int:
    """
    Checks for active holding animals that:
    1. Are not resolved/discharged (facility_status not in 3, 4, 5, 7, 8)
    2. Have an intake_date
    3. Have exceeded the stay duration limit (default 3 days)
    4. Have not been notified yet (overdue_notified is False or None)

    Sends a high-priority holding_overdue_alert notification to all active
    Barangay Staff and Head Officers (role_id IN (3, 4, 5)), records a timeline entry,
    and marks overdue_notified = True.
    """
    db: Session = SessionLocal()
    processed_count = 0
    try:
        now = datetime.now()
        # Statuses meaning discharged/closed: 3=Claimed, 4=Deceased, 5=Transferred, 7=Adopted, 8=Impounded
        terminal_statuses = [3, 4, 5, 7, 8]

        cutoff_date = now - timedelta(days=default_stay_days)

        overdue_animals = db.query(HoldingAnimal).filter(
            ~HoldingAnimal.facility_status.in_(terminal_statuses),
            HoldingAnimal.intake_date <= cutoff_date,
            (HoldingAnimal.overdue_notified.is_(False) | HoldingAnimal.overdue_notified.is_(None))
        ).all()

        if not overdue_animals:
            return 0

        # Query all Barangay personnel (role_id 3: Staff, 4: Head Officer, 5: Admin)
        brgy_staff_all = db.query(User).filter(
            User.role_id.in_([3, 4, 5])
        ).all()

        for animal in overdue_animals:
            report = db.query(Report).filter(Report.report_id == animal.report_id).first()
            intake_time = animal.intake_date or animal.created_at
            days_held = max(default_stay_days, int((now - intake_time).total_seconds() // 86400))
            animal_desc = animal.animal_name or animal.breed or animal.animal_type or "Rescued Stray"
            rep_id_str = f"#{report.report_id}" if report else f"Holding #{animal.holding_id}"

            target_staff = [
                s for s in brgy_staff_all
                if not report or not getattr(report, 'barangay_id', None) or getattr(s, 'barangay_id', None) is None or s.barangay_id == report.barangay_id
            ] or brgy_staff_all

            for staff in target_staff:
                existing = db.query(Notification).filter(
                    Notification.user_id == staff.user_id,
                    Notification.type == "holding_overdue_alert",
                    Notification.related_id == animal.holding_id
                ).first()

                if not existing:
                    notif = Notification(
                        user_id=staff.user_id,
                        title=f"🚨 Holding Stay Overdue: {animal_desc} ({rep_id_str})",
                        message=(
                            f"Animal in holding facility has reached {days_held} days in custody, "
                            f"exceeding the {default_stay_days}-day stay limit. "
                            f"Please review for impoundment or promote to adoption catalog."
                        ),
                        type="holding_overdue_alert",
                        related_id=animal.holding_id
                    )
                    db.add(notif)

            # Record timeline entry
            timeline_entry = HoldingTimeline(
                holding_id=animal.holding_id,
                event_type='observation',
                title=f'Stay Limit Reached ({days_held} Days Held)',
                notes=f'Animal reached {days_held} days in facility custody, exceeding the {default_stay_days}-day stay limit. Barangay responders notified.',
            )
            db.add(timeline_entry)

            animal.overdue_notified = True
            processed_count += 1

        db.commit()
        if processed_count > 0:
            logger.info(f"Sent overdue holding notifications for {processed_count} animal(s).")
    except Exception as e:
        db.rollback()
        logger.error(f"Error checking overdue holding animals: {e}")
    finally:
        db.close()

    return processed_count


async def start_unassigned_reports_watcher(interval_seconds: int = 60, threshold_minutes: int = 30):
    """
    Background loop that wakes up every `interval_seconds` to check for stale unassigned reports
    and overdue holding facility animals.
    """
    logger.info(
        f"Starting Operations Watcher: checking every {interval_seconds}s for unassigned reports and overdue holding animals."
    )
    while True:
        try:
            await asyncio.to_thread(check_and_notify_unassigned_reports, threshold_minutes)
            await asyncio.to_thread(check_and_notify_overdue_holding_animals, 3)
        except asyncio.CancelledError:
            logger.info("Operations Watcher stopped.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in operations watcher: {e}")

        await asyncio.sleep(interval_seconds)
