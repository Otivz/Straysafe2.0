import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from sqlalchemy import text

def migrate():
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
                print(f"Added {col} to reports table.")
            else:
                print(f"{col} already exists in reports table.")

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
                print(f"Added {col} to report_media table.")
            else:
                print(f"{col} already exists in report_media table.")
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
