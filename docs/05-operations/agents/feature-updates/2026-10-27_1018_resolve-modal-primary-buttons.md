# Resolve modal buttons use the shared primary button

- **Date:** 2026-10-27 10:18 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/components/Modals/ResolveLostPetModal.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_1018_resolve-modal-primary-buttons.md`
- **Authorization:** the developer's request "fix the button for this http://localhost:5173/subd/reports/9 make it like it primary buttons" (screenshot of the "Pet record required before resolution" panel).
- **Type:** Polish

## Intent

The status-update modal's action buttons used a custom amber-to-orange gradient with a grow-on-hover effect, unlike the rest of the app's primary buttons.

## Key changes

- "Add to Pet Records" (inside the mandatory-policy panel), "Register Pet in Records First" and "Confirm Status Update" now use the shared `Button` with `variant="primary"`: a solid role color (`bg-role`, hover `bg-role-hover`), no gradient, no scale-up. The "➕" emoji became the `Plus` icon.
- `bg-role` is the brand orange for Residents and Admin, amber for Subdivision Leaders and rust for Barangay staff, the same as every other primary button.
- Unchanged: what each button does, the Cancel button, and when each button appears.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- Not checked in a browser.
