# QR Tag Message Moves the Missing-Pet Case Forward (Phase 1)

- **Date:** 2026-11-23 08:00 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/pet_tags.py`, `backend/tests/test_pet_tags_alerts.py`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/README.md`
- **Authorization:** Developer: "Okay go but leave first the live location", and "yes" to adding the guest rules to the plan.
- **Type:** Feature (phase 1 of the approved plan)

## Intent

When someone sends a "found it" message from a pet's QR tag while the pet has an open lost-pet notice, the case shows it: a history line, and for a signed-in sender the case moves to In progress. A scan never recovers or closes anything.

## Key changes

- `record_found` calls the new `_case_reacts` after storing the message:
  - **guest** (not signed in): one neutral history line, "A guest (not signed in) scanned the pet's QR tag and left a message for the owner.", and no status change (a lead only);
  - **signed-in sender:** "A neighbor (or Someone, for a non-resident) scanned the pet's QR tag...", then `advance_case` to at least In progress, which never goes backwards or out of Closed and writes its own audit entry;
  - a **closed** case, or a pet with **no open notice**, is left untouched. The owner is still notified as before.
- The history line names nobody and carries no phone, note or place, because residents can read the timeline.
- Messages still never become neighbour-visible sightings.
- Plan: the owner's third choice ("This isn't real / not my pet"), the guest rules, and live location left for later were added; status set to phase 1 built.

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 8 new checks pass (guest line and no status change, no names or contact in the line, neighbour line and In progress, a repeat adds only its line, closed case untouched, still no sightings). 32/33 overall; the one failure, "a turned-off tag drops out of the list", fails the same way on the committed code (tags were made permanent, so turning one off returns 405).
- `tests/test_pet_tags.py` (31/42), `tests/test_pet_tags_public.py` (63/69) and `tests/test_lost_pet_lifecycle.py` (KeyError `report_id`): the failure lists are identical with and without this change, checked by running both versions.
- Not checked in a browser; no database change.
