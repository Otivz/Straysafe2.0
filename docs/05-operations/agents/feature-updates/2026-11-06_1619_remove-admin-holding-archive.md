# Remove the Admin Holding Archive

- **Date:** 2026-11-06 16:19 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/AdminSidebar.tsx`, `frontend/tests/adminArchive.browser.mjs`, `frontend/tests/phase2Holding.browser.mjs`, `frontend/tests/fixtures/phase2Holding.tsx`, `frontend/tests/barangayRetired.browser.mjs`, `docs/01-system/HOLDING_PLACE_AND_CUSTODY_RULES.md`, `docs/01-system/ADOPTION_ELIGIBILITY_RULES.md`, `docs/03-development/audits/BARANGAY_TRACE_REMOVAL_CHECKLIST_2026-11-06.md`, `docs/03-development/implementation-reports/BARANGAY_TRACE_REMOVAL_FOLLOWUP_2026-11-06.md`, `docs/04-testing/README.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_1619_remove-admin-holding-archive.md`
- **Authorization:** User explicitly requested: "How about the holding archive could you remove it". This supersedes the earlier requirement to retain that standalone archive.
- **Type:** Polish

## Intent

Remove the separate Holding Archive from the Admin portal while retaining historical custody data inside related reports.

## Key changes

- Removed the desktop/mobile Admin sidebar item, its active-state branch and the lazy holding-page import/mount.
- Old `/admin/holding-facility` bookmarks redirect to `/admin/incidents` inside the existing Admin authorization boundary.
- Related report holding reads/details, Adoption Archive, retired-role/session guards and unmounted compatibility source remain. No backend endpoint, schema, database record, dependency or environment file changed.
- Updated current documentation, the cleanup checklist and follow-up to distinguish the new user decision from earlier phase snapshots. Earlier permanent records remain unchanged.
- Updated archive/holding/retirement tests to exercise the redirect and remaining report/adoption access. Fixed selector quoting and closed Chrome gracefully before removing the holding test's temporary profile after an initial cleanup lock error.

## Validation evidence

- `ARCHIVE_TEST_URL=http://127.0.0.1:5180 node frontend/tests/adminArchive.browser.mjs`: passed at 390/1280px, no Holding Archive link or mounted page, old URL redirects with no holding-list fetch, recorded enclosure K1 still visible within report details, Adoption Archive read only. All 16 mocked supported status-only submissions and historical-status checks remain passing.
- `PHASE2_HOLDING_TEST_URL=http://127.0.0.1:5180 node frontend/tests/phase2Holding.browser.mjs`: 12 scenarios passed, both old holding URLs redirect, resident custody and single/multi-animal controls retained; zero live backend requests.
- `BRGY_TEST_URL=http://127.0.0.1:5180 node frontend/tests/barangayRetired.browser.mjs`: passed retirement information, stale-role blocking/sign-out, supported leader sign-in and updated Admin destinations with mocked APIs.
- `npm --prefix frontend run build`: TypeScript and production build passed; existing large-chunk warning remains. `git diff --check` passed.
- Strict documentation audit at 2026-11-06 16:19 UTC retained exactly 12 pre-existing failures: eight missing link targets and four missing configured agent pointers. No new failure.
- Browser verification used an isolated local Vite server on port 5180 and synthetic/mocked APIs, never the application database. No commits, migrations, database deletions or deployment commands ran.
