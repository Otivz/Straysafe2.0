# QR Tag Scan Interactive Map, Separate Notification Page, and Done State

- **Date:** 2026-11-18 15:54 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/routes/notifications.py`, `backend/app/services/pet_tags.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_pet_tags_public.py`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/pets/PetTagScans.tsx`, `frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/tests/residentLiveAdapters.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-18_1554_qr-tag-map-and-scan-page.md`
- **Authorization:** User requested displaying a map when scanning a pet QR tag, opening `"Someone found <Pet>"` notifications on a dedicated page, and reflecting completed scans as Done on the pet profile (`/resident-app/pets/:petId`).
- **Type:** Feature

## Intent

Ensure finders scanning a pet's QR tag (`/t/:token`) immediately see an interactive map where they can drop/drag a pin or view their GPS fix, route owner `"Someone found <Pet>"` notifications to a separate scan-details page with an embedded map and action controls, and reflect resolved scans as **Done** both on the notification page and on the pet's profile page.

## Key changes

- **Public QR scan map (`frontend/src/resident/pages/tag/TagScanPage.tsx`):** Added lazy-loaded `LocationMap` inside `FoundForm` so finders see an interactive map upon scanning the QR tag, can tap/drag to place a pin or center it automatically via `"Add my current location"`, clear the pin, and see a `<LocationMapPreview>` after submitting coordinates.
- **Dedicated scan notification page & routing (`frontend/src/resident/pages/pets/PetTagScansPage.tsx`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/live/adapters.ts`):** Added `/resident-app/pets/:petId/scans` and `/resident-app/pets/:petId/scans/:scanId`, updated `notificationFromApi` for `pet_tag_found` to navigate there, and rendered embedded `<LocationMapPreview>` maps, shared finder contact/photo/notes, and `"Mark as done"` / `"is back home"` actions.
- **Backend notification links (`backend/app/routes/notifications.py`, `backend/app/utils/push_categories.py`, `backend/app/services/pet_tags.py`):** Pointed `pet_tag_found` links (`_with_links` and `notification_link`) to `/resident-app/pets/{pet_id}/scans` and updated notification body wording to `"open this notice to see it"`.
- **Pet profile Done state (`frontend/src/resident/pages/pets/PetTagScans.tsx`):** Updated resolved scan pills to **`Done`**, button labels to **`Mark as done`**, embedded `<LocationMapPreview>` inside profile scan cards, and linked each scan card to its `/pets/:petId/scans/:scanId` detail route.

## Validation evidence

- `npm --prefix frontend run build` (`tsc -b && vite build`) -> succeeded (`dist/` built in 2.21s)
- `node --test frontend/tests/*.test.mjs` -> 214/215 passing (`a pet_tag_found notification routes to the separate tag scan page` passed; 1 pre-existing failure at `residentLiveAdapters.test.mjs:73`)
- Offline SQLite Python check of `record_found`, `notification_link`, `notifications._with_links`, and `resolve_scans` -> `PASS pet_tag_flow 1 1`
