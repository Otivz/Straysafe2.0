# Fix `ActionOutcome | void` Return Type on Resident `dispatch`

- **Date:** 2026-11-17 11:56 (UTC)
- **AI tool:** Antigravity (Gemini 4 Hydrogen)
- **Files changed:** `frontend/src/resident/data/context.ts`, `frontend/src/resident/live/LiveDataProvider.tsx`
- **Authorization:** User request to explain and fix `Property 'petId' does not exist on type 'void | ActionOutcome'` at `frontend/src/resident/pages/pets/PetFormPage.tsx:68`
- **Type:** Fix

## Intent

Resolve a TypeScript error (`TS2339`) on optional chaining (`res?.petId` in `PetFormPage.tsx` and `sent?.reportRef` in `ReviewPage.tsx`) when `strictNullChecks` is disabled (such as in older IDE TypeScript language servers reading `tsconfig.app.json` without `"strictNullChecks": true`). Under `strictNullChecks: false`, `?.` narrows `null` and `undefined` out of a union, but leaves `void` in `void | ActionOutcome`.

## Key changes

- Updated `ResidentDataValue['dispatch']` in `frontend/src/resident/data/context.ts` from `Promise<ActionOutcome | void>` to `Promise<ActionOutcome | undefined>`.
- Updated `dispatch` in `frontend/src/resident/live/LiveDataProvider.tsx` to match `Promise<ActionOutcome | undefined>` (which already returns an `ActionOutcome` object).

## Validation evidence

- Ran `npm --prefix frontend run build` (`tsc -b && vite build`): exited with code `0` (`✓ built in 1.60s`).
- Ran `frontend\node_modules\.bin\tsc.cmd -p frontend\tsconfig.app.json --noEmit --strictNullChecks false`: confirmed `TS2339` errors on `PetFormPage.tsx(68,18)` and `ReviewPage.tsx(84,106)` no longer occur.
