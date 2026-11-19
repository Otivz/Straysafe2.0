# Pet QR Tags Phase 3: Scans, Lost-Pet Alerts and the Leader

- **Date:** 2026-11-18 14:49 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/main.py`, `backend/tests/test_pet_tags_alerts.py` (new), `backend/tests/test_pet_tags_public.py`, `frontend/src/resident/pages/tag/TagScanPage.tsx`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/components/PetTagBlocks.tsx` (new), `frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/pages/PetDetailsPage.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `docs/01-system/overview.md`, `docs/06-future-proposals/PENDING_AND_FUTURE_FEATURES.md`, `docs/02-project/DEFENSE_PLAN.md`, `docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md`, `docs/README.md`
- **Authorization:** Developer: "phase 3", after Phases 1 and 2.
- **Type:** Feature

## Intent

Phase 3 of [PET_QR_TAGS_PLAN_2026-11-17.md](../../../06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md): connect tag scans to a pet's lost-pet alert, and show tags in the Leader admin.

## Database changes

None. `pet_tag_scans.alert_id` (created in Phase 1) is now filled.

## Key changes

- **3.1 Card:** `GET /t/{token}` also returns `alert_id`, but only when all of these hold:
  - the viewer is a signed-in resident of the alert's subdivision and not the owner;
  - the pet's lost-pet alert is **active**.

  Those are the same people who can already see the alert in Community and submit a sighting. Everyone else, including the Leader, gets `null`; a requested or closed alert is never given.
- **3.2 Scan page:** for such a neighbour, the "tell the owner" form is replaced by **"I saw this pet"** and **"I have it safely with me"**. They open the existing `/resident-app/community/alert-<id>/sighting` and `/secured` pages. Those flows already notify the owner and the Leader, add the sighting to the alert's map, and open the owner–finder conversation, so nothing in the lost-pet code changed.
- **3.3 Messages filed under the alert:** a "tell the owner" message sent while the pet has an open lost-pet alert (requested or active) gets that `alert_id`.
  - It is **not** turned into a `lost_pet_sightings` row. Sightings are shown to neighbours and need exact coordinates, while a stranger's unchecked text should reach only the owner and the Leader.
  - So the messages are not pins on the alert's map; the Leader sees them as a list next to the sightings (below).
- **3.4 Leader admin** (new router `/pet-tags`; its own prefix, because `/pets/{pet_id}` would capture `/pets/<word>`):
  - `GET /pet-tags/active`: IDs of the pets with an active tag whose owner lives in the Leader's subdivision; every subdivision for the system admin.
  - `GET /pet-tags/alerts/{alert_id}/scans`: the messages filed under an alert, with no phone number, only whether one was shared. Allowed for the Leader of that subdivision and the system admin; others get 404 or 403.
  - **Pet Registry:** a "QR tag" badge on pets that have one.
  - **Pet page:** a "QR tag" panel showing the status, the date it was made, "Turn off tag" (with confirmation), and the messages from scans.
  - **Lost-pet case page:** a "QR tag messages" section after "Sightings". It appears only when there are messages, and says they go to the owner and are not shown to neighbours.
- **3.6 Docs:**
  - `overview.md` describes the tags.
  - `PENDING_AND_FUTURE_FEATURES.md` no longer says "Retired".
  - The `DEFENSE_PLAN.md` checklist says to set `PUBLIC_TAG_BASE_URL` in the root `.env` before printing. Step 1 of the demo script ("scan a pet QR card with a phone") now matches the app.

## Validation evidence

- New `backend/tests/test_pet_tags_alerts.py`: **25/25**. It covers:
  - Who gets the alert ID: a neighbour of the same subdivision does; a guest, a resident of another subdivision, the owner and the Leader don't; requested and closed alerts are never given.
  - Messages are filed under requested and active alerts, not closed ones, and no sighting row is ever created.
  - The owner's history carries the alert ID.
  - Tagged-pet lists are per subdivision, the admin sees all, residents get 403, and a turned-off tag drops out.
  - Alert messages are visible to the right Leader only, never with a phone number; other cases get 404, 403 or 401 as appropriate.
  - The `/pets/{id}` routes are not shadowed.
- `test_pet_tags_public` 64/64, updated because the card's allow-list now includes `alert_id`. Also passing: `test_pet_tags` 42/42, `test_lost_pet_sighting_ping` 51/51, `test_lost_pet_lifecycle` 146.
- Frontend: `npx tsc -p tsconfig.app.json --noEmit` passed; ESLint on the new and changed files is clean; every `frontend/tests/admin*.test.mjs` passes.
- **Browser** (headless Chrome, throwaway stack: Vite on port 5199 → a SQLite API on port 8766 with an active alert):
  - Signed out, the page shows the form.
  - With a resident session of the same subdivision, it shows "Help bring Bantay home" with "I saw this pet" → `/resident-app/community/alert-1/sighting` and "I have it safely with me" → `…/secured`, and the form is hidden.
  - No page errors. The throwaway servers were stopped afterwards.
- **Not done:**
  - The new admin screens (registry badge, pet panel, case section) were not opened in a browser; they are covered by the API tests and the type check.
  - Nothing ran against the developer's database in this phase.

## Remaining issues

- Messages are not pins on the alert's map, by design, for the reason above.
- Phase 4 (optional): in-app scanner, scheduled cleanup of `view` rows older than 90 days.
- `PUBLIC_TAG_BASE_URL` must be set by the developer before printing a tag to keep.
