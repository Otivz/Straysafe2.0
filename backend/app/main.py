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
from app.routes import auth, users, reports, rescue, pets, notifications, announcements, pet_qr, holding, claims, chat, warnings, matches, landmarks, adoptions, admin, adoption_chat, adoption_tasks, adoption_certificates, report_returns, pet_ownership
from app.routes import audit_logs as audit_logs_router
from app.routes import ai_jobs as ai_jobs_routes
from app.models.pet_qr import PetQRCode, PetQRScan
from app.models.audit_log import AuditLog  # noqa: F401 — ensures table is in Base.metadata
from app.models.pet_claim import PetClaim  # noqa: F401 — ensures table is in Base.metadata
from app.models.revoked_token import RevokedToken  # noqa: F401 — ensures table is in Base.metadata
from app.models.report_dispute import ReportDispute  # noqa: F401
from app.models.chat import ChatThread, ChatMessage  # noqa: F401
from app.models.warning import OwnerWarning  # noqa: F401
from app.models.report_match import ReportMatch  # noqa: F401
from app.models.landmark import Landmark  # noqa: F401
from app.models.coverage import CoverageSetting  # noqa: F401
from app.models.otp import OtpVerification  # noqa: F401
from app.models.system_setting import SystemSetting  # noqa: F401
from app.tasks.unassigned_checker import start_unassigned_reports_watcher


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
    The rescue workflow requires 11 (Incident Resolved), 12 (Deceased), 13 (Approved by Barangay).
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


def ensure_holding_tables():
    """Create Holding Facility tables and seed facility_status lookup rows."""
    with engine.begin() as conn:
        # facility_status lookup
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS facility_status (
                status_id   INT AUTO_INCREMENT PRIMARY KEY,
                status_name VARCHAR(50) UNIQUE NOT NULL
            )
        """))

        # Seed the 5 facility statuses
        statuses = [
            (1, 'Need Treatment'),
            (2, 'Healthy'),
            (3, 'Claimed by Owner'),
            (4, 'Deceased'),
            (5, 'Transferred to Shelter'),
        ]
        for sid, sname in statuses:
            conn.execute(text(
                "INSERT INTO facility_status (status_id, status_name) "
                "SELECT :id, :name FROM DUAL "
                "WHERE NOT EXISTS (SELECT 1 FROM facility_status WHERE status_id = :id)"
            ), {"id": sid, "name": sname})

        # holding_animals
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS holding_animals (
                holding_id      INT AUTO_INCREMENT PRIMARY KEY,
                report_id       INT NOT NULL,
                rescue_id       INT NULL,
                animal_type     ENUM('Dog','Cat','Unknown') DEFAULT 'Unknown',
                animal_name     VARCHAR(100) NULL,
                breed           VARCHAR(100) NULL,
                color           VARCHAR(100) NULL,
                estimated_size  VARCHAR(50) NULL,
                facility_status INT NOT NULL DEFAULT 1,
                kennel_slot     VARCHAR(50) NULL,
                medical_notes   TEXT NULL,
                intake_date     DATETIME DEFAULT CURRENT_TIMESTAMP,
                discharge_date  DATETIME NULL,
                intake_staff_id INT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (report_id)       REFERENCES reports(report_id)       ON DELETE CASCADE,
                FOREIGN KEY (rescue_id)       REFERENCES rescues(rescue_id)       ON DELETE SET NULL,
                FOREIGN KEY (facility_status) REFERENCES facility_status(status_id),
                FOREIGN KEY (intake_staff_id) REFERENCES users(user_id)           ON DELETE SET NULL
            )
        """))

        # holding_timeline
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS holding_timeline (
                log_id     INT AUTO_INCREMENT PRIMARY KEY,
                holding_id INT NOT NULL,
                event_type VARCHAR(50) NOT NULL DEFAULT 'observation',
                title      VARCHAR(255) NOT NULL,
                notes      TEXT NULL,
                logged_by  INT NULL,
                logged_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (holding_id) REFERENCES holding_animals(holding_id) ON DELETE CASCADE,
                FOREIGN KEY (logged_by)  REFERENCES users(user_id)              ON DELETE SET NULL
            )
        """)
        )

def ensure_pet_claims_status_enum():
    """Modify the ENUM values of pet_claims.status to include new statuses expected by frontend."""
    with engine.begin() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE pet_claims MODIFY COLUMN status "
                "ENUM('Potential Owner Match', 'Possible Match Found', 'Pending Review', 'Approved', 'Rejected', 'Evidence Requested', 'Handover Complete', 'Pet Received', 'Merged') "
                "DEFAULT 'Potential Owner Match' NOT NULL"
            ))
            print("Successfully migrated pet_claims.status ENUM values.")
        except Exception as e:
            print(f"Error migrating pet_claims.status ENUM: {e}")

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

def ensure_qr_tables_exist():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_qr_codes (
                qr_id INT AUTO_INCREMENT PRIMARY KEY,
                pet_id INT NOT NULL UNIQUE,
                qr_token VARCHAR(255) UNIQUE NOT NULL,
                qr_image_url VARCHAR(255) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                scan_count INT DEFAULT 0,
                last_scanned_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(pet_id) REFERENCES pets(pet_id) ON DELETE CASCADE
            )
        """))
        result_sc = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_qr_codes' "
            "AND COLUMN_NAME = 'scan_count'"
        ))
        if result_sc.scalar() == 0:
            conn.execute(text("ALTER TABLE pet_qr_codes ADD COLUMN scan_count INT DEFAULT 0"))
        result_la = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_qr_codes' "
            "AND COLUMN_NAME = 'last_scanned_at'"
        ))
        if result_la.scalar() == 0:
            conn.execute(text("ALTER TABLE pet_qr_codes ADD COLUMN last_scanned_at TIMESTAMP NULL"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pet_qr_scans (
                scan_id INT AUTO_INCREMENT PRIMARY KEY,
                qr_id INT NOT NULL,
                pet_id INT NOT NULL,
                scanned_by INT NULL,
                finder_name VARCHAR(100) NULL,
                finder_contact VARCHAR(20) NULL,
                scan_lat DECIMAL(10,8) NULL,
                scan_lng DECIMAL(11,8) NULL,
                street_address VARCHAR(255) NULL,
                barangay VARCHAR(100) NULL,
                city VARCHAR(100) NULL,
                landmark VARCHAR(255) NULL,
                location_type ENUM('Found Location', 'Barangay Hall', 'Temporary Shelter') DEFAULT 'Found Location',
                notes VARCHAR(255) NULL,
                scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(qr_id) REFERENCES pet_qr_codes(qr_id) ON DELETE CASCADE,
                FOREIGN KEY(pet_id) REFERENCES pets(pet_id) ON DELETE CASCADE,
                FOREIGN KEY(scanned_by) REFERENCES users(user_id) ON DELETE SET NULL
            )
        """))
        
        # Ensure all columns in pet_qr_scans exist for backward compatibility
        scan_columns = [
            ("pet_id", "INT NOT NULL"),
            ("scanned_by", "INT NULL"),
            ("finder_name", "VARCHAR(100) NULL"),
            ("finder_contact", "VARCHAR(20) NULL"),
            ("street_address", "VARCHAR(255) NULL"),
            ("barangay", "VARCHAR(100) NULL"),
            ("city", "VARCHAR(100) NULL"),
            ("landmark", "VARCHAR(255) NULL"),
            ("location_type", "ENUM('Found Location', 'Barangay Hall', 'Temporary Shelter') DEFAULT 'Found Location'"),
        ]
        for col_name, col_def in scan_columns:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_qr_scans' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                try:
                    conn.execute(text(f"ALTER TABLE pet_qr_scans ADD COLUMN {col_name} {col_def}"))
                except Exception as e:
                    print(f"Error adding {col_name} to pet_qr_scans: {e}")

def ensure_announcement_tables_columns():
    with engine.begin() as conn:
        for col_name, col_type in [
            ("barangay_id", "INT NULL"),
            ("cover_image", "VARCHAR(255) NULL"),
            ("allow_comments", "TINYINT(1) DEFAULT 1")
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
def ensure_endorsement_letters_columns():
    with engine.begin() as conn:
        for col_name, col_type in [
            ("title", "VARCHAR(255) NULL"),
            ("letter_content", "TEXT NULL"),
            ("file_url", "VARCHAR(255) NULL"),
            ("issued_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'endorsement_letters' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE endorsement_letters ADD COLUMN {col_name} {col_type}"))

def ensure_rescue_tables_columns():
    with engine.begin() as conn:
        for col_name, col_type in [
            ("staff_id", "INT NULL"),
            ("leader_id", "INT NULL"),
            ("started_at", "DATETIME NULL")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rescues' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE rescues ADD COLUMN {col_name} {col_type}"))

        for col_name, col_type in [
            ("staff_id", "INT NULL"),
            ("assigned_by", "INT NULL"),
            ("assignment_status", "ENUM('Assigned', 'In Transit', 'On Site', 'Completed', 'Cancelled') DEFAULT 'Assigned'"),
            ("remarks", "TEXT NULL")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rescue_assignments' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE rescue_assignments ADD COLUMN {col_name} {col_type}"))

def ensure_report_verifications_columns():
    with engine.begin() as conn:
        for col_name, col_type in [
            ("verified_by", "INT NULL"),
            ("leader_id", "INT NULL"),
            ("is_valid", "TINYINT(1) DEFAULT 1"),
            ("status_id", "INT NULL")
        ]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_verifications' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE report_verifications ADD COLUMN {col_name} {col_type}"))

def ensure_pet_recovery_and_history_tables():
    """Ensure pet_qr_scans has recovery workflow columns and pet_history table exists."""
    with engine.begin() as conn:
        try:
            # 1. pet_qr_scans columns
            cols = [
                ("status", "VARCHAR(20) NOT NULL DEFAULT 'PENDING'"),
                ("confirmed_at", "DATETIME NULL"),
                ("confirmed_by", "INT NULL"),
                ("rejection_reason", "VARCHAR(255) NULL"),
                ("pet_status_at_scan", "VARCHAR(50) NULL"),
            ]
            for col_name, col_def in cols:
                res = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pet_qr_scans' "
                    f"AND COLUMN_NAME = '{col_name}'"
                ))
                if res.scalar() == 0:
                    conn.execute(text(f"ALTER TABLE pet_qr_scans ADD COLUMN {col_name} {col_def}"))
            
            # 2. pet_history table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pet_history (
                    history_id INT AUTO_INCREMENT PRIMARY KEY,
                    pet_id INT NOT NULL,
                    event_type VARCHAR(100) NOT NULL,
                    title VARCHAR(150) NOT NULL,
                    description TEXT NULL,
                    recovery_method VARCHAR(50) NULL,
                    scan_id INT NULL,
                    actor_id INT NULL,
                    actor_name VARCHAR(100) NULL,
                    actor_role VARCHAR(50) NULL,
                    previous_status VARCHAR(50) NULL,
                    new_status VARCHAR(50) NULL,
                    location_name VARCHAR(255) NULL,
                    latitude DECIMAL(10, 8) NULL,
                    longitude DECIMAL(11, 8) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_pet_history_pet (pet_id),
                    INDEX idx_pet_history_scan (scan_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))
            print("Successfully ensured pet_qr_scans recovery columns and pet_history table.")
        except Exception as e:
            print(f"Notice in ensure_pet_recovery_and_history_tables: {e}")

# Create tables
Base.metadata.create_all(bind=engine)
ensure_report_media_status_column()
ensure_report_media_animal_type_column()
ensure_report_media_dominant_color_column()
ensure_report_ai_suggestion_columns()
ensure_ai_photo_columns()
ensure_report_condition_column()
ensure_pet_vaccine_card_url_column()
ensure_report_status_rows()
ensure_audit_logs_columns()
ensure_qr_tables_exist()
ensure_pet_recovery_and_history_tables()
ensure_report_priority_enum()
ensure_holding_tables()
ensure_pet_claims_status_enum()
ensure_pet_side_photos_columns()
ensure_endorsement_letters_columns()

try:
    from scripts.migrate_adoption_9_stages import migrate_adoption_workflow
    migrate_adoption_workflow()
except Exception as e:
    print(f"Notice in migrate_adoption_workflow: {e}")

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
                thread_type ENUM('Report', 'Pet_Claim', 'Direct') NOT NULL DEFAULT 'Report',
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

def ensure_chat_adoption_thread_type():
    """Allow adoption-application chat threads (thread_type='Adoption') and index thread lookups."""
    with engine.begin() as conn:
        col_type = conn.execute(text(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_threads' AND COLUMN_NAME = 'thread_type'"
        )).scalar()
        if col_type and "'Adoption'" not in str(col_type):
            conn.execute(text(
                "ALTER TABLE chat_threads MODIFY COLUMN thread_type "
                "ENUM('Report','Pet_Claim','Direct','Adoption') NOT NULL DEFAULT 'Report'"
            ))
        has_idx = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.STATISTICS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_threads' AND INDEX_NAME = 'idx_chat_threads_type_related'"
        )).scalar()
        if not has_idx:
            conn.execute(text("CREATE INDEX idx_chat_threads_type_related ON chat_threads (thread_type, related_id)"))

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
    AiJob.__table__.create(bind=engine, checkfirst=True)
    AiVisionComparison.__table__.create(bind=engine, checkfirst=True)


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
                                     ("pet_claims", "merged_into_claim_id", "INT NULL"),
                                     ("pet_claims", "status_before_merge", "VARCHAR(30) NULL"),
                                     ("reports", "separate_incident_reason", "TEXT NULL"),
                                     ("reports", "separate_incident_by", "INT NULL"),
                                     ("reports", "separate_incident_at", "DATETIME NULL"),
                                     ("pets", "merged_into_pet_id", "INT NULL")):
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

        # Seed initial landmarks if empty
        try:
            res = conn.execute(text("SELECT COUNT(*) FROM landmarks"))
            if res.scalar() == 0:
                conn.execute(text("""
                    INSERT INTO landmarks (landmark_id, name, category, description, subdivision_id, barangay_id, latitude, longitude, is_holding_facility, facility_type, capacity, contact_person, contact_number, status) VALUES
                    (1, 'Selera Homes Main Entrance Gate', 'gate', 'Main guardhouse and security station at the entrance of Selera Homes', 1, 1, 14.80149600, 121.00517400, 0, NULL, NULL, 'Chief Guard Reyes', '09171112233', 'Active'),
                    (2, 'Selera Homes Temporary Holding Pen', 'facility', 'Community temporary animal shelter and kennel cages near HOA office', 1, 1, 14.80180000, 121.00280000, 1, 'Temporary Holding Pen', 6, 'Kyla Joy Arriola', '09192223344', 'Active'),
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

        # Clean up any resolved, impounded, or discharged reports so their location reflects original incident origin and not holding facility
        try:
            conn.execute(text("""
                UPDATE reports r
                LEFT JOIN holding_animals ha ON ha.report_id = r.report_id
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
                   OR ha.facility_status IN (3, 4, 5, 7, 8)
                   OR ha.discharge_date IS NOT NULL
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

def ensure_holding_animals_columns():
    with engine.begin() as conn:
        res = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'holding_animals' "
            "AND COLUMN_NAME = 'overdue_notified'"
        ))
        if res.scalar() == 0:
            try:
                conn.execute(text("ALTER TABLE holding_animals ADD COLUMN overdue_notified BOOLEAN DEFAULT FALSE"))
            except Exception as e:
                print(f"Error adding overdue_notified to holding_animals: {e}")

def ensure_adoption_tables_and_columns():
    with engine.begin() as conn:
        cols = [
            ("id_type", "VARCHAR(100) NULL"),
            ("id_number", "VARCHAR(100) NULL"),
            ("id_photo_url", "VARCHAR(255) NULL"),
            ("is_handed_over", "BOOLEAN DEFAULT FALSE"),
            ("handover_date", "DATETIME NULL"),
            ("staff_handed_over", "BOOLEAN DEFAULT FALSE"),
            ("staff_handover_date", "DATETIME NULL"),
            ("staff_handover_by", "INT NULL"),
            ("created_pet_id", "INT NULL"),
            ("cancellation_reason", "TEXT NULL"),
            ("cancelled_at", "DATETIME NULL"),
        ]
        for cname, ctype in cols:
            try:
                res = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'adoptions' "
                    f"AND COLUMN_NAME = '{cname}'"
                ))
                if res.scalar() == 0:
                    conn.execute(text(f"ALTER TABLE adoptions ADD COLUMN {cname} {ctype}"))
            except Exception as e:
                print(f"Error adding {cname} to adoptions: {e}")
        try:
            conn.execute(text("ALTER TABLE adoptions MODIFY COLUMN status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending'"))
        except Exception as e:
            print(f"Error updating status column enum in adoptions: {e}")
        try:
            conn.execute(text("ALTER TABLE adoptions MODIFY COLUMN id_number VARCHAR(255) NULL"))
        except Exception as e:
            print(f"Error updating id_number column width in adoptions: {e}")

ensure_announcement_tables_columns()
ensure_rescue_tables_columns()
ensure_report_verifications_columns()
ensure_notification_archived_column()
ensure_chat_tables()
ensure_chat_adoption_thread_type()
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


def ensure_adoption_tasks_schema():
    """
    Adoption case ownership, task assignments, structured assessments and certificate status.
    New tables (adoption_assignments, adoption_ownership_history) are created by create_all from the models;
    this adds the new columns/foreign keys to the existing tables. Safe to run on every start.
    """
    U = "users(user_id) ON DELETE SET NULL"
    A = "adoption_assignments(assignment_id) ON DELETE SET NULL"
    columns = [
        # (table, column, definition, fk_name, fk_reference)
        ("holding_animals", "sex", "ENUM('Male','Female','Unknown') DEFAULT 'Unknown'", None, None),
        ("users", "password_changed_at", "DATETIME NULL", None, None),
        ("pets", "photo_check_status", "VARCHAR(30) NULL", None, None),
        ("pets", "photo_check_details", "TEXT NULL", None, None),
        ("report_returns", "id_type", "VARCHAR(60) NULL", None, None),
        ("report_returns", "id_last4", "VARCHAR(4) NULL", None, None),
        ("report_returns", "ownership_verified_by_record", "TINYINT(1) NOT NULL DEFAULT 0", None, None),
        ("report_returns", "handover_photo_url", "VARCHAR(255) NULL", None, None),
        ("report_returns", "ownership_proof_urls", "JSON NULL", None, None),
        ("holding_animals", "estimated_age", "VARCHAR(50) NULL", None, None),
        ("adoptions", "case_owner_id", "INT NULL", "fk_adoptions_owner", U),
        ("adoptions", "case_owner_assigned_at", "DATETIME NULL", None, None),
        ("adoptions", "case_owner_assigned_by", "INT NULL", "fk_adoptions_owner_by", U),
        ("adoption_interviews", "assignment_id", "INT NULL", "fk_adopt_interview_assign", A),
        ("adoption_interviews", "evaluated_by", "INT NULL", "fk_adopt_interview_eval", U),
        ("adoption_interviews", "interview_result", "VARCHAR(50) NULL", None, None),
        ("adoption_interviews", "questions_discussed", "TEXT NULL", None, None),
        ("adoption_interviews", "applicant_responses", "TEXT NULL", None, None),
        ("adoption_interviews", "additional_observations", "TEXT NULL", None, None),
        ("adoption_home_visits", "assignment_id", "INT NULL", "fk_adopt_visit_assign", A),
        ("adoption_home_visits", "evaluated_by", "INT NULL", "fk_adopt_visit_eval", U),
        ("adoption_home_visits", "reschedule_count", "INT NOT NULL DEFAULT 0", None, None),
        ("adoption_home_visits", "last_rescheduled_at", "DATETIME NULL", None, None),
        ("adoption_home_visits", "reschedule_reason", "TEXT NULL", None, None),
        ("adoption_home_visits", "residence_condition", "VARCHAR(100) NULL", None, None),
        ("adoption_home_visits", "available_living_space", "VARCHAR(100) NULL", None, None),
        ("adoption_home_visits", "environment_safety", "VARCHAR(100) NULL", None, None),
        ("adoption_home_visits", "cleanliness_sanitation", "VARCHAR(100) NULL", None, None),
        ("adoption_home_visits", "presence_of_hazards", "VARCHAR(255) NULL", None, None),
        ("adoption_home_visits", "existing_pets", "VARCHAR(255) NULL", None, None),
        ("adoption_home_visits", "overall_suitability", "VARCHAR(50) NULL", None, None),
        ("adoption_home_visits", "recommendations", "TEXT NULL", None, None),
        ("adoption_home_visits", "additional_observations", "TEXT NULL", None, None),
        ("adoption_monitoring_logs", "entry_type", "VARCHAR(30) NOT NULL DEFAULT 'Adopter_Checkin'", None, None),
        ("adoption_monitoring_logs", "assignment_id", "INT NULL", "fk_adopt_mon_assign", A),
        ("adoption_monitoring_logs", "assessed_by", "INT NULL", "fk_adopt_mon_assessor", U),
        ("adoption_monitoring_logs", "assessed_at", "DATETIME NULL", None, None),
        ("adoption_monitoring_logs", "assessment_result", "VARCHAR(50) NULL", None, None),
        ("adoption_monitoring_logs", "animal_condition", "VARCHAR(100) NULL", None, None),
        ("adoption_monitoring_logs", "living_condition", "VARCHAR(100) NULL", None, None),
        ("adoption_monitoring_logs", "food_and_water", "VARCHAR(100) NULL", None, None),
        ("adoption_monitoring_logs", "shelter_condition", "VARCHAR(100) NULL", None, None),
        ("adoption_monitoring_logs", "vaccination_status", "VARCHAR(100) NULL", None, None),
        ("adoption_monitoring_logs", "assessment_notes", "TEXT NULL", None, None),
        ("adoption_monitoring_logs", "assessment_photos", "JSON NULL", None, None),
        ("adoption_certificates", "certificate_status", "ENUM('Valid','Revoked') NOT NULL DEFAULT 'Valid'", None, None),
        ("adoption_certificates", "revoked_at", "DATETIME NULL", None, None),
        ("adoption_certificates", "revoked_by", "INT NULL", "fk_adopt_cert_revoker", U),
        ("adoption_certificates", "revoked_reason", "TEXT NULL", None, None),
        ("adoption_certificates", "signatory_id", "INT NULL", "fk_adopt_cert_signatory", U),
        ("adoption_certificates", "signatory_name", "VARCHAR(150) NULL", None, None),
        ("adoption_certificates", "signatory_position", "VARCHAR(150) NULL", None, None),
        ("adoption_certificates", "snapshot", "JSON NULL", None, None),
    ]
    indexes = [
        ("adoptions", "idx_adoptions_owner", "(case_owner_id)"),
        ("adoptions", "idx_adoptions_holding_status", "(holding_id, status)"),
        ("adoption_assignments", "idx_assign_adoption_task", "(adoption_id, task_type, status)"),
        ("adoption_assignments", "idx_assign_user_status", "(assigned_to, status)"),
        ("adoption_ownership_history", "idx_own_hist_adoption", "(adoption_id, created_at)"),
    ]
    with engine.begin() as conn:
        def exists(sql, **params):
            return conn.execute(text(sql), params).scalar() > 0

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
        for table, name, cols in indexes:
            try:
                if not exists(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() "
                    "AND TABLE_NAME = :t AND INDEX_NAME = :n", t=table, n=name
                ):
                    conn.execute(text(f"CREATE INDEX `{name}` ON `{table}` {cols}"))
            except Exception as e:
                print(f"Error creating index {name}: {e}")

ensure_holding_animals_columns()
ensure_adoption_tables_and_columns()
ensure_adoption_tasks_schema()
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
        ("holding_animals", "idx_holding_status_intake", "CREATE INDEX idx_holding_status_intake ON holding_animals (facility_status, intake_date)"),
        ("holding_timeline", "idx_holding_tl_holding_logged", "CREATE INDEX idx_holding_tl_holding_logged ON holding_timeline (holding_id, logged_at)"),
        ("notifications", "idx_notif_user_arch_created", "CREATE INDEX idx_notif_user_arch_created ON notifications (user_id, is_archived, created_at)"),
        ("notifications", "idx_notif_type_related", "CREATE INDEX idx_notif_type_related ON notifications (type, related_id)"),
        ("audit_logs", "idx_audit_tbl_id_time", "CREATE INDEX idx_audit_tbl_id_time ON audit_logs (target_table, target_id, created_at)"),
        ("report_disputes", "idx_disputes_rep_status", "CREATE INDEX idx_disputes_rep_status ON report_disputes (report_id, status)"),
        ("chat_messages", "idx_chat_msg_th_sent", "CREATE INDEX idx_chat_msg_th_sent ON chat_messages (thread_id, sent_at)"),
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
    # AI jobs normally run in the separate worker (python -m app.ai_worker); this only runs them while it is not running.
    from app.utils import ai_jobs
    ai_jobs.start_embedded_runner()
    yield
    # Clean up background tasks on application shutdown
    ai_jobs.stop_embedded_runner()
    watcher_task.cancel()
    backfill_task.cancel()
    try:
        await asyncio.gather(watcher_task, backfill_task, return_exceptions=True)
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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(rescue.router)
app.include_router(rescue.rescue_alias_router)
app.include_router(pets.router)
app.include_router(pet_qr.router)
app.include_router(notifications.router)
app.include_router(announcements.router)
app.include_router(audit_logs_router.router)
app.include_router(holding.router)
app.include_router(claims.router)
app.include_router(chat.router)
app.include_router(adoption_chat.router)
app.include_router(adoption_tasks.router)
app.include_router(adoption_certificates.router)
app.include_router(report_returns.router)
app.include_router(pet_ownership.router)
app.include_router(warnings.router)
app.include_router(matches.router)
app.include_router(landmarks.router)
app.include_router(adoptions.router)
app.include_router(admin.router)
app.include_router(ai_jobs_routes.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to StraySafe API"}

