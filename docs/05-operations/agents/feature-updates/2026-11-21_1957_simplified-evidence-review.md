# Simplified Evidence Review in Case Assessment Tab

- **Date:** 2026-11-21 19:57 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1957_simplified-evidence-review.md`
- **Authorization:** Explicit developer request (`"FEATURE 8: SIMPLIFIED EVIDENCE REVIEW"`).
- **Type:** Feature

## Intent

Make evidence review faster and less cluttered on the Case Assessment tab by introducing simplified evidence sufficiency labels (**Enough**, **Need more**, **None**), adding a **"Mark All as Reviewed"** button with a reviewed counter badge, and placing the individual per-photo review checkboxes inside a collapsible **"Choose Photos One by One"** section while keeping `evidence_reviewed` and sufficiency state independent.

## Key changes

- `frontend/src/admin/pages/case/AssessmentTab.tsx`:
  - Mapped evidence sufficiency options (`EVIDENCE_SUFFICIENCY_OPTIONS`) to simplified labels: **Enough** (`sufficient`), **Need more** (`needs_more`), and **None** (`not_assessed`).
  - Added a **"Mark All as Reviewed"** button (`onClick` adds all `c.evidence` IDs to `f.reviewed`) alongside a `X of Y reviewed` badge when evidence items exist.
  - Wrapped the per-item photo/evidence review checkboxes, thumbnail preview buttons, and `View` buttons inside a collapsible **"Choose Photos One by One"** section (`evidencePickerOpen` state in `UnifiedAssessmentForm`).
  - Preserved the `evidence_reviewed` (`string[]`) data structure and ensured selecting **"Enough"** does not automatically mark evidence items as reviewed.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
