# Fix StrictMode Double-Fetch Triggering Immediate QR Scan Cooldown on TagScanPage

- **Date:** 2026-11-20 17:31 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/tag/TagScanPage.tsx`, `backend/tests/test_pet_tag_cooldown_per_pet.py`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-20_1731_qr-tag-per-pet-cooldown-dedupe.md`
- **Authorization:** User reported encountering the 1-hour QR cooldown immediately when scanning a second pet (`Mochii`) after scanning `Yumiii` (`"fix it"`).
- **Type:** Fix

## Intent

Prevent `React.StrictMode` double-invocation of `useEffect` in `TagScanPage.tsx` from firing two `GET /t/{token}` requests within milliseconds on a single QR scan, which caused Request #1's `200 OK` card to be discarded and Request #2 to show `429 QR_SCAN_COOLDOWN` immediately on the first scan of each pet.

## Key changes

- **`frontend/src/resident/pages/tag/TagScanPage.tsx`:** Added `fetchPublicTag(token, force)` with a 2-second per-token in-flight promise deduplication map (`recentTagLoads`) so StrictMode's back-to-back mount/remount shares a single `GET /t/{token}` request per scanned pet token while keeping explicit retries (`loadTag(true)`) and subsequent scans uncached.
- **`backend/tests/test_pet_tag_cooldown_per_pet.py`:** Added isolated backend test confirming that scanning Pet A (`Yumiii`) enters a 1-hour cooldown for Pet A only, leaving Pet B (`Mochii`) immediately scannable with an independent `last_scanned_at` timestamp.
- **`docs/README.md`:** Indexed this change record.

## Validation evidence

- `backend/tests/test_pet_tag_cooldown_per_pet.py`
- `npm run build` (`tsc -b && vite build`) and `npx eslint src/resident/pages/tag/TagScanPage.tsx` inside `frontend/`.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.
