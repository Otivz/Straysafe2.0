# Keep Barangay Operations actions visible while scrolling

- **Date:** 2026-11-03 05:26 (UTC)
- **AI tool:** Codex (GPT-6)
- **Files changed:** `frontend/src/pages/Barangay_Staff/BrgyReportView.tsx`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-03_0526_barangay-operations-visible-actions.md`
- **Authorization:** User reported that the Barangay Operations buttons became difficult to reach while scrolling and supplied a screenshot of the rescue request sidebar.
- **Type:** Fix

## Intent

Keep the operations controls within the desktop viewport while staff read a long report, even when panel metadata is taller than the available space.

## Key changes

- Bound the sticky desktop panel to the viewport height, with a smaller top offset inside the existing page scroll area.
- Separate its heading, scrollable details, and action footer. Approval/rejection, contextual operation actions, status updates, and chat remain outside the independently scrolling metadata section.
- Keep the existing mobile document flow and Case actions jump control.
- Preserve all action handlers, disabled states, role checks, report visibility, and approval requirements. No dependency, database, or API changes.

## Validation evidence

- `npm --prefix frontend run build`: TypeScript and Vite production build passed; existing large-chunk warning remains.
- Isolated Chrome preview of `/brgy/reports/4` using synthetic report/staff data and mocked APIs: all four pending-approval controls were within the visible page scroll area at multiple scroll depths (approximately 400, 1,000, and 2,000 px) for 1605×960, 1280×720, and 1280×540 viewports.
- Scrolling the panel's metadata did not move the action footer. At 390×844, the panel remained in document flow. All checked viewports had no horizontal page overflow; no uncaught browser errors were recorded.
- Preview setup initially omitted the no-observation API response; correcting the mock allowed the real page to render and the scrolling checks to complete. No application behavior was changed to accommodate the mock.
- `git diff --check`: passed.
- Required structural documentation validation: `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`.

No live report data or operational actions were used in the preview.
