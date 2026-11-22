# Remove Subdivision Office Contact Information from Message Owner Modal

- **Date:** 2026-11-20 22:00 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`, `docs/05-operations/agents/feature-updates/2026-11-20_2200_remove-subdivision-contact-info-message-owner.md`
- **Authorization:** Explicit developer request (`"remove the subdivision contact info"` with screenshot of the Message Owner modal).
- **Type:** Polish

## Intent

Remove the `Subdivision Office Contact Information` block from the **Message Owner** dialog in `PossibleOwnersBlock.tsx` since the dialog delivers messages directly to the resident's inbox.

## Key changes

- `frontend/src/admin/pages/case/PossibleOwnersBlock.tsx`: Removed `<SubdivisionContactFields />` from the `open.kind === 'message'` modal body and stopped appending `Subdivision Office Contact` details to the submitted message text.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
