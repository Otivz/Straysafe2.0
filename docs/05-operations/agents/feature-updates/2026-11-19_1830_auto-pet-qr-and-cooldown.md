# Automatic Unique Pet QR Code Generation and 1-Hour Scan Cooldown

- **Date:** 2026-11-19 18:30 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/models/pet_tag.py`, `backend/app/schemas/pet_tag.py`, `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/routes/pets.py`, `backend/app/main.py`, `database/migrations/2026-11-20_pet_tags_last_scanned_at.sql`, `frontend/src/live/http.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/pages/tag/TagScanPage.tsx`, `docs/README.md`
- **Authorization:** User feature request ("Automatic Unique Pet QR Code Generation and Scan Cooldown")
- **Type:** Feature

## Intent

Automatically generate a unique, unpredictable QR code tag for every newly registered owned pet and enforce a backend-authoritative, per-QR-code 1-hour scan cooldown with row-level locking and clear frontend countdown feedback.

## Key changes

- **Database & Schema (`backend/app/models/pet_tag.py`, `backend/app/main.py`, `database/migrations/2026-11-20_pet_tags_last_scanned_at.sql`)**:
  - Added `last_scanned_at` (`DATETIME NULL`) to `PetTag` (`pet_tags`) and idempotent startup column check in `ensure_pet_tag_tables()`.
- **Automatic QR Generation (`backend/app/services/pet_tags.py`, `backend/app/routes/pets.py`)**:
  - Added `ensure_active_tag(db, pet, actor_id)` using `secrets.token_urlsafe(16)` and row locking (`with_for_update()`).
  - Invoked `ensure_active_tag` automatically during `create_pet` (`POST /pets/`) and logged `PET_TAG_CREATED`.
- **1-Hour Cooldown Enforcement (`backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/schemas/pet_tag.py`)**:
  - Centralized `SCAN_COOLDOWN_MINUTES = 60` (configurable via `PET_TAG_SCAN_COOLDOWN_MINUTES`).
  - Updated `record_view` to lock the `PetTag` row (`with_for_update()`), check `last_scanned_at` against server UTC time, return HTTP `429` (`QR_SCAN_COOLDOWN`) with `remaining_seconds`, `remaining_minutes`, and `retry_after_at` without resetting `last_scanned_at` on blocked attempts, and record `PetTagScan(kind="view")` only on successful scans.
  - Added `last_scanned_at`, `cooldown_minutes`, and `cooldown_remaining_seconds` to `PetTagResponse`.
- **Frontend Integration (`frontend/src/live/http.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/pages/tag/TagScanPage.tsx`)**:
  - Preserved structured `429` `ApiDetailError` payloads in `toApiError`.
  - Displayed the pet's generated QR image and `Download QR code` button directly in `PetTagSection` on the pet profile.
  - Updated `TagScanPage` to show the exact cooldown message (`"QR Code Already Scanned. Please try again after the 1-hour cooldown period."`), a live remaining countdown timer, and a `Scan QR code again` action when the timer reaches zero.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile ...`: verified.
- Automated Python test suite covering all 11 scenarios (auto-generation, unique tokens, first scan, immediate block, Pet B isolation, 30-minute block, 60-minute allow, cross-session persistence, invalid token 404, and 5-thread concurrent scan locking): verified.
