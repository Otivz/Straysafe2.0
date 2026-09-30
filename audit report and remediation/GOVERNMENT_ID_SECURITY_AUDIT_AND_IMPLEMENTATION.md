# StraySafe 2.0 - Government ID Security Audit & Implementation Roadmap

**Date:** September 30, 2026  
**Module:** Adoption Application System (`AdoptionApplyForm.tsx`, `adoptions.py`, `BrgyAdoptions.tsx`, `MyAdoptionApplications.tsx`)  
**Scope:** Government Identification Verification, Storage Security, PII Protection, Data Privacy Act of 2012 (RA 10173) Compliance, RBAC, Forensic Watermarking, Field-Level Encryption, and Retention Lifecycles  
**Target Output File:** `audit report and remediation/GOVERNMENT_ID_SECURITY_AUDIT_AND_IMPLEMENTATION.md`  

---

## 1. Executive Summary & Legal Context

Pet adoption systems require identity verification to prevent animal cruelty, abandonments, pet flipping, and false claims. To satisfy Barangay Animal Welfare Regulations, StraySafe 2.0 requires adopters to provide a government-issued ID (e.g., PhilSys National ID, LTO Driver's License, DFA Passport, UMID, PRC ID).

However, government-issued IDs are classified as **Sensitive Personal Information (SPI)** under the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)** and National Privacy Commission (NPC) circulars. Handling unencrypted, unwatermarked, publicly accessible scans of citizen identity documents creates severe organizational liability:
- **Identity Theft & Loan Fraud:** High-resolution scans of Philippine National IDs or Driver's Licenses can be weaponized for fraudulent online loans, e-wallet registrations, and SIM card registrations.
- **Unauthorized Scraping / CDN Snooping:** Plaintext cloud storage URLs without authentication gates allow anyone who discovers or intercepts an image link to inspect citizen IDs indefinitely.
- **Regulatory Penalties:** Under Section 25 & 31 of RA 10173, unauthorized processing and improper disposal of sensitive personal information carry fines up to ₱5,000,000 and imprisonment for responsible officers.

This document provides a **comprehensive technical audit** of the current Government ID implementation and an **actionable, phased implementation task list** to transform StraySafe's ID subsystem into an enterprise-grade, secure, and compliant verification pipeline.

---

## 2. Current State Technical Audit

### 2.1 Component Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CURRENT DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

 [Citizen Browser] 
        │ 
        │ 1. Selects image (no format check, no EXIF scrub, no watermark)
        ▼
 POST /adoptions/upload-id (FastAPI)
        │
        │ 2. Reads raw bytes via read_and_validate_upload()
        ▼
 Cloudinary Storage (folder="adoption_ids")
        │
        │ 3. Stores file with type="upload" (PUBLIC CDN URL)
        ▼
 Public Cloudinary CDN Link: https://res.cloudinary.com/.../adoption_ids/xyz.jpg
        │
        │ 4. Citizen submits adoption application with:
        │    - id_type (cleartext)
        │    - id_number (cleartext in MySQL `adoptions` table)
        │    - id_photo_url (public CDN link)
        ▼
 [Database: MySQL `adoptions` table] 
        │
        │ 5. Staff fetches applications: GET /adoptions/applications
        ▼
 [Barangay Staff Dashboard: BrgyAdoptions.tsx]
        - Renders unmasked id_number in tables
        - Renders raw high-res unwatermarked ID photo in modal
        - NO audit log created when staff views the ID
```

---

### 2.2 Vulnerability Matrix

| ID | Vulnerability | Severity | Impact | File Location |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | **Public CDN ID Hosting (No URL Tokenization)** | **CRITICAL (CVSS 8.5)** | Any user with the Cloudinary URL can view the raw government ID. Links are permanent, indexable, and unauthenticated. | `backend/app/routes/adoptions.py:758` |
| **VULN-02** | **No Forensic Watermarking** | **HIGH (CVSS 8.1)** | Scanned IDs are uploaded in pristine form. If downloaded by bad actors or rogue staff, they can be reused for SIM registration or financial fraud. | `backend/app/routes/adoptions.py:747-763` |
| **VULN-03** | **Cleartext ID Number in Database** | **HIGH (CVSS 7.8)** | `id_number` is stored as plaintext `VARCHAR(100)`. A SQL injection or database backup leak exposes citizen national identity numbers. | `backend/app/models/report.py` (`Adoption.id_number`) |
| **VULN-04** | **Unmasked ID Exposure in API Responses** | **MEDIUM (CVSS 6.8)** | Full ID numbers are returned across list responses (`/adoptions/applications`), exposing PII to any staff viewing the table without need-to-know. | `backend/app/schemas/adoption.py:138` |
| **VULN-05** | **Zero Access Audit Logging on ID Views** | **MEDIUM (CVSS 6.5)** | When staff clicks "View ID Photo", no audit event is recorded. There is no forensic trace if an officer snoops on citizens' IDs. | `frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx` |
| **VULN-06** | **Absence of EXIF / Geolocation Scrubbing** | **LOW-MEDIUM (CVSS 5.3)** | Photos taken directly on smartphones contain EXIF tags (exact GPS coordinates of the applicant's home, phone hardware ID). | `backend/app/routes/adoptions.py:753` |
| **VULN-07** | **No ID Document Retention / Purge Lifecycle** | **HIGH (CVSS 7.3)** | IDs for rejected, cancelled, or old completed adoptions remain in Cloudinary and MySQL indefinitely, violating RA 10173 data minimization. | System-wide (No purge cron) |
| **VULN-08** | **Orphaned Upload Vulnerability** | **LOW (CVSS 4.1)** | If a user uploads an ID on the form but leaves without submitting, the ID remains stored in Cloudinary permanently without an owner. | `backend/app/routes/adoptions.py:747` |
| **VULN-09** | **Missing Explicit DPA Consent Agreement** | **MEDIUM (CVSS 6.0)** | The form does not contain an explicit statutory consent checkbox acknowledging the collection, purpose, and retention of SPI under RA 10173. | `frontend/src/pages/citizen/AdoptionApplyForm.tsx` |

---

## 3. Target Security Architecture

To remediate all identified vulnerabilities, the ID verification pipeline must implement **Defense in Depth**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            HARDENED ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

 [Applicant (Citizen)]
        │ 
        │ 1. Agrees to DPA Statutory Notice (RA 10173)
        │ 2. Selects ID Type + Formats ID Number with Regex Guard
        ▼
 [FastAPI Backend Ingestion Pipeline]
        │
        │ 3. Magic-byte verification (strictly image/jpeg, image/png, image/webp)
        │ 4. Strip EXIF metadata & GPS tags using Pillow
        │ 5. Permanently BURN FORENSIC WATERMARK into image pixels:
        │    "FOR STRAYSAFE PET ADOPTION VERIFICATION ONLY"
        │    "NOT VALID FOR FINANCIAL TRANSACTIONS OR LOANS"
        │    "DATE: 2026-09-30 • APPLICANT ID: 48"
        │ 6. Upload to Cloudinary with `type='authenticated'` or `type='private'`
        ▼
 [Database Storage]
        │
        │ 7. Encrypt `id_number` at rest using Fernet (AES-256)
        │ 8. Store masked string for display (e.g. `****-****-9012`)
        ▼
 [Staff Viewing Interface (BrgyAdoptions)]
        │
        │ 9. Table displays only masked ID (`****-****-9012`)
        │ 10. Staff clicks "Inspect ID Document"
        │ 11. Backend validates Role (3/4) & Subdivision Jurisdiction
        │ 12. Backend generates EPHEMERAL SIGNED URL (TTL = 5 minutes)
        │ 13. System logs immutable AUDIT RECORD in `audit_logs`:
        │     - Action: `VIEW_GOVERNMENT_ID`
        │     - Officer User ID, IP Address, Timestamp, Applicant ID
        ▼
 [Automated Document Lifecycle (Scheduled Task)]
        │
        │ 14. Purge rejected/cancelled IDs after 30 days
        │ 15. Purge verified IDs 90 days post pet handover
        │ 16. Purge unattached orphaned uploads after 24 hours
```

---

## 4. Implementation Task Breakdown

### Phase 1: Ingestion Hardening, Watermarking & Privacy Consent (Immediate)

#### Task 1.1: Explicit Data Privacy Act (RA 10173) Consent in Frontend
- **Target File:** `frontend/src/pages/citizen/AdoptionApplyForm.tsx`
- **Changes:**
  - Add statutory DPA disclosure panel above the ID upload section.
  - Require an interactive checkbox:
    - *"I understand and consent to the collection and temporary processing of my government-issued ID strictly for pet ownership identity verification in accordance with the Philippine Data Privacy Act of 2012 (RA 10173). I understand that my ID will be forensically watermarked and purged following verification."*
  - Form submission must be disabled until this consent checkbox is checked.

#### Task 1.2: Client-Side ID Number Formatting & Validation
- **Target File:** `frontend/src/pages/citizen/AdoptionApplyForm.tsx`
- **Changes:**
  - Enforce regex patterns matching the selected `idType`:
    - **PhilSys National ID:** `^\d{4}-\d{4}-\d{4}-\d{4}$` (16 digits with hyphens)
    - **Driver's License:** `^[A-Z]\d{2}-\d{2}-\d{6}$`
    - **Philippine Passport:** `^[A-Z]\d{7}[A-Z]$|^[A-Z]\d{8}$`
    - **UMID:** `^\d{4}-\d{7}-\d{1}$`
    - **SSS / GSIS:** `^\d{2}-\d{7}-\d{1}$`
  - Provide visual format hint helpers underneath the input field.

#### Task 1.3: Server-Side EXIF Scrubbing & Permanent Forensic Watermarking
- **Target File:** `backend/app/utils/id_security.py` (New Utility) & `backend/app/routes/adoptions.py`
- **Technology:** Python `Pillow` (PIL)
- **Specification:**
  - Strip all EXIF header data (removes camera metadata, device identifiers, and exact GPS home coordinates).
  - Burn a high-contrast, semi-transparent diagonal forensic watermark across the center and borders of the ID image:
    ```
    ========================================================================
     FOR STRAYSAFE ADOPTION VERIFICATION ONLY • NOT VALID FOR LOANS/FINANCE 
     USER ID: {user_id} • APPLICANT: {full_name} • DATE: {YYYY-MM-DD}      
    ========================================================================
    ```
  - This ensures that even if an image file is downloaded or screenshotted, it cannot be weaponized or accepted by KYC platforms, lending apps, or telecom providers.

---

### Phase 2: Storage Tokenization, URL Signing & Access Control

#### Task 2.1: Private/Authenticated Cloudinary Storage
- **Target File:** `backend/app/utils/cloudinary_config.py` & `backend/app/routes/adoptions.py`
- **Changes:**
  - Update `upload_adoption_id` to store adoption IDs in a restricted folder (`adoption_ids_restricted`) with `type="authenticated"` or `access_mode="authenticated"`.
  - Disallow direct public CDN delivery of raw ID images.

#### Task 2.2: Ephemeral Signed URL Endpoint (`GET /adoptions/{id}/id-document`)
- **Target File:** `backend/app/routes/adoptions.py`
- **Changes:**
  - Create a dedicated secure endpoint to fetch an ID viewing link:
    - `GET /adoptions/{adoption_id}/secure-id-view`
  - **Access Gate:**
    - Applicant themselves (`current_user.user_id == adoption.applicant_id`), OR
    - Barangay Staff (Role 3) matching the adoption's jurisdiction, OR
    - System Admin (Role 4).
  - **URL Tokenization:**
    - Generates a Cloudinary signed URL with a **5-minute expiration time** (`cloudinary.utils.cloudinary_url(..., sign_url=True, expires_at=int(time.time() + 300))`), OR
    - Streams the image via backend proxy response with `Cache-Control: no-store, private`.

#### Task 2.3: Immutable Audit Trail for ID Views
- **Target File:** `backend/app/routes/adoptions.py`
- **Changes:**
  - In `secure-id-view`, invoke `log_activity`:
    ```python
    log_activity(
        db=db,
        action="VIEW_GOVERNMENT_ID",
        target_table="adoptions",
        target_id=adoption.adoption_id,
        description=f"Staff '{current_user.name}' (ID #{current_user.user_id}) viewed Government ID for applicant '{adoption.full_name}'",
        user_id=current_user.user_id,
        log_type="security",
        request=http_req
    )
    ```
  - Staff know their access is tracked, deterring unauthorized PII viewing.

---

### Phase 3: PII Masking, Field Encryption & Document Retention Lifecycle

#### Task 3.1: PII Masking in Schema Responses
- **Target File:** `backend/app/schemas/adoption.py` & `backend/app/routes/adoptions.py`
- **Changes:**
  - Add `masked_id_number` to `AdoptionResponse`:
    - Example: `1234-5678-9012` -> `****-****-9012`
    - Example: `N01-23-456789` -> `N01-**-***789`
  - In list queries (`GET /adoptions/applications` and `GET /adoptions/my-applications`), do not include raw `id_photo_url` or raw `id_number`. Return `has_id_uploaded: bool` and `masked_id_number: str`.
  - Raw unmasked details are only delivered via the explicit detail endpoint upon audited request.

#### Task 3.2: Field-Level Encryption at Rest for `id_number`
- **Target File:** `backend/app/models/report.py` & `backend/app/utils/crypto.py`
- **Changes:**
  - Use `cryptography.fernet.Fernet` with a master encryption key (`ID_ENCRYPTION_KEY` in `.env`).
  - Store `id_number_encrypted` (Varbinary or Base64 String) and `id_number_masked` (Varchar 50) in MySQL.
  - If database backups are ever intercepted, the plaintext citizen ID numbers remain cryptographically unreadable.

#### Task 3.3: Automated ID Retention & Purge Cron Task
- **Target File:** `backend/app/tasks/adoption_id_purger.py` (New Background Task)
- **Schedule:** Runs daily at midnight.
- **Rules:**
  1. **Rejected / Cancelled Applications:** When an application status is `Rejected` or `Cancelled` for over 30 days:
     - Delete the ID image from Cloudinary via `cloudinary.uploader.destroy()`.
     - Set `id_photo_url = NULL` and overwrite `id_number = '[PURGED_COMPLIANCE]'`.
     - Log activity: `PURGE_GOVERNMENT_ID_EXPIRED`.
  2. **Finalized / Handed Over Adoptions:** 90 days after successful pet handover (`staff_handed_over == True`):
     - Delete ID image from Cloudinary.
     - Set `id_photo_url = NULL`.
     - Retain only `is_identity_verified = True` flag for historical proof.
  3. **Orphaned Uploads:** IDs uploaded to Cloudinary older than 24 hours without a matching `adoption` record are deleted.

---

## 5. Technical Implementation Blueprints

### Blueprint A: Server-Side Forensic Watermark & EXIF Stripper (`backend/app/utils/id_security.py`)

```python
import io
import datetime
from PIL import Image, ImageDraw, ImageFont, ImageOps

def secure_process_government_id(
    file_bytes: bytes,
    applicant_name: str,
    applicant_id: int
) -> bytes:
    """
    1. Strips all EXIF metadata (GPS coords, device model).
    2. Corrects image orientation.
    3. Burns a permanent, unremovable forensic watermark across the ID.
    4. Returns sanitized JPEG bytes.
    """
    # Open image
    image = Image.open(io.BytesIO(file_bytes))
    
    # Strip EXIF metadata by creating a new image from RGB pixel data
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGBA")
    
    # Create transparent overlay for watermark
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    
    width, height = image.size
    today_str = datetime.date.today().isoformat()
    
    # Watermark text lines
    line1 = "FOR STRAYSAFE PET ADOPTION USE ONLY"
    line2 = f"APPLICANT: {applicant_name.upper()} (ID #{applicant_id}) - {today_str}"
    line3 = "NOT VALID FOR FINANCIAL TRANSACTIONS, LOANS, OR SIM REGISTRATION"
    
    # Font sizing relative to image height
    font_size = max(18, int(height / 28))
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()
        
    # Draw repeated diagonal watermarks
    # Using semi-transparent red/gray tint (RGBA with alpha 90)
    watermark_color = (220, 38, 38, 95) # Red tint with transparency
    
    # Calculate spacing
    step_y = max(120, int(height / 4))
    for y_pos in range(40, height, step_y):
        # Draw bounding banner background for high readability
        draw.rectangle([0, y_pos - 4, width, y_pos + (font_size * 3) + 12], fill=(255, 255, 255, 45))
        draw.text((20, y_pos), line1, fill=watermark_color, font=font)
        draw.text((20, y_pos + font_size + 4), line2, fill=watermark_color, font=font)
        draw.text((20, y_pos + (font_size * 2) + 8), line3, fill=(50, 50, 50, 110), font=font)
    
    # Merge overlay with original image
    watermarked = Image.alpha_composite(image, overlay)
    rgb_result = watermarked.convert("RGB")
    
    # Save to clean memory buffer (EXIF stripped)
    out_buffer = io.BytesIO()
    rgb_result.save(out_buffer, format="JPEG", quality=85, optimize=True)
    return out_buffer.getvalue()
```

---

### Blueprint B: PII ID Number Masking Utility (`backend/app/utils/id_security.py`)

```python
def mask_government_id_number(raw_id: str, id_type: str = "") -> str:
    """
    Masks sensitive characters in government IDs while preserving enough
    characters for visual confirmation by staff during handover.
    """
    if not raw_id:
        return ""
    clean = raw_id.strip()
    length = len(clean)
    
    if length <= 4:
        return "****"
        
    # Standard format: show first 2 and last 4 characters
    # e.g., 1234-5678-9012 -> 12**-****-9012
    # e.g., N01-23-456789  -> N0*-**-***789
    visible_prefix_len = 2 if length > 6 else 1
    visible_suffix_len = 4 if length > 8 else 2
    
    prefix = clean[:visible_prefix_len]
    suffix = clean[-visible_suffix_len:]
    masked_body = ""
    
    for char in clean[visible_prefix_len:-visible_suffix_len]:
        if char in "- /":
            masked_body += char
        else:
            masked_body += "*"
            
    return f"{prefix}{masked_body}{suffix}"
```

---

### Blueprint C: Audited Ephemeral ID Viewing Route (`backend/app/routes/adoptions.py`)

```python
import time
import cloudinary.utils
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.audit import log_activity

@router.get("/{adoption_id}/secure-id-view")
def get_secure_id_view_url(
    adoption_id: int,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generates a 5-minute ephemeral signed URL to view an applicant's ID.
    Enforces strict RBAC and records an immutable audit log entry.
    """
    app = db.query(Adoption).filter(Adoption.adoption_id == adoption_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Adoption application not found.")
        
    # Authorization Gate:
    # 1. Applicant themselves
    # 2. Admin (Role 4)
    # 3. Staff (Role 3) with matching Barangay
    is_applicant = (current_user.user_id == app.applicant_id)
    is_admin = (current_user.role_id == 4)
    is_staff = (current_user.role_id == 3 and _check_staff_jurisdiction(current_user, app, db))
    
    if not (is_applicant or is_admin or is_staff):
        raise HTTPException(status_code=403, detail="Unauthorized to inspect applicant identity documents.")
        
    if not app.id_photo_url:
        raise HTTPException(status_code=404, detail="No ID document was submitted for this application.")
        
    # Generate 5-minute signed URL
    # Extracts public_id from Cloudinary URL and generates timed token
    expires_at = int(time.time()) + 300  # 5 minutes
    signed_url = generate_temporary_signed_id_url(app.id_photo_url, ttl_seconds=300)
    
    # Audit log (only log staff/admin accesses to protect applicant privacy from self-noise)
    if not is_applicant:
        log_activity(
            db=db,
            action="VIEW_GOVERNMENT_ID",
            target_table="adoptions",
            target_id=app.adoption_id,
            description=(
                f"Officer '{current_user.name}' ({current_user.email}) accessed "
                f"Government ID ({app.id_type}) for applicant '{app.full_name}'"
            ),
            user_id=current_user.user_id,
            log_type="security",
            request=http_req
        )
        
    return {
        "temporary_url": signed_url,
        "expires_in_seconds": 300,
        "masked_id": mask_government_id_number(app.id_number, app.id_type)
    }
```

---

### Blueprint D: DPA Consent Modal & Warning in React (`AdoptionApplyForm.tsx`)

```tsx
{/* Data Privacy Act Statutory Notice */}
<div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-3">
    <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                Philippine Data Privacy Act (RA 10173) Notice
            </h4>
            <p className="text-xs text-blue-800/90 dark:text-blue-300 leading-relaxed">
                Your government ID is collected solely for verification of pet ownership and anti-cruelty compliance under local Barangay Animal Welfare ordinances. 
                All uploaded IDs are automatically <strong>forensically watermarked</strong> and encrypted. They will not be shared with third parties and will be 
                securely purged following verification in accordance with our data retention schedule.
            </p>
        </div>
    </div>

    <label className="flex items-start gap-2.5 pt-2 border-t border-blue-100 dark:border-blue-900/40 cursor-pointer">
        <input
            type="checkbox"
            required
            checked={dpaConsentChecked}
            onChange={(e) => setDpaConsentChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-700"
        />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            I consent to the collection and verified processing of my valid government ID for pet adoption identification purposes. <span className="text-red-500">*</span>
        </span>
    </label>
</div>
```

---

## 6. Verification & Security Testing Checklist

Before deploying the hardened ID features to production, complete the following verification steps:

- [ ] **EXIF Stripping Test:** Upload an iPhone/Android photo taken with GPS location enabled. Inspect the resulting image in Cloudinary and verify all geolocation/camera metadata is stripped.
- [ ] **Watermark Permanence Test:** Attempt to crop, contrast-adjust, or run OCR on the watermarked ID. Verify the banner `"FOR STRAYSAFE PET ADOPTION USE ONLY"` is clearly readable and obstructs unapproved reuse.
- [ ] **Direct URL Access Test:** Attempt to access an old unauthenticated Cloudinary URL from an incognito window. Verify authenticated storage rules reject unauthorized traffic.
- [ ] **Audit Log Verification:** Open an applicant ID from the Barangay Staff dashboard. Query `SELECT * FROM audit_logs WHERE action = 'VIEW_GOVERNMENT_ID'` and verify actor ID, IP address, and timestamp are correctly populated.
- [ ] **Retention Purge Test:** Trigger the purge cron job on a test database with applications marked `Rejected` older than 30 days. Confirm the Cloudinary file is destroyed and the database column is cleared.
- [ ] **Client-Side Format Validation:** Test invalid inputs for PhilSys (e.g., alphanumeric strings) and Driver's License; ensure the form blocks submission with descriptive format feedback.

---

## 7. Recommended Implementation Order

| Priority | Task ID | Description | Estimated Effort |
| :--- | :--- | :--- | :--- |
| **P0 (Immediate)** | Task 1.3 | Server-Side Pillow Forensic Watermarking & EXIF Stripping on `/upload-id` | 0.5 Day |
| **P0 (Immediate)** | Task 1.1 | DPA Statutory Notice & Mandatory Consent Checkbox on Frontend Form | 0.25 Day |
| **P1 (High)** | Task 2.3 | `VIEW_GOVERNMENT_ID` Audit Logging on Staff ID Review Modals | 0.5 Day |
| **P1 (High)** | Task 3.1 | PII ID Number Masking (`mask_government_id_number`) across all APIs | 0.5 Day |
| **P2 (Medium)** | Task 2.2 | Ephemeral 5-minute Signed URLs for ID Image Retrieval | 1.0 Day |
| **P2 (Medium)** | Task 3.3 | Automated 30-Day/90-Day Retention & Destruction Cron Task | 1.0 Day |
| **P3 (Follow-up)** | Task 3.2 | Database Field-Level Encryption at Rest (Fernet AES-256) | 1.0 Day |

---

*Report prepared for StraySafe 2.0 Security & Compliance Team.*
