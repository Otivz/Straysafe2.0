import sys
import re
from pathlib import Path
from sqlalchemy import create_engine, inspect

backend_dir = Path(r"c:\Users\User\Desktop\Straysafe2.0\backend")
sys.path.insert(0, str(backend_dir))

from app.database import engine

insp = inspect(engine)
live_tables = insp.get_table_names()

# Parse Database3.3.txt
sql_file = Path(r"c:\Users\User\Desktop\Straysafe2.0\Database3.3.txt")
sql_content = sql_file.read_text(encoding="utf-8")

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
            cols[cname] = {
                "type": ctype,
                "raw": line
            }
    sql_tables[tname] = cols

print("=================================================================")
print("COMPREHENSIVE AUDIT: LIVE MySQL DATABASE vs Database3.3.txt")
print("=================================================================\n")

# Check tables
live_set = set(live_tables)
sql_set = set(sql_tables.keys())

only_in_live = live_set - sql_set
only_in_sql = sql_set - live_set

print(f"Total Tables in Live DB: {len(live_set)}")
print(f"Total Tables in Database3.3.txt: {len(sql_set)}")

if only_in_live:
    print(f"\nTables present in LIVE DB but MISSING from Database3.3.txt:")
    for t in sorted(only_in_live):
        print(f"  + {t}")
else:
    print("\nNo tables in Live DB are missing from Database3.3.txt.")

if only_in_sql:
    print(f"\nTables present in Database3.3.txt but MISSING from LIVE DB:")
    for t in sorted(only_in_sql):
        print(f"  - {t}")
else:
    print("No tables in Database3.3.txt are missing from Live DB.")

print("\n--- Column & Type Differences ---")
diff_found = False
for tname in sorted(live_set.intersection(sql_set)):
    live_cols = {c["name"]: c for c in insp.get_columns(tname)}
    sql_cols = sql_tables[tname]
    
    l_col_set = set(live_cols.keys())
    s_col_set = set(sql_cols.keys())
    
    col_only_live = l_col_set - s_col_set
    col_only_sql = s_col_set - l_col_set
    
    if col_only_live:
        diff_found = True
        print(f"\n[{tname}] Columns in LIVE DB but NOT in Database3.3.txt:")
        for c in sorted(col_only_live):
            print(f"  + {c} ({live_cols[c]['type']})")
            
    if col_only_sql:
        diff_found = True
        print(f"\n[{tname}] Columns in Database3.3.txt but NOT in LIVE DB:")
        for c in sorted(col_only_sql):
            print(f"  - {c} ({sql_cols[c]['type']})")
            
    # Check type differences (like varchar lengths)
    for c in sorted(l_col_set.intersection(s_col_set)):
        l_type = str(live_cols[c]["type"]).lower()
        s_type = sql_cols[c]["type"].lower()
        
        # Check varchar length discrepancies
        m_l = re.search(r"varchar\((\d+)\)", l_type)
        m_s = re.search(r"varchar\((\d+)\)", s_type)
        if m_l and m_s and m_l.group(1) != m_s.group(1):
            diff_found = True
            print(f"\n[{tname}.{c}] Type length discrepancy:")
            print(f"  Live DB:           VARCHAR({m_l.group(1)})")
            print(f"  Database3.3.txt:   VARCHAR({m_s.group(1)})")

if not diff_found:
    print("No column discrepancies found between Live DB and Database3.3.txt!")
