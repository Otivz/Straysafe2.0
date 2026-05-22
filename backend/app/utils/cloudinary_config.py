import cloudinary
import cloudinary.uploader
import os
from dotenv import load_dotenv

# Load environment variables from the project root
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), '.env')
load_dotenv(dotenv_path=env_path)

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

def upload_to_cloudinary(file_content, folder="straysafe", resource_type="auto", filename=None):
    try:
        # Generate a unique public_id that preserves the extension for raw files
        import uuid
        import os
        
        # For raw files, we MUST include the extension in the public_id
        # For image/video, Cloudinary handles extensions dynamically
        ext = ""
        if filename:
            ext = os.path.splitext(filename)[1]
            
        public_id = uuid.uuid4().hex
        if resource_type == "raw" and ext:
            public_id += ext
            
        response = cloudinary.uploader.upload(
            file_content, 
            folder=folder, 
            resource_type=resource_type,
            public_id=public_id,
            use_filename=True,
            unique_filename=True
        )
        
        secure_url = response.get("secure_url")
        
        # Ensure the extension is in the URL for all media types (Image, Video, Document)
        # This helps browsers and Cloudinary's download transformations identify the file format correctly
        if secure_url and ext and not secure_url.lower().endswith(ext.lower()):
            # For images and videos, Cloudinary treats the extension as a format request (e.g., .jpg, .mp4)
            secure_url += ext
            
        return secure_url
    except Exception as e:
        print(f"!!! CLOUDINARY UPLOAD ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise e
