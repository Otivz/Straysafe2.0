from app.database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE pets MODIFY COLUMN status ENUM('Active','Lost','Found','Rescued','Deceased','Archived','Inactive') DEFAULT 'Active'"))
            conn.commit()
            print("Successfully updated pets.status enum to include 'Archived' and 'Inactive'.")
        except Exception as e:
            print(f"Migration error or column already updated: {e}")

if __name__ == "__main__":
    run_migration()
