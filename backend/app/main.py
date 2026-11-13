import sys
import os
import json
import asyncio
import logging
from typing import Any, cast
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter
from dotenv import load_dotenv

# Load environment variables from the project root
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger("uvicorn.error")

# Add the 'backend' directory to sys.path so 'app' can be imported correctly
# when running from the project root.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Local imports (now safe to import after path fix)
from app.database import engine, Base, SessionLocal
from app.routes import auth, users, reports, pets, notifications, announcements, chat, warnings, matches, landmarks, admin, report_returns, pet_ownership, analytics, owner_followups
from app.routes import audit_logs as audit_logs_router
from app.routes import push as push_routes
from app.services.push_service import start_push_queue_worker  # also registers the push hook
from app.routes import ai_jobs as ai_jobs_routes
from app.routes import manual_matching as manual_matching_routes  # also registers manual_match_decisions for create_all
from app.routes import lost_found as lost_found_routes
from app.routes import case_alerts as case_alert_routes
from app.routes import case_messages as case_message_routes
from app.routes import pet_match_confirmations as pet_match_confirmation_routes  # owner-first pet matching (owner side)
from app.routes import leader_identity as leader_identity_routes  # Phase 6 leader identity verification
from app.routes import lost_pet_alerts as lost_pet_alert_routes  # neighbor-to-neighbor lost pet sightings
from app.routes import cases as case_routes  # Subdivision Admin case workflow (status, assessment, closure, referrals, ...)
from app.routes import ownership_claims as ownership_claim_routes  # resident ownership claims on found animals
from app.models.case_records import CaseFollowUp, CaseContactLog, CaseLink, OwnershipClaim  # noqa: F401 — tables for create_all
from app.models.audit_log import AuditLog  # noqa: F401 — ensures table is in Base.metadata
from app.models.revoked_token import RevokedToken  # noqa: F401 — ensures table is in Base.metadata
from app.models.report_dispute import ReportDispute  # noqa: F401
from app.models.chat import ChatThread, ChatMessage  # noqa: F401
from app.models.warning import OwnerWarning  # noqa: F401
from app.models.report_match import ReportMatch  # noqa: F401
from app.models.landmark import Landmark  # noqa: F401
from app.models.coverage import CoverageSetting  # noqa: F401
from app.models.otp import OtpVerification  # noqa: F401
from app.models.system_setting import SystemSetting  # noqa: F401
from app.models.ai_job import AiJob  # noqa: F401
from app.models.ai_vision_comparison import AiVisionComparison  # noqa: F401
from app.models.notification_preference import UserNotificationPreference  # noqa: F401
from app.models.email_log import EmailLog  # noqa: F401
from app.tasks.unassigned_checker import start_unassigned_reports_watcher
from app.services.email_service import start_email_queue_worker


def ensure_report_media_status_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_media' "
            "AND COLUMN_NAME = 'status_id'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE report_media ADD COLUMN status_id INT NULL"))
            conn.execute(text(
                "ALTER TABLE report_media "
                "ADD CONSTRAINT fk_report_media_status_id "
                "FOREIGN KEY (status_id) REFERENCES report_status(status_id) ON DELETE SET NULL"
            ))

def ensure_report_media_animal_type_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_media' "
            "AND COLUMN_NAME = 'animal_type'"
        ))
        if result.scalar() == 0:
            conn.execute(text(
                "ALTER TABLE report_media ADD COLUMN animal_type ENUM('Dog', 'Cat', 'Unknown') "
                "DEFAULT 'Unknown' AFTER media_type"
            ))

def ensure_report_media_dominant_color_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_media' "
            "AND COLUMN_NAME = 'dominant_color'"
        ))
        if result.scalar() == 0:
            conn.execute(text(
                "ALTER TABLE report_media ADD COLUMN dominant_color VARCHAR(100) "
                "NULL AFTER animal_type"
            ))

def ensure_report_ai_suggestion_columns():
    with engine.begin() as conn:
        # Check one of the columns to see if they need to be added
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND COLUMN_NAME = 'ai_animal_type'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_animal_type VARCHAR(50) NULL"))
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_dominant_color VARCHAR(100) NULL"))
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_estimated_size VARCHAR(50) NULL"))
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_suggested_risk_level VARCHAR(50) NULL"))
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_suggested_priority VARCHAR(50) NULL"))

        # Check for the new ai_possible_breed column
        result_breed = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND COLUMN_NAME = 'ai_possible_breed'"
        ))
        if result_breed.scalar() == 0:
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_possible_breed VARCHAR(100) NULL"))

        # Check for the new ai_suggested_priority_reason column
        result_reason = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND COLUMN_NAME = 'ai_suggested_priority_reason'"
        ))
        if result_reason.scalar() == 0:
            conn.execute(text("ALTER TABLE reports ADD COLUMN ai_suggested_priority_reason TEXT NULL"))

def ensure_ai_photo_columns():
    with engine.begin() as conn:
        cols_to_add_reports = [
            ('ai_photo_likelihood', 'DECIMAL(5, 2) NULL'),
            ('ai_photo_status', 'VARCHAR(100) NULL'),
            ('ai_photo_recommendation', 'TEXT NULL'),
            ('ai_photo_details', 'TEXT NULL'),
        ]
        for col, col_type in cols_to_add_reports:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = :col"
            ), {"col": col})
            if res.scalar() == 0:
                conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col} {col_type}"))

        cols_to_add_media = [
            ('ai_photo_likelihood', 'DECIMAL(5, 2) NULL'),
            ('ai_photo_status', 'VARCHAR(100) NULL'),
        ]
        for col, col_type in cols_to_add_media:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_media' AND COLUMN_NAME = :col"
            ), {"col": col})
            if res.scalar() == 0:
                conn.execute(text(f"ALTER TABLE report_media ADD COLUMN {col} {col_type}"))

def ensure_report_condition_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND COLUMN_NAME = 'condition'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE reports ADD COLUMN `condition` TEXT NULL"))

def ensure_pet_vaccine_card_url_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' "
            "AND COLUMN_NAME = 'vaccine_card_url'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE pets ADD COLUMN vaccine_card_url VARCHAR(255) NULL"))

def ensure_report_status_rows():
    """Insert missing report_status rows that the application logic depends on.
    The original DB seed only had status IDs 1-10.
    The case workflow uses 11 (Incident Resolved), 12 (Deceased), 13 (Approved by Barangay).
    Inserts each row only if the status_id does not already exist.
    """
    required_statuses = {
        11: 'Incident Resolved',
        12: 'Deceased',
        13: 'Approved by Barangay',
        14: 'False Alarm / Dismissed',
        15: 'Disputed',
        16: 'Under Investigation',
        17: 'Animal Cannot Be Found',
    }
    with engine.begin() as conn:
        for status_id, status_name in required_statuses.items():
            # Only insert if this specific status_id doesn't exist yet
            conn.execute(
                text(
                    "INSERT INTO report_status (status_id, status_name) "
                    "SELECT :id, :name FROM DUAL "
                    "WHERE NOT EXISTS (SELECT 1 FROM report_status WHERE status_id = :id)"
                ),
                {"id": status_id, "name": status_name}
            )

def ensure_audit_logs_columns():
    """Add extra columns to audit_logs if they were created before this migration."""
    with engine.begin() as conn:
        for col_name, col_def in [
            ("log_type", "VARCHAR(50) NOT NULL DEFAULT 'operation'"),
            ("old_values", "JSON NULL"),
            ("new_values", "JSON NULL"),
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE audit_logs ADD COLUMN {col_name} {col_def}"))

def ensure_report_priority_enum():
    """Migrate reports.priority_level ENUM values from 'Low','Regular','High' to 'Low','Medium','High'.
    Updates existing 'Regular' records to 'Medium'.
    """
    with engine.begin() as conn:
        try:
            result = conn.execute(text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                "AND COLUMN_NAME = 'priority_level'"
            ))
            row = result.fetchone()
            if row:
                col_type = str(row[0])
                if 'Regular' in col_type:
                    # Temporarily change to VARCHAR to avoid enum restriction during update
                    conn.execute(text("ALTER TABLE reports MODIFY COLUMN priority_level VARCHAR(50) DEFAULT 'Medium'"))
                    # Update values
                    conn.execute(text("UPDATE reports SET priority_level = 'Medium' WHERE priority_level = 'Regular' OR priority_level IS NULL"))
                    # Re-apply ENUM column with Medium instead of Regular
                    conn.execute(text("ALTER TABLE reports MODIFY COLUMN priority_level ENUM('Low', 'Medium', 'High') DEFAULT 'Medium'"))
                    print("Successfully migrated reports.priority_level from ENUM('Low', 'Regular', 'High') to ENUM('Low', 'Medium', 'High')")
        except Exception as e:
            print(f"Error migrating reports.priority_level: {e}")


def ensure_pet_side_photos_columns():
    """Add photo_front_url, photo_left_url, photo_right_url, chase_incident_count columns to pets table if missing."""
    with engine.begin() as conn:
        for col_name in ["photo_front_url", "photo_left_url", "photo_right_url"]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE pets ADD COLUMN {col_name} VARCHAR(255) NULL"))

        res = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' AND COLUMN_NAME = 'chase_incident_count'"
        ))
        if res.scalar() == 0:
            conn.execute(text("ALTER TABLE pets ADD COLUMN chase_incident_count INT DEFAULT 0 AFTER chase_behavior"))

def ensure_pet_declared_behavior_columns():
    """Add declared_bite_history and declared_chase_behavior to the pets table if missing (no data is changed)."""
    try:
        with engine.begin() as conn:
            for col_name, after in [("declared_bite_history", "chase_incident_count"), ("declared_chase_behavior", "declared_bite_history")]:
                result = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' "
                    f"AND COLUMN_NAME = '{col_name}'"
                ))
                if result.scalar() == 0:
                    conn.execute(text(f"ALTER TABLE pets ADD COLUMN {col_name} TINYINT(1) NOT NULL DEFAULT 0 AFTER {after}"))
    except Exception as e:
        print(f"Notice in ensure_pet_declared_behavior_columns: {e}")

def ensure_user_default_address_columns():
    """Add latitude and longitude columns to the users table if missing."""
    with engine.begin() as conn:
        for col_name, col_type in [("latitude", "DECIMAL(10, 8)"), ("longitude", "DECIMAL(11, 8)")]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} NULL"))

def ensure_announcement_tables_columns():
    with engine.begin() as conn:
        for col_name, col_type in [
            ("barangay_id", "INT NULL"),
            ("cover_image", "VARCHAR(255) NULL")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE announcements ADD COLUMN {col_name} {col_type}"))

        # Check visibility ENUM
        try:
            conn.execute(text(
                "ALTER TABLE announcements MODIFY COLUMN visibility "
                "ENUM('Public', 'Subdivision Only', 'Barangay Only') DEFAULT 'Public'"
            ))
        except Exception:
            pass

        # Check priority_level ENUM
        try:
            conn.execute(text(
                "ALTER TABLE announcements MODIFY COLUMN priority_level "
                "ENUM('Low', 'Normal', 'High', 'Emergency') DEFAULT 'Normal'"
            ))
        except Exception:
            pass

        # Check announcement_categories columns
        for col_name, col_type in [
            ("description", "TEXT NULL"),
            ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_categories' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE announcement_categories ADD COLUMN {col_name} {col_type}"))

        # Check announcement_media columns
        for col_name, col_type in [
            ("caption", "TEXT NULL"),
            ("uploaded_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcement_media' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))


def ensure_pet_history_table():
    """Ensure the pet_history table exists (the create_all call below also creates it from the model)."""
    with engine.begin() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pet_history (
                    history_id INT AUTO_INCREMENT PRIMARY KEY,
                    pet_id INT NOT NULL,
                    event_type VARCHAR(100) NOT NULL,
                    title VARCHAR(150) NOT NULL,
                    description TEXT NULL,
                    recovery_method VARCHAR(50) NULL,
                    actor_id INT NULL,
                    actor_name VARCHAR(100) NULL,
                    actor_role VARCHAR(50) NULL,
                    previous_status VARCHAR(50) NULL,
                    new_status VARCHAR(50) NULL,
                    location_name VARCHAR(255) NULL,
                    latitude DECIMAL(10, 8) NULL,
                    longitude DECIMAL(11, 8) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_pet_history_pet (pet_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))
            print("Successfully ensured the pet_history table.")
        except Exception as e:
            print(f"Notice in ensure_pet_history_table: {e}")

# Create tables. Tables marked with a migration (models/case_alert.py) come only from their SQL file in backend/migrations/.
Base.metadata.create_all(bind=engine, tables=[t for t in Base.metadata.sorted_tables if not t.info.get("migration")])
ensure_report_media_status_column()
ensure_report_media_animal_type_column()
ensure_report_media_dominant_color_column()
ensure_report_ai_suggestion_columns()
ensure_ai_photo_columns()
ensure_report_condition_column()
ensure_pet_vaccine_card_url_column()
ensure_report_status_rows()
ensure_audit_logs_columns()
ensure_pet_history_table()
ensure_report_priority_enum()
ensure_pet_side_photos_columns()
ensure_pet_declared_behavior_columns()

def ensure_owner_followup_tables():
    """Ensure owner_followups and followup_contact_logs tables exist (non-destructive)."""
    with engine.begin() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS owner_followups (
                    followup_id INT AUTO_INCREMENT PRIMARY KEY,
                    report_id INT NOT NULL,
                    pet_id INT NULL,
                    subdivision_id INT NOT NULL,
                    leader_id INT NOT NULL,
                    owner_id INT NULL,
                    owner_name VARCHAR(150) NULL,
                    owner_phone VARCHAR(50) NULL,
                    owner_address VARCHAR(255) NULL,
                    status ENUM('observing', 'complied', 'closed', 'escalated', 'cancelled') NOT NULL DEFAULT 'observing',
                    due_at DATETIME NOT NULL,
                    duration_days INT NOT NULL DEFAULT 3,
                    notes TEXT NULL,
                    is_extended TINYINT(1) NOT NULL DEFAULT 0,
                    extended_at DATETIME NULL,
                    extended_by INT NULL,
                    extension_reason TEXT NULL,
                    extension_days INT NULL,
                    compliance_notes TEXT NULL,
                    closed_at DATETIME NULL,
                    closed_by INT NULL,
                    close_reason TEXT NULL,
                    owner_acknowledged_at DATETIME NULL,
                    owner_acknowledgement_method VARCHAR(50) NULL,
                    owner_notes TEXT NULL,
                    owner_photo_url VARCHAR(255) NULL,
                    owner_photo_submitted_at DATETIME NULL,
                    reminder_sent_at DATETIME NULL,
                    due_notice_sent_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_followup_report (report_id),
                    INDEX idx_followup_pet (pet_id),
                    INDEX idx_followup_subd (subdivision_id),
                    INDEX idx_followup_leader (leader_id),
                    INDEX idx_followup_owner (owner_id),
                    INDEX idx_followup_status (status),
                    INDEX idx_followup_due (due_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS followup_contact_logs (
                    contact_log_id INT AUTO_INCREMENT PRIMARY KEY,
                    followup_id INT NOT NULL,
                    logged_by INT NOT NULL,
                    contact_type ENUM('Phone Call', 'In-Person Visit', 'SMS', 'Verbal Warning', 'Other') NOT NULL DEFAULT 'Phone Call',
                    contact_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    notes TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_contact_log_followup (followup_id),
                    INDEX idx_contact_log_logger (logged_by)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))
        except Exception as e:
            pass

ensure_owner_followup_tables()

def ensure_followup_monitoring_log_columns():
    """Add Under Observation monitoring columns and foreign keys to followup_contact_logs (non-destructive)."""
    columns = {
        "report_id": "INT NULL",
        "pet_id": "INT NULL",
        "inspection_method": "VARCHAR(50) NULL",
        "inspection_outcome": "VARCHAR(50) NULL",
        "client_request_id": "VARCHAR(64) NULL",
    }
    with engine.begin() as conn:
        for col_name, col_def in columns.items():
            exists = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'followup_contact_logs' "
                "AND COLUMN_NAME = :col"
            ), {"col": col_name}).scalar()
            if not exists:
                conn.execute(text(f"ALTER TABLE followup_contact_logs ADD COLUMN {col_name} {col_def}"))

        indexes = {
            "idx_contact_log_report": "INDEX idx_contact_log_report (report_id)",
            "idx_contact_log_pet": "INDEX idx_contact_log_pet (pet_id)",
            "uq_contact_log_client_request": "UNIQUE INDEX uq_contact_log_client_request (client_request_id)",
        }
        for index_name, index_def in indexes.items():
            exists = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'followup_contact_logs' "
                "AND INDEX_NAME = :idx"
            ), {"idx": index_name}).scalar()
            if not exists:
                conn.execute(text(f"ALTER TABLE followup_contact_logs ADD {index_def}"))

        # Link older contact-log rows to the report and animal of their observation record.
        conn.execute(text(
            "UPDATE followup_contact_logs l "
            "JOIN owner_followups f ON f.followup_id = l.followup_id "
            "SET l.report_id = f.report_id, l.pet_id = COALESCE(l.pet_id, f.pet_id) "
            "WHERE l.report_id IS NULL"
        ))

    # Foreign keys are added one at a time so an orphaned legacy row only skips its own constraint.
    foreign_keys = {
        "fk_contact_log_followup": "FOREIGN KEY (followup_id) REFERENCES owner_followups(followup_id) ON DELETE CASCADE",
        "fk_contact_log_logger": "FOREIGN KEY (logged_by) REFERENCES users(user_id)",
        "fk_contact_log_report": "FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE",
        "fk_contact_log_pet": "FOREIGN KEY (pet_id) REFERENCES pets(pet_id) ON DELETE SET NULL",
    }
    for fk_name, fk_def in foreign_keys.items():
        try:
            with engine.begin() as conn:
                exists = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'followup_contact_logs' "
                    "AND CONSTRAINT_NAME = :fk AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
                ), {"fk": fk_name}).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE followup_contact_logs ADD CONSTRAINT {fk_name} {fk_def}"))
        except Exception as e:
            logger.warning(f"Could not add foreign key {fk_name} on followup_contact_logs: {e}")

ensure_followup_monitoring_log_columns()

def ensure_owner_observation_update_tables():
    """Create owner observation update tables and the update-reminder column (non-destructive)."""
    with engine.begin() as conn:
        exists = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'owner_followups' "
            "AND COLUMN_NAME = 'update_reminder_sent_at'"
        )).scalar()
        if not exists:
            conn.execute(text("ALTER TABLE owner_followups ADD COLUMN update_reminder_sent_at DATETIME NULL"))

    statements = [
        """
        CREATE TABLE IF NOT EXISTS owner_observation_updates (
            update_id INT AUTO_INCREMENT PRIMARY KEY,
            followup_id INT NOT NULL,
            report_id INT NOT NULL,
            pet_id INT NULL,
            owner_user_id INT NOT NULL,
            compliance_status VARCHAR(30) NOT NULL,
            owner_remarks TEXT NOT NULL,
            client_request_id VARCHAR(64) NULL,
            submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME NULL,
            reviewed_by INT NULL,
            review_remarks TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_owner_update_client_request (client_request_id),
            INDEX idx_owner_update_followup (followup_id),
            INDEX idx_owner_update_report (report_id),
            INDEX idx_owner_update_pet (pet_id),
            INDEX idx_owner_update_owner (owner_user_id),
            CONSTRAINT fk_owner_update_followup FOREIGN KEY (followup_id) REFERENCES owner_followups(followup_id) ON DELETE CASCADE,
            CONSTRAINT fk_owner_update_report FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
            CONSTRAINT fk_owner_update_pet FOREIGN KEY (pet_id) REFERENCES pets(pet_id) ON DELETE SET NULL,
            CONSTRAINT fk_owner_update_owner FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
            CONSTRAINT fk_owner_update_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS owner_observation_update_photos (
            photo_id INT AUTO_INCREMENT PRIMARY KEY,
            update_id INT NOT NULL,
            photo_url VARCHAR(500) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_owner_update_photo_update (update_id),
            CONSTRAINT fk_owner_update_photo_update FOREIGN KEY (update_id) REFERENCES owner_observation_updates(update_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    ]
    for stmt in statements:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as e:
            logger.error(f"Could not create owner observation update table: {e}")

ensure_owner_observation_update_tables()


def ensure_notification_archived_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' "
            "AND COLUMN_NAME = 'is_archived'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN is_archived TINYINT(1) DEFAULT 0"))

def ensure_chat_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_threads (
                thread_id INT NOT NULL AUTO_INCREMENT,
                thread_type ENUM('Report', 'Direct') NOT NULL DEFAULT 'Report',
                related_id INT DEFAULT NULL,
                created_by INT NOT NULL,
                recipient_id INT NOT NULL,
                title VARCHAR(255) DEFAULT NULL,
                is_closed TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (thread_id),
                KEY fk_threads_creator (created_by),
                KEY fk_threads_recipient (recipient_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                message_id INT NOT NULL AUTO_INCREMENT,
                thread_id INT NOT NULL,
                sender_id INT NOT NULL,
                message_text TEXT NOT NULL,
                media_url VARCHAR(255) DEFAULT NULL,
                is_read TINYINT(1) DEFAULT 0,
                is_system TINYINT(1) DEFAULT 0,
                sent_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id),
                KEY fk_messages_thread (thread_id),
                KEY fk_messages_sender (sender_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))


def ensure_warning_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS owner_warnings (
                warning_id INT NOT NULL AUTO_INCREMENT,
                user_id INT NOT NULL,
                pet_id INT DEFAULT NULL,
                report_id INT DEFAULT NULL,
                issued_by INT NOT NULL,
                warning_level ENUM('Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation') NOT NULL DEFAULT '1st Warning',
                violation_type ENUM(
                    'Free-Roaming Unleashed',
                    'Nuisance / Aggressive Behavior',
                    'Overdue Vaccination',
                    'Repeated Impoundment Retrieval',
                    'Other'
                ) NOT NULL DEFAULT 'Free-Roaming Unleashed',
                description TEXT NOT NULL,
                fine_amount DECIMAL(10,2) DEFAULT 0.00,
                status ENUM('Pending', 'Acknowledged', 'Appealed', 'Resolved') NOT NULL DEFAULT 'Pending',
                acknowledged_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (warning_id),
                KEY fk_warnings_user (user_id),
                KEY fk_warnings_pet (pet_id),
                KEY fk_warnings_report (report_id),
                KEY fk_warnings_issuer (issued_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))
        # Compound index for fast lookup and duplicate check
        res = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'owner_warnings' 
              AND INDEX_NAME = 'idx_report_pet_violation'
        """)).scalar()
        if not res:
            try:
                conn.execute(text("""
                    CREATE INDEX idx_report_pet_violation 
                    ON owner_warnings (report_id, pet_id, violation_type)
                """))
            except Exception as e:
                print(f"Note creating idx_report_pet_violation: {e}")

def ensure_report_matches_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS report_matches (
                match_id INT NOT NULL AUTO_INCREMENT,
                source_report_id INT NOT NULL,
                matched_report_id INT DEFAULT NULL,
                matched_pet_id INT DEFAULT NULL,
                similarity_score INT NOT NULL DEFAULT 50,
                status VARCHAR(50) NOT NULL DEFAULT 'AI_SUGGESTED',
                ai_explanation TEXT DEFAULT NULL,
                ai_evidence JSON DEFAULT NULL,
                owner_confirmation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                owner_notes TEXT DEFAULT NULL,
                reviewed_by INT DEFAULT NULL,
                reviewer_role VARCHAR(50) DEFAULT NULL,
                verification_notes TEXT DEFAULT NULL,
                verified_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (match_id),
                KEY fk_matches_source_report (source_report_id),
                KEY fk_matches_matched_report (matched_report_id),
                KEY fk_matches_matched_pet (matched_pet_id),
                KEY fk_matches_reviewer (reviewed_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))

def ensure_ai_jobs_table():
    from app.models.ai_job import AiJob
    from app.models.ai_vision_comparison import AiVisionComparison
    Base.metadata.create_all(
        bind=engine,
        tables=[cast(Any, AiJob.__table__), cast(Any, AiVisionComparison.__table__)],
        checkfirst=True,
    )


def ensure_case_pet_identity_columns():
    """Inherited pet identity across a merged case (reports) and covered suggestions (report_matches)."""
    with engine.begin() as conn:
        for table, col, col_type in (("reports", "pet_inherited_from_match_id", "INT NULL"),
                                     ("report_matches", "covered_by_match_id", "INT NULL"),
                                     ("reports", "identity_rechecked_by", "INT NULL"),
                                     ("reports", "identity_rechecked_at", "DATETIME NULL"),
                                     ("reports", "identity_recheck_note", "TEXT NULL"),
                                     ("report_matches", "owner_verification_requested_at", "DATETIME NULL"),
                                     ("report_matches", "owner_verification_requested_by", "INT NULL"),
                                     ("report_matches", "owner_verification_note", "TEXT NULL"),
                                     ("report_matches", "owner_verification_answer", "VARCHAR(10) NULL"),
                                     ("report_matches", "owner_verification_answer_note", "TEXT NULL"),
                                     ("report_matches", "owner_verification_answered_at", "DATETIME NULL"),
                                     ("reports", "separate_incident_reason", "TEXT NULL"),
                                     ("reports", "separate_incident_by", "INT NULL"),
                                     ("reports", "separate_incident_at", "DATETIME NULL"),
                                     ("pets", "merged_into_pet_id", "INT NULL"),
                                     ("reports", "ai_detection_confidence", "DECIMAL(4,3) NULL"),
                                     ("reports", "ai_description_confidence", "JSON NULL"),
                                     ("report_media", "ai_detection_confidence", "DECIMAL(4,3) NULL"),
                                     ("pets", "ai_detection_confidence", "DECIMAL(4,3) NULL")):
            exists = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
            ), {"t": table, "c": col}).scalar()
            if not exists:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))

def ensure_identity_dispute_columns():
    """report_disputes: dispute_type, case + pet being disputed, and the Upheld / Reversed outcomes."""
    with engine.begin() as conn:
        for col, col_type in (("dispute_type", "VARCHAR(30) NOT NULL DEFAULT 'false_report'"),
                              ("merged_into_report_id", "INT NULL"), ("contested_pet_id", "INT NULL"),
                              ("match_id", "INT NULL")):
            exists = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_disputes' AND COLUMN_NAME = :c"
            ), {"c": col}).scalar()
            if not exists:
                conn.execute(text(f"ALTER TABLE report_disputes ADD COLUMN {col} {col_type}"))
        col_type = conn.execute(text(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_disputes' AND COLUMN_NAME = 'status'"
        )).scalar() or ""
        if "Upheld" not in col_type:
            conn.execute(text("ALTER TABLE report_disputes MODIFY COLUMN status "
                              "ENUM('Pending','Accepted','Rejected','Upheld','Reversed') NOT NULL DEFAULT 'Pending'"))

def ensure_report_match_dispute_column():
    with engine.begin() as conn:
        res = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_matches' AND COLUMN_NAME = 'owner_dispute_count'"
        )).scalar()
        if not res:
            conn.execute(text("ALTER TABLE report_matches ADD COLUMN owner_dispute_count INT NOT NULL DEFAULT 0"))

def ensure_pet_reference_codes():
    """Animal Reference Code: add the column, then give every existing pet a permanent code in registration order."""
    from app.utils.pet_labels import SEQ_KEY, code_number, format_code
    with engine.begin() as conn:
        has_col = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' AND COLUMN_NAME = 'reference_code'"
        )).scalar()
        if not has_col:
            conn.execute(text("ALTER TABLE pets ADD COLUMN reference_code VARCHAR(16) NULL AFTER pet_name"))
            conn.execute(text("CREATE UNIQUE INDEX uq_pets_reference_code ON pets (reference_code)"))
        codes = [r[0] for r in conn.execute(text("SELECT reference_code FROM pets WHERE reference_code IS NOT NULL"))]
        seq_row = conn.execute(text("SELECT setting_value FROM system_settings WHERE setting_key = :k"), {"k": SEQ_KEY}).first()
        n = max([code_number(c) for c in codes] + [int(seq_row[0] or 0) if seq_row else 0] + [0])
        missing = conn.execute(text("SELECT pet_id FROM pets WHERE reference_code IS NULL ORDER BY created_at, pet_id")).fetchall()
        for (pid,) in missing:
            n += 1
            conn.execute(text("UPDATE pets SET reference_code = :c WHERE pet_id = :p"), {"c": format_code(n), "p": pid})
        if seq_row is None:
            conn.execute(text(
                "INSERT INTO system_settings (setting_key, setting_value, is_enabled, description) VALUES (:k, :v, 1, :d)"
            ), {"k": SEQ_KEY, "v": str(n), "d": "Last issued Animal Reference Code number (SS-0001, SS-0002, ...)"})
        elif missing:
            conn.execute(text("UPDATE system_settings SET setting_value = :v WHERE setting_key = :k"), {"k": SEQ_KEY, "v": str(n)})

def ensure_report_handler_columns():
    """Ensure assigned_leader_id, claimed_at, and unassigned_notified columns exist on reports table."""
    with engine.begin() as conn:
        for col_name, col_def in [
            ("assigned_leader_id", "INT NULL"),
            ("claimed_at", "DATETIME NULL"),
            ("unassigned_notified", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ]:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
        
        # Check foreign key for assigned_leader_id
        res_fk = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND CONSTRAINT_NAME = 'fk_reports_assigned_leader'"
        ))
        if res_fk.scalar() == 0:
            try:
                conn.execute(text("ALTER TABLE reports ADD CONSTRAINT fk_reports_assigned_leader FOREIGN KEY (assigned_leader_id) REFERENCES users(user_id) ON DELETE SET NULL"))
            except Exception:
                pass

def ensure_report_verification_columns():
    with engine.begin() as conn:
        for col_name, col_def in [
            ("verification_status", "ENUM('unverified', 'verified_true', 'false_alarm', 'disputed') DEFAULT 'unverified'"),
            ("false_alarm_reason", "VARCHAR(100) NULL"),
            ("verification_notes", "TEXT NULL"),
            ("verified_by_user_id", "INT NULL"),
            ("verified_at", "DATETIME NULL"),
            ("verified_actual_bite", "TINYINT(1) DEFAULT 0"),
            ("verified_chasing", "TINYINT(1) DEFAULT 0"),
            ("verified_attempted_bite", "TINYINT(1) DEFAULT 0"),
            ("verified_injury", "TINYINT(1) DEFAULT 0"),
            ("verified_aggressive", "TINYINT(1) DEFAULT 0"),
            ("behavior_finding", "VARCHAR(100) NULL"),
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                try:
                    conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                except Exception as e:
                    print(f"Error adding {col_name} to reports: {e}")
        
        # Check foreign key for verified_by_user_id
        res_fk = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
            "AND CONSTRAINT_NAME = 'fk_reports_verified_by'"
        ))
        if res_fk.scalar() == 0:
            try:
                conn.execute(text("ALTER TABLE reports ADD CONSTRAINT fk_reports_verified_by FOREIGN KEY (verified_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL"))
            except Exception:
                pass

def ensure_report_disputes_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS report_disputes (
                dispute_id INT NOT NULL AUTO_INCREMENT,
                report_id INT NOT NULL,
                resident_user_id INT NOT NULL,
                pet_id INT DEFAULT NULL,
                dispute_reason TEXT NOT NULL,
                vaccination_card_url VARCHAR(255) DEFAULT NULL,
                supporting_photo_url VARCHAR(255) DEFAULT NULL,
                status ENUM('Pending', 'Accepted', 'Rejected') NOT NULL DEFAULT 'Pending',
                reviewer_id INT DEFAULT NULL,
                reviewer_notes TEXT NULL,
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (dispute_id),
                KEY fk_disputes_report (report_id),
                KEY fk_disputes_resident (resident_user_id),
                KEY fk_disputes_pet (pet_id),
                KEY fk_disputes_reviewer (reviewer_id),
                FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
                FOREIGN KEY (resident_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (pet_id) REFERENCES pets(pet_id) ON DELETE SET NULL,
                FOREIGN KEY (reviewer_id) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))

def ensure_report_transfer_columns():
    """Ensure pending_transfer columns exist on reports table."""
    with engine.begin() as conn:
        for col_name, col_def in [
            ("pending_transfer_to_id", "INT NULL"),
            ("pending_transfer_from_id", "INT NULL"),
            ("pending_transfer_notes", "TEXT NULL"),
            ("pending_transfer_created_at", "DATETIME NULL"),
        ]:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                try:
                    conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                except Exception as e:
                    print(f"Error adding {col_name} to reports: {e}")

def ensure_landmarks_table():
    """Ensure landmarks table exists and insert initial seed landmarks if empty."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS landmarks (
                landmark_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'general',
                description TEXT NULL,
                subdivision_id INT NULL,
                barangay_id INT NOT NULL DEFAULT 1,
                latitude DECIMAL(10,8) NOT NULL,
                longitude DECIMAL(11,8) NOT NULL,
                is_holding_facility TINYINT(1) NOT NULL DEFAULT 0,
                facility_type VARCHAR(50) NULL,
                capacity INT NULL,
                contact_person VARCHAR(100) NULL,
                contact_number VARCHAR(20) NULL,
                status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
                created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY fk_landmarks_subdivision (subdivision_id),
                KEY fk_landmarks_barangay (barangay_id),
                CONSTRAINT fk_landmarks_subdivision FOREIGN KEY (subdivision_id) REFERENCES subdivisions (subdivision_id) ON DELETE CASCADE,
                CONSTRAINT fk_landmarks_barangay FOREIGN KEY (barangay_id) REFERENCES barangays (barangay_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))

        # Add category column if table existed without it
        try:
            col_res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'landmarks' AND COLUMN_NAME = 'category'"
            ))
            if col_res.scalar() == 0:
                conn.execute(text("ALTER TABLE landmarks ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'general' AFTER name"))
                # Update existing rows based on keywords or holding facility
                conn.execute(text("UPDATE landmarks SET category = 'gate' WHERE name LIKE '%Gate%' OR name LIKE '%Guardhouse%'"))
                conn.execute(text("UPDATE landmarks SET category = 'facility' WHERE is_holding_facility = 1 OR name LIKE '%Holding%' OR name LIKE '%Impound%'"))
                conn.execute(text("UPDATE landmarks SET category = 'park' WHERE name LIKE '%Park%' OR name LIKE '%Clubhouse%'"))
                conn.execute(text("UPDATE landmarks SET category = 'court' WHERE name LIKE '%Court%' OR name LIKE '%Gym%'"))
                conn.execute(text("UPDATE landmarks SET category = 'office' WHERE name LIKE '%Office%' OR name LIKE '%Hall%'"))
        except Exception as e:
            print(f"Error checking category column on landmarks: {e}")

        # Seed initial landmarks if empty. The community holding pen is not seeded: StraySafe keeps no holding place (docs/01-system/overview.md),
        # and its contact was a person's name and phone number.
        try:
            res = conn.execute(text("SELECT COUNT(*) FROM landmarks"))
            if res.scalar() == 0:
                conn.execute(text("""
                    INSERT INTO landmarks (landmark_id, name, category, description, subdivision_id, barangay_id, latitude, longitude, is_holding_facility, facility_type, capacity, contact_person, contact_number, status) VALUES
                    (1, 'Selera Homes Main Entrance Gate', 'gate', 'Main guardhouse and security station at the entrance of Selera Homes', 1, 1, 14.80149600, 121.00517400, 0, NULL, NULL, 'Chief Guard Reyes', '09171112233', 'Active'),
                    (3, 'Selera Community Park & Clubhouse', 'park', 'Recreation grounds and event center', 1, 1, 14.80063400, 121.00222800, 0, NULL, NULL, 'HOA Secretariat', '09172223344', 'Active'),
                    (4, 'Barangay San Vicente Animal Impound Facility', 'facility', 'Official municipal holding shelter and veterinary holding cages', NULL, 1, 14.80690600, 121.00392970, 1, 'Barangay Main Shelter', 20, 'Barangay Animal Welfare Desk', '09123456789', 'Active');
                """))
        except Exception as e:
            print(f"Error seeding landmarks: {e}")

def ensure_report_location_columns():
    """Ensure location history and facility tracking columns exist on reports and status_history tables."""
    with engine.begin() as conn:
        # 1. Reports columns
        for col_name, col_def in [
            ("initial_latitude", "DECIMAL(10,8) NULL"),
            ("initial_longitude", "DECIMAL(11,8) NULL"),
            ("initial_landmark", "VARCHAR(255) NULL"),
            ("facility_id", "INT NULL"),
            ("custody_status", "VARCHAR(50) DEFAULT 'Sighting'"),
        ]:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                try:
                    conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                except Exception as e:
                    print(f"Error adding {col_name} to reports: {e}")

        # Initialize initial_latitude/longitude/landmark for existing reports
        try:
            conn.execute(text("""
                UPDATE reports 
                SET initial_latitude = latitude, 
                    initial_longitude = longitude, 
                    initial_landmark = landmark 
                WHERE initial_latitude IS NULL
            """))
        except Exception as e:
            print(f"Error backfilling initial location in reports: {e}")

        # Add foreign key for facility_id on reports
        try:
            res_fk = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' "
                "AND CONSTRAINT_NAME = 'fk_reports_facility'"
            ))
            if res_fk.scalar() == 0:
                conn.execute(text("ALTER TABLE reports ADD CONSTRAINT fk_reports_facility FOREIGN KEY (facility_id) REFERENCES landmarks(landmark_id) ON DELETE SET NULL"))
        except Exception:
            pass

        # Clean up any resolved or closed reports so their location reflects the original incident origin and not a facility
        try:
            conn.execute(text("""
                UPDATE reports r
                SET 
                    r.facility_id = NULL,
                    r.latitude = COALESCE(r.initial_latitude, r.latitude),
                    r.longitude = COALESCE(r.initial_longitude, r.longitude),
                    r.landmark = CASE 
                        WHEN r.initial_landmark IS NOT NULL AND r.initial_landmark != '' AND LOWER(r.initial_landmark) NOT LIKE '%holding%' THEN r.initial_landmark
                        ELSE COALESCE((SELECT s.subdivision_name FROM subdivisions s WHERE s.subdivision_id = r.subdivision_id LIMIT 1), 'Incident Sighting Location')
                    END,
                    r.initial_landmark = CASE 
                        WHEN r.initial_landmark IS NOT NULL AND r.initial_landmark != '' AND LOWER(r.initial_landmark) NOT LIKE '%holding%' THEN r.initial_landmark
                        ELSE COALESCE((SELECT s.subdivision_name FROM subdivisions s WHERE s.subdivision_id = r.subdivision_id LIMIT 1), 'Incident Sighting Location')
                    END
                WHERE r.current_status_id IN (9, 10, 11, 12, 14, 17, 18)
            """))
        except Exception as e:
            print(f"Error restoring resolved report origins: {e}")

        # 2. StatusHistory columns
        for col_name, col_def in [
            ("latitude", "DECIMAL(10,8) NULL"),
            ("longitude", "DECIMAL(11,8) NULL"),
            ("landmark", "VARCHAR(255) NULL"),
            ("facility_id", "INT NULL"),
        ]:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'status_history' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                try:
                    conn.execute(text(f"ALTER TABLE status_history ADD COLUMN {col_name} {col_def}"))
                except Exception as e:
                    print(f"Error adding {col_name} to status_history: {e}")

        # Add foreign key for facility_id on status_history
        try:
            res_hist_fk = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS "
                "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'status_history' "
                "AND CONSTRAINT_NAME = 'fk_history_facility'"
            ))
            if res_hist_fk.scalar() == 0:
                conn.execute(text("ALTER TABLE status_history ADD CONSTRAINT fk_history_facility FOREIGN KEY (facility_id) REFERENCES landmarks(landmark_id) ON DELETE SET NULL"))
        except Exception:
            pass


ensure_announcement_tables_columns()
ensure_notification_archived_column()
ensure_chat_tables()
ensure_warning_tables()
ensure_report_matches_tables()
ensure_report_match_dispute_column()
ensure_case_pet_identity_columns()
ensure_identity_dispute_columns()
ensure_ai_jobs_table()
ensure_pet_reference_codes()
ensure_report_handler_columns()
ensure_report_verification_columns()
ensure_report_transfer_columns()
ensure_report_disputes_table()
ensure_landmarks_table()
ensure_report_location_columns()
def ensure_revoked_tokens_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                jti VARCHAR(255) NOT NULL UNIQUE,
                token_type VARCHAR(50) NOT NULL DEFAULT 'access',
                user_id INT NULL,
                revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                expires_at DATETIME NOT NULL,
                INDEX idx_revoked_jti (jti),
                INDEX idx_revoked_expires (expires_at)
            )
        """))

def ensure_coverage_settings_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS coverage_settings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                subdivision_id INT NULL,
                center_label VARCHAR(100) NOT NULL DEFAULT 'Selera Homes',
                center_latitude DECIMAL(10, 8) NOT NULL DEFAULT 14.80104200,
                center_longitude DECIMAL(11, 8) NOT NULL DEFAULT 121.00364800,
                radius_meters INT NOT NULL DEFAULT 1000,
                boundary_polygon JSON NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_by INT NULL,
                INDEX idx_coverage_active (is_active)
            )
        """))
        res = conn.execute(text("SELECT COUNT(*) FROM coverage_settings"))
        if res.scalar() == 0:
            default_boundary = json.dumps([
                {"lat": 14.801496, "lng": 121.005174},
                {"lat": 14.799577, "lng": 121.003911},
                {"lat": 14.800634, "lng": 121.002228},
                {"lat": 14.802461, "lng": 121.003280}
            ])
            conn.execute(text("""
                INSERT INTO coverage_settings (
                    id, subdivision_id, center_label, center_latitude, center_longitude, radius_meters, boundary_polygon, is_active
                ) VALUES (
                    1, 1, 'Selera Homes', 14.80104200, 121.00364800, 1000, :boundary, 1
                )
            """), {"boundary": default_boundary})

def ensure_otp_verifications_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS otp_verifications (
                otp_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                email VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NULL,
                otp_code VARCHAR(10) NOT NULL,
                purpose VARCHAR(50) DEFAULT 'resident_registration',
                is_used BOOLEAN DEFAULT FALSE,
                attempts INT DEFAULT 0,
                max_attempts INT DEFAULT 5,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_otp_user (user_id),
                INDEX idx_otp_email (email),
                CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))

def ensure_system_settings_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT NULL,
                is_enabled BOOLEAN DEFAULT TRUE,
                description VARCHAR(255) NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_by INT NULL,
                INDEX idx_setting_key (setting_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        """))
        res = conn.execute(text("SELECT COUNT(*) FROM system_settings WHERE setting_key = 'gemini_vision_matching'"))
        if res.scalar() == 0:
            conn.execute(text("""
                INSERT INTO system_settings (setting_key, setting_value, is_enabled, description)
                VALUES ('gemini_vision_matching', 'vision', TRUE, 'Toggle between Google Gemini Vision AI Biometrics and Free-Tier Attribute Rule-Based Matching')
            """))


def ensure_supporting_columns():
    """Columns of kept tables added after the first release (users, pets, report_returns, reports). Additive only."""
    columns = [
        # (table, column, definition, fk_name, fk_reference)
        ("users", "password_changed_at", "DATETIME NULL", None, None),
        ("pets", "photo_check_status", "VARCHAR(30) NULL", None, None),
        ("pets", "photo_check_details", "TEXT NULL", None, None),
        ("report_returns", "id_type", "VARCHAR(60) NULL", None, None),
        ("report_returns", "id_last4", "VARCHAR(4) NULL", None, None),
        ("report_returns", "ownership_verified_by_record", "TINYINT(1) NOT NULL DEFAULT 0", None, None),
        ("report_returns", "handover_photo_url", "VARCHAR(255) NULL", None, None),
        ("report_returns", "ownership_proof_urls", "JSON NULL", None, None),
        # per-animal records split from a multi-animal group report (MULTI_ANIMAL_REPORT_PLAN.md)
        ("reports", "split_from_report_id", "INT NULL", "fk_reports_split_from", "reports(report_id) ON DELETE SET NULL"),
    ]
    with engine.begin() as conn:
        def exists(sql, **params) -> bool:
            return (conn.execute(text(sql), params).scalar() or 0) > 0

        for table, column, ddl, fk_name, fk_ref in columns:
            try:
                if not exists(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                    "AND TABLE_NAME = :t AND COLUMN_NAME = :c", t=table, c=column
                ):
                    conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {ddl}"))
                if fk_name and not exists(
                    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() "
                    "AND TABLE_NAME = :t AND CONSTRAINT_NAME = :n", t=table, n=fk_name
                ):
                    conn.execute(text(f"ALTER TABLE `{table}` ADD CONSTRAINT `{fk_name}` FOREIGN KEY (`{column}`) REFERENCES {fk_ref}"))
            except Exception as e:
                print(f"Error migrating {table}.{column}: {e}")


ensure_supporting_columns()
ensure_revoked_tokens_table()
ensure_coverage_settings_table()
ensure_otp_verifications_table()
ensure_system_settings_table()

def ensure_performance_indexes():
    """
    Ensure all high-frequency query indexes and standardized collations exist.
    Additive and non-destructive.
    """
    indexes = [
        ("reports", "idx_reports_subd_status", "CREATE INDEX idx_reports_subd_status ON reports (subdivision_id, current_status_id)"),
        ("reports", "idx_reports_status_created", "CREATE INDEX idx_reports_status_created ON reports (current_status_id, created_at)"),
        ("reports", "idx_reports_unassigned_watch", "CREATE INDEX idx_reports_unassigned_watch ON reports (assigned_leader_id, unassigned_notified, current_status_id)"),
        ("reports", "idx_reports_animal_type_status", "CREATE INDEX idx_reports_animal_type_status ON reports (animal_type, current_status_id, created_at)"),
        ("status_history", "idx_status_hist_rep_created", "CREATE INDEX idx_status_hist_rep_created ON status_history (report_id, created_at)"),
        ("report_matches", "idx_rep_matches_src_status", "CREATE INDEX idx_rep_matches_src_status ON report_matches (source_report_id, status)"),
        ("report_matches", "idx_rep_matches_mat_status", "CREATE INDEX idx_rep_matches_mat_status ON report_matches (matched_report_id, status)"),
        ("report_matches", "idx_rep_matches_status_score", "CREATE INDEX idx_rep_matches_status_score ON report_matches (status, similarity_score)"),
        ("notifications", "idx_notif_user_arch_created", "CREATE INDEX idx_notif_user_arch_created ON notifications (user_id, is_archived, created_at)"),
        ("notifications", "idx_notif_type_related", "CREATE INDEX idx_notif_type_related ON notifications (type, related_id)"),
        ("audit_logs", "idx_audit_tbl_id_time", "CREATE INDEX idx_audit_tbl_id_time ON audit_logs (target_table, target_id, created_at)"),
        ("report_disputes", "idx_disputes_rep_status", "CREATE INDEX idx_disputes_rep_status ON report_disputes (report_id, status)"),
        ("chat_messages", "idx_chat_msg_th_sent", "CREATE INDEX idx_chat_msg_th_sent ON chat_messages (thread_id, sent_at)"),
        ("chat_threads", "idx_chat_threads_type_related", "CREATE INDEX idx_chat_threads_type_related ON chat_threads (thread_type, related_id)"),
        ("pets", "idx_pets_status_type", "CREATE INDEX idx_pets_status_type ON pets (status, pet_type)"),
        ("audit_logs", "idx_audit_type_created", "CREATE INDEX idx_audit_type_created ON audit_logs (log_type, created_at)"),
        ("owner_warnings", "idx_warnings_user_status", "CREATE INDEX idx_warnings_user_status ON owner_warnings (user_id, status)"),
        ("pets", "idx_pets_owner_status", "CREATE INDEX idx_pets_owner_status ON pets (owner_id, status)"),
    ]

    with engine.begin() as conn:
        for table, idx_name, ddl in indexes:
            try:
                chk = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :idx"
                ), {"table": table, "idx": idx_name}).scalar()
                if chk == 0:
                    conn.execute(text(ddl))
                    logger.info(f"Performance index created: {idx_name} on {table}")
            except Exception as e:
                logger.warning(f"Could not ensure index {idx_name} on {table}: {e}")

        # Collation harmonization
        tables_to_collate = [
            "reports", "status_history", "report_media", "notifications",
            "audit_logs", "report_disputes", "pets"
        ]
        for tbl in tables_to_collate:
            try:
                conn.execute(text(f"ALTER TABLE {tbl} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
            except Exception as coll_err:
                logger.debug(f"Collation update for {tbl}: {coll_err}")

ensure_performance_indexes()

def ensure_email_notification_tables():
    from app.models.notification_preference import UserNotificationPreference
    from app.models.email_log import EmailLog
    Base.metadata.create_all(
        bind=engine,
        tables=[cast(Any, UserNotificationPreference.__table__), cast(Any, EmailLog.__table__)],
        checkfirst=True,
    )

ensure_email_notification_tables()


def ensure_email_retry_columns():
    """Email retries (the worker can resend): stored message, retry schedule, send claim, and the 'Expired' status."""
    with engine.begin() as conn:
        try:
            for col_name, col_def in [("text_body", "LONGTEXT NULL"), ("html_body", "LONGTEXT NULL"),
                                      ("next_attempt_at", "DATETIME NULL"), ("last_attempt_at", "DATETIME NULL")]:
                exists = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                    f"AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = '{col_name}'"
                )).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE email_logs ADD COLUMN {col_name} {col_def}"))
            col_type = conn.execute(text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                "AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'status'"
            )).scalar() or ""
            if "Expired" not in col_type:
                conn.execute(text("ALTER TABLE email_logs MODIFY COLUMN status "
                                  "ENUM('Pending','Sent','Failed','Simulated','Expired') NOT NULL DEFAULT 'Pending'"))
        except Exception as e:
            logger.warning(f"ensure_email_retry_columns: {e}")

ensure_email_retry_columns()


def ensure_manual_match_pet_column():
    """manual_match_decisions can record a report-to-registered-pet decision: pet_id column, report_b_id nullable."""
    with engine.begin() as conn:
        try:
            exists = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                "AND TABLE_NAME = 'manual_match_decisions' AND COLUMN_NAME = 'pet_id'"
            )).scalar()
            if not exists:
                conn.execute(text("ALTER TABLE manual_match_decisions ADD COLUMN pet_id INT NULL, ADD INDEX ix_manual_match_decisions_pet_id (pet_id)"))
                conn.execute(text("ALTER TABLE manual_match_decisions MODIFY COLUMN report_b_id INT NULL"))
        except Exception as e:
            logger.warning(f"ensure_manual_match_pet_column: {e}")

ensure_manual_match_pet_column()


def ensure_push_tables():
    """Push notifications (PUSH_NOTIFICATION_IMPLEMENTATION.md): device subscriptions, the outbox, push preferences."""
    from app.models.push import PushDelivery, PushSubscription
    Base.metadata.create_all(
        bind=engine,
        tables=[cast(Any, PushSubscription.__table__), cast(Any, PushDelivery.__table__)],
        checkfirst=True,
    )
    with engine.begin() as conn:
        try:
            for col in ("push_enabled", "push_reports", "push_rescues", "push_pet_matches", "push_claims",
                        "push_adoptions", "push_messages", "push_show_preview"):
                exists = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                    f"AND TABLE_NAME = 'user_notification_preferences' AND COLUMN_NAME = '{col}'"
                )).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE user_notification_preferences ADD COLUMN {col} TINYINT(1) NOT NULL DEFAULT 1"))
        except Exception as e:
            logger.warning(f"ensure_push_tables: {e}")

ensure_push_tables()


def ensure_report_visibility_review():
    """
    Report visibility is decided by the Subdivision Leader (REPORT_VISIBILITY_IMPLEMENTATION.md): a new
    'Pending Review' value (the new default) and who/when/why the decision was made. Existing rows are not changed.
    """
    with engine.begin() as conn:
        try:
            col_type = conn.execute(text(
                "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                "AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'visibility'"
            )).scalar() or ""
            if "Pending Review" not in col_type:
                conn.execute(text(
                    "ALTER TABLE reports MODIFY COLUMN visibility "
                    "ENUM('Public','Private','Pending Review') NULL DEFAULT 'Pending Review'"
                ))
            for col_name, col_def in [
                ("visibility_decided_by", "INT NULL"),
                ("visibility_decided_at", "DATETIME NULL"),
                ("visibility_reason", "TEXT NULL"),
            ]:
                exists = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                    f"AND TABLE_NAME = 'reports' AND COLUMN_NAME = '{col_name}'"
                )).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                    if col_name == "visibility_decided_by":
                        conn.execute(text(
                            "ALTER TABLE reports ADD CONSTRAINT fk_reports_visibility_decided_by "
                            "FOREIGN KEY (visibility_decided_by) REFERENCES users (user_id) ON DELETE SET NULL"
                        ))
        except Exception as e:
            logger.warning(f"ensure_report_visibility_review: {e}")

ensure_report_visibility_review()

# Case workflow alignment (Subdivision Admin): new columns, tables, the six categories and the backfill. Idempotent, never
# drops or rewrites existing data (app/db_migrations/case_alignment.py). strict=True: if the schema still cannot support the
# case workflow code afterwards, this raises CaseAlignmentError and the application does NOT start, instead of running
# against tables its own queries cannot read. A merely degraded schema (a missing index, say) starts, with an ERROR line per gap.
from app.db_migrations.case_alignment import run_case_alignment  # noqa: E402
_case_alignment = run_case_alignment(engine, strict=True)
# Lost & found notification alerts (2026-11-12): applied by backend/migrations/2026-11-12_lost_found_alerts.sql, never here. A read-only
# check: the backend does not start until the migration is applied, and says which file to run.
from app.db_migrations.lost_found_alerts import require as require_lost_found_alert_schema  # noqa: E402
require_lost_found_alert_schema(engine)

async def backfill_ai_suggestions_background():
    """Run in background after startup to backfill missing AI suggestions without blocking HTTP requests."""
    await asyncio.sleep(20)
    # The Gemini calls block, so they run in a worker thread instead of on the event loop.
    await asyncio.to_thread(_backfill_ai_suggestions_sync)


def _backfill_ai_suggestions_sync():
    """Queue a suggestions backfill job for reports still missing AI suggestions (the AI worker does the Gemini work)."""
    try:
        from app.models.report import Report
        from app.utils import ai_jobs, ai_pipeline
        db = SessionLocal()
        try:
            stale_reports = db.query(Report).filter(Report.ai_suggested_risk_level.is_(None)).limit(100).all()
            queued = sum(1 for rep in stale_reports if ai_jobs.enqueue_backfill(rep.report_id, ai_pipeline.media_hint(rep), db=db))
            if queued:
                logger.info(f"Queued AI suggestions backfill for {queued} reports.")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Background AI backfill task encountered: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background task that checks for unassigned reports older than 30 minutes
    watcher_task = asyncio.create_task(
        start_unassigned_reports_watcher(interval_seconds=60, threshold_minutes=30)
    )
    backfill_task = asyncio.create_task(
        backfill_ai_suggestions_background()
    )
    email_queue_task = asyncio.create_task(
        start_email_queue_worker(interval_seconds=60)
    )
    push_queue_task = asyncio.create_task(start_push_queue_worker(interval_seconds=5))
    # AI jobs normally run in the separate worker (python -m app.ai_worker); this only runs them while it is not running.
    from app.utils import ai_jobs
    ai_jobs.start_embedded_runner()
    yield
    # Clean up background tasks on application shutdown
    ai_jobs.stop_embedded_runner()
    watcher_task.cancel()
    backfill_task.cancel()
    email_queue_task.cancel()
    push_queue_task.cancel()
    try:
        await asyncio.gather(watcher_task, backfill_task, email_queue_task, push_queue_task, return_exceptions=True)
    except Exception:
        pass

app = FastAPI(title="StraySafe API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler))

# Configure CORS dynamically from environment variables
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173",
    "http://localhost:5174",
    "https://localhost:5174",
    "http://127.0.0.1:5174",
    "https://127.0.0.1:5174",
    "http://localhost",
    "https://localhost",
    "capacitor://localhost",
]

cors_env = os.getenv("CORS_ALLOWED_ORIGINS")
if cors_env:
    cors_str = cors_env.strip()
    if cors_str.startswith("[") and cors_str.endswith("]"):
        try:
            cors_allowed_origins = json.loads(cors_str)
        except Exception:
            cors_allowed_origins = [o.strip().strip("'\"") for o in cors_str.strip("[]").split(",") if o.strip()]
    else:
        cors_allowed_origins = [o.strip() for o in cors_str.split(",") if o.strip()]
else:
    cors_allowed_origins = DEFAULT_CORS_ORIGINS

# Ensure both http and https versions of explicitly listed origins are present
expanded_origins = set(cors_allowed_origins) | set(DEFAULT_CORS_ORIGINS)
for o in list(expanded_origins):
    if o.startswith("http://"):
        expanded_origins.add("https://" + o[7:])
    elif o.startswith("https://"):
        expanded_origins.add("http://" + o[8:])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(expanded_origins),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|[a-zA-Z0-9-]+\.trycloudflare\.com|[a-zA-Z0-9-]+\.ngrok-free\.app)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # The installed app reads its rotated refresh token from this header (see strip_app_refresh_header)
    expose_headers=["X-Refresh-Token"],
)


from app.utils.auth import strip_app_refresh_header  # noqa: E402
app.middleware("http")(strip_app_refresh_header)

# Exception Handlers: Sanitize error responses and mask raw internal database/SQL traces
SENSITIVE_ERROR_KEYWORDS = (
    "sql", "select ", "insert into", "update ", "delete from",
    "syntax error", "foreign key", "table", "column", "pymysql",
    "mysql", "mariadb", "operationalerror", "integrityerror",
    "password", "access denied", "duplicate entry", "cannot add or update"
)

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """
    Catch any unhandled database exceptions and mask raw schema/query details from clients.
    """
    logger.error(f"Database error on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "A database error occurred. Internal details have been masked for security."}
    )

@app.exception_handler(HTTPException)
async def sanitized_http_exception_handler(request: Request, exc: HTTPException):
    """
    Mask raw database or stack trace details in 500-level HTTPExceptions.
    """
    detail = exc.detail
    if exc.status_code >= 500 and isinstance(detail, str):
        lower_detail = detail.lower()
        if any(keyword in lower_detail for keyword in SENSITIVE_ERROR_KEYWORDS):
            logger.error(f"Masked sensitive 500 error on {request.method} {request.url.path}: {detail}")
            detail = "An internal server error occurred. Internal details have been masked for security."
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
        headers=exc.headers
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Catch-all unhandled exception handler ensuring clean 500 responses without tracebacks.
    """
    if isinstance(exc, HTTPException):
        return await sanitized_http_exception_handler(request, exc)
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Internal details have been masked for security."}
    )

# Create uploads directory if it doesn't exist
os.makedirs("uploads", exist_ok=True)

# Mount the uploads directory to serve static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routes
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(reports.router)
from app.routes import report_split as _report_split  # noqa: E402
app.include_router(_report_split.router)
app.include_router(pets.router)
app.include_router(notifications.router)
app.include_router(announcements.router)
app.include_router(audit_logs_router.router)
app.include_router(chat.router)
app.include_router(report_returns.router)
app.include_router(pet_ownership.router)
app.include_router(warnings.router)
app.include_router(owner_followups.router)
app.include_router(matches.router)
app.include_router(manual_matching_routes.router)
app.include_router(pet_match_confirmation_routes.router)
app.include_router(leader_identity_routes.router)
app.include_router(lost_pet_alert_routes.router)
from app.routes import barangay_referrals as barangay_referral_routes  # noqa: E402  (Subdivision-only referral log; registers its tables)
app.include_router(barangay_referral_routes.router)
app.include_router(case_routes.router)
app.include_router(lost_found_routes.router)
app.include_router(case_alert_routes.router)
app.include_router(case_message_routes.router)
app.include_router(ownership_claim_routes.router)
app.include_router(landmarks.router)
app.include_router(admin.router)
app.include_router(ai_jobs_routes.router)
app.include_router(push_routes.router)
app.include_router(analytics.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to StraySafe API"}

