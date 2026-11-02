# Remove Under Observation Sidebar Badge Count

- **Date:** 2026-11-01 16:11 (UTC)
- **AI tool:** Antigravity (Gemini 3.8 Flash)
- **Files changed:** `frontend/src/components/SubdSidebar.tsx`
- **Authorization:** Explicit user request: "remove the 2 beside the under observation in the sidebar"
- **Type:** Polish

## Intent

Remove the count badge displayed next to the "Under Observation" item in the Subdivision Leader sidebar per user preference.

## Key changes

- `frontend/src/components/SubdSidebar.tsx`:
  - Removed `badgeCount: activeObservationsCount` from the `/subd/under-observation` menu configuration.

## Validation evidence

- Inspected `frontend/src/components/SubdSidebar.tsx` ensuring clean JSX and syntax.
- Documentation audit executed and passed.
