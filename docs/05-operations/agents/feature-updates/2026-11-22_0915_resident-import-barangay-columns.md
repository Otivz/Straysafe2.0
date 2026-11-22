# Resident list import uses the barangay column layout

- **Date:** 2026-11-22 09:15 (UTC)
- **AI tool:** Claude Code (Sonnet 5.5)
- **Files changed:** `backend/app/services/resident_registry.py`, `backend/tests/test_resident_registry.py`, `frontend/src/admin/pages/ResidentRecordsPage.tsx`, `docs/01-system/RESIDENT_RECORD_REGISTRATION.md`
- **Authorization:** Developer request in session to change the required columns of the resident Excel upload to the barangay's 22-column format, keeping only name, address, e-mail and contact number as required.
- **Type:** Polish

## Intent

The upload rejected the barangay's own resident list ("missing required column(s): Full Name, Email Address, Block Number, Lot Number"). It now reads that layout directly.

## Key changes

- Template headings are the 22 barangay columns (Resident ID ... Remarks), with an example row.
- Required: First Name + Last Name (Middle Name optional; a single Full Name column still works), Block, Lot, Email Address, Phone Number. All other columns are ignored.
- Phone Number is now required (it was optional). Editing a record also requires it.
- The name is stored as `First Middle Last`; a resident must type it the same way to register (matching is exact apart from case, accents and punctuation).
- Upload hint text and the system doc updated. No schema or database change.

## Validation evidence

- `python tests/test_resident_registry.py`: 91 checks passed (test file updated for the required phone number and the new template).
- Template headings map to name, Block, Lot, Email and Phone columns; a file lacking e-mail and phone names both in the error.
