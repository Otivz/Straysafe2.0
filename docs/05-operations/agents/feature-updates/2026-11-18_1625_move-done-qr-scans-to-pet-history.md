# Move Completed QR Tag Scans Into Pet Profile History

- **Date:** 2026-11-18 16:25 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/resident/pages/pets/PetTagScans.tsx`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-18_1625_move-done-qr-scans-to-pet-history.md`
- **Authorization:** User approved moving completed (`Done`) QR tag scans into the History section on `PetDetailsPage.tsx` under `"QR tag scans"`.
- **Type:** Polish

## Intent

Keep the **`QR tag`** section on a pet's profile focused on tag controls and open/active scan alerts (`New` / `Open`), while listing completed (`Done`) tag scans cleanly inside **`History`** under **`QR tag scans`**.

## Key changes

- **`frontend/src/resident/pages/pets/PetTagScans.tsx`:** Show full expandable scan cards (map, note, phone, actions) only for open scans (`status !== 'resolved'`), keeping the view count line when no open scans remain, and emit loaded/updated scan arrays via `onScans` / `onError`.
- **`frontend/src/resident/pages/pets/PetTagSection.tsx` & `frontend/src/resident/pages/pets/PetDetailsPage.tsx`:** Pass `onScansLoaded` / `onScansUnavailable` cleanly to `PetHistorySection` so resolved scans (`status === 'resolved'`) appear live under **History → QR tag scans** as compact rows (`Tag scanned · <location>`, timestamp + note snippet, `Done` pill) linking to `/resident-app/pets/:petId/scans/:scanId`.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`) -> verified after final edit.
- `node --test frontend/tests/*.test.mjs` -> verified after final edit.
