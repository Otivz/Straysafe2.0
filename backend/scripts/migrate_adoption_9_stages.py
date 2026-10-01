import logging
from sqlalchemy import text
from app.database.session import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def migrate_adoption_workflow():
    with engine.begin() as conn:
        logger.info("Checking and adding new columns to adoptions table...")
        adoption_cols = [
            ("current_stage", "VARCHAR(50) NOT NULL DEFAULT 'Application'"),
            ("application_stage_status", "VARCHAR(50) NOT NULL DEFAULT 'Submitted'"),
            ("agreement_signed_at", "DATETIME NULL"),
            ("agreement_signature_url", "VARCHAR(500) NULL"),
            ("certificate_id", "INT NULL"),
            ("handover_location", "VARCHAR(255) NULL"),
            ("handover_photo_url", "VARCHAR(500) NULL"),
            ("post_monitoring_status", "VARCHAR(50) NOT NULL DEFAULT 'Not_Started'")
        ]

        for col_name, col_def in adoption_cols:
            res = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'adoptions' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if res.scalar() == 0:
                logger.info(f"Adding column '{col_name}' to adoptions...")
                conn.execute(text(f"ALTER TABLE adoptions ADD COLUMN {col_name} {col_def}"))

        logger.info("Ensuring adoption_verifications table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_verifications (
                verification_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL,
                verified_by INT NULL,
                id_match_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                residency_status VARCHAR(50) NOT NULL DEFAULT 'Unknown',
                blacklist_checked TINYINT(1) NOT NULL DEFAULT 0,
                is_blacklisted TINYINT(1) NOT NULL DEFAULT 0,
                verification_notes TEXT NULL,
                verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_adopt_verif_adopt (adoption_id),
                CONSTRAINT fk_adopt_verif_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_verif_user FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        logger.info("Ensuring adoption_interviews table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_interviews (
                interview_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL,
                interviewer_id INT NULL,
                scheduled_at DATETIME NULL,
                interview_mode VARCHAR(50) NOT NULL DEFAULT 'In-Person',
                meeting_link VARCHAR(500) NULL,
                score_care_knowledge INT NULL,
                score_financial_readiness INT NULL,
                score_environment_suitability INT NULL,
                total_score DECIMAL(5,2) NULL,
                recommendation VARCHAR(50) NOT NULL DEFAULT 'Pending',
                interview_notes TEXT NULL,
                conducted_at DATETIME NULL,
                INDEX idx_adopt_interview_adopt (adoption_id),
                CONSTRAINT fk_adopt_interview_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_interview_user FOREIGN KEY (interviewer_id) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        logger.info("Ensuring adoption_home_visits table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_home_visits (
                visit_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL,
                inspector_id INT NULL,
                visit_type VARCHAR(50) NOT NULL DEFAULT 'Physical',
                scheduled_date DATETIME NULL,
                is_fencing_secure TINYINT(1) NOT NULL DEFAULT 0,
                is_shelter_adequate TINYINT(1) NOT NULL DEFAULT 0,
                hazard_free TINYINT(1) NOT NULL DEFAULT 0,
                checklist_notes TEXT NULL,
                gps_latitude DECIMAL(10,8) NULL,
                gps_longitude DECIMAL(11,8) NULL,
                visit_photos JSON NULL,
                inspection_result VARCHAR(50) NOT NULL DEFAULT 'Pending',
                conducted_at DATETIME NULL,
                INDEX idx_adopt_visit_adopt (adoption_id),
                CONSTRAINT fk_adopt_visit_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_visit_user FOREIGN KEY (inspector_id) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        logger.info("Ensuring adoption_certificates table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_certificates (
                certificate_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL UNIQUE,
                certificate_number VARCHAR(100) NOT NULL UNIQUE,
                verification_hash VARCHAR(64) NOT NULL UNIQUE,
                pdf_url VARCHAR(500) NOT NULL,
                qr_code_url VARCHAR(500) NOT NULL,
                issued_by INT NULL,
                issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_adopt_cert_adopt (adoption_id),
                CONSTRAINT fk_adopt_cert_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_cert_user FOREIGN KEY (issued_by) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        logger.info("Ensuring adoption_monitoring_logs table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_monitoring_logs (
                log_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL,
                milestone_name VARCHAR(50) NOT NULL,
                due_date DATE NOT NULL,
                submitted_at DATETIME NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'Pending',
                health_status VARCHAR(100) NULL,
                photos JSON NULL,
                vet_record_url VARCHAR(500) NULL,
                adopter_notes TEXT NULL,
                reviewed_by INT NULL,
                review_notes TEXT NULL,
                reviewed_at DATETIME NULL,
                INDEX idx_adopt_mon_adopt (adoption_id),
                CONSTRAINT fk_adopt_mon_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_mon_user FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        logger.info("Ensuring adoption_timeline_logs table exists...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adoption_timeline_logs (
                timeline_id INT AUTO_INCREMENT PRIMARY KEY,
                adoption_id INT NOT NULL,
                stage VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                performed_by INT NULL,
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_adopt_time_adopt (adoption_id),
                CONSTRAINT fk_adopt_time_adopt FOREIGN KEY (adoption_id) REFERENCES adoptions(adoption_id) ON DELETE CASCADE,
                CONSTRAINT fk_adopt_time_user FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        # Synchronize existing adoptions current_stage based on their status
        conn.execute(text("""
            UPDATE adoptions 
            SET current_stage = CASE 
                WHEN is_handed_over = 1 OR staff_handed_over = 1 THEN 'Monitoring'
                WHEN status = 'Approved' THEN 'Handover'
                WHEN status = 'Rejected' THEN 'Application'
                WHEN status = 'Cancelled' THEN 'Application'
                ELSE 'Application'
            END
            WHERE current_stage IS NULL OR current_stage = '' OR current_stage = 'Application';
        """))

        logger.info("Adoption 9-stage tables and columns migration completed successfully!")

if __name__ == "__main__":
    migrate_adoption_workflow()
