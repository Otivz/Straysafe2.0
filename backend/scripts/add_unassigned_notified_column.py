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
    # Check if 'unassigned_notified' column exists in reports
    result = conn.execute(text("SHOW COLUMNS FROM reports LIKE 'unassigned_notified'"))
    col_exists = result.fetchone() is not None
    
    if not col_exists:
        print("Adding column 'unassigned_notified' to table 'reports'...")
        conn.execute(text("ALTER TABLE reports ADD COLUMN unassigned_notified BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.commit()
        print("Column 'unassigned_notified' added successfully.")
    else:
        print("Column 'unassigned_notified' already exists in table 'reports'.")

print("Migration completed successfully!")
