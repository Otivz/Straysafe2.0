# Consolidate Urgent Case Warnings on Case Management Page

- **Date:** 2026-11-21 17:32 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1732_consolidate-urgent-case-warnings.md`
- **Authorization:** Explicit developer request (`"FEATURE 1: CONSOLIDATE URGENT CASE WARNINGS"`).
- **Type:** Polish

## Intent

Remove duplicated urgent case warnings across the Case Management page (`CaseDetailPage.tsx`, `AssessmentTab.tsx`, and `ActionsTab.tsx`) so that only one primary urgent warning banner is displayed above the five case tabs and remains visible regardless of which tab the Subdivision Leader opens, while preserving the "Automatically flagged / prioritized" explanations inside `AssessmentTab.tsx`.

## Key changes

- `frontend/src/admin/pages/case/CaseDetailPage.tsx`: Added a single primary urgent warning banner directly above the `<Tabs />` bar when `c.priority === 'urgent' && c.status !== 'closed'`.
- `frontend/src/admin/pages/case/ActionsTab.tsx`: Removed the duplicate urgent banner previously rendered above the `Response actions` panel.
- `frontend/src/admin/pages/case/AssessmentTab.tsx`: Removed the duplicate top-level `<Callout tone="red" title="Urgent safety concern.">` banner while preserving the `Automatically flagged as URGENT` and `Automatically prioritized (...)` explanation callouts inside `IncidentSection`.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
