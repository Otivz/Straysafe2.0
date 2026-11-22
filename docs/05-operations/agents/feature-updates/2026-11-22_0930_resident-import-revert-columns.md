# Revert resident import columns to the five-column template

- **Date:** 2026-11-22 09:30 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `backend/app/services/resident_registry.py`, `backend/tests/test_resident_registry.py`, `frontend/src/admin/pages/ResidentRecordsPage.tsx`, `docs/01-system/RESIDENT_RECORD_REGISTRATION.md`
- **Authorization:** Developer request in session to revert the barangay 22-column layout (record 2026-11-22_0915) and use the original columns from their specification.
- **Type:** Fix

## Intent

Return the import to Full Name, Email Address, Block Number, Lot Number (required) and Contact Number (optional).

## Key changes

- Template, header aliases, required fields, validation messages and the upload hint are back to the five-column form.
- First/Middle/Last Name columns are no longer read; Contact Number is optional again.
- Supersedes record `2026-11-22_0915_resident-import-barangay-columns.md` (kept, as records are permanent).

## Validation evidence

- `python tests/test_resident_registry.py`: run after the revert (see session result).
