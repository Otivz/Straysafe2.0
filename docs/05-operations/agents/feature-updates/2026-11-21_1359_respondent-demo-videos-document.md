# Respondent demonstration videos: written deliverables

- **Date:** 2026-11-21 13:59 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `docs/04-testing/DEMO_VIDEOS_2026-11-20.md`, `docs/README.md`
- **Authorization:** the developer's request to inspect the codebase and produce two role-based demonstration videos with scripts, a scene-by-scene breakdown, feature lists and a verification checklist.
- **Type:** Polish

## Intent

Record, next to the other test and evidence documents, what the two respondent videos (Resident and Subdivision Leader) show, what was said, and the source evidence for every demonstrated feature, so the videos can be re-checked or re-made.

## Key changes

- New document `docs/04-testing/DEMO_VIDEOS_2026-11-20.md`: how the videos were made (separate demo database and API/Vite instances, demonstration accounts only), the feature inventory, both narration scripts with timestamps, scene breakdowns, demonstrated-feature lists, a code-evidence checklist, limitations and findings.
- `docs/README.md`: one row for the new document in the testing section.
- No source, test, configuration or build file was changed. The MP4 files and the production scripts were written to the untracked folder `scratch/demo-videos/` and are not part of this change.

## Validation evidence

- Both videos were rendered (1920x1080, 30 fps) and checked from frames taken across every scene.
- Each code reference in the checklist was found in the source with `grep` (file and line) during the session.
- The demonstration used a separate local database `straysafe_demo`; `straysafe_subdivision` was not modified.
