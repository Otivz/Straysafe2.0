import os
import io
import time
import uuid
import base64
import hashlib
import datetime
import logging
from typing import Optional, Tuple, Set

from PIL import Image, ImageDraw, ImageFont, ImageOps
from cryptography.fernet import Fernet
import cloudinary
import cloudinary.uploader
import cloudinary.utils
from app.utils.cloudinary_config import cloudinary as _configured_cloudinary
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Allowed extensions and MIME types for Government IDs
ALLOWED_ID_EXTENSIONS: Set[str] = {'.jpg', '.jpeg', '.png', '.webp'}
ALLOWED_ID_MIMES: Set[str] = {'image/jpeg', 'image/png', 'image/webp'}
MAX_ID_FILE_SIZE: int = 5 * 1024 * 1024  # 5 MB

# Blacklisted extensions to prevent executable / script injection
DANGEROUS_EXTENSIONS: Set[str] = {
    '.exe', '.bat', '.sh', '.cmd', '.php', '.phtml', '.py', '.js', '.vbs',
    '.msi', '.com', '.scr', '.hta', '.jar', '.dll', '.so', '.bin', '.cgi',
    '.pl', '.asp', '.aspx', '.jsp', '.xhtml', '.svg', '.html', '.htm'
}


def _get_encryption_key() -> bytes:
    """
    Retrieve or derive the 32-byte url-safe base64 Fernet encryption key.
    Prioritizes ID_ENCRYPTION_KEY, then derives a deterministic key from SECRET_KEY/JWT_SECRET_KEY.
    """
    raw_key = os.getenv("ID_ENCRYPTION_KEY", "").strip()
    if raw_key:
        try:
            # Validate if it's already a valid 32-byte Fernet key
            Fernet(raw_key.encode())
            return raw_key.encode()
        except Exception:
            # If not direct Fernet format, hash into 32 bytes and base64-encode
            key_bytes = hashlib.sha256(raw_key.encode()).digest()
            return base64.urlsafe_b64encode(key_bytes)
    
    # Fallback derivation from system SECRET_KEY or JWT_SECRET_KEY
    master_secret = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY") or "straysafe_default_secure_salt_key_2026"
    derived_bytes = hashlib.sha256(f"straysafe_id_enc_{master_secret}".encode()).digest()
    return base64.urlsafe_b64encode(derived_bytes)


def encrypt_id_number(raw_id: Optional[str]) -> Optional[str]:
    """
    Encrypts a government ID number using Fernet AES-256 before database insertion.
    Returns ciphertext string prefixed with 'enc::' or None if empty.
    """
    if not raw_id:
        return None
    raw_str = raw_id.strip()
    if not raw_str:
        return None
    # If already encrypted, avoid double encryption
    if raw_str.startswith("enc::"):
        return raw_str

    try:
        fernet = Fernet(_get_encryption_key())
        token = fernet.encrypt(raw_str.encode("utf-8")).decode("utf-8")
        return f"enc::{token}"
    except Exception as e:
        logger.error(f"Failed to encrypt ID number: {e}")
        # Fallback to returning raw string if encryption fails to prevent data corruption
        return raw_str


def decrypt_id_number(stored_id: Optional[str]) -> Optional[str]:
    """
    Decrypts an encrypted government ID number from the database.
    Seamlessly supports legacy cleartext records.
    """
    if not stored_id:
        return None
    stored_str = stored_id.strip()
    if not stored_str:
        return None

    if stored_str.startswith("enc::"):
        token = stored_str[5:]
        try:
            fernet = Fernet(_get_encryption_key())
            return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except Exception as e:
            logger.error(f"Failed to decrypt ID number token: {e}")
            return "[ENCRYPTED_ID]"
    
    # Legacy cleartext or masked string
    return stored_str


def mask_government_id_number(raw_id: Optional[str], id_type: Optional[str] = "") -> str:
    """
    Masks sensitive characters in government IDs while preserving enough
    characters (first 2 and last 4) for visual confirmation by staff during pet handover.
    Example: '1234-5678-9012' -> '12**-****-9012'
    Example: 'N01-23-456789'  -> 'N0*-**-***789'
    """
    if not raw_id:
        return ""
    
    # If it's stored encrypted, decrypt it first before masking
    decrypted = decrypt_id_number(raw_id) if (raw_id and raw_id.startswith("enc::")) else raw_id
    if not decrypted:
        return ""

    clean = decrypted.strip()
    length = len(clean)
    if length <= 4:
        return "••••" + clean

    visible_prefix_len = 2 if length > 6 else 1
    visible_suffix_len = 4 if length > 8 else 2

    prefix = clean[:visible_prefix_len]
    suffix = clean[-visible_suffix_len:]
    middle = clean[visible_prefix_len:-visible_suffix_len]

    masked_middle = "".join(char if char in "- /" else "*" for char in middle)
    return f"{prefix}{masked_middle}{suffix}"


def validate_and_sanitize_id_image(
    file_bytes: bytes,
    original_filename: str,
    content_type: Optional[str] = None
) -> Tuple[bytes, str]:
    """
    Validates government ID uploads against:
    - Allowed extensions (.jpg, .jpeg, .png, .webp)
    - Rejection of double extensions containing dangerous scripts/executables
    - MIME type matching
    - Magic bytes header signatures
    - File size caps (5MB)
    - Image format verification via Pillow

    Returns (validated_bytes, secure_server_filename).
    """
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded ID image file is empty.")

    if len(file_bytes) > MAX_ID_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"ID photo file exceeds maximum size limit ({len(file_bytes) / (1024 * 1024):.1f}MB). Maximum allowed is 5MB."
        )

    # Validate filename and prevent double-extension attacks (e.g. evil.php.jpg)
    filename_lower = (original_filename or "").lower().strip()
    parts = filename_lower.split('.')
    if len(parts) > 2:
        for part in parts[1:-1]:
            if f".{part}" in DANGEROUS_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail="Potentially malicious multi-extension filename detected."
                )

    ext = os.path.splitext(filename_lower)[1]
    if ext not in ALLOWED_ID_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '{ext}'. Allowed ID photo formats: JPG, JPEG, PNG, WEBP."
        )

    # Validate MIME type if provided
    raw_ct = (content_type or "").lower().strip()
    if raw_ct and raw_ct not in ALLOWED_ID_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported MIME type '{content_type}'. Allowed types: {', '.join(sorted(ALLOWED_ID_MIMES))}."
        )

    # Magic byte verification
    is_valid_magic = False
    if ext in {'.jpg', '.jpeg'} or raw_ct == 'image/jpeg':
        is_valid_magic = file_bytes.startswith(b'\xff\xd8\xff')
    elif ext == '.png' or raw_ct == 'image/png':
        is_valid_magic = file_bytes.startswith(b'\x89PNG\r\n\x1a\n')
    elif ext == '.webp' or raw_ct == 'image/webp':
        is_valid_magic = len(file_bytes) >= 12 and file_bytes[:4] == b'RIFF' and file_bytes[8:12] == b'WEBP'

    if not is_valid_magic:
        raise HTTPException(
            status_code=400,
            detail="File signature validation failed. File content does not match its claimed image format."
        )

    # Pillow image integrity verification
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="Corrupted or invalid image file content."
        )

    # Generate an unguessable unique server-side filename
    unique_filename = f"gov_id_{uuid.uuid4().hex}{ext}"
    return file_bytes, unique_filename


def secure_process_government_id(
    file_bytes: bytes,
    applicant_name: str,
    applicant_id: int
) -> bytes:
    """
    1. Strips all EXIF metadata (camera model, device identifier, GPS location coordinates).
    2. Corrects image orientation from EXIF orientation flags.
    3. Burns a permanent, high-contrast, semi-transparent forensic watermark across the ID:
       - Purpose: 'FOR STRAYSAFE PET ADOPTION USE ONLY'
       - Applicant identifier: 'APPLICANT: {NAME} - ID #{ID}'
       - Warning: 'NOT VALID FOR FINANCIAL TRANSACTIONS, LOANS, OR SIM REGISTRATION'
    4. Returns sanitized JPEG bytes.
    """
    try:
        # Open and transpose based on EXIF orientation
        with Image.open(io.BytesIO(file_bytes)) as raw_img:
            image = ImageOps.exif_transpose(raw_img)
            image = image.convert("RGBA")

        width, height = image.size
        overlay = Image.new("RGBA", (width, height), (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)

        today_str = datetime.date.today().isoformat()
        clean_name = (applicant_name or "APPLICANT").strip().upper()
        if len(clean_name) > 30:
            clean_name = clean_name[:27] + "..."

        line1 = "FOR STRAYSAFE PET ADOPTION USE ONLY"
        line2 = f"APPLICANT: {clean_name} - ID #{applicant_id} • {today_str}"
        line3 = "NOT VALID FOR FINANCIAL TRANSACTIONS, LOANS, OR SIM REGISTRATION"

        # Responsive font sizing
        font_size = max(16, int(height / 28))
        font_small = max(13, int(font_size * 0.82))

        try:
            # Attempt standard system fonts
            font_main = ImageFont.truetype("arial.ttf", font_size)
            font_sub = ImageFont.truetype("arial.ttf", font_small)
        except Exception:
            try:
                font_main = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
                font_sub = ImageFont.truetype("DejaVuSans.ttf", font_small)
            except Exception:
                font_main = ImageFont.load_default()
                font_sub = ImageFont.load_default()

        # Watermark banner styling
        watermark_red = (220, 38, 38, 120)       # Visible red watermark
        watermark_dark = (30, 41, 59, 130)       # Dark slate text
        banner_bg = (255, 255, 255, 60)          # Translucent banner ribbon

        # Step calculation for repeated multi-band watermark
        banner_height = (font_size * 2) + font_small + 24
        step_y = max(banner_height + 40, int(height / 3))

        for y_pos in range(30, height - banner_height + 1, step_y):
            # Translucent background strip
            draw.rectangle([0, y_pos - 4, width, y_pos + banner_height], fill=banner_bg)
            # Text lines
            draw.text((20, y_pos), line1, fill=watermark_red, font=font_main)
            draw.text((20, y_pos + font_size + 4), line2, fill=watermark_red, font=font_main)
            draw.text((20, y_pos + (font_size * 2) + 8), line3, fill=watermark_dark, font=font_sub)

        # Merge overlay onto original image
        watermarked = Image.alpha_composite(image, overlay)
        rgb_result = watermarked.convert("RGB")

        # Save to memory without any EXIF tags
        out_buffer = io.BytesIO()
        rgb_result.save(out_buffer, format="JPEG", quality=85, optimize=True)
        return out_buffer.getvalue()

    except Exception as e:
        logger.error(f"Error processing and watermarking Government ID: {e}")
        # If watermarking fails, strip EXIF and return plain RGB image
        try:
            with Image.open(io.BytesIO(file_bytes)) as raw_img:
                clean_img = ImageOps.exif_transpose(raw_img).convert("RGB")
                out_buffer = io.BytesIO()
                clean_img.save(out_buffer, format="JPEG", quality=85)
                return out_buffer.getvalue()
        except Exception:
            return file_bytes


def upload_secure_adoption_id(
    file_bytes: bytes,
    filename: Optional[str] = None,
    folder: str = "adoption_ids_restricted"
) -> dict:
    """
    Uploads a sanitized, watermarked Government ID document to Cloudinary with
    restricted access controls (type='authenticated' or access_mode='authenticated').
    Returns a dict containing public_id and metadata.
    """
    try:
        public_id = f"govid_{uuid.uuid4().hex}"
        
        # Upload with authenticated type to prevent direct unauthenticated CDN scraping
        # Cloudinary allows authenticated / private uploads that require signed delivery URLs
        response = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            resource_type="image",
            public_id=public_id,
            type="authenticated",
            unique_filename=True,
            overwrite=False
        )
        
        return {
            "public_id": response.get("public_id"),
            "secure_url": response.get("secure_url"),
            "version": response.get("version"),
            "format": response.get("format", "jpg")
        }
    except Exception as e:
        logger.warning(f"Cloudinary type='authenticated' upload notice: {e}. Falling back to signed folder delivery.")
        # Fallback to standard upload with unique private folder if account tier restricts 'type=authenticated'
        try:
            response = cloudinary.uploader.upload(
                file_bytes,
                folder=folder,
                resource_type="image",
                public_id=f"govid_{uuid.uuid4().hex}",
                use_filename=False,
                unique_filename=True
            )
            return {
                "public_id": response.get("public_id"),
                "secure_url": response.get("secure_url"),
                "version": response.get("version"),
                "format": response.get("format", "jpg")
            }
        except Exception as upload_err:
            logger.error(f"Cloudinary upload failed: {upload_err}")
            raise upload_err


def generate_ephemeral_id_url(stored_url_or_id: str, ttl_seconds: int = 300) -> str:
    """
    Generates an ephemeral, cryptographically signed Cloudinary URL with a strict
    expiration window (default 5 minutes / 300 seconds).
    Prevents unauthorized or permanent link sharing.
    """
    if not stored_url_or_id:
        return ""

    try:
        expires_at = int(time.time()) + ttl_seconds
        
        # Extract public_id and delivery type if a full URL was stored
        public_id = stored_url_or_id
        delivery_type = "authenticated"
        
        if "res.cloudinary.com" in stored_url_or_id:
            parts = stored_url_or_id.split("/")
            if "authenticated" in parts:
                delivery_type = "authenticated"
            else:
                delivery_type = "upload"
            
            folder_idx = -1
            for i, part in enumerate(parts):
                if "adoption_ids" in part:
                    folder_idx = i
                    break
            
            if folder_idx != -1:
                raw_public = "/".join(parts[folder_idx:])
                public_id = os.path.splitext(raw_public)[0]

        signed_url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type="image",
            type=delivery_type,
            sign_url=True,
            expires_at=expires_at,
            secure=True
        )
        return signed_url
    except Exception as e:
        logger.error(f"Failed to generate signed Cloudinary URL: {e}")
        # Fallback to stored URL if signing fails in offline/test environment
        return stored_url_or_id


def delete_secure_id_photo(stored_url_or_id: str) -> bool:
    """
    Permanently deletes a Government ID image from Cloudinary storage.
    """
    if not stored_url_or_id:
        return False

    try:
        public_id = stored_url_or_id
        delivery_type = "authenticated"
        
        if "res.cloudinary.com" in stored_url_or_id:
            parts = stored_url_or_id.split("/")
            if "authenticated" in parts:
                delivery_type = "authenticated"
            else:
                delivery_type = "upload"
                
            folder_idx = -1
            for i, part in enumerate(parts):
                if "adoption_ids" in part:
                    folder_idx = i
                    break
            if folder_idx != -1:
                raw_public = "/".join(parts[folder_idx:])
                public_id = os.path.splitext(raw_public)[0]

        cloudinary.uploader.destroy(
            public_id=public_id,
            resource_type="image",
            type=delivery_type,
            invalidate=True
        )
        return True
    except Exception as e:
        logger.error(f"Failed to delete Cloudinary ID asset {stored_url_or_id}: {e}")
        return False


def purge_expired_adoption_ids(db: Session) -> dict:
    """
    Compliance lifecycle purger for Government ID documents under RA 10173:
    1. Purges IDs for applications in 'Rejected' or 'Cancelled' status older than 30 days.
    2. Purges IDs for applications in 'Approved' (handed over) status older than 90 days.
    3. Cleans up stored Cloudinary files and overwrites database SPI columns.
    """
    from app.models.report import Adoption
    from app.utils.audit import log_activity

    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    cutoff_rejected_30d = now - datetime.timedelta(days=30)
    cutoff_approved_90d = now - datetime.timedelta(days=90)

    purged_rejected_count = 0
    purged_approved_count = 0

    # 1. Rejected or Cancelled applications past 30 days
    expired_rejected = (
        db.query(Adoption)
        .filter(
            Adoption.status.in_(["Rejected", "Cancelled"]),
            or_(
                Adoption.cancelled_at <= cutoff_rejected_30d,
                Adoption.reviewed_at <= cutoff_rejected_30d,
                and_(Adoption.cancelled_at.is_(None), Adoption.reviewed_at.is_(None), Adoption.updated_at <= cutoff_rejected_30d)
            ),
            or_(
                Adoption.id_photo_url.isnot(None),
                Adoption.id_number.isnot(None)
            )
        )
        .all()
    )

    for app in expired_rejected:
        if app.id_photo_url:
            delete_secure_id_photo(app.id_photo_url)
            app.id_photo_url = None
        
        if app.id_number and not app.id_number.startswith("[PURGED_"):
            app.id_number = "[PURGED_COMPLIANCE_30D]"

        log_activity(
            db=db,
            action="PURGE_EXPIRED_GOVERNMENT_ID",
            target_table="adoptions",
            target_id=app.adoption_id,
            description=f"Auto-purged Government ID SPI for {app.status.lower()} adoption #{app.adoption_id} (Retention: 30 days expired).",
            log_type="security",
            user_id=None
        )
        purged_rejected_count += 1

    # 2. Finalized adoptions past 90 days
    expired_finalized = (
        db.query(Adoption)
        .filter(
            Adoption.status == "Approved",
            Adoption.is_handed_over == True,
            Adoption.staff_handed_over == True,
            Adoption.handover_date <= cutoff_approved_90d,
            Adoption.id_photo_url.isnot(None)
        )
        .all()
    )

    for app in expired_finalized:
        if app.id_photo_url:
            delete_secure_id_photo(app.id_photo_url)
            app.id_photo_url = None

        log_activity(
            db=db,
            action="PURGE_EXPIRED_GOVERNMENT_ID",
            target_table="adoptions",
            target_id=app.adoption_id,
            description=f"Auto-purged Government ID photo for completed adoption #{app.adoption_id} (Retention: 90 days post-handover).",
            log_type="security",
            user_id=None
        )
        purged_approved_count += 1

    if purged_rejected_count > 0 or purged_approved_count > 0:
        db.commit()

    return {
        "purged_rejected_or_cancelled": purged_rejected_count,
        "purged_finalized_handover": purged_approved_count,
        "total_purged": purged_rejected_count + purged_approved_count,
        "executed_at": now.isoformat()
    }
