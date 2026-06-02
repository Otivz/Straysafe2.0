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
from app.routes import auth, users, reports, rescue, pets, notifications, announcements, pet_qr
from app.routes import audit_logs as audit_logs_router
from app.models.pet_qr import PetQRCode, PetQRScan
from app.models.audit_log import AuditLog  # noqa: F401 — ensures table is in Base.metadata


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

@app.get("/")
def read_root():
    return {"message": "Welcome to StraySafe API"}
