# Owner warnings: decisions 8 to 11 and Phase 5 added to the follow-up plan

- **Date:** 2026-10-29 04:13 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record (no code change)
- **Authorization:** the developer's answers ("8 … iT HOLDS the animal", "9 … I think yes, but what do you think", "10 … wdym", "11 … no i think"), then "put it in our md phases and plan before implementing what else".
- **Type:** Polish (documentation)

## Intent

Record the developer's answers and the recommendations they asked to record, and add an ordered Phase 5 checklist for the owner warning workflow before any implementation.

## Key changes

- Section 10:
  - Question 8 decided by the developer: the Barangay holds the animal, using the existing escalation, rescue and holding path.
  - Question 11 decided by the developer: a warning is optional.
  - Questions 9 and 10 record the recommendations the developer asked to put in the plan: the owner confirms by default, with a leader-verified fallback; a caution banner for Injured, Aggressive or High priority, and no observation for Rabies Risk.
  - New open questions: 12 (the consequences or fines a warning names) and 13 (which methods count for the leader's identity check, and how long to wait).
- Section 15: the decisions, plus two facts checked in the code. Only leader pages issue warnings. Linking an owned pet without the owner's confirmation is refused (`require_direct_pet_link`). The list of changes now points to Phase 5.
- Section 9: new Phase 5 (5.0 before code, then 5A backend rules, 5B repeated report detection, 5C leader-verified identity, 5D warning form, 5E banners, 5F pet record history, 5G check and documents). Nothing is built.

## Validation evidence

- Read on 2026-10-29: `backend/app/utils/case_groups.py` (`require_direct_pet_link`), `backend/app/routes/reports.py` (`link-pet`, status `pet_id`), `backend/app/routes/pets.py` (create from report), `backend/app/routes/matches.py` (`link_confirmed_pet_match`, `request_owner_verification`), and a search of `frontend/src` for warning submissions.
