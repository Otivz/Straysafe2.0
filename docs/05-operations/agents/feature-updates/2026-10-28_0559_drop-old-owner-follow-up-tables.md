# Old owner follow-up tables dropped from the local database

- **Date:** 2026-10-28 05:59 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `docs/05-operations/agents/feature-updates/2026-10-28_0559_drop-old-owner-follow-up-tables.md` (no code change; local MySQL database only)
- **Authorization:** the developer's "yes" to dropping the two empty tables, after reporting HTTP 500 on every `/owner-followups` request.
- **Type:** Fix

## Intent

Every owner follow-up request failed with HTTP 500 in the running app.

## Cause

The local database already had `owner_followups` and `owner_followup_contacts` from the first, removed attempt (the backend was restarted while it existed; see `2026-10-28_0412_remove-owner-follow-up-code`). Startup (`Base.metadata.create_all`) creates only missing tables and never changes existing ones, so the tables kept the old columns (for example `suspected_owner_name`, `owner_confirmed_at`) and lacked the new ones (`owner_name`, `acknowledged_at`, `extended_at`, `photo_url`, `related_report_id`, and the new status values).

## Key changes

- Checked both tables were empty and that no other table referenced them, then ran `DROP TABLE owner_followup_contacts; DROP TABLE owner_followups;` on the local database. Nothing else was touched.
- The developer restarts the backend, which creates both tables with the current design. `Database3.3.txt` already has the current design, so a reset is not affected.

## Validation evidence

- Before: 0 rows in each table, no foreign keys from other tables. After: neither table exists. The recreation on restart is to be confirmed by the developer (the follow-up pages load without HTTP 500).
