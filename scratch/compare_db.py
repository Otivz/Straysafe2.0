import sys, os
sys.path.insert(0, os.path.abspath('backend'))
from app.database import engine
from sqlalchemy import text
import re

with open('Database3.3.txt', 'r', encoding='utf-8') as f:
    sql_text = f.read()

txt_tables = set(re.findall(r'CREATE TABLE [`"]?([a-zA-Z0-9_]+)[`"]?', sql_text, re.IGNORECASE))

with engine.connect() as conn:
    db_tables = set(r[0] for r in conn.execute(text('SHOW TABLES')).fetchall())

print('Total tables in DB:', len(db_tables))
print('Total tables in Database3.3.txt:', len(txt_tables))
print('\n--- Tables in DB but missing from Database3.3.txt ---')
for t in sorted(db_tables - txt_tables):
    print(' ', t)

print('\n--- Tables in Database3.3.txt but missing from DB ---')
for t in sorted(txt_tables - db_tables):
    print(' ', t)

# Now check columns for matching tables
print('\n--- Checking column differences ---')
for table in sorted(db_tables & txt_tables):
    with engine.connect() as conn:
        db_cols = {r[0]: (r[1], r[2]) for r in conn.execute(text(
            f"SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}'"
        )).fetchall()}
    
    # Extract table DDL from text
    match = re.search(rf'CREATE TABLE [`"]?{table}[`"]?\s*\((.*?)\)\s*(?:ENGINE|;)', sql_text, re.DOTALL | re.IGNORECASE)
    if match:
        table_body = match.group(1)
        # find column definitions
        txt_col_names = []
        for line in table_body.splitlines():
            line = line.strip()
            if not line or line.startswith('--'):
                continue
            col_m = re.match(r'^[`"]?([a-zA-Z0-9_]+)[`"]?\s+', line)
            if col_m:
                col_name = col_m.group(1)
                if col_name.upper() not in ('PRIMARY', 'KEY', 'INDEX', 'UNIQUE', 'CONSTRAINT', 'FOREIGN'):
                    txt_col_names.append(col_name)
        txt_cols_set = set(txt_col_names)
        db_cols_set = set(db_cols.keys())
        
        missing_in_txt = db_cols_set - txt_cols_set
        missing_in_db = txt_cols_set - db_cols_set
        if missing_in_txt or missing_in_db:
            print(f"Table '{table}':")
            if missing_in_txt:
                print(f"  Columns in DB but missing in Database3.3.txt: {sorted(missing_in_txt)}")
            if missing_in_db:
                print(f"  Columns in Database3.3.txt but missing in DB: {sorted(missing_in_db)}")
