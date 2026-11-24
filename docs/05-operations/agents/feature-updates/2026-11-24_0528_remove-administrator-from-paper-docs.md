# Remove the Administrator Role from the Paper-Facing Documents

- **Date:** 2026-11-24 05:28 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `docs/02-project/SYSTEM_FEATURES_AND_USERS_2026-11-24.md`, `docs/01-system/AI_FEATURES_AND_PROCESS.md`, `docs/01-system/REPORT_LIFECYCLE_AND_FEATURES.md`, `docs/README.md`
- **Authorization:** Developer: "Remove the administrator even in the future implementation".
- **Type:** Polish (documentation only)

## Intent

The three documents written for the paper described an Administrator role "reserved for a future implementation". The developer does not want that role in the system description, now or later.

## Key changes

- **Users list:** the Administrator row is removed, and the Visitor is renumbered. A sentence says the system has no administrator role: Leader accounts are created by the developer at set-up, and the settings an administrator would have managed (the Gemini switch, the matching weights, the reporting radius) are in the system settings and changed by the developer, not from a screen.
- **Features list:** "Leader account management (Administrator)" now says accounts are created by the developer, with no in-app account administration screen.
- **AI guide:** the Gemini switch and the matching weights are described as system settings changed by the developer.
- **Lifecycle guide:** the Administrator row is removed, and "(or the Administrator)" is removed where it appeared next to the assigned officer and reopening.
- **Not changed:** the application code still contains a role id 4 and routes that check for it, and the older documents (`overview.md`, `MODULE_WORKFLOWS_AND_SPECIFICATIONS.md`, `CASE_WORKFLOW_BACKEND.md` and others) still describe the Administrator. Removing the role from the code and those documents is a separate, larger change and has not been made.

## Validation evidence

- A search of the three documents shows the word "administrator" only in the sentences that say there is none. Strict documentation audit run after the change; no finding for these files. No code, tests, configuration or database touched.
