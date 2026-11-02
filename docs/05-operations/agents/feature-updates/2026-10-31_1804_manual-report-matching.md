# Manual Report Matching (Gemini fallback)

- **Date:** 2026-10-31 18:04 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/manual_matching.py`, `backend/app/models/manual_match.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/utils/ai_suggestions.py`, `backend/app/routes/matches.py`, `backend/tests/test_manual_matching.py`, `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/pages/Barangay_Staff/BrgyManualMatching.tsx`, `frontend/src/pages/Subd_Leaders/SubdManualMatching.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/BrgySidebar.tsx`, `frontend/src/components/SubdSidebar.tsx`, `frontend/src/components/AIPotentialMatchesList.tsx`, `frontend/src/components/Modals/AIMatchReviewModal.tsx`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "Implement a complete Manual Report Matching feature in STRAYSAFE as a fallback whenever Gemini AI is disabled, unavailable, or encounters an API error." (FREEZE was OFF)
- **Type:** Feature

## Intent

Let staff find, compare and decide possible report matches without Gemini, so that turning Gemini off or a Gemini outage never stops matching. Reuse the existing `report_matches` table, case rules and permission checks.

## Key changes

- `gemini_status()` reports `disabled`, `not_configured`, `error` (the latest real call failed within 15 minutes) or `operational`. `call_gemini_with_fallback` now records the outcome of each real call; its behaviour is otherwise unchanged (the old body is `_call_gemini`).
- New router `/manual-matching`: `status`, `reports` (filters: type, animal, breed, color, sex, location, features, date range, radius, closed), `reports/{id}`, `reports/{id}/candidates`, `decisions`, `history`. Results are scoped to the user's subdivision or barangay. Queries use bound parameters with escaped LIKE wildcards. No similarity score is produced.
- Decisions reuse the pair's single `report_matches` row; a repeated decision returns `409`. Every decision is appended to the new `manual_match_decisions` table and also written to `audit_logs` and status history. Confirm does not merge; `link_case` explicitly runs the existing `confirm_report_match`. Reject reuses `reject_report_match`.
- `reconcile_pair_holding()` extracted from `verify_match` (same behaviour) and reused for linked manual confirmations.
- New Barangay and Subdivision pages with an AI status banner, filter toolbar, result cards, side-by-side comparison, a confirmation step before saving, and matching history. Sidebar entries and routes added.
- Existing match cards and the review modal show "Manual staff match" instead of "0% similarity" for manual rows.
- Schema: new table `manual_match_decisions`, created by `Base.metadata.create_all` at startup. Non-destructive; no existing table is altered.

## Validation evidence

- `..\.venv\Scripts\python.exe tests/test_manual_matching.py` in `backend/`: 44/44 checks passed (isolated SQLite).
- Existing backend scripts exited 0: `test_gemini_setting`, `test_ai_pipeline`, `test_ai_audit_fixes`, `test_ai_confidence`, `test_admin_012_gemini_governance`, `test_vision_cache`, `test_ai_worker`, `test_case_claims`, `test_case_gating`, `test_case_conversation`, `test_active_case_requests`, `test_match_cases`, `test_matches_gaps`, `test_merge_many`, `test_case_review`, `test_case_review_multireport`, `test_closed_case_suggestions`, `test_match_claim_shortcut`, `test_identity_dispute`.
- `npx tsc -b` in `frontend/`: exit 0. `npx eslint` on the three new frontend files: exit 0.
- Not done: the app was not started and the pages were not checked in a browser. Starting the backend creates the new table in the configured MySQL database.
