# Junk files removed and `scratch/` ignored

- **Date:** 2026-10-27 05:04 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `.gitignore`; removed from the repository: `scratch/manuscript-review/` (15 files: `extracted.txt`, `pages.json`, 13 page images); deleted locally (never tracked): `backend/stray_safe.db`, `backend/straysafe.db`, `backend/test.db`, the empty `uploads/` folder; this record `docs/05-operations/agents/feature-updates/2026-10-27_0504_remove-junk-files.md`.
- **Authorization:** the developer's request "How about the junk files?", with "scratch/" and "Empty files" chosen from the offered list (not chosen: `backend/scratch/` and `backend/check_db.py`, the root `package.json`).
- **Type:** Polish

## Intent

Remove leftovers that do not belong in the project, and stop new working files from being committed.

## Key changes

- `scratch/manuscript-review/`: text and images extracted from the manuscript PDF during the Chapter 1 check. They were committed in `775e571` ("tunnel") and are now removed from the working tree and staged as deleted; they remain in Git history.
- `.gitignore`: `/scratch/` added (root folder only, so `backend/scratch/` is not affected). The 19 other files under `scratch/` that earlier commits already track stay tracked; they include evidence cited by `docs/04-testing/README.md` and `docs/05-operations/agents/CLAUDE_HANDOFF.md` (screenshots, the Claim #1 before-repair snapshot, the regression wrapper), so they were kept. New files there are ignored.
- Three 0-byte SQLite files (old leftovers, already ignored by Git) and the empty root `uploads/` folder deleted.

## Validation evidence

- `git status`: 15 staged deletions under `scratch/manuscript-review/`, `.gitignore` modified; nothing else changed by this step.
- The manuscript PDF itself was not touched.
