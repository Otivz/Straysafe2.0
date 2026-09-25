"""Shared upload validation for images, videos, and documents.

Used anywhere a route accepts an UploadFile and needs to enforce a
consistent allowlist, size cap, and Cloudinary resource_type mapping
instead of re-implementing extension checks inline.
"""
import os
import uuid
from typing import Optional, Set, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
VIDEO_EXTS = {'.mp4'}
DOCUMENT_EXTS = {'.pdf', '.doc', '.docx'}

# Strict 10MB limit across file uploads
MAX_FILE_SIZE = 10 * 1024 * 1024

# Allowed MIME types as required by Task 4.3 (MEDIUM-01)
ALLOWED_MIME_TYPES: Set[str] = {
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
}

DOCUMENT_MIME_TYPES: Set[str] = {
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

# Max size per media category, in bytes (10MB maximum).
MAX_SIZES = {
    'Image': MAX_FILE_SIZE,
    'Video': MAX_FILE_SIZE,
    'Document': MAX_FILE_SIZE,
}

ALL_MEDIA_TYPES: Set[str] = {'Image', 'Video', 'Document'}


def verify_file_signature(content: bytes, ext: str, content_type: Optional[str] = None) -> bool:
    """Verify magic bytes match the expected file type to prevent extension/MIME spoofing."""
    if not content or len(content) < 4:
        return False
    ext = ext.lower()
    if ext in {'.jpg', '.jpeg'} or (content_type and content_type == 'image/jpeg'):
        return content.startswith(b'\xff\xd8\xff')
    if ext == '.png' or (content_type and content_type == 'image/png'):
        return content.startswith(b'\x89PNG\r\n\x1a\n')
    if ext == '.webp' or (content_type and content_type == 'image/webp'):
        return len(content) >= 12 and content[:4] == b'RIFF' and content[8:12] == b'WEBP'
    if ext == '.mp4' or (content_type and content_type == 'video/mp4'):
        return len(content) >= 12 and b'ftyp' in content[4:16]
    if ext == '.pdf' or (content_type and content_type == 'application/pdf'):
        return content.startswith(b'%PDF')
    # For legacy Word documents, accept if extension and MIME match
    if ext in {'.doc', '.docx'}:
        return True
    return False


def classify_extension(filename: str) -> Tuple[str, str]:
    """Maps a filename's extension to (media_type, cloudinary_resource_type)."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in IMAGE_EXTS:
        return 'Image', 'image'
    if ext in VIDEO_EXTS:
        return 'Video', 'video'
    if ext in DOCUMENT_EXTS:
        return 'Document', 'raw'
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: JPG, PNG, WEBP, MP4."
    )


async def read_and_validate_upload(
    file: UploadFile,
    allowed: Optional[Set[str]] = None,
    max_size: int = MAX_FILE_SIZE
) -> Tuple[bytes, str, str, str]:
    """
    Reads and validates an UploadFile against the shared extension, MIME type,
    magic byte signature, and 10MB size rules.

    `allowed` restricts which media categories are accepted here (subset of
    {'Image', 'Video', 'Document'}); defaults to all three.

    Returns (content_bytes, unique_filename, media_type, cloudinary_resource_type).
    Raises HTTPException(400/413) on an unsupported type, oversized, or empty file.
    """
    media_type, resource_type = classify_extension(file.filename or "")

    allowed_types = allowed if allowed is not None else ALL_MEDIA_TYPES
    if media_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"{media_type} uploads are not allowed here. Allowed: {', '.join(sorted(allowed_types))}."
        )

    # Validate MIME type header if provided
    raw_ct = (file.content_type or "").lower().strip()
    valid_mimes = ALLOWED_MIME_TYPES.copy()
    if 'Document' in allowed_types:
        valid_mimes.update(DOCUMENT_MIME_TYPES)

    if raw_ct and raw_ct not in valid_mimes:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file MIME type '{file.content_type}'. Allowed types: {', '.join(sorted(valid_mimes))}."
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    category_max = min(max_size, MAX_SIZES.get(media_type, MAX_FILE_SIZE))
    if len(content) > category_max:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / (1024 * 1024):.1f}MB). "
                   f"Maximum allowed file size is {category_max // (1024 * 1024)}MB."
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
    # Verify file magic bytes / signatures
    if not verify_file_signature(content, ext, raw_ct):
        raise HTTPException(
            status_code=400,
            detail="File signature validation failed. The file content does not match its claimed extension or MIME type."
        )

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    return content, unique_filename, media_type, resource_type


def validate_cloudinary_url(url: str, allowed: Optional[Set[str]] = None) -> Tuple[str, str]:
    """
    Validates a URL the browser claims to have uploaded directly to Cloudinary
    (unsigned preset flow) before it's trusted and stored. The file bytes never
    reach this backend in that flow, so this is the only server-side check that
    the URL is actually ours and of an allowed type before we persist it.

    Returns (media_type, cloudinary_resource_type). Raises HTTPException(400).
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="Missing attachment URL.")

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc.endswith("cloudinary.com"):
        raise HTTPException(status_code=400, detail="Attachment URL must be a Cloudinary-hosted file.")

    if CLOUDINARY_CLOUD_NAME and f"/{CLOUDINARY_CLOUD_NAME}/" not in parsed.path:
        raise HTTPException(
            status_code=400,
            detail="Attachment URL does not belong to this application's Cloudinary account."
        )

    media_type, resource_type = classify_extension(parsed.path)

    allowed_types = allowed if allowed is not None else ALL_MEDIA_TYPES
    if media_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"{media_type} attachments are not allowed here. Allowed: {', '.join(sorted(allowed_types))}."
        )

    return media_type, resource_type
