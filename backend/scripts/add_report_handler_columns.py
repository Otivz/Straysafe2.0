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
    # Check if 'assigned_leader_id' column exists in reports
    result = conn.execute(text("SHOW COLUMNS FROM reports LIKE 'assigned_leader_id'"))
    col_leader_exists = result.fetchone() is not None
    
    if not col_leader_exists:
        print("Adding column 'assigned_leader_id' to table 'reports'...")
        conn.execute(text("ALTER TABLE reports ADD COLUMN assigned_leader_id INT NULL, ADD CONSTRAINT fk_reports_assigned_leader FOREIGN KEY (assigned_leader_id) REFERENCES users(user_id) ON DELETE SET NULL"))
        conn.commit()
        print("Column 'assigned_leader_id' added successfully.")
    else:
        print("Column 'assigned_leader_id' already exists in table 'reports'.")

    # Check if 'claimed_at' column exists in reports
    result = conn.execute(text("SHOW COLUMNS FROM reports LIKE 'claimed_at'"))
    col_claimed_exists = result.fetchone() is not None
    
    if not col_claimed_exists:
        print("Adding column 'claimed_at' to table 'reports'...")
        conn.execute(text("ALTER TABLE reports ADD COLUMN claimed_at DATETIME NULL"))
        conn.commit()
        print("Column 'claimed_at' added successfully.")
    else:
        print("Column 'claimed_at' already exists in table 'reports'.")

print("Migration completed successfully!")
