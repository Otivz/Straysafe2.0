# Pet QR Tags Phase 1: Owners Create and Print a Tag

- **Date:** 2026-11-18 14:28 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/pet_tag.py` (new), `backend/app/schemas/pet_tag.py` (new), `backend/app/services/pet_tags.py` (new), `backend/app/routes/pet_tags.py` (new), `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/requirements.txt`, `backend/tests/test_pet_tags.py` (new), `frontend/src/live/http.ts`, `frontend/src/resident/live/api.ts`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/pages/pets/PetDetailsPage.tsx`, `frontend/src/resident/pages/pets/PetTagSection.tsx` (new), `frontend/src/resident/pages/pets/PetTagPage.tsx` (new), `frontend/src/resident/styles/petTag.css` (new), `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`, `docs/01-system/DATABASE_SCHEMA.md`, `docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md`, `docs/README.md`
- **Authorization:** Developer: "let us implement the qr from PET_QR_TAGS_PLAN_2026-11-17", then answered the plan's decisions: Python `qrcode` (dependency change approved), guests allowed, re-print per demo, build Phase 1 then wait.
- **Type:** Feature

## Intent

Phase 1 of [PET_QR_TAGS_PLAN_2026-11-17.md](../../../06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md): a resident can create, print, replace and turn off a QR tag for a registered pet. The public scan page (`/t/<token>`) is Phase 2 and is **not** built, so a printed tag does not open anything yet.

## Database changes

Two new tables, `pet_tags` and `pet_tag_scans`, created at the next backend start by `ensure_pet_tag_tables()` (`CREATE` only; nothing existing is altered). `pet_tag_scans` stays empty until Phase 2. `status` and `kind` are `varchar` rather than MySQL `ENUM` (the plan said ENUM), so later values need no `ALTER TABLE`. Nothing was run against any database.

## Dependency change

`qrcode>=7.4` added back to `backend/requirements.txt` (approved). It was already installed in the local virtual environment (8.2), so nothing was installed.

## Key changes

- **Endpoints** (`routes/pet_tags.py`):
  - `POST /pets/{id}/tag`: create, or replace. Owner only.
  - `GET /pets/{id}/tag`: the current tag. Owner, or the Leader or system admin whose scope covers the pet.
  - `GET /pets/{id}/tag/qr.png`: owner only, `Cache-Control: no-store`.
  - `POST /pets/{id}/tag/disable`: owner or Leader.
  - Other residents, Leaders of other subdivisions and the retired barangay-staff role get 403.
  - Create, replace and turn off are written to the audit log.
- **Rules** (`services/pet_tags.py`):
  - Only a pet with an owner that is not archived, deceased, inactive or merged can have a tag (409 otherwise).
  - One active tag per pet. The pet row is locked (`SELECT … FOR UPDATE`) while a tag is created or turned off.
  - Replacing marks the old tag `replaced`, so its token stops working at once.
  - The token is `secrets.token_urlsafe(16)`, never the pet id.
- **Link**: `PUBLIC_TAG_BASE_URL`, else `FRONTEND_URL`, else `http://localhost:5173`, followed by `/t/<token>`. The response has `link_is_public: false` when neither setting is set, and the screens then warn that the tag is not public.
- **Resident app**:
  - The pet page has a "QR tag" section: create, "View and print the tag", replace (with a confirmation), and turn off (with a confirmation).
  - New page `/resident-app/pets/:petId/tag`: a wallet card (85 × 54 mm: QR, "Scan if found", photo, name, type and breed, subdivision) or a collar tag (30 × 30 mm). Print styles print only the tag at real size, and "Download QR image" saves the PNG. Owner details are never on the card.

## Validation evidence

- New `backend/tests/test_pet_tags.py`: **42/42**. It covers:
  - Who may create, see, download and turn off a tag.
  - Stray and deceased pets are refused.
  - The token is random and the link has the right form.
  - The QR image is a valid square PNG.
  - Replacing a tag leaves one active tag and marks the old one `replaced`.
  - Audit entries are written.
  - The `PUBLIC_TAG_BASE_URL` and `FRONTEND_URL` fallbacks work, and a signed-out request gets 401.
- Also passing: `test_lost_pet_contact` 9/9, `test_merge_pet_identity` 38/38, `test_lost_pet_registration_first` 82, `test_pet_identity` 64/64, `test_pet_labels` 17/17, `test_pet_photo_multi_animal` 30/30, `test_pet_record_duplicates` 50/50.
- Already failing at the current commit `ca831d5` (checked in a clean worktree), unchanged: `test_pet_behavior_history`, `test_pet_handover_sync`, `test_pet_owner_confirmation`, `test_pet_record_access`.
- `npx tsc -p tsconfig.app.json --noEmit` passed. ESLint on the new and changed files: no problems.
- Not done: the screens were not opened in a browser or on a phone, and nothing was printed. The startup migration was checked only by compiling `main.py`, not by starting it against MySQL.

## Remaining issues

- The public scan page is not built (Phase 2), so a printed tag does not open anything yet.
- The local `.env` has `FRONTEND_URL` set to a LAN address and no `PUBLIC_TAG_BASE_URL`, so links currently point at that LAN address. Set `PUBLIC_TAG_BASE_URL` yourself (agents do not edit `.env`).
- Printing (`window.print`) and the file download may not work inside the Android app's WebView; in a phone browser they should.
- The Leader admin "Has QR tag" mark and scan history are Phase 3.
- The three warning-letter tables are still missing from `DATABASE_SCHEMA.md` (warning-template Step 6).
