import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load env from workspace root
os.chdir(os.path.dirname(os.path.abspath(__file__)))
load_dotenv('../../.env')
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("No DATABASE_URL found!")
    sys.exit(1)

engine = create_engine(db_url)

with engine.connect() as conn:
    # Check if 'holding_log_id' column exists in report_media
    result = conn.execute(text("SHOW COLUMNS FROM report_media LIKE 'holding_log_id'"))
    column_exists = result.fetchone() is not None
    
    if not column_exists:
        print("Adding column 'holding_log_id' to table 'report_media'...")
        conn.execute(text("ALTER TABLE report_media ADD COLUMN holding_log_id INT NULL AFTER status_id"))
        conn.execute(text("ALTER TABLE report_media ADD CONSTRAINT fk_report_media_holding_timeline FOREIGN KEY (holding_log_id) REFERENCES holding_timeline(log_id) ON DELETE SET NULL"))
        conn.commit()
        print("Column 'holding_log_id' and foreign key constraint added successfully.")
    else:
        print("Column 'holding_log_id' already exists in table 'report_media'.")
