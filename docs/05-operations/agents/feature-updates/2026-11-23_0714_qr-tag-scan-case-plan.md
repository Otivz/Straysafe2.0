# QR Tag Scan Moves the Case Forward: Plan Document

- **Date:** 2026-11-23 07:14 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md` (new), `docs/README.md`
- **Authorization:** Developer asked whether a scan moving the case is a good feature; after the answer and the offer of a short plan first, replied "Yes".
- **Type:** Polish (documentation only)

## Intent

Record the proposal before any code: what a tag scan does today, what it should additionally do for a pet with an open lost notice, and what it must never do.

## Key changes

- New proposal: history line, lift to in progress, a Dashboard item, and the owner's one-tap "he's home"; a scan never recovers or closes a case, and is never made a public sighting (matching the existing rule in `record_found`).
- Phases, four decisions for the developer, and a checklist. No database change is needed.
- `docs/README.md` indexes the proposal and this record.

## Validation evidence

- Read `backend/app/services/pet_tags.py` (`record_found`) to describe today's behavior. No code, tests, configuration or database touched.
