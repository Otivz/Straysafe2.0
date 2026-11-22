# Remove Subdivision Office Contact Information from Message Owner Modal (otherbugs)

- **Date:** 2026-11-21 03:11 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_0311_remove-subdivision-contact-info-message-owner-otherbugs.md`
- **Authorization:** Explicit developer request (`"remove the subdivision contact info"` with screenshot of Message Owner — Hannah Tupas).
- **Type:** Polish

## Intent

Remove the `Subdivision Office Contact Information` block from the **Message Owner** dialog in `PossibleOwnersBlock.tsx` on the `otherbugs` branch.

## Key changes

- `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`: Removed `<SubdivisionContactFields />` from the `open.kind === 'message'` modal and removed the appended `Subdivision Office Contact` line from the submitted message text.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
