# Directions hidden from residents viewing a public report

- **Date:** 2026-10-27 10:12 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/citizen/ResiViewReport.tsx`, `docs/05-operations/agents/feature-updates/2026-10-27_1012_hide-directions-on-public-reports.md`
- **Authorization:** the developer's request "Also when the subd public the report hide this button from the other residents ... in the resident side" (buttons: Directions (Live GPS), From My Home, From Brgy HQ, Set Starting Point).
- **Type:** Polish

## Intent

When a Subdivision Leader makes a report public, other residents can read it. They should not get turn-by-turn directions to the animal; directions are for the people involved in the case.

## Key changes

- New `canGetDirections` on the resident report page: true unless the server says this viewer only sees the report because it is public (`viewer_access === 'public'`). The reporter, the pet's owner, other reporters of the same case and staff keep the buttons. If `viewer_access` is missing, only the reporter or the pet's owner get them.
- Hidden for public viewers: the four direction buttons on the location card, and the same controls above the expanded map. The "Case Resolved" note on closed cases still shows for everyone.
- The report's pin and location text stay visible to public viewers, as before.

## Validation evidence

- `npx tsc --noEmit -p tsconfig.app.json`: no errors.
- `viewer_access` levels come from `backend/app/utils/report_visibility.py` (`staff`, `reporter`, `owner`, `case_reporter`, `public`, `match_owner`).
- Not checked in a browser with a second resident account.
