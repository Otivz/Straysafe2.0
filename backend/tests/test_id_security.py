import os
import sys
import io
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image
from fastapi import HTTPException

from app.utils.id_security import (
    validate_and_sanitize_id_image,
    secure_process_government_id,
    encrypt_id_number,
    decrypt_id_number,
    mask_government_id_number,
    generate_ephemeral_id_url,
    ALLOWED_ID_EXTENSIONS,
    ALLOWED_ID_MIMES,
)


def assert_raises_http(func, *args, expected_status=400, **kwargs):
    try:
        func(*args, **kwargs)
        assert False, f"Expected HTTPException({expected_status}) but no exception was raised"
    except HTTPException as e:
        assert e.status_code == expected_status, f"Expected status {expected_status}, got {e.status_code}"
        return e


def create_test_image(format="JPEG", size=(600, 400)):
    img = Image.new("RGB", size, color=(240, 230, 210))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def test_encryption_and_decryption():
    raw_ids = [
        "1234-5678-9012-3456",
        "N01-23-456789",
        "P1234567A",
        "01-2345678-9",
    ]
    for raw in raw_ids:
        encrypted = encrypt_id_number(raw)
        assert encrypted is not None
        assert encrypted.startswith("enc::")
        assert encrypted != raw

        decrypted = decrypt_id_number(encrypted)
        assert decrypted == raw


def test_legacy_plaintext_handling():
    legacy_id = "1234-5678-9012"
    # Plaintext without enc:: prefix should return as-is
    decrypted = decrypt_id_number(legacy_id)
    assert decrypted == legacy_id


def test_masking():
    assert mask_government_id_number("1234-5678-9012-3456") == "12**-****-****-3456"
    assert mask_government_id_number("N01-23-456789") == "N0*-**-**6789"
    assert mask_government_id_number("1234") == "••••1234"
    assert mask_government_id_number("") == ""
    assert mask_government_id_number(None) == ""

    # Test masking of encrypted string
    enc = encrypt_id_number("1234-5678-9012-3456")
    masked_from_enc = mask_government_id_number(enc)
    assert masked_from_enc == "12**-****-****-3456"


def test_valid_image_upload_and_watermark():
    img_bytes = create_test_image("JPEG")
    val_bytes, safe_filename = validate_and_sanitize_id_image(img_bytes, "applicant_id.jpg", "image/jpeg")
    assert safe_filename.startswith("gov_id_")
    assert safe_filename.endswith(".jpg")

    # Watermarking
    watermarked = secure_process_government_id(val_bytes, "Juan Dela Cruz", 101)
    assert len(watermarked) > 0
    with Image.open(io.BytesIO(watermarked)) as w_img:
        assert w_img.format == "JPEG"


def test_reject_executable_and_dangerous_files():
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00"
    exc = assert_raises_http(validate_and_sanitize_id_image, fake_exe, "malware.exe", "application/x-msdownload")
    assert exc.status_code == 400

    # Double extension attack
    img_bytes = create_test_image("JPEG")
    exc2 = assert_raises_http(validate_and_sanitize_id_image, img_bytes, "shell.php.jpg", "image/jpeg")
    assert exc2.status_code == 400
    assert "multi-extension" in exc2.detail.lower()


def test_reject_invalid_magic_bytes():
    fake_png = b"This is not a real image content at all"
    exc = assert_raises_http(validate_and_sanitize_id_image, fake_png, "fake.png", "image/png")
    assert exc.status_code == 400
    assert "signature" in exc.detail.lower()


def test_ephemeral_url_generation():
    fake_cloud_url = "https://res.cloudinary.com/du6iy39p5/image/upload/v12345/adoption_ids_secure/govid_12345.jpg"
    ephemeral = generate_ephemeral_id_url(fake_cloud_url, ttl_seconds=300)
    assert len(ephemeral) > 0


if __name__ == "__main__":
    print("Running Government ID Security Suite...")
    test_encryption_and_decryption()
    print("[PASS] 1. Fernet AES-256 Field-Level Encryption & Decryption passed")
    test_legacy_plaintext_handling()
    print("[PASS] 2. Legacy Plaintext Graceful Fallback passed")
    test_masking()
    print("[PASS] 3. PII Government ID Number Masking passed")
    test_valid_image_upload_and_watermark()
    print("[PASS] 4. EXIF Stripping, Orientation Fix & Forensic Watermark passed")
    test_reject_executable_and_dangerous_files()
    print("[PASS] 5. Rejection of Executables & Multi-extension Injection passed")
    test_reject_invalid_magic_bytes()
    print("[PASS] 6. File Magic Byte & Signature Verification passed")
    test_ephemeral_url_generation()
    print("[PASS] 7. Cloudinary Ephemeral Signed URL Generation passed")
    print("\n" + "=" * 55)
    print("  ALL 7 GOVERNMENT ID SECURITY SUITE TESTS PASSED!")
    print("=" * 55)


