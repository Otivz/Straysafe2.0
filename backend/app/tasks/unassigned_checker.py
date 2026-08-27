import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.report import Report
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
        # Exclude completed/terminal statuses (6: Resolved, 7: Rejected, 8: Cancelled, 11: Incident Resolved, 12: Deceased)
        terminal_statuses = [6, 7, 8, 11, 12]
        
        unassigned_reports = db.query(Report).filter(
            Report.assigned_leader_id.is_(None),
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


async def start_unassigned_reports_watcher(interval_seconds: int = 60, threshold_minutes: int = 30):
    """
    Background loop that wakes up every `interval_seconds` to check for stale unassigned reports.
    """
    logger.info(
        f"Starting Unassigned Reports Watcher: checking every {interval_seconds}s for reports older than {threshold_minutes}m."
    )
    while True:
        try:
            await asyncio.to_thread(check_and_notify_unassigned_reports, threshold_minutes)
        except asyncio.CancelledError:
            logger.info("Unassigned Reports Watcher stopped.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in unassigned reports watcher: {e}")

        await asyncio.sleep(interval_seconds)
