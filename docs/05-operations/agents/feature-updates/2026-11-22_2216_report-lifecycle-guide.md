# Report Lifecycle and Features Guide

- **Date:** 2026-11-22 22:16 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `docs/01-system/REPORT_LIFECYCLE_AND_FEATURES.md` (new), `docs/README.md`
- **Authorization:** Developer request "Create me an overall process of each report, how it start and how will it closed put it in an md file and how every feature works".
- **Type:** Polish (documentation only)

## Intent

One readable map of a report from filing to closing, with how each feature works, so a new reader does not have to piece it together from many separate documents.

## Key changes

- New `docs/01-system/REPORT_LIFECYCLE_AND_FEATURES.md`: the whole flow in a diagram; who does what; how a report starts (accounts, the three resident entries, the Leader filing for someone, what the server does at once, claiming); the five stages; every feature in a short section with a link to its detailed document; automatic versus decided by a person; how each kind of report ends and what closes with it; reopening; retired features; known gaps.
- Built from the existing system documents plus a re-read of `routes/reports.py` (filing, automatic priority), `utils/dangerous_rules.py`, `tasks/unassigned_checker.py` and the Resident and Leader route files. The one point not re-checked in code, the unclaimed-report reminder threshold being settable, is marked in the document.
- `docs/README.md`: indexed in the system-documents table and in this change's row.

## Validation evidence

- Strict documentation audit run after the change; no finding for the new file (the 17 findings already present are in other files).
- No source code, tests, configuration or database touched.
