import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.report import Report
from app.models.user import User
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.utils.notification_dispatcher import dispatch_notification
from app.services import email_templates

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
                    notif_msg = (
                        f"Report #{report.report_id} ({animal_desc}) in your subdivision "
                        f"has remained unassigned for over {threshold_minutes} minutes. "
                        f"Please review and claim this report."
                    )
                    subj, txt_b, html_b = email_templates.render_unassigned_reminder_email(
                        leader_name=leader.name,
                        report_id=report.report_id,
                        animal_type=animal_desc,
                        landmark=report.landmark,
                        minutes_unassigned=threshold_minutes,
                    )
                    dispatch_notification(
                        db=db,
                        user_id=leader.user_id,
                        title=f"⚠️ Unassigned Report #{report.report_id}",
                        message=notif_msg,
                        notification_type="unassigned_report_alert",
                        related_id=report.report_id,
                        email_data={
                            "recipient_email": leader.email,
                            "subject": subj,
                            "text_body": txt_b,
                            "html_body": html_b,
                            "category": "reminders",
                            "template_key": "unassigned_report_reminder",
                            "idempotency_key": f"unassigned_{report.report_id}_{leader.user_id}",
                            "related_entity_type": "report",
                            "related_entity_id": report.report_id,
                        }
                    )

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


def prune_old_notifications(retention_days: int = 30) -> int:
    """
    Delete read + archived notifications older than `retention_days` days.
    Safe to run periodically — only removes records that users have already read & archived.
    """
    db: Session = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=retention_days)
        deleted = db.query(Notification).filter(
            Notification.is_archived == True,
            Notification.is_read == True,
            Notification.created_at < cutoff
        ).delete(synchronize_session=False)
        db.commit()
        if deleted > 0:
            logger.info(f"Pruned {deleted} archived and read notifications older than {retention_days} days.")
        return deleted
    except Exception as e:
        db.rollback()
        logger.error(f"Error pruning notifications: {e}")
        return 0
    finally:
        db.close()


def check_and_notify_owner_followups() -> int:
    """
    Checks all active owner observations for 24h owner reminders
    and leader due notices without duplicate delivery.
    """
    from app.utils.owner_followups import check_and_notify_due_followups

    db: Session = SessionLocal()
    try:
        return check_and_notify_due_followups(db)
    except Exception as e:
        logger.error(f"Error in check_and_notify_owner_followups: {e}")
        return 0
    finally:
        db.close()


async def start_unassigned_reports_watcher(interval_seconds: int = 60, threshold_minutes: int = 30):
    """
    Background loop that wakes up every `interval_seconds` to check for stale unassigned reports
    and active owner observation follow-up milestones.
    Also triggers nightly pruning of old archived notifications.
    """
    logger.info(
        f"Starting Operations Watcher: checking every {interval_seconds}s for unassigned reports and owner follow-ups."
    )
    iteration = 0
    while True:
        try:
            await asyncio.to_thread(check_and_notify_unassigned_reports, threshold_minutes)
            await asyncio.to_thread(check_and_notify_owner_followups)

            iteration += 1
            # Run notification pruning roughly once per 24 hours (1440 iterations at 60s)
            if iteration % 1440 == 0:
                await asyncio.to_thread(prune_old_notifications, 30)

        except asyncio.CancelledError:
            logger.info("Operations Watcher stopped.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in operations watcher: {e}")

        await asyncio.sleep(interval_seconds)
