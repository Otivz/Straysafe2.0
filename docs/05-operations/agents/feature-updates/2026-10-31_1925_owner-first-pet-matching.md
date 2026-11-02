# Owner-first pet matching confirmation

- **Date:** 2026-10-31 19:25 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/models/pet_match_confirmation.py`, `backend/app/utils/pet_match_confirmation.py`, `backend/app/routes/pet_match_confirmations.py`, `backend/app/routes/manual_matching.py`, `backend/app/routes/matches.py`, `backend/app/routes/pets.py`, `backend/app/models/__init__.py`, `backend/app/main.py`, `backend/app/utils/push_categories.py`, `backend/tests/test_manual_matching.py`, `frontend/src/components/ManualMatching/ManualMatchingWorkspace.tsx`, `frontend/src/components/PetMatchConfirmationRequests.tsx`, `frontend/src/pages/citizen/ResidentPet.tsx`, `frontend/src/components/Navbars/ResiNavbar.tsx`, `frontend/src/components/Navbars/BrgyNavbar.tsx`, `frontend/src/components/Navbars/SubdNavbar.tsx`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE — OWNER-FIRST PET MATCHING CONFIRMATION WORKFLOW. Modify the existing Manual Pet Matching feature…" (FREEZE was OFF)
- **Type:** Feature

## Intent

Make the registered owner's explicit YES a prerequisite for any staff final decision on a manual report-to-pet match. Make an owner NO block that pet for the report. Enforce both in the Python backend, not only in the UI.

## Key changes

- New table `pet_match_confirmation_requests`. It stores the report, pet, owner, requesting staff and time, staff message, status, owner response, note and time, cancellation, and the final decision with staff and time, plus the match ID. Rows are never deleted. Pet merges move them to the kept record.
- `app/utils/pet_match_confirmation.py`: statuses, duplicate-request rules, and `enforce_owner_first()` / `record_final_decision()`. `verify_match` calls both, so `/matches/{id}/verify` can't skip the owner either. Pairs without a request keep the existing AI flow unchanged.
- Staff endpoints: `POST /manual-matching/pet-confirmations` (Send Confirmation), `POST /manual-matching/pet-confirmations/{id}/cancel`, `GET /manual-matching/pet-confirmations`. Pet candidates now carry their confirmation state and why Send is unavailable. Manual pet decisions are refused unless the owner said YES.
- Owner endpoints: `GET /pet-match-confirmations/mine`, `GET /pet-match-confirmations/{id}`, `POST /pet-match-confirmations/{id}/respond` (YES / NO). Only the pet's current registered owner can answer. The answer notifies the requesting staff member and the assigned leader, and never finalizes.
- Fix to the earlier Manual Matching change: `log_activity` was called with its default `commit=True` mid-decision. It is now `commit=False`, so each decision, its log row and its audit entry are saved in one transaction.
- Staff UI: candidate pills (Potential Match / Awaiting / Owner Confirmed / Owner Rejected / final). An owner-confirmation panel offers Send Confirmation, Cancel, the owner's answer and the request history. The final buttons (Confirm Verified Match, Reject Match, Request Further Verification) appear only after an owner YES.
- Owner UI: a "Is this your pet?" panel on My Pets, with both photos and details side by side, YES/NO with an optional note, and a confirmation history. Notification and push routing for `pet_match_confirmation` (owner) and `pet_match_confirmation_result` (staff).

## Validation evidence

- `..\.venv\Scripts\python.exe tests/test_manual_matching.py` in `backend/`: 111/111 checks passed. These cover no decision before Send, no decision while awaiting, the verify-endpoint bypass refused, owner-only answers, YES without auto-finalize, the final confirm linking the pet, an owner NO blocking confirm and re-ask, cancel and resend, further verification then reject, history, and push links.
- These scripts exited 0: `test_match_cases`, `test_matches_gaps`, `test_case_claims`, `test_identity_dispute`, `test_match_claim_shortcut`, `test_closed_case_suggestions`, `test_case_review`, `test_merge_many`, `test_gemini_setting`, `test_ai_audit_fixes`, `test_merge_pet_identity`, `test_pet_record_duplicates`, `test_pet_record_access`, `test_push_notifications`.
- `npx tsc -b` in `frontend/`: exit 0. `npx eslint` on `ManualMatching/` and `PetMatchConfirmationRequests.tsx`: exit 0.
- Not done: the app was not started and the screens were not checked in a browser.
