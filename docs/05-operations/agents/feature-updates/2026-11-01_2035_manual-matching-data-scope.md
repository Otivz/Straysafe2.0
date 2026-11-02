# Manual Matching data separation and access scoping

- **Date:** 2026-11-01 20:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/utils/matching_scope.py`, `backend/app/routes/manual_matching.py`, `backend/tests/test_manual_matching.py`, `frontend/src/utils/matchingScope.ts`, `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/pages/Barangay_Staff/BrgyManualMatching.tsx`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Barangay Manual Matching Data Separation & Access Scoping". FREEZE was OFF.
- **Type:** Fix

## Intent

Barangay staff must match only Barangay-managed records, while still seeing published Lost Pet reports. The private subdivision pet registry must never be searched by Barangay staff. The scope is enforced on the server, in SQL.

## Key changes

- **New `app/utils/matching_scope.py`:** one definition of each role's report pool and pet pool, as SQL conditions, plus per-record checks that return `403`.
  - **Barangay staff, reports:** Barangay-managed cases in their barangay, and published Lost Pet reports. A case is Barangay-managed when it, or a report merged into it, has:
    - a Barangay-handled status;
    - a rescue;
    - an endorsement letter;
    - an escalation in its status history;
    - or a holding intake.
  - **Barangay staff, pets:**
    - pets of barangay residents who live outside a subdivision;
    - pets registered by the barangay's staff;
    - pets tied to a Barangay-managed case, as its linked pet or through a claim on it.
  - **Subdivision Leaders:**
    - reports in their subdivision, unchanged;
    - pets whose owner lives in their subdivision;
    - ownerless pets registered by someone from their subdivision.
  - **Admins:** everything.
- **`manual_matching.py`:**
  - `_scoped` now uses the report pool, so search, candidates and history all follow it.
  - `_get_report` refuses source reports outside the pool.
  - Pet candidates are filtered by the pet pool in SQL. This removes the old "every area" pet query.
  - `403` checks were added to:
    - pet detail;
    - `match-pair`, for both the pet and the matched report;
    - Send Confirmation;
    - report-to-report decisions;
    - pet decisions.
- **Frontend:**
  - The Barangay page shows a scope banner.
  - The Barangay pet tab shows the scope note and the required empty-state message.
  - The workspace takes a `scope` prop that changes wording only.
  - The pet-count line no longer says "from every area"; it now names each role's scope.
- **Behavior change for leaders:** the spec asked for leaders to see only their subdivision's pets. Leaders no longer see pets from other subdivisions or barangays. Their report workflow is unchanged.

## Validation evidence

- **Backend:**
  - `tests/test_manual_matching.py`: 136/136 checks passed on its own temporary SQLite file.
  - The checks that encoded the old rules were adapted to the new ones: barangay-wide visibility, pets from every area, and the outside-area owner phone.
  - 23 scope checks (18 in a new section, 5 in the adapted sections) cover:
    - the Barangay pet pool (Barangay-registered, staff-registered and endorsed pets in; subdivision registry out);
    - `403` on pet detail, `match-pair`, Send Confirmation and decisions, with no match row created;
    - owner-first still working for an endorsed pet, with the owner notified;
    - published versus private Lost Pet reports;
    - internal records excluded and refused;
    - the leader still comparing their own internal record.
  - `tests/test_pet_owner_confirmation.py`: 11/11 passed.
  - Every backend test script that sets its own SQLite database ran: **97 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run, so the local MySQL database was never touched.
- **Frontend:**
  - `npx vite build` passed.
  - ESLint: no findings on changed lines. The only finding in the workspace is an existing `any` in the match-review state.
  - `npx tsc -b` reports only the two errors already present in `MediaLightbox.tsx` and `AIMatchReviewModal.tsx`.
- **Not verified:** a browser run of the Manual Matching page, which has no fixture; and the real data in the local database.
