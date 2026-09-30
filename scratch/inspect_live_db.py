import sys
from pathlib import Path
from sqlalchemy import create_engine, inspect

backend_dir = Path(r"c:\Users\User\Desktop\Straysafe2.0\backend")
sys.path.insert(0, str(backend_dir))

from app.database import engine

insp = inspect(engine)

try:
    tables = insp.get_table_names()
    print("Connected to MySQL successfully!")
    print(f"Total tables in live DB: {len(tables)}")
    
    # Check adoptions columns in live DB
    if "adoptions" in tables:
        cols = insp.get_columns("adoptions")
        print("\nColumns in live 'adoptions' table:")
        for c in cols:
            print(f"  {c['name']} : {c['type']} (nullable={c['nullable']})")
except Exception as e:
    print("Error connecting to DB:", e)
