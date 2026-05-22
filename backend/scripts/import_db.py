import sys
import os
from sqlalchemy import create_engine, text

# Add the backend directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import DATABASE_URL

def import_db():
    # To run DROP/CREATE DATABASE, we should connect to the server, not the specific DB
    # We strip the database name from the end of the URL
    if '/' in DATABASE_URL.split('://')[1]:
        server_url = DATABASE_URL.rsplit('/', 1)[0]
    else:
        server_url = DATABASE_URL

    # Create a temporary engine for the server connection
    # We use the pymysql driver as specified in the URL
    engine = create_engine(server_url)
    
    # Path to the SQL file (using .md as identified in the project)
    sql_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'database_query.md')
    
    if not os.path.exists(sql_file):
        print(f"Error: SQL file not found at {sql_file}")
        return

    print(f"Reading SQL from {sql_file}...")
    with open(sql_file, 'r') as f:
        sql = f.read()

    print("Executing database reset...")
    try:
        # We use raw_connection to support multi-statement execution if the driver allows it
        # or we split the statements. For simplicity and driver compatibility, 
        # we'll use the raw connection from the engine.
        connection = engine.raw_connection()
        try:
            cursor = connection.cursor()
            # MySQL pymysql driver supports multi-statements if configured or via this method
            cursor.execute(sql)
            connection.commit()
            print("Database reset successfully.")
        finally:
            connection.close()
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import_db()
