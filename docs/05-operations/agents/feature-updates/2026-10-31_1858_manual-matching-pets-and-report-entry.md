# Manual Matching: registered pets and report-page entry

- **Date:** 2026-10-31 18:58 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/manual_matching.py`, `backend/app/models/manual_match.py`, `backend/app/main.py`, `backend/tests/test_manual_matching.py`, `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "yes please add that also add in the matching the registered pet for potential matching" (follow-up to adding a Manual Matching button on the report pages). FREEZE was OFF.
- **Type:** Feature

## Intent

Let staff open Manual Matching straight from a report. Let them compare a report with registered pets as well as other reports, without weakening the existing pet-match rules.

## Key changes

- `GET /manual-matching/reports/{id}/pet-candidates` and `GET /manual-matching/pets/{id}`. The pool matches the AI scan: eligible status, not merged, not impounded, and `is_pet_eligible_for_matching`. Pets come from every area. Filters: animal, breed, color, sex, features, registered address, pet status, and radius to the last-seen or registered location. No score is produced. A report already tied to a pet gets a `blocked_reason`.
- The owner's phone is shown only when the owner is in the staff member's area; the owner's name is always shown, as on AI pet matches.
- `POST /manual-matching/decisions` accepts `pet_id` instead of `report_b_id`. The decision is saved through the existing `verify_match`, so identity locks, closed-case and impounded checks, owner notifications and the owner's two-way confirmation all apply. There is still one `report_matches` row per report–pet pair, and a repeated decision returns `409`.
- `manual_match_decisions`: new nullable `pet_id`, and `report_b_id` is now nullable. History shows pet decisions with the pet's name.
- `ensure_manual_match_pet_column()` in `main.py` upgrades a table created by the earlier version. It adds a column and relaxes NOT NULL, and is non-destructive.
- Workspace: an "Other reports / Registered pets" switch, pet filters, pet cards, a report-vs-pet comparison, and a pet confirmation note. `?report=ID[&kind=pet]` opens a report directly.
- Report pages: "Find matches manually" and "Check registered pets" buttons on the Barangay report view header; "Match with reports" and "Check registered pets" above the AI match list on the Subdivision report view.

## Validation evidence

- `..\.venv\Scripts\python.exe tests/test_manual_matching.py` in `backend/`: 66/66 checks passed (22 new pet checks).
- These scripts exited 0: `test_match_cases`, `test_matches_gaps`, `test_case_claims`, `test_identity_dispute`, `test_match_claim_shortcut`, `test_closed_case_suggestions`, `test_gemini_setting`.
- `npx tsc -b` in `frontend/`: exit 0. `npx eslint` on the Manual Matching files: exit 0.
- Not done: the app was not started and the pages were not checked in a browser.
