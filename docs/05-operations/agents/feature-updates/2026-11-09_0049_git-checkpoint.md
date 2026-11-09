# Local Git checkpoint and SQL dump ignore rule

- **Date:** 2026-11-09 00:49 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `.gitignore`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-09_0049_git-checkpoint.md`
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Safe Local Git Checkpoint" (create one local commit of the completed work, push nothing, keep `straysafe_subdivision.sql` out of Git and on disk). FREEZE was OFF.
- **Type:** Polish

## Intent

Make the completed Admin and Resident UI work recoverable from Git before the backend and database refactoring starts, and make sure the local database dump can never be committed by accident.

## Key changes

- **`.gitignore`:** the exact-path rule `/straysafe_subdivision.sql`, with a comment. `git check-ignore` confirms it matches that one file and neither `Database3.3_subdivision.sql` nor `Database3.4_subdivision.sql`. The dump was not read for this, not modified and not moved.
- **One local commit** (`chore: checkpoint approved StraySafe UI and repository cleanup`) of the work that had only existed in the working tree: the Admin and Resident previews, the shared `frontend/src/preview/` code, the map integration, the Analytics rename, the repository cleanup, six change records (this one included) and the database file map. Files were staged by path, never with `git add -A`. Nothing was pushed, no branch was created and no existing commit was changed.

## What was checked before staging

- All 164 files that went into the commit (161 new, 3 modified; the 7 deletions have no content) were scanned. There are no private keys, API tokens, JWTs, connection strings, binaries or generated artifacts.
- The only credential-like literals are the two fake sample passwords of the development-only previews (`PREVIEW_ACCOUNT` in `frontend/src/admin/auth/gateway.ts` and `SAMPLE_ACCOUNT` in `frontend/src/resident/data/seed.ts`). They unlock mock data only and are excluded from production builds. Every email address is on a reserved example domain, and the phone numbers are obvious sample values.
- No email, phone number, password hash or `users` text value from `straysafe_subdivision.sql` occurs in any file of the commit.

## Not changed, but worth a decision

The four tracked schema and seed files (`Database3.3.txt`, `Database3.3_subdivision.sql`, `Database3.4_subdivision.sql`, `Database3.4_subdivision.txt`) contain `INSERT INTO users` seed rows: email addresses, Philippine mobile numbers and bcrypt password hashes, the same values as in the untracked dump. They were committed earlier. This checkpoint neither adds nor changes them, and removing them now would not remove them from history or from any copy on a remote. Whether to scrub them, change those accounts' passwords or rewrite history is a separate decision.

## Validation evidence

- `git check-ignore -v straysafe_subdivision.sql` reports the new rule; the dump is still on disk with the same size and SHA-256 as before.
- The commit was inspected before it was made: the staged paths, their count, and the absence of `straysafe_subdivision.sql` and of any `.env` file. The results are in the final report of this task. No tests were re-run, because no application file changed.
