# Remove 1-Hour QR Scan Time-Limit Lockout

- **Date:** 2026-11-20 17:38 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/services/pet_tags.py`, `backend/tests/test_pet_tag_cooldown_per_pet.py`, `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1738_remove-qr-scan-time-limit.md`
- **Authorization:** User requested removing the QR scan time-limit lockout (`"know just remove the time limit cause its not working properly. I just scanned the qr and it says to me qr code already been scanned !!!!"`).
- **Type:** Fix

## Intent

Allow scanning any pet's QR tag (`/t/{token}`) immediately without a 1-hour `429 QR_SCAN_COOLDOWN` lockout while preserving the database schema and 10-minute view-log deduplication.

## Key changes

- **`backend/app/services/pet_tags.py`:** Removed the `429 QR_SCAN_COOLDOWN` lockout from `record_view` (keeping 10-minute view-row deduplication and skipping owner views) and updated `cooldown_remaining_seconds` to return `0`.
- **`frontend/src/resident/pages/tag/TagScanPage.tsx`:** Removed cooldown countdown UI, `"1-hour scan cooldown"` callout copy, and `QR_SCAN_COOLDOWN` error handling.
- **`frontend/src/resident/pages/pets/PetTagSection.tsx`:** Removed the `"Scan cooldown active..."` notice banner.
- **`backend/tests/test_pet_tag_cooldown_per_pet.py`:** Updated test to assert repeated scans on both `Yumiii` and `Mochii` always succeed without cooldown errors and `cooldown_remaining_seconds == 0`.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `backend/tests/test_pet_tag_cooldown_per_pet.py`
- `npm run build` (`tsc -b && vite build`) and `npx eslint src/resident/pages/tag/TagScanPage.tsx src/resident/pages/pets/PetTagSection.tsx` inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
