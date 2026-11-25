# ERD by Module Document

- **Date:** 2026-11-24 17:42 (UTC)
- **AI tool:** Antigravity (Claude Sonnet)
- **Files changed:** `docs/01-system/ERD_BY_MODULE.md`, `docs/README.md`
- **Authorization:** Developer request: "make an md file for it" (ERD divided into parts, rename barangay table to referral, no code).
- **Type:** Polish

## Intent

Give the capstone paper a code-based ERD that is readable by splitting the 78 tables into modules, and avoid the misleading "barangay" name for referrals since StraySafe has no external Barangay.

## Key changes

- New `docs/01-system/ERD_BY_MODULE.md` with 10 Mermaid ERDs built from `backend/app/models/`.
- Diagrams show `referrals` and `referral_updates` in place of `barangay_referrals` and `barangay_referral_updates`. This is a documentation-only rename; no code or database table was changed.
- `docs/README.md` index updated.

## Validation evidence

- Table and column names were read from the SQLAlchemy metadata (78 tables). The strict documentation audit could not be run (no network access in the sandbox).
