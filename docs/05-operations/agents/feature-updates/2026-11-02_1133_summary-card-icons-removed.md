# Icons removed from the summary cards on Under Observation and Holding Facility (subdivision)

- **Date:** 2026-11-02 11:33 (UTC)
- **AI tool:** Claude Code (Opus 5.5)
- **Files changed:** `frontend/src/pages/Subd_Leaders/SubdUnderObservation.tsx`, `frontend/src/pages/Subd_Leaders/SubdHoldingFacility.tsx`, `docs/05-operations/agents/feature-updates/2026-11-02_1133_summary-card-icons-removed.md`
- **Authorization:** the developer's request "Remove the icon in the summary cards in http://127.0.0.1:5173/subd/under-observation and http://127.0.0.1:5173/subd/holding-facility".
- **Type:** Polish

## Intent

Show only the count and label on the subdivision leader's summary cards.

## Key changes

- `/subd/under-observation`: the icon badge is removed from the four summary cards (Active Observation, Warning & Escalation, Barangay Endorsed, Resolved Cases). The faint paw watermark in the card corner is kept.
- `/subd/holding-facility`: the icon badge is removed from the four statistic cards and from the small fifth summary row.
- Counts, labels, colors, card clicks and data are unchanged. The `icon` values in the holding page's `metricCards` list are now unused by the cards and were left in place.

## Validation evidence

- `npx tsc -b` (frontend) passed.
- Not checked: the pages in a browser.
