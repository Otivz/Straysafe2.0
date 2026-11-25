# Case pages for every category: the same polish, brand tokens and motion

- **Date:** 2026-11-25 17:09 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/styles/case.css`, `frontend/src/admin/pages/complaints/ComplaintPage.tsx`, `frontend/src/admin/pages/case/MonitoredCasePage.tsx`, `frontend/src/admin/pages/case/monitored/Hero.tsx`, `frontend/src/admin/pages/case/monitored/Lane.tsx`, `frontend/src/admin/pages/case/monitored/Activity.tsx`, `frontend/src/admin/pages/case/monitored/Sections.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`
- **Authorization:** Developer's request in the Claude Code session to make the case page for all categories look more professional, polished, organised and consistent with StraySafe's branding, with animation where possible (follows `2026-11-25_1702_case-page-visual-polish.md`, which covered the standard case page).
- **Type:** Polish

## Intent

Three kinds of case page exist: the standard page (Safety, Injured, Other), the animal complaint page (Nuisance) and the monitored page (Lost Pet, Found Animal). Only the first had the new look. All three now share it.

## Key changes

- The complaint page and the monitored page now carry `.sa-casepage`, so they get the same back link, status chip, tabs (underline slide and a fade when a tab is chosen) and AI Insights card as the standard page.
- Their sections (the hero, the "Needs you" lane, the situation tiles, sightings, linked reports, alerts, activity and the collapsible sections) use one `.sa-mc-card` (brand-token border, radius and soft shadow, a light lift on hover) instead of per-element hard-coded border, radius and shadow utilities. The hero has the same brand colour stripe as the standard case header.
- Motion: the monitored page's cards come in one after another; "Needs you" items fade up in turn, their icon tile tilts on hover, and the amber status dot pulses softly while something needs the Leader; the lane's bell twinkles twice; rows and tiles get a hover tint. All CSS, under 350 ms, and the existing reduced-motion rule in `preview/styles/tokens.css` collapses it.
- The hard-coded hex colours in the complaint page, the monitored page and the Assessment, Overview and Actions tabs are replaced by brand tokens (`--sa-line`, `--sa-ink`, `--sa-amber`, `--sa-brand-soft` and so on); a new `--sa-warm` (a warm off-white) replaces the several near-identical cream values. The closed "How it ended" lane now shows its sage border (a hard-coded border had been hiding it).
- The duplicated inline `sa-fade-up` styles in the complaint page and the monitored page are gone; the one in `case.css` is used.
- No behaviour, data or backend change.

## Validation evidence

- `npx tsc -b`: no errors. `npx eslint` on the changed files: 0 problems.
- `npx vite build` (to a temporary folder): builds; the token utilities and their opacity variants compile correctly (`color-mix`).
- Not checked: how the complaint and the lost/found pages look in a running app (stripe, stagger, hover, narrow screens). The standard page's tabs and the dialogs opened from these pages were not re-checked visually either.
