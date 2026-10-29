# "Lost Pet" label only when the pet was reported lost

- **Date:** 2026-10-29 06:52 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/ResiViewReport.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer, about `/resident/reports/1` showing "Lost Pet Recovery Case": "What i want to know what will we do in the logic if its just leaving the house and not lost", then "yes" to the proposed label fix.
- **Type:** Fix

## Intent

A registered pet that got out of the house and was reported by a neighbour is not a lost pet. The resident's report page called every report linked to a registered pet a "Lost Pet Recovery Case".

## Key changes

- `ResiViewReport.tsx` now uses its existing `isLostPetReport` rule (category 6, Lost Pet, or the `[LOST PET REPORT]` marker) for:
  - the title: "Lost Pet Recovery Case", otherwise "Registered Pet Case" for a report linked to a pet, otherwise "Rescue Case Intelligence";
  - the category line: "Lost Pet", otherwise the report's real category, plus "· Owner identified" when it is linked to a pet;
  - the owner card badge: "Registered Lost Pet" or "Registered Pet".
- The leader's report page already said "Registered Pet Case". Its Home icon on "Update Animal Status" means "return to the owner" and is kept.
- No server change; the lost and roaming paths were already separate. The rule is noted in the owner follow-up plan, section 15.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors. ESLint on `ResiViewReport.tsx`: 31 problems before and after (none new).
- Not checked in a browser; to be checked by the developer on `/resident/reports/1`.
