# Owner warnings Phase 5B: repeated report detection (backend)

- **Date:** 2026-10-29 06:04 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `backend/app/utils/owner_followups.py`, `backend/app/utils/case_closure.py`, `backend/app/routes/owner_followups.py`, `backend/app/routes/reports.py`, `backend/app/schemas/report.py`, `backend/tests/test_owner_repeated_reports.py` (new), `docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md`, this record
- **Authorization:** the developer: "5b" (after "go 5A But record it also in the md").
- **Type:** Feature

## Intent

Phase 5B of the owner follow-up plan: when a pet under observation is reported again, the handling leader is told and can log it as a repeated incident.

## Key changes

- **Detection on every path:** a save hook (`after_flush` / `after_flush_postexec` in `utils/case_closure.py`) checks each report whose `pet_id` was just set. When that pet is under observation on another report, `notify_repeated_report` sends the handling leader one in-app notice: "Repeated report: Report #N", linked to the observed report. A report merged into another one (`duplicate_of_report_id`), a report already logged on the follow-up, and a pet with no observation get no notice. Unlinking and linking it again does not send a second notice.
- **Shown on both reports:**
  - The report detail returns `observing_followup_report_id`, only to the leader of that subdivision and the administrator.
  - The follow-up's staff view returns `unlogged_repeat_report_ids`: other reports about the pet that are not logged and not merged, and are either still open or created after the observation started.
- **Logging:** a "Repeated incident" entry now needs its report (not the observed report itself: 422), and the same report cannot be logged twice (409).
- The frontend banner and the one-click button are step 5E. No frontend change.

## Validation evidence

- `backend/tests/test_owner_repeated_reports.py`: 17 of 17. It covers: no notice before an observation, one notice for a repeat, no second notice after relinking or logging, the field visible to the leader and hidden from the reporter, a merged report and another pet not counted, and the logging refusals.
- Full isolated backend suite: 80 of 80 files.
- Not checked in a browser (no frontend change).
