# Animal & Incident Details Direct Report Redirection

- **Date:** 2026-10-31 13:55 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `docs/05-operations/agents/feature-updates/2026-10-31_1355_animal-incident-detail-redirect.md`, `docs/README.md`
- **Authorization:** User request: "when i click the animal incident detail it should redirect to the original report of the animal"
- **Type:** Polish

## Intent

Allow subdivision personnel viewing an Under Observation case to redirect directly to the original resident incident report (`/subd/reports/:id`) by clicking the "Animal & Incident Details" card.

## Key changes

- In `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`:
  - Updated the "Animal & Incident Details" card container with `onClick={() => navigate('/subd/reports/' + selectedItem.report_id)}`, keyboard accessibility (`role="button"`, `tabIndex={0}`, enter/space handling), and interactive hover cues (`hover:border-amber-400/90 hover:shadow-md cursor-pointer group`).
  - Added an "Original Report #{selectedItem.report_id} ↗" pill in the card header.
  - Added an interactive photo hover overlay cue ("View Report ↗").
  - Added a footer indicator ("📄 Original Incident Report #{selectedItem.report_id} — Open Report ➔").

## Validation evidence

- Frontend TypeScript check: `npx tsc --noEmit` passed with 0 errors.
- Structural documentation check: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict` verified.
