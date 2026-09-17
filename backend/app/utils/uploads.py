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

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'}
VIDEO_EXTS = {'.mp4', '.mov', '.avi', '.webm', '.mkv'}
DOCUMENT_EXTS = {'.pdf', '.doc', '.docx'}

# Max size per media category, in bytes.
MAX_SIZES = {
    'Image': 10 * 1024 * 1024,
    'Video': 50 * 1024 * 1024,
    'Document': 15 * 1024 * 1024,
}

ALL_MEDIA_TYPES: Set[str] = {'Image', 'Video', 'Document'}


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
        detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: images, videos, PDF/DOC/DOCX."
    )


async def read_and_validate_upload(
    file: UploadFile,
    allowed: Optional[Set[str]] = None
) -> Tuple[bytes, str, str, str]:
    """
    Reads and validates an UploadFile against the shared extension/size rules.

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

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    max_size = MAX_SIZES[media_type]
    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / (1024 * 1024):.1f}MB). "
                   f"Maximum for {media_type.lower()} files is {max_size // (1024 * 1024)}MB."
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
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
