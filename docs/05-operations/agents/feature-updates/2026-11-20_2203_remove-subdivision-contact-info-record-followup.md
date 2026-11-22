# Remove Subdivision Office Contact Information from Record Follow-up Modal

- **Date:** 2026-11-20 22:03 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/dialogs/ActionDialogs.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_2203_remove-subdivision-contact-info-record-followup.md`
- **Authorization:** Explicit developer request (`"remove the subd contact info"` with screenshot of the Record follow-up modal).
- **Type:** Polish

## Intent

Remove the `Subdivision Office Contact Information` block from the **Record follow-up** modal (`FollowUpDialog` in `mode === 'follow_up'`) and remove the unused `useSubdivisionContactAutofill` dependency from `ActionDialogs.tsx`.

## Key changes

- `frontend/src/admin/dialogs/ActionDialogs.tsx`: Removed `<SubdivisionContactFields />` from `mode === 'follow_up'`, replaced `useSubdivisionContactAutofill` with local `contactMethod` state for `mode === 'owner'`, and removed `contactSuffix` appending.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
