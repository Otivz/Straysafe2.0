# Subdivision-only Phase 4: owner observation display and regression evidence

- **Date:** 2026-11-06 09:52 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/utils/caseStages.ts`, `frontend/src/utils/caseTimeline.ts`, `frontend/src/components/RescueTimeline.tsx`, `frontend/src/pages/Admin/AdminReportView.tsx`, `frontend/src/pages/Admin/AdminReport.tsx`, `frontend/src/pages/Admin/AdminDashboard.tsx`, `frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx`, `frontend/tests/caseStagesObservation.test.mjs`, `frontend/tests/barangayReferral.browser.mjs`, `frontend/tests/adminArchive.browser.mjs`, `frontend/tests/caseSummary.browser.mjs`, `docs/01-system/ACTIVITY_TIMELINE_RULES.md`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-06_0952_subdivision-only-phase4-observation-and-regression.md`
- **Authorization:** Developer request to implement Phase 4 only of the Subdivision-only restructuring; no Phases 5 or 6.
- **Type:** Fix

## Intent

Ensure status 7 alone represents owner observation, preserve real historical intakes, and verify the complete Phase 4 change against the pre-change baseline.

## Key changes

- Correct the resident progress strip and shared timeline: an empty status-7 remark is an owner observation, never an inferred holding event. Only recorded intake/server custody evidence supports care.
- Keep actual intake log metadata separate from owner observation, avoid merging them just because both used status 7, and clone display entries so stored remarks remain unchanged. Historical recorded intakes remain visible.
- Separate owner-observation and historical impound filters/counts, correct the Admin dashboard's shifted 6/7/8/9 captions, and finish Admin referral/source captions.
- Case Summary and print implementation remain untouched; update the existing browser assertion for the shared status-4 label only.
- Mark Phase 4 complete in the plan and document index. Phases 5 and 6 remain unstarted. The four tool-pointer deletions were present before this work and remain untouched.

## Validation evidence

- Full backend before and after, BARANGAY_WORKFLOWS_ENABLED=1: 123/124 scripts pass in both runs; identical pass/fail result for every file. Only pre-existing test_multi_animal_split fails. The checkout contains 124 scripts, not the older 123-script baseline cited in the task.
- Required subdivision-only backend checks with BARANGAY_WORKFLOWS_ENABLED=0: gate 50/50, referrals 47/47, analytics accuracy 41/41, activity timeline 24/24, owner follow-ups 44/44.
- TypeScript check: exit 0 before changes and after the final source edits. git diff --check: no whitespace errors.
- Required frontend baseline: 5/10 scripts passed initially; failures included a hard-coded yesterday date, refreshed-card races and Vite console forwarding before its socket existed. Browser fixtures now run with process-only hmr:false and forwardConsole:false, without repository config changes.
- Final frontend: all 10 requested scripts plus reportStatus.test.mjs and caseStagesObservation.test.mjs pass (12/12). Unit assertions total 39; analytics has 10 browser scenarios, lost pets 12. History/Case Summary/print, retired routes, resident confirmation and archive checks pass.
- Added browser coverage confirms a blank status-7 event is an owner observation, a real intake remains a separate holding event, Admin does not invent a custody transfer, and stored remarks are unchanged.
- Documentation audit after the current-state doc updates: the same 12 baseline failures (8 old broken links and 4 deliberately missing configured tool pointers), with no new failures. The strict audit is repeated after adding this record and its index link.
- MySQL configuration and SELECT DATABASE() verified straysafe_subdivision before each full run. Other test databases are throwaway SQLite. No .env, dependency, migration, backend gate, route, schema, commit or push changes.
