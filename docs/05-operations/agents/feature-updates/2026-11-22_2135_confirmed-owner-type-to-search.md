# Confirmed Owner: Type the Resident's Name Instead of a Long Dropdown

- **Date:** 2026-11-22 21:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/components/ResidentCombobox.tsx` (new), `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/NewReportPage.tsx`
- **Authorization:** Developer request on the case Assessment ownership form: "instead of drop down i can type the name of the account".
- **Type:** Polish

## Intent

With many residents, choosing the confirmed owner from a plain dropdown means scrolling a long list. Typing part of the name is faster.

## Key changes

- The type-to-search resident picker that New Report already had (`ResidentCombobox`) moved, unchanged in behavior, to `admin/components/ResidentCombobox.tsx`, with options for its label, placeholder, an optional "nobody" choice (`noneLabel`) and an error state.
- Assessment → Ownership → **Confirmed owner** now uses it: type a name, unit or street to filter, choose with the mouse or the arrow keys and Enter, or clear with the X. It has no "nobody" choice, since a confirmed owner is required; the existing "Choose the confirmed owner" validation is unchanged.
- New Report uses the shared picker with its previous placeholder ("Search resident or choose…") and "Not a registered resident" choice, so it looks and works as before.
- What is saved is unchanged (`ownerResidentId`, the resident's id). No backend or database change.

## Validation evidence

- `cd frontend; npx tsc -b`: exit 0.
- ESLint on the three files: no findings.
- Not checked in a browser.
