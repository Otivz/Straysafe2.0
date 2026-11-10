"""
Import this FIRST in a test script. It blanks every credential that would let a test reach an outside service
(the AI model, email, push, image uploads), so an offline test can never send a real message or make a real API call,
whatever the developer's .env holds. Environment variables that are already set win over .env (load_dotenv does not
override them), so an empty value here is what the application sees.
"""
import os

for _name in ("GEMINI_API_KEY", "SMTP_USER", "SMTP_PASSWORD", "RESEND_API_KEY", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY",
              "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
    os.environ[_name] = ""
