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

cols_to_add = [
    ("ai_behavior_chasing", "BOOLEAN DEFAULT FALSE"),
    ("ai_behavior_actual_bite", "BOOLEAN DEFAULT FALSE"),
    ("ai_behavior_attempted_bite", "BOOLEAN DEFAULT FALSE"),
    ("ai_behavior_injury", "BOOLEAN DEFAULT FALSE"),
    ("ai_behavior_aggressive", "BOOLEAN DEFAULT FALSE"),
    ("ai_behavior_explanation", "TEXT NULL")
]

with engine.connect() as conn:
    for col_name, col_type in cols_to_add:
        result = conn.execute(text(f"SHOW COLUMNS FROM reports LIKE '{col_name}'"))
        if result.fetchone() is None:
            print(f"Adding column '{col_name}' to table 'reports'...")
            conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_type}"))
            conn.commit()
            print(f"Column '{col_name}' added successfully.")
        else:
            print(f"Column '{col_name}' already exists in table 'reports'.")

print("All AI behavioral columns verified/added successfully.")
