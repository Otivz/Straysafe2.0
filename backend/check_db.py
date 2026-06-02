import sys
import os
from sqlalchemy import create_engine, inspect
from dotenv import load_dotenv

# Load env
load_dotenv()
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("No DATABASE_URL found!")
    sys.exit(1)

engine = create_engine(db_url)
inspector = inspect(engine)

print("Tables in Database:")
for table_name in inspector.get_table_names():
    print(f"\nTable: {table_name}")
    for column in inspector.get_columns(table_name):
        print(f"  - {column['name']}: {column['type']}")
