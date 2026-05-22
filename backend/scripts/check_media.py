import sys
import os

# Add the backend directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.session import SessionLocal
from app.models.report import ReportMedia

def check_media():
    db = SessionLocal()
    try:
        # Query the last 5 media records using SQLAlchemy models
        media = db.query(ReportMedia).order_by(ReportMedia.uploaded_at.desc()).limit(5).all()
        
        if not media:
            print("No media records found.")
            return

        print("Last 5 media records:")
        for item in media:
            # item.media_type is an Enum, we use .value or str() if needed, 
            # but SQLAlchemy handles it
            print(f"{item.media_type}: {item.file_url}")
    except Exception as e:
        print(f"Error checking media: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_media()
