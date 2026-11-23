# QR Tag Messages on the Leader's Dashboard: Backstop (Phase 2)

- **Date:** 2026-11-23 08:57 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `backend/app/services/case_summaries.py`, `backend/tests/test_pet_tags_alerts.py`, `frontend/src/admin/live/api.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/live/adapters.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/tests/adminLostPet.test.mjs`, `docs/06-future-proposals/QR_TAG_SCAN_TO_CASE_PLAN_2026-11-23.md`, `docs/04-testing/QR_TAG_SCAN_TO_CASE_TEST_CHECKLIST.md`, `docs/README.md`
- **Authorization:** Developer chose "Backstop (Recommended)" for phase 2, then "apply phase 2".
- **Type:** Feature (phase 2 of the approved plan)

## Intent

QR tag messages go to the owner. The Leader should know about them without being asked to act on each one, and should step in only when the owner has not seen a message.

## Key changes

- **Backend:** each case-list row gets `tag_messages` with counts only:
  - unresolved messages, those the owner has not opened, those from guests, and when the oldest unopened one arrived;
  - the time is sent as UTC with a `Z`, because `pet_tag_scans.created_at` is written in UTC while other times are local;
  - `null` when there are none.
- **Frontend:**
  - `Case.tagMessages` is filled by the adapter, and an opened case keeps it from the list;
  - `tagMessageNudge` and a new attention reason `tag_unseen`, ranked between a request for help and a Barangay to contact, appear only after `TAG_NUDGE_MINUTES` (60) unopened;
  - the label says "(from a guest)" when every message came from a guest;
  - a "N tag messages" badge with a QR icon sits on the pet's row in *Missing and found animals*.
- **Plan and checklist:** phase 2 rewritten as the backstop and ticked, decision 2 recorded, manual section F added.

## Validation evidence

- `tests/test_pet_tags_alerts.py`: 8 new checks pass:
  - no counts without messages;
  - a guest message is counted with its UTC time;
  - the row has no place or note;
  - a neighbour adds to open and unopened but not to guests;
  - once the owner opens the messages, open stays and unopened drops;
  - resolved messages drop out;
  - other cases carry nothing.

  46/47 overall; the one failure, "a turned-off tag drops out of the list", already fails on the committed code.
- `frontend/tests/adminLostPet.test.mjs`: 13/13, including the new rule test:
  - no attention item at 30 minutes, an item at 90 minutes;
  - the guest wording;
  - nothing once opened or once the case is closed;
  - the counts kept after opening the case.
- Full frontend unit suite: 203 pass, 18 fail; the committed code gives 202 pass and the same 18 failures. Backend `test_case_notes_queue`, `test_lost_pet_registration_first` and `test_merged_concerns_case_management`: identical results with and without this change.
- `npx tsc -b`: exit 0. ESLint on the five changed source files: no findings.
- Not checked in a browser.
