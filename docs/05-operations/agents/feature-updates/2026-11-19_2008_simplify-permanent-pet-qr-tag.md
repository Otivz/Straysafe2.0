# Simplify Pet QR Tag Management – One Permanent Unique QR Tag Per Pet

- **Date:** 2026-11-19 20:08 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `backend/app/models/pet_tag.py`, `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/main.py`, `database/migrations/2026-11-20_one_permanent_pet_tag.sql`, `frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/pages/pets/PetTagPage.tsx`, `frontend/src/admin/components/PetTagBlocks.tsx`, `docs/README.md`
- **Authorization:** User request ("STRAY-SAFE 2.0 – Simplify Pet QR Tag Management")
- **Type:** Polish

## Intent

Enforce a single permanent, globally unique QR tag per registered pet and remove all QR tag replacement and deactivation actions from the Resident and Admin Pet Details pages while retaining **View and print the tag** and **Download QR code**.

## Key changes

- **Frontend (`frontend/src/resident/pages/pets/PetTagSection.tsx`, `frontend/src/resident/pages/pets/PetTagPage.tsx`, `frontend/src/admin/components/PetTagBlocks.tsx`)**:
  - Removed **Replace tag (lost or damaged)** and **Turn off tag** buttons and confirmation modals from `PetTagSection` and `PetTagPanel`.
  - Kept only **View and print the tag** and **Download QR code** (plus the QR image preview and scan messages list).
- **Backend & Database (`backend/app/models/pet_tag.py`, `backend/app/services/pet_tags.py`, `backend/app/routes/pet_tags.py`, `backend/app/main.py`, `database/migrations/2026-11-20_one_permanent_pet_tag.sql`)**:
  - Added `unique=True` to `PetTag.pet_id` alongside `unique=True` on `PetTag.token`, and added startup migration/consolidation in `ensure_pet_tag_tables()` (`uq_pet_tags_pet_id`).
  - Made `ensure_active_tag` and `create_or_replace` strictly reuse any existing `PetTag` for `pet_id` without generating a second tag.
  - Changed `disable()` to reject deactivation with HTTP `405` and set `can_disable=False` in `PetTagResponse`.

## Validation evidence

- `npm run build --prefix frontend` (`tsc -b && vite build`): verified.
- `.venv\Scripts\python -m py_compile ...`: verified.
- Automated Python unit tests verifying single permanent tag reuse, `IntegrityError` on duplicate `pet_id`, HTTP `405` on disable, and persistence across pet edits and Lost/Active status transitions: verified.
