import sys
from pathlib import Path
from sqlalchemy import create_engine, text

backend_dir = Path(r"c:\Users\User\Desktop\Straysafe2.0\backend")
sys.path.insert(0, str(backend_dir))

from app.database import engine

with engine.connect() as conn:
    res = conn.execute(text("SHOW CREATE TABLE adoptions;")).fetchone()
    print("=== LIVE MySQL 'adoptions' TABLE DDL ===")
    print(res[1])
