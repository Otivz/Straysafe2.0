import sys, os, re
sys.path.insert(0, os.path.abspath('backend'))
from app.database import engine
from sqlalchemy import text

with open('Database3.3.txt', 'r', encoding='utf-8') as f:
    sql_text = f.read()

rep_m = re.search(r'CREATE TABLE [`"]?reports[`"]?\s*\((.*?)\)\s*ENGINE', sql_text, re.DOTALL | re.IGNORECASE)
if rep_m:
    cols_in_txt = [line.strip().split()[0].replace('`', '') for line in rep_m.group(1).splitlines() if line.strip() and not line.strip().startswith(('--', 'PRIMARY', 'KEY', 'CONSTRAINT', 'UNIQUE'))]
    with engine.connect() as conn:
        db_cols = [r[0] for r in conn.execute(text('DESCRIBE reports')).fetchall()]
    print('Diff in reports (DB - txt):', set(db_cols) - set(cols_in_txt))
    print('Diff in reports (txt - DB):', set(cols_in_txt) - set(db_cols))
