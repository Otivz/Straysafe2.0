# Possible Pet Owners: Lost and QR Tag Bonuses, Subdivision-Neutral Location, No Test Shortcut

- **Date:** 2026-11-22 21:11 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/owner_verification.py`, `backend/tests/test_possible_owners_ranking.py`, `backend/tests/test_owner_verification.py`, `docs/01-system/POSSIBLE_OWNER_VERIFICATION.md`
- **Authorization:** Developer request "OKay goooo 6,5,2" after the matching review in chat (items 6: remove the test shortcut, 5: remove subdivision-specific rules, 2: Lost and QR tag as bonuses).
- **Type:** Fix

## Intent

Make the Possible Pet Owners ranking use the strongest evidence (the owner reported the pet lost; someone scanned its QR tag), work the same in every subdivision, and stop production code from behaving differently for one test's data.

## Key changes

- **Item 6:** removed `is_synthetic_fixture`, which skipped the subdivision-wide candidate list and the species filter whenever a stored match had the explanation "Same breed and nearby.".
- **Item 5:**
  - removed the corner-lot rule (lot numbers 1, 2, 14, 15, 16) and the "Selera Homes" fallback text (now the owner's or report's subdivision name);
  - street matching reads names of up to three words with common suffixes (Street/St, Avenue/Ave, Road/Rd, Drive/Dr, Lane/Ln, Extension/Ext) and matches whole words only;
  - block matching accepts `Block` and `Blk` and compares the number.
- **Item 2:**
  - the "Other Details" 5% weight is gone (it gave every pet 65 points it had not earned);
  - `_owner_signals` reads, in two queries, each candidate's latest lost-pet report and any QR tag "found" message from 3 days before the report onward;
  - `_apply_signals` adds the bonuses to the live score and to stored matcher scores alike: Lost +15 (+20 when the lost-pet report is within 14 days of this report); QR tag found message +25 with a floor of 90, and those pets sort first;
  - the classification can only go up; the reasons start with the signal, and a "Lost report & QR tag" attribute row (no score, weight 0) appears only when a signal exists;
  - the result carries `matching.signals` (`lost`, `lost_since`, `tag_found_at`, `bonus`). The frontend type already accepts any attribute key, so no frontend change.
- Tests:
  - `test_possible_owners_ranking.py`: the stored-match fixture is now checked among all the subdivision's dogs; a new `test_signals_and_location_text` covers street parsing, the Lost bonus, a recent tag message ranking first, an old tag message being ignored, and unchanged pets.
  - `test_owner_verification.py`: its pets are marked Lost, so the expected stored score is now 82 + 15 with the extra row.

## Validation evidence

- `../.venv/Scripts/python.exe tests/test_possible_owners_ranking.py`: both test functions pass.
- `tests/test_merged_sighting_review.py`: 16/16.
- `tests/test_owner_verification.py`: passes the changed check, then stops at "the editable template names the subdivision administration", which failed the same way before this change (the template no longer includes the subdivision name).
- Not checked in a browser; no database change.
