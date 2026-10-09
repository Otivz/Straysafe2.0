import sys, os
sys.path.insert(0, os.path.abspath('backend'))
from app.database import engine
from sqlalchemy import text
import re

with open('Database3.3.txt', 'r', encoding='utf-8') as f:
    sql_text = f.read()

# Let's inspect report_matches in Database3.3.txt
rm_match = re.search(r'CREATE TABLE `?report_matches`?\s*\((.*?)\)\s*ENGINE', sql_text, re.DOTALL | re.IGNORECASE)
if rm_match:
    print('--- Current report_matches definition in Database3.3.txt ---')
    print(rm_match.group(0))

# Check live DB column definitions for report_matches
print('\n--- Live DB columns for report_matches ---')
with engine.connect() as conn:
    cols = conn.execute(text("DESCRIBE report_matches")).fetchall()
    for c in cols:
        print(f"  {c[0]}: {c[1]} (Null: {c[2]}, Default: {c[4]})")

# Check all ENUMs across all tables to see if any have drifted
print('\n--- Checking ENUM definitions across all tables ---')
with engine.connect() as conn:
    enum_cols = conn.execute(text(
        "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'enum'"
    )).fetchall()
    for t_name, c_name, c_type in enum_cols:
        # Search for this column in Database3.3.txt
        pattern = rf'CREATE TABLE [`"]?{t_name}[`"]?\s*\((.*?)\)\s*ENGINE'
        t_m = re.search(pattern, sql_text, re.DOTALL | re.IGNORECASE)
        if t_m:
            col_m = re.search(rf'[`"]?{c_name}[`"]?\s+enum\((.*?)\)', t_m.group(1), re.IGNORECASE)
            if col_m:
                txt_enum = f"enum({col_m.group(1)})".lower().replace(" ", "").replace('"', "'")
                db_enum = c_type.lower().replace(" ", "").replace('"', "'")
                if txt_enum != db_enum:
                    print(f"MISMATCH in {t_name}.{c_name}:")
                    print(f"  Live DB: {c_type}")
                    print(f"  Txt:     enum({col_m.group(1)})")
            else:
                print(f"ENUM column {t_name}.{c_name} not found as ENUM in Database3.3.txt!")
