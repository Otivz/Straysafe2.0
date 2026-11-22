# Unified Assessment Form and Single Save Button

- **Date:** 2026-11-21 19:12 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/admin/pages/case/AssessmentTab.tsx`, `docs/05-operations/agents/feature-updates/2026-11-21_1912_unified-assessment-form-and-save-button.md`
- **Authorization:** Explicit developer request (`"FEATURE 6: UNIFIED ASSESSMENT FORM AND SAVE BUTTON"`).
- **Type:** Feature

## Intent

Combine the three separate assessment forms (Incident, Identity, and Ownership) in `AssessmentTab.tsx` into a single unified assessment form with one **Save assessment** button, one unsaved-changes guard (`useUnsavedGuard`), per-section inline validation messages, and one `case/saveAssessment` request that sends only modified sections to the backend.

## Key changes

- `frontend/src/admin/pages/case/AssessmentTab.tsx`:
  - Lifted Incident (`f`, `checklistOpen`), Identity (`idForm`), Ownership (`ownForm`), and validation error (`errors`) state into `UnifiedAssessmentForm`.
  - Replaced the three separate `<form>` and `<SaveBar>` instances (`Save assessment`, `Save identity`, `Save ownership`) with one unified `<form>` and one `<SaveBar label="Save assessment" />`.
  - Consolidated the three `useUnsavedGuard` hooks into a single `useUnsavedGuard(dirty)` covering the entire Assessment tab.
  - Scoped validation and payload generation to modified sections (`incidentDirty`, `identityDirty`, `ownershipDirty`, `injuredModified`, `dangerousModified`, `priorityModified`) so unchanged sections remain untouched while reusing `case/saveAssessment` and `assessmentBody`.

## Validation evidence

- `cd frontend; npm run build` (`tsc -b && vite build`)
