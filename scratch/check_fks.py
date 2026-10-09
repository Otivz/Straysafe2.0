import sys, os, re
sys.path.insert(0, os.path.abspath('backend'))
from app.database import engine
from sqlalchemy import text

with open('Database3.3.txt', 'r', encoding='utf-8') as f:
    sql_text = f.read()

# Check foreign key constraints
with engine.connect() as conn:
    db_fks = conn.execute(text("""
        SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
    """)).fetchall()

print(f"Total FKs in DB: {len(db_fks)}")

# Check views or triggers or stored routines
with engine.connect() as conn:
    triggers = conn.execute(text("SHOW TRIGGERS")).fetchall()
    print(f"Triggers in DB: {len(triggers)}")

print("Done checking.")
