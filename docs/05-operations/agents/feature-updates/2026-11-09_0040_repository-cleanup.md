# Repository cleanup: generated and duplicate files removed, shared UI helpers re-homed

- **Date:** 2026-11-09 00:40 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/.vite/deps/_metadata.json` (deleted), `frontend/.vite/deps/package.json` (deleted), `backend/assets/dog_and_cat_running.gif` (deleted), `backend/assets/straysafe_dog_running.gif` (deleted), `backend/assets/straysafe_running_cat.gif` (deleted), `package.json` (deleted), `package-lock.json` (deleted), `frontend/src/preview/lib/format.ts` (moved from frontend/src/admin/lib/format.ts), `frontend/src/preview/lib/cx.ts` (moved from frontend/src/admin/lib/cx.ts), `frontend/src/preview/lib/errors.ts` (moved from frontend/src/admin/lib/errors.ts), `frontend/src/preview/lib/previewFlags.ts` (moved from frontend/src/admin/lib/previewFlags.ts), `frontend/src/preview/styles/tokens.css` (moved from frontend/src/admin/styles/tokens.css), `.gitignore`, `docs/README.md`, `frontend/src/admin/lib/hooks.ts`, `frontend/src/resident/styles/resident.css`, `frontend/src/preview/lib/hooks.ts` (new), `docs/05-operations/database/DATABASE_FILES_AND_MIGRATIONS.md` (new), `docs/05-operations/agents/feature-updates/2026-11-09_0040_repository-cleanup.md` (new), `frontend/src/admin/AdminRoot.tsx` (imports), `frontend/src/admin/auth/gateway.ts` (imports), `frontend/src/admin/components/Badge.tsx` (imports), `frontend/src/admin/components/Button.tsx` (imports), `frontend/src/admin/components/Dialog.tsx` (imports), `frontend/src/admin/components/Evidence.tsx` (imports), `frontend/src/admin/components/Menu.tsx` (imports), `frontend/src/admin/components/PetAvatar.tsx` (imports), `frontend/src/admin/components/Timeline.tsx` (imports), `frontend/src/admin/components/ToastProvider.tsx` (imports), `frontend/src/admin/components/charts.tsx` (imports), `frontend/src/admin/components/form.tsx` (imports), `frontend/src/admin/components/layout.tsx` (imports), `frontend/src/admin/data/DataProvider.tsx` (imports), `frontend/src/admin/data/selectors.ts` (imports), `frontend/src/admin/dialogs/ActionDialogs.tsx` (imports), `frontend/src/admin/dialogs/BasicDialogs.tsx` (imports), `frontend/src/admin/dialogs/ClosureDialogs.tsx` (imports), `frontend/src/admin/dialogs/CoordinationDialogs.tsx` (imports), `frontend/src/admin/dialogs/ReviewDialogs.tsx` (imports), `frontend/src/admin/layout/NotificationsDrawer.tsx` (imports), `frontend/src/admin/layout/PreviewBar.tsx` (imports), `frontend/src/admin/lib/navGuard.ts` (imports), `frontend/src/admin/lib/useSubmit.ts` (imports), `frontend/src/admin/pages/CasesPage.tsx` (imports), `frontend/src/admin/pages/CommunityPage.tsx` (imports), `frontend/src/admin/pages/DashboardPage.tsx` (imports), `frontend/src/admin/pages/NoticeEditorPage.tsx` (imports), `frontend/src/admin/pages/PetDetailsPage.tsx` (imports), `frontend/src/admin/pages/PetsPage.tsx` (imports), `frontend/src/admin/pages/ProfilePage.tsx` (imports), `frontend/src/admin/pages/ReportsPage.tsx` (imports), `frontend/src/admin/pages/ResidentDetailsPage.tsx` (imports), `frontend/src/admin/pages/ResidentsPage.tsx` (imports), `frontend/src/admin/pages/SettingsPage.tsx` (imports), `frontend/src/admin/pages/case/ActionsTab.tsx` (imports), `frontend/src/admin/pages/case/AssessmentTab.tsx` (imports), `frontend/src/admin/pages/case/CaseDetailPage.tsx` (imports), `frontend/src/admin/pages/case/OverviewTab.tsx` (imports), `frontend/src/resident/ResidentRoot.tsx` (imports), `frontend/src/resident/auth/gateway.ts` (imports), `frontend/src/resident/components/Cards.tsx` (imports), `frontend/src/resident/components/Chrome.tsx` (imports), `frontend/src/resident/components/Sheet.tsx` (imports), `frontend/src/resident/components/ToastProvider.tsx` (imports), `frontend/src/resident/components/form.tsx` (imports), `frontend/src/resident/components/ui.tsx` (imports), `frontend/src/resident/data/DataProvider.tsx` (imports), `frontend/src/resident/data/reducer.ts` (imports), `frontend/src/resident/lib/hooks.ts` (imports), `frontend/src/resident/lib/publicText.ts` (imports), `frontend/src/resident/pages/HomePage.tsx` (imports), `frontend/src/resident/pages/account/NotificationsPage.tsx` (imports), `frontend/src/resident/pages/account/ProfilePage.tsx` (imports), `frontend/src/resident/pages/community/ClaimStatusPage.tsx` (imports), `frontend/src/resident/pages/community/NoticePage.tsx` (imports), `frontend/src/resident/pages/community/SightingPage.tsx` (imports), `frontend/src/resident/pages/pets/PetDetailsPage.tsx` (imports), `frontend/src/resident/pages/report/DetailsPage.tsx` (imports), `frontend/src/resident/pages/report/ReviewPage.tsx` (imports), `frontend/src/resident/pages/reports/MyReportsPage.tsx` (imports), `frontend/src/resident/pages/reports/ReportDetailsPage.tsx` (imports)
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Repository Organization & Safe Cleanup" (organize the repository, remove only verified unnecessary files, prepare a maintainable structure for backend and database integration, preserve `straysafe_subdivision.sql`). FREEZE was OFF.
- **Type:** Polish

## Intent

Prepare the repository for backend and database integration without changing behaviour: remove files that are provably generated or duplicated, remove a hidden dependency between the two UI previews, and write down where the database files live and how the schema changes today.

## Before anything changed

`git status` showed the completed Admin, Resident and preview work as **untracked** (158 files), plus two modified tracked files, so Git could not have recovered it. A byte-verified copy was made outside the repository first, with a SHA-256 manifest, and every file removed below was copied there too. Nothing was committed, staged or pushed. The work is still uncommitted: commit it when ready.

## Removed

All seven files were tracked (so Git history still has them), unmodified, and not referenced by any code, build file, CI workflow, script or document.

| Files | Why it is safe |
|---|---|
| `frontend/.vite/deps/_metadata.json`, `frontend/.vite/deps/package.json` | Vite's dependency-optimizer cache (`"optimized": {}`), committed once by accident (commit `a095403`). Vite writes its cache under `node_modules/.vite` (`vite.config.ts` has no `cacheDir`), and nothing refers to `frontend/.vite`. `.gitignore` now ignores `.vite/`. |
| `backend/assets/dog_and_cat_running.gif`, `straysafe_dog_running.gif`, `straysafe_running_cat.gif` (about 38 MB) | Byte-identical to the copies in `frontend/src/assets/`, which stay. No backend code, template, script, CI file or document uses `backend/assets` or these file names. The only user is `frontend/src/components/StraySafeLoading.tsx`, which imports the frontend copy. |
| `package.json`, `package-lock.json` (repository root) | A stray one-dependency manifest (`lucide-react`) added by an earlier commit (`74d56a5`). `frontend/package.json` declares its own `lucide-react`, there is no root `node_modules`, and `setup.md`, the operations README and the APK workflow install in `frontend/` only. |

## Re-homed: shared UI helpers

The Resident preview imported six modules from inside the Admin preview. None of them is Admin-specific, so they moved to `frontend/src/preview/`, the shared folder both UIs already use for the map code:

- `admin/lib/format.ts`, `cx.ts`, `errors.ts`, `previewFlags.ts` moved to `preview/lib/`, content unchanged.
- `admin/styles/tokens.css` moved to `preview/styles/tokens.css`, content unchanged.
- `admin/lib/hooks.ts` was split. `useNow` and `useBeforeUnload`, which both UIs use, are in the new `preview/lib/hooks.ts`. `usePageTitle`, which adds "· StraySafe Admin", stays in `admin/lib/hooks.ts` (the Resident UI has its own).
- 84 import statements in 62 files were rewritten (39 under `admin/`, 23 under `resident/`) and one comment in `resident/styles/resident.css` was updated.

Now `resident/` imports nothing from `admin/`, and `admin/` imports nothing from `resident/`. `preview/` is still imported only by the two UIs, so production builds still exclude it. The folder name still says "preview"; rename it when the previews are promoted to production.

## Documentation

- New [DATABASE_FILES_AND_MIGRATIONS.md](../../database/DATABASE_FILES_AND_MIGRATIONS.md): where every database file lives, the status of `straysafe_subdivision.sql`, how the schema changes today (models, 55 `ensure_*` start-up migrations, scripts, snapshots) and where database work should connect. Indexed in `docs/README.md`, with this record.

## Deliberately preserved

- **`straysafe_subdivision.sql`:** untracked, not read by any script, not modified, not loaded, not ignored. It has the same 76 tables as `Database3.4_subdivision.sql` and holds data in 38 tables including `users`, so it needs review before anyone commits it.
- **`Database3.3.txt`, `Database3.3_subdivision.sql`, `Database3.4_subdivision.sql` and its `.txt` copy:** many permanent records, documents and scripts refer to them by name, so they stay at the root.
- **The second `yolov8n.pt`:** the root copy is identical to `backend/yolov8n.pt`. The code loads `yolov8n.pt` relative to the working directory and every documented command runs from `backend/`, but a run from the root would use the root copy. Delete it only after confirming nobody does that.
- **`scratch/` and `backend/scratch/`:** `scratch/adoption-ui-review/` and `scratch/notification-review/` are output folders written by `frontend/tests/adoptionDetails.browser.mjs` and `notifications.browser.mjs` and cited by documents. The database comparison scripts there are the starting point for column-level checks.
- **`frontend/src/assets/dog_and_cat_running.gif` (30 MB) and `straysafe_running_cat.gif` (7 MB):** nothing refers to them by name (the code imports the `.webp` versions), but they are legacy-portal assets and not duplicates, so they were left for the developer to decide.
- **Everything else:** legacy portals and routes, the retired-write gate, models, the `ensure_*` migrations, `backend/scripts/`, root-level documents (`AGENTS.md` says to preserve them), and the `.agents/` and `.claude/` mirrors.

## Left for the developer

- `.env.example` was not touched (`AGENTS.md`). Fifteen variable names read by the backend are not listed in it: `AI_FOLLOW_UP_DELAY_SECONDS`, `AI_IMAGE_CACHE_DIR`, `AI_JOB_FILES_DIR`, `AI_JOB_STALE_MINUTES`, `AI_TORCH_THREADS`, `BARANGAY_WORKFLOWS_ENABLED`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `GEMINI_TIMEOUT_SECONDS`, `GEMINI_TOTAL_BUDGET_SECONDS`, `ID_ENCRYPTION_KEY`, `REPORTS_DEFAULT_PAGE_SIZE`, `REPORTS_MAX_PAGE_SIZE`, `RESEND_API_KEY`, `SMTP_FROM_EMAIL`.
- `AGENTS.md` still has two bracketed template lines (architecture, design) and records no development commands.

## Not changed

No database schema, migration, model, seed, business rule or API. No dependency change and no upgrade (`frontend/package.json` is untouched). No `.env*`. No commit, push or staging. The pre-existing documentation audit failures were not touched.

## Validation evidence

- `npx tsc -b` and `npx tsc -p tsconfig.app.json --noEmit`: no errors. `npx eslint src/preview src/resident src/admin src/main.tsx`: clean. No import of the old locations remains.
- `npx tsc -b && npx vite build` (output to a scratch folder): succeeds, 214 files as before; no `ResidentRoot-*.js`, `AdminRoot-*.js` or preview chunk; none of the 41 isolation markers (sample credentials, sample data, preview-only text and styles) occurs in the build.
- Headless Chrome against the dev server, no backend: Resident suites 380 checks (map 84, sign-in 40, report journeys 68, community 55, account 57, UI states 33, privacy 21, keyboard 15, hit areas 7), Admin flows 102 (45 and 57), the "Analytics" rename check 30. All pass, the same numbers as before the cleanup. The accessibility audit lists the same 47 known small-target items (the preview "Tools" link and switches), 31 screens show no horizontal overflow at 390 px, and legacy routes render with no page errors. All 42 design tokens still resolve in both UIs, with the brand colour `#C65A17`.
- The first full run executed four browsers at once and three suites timed out (Chrome reported `ERR_INSUFFICIENT_RESOURCES` loading unbundled modules). Run one at a time they gave the baseline numbers exactly.
- Integrity against the pre-cleanup copy of the 160 uncommitted files: 91 byte-identical, 64 changed only as listed above, 5 moved with identical content. `straysafe_subdivision.sql`, `main.tsx`, the map code and the four earlier change records are unchanged.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`: the same 12 failures as before this change (8 broken links to ERD, DFD and audit documents that do not exist, 4 missing agent-pointer files). None comes from this change.
