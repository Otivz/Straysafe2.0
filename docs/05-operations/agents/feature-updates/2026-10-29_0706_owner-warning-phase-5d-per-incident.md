# Owner warnings Phase 5D: one warning per incident, from the follow-up

- **Date:** 2026-10-29 07:06 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/warnings.py`, `backend/tests/test_owner_warning_rules.py`, `frontend/src/components/OwnerFollowUpCard.tsx`, `frontend/src/utils/ownerFollowUp.ts`, `frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`, `frontend/tests/ownerWarnings.browser.mjs`, `frontend/tests/fixtures/ownerWarnings.tsx`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "Yep 5d".
- **Type:** Feature

## Intent

Phase 5D of the owner follow-up plan: the leader warns once per verified incident (the observed report, and each repeated incident logged on it), from the follow-up card, with the observation dates filled in. An owner without an account gets a logged verbal warning.

## Key changes

- **Follow-up card, "Owner warnings":**
  - There is one row per incident: the observed report, then each logged repeated incident. Each row shows its warnings (tier, violation, date, status), or "Issue warning" while it has none.
  - The amber "Issue owner warning" button targets the observed report.
  - After the follow-up ends, the warnings stay listed.
- **Warning form (`SubdViewReport.tsx`):**
  - Opened from the card, it sends the chosen incident's report number. The header names a repeated incident's report.
  - The description is prefilled with the observation's start and end dates and the instructions to the owner; the leader can edit it.
  - The tier suggestion from the pet's earlier warnings is unchanged, so a repeat gets the next tier.
  - The server's existing duplicate check (same report, pet and violation) gives one warning per incident.
- **Owner without an account:** "Log verbal warning" (Phone or In person) saves a contact entry whose note starts with "Verbal warning:". It is not an `OwnerWarning`.
- **Server (`routes/warnings.py`), two added refusals:**
  - A leader cannot warn on a report of another subdivision (403).
  - A warning about a registered pet must go to that pet's owner (400).

## Validation evidence

- `backend/tests/test_owner_warning_rules.py`: 21 of 21. It covers: the observed report and a repeated incident each get a warning, a second warning for the same incident is refused, and the subdivision and owner refusals.
- `backend/tests/test_trust_rule.py` 22 of 22 and `test_admin_011_warnings.py` pass. Full isolated backend suite: 81 of 81 files.
- `frontend/tests/ownerWarnings.browser.mjs` at 390 and 1280 px, all API calls mocked: pass. It covers: the incident list with the existing warning, "Issue warning" for the repeat opening the form for Report #5 with the dates prefilled, and the verbal warning saved as a Phone entry.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors. `node --test tests/*.test.mjs`: 46 of 46. ESLint: 135 problems before and after on the changed files (none new).
- Not checked on a real case in the browser (5G).

## Noted, not changed

- `POST /warnings/` with a `pet_id` on a report that has none links that pet to the report (`rep.pet_id = warning_in.pet_id`, after `require_case_pet`). This does not go through the owner-confirmation rule used by other link paths. The leader's form sends the report's own pet, so it is not reached from the follow-up. It is reported here for review.
