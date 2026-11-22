# Add Newest / Oldest / Name Sort Filter to Pet Registry

- **Date:** 2026-11-21 03:06 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/PetsPage.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_0306_pet-registry-newest-oldest-sort.md`
- **Authorization:** Explicit developer request (`"add filter newest to latest"` with screenshot of Pet Registry).
- **Type:** Feature

## Intent

Allow Subdivision Administrators to sort Registered Pets by registration recency (**Newest first**, **Oldest first**) or **Name (A–Z)** instead of only alphabetical order, defaulting to newest first so newly registered pets appear at the top.

## Key changes

- `frontend/src/admin/pages/PetsPage.tsx`: Added URL-backed `sort` state (`newest` | `oldest` | `name`, defaulting to `newest`), a `Sort registered pets` `<Select>` control beside the animal-type filter, and registration timestamp + ID tiebreaker sorting.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
