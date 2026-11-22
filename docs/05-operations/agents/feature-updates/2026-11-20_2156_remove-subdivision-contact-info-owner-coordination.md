# Remove Subdivision Office Contact Information from Record Owner Coordination

- **Date:** 2026-11-20 21:56 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/dialogs/ActionDialogs.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_2156_remove-subdivision-contact-info-owner-coordination.md`
- **Authorization:** Explicit developer request (`"remove the subdivision contact info"` with screenshot of the Record owner coordination modal).
- **Type:** Polish

## Intent

Simplify the **Record owner coordination** modal (`FollowUpDialog` in `mode === 'owner'`) by removing the `Subdivision Office Contact Information` autofill card while keeping the `How You Reached Them (Contact Method)` selector.

## Key changes

- `frontend/src/admin/dialogs/ActionDialogs.tsx`: Replaced `<SubdivisionContactFields />` in `FollowUpDialog` (`mode === 'owner'`) with a standalone `How You Reached Them (Contact Method)` `<Select>` using `CONTACT_METHODS`, and omitted `contactSuffix` from the submitted `summary` in owner-coordination mode.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
