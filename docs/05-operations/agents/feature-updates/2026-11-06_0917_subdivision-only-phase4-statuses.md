# Subdivision-only Phase 4: status labels and choices

- **Date:** 2026-11-06 09:17 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/utils/reportStatus.ts`, `frontend/src/pages/Subd_Leaders/SubdReports.tsx`, `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/tests/reportStatus.test.mjs`, `frontend/tests/adminArchive.browser.mjs`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0917_subdivision-only-phase4-statuses.md`
- **Authorization:** Developer request to implement only Phase 4 of the subdivision-only restructuring, including backward-compatible escalation filters and retired status choices.
- **Type:** Fix

## Intent

Display status 4 as a Barangay referral while retaining historical statuses and bookmarked filters.

## Key changes

- Shared status 4 label is Referred to Barangay; legacy 5, 6, 8 and 13 remain readable. A shared selection guard hides their actions without deleting the legacy code.
- Leader and Admin filters accept earlier Escalated bookmarks and display the new referral wording.
- Admin list actions default to investigation; detail actions default to a permitted status. Neither picker starts on a hidden retired action.
- Browser readiness waits for the loaded referral and handles CSS capitalization; the Admin list picker and legacy URL are covered.

## Validation evidence

- Pre-change full backend baseline, BARANGAY_WORKFLOWS_ENABLED=1: 123/124 scripts pass. Only test_multi_animal_split fails; 124 scripts exist in this checkout. Configured and connected MySQL database verified as straysafe_subdivision.
- node frontend/node_modules/typescript/bin/tsc -b frontend: exit 0.
- reportStatus.test.mjs: 3/3; notificationNavigation.test.mjs: 10/10.
- adminArchive.browser.mjs: pass at 1280 and 390 px, including both action pickers, old escalation bookmark, zero writes and zero browser errors.
- Pre-change docs audit: 12 failures (8 known broken links plus 4 intentionally deleted tool pointers); no pointers restored.
