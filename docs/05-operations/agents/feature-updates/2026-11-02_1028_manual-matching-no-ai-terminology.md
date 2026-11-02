# Remove AI terminology and scores from manual matches

- **Date:** 2026-11-02 10:28 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/routes/claims.py`, `backend/app/schemas/pet_claim.py`, `backend/app/routes/manual_matching.py`, `backend/app/routes/reports.py`, `backend/tests/test_manual_matching.py`, `frontend/src/components/AIPotentialMatchesList.tsx`, `frontend/src/components/Modals/MergeReportModal.tsx`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/src/pages/Barangay_Staff/BrgyPetClaims.tsx`, `frontend/src/pages/Subd_Leaders/SubdPetClaims.tsx`, `frontend/src/pages/citizen/PetClaimsDashboard.tsx`, `frontend/src/components/DisputeMatchHistory.tsx`, `frontend/src/components/Chat/ReportChatDrawer.tsx`, `docs/01-system/MANUAL_REPORT_MATCHING.md`, `docs/README.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE – Remove All AI Terminology and Analysis from Manual Matching". FREEZE was OFF. No Git commits.
- **Type:** Fix

## Problems found

Earlier work (`2026-11-01_2158_manual-matching-record-display.md`) already covered three screens: the staff review modal, the owner's My Pets request and the resident match review page. A scan of every screen that shows match data found these remaining leaks:

1. **Report match list:** the status badge fell through to **"AI Suggested"** for any unlisted status, including PENDING_VERIFICATION, which is the status of every open manual record.
2. **Pet claims (root cause on the server):** a claim copied the manual record's placeholder score (0, or **50** from Send Confirmation) into `match_score`. The Barangay and Subdivision claims pages then showed it as **"AI similarity 50%"**:
   - in the AI match score badge;
   - in a "probability" verdict;
   - in the Match Analysis table, whose colour and species checks also used AI-detected fallbacks;
   - in the AI score filter;
   - in the average, where unscored claims also counted as 0%.
3. **Resident claims dashboard:**
   - "AI Matching system detected a similarity score…" for every claim;
   - an "AI Sighting Markers" box showing the registered pet's own species and breed as if they were the sighting's;
   - an "AI Sighting Confidence Metrics" card with **hardcoded** values ("94% PROB", "CONFIRMED", "MATCHED").
4. **Duplicate banner** (Subdivision report view) and **merge dialog** showed "% AI match" and the AI note for manual report pairs.
5. **Direct match chat** decided "manual" from a score of 0, not from the record's method.
6. **Manual Matching candidate pairs and dispute history** sent or printed the placeholder score as "AI similarity".
7. **Stored text:** manual records were saved as "No AI similarity score was produced", and Send Confirmation stored a score of 50.

## Changes

- **Server:**
  - Claim responses carry `matching_mode` and hide `match_score` for manual matches. This is response-only; stored claims are not rewritten.
  - A new claim never copies a manual score.
  - Manual Matching pairs and dispute history carry `matching_mode`, with no score for manual records.
  - New manual records are stored with score 0 and neutral wording.
- **Frontend:** every listed screen decides by the record's saved method (`isManualMatchRecord` / `matching_mode`):
  - manual badge and "Staff-identified match" in place of scores;
  - the claims Match Analysis replaced by a short staff-matching note for manual claims;
  - manual claims kept out of the score buckets and the average, with a "Staff-identified (manual)" filter;
  - resident: the actual sighting details, a manual progress step, no metrics card for manual claims.
- **AI records** keep their AI analysis and real score. The three hardcoded tiles were removed for all claims because they were not data; the real "Visual Similarity" stays for AI claims.

## Validation evidence

- **Backend:**
  - `tests/test_manual_matching.py`: 147/147. Six new checks cover:
    - Send Confirmation stores score 0 with neutral text;
    - a manual candidate pair has no score and says manual;
    - a claim from a manual match is manual with no score, even one saved with 50, and isn't rewritten by reading it;
    - dispute history is manual with no score;
    - AI history keeps score 83.
  - Every backend test script that sets its own SQLite database ran: **101 passed, 0 failed**. They ran with `DATABASE_URL=sqlite:///:memory:` and the Gemini, SMTP, Cloudinary and VAPID secret variables set empty. The 14 scripts that don't name SQLite were not run.
- **Frontend:**
  - `npm run build` passed.
  - `node --test tests/*.test.mjs`: 86/86.
  - ESLint: no findings on changed lines.
  - Browser: `phase5Pets.browser.mjs`, which renders both claims pages and the match review, passed 26 scenarios; `claimFees.browser.mjs` passed 14. Both ran on a local Vite server on port 5175, stopped afterwards.
- **Not verified:** a browser run with real manual-match claims (the fixtures carry no `matching_mode`).
