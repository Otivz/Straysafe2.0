# Fix the 11 TypeScript Errors That Stopped the GitHub APK Build

- **Date:** 2026-11-22 20:13 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/admin/components/CasesMap.tsx`, `frontend/src/admin/components/layout.tsx`, `frontend/src/admin/live/LiveDataProvider.tsx`, `frontend/src/admin/pages/ReportsPage.tsx`, `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/resident/ResidentApp.tsx`, `frontend/src/resident/components/ui.tsx`, `frontend/src/resident/styles/resident.css`
- **Authorization:** Developer request "fix the build check" after the GitHub Actions "Build Android APK" run on `f22a9a5` failed.
- **Type:** Fix

## Intent

The APK workflow runs `npm run build:android:debug` (`tsc -b && vite build --mode android-debug`). Commit `09e4d96` (merged in PR #118) left 11 type errors, so the type check stopped the build before Android was reached. Fix each one without changing behavior.

## Key changes

- `CasesMap.tsx`: the priority color map had no `low` entry although `Priority` includes `low`; added a gray `Low` style and a legend item.
- `LiveDataProvider.tsx`: `refreshResidents` called `adminApi.users(subdivisionId)`; `users()` takes no argument (same call as the full load).
- `CaseDetailPage.tsx`: the duplicate banner read `overall_score`, which the `/cases/{id}/duplicates` response does not have; it now reads `combined_score` (0 to 1), as `DuplicateReviewDialog` and `RelatedReportsBlock` already do.
- `layout.tsx`: `Panel` accepts an optional `style` (used for the fade-in `animationDelay` on Community and Resident Records).
- `ReportsPage.tsx`: the "Case locations" `ChartCard` was missing its required `table`; added a table of the period's cases (case, category, location) so the Chart/Table toggle works like the other charts.
- Resident `EmptyState` accepts `tone="amber"` (used by the activation and registration status pages), with an `.rs-empty__icon--amber` style using the existing amber tokens.
- `ResidentApp.tsx`: removed the unused `residentPath` import.

## Validation evidence

- `cd frontend; npx tsc -b`: exit 0 (11 errors before).
- `VITE_API_BASE_URL= STRAYSAFE_ANDROID_DEBUG=true npm run build:android:debug`: built; `dist/assets` contains `ConnectionPage-*` as the workflow checks. (The local `.env` http address is blank here because the build refuses http, as the workflow does.)
- ESLint on the seven changed TS/TSX files: no findings.
- Not run: the Gradle APK step and the GitHub workflow itself; not checked in a browser.
