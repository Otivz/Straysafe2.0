import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

# Add the 'backend' directory to sys.path so 'app' can be imported correctly
# when running from the project root.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Local imports (now safe to import after path fix)
from app.database import engine, Base
from app.routes import auth, users, reports, rescue, pets, notifications, announcements, pet_qr, holding, claims
from app.routes import audit_logs as audit_logs_router
from app.models.pet_qr import PetQRCode, PetQRScan
from app.models.audit_log import AuditLog  # noqa: F401 — ensures table is in Base.metadata
from app.models.pet_claim import PetClaim  # noqa: F401 — ensures table is in Base.metadata


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
                "ENUM('Potential Owner Match', 'Possible Match Found', 'Pending Review', 'Approved', 'Rejected', 'Evidence Requested') "
                "DEFAULT 'Potential Owner Match' NOT NULL"
            ))
            print("Successfully migrated pet_claims.status ENUM values.")
        except Exception as e:
            print(f"Error migrating pet_claims.status ENUM: {e}")

def ensure_pet_side_photos_columns():
    """Add photo_front_url, photo_left_url, photo_right_url columns to pets table if missing."""
    with engine.begin() as conn:
        for col_name in ["photo_front_url", "photo_left_url", "photo_right_url"]:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pets' "
                f"AND COLUMN_NAME = '{col_name}'"
            ))
            if result.scalar() == 0:
                conn.execute(text(f"ALTER TABLE pets ADD COLUMN {col_name} VARCHAR(255) NULL"))

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

# Create tables
Base.metadata.create_all(bind=engine)
ensure_report_media_status_column()
ensure_report_media_animal_type_column()
ensure_report_media_dominant_color_column()
ensure_report_ai_suggestion_columns()
ensure_report_condition_column()
ensure_pet_vaccine_card_url_column()
ensure_report_status_rows()
ensure_audit_logs_columns()
ensure_qr_tables_exist()
ensure_report_priority_enum()
ensure_holding_tables()
ensure_pet_claims_status_enum()
ensure_pet_side_photos_columns()
ensure_user_default_address_columns()

app = FastAPI(title="StraySafe API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(pets.router)
app.include_router(pet_qr.router)
app.include_router(notifications.router)
app.include_router(announcements.router)
app.include_router(audit_logs_router.router)
app.include_router(holding.router)
app.include_router(claims.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to StraySafe API"}
