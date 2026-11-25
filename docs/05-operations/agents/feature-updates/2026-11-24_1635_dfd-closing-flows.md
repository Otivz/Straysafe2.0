# DFD: Case Closing Flows Added

- **Date:** 2026-11-24 16:35 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `STRAY-SAFE-2.0-DFD.md`, `docs/README.md`
- **Authorization:** Developer: "dfd first update my dfd", after a review of the thesis PDF found the closing steps missing from the DFD.
- **Type:** Polish (documentation only)

## Intent

Chapter 1 and test case TC-CLO12 say closing a case ends its follow-ups, makes its conversation read-only and stops its alerts, but the DFD only showed inputs from those stores.

## Key changes

- Process `5.1` now writes "Closed Follow-Ups & Read-Only Conversation" to `D6` and "Case Closure Alert & Stopped Alerts" to `D9`, and reads "Open Follow-Ups & Conversation" and "Active Case Alerts". Referrals, warnings and claims stay as history, so `D7` and `D8` remain read-only here.
- A row for this was added to the "What changed" table.
- The resident list and approvals (`1.4`), the claim step and 30-minute reminder (`3.3`) were already in the file from the earlier update.

## Validation evidence

- The conversation turning read-only on closing is in `backend/app/services/case_messaging.py` (line 295).
- All 6 diagrams render in Chrome. Every Level 0 term is covered at Level 1 (0 uncovered), and all 20 processes have an input and an output.
- Not done: exporting the diagrams as images for the thesis figures, and deciding the "pathways" wording of `3.3`.
