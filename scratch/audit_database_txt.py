import sys
from pathlib import Path
import re
from sqlalchemy import create_engine, inspect, text

backend_dir = Path(r"c:\Users\User\Desktop\Straysafe2.0\backend")
sys.path.insert(0, str(backend_dir))
from app.database import engine

insp = inspect(engine)
live_tables = insp.get_table_names()

sql_file = Path(r"c:\Users\User\Desktop\Straysafe2.0\Database3.3.txt")
sql_content = sql_file.read_text(encoding="utf-8")

# 1. Check Tables
create_table_regex = re.compile(r"CREATE\s+TABLE\s+[`'\"]?(\w+)[`'\"]?\s*\((.*?)\)\s*ENGINE", re.DOTALL | re.IGNORECASE)
sql_tables = {}
for match in create_table_regex.finditer(sql_content):
    tname = match.group(1)
    body = match.group(2)
    cols = {}
    for line in body.splitlines():
        line = line.strip().rstrip(",")
        if not line:
            continue
        m = re.match(r"^[`'\"]?(\w+)[`'\"]?\s+([A-Za-z0-9_]+(?:\([^)]+\))?)", line)
        if m:
            first_word = m.group(1).upper()
            if first_word in ("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT", "FOREIGN", "INDEX", "FULLTEXT", "CHECK"):
                continue
            cname = m.group(1)
            ctype = m.group(2)
            cols[cname] = {"type": ctype, "raw": line}
    sql_tables[tname] = cols

print(f"Tables in Live DB: {len(live_tables)}")
print(f"Tables in Database3.3.txt: {len(sql_tables)}")

missing_in_sql = set(live_tables) - set(sql_tables.keys())
missing_in_live = set(sql_tables.keys()) - set(live_tables)

print("Tables missing in Database3.3.txt:", missing_in_sql or "None")
print("Tables missing in Live DB:", missing_in_live or "None")

# 2. Check Column Differences
col_diffs = []
for t in live_tables:
    if t not in sql_tables:
        continue
    live_cols = {c["name"]: str(c["type"]) for c in insp.get_columns(t)}
    file_cols = sql_tables[t]
    
    missing_cols_in_file = set(live_cols.keys()) - set(file_cols.keys())
    missing_cols_in_live = set(file_cols.keys()) - set(live_cols.keys())
    
    if missing_cols_in_file:
        col_diffs.append(f"[{t}] Columns in Live DB but missing in Database3.3.txt: {missing_cols_in_file}")
    if missing_cols_in_live:
        col_diffs.append(f"[{t}] Columns in Database3.3.txt but missing in Live DB: {missing_cols_in_live}")

if col_diffs:
    for d in col_diffs:
        print(d)
else:
    print("All columns in all 61 tables match 1:1 between Live DB and Database3.3.txt!")

# 4. Check all INSERT INTO statements in Database3.3.txt
all_inserts = re.findall(r"INSERT INTO [`'\"]?(\w+)[`'\"]?\s*\((.*?)\)\s*VALUES\s*(.*?);", sql_content, re.DOTALL | re.IGNORECASE)
print("\n--- All Seed Tables in Database3.3.txt ---")
with engine.connect() as conn:
    for tname, cols, vals in all_inserts:
        live_count = conn.execute(text(f"SELECT COUNT(*) FROM `{tname}`")).scalar() if tname in live_tables else "N/A"
        # Count tuples in values
        val_tuples = re.findall(r"\((.*?)\)", vals, re.DOTALL)
        print(f"Table '{tname}': {len(val_tuples)} seed rows in Database3.3.txt vs {live_count} rows in Live DB")

