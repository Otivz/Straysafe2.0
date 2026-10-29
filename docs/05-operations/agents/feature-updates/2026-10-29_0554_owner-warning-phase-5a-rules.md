# Owner warnings Phase 5A: backend rules

- **Date:** 2026-10-29 05:54 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/routes/warnings.py`, `backend/app/utils/owner_followups.py`, `backend/app/routes/owner_followups.py`, `backend/tests/test_owner_warning_rules.py` (new), `backend/tests/test_owner_followups.py`, `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "go 5A But record it also in the md".
- **Type:** Feature

## Intent

Phase 5A of the owner follow-up plan: the server rules for owner warnings and observations decided on 2026-10-29 (plan section 10, questions 6, 10 and 11; section 15).

## Key changes

- **Only the Subdivision Leader issues owner warnings.** `POST /warnings/` refuses Barangay staff and administrators (403). They can still read the warning history. No Barangay or administrator page had an issue button.
- **A Rabies Risk report (category 3) cannot be observed.** Starting a follow-up is refused (400) and the message says to escalate it to the Barangay.
- **Caution:** while it is observing, the staff view of a follow-up carries `caution` for an Injured (1) or Aggressive (2) report, or one with High priority. The text says the leader can escalate at any time. The owner's view does not include it. The banner that shows it is step 5E.
- **One observation per pet:** a follow-up for a pet that already has one under observation on another report is refused (409, naming that report and saying to log it there as a repeated incident). Once that follow-up ends, the pet can be observed again.
- The plan's Phase 5A checklist and status lines are ticked.

## Validation evidence

- `backend/tests/test_owner_warning_rules.py`: 16 of 16.
- `backend/tests/test_owner_followups.py`: 69 of 69, after giving its later follow-ups their own pets (it used one pet for several open follow-ups, which the new rule refuses).
- `backend/tests/test_trust_rule.py`: 22 of 22 (a leader still issues warnings).
- Full isolated backend suite: 79 of 79 files.
- No frontend change. Not checked in a browser.
