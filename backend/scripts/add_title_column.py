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
    # Check if 'title' column exists in endorsement_letters
    result = conn.execute(text("SHOW COLUMNS FROM endorsement_letters LIKE 'title'"))
    column_exists = result.fetchone() is not None
    
    if not column_exists:
        print("Adding column 'title' to table 'endorsement_letters'...")
        conn.execute(text("ALTER TABLE endorsement_letters ADD COLUMN title VARCHAR(255) NULL AFTER report_id"))
        conn.commit()
        print("Column 'title' added successfully.")
    else:
        print("Column 'title' already exists in table 'endorsement_letters'.")
