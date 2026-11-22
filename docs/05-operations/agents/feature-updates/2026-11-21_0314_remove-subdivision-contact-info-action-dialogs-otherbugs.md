# Remove Subdivision Office Contact Information from FollowUpDialog (otherbugs)

- **Date:** 2026-11-21 03:14 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/dialogs/ActionDialogs.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_0314_remove-subdivision-contact-info-action-dialogs-otherbugs.md`
- **Authorization:** Explicit developer request (`"remove the subdivision contact info"` with screenshot of Record follow-up).
- **Type:** Polish

## Intent

Remove the `Subdivision Office Contact Information` block from both **Record follow-up** and **Record owner coordination** modals in `ActionDialogs.tsx` on the `otherbugs` branch.

## Key changes

- `frontend/src/admin/dialogs/ActionDialogs.tsx`: Removed `<SubdivisionContactFields />` and `useSubdivisionContactAutofill` from `FollowUpDialog`, keeping a simple `How You Reached Them (Contact Method)` `<Select>` for owner coordination.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
