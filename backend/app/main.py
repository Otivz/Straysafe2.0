import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

# Add the 'backend' directory to sys.path so 'app' can be imported correctly
# when running from the project root.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Local imports (now safe to import after path fix)
from app.database import engine, Base
from app.routes import auth, users, reports, rescue, pets, notifications


def ensure_report_media_status_column():
    with engine.begin() as conn:
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_media' "
            "AND COLUMN_NAME = 'status_id'"
        ))
        if result.scalar() == 0:
            conn.execute(text("ALTER TABLE report_media ADD COLUMN status_id INT NULL"))
            conn.execute(text(
                "ALTER TABLE report_media "
                "ADD CONSTRAINT fk_report_media_status_id "
                "FOREIGN KEY (status_id) REFERENCES report_status(status_id) ON DELETE SET NULL"
            ))

# Create tables
Base.metadata.create_all(bind=engine)
ensure_report_media_status_column()

app = FastAPI(title="StraySafe API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
os.makedirs("uploads", exist_ok=True)

# Mount the uploads directory to serve static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include routes
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(reports.router)
app.include_router(rescue.router)
app.include_router(pets.router)
app.include_router(notifications.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to StraySafe API"}
