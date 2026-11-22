# Collapsible Detailed Assessment Checklist in Case Assessment Tab

- **Date:** 2026-11-21 19:08 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1908_collapsible-detailed-assessment-checklist.md`
- **Authorization:** Explicit developer request (`"FEATURE 5: COLLAPSIBLE DETAILED ASSESSMENT CHECKLIST"`).
- **Type:** Feature

## Intent

Reduce visual clutter on the Case Assessment tab by placing the detailed injury (`isInjured`) and danger (`isSafety`) assessment dropdowns inside an optional collapsible section named **"Detailed Checklist (Optional)"** with an answered-fields counter (`X of 7 answered` / `X of 8 answered`), collapsed by default when empty and automatically expanded when saved answers already exist.

## Key changes

- `frontend/src/admin/pages/case/AssessmentTab.tsx`:
  - Wrapped the 7 injury assessment fields (`isInjured`) and 8 safety/danger assessment fields (`isSafety`) inside a single collapsible `"Detailed Checklist (Optional)"` block with `aria-expanded`, a live answered-fields counter badge (`X of 7 answered` or `X of 8 answered`), and a rotating chevron indicator.
  - Added `parseSavedInjuredAssessment()` and `parseSavedDangerousAssessment()` to hydrate previously saved `Condition assessment: ...` and `Safety risk assessment: ...` entries from the case history timeline (`c.timeline`) into `incidentInit(c)` so saved answers persist on reload and automatically expand the checklist.
  - Kept all existing dropdown options, values, validation, priority logic, and saving behavior intact.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
