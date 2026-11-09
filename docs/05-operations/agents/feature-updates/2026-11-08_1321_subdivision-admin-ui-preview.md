# Subdivision Admin UI reconstruction (development preview)

- **Date:** 2026-11-08 13:21 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/main.tsx`, `frontend/src/admin/AdminRoot.tsx`, `frontend/src/admin/auth/AuthProvider.tsx`, `frontend/src/admin/auth/context.ts`, `frontend/src/admin/auth/gateway.ts`, `frontend/src/admin/components/AuthShell.tsx`, `frontend/src/admin/components/Badge.tsx`, `frontend/src/admin/components/Button.tsx`, `frontend/src/admin/components/Dialog.tsx`, `frontend/src/admin/components/Evidence.tsx`, `frontend/src/admin/components/Menu.tsx`, `frontend/src/admin/components/NoticePreview.tsx`, `frontend/src/admin/components/PasswordRules.tsx`, `frontend/src/admin/components/PetAvatar.tsx`, `frontend/src/admin/components/SaveBar.tsx`, `frontend/src/admin/components/Timeline.tsx`, `frontend/src/admin/components/ToastProvider.tsx`, `frontend/src/admin/components/charts.tsx`, `frontend/src/admin/components/form.tsx`, `frontend/src/admin/components/icons.ts`, `frontend/src/admin/components/layout.tsx`, `frontend/src/admin/components/toast.ts`, `frontend/src/admin/config.ts`, `frontend/src/admin/data/DataProvider.tsx`, `frontend/src/admin/data/constants.ts`, `frontend/src/admin/data/context.ts`, `frontend/src/admin/data/reducer.ts`, `frontend/src/admin/data/seed.ts`, `frontend/src/admin/data/selectors.ts`, `frontend/src/admin/data/types.ts`, `frontend/src/admin/dialogs/ActionDialogs.tsx`, `frontend/src/admin/dialogs/BasicDialogs.tsx`, `frontend/src/admin/dialogs/ClosureDialogs.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`, `frontend/src/admin/dialogs/NoticeDialogs.tsx`, `frontend/src/admin/dialogs/PasswordDialog.tsx`, `frontend/src/admin/dialogs/PolicyDialog.tsx`, `frontend/src/admin/dialogs/ReviewDialogs.tsx`, `frontend/src/admin/layout/AdminLayout.tsx`, `frontend/src/admin/layout/NotificationsDrawer.tsx`, `frontend/src/admin/layout/PreviewBar.tsx`, `frontend/src/admin/layout/SessionDialogs.tsx`, `frontend/src/admin/layout/Sidebar.tsx`, `frontend/src/admin/lib/cx.ts`, `frontend/src/admin/lib/errors.ts`, `frontend/src/admin/lib/format.ts`, `frontend/src/admin/lib/hooks.ts`, `frontend/src/admin/lib/navGuard.ts`, `frontend/src/admin/lib/previewFlags.ts`, `frontend/src/admin/lib/useSubmit.ts`, `frontend/src/admin/pages/CasesPage.tsx`, `frontend/src/admin/pages/CommunityPage.tsx`, `frontend/src/admin/pages/DashboardPage.tsx`, `frontend/src/admin/pages/NotFoundPage.tsx`, `frontend/src/admin/pages/NoticeEditorPage.tsx`, `frontend/src/admin/pages/PetDetailsPage.tsx`, `frontend/src/admin/pages/PetsPage.tsx`, `frontend/src/admin/pages/ProfilePage.tsx`, `frontend/src/admin/pages/ReportsPage.tsx`, `frontend/src/admin/pages/ResidentDetailsPage.tsx`, `frontend/src/admin/pages/ResidentsPage.tsx`, `frontend/src/admin/pages/SettingsPage.tsx`, `frontend/src/admin/pages/auth/ForgotPasswordPage.tsx`, `frontend/src/admin/pages/auth/LoginPage.tsx`, `frontend/src/admin/pages/auth/ResetPasswordPage.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/admin/pages/case/CaseDialogs.tsx`, `frontend/src/admin/pages/case/HistoryTab.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/pages/case/dialogState.ts`, `frontend/src/admin/styles/pages.css`, `frontend/src/admin/styles/tokens.css`, `frontend/src/admin/styles/ui.css`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-08_1321_subdivision-admin-ui-preview.md`
- **Authorization:** Developer request in Claude Code: "STRAYSAFE 2.0 — Complete Admin UI Reconstruction — Claude Implementation Instructions" (design and implement the complete Subdivision Admin UI, login to logout, inside the existing repository, on mock data). FREEZE was OFF.
- **Type:** Feature

## Intent

Rebuild the Subdivision Admin interface around the proposed workflow (REPORT → ASSESS → COORDINATE → MONITOR → DOCUMENT OUTCOME → CLOSE) with four global statuses (Reported, Under review, In progress, Closed). Warnings, referrals, ownership claims and follow-ups are case details, not statuses. The UI must run without a backend or database, so it was built as a self-contained, development-only module on sample data, with one seam for authentication and one for data so it can be reconnected later.

## Key changes

- **New module `frontend/src/admin/`**, mounted by one edit to `frontend/src/main.tsx` at `/admin-preview/*`, outside the legacy `<App />`. Nothing in the legacy portals (`/admin`, `/subd`, `/staff`, `/resident`) was changed, moved or deleted, and the legacy session guard, theme sync and API calls never run for the new routes.
- **24 screens** reachable from the sidebar or a case workflow: login, forgot and reset password, dashboard, cases list, case workspace (Overview, Assessment, Actions & follow-ups, History), community notices and editor, pet registry and details, residents and details, reports, settings, profile, notifications drawer, logout. Warnings, compliance, referrals, ownership claims, related reports and closure are dialogs and tabs on the case, not routes.
- **Business rules in the model and UI:** reporting and publishing are separate (private complaints are never offered for publication); unknown animals stay "not identified" and ownership stays "unknown" until an explicit decision; pet registration is labelled owner-declared and can never be the only ownership basis; a warning needs a confirmed owner, a verified incident and a *confirmed* policy; the observation period comes from the policy (no hard-coded three days) and no fine is ever assessed; urgent concerns carry a "safety first" notice and are not gated by routine steps; an external referral never closes a case; closure needs a disposition and reason, is grouped Resolved / Closed without confirmed resolution / No action needed, and states that closed is not always resolved; reopening keeps the closure in the history; related reports are linked, never merged.
- **Design system:** the official palette verbatim as CSS tokens (`styles/tokens.css`), derived tints and inks computed with `color-mix`, Inter plus Plus Jakarta Sans (already loaded by `index.html`), component classes in the CSS `components` layer so Tailwind layout utilities still win. Native `<dialog>` for modals (focus trap, Esc, inert background), skip link, labelled forms, keyboard-operable menus and tabs, reduced-motion support, light-only.
- **Isolation seams (reconnect points):** `auth/gateway.ts` (interface plus a preview implementation; lists the existing `/auth/*` endpoints it will map to) and `data/DataProvider.tsx` with `data/reducer.ts` (every change is one async action, so each maps to one request). Sample data lives only in `data/seed.ts`, generated relative to "now". Preview state is kept in `sessionStorage` for the tab, behind a permanent "Development preview, sample data" banner with tools to simulate network loss, a failed save, an expired session, a reload and a data reset.
- **UI states:** loading skeleton, empty and no-match states, field validation, success toasts, inline submission errors, confirmations, unsaved-changes guard (in-app links, Cancel, dialogs, tab close), session expiry dialog, network error with Try again.
- **Dev-only gate:** `main.tsx` mounts the module behind `import.meta.env.DEV` written inline, so `vite build` removes the route and the whole chunk. There is no production switch and no authentication bypass.
- **Charts** are hand-built SVG/HTML (no dependency): line with crosshair tooltip, ranked bars, a segmented bar and a table view for each. Chart colours were checked with the dataviz palette validator (orange vs charcoal; sage / deepened amber / stone).

## How to run

```
cd frontend
npm run dev          # then open http://localhost:5173/admin-preview/login
```

Use "Sign in with the sample account" (or type the sample credentials shown on that screen; they are fake and exist only in development builds). `npm run dev:https` works the same way.

## Reconnecting to the backend later

1. Implement `AuthGateway` in `auth/gateway.ts` with `frontend/src/utils/api.ts` (`/auth/login`, `/auth/verify-session`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`) and remove the preview gateway.
2. In `data/DataProvider.tsx`, load state from the API and make `dispatch` send one request per action before applying it. Add any endpoint the backend does not have yet (case closure disposition, ownership status, observation time are listed in `comparison.md` §8).
3. Change `ADMIN_BASE` and the `import.meta.env.DEV` guard in `main.tsx`, and remove the superseded legacy admin routes in `routes/AppRoutes.tsx` in the same change.

## Deliberately not changed

- No backend, database, migration, `.env*`, dependency or `package.json` change. No commit or push.
- Legacy admin and Subdivision Leader pages are **not deleted**: they are still routed, backed by the real API and covered by existing tests. They become obsolete only when the new UI is connected; remove them at that cutover after checking references.
- The Resident UI was not touched.

## Validation evidence

- `npx tsc -b`: no errors (baseline before the work was also clean).
- `npx eslint src/admin src/main.tsx`: clean, including the React hooks rules.
- `npx vite build`: succeeds; `dist/assets` contains no `AdminRoot-*.js`, and none of the route base, sample credentials, sample names, case references or storage keys occur anywhere in `dist/`.
- Headless Chrome (DevTools protocol) against the dev server, no backend running: 45 checks for the case workflow (status, assessment, priority, notes, follow-ups, referral and coordination update, warning gating and issuing, compliance, claim review, link and unlink, closure and reopen) and 57 checks for authentication, notifications, notices and the privacy check, pets, residents, reports, settings, profile, the unsaved-changes guard, network/failed-save/session-expiry states, logout and the route guard. All pass.
- Layout at 1440, 820 and 390 px wide: no horizontal page overflow on any screen. Dialogs become bottom sheets on phones.
- Contrast computed from the palette: body text 14.5:1; derived brand ink 6.1:1; status inks 5:1 or better.

## Known limitations

- White text on the exact brand fill `#C65A17` is 4.31:1, just under 4.5:1 (AA for small text). The hover fill uses a derived `#A94A12` (5.7:1) and Warm Orange `#E87830` is used for the focus halo and accents, because white on `#E87830` is only 2.93:1. To meet AA at rest, darken `--sa-brand` by about 4%.
- All data is sample data kept in the browser tab; nothing is persisted or shared. Photos in notices are object URLs and do not survive a reload.
- The browser Back button is not intercepted by the unsaved-changes guard (`<BrowserRouter>` cannot block navigation); closing the tab and in-app navigation are.
- The sample sign-in credential in `auth/gateway.ts` is a fake development value, excluded from production builds. It is not a secret.
- An untracked `straysafe_subdivision.sql` (a MySQL dump dated 2026-11-06) is in the repository root. It is unrelated to this change and was left untouched; it should not be committed without review.
