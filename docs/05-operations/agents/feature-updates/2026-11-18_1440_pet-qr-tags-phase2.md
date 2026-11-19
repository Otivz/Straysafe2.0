# Pet QR Tags Phase 2: Anyone Can Scan and Tell the Owner

- **Date:** 2026-11-18 14:40 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/main.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_pet_tags_public.py` (new), `frontend/src/main.tsx`, `frontend/src/utils/api.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/live/adapters.ts`, `frontend/src/resident/pages/tag/TagScanPage.tsx` (new), `frontend/src/resident/pages/pets/PetTagScans.tsx` (new), `frontend/src/resident/pages/pets/PetTagSection.tsx`, `docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md`, `docs/README.md`
- **Authorization:** Developer: "phase 2", after Phase 1 and the plan's decisions (guests allowed; re-print per demo).
- **Type:** Feature

## Intent

Phase 2 of [PET_QR_TAGS_PLAN_2026-11-17.md](../../../06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md): a phone that scans a printed tag opens a public page. The finder can tell the owner where the pet is, without seeing the owner's details. The owner gets a notification and a message history on the pet page.

## Database changes

None to the schema. Rows go into `pet_tag_scans` (created in Phase 1).

Note: the developer's running backend (`--reload`) picked up the Phase 1 and 2 code while this was being built. Its own startup step `ensure_pet_tag_tables()` therefore created `pet_tags` and `pet_tag_scans` in the local MySQL database (create only). The only requests sent to it were a read-only `GET /t/<unknown token>`, which writes nothing. The visual and browser checks below ran on a separate throwaway SQLite backend.

## Key changes

- **Public endpoints** (`public_router`, prefix `/t`; sign-in optional, used when present):
  - **`GET /t/{token}`** returns only an allow-list: pet name, species, breed, photo, subdivision name, `is_lost`, and who is looking (`guest`, `resident` or `owner`).
    - Never shown: the owner's name, address, phone or email, the home location, or the pet's health condition and notes.
    - An unknown, replaced, disabled or too-long token, an inactive pet, and `ENABLE_PET_TAGS=false` all give the same 404 "This tag is no longer active.", so a scan never reveals whether a pet exists.
    - A page view is recorded at most once per tag per 10 minutes, and never the owner's own views.
  - **`POST /t/{token}/found`** ("tell the owner"):
    - **Required:** a place or a location; latitude and longitude must come together and be valid.
    - **Limits:** place up to 255 characters, message up to 500.
    - **Refused:** a phone number or email in the text; a photo from a guest (only signed-in users, Cloudinary images only).
    - **Phone:** kept only when "Share my number" is ticked, and must be a Philippine mobile number (normalised).
    - The owner gets an in-app notification and a push (`pet_tag_found`, Pet matches category). The message never contains the finder's number, and a tap opens `/resident-app/pets/<id>`.
    - The owner cannot send a message about their own pet (409).
- **Rate limits:**
  - `GET /t/*`: 30 per minute per visitor.
  - `POST /t/*/found`: 3 per hour per visitor, using `slowapi` (the real IP arrives through the Vite proxy's `X-Forwarded-For`, which uvicorn trusts from 127.0.0.1).
  - Each tag also takes at most **10** messages an hour from everyone together, counted in the database.
- **Owner side:**
  - `GET /pets/{id}/tag/scans` (owner or Leader): the messages, newest first, plus how often the page was opened. Only the owner sees a shared phone number. The owner reading the list marks new messages "Open"; the Leader reading it does not.
  - `POST /pets/{id}/tag/scans/{scan}/resolve` and `POST /pets/{id}/tag/scans/resolve` ("Pet is back home"), owner only: mark messages resolved **and delete any shared phone number**.
- **Screens:**
  - **New public page `/t/:token`** (`TagScanPage.tsx`), outside both interfaces' sign-in guards. It shows the pet card, a "This pet is missing" banner, the "Stay safe" note and the "Tell the owner" form. The form has the place, "Add my current location" (browser geolocation), a message, a photo for signed-in residents, and "Share my number" with a phone field. Afterwards it says "The owner has been told".
  - **Pet page:** the QR tag section lists the messages: place, map link, message, photo, a phone number to call with "meet in a public place or at the guardhouse", "Mark as resolved", and "Bantay is back home".
  - **Notifications:** a `pet_tag_found` notification opens the pet's page.
  - **Signed-in token:** on `/t/…`, the API client now prefers the resident session over a Leader session stored in the same browser.

## Differences from the plan (decided while building)

- **2.5 not built: no owner-finder conversation for a signed-in finder.** Every existing conversation needs a report (`case_message_threads.report_id` is required) or a lost-pet alert sighting (`lost_pet_coordinations`). A pet that is not reported lost has neither, so this would need a new conversation type or a schema change. A lost pet's alert flow is Phase 3.
- **Per-tag limit is 10 an hour, not 3.** With 3, a handful of strangers (or one person on several networks) could stop every honest neighbour from reaching the owner of a lost pet. Each visitor is still limited to 3 an hour.
- **`ENABLE_PET_TAGS` defaults to on, not off.** Tags exist only when owners create them, and the developer edits `.env` for the address anyway. Set `ENABLE_PET_TAGS=false` to switch the public pages off.
- **Guests cannot attach a photo**, because uploads need an account. Signed-in residents can, through the existing `/chat/media` upload.
- **Location input:** a text box plus "Add my current location", instead of the report flow's map picker (`LocationPicker` depends on the signed-in resident app's data).

## Validation evidence

- New `backend/tests/test_pet_tags_public.py`: **64/64**. It covers:
  - The card is exactly the allow-list, and none of the owner's or pet's private values appear anywhere in the response.
  - Guest, resident, owner and bad-token viewers are told apart.
  - The lost banner shows for a lost pet.
  - Unknown, too-long, replaced, inactive and switched-off tokens get identical answers.
  - Every validation rule above holds.
  - The phone is stored only with consent; the owner gets one notification per message, and none contains the number.
  - The push category is right and a tap opens the pet page.
  - A signed-in photo is accepted; a video or non-Cloudinary URL is refused.
  - The history shows the phone to the owner only; the owner's reading marks messages seen, the Leader's does not.
  - Resolving clears the phone.
  - Rate limits: 3 per hour per visitor, 30 per minute per visitor, 10 per hour per tag, and older messages don't count.
- `test_pet_tags` 42/42 (Phase 1) still passes. Also passing: `test_lost_pet_contact` 9/9, `test_lost_pet_sighting_ping` 51/51, `test_push_notifications` 35/35, `test_push_fcm` 25, `test_email_notifications`, `test_admin_002_notifications_rbac`.
- Frontend:
  - `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint on the new and changed files: clean, apart from the errors already in `main.tsx` (1) and `utils/api.ts` (7), which are the same at `HEAD`.
  - Adapter tests: `adminLiveAdapters` 21/21, `adminLostFound` 13/13, `adminLostPet` 12/12, `residentCaseMessages` 6/6. `residentLiveAdapters` 29/30: the one failure (case chat "[Photo attached]") fails the same way with this change's `adapters.ts` edit reverted.
- **Browser** (headless Chrome, throwaway stack: Vite on port 5199 → a SQLite API on port 8766, real `pet_tags` routers):
  - An unknown tag shows "This tag is no longer active."
  - A lost pet shows the card, the banner and the form.
  - Sending with no place shows the error.
  - A guest fills in the place and message, shares a number and sends; the page shows "The owner has been told. Thank you!".
  - No page errors.
  - Screenshots were checked, and a layout fix was made (the form now stretches to full width).
- **Not done:** a real phone camera scan; the owner's pet-page history was not opened in a browser (it is covered by the API tests and the type check); push delivery to a real device.

## Remaining issues

- Phase 3: link scans to an open lost-pet alert (sightings map, Leader case activity), neighbour buttons into `SightingPage`/`SecuredPetPage`, the Leader admin "Has QR tag" mark; update `overview.md`, `PENDING_AND_FUTURE_FEATURES.md` (still saying "Retired") and `DEFENSE_PLAN.md`.
- Phase 4: the scheduled cleanup of `view` rows older than 90 days (not built; views are deduplicated to one per 10 minutes meanwhile).
- `PUBLIC_TAG_BASE_URL` still has to be set in `.env` by the developer before printing a tag to keep.
